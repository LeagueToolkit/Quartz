use crate::{
    property::{values, Kind, NoMeta},
    traits::{PropertyExt, PropertyValueExt, ReadProperty, ReaderExt, WriteProperty, WriterExt},
    Error, PropertyValueEnum,
};
use ltk_io_ext::{ReaderExt as _, WriterExt as _};

macro_rules! construct_enum {
    ([$( $variant:ident, )*]) => {
        #[cfg_attr(
            feature = "serde",
            derive(serde::Serialize, serde::Deserialize),
            serde(bound = "for <'dee> M: serde::Serialize + serde::Deserialize<'dee>")
        )]
        #[derive(Clone, PartialEq, Debug)]
        pub enum Optional<M = NoMeta> {
            $($variant(Option<values::$variant<M>>),)*
        }

        impl<M: Default> Optional<M> {
            #[inline(always)]
            #[must_use]
            /// Helper function to create an empty [`Optional`], if the property kind can be stored in one.
            pub fn empty(kind: Kind) -> Option<Self> {
                Some(match kind {
                    $(Kind::$variant => Self::$variant(None),)*
                    _ => return None
                })
            }
        }

        impl<M> PropertyExt for Optional<M> {
            fn size_no_header(&self) -> usize {
                2 + match &self {
                    $(Self::$variant(inner) => inner.as_ref().map(|i| i.size_no_header()).unwrap_or_default(),)*
                }
            }
        }

        $(
            impl<M: Default> From<Option<values::$variant<M>>> for Optional<M> {
                fn from(other: Option<values::$variant<M>>) -> Self {
                    Self::$variant(other)
                }

            }
        )*
        $(
            impl<M: Default> From<values::$variant<M>> for Optional<M> {
                fn from(other: values::$variant<M>) -> Self {
                    Self::$variant(Some(other))
                }

            }
        )*

        impl<M: Default> Optional<M> {
            pub fn new(item_kind: Kind, value: Option<PropertyValueEnum<M>>) -> Result<Self, Error> {
                match item_kind {
                    $(Kind::$variant => match value {
                        Some(PropertyValueEnum::$variant(inner)) => Ok(Self::$variant(Some(inner))),
                        None => Ok(Self::$variant(None)),
                        Some(value) => Err(Error::MismatchedContainerTypes {expected: item_kind, got: value.kind()}),
                    },)*
                    kind => Err(Error::InvalidNesting(kind)),
                }
            }

            pub fn into_inner(self) -> Option<PropertyValueEnum<M>> {
                match self {
                    $(Optional::$variant(item) => item.map(PropertyValueEnum::$variant),)*
                }
            }
        }
    };
}

container_variants!(construct_enum);

impl<M: Default> Default for Optional<M> {
    fn default() -> Self {
        Self::None(None)
    }
}

impl<M> Optional<M> {
    #[inline(always)]
    #[must_use]
    pub fn item_kind(&self) -> Kind {
        container_variants!(property_kinds, (self))
    }

    #[inline(always)]
    #[must_use]
    pub fn is_some(&self) -> bool {
        match_property!(self, inner => inner.is_some())
    }

    #[inline(always)]
    #[must_use]
    pub fn is_none(&self) -> bool {
        match_property!(self, inner => inner.is_none())
    }
}

impl<M> PropertyValueExt for Optional<M> {
    const KIND: Kind = Kind::Optional;
}

impl<M: Default> ReadProperty for Optional<M> {
    fn from_reader<R: std::io::Read + std::io::Seek + ?Sized>(
        reader: &mut R,
        legacy: bool,
    ) -> Result<Self, Error> {
        let kind = reader.read_property_kind(legacy)?;
        if kind.is_container() {
            return Err(Error::InvalidNesting(kind));
        }

        let is_some = reader.read_bool()?;

        macro_rules! read_inner {
            (($value:expr)
             [$( $variant:ident, )*]) => {
                match $value {
                    $(
                        Kind::$variant => match is_some {
                            true => values::$variant::from_reader(reader, legacy).map(Some).map(Self::$variant),
                            false => Ok(Self::$variant(None)),
                        },
                    )*
                    kind => { return Err(Error::InvalidNesting(kind)) }
                }
            };
        }

        container_variants!(read_inner, (kind))
    }
}
impl<M> WriteProperty for Optional<M> {
    fn to_writer<R: std::io::Write + std::io::Seek + ?Sized>(
        &self,
        writer: &mut R,
        legacy: bool,
    ) -> Result<(), std::io::Error> {
        if legacy {
            unimplemented!("legacy optional write")
        }
        writer.write_property_kind(self.item_kind())?;
        writer.write_bool(self.is_some())?;

        match_property!(
            self,
            Some(inner) => {
                inner.to_writer(writer, legacy)?;
            },
            _ => {}
        );

        Ok(())
    }
}
