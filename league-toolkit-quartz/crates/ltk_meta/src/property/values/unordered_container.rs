use crate::{
    property::Kind,
    traits::{PropertyExt, PropertyValueExt, ReadProperty, WriteProperty},
};

use super::Container;

#[cfg_attr(
    feature = "serde",
    derive(serde::Serialize, serde::Deserialize),
    serde(bound = "for <'dee> M: serde::Serialize + serde::Deserialize<'dee>")
)]
#[derive(Clone, PartialEq, Debug, Default)]
pub struct UnorderedContainer<M>(pub Container<M>);

impl<M> PropertyValueExt for UnorderedContainer<M> {
    const KIND: Kind = Kind::UnorderedContainer;
}

impl<M> PropertyExt for UnorderedContainer<M> {
    fn size_no_header(&self) -> usize {
        self.0.size_no_header()
    }
}

impl<M: Default> ReadProperty for UnorderedContainer<M> {
    fn from_reader<R: std::io::Read + std::io::Seek + ?Sized>(
        reader: &mut R,
        legacy: bool,
    ) -> Result<Self, crate::Error> {
        Ok(Self(Container::<M>::from_reader(reader, legacy)?))
    }
}

impl<M: Clone> WriteProperty for UnorderedContainer<M> {
    fn to_writer<R: std::io::Write + std::io::Seek + ?Sized>(
        &self,
        writer: &mut R,
        legacy: bool,
    ) -> Result<(), std::io::Error> {
        self.0.to_writer(writer, legacy)
    }
}

impl<S: Into<Container<M>>, M: Default> From<S> for UnorderedContainer<M> {
    fn from(value: S) -> Self {
        Self(value.into())
    }
}

impl<M> AsRef<Container<M>> for UnorderedContainer<M> {
    fn as_ref(&self) -> &Container<M> {
        &self.0
    }
}

impl<M> std::ops::Deref for UnorderedContainer<M> {
    type Target = Container<M>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
