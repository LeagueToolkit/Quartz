//! Animation trait for unified access to animation assets

use glam::{Quat, Vec3};
use std::borrow::Cow;
use std::collections::HashMap;

/// A trait providing unified access to animation data regardless of storage format.
///
/// This allows working with both `Compressed` and `Uncompressed` animations
/// through a common interface.
pub trait Animation {
    /// Returns the animation duration in seconds
    fn duration(&self) -> f32;

    /// Returns the animation frames per second
    fn fps(&self) -> f32;

    /// Returns the number of joints in the animation
    fn joint_count(&self) -> usize;

    /// Returns the joint hashes
    fn joints(&self) -> Cow<'_, [u32]>;

    /// Evaluates the animation at the given time
    ///
    /// Returns a map of joint hash -> (rotation, translation, scale)
    /// for all joints at the specified time.
    ///
    /// The time is clamped to `[0, duration]`.
    fn evaluate(&self, time: f32) -> HashMap<u32, (Quat, Vec3, Vec3)>;
}
