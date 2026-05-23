use std::io;

use crate::{
    property::{values, Kind, NoMeta},
    traits::{PropertyExt, PropertyValueExt, ReadProperty, ReaderExt, WriteProperty, WriterExt},
    Error,
};

use crate::PropertyValueEnum;
use byteorder::{ReadBytesExt, WriteBytesExt, LE};
use ltk_io_ext::{measure, window_at};

#[macro_use]
pub mod variants;

mod iter;
pub use iter::*;

macro_rules! define_container_enum {
    ( [$( $variant:ident, )*] ) => {
        #[cfg_attr(
            feature = "serde",
            derive(serde::Serialize, serde::Deserialize),
            serde(bound = "for <'dee> M: serde::Serialize + serde::Deserialize<'dee>")
        )]
        #[derive(Clone, Debug, PartialEq)]
        pub enum Container<M = NoMeta> {
            $(
                $variant {
                    items: Vec<values::$variant<M>>,
                    meta: M,
                },
            )*
        }


        impl<M> PropertyExt for Container<M> {
            fn size_no_header(&self) -> usize {
                match &self {
                    $(Self::$variant{items,..} => {
                        9 + items.iter().map(|p| p.size_no_header()).sum::<usize>()
                    })*
                }
            }
        }

        $(
            impl<M: Default> From<Vec<values::$variant<M>>> for Container<M> {
                fn from(other: Vec<values::$variant<M>>) -> Self {
                    Self::$variant {
                        items: other,
                        meta: M::default(),
                    }
                }

            }
        )*
        $(
            impl<M: Default> FromIterator<values::$variant<M>> for Container<M> {
                fn from_iter<T>(iter: T) -> Self
                    where T: IntoIterator<Item = values::$variant<M>> {
                    Self::$variant {
                        items: iter.into_iter().collect(),
                        meta: M::default(),
                    }
                }

            }
        )*

        impl<M: Default> TryFrom<Vec<PropertyValueEnum<M>>> for Container<M> {
            type Error = Error;

            fn try_from(value: Vec<PropertyValueEnum<M>>) -> Result<Self, Self::Error> {
                let mut iter = value.into_iter();

                let first = match iter.next() {
                    Some(v) => v,
                    None => {
                        return Err(Error::EmptyContainer);
                    }
                };

                match first {
                    $(
                        PropertyValueEnum::$variant(inner) => {
                            let mut items = vec![inner];

                            for v in iter {
                                if let PropertyValueEnum::$variant(inner) = v {
                                    items.push(inner);
                                } else {
                                    return Err(Error::MismatchedContainerTypes{
                                        expected: <values::$variant>::KIND, got: v.kind()
                                    });
                                }
                            }

                            return Ok(Container::$variant{ items, meta: M::default() });
                        },
                    )*
                    other => {
                        return Err(Error::InvalidNesting(other.kind()));
                    }

                }
            }
        }

        impl<M> Container<M> {
            /// Iterator that returns each item as a [`PropertyValueEnum`] for convenience.
            #[inline(always)]
            #[must_use]
            pub fn into_items(self) -> IntoItems<M> {
                match self {
                    $(Self::$variant{items,..} => {
                        IntoItems::from(iter::IntoItemsInner::from(items.into_iter()))
                    })*
                }
            }
            /// Iterator over each item as a dyn [`PropertyValueDyn`].
            #[inline(always)]
            #[must_use]
            pub fn items_dyn(&self) -> ItemsDyn<'_, M> {
                match &self {
                    $(Self::$variant{ items, .. } => ItemsDynInner::from(items.iter()).into(),)*
                }
            }
        }
    };
}

container_variants!(define_container_enum);

impl<M: Default> Default for Container<M> {
    fn default() -> Self {
        Self::None {
            items: Vec::new(),
            meta: M::default(),
        }
    }
}

impl<M> Container<M> {
    pub fn new<T>(items: Vec<T>) -> Self
    where
        Self: From<Vec<T>>,
    {
        Self::from(items)
    }

    pub fn empty<T>() -> Self
    where
        Self: From<Vec<T>>,
    {
        Self::from(vec![])
    }
}

impl<M> Container<M> {
    #[inline(always)]
    #[must_use]
    pub fn item_kind(&self) -> Kind {
        container_variants!(property_kinds, (self))
    }
}

impl<M> PropertyValueExt for Container<M> {
    const KIND: Kind = Kind::Container;
}

impl<M: Default> ReadProperty for Container<M> {
    fn from_reader<R: std::io::Read + std::io::Seek + ?Sized>(
        reader: &mut R,
        legacy: bool,
    ) -> Result<Self, Error> {
        let item_kind = reader.read_property_kind(legacy)?;

        fn read<T, R>(reader: &mut R, legacy: bool) -> Result<Vec<T>, Error>
        where
            T: PropertyValueExt + ReadProperty,
            R: std::io::Read + std::io::Seek + ?Sized,
        {
            let size = reader.read_u32::<LE>()?;
            let (real_size, items) = measure(reader, |reader| {
                let prop_count = reader.read_u32::<LE>()?;
                let mut items = Vec::with_capacity(prop_count as _);
                for _ in 0..prop_count {
                    let prop = T::from_reader(reader, legacy)?;
                    items.push(prop);
                }
                Ok::<_, Error>(items)
            })?;

            if size as u64 != real_size {
                return Err(Error::InvalidSize(size as _, real_size));
            }
            Ok(items)
        }

        macro_rules! read_inner {
            (($value:expr)
             [$( $variant:ident, )*]) => {
                match $value {
                    $(
                        Kind::$variant => {
                            read(reader, legacy).map(|items| Self::$variant{items, meta: M::default()})
                        },
                    )*
                    kind => { return Err(Error::InvalidNesting(kind)) }
                }
            };
        }

        container_variants!(read_inner, (item_kind))
    }
}

impl<M: Clone> WriteProperty for Container<M> {
    // TODO: legacy writing
    fn to_writer<R: std::io::Write + std::io::Seek + ?Sized>(
        &self,
        writer: &mut R,
        legacy: bool,
    ) -> Result<(), std::io::Error> {
        if legacy {
            unimplemented!("legacy container writing");
        }

        writer.write_property_kind(self.item_kind())?;
        let size_pos = writer.stream_position()?;
        writer.write_u32::<LE>(0)?;

        let (size, _) = measure(writer, |writer| {
            let items = self.clone().into_items().collect::<Vec<_>>();
            writer.write_u32::<LE>(items.len() as _)?;
            for item in &items {
                item.to_writer(writer)?;
            }
            Ok::<_, io::Error>(())
        })?;

        window_at(writer, size_pos, |writer| writer.write_u32::<LE>(size as _))?;

        Ok(())
    }
}
