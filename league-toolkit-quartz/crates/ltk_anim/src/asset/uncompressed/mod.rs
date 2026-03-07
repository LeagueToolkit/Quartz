//! Uncompressed animation asset (r3d2anmd)
use crate::{asset::Animation, AnimationAsset};
use glam::{Quat, Vec3};
use std::borrow::Cow;
use std::collections::HashMap;

mod read;
mod write;

/// An uncompressed animation frame for a single joint
#[derive(Clone, Copy, Debug, Default)]
pub struct UncompressedFrame {
    /// Index into the vector palette for translation
    pub translation_id: u16,
    /// Index into the vector palette for scale
    pub scale_id: u16,
    /// Index into the quaternion palette for rotation
    pub rotation_id: u16,
}

/// Uncompressed animation asset (`r3d2anmd` format)
///
/// Supports versions 3 (legacy), 4, and 5.
/// Uses palette-based storage where frames reference indices into
/// shared vector and quaternion arrays.
#[derive(Clone, Debug)]
pub struct Uncompressed {
    /// Duration of the animation in seconds
    pub(crate) duration: f32,
    /// Frames per second
    pub(crate) fps: f32,
    /// Total number of frames
    pub(crate) frame_count: usize,
    /// Shared vector palette (translations and scales)
    pub(crate) vector_palette: Vec<Vec3>,
    /// Shared quaternion palette (rotations)
    pub(crate) quat_palette: Vec<Quat>,
    /// Frames indexed by joint hash -> frame array
    pub(crate) joint_frames: HashMap<u32, Vec<UncompressedFrame>>,
}

impl Uncompressed {
    /// Creates a new uncompressed animation
    pub fn new(
        fps: f32,
        vector_palette: Vec<Vec3>,
        quat_palette: Vec<Quat>,
        joint_frames: HashMap<u32, Vec<UncompressedFrame>>,
    ) -> Self {
        let frame_count = joint_frames.values().next().map(|f| f.len()).unwrap_or(0);
        let duration = if fps > 0.0 {
            frame_count as f32 / fps
        } else {
            0.0
        };
        Self {
            duration,
            fps,
            frame_count,
            vector_palette,
            quat_palette,
            joint_frames,
        }
    }
    /// Returns the duration of the animation in seconds
    pub fn duration(&self) -> f32 {
        self.duration
    }

    /// Returns the frames per second
    pub fn fps(&self) -> f32 {
        self.fps
    }

    /// Returns the total number of frames
    pub fn frame_count(&self) -> usize {
        self.frame_count
    }

    /// Returns the vector palette (translations and scales)
    pub fn vector_palette(&self) -> &[Vec3] {
        &self.vector_palette
    }

    /// Returns the quaternion palette (rotations)
    pub fn quat_palette(&self) -> &[Quat] {
        &self.quat_palette
    }

    /// Returns the joint frames map
    pub fn joint_frames(&self) -> &HashMap<u32, Vec<UncompressedFrame>> {
        &self.joint_frames
    }

    /// Returns the joint hashes
    pub fn joint_hashes(&self) -> impl Iterator<Item = &u32> {
        self.joint_frames.keys()
    }

    /// Gets the frame data for a specific joint
    pub fn get_joint_frames(&self, joint_hash: u32) -> Option<&[UncompressedFrame]> {
        self.joint_frames.get(&joint_hash).map(|v| v.as_slice())
    }

    /// Evaluates the animation at the given frame index for a joint
    pub fn evaluate_frame(&self, joint_hash: u32, frame_id: usize) -> Option<(Quat, Vec3, Vec3)> {
        let frames = self.joint_frames.get(&joint_hash)?;
        let frame = frames.get(frame_id)?;

        let rotation = self.quat_palette.get(frame.rotation_id as usize)?;
        let translation = self.vector_palette.get(frame.translation_id as usize)?;
        let scale = self.vector_palette.get(frame.scale_id as usize)?;

        Some((*rotation, *translation, *scale))
    }

    /// Returns the number of joints in the animation
    pub fn joint_count(&self) -> usize {
        self.joint_frames.len()
    }

    /// Returns the joint hashes as a slice
    ///
    /// Note: This allocates a new Vec since joints are stored in a HashMap.
    pub fn joints(&self) -> Cow<'_, [u32]> {
        Cow::Owned(self.joint_frames.keys().copied().collect())
    }

    /// Evaluates the animation at the given time for all joints
    ///
    /// Interpolates between frames using linear interpolation for vectors
    /// and slerp for rotations.
    ///
    /// The time is clamped to `[0, duration]`.
    pub fn evaluate(&self, time: f32) -> HashMap<u32, (Quat, Vec3, Vec3)> {
        if self.frame_count == 0 {
            return HashMap::new();
        }

        let time = time.clamp(0.0, self.duration);
        let frame_pos = time * self.fps;
        let frame_a = (frame_pos.floor() as usize).min(self.frame_count - 1);
        let frame_b = (frame_a + 1).min(self.frame_count - 1);
        let t = frame_pos.fract();

        self.joint_frames
            .iter()
            .filter_map(|(&hash, frames)| {
                let transform = self.sample_joint(frames, frame_a, frame_b, t)?;
                Some((hash, transform))
            })
            .collect()
    }

    /// Samples a joint's transform, interpolating between two frames
    fn sample_joint(
        &self,
        frames: &[UncompressedFrame],
        frame_a: usize,
        frame_b: usize,
        t: f32,
    ) -> Option<(Quat, Vec3, Vec3)> {
        let fa = frames.get(frame_a)?;

        // No interpolation needed
        if frame_a == frame_b || t < f32::EPSILON {
            return Some((
                *self.quat_palette.get(fa.rotation_id as usize)?,
                *self.vector_palette.get(fa.translation_id as usize)?,
                *self.vector_palette.get(fa.scale_id as usize)?,
            ));
        }

        let fb = frames.get(frame_b)?;

        let ra = self.quat_palette.get(fa.rotation_id as usize)?;
        let rb = self.quat_palette.get(fb.rotation_id as usize)?;
        let ta = self.vector_palette.get(fa.translation_id as usize)?;
        let tb = self.vector_palette.get(fb.translation_id as usize)?;
        let sa = self.vector_palette.get(fa.scale_id as usize)?;
        let sb = self.vector_palette.get(fb.scale_id as usize)?;

        Some((ra.slerp(*rb, t), ta.lerp(*tb, t), sa.lerp(*sb, t)))
    }
}

impl Animation for Uncompressed {
    fn duration(&self) -> f32 {
        self.duration
    }

    fn fps(&self) -> f32 {
        self.fps
    }

    fn joint_count(&self) -> usize {
        self.joint_frames.len()
    }

    fn joints(&self) -> Cow<'_, [u32]> {
        Uncompressed::joints(self)
    }

    fn evaluate(&self, time: f32) -> HashMap<u32, (Quat, Vec3, Vec3)> {
        Uncompressed::evaluate(self, time)
    }
}

impl From<Uncompressed> for AnimationAsset {
    fn from(val: Uncompressed) -> Self {
        AnimationAsset::Uncompressed(val)
    }
}
