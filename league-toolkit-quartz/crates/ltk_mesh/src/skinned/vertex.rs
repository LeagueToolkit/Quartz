use lazy_static::lazy_static;

use crate::mem::{VertexBufferDescription, VertexBufferUsage, VertexElement};
lazy_static! {
    pub static ref BASIC: VertexBufferDescription = VertexBufferDescription::new(
        VertexBufferUsage::Static,
        vec![
            VertexElement::POSITION,
            VertexElement::BLEND_INDEX,
            VertexElement::BLEND_WEIGHT,
            VertexElement::NORMAL,
            VertexElement::TEXCOORD_0,
        ],
    );
    pub static ref COLOR: VertexBufferDescription = VertexBufferDescription::new(
        VertexBufferUsage::Static,
        vec![
            VertexElement::POSITION,
            VertexElement::BLEND_INDEX,
            VertexElement::BLEND_WEIGHT,
            VertexElement::NORMAL,
            VertexElement::TEXCOORD_0,
            VertexElement::PRIMARY_COLOR,
        ],
    );
    pub static ref TANGENT: VertexBufferDescription = VertexBufferDescription::new(
        VertexBufferUsage::Static,
        vec![
            VertexElement::POSITION,
            VertexElement::BLEND_INDEX,
            VertexElement::BLEND_WEIGHT,
            VertexElement::NORMAL,
            VertexElement::TEXCOORD_0,
            VertexElement::PRIMARY_COLOR,
            VertexElement::TANGENT,
        ],
    );
}
