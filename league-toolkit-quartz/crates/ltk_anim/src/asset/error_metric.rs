use byteorder::{ReadBytesExt, LE};
use std::io;
use std::io::Read;

/// Error metric for animation transform components.
///
/// These values are used by the engine's rig pose modifier system to control
/// data-driven animation behaviors. Each transform type (rotation, translation, scale)
/// has its own error metric.
///
/// # Engine Integration
///
/// The metrics feed into `BaseRigPoseModifierData` and its subtypes:
/// - `JointSnapRigPoseModifierData` - Snapping joints to IK targets or attach points
/// - `ConformToPathRigPoseModifierData` - Path following with blend distances and activation thresholds
/// - `SpringPhysicsRigPoseModifierData` - Spring dynamics with stiffness/damping
/// - `LockRootOrientationRigPoseModifierData` - Locking root bone orientation
/// - `SyncedAnimationRigPoseModifierData` - Synchronized animation blending
/// - `VertexAnimationRigPoseModifierData` - Vertex-level animation
#[derive(Clone, Debug)]
#[allow(dead_code)]
pub struct ErrorMetric {
    /// Tolerance margin for snapping and blending behaviors.
    /// Controls how much deviation is allowed before correction is applied.
    pub margin: f32,

    /// Threshold that triggers discontinuity handling.
    /// When the change between keyframes exceeds this, special transition
    /// logic is applied (e.g., instant snaps, path waypoint transitions).
    pub discontinuity_threshold: f32,
}

impl Default for ErrorMetric {
    fn default() -> Self {
        Self {
            margin: 2.0,
            discontinuity_threshold: 10.0,
        }
    }
}

impl ErrorMetric {
    pub fn new(margin: f32, discontinuity_threshold: f32) -> Self {
        Self {
            margin,
            discontinuity_threshold,
        }
    }

    pub fn from_reader<R: Read + ?Sized>(reader: &mut R) -> io::Result<Self> {
        Ok(Self::new(
            reader.read_f32::<LE>()?,
            reader.read_f32::<LE>()?,
        ))
    }
}
