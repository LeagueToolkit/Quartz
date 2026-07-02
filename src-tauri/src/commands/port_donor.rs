/* Port "load donor from game" + asset-copy commands.

`port_prepare_donor_from_skin` runs the WAD extraction / combine / consolidate
pipeline in `quartz_lib::port_donor` and hands back donor ritobin text. The
asset-copy commands move emitter-referenced asset files into the target mod
tree so a ported system's textures/meshes ship alongside the bin. */

use quartz_lib::port_donor::{self, DonorResult};
use std::path::{Path, PathBuf};

/// Prepare a donor from a live skin WAD and return its ritobin py text.
#[tauri::command]
pub fn port_prepare_donor_from_skin(
    champion_name: String,
    skin_id: u32,
    league_path: String,
    porting_prefix: Option<String>,
) -> Result<DonorResult, String> {
    let prefix = porting_prefix.unwrap_or_default();
    port_donor::prepare_donor_from_skin(
        &PathBuf::from(league_path),
        &champion_name,
        skin_id,
        &prefix,
    )
    .map_err(|e| e.to_string())
}

/// Delete a donor temp cache root created by a prior prepare call.
#[tauri::command]
pub fn port_cleanup_donor_temp(temp_root: String) -> Result<(), String> {
    port_donor::cleanup_temp(&PathBuf::from(temp_root));
    Ok(())
}

/// Outcome of copying emitter-referenced assets into the target tree.
#[derive(Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetCopyResult {
    pub copied: usize,
    pub missing: usize,
    /// Relative paths that could not be found under any source dir.
    pub missing_paths: Vec<String>,
}

fn normalize_rel(value: &str) -> String {
    value
        .replace('\\', "/")
        .trim_start_matches('/')
        .to_lowercase()
}

/* Copy each asset in `asset_paths` from the first source dir that contains it
into `target_root`, preserving its relative path. The target root is derived
from the target bin: assets live beside the bin's `data/` or `assets/` root,
so we walk up from the bin path to that mod root. */
#[tauri::command]
pub fn port_copy_assets_to_target(
    asset_paths: Vec<String>,
    source_dirs: Vec<String>,
    target_bin_path: String,
) -> Result<AssetCopyResult, String> {
    let target_root = mod_root_for_bin(Path::new(&target_bin_path))
        .ok_or_else(|| format!("Could not locate mod root for target bin: {target_bin_path}"))?;

    let sources: Vec<PathBuf> = source_dirs.into_iter().map(PathBuf::from).collect();
    let mut result = AssetCopyResult::default();

    for asset in asset_paths {
        let rel = normalize_rel(&asset);
        if rel.is_empty() || rel.ends_with(".bin") {
            continue;
        }

        let found = sources.iter().find_map(|dir| {
            let candidate = dir.join(&rel);
            if candidate.is_file() {
                Some(candidate)
            } else {
                None
            }
        });

        let Some(src) = found else {
            result.missing += 1;
            result.missing_paths.push(rel);
            continue;
        };

        let dest = target_root.join(&rel);
        if dest.exists() {
            continue;
        }
        if let Some(parent) = dest.parent() {
            if std::fs::create_dir_all(parent).is_err() {
                result.missing += 1;
                result.missing_paths.push(rel);
                continue;
            }
        }
        match std::fs::copy(&src, &dest) {
            Ok(_) => result.copied += 1,
            Err(_) => {
                result.missing += 1;
                result.missing_paths.push(rel);
            }
        }
    }

    Ok(result)
}

/* Resolve a texture/asset rel path (as stored in a bin) to a disk file under
the bin's mod tree. Used by the emitter texture-hover preview to find a file
it can decode + reveal.

Mirrors the old Quartz `findActualTexturePath`: bin asset strings come in as
`ASSETS/...` or `assets/...` (case varies per mod), so we strip that prefix
and try both the raw rel and the prefix-stripped rel under the project root,
an explicit `assets`/`ASSETS` subdir, and the bin's own dir. A bounded
case-insensitive descent handles roots whose real casing differs from the
stored path. Returns null when nothing matches. */
#[tauri::command]
pub fn port_resolve_asset_path(asset_path: String, bin_path: String) -> Option<String> {
    let rel = normalize_rel(&asset_path);
    if rel.is_empty() {
        return None;
    }
    // `assets/foo/bar.tex` -> `foo/bar.tex` (either case).
    let rel_no_assets = rel
        .strip_prefix("assets/")
        .map(str::to_string)
        .unwrap_or_else(|| rel.clone());

    let bin = Path::new(&bin_path);
    let mut bases: Vec<PathBuf> = Vec::new();
    if let Some(root) = mod_root_for_bin(bin) {
        bases.push(root);
    }
    if let Some(dir) = bin.parent() {
        let dir = dir.to_path_buf();
        if !bases.contains(&dir) {
            bases.push(dir);
        }
    }

    for base in &bases {
        // Priority order matches old Quartz: raw rel, prefix-stripped, then an
        // explicit assets/ subdir (both casings), then bare filename.
        let mut candidates = vec![
            base.join(&rel),
            base.join(&rel_no_assets),
            base.join("assets").join(&rel_no_assets),
            base.join("ASSETS").join(&rel_no_assets),
        ];
        if let Some(name) = Path::new(&rel).file_name() {
            candidates.push(base.join(name));
        }
        for c in candidates {
            if c.is_file() {
                return Some(c.to_string_lossy().into_owned());
            }
        }
        // Case-insensitive descent as a last resort (bounded: one directory
        // read per path segment, no full-tree walk).
        if let Some(hit) = resolve_case_insensitive(base, &rel_no_assets) {
            return Some(hit.to_string_lossy().into_owned());
        }
    }
    None
}

/* Resolve `rel` under `base` matching each path segment case-insensitively.
Reads one directory per segment (bounded), never a recursive tree walk, so a
hover can never trigger a Desktop-wide scan. */
fn resolve_case_insensitive(base: &Path, rel: &str) -> Option<PathBuf> {
    let mut current = base.to_path_buf();
    for segment in rel.split('/').filter(|s| !s.is_empty()) {
        let exact = current.join(segment);
        if exact.exists() {
            current = exact;
            continue;
        }
        let seg_lower = segment.to_lowercase();
        let entries = std::fs::read_dir(&current).ok()?;
        let mut matched = None;
        for entry in entries.flatten() {
            if entry.file_name().to_string_lossy().to_lowercase() == seg_lower {
                matched = Some(entry.path());
                break;
            }
        }
        current = matched?;
    }
    current.is_file().then_some(current)
}

/* Find the mod root (the dir that holds the `data`/`assets` tree) for a bin.
Riot bins live under `<root>/data/characters/...` or `<root>/assets/...`, so
we walk up until we find the parent of a `data`/`assets` segment. */
fn mod_root_for_bin(bin_path: &Path) -> Option<PathBuf> {
    let mut current = bin_path.parent();
    while let Some(dir) = current {
        if let Some(name) = dir.file_name().and_then(|n| n.to_str()) {
            let lower = name.to_lowercase();
            if lower == "data" || lower == "assets" {
                return dir.parent().map(|p| p.to_path_buf());
            }
        }
        current = dir.parent();
    }
    // Fall back to the bin's own directory when no data/assets root is present.
    bin_path.parent().map(|p| p.to_path_buf())
}
