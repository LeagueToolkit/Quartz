use glam::Vec3;
use num_enum::{IntoPrimitive, TryFromPrimitive};

pub use range::*;

use crate::mem::{
    index::IndexBuffer,
    vertex::{ElementName, VertexBuffer, VertexBufferDescription},
};
use ltk_primitives::{Sphere, AABB};

use super::Result;

mod range;
mod read;
mod vertex;
mod write;

const MAGIC: u32 = 0x00112233;

#[derive(Debug, PartialEq)]
pub struct SkinnedMesh {
    aabb: AABB,
    bounding_sphere: Sphere,
    ranges: Vec<SkinnedMeshRange>,
    vertex_buffer: VertexBuffer,
    index_buffer: IndexBuffer<u16>,
}

impl SkinnedMesh {
    pub fn new(
        ranges: Vec<SkinnedMeshRange>,
        vertex_buffer: VertexBuffer,
        index_buffer: IndexBuffer<u16>,
    ) -> Self {
        let aabb = AABB::of_points(
            vertex_buffer
                .accessor::<Vec3>(ElementName::Position)
                .expect("vertex buffer must have position element")
                .iter(),
        );
        Self {
            bounding_sphere: aabb.bounding_sphere(),
            aabb,
            ranges,
            vertex_buffer,
            index_buffer,
        }
    }

    /// Bounding box of this mesh
    pub fn aabb(&self) -> AABB {
        self.aabb
    }

    /// Bounding sphere of this mesh
    pub fn bounding_sphere(&self) -> Sphere {
        self.bounding_sphere
    }

    pub fn ranges(&self) -> &[SkinnedMeshRange] {
        &self.ranges
    }

    pub fn vertex_buffer(&self) -> &VertexBuffer {
        &self.vertex_buffer
    }

    pub fn index_buffer(&self) -> &IndexBuffer<u16> {
        &self.index_buffer
    }
}

#[derive(
    TryFromPrimitive, IntoPrimitive, Debug, Clone, Copy, Ord, PartialOrd, Eq, PartialEq, Hash,
)]
#[repr(u32)]
pub enum SkinnedMeshVertexType {
    Basic,
    Color,
    Tangent,
}

impl From<SkinnedMeshVertexType> for VertexBufferDescription {
    fn from(value: SkinnedMeshVertexType) -> Self {
        match value {
            SkinnedMeshVertexType::Basic => vertex::BASIC.clone(),
            SkinnedMeshVertexType::Color => vertex::COLOR.clone(),
            SkinnedMeshVertexType::Tangent => vertex::TANGENT.clone(),
        }
    }
}
