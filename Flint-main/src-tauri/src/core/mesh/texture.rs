//! Texture resolution from BIN files
//! 
//! Parses skin0.bin to extract texture mappings for SKN materials.
//! Supports SkinMeshDataProperties with texture and materialOverride fields.

// Imports from original file
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use crate::core::bin::ltk_bridge;
use serde::Serialize;
use regex::Regex;

/// Extended material properties including UV transformations
#[derive(Debug, Clone, Serialize, Default)]
pub struct MaterialProperties {
    /// Diffuse texture path
    pub texture_path: String,
    
    /// UV scale (tiling) - [scaleU, scaleV]
    /// From paramValue "UVScaleAndOffset" vec4[0,1]
    pub uv_scale: Option<[f32; 2]>,
    
    /// UV offset (shift) - [offsetU, offsetV]  
    /// From paramValue "UVScaleAndOffset" vec4[2,3]
    pub uv_offset: Option<[f32; 2]>,
    
    /// Flipbook texture atlas size - [columns, rows]
    /// From paramValue "FlipbookSize" vec4[0,1]
    pub flipbook_size: Option<[u32; 2]>,
    
    /// Current flipbook frame index
    /// From paramValue "FrameIndex" vec4[0]
    pub flipbook_frame: Option<f32>,
}

/// Texture mapping extracted from BIN file with UV transform parameters
#[derive(Debug, Clone, Serialize, Default)]
pub struct TextureMapping {
    /// Default texture path for meshes without specific override
    pub default_texture: Option<String>,
    
    /// Per-material properties including texture and UV transforms
    /// Key = submesh/material name, Value = material properties
    pub material_properties: HashMap<String, MaterialProperties>,
    
    /// Static material references that couldn't be resolved (for debugging)
    pub static_materials: Vec<String>,
    
    /// Raw ritobin content for late lookups
    #[serde(skip)]
    pub ritobin_content: String,
}

/// Find skin0.bin (or skinN.bin) relative to an SKN file
/// 
/// Looks for the skin BIN in multiple locations:
/// 1. Same directory as SKN (skinN.bin)
/// 2. data/characters/{champion}/skins/skinN/ structure
/// 3. Parent directories
pub fn find_skin_bin(skn_path: &Path) -> Option<PathBuf> {
    let _path_str = skn_path.to_string_lossy().to_lowercase();
    tracing::info!("Looking for skin BIN relative to: {}", skn_path.display());
    
    // Try to extract champion name and skin number from path
    // Path patterns:
    // .../characters/{champion}/skins/skin{N}/{champion}.skn
    // .../assets/characters/{champion}/skins/skin{N}/{champion}.skn
    // .../assets/characters/{champion}/skins/base/{champion}.skn  (base = skin0)
    
    let mut champion_name: Option<String> = None;
    let mut skin_folder: Option<String> = None;  // e.g., "skin0", "skin20"
    
    // Parse path components
    let components: Vec<&str> = skn_path.to_str()
        .unwrap_or("")
        .split(&['/', '\\'][..])
        .collect();
    
    for (i, part) in components.iter().enumerate() {
        let lower = part.to_lowercase();
        
        // Look for "skins" folder to find structure
        if lower == "skins" && i + 1 < components.len() {
            // Next component should be skinN folder or "base"
            let next = components[i + 1].to_lowercase();
            if next.starts_with("skin") {
                skin_folder = Some(next.clone());
            } else if next == "base" {
                // "base" folder is equivalent to "skin0"
                skin_folder = Some("skin0".to_string());
                tracing::debug!("Detected 'base' folder, treating as skin0");
            }
            
            // Champion is typically 2 folders back: characters/{champion}/skins
            if i >= 2 && components[i - 1].to_lowercase() != "characters" {
                champion_name = Some(components[i - 1].to_lowercase());
            }
        }
        
        // Also detect champion from "characters/{champion}" pattern
        if lower == "characters" && i + 1 < components.len() {
            champion_name = Some(components[i + 1].to_lowercase());
        }
    }
    
    tracing::info!("Extracted: champion={:?}, skin_folder={:?}", champion_name, skin_folder);
    
    // Determine the BIN filename based on skin folder
    let bin_filename = if let Some(ref folder) = skin_folder {
        format!("{}.bin", folder)  // skin0 -> skin0.bin, skin20 -> skin20.bin
    } else {
        "skin0.bin".to_string()  // Default
    };
    
    // Strategy 1: Same directory as SKN
    if let Some(parent) = skn_path.parent() {
        let bin_path = parent.join(&bin_filename);
        tracing::info!("Strategy 1: Checking {}", bin_path.display());
        if bin_path.exists() {
            tracing::info!("Found skin BIN!");
            return Some(bin_path);
        }
        
        // Also try skin0.bin as fallback
        let fallback = parent.join("skin0.bin");
        if fallback.exists() {
            tracing::info!("Found skin0.bin as fallback!");
            return Some(fallback);
        }
    }
    
    // Strategy 2: Look for data/ folder at project root
    // Find project root by looking for assets/ folder
    let mut project_root: Option<PathBuf> = None;
    
    for (i, part) in components.iter().enumerate() {
        let lower = part.to_lowercase();
        if lower == "assets" || lower.contains("assets.wad") {
            // Project root is everything before assets/
            if i > 0 {
                project_root = Some(components[..i].iter().collect::<PathBuf>());
            }
            break;
        }
    }
    
    if let (Some(root), Some(champ), Some(skin)) = (&project_root, &champion_name, &skin_folder) {
        // Try: data/characters/{champion}/skins/{skin}/{skin}.bin
        let data_path = root
            .join("data")
            .join("characters")
            .join(champ)
            .join("skins")
            .join(skin)
            .join(format!("{}.bin", skin));
        
        tracing::info!("Strategy 2: Checking {}", data_path.display());
        if data_path.exists() {
            tracing::info!("Found skin BIN in data folder!");
            return Some(data_path);
        }
        
        // Also try without the nested skin folder:
        // data/characters/{champion}/skins/{skin}.bin
        let alt_path = root
            .join("data")
            .join("characters")
            .join(champ)
            .join("skins")
            .join(format!("{}.bin", skin));
        
        tracing::info!("Strategy 2b: Checking {}", alt_path.display());
        if alt_path.exists() {
            tracing::info!("Found skin BIN at alternate data path!");
            return Some(alt_path);
        }
    }
    
    // Strategy 3: Walk up looking for data/ sibling to assets/
    let mut current = skn_path.parent();
    while let Some(dir) = current {
        // Check if this dir has both data/ and assets/ subdirs
        let data_dir = dir.join("data");
        let assets_dir = dir.join("assets");
        
        if data_dir.exists() && assets_dir.exists() {
            tracing::info!("Strategy 3: Found project root at {}", dir.display());
            
            if let (Some(champ), Some(skin)) = (&champion_name, &skin_folder) {
                let bin_path = data_dir
                    .join("characters")
                    .join(champ)
                    .join("skins")
                    .join(skin)
                    .join(format!("{}.bin", skin));
                
                tracing::info!("Strategy 3: Checking {}", bin_path.display());
                if bin_path.exists() {
                    return Some(bin_path);
                }
            }
        }
        
        current = dir.parent();
    }
    
    tracing::warn!("skin BIN not found for: {}", skn_path.display());
    None
}

/// Extract texture mappings from a skin0.bin file
/// 
/// Parses the BIN file by converting it to Ritobin text format and using regex
/// to find skinMeshProperties and material overrides.
pub fn extract_texture_mapping(bin_path: &Path) -> anyhow::Result<TextureMapping> {
    let data = fs::read(bin_path)?;
    let tree = ltk_bridge::read_bin(&data)
        .map_err(|e| anyhow::anyhow!("Failed to parse BIN: {}", e))?;
    
    // Convert to text using cached hashes for better readability/matching
    let textual_content = ltk_bridge::tree_to_text_cached(&tree)
        .map_err(|e| anyhow::anyhow!("Failed to convert BIN to text: {}", e))?;
        
    extract_texture_mapping_from_text(&textual_content)
}

/// Parse Ritobin text to extract texture mappings
/// 
/// Uses regex to find:
/// 1. valid skinMeshProperties block (with default texture)
/// 2. materialOverride blocks (with submesh -> texture/material mappings)
/// 3. StaticMaterialDef blocks (to resolve material links)
#[allow(clippy::regex_creation_in_loops)]
fn extract_texture_mapping_from_text(content: &str) -> anyhow::Result<TextureMapping> {
    let mut mapping = TextureMapping {
        ritobin_content: content.to_string(),
        ..Default::default()
    };
    
    // 1. Find skinMeshProperties block header
    // We look for: skinMeshProperties: embed = SkinMeshDataProperties { ... }
    let skin_mesh_header_regex = Regex::new(r"skinMeshProperties:\s*embed\s*=\s*(?:SkinMeshDataProperties\s*)?").unwrap();
    
    if let Some(header_match) = skin_mesh_header_regex.find(content) {
        // Use brace counting to extract the full properties block
        if let Some(properties_block) = extract_braced_block(content, header_match.end() - 1) {
            tracing::debug!("Found skinMeshProperties block ({} chars)", properties_block.len());
            
            // Extract default texture
            // texture: string = "ASSETS/..."
            let texture_regex = Regex::new(r#"texture:\s*string\s*=\s*"([^"]+)""#).unwrap();
            if let Some(tex_captures) = texture_regex.captures(&properties_block) {
                let tex_path = tex_captures.get(1).unwrap().as_str().to_string();
                if !tex_path.is_empty() {
                    tracing::debug!("Default texture: {}", tex_path);
                    mapping.default_texture = Some(tex_path);
                }
            }
            
            // Find materialOverride list header
            let override_header_regex = Regex::new(r"materialOverride:\s*list\[embed\]\s*=\s*").unwrap();
            
            if let Some(override_match) = override_header_regex.find(&properties_block) {
                // Use brace counting to extract the full list
                if let Some(list_content) = extract_braced_block(&properties_block, override_match.end() - 1) {
                    tracing::debug!("Found materialOverride list ({} chars)", list_content.len());
                    
                    // Split by "SkinMeshDataProperties_MaterialOverride" 
                    let parts: Vec<&str> = list_content.split("SkinMeshDataProperties_MaterialOverride").collect();
                    
                    for (idx, part) in parts.iter().enumerate() {
                        // Check if this part has a submesh definition
                        let submesh_regex = Regex::new(r#"submesh:\s*string\s*=\s*"([^"]+)""#).unwrap();
                        if let Some(sub_captures) = submesh_regex.captures(part) {
                            let submesh_name = sub_captures.get(1).unwrap().as_str().to_string();
                            tracing::info!("Found materialOverride[{}]: submesh='{}'", idx, submesh_name);
                            
                            // Check for direct texture
                            let tex_regex = Regex::new(r#"texture:\s*string\s*=\s*"([^"]+)""#).unwrap();
                            if let Some(tex_match) = tex_regex.captures(part) {
                                let tex_path = tex_match.get(1).unwrap().as_str().to_string();
                                tracing::info!("  -> Direct texture: {}", tex_path);
                                // Direct textures have no UV transforms
                                let props = MaterialProperties {
                                    texture_path: tex_path,
                                    ..Default::default()
                                };
                                mapping.material_properties.insert(submesh_name.clone(), props);
                                continue;
                            }
                            
                            // Check for material link (string) - CASE INSENSITIVE
                            // Material: link = "Characters/..." or material: link = "..."
                            let mat_link_regex = Regex::new(r#"(?i)material:\s*link\s*=\s*"([^"]+)""#).unwrap();
                            if let Some(mat_match) = mat_link_regex.captures(part) {
                                let mat_path = mat_match.get(1).unwrap().as_str().to_string();
                                tracing::info!("  -> Material link (string): {}", mat_path);
                                
                                // Resolve material link - now returns MaterialProperties with UV transforms
                                if let Some(props) = resolve_material_texture(content, &mat_path) {
                                    tracing::info!("  -> RESOLVED to: {}", props.texture_path);
                                    mapping.material_properties.insert(submesh_name.clone(), props);
                                } else {
                                    tracing::warn!("  -> FAILED to resolve material link!");
                                    mapping.static_materials.push(format!("Link: {} -> {}", submesh_name, mat_path));
                                }
                                continue;
                            }

                            // Check for material link (hash)
                            // material: link = 0x12345678
                            let mat_hash_regex = Regex::new(r#"material:\s*link\s*=\s*(0x[0-9a-fA-F]+)"#).unwrap();
                            if let Some(hash_match) = mat_hash_regex.captures(part) {
                                let mat_hash = hash_match.get(1).unwrap().as_str();
                                tracing::info!("  -> Material link (hash): {}", mat_hash);
                                
                                // Try to resolve hex hash to MaterialProperties
                                if let Some(props) = resolve_material_texture_by_hash(content, mat_hash) {
                                    tracing::info!("  -> RESOLVED to: {}", props.texture_path);
                                    mapping.material_properties.insert(submesh_name.clone(), props);
                                } else {
                                    tracing::warn!("  -> FAILED to resolve material hash!");
                                    mapping.static_materials.push(format!("Hash: {} -> {}", submesh_name, mat_hash));
                                }
                                continue;
                            }
                            
                            tracing::warn!("  -> No texture or material link found for submesh");
                        }
                    }
                }
            }
        }
    }
    
    tracing::info!("Final material_properties count: {}", mapping.material_properties.len());
    Ok(mapping)
}

/// Look up MaterialProperties for a material by searching for StaticMaterialDef with matching name
/// 
/// This is used for materials that aren't in the materialOverride list but have their 
/// own StaticMaterialDef block in the BIN file.
pub fn lookup_material_texture_by_name(ritobin_content: &str, material_name: &str) -> Option<MaterialProperties> {
    tracing::debug!("Looking up StaticMaterialDef for material: {}", material_name);
    
    // Helper to extract MaterialProperties from a block
    let extract_props = |block: &str| -> Option<MaterialProperties> {
        if let Some(texture_path) = extract_diffuse_texture_from_block(block) {
            let (uv_scale, uv_offset, flipbook_size, flipbook_frame) = extract_param_values(block);
            Some(MaterialProperties {
                texture_path,
                uv_scale,
                uv_offset,
                flipbook_size,
                flipbook_frame,
            })
        } else {
            None
        }
    };
    
    // Strategy 1: Exact path match
    // Pattern: "ExactMaterialName" = StaticMaterialDef
    let exact_pattern = format!(r#""{}"\s*=\s*StaticMaterialDef\s*"#, regex::escape(material_name));
    if let Ok(regex) = Regex::new(&exact_pattern) {
        if let Some(mat) = regex.find(ritobin_content) {
            tracing::debug!("Found exact StaticMaterialDef match at position {}", mat.start());
            if let Some(block) = extract_braced_block(ritobin_content, mat.end() - 1) {
                if let Some(props) = extract_props(&block) {
                    tracing::debug!("Resolved '{}' to texture: {}", material_name, props.texture_path);
                    return Some(props);
                }
            }
        }
    }
    
    // Strategy 2: Path ends with material name
    // Pattern: ".../{material_name}" = StaticMaterialDef
    let ends_with_pattern = format!(r#""[^"]*/{}"[^=]*=\s*StaticMaterialDef\s*"#, regex::escape(material_name));
    if let Ok(regex) = Regex::new(&ends_with_pattern) {
        if let Some(mat) = regex.find(ritobin_content) {
            tracing::debug!("Found path-ending StaticMaterialDef match at position {}", mat.start());
            if let Some(block) = extract_braced_block(ritobin_content, mat.end() - 1) {
                if let Some(props) = extract_props(&block) {
                    tracing::debug!("Resolved '{}' to texture: {}", material_name, props.texture_path);
                    return Some(props);
                }
            }
        }
    }
    
    // Strategy 3: Contains material name anywhere in path (partial match)
    // Pattern: "...{material_name}..." = StaticMaterialDef
    let contains_pattern = format!(r#""[^"]*{}[^"]*"\s*=\s*StaticMaterialDef\s*"#, regex::escape(material_name));
    if let Ok(regex) = Regex::new(&contains_pattern) {
        if let Some(mat) = regex.find(ritobin_content) {
            tracing::debug!("Found partial StaticMaterialDef match at position {}", mat.start());
            if let Some(block) = extract_braced_block(ritobin_content, mat.end() - 1) {
                if let Some(props) = extract_props(&block) {
                    tracing::debug!("Resolved '{}' to texture: {}", material_name, props.texture_path);
                    return Some(props);
                }
            }
        }
    }
    
    // Strategy 4: Case-insensitive search
    let lower_name = material_name.to_lowercase();
    let case_insensitive_pattern = format!(r#"(?i)"[^"]*{}[^"]*"\s*=\s*StaticMaterialDef\s*"#, regex::escape(&lower_name));
    if let Ok(regex) = Regex::new(&case_insensitive_pattern) {
        if let Some(mat) = regex.find(ritobin_content) {
            tracing::debug!("Found case-insensitive StaticMaterialDef match at position {}", mat.start());
            if let Some(block) = extract_braced_block(ritobin_content, mat.end() - 1) {
                if let Some(props) = extract_props(&block) {
                    tracing::debug!("Resolved '{}' to texture: {}", material_name, props.texture_path);
                    return Some(props);
                }
            }
        }
    }
    tracing::debug!("No StaticMaterialDef found for material: {}", material_name);
    None
}

/// Extract UV transform parameters from a StaticMaterialDef block's paramValues
/// 
/// Parses:
/// - UVScaleAndOffset: vec4 = { scaleU, scaleV, offsetU, offsetV }
/// - FlipbookSize: vec4 = { cols, rows, 0, 0 }
/// - FrameIndex: vec4 = { index, 0, 0, 0 }
#[allow(clippy::type_complexity, clippy::regex_creation_in_loops)]
fn extract_param_values(material_block: &str) -> (Option<[f32; 2]>, Option<[f32; 2]>, Option<[u32; 2]>, Option<f32>) {
    let mut uv_scale: Option<[f32; 2]> = None;
    let mut uv_offset: Option<[f32; 2]> = None;
    let mut flipbook_size: Option<[u32; 2]> = None;
    let mut flipbook_frame: Option<f32> = None;
    
    // Find paramValues block - can be list[embed] or list2[embed]
    let param_regex = match Regex::new(r"(?i)paramValues:\s*list2?\[embed\]\s*=\s*") {
        Ok(r) => r,
        Err(_) => return (None, None, None, None),
    };
    
    let param_match = match param_regex.find(material_block) {
        Some(m) => m,
        None => return (None, None, None, None),
    };
    
    // Extract paramValues block using brace counting
    if let Some(param_block) = extract_braced_block(material_block, param_match.end() - 1) {
        // Split by StaticMaterialShaderParamDef
        let params: Vec<&str> = param_block.split("StaticMaterialShaderParamDef").collect();
        
        for param in params {
            // Extract parameter name
            let name_regex = match Regex::new(r#"name:\s*string\s*=\s*"([^"]+)""#) {
                Ok(r) => r,
                Err(_) => continue,
            };
            
            if let Some(name_match) = name_regex.captures(param) {
                let param_name = match name_match.get(1) {
                    Some(m) => m.as_str(),
                    None => continue,
                };
                
                // Extract vec4 value: value: vec4 = { x, y, z, w }
                let value_regex = match Regex::new(r"value:\s*vec4\s*=\s*\{\s*([^}]+)\s*\}") {
                    Ok(r) => r,
                    Err(_) => continue,
                };
                
                if let Some(value_match) = value_regex.captures(param) {
                    let values_str = match value_match.get(1) {
                        Some(m) => m.as_str(),
                        None => continue,
                    };
                    
                    let values: Vec<f32> = values_str
                        .split(',')
                        .filter_map(|s| s.trim().parse::<f32>().ok())
                        .collect();
                    
                    match param_name {
                        "UVScaleAndOffset" if values.len() >= 4 => {
                            uv_scale = Some([values[0], values[1]]);
                            uv_offset = Some([values[2], values[3]]);
                            tracing::debug!("Found UVScaleAndOffset: scale=[{}, {}], offset=[{}, {}]", 
                                values[0], values[1], values[2], values[3]);
                        }
                        "FlipbookSize" if values.len() >= 2 => {
                            flipbook_size = Some([values[0] as u32, values[1] as u32]);
                            tracing::debug!("Found FlipbookSize: [{}, {}]", values[0], values[1]);
                        }
                        "FrameIndex" if !values.is_empty() => {
                            flipbook_frame = Some(values[0]);
                            tracing::debug!("Found FrameIndex: {}", values[0]);
                        }
                        _ => {}
                    }
                }
            }
        }
    }
    
    (uv_scale, uv_offset, flipbook_size, flipbook_frame)
}

/// Resolve a material path to MaterialProperties by searching the BIN content
/// 
/// Returns texture path AND UV transform parameters
fn resolve_material_texture(content: &str, material_path: &str) -> Option<MaterialProperties> {
    tracing::info!("Resolving material link: '{}'", material_path);
    
    // Escape special characters in material path for regex
    let escaped_path = regex::escape(material_path);
    
    // Find the definition header: "MaterialPath" = StaticMaterialDef {
    let def_pattern = format!(r#""{}"\s*=\s*StaticMaterialDef\s*"#, escaped_path);
    tracing::debug!("Searching with pattern: {}", def_pattern);
    
    let def_regex = match Regex::new(&def_pattern) {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("Invalid regex pattern: {}", e);
            return None;
        }
    };
    
    if let Some(def_match) = def_regex.find(content) {
        tracing::info!("Found StaticMaterialDef for '{}' at position {}", material_path, def_match.start());
        
        // Use brace counting to extract the full block
        if let Some(block) = extract_braced_block(content, def_match.end() - 1) {
            tracing::debug!("Extracted block ({} chars)", block.len());
            
            // Extract texture path
            if let Some(texture_path) = extract_diffuse_texture_from_block(&block) {
                tracing::info!("Found texture: {}", texture_path);
                
                // Extract UV transform parameters
                let (uv_scale, uv_offset, flipbook_size, flipbook_frame) = extract_param_values(&block);
                
                let props = MaterialProperties {
                    texture_path,
                    uv_scale,
                    uv_offset,
                    flipbook_size,
                    flipbook_frame,
                };
                
                tracing::info!("SUCCESS: '{}' resolved with transforms", material_path);
                return Some(props);
            } else {
                tracing::warn!("FAILED: Could not find diffuse texture in StaticMaterialDef block for '{}'", material_path);
                let preview: String = block.chars().take(500).collect();
                tracing::debug!("Block preview: {}", preview);
            }
        } else {
            tracing::warn!("Failed to extract braced block after StaticMaterialDef header");
        }
    } else {
        tracing::warn!("Could not find StaticMaterialDef for material path: '{}'", material_path);
    }
    
    None
}

/// Resolve a hex hash material reference to MaterialProperties
fn resolve_material_texture_by_hash(content: &str, hash: &str) -> Option<MaterialProperties> {
    tracing::debug!("Resolving material link (hash): {}", hash);
    
    // Find the definition header: 0xABCDEF = StaticMaterialDef {
    // Hash matching is case-insensitive
    let pattern = format!(r"(?i){}\s*=\s*StaticMaterialDef\s*", regex::escape(hash));
    let regex = Regex::new(&pattern).ok()?;
    
    if let Some(mat) = regex.find(content) {
        tracing::debug!("Found StaticMaterialDef for hash {} at position {}", hash, mat.start());
        
        // Use brace counting to extract the full block
        if let Some(block) = extract_braced_block(content, mat.end() - 1) {
            if let Some(texture_path) = extract_diffuse_texture_from_block(&block) {
                let (uv_scale, uv_offset, flipbook_size, flipbook_frame) = extract_param_values(&block);
                return Some(MaterialProperties {
                    texture_path,
                    uv_scale,
                    uv_offset,
                    flipbook_size,
                    flipbook_frame,
                });
            }
        }
    }
    
    tracing::debug!("Failed to resolve material hash: {}", hash);
    None
}

/// Extract content between matched braces starting at the given position
/// The position should point to (or before) the opening '{'
fn extract_braced_block(content: &str, start_after: usize) -> Option<String> {
    let bytes = content.as_bytes();
    let mut brace_count = 0;
    let mut block_start = None;
    
    // Search from start_after position
    for (i, &ch) in bytes[start_after..].iter().enumerate() {
        let actual_idx = start_after + i;
        if ch == b'{' {
            if block_start.is_none() {
                block_start = Some(actual_idx + 1); // Start after opening brace
            }
            brace_count += 1;
        } else if ch == b'}' {
            brace_count -= 1;
            if brace_count == 0 {
                if let Some(start) = block_start {
                    let block = content[start..actual_idx].to_string();
                    tracing::trace!("Extracted block ({} chars)", block.len());
                    return Some(block);
                }
            }
        }
    }
    
    tracing::warn!("Failed to find matching closing brace");
    None
}

/// Extract Diffuse/Color texture path from a StaticMaterialDef block
/// 
/// Looks for common diffuse texture names in samplerValues, with fallback to first sampler
#[allow(clippy::regex_creation_in_loops)]
fn extract_diffuse_texture_from_block(block: &str) -> Option<String> {
    // Find samplerValues list inside the block
    // Can be list[embed] or list2[embed]
    let sampler_regex = Regex::new(r"(?i)samplerValues:\s*list2?\[embed\]\s*=\s*").ok()?;
    let sampler_match = sampler_regex.find(block)?;
    
    tracing::trace!("Found samplerValues at position {}", sampler_match.start());
    
    // Extract the samplerValues block using brace counting
    if let Some(sampler_block) = extract_braced_block(block, sampler_match.end() - 1) {
        // Split by StaticMaterialShaderSamplerDef to process each sampler
        let samplers: Vec<&str> = sampler_block.split("StaticMaterialShaderSamplerDef").collect();
        
        // First pass: look for known diffuse texture names
        let diffuse_names = [
            "diffuse_color",
            "diffuse_texture", 
            "diffuse",
            "base_color",
            "basecolor",
            "albedo",
            "color",
            "_cm",  // Common suffix for color maps
        ];
        
        for sampler in &samplers {
            let lower_sampler = sampler.to_lowercase();
            
            // Check if this sampler has a known diffuse-like name
            let is_diffuse = diffuse_names.iter().any(|name| lower_sampler.contains(name));
            
            if is_diffuse {
                // Extract texturePath
                let path_regex = Regex::new(r#"texturePath:\s*string\s*=\s*"([^"]+)""#).ok()?;
                if let Some(path_match) = path_regex.captures(sampler) {
                    let texture_path = path_match.get(1).unwrap().as_str().to_string();
                    tracing::debug!("Found diffuse texture: {}", texture_path);
                    return Some(texture_path);
                }
            }
        }
        
        // Fallback: Use the first sampler with a texturePath (often the diffuse)
        tracing::debug!("No named diffuse found, trying first sampler as fallback");
        for sampler in &samplers {
            let path_regex = Regex::new(r#"texturePath:\s*string\s*=\s*"([^"]+)""#).ok()?;
            if let Some(path_match) = path_regex.captures(sampler) {
                let texture_path = path_match.get(1).unwrap().as_str().to_string();
                // Skip obvious non-diffuse textures
                let lower_path = texture_path.to_lowercase();
                if !lower_path.contains("normal") && 
                   !lower_path.contains("_nm") && 
                   !lower_path.contains("mask") &&
                   !lower_path.contains("noise") &&
                   !lower_path.contains("ramp") {
                    tracing::debug!("Using first valid texture as fallback: {}", texture_path);
                    return Some(texture_path);
                }
            }
        }
    }
    
    tracing::debug!("No diffuse texture found in block");
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_texture_mapping_complex() {
        let ritobin_content = r#"
        skinMeshProperties: embed = SkinMeshDataProperties {
            skeleton: string = "ASSETS/Characters/Test/Skins/Skin0/Test.skl"
            simpleSkin: string = "ASSETS/Characters/Test/Skins/Skin0/Test.skn"
            texture: string = "ASSETS/Characters/Test/Skins/Skin0/Test_Base_TX_CM.tex"
            materialOverride: list[embed] = {
                SkinMeshDataProperties_MaterialOverride {
                    texture: string = "ASSETS/Characters/Test/Skins/Skin0/Direct_Override.tex"
                    submesh: string = "DirectMesh"
                }
                SkinMeshDataProperties_MaterialOverride {
                    material: link = "Characters/Test/Skins/Skin0/Materials/LinkedMat"
                    submesh: string = "LinkedMesh"
                }
            }
        }
        
        "Characters/Test/Skins/Skin0/Materials/LinkedMat" = StaticMaterialDef {
            name: string = "Characters/Test/Skins/Skin0/Materials/LinkedMat"
            samplerValues: list2[embed] = {
                StaticMaterialShaderSamplerDef {
                    textureName: string = "Diffuse_Color"
                    texturePath: string = "ASSETS/Characters/Test/Skins/Skin0/Resolved_Linked.tex"
                    addressU: u32 = 1
                    addressV: u32 = 1
                }
                StaticMaterialShaderSamplerDef {
                    textureName: string = "Normal_Map"
                    texturePath: string = "ASSETS/Characters/Test/Skins/Skin0/Resolved_Normal.tex"
                }
            }
        }
        "#;
        
        let mapping = extract_texture_mapping_from_text(ritobin_content).unwrap();
        
        // Check default texture
        assert_eq!(mapping.default_texture, Some("ASSETS/Characters/Test/Skins/Skin0/Test_Base_TX_CM.tex".to_string()));
        
        // Check overrides - now using material_properties
        assert_eq!(mapping.material_properties.get("DirectMesh").map(|p| &p.texture_path), Some(&"ASSETS/Characters/Test/Skins/Skin0/Direct_Override.tex".to_string()));
        assert_eq!(mapping.material_properties.get("LinkedMesh").map(|p| &p.texture_path), Some(&"ASSETS/Characters/Test/Skins/Skin0/Resolved_Linked.tex".to_string()));
    }

    #[test]
    fn test_extract_texture_mapping_simple() {
        let ritobin_content = r#"
        skinMeshProperties: embed = SkinMeshDataProperties {
            texture: string = "ASSETS/Simple.tex"
        }
        "#;
        
        let mapping = extract_texture_mapping_from_text(ritobin_content).unwrap();
        assert_eq!(mapping.default_texture, Some("ASSETS/Simple.tex".to_string()));
        assert!(mapping.material_properties.is_empty());
    }

    #[test]
    fn test_extract_texture_mapping_hex_hash() {
        let ritobin_content = r#"
        skinMeshProperties: embed = SkinMeshDataProperties {
            texture: string = "ASSETS/Characters/Test/Skins/Skin0/Default.tex"
            materialOverride: list[embed] = {
                SkinMeshDataProperties_MaterialOverride {
                    material: link = 0xABCDEF12
                    submesh: string = "HashedMesh"
                }
            }
        }
        
        0xABCDEF12 = StaticMaterialDef {
            name: string = "HashedMaterial"
            samplerValues: list2[embed] = {
                StaticMaterialShaderSamplerDef {
                    textureName: string = "Diffuse_Color"
                    texturePath: string = "ASSETS/Characters/Test/Skins/Skin0/Hashed_Resolved.tex"
                    addressU: u32 = 1
                    addressV: u32 = 1
                }
            }
        }
        "#;
        
        let mapping = extract_texture_mapping_from_text(ritobin_content).unwrap();
        
        // Check that hex hash was resolved
        assert_eq!(
            mapping.material_properties.get("HashedMesh").map(|p| &p.texture_path), 
            Some(&"ASSETS/Characters/Test/Skins/Skin0/Hashed_Resolved.tex".to_string())
        );
        // Should not appear in static_materials since it was resolved
        assert!(mapping.static_materials.is_empty());
    }

    #[test]
    fn test_extract_braced_block() {
        let content = r#"outer { inner { nested } more } end"#;
        let block = extract_braced_block(content, 5).unwrap();
        assert_eq!(block.trim(), "inner { nested } more");
    }
}

