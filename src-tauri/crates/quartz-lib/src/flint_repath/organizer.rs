//! Orchestrates concat and refather workflows with independent control.

use crate::bin::concat::{
    concatenate_linked_bins, ConcatResult,
};
use super::refather::{repath_project, RepathConfig, RepathResult};
use crate::error::Result;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Clone)]
pub struct OrganizerConfig {
    /// Merges linked Type 3 BINs into a single file.
    pub enable_concat: bool,
    /// Prefixes paths with creator/project.
    pub enable_repath: bool,
    pub creator_name: String,
    pub project_name: String,
    /// Champion internal name (e.g., "Kayn").
    pub champion: String,
    pub target_skin_id: u32,
    pub cleanup_unused: bool,
    /// Leave SFX audio bank paths untouched (see `RepathConfig::skip_sfx`).
    pub skip_sfx: bool,
    /// Leave VO audio bank paths untouched (see `RepathConfig::skip_vo`).
    pub skip_vo: bool,
    /// Override the WAD folder name (e.g. "Companions.wad.client" for TFT).
    /// When None, defaults to "{champion}.wad.client".
    pub wad_folder_override: Option<String>,
}

#[derive(Debug, Clone)]
pub struct OrganizerResult {
    /// Concat result for the primary champion (first seed), kept for API compat.
    pub concat_result: Option<ConcatResult>,
    /// Concat result per independent character root (main champ + subcharacters
    /// like AnnieTibbers). Each character's linked graph is combined into its
    /// OWN concat BIN linked from its OWN skin BIN — never merged across roots.
    pub concat_results: Vec<ConcatResult>,
    pub repath_result: Option<RepathResult>,
}

/// Runs concat (if enabled) then repath (if enabled). `path_mappings` maps
/// original paths to actual paths (for hash-named files).
pub fn organize_project(
    content_base: &Path,
    config: &OrganizerConfig,
    path_mappings: &HashMap<String, String>,
) -> Result<OrganizerResult> {
    tracing::info!(
        "Starting project organization (concat: {}, repath: {})",
        config.enable_concat,
        config.enable_repath
    );

    let mut result = OrganizerResult {
        concat_result: None,
        concat_results: Vec::new(),
        repath_result: None,
    };

    // League doesn't support spaces in asset paths or folder names.
    let champion_sanitized = config.champion.to_lowercase().replace(' ', "-");

    let wad_folder_name = config.wad_folder_override.clone()
        .unwrap_or_else(|| format!("{}.wad.client", champion_sanitized));
    let wad_base = content_base.join(&wad_folder_name);

    let file_base = if wad_base.exists() {
        tracing::info!("Using WAD folder structure: {}", wad_base.display());
        wad_base.clone()
    } else {
        tracing::info!("Using legacy folder structure (no WAD folder found)");
        content_base.to_path_buf()
    };

    if config.enable_concat {
        // Each character folder that ships a skin<N>.bin is an INDEPENDENT root
        // (Annie + AnnieTibbers both have skin0.bin for the same skin). Concat
        // each root's own linked graph into its OWN concat BIN — never merge
        // across characters, or a subcharacter's assets end up linked off the
        // wrong skin BIN and never load.
        let seeds = find_all_seed_skin_bins(&file_base, &champion_sanitized, config.target_skin_id);
        if seeds.is_empty() {
            tracing::warn!("Cannot run concat: no seed skin BIN found for skin {}", config.target_skin_id);
        }
        for seed in &seeds {
            let seed_char = character_folder_of(seed).unwrap_or_else(|| champion_sanitized.clone());
            tracing::info!("Combining linked BINs into '{}' skin BIN...", seed_char);
            // Merges linked entries INTO this seed's skin BIN (no separate file).
            match concatenate_linked_bins(
                seed,
                &config.project_name,
                &config.creator_name,
                &seed_char,
                &file_base,
                path_mappings,
            ) {
                Ok(concat_result) => {
                    tracing::info!(
                        "Combined {} linked BINs into '{}' skin BIN",
                        concat_result.source_count, seed_char
                    );
                    result.concat_results.push(concat_result);
                }
                Err(e) => {
                    tracing::warn!("Combine failed for '{}': {}", seed_char, e);
                }
            }
        }
        result.concat_result = result.concat_results.first().cloned();
    }

    if config.enable_repath {
        tracing::info!("Running asset repathing...");

        let repath_config = RepathConfig {
            creator_name: config.creator_name.clone(),
            project_name: config.project_name.clone(),
            champion: champion_sanitized.clone(),
            target_skin_id: config.target_skin_id,
            cleanup_unused: config.cleanup_unused,
            skip_sfx: config.skip_sfx,
            skip_vo: config.skip_vo,
        };

        match repath_project(content_base, &repath_config, path_mappings) {
            Ok(repath_result) => {
                tracing::info!(
                    "Repathing complete: {} paths modified, {} files relocated",
                    repath_result.paths_modified,
                    repath_result.files_relocated
                );
                result.repath_result = Some(repath_result);
            }
            Err(e) => {
                tracing::warn!("Repathing failed: {}", e);
            }
        }
    }

    tracing::info!("Project organization complete");
    Ok(result)
}

/// Discover EVERY `characters/<any>/skins/skin<N>.bin` under `file_base` — the
/// main champion AND any subcharacters (Tibbers, Wolf, ghouls…) that ship the
/// same skin id. Mirrors old Quartz's TOC glob (it does not read pet/child
/// metadata; it globs the tree). The primary champion's own bin sorts first.
pub(crate) fn find_all_seed_skin_bins(file_base: &Path, champion: &str, skin_id: u32) -> Vec<PathBuf> {
    let champ = champion.to_lowercase();
    let want = [format!("skin{}.bin", skin_id), format!("skin{:02}.bin", skin_id)];
    let mut seeds: Vec<PathBuf> = Vec::new();

    for entry in WalkDir::new(file_base)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .map(|ext| ext.eq_ignore_ascii_case("bin"))
                .unwrap_or(false)
        })
    {
        let path = entry.path();
        let rel = path.to_string_lossy().to_lowercase().replace('\\', "/");
        // Must be `.../characters/<char>/skins/skin<N>.bin` under data/ or assets/.
        let is_skin_seed = (rel.contains("/characters/") || rel.starts_with("characters/"))
            && rel.contains("/skins/")
            && want.iter().any(|w| rel.ends_with(&format!("/skins/{}", w)));
        if is_skin_seed {
            seeds.push(path.to_path_buf());
        }
    }

    // Primary champion's own folder first (matches old Quartz's mainBin preference).
    seeds.sort_by_key(|p| {
        let is_primary = character_folder_of(p).as_deref() == Some(&champ);
        (!is_primary, p.to_string_lossy().to_lowercase())
    });
    seeds.dedup();
    seeds
}

/// Extract the `<char>` folder from a `.../characters/<char>/skins/skin*.bin` path.
pub(crate) fn character_folder_of(bin_path: &Path) -> Option<String> {
    let posix = bin_path.to_string_lossy().replace('\\', "/").to_lowercase();
    let marker = "/characters/";
    let idx = posix.find(marker)? + marker.len();
    let rest = &posix[idx..];
    let end = rest.find('/')?;
    Some(rest[..end].to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_config() -> OrganizerConfig {
        OrganizerConfig {
            enable_concat: true,
            enable_repath: true,
            creator_name: "TestCreator".to_string(),
            project_name: "TestProject".to_string(),
            champion: "Kayn".to_string(),
            target_skin_id: 8,
            cleanup_unused: true,
            skip_sfx: false,
            skip_vo: false,
            wad_folder_override: None,
        }
    }

    #[test]
    fn test_organizer_config_full() {
        let config = sample_config();
        assert!(config.enable_concat);
        assert!(config.enable_repath);
        assert!(config.cleanup_unused);
    }

    #[test]
    fn test_organizer_config_concat_only() {
        let config = OrganizerConfig {
            enable_repath: false,
            ..sample_config()
        };
        assert!(config.enable_concat);
        assert!(!config.enable_repath);
    }

    #[test]
    fn test_organizer_config_repath_only() {
        let config = OrganizerConfig {
            enable_concat: false,
            ..sample_config()
        };
        assert!(!config.enable_concat);
        assert!(config.enable_repath);
    }
}
