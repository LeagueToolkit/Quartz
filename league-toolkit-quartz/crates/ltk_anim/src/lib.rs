//! Skeletons (rigs, joints) & animations
pub mod joint;

pub use joint::{legacy, Joint};

pub mod error;

pub use error::*;

pub mod asset;
pub mod quantized;
pub mod rig;

pub use asset::{
    Animation, AnimationAsset, AnimationAssetType, AssetParseError, Compressed,
    CompressedEvaluator, ErrorMetric, Uncompressed,
};

pub use rig::RigResource;

/// Joint builder
pub use joint::Builder as JointBuilder;
/// Rig builder
pub use rig::Builder as RigBuilder;
