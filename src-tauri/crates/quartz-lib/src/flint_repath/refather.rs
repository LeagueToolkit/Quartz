//! Repathing engine: scans BIN files for asset paths (`assets/`, `data/`),
//! prefixes them with `ASSETS/{creator}/{project}`, and relocates the files.

use super::organizer::find_all_seed_skin_bins;
use crate::bin::ritoshark_bridge::{read_bin, write_bin};
use crate::error::{Error, Result};
use dashmap::DashSet;
use rayon::prelude::*;
use ritoshark::bin::BinValue;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use walkdir::WalkDir;

#[derive(Debug, Clone)]
pub struct RepathConfig {
    pub creator_name: String,
    pub project_name: String,
    pub champion: String,
    pub target_skin_id: u32,
    pub cleanup_unused: bool,
    /// Leave `sounds/wwise2016/sfx/*.{bnk,wpk,wem}` paths untouched (don't
    /// prefix or relocate them). On when the mod didn't change sounds.
    pub skip_sfx: bool,
    /// Leave `sounds/wwise2016/vo/*.{bnk,wpk,wem}` paths untouched. On unless
    /// the user is extracting/repathing voiceover (then off).
    pub skip_vo: bool,
}

impl RepathConfig {
    pub fn prefix(&self) -> String {
        let creator = self.creator_name.replace(' ', "-");
        let project = self.project_name.replace(' ', "-");
        // Quartz uses a single flat prefix (empty project); collapse it so paths
        // read `ASSETS/<prefix>/...` instead of `ASSETS/<prefix>//...`.
        if project.is_empty() {
            creator
        } else {
            format!("{}/{}", creator, project)
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct RepathResult {
    pub bins_processed: usize,
    pub paths_modified: usize,
    pub files_relocated: usize,
    pub files_removed: usize,
    pub missing_paths: Vec<String>,
}

pub fn repath_project(
    content_base: &Path,
    config: &RepathConfig,
    // Kept for signature parity with the organizer; repath now walks all BINs
    // on disk (post-combine) so no hash→path indirection is needed here.
    _path_mappings: &HashMap<String, String>,
) -> Result<RepathResult> {
    tracing::info!(
        "Starting repathing for project with prefix: ASSETS/{}",
        config.prefix()
    );

    if !content_base.exists() {
        return Err(Error::InvalidInput(format!(
            "Content base directory not found: {}",
            content_base.display()
        )));
    }

    let champion_lower = config.champion.to_lowercase();
    let wad_folder_name = format!("{}.wad.client", champion_lower);
    let wad_base = content_base.join(&wad_folder_name);

    let file_base = if wad_base.exists() {
        tracing::info!("Using WAD folder structure: {}", wad_base.display());
        &wad_base
    } else {
        tracing::info!("Using legacy folder structure (no WAD folder found)");
        content_base
    };

    let mut result = RepathResult::default();

    // Repath EVERY BIN under the output — not just the primary champion's
    // linked graph. After the per-character combine, the remaining BINs are the
    // seed skin BINs of ALL characters (main champ AND subcharacters like
    // AnnieTibbers) plus their kept character/animation/split siblings. Missing
    // a subcharacter's BIN here is exactly why its `assets/characters/<sub>/…`
    // strings (and files) were left unprefixed under `assets/characters/`.
    // Old Quartz's `bum.process` likewise repaths every source BIN in the dir.
    let bin_files: Vec<PathBuf> = WalkDir::new(file_base)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .map(|ext| ext.eq_ignore_ascii_case("bin"))
                .unwrap_or(false)
        })
        .map(|e| e.path().to_path_buf())
        .collect();

    tracing::info!("Processing {} BIN files (all characters)", bin_files.len());

    let all_asset_paths_set: DashSet<String> = DashSet::new();
    bin_files.par_iter().for_each(|bin_path| {
        if let Ok(paths) = scan_bin_for_paths(bin_path) {
            for path in paths {
                all_asset_paths_set.insert(path);
            }
        }
    });
    tracing::info!(
        "Found {} unique asset paths in BINs",
        all_asset_paths_set.len()
    );

    let all_asset_paths: HashSet<String> = all_asset_paths_set.into_iter().collect();

    let t_step3 = std::time::Instant::now();
    /* Stat each candidate path in parallel (independent reads, Windows stat is
    per-call kernel-transition bound). Case-insensitive since the Windows FS is. */
    let asset_path_vec: Vec<&String> = all_asset_paths.iter().collect();
    let existing_paths: HashSet<String> = asset_path_vec
        .par_iter()
        .filter(|path| {
            let full_path = file_base.join(path);
            if full_path.exists() {
                return true;
            }
            // Case-insensitive fallback, only on miss (reading the parent dir is expensive).
            if let Some(parent) = full_path.parent() {
                if parent.exists() {
                    if let Some(filename) = full_path.file_name() {
                        let filename_lower = filename.to_string_lossy().to_lowercase();
                        if let Ok(entries) = std::fs::read_dir(parent) {
                            for entry in entries.filter_map(|e| e.ok()) {
                                let entry_name = entry.file_name().to_string_lossy().to_lowercase();
                                if entry_name == filename_lower {
                                    return true;
                                }
                            }
                        }
                    }
                }
            }
            false
        })
        .map(|p| (*p).clone())
        .collect();

    let missing_count = all_asset_paths.len() - existing_paths.len();
    if missing_count > 0 {
        tracing::warn!(
            "{} asset paths referenced in BINs but not found on disk:",
            missing_count
        );
        for path in all_asset_paths.difference(&existing_paths).take(10) {
            tracing::warn!("  Missing: {}", path);
        }
        if missing_count > 10 {
            tracing::warn!("  ... and {} more", missing_count - 10);
        }
    }

    for path in all_asset_paths.difference(&existing_paths) {
        result.missing_paths.push(path.clone());
    }
    tracing::info!(
        "[TIMING] step3 existing_paths filter ({} paths): {:?}",
        all_asset_paths.len(),
        t_step3.elapsed()
    );

    let t_step4 = std::time::Instant::now();
    let prefix = config.prefix();
    let bins_processed = AtomicUsize::new(0);
    let paths_modified = AtomicUsize::new(0);

    bin_files.par_iter().for_each(|bin_path| {
        match repath_bin_file(bin_path, &existing_paths, &prefix, config) {
            Ok(modified_count) => {
                bins_processed.fetch_add(1, Ordering::Relaxed);
                paths_modified.fetch_add(modified_count, Ordering::Relaxed);
            }
            Err(e) => {
                tracing::warn!("Failed to repath {}: {}", bin_path.display(), e);
            }
        }
    });

    result.bins_processed = bins_processed.load(Ordering::Relaxed);
    result.paths_modified = paths_modified.load(Ordering::Relaxed);
    tracing::info!(
        "[TIMING] step4 repath {} BINs in parallel: {:?}",
        result.bins_processed,
        t_step4.elapsed()
    );

    let t_step5 = std::time::Instant::now();
    result.files_relocated = relocate_assets(file_base, &existing_paths, &prefix, config)?;
    tracing::info!(
        "[TIMING] step5 relocate_assets ({} files): {:?}",
        result.files_relocated,
        t_step5.elapsed()
    );

    if config.cleanup_unused {
        let t_step6 = std::time::Instant::now();
        result.files_removed = cleanup_unused_files(file_base, &existing_paths, &prefix, config)?;
        tracing::info!(
            "[TIMING] step6 cleanup_unused_files ({} removed): {:?}",
            result.files_removed,
            t_step6.elapsed()
        );
    }

    let t_step7 = std::time::Instant::now();
    cleanup_irrelevant_bins(file_base, &config.champion, config.target_skin_id)?;
    tracing::info!(
        "[TIMING] step7 cleanup_irrelevant_bins: {:?}",
        t_step7.elapsed()
    );

    let t_step8 = std::time::Instant::now();
    cleanup_empty_dirs(file_base)?;
    tracing::info!("[TIMING] step8 cleanup_empty_dirs: {:?}", t_step8.elapsed());

    tracing::info!(
        "Repathing complete: {} bins, {} paths modified, {} files relocated",
        result.bins_processed,
        result.paths_modified,
        result.files_relocated
    );

    Ok(result)
}

fn scan_bin_for_paths(bin_path: &Path) -> Result<Vec<String>> {
    let data = fs::read(bin_path).map_err(|e| Error::io_with_path(e, bin_path))?;

    let bin =
        read_bin(&data).map_err(|e| Error::InvalidInput(format!("Failed to parse BIN: {}", e)))?;

    let mut paths = Vec::new();

    for entry in &bin.entries {
        for value in entry.fields.values() {
            collect_paths_from_value(value, &mut paths);
        }
    }

    Ok(paths)
}

fn collect_paths_from_value(value: &BinValue, paths: &mut Vec<String>) {
    match value {
        BinValue::String(s) => {
            if is_asset_path(s) {
                paths.push(normalize_path(s));
            }
        }
        BinValue::List { items, .. } => {
            for item in items {
                collect_paths_from_value(item, paths);
            }
        }
        BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => {
            for v in fields.values() {
                collect_paths_from_value(v, paths);
            }
        }
        BinValue::Option {
            value: Some(inner), ..
        } => {
            collect_paths_from_value(inner, paths);
        }
        BinValue::Map { entries, .. } => {
            for (key, val) in entries {
                collect_paths_from_value(key, paths);
                collect_paths_from_value(val, paths);
            }
        }
        _ => {}
    }
}

fn is_asset_path(s: &str) -> bool {
    if s.len() < 5 {
        return false;
    }

    (s.len() >= 7 && s[..7].eq_ignore_ascii_case("assets/"))
        || (s.len() >= 5 && s[..5].eq_ignore_ascii_case("data/"))
}

/// Lowercase with forward slashes.
fn normalize_path(s: &str) -> String {
    s.to_lowercase().replace('\\', "/")
}

/// 1:1 port of old Quartz `bumPath(filePath, prefix)` (bumpathHelpers.js).
/// Inserts `<prefix>` after the FIRST `/` (so `assets/characters/...` becomes
/// `assets/<prefix>/characters/...`). Idempotent: if the prefix is already
/// present it returns the path unchanged. Blocked SFX/VO audio banks are left
/// verbatim so the game still resolves them in place.
fn apply_prefix_to_path(path: &str, prefix: &str, config: &RepathConfig) -> String {
    // Skip SFX/VO audio payloads entirely (old Quartz `_isBlockedSfxPath` /
    // `_isBlockedVoPath`): leave the original path.
    if config.skip_sfx && is_blocked_sfx_path(path) {
        return path.to_string();
    }
    if config.skip_vo && is_blocked_vo_path(path) {
        return path.to_string();
    }
    bum_path(path, prefix)
}

/// `bumPath` — insert `prefix` after the first slash; idempotent.
fn bum_path(file_path: &str, prefix: &str) -> String {
    let file_path = file_path.trim();
    if file_path.is_empty() || prefix.is_empty() {
        return file_path.to_string();
    }
    // Already prefixed? (`/<prefix>/` anywhere, or leading `<prefix>/`)
    let lower = file_path.to_lowercase();
    let pfx_lower = prefix.to_lowercase();
    if lower.contains(&format!("/{}/", pfx_lower)) || lower.starts_with(&format!("{}/", pfx_lower))
    {
        return file_path.to_string();
    }
    match file_path.find('/') {
        Some(i) => format!("{}/{}{}", &file_path[..i], prefix, &file_path[i..]),
        None => format!("{}/{}", prefix, file_path),
    }
}

/// old Quartz `_isBlockedSfxPath`: `sounds/wwise2016/sfx/…` ending in bnk/wpk/wem.
fn is_blocked_sfx_path(path: &str) -> bool {
    let norm = path.replace('\\', "/").to_lowercase();
    let in_sfx =
        norm.starts_with("sounds/wwise2016/sfx/") || norm.contains("/sounds/wwise2016/sfx/");
    in_sfx && (norm.ends_with(".bnk") || norm.ends_with(".wpk") || norm.ends_with(".wem"))
}

/// old Quartz `_isBlockedVoPath`: `sounds/wwise2016/vo/…` ending in bnk/wpk/wem.
fn is_blocked_vo_path(path: &str) -> bool {
    let norm = path.replace('\\', "/").to_lowercase();
    let in_vo = norm.starts_with("sounds/wwise2016/vo/") || norm.contains("/sounds/wwise2016/vo/");
    in_vo && (norm.ends_with(".bnk") || norm.ends_with(".wpk") || norm.ends_with(".wem"))
}

fn repath_bin_file(
    bin_path: &Path,
    existing_paths: &HashSet<String>,
    prefix: &str,
    config: &RepathConfig,
) -> Result<usize> {
    let data = fs::read(bin_path).map_err(|e| Error::io_with_path(e, bin_path))?;

    let mut bin =
        read_bin(&data).map_err(|e| Error::InvalidInput(format!("Failed to parse BIN: {}", e)))?;

    let mut modified_count = 0;

    // 1:1 with old Quartz `_repathBin`: only bumPath asset strings in entry
    // fields. `championSkinName` is left untouched, and the `linked` list holds
    // only character BINs after combine (which bumPath skips), so it's left too.
    for entry in bin.entries.iter_mut() {
        for value in entry.fields.values_mut() {
            modified_count += repath_value(value, existing_paths, prefix, config);
        }
    }

    if modified_count > 0 {
        let new_data = write_bin(&bin)
            .map_err(|e| Error::InvalidInput(format!("Failed to write BIN: {}", e)))?;

        fs::write(bin_path, new_data).map_err(|e| Error::io_with_path(e, bin_path))?;
        tracing::debug!(
            "Repathed {} paths in {}",
            modified_count,
            bin_path.display()
        );
    }

    Ok(modified_count)
}

fn repath_value(
    value: &mut BinValue,
    existing_paths: &HashSet<String>,
    prefix: &str,
    config: &RepathConfig,
) -> usize {
    let mut count = 0;

    match value {
        BinValue::String(s) => {
            if is_asset_path(s) {
                let normalized = normalize_path(s);
                if existing_paths.contains(&normalized) {
                    // Pure bumPath prefix insert — old Quartz does NOT strip
                    // base/ folders or remap skin folders during repath.
                    *s = apply_prefix_to_path(s, prefix, config);
                    count += 1;
                }
            }
        }
        BinValue::List { items, .. } => {
            for item in items.iter_mut() {
                count += repath_value(item, existing_paths, prefix, config);
            }
        }
        BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => {
            for v in fields.values_mut() {
                count += repath_value(v, existing_paths, prefix, config);
            }
        }
        BinValue::Option {
            value: Some(inner), ..
        } => {
            count += repath_value(inner, existing_paths, prefix, config);
        }
        BinValue::Map { entries, .. } => {
            for (key, val) in entries.iter_mut() {
                count += repath_value(key, existing_paths, prefix, config);
                count += repath_value(val, existing_paths, prefix, config);
            }
        }
        _ => {}
    }

    count
}

fn relocate_assets(
    content_base: &Path,
    existing_paths: &HashSet<String>,
    prefix: &str,
    config: &RepathConfig,
) -> Result<usize> {
    /* Pass 1 (serial): plan the moves with first-writer-wins conflict
    detection (cheap — one HashMap insert per path). */
    let mut destinations: HashMap<String, String> = HashMap::new();
    let mut moves: Vec<(PathBuf, PathBuf)> = Vec::with_capacity(existing_paths.len());
    let mut parent_dirs: HashSet<PathBuf> = HashSet::new();

    for path in existing_paths {
        // BIN files stay at their character path (old Quartz never relocates
        // BINs during repath — only asset payloads move).
        if path.to_lowercase().ends_with(".bin") {
            continue;
        }

        // Skip-SFX / Skip-VO: leave the audio bank in place (its bin refs
        // weren't repathed, so moving it would orphan them).
        if (config.skip_sfx && is_blocked_sfx_path(path))
            || (config.skip_vo && is_blocked_vo_path(path))
        {
            continue;
        }

        let new_path = apply_prefix_to_path(path, prefix, config);
        let dest_normalized = normalize_path(&new_path);
        if let Some(prev_source) = destinations.get(&dest_normalized) {
            tracing::warn!(
                "Conflict detected: '{}' and '{}' both map to '{}'",
                prev_source,
                path,
                dest_normalized
            );
            continue;
        }
        destinations.insert(dest_normalized, path.clone());

        let source = content_base.join(path);
        let dest = content_base.join(&new_path);
        if let Some(parent) = dest.parent() {
            parent_dirs.insert(parent.to_path_buf());
        }
        moves.push((source, dest));
    }

    // Pass 2: pre-create all unique parent directories.
    for parent in &parent_dirs {
        fs::create_dir_all(parent).map_err(|e| Error::io_with_path(e, parent))?;
    }

    /* Pass 3 (parallel): rename each independent file, falling back to
    copy+delete across devices. Probe exists() only on rename failure. */
    let relocated = moves
        .par_iter()
        .filter(|(source, dest)| match fs::rename(source, dest) {
            Ok(_) => true,
            Err(_) => {
                if !source.exists() {
                    return false;
                }
                if let Err(e) = fs::copy(source, dest) {
                    tracing::warn!("relocate copy failed {}: {}", source.display(), e);
                    return false;
                }
                if let Err(e) = fs::remove_file(source) {
                    tracing::warn!(
                        "relocate remove-after-copy failed {}: {}",
                        source.display(),
                        e
                    );
                }
                true
            }
        })
        .count();

    Ok(relocated)
}

fn cleanup_unused_files(
    content_base: &Path,
    referenced_paths: &HashSet<String>,
    prefix: &str,
    config: &RepathConfig,
) -> Result<usize> {
    use rayon::prelude::*;

    let expected_paths: HashSet<String> = referenced_paths
        .iter()
        .map(|p| normalize_path(&apply_prefix_to_path(p, prefix, config)))
        .collect();
    let creator_prefix = format!(
        "assets/{}/",
        config.creator_name.replace(' ', "-").to_lowercase()
    );

    // Walk serially (WalkDir holds file-handle state), then delete in parallel.
    let to_delete: Vec<PathBuf> = WalkDir::new(content_base)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter_map(|entry| {
            let path = entry.path();
            if !path.is_file() {
                return None;
            }
            // BIN files are handled by cleanup_irrelevant_bins.
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if ext.eq_ignore_ascii_case("bin") {
                    return None;
                }
            }
            let rel_path = path.strip_prefix(content_base).ok()?;
            let normalized = normalize_path(&rel_path.to_string_lossy());
            let in_new_tree = normalized.to_lowercase().starts_with(&creator_prefix);
            if !expected_paths.contains(&normalized) || !in_new_tree {
                Some(path.to_path_buf())
            } else {
                None
            }
        })
        .collect();

    let removed = to_delete
        .par_iter()
        .filter(|path| match fs::remove_file(path) {
            Ok(()) => true,
            Err(e) => {
                tracing::warn!("Failed to remove {}: {}", path.display(), e);
                false
            }
        })
        .count();

    Ok(removed)
}

/// 1:1 port of old Quartz's post-combine BIN prune (wadBumpath.js:715-771).
///
/// KEEP: every seed skin BIN (all characters), plus any `.bin` still referenced
/// in a surviving seed BIN's `linked:` list. DELETE: everything else, and
/// ALWAYS delete each character's base `<char>.bin` root (redundant after
/// combine — the link ref is kept, the file is deadweight).
fn cleanup_irrelevant_bins(
    content_base: &Path,
    champion: &str,
    target_skin_id: u32,
) -> Result<usize> {
    let mut removed = 0;

    // KEEP set, by content-relative key (lowercased, forward slashes).
    let seeds = find_all_seed_skin_bins(content_base, champion, target_skin_id);
    let mut keep: HashSet<String> = HashSet::new();
    for seed in &seeds {
        keep.insert(rel_key(content_base, seed));
        // Anything the combined seed BIN still links to and that exists on disk.
        if let Ok(data) = fs::read(seed) {
            if let Ok(bin) = read_bin(&data) {
                for link in &bin.linked {
                    if let Some(disk) =
                        crate::bin::concat::resolve_linked_on_disk(content_base, link)
                    {
                        keep.insert(rel_key(content_base, &disk));
                    }
                }
            }
        }
    }

    // Base `<char>.bin` roots to ALWAYS delete (one per character folder seen).
    let mut base_bins: HashSet<String> = HashSet::new();
    for seed in &seeds {
        let rel = rel_key(content_base, seed);
        // rel like `.../characters/<char>/skins/skinN.bin` → `.../characters/<char>/<char>.bin`
        if let Some(idx) = rel.find("/characters/") {
            let after = &rel[idx + "/characters/".len()..];
            if let Some(slash) = after.find('/') {
                let ch = &after[..slash];
                let root_rel = format!("{}/characters/{}/{}.bin", &rel[..idx], ch, ch);
                base_bins.insert(root_rel.trim_start_matches('/').to_string());
            }
        }
    }

    tracing::info!(
        "Pruning BINs (keep {} seed+linked, always-delete {} base roots)",
        keep.len(),
        base_bins.len()
    );

    for entry in WalkDir::new(content_base)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .map(|x| x.eq_ignore_ascii_case("bin"))
                .unwrap_or(false)
        })
    {
        let path = entry.path();
        let Ok(rel_path) = path.strip_prefix(content_base) else {
            continue;
        };
        let rel = rel_path.to_string_lossy().to_lowercase().replace('\\', "/");

        // Always delete base character roots, even though a seed still links them.
        if base_bins.contains(&rel) {
            if fs::remove_file(path).is_ok() {
                removed += 1;
                tracing::debug!("Deleted base character BIN: {}", rel);
            }
            continue;
        }

        if keep.contains(&rel) {
            continue;
        }

        if fs::remove_file(path).is_ok() {
            removed += 1;
            tracing::debug!("Deleted unreferenced BIN: {}", rel);
        }
    }

    if removed > 0 {
        tracing::info!("Cleaned up {} irrelevant BIN files", removed);
    }
    Ok(removed)
}

/// Content-relative key: lowercased, forward slashes, no leading slash.
fn rel_key(base: &Path, p: &Path) -> String {
    p.strip_prefix(base)
        .map(|r| r.to_string_lossy().to_lowercase().replace('\\', "/"))
        .unwrap_or_default()
        .trim_start_matches('/')
        .to_string()
}

fn cleanup_empty_dirs(dir: &Path) -> Result<()> {
    for entry in WalkDir::new(dir)
        .contents_first(true)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_dir() {
            if let Ok(entries) = fs::read_dir(path) {
                if entries.count() == 0 {
                    let _ = fs::remove_dir(path);
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg(prefix: &str, skip_sfx: bool, skip_vo: bool) -> RepathConfig {
        RepathConfig {
            creator_name: prefix.to_string(),
            project_name: String::new(),
            champion: "annie".to_string(),
            target_skin_id: 9,
            cleanup_unused: false,
            skip_sfx,
            skip_vo,
        }
    }

    #[test]
    fn test_is_asset_path() {
        assert!(is_asset_path("assets/characters/ahri/skin0.bin"));
        assert!(is_asset_path("data/effects.bin"));
        assert!(!is_asset_path("some/other/path.txt"));
    }

    #[test]
    fn bumpath_inserts_prefix_after_first_slash() {
        // Old Quartz bumPath: insert <prefix> after the first `/`.
        assert_eq!(
            bum_path("assets/characters/annie/skins/skin9/tx.dds", "mymod"),
            "assets/mymod/characters/annie/skins/skin9/tx.dds"
        );
        assert_eq!(
            bum_path("data/characters/annie/annie.bin", "mymod"),
            "data/mymod/characters/annie/annie.bin"
        );
    }

    #[test]
    fn bumpath_is_idempotent() {
        let once = bum_path("assets/characters/annie/x.dds", "mymod");
        assert_eq!(bum_path(&once, "mymod"), once);
    }

    #[test]
    fn bumpath_no_slash_prepends() {
        assert_eq!(bum_path("file.dds", "mymod"), "mymod/file.dds");
    }

    #[test]
    fn apply_prefix_matches_bumpath_for_normal_assets() {
        let c = cfg("mymod", true, true);
        assert_eq!(
            apply_prefix_to_path("assets/characters/annie/skins/skin9/mesh.skn", "mymod", &c),
            "assets/mymod/characters/annie/skins/skin9/mesh.skn"
        );
    }

    #[test]
    fn skip_sfx_leaves_bank_verbatim() {
        let c = cfg("mymod", true, false);
        let sfx = "assets/sounds/wwise2016/sfx/characters/annie/annie_sfx.bnk";
        assert_eq!(apply_prefix_to_path(sfx, "mymod", &c), sfx);
        // A non-bank string under sfx/ is still prefixed (matches old Quartz guard).
        let img = "assets/sounds/wwise2016/sfx/characters/annie/icon.dds";
        assert_eq!(
            apply_prefix_to_path(img, "mymod", &c),
            "assets/mymod/sounds/wwise2016/sfx/characters/annie/icon.dds"
        );
    }

    #[test]
    fn skip_sfx_off_prefixes_bank() {
        let c = cfg("mymod", false, false);
        let sfx = "assets/sounds/wwise2016/sfx/characters/annie/annie_sfx.bnk";
        assert_eq!(
            apply_prefix_to_path(sfx, "mymod", &c),
            "assets/mymod/sounds/wwise2016/sfx/characters/annie/annie_sfx.bnk"
        );
    }

    #[test]
    fn skip_vo_leaves_bank_verbatim() {
        let c = cfg("mymod", true, true);
        let vo = "assets/sounds/wwise2016/vo/en_us/characters/annie/annie_vo.wpk";
        assert_eq!(apply_prefix_to_path(vo, "mymod", &c), vo);
    }

    #[test]
    fn skip_vo_off_prefixes_bank() {
        let c = cfg("mymod", true, false);
        let vo = "assets/sounds/wwise2016/vo/en_us/characters/annie/annie_vo.wpk";
        assert_eq!(
            apply_prefix_to_path(vo, "mymod", &c),
            "assets/mymod/sounds/wwise2016/vo/en_us/characters/annie/annie_vo.wpk"
        );
    }

    #[test]
    fn blocked_path_guards_require_bank_extension() {
        assert!(is_blocked_sfx_path("assets/sounds/wwise2016/sfx/x.bnk"));
        assert!(!is_blocked_sfx_path("assets/sounds/wwise2016/sfx/x.dds"));
        assert!(is_blocked_vo_path("assets/sounds/wwise2016/vo/x.wem"));
        assert!(!is_blocked_vo_path("assets/sounds/wwise2016/vo/x.dds"));
    }

    #[test]
    fn prefix_single_flat_token() {
        let c = cfg("mymod", true, true);
        assert_eq!(c.prefix(), "mymod");
    }
}
