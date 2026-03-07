//! Shader texture override definition

/// A shader texture override allows replacing a texture sampler globally.
///
/// These overrides are applied to all materials using a specific sampler index,
/// enabling features like global environment maps or lighting textures.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShaderTextureOverride {
    /// The sampler index to override
    sampler_index: u32,
    /// The texture path to use
    texture_path: String,
}

impl ShaderTextureOverride {
    /// Creates a new shader texture override
    pub fn new(sampler_index: u32, texture_path: String) -> Self {
        Self {
            sampler_index,
            texture_path,
        }
    }

    /// The sampler index this override applies to
    #[inline]
    pub fn sampler_index(&self) -> u32 {
        self.sampler_index
    }

    /// The texture path to use for this override
    #[inline]
    pub fn texture_path(&self) -> &str {
        &self.texture_path
    }
}
