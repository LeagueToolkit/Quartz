use crate::{
    property::{Kind, NoMeta},
    traits::{PropertyExt, PropertyValueExt, ReadProperty, WriteProperty},
};

use super::Struct;

#[cfg_attr(
    feature = "serde",
    derive(serde::Serialize, serde::Deserialize),
    serde(bound = "for <'dee> M: serde::Serialize + serde::Deserialize<'dee>")
)]
#[derive(Clone, PartialEq, Debug, Default)]
pub struct Embedded<M = NoMeta>(pub Struct<M>);

impl<M> PropertyValueExt for Embedded<M> {
    const KIND: Kind = Kind::Embedded;
}

impl<M> PropertyExt for Embedded<M> {
    fn size_no_header(&self) -> usize {
        self.0.size_no_header()
    }
}

impl<M: Default> ReadProperty for Embedded<M> {
    fn from_reader<R: std::io::Read + std::io::Seek + ?Sized>(
        reader: &mut R,
        legacy: bool,
    ) -> Result<Self, crate::Error> {
        Struct::<M>::from_reader(reader, legacy).map(Self)
    }
}
impl<M> WriteProperty for Embedded<M> {
    fn to_writer<R: std::io::Write + std::io::Seek + ?Sized>(
        &self,
        writer: &mut R,
        legacy: bool,
    ) -> Result<(), std::io::Error> {
        Struct::<M>::to_writer(&self.0, writer, legacy)
    }
}
