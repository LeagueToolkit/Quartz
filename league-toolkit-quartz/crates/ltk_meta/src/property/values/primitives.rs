use crate::{
    property::{Kind, NoMeta},
    traits::{PropertyExt, PropertyValueExt, ReadProperty, WriteProperty},
};
use ltk_io_ext::{ReaderExt, WriterExt};

macro_rules! impl_prim {
    ($name:tt, $rust:tt, [$($derive:tt),*], $method:ident $(::<$endian:ident>)?) => {
        impl_prim!($name, $rust, [$( $derive ),*], $method $(::< $endian >)?, value);
    };
    ($name:tt, $rust:tt, [$($derive:tt),*], $method:ident $(::<$endian:ident>)?, $($write_value:tt)*) => {
        #[derive(Clone, Debug, PartialEq, Default, $($derive),*)]
        #[cfg_attr(
            feature = "serde",
            derive(serde::Serialize, serde::Deserialize),
            serde(bound = "for <'dee> M: serde::Serialize + serde::Deserialize<'dee>")
        )]
        pub struct $name<M = NoMeta>{
            pub value: $rust,
            pub meta: M
        }

        impl<M: Default> $name<M> {
            #[inline(always)]
            #[must_use]
            pub fn new(value: $rust) -> Self {
                Self { value, meta: M::default() }
            }
        }

        impl<M> PropertyExt for $name<M> {
            fn size_no_header(&self) -> usize {
                core::mem::size_of::<$rust>()
            }
        }

        impl<M> PropertyValueExt for $name<M> {
            const KIND: Kind = Kind::$name;
        }

        impl<M: Default> ReadProperty for $name<M> {
            fn from_reader<R: std::io::Read + ?Sized>(
                reader: &mut R,
                _legacy: bool,
            ) -> Result<Self, crate::Error> {
                Ok(Self {
                    value: paste::paste!(reader.[<read_ $method>]::<$($endian,)*>()?),
                    meta: M::default()
                })
            }
        }
        impl<M> WriteProperty for $name<M> {
            fn to_writer<W: std::io::Write + std::io::Seek + ?Sized>(
                &self,
                writer: &mut W,
                _legacy: bool,
            ) -> Result<(), std::io::Error> {
                paste::paste!(writer.[<write_ $method>]::<$($endian,)*>(self.$($write_value)*))
            }
        }

        impl<S: Into<$rust>, M: Default> From<S> for $name<M> {
            fn from(value: S) -> Self {
                Self::new(value.into())
            }
        }

        impl<M> AsRef<$rust> for $name<M> {
            fn as_ref(&self) -> &$rust {
                &self.value
            }
        }

        impl<M> std::ops::Deref for $name<M> {
            type Target = $rust;

            fn deref(&self) -> &Self::Target {
                &self.value
            }
        }
    };
}

use byteorder::{ReadBytesExt, WriteBytesExt, LE};
use glam::{Mat4, Vec2, Vec3, Vec4};
use ltk_primitives::Color as ColorPrim;

// A "primitive" in this case is just a PropertyValue that just encapsulates
// a single struct/rust primitive.

impl_prim!(Bool, bool, [Eq, Hash], bool);

// https://github.com/LeagueToolkit/league-toolkit/pull/6#discussion_r1809366173
// > Afaik this is leftover from before bitfield support was added to league.
// > This type is also not a primitive, meaning it can't be used as a key for map.
// - moonshadow
impl_prim!(BitBool, bool, [Eq, Hash], bool);

impl_prim!(I8, i8, [Eq, Hash], i8);
impl_prim!(U8, u8, [Eq, Hash], u8);

impl_prim!(I16, i16, [Eq, Hash], i16::<LE>);
impl_prim!(U16, u16, [Eq, Hash], u16::<LE>);

impl_prim!(I32, i32, [Eq, Hash], i32::<LE>);
impl_prim!(U32, u32, [Eq, Hash], u32::<LE>);

impl_prim!(I64, i64, [Eq, Hash], i64::<LE>);
impl_prim!(U64, u64, [Eq, Hash], u64::<LE>);

impl_prim!(F32, f32, [], f32::<LE>);

impl_prim!(Vector2, Vec2, [], vec2::<LE>);
impl_prim!(Vector3, Vec3, [], vec3::<LE>);
impl_prim!(Vector4, Vec4, [], vec4::<LE>);
impl_prim!(Matrix44, Mat4, [], mat4_row_major::<LE>);

type ColorU8 = ColorPrim<u8>;
impl_prim!(Color, ColorU8, [], color_u8, value.as_ref());
impl_prim!(Hash, u32, [Eq, Hash], u32::<LE>);
impl_prim!(WadChunkLink, u64, [Eq, Hash], u64::<LE>);
impl_prim!(ObjectLink, u32, [Eq, Hash], u32::<LE>);
