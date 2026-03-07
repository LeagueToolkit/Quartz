//! Type name mappings for ritobin format.

use ltk_meta::PropertyKind;
use std::str::FromStr;

/// Maps a ritobin type name string to a [`ltk_meta::PropertyKind`].
pub fn type_name_to_kind(name: &str) -> Option<PropertyKind> {
    match name {
        "none" => Some(PropertyKind::None),
        "bool" => Some(PropertyKind::Bool),
        "i8" => Some(PropertyKind::I8),
        "u8" => Some(PropertyKind::U8),
        "i16" => Some(PropertyKind::I16),
        "u16" => Some(PropertyKind::U16),
        "i32" => Some(PropertyKind::I32),
        "u32" => Some(PropertyKind::U32),
        "i64" => Some(PropertyKind::I64),
        "u64" => Some(PropertyKind::U64),
        "f32" => Some(PropertyKind::F32),
        "vec2" => Some(PropertyKind::Vector2),
        "vec3" => Some(PropertyKind::Vector3),
        "vec4" => Some(PropertyKind::Vector4),
        "mtx44" => Some(PropertyKind::Matrix44),
        "rgba" => Some(PropertyKind::Color),
        "string" => Some(PropertyKind::String),
        "hash" => Some(PropertyKind::Hash),
        "file" => Some(PropertyKind::WadChunkLink),
        "list" => Some(PropertyKind::Container),
        "list2" => Some(PropertyKind::UnorderedContainer),
        "pointer" => Some(PropertyKind::Struct),
        "embed" => Some(PropertyKind::Embedded),
        "link" => Some(PropertyKind::ObjectLink),
        "option" => Some(PropertyKind::Optional),
        "map" => Some(PropertyKind::Map),
        "flag" => Some(PropertyKind::BitBool),
        _ => None,
    }
}

/// Maps a [`ltk_meta::PropertyKind`] to its ritobin type name string.
pub fn kind_to_type_name(kind: PropertyKind) -> &'static str {
    match kind {
        PropertyKind::None => "none",
        PropertyKind::Bool => "bool",
        PropertyKind::I8 => "i8",
        PropertyKind::U8 => "u8",
        PropertyKind::I16 => "i16",
        PropertyKind::U16 => "u16",
        PropertyKind::I32 => "i32",
        PropertyKind::U32 => "u32",
        PropertyKind::I64 => "i64",
        PropertyKind::U64 => "u64",
        PropertyKind::F32 => "f32",
        PropertyKind::Vector2 => "vec2",
        PropertyKind::Vector3 => "vec3",
        PropertyKind::Vector4 => "vec4",
        PropertyKind::Matrix44 => "mtx44",
        PropertyKind::Color => "rgba",
        PropertyKind::String => "string",
        PropertyKind::Hash => "hash",
        PropertyKind::WadChunkLink => "file",
        PropertyKind::Container => "list",
        PropertyKind::UnorderedContainer => "list2",
        PropertyKind::Struct => "pointer",
        PropertyKind::Embedded => "embed",
        PropertyKind::ObjectLink => "link",
        PropertyKind::Optional => "option",
        PropertyKind::Map => "map",
        PropertyKind::BitBool => "flag",
    }
}

/// Ritobin type representation for parsing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RitobinType {
    pub kind: PropertyKind,
    pub inner_kind: Option<PropertyKind>,
    pub value_kind: Option<PropertyKind>,
}

impl RitobinType {
    pub fn simple(kind: PropertyKind) -> Self {
        Self {
            kind,
            inner_kind: None,
            value_kind: None,
        }
    }

    pub fn container(kind: PropertyKind, inner: PropertyKind) -> Self {
        Self {
            kind,
            inner_kind: Some(inner),
            value_kind: None,
        }
    }

    pub fn map(key: PropertyKind, value: PropertyKind) -> Self {
        Self {
            kind: PropertyKind::Map,
            inner_kind: Some(key),
            value_kind: Some(value),
        }
    }
}

impl FromStr for RitobinType {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        type_name_to_kind(s).map(RitobinType::simple).ok_or(())
    }
}
