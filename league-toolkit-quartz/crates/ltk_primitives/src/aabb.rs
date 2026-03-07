use super::Sphere;
use glam::{vec3, Vec3};

/// Axis-aligned bounding box
#[derive(Default, Debug, Clone, Copy, PartialEq)]
pub struct AABB {
    pub min: Vec3,
    pub max: Vec3,
}

impl AABB {
    /// Creates a new axis-aligned bounding box from min and max corner points
    pub fn from_corners(min: Vec3, max: Vec3) -> Self {
        Self { min, max }
    }
}

fn dist(a: &Vec3, b: &Vec3) -> f32 {
    ((a[0] - b[0]).powf(2.0) + (a[1] - b[1]).powf(2.0) + (a[2] - b[2]).powf(2.0)).sqrt()
}

impl AABB {
    /// Compute the center point of the axis-aligned bounding box
    #[inline]
    #[must_use]
    pub fn center(&self) -> Vec3 {
        Vec3::new(
            0.5 * (self.min[0] + self.max[0]),
            0.5 * (self.min[1] + self.max[1]),
            0.5 * (self.min[2] + self.max[2]),
        )
    }

    /// Compute the smallest sphere that contains this AABB
    #[inline]
    #[must_use]
    pub fn bounding_sphere(&self) -> Sphere {
        let center = self.center();
        Sphere::new(center, dist(&center, &self.max))
    }

    /// Calculate the AABB of a set of points
    #[must_use]
    pub fn of_points(verts: impl IntoIterator<Item = Vec3>) -> Self {
        let mut min = vec3(f32::INFINITY, f32::INFINITY, f32::INFINITY);
        let mut max = vec3(f32::NEG_INFINITY, f32::NEG_INFINITY, f32::NEG_INFINITY);
        for v in verts {
            for i in 0..3 {
                if v[i] < min[i] {
                    min[i] = v[i];
                }
                if v[i] > max[i] {
                    max[i] = v[i];
                }
            }
        }
        Self { min, max }
    }
}
