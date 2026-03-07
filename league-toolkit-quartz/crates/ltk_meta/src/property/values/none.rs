use crate::{
    property::{Kind, NoMeta},
    traits::{PropertyExt, PropertyValueExt, ReadProperty, WriteProperty},
};

#[cfg_attr(
    feature = "serde",
    derive(serde::Serialize, serde::Deserialize),
    serde(bound = "for <'dee> M: serde::Serialize + serde::Deserialize<'dee>")
)]
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Default)]
pub struct None<M = NoMeta> {
    pub meta: M,
}
impl<M> PropertyValueExt for None<M> {
    const KIND: Kind = Kind::None;
}
impl<M> PropertyExt for None<M> {
    fn size_no_header(&self) -> usize {
        0
    }
}

impl<M: Default> ReadProperty for None<M> {
    fn from_reader<R: std::io::Read + std::io::Seek + ?Sized>(
        _reader: &mut R,
        _legacy: bool,
    ) -> Result<Self, crate::Error> {
        Ok(Self { meta: M::default() })
    }
}
impl<M> WriteProperty for None<M> {
    fn to_writer<R: std::io::Write + std::io::Seek + ?Sized>(
        &self,
        _writer: &mut R,
        _legacy: bool,
    ) -> Result<(), std::io::Error> {
        Ok(())
    }
}
