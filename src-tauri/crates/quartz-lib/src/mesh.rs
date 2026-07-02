/* Skinned mesh (.skn) editing for the FakeGearSkin animation toggle. The toggle
needs a tiny "MinimalMesh" submesh that the animation graph can show/hide, so we
parse the .skn, append a degenerate triangle bound to a single bone, and write it
back. Mirrors the Electron jsritofile addMinimalSubmesh. */

use std::path::Path;

use ritoshark::math::{Vec2, Vec3, Vec4};
use ritoshark::mesh::{SkinnedMesh, SkinnedMeshRange, SkinnedMeshVertex, SkinnedMeshVertexType};
use ritoshark::prelude::{Parse, Serialize};

use crate::error::{Error, Result};

/// Outcome of adding the MinimalMesh submesh to a .skn.
pub enum MinimalMeshResult {
    /// Added the submesh; bound to the given bone index.
    Added { bone_index: u8 },
    /// A MinimalMesh submesh already existed — nothing changed.
    AlreadyPresent,
}

/// Read a .skn, append a MinimalMesh submesh bound to a bone, and write it back.
///
/// `bone_index` is the joint to bind to; callers usually piggyback off the first
/// existing vertex's bone so the bone is guaranteed valid for this mesh. The
/// submesh is a single tiny triangle (size `scale`) with transparent color, kept
/// invisible until the toggle reveals it.
pub fn add_minimal_mesh(skn_path: &Path, bone_index: u8, scale: f32) -> Result<MinimalMeshResult> {
    let bytes = std::fs::read(skn_path).map_err(|e| Error::io_with_path(e, skn_path))?;
    let mut skn = SkinnedMesh::from_bytes(&bytes)
        .map_err(|e| Error::InvalidInput(format!("failed to parse skn: {e:?}")))?;

    if skn
        .ranges
        .iter()
        .any(|r| r.name.eq_ignore_ascii_case("minimalmesh"))
    {
        return Ok(MinimalMeshResult::AlreadyPresent);
    }

    let base_vertex = skn.vertices.len() as u32;
    let base_index = skn.indices.len() as u32;

    let positions = [
        Vec3::new(0.0, 0.0, 0.0),
        Vec3::new(scale, 0.0, 0.0),
        Vec3::new(0.0, scale, 0.0),
    ];

    for pos in positions {
        let mut v = SkinnedMeshVertex::new(
            pos,
            [bone_index, 0, 0, 0],
            [1.0, 0.0, 0.0, 0.0],
            Vec3::new(0.0, 1.0, 0.0),
            Vec2::new(0.0, 0.0),
        );
        // Match the on-disk vertex layout so the buffer stays consistent.
        if matches!(
            skn.vertex_type,
            SkinnedMeshVertexType::Color | SkinnedMeshVertexType::Tangent
        ) {
            v.color = Some([0, 0, 0, 0]);
        }
        if matches!(skn.vertex_type, SkinnedMeshVertexType::Tangent) {
            v.tangent = Some(Vec4::new(1.0, 0.0, 0.0, 1.0));
        }
        skn.vertices.push(v);
    }

    skn.indices.push(base_vertex as u16);
    skn.indices.push((base_vertex + 1) as u16);
    skn.indices.push((base_vertex + 2) as u16);

    skn.ranges.push(SkinnedMeshRange::new(
        "MinimalMesh",
        base_vertex,
        3,
        base_index,
        3,
    ));

    skn.to_path(skn_path)
        .map_err(|e| Error::InvalidInput(format!("failed to write skn: {e:?}")))?;

    Ok(MinimalMeshResult::Added { bone_index })
}

/// Read a .skn and return the bone index of its first vertex, if any. Used to bind
/// the MinimalMesh to a bone the mesh already references.
pub fn first_vertex_bone(skn_path: &Path) -> Result<Option<u8>> {
    let bytes = std::fs::read(skn_path).map_err(|e| Error::io_with_path(e, skn_path))?;
    let skn = SkinnedMesh::from_bytes(&bytes)
        .map_err(|e| Error::InvalidInput(format!("failed to parse skn: {e:?}")))?;
    Ok(skn.vertices.first().map(|v| v.blend_indices[0]))
}
