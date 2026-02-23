//! SKN (Simple Skin) mesh parsing
//! 
//! Parses League of Legends skinned mesh files (.skn) and extracts:
//! - Vertex positions, normals, and UVs
//! - Index buffer for triangles
//! - Material ranges for per-material visibility control
//! - Bone weights and indices for skeletal animation skinning

use std::fs::File;
use std::io::BufReader;
use std::path::Path;

use league_toolkit::mesh::{SkinnedMesh, SkinnedMeshRange};
use league_toolkit::mesh::mem::vertex::ElementName;
use glam::{Vec2, Vec3, Vec4};
use serde::Serialize;

use std::collections::HashMap;

/// Material range data for frontend consumption
#[derive(Debug, Clone, Serialize)]
pub struct MaterialRange {
    pub name: String,
    pub start_index: i32,
    pub index_count: i32,
    pub start_vertex: i32,
    pub vertex_count: i32,
}

impl From<&SkinnedMeshRange> for MaterialRange {
    fn from(range: &SkinnedMeshRange) -> Self {
        Self {
            name: range.material.clone(),
            start_index: range.start_index,
            index_count: range.index_count,
            start_vertex: range.start_vertex,
            vertex_count: range.vertex_count,
        }
    }
}

/// Material data including texture and UV parameters for frontend consumption
#[derive(Debug, Clone, Serialize)]
pub struct MaterialData {
    /// Base64-encoded PNG texture data
    pub texture: String,
    /// UV scale (tiling) - [scaleU, scaleV]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uv_scale: Option<[f32; 2]>,
    /// UV offset (shift) - [offsetU, offsetV]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uv_offset: Option<[f32; 2]>,
    /// Flipbook texture atlas size - [columns, rows]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub flipbook_size: Option<[u32; 2]>,
    /// Current flipbook frame index
    #[serde(skip_serializing_if = "Option::is_none")]
    pub flipbook_frame: Option<f32>,
}

/// Complete mesh data serializable to JSON for frontend
#[derive(Debug, Serialize)]
pub struct SknMeshData {
    /// Material ranges for visibility control
    pub materials: Vec<MaterialRange>,
    /// Vertex positions as [x, y, z] arrays
    pub positions: Vec<[f32; 3]>,
    /// Vertex normals as [x, y, z] arrays
    pub normals: Vec<[f32; 3]>,
    /// Texture coordinates as [u, v] arrays
    pub uvs: Vec<[f32; 2]>,
    /// Triangle indices
    pub indices: Vec<u16>,
    /// Bounding box as [min, max] where each is [x, y, z]
    pub bounding_box: [[f32; 3]; 2],
    /// Per-submesh textures as base64 PNG data (DEPRECATED - use material_data)
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub textures: HashMap<String, String>,
    /// Per-material data including textures AND UV transform parameters
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub material_data: HashMap<String, MaterialData>,
    /// Bone weights for skinning - 4 weights per vertex [w0, w1, w2, w3]
    /// Weights should sum to 1.0 for proper skinning
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub bone_weights: Vec<[f32; 4]>,
    /// Bone indices for skinning - 4 bone indices per vertex [i0, i1, i2, i3]
    /// Each index refers to a bone in the skeleton
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub bone_indices: Vec<[u8; 4]>,
}


/// Parse an SKN file and extract mesh data for 3D rendering
pub fn parse_skn_file<P: AsRef<Path>>(path: P) -> anyhow::Result<SknMeshData> {
    let file = File::open(path.as_ref())?;
    let mut reader = BufReader::new(file);
    
    let mesh = SkinnedMesh::from_reader(&mut reader)
        .map_err(|e| anyhow::anyhow!("Failed to parse SKN file: {:?}", e))?;
    
    // Extract materials
    let materials: Vec<MaterialRange> = mesh.ranges()
        .iter()
        .map(MaterialRange::from)
        .collect();
    
    // Extract vertex data using accessors
    let vertex_buffer = mesh.vertex_buffer();
    
    // Get position accessor - Position is always XYZ_Float32 which maps to Vec3
    // Apply mirrorX transformation: negate X to convert from League's left-hand coordinate system
    let positions: Vec<[f32; 3]> = vertex_buffer
        .accessor::<Vec3>(ElementName::Position)
        .map(|acc| acc.iter().map(|v| [-v.x, v.y, v.z]).collect())
        .ok_or_else(|| anyhow::anyhow!("SKN file missing position data"))?;
    
    // Get normal accessor - Normal is XYZ_Float32 which maps to Vec3
    // Apply mirrorX transformation: negate Y and Z normals
    let normals: Vec<[f32; 3]> = vertex_buffer
        .accessor::<Vec3>(ElementName::Normal)
        .map(|acc| acc.iter().map(|v| [v.x, -v.y, -v.z]).collect())
        .unwrap_or_else(|| {
            // Generate default normals if not present
            vec![[0.0, 1.0, 0.0]; positions.len()]
        });
    
    // Get UV accessor - Texcoord0 is XY_Float32 which maps to Vec2
    // No UV flip applied - raw UVs are already in top-left origin format
    // (Confirmed by uvee.py from ltmao which uses raw UVs directly)
    let uvs: Vec<[f32; 2]> = vertex_buffer
        .accessor::<Vec2>(ElementName::Texcoord0)
        .map(|acc| acc.iter().map(|v| [v.x, v.y]).collect())
        .unwrap_or_else(|| {
            // Generate default UVs if not present
            vec![[0.0, 0.0]; positions.len()]
        });
    
    // Extract indices using iter()
    let indices: Vec<u16> = mesh.index_buffer().iter().collect();
    
    // Get bounding box
    let aabb = mesh.aabb();
    let bounding_box = [
        [aabb.min.x, aabb.min.y, aabb.min.z],
        [aabb.max.x, aabb.max.y, aabb.max.z],
    ];
    
    // Extract bone weights for skinning - stored as XYZW_Float32 (Vec4)
    // Each vertex has up to 4 bone influences with corresponding weights
    let bone_weights: Vec<[f32; 4]> = vertex_buffer
        .accessor::<Vec4>(ElementName::BlendWeight)
        .map(|acc| acc.iter().map(|v| [v.x, v.y, v.z, v.w]).collect())
        .unwrap_or_else(|| {
            // Default to single bone influence if not present
            vec![[1.0, 0.0, 0.0, 0.0]; positions.len()]
        });
    
    // Extract bone indices for skinning - stored as XYZW_Byte ([u8; 4])
    // Each index refers to a bone in the skeleton's bone array
    let bone_indices: Vec<[u8; 4]> = vertex_buffer
        .accessor::<[u8; 4]>(ElementName::BlendIndex)
        .map(|acc| acc.iter().collect())
        .unwrap_or_else(|| {
            // Default to bone 0 influence if not present
            vec![[0, 0, 0, 0]; positions.len()]
        });
    
    Ok(SknMeshData {
        materials,
        positions,
        normals,
        uvs,
        indices,
        bounding_box,
        textures: HashMap::new(), // DEPRECATED - use material_data
        material_data: HashMap::new(), // Material data loaded separately by command
        bone_weights,
        bone_indices,
    })
}

// TODO: Add SKL (Skeleton) parsing once ltk_mesh supports it
// This would add:
// - Bone hierarchy (parent-child relationships)
// - Bone transforms (position, rotation, scale)
// - Vertex bone weights and indices
// 
// The skeleton would be rendered as lines connecting bone positions,
// overlaid on the mesh preview.
