use glam::Vec3;

/// A sphere. Origin and radius.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Sphere {
    pub origin: Vec3,
    pub radius: f32,
}

impl Sphere {
    pub const INFINITE: Sphere = Self::new(Vec3::ZERO, f32::INFINITY);

    #[inline]
    #[must_use]
    pub const fn new(origin: Vec3, radius: f32) -> Self {
        Self { origin, radius }
    }
}
