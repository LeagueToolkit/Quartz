//! Mesh commands for SKN/SKL/SCB file parsing
//! 
//! Provides Tauri commands for reading 3D mesh data from League files.

use std::path::Path;
use std::collections::HashMap;

use crate::core::mesh::skn::{parse_skn_file, SknMeshData};
use crate::core::mesh::scb::{parse_scb_file, ScbMeshData};
use crate::core::mesh::texture::{find_skin_bin, extract_texture_mapping, lookup_material_texture_by_name, MaterialProperties};
use crate::commands::file::decode_dds_to_png;

/// Read and parse an SCB (Static Mesh Binary) file
/// 
/// Returns mesh data including vertices, normals, UVs, indices, and materials
/// for 3D rendering in the frontend.
#[tauri::command]
pub async fn read_scb_mesh(path: String) -> Result<ScbMeshData, String> {
    tracing::debug!("Reading SCB mesh: {}", path);
    
    parse_scb_file(&path)
        .map_err(|e| {
            tracing::error!("Failed to parse SCB file {}: {}", path, e);
            format!("Failed to parse SCB file: {}", e)
        })
}

/// Read and parse an SKN (Simple Skin) mesh file
/// 
/// Returns mesh data including vertices, normals, UVs, indices, materials,
/// and decoded textures for 3D rendering in the frontend.
#[tauri::command]
pub async fn read_skn_mesh(path: String) -> Result<SknMeshData, String> {
    tracing::info!("Reading SKN mesh: {}", path);
    
    let skn_path = Path::new(&path);
    
    // Parse the SKN file
    let mut mesh_data = parse_skn_file(&path)
        .map_err(|e| {
            tracing::error!("Failed to parse SKN file {}: {}", path, e);
            format!("Failed to parse SKN file: {}", e)
        })?;
    
    tracing::info!("SKN parsed successfully. Materials: {:?}", 
        mesh_data.materials.iter().map(|m| &m.name).collect::<Vec<_>>());
    
    // Try to find and parse skin0.bin for texture mappings
    if let Some(bin_path) = find_skin_bin(skn_path) {
        tracing::info!("Found skin0.bin: {}", bin_path.display());
        
        match extract_texture_mapping(&bin_path) {
            Ok(texture_mapping) => {
                tracing::info!(
                    "Extracted texture mapping: default={:?}, material_properties={:?}", 
                    texture_mapping.default_texture,
                    texture_mapping.material_properties.keys().collect::<Vec<_>>()
                );
                
                // Get the project/skin directory for resolving texture paths
                let base_dir = skn_path.parent().unwrap_or(Path::new("."));
                tracing::debug!("Base dir for texture resolution: {}", base_dir.display());
                
                // Collect material properties for each material
                // Track: (material_name, MaterialProperties) and deduplicate by texture path
                let mut material_props_map: HashMap<String, MaterialProperties> = HashMap::new();
                let mut texture_tasks: Vec<(String, std::path::PathBuf, Vec<String>)> = Vec::new();
                let mut path_to_materials: HashMap<String, Vec<String>> = HashMap::new();
                
                for material in &mesh_data.materials {
                    let material_name = &material.name;
                    
                    // Strategy 1: Direct match in material_properties
                    let mat_props = texture_mapping.material_properties
                        .get(material_name)
                        .cloned()
                        // Strategy 2: Strip "mesh_" prefix from SKN material name
                        .or_else(|| {
                            material_name.strip_prefix("mesh_")
                                .and_then(|stripped| texture_mapping.material_properties.get(stripped).cloned())
                        })
                        // Strategy 3: Add "mesh_" prefix to SKN material name
                        .or_else(|| {
                            texture_mapping.material_properties.get(&format!("mesh_{}", material_name)).cloned()
                        })
                        // Strategy 4: Case-insensitive match
                        .or_else(|| {
                            let lower_name = material_name.to_lowercase();
                            texture_mapping.material_properties.iter()
                                .find(|(k, _)| k.to_lowercase() == lower_name)
                                .map(|(_, v)| v.clone())
                        })
                        // Strategy 5: Case-insensitive with "mesh_" prefix stripping
                        .or_else(|| {
                            let lower_name = material_name.to_lowercase();
                            let stripped = lower_name.strip_prefix("mesh_").unwrap_or(&lower_name);
                            texture_mapping.material_properties.iter()
                                .find(|(k, _)| k.to_lowercase() == stripped)
                                .map(|(_, v)| v.clone())
                        })
                        // Strategy 6: Search for StaticMaterialDef matching this material name
                        .or_else(|| {
                            tracing::debug!("Trying StaticMaterialDef lookup for: {}", material_name);
                            lookup_material_texture_by_name(&texture_mapping.ritobin_content, material_name)
                        })
                        // Strategy 7: Try StaticMaterialDef lookup with stripped name
                        .or_else(|| {
                            material_name.strip_prefix("mesh_").and_then(|stripped| {
                                tracing::debug!("Trying StaticMaterialDef lookup for stripped name: {}", stripped);
                                lookup_material_texture_by_name(&texture_mapping.ritobin_content, stripped)
                            })
                        })
                        // Strategy 8: Fallback to default texture (no UV transforms)
                        .or_else(|| {
                            texture_mapping.default_texture.clone().map(|tex| MaterialProperties {
                                texture_path: tex,
                                uv_scale: None,
                                uv_offset: None,
                                flipbook_size: None,
                                flipbook_frame: None,
                            })
                        });
                    
                    if let Some(props) = mat_props {
                        tracing::debug!("Material '{}' resolved to texture: {} (scale={:?}, flipbook={:?})", 
                            material_name, props.texture_path, props.uv_scale, props.flipbook_size);
                        
                        // Store props for this material
                        material_props_map.insert(material_name.clone(), props.clone());
                        
                        // Track for texture loading deduplication
                        if let Some(resolved) = resolve_texture_path(base_dir, &props.texture_path) {
                            let path_key = resolved.to_string_lossy().to_string();
                            path_to_materials.entry(path_key.clone())
                                .or_default()
                                .push(material_name.clone());
                            
                            // Only add to load list if not already queued
                            if !texture_tasks.iter().any(|(pk, _, _)| pk == &path_key) {
                                texture_tasks.push((path_key, resolved, vec![material_name.clone()]));
                            }
                        } else {
                            tracing::warn!("Texture file not found for '{}': {}", material_name, props.texture_path);
                        }
                    } else {
                        tracing::warn!("No texture resolved for material: {}", material_name);
                    }
                }
                
                tracing::info!("Loading {} unique textures in parallel...", texture_tasks.len());
                let start_time = std::time::Instant::now();
                
                // Load all textures in parallel
                let load_futures: Vec<_> = texture_tasks.into_iter()
                    .map(|(path_key, resolved_path, _)| {
                        async move {
                            match decode_dds_to_png(resolved_path.to_string_lossy().to_string()).await {
                                Ok(decoded) => Some((path_key, decoded.data)),
                                Err(e) => {
                                    tracing::warn!("Failed to decode texture {}: {}", resolved_path.display(), e);
                                    None
                                }
                            }
                        }
                    })
                    .collect();
                
                let results = futures::future::join_all(load_futures).await;
                
                // Build decoded textures lookup
                let mut decoded_textures: HashMap<String, String> = HashMap::new();
                for result in results.into_iter().flatten() {
                    let (path_key, data) = result;
                    decoded_textures.insert(path_key, data);
                }
                
                // Build material_data with textures AND UV parameters
                use crate::core::mesh::skn::MaterialData;
                let mut material_data: HashMap<String, MaterialData> = HashMap::new();
                
                for (material_name, props) in material_props_map {
                    // Find the decoded texture for this material
                    if let Some(resolved) = resolve_texture_path(base_dir, &props.texture_path) {
                        let path_key = resolved.to_string_lossy().to_string();
                        if let Some(texture_data) = decoded_textures.get(&path_key) {
                            material_data.insert(material_name.clone(), MaterialData {
                                texture: texture_data.clone(),
                                uv_scale: props.uv_scale,
                                uv_offset: props.uv_offset,
                                flipbook_size: props.flipbook_size,
                                flipbook_frame: props.flipbook_frame,
                            });
                            tracing::debug!("Built MaterialData for '{}' with UV params", material_name);
                        }
                    }
                }
                
                let elapsed = start_time.elapsed();
                tracing::info!("Loaded {} material_data entries in {:.2}s", material_data.len(), elapsed.as_secs_f32());
                mesh_data.material_data = material_data;
                
                // Log static material TODOs
                if !texture_mapping.static_materials.is_empty() {
                    tracing::info!(
                        "Unresolved material references: {:?}",
                        texture_mapping.static_materials
                    );
                }
            }
            Err(e) => {
                tracing::warn!("Failed to extract texture mapping from skin0.bin: {}", e);
            }
        }
    } else {
        tracing::warn!("No skin0.bin found for texture mapping (searched from {})", skn_path.display());
    }
    
    Ok(mesh_data)
}

/// Resolve a texture path relative to the project directory
/// 
/// Tries multiple strategies:
/// 1. Extract filename and look in base_dir
/// 2. Try the full ASSETS/ path relative to project root
/// 3. Search in WAD folders (base/*.wad.client/assets/)
fn resolve_texture_path(base_dir: &Path, texture_path: &str) -> Option<std::path::PathBuf> {
    // Strategy 1: Just use the filename in the same directory as SKN
    let filename = Path::new(texture_path)
        .file_name()?
        .to_string_lossy();
    
    let same_dir_path = base_dir.join(filename.as_ref());
    if same_dir_path.exists() {
        return Some(same_dir_path);
    }
    
    // Strategy 2: Try the path as-is (might be repathed)
    let texture_path_buf = std::path::PathBuf::from(texture_path);
    if texture_path_buf.exists() {
        return Some(texture_path_buf);
    }
    
    // Strategy 3: Try stripping ASSETS/ prefix and resolving from base_dir parent
    let normalized = texture_path
        .trim_start_matches("ASSETS/")
        .trim_start_matches("assets/");
    
    // Go up to find project root (look for parent directories)
    let mut search_dir = base_dir.to_path_buf();
    for _ in 0..5 {
        let candidate = search_dir.join(normalized);
        if candidate.exists() {
            return Some(candidate);
        }
        
        if let Some(parent) = search_dir.parent() {
            search_dir = parent.to_path_buf();
        } else {
            break;
        }
    }
    
    None
}

/// Resolve an asset path (from BIN file) to an actual file path
/// 
/// Searches multiple locations:
/// 1. Same directory as the reference file (bin_path)
/// 2. WAD folders (content/base/*.wad.client/assets/)
/// 3. Extracted folder (content/extracted/ASSETS/)
/// 4. Parent directories
#[tauri::command]
pub async fn resolve_asset_path(
    asset_path: String,
    bin_path: String
) -> Result<String, String> {
    tracing::debug!("Resolving asset path: {} relative to {}", asset_path, bin_path);
    
    let bin_path = std::path::Path::new(&bin_path);
    let base_dir = bin_path.parent().unwrap_or(Path::new("."));
    
    // Normalize the asset path (convert forward slashes, remove ASSETS/ prefix)
    let normalized: String = asset_path.replace('/', std::path::MAIN_SEPARATOR_STR);
    let stripped = normalized
        .trim_start_matches("ASSETS\\")
        .trim_start_matches("ASSETS/")
        .trim_start_matches("assets\\")
        .trim_start_matches("assets/");
    
    // Find content root by walking up the directory tree
    let mut content_root: Option<std::path::PathBuf> = None;
    let mut current = base_dir.to_path_buf();
    
    for _ in 0..10 {
        let base_folder = current.join("base");
        let extracted_folder = current.join("extracted");
        
        if base_folder.exists() || extracted_folder.exists() {
            content_root = Some(current.clone());
            break;
        }
        
        // Check if we're inside the content folder
        if current.file_name().map(|n| n.to_string_lossy().to_lowercase()) == Some("content".to_string()) {
            content_root = Some(current.clone());
            break;
        }
        
        if let Some(parent) = current.parent() {
            current = parent.to_path_buf();
        } else {
            break;
        }
    }
    
    let content_root = content_root.unwrap_or_else(|| base_dir.to_path_buf());
    tracing::debug!("Content root: {}", content_root.display());
    
    // Strategy 1: Look in the same directory
    let filename = Path::new(&asset_path).file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    
    let same_dir = base_dir.join(&filename);
    if same_dir.exists() {
        tracing::debug!("Found in same directory: {}", same_dir.display());
        return Ok(same_dir.to_string_lossy().to_string());
    }
    
    // Strategy 2: Search in WAD folders (base/*.wad.client/assets/)
    let base_folder = content_root.join("base");
    if base_folder.exists() {
        // Read all wad folders
        if let Ok(entries) = std::fs::read_dir(&base_folder) {
            for entry in entries.filter_map(|e| e.ok()) {
                let wad_name = entry.file_name().to_string_lossy().to_lowercase();
                if wad_name.ends_with(".wad.client") || wad_name.ends_with(".wad") {
                    // Check if asset exists in this WAD's assets folder
                    let wad_asset_path = entry.path()
                        .join("assets")
                        .join(stripped);
                    
                    tracing::trace!("Checking WAD path: {}", wad_asset_path.display());
                    if wad_asset_path.exists() {
                        tracing::debug!("Found in WAD {}: {}", wad_name, wad_asset_path.display());
                        return Ok(wad_asset_path.to_string_lossy().to_string());
                    }
                    
                    // Also try lowercase version of the path
                    let lower_path = entry.path()
                        .join("assets")
                        .join(stripped.to_lowercase());
                    
                    if lower_path.exists() {
                        tracing::debug!("Found in WAD {} (lowercase): {}", wad_name, lower_path.display());
                        return Ok(lower_path.to_string_lossy().to_string());
                    }
                }
            }
        }
    }
    
    // Strategy 3: Search in extracted folder
    let extracted = content_root.join("extracted").join("ASSETS").join(stripped);
    if extracted.exists() {
        tracing::debug!("Found in extracted: {}", extracted.display());
        return Ok(extracted.to_string_lossy().to_string());
    }
    
    // Strategy 4: Walk up directories
    let mut search_dir = base_dir.to_path_buf();
    for _ in 0..5 {
        let candidate = search_dir.join(stripped);
        if candidate.exists() {
            tracing::debug!("Found in parent: {}", candidate.display());
            return Ok(candidate.to_string_lossy().to_string());
        }
        
        if let Some(parent) = search_dir.parent() {
            search_dir = parent.to_path_buf();
        } else {
            break;
        }
    }
    
    Err(format!("Asset not found: {} (searched from {})", asset_path, content_root.display()))
}

use crate::core::mesh::skl::{parse_skl_file, SklData};

/// Read and parse an SKL (Skeleton) file
/// 
/// Returns skeleton data including bone hierarchy with names, parent IDs,
/// and local transforms for visualization and animation.
#[tauri::command]
pub async fn read_skl_skeleton(path: String) -> Result<SklData, String> {
    tracing::debug!("Reading SKL skeleton: {}", path);
    
    parse_skl_file(&path)
        .map_err(|e| {
            tracing::error!("Failed to parse SKL file {}: {}", path, e);
            format!("Failed to parse SKL file: {}", e)
        })
}

use crate::core::mesh::animation::{
    find_animation_bin, extract_animation_list, parse_animation_file, 
    resolve_animation_path, evaluate_animation_at,
    AnimationList, AnimationData, AnimationPose,
};

/// Get list of available animations for a model
/// 
/// Parses the animation BIN file to extract AtomicClipData animation paths
#[tauri::command]
pub async fn read_animation_list(skn_path: String) -> Result<AnimationList, String> {
    tracing::debug!("Reading animation list for: {}", skn_path);
    
    let skn_path = std::path::Path::new(&skn_path);
    
    // Find animation BIN file
    let bin_path = find_animation_bin(skn_path)
        .ok_or_else(|| "Animation BIN file not found".to_string())?;
    
    tracing::debug!("Found animation BIN: {}", bin_path.display());
    
    extract_animation_list(&bin_path)
        .map_err(|e| {
            tracing::error!("Failed to extract animation list: {}", e);
            format!("Failed to extract animation list: {}", e)
        })
}

/// Read and parse an ANM animation file
#[tauri::command]
pub async fn read_animation(path: String, base_path: Option<String>) -> Result<AnimationData, String> {
    tracing::debug!("Reading animation: {}", path);
    
    // Try to resolve the animation path
    let resolved_path = if let Some(base) = base_path {
        let base_dir = std::path::Path::new(&base).parent().unwrap_or(std::path::Path::new("."));
        resolve_animation_path(base_dir, &path)
    } else {
        Some(std::path::PathBuf::from(&path))
    };
    
    let anim_path = resolved_path
        .ok_or_else(|| format!("Could not resolve animation path: {}", path))?;
    
    if !anim_path.exists() {
        return Err(format!("Animation file not found: {}", anim_path.display()));
    }
    
    parse_animation_file(&anim_path)
        .map_err(|e| {
            tracing::error!("Failed to parse animation {}: {}", anim_path.display(), e);
            format!("Failed to parse animation: {}", e)
        })
}

/// Evaluate animation at a specific time to get joint poses
/// 
/// Returns a map of joint hash → (rotation, translation, scale) for all joints.
#[tauri::command]
pub async fn evaluate_animation(
    path: String, 
    base_path: Option<String>, 
    time: f32
) -> Result<AnimationPose, String> {
    tracing::debug!("Evaluating animation at time {}: {}", time, path);
    
    // Resolve the animation path
    let resolved_path = if let Some(base) = base_path {
        let base_dir = std::path::Path::new(&base)
            .parent()
            .unwrap_or(std::path::Path::new("."));
        resolve_animation_path(base_dir, &path)
    } else {
        Some(std::path::PathBuf::from(&path))
    };
    
    let anim_path = resolved_path
        .ok_or_else(|| format!("Could not resolve animation path: {}", path))?;
    
    if !anim_path.exists() {
        return Err(format!("Animation file not found: {}", anim_path.display()));
    }
    
    evaluate_animation_at(&anim_path, time)
        .map_err(|e| {
            tracing::error!("Failed to evaluate animation {}: {}", anim_path.display(), e);
            format!("Failed to evaluate animation: {}", e)
        })
}
