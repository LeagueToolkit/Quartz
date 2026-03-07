use std::collections::BTreeMap;
use std::fmt::Debug;

use super::vertex::{
    ElementName, Format, VertexBufferAccessor, VertexBufferDescription, VertexBufferUsage,
    VertexElement,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct VertexBufferElementDescriptor {
    element: VertexElement,
    offset: isize,
}

impl VertexBufferElementDescriptor {
    pub fn new(element: VertexElement, offset: isize) -> Self {
        Self { element, offset }
    }

    pub fn element(&self) -> VertexElement {
        self.element
    }

    pub fn offset(&self) -> isize {
        self.offset
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
/// A collection of vertex elements that can be used to render a mesh.
///
/// Each vertex element is a collection of a single vertex attribute, like position, normal, or color.
pub struct VertexBuffer {
    description: VertexBufferDescription,
    elements: BTreeMap<ElementName, VertexBufferElementDescriptor>,

    stride: usize,
    count: usize,

    buffer: Vec<u8>,
}

impl VertexBuffer {
    pub fn new(usage: VertexBufferUsage, elements: Vec<VertexElement>, buffer: Vec<u8>) -> Self {
        if buffer.is_empty() {
            panic!("Buffer cannot be empty! FIXME (alan): don't panic here");
        }

        let description = VertexBufferDescription::new(usage, elements.clone());
        let mut element_descriptors = BTreeMap::new();
        let mut off = 0;
        for e in elements {
            if element_descriptors.contains_key(&e.name) {
                panic!("vertex buffer has duplicate elements! FIXME (alan): don't panic here :)");
            }
            element_descriptors.insert(e.name, VertexBufferElementDescriptor::new(e, off as isize));
            off += e.size()
        }
        let stride = off; // off collects the sizes of all the elements, which also happens to be the stride

        if !buffer.len().is_multiple_of(stride) {
            panic!("Buffer size must be a multiple of it's stride! size: {}, stride: {stride} FIXME (alan): don't panic here", buffer.len());
        }
        Self {
            description,
            elements: element_descriptors,
            stride,
            count: buffer.len() / stride,
            buffer,
        }
    }

    pub fn accessor<T: Format>(
        &self,
        element_name: ElementName,
    ) -> Option<VertexBufferAccessor<'_, T>> {
        self.elements
            .get(&element_name)
            .map(|desc| VertexBufferAccessor::<T>::new(desc.element, desc.offset as usize, self))
    }

    pub fn description(&self) -> &VertexBufferDescription {
        &self.description
    }

    pub fn elements(&self) -> &BTreeMap<ElementName, VertexBufferElementDescriptor> {
        &self.elements
    }

    /// The size in bytes of all the element sizes combined (i.e. all the data for a single vertex).
    pub fn stride(&self) -> usize {
        self.stride
    }

    /// The number of vertices in the buffer.
    pub fn count(&self) -> usize {
        self.count
    }

    /// Get a slice of the underlying bytes.
    pub fn as_bytes(&self) -> &[u8] {
        &self.buffer
    }

    /// Take ownership of the underlying bytes.
    pub fn into_inner(self) -> Vec<u8> {
        self.buffer
    }
}
