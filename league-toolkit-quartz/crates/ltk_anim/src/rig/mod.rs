//! Read/write .skl
mod builder;
mod read;
mod write;
pub use builder::Builder;

use super::Joint;

/// Encapsulates a .skl file
#[derive(Debug, Clone, PartialEq)]
pub struct RigResource {
    flags: u16,
    name: String,
    asset_name: String,
    joints: Vec<Joint>,
    /// Influence id's
    influences: Vec<i16>,
}

impl RigResource {
    /// The FNV hash of the format token string
    const FORMAT_TOKEN: u32 = 0x22FD4FC3;

    pub fn builder(name: impl Into<String>, asset_name: impl Into<String>) -> Builder {
        Builder::new(name, asset_name)
    }

    pub fn flags(&self) -> u16 {
        self.flags
    }
    pub fn name(&self) -> &str {
        &self.name
    }
    pub fn asset_name(&self) -> &str {
        &self.asset_name
    }
    pub fn joints(&self) -> &[Joint] {
        &self.joints
    }
    pub fn influences(&self) -> &[i16] {
        &self.influences
    }
}
