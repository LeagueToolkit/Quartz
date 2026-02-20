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
use walkdir::WalkDir;
use rayon::prelude::*;
use dashmap::DashSet;
use regex::Regex;

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

fn is_asset_path(s: &str) -> bool {
    let lower = s.to_lowercase();
    lower.starts_with("assets/") || lower.starts_with("data/")
}

fn normalize_path(s: &str) -> String {
    s.to_lowercase().replace('\\', "/")
}

fn apply_prefix_to_path(path: &str, prefix: &str, config: &RepathConfig) -> String {
    let lower = path.to_lowercase();

    // Strip the original prefix (assets/ or data/)
    let stripped = if lower.starts_with("assets/") {
        &path[7..]  // Skip "assets/"
    } else if lower.starts_with("data/") {
        &path[5..]  // Skip "data/"
    } else {
        path
    };

    // Step 1: Replace champion folder with project folder
    // Path format: characters/{champion}/... → characters/{project}/...
    let champion_replaced = replace_champion_with_project(stripped, config);

    // Step 2: Remap skin IDs: Replace ALL skin references with target_skin_id
    let remapped = remap_skin_ids(&champion_replaced, config.target_skin_id);

    // Step 3: Add new prefix: ASSETS/{creator}/...
    format!("ASSETS/{}/{}", prefix, remapped)
}

/// Replace champion folder name with project name in paths
/// Example: characters/renekton/skins/... → characters/renny/skins/...
fn replace_champion_with_project(path: &str, config: &RepathConfig) -> String {
    let champion_lower = config.champion.to_lowercase();
    let parts: Vec<&str> = path.split('/').collect();

    // Look for pattern: characters/{champion}/...
    if parts.len() >= 2 && parts[0].to_lowercase() == "characters" {
        // Check if the second segment matches the champion name
        if parts[1].to_lowercase() == champion_lower {
            // Replace champion with project
            let mut new_parts = parts.clone();
            new_parts[1] = &config.project_name;
            return new_parts.join("/");
        }
    }

    // If no champion folder found, return as-is
    path.to_string()
}

/// Remap all skin ID references in a path to the target skin ID
/// Examples:
///   - characters/renekton/skins/skin0/... → characters/renekton/skins/skin42/...
///   - characters/renekton/skins/skin17/renekton_skin17_base.skn
///     → characters/renekton/skins/skin42/renekton_skin42_base.skn
///   - characters/kayn/animations/skin8.bin → characters/kayn/animations/skin42.bin
fn remap_skin_ids(path: &str, target_skin_id: u32) -> String {
    // Match skin folders: skins/skin0, skins/skin17, etc.
    let skin_folder_re = Regex::new(r"(skins/skin)(\d+)(/?)").unwrap();
    let mut result = skin_folder_re.replace_all(path, |caps: &regex::Captures| {
        format!("{}{}{}",
            &caps[1],                    // "skins/skin"
            target_skin_id,              // "42"
            &caps[3]                     // "/" or ""
        )
    }).to_string();

    // Match animation paths: animations/skin8.bin → animations/skin42.bin
    let animation_re = Regex::new(r"(animations/skin)(\d+)(\.bin)").unwrap();
    result = animation_re.replace_all(&result, |caps: &regex::Captures| {
        format!("{}{}{}",
            &caps[1],                    // "animations/skin"
            target_skin_id,              // "42"
            &caps[3]                     // ".bin"
        )
    }).to_string();

    // Match skin in filenames: renekton_skin17_base.skn → renekton_skin42_base.skn
    let skin_filename_re = Regex::new(r"_skin(\d+)([_\.])").unwrap();
    result = skin_filename_re.replace_all(&result, |caps: &regex::Captures| {
        format!("_skin{}{}",
            target_skin_id,              // "42"
            &caps[2]                     // "_" or "."
        )
    }).to_string();

    result
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

            // Also remove files NOT in the new ASSETS/{creator}/characters/{project}/ tree
            let in_new_tree = normalized.to_lowercase().starts_with(&format!(
                "assets/{}/characters/",
                prefix.to_lowercase()
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
        // Test folder remapping
        assert_eq!(
            remap_skin_ids("characters/renekton/skins/skin0/base.skn", 42),
            "characters/renekton/skins/skin42/base.skn"
        );

        // Test filename remapping
        assert_eq!(
            remap_skin_ids("characters/renekton/skins/skin17/renekton_skin17_base.skn", 42),
            "characters/renekton/skins/skin42/renekton_skin42_base.skn"
        );

        // Test animation remapping
        assert_eq!(
            remap_skin_ids("characters/kayn/animations/skin8.bin", 42),
            "characters/kayn/animations/skin42.bin"
        );

        // Test padded skin IDs
        assert_eq!(
            remap_skin_ids("characters/ahri/skins/skin00/ahri_skin00_tx_cm.dds", 5),
            "characters/ahri/skins/skin5/ahri_skin5_tx_cm.dds"
        );
    }

    #[test]
    fn test_replace_champion_with_project() {
        let config = RepathConfig {
            creator_name: "SirDexal".to_string(),
            project_name: "Renny".to_string(),
            champion: "Renekton".to_string(),
            target_skin_id: 42,
            cleanup_unused: true,
        };

        // Test champion replacement
        assert_eq!(
            replace_champion_with_project("characters/renekton/skins/skin17/base.skn", &config),
            "characters/Renny/skins/skin17/base.skn"
        );

        // Test case-insensitive matching
        assert_eq!(
            replace_champion_with_project("characters/Renekton/skins/skin0/base.skn", &config),
            "characters/Renny/skins/skin0/base.skn"
        );

        // Test non-champion path (should return unchanged)
        assert_eq!(
            replace_champion_with_project("textures/some_texture.dds", &config),
            "textures/some_texture.dds"
        );
    }

    #[test]
    fn test_apply_prefix_to_path_v2() {
        let config = RepathConfig {
            creator_name: "SirDexal".to_string(),
            project_name: "Renny".to_string(),
            champion: "Renekton".to_string(),
            target_skin_id: 42,
            cleanup_unused: true,
        };

        // Test new structure: ASSETS/{creator}/characters/{project}/...
        // Input: assets/characters/renekton/skins/skin17/renekton_skin17_base.skn
        // Expected: ASSETS/SirDexal/Renny/characters/Renny/skins/skin42/renekton_skin42_base.skn
        assert_eq!(
            apply_prefix_to_path(
                "assets/characters/renekton/skins/skin17/renekton_skin17_base.skn",
                "SirDexal/Renny",
                &config
            ),
            "ASSETS/SirDexal/Renny/characters/Renny/skins/skin42/renekton_skin42_base.skn"
        );

        // Test with data/ prefix
        assert_eq!(
            apply_prefix_to_path(
                "data/characters/renekton/skins/skin0.bin",
                "SirDexal/Renny",
                &config
            ),
            "ASSETS/SirDexal/Renny/characters/Renny/skins/skin42.bin"
        );
    }
}
