use glam::{Mat4, Quat, Vec3};

mod builder;
pub mod legacy;
mod read;
mod write;

pub use builder::Builder;

#[derive(Debug, Clone, PartialEq)]
pub struct Joint {
    name: String,
    flags: u16,
    id: i16,
    parent_id: i16,
    radius: f32,
    local_transform: Mat4,
    local_translation: Vec3,
    local_scale: Vec3,
    local_rotation: Quat,
    inverse_bind_transform: Mat4,
    inverse_bind_translation: Vec3,
    inverse_bind_scale: Vec3,
    inverse_bind_rotation: Quat,
}

impl Joint {
    pub fn builder(name: impl Into<String>) -> Builder {
        Builder::new(name)
    }
    pub fn name(&self) -> &str {
        &self.name
    }
    pub fn flags(&self) -> u16 {
        self.flags
    }
    pub fn id(&self) -> i16 {
        self.id
    }
    pub fn parent_id(&self) -> i16 {
        self.parent_id
    }
    pub fn radius(&self) -> f32 {
        self.radius
    }
    pub fn local_transform(&self) -> Mat4 {
        self.local_transform
    }
    pub fn local_translation(&self) -> Vec3 {
        self.local_translation
    }
    pub fn local_scale(&self) -> Vec3 {
        self.local_scale
    }
    pub fn local_rotation(&self) -> Quat {
        self.local_rotation
    }
    pub fn inverse_bind_transform(&self) -> Mat4 {
        self.inverse_bind_transform
    }
    pub fn inverse_bind_translation(&self) -> Vec3 {
        self.inverse_bind_translation
    }
    pub fn inverse_bind_scale(&self) -> Vec3 {
        self.inverse_bind_scale
    }
    pub fn inverse_bind_rotation(&self) -> Quat {
        self.inverse_bind_rotation
    }
}
