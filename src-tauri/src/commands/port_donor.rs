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
    chroma_id: Option<u32>,
    league_path: String,
    porting_prefix: Option<String>,
) -> Result<DonorResult, String> {
    let prefix = porting_prefix.unwrap_or_default();
    port_donor::prepare_donor_from_skin(
        &PathBuf::from(league_path),
        &champion_name,
        skin_id,
        chroma_id,
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

/* Resolve an asset rel path to a file on disk under any of `bases`, using the
same tolerant strategy as `port_resolve_asset_path`: bin strings come in as
`ASSETS/...` or `assets/...` with varying case and depth, and the file on disk
may live directly under the base, under an explicit `assets/`/`ASSETS/` subdir,
or differ only in case. Returns the matched absolute path.

Shared by the hover-preview resolver and the port asset copy so both find the
same files (the copy previously only tried a verbatim `base/rel` join, which
missed nearly everything). */
fn resolve_asset_under_bases(bases: &[PathBuf], rel: &str) -> Option<PathBuf> {
    let rel_no_assets = rel
        .strip_prefix("assets/")
        .map(str::to_string)
        .unwrap_or_else(|| rel.to_string());

    for base in bases {
        let mut candidates = vec![
            base.join(rel),
            base.join(&rel_no_assets),
            base.join("assets").join(&rel_no_assets),
            base.join("ASSETS").join(&rel_no_assets),
        ];
        if let Some(name) = Path::new(rel).file_name() {
            candidates.push(base.join(name));
        }
        for c in candidates {
            if c.is_file() {
                return Some(c);
            }
        }
        if let Some(hit) = resolve_case_insensitive(base, &rel_no_assets) {
            return Some(hit);
        }
    }
    None
}

/* Copy each asset in `asset_paths` into the target mod tree, preserving its
`assets/...` relative path so the game resolves it. Sources are located
tolerantly under each `source_dir` (and their `assets/` subdirs), matching the
old Electron `copyAssetFiles` behavior. The target root is derived from the
target bin: assets live beside the bin's `data/` or `assets/` root, so we walk
up from the bin path to that mod root. */
#[tauri::command]
pub fn port_copy_assets_to_target(
    asset_paths: Vec<String>,
    source_dirs: Vec<String>,
    target_bin_path: String,
) -> Result<AssetCopyResult, String> {
    let target_root = mod_root_for_bin(Path::new(&target_bin_path))
        .ok_or_else(|| format!("Could not locate mod root for target bin: {target_bin_path}"))?;

    // Search each source dir, plus the mod root above it. Donor bins live at
    // `<root>/data/characters/.../skin.bin` while the referenced assets live at
    // `<root>/assets/...`, so the mod root (the parent of the `data`/`assets`
    // segment) is the base that actually reaches them — climbing one parent is
    // not enough. `mod_root_for_bin` walks up to that root for a dir too.
    let mut bases: Vec<PathBuf> = Vec::new();
    let push_base = |b: PathBuf, bases: &mut Vec<PathBuf>| {
        if !b.as_os_str().is_empty() && !bases.contains(&b) {
            bases.push(b);
        }
    };
    for d in source_dirs {
        let dir = PathBuf::from(d);
        // Climb to the mod root (parent of the `data`/`assets` segment), so a
        // sibling `assets/` tree several levels above the bin is reachable.
        if let Some(root) = mod_root_for_dir(&dir) {
            push_base(root, &mut bases);
        }
        if let Some(parent) = dir.parent() {
            push_base(parent.to_path_buf(), &mut bases);
        }
        push_base(dir, &mut bases);
    }

    tracing::info!(
        "[port assets] copy start: {} asset(s), target_root={}, bases={:?}",
        asset_paths.len(),
        target_root.display(),
        bases
            .iter()
            .map(|b| b.display().to_string())
            .collect::<Vec<_>>()
    );

    let mut result = AssetCopyResult::default();

    for asset in asset_paths {
        let rel = normalize_rel(&asset);
        if rel.is_empty() || rel.ends_with(".bin") {
            tracing::info!("[port assets] skip (empty/bin): '{asset}'");
            continue;
        }

        let Some(src) = resolve_asset_under_bases(&bases, &rel) else {
            tracing::warn!(
                "[port assets] NOT FOUND: rel='{rel}' (searched {} bases)",
                bases.len()
            );
            result.missing += 1;
            result.missing_paths.push(rel);
            continue;
        };

        // Preserve the bin's `assets/...` rel path at the destination so the
        // ported bin's references still resolve in the target mod.
        let dest = target_root.join(&rel);
        if dest.exists() {
            tracing::info!("[port assets] already present, skip: {}", dest.display());
            continue;
        }
        if let Some(parent) = dest.parent() {
            if std::fs::create_dir_all(parent).is_err() {
                tracing::error!("[port assets] mkdir failed for {}", parent.display());
                result.missing += 1;
                result.missing_paths.push(rel);
                continue;
            }
        }
        match std::fs::copy(&src, &dest) {
            Ok(_) => {
                tracing::info!(
                    "[port assets] copied {} -> {}",
                    src.display(),
                    dest.display()
                );
                result.copied += 1;
            }
            Err(e) => {
                tracing::error!(
                    "[port assets] copy failed {} -> {}: {e}",
                    src.display(),
                    dest.display()
                );
                result.missing += 1;
                result.missing_paths.push(rel);
            }
        }
    }

    tracing::info!(
        "[port assets] copy done: copied={}, missing={}, missing_paths={:?}",
        result.copied,
        result.missing,
        result.missing_paths
    );

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

    resolve_asset_under_bases(&bases, &rel).map(|p| p.to_string_lossy().into_owned())
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
    // Fall back to the bin's own directory when no data/assets root is present.
    bin_path
        .parent()
        .and_then(mod_root_for_dir)
        .or_else(|| bin_path.parent().map(|p| p.to_path_buf()))
}

/* Walk up from `dir` to the parent of the first `data`/`assets` segment (the
mod root). Returns None if no such segment is found. */
fn mod_root_for_dir(dir: &Path) -> Option<PathBuf> {
    let mut current = Some(dir);
    while let Some(d) = current {
        if let Some(name) = d.file_name().and_then(|n| n.to_str()) {
            let lower = name.to_lowercase();
            if lower == "data" || lower == "assets" {
                return d.parent().map(|p| p.to_path_buf());
            }
        }
        current = d.parent();
    }
    None
}
