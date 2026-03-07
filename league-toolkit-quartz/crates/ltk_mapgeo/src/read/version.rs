//! Version-dependent feature flags

/// Helper struct for tracking file version capabilities
#[derive(Debug, Clone, Copy)]
pub(crate) struct MapGeoVersion(pub u32);

impl MapGeoVersion {
    /// Version has mesh names stored in the file
    #[inline]
    pub fn has_mesh_names(&self) -> bool {
        self.0 <= 11
    }

    /// Version has separate point lights flag
    #[inline]
    pub fn has_separate_point_lights_flag(&self) -> bool {
        self.0 < 7
    }

    /// Version has visibility flags on meshes (early position)
    #[inline]
    pub fn has_early_visibility_flags(&self) -> bool {
        self.0 >= 13
    }

    /// Version has visibility controller path hash
    #[inline]
    pub fn has_visibility_controller_path_hash(&self) -> bool {
        self.0 >= 15
    }

    /// Version has backface culling flag (all versions except 5)
    #[inline]
    pub fn has_backface_culling_flag(&self) -> bool {
        self.0 != 5
    }

    /// Version has mid-position visibility flags
    #[inline]
    pub fn has_mid_visibility_flags(&self) -> bool {
        self.0 >= 7 && self.0 <= 12
    }

    /// Version has old-style render flags (byte)
    #[inline]
    pub fn has_old_render_flags(&self) -> bool {
        self.0 >= 11 && self.0 < 14
    }

    /// Version has new-style render flags with transition behavior
    #[inline]
    pub fn has_new_render_flags(&self) -> bool {
        self.0 >= 14
    }

    /// Version uses u16 for render flags (instead of u8)
    #[inline]
    pub fn has_u16_render_flags(&self) -> bool {
        self.0 >= 16
    }

    /// Version has spherical harmonics
    #[inline]
    pub fn has_spherical_harmonics(&self) -> bool {
        self.0 < 9
    }

    /// Version has stationary light channel
    #[inline]
    #[allow(dead_code)]
    pub fn has_stationary_light(&self) -> bool {
        self.0 >= 9
    }

    /// Version has baked paint channel (single, old format)
    #[inline]
    pub fn has_old_baked_paint(&self) -> bool {
        self.0 >= 12 && self.0 < 17
    }

    /// Version has texture overrides (new format)
    #[inline]
    pub fn has_texture_overrides(&self) -> bool {
        self.0 >= 17
    }

    /// Version has planar reflectors
    #[inline]
    pub fn has_planar_reflectors(&self) -> bool {
        self.0 >= 13
    }

    /// Version has multiple scene graphs
    #[inline]
    pub fn has_multiple_scene_graphs(&self) -> bool {
        self.0 >= 15
    }

    /// Version uses new shader texture override format
    #[inline]
    pub fn has_new_shader_override_format(&self) -> bool {
        self.0 >= 17
    }

    /// Version has first shader texture override (sampler index 0)
    #[inline]
    pub fn has_first_shader_override(&self) -> bool {
        self.0 >= 9
    }

    /// Version has second shader texture override (sampler index 1)
    #[inline]
    pub fn has_second_shader_override(&self) -> bool {
        self.0 >= 11
    }
}
