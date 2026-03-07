use std::{hash::Hash, io};

use crate::{
    property::{Kind, NoMeta},
    traits::{PropertyExt, PropertyValueExt, ReadProperty, ReaderExt, WriteProperty, WriterExt},
    Error, PropertyValueEnum,
};
use byteorder::{ReadBytesExt, WriteBytesExt, LE};
use ltk_io_ext::{measure, window_at};

// FIXME (alan): do with hash here what we do with Eq
impl Hash for PropertyValueEnum {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        match self {
            PropertyValueEnum::None(i) => i.hash(state),
            PropertyValueEnum::Bool(i) => i.hash(state),
            PropertyValueEnum::I8(i) => i.hash(state),
            PropertyValueEnum::U8(i) => i.hash(state),
            PropertyValueEnum::I16(i) => i.hash(state),
            PropertyValueEnum::U16(i) => i.hash(state),
            PropertyValueEnum::I32(i) => i.hash(state),
            PropertyValueEnum::U32(i) => i.hash(state),
            PropertyValueEnum::I64(i) => i.hash(state),
            PropertyValueEnum::U64(i) => i.hash(state),
            PropertyValueEnum::BitBool(i) => i.hash(state),
            _ => std::mem::discriminant(self).hash(state),
        }
    }
}

#[cfg_attr(
    feature = "serde",
    derive(serde::Serialize, serde::Deserialize),
    serde(bound = "for <'dee> M: serde::Serialize + serde::Deserialize<'dee>")
)]
#[derive(Clone, PartialEq, Debug, Default)]
pub struct Map<M = NoMeta> {
    key_kind: Kind,
    value_kind: Kind,
    entries: Vec<(PropertyValueEnum<M>, PropertyValueEnum<M>)>,
    pub meta: M,
}

impl<M> Map<M> {
    #[inline(always)]
    #[must_use]
    pub fn key_kind(&self) -> Kind {
        self.key_kind
    }

    #[inline(always)]
    #[must_use]
    pub fn value_kind(&self) -> Kind {
        self.value_kind
    }

    #[inline(always)]
    #[must_use]
    pub fn entries(&self) -> &[(PropertyValueEnum<M>, PropertyValueEnum<M>)] {
        &self.entries
    }

    #[inline(always)]
    #[must_use]
    pub fn into_entries(self) -> Vec<(PropertyValueEnum<M>, PropertyValueEnum<M>)> {
        self.entries
    }
}

impl<M: Default> Map<M> {
    pub fn empty(key_kind: Kind, value_kind: Kind) -> Self {
        Self {
            key_kind,
            value_kind,
            entries: Vec::new(),
            meta: M::default(),
        }
    }

    pub fn new(
        key_kind: Kind,
        value_kind: Kind,
        entries: Vec<(PropertyValueEnum<M>, PropertyValueEnum<M>)>,
    ) -> Result<Self, Error> {
        for (k, v) in &entries {
            if k.kind() != key_kind {
                return Err(Error::MismatchedContainerTypes {
                    expected: key_kind,
                    got: k.kind(),
                });
            }
            if v.kind() != value_kind {
                return Err(Error::MismatchedContainerTypes {
                    expected: value_kind,
                    got: v.kind(),
                });
            }
        }
        Ok(Self {
            key_kind,
            value_kind,
            entries,
            meta: M::default(),
        })
    }
}

impl<M> PropertyValueExt for Map<M> {
    const KIND: Kind = Kind::Map;
}
impl<M> PropertyExt for Map<M> {
    fn size_no_header(&self) -> usize {
        1 + 1
            + 4
            + 4
            + self
                .entries
                .iter()
                .map(|(k, v)| k.size_no_header() + v.size_no_header())
                .sum::<usize>()
    }
}

impl<M: Default> ReadProperty for Map<M> {
    fn from_reader<R: io::Read + io::Seek + ?Sized>(
        reader: &mut R,
        legacy: bool,
    ) -> Result<Self, Error> {
        let key_kind = reader.read_property_kind(legacy)?;
        if !key_kind.is_primitive() {
            return Err(Error::InvalidKeyType(key_kind));
        }

        let value_kind = reader.read_property_kind(legacy)?;
        if value_kind.is_container() {
            return Err(Error::InvalidNesting(value_kind));
        }

        let size = reader.read_u32::<LE>()?;
        let (real_size, value) = measure(reader, |reader| {
            let len = reader.read_u32::<LE>()? as _;
            let mut entries: Vec<(PropertyValueEnum<M>, PropertyValueEnum<M>)> =
                Vec::with_capacity(len);
            for _ in 0..len {
                entries.push((
                    key_kind.read(reader, legacy)?,
                    value_kind.read(reader, legacy)?,
                ));
            }

            Ok::<_, Error>(Self {
                key_kind,
                value_kind,
                entries,
                meta: M::default(),
            })
        })?;

        if size as u64 != real_size {
            return Err(Error::InvalidSize(size as _, real_size));
        }

        Ok(value)
    }
}
impl<M: Clone> WriteProperty for Map<M> {
    fn to_writer<R: io::Write + io::Seek + ?Sized>(
        &self,
        writer: &mut R,
        legacy: bool,
    ) -> Result<(), io::Error> {
        if legacy {
            unimplemented!("legacy map writing")
        }

        // FIXME: enforce key/value type restrictions at the type level (or if not possible,
        // assertions at MapValue::new level)
        writer.write_property_kind(self.key_kind)?;
        writer.write_property_kind(self.value_kind)?;

        let size_pos = writer.stream_position()?;
        writer.write_u32::<LE>(0)?;

        let (size, _) = measure(writer, |writer| {
            writer.write_u32::<LE>(self.entries.len() as _)?;

            for (k, v) in self.entries.iter() {
                k.to_writer(writer)?;
                v.to_writer(writer)?;
            }

            Ok::<_, io::Error>(())
        })?;

        window_at(writer, size_pos, |writer| writer.write_u32::<LE>(size as _))?;

        Ok(())
    }
}
