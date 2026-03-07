//! Bin object types and builders.

mod builder;
pub use builder::Builder;

use std::io;

use indexmap::IndexMap;
use ltk_io_ext::{measure, window_at};

use super::super::{BinProperty, Error, PropertyValueEnum};
use byteorder::{ReadBytesExt, WriteBytesExt, LE};

/// A node/object in the bin tree.
///
/// Each object has a path hash (unique identifier), a class hash (type identifier),
/// and a collection of properties.
///
/// # Construction
///
/// Use [`BinObject::new`] for simple cases or [`BinObject::builder`] for
/// adding properties inline:
///
/// ```
/// use ltk_meta::BinObject;
/// use ltk_meta::property::values;
///
/// // Simple construction
/// let obj = BinObject::new(0x1234, 0x5678);
///
/// // Builder pattern with properties
/// let obj = BinObject::builder(0x1234, 0x5678)
///     .property(0xAAAA, values::I32::new(42))
///     .property(0xBBBB, values::String::from("hello"))
///     .build();
/// ```
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Debug, Clone, PartialEq)]
pub struct BinObject {
    /// The unique path hash identifying this object.
    pub path_hash: u32,

    /// The class hash identifying the type/schema of this object.
    pub class_hash: u32,

    /// The properties of this object, keyed by their name hash.
    pub properties: IndexMap<u32, BinProperty>,
}

impl BinObject {
    /// Creates a new `BinObject` with the given path and class hashes.
    ///
    /// The object starts with no properties.
    ///
    /// # Examples
    ///
    /// ```
    /// use ltk_meta::BinObject;
    ///
    /// let obj = BinObject::new(0x12345678, 0xABCDEF00);
    /// assert!(obj.properties.is_empty());
    /// ```
    pub fn new(path_hash: u32, class_hash: u32) -> Self {
        Self {
            path_hash,
            class_hash,
            properties: IndexMap::new(),
        }
    }

    /// Creates a new builder for constructing a `BinObject`.
    ///
    /// # Examples
    ///
    /// ```
    /// use ltk_meta::BinObject;
    /// use ltk_meta::property::values;
    ///
    /// let obj = BinObject::builder(0x12345678, 0xABCDEF00)
    ///     .property(0x1111, values::I32::new(42))
    ///     .property(0x2222, values::String::from("hello"))
    ///     .property(0x3333, values::Bool::new(true))
    ///     .build();
    ///
    /// assert_eq!(obj.properties.len(), 3);
    /// ```
    pub fn builder(path_hash: u32, class_hash: u32) -> builder::Builder {
        builder::Builder::new(path_hash, class_hash)
    }

    /// Reads a BinObject from a reader.
    ///
    /// # Arguments
    ///
    /// * `reader` - A reader that implements [`io::Read`] and [`io::Seek`].
    /// * `class_hash` - The hash of the class of the object.
    /// * `legacy` - Whether to read in legacy format.
    pub fn from_reader<R: io::Read + io::Seek + ?Sized>(
        reader: &mut R,
        class_hash: u32,
        legacy: bool,
    ) -> Result<Self, Error> {
        let size = reader.read_u32::<LE>()?;
        let (real_size, value) = measure(reader, |reader| {
            let path_hash = reader.read_u32::<LE>()?;

            let prop_count = reader.read_u16::<LE>()? as usize;
            let mut properties = IndexMap::with_capacity(prop_count);
            for _ in 0..prop_count {
                let prop = BinProperty::from_reader(reader, legacy)?;
                properties.insert(prop.name_hash, prop);
            }

            Ok::<_, Error>(Self {
                path_hash,
                class_hash,
                properties,
            })
        })?;

        if size as u64 != real_size {
            return Err(Error::InvalidSize(size as _, real_size));
        }
        Ok(value)
    }

    /// Writes this object to a writer.
    ///
    /// # Arguments
    ///
    /// * `writer` - A writer that implements io::Write and io::Seek.
    pub fn to_writer<W: io::Write + io::Seek + ?Sized>(&self, writer: &mut W) -> io::Result<()> {
        let size_pos = writer.stream_position()?;
        writer.write_u32::<LE>(0)?;

        let (size, _) = measure(writer, |writer| {
            writer.write_u32::<LE>(self.path_hash)?;
            writer.write_u16::<LE>(self.properties.len() as _)?;
            for prop in self.properties.values() {
                prop.to_writer(writer)?;
            }
            Ok::<_, io::Error>(())
        })?;

        window_at(writer, size_pos, |writer| writer.write_u32::<LE>(size as _))?;
        Ok(())
    }

    /// Returns the number of properties in this object.
    #[inline]
    pub fn len(&self) -> usize {
        self.properties.len()
    }

    /// Returns `true` if this object has no properties.
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.properties.is_empty()
    }

    /// Returns a reference to the property with the given name hash, if it exists.
    #[inline]
    pub fn get_property(&self, name_hash: u32) -> Option<&BinProperty> {
        self.properties.get(&name_hash)
    }

    /// Returns a mutable reference to the property with the given name hash, if it exists.
    #[inline]
    pub fn get_property_mut(&mut self, name_hash: u32) -> Option<&mut BinProperty> {
        self.properties.get_mut(&name_hash)
    }

    /// Returns a reference to the property value with the given name hash, if it exists.
    #[inline]
    pub fn get_value(&self, name_hash: u32) -> Option<&PropertyValueEnum> {
        self.properties.get(&name_hash).map(|p| &p.value)
    }

    /// Returns a mutable reference to the property value with the given name hash, if it exists.
    #[inline]
    pub fn get_value_mut(&mut self, name_hash: u32) -> Option<&mut PropertyValueEnum> {
        self.properties.get_mut(&name_hash).map(|p| &mut p.value)
    }

    /// Returns `true` if this object has a property with the given name hash.
    #[inline]
    pub fn contains_property(&self, name_hash: u32) -> bool {
        self.properties.contains_key(&name_hash)
    }

    /// Adds or replaces a property.
    ///
    /// If a property with the same name hash already exists, it is replaced
    /// and the old property is returned.
    pub fn set_property(&mut self, property: BinProperty) -> Option<BinProperty> {
        self.properties.insert(property.name_hash, property)
    }

    /// Adds or replaces a property value.
    ///
    /// This is a convenience method that creates a [`BinProperty`] from the
    /// name hash and value.
    ///
    /// If a property with the same name hash already exists, it is replaced
    /// and the old property is returned.
    pub fn set_value(
        &mut self,
        name_hash: u32,
        value: impl Into<PropertyValueEnum>,
    ) -> Option<BinProperty> {
        self.properties.insert(
            name_hash,
            BinProperty {
                name_hash,
                value: value.into(),
            },
        )
    }

    /// Removes and returns the property with the given name hash, if it exists.
    pub fn remove_property(&mut self, name_hash: u32) -> Option<BinProperty> {
        self.properties.shift_remove(&name_hash)
    }

    /// Returns an iterator over the properties in this object.
    #[inline]
    pub fn iter(&self) -> impl Iterator<Item = (&u32, &BinProperty)> {
        self.properties.iter()
    }

    /// Returns a mutable iterator over the properties in this object.
    #[inline]
    pub fn iter_mut(&mut self) -> impl Iterator<Item = (&u32, &mut BinProperty)> {
        self.properties.iter_mut()
    }
}

impl<'a> IntoIterator for &'a BinObject {
    type Item = (&'a u32, &'a BinProperty);
    type IntoIter = indexmap::map::Iter<'a, u32, BinProperty>;

    fn into_iter(self) -> Self::IntoIter {
        self.properties.iter()
    }
}

impl<'a> IntoIterator for &'a mut BinObject {
    type Item = (&'a u32, &'a mut BinProperty);
    type IntoIter = indexmap::map::IterMut<'a, u32, BinProperty>;

    fn into_iter(self) -> Self::IntoIter {
        self.properties.iter_mut()
    }
}

impl IntoIterator for BinObject {
    type Item = (u32, BinProperty);
    type IntoIter = indexmap::map::IntoIter<u32, BinProperty>;

    fn into_iter(self) -> Self::IntoIter {
        self.properties.into_iter()
    }
}
