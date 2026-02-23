//! Repathing engine for modifying asset paths in BIN files
//!
//! This module implements the "bumpath" algorithm that:
//! 1. Scans BIN files for string values containing asset paths (assets/, data/)
//! 2. Prefixes those paths with a unique identifier (ASSETS/{creator}/{project})
//! 3. Relocates the actual asset files to match the new paths
//! 4. Optionally combines linked BINs into a single concat BIN

use crate::core::bin::ltk_bridge::{read_bin, write_bin};
use crate::error::{Error, Result};
use ltk_meta::PropertyValueEnum;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::LazyLock;
use walkdir::WalkDir;
use rayon::prelude::*;
use dashmap::DashSet;
use regex::Regex;

/// Static regex for skin folder remapping (compiled once, used many times)
static SKIN_FOLDER_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(skin)(\d+)(/)").expect("Invalid skin folder regex")
});

/// Parsed asset path with structured components (zero-copy where possible)
///
/// This enum provides type-safe path handling and eliminates repeated string parsing.
/// Paths are parsed once and carry their semantic meaning through the repathing process.
#[derive(Debug, Clone, PartialEq, Eq)]
enum AssetPath<'a> {
    /// SFX (Sound Effects) files - repath to audio/sfx/
    /// These live in the champion WAD and can be safely repathed
    SoundSfx {
        filename: &'a str,  // Just the filename, all path components stripped
    },

    /// VO (Voice-Over) files - DO NOT REPATH
    /// These live in separate language WADs and must keep their original paths
    /// or the game won't be able to find them (resulting in silent characters)
    SoundVo {
        original_path: &'a str,  // Keep entire original path intact
    },

    /// HUD files for the target champion - go to creator-level hud/ folder
    /// Pattern: characters/{champion}/hud/{filename}
    ChampionHud {
        filename: &'a str,
    },

    /// Target champion skin assets - go to project folder with skin ID remapped
    /// Pattern: characters/{target_champion}/skins/skinXX/...
    TargetChampionSkin {
        /// Skin ID parsed from path (if present)
        skin_id: Option<u32>,
        /// Everything after the champion folder (may include skins/ prefix)
        subpath: &'a str,
    },

    /// Other champion assets - go to creator-level shared-champion/ folder
    /// Pattern: characters/{other_champion}/...
    OtherChampion {
        /// Everything after "characters/{champion}/"
        subpath: &'a str,
    },

    /// Shared assets (non-champion) - go to creator-level shared/ folder
    /// Pattern: particles/, maps/, etc.
    Shared {
        /// Path after stripping "shared/" prefix if present
        subpath: &'a str,
    },
}

impl<'a> AssetPath<'a> {
    /// Parse a path into structured components (zero-copy where possible)
    ///
    /// This performs a single pass over the path string, extracting semantic
    /// information without allocating intermediate strings.
    fn parse(path: &'a str, target_champion: &str) -> Option<Self> {
        // Strip "assets/" or "data/" prefix (case-insensitive)
        let stripped = if path.len() >= 7 && path[..7].eq_ignore_ascii_case("assets/") {
            &path[7..]
        } else if path.len() >= 5 && path[..5].eq_ignore_ascii_case("data/") {
            &path[5..]
        } else {
            return None; // Not an asset path
        };

        // === SOUND FILES ===
        // Fast path: check for sounds/ prefix
        if let Some(sound_path) = Self::strip_prefix_ignore_case(stripped, "sounds/") {
            // Check if VO file (voice-over)
            if Self::contains_ignore_case(sound_path, "/vo/") {
                return Some(AssetPath::SoundVo {
                    original_path: path,
                });
            }

            // SFX file - extract just the filename
            let filename = sound_path.split('/').next_back().unwrap_or(sound_path);
            return Some(AssetPath::SoundSfx { filename });
        }

        // === CHAMPION PATHS ===
        if let Some(rest) = Self::strip_prefix_ignore_case(stripped, "characters/") {
            // Split into champion name and subpath
            let mut parts = rest.splitn(2, '/');
            let champion = parts.next()?;
            let subpath = parts.next().unwrap_or("");

            // HUD special case
            if let Some(filename) = Self::strip_prefix_ignore_case(subpath, "hud/") {
                if champion.eq_ignore_ascii_case(target_champion) {
                    return Some(AssetPath::ChampionHud { filename });
                }
            }

            // Target champion vs other champion
            if champion.eq_ignore_ascii_case(target_champion) {
                // Parse skin ID if present in path
                let skin_id = if let Some(skins_path) = Self::strip_prefix_ignore_case(subpath, "skins/") {
                    skins_path
                        .split('/')
                        .next()
                        .and_then(|s| Self::strip_prefix_ignore_case(s, "skin"))
                        .and_then(|s| s.parse::<u32>().ok())
                } else {
                    None
                };

                return Some(AssetPath::TargetChampionSkin { skin_id, subpath });
            } else {
                // Other champion
                return Some(AssetPath::OtherChampion { subpath });
            }
        }

        // === SHARED ASSETS ===
        // Strip "shared/" prefix if present to avoid duplication
        let subpath = Self::strip_prefix_ignore_case(stripped, "shared/").unwrap_or(stripped);
        Some(AssetPath::Shared { subpath })
    }

    /// Convert parsed path to final repathed string
    fn to_repathed(&self, config: &RepathConfig) -> String {
        let creator = config.creator_name.replace(' ', "-");
        let prefix = config.prefix();

        match self {
            AssetPath::SoundSfx { filename } => {
                format!("ASSETS/{}/audio/sfx/{}", prefix, filename)
            }
            AssetPath::SoundVo { original_path } => {
                // Return original path unchanged - game needs this exact path
                original_path.to_string()
            }
            AssetPath::ChampionHud { filename } => {
                format!("ASSETS/{}/hud/{}", creator, filename)
            }
            AssetPath::TargetChampionSkin { subpath, .. } => {
                // Strip "skins/" prefix if present
                let after_skins = Self::strip_prefix_ignore_case(subpath, "skins/")
                    .unwrap_or(subpath);

                // Remap skin IDs in the path
                let remapped = remap_skin_ids(after_skins, config.target_skin_id);
                format!("ASSETS/{}/{}", prefix, remapped)
            }
            AssetPath::OtherChampion { subpath } => {
                // Extract path after "skins/" if present
                let parts: Vec<&str> = subpath.split('/').collect();
                let after_skins = if parts.len() >= 2 && parts[0].eq_ignore_ascii_case("skins") {
                    parts[1..].join("/")
                } else {
                    subpath.to_string()
                };
                format!("ASSETS/{}/shared-champion/{}", creator, after_skins)
            }
            AssetPath::Shared { subpath } => {
                format!("ASSETS/{}/shared/{}", creator, subpath)
            }
        }
    }

    /// Helper: case-insensitive prefix stripping
    #[inline]
    fn strip_prefix_ignore_case<'b>(s: &'b str, prefix: &str) -> Option<&'b str> {
        if s.len() >= prefix.len() && s[..prefix.len()].eq_ignore_ascii_case(prefix) {
            Some(&s[prefix.len()..])
        } else {
            None
        }
    }

    /// Helper: case-insensitive substring check
    #[inline]
    fn contains_ignore_case(s: &str, pattern: &str) -> bool {
        s.to_lowercase().contains(&pattern.to_lowercase())
    }
}

/// Configuration for repathing operations
///
/// Note: BIN concatenation is now handled separately by the organizer module.
/// This config is purely for path modification operations.
#[derive(Debug, Clone)]
pub struct RepathConfig {
    pub creator_name: String,
    pub project_name: String,
    pub champion: String,
    pub target_skin_id: u32,
    pub cleanup_unused: bool,
}

impl RepathConfig {
    pub fn prefix(&self) -> String {
        let creator = self.creator_name.replace(' ', "-");
        let project = self.project_name.replace(' ', "-");
        format!("{}/{}", creator, project)
    }
}

/// Result of a repathing operation
#[derive(Debug, Clone)]
pub struct RepathResult {
    pub bins_processed: usize,
    pub paths_modified: usize,
    pub files_relocated: usize,
    pub files_removed: usize,
    pub missing_paths: Vec<String>,
}

/// Repath all assets in a project directory
pub fn repath_project(
    content_base: &Path,
    config: &RepathConfig,
    path_mappings: &HashMap<String, String>,
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

    // Compute the WAD folder path: content_base/{champion}.wad.client/
    // This is required for league-mod compatible project structure
    let champion_lower = config.champion.to_lowercase();
    let wad_folder_name = format!("{}.wad.client", champion_lower);
    let wad_base = content_base.join(&wad_folder_name);
    
    // Determine which base to use for file operations
    // Use WAD folder if it exists (new structure), otherwise fall back to content_base (legacy)
    let file_base = if wad_base.exists() {
        tracing::info!("Using WAD folder structure: {}", wad_base.display());
        &wad_base
    } else {
        tracing::info!("Using legacy folder structure (no WAD folder found)");
        content_base
    };

    let mut result = RepathResult {
        bins_processed: 0,
        paths_modified: 0,
        files_relocated: 0,
        files_removed: 0,
        missing_paths: Vec::new(),
    };

    // Step 0: Find the main skin BIN (now using file_base)
    let main_bin_path = if !config.champion.is_empty() {
        find_main_skin_bin(file_base, &config.champion, config.target_skin_id)
    } else {
        None
    };

    let mut bin_files: Vec<PathBuf> = Vec::new();

    if let Some(ref main_path) = main_bin_path {
        tracing::info!("Found main skin BIN: {}", main_path.display());
        bin_files.push(main_path.clone());

        // Read the main BIN to get its linked BINs
        if let Ok(data) = fs::read(main_path) {
            if let Ok(bin) = read_bin(&data) {
                tracing::info!("Main skin BIN has {} dependencies", bin.dependencies.len());
                
                for dep_path in &bin.dependencies {
                    let normalized_path = dep_path.to_lowercase().replace('\\', "/");

                    let actual_path = path_mappings.get(&normalized_path)
                        .cloned()
                        .unwrap_or_else(|| normalized_path.clone());
                    
                    let full_path = file_base.join(&actual_path);
                    if full_path.exists() {
                        bin_files.push(full_path);
                    } else {
                        tracing::warn!("Linked BIN not found: {}", normalized_path);
                    }
                }
            }
        }
    } else {
        tracing::warn!("No main skin BIN found, falling back to scanning all BINs");
        bin_files = WalkDir::new(file_base)
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
    }

    tracing::info!("Processing {} BIN files", bin_files.len());

    // Note: BIN concatenation is now handled by the organizer module.
    // This function focuses purely on path modification.

    // Step 2: Scan BINs to collect referenced asset paths (PARALLEL)
    let all_asset_paths_set: DashSet<String> = DashSet::new();
    bin_files.par_iter().for_each(|bin_path| {
        if let Ok(paths) = scan_bin_for_paths(bin_path) {
            for path in paths {
                all_asset_paths_set.insert(path);
            }
        }
    });
    tracing::info!("Found {} unique asset paths in BINs", all_asset_paths_set.len());

    // Convert DashSet to HashSet for existing_paths filtering
    let all_asset_paths: HashSet<String> = all_asset_paths_set.into_iter().collect();

    // Step 3: Determine which paths actually exist
    // Use case-insensitive matching since Windows filesystem is case-insensitive
    let existing_paths: HashSet<String> = all_asset_paths
        .iter()
        .filter(|path| {
            let full_path = file_base.join(path);
            if full_path.exists() {
                return true;
            }
            
            // Try case-insensitive lookup by checking parent directory
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
        .cloned()
        .collect();

    // Log missing paths for debugging
    let missing_count = all_asset_paths.len() - existing_paths.len();
    if missing_count > 0 {
        tracing::warn!("{} asset paths referenced in BINs but not found on disk:", missing_count);
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

    // Step 4: Repath BIN files (PARALLEL)
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

    // Step 5: Relocate asset files
    result.files_relocated = relocate_assets(file_base, &existing_paths, &prefix, config)?;

    // Step 6: Clean up unused files
    if config.cleanup_unused {
        result.files_removed = cleanup_unused_files(file_base, &existing_paths, &prefix, config)?;
    }

    // Step 7: Clean up irrelevant extracted BINs
    cleanup_irrelevant_bins(file_base, &config.champion, config.target_skin_id)?;

    // Step 8: Clean up empty directories
    cleanup_empty_dirs(file_base)?;

    tracing::info!(
        "Repathing complete: {} bins, {} paths modified, {} files relocated",
        result.bins_processed,
        result.paths_modified,
        result.files_relocated
    );

    Ok(result)
}

/// Scan a BIN file for asset path references
fn scan_bin_for_paths(bin_path: &Path) -> Result<Vec<String>> {
    let data = fs::read(bin_path).map_err(|e| Error::io_with_path(e, bin_path))?;
    let bin = read_bin(&data)
        .map_err(|e| Error::InvalidInput(format!("Failed to parse BIN: {}", e)))?;

    let mut paths = Vec::new();

    for object in bin.objects.values() {
        for prop in object.properties.values() {
            collect_paths_from_value(&prop.value, &mut paths);
        }
    }

    Ok(paths)
}

/// Recursively collect asset paths from a PropertyValueEnum
fn collect_paths_from_value(value: &PropertyValueEnum, paths: &mut Vec<String>) {
    match value {
        PropertyValueEnum::String(s) => {
            if is_asset_path(&s.0) {
                paths.push(normalize_path(&s.0));
            }
        }
        PropertyValueEnum::Container(c) => {
            for item in &c.items {
                collect_paths_from_value(item, paths);
            }
        }
        PropertyValueEnum::UnorderedContainer(c) => {
            for item in &c.0.items {
                collect_paths_from_value(item, paths);
            }
        }
        PropertyValueEnum::Struct(s) => {
            for prop in s.properties.values() {
                collect_paths_from_value(&prop.value, paths);
            }
        }
        PropertyValueEnum::Embedded(e) => {
            for prop in e.0.properties.values() {
                collect_paths_from_value(&prop.value, paths);
            }
        }
        PropertyValueEnum::Optional(o) => {
            if let Some(inner) = &o.value {
                collect_paths_from_value(inner.as_ref(), paths);
            }
        }
        PropertyValueEnum::Map(m) => {
            for (key, val) in &m.entries {
                collect_paths_from_value(&key.0, paths);
                collect_paths_from_value(val, paths);
            }
        }
        _ => {}
    }
}

/// Check if a string is an asset path without allocating
fn is_asset_path(s: &str) -> bool {
    // Fast path: check minimum length first
    if s.len() < 5 {
        return false;
    }

    // Case-insensitive comparison without allocation
    (s.len() >= 7 && s[..7].eq_ignore_ascii_case("assets/")) ||
    (s.len() >= 5 && s[..5].eq_ignore_ascii_case("data/"))
}

/// Normalize path to lowercase with forward slashes
fn normalize_path(s: &str) -> String {
    s.to_lowercase().replace('\\', "/")
}

fn apply_prefix_to_path(path: &str, _prefix: &str, config: &RepathConfig) -> String {
    // Use the AST-based parser for structured path handling
    if let Some(asset_path) = AssetPath::parse(path, &config.champion) {
        asset_path.to_repathed(config)
    } else {
        // Fallback: not a valid asset path, return unchanged
        // This shouldn't happen in normal operation, but provides safety
        tracing::warn!("Invalid asset path (no assets/ or data/ prefix): {}", path);
        path.to_string()
    }
}

/// Remap skin ID in folder paths only (not filenames)
/// Examples:
///   - skin17/particles/blade.dds → skin42/particles/blade.dds
///   - skin17/renekton_skin17_base.skn → skin42/renekton_skin17_base.skn (filename unchanged!)
///   - animations/skin8.bin → animations/skin8.bin (animation BINs unchanged!)
fn remap_skin_ids(path: &str, target_skin_id: u32) -> String {
    // Fast path: if path doesn't start with "skin", skip regex entirely
    if !path.starts_with("skin") && !path.starts_with("Skin") {
        return path.to_string();
    }

    // Use static regex (compiled once at startup)
    SKIN_FOLDER_RE.replace(path, |caps: &regex::Captures| {
        format!("{}{}{}",
            &caps[1],           // "skin"
            target_skin_id,     // "42"
            &caps[3]            // "/"
        )
    }).into_owned()
}

/// Repath a single BIN file
fn repath_bin_file(bin_path: &Path, existing_paths: &HashSet<String>, prefix: &str, config: &RepathConfig) -> Result<usize> {
    let data = fs::read(bin_path).map_err(|e| Error::io_with_path(e, bin_path))?;
    let mut bin = read_bin(&data)
        .map_err(|e| Error::InvalidInput(format!("Failed to parse BIN: {}", e)))?;

    let mut modified_count = 0;

    for object in bin.objects.values_mut() {
        for prop in object.properties.values_mut() {
            modified_count += repath_value(&mut prop.value, existing_paths, prefix, config);
        }
    }

    if modified_count > 0 {
        let new_data = write_bin(&bin)
            .map_err(|e| Error::InvalidInput(format!("Failed to write BIN: {}", e)))?;

        fs::write(bin_path, new_data).map_err(|e| Error::io_with_path(e, bin_path))?;
        tracing::debug!("Repathed {} paths in {}", modified_count, bin_path.display());
    }

    Ok(modified_count)
}

/// Recursively repath string values in a PropertyValueEnum
fn repath_value(value: &mut PropertyValueEnum, existing_paths: &HashSet<String>, prefix: &str, config: &RepathConfig) -> usize {
    let mut count = 0;

    match value {
        PropertyValueEnum::String(s) => {
            if is_asset_path(&s.0) {
                let normalized = normalize_path(&s.0);
                if existing_paths.contains(&normalized) {
                    s.0 = apply_prefix_to_path(&s.0, prefix, config);
                    count += 1;
                }
            }
        }
        PropertyValueEnum::Container(c) => {
            for item in &mut c.items {
                count += repath_value(item, existing_paths, prefix, config);
            }
        }
        PropertyValueEnum::UnorderedContainer(c) => {
            for item in &mut c.0.items {
                count += repath_value(item, existing_paths, prefix, config);
            }
        }
        PropertyValueEnum::Struct(s) => {
            for prop in s.properties.values_mut() {
                count += repath_value(&mut prop.value, existing_paths, prefix, config);
            }
        }
        PropertyValueEnum::Embedded(e) => {
            for prop in e.0.properties.values_mut() {
                count += repath_value(&mut prop.value, existing_paths, prefix, config);
            }
        }
        PropertyValueEnum::Optional(o) => {
            if let Some(inner) = &mut o.value {
                count += repath_value(inner.as_mut(), existing_paths, prefix, config);
            }
        }
        PropertyValueEnum::Map(m) => {
            // Note: Map keys are immutable (wrapped in PropertyValueUnsafeEq)
            // Only values can be repathed
            for val in m.entries.values_mut() {
                count += repath_value(val, existing_paths, prefix, config);
            }
        }
        _ => {}
    }

    count
}

fn relocate_assets(content_base: &Path, existing_paths: &HashSet<String>, prefix: &str, config: &RepathConfig) -> Result<usize> {
    let mut relocated = 0;
    // Track destination paths to detect conflicts
    let mut destinations: HashMap<String, String> = HashMap::new();

    for path in existing_paths {
        // Skip BIN files EXCEPT concat.bin (which needs to move to match its repathed reference)
        if path.to_lowercase().ends_with(".bin") {
            // Allow concat.bin to be relocated
            if !path.to_lowercase().contains("__concat") {
                continue;
            }
        }

        let source = content_base.join(path);
        let new_path = apply_prefix_to_path(path, prefix, config);
        let dest = content_base.join(&new_path);

        // Skip if source doesn't exist
        if !source.exists() {
            continue;
        }

        // Detect conflicts: two source paths mapping to the same destination
        let dest_normalized = normalize_path(&new_path);
        if let Some(prev_source) = destinations.get(&dest_normalized) {
            tracing::warn!(
                "Conflict detected: '{}' and '{}' both map to '{}'",
                prev_source, path, dest_normalized
            );
            continue; // Skip conflicting files, first-writer wins
        }
        destinations.insert(dest_normalized, path.clone());

        // Create destination directory
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| Error::io_with_path(e, parent))?;
        }

        // Try rename first (fast, same-device), fallback to copy+remove (cross-device)
        match fs::rename(&source, &dest) {
            Ok(_) => {
                tracing::debug!("Renamed (fast): {} -> {}", source.display(), dest.display());
                relocated += 1;
            }
            Err(_) => {
                // Cross-device move, fallback to copy+remove
                fs::copy(&source, &dest).map_err(|e| Error::io_with_path(e, &source))?;
                fs::remove_file(&source).map_err(|e| Error::io_with_path(e, &source))?;
                tracing::debug!("Copied (cross-device): {} -> {}", source.display(), dest.display());
                relocated += 1;
            }
        }
    }

    Ok(relocated)
}

fn cleanup_unused_files(content_base: &Path, referenced_paths: &HashSet<String>, prefix: &str, config: &RepathConfig) -> Result<usize> {
    let mut removed = 0;

    let expected_paths: HashSet<String> = referenced_paths
        .iter()
        .map(|p| normalize_path(&apply_prefix_to_path(p, prefix, config)))
        .collect();

    for entry in WalkDir::new(content_base)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        // Skip BIN files (handled by cleanup_irrelevant_bins)
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            if ext.eq_ignore_ascii_case("bin") {
                continue;
            }
        }

        if let Ok(rel_path) = path.strip_prefix(content_base) {
            let normalized = normalize_path(&rel_path.to_string_lossy());

            // Also remove files NOT in the new ASSETS/{creator}/ tree
            // Files can be in:
            // - ASSETS/{creator}/{project}/ (target champion)
            // - ASSETS/{creator}/shared/ (shared assets)
            // - ASSETS/{creator}/shared-champion/ (other champions)
            let creator = config.creator_name.replace(' ', "-").to_lowercase();
            let in_new_tree = normalized.to_lowercase().starts_with(&format!(
                "assets/{}/",
                creator
            ));

            if !expected_paths.contains(&normalized) || !in_new_tree {
                if let Err(e) = fs::remove_file(path) {
                    tracing::warn!("Failed to remove {}: {}", path.display(), e);
                } else {
                    tracing::debug!("Removed unused file: {}", normalized);
                    removed += 1;
                }
            }
        }
    }

    Ok(removed)
}

/// Remove all extracted BINs except:
/// 1. Main skin BIN (skins/skin{ID}.bin)
/// 2. Animation BIN (animations/skin{ID}.bin) 
/// 3. Concat BIN (__Concat.bin)
/// 
/// This uses a whitelist approach - everything else is deleted.
fn cleanup_irrelevant_bins(content_base: &Path, champion: &str, target_skin_id: u32) -> Result<usize> {
    let mut removed = 0;
    let champion_lower = champion.to_lowercase();
    
    // Patterns for BINs we want to KEEP
    let target_skin_name = format!("skin{}.bin", target_skin_id);
    let target_skin_name_padded = format!("skin{:02}.bin", target_skin_id);

    tracing::info!(
        "Cleaning up BINs (keeping only: {}, {}, and __Concat.bin)",
        target_skin_name,
        target_skin_name_padded
    );

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
            let filename = path.file_name().unwrap_or_default().to_string_lossy().to_lowercase();

            // === WHITELIST: BINs we KEEP ===
            
            // 1. Keep the concatenated BIN
            if filename.contains("__concat") {
                tracing::debug!("Keeping concat BIN: {}", rel_str);
                continue;
            }

            // 2. Keep the main skin BIN in skins folder
            if rel_str.contains("/skins/") && 
               (filename == target_skin_name || filename == target_skin_name_padded) {
                tracing::debug!("Keeping main skin BIN: {}", rel_str);
                continue;
            }

            // 3. Keep the animation BIN for the target skin
            if rel_str.contains("/animations/") && 
               (filename == target_skin_name || filename == target_skin_name_padded) {
                tracing::debug!("Keeping animation BIN: {}", rel_str);
                continue;
            }

            // === EVERYTHING ELSE IS DELETED ===
            let reason = if rel_str.contains("/animations/") {
                "wrong animation"
            } else if rel_str.contains("/skins/") {
                "wrong skin"
            } else if filename == format!("{}.bin", champion_lower) {
                "champion root"
            } else if filename.contains("_skins_") || filename.contains("_skin") {
                "linked data"
            } else {
                "unreferenced"
            };

            if let Err(e) = fs::remove_file(path) {
                tracing::warn!("Failed to remove {} BIN {}: {}", reason, path.display(), e);
            } else {
                tracing::debug!("Removed {} BIN: {}", reason, rel_str);
                removed += 1;
            }
        }
    }
    
    if removed > 0 {
        tracing::info!("Cleaned up {} irrelevant BIN files", removed);
    }
    
    Ok(removed)
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

fn find_main_skin_bin(content_base: &Path, champion: &str, skin_id: u32) -> Option<PathBuf> {
    let champion_lower = champion.to_lowercase();
    
    let patterns = vec![
        format!("data/characters/{}/skins/skin{}.bin", champion_lower, skin_id),
        format!("data/characters/{}/skins/skin{:02}.bin", champion_lower, skin_id),
    ];
    
    for pattern in &patterns {
        let direct_path = content_base.join(pattern);
        if direct_path.exists() {
            return Some(direct_path);
        }
    }

    // Fallback: search for any matching BIN
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
            for pattern in &patterns {
                if rel_str == *pattern {
                    return Some(path.to_path_buf());
                }
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_asset_path() {
        assert!(is_asset_path("assets/characters/ahri/skin0.bin"));
        assert!(is_asset_path("data/effects.bin"));
        assert!(!is_asset_path("some/other/path.txt"));
    }

    #[test]
    fn test_remap_skin_ids() {
        // Test folder remapping only (not filenames)
        assert_eq!(
            remap_skin_ids("skin0/base.skn", 42),
            "skin42/base.skn"
        );

        // Test that filename stays unchanged
        assert_eq!(
            remap_skin_ids("skin17/renekton_skin17_base.skn", 42),
            "skin42/renekton_skin17_base.skn"
        );

        // Test that animation paths are NOT remapped (no folder prefix)
        assert_eq!(
            remap_skin_ids("animations/skin8.bin", 42),
            "animations/skin8.bin"
        );

        // Test nested paths
        assert_eq!(
            remap_skin_ids("skin0/particles/blade.dds", 42),
            "skin42/particles/blade.dds"
        );
    }

    #[test]
    fn test_apply_prefix_to_path_target_champion() {
        let config = RepathConfig {
            creator_name: "SirDexal".to_string(),
            project_name: "Renny".to_string(),
            champion: "Renekton".to_string(),
            target_skin_id: 42,
            cleanup_unused: true,
        };

        // Target champion: strip characters/, champion/, skins/ and remap folder
        // Input: assets/characters/renekton/skins/skin17/renekton_skin17_base.skn
        // Expected: ASSETS/SirDexal/Renny/skin42/renekton_skin17_base.skn
        assert_eq!(
            apply_prefix_to_path(
                "assets/characters/renekton/skins/skin17/renekton_skin17_base.skn",
                "SirDexal/Renny",
                &config
            ),
            "ASSETS/SirDexal/Renny/skin42/renekton_skin17_base.skn"
        );

        // Target champion particles
        assert_eq!(
            apply_prefix_to_path(
                "assets/characters/renekton/skins/skin17/particles/blade.dds",
                "SirDexal/Renny",
                &config
            ),
            "ASSETS/SirDexal/Renny/skin42/particles/blade.dds"
        );

        // Target champion animations (no skins/ folder)
        assert_eq!(
            apply_prefix_to_path(
                "data/characters/renekton/animations/skin8.bin",
                "SirDexal/Renny",
                &config
            ),
            "ASSETS/SirDexal/Renny/animations/skin8.bin"
        );
    }

    #[test]
    fn test_apply_prefix_to_path_other_champions() {
        let config = RepathConfig {
            creator_name: "SirDexal".to_string(),
            project_name: "Renny".to_string(),
            champion: "Renekton".to_string(),
            target_skin_id: 42,
            cleanup_unused: true,
        };

        // Other champion → shared-champion folder at CREATOR level (not project level)
        // Input: assets/characters/sona/skins/skin5/sona_skin5_base.skn
        // Expected: ASSETS/SirDexal/shared-champion/skin5/sona_skin5_base.skn
        assert_eq!(
            apply_prefix_to_path(
                "assets/characters/sona/skins/skin5/sona_skin5_base.skn",
                "SirDexal/Renny",
                &config
            ),
            "ASSETS/SirDexal/shared-champion/skin5/sona_skin5_base.skn"
        );

        // Other champion particles
        assert_eq!(
            apply_prefix_to_path(
                "assets/characters/ahri/skins/skin0/particles/orb.dds",
                "SirDexal/Renny",
                &config
            ),
            "ASSETS/SirDexal/shared-champion/skin0/particles/orb.dds"
        );
    }

    #[test]
    fn test_apply_prefix_to_path_shared_assets() {
        let config = RepathConfig {
            creator_name: "SirDexal".to_string(),
            project_name: "Renny".to_string(),
            champion: "Renekton".to_string(),
            target_skin_id: 42,
            cleanup_unused: true,
        };

        // Non-champion assets → shared folder at CREATOR level (not project level)
        assert_eq!(
            apply_prefix_to_path(
                "assets/particles/fire_vfx.dds",
                "SirDexal/Renny",
                &config
            ),
            "ASSETS/SirDexal/shared/particles/fire_vfx.dds"
        );

        // Maps and other global assets
        assert_eq!(
            apply_prefix_to_path(
                "data/maps/summoners_rift/textures/grass.dds",
                "SirDexal/Renny",
                &config
            ),
            "ASSETS/SirDexal/shared/maps/summoners_rift/textures/grass.dds"
        );

        // League's existing shared folder (no duplicate!)
        // Input: assets/shared/particles/fire.dds
        // Expected: ASSETS/SirDexal/shared/particles/fire.dds (NOT shared/shared/!)
        assert_eq!(
            apply_prefix_to_path(
                "assets/shared/particles/fire.dds",
                "SirDexal/Renny",
                &config
            ),
            "ASSETS/SirDexal/shared/particles/fire.dds"
        );
    }

    #[test]
    fn test_apply_prefix_to_path_sounds() {
        let config = RepathConfig {
            creator_name: "SirDexal".to_string(),
            project_name: "Cozy".to_string(),
            champion: "Kayn".to_string(),
            target_skin_id: 20,
            cleanup_unused: true,
        };

        // SFX files: Repath to audio/sfx/ with ONLY filename (strip all path components)
        // Input: assets/sounds/wwise2016/sfx/characters/kayn/skins/skin20/kayn_skin20_sfx_audio.bnk
        // Expected: ASSETS/SirDexal/Cozy/audio/sfx/kayn_skin20_sfx_audio.bnk
        assert_eq!(
            apply_prefix_to_path(
                "assets/sounds/wwise2016/sfx/characters/kayn/skins/skin20/kayn_skin20_sfx_audio.bnk",
                "SirDexal/Cozy",
                &config
            ),
            "ASSETS/SirDexal/Cozy/audio/sfx/kayn_skin20_sfx_audio.bnk"
        );

        // VO files: DO NOT REPATH - keep original path (they're in separate language WADs)
        // Input: assets/sounds/wwise2016/vo/en_us/characters/kayn/kayn_vo.wpk
        // Expected: assets/sounds/wwise2016/vo/en_us/characters/kayn/kayn_vo.wpk (UNCHANGED)
        assert_eq!(
            apply_prefix_to_path(
                "assets/sounds/wwise2016/vo/en_us/characters/kayn/kayn_vo.wpk",
                "SirDexal/Cozy",
                &config
            ),
            "assets/sounds/wwise2016/vo/en_us/characters/kayn/kayn_vo.wpk"
        );

        // Another SFX example with data/ prefix
        assert_eq!(
            apply_prefix_to_path(
                "data/sounds/wwise2016/sfx/characters/kayn/skins/skin20/kayn_skin20_impact.bnk",
                "SirDexal/Cozy",
                &config
            ),
            "ASSETS/SirDexal/Cozy/audio/sfx/kayn_skin20_impact.bnk"
        );

        // VO with different language - still untouched
        assert_eq!(
            apply_prefix_to_path(
                "assets/sounds/wwise2016/vo/ja_jp/characters/kayn/kayn_vo.wpk",
                "SirDexal/Cozy",
                &config
            ),
            "assets/sounds/wwise2016/vo/ja_jp/characters/kayn/kayn_vo.wpk"
        );

        // Case-insensitive VO detection - preserves original case
        assert_eq!(
            apply_prefix_to_path(
                "ASSETS/Sounds/wwise2016/VO/en_us/characters/kayn/kayn_vo.wpk",
                "SirDexal/Cozy",
                &config
            ),
            "ASSETS/Sounds/wwise2016/VO/en_us/characters/kayn/kayn_vo.wpk"
        );
    }

    #[test]
    fn test_apply_prefix_to_path_hud() {
        let config = RepathConfig {
            creator_name: "SirDexal".to_string(),
            project_name: "Renny".to_string(),
            champion: "Renekton".to_string(),
            target_skin_id: 42,
            cleanup_unused: true,
        };

        // HUD files go to creator level (not project level)
        // Input: assets/characters/renekton/hud/renekton_hud.dds
        // Expected: ASSETS/SirDexal/hud/renekton_hud.dds
        assert_eq!(
            apply_prefix_to_path(
                "assets/characters/renekton/hud/renekton_hud.dds",
                "SirDexal/Renny",
                &config
            ),
            "ASSETS/SirDexal/hud/renekton_hud.dds"
        );
    }

    #[test]
    fn test_asset_path_parse_sound_sfx() {
        let path = "assets/sounds/wwise2016/sfx/characters/kayn/skins/skin20/kayn_skin20_sfx.bnk";
        let parsed = AssetPath::parse(path, "Kayn");

        assert!(parsed.is_some());
        match parsed.unwrap() {
            AssetPath::SoundSfx { filename } => {
                assert_eq!(filename, "kayn_skin20_sfx.bnk");
            }
            _ => panic!("Expected SoundSfx variant"),
        }
    }

    #[test]
    fn test_asset_path_parse_sound_vo() {
        let path = "assets/sounds/wwise2016/vo/en_us/characters/kayn/kayn_vo.wpk";
        let parsed = AssetPath::parse(path, "Kayn");

        assert!(parsed.is_some());
        match parsed.unwrap() {
            AssetPath::SoundVo { original_path } => {
                assert_eq!(original_path, path);
            }
            _ => panic!("Expected SoundVo variant"),
        }
    }

    #[test]
    fn test_asset_path_parse_champion_hud() {
        let path = "assets/characters/renekton/hud/renekton_hud.dds";
        let parsed = AssetPath::parse(path, "Renekton");

        assert!(parsed.is_some());
        match parsed.unwrap() {
            AssetPath::ChampionHud { filename } => {
                assert_eq!(filename, "renekton_hud.dds");
            }
            _ => panic!("Expected ChampionHud variant"),
        }
    }

    #[test]
    fn test_asset_path_parse_target_champion_skin() {
        let path = "assets/characters/kayn/skins/skin20/particles/blade.dds";
        let parsed = AssetPath::parse(path, "Kayn");

        assert!(parsed.is_some());
        match parsed.unwrap() {
            AssetPath::TargetChampionSkin { skin_id, subpath } => {
                assert_eq!(skin_id, Some(20));
                assert_eq!(subpath, "skins/skin20/particles/blade.dds");
            }
            _ => panic!("Expected TargetChampionSkin variant"),
        }
    }

    #[test]
    fn test_asset_path_parse_other_champion() {
        let path = "assets/characters/sona/skins/skin5/particles/orb.dds";
        let parsed = AssetPath::parse(path, "Kayn"); // Kayn is target, Sona is other

        assert!(parsed.is_some());
        match parsed.unwrap() {
            AssetPath::OtherChampion { subpath } => {
                assert_eq!(subpath, "skins/skin5/particles/orb.dds");
            }
            _ => panic!("Expected OtherChampion variant"),
        }
    }

    #[test]
    fn test_asset_path_parse_shared() {
        let path = "assets/particles/fire.dds";
        let parsed = AssetPath::parse(path, "Kayn");

        assert!(parsed.is_some());
        match parsed.unwrap() {
            AssetPath::Shared { subpath } => {
                assert_eq!(subpath, "particles/fire.dds");
            }
            _ => panic!("Expected Shared variant"),
        }
    }

    #[test]
    fn test_asset_path_parse_shared_with_prefix() {
        // Should strip "shared/" prefix to avoid duplication
        let path = "assets/shared/particles/fire.dds";
        let parsed = AssetPath::parse(path, "Kayn");

        assert!(parsed.is_some());
        match parsed.unwrap() {
            AssetPath::Shared { subpath } => {
                assert_eq!(subpath, "particles/fire.dds"); // "shared/" stripped
            }
            _ => panic!("Expected Shared variant"),
        }
    }

    #[test]
    fn test_asset_path_parse_case_insensitive() {
        // Test case-insensitive parsing
        let path = "ASSETS/SOUNDS/wwise2016/VO/en_us/kayn_vo.wpk";
        let parsed = AssetPath::parse(path, "Kayn");

        assert!(parsed.is_some());
        match parsed.unwrap() {
            AssetPath::SoundVo { original_path } => {
                assert_eq!(original_path, path);
            }
            _ => panic!("Expected SoundVo variant"),
        }
    }

    #[test]
    fn test_asset_path_to_repathed_sfx() {
        let config = RepathConfig {
            creator_name: "TestCreator".to_string(),
            project_name: "TestProject".to_string(),
            champion: "Kayn".to_string(),
            target_skin_id: 20,
            cleanup_unused: true,
        };

        let asset_path = AssetPath::SoundSfx {
            filename: "kayn_skin20_sfx.bnk",
        };

        assert_eq!(
            asset_path.to_repathed(&config),
            "ASSETS/TestCreator/TestProject/audio/sfx/kayn_skin20_sfx.bnk"
        );
    }

    #[test]
    fn test_asset_path_to_repathed_vo() {
        let config = RepathConfig {
            creator_name: "TestCreator".to_string(),
            project_name: "TestProject".to_string(),
            champion: "Kayn".to_string(),
            target_skin_id: 20,
            cleanup_unused: true,
        };

        let original = "assets/sounds/wwise2016/vo/en_us/kayn_vo.wpk";
        let asset_path = AssetPath::SoundVo {
            original_path: original,
        };

        // VO paths should remain unchanged
        assert_eq!(asset_path.to_repathed(&config), original);
    }

    #[test]
    fn test_asset_path_invalid() {
        // Paths without "assets/" or "data/" prefix should return None
        let path = "sounds/wwise2016/sfx/test.bnk";
        let parsed = AssetPath::parse(path, "Kayn");
        assert!(parsed.is_none());
    }
}
