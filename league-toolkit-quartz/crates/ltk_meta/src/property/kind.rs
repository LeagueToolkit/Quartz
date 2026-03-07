use super::Error;
use crate::PropertyValueEnum;
use num_enum::{IntoPrimitive, TryFromPrimitive};
use std::io;

#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    IntoPrimitive,
    TryFromPrimitive,
    Default,
)]
#[repr(u8)]
pub enum Kind {
    // PRIMITIVE TYPES
    #[default]
    None = 0,
    Bool = 1,
    I8 = 2,
    U8 = 3,
    I16 = 4,
    U16 = 5,
    I32 = 6,
    U32 = 7,
    I64 = 8,
    U64 = 9,
    F32 = 10,
    Vector2 = 11,
    Vector3 = 12,
    Vector4 = 13,
    Matrix44 = 14,
    Color = 15,
    String = 16,
    Hash = 17,
    WadChunkLink = 18, // newly added

    // COMPLEX TYPES
    Container = 128,
    UnorderedContainer = 128 | 1,
    Struct = 128 | 2,
    Embedded = 128 | 3,
    ObjectLink = 128 | 4,
    Optional = 128 | 5,
    Map = 128 | 6,
    BitBool = 128 | 7,
}

impl Kind {
    /// Converts a u8 into a BinPropertyKind, accounting for pre/post WadChunkLink.
    ///
    /// The WadChunkLink bin property type was newly added by Riot. For some reason they decided to put it in the middle of the enum,
    /// so we need to handle cases from before and after it existed.
    ///
    /// "Legacy" property types need to be fudged around to pretend like WadChunkLink always existed, from our pov.
    ///
    /// "Non-legacy" property types can just be used as is.
    ///
    pub fn unpack(raw: u8, legacy: bool) -> Result<Kind, Error> {
        use Kind as BPK;
        if !legacy {
            return Ok(BPK::try_from_primitive(raw)?);
        }
        let mut fudged = raw;

        // if the prop type comes after where WadChunkLink is now, we need to fudge it
        if fudged >= BPK::WadChunkLink.into() && fudged < BPK::Container.into() {
            fudged -= Into::<u8>::into(BPK::WadChunkLink);
            fudged |= Into::<u8>::into(BPK::Container);
        }

        if fudged >= BPK::UnorderedContainer.into() {
            fudged += 1;
        }

        Ok(Kind::try_from_primitive(fudged)?)
    }

    /// Whether this property kind is a primitive type. (i8, u8, .. u32, u64, f32, Vector2, Vector3, Vector4, Matrix44, Color, String, Hash, WadChunkLink),
    #[inline(always)]
    #[must_use]
    pub fn is_primitive(&self) -> bool {
        use Kind::*;
        matches!(
            self,
            None | Bool
                | I8
                | U8
                | I16
                | U16
                | I32
                | U32
                | I64
                | U64
                | F32
                | Vector2
                | Vector3
                | Vector4
                | Matrix44
                | Color
                | String
                | Hash
                | WadChunkLink
        )
    }

    /// Whether this property kind is a container type (container, unordered container, optional, map).
    #[inline(always)]
    #[must_use]
    pub fn is_container(&self) -> bool {
        self.subtype_count() > 0
    }

    #[inline(always)]
    #[must_use]
    pub fn subtype_count(&self) -> u8 {
        use Kind::*;
        match self {
            Container | UnorderedContainer | Optional => 1,
            Map => 2,
            _ => 0,
        }
    }

    #[inline(always)]
    pub fn read<R: io::Read + std::io::Seek + ?Sized, M: Default>(
        self,
        reader: &mut R,
        legacy: bool,
    ) -> Result<PropertyValueEnum<M>, super::Error> {
        PropertyValueEnum::from_reader(reader, self, legacy)
    }

    pub fn default_value<M: Default>(self) -> PropertyValueEnum<M> {
        match self {
            Self::None => PropertyValueEnum::None(Default::default()),
            Self::Bool => PropertyValueEnum::Bool(Default::default()),
            Self::I8 => PropertyValueEnum::I8(Default::default()),
            Self::U8 => PropertyValueEnum::U8(Default::default()),
            Self::I16 => PropertyValueEnum::I16(Default::default()),
            Self::U16 => PropertyValueEnum::U16(Default::default()),
            Self::I32 => PropertyValueEnum::I32(Default::default()),
            Self::U32 => PropertyValueEnum::U32(Default::default()),
            Self::I64 => PropertyValueEnum::I64(Default::default()),
            Self::U64 => PropertyValueEnum::U64(Default::default()),
            Self::F32 => PropertyValueEnum::F32(Default::default()),
            Self::Vector2 => PropertyValueEnum::Vector2(Default::default()),
            Self::Vector3 => PropertyValueEnum::Vector3(Default::default()),
            Self::Vector4 => PropertyValueEnum::Vector4(Default::default()),
            Self::Matrix44 => PropertyValueEnum::Matrix44(Default::default()),
            Self::Color => PropertyValueEnum::Color(Default::default()),
            Self::String => PropertyValueEnum::String(Default::default()),
            Self::Hash => PropertyValueEnum::Hash(Default::default()),
            Self::WadChunkLink => PropertyValueEnum::WadChunkLink(Default::default()),
            Self::Container => PropertyValueEnum::Container(Default::default()),
            Self::UnorderedContainer => PropertyValueEnum::UnorderedContainer(Default::default()),
            Self::Struct => PropertyValueEnum::Struct(Default::default()),
            Self::Embedded => PropertyValueEnum::Embedded(Default::default()),
            Self::ObjectLink => PropertyValueEnum::ObjectLink(Default::default()),
            Self::Optional => PropertyValueEnum::Optional(Default::default()),
            Self::Map => PropertyValueEnum::Map(Default::default()),
            Self::BitBool => PropertyValueEnum::BitBool(Default::default()),
        }
    }
}
