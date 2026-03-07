use glam::{vec2, vec3, vec4, Vec2, Vec3, Vec4};
use std::marker::PhantomData;

use super::vertex::{VertexBuffer, VertexElement};

/// A trait for reading vertex element data in a given format
pub trait Format {
    type Item;
    #[must_use]
    fn read(buffer: &VertexBuffer, index: usize, element_offset: usize) -> Self::Item;
}

/// Get the offset of a single vertex element for a single vertex in a vertex buffer.
fn offset(buffer: &VertexBuffer, index: usize, element_offset: usize) -> usize {
    buffer.stride() * index + element_offset
}

/// A view over all vertices of a single [`VertexElement`] in a [`VertexBuffer`]
pub struct VertexBufferAccessor<'a, T: Format> {
    buffer: &'a VertexBuffer,
    _element: VertexElement,
    element_off: usize,

    _t: PhantomData<T>,
}

impl<'a, T: Format> VertexBufferAccessor<'a, T> {
    /// Creates a new VertexBufferAccessor. The type of element is **not** checked, so the caller must ensure that the element format matches the format of the accessor.
    pub(super) fn new(
        element: VertexElement,
        element_off: usize,
        buffer: &'a VertexBuffer,
    ) -> VertexBufferAccessor<'a, T> {
        VertexBufferAccessor {
            buffer,
            _element: element,
            element_off,
            _t: PhantomData,
        }
    }

    #[inline(always)]
    #[must_use]
    pub fn iter(&'a self) -> Iter<'a, T> {
        Iter {
            view: self,
            counter: 0,
        }
    }
    // TODO (alan): impl the rest of the ElementFormat's
}

// TODO(alan): figure out endianness (again)

impl Format for f32 {
    type Item = f32;
    fn read(buffer: &VertexBuffer, index: usize, element_off: usize) -> f32 {
        let offset = offset(buffer, index, element_off);
        let buf = buffer.as_bytes();
        f32::from_le_bytes(buf[offset..offset + 4].try_into().unwrap())
    }
}

impl Format for Vec2 {
    type Item = Vec2;
    fn read(buffer: &VertexBuffer, index: usize, element_off: usize) -> Vec2 {
        let offset = offset(buffer, index, element_off);
        let buf = buffer.as_bytes();
        let x = f32::from_le_bytes(buf[offset..offset + 4].try_into().unwrap());
        let y = f32::from_le_bytes(buf[offset + 4..offset + 8].try_into().unwrap());
        vec2(x, y)
    }
}

impl Format for Vec3 {
    type Item = Vec3;
    fn read(buffer: &VertexBuffer, index: usize, element_off: usize) -> Vec3 {
        let offset = offset(buffer, index, element_off);
        let buf = buffer.as_bytes();
        let x = f32::from_le_bytes(buf[offset..offset + 4].try_into().unwrap());
        let y = f32::from_le_bytes(buf[offset + 4..offset + 8].try_into().unwrap());
        let z = f32::from_le_bytes(buf[offset + 8..offset + 12].try_into().unwrap());
        vec3(x, y, z)
    }
}

impl Format for Vec4 {
    type Item = Vec4;
    fn read(buffer: &VertexBuffer, index: usize, element_off: usize) -> Vec4 {
        let offset = offset(buffer, index, element_off);
        let buf = buffer.as_bytes();
        let x = f32::from_le_bytes(buf[offset..offset + 4].try_into().unwrap());
        let y = f32::from_le_bytes(buf[offset + 4..offset + 8].try_into().unwrap());
        let z = f32::from_le_bytes(buf[offset + 8..offset + 12].try_into().unwrap());
        let w = f32::from_le_bytes(buf[offset + 12..offset + 16].try_into().unwrap());
        vec4(x, y, z, w)
    }
}

impl Format for [u8; 4] {
    type Item = [u8; 4];
    fn read(buffer: &VertexBuffer, index: usize, element_off: usize) -> [u8; 4] {
        let offset = offset(buffer, index, element_off);
        let buf = buffer.as_bytes();
        [
            buf[offset],
            buf[offset + 1],
            buf[offset + 2],
            buf[offset + 3],
        ]
    }
}

/// Iterator of a [`VertexBufferAccessor`]
pub struct Iter<'a, T: Format> {
    view: &'a VertexBufferAccessor<'a, T>,
    counter: usize,
}

impl<T: Format> Iterator for Iter<'_, T> {
    type Item = T::Item;

    fn next(&mut self) -> Option<Self::Item> {
        if self.counter >= self.view.buffer.count() {
            return None;
        }
        let item = T::read(self.view.buffer, self.counter, self.view.element_off);
        self.counter += 1;
        Some(item)
    }
}
