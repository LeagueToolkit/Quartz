use crate::{
    property::{Kind, NoMeta},
    traits::{PropertyExt, PropertyValueExt, ReadProperty, WriteProperty},
};
use byteorder::LE;
use ltk_io_ext::{ReaderExt, WriterExt};

#[cfg_attr(
    feature = "serde",
    derive(serde::Serialize, serde::Deserialize),
    serde(bound = "for <'dee> M: serde::Serialize + serde::Deserialize<'dee>")
)]
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Default)]
pub struct String<M = NoMeta> {
    pub value: std::string::String,
    pub meta: M,
}

impl<M: Default> String<M> {
    #[inline(always)]
    #[must_use]
    pub fn new(value: std::string::String) -> Self {
        Self {
            value,
            meta: M::default(),
        }
    }
}

impl<M> PropertyValueExt for String<M> {
    const KIND: Kind = Kind::String;
}

impl<M> PropertyExt for String<M> {
    fn size_no_header(&self) -> usize {
        self.value.len() + 2
    }
}

impl<M: Default> ReadProperty for String<M> {
    fn from_reader<R: std::io::Read + std::io::Seek + ?Sized>(
        reader: &mut R,
        _legacy: bool,
    ) -> Result<Self, crate::Error> {
        Ok(Self {
            value: reader.read_sized_string_u16::<LE>()?,
            meta: M::default(),
        })
    }
}

impl<M> WriteProperty for String<M> {
    fn to_writer<R: std::io::Write + std::io::Seek + ?Sized>(
        &self,
        writer: &mut R,
        _legacy: bool,
    ) -> Result<(), std::io::Error> {
        writer.write_len_prefixed_string::<LE, _>(&self.value)
    }
}

impl<S: Into<std::string::String>, M: Default> From<S> for String<M> {
    fn from(value: S) -> Self {
        Self::new(value.into())
    }
}
impl<M> AsRef<std::string::String> for String<M> {
    fn as_ref(&self) -> &std::string::String {
        &self.value
    }
}

impl<M> std::ops::Deref for String<M> {
    type Target = std::string::String;

    fn deref(&self) -> &Self::Target {
        &self.value
    }
}
