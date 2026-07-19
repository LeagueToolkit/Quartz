/* League animation (.anm) reading for the model viewer. Parses an animation
with the ritoshark `anim` crate and flattens it into per-joint keyframe tracks
(pose sampled at a time in seconds) that the frontend samples during playback.

The heavy lifting (raw / quantized / compressed ANM decode) lives in ritoshark;
this module only projects the parsed result into a serde-friendly shape. */

use std::path::Path;

use ritoshark::anim::Animation;
use ritoshark::prelude::Parse;
use serde::Serialize;

use crate::error::{Error, Result};

/// One keyframe of one joint: a TRS pose sampled at `time` seconds.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimFramePreview {
    /// Time of this key, in seconds from the clip start.
    pub time: f32,
    pub translation: [f32; 3],
    /// Quaternion `[x, y, z, w]`.
    pub rotation: [f32; 4],
    pub scale: [f32; 3],
}

/// All keyframes for a single joint, matched to the skeleton by `joint_hash`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimTrackPreview {
    pub joint_hash: u32,
    pub frames: Vec<AnimFramePreview>,
}

/// A parsed animation clip flattened for the frontend player.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimPreview {
    pub name: String,
    pub fps: f32,
    pub frame_count: u32,
    pub duration_seconds: f32,
    pub tracks: Vec<AnimTrackPreview>,
}

/// Parse a `.anm` clip from raw bytes.
pub fn read_anim(bytes: &[u8], name: String) -> Result<AnimPreview> {
    let anim = Animation::from_bytes(bytes)
        .map_err(|e| Error::InvalidInput(format!("failed to parse animation: {e:?}")))?;

    let fps = if anim.fps > 0.0 { anim.fps } else { 30.0 };
    let frame_count = anim.frame_count() as u32;
    let duration_seconds = frame_count as f32 / fps.max(1.0);

    let tracks = anim
        .tracks
        .iter()
        .map(|track| AnimTrackPreview {
            joint_hash: track.joint_hash,
            frames: track
                .frames
                .iter()
                .map(|f| AnimFramePreview {
                    time: f.time,
                    translation: f.translation.to_array(),
                    rotation: f.rotation.to_array(),
                    scale: f.scale.to_array(),
                })
                .collect(),
        })
        .collect();

    Ok(AnimPreview {
        name,
        fps,
        frame_count,
        duration_seconds,
        tracks,
    })
}

/// Read and parse a `.anm` clip from a file on disk.
pub fn load_anim_preview<P: AsRef<Path>>(path: P) -> Result<AnimPreview> {
    let path = path.as_ref();
    let bytes = std::fs::read(path).map_err(|e| Error::io_with_path(e, path))?;
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Animation".into());
    read_anim(&bytes, name)
}
