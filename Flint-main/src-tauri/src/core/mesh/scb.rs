//! SCB/SCO (Static Mesh) parsing
//! 
//! Uses league-toolkit's ltk_mesh crate for parsing SCB (binary) and SCO (ASCII) files.

use std::fs::File;
use std::io::BufReader;
use std::path::Path;

use ltk_mesh::StaticMesh;
use glam::Vec3;
use serde::Serialize;

use std::collections::HashMap;

/// Complete static mesh data serializable to JSON for frontend
#[derive(Debug, Serialize)]
pub struct ScbMeshData {
    /// Mesh name from file
    pub name: String,
    /// Material names present in the mesh
    pub materials: Vec<String>,
    /// Vertex positions as [x, y, z] arrays
    pub positions: Vec<[f32; 3]>,
    /// Vertex normals as [x, y, z] arrays (computed from faces)
    pub normals: Vec<[f32; 3]>,
    /// Texture coordinates as [u, v] arrays
    pub uvs: Vec<[f32; 2]>,
    /// Triangle indices
    pub indices: Vec<u32>,
    /// Bounding box as [min, max] where each is [x, y, z]
    pub bounding_box: [[f32; 3]; 2],
    /// Material ranges for per-material rendering (material_name -> (start_index, index_count))
    pub material_ranges: HashMap<String, (u32, u32)>,
}

/// Parse an SCB (binary) or SCO (ASCII) file and extract mesh data for 3D rendering
/// 
/// Uses league-toolkit's StaticMesh parser with format detection by extension.
pub fn parse_scb_file<P: AsRef<Path>>(path: P) -> anyhow::Result<ScbMeshData> {
    let path_ref = path.as_ref();
    let file = File::open(path_ref)?;
    let mut reader = BufReader::new(file);
    
    // Detect format by file extension
    let is_ascii = path_ref.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("sco"))
        .unwrap_or(false);
    
    let mesh = if is_ascii {
        tracing::debug!("Parsing SCO (ASCII) file: {}", path_ref.display());
        StaticMesh::from_ascii(&mut reader)
            .map_err(|e| anyhow::anyhow!("Failed to parse SCO file: {:?}", e))?
    } else {
        tracing::debug!("Parsing SCB (binary) file: {}", path_ref.display());
        StaticMesh::from_reader(&mut reader)
            .map_err(|e| anyhow::anyhow!("Failed to parse SCB file: {:?}", e))?
    };
    
    tracing::debug!("Static mesh parsed: {} vertices, {} faces", mesh.vertices().len(), mesh.faces().len());
    
    // Static meshes store geometry per-face, not per-vertex
    // Each face has 3 vertex indices into the vertex array, plus its own UVs
    let vertices = mesh.vertices();
    let faces = mesh.faces();
    
    // We need to create non-indexed geometry since each face has unique UVs
    let mut positions: Vec<[f32; 3]> = Vec::new();
    let mut normals: Vec<[f32; 3]> = Vec::new();
    let mut uvs: Vec<[f32; 2]> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();
    let mut materials: Vec<String> = Vec::new();
    let mut material_ranges: HashMap<String, (u32, u32)> = HashMap::new();
    
    // Track current material for grouping
    let mut current_material: Option<String> = None;
    let mut material_start_idx: u32 = 0;
    
    // Compute bounding box from vertices
    let mut min = Vec3::splat(f32::MAX);
    let mut max = Vec3::splat(f32::MIN);
    
    for v in vertices {
        min = min.min(*v);
        max = max.max(*v);
    }
    
    for face in faces {
        // ltk_mesh now uses [u32; 3] for indices (fixed from u8 truncation)
        let v0_idx = face.indices[0] as usize;
        let v1_idx = face.indices[1] as usize;
        let v2_idx = face.indices[2] as usize;
        
        // Get vertex positions (with bounds check)
        let v0 = vertices.get(v0_idx).copied().unwrap_or(Vec3::ZERO);
        let v1 = vertices.get(v1_idx).copied().unwrap_or(Vec3::ZERO);
        let v2 = vertices.get(v2_idx).copied().unwrap_or(Vec3::ZERO);
        
        // Compute face normal
        let edge1 = v1 - v0;
        let edge2 = v2 - v0;
        let normal = edge1.cross(edge2).normalize_or_zero();
        let normal_arr = [normal.x, normal.y, normal.z];
        
        // Track material ranges
        let face_material = face.material.clone();
        if current_material.as_ref() != Some(&face_material) {
            if let Some(mat) = current_material.take() {
                let end_idx = indices.len() as u32;
                material_ranges.insert(mat, (material_start_idx, end_idx - material_start_idx));
            }
            
            if !materials.contains(&face_material) {
                materials.push(face_material.clone());
            }
            current_material = Some(face_material);
            material_start_idx = indices.len() as u32;
        }
        
        // Add vertices (non-indexed to preserve per-face UVs)
        let base_idx = positions.len() as u32;
        
        positions.push([v0.x, v0.y, v0.z]);
        positions.push([v1.x, v1.y, v1.z]);
        positions.push([v2.x, v2.y, v2.z]);
        
        normals.push(normal_arr);
        normals.push(normal_arr);
        normals.push(normal_arr);
        
        // UVs from face - now [Vec2; 3] array
        uvs.push([face.uvs[0].x, face.uvs[0].y]);
        uvs.push([face.uvs[1].x, face.uvs[1].y]);
        uvs.push([face.uvs[2].x, face.uvs[2].y]);
        
        indices.push(base_idx);
        indices.push(base_idx + 1);
        indices.push(base_idx + 2);
    }
    
    // Close final material range
    if let Some(mat) = current_material {
        let end_idx = indices.len() as u32;
        material_ranges.insert(mat, (material_start_idx, end_idx - material_start_idx));
    }
    
    let bounding_box = [
        [min.x, min.y, min.z],
        [max.x, max.y, max.z],
    ];
    
    Ok(ScbMeshData {
        name: mesh.name().to_string(),
        materials,
        positions,
        normals,
        uvs,
        indices,
        bounding_box,
        material_ranges,
    })
}
