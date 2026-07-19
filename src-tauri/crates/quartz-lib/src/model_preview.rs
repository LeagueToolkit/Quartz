//! Read League mesh formats into a renderer-neutral geometry projection.
//!
//! The UI owns WebGL and interaction; this module owns format parsing.  Keeping
//! that boundary here means the Asset Explorer, Port hover card, and full model
//! inspector all consume the exact same SCB/SCO/SKN data.

use crate::error::{Error, Result};
use ritoshark::mesh::{SkinnedMesh, StaticMesh};
use ritoshark::prelude::Parse;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelGroup {
    pub name: String,
    pub index_start: u32,
    pub index_count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelPreview {
    pub name: String,
    /// `static` for SCB/SCO, `skinned` for SKN.
    pub kind: String,
    pub version: String,
    /// Flat xyz, uv, rgba, and triangle-index buffers for direct WebGL upload.
    pub positions: Vec<f32>,
    pub normals: Vec<f32>,
    pub uvs: Vec<f32>,
    pub colors: Vec<f32>,
    /// 4 bone influence indices per vertex, into the mesh's local influence
    /// table (SKL `influences` maps these to joint ids). Empty for static meshes.
    pub bone_indices: Vec<u32>,
    /// 4 bone weights per vertex, parallel to `bone_indices`.
    pub bone_weights: Vec<f32>,
    pub indices: Vec<u32>,
    pub groups: Vec<ModelGroup>,
    pub vertex_count: usize,
    pub triangle_count: usize,
    /// Same-stem texture next to the mesh, when one is present.
    pub suggested_texture: Option<String>,
    /// BIN-authored SKN texture map (`*` base + submesh overrides).
    pub suggested_textures: HashMap<String, String>,
    pub suggested_hidden_groups: Vec<String>,
    pub suggested_model_scale: f32,
}

pub fn load_model_preview(path: &Path) -> Result<ModelPreview> {
    if !path.is_file() {
        return Err(Error::InvalidInput(format!(
            "model file does not exist: {}",
            path.display()
        )));
    }
    let ext = path
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let bytes = std::fs::read(path).map_err(|e| Error::io_with_path(e, path))?;
    match ext.as_str() {
        "scb" | "sco" => {
            let mesh = StaticMesh::from_bytes(&bytes).map_err(|e| {
                Error::InvalidInput(format!("failed to parse {}: {e}", path.display()))
            })?;
            Ok(project_static(mesh, path))
        }
        "skn" => {
            let mesh = SkinnedMesh::from_bytes(&bytes).map_err(|e| {
                Error::InvalidInput(format!("failed to parse {}: {e}", path.display()))
            })?;
            let mut preview = project_skinned(mesh, path);
            if let Some((definition, textures)) = crate::skin_preview::resolve_skn_disk_preview(path) {
                preview.suggested_texture = textures.get("*").cloned().or(preview.suggested_texture);
                preview.suggested_textures = textures;
                preview.suggested_hidden_groups = definition.hidden_submeshes;
                preview.suggested_model_scale = definition.skin_scale;
            }
            Ok(preview)
        }
        _ => Err(Error::InvalidInput(format!(
            "unsupported model format '.{ext}' (expected .scb, .sco, or .skn)"
        ))),
    }
}

fn project_static(mesh: StaticMesh, path: &Path) -> ModelPreview {
    // SCB/SCO UVs live per face corner, so flatten the indexed source positions
    // into triangle corners.  This preserves UV seams exactly.
    let mut positions = Vec::with_capacity(mesh.faces.len() * 9);
    let mut uvs = Vec::with_capacity(mesh.faces.len() * 6);
    let mut colors = Vec::new();
    let mut indices = Vec::with_capacity(mesh.faces.len() * 3);
    let mut groups: Vec<ModelGroup> = Vec::new();

    for (face_index, face) in mesh.faces.iter().enumerate() {
        let material = if face.material.trim().is_empty() {
            "Default"
        } else {
            face.material.as_str()
        };
        match groups.last_mut() {
            Some(group) if group.name == material => group.index_count += 3,
            _ => groups.push(ModelGroup {
                name: material.to_string(),
                index_start: (face_index * 3) as u32,
                index_count: 3,
            }),
        }

        for corner in 0..3 {
            let source_index = face.indices[corner] as usize;
            let p = mesh
                .positions
                .get(source_index)
                .copied()
                .unwrap_or_default();
            positions.extend_from_slice(&p.to_array());
            uvs.extend_from_slice(&face.uvs[corner].to_array());
            if let Some(source_colors) = mesh.colors.as_ref() {
                let c = source_colors
                    .get(source_index)
                    .copied()
                    .unwrap_or([255, 255, 255, 255]);
                colors.extend(c.map(|v| v as f32 / 255.0));
            }
            indices.push((face_index * 3 + corner) as u32);
        }
    }

    let vertex_count = positions.len() / 3;
    let triangle_count = indices.len() / 3;
    ModelPreview {
        name: if mesh.name.trim().is_empty() {
            file_name(path)
        } else {
            mesh.name
        },
        kind: "static".into(),
        version: format!("{}.{}", mesh.version.0, mesh.version.1),
        positions,
        normals: Vec::new(), // Three computes smooth normals after upload.
        uvs,
        colors,
        bone_indices: Vec::new(), // static meshes have no skinning
        bone_weights: Vec::new(),
        indices,
        groups,
        vertex_count,
        triangle_count,
        suggested_texture: find_companion_texture(path),
        suggested_textures: HashMap::new(),
        suggested_hidden_groups: Vec::new(),
        suggested_model_scale: 1.0,
    }
}

fn project_skinned(mesh: SkinnedMesh, path: &Path) -> ModelPreview {
    let mut positions = Vec::with_capacity(mesh.vertices.len() * 3);
    let mut normals = Vec::with_capacity(mesh.vertices.len() * 3);
    let mut uvs = Vec::with_capacity(mesh.vertices.len() * 2);
    let has_colors = mesh.vertices.iter().any(|v| v.color.is_some());
    let mut colors = if has_colors {
        Vec::with_capacity(mesh.vertices.len() * 4)
    } else {
        Vec::new()
    };
    let mut bone_indices = Vec::with_capacity(mesh.vertices.len() * 4);
    let mut bone_weights = Vec::with_capacity(mesh.vertices.len() * 4);

    for vertex in &mesh.vertices {
        positions.extend_from_slice(&vertex.position.to_array());
        normals.extend_from_slice(&vertex.normal.to_array());
        uvs.extend_from_slice(&vertex.uv.to_array());
        if has_colors {
            let c = vertex.color.unwrap_or([255, 255, 255, 255]);
            colors.extend(c.map(|v| v as f32 / 255.0));
        }
        bone_indices.extend(vertex.blend_indices.iter().map(|v| u32::from(*v)));
        bone_weights.extend_from_slice(&vertex.blend_weights);
    }

    let indices: Vec<u32> = mesh.indices.iter().map(|v| u32::from(*v)).collect();
    let mut groups: Vec<ModelGroup> = mesh
        .ranges
        .iter()
        .filter(|range| range.index_count > 0)
        .map(|range| ModelGroup {
            name: if range.name.trim().is_empty() {
                "Base".into()
            } else {
                range.name.clone()
            },
            index_start: range.index_start,
            index_count: range.index_count,
        })
        .collect();
    if groups.is_empty() && !indices.is_empty() {
        groups.push(ModelGroup {
            name: "Base".into(),
            index_start: 0,
            index_count: indices.len() as u32,
        });
    }

    let vertex_count = mesh.vertices.len();
    let triangle_count = indices.len() / 3;
    ModelPreview {
        name: file_name(path),
        kind: "skinned".into(),
        version: format!("{}.{}", mesh.major, mesh.minor),
        positions,
        normals,
        uvs,
        colors,
        bone_indices,
        bone_weights,
        indices,
        groups,
        vertex_count,
        triangle_count,
        suggested_texture: find_companion_texture(path),
        suggested_textures: HashMap::new(),
        suggested_hidden_groups: Vec::new(),
        suggested_model_scale: 1.0,
    }
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|v| v.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Model".into())
}

fn find_companion_texture(model_path: &Path) -> Option<String> {
    let parent = model_path.parent()?;
    let stem = model_path.file_stem()?.to_string_lossy();
    let texture_exts = ["dds", "tex", "png", "jpg", "jpeg", "webp"];

    // Try direct paths first (fast and deterministic on case-sensitive hosts).
    for ext in texture_exts {
        let candidate = parent.join(format!("{stem}.{ext}"));
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().into_owned());
        }
    }

    // League assets frequently mix extension/name casing.  A single directory
    // scan keeps same-stem matching correct on every platform.
    std::fs::read_dir(parent)
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .find(|candidate| {
            candidate.is_file()
                && candidate
                    .file_stem()
                    .is_some_and(|v| v.to_string_lossy().eq_ignore_ascii_case(&stem))
                && candidate.extension().is_some_and(|v| {
                    texture_exts
                        .iter()
                        .any(|ext| v.to_string_lossy().eq_ignore_ascii_case(ext))
                })
        })
        .map(PathBuf::into_os_string)
        .map(|v| v.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_model_extensions_before_parsing() {
        let dir = std::env::temp_dir();
        let path = dir.join(format!("quartz-preview-{}.txt", std::process::id()));
        std::fs::write(&path, b"not a model").unwrap();
        let error = load_model_preview(&path).unwrap_err().to_string();
        let _ = std::fs::remove_file(path);
        assert!(error.contains("unsupported model format"));
    }

    #[test]
    fn projects_bundled_scb_into_render_buffers() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .join("resources/textures/screen.scb");
        let preview = load_model_preview(&path).expect("bundled screen.scb should parse");
        assert_eq!(preview.kind, "static");
        assert!(preview.vertex_count > 0);
        assert!(preview.triangle_count > 0);
        assert_eq!(preview.positions.len(), preview.vertex_count * 3);
        assert_eq!(preview.indices.len(), preview.triangle_count * 3);
    }
}
