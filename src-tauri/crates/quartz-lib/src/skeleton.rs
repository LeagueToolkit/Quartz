/* League skeleton (.skl) reading for the AniPort mask viewer. Parses a modern
skeleton with the ritoshark `anim` crate and exposes the flat joint list plus
the parent indices the mask UI needs. Includes an auto-detect helper that maps
a game-relative skeleton path (from a skins .bin) onto the real .skl on disk. */

use std::path::{Path, PathBuf};

use ritoshark::anim::Skeleton;
use ritoshark::prelude::Parse;
use serde::Serialize;

use crate::error::{Error, Result};

/// One joint of a skeleton. Carries the local + inverse-bind transforms and the
/// joint-name hash so the model viewer can compute skinning matrices per frame.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JointInfo {
    pub id: i16,
    pub name: String,
    /// Parent joint id, or -1 for a root joint.
    pub parent_id: i16,
    /// Joint-name hash used to match animation tracks to this joint.
    pub hash: u32,
    pub local_translation: [f32; 3],
    pub local_scale: [f32; 3],
    /// Quaternion `[x, y, z, w]`.
    pub local_rotation: [f32; 4],
    pub inverse_bind_translation: [f32; 3],
    pub inverse_bind_scale: [f32; 3],
    /// Quaternion `[x, y, z, w]`.
    pub inverse_bind_rotation: [f32; 4],
}

/// A parsed skeleton: joint list plus the skeleton/asset names.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkeletonInfo {
    pub name: String,
    pub asset_name: String,
    pub joints: Vec<JointInfo>,
    /// Maps a mesh's local bone-influence index to a joint id.
    pub influences: Vec<u16>,
}

/// Parse a skeleton from raw .skl bytes into its joint list.
pub fn read_skeleton(bytes: &[u8]) -> Result<SkeletonInfo> {
    let skeleton = Skeleton::from_bytes(bytes)
        .map_err(|e| Error::InvalidInput(format!("failed to parse skeleton: {e:?}")))?;

    let joints = skeleton
        .joints
        .iter()
        .map(|j| JointInfo {
            id: j.id,
            name: j.name.clone(),
            parent_id: j.parent_id,
            hash: j.hash,
            local_translation: j.local_translation.to_array(),
            local_scale: j.local_scale.to_array(),
            local_rotation: j.local_rotation.to_array(),
            inverse_bind_translation: j.inverse_bind_translation.to_array(),
            inverse_bind_scale: j.inverse_bind_scale.to_array(),
            inverse_bind_rotation: j.inverse_bind_rotation.to_array(),
        })
        .collect();

    Ok(SkeletonInfo {
        name: skeleton.name.clone(),
        asset_name: skeleton.asset.clone(),
        joints,
        influences: skeleton.influences.clone(),
    })
}

/// Read and parse a skeleton from a file on disk.
pub fn read_skeleton_file<P: AsRef<Path>>(path: P) -> Result<SkeletonInfo> {
    let bytes = std::fs::read(path.as_ref()).map_err(|e| Error::io_with_path(e, path.as_ref()))?;
    read_skeleton(&bytes)
}

/* Resolve the real .skl path for a skins/animation bin.

`skeleton_ref` is the game-relative skeleton path pulled from the skins bin
(e.g. "ASSETS/Characters/Aatrox/Skins/Base/Aatrox.skl"). Mod folders mirror
the game tree, so we locate the .skl by:
  1. trying `explicit` if the caller already knows the path,
  2. anchoring the game-relative path onto the mod root (walk up from the bin
     until a parent + skeleton_ref resolves to a real file),
  3. falling back to a single .skl sitting next to the bin. */
pub fn autodetect_skl(
    bin_path: &str,
    skeleton_ref: Option<&str>,
    explicit: Option<&str>,
) -> Result<PathBuf> {
    if let Some(p) = explicit {
        let pb = PathBuf::from(p);
        if pb.is_file() {
            return Ok(pb);
        }
    }

    let bin = PathBuf::from(bin_path);
    let bin_dir = bin.parent().unwrap_or_else(|| Path::new("."));

    if let Some(rel) = skeleton_ref {
        let rel_norm = rel.replace('\\', "/");
        // Walk up the bin's ancestors, anchoring the game-relative path at each.
        for anchor in bin_dir.ancestors() {
            let candidate = anchor.join(&rel_norm);
            if candidate.is_file() {
                return Ok(candidate);
            }
        }

        // Some mods drop the leading ASSETS/ segment; retry on the basename's tail.
        if let Some(file_name) = Path::new(&rel_norm).file_name() {
            if let Some(found) = find_skl_named(bin_dir, file_name.to_string_lossy().as_ref()) {
                return Ok(found);
            }
        }
    }

    // Last resort: a lone .skl beside the bin.
    if let Some(found) = find_single_skl(bin_dir) {
        return Ok(found);
    }

    Err(Error::InvalidInput(format!(
        "could not locate a .skl for {bin_path}"
    )))
}

/// Find a .skl with the given file name under `root` (recursive, shallow-first).
fn find_skl_named(root: &Path, name: &str) -> Option<PathBuf> {
    let target = name.to_ascii_lowercase();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = std::fs::read_dir(&dir).ok()?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path
                .file_name()
                .map(|n| n.to_string_lossy().to_ascii_lowercase() == target)
                .unwrap_or(false)
            {
                return Some(path);
            }
        }
    }
    None
}

/// If exactly one .skl lives directly in `dir`, return it.
fn find_single_skl(dir: &Path) -> Option<PathBuf> {
    let mut found: Option<PathBuf> = None;
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        let path = entry.path();
        if path
            .extension()
            .map(|e| e.eq_ignore_ascii_case("skl"))
            .unwrap_or(false)
        {
            if found.is_some() {
                return None; // ambiguous
            }
            found = Some(path);
        }
    }
    found
}
