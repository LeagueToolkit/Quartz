//! Animation BIN parsing and ANM file loading
//! Discovers animation BINs from skin dependencies and loads ANM files.

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::BufReader;
use std::path::{Path, PathBuf};

use crate::core::bin::ltk_bridge;
use ltk_anim::{AnimationAsset, Animation};
use ltk_meta::PropertyValueEnum;
use serde::Serialize;

/// Information about a single animation clip
#[derive(Debug, Clone, Serialize)]
pub struct AnimationClipInfo {
    /// Name/ID of the clip (from hash or derived from path)
    pub name: String,
    /// Track data name (e.g., "Default")
    pub track_name: Option<String>,
    /// Full path to the .anm file
    pub animation_path: String,
}

/// List of animations extracted from animation BIN file
#[derive(Debug, Clone, Serialize)]
pub struct AnimationList {
    /// All animation clips found
    pub clips: Vec<AnimationClipInfo>,
}

/// Parsed animation data from an ANM file
#[derive(Debug, Serialize)]
pub struct AnimationData {
    pub duration: f32,
    pub fps: f32,
    pub joint_count: usize,
    pub joint_hashes: Vec<u32>,
}

/// Transform data for a single joint at a specific time
#[derive(Debug, Clone, Serialize)]
pub struct JointTransform {
    /// Rotation quaternion (x, y, z, w)
    pub rotation: [f32; 4],
    /// Translation vector
    pub translation: [f32; 3],
    /// Scale vector
    pub scale: [f32; 3],
}

/// Animation pose containing all joint transforms at a specific time
#[derive(Debug, Serialize)]
pub struct AnimationPose {
    /// Time in seconds
    pub time: f32,
    /// Joint hash → transform mapping
    pub joints: HashMap<u32, JointTransform>,
}

/// Extract animation BIN path from skin BIN's dependencies list.
/// Animation BINs are Type 2 (contain "/animations/" in path).
pub fn extract_animation_graph_path(skin_bin_path: &Path) -> Option<PathBuf> {
    tracing::debug!("Extracting animation BIN from dependencies: {}", skin_bin_path.display());
    
    // Read and parse the skin BIN file
    let data = fs::read(skin_bin_path).ok()?;
    let tree = ltk_bridge::read_bin(&data).ok()?;
    
    // Look through dependencies for animation BIN (Type 2)
    // Animation BINs have "/animations/" in their path
    tracing::debug!("Skin BIN has {} dependencies", tree.dependencies.len());
    
    for dep_path in &tree.dependencies {
        let normalized = dep_path.to_lowercase().replace('\\', "/");
        tracing::debug!("  Checking dependency: {}", dep_path);
        
        // Type 2: Animation BINs - in the animations folder
        if normalized.contains("/animations/") && normalized.ends_with(".bin") {
            tracing::info!("Found animation BIN in dependencies: {}", dep_path);
            return resolve_animation_bin_from_reference(skin_bin_path, dep_path);
        }
    }
    
    tracing::debug!("No animation BIN found in skin BIN dependencies");
    None
}

/// Resolve an animation BIN reference path to an actual file path
/// 
/// Simple approach: skin BIN is at skins/skinX.bin, animation BIN is at animations/skinX.bin
/// Just go up one folder and look in animations/
fn resolve_animation_bin_from_reference(skin_bin_path: &Path, reference_path: &str) -> Option<PathBuf> {
    tracing::debug!("Resolving animation reference: {} from {}", reference_path, skin_bin_path.display());
    
    // Extract just the filename (e.g., "Skin20.bin")
    let filename = Path::new(reference_path).file_name()?.to_string_lossy().to_string();
    
    // skin_bin_path is like: .../data/characters/kayn/skins/skin20.bin
    // We want:               .../data/characters/kayn/animations/skin20.bin
    
    // Go up from skin BIN (skin20.bin -> skins -> kayn)
    let skins_folder = skin_bin_path.parent()?;  // .../skins
    let champion_folder = skins_folder.parent()?;  // .../kayn
    
    // Look for animations folder as sibling to skins
    let animations_folder = champion_folder.join("animations");
    let anim_bin_path = animations_folder.join(&filename);
    
    tracing::debug!("Looking for animation BIN at: {}", anim_bin_path.display());
    
    if anim_bin_path.exists() {
        tracing::info!("Found animation BIN: {}", anim_bin_path.display());
        return Some(anim_bin_path);
    }
    
    // Try lowercase filename
    let filename_lower = filename.to_lowercase();
    let anim_bin_path_lower = animations_folder.join(&filename_lower);
    if anim_bin_path_lower.exists() {
        tracing::info!("Found animation BIN (lowercase): {}", anim_bin_path_lower.display());
        return Some(anim_bin_path_lower);
    }
    
    tracing::debug!("Animation BIN not found at expected location");
    None
}

/// Find animation BIN for a skin.
/// First checks skin BIN dependencies, then falls back to directory search.
pub fn find_animation_bin(skn_path: &Path) -> Option<PathBuf> {
    tracing::debug!("Looking for animation BIN relative to: {}", skn_path.display());
    
    // NEW: Strategy 0 - Check skin BIN for animation graph reference
    // Import find_skin_bin from texture module
    if let Some(skin_bin_path) = crate::core::mesh::texture::find_skin_bin(skn_path) {
        tracing::debug!("Found skin BIN, checking for animation graph reference: {}", skin_bin_path.display());
        if let Some(anim_bin) = extract_animation_graph_path(&skin_bin_path) {
            tracing::info!("Found animation BIN via skin BIN reference: {}", anim_bin.display());
            return Some(anim_bin);
        }
    }
    
    // Strategy 1: animation folder in same directory as SKN
    if let Some(skin_dir) = skn_path.parent() {
        let anim_dir = skin_dir.join("animation");
        tracing::debug!("Checking for animation dir at: {}", anim_dir.display());
        if anim_dir.exists() {
            for i in 0..20 {
                let bin_path = anim_dir.join(format!("skin{}.bin", i));
                if bin_path.exists() {
                    tracing::debug!("Found animation BIN: {}", bin_path.display());
                    return Some(bin_path);
                }
            }
            tracing::debug!("Animation dir exists but no skinX.bin found");
        }
        
        // Strategy 2: Parent directory
        if let Some(parent) = skin_dir.parent() {
            let anim_dir = parent.join("animation");
            tracing::debug!("Checking parent for animation dir at: {}", anim_dir.display());
            if anim_dir.exists() {
                for i in 0..20 {
                    let bin_path = anim_dir.join(format!("skin{}.bin", i));
                    if bin_path.exists() {
                        tracing::debug!("Found animation BIN in parent: {}", bin_path.display());
                        return Some(bin_path);
                    }
                }
            }
        }
    }
    
    // Strategy 3: Look for data/characters/{champion}/animations/ structure
    let path_str = skn_path.to_string_lossy().to_lowercase();
    if path_str.contains("characters") {
        // Extract champion name from path
        if let Some(char_idx) = path_str.find("characters") {
            let after_char = &path_str[char_idx + "characters/".len()..];
            if let Some(slash_idx) = after_char.find(&['/', '\\'][..]) {
                let champion = &after_char[..slash_idx];
                
                // Search up for content/wad folder
                let mut current = skn_path.parent();
                while let Some(dir) = current {
                    let dir_name = dir.file_name().map(|n| n.to_string_lossy().to_lowercase());
                    
                    if dir_name.as_ref().map(|n| n.contains("content") || n.contains("wad")).unwrap_or(false) {
                        // Look for data/characters/{champion}/animations/skin0.bin
                        let data_path = dir
                            .join("data")
                            .join("characters")
                            .join(champion)
                            .join("animations")
                            .join("skin0.bin");
                        
                        tracing::debug!("Checking data animations path: {}", data_path.display());
                        if data_path.exists() {
                            tracing::debug!("Found animation BIN in data folder!");
                            return Some(data_path);
                        }
                        break;
                    }
                    current = dir.parent();
                }
            }
        }
    }
    
    // Strategy 4: Search up for data/ folder
    let mut current = skn_path.parent();
    while let Some(dir) = current {
        let data_path = dir.join("data");
        if data_path.exists() {
            // Search for any animations/skin0.bin in data/characters/*/
            if let Ok(entries) = std::fs::read_dir(data_path.join("characters")) {
                for entry in entries.flatten() {
                    let anim_path = entry.path().join("animations").join("skin0.bin");
                    if anim_path.exists() {
                        tracing::debug!("Found animation BIN via data search: {}", anim_path.display());
                        return Some(anim_path);
                    }
                }
            }
            break; // Don't search further up once we found a data/ folder
        }
        current = dir.parent();
    }
    
    tracing::debug!("Animation BIN not found");
    None
}

/// Extract animation list from animation BIN file
/// 
/// Parses the BIN looking for AtomicClipData objects with mAnimationFilePath
pub fn extract_animation_list(bin_path: &Path) -> anyhow::Result<AnimationList> {
    let data = fs::read(bin_path)?;
    let tree = ltk_bridge::read_bin(&data)
        .map_err(|e| anyhow::anyhow!("Failed to parse animation BIN: {}", e))?;
    
    let mut clips = Vec::new();
    
    // Iterate through all objects to find AtomicClipData
    for (_path_hash, object) in &tree.objects {
        // Look through properties for embedded AnimationResourceData
        for (_name_hash, prop) in &object.properties {
            extract_animation_paths_from_value(&prop.value, &mut clips);
        }
    }
    
    Ok(AnimationList { clips })
}

/// Recursively extract animation paths from property values
fn extract_animation_paths_from_value(value: &PropertyValueEnum, clips: &mut Vec<AnimationClipInfo>) {
    match value {
        PropertyValueEnum::String(string_val) => {
            let s = &string_val.0;
            // Check if this is an animation path
            if s.to_lowercase().ends_with(".anm") {
                // Extract name from path
                let name = Path::new(s)
                    .file_stem()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "Unknown".to_string());
                
                clips.push(AnimationClipInfo {
                    name,
                    track_name: None,
                    animation_path: s.clone(),
                });
            }
        }
        
        PropertyValueEnum::Embedded(embedded) => {
            for (_hash, prop) in &embedded.0.properties {
                extract_animation_paths_from_value(&prop.value, clips);
            }
        }
        
        PropertyValueEnum::Container(container) => {
            for item in &container.items {
                extract_animation_paths_from_value(item, clips);
            }
        }
        
        PropertyValueEnum::Struct(struct_val) => {
            for (_hash, prop) in &struct_val.properties {
                extract_animation_paths_from_value(&prop.value, clips);
            }
        }
        
        PropertyValueEnum::Optional(opt) => {
            if let Some(inner) = &opt.value {
                extract_animation_paths_from_value(inner, clips);
            }
        }
        
        PropertyValueEnum::Map(map) => {
            for (_key, val) in &map.entries {
                extract_animation_paths_from_value(val, clips);
            }
        }
        
        _ => {}
    }
}

/// Parse an ANM file and extract animation data
/// 
/// Uses the Animation trait from ltk_anim 0.3.0 to get real duration/fps values.
pub fn parse_animation_file<P: AsRef<Path>>(path: P) -> anyhow::Result<AnimationData> {
    let file = File::open(path.as_ref())?;
    let mut reader = BufReader::new(file);
    
    let asset = AnimationAsset::from_reader(&mut reader)
        .map_err(|e| anyhow::anyhow!("Failed to parse ANM file: {:?}", e))?;
    
    // Use Animation trait methods to get actual values
    Ok(AnimationData {
        duration: asset.duration(),
        fps: asset.fps(),
        joint_count: asset.joint_count(),
        joint_hashes: asset.joints().to_vec(),
    })
}

/// Evaluate animation at a specific time and return joint poses
/// 
/// Returns a map of joint hash → (rotation, translation, scale) for all joints.
pub fn evaluate_animation_at<P: AsRef<Path>>(path: P, time: f32) -> anyhow::Result<AnimationPose> {
    let file = File::open(path.as_ref())?;
    let mut reader = BufReader::new(file);
    
    let asset = AnimationAsset::from_reader(&mut reader)
        .map_err(|e| anyhow::anyhow!("Failed to parse ANM file: {:?}", e))?;
    
    // Evaluate at the given time - uses Animation trait's evaluate method
    let pose = asset.evaluate(time);
    
    // Convert to our serializable format with mirrorX transformation
    let joints = pose.into_iter()
        .map(|(hash, (rot, trans, scale))| {
            (hash, JointTransform {
                rotation: [rot.x, -rot.y, -rot.z, rot.w],
                translation: [-trans.x, trans.y, trans.z],
                scale: [scale.x, scale.y, scale.z],
            })
        })
        .collect();
    
    Ok(AnimationPose { time, joints })
}

/// Resolve animation path relative to project directory
/// 
/// Animation paths from BIN are like: ASSETS/SirDexal/.../Animations/name.anm
/// Need to find the wad.client folder and resolve relative to it
pub fn resolve_animation_path(base_dir: &Path, anim_path: &str) -> Option<PathBuf> {
    tracing::debug!("Resolving animation path: {} from base {}", anim_path, base_dir.display());
    
    // The path from BIN starts with ASSETS/ - convert to lowercase assets/
    let normalized_path = anim_path
        .replace("ASSETS/", "assets/")
        .replace("ASSETS\\", "assets/")
        .replace('\\', "/");
    
    // Search up from base_dir to find a folder that contains "assets" subfolder
    let mut current = Some(base_dir);
    while let Some(dir) = current {
        // Check if this dir has an "assets" folder
        let assets_path = dir.join("assets");
        if assets_path.exists() {
            // Found it! Now try to resolve the path
            // The normalized_path is like "assets/SirDexal/..."
            let candidate = dir.join(&normalized_path);
            tracing::debug!("Checking candidate path: {}", candidate.display());
            if candidate.exists() {
                tracing::debug!("Found animation at: {}", candidate.display());
                return Some(candidate);
            }
            
            // Also try without the assets/ prefix since we already joined with assets folder
            let without_prefix = normalized_path.strip_prefix("assets/").unwrap_or(&normalized_path);
            let candidate2 = assets_path.join(without_prefix);
            tracing::debug!("Checking alternate path: {}", candidate2.display());
            if candidate2.exists() {
                tracing::debug!("Found animation at: {}", candidate2.display());
                return Some(candidate2);
            }
        }
        
        // Check if we're at a .wad folder (common project root)
        if let Some(name) = dir.file_name() {
            let name_str = name.to_string_lossy().to_lowercase();
            if name_str.contains(".wad") || name_str.contains("wad.client") {
                // This is the wad folder, assets should be directly under it
                let candidate = dir.join(&normalized_path);
                if candidate.exists() {
                    return Some(candidate);
                }
            }
        }
        
        current = dir.parent();
    }
    
    // Strategy 2: Try the full path as-is
    let full_path = PathBuf::from(anim_path);
    if full_path.exists() {
        return Some(full_path);
    }
    
    tracing::debug!("Animation file not found: {}", anim_path);
    None
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_find_animation_bin() {
        // Test would require actual files
    }
}
