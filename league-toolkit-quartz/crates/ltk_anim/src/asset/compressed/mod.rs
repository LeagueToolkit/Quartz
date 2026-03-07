use crate::{
    asset::{compressed::read::AnimationFlags, error_metric::ErrorMetric, Animation},
    AnimationAsset,
};
use frame::Frame;
use glam::{Quat, Vec3};
use std::borrow::Cow;
use std::collections::HashMap;

mod evaluate;
mod evaluator;
mod frame;
mod read;
mod write;

pub use evaluator::CompressedEvaluator;

#[derive(Clone, Debug)]
#[allow(dead_code)]
pub struct Compressed {
    pub(crate) flags: AnimationFlags,
    pub(crate) duration: f32,
    pub(crate) fps: f32,

    pub(crate) rotation_error_metric: ErrorMetric,
    pub(crate) translation_error_metric: ErrorMetric,
    pub(crate) scale_error_metric: ErrorMetric,

    pub(crate) translation_min: Vec3,
    pub(crate) translation_max: Vec3,

    pub(crate) scale_min: Vec3,
    pub(crate) scale_max: Vec3,

    pub(crate) jump_cache_count: usize,
    pub(crate) frames: Vec<Frame>,
    pub(crate) jump_caches: Vec<u8>,
    pub(crate) joints: Vec<u32>,
}

impl Compressed {
    /// Returns the animation duration in seconds
    pub fn duration(&self) -> f32 {
        self.duration
    }

    /// Returns the animation FPS
    pub fn fps(&self) -> f32 {
        self.fps
    }

    /// Returns the joint hashes
    pub fn joints(&self) -> &[u32] {
        &self.joints
    }

    /// Returns the number of joints
    pub fn joint_count(&self) -> usize {
        self.joints.len()
    }

    /// Evaluates the animation at the given time.
    ///
    /// Returns a map of joint hash -> (rotation, translation, scale).
    ///
    /// This is a convenience method for one-shot evaluation. For efficient
    /// sequential playback, use [`CompressedEvaluator`] instead.
    pub fn evaluate(&self, time: f32) -> HashMap<u32, (Quat, Vec3, Vec3)> {
        CompressedEvaluator::new(self).evaluate(time)
    }

    /// Creates a new evaluator for this animation.
    ///
    /// Use this for efficient sequential playback where hot frame state
    /// is maintained between evaluations.
    pub fn evaluator(&self) -> CompressedEvaluator<'_> {
        CompressedEvaluator::new(self)
    }
}

impl Animation for Compressed {
    fn duration(&self) -> f32 {
        self.duration
    }

    fn fps(&self) -> f32 {
        self.fps
    }

    fn joint_count(&self) -> usize {
        self.joints.len()
    }

    fn joints(&self) -> Cow<'_, [u32]> {
        Cow::Borrowed(&self.joints)
    }

    fn evaluate(&self, time: f32) -> HashMap<u32, (Quat, Vec3, Vec3)> {
        Compressed::evaluate(self, time)
    }
}

impl From<Compressed> for AnimationAsset {
    fn from(val: Compressed) -> Self {
        AnimationAsset::Compressed(val)
    }
}
