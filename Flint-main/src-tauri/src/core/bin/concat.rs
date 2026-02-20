//! Linked BIN concatenation module
//!
//! This module implements the linked BIN system that:
//! 1. Classifies BINs into three categories (ChampionRoot, Animation, LinkedData)
//! 2. Concatenates all LinkedData BINs into a single concat BIN
//! 3. Updates the main BIN's linked list to reference the new concat BIN
//!
//! This prevents conflicts when multiple linked BINs reference the same assets.

use crate::core::bin::ltk_bridge::{read_bin, write_bin};
use crate::error::{Error, Result};
use ltk_meta::{BinTree, BinTreeBuilder, BinTreeObject};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// Category of a BIN file based on its path pattern
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BinCategory {
    /// Type 1: Champion root BIN (DATA/Characters/{Champion}/{Champion}.bin)
    /// Never modify - contains core champion data
    ChampionRoot,

    /// Type 2: Animation BINs (DATA/Characters/{Champion}/Animations/*.bin)
    /// Never modify - contains animation data
    Animation,

    /// Type 3: Linked data BINs (everything else)
    /// Concatenate these into a single BIN
    LinkedData,

    /// Filtered: Ignore these files
    /// Corrupted, recursive, or explicitly ignored files
    Ignore,
}

/// Result of a concatenation operation
#[derive(Debug, Clone)]
pub struct ConcatResult {
    /// The path where the concat BIN was saved (relative DATA path)
    pub concat_path: String,
    /// Number of source BINs that were concatenated
    pub source_count: usize,
    /// Total number of entries in the concat BIN
    #[allow(dead_code)] // Kept for diagnostic purposes
    pub entry_count: usize,
    /// Number of hash collisions encountered (last-write-wins)
    #[allow(dead_code)] // Kept for diagnostic purposes
    pub collision_count: usize,
    /// Paths of source BINs that were concatenated (for deletion)
    pub source_paths: Vec<String>,
}

/// Classify a BIN file path into its category
pub fn classify_bin(path: &str) -> BinCategory {
    let normalized = path.replace('\\', "/");
    let lower = normalized.to_lowercase();

    // Extract just the filename for pattern matching
    let filename = lower.split('/').next_back().unwrap_or("");

    // Type 1: Champion Root BIN - detect by path pattern
    // e.g., data/characters/kayn/kayn.bin
    if lower.starts_with("data/characters/") && !lower.contains("/animations/") {
        let parts: Vec<&str> = normalized.split('/').collect();
        if parts.len() == 4 && parts[3].to_lowercase().ends_with(".bin") {
            let champion_folder = parts[2].to_lowercase();
            let bin_filename = parts[3].to_lowercase();
            if bin_filename == format!("{}.bin", champion_folder) {
                return BinCategory::ChampionRoot;
            }
        }
    }

    // Also detect "root.bin" anywhere as ChampionRoot (should be removed)
    if filename == "root.bin" {
        return BinCategory::ChampionRoot;
    }

    // Type 2: Animation BINs - in the animations folder
    // e.g., data/characters/kayn/animations/skin2.bin
    if lower.starts_with("data/characters/") && lower.contains("/animations/") {
        return BinCategory::Animation;
    }

    // Type 3: Everything else is LinkedData
    // This includes all the skin data BINs like:
    // - data/kayn_skins_skin0_skins_skin1_....bin (combined skin data)
    // - data/characters/kayn/skins/skin2.bin (main skin BIN)
    // We don't judge by filename - only by whether the file can be parsed
    BinCategory::LinkedData
}

/// Get the linked paths from a BinTree (uses dependencies field)
pub fn get_linked_paths(bin: &BinTree) -> Vec<String> {
    bin.dependencies.clone()
}

/// Set the linked paths in a BinTree
pub fn set_linked_paths(bin: &mut BinTree, paths: Vec<String>) {
    bin.dependencies = paths;
}

/// Create a concatenated BIN from all Type 3 (LinkedData) BINs
pub fn create_concat_bin(
    main_bin: &BinTree,
    project_name: &str,
    creator_name: &str,
    _champion: &str,  // No longer used in path generation but kept for API compatibility
    content_base: &Path,
    path_mappings: &HashMap<String, String>,
) -> Result<ConcatResult> {
    // 1. Get linked paths from main BIN
    let linked_paths = get_linked_paths(main_bin);

    // 2. Filter to only Type 3 (LinkedData) BINs
    let type3_paths: Vec<String> = linked_paths
        .iter()
        .filter(|path| {
            let cat = classify_bin(path);
            if cat == BinCategory::Ignore {
                tracing::warn!("Ignoring suspicious linked BIN: {}", path);
            }
            cat == BinCategory::LinkedData
        })
        .cloned()
        .collect();

    tracing::info!(
        "Found {} Type 3 (LinkedData) BINs to concatenate",
        type3_paths.len()
    );

    if type3_paths.is_empty() {
        return Err(Error::InvalidInput(
            "No Type 3 (LinkedData) BINs found in linked list".to_string(),
        ));
    }

    // 3. Create new concat BIN - objects will be merged, dependencies empty
    let mut all_objects: HashMap<u32, BinTreeObject> = HashMap::new();
    let mut collision_count = 0;
    let mut source_count = 0;
    let mut processed_paths: Vec<String> = Vec::new();

    for bin_path in &type3_paths {
        let normalized_path = bin_path.to_lowercase().replace('\\', "/");
        
        let actual_path = path_mappings.get(&normalized_path)
            .cloned()
            .unwrap_or_else(|| normalized_path.clone());
        
        let full_path = content_base.join(&actual_path);

        if !full_path.exists() {
            tracing::warn!("Type 3 BIN not found, skipping: {} (tried: {})", normalized_path, actual_path);
            continue;
        }

        // Load the source BIN using ltk_meta
        let data = fs::read(&full_path).map_err(|e| Error::io_with_path(e, &full_path))?;

        let magic = if data.len() >= 4 {
            String::from_utf8_lossy(&data[0..4]).to_string()
        } else {
            "SHORT".to_string()
        };

        tracing::debug!(
            "Processing Type 3 BIN: {} (actual: {}, size: {} bytes, magic: {})",
            bin_path, actual_path, data.len(), magic
        );

        // catch_unwind requires 'UnwindSafe'. references are usually fine.
        let source_bin_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            read_bin(&data)
        }));

        let source_bin = match source_bin_result {
            Ok(Ok(bin)) => bin,
            Ok(Err(e)) => {
                tracing::warn!("Failed to parse BIN {}: {}", actual_path, e);
                continue;
            }
            Err(_) => {
                tracing::error!("CRASH PREVENTED: Parser panicked/crashed on BIN {}. Skipping.", actual_path);
                continue;
            }
        };

        // Validate that source is indeed a linked BIN (should have empty dependencies)
        if !source_bin.dependencies.is_empty() {
            tracing::warn!(
                "Type 3 BIN has non-empty dependencies ({}), may cause issues: {}",
                source_bin.dependencies.len(),
                bin_path
            );
        }

        // Merge objects from source into all_objects
        for (path_hash, object) in source_bin.objects {
            if all_objects.contains_key(&path_hash) {
                collision_count += 1;
                tracing::debug!("Hash collision for 0x{:08x} in {}, last-write-wins", path_hash, bin_path);
            }
            all_objects.insert(path_hash, object);
        }

        source_count += 1;
        processed_paths.push(actual_path.clone());
    }

    // 4. Create the concat BinTree using BinTreeBuilder for cleaner construction
    let concat_bin = BinTreeBuilder::new()
        .objects(all_objects.into_values())
        .build();
    let object_count = concat_bin.objects.len();

    // 5. Generate concat path (sanitize names: replace spaces with dashes)
    // New naming: data/{creator}_{project}__Concat.bin
    // Champion is no longer in the folder hierarchy, so omit from filename for consistency
    let creator_sanitized = creator_name.replace(' ', "-");
    let project_sanitized = project_name.replace(' ', "-");
    let concat_path = format!(
        "data/{}_{}__Concat.bin",
        creator_sanitized, project_sanitized
    );

    // 6. Save the concat BIN immediately
    let concat_full_path = content_base.join(&concat_path);
    if let Some(parent) = concat_full_path.parent() {
        fs::create_dir_all(parent).map_err(|e| Error::io_with_path(e, parent))?;
    }

    let concat_data = write_bin(&concat_bin)
        .map_err(|e| Error::InvalidInput(format!("Failed to write concat BIN: {}", e)))?;

    fs::write(&concat_full_path, &concat_data)
        .map_err(|e| Error::io_with_path(e, &concat_full_path))?;

    // Verify the written BIN can be read back
    if let Err(e) = read_bin(&concat_data) {
        // Try to cleanup the bad file
        let _ = fs::remove_file(&concat_full_path);
        return Err(Error::InvalidInput(format!(
            "Generated concat BIN is corrupt and cannot be read back: {}", 
            e
        )));
    }

    tracing::info!(
        "Created concat BIN with {} objects from {} sources ({} collisions)",
        object_count,
        source_count,
        collision_count
    );

    Ok(ConcatResult {
        concat_path,
        source_count,
        entry_count: object_count,
        collision_count,
        source_paths: processed_paths,
    })
}

/// Update the main BIN's linked list to use the concat BIN
pub fn update_main_bin_links(main_bin: &mut BinTree, concat_path: String) -> Result<()> {
    let current_links = get_linked_paths(main_bin);

    // Find Type 1 (ChampionRoot)
    let type1_path = current_links
        .iter()
        .find(|path| classify_bin(path) == BinCategory::ChampionRoot)
        .cloned();

    // Find Type 2 (Animation)
    let type2_path = current_links
        .iter()
        .find(|path| classify_bin(path) == BinCategory::Animation)
        .cloned();

    // Build new linked list: concat first, then type1, then type2
    let mut new_links = vec![concat_path];

    if let Some(path) = type1_path {
        new_links.push(path);
    }

    if let Some(path) = type2_path {
        new_links.push(path);
    }

    tracing::debug!("Updated main BIN linked list: {:?}", new_links);

    set_linked_paths(main_bin, new_links);

    Ok(())
}

/// Complete linked BIN concatenation workflow
pub fn concatenate_linked_bins(
    main_bin_path: &Path,
    project_name: &str,
    creator_name: &str,
    champion: &str,
    content_base: &Path,
    path_mappings: &HashMap<String, String>,
) -> Result<ConcatResult> {
    tracing::info!(
        "Starting linked BIN concatenation for: {}",
        main_bin_path.display()
    );

    // 1. Load main BIN
    let data = fs::read(main_bin_path).map_err(|e| Error::io_with_path(e, main_bin_path))?;

    let main_bin = read_bin(&data)
        .map_err(|e| Error::InvalidInput(format!("Failed to parse main BIN: {}", e)))?;

    tracing::debug!("Original dependencies:");
    for (i, path) in main_bin.dependencies.iter().enumerate() {
        tracing::debug!("  [{}] {} - {:?}", i, path, classify_bin(path));
    }

    // 2. Create and save concat BIN (create_concat_bin now saves the file)
    let result = create_concat_bin(&main_bin, project_name, creator_name, champion, content_base, path_mappings)?;

    tracing::info!("Created concat BIN: {}", result.concat_path);

    // 4. Update main BIN's linked list
    {
        let main_bin_data = fs::read(main_bin_path).map_err(|e| Error::io_with_path(e, main_bin_path))?;
        
        let mut main_bin = read_bin(&main_bin_data)
            .map_err(|e| Error::InvalidInput(format!("Failed to parse main BIN: {}", e)))?;
        
        update_main_bin_links(&mut main_bin, result.concat_path.clone())?;
        
        let updated_data = write_bin(&main_bin)
            .map_err(|e| Error::InvalidInput(format!("Failed to write updated BIN: {}", e)))?;
        
        fs::write(main_bin_path, updated_data).map_err(|e| Error::io_with_path(e, main_bin_path))?;
        
        tracing::info!("Updated main BIN linked list: {}", main_bin_path.display());
    }

    // 5. Delete the original Type 3 BINs that were concatenated
    let mut deleted_count = 0;
    for source_path in &result.source_paths {
        let full_path = content_base.join(source_path);
        if full_path.exists() {
            match fs::remove_file(&full_path) {
                Ok(_) => {
                    tracing::debug!("Deleted source BIN: {}", source_path);
                    deleted_count += 1;
                }
                Err(e) => {
                    tracing::warn!("Failed to delete source BIN {}: {}", source_path, e);
                }
            }
        } else {
            tracing::debug!("Source BIN already gone: {}", source_path);
        }
    }
    tracing::info!("Deleted {} source BINs after concatenation", deleted_count);

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_bin_champion_root() {
        assert_eq!(
            classify_bin("DATA/Characters/Kayn/Kayn.bin"),
            BinCategory::ChampionRoot
        );
        assert_eq!(
            classify_bin("data/characters/kayn/kayn.bin"),
            BinCategory::ChampionRoot
        );
    }

    #[test]
    fn test_classify_bin_animation() {
        assert_eq!(
            classify_bin("DATA/Characters/Kayn/Animations/Skin8.bin"),
            BinCategory::Animation
        );
    }

    #[test]
    fn test_classify_bin_linked_data() {
        assert_eq!(
            classify_bin("DATA/Kayn_Skins_Skin0_Skins_Skin1.bin"),
            BinCategory::LinkedData
        );
    }
}
