//! Animation assets
mod compressed;

pub use compressed::*;

mod uncompressed;

pub use uncompressed::*;

mod traits;

pub use traits::Animation;

pub mod error;
mod error_metric;

pub use error::*;
pub use error_metric::ErrorMetric;

use error::AssetParseError::UnknownAssetType;
use glam::{Quat, Vec3};
use std::borrow::Cow;
use std::collections::HashMap;
use std::io;
use std::io::{Read, Seek, SeekFrom};

/// Encapsulates a .anm file
#[derive(Clone, Debug)]
pub enum AnimationAsset {
    Uncompressed(Uncompressed),
    Compressed(Compressed),
}

/// The type of animation asset
#[derive(Clone, Copy, Debug, Hash, PartialEq, Eq)]
pub enum AnimationAssetType {
    Uncompressed,
    Compressed,
    Unknown,
}

impl AnimationAsset {
    pub fn from_reader<R: Read + Seek + ?Sized>(reader: &mut R) -> error::Result<AnimationAsset> {
        let asset_type = Self::identify_from_reader(reader)?;
        reader.seek(SeekFrom::Start(0))?;
        match asset_type {
            AnimationAssetType::Uncompressed => {
                Uncompressed::from_reader(reader).map(Self::Uncompressed)
            }
            AnimationAssetType::Compressed => Compressed::from_reader(reader).map(Self::Compressed),
            AnimationAssetType::Unknown => Err(UnknownAssetType),
        }
    }

    /// Reads the animation magic (8 bytes), and identifies the animation asset type
    pub fn identify_from_reader<R: Read + ?Sized>(
        reader: &mut R,
    ) -> io::Result<AnimationAssetType> {
        let mut magic = [0_u8; 8];
        reader.read_exact(&mut magic)?;

        Ok(match &magic {
            b"r3d2anmd" => AnimationAssetType::Uncompressed,
            b"r3d2canm" => AnimationAssetType::Compressed,
            _ => AnimationAssetType::Unknown,
        })
    }

    /// Returns the type of animation asset
    pub fn asset_type(&self) -> AnimationAssetType {
        match self {
            AnimationAsset::Uncompressed(_) => AnimationAssetType::Uncompressed,
            AnimationAsset::Compressed(_) => AnimationAssetType::Compressed,
        }
    }
}

impl Animation for AnimationAsset {
    fn duration(&self) -> f32 {
        match self {
            AnimationAsset::Uncompressed(u) => u.duration(),
            AnimationAsset::Compressed(c) => c.duration(),
        }
    }

    fn fps(&self) -> f32 {
        match self {
            AnimationAsset::Uncompressed(u) => u.fps(),
            AnimationAsset::Compressed(c) => c.fps(),
        }
    }

    fn joint_count(&self) -> usize {
        match self {
            AnimationAsset::Uncompressed(u) => u.joint_count(),
            AnimationAsset::Compressed(c) => c.joint_count(),
        }
    }

    fn joints(&self) -> Cow<'_, [u32]> {
        match self {
            AnimationAsset::Uncompressed(u) => u.joints(),
            AnimationAsset::Compressed(c) => Animation::joints(c),
        }
    }

    fn evaluate(&self, time: f32) -> HashMap<u32, (Quat, Vec3, Vec3)> {
        match self {
            AnimationAsset::Uncompressed(u) => u.evaluate(time),
            AnimationAsset::Compressed(c) => c.evaluate(time),
        }
    }
}
