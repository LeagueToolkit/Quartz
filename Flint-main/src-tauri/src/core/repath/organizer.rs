//! Project Organizer - Orchestrates concat and refather workflows
//!
//! This module provides a central entry point for project organization tasks,
//! allowing independent control over concat and repathing operations.

use crate::core::bin::concat::{
    concatenate_linked_bins, ConcatResult,
};
use crate::core::repath::refather::{repath_project, RepathConfig, RepathResult};
use crate::error::Result;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// Configuration for project organization operations
#[derive(Debug, Clone)]
pub struct OrganizerConfig {
    /// Enable BIN concatenation (merges linked Type 3 BINs into a single file)
    pub enable_concat: bool,
    /// Enable asset repathing (prefixes paths with creator/project)
    pub enable_repath: bool,
    /// Creator name for path prefix
    pub creator_name: String,
    /// Project name for path prefix
    pub project_name: String,
    /// Champion internal name (e.g., "Kayn")
    pub champion: String,
    /// Target skin ID being modified
    pub target_skin_id: u32,
    /// Clean up unused/orphaned files after processing
    pub cleanup_unused: bool,
}

impl OrganizerConfig {
    /// Create a new config with both concat and repath enabled
    #[allow(dead_code)]
    pub fn new(
        creator_name: String,
        project_name: String,
        champion: String,
        target_skin_id: u32,
    ) -> Self {
        Self {
            enable_concat: true,
            enable_repath: true,
            creator_name,
            project_name,
            champion,
            target_skin_id,
            cleanup_unused: true,
        }
    }

    /// Create a config with concat only (no repathing)
    #[allow(dead_code)]
    pub fn concat_only(
        creator_name: String,
        project_name: String,
        champion: String,
        target_skin_id: u32,
    ) -> Self {
        Self {
            enable_concat: true,
            enable_repath: false,
            creator_name,
            project_name,
            champion,
            target_skin_id,
            cleanup_unused: false,
        }
    }

    /// Create a config with repath only (no concatenation)
    #[allow(dead_code)]
    pub fn repath_only(
        creator_name: String,
        project_name: String,
        champion: String,
        target_skin_id: u32,
    ) -> Self {
        Self {
            enable_concat: false,
            enable_repath: true,
            creator_name,
            project_name,
            champion,
            target_skin_id,
            cleanup_unused: true,
        }
    }
}

/// Result of a complete project organization operation
#[derive(Debug, Clone)]
pub struct OrganizerResult {
    /// Result of concatenation operation (if enabled)
    pub concat_result: Option<ConcatResult>,
    /// Result of repathing operation (if enabled)
    pub repath_result: Option<RepathResult>,
}

impl OrganizerResult {
    /// Get total number of BINs processed across all operations
    #[allow(dead_code)]
    pub fn total_bins_processed(&self) -> usize {
        let concat_count = self.concat_result.as_ref().map(|r| r.source_count).unwrap_or(0);
        let repath_count = self.repath_result.as_ref().map(|r| r.bins_processed).unwrap_or(0);
        concat_count + repath_count
    }
}

/// Main entry point for project organization
///
/// Orchestrates concat and repath operations based on the provided config.
/// Operations are run in the following order:
/// 1. Concat (if enabled) - Merge linked Type 3 BINs
/// 2. Repath (if enabled) - Prefix asset paths
///
/// # Arguments
/// * `content_base` - Path to the content/base directory of the project
/// * `config` - Configuration controlling which operations to run
/// * `path_mappings` - Mappings from original paths to actual paths (for hash-named files)
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
        repath_result: None,
    };

    // Compute the WAD folder path: content_base/{champion}.wad.client/
    // This is required for league-mod compatible project structure
    let champion_lower = config.champion.to_lowercase();
    let wad_folder_name = format!("{}.wad.client", champion_lower);
    let wad_base = content_base.join(&wad_folder_name);
    
    // Determine which base to use for file operations
    // Use WAD folder if it exists (new structure), otherwise fall back to content_base (legacy)
    let file_base = if wad_base.exists() {
        tracing::info!("Using WAD folder structure: {}", wad_base.display());
        wad_base.clone()
    } else {
        tracing::info!("Using legacy folder structure (no WAD folder found)");
        content_base.to_path_buf()
    };

    // Step 1: Find the main skin BIN (needed for both concat and repath)
    let main_bin_path = if !config.champion.is_empty() {
        find_main_skin_bin(&file_base, &config.champion, config.target_skin_id)
    } else {
        None
    };

    // Step 2: Run concat if enabled
    if config.enable_concat {
        if let Some(ref main_path) = main_bin_path {
            tracing::info!("Running BIN concatenation...");
            match concatenate_linked_bins(
                main_path,
                &config.project_name,
                &config.creator_name,
                &config.champion,
                &file_base,
                path_mappings,
            ) {
                Ok(concat_result) => {
                    tracing::info!(
                        "Concatenation complete: {} BINs merged into {}",
                        concat_result.source_count,
                        concat_result.concat_path
                    );
                    result.concat_result = Some(concat_result);
                }
                Err(e) => {
                    tracing::warn!("Concatenation failed: {}", e);
                    // Continue with repath even if concat fails
                }
            }
        } else {
            tracing::warn!("Cannot run concat: main skin BIN not found");
        }
    }

    // Step 3: Run repath if enabled
    if config.enable_repath {
        tracing::info!("Running asset repathing...");
        
        // Build RepathConfig from OrganizerConfig
        let repath_config = RepathConfig {
            creator_name: config.creator_name.clone(),
            project_name: config.project_name.clone(),
            champion: config.champion.clone(),
            target_skin_id: config.target_skin_id,
            cleanup_unused: config.cleanup_unused,
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

/// Find the main skin BIN file for a champion
/// Now searches inside {champion}.wad.client/ folder for league-mod compatibility
fn find_main_skin_bin(content_base: &Path, champion: &str, skin_id: u32) -> Option<PathBuf> {
    let champion_lower = champion.to_lowercase();
    
    // WAD folder path: content/base/{champion}.wad.client/
    let wad_folder = format!("{}.wad.client", champion_lower);
    let wad_path = content_base.join(&wad_folder);
    
    let patterns = vec![
        format!("data/characters/{}/skins/skin{}.bin", champion_lower, skin_id),
        format!("data/characters/{}/skins/skin{:02}.bin", champion_lower, skin_id),
    ];
    
    // First, try searching inside the WAD folder (new structure)
    if wad_path.exists() {
        for pattern in &patterns {
            let direct_path = wad_path.join(pattern);
            if direct_path.exists() {
                tracing::debug!("Found main skin BIN in WAD folder: {}", direct_path.display());
                return Some(direct_path);
            }
        }
        
        // Fallback: search recursively inside WAD folder
        for entry in WalkDir::new(&wad_path)
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
            if let Ok(rel_path) = path.strip_prefix(&wad_path) {
                let rel_str = rel_path.to_string_lossy().to_lowercase().replace('\\', "/");
                for pattern in &patterns {
                    if rel_str == *pattern {
                        tracing::debug!("Found main skin BIN via search: {}", path.display());
                        return Some(path.to_path_buf());
                    }
                }
            }
        }
    }
    
    // Legacy fallback: try direct paths (old structure without WAD folder)
    for pattern in &patterns {
        let direct_path = content_base.join(pattern);
        if direct_path.exists() {
            tracing::debug!("Found main skin BIN (legacy path): {}", direct_path.display());
            return Some(direct_path);
        }
    }

    // Final fallback: search anywhere in content_base
    for entry in WalkDir::new(content_base)
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
        if let Ok(rel_path) = path.strip_prefix(content_base) {
            let rel_str = rel_path.to_string_lossy().to_lowercase().replace('\\', "/");
            // Check if the path ends with the pattern (ignoring WAD folder prefix)
            for pattern in &patterns {
                if rel_str.ends_with(pattern) {
                    tracing::debug!("Found main skin BIN (fallback): {}", path.display());
                    return Some(path.to_path_buf());
                }
            }
        }
    }

    tracing::warn!("Main skin BIN not found for {} skin {}", champion, skin_id);
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_organizer_config_new() {
        let config = OrganizerConfig::new(
            "TestCreator".to_string(),
            "TestProject".to_string(),
            "Kayn".to_string(),
            8,
        );
        assert!(config.enable_concat);
        assert!(config.enable_repath);
        assert!(config.cleanup_unused);
    }

    #[test]
    fn test_organizer_config_concat_only() {
        let config = OrganizerConfig::concat_only(
            "TestCreator".to_string(),
            "TestProject".to_string(),
            "Kayn".to_string(),
            8,
        );
        assert!(config.enable_concat);
        assert!(!config.enable_repath);
    }

    #[test]
    fn test_organizer_config_repath_only() {
        let config = OrganizerConfig::repath_only(
            "TestCreator".to_string(),
            "TestProject".to_string(),
            "Kayn".to_string(),
            8,
        );
        assert!(!config.enable_concat);
        assert!(config.enable_repath);
    }
}
