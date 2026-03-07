//! League memory primitives (index / vertex buffers, etc)
pub mod index;

pub use index::IndexBuffer;

mod vertex_buffer;
mod vertex_buffer_accessor;
mod vertex_buffer_description;
mod vertex_element;

pub mod vertex {
    //! Vertex buffer types
    pub use super::vertex_buffer::*;
    pub use super::vertex_buffer_accessor::*;
    pub use super::vertex_buffer_description::*;
    pub use super::vertex_element::*;
}

pub use vertex::{
    VertexBuffer, VertexBufferAccessor, VertexBufferDescription, VertexBufferElementDescriptor,
    VertexBufferElementFlags, VertexBufferUsage, VertexElement,
};
