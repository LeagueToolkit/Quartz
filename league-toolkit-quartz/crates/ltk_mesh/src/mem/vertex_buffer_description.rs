use super::vertex::{ElementName, VertexBuffer, VertexElement};
use bitflags::bitflags;
use num_enum::{IntoPrimitive, TryFromPrimitive};

#[repr(u32)]
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, TryFromPrimitive, IntoPrimitive)]
pub enum VertexBufferUsage {
    Static,
    Dynamic,
    Stream,
}

bitflags! {
    #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
    pub struct VertexBufferElementFlags: u32 {
        const Position = 1 << (ElementName::Position as u32);
        const BlendWeight = 1 << (ElementName::BlendWeight as u32);
        const Normal = 1 << (ElementName::Normal as u32);
        const FogCoordinate = 1 << (ElementName::FogCoordinate as u32);
        const PrimaryColor = 1 << (ElementName::PrimaryColor as u32);
        const SecondaryColor = 1 << (ElementName::SecondaryColor as u32);
        const BlendIndex = 1 << (ElementName::BlendIndex as u32);
        const DiffuseUV = 1 << (ElementName::Texcoord0 as u32);
        const Texcoord1 = 1 << (ElementName::Texcoord1 as u32);
        const Texcoord2 = 1 << (ElementName::Texcoord2 as u32);
        const Texcoord3 = 1 << (ElementName::Texcoord3 as u32);
        const Texcoord4 = 1 << (ElementName::Texcoord4 as u32);
        const Texcoord5 = 1 << (ElementName::Texcoord5 as u32);
        const Texcoord6 = 1 << (ElementName::Texcoord6 as u32);
        const LightmapUV = 1 << (ElementName::Texcoord7 as u32);

        const Tangent = 1 << (ElementName::Tangent as u32);
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
/// Holds the element descriptions, flags & usage information for a [`VertexBuffer`].
pub struct VertexBufferDescription {
    usage: VertexBufferUsage,
    description_flags: VertexBufferElementFlags,
    elements: Vec<VertexElement>,
}

pub fn get_element_flags(
    elements: impl IntoIterator<Item = ElementName>,
) -> VertexBufferElementFlags {
    let mut flags = VertexBufferElementFlags::empty();
    for e in elements {
        flags |= VertexBufferElementFlags::from_bits(1 << (e as u32)).unwrap();
    }
    flags
}

impl VertexBufferDescription {
    pub fn new(usage: VertexBufferUsage, elements: Vec<VertexElement>) -> Self {
        Self {
            usage,
            description_flags: get_element_flags(elements.iter().map(|e| e.name)),
            elements,
        }
    }

    pub fn vertex_size(&self) -> usize {
        self.elements.iter().map(|e| e.size()).sum()
    }

    pub fn usage(&self) -> VertexBufferUsage {
        self.usage
    }
    pub fn description_flags(&self) -> VertexBufferElementFlags {
        self.description_flags
    }
    pub fn elements(&self) -> &[VertexElement] {
        &self.elements
    }

    pub fn into_vertex_buffer(self, buf: Vec<u8>) -> VertexBuffer {
        VertexBuffer::new(self.usage, self.elements, buf)
    }
}
