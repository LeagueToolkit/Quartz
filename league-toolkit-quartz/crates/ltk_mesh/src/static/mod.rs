use glam::Vec3;
use ltk_primitives::{Color, AABB};

pub use face::*;

mod face;
mod read;
mod write;

pub const MAGIC: &[u8] = b"r3d2Mesh";

bitflags::bitflags! {
    /// Flags for static mesh features
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub struct StaticMeshFlags: u32 {
        /// Face vertex colors are present (RGB u8 per face vertex)
        const HAS_VCP = 1;
        /// Has local origin locator and pivot
        const HAS_LOCAL_ORIGIN_LOCATOR_AND_PIVOT = 2;
    }
}

/// A static (non-skinned) mesh
#[derive(Clone, Debug)]
pub struct StaticMesh {
    name: String,
    vertices: Vec<Vec3>,
    faces: Vec<StaticMeshFace>,
    /// Per-vertex colors (optional, stored as BGRA u8 in file)
    vertex_colors: Option<Vec<Color<u8>>>,
}

impl StaticMesh {
    /// Creates a new static mesh without vertex colors
    pub fn new(name: impl Into<String>, vertices: Vec<Vec3>, faces: Vec<StaticMeshFace>) -> Self {
        Self {
            name: name.into(),
            vertices,
            faces,
            vertex_colors: None,
        }
    }

    /// Creates a new static mesh with vertex colors
    ///
    /// # Panics
    /// Panics if vertex_colors length doesn't match vertices length
    pub fn with_vertex_colors(
        name: impl Into<String>,
        vertices: Vec<Vec3>,
        faces: Vec<StaticMeshFace>,
        vertex_colors: Vec<Color<u8>>,
    ) -> Self {
        assert_eq!(
            vertices.len(),
            vertex_colors.len(),
            "Vertex colors count must match vertices count"
        );
        Self {
            name: name.into(),
            vertices,
            faces,
            vertex_colors: Some(vertex_colors),
        }
    }

    /// Returns the mesh name
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Returns the vertices
    pub fn vertices(&self) -> &[Vec3] {
        &self.vertices
    }

    /// Returns the faces
    pub fn faces(&self) -> &[StaticMeshFace] {
        &self.faces
    }

    /// Returns the vertex colors if present
    pub fn vertex_colors(&self) -> Option<&[Color<u8>]> {
        self.vertex_colors.as_deref()
    }

    /// Returns whether this mesh has per-vertex colors
    pub fn has_vertex_colors(&self) -> bool {
        self.vertex_colors.is_some()
    }

    /// Computes the axis-aligned bounding box of the mesh
    pub fn bounding_box(&self) -> AABB {
        AABB::of_points(self.vertices.iter().copied())
    }
}
