use indexmap::IndexMap;

use crate::{BinObject, BinProperty, PropertyValueEnum};

/// A builder for constructing [`BinObject`] instances.
///
/// See: [`BinObject::builder`]
#[derive(Debug, Clone)]
pub struct Builder {
    path_hash: u32,
    class_hash: u32,
    properties: IndexMap<u32, BinProperty>,
}

impl Builder {
    /// See: [`BinObject::builder`]
    pub fn new(path_hash: u32, class_hash: u32) -> Self {
        Self {
            path_hash,
            class_hash,
            properties: IndexMap::new(),
        }
    }

    pub fn path_hash(mut self, path_hash: u32) -> Self {
        self.path_hash = path_hash;
        self
    }

    pub fn class_hash(mut self, class_hash: u32) -> Self {
        self.class_hash = class_hash;
        self
    }

    /// Add a [`BinProperty`]
    pub fn bin_property(mut self, prop: BinProperty) -> Self {
        self.properties.insert(prop.name_hash, prop);
        self
    }

    /// Adds a property with the given name hash and value.
    ///
    /// This is a convenience method that accepts any type that can be converted
    /// into a [`PropertyValueEnum`].
    pub fn property(mut self, name_hash: u32, value: impl Into<PropertyValueEnum>) -> Self {
        self.properties.insert(
            name_hash,
            BinProperty {
                name_hash,
                value: value.into(),
            },
        );
        self
    }

    /// Adds multiple properties from [`BinProperty`] instances.
    pub fn bin_properties(mut self, props: impl IntoIterator<Item = BinProperty>) -> Self {
        for prop in props {
            self.properties.insert(prop.name_hash, prop);
        }
        self
    }

    /// Builds the final [`BinObject`].
    pub fn build(self) -> BinObject {
        BinObject {
            path_hash: self.path_hash,
            class_hash: self.class_hash,
            properties: self.properties,
        }
    }
}
