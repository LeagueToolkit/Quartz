use indexmap::IndexMap;
use num_enum::{IntoPrimitive, TryFromPrimitive};

/// Value types inside an inibin file, matching the v2 binary flag bits.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, TryFromPrimitive, IntoPrimitive)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[repr(u8)]
pub enum InibinFlags {
    Int32List = 0,
    Float32List = 1,
    FixedPointFloatList = 2,
    Int16List = 3,
    Int8List = 4,
    BitList = 5,
    FixedPointFloatListVec3 = 6,
    Float32ListVec3 = 7,
    FixedPointFloatListVec2 = 8,
    Float32ListVec2 = 9,
    FixedPointFloatListVec4 = 10,
    Float32ListVec4 = 11,
    StringList = 12,
    Int32LongList = 13,
    /// Old format (v1) — all values stored as strings in a data block.
    OldFormat = 255,
}

/// A typed value stored in an inibin entry.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum InibinValue {
    I32(i32),
    F32(f32),
    FixedPointFloat(f64),
    I16(i16),
    U8(u8),
    Bool(bool),
    FixedPointVec3([f64; 3]),
    F32Vec3([f32; 3]),
    FixedPointVec2([f64; 2]),
    F32Vec2([f32; 2]),
    FixedPointVec4([f64; 4]),
    F32Vec4([f32; 4]),
    String(String),
}

/// A set of values of a single type inside an [`InibinFile`].
///
/// Each set corresponds to one storage-type bucket in the binary format.
/// Properties are keyed by their hash (u32).
#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct InibinSet {
    flags: InibinFlags,
    properties: IndexMap<u32, InibinValue>,
}

impl InibinSet {
    /// Create a new empty set for the given type.
    pub fn new(flags: InibinFlags) -> Self {
        Self {
            flags,
            properties: IndexMap::new(),
        }
    }

    /// Create a set with pre-populated properties.
    pub fn with_properties(flags: InibinFlags, properties: IndexMap<u32, InibinValue>) -> Self {
        Self { flags, properties }
    }

    /// The storage type of this set.
    pub fn flags(&self) -> InibinFlags {
        self.flags
    }

    /// Get a value by hash.
    pub fn get(&self, hash: u32) -> Option<&InibinValue> {
        self.properties.get(&hash)
    }

    /// Get a mutable reference to a value by hash.
    pub fn get_mut(&mut self, hash: u32) -> Option<&mut InibinValue> {
        self.properties.get_mut(&hash)
    }

    /// Check if a hash exists in this set.
    pub fn contains(&self, hash: u32) -> bool {
        self.properties.contains_key(&hash)
    }

    /// Insert a value. Returns the previous value if the hash already existed.
    pub fn insert(&mut self, hash: u32, value: InibinValue) -> Option<InibinValue> {
        self.properties.insert(hash, value)
    }

    /// Remove a value by hash. Returns the removed value.
    pub fn remove(&mut self, hash: u32) -> Option<InibinValue> {
        self.properties.shift_remove(&hash)
    }

    /// Number of entries in this set.
    pub fn len(&self) -> usize {
        self.properties.len()
    }

    /// Whether this set is empty.
    pub fn is_empty(&self) -> bool {
        self.properties.is_empty()
    }

    /// Iterate over `(hash, value)` pairs.
    pub fn iter(&self) -> indexmap::map::Iter<'_, u32, InibinValue> {
        self.properties.iter()
    }

    /// Iterate mutably over `(hash, value)` pairs.
    pub fn iter_mut(&mut self) -> indexmap::map::IterMut<'_, u32, InibinValue> {
        self.properties.iter_mut()
    }
}

impl<'a> IntoIterator for &'a InibinSet {
    type Item = (&'a u32, &'a InibinValue);
    type IntoIter = indexmap::map::Iter<'a, u32, InibinValue>;

    fn into_iter(self) -> Self::IntoIter {
        self.properties.iter()
    }
}

impl<'a> IntoIterator for &'a mut InibinSet {
    type Item = (&'a u32, &'a mut InibinValue);
    type IntoIter = indexmap::map::IterMut<'a, u32, InibinValue>;

    fn into_iter(self) -> Self::IntoIter {
        self.properties.iter_mut()
    }
}

impl IntoIterator for InibinSet {
    type Item = (u32, InibinValue);
    type IntoIter = indexmap::map::IntoIter<u32, InibinValue>;

    fn into_iter(self) -> Self::IntoIter {
        self.properties.into_iter()
    }
}

/// Represents a binary ini file (inibin, troybin, cfgbin).
///
/// Contains sets of values grouped by storage type. Each set holds
/// `hash -> value` pairs of a single type.
#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct InibinFile {
    version: u8,
    sets: IndexMap<InibinFlags, InibinSet>,
}

impl InibinFile {
    /// Create a new empty inibin file.
    pub fn new() -> Self {
        Self {
            version: 2,
            sets: IndexMap::new(),
        }
    }

    /// The format version (1 or 2).
    pub fn version(&self) -> u8 {
        self.version
    }

    /// Set the format version.
    pub fn set_version(&mut self, version: u8) {
        self.version = version;
    }

    /// Get a value by hash, searching all sets.
    pub fn get(&self, hash: u32) -> Option<&InibinValue> {
        for set in self.sets.values() {
            if let Some(val) = set.get(hash) {
                return Some(val);
            }
        }
        None
    }

    /// Get a value from a specific set type.
    pub fn get_from(&self, flags: InibinFlags, hash: u32) -> Option<&InibinValue> {
        self.sets.get(&flags).and_then(|s| s.get(hash))
    }

    /// Check if a hash exists in any set.
    pub fn contains(&self, hash: u32) -> bool {
        self.sets.values().any(|s| s.contains(hash))
    }

    /// Add a value to a specific storage-type bucket.
    /// Creates the set if it doesn't exist yet.
    /// Returns the previous value if the hash already existed in that set.
    pub fn add_value(
        &mut self,
        hash: u32,
        value: InibinValue,
        flags: InibinFlags,
    ) -> Option<InibinValue> {
        let set = self
            .sets
            .entry(flags)
            .or_insert_with(|| InibinSet::new(flags));
        set.insert(hash, value)
    }

    /// Remove a value by hash, searching all sets.
    pub fn remove(&mut self, hash: u32) -> Option<InibinValue> {
        for set in self.sets.values_mut() {
            if let Some(val) = set.remove(hash) {
                return Some(val);
            }
        }
        None
    }

    /// Get a reference to a set by type.
    pub fn set(&self, flags: InibinFlags) -> Option<&InibinSet> {
        self.sets.get(&flags)
    }

    /// Get a mutable reference to a set by type.
    pub fn set_mut(&mut self, flags: InibinFlags) -> Option<&mut InibinSet> {
        self.sets.get_mut(&flags)
    }

    /// Insert a complete set. Returns the previous set if one existed for that type.
    pub fn insert_set(&mut self, set: InibinSet) -> Option<InibinSet> {
        self.sets.insert(set.flags(), set)
    }

    /// Iterate over all sets.
    pub fn sets(&self) -> indexmap::map::Values<'_, InibinFlags, InibinSet> {
        self.sets.values()
    }

    /// Total number of entries across all sets.
    pub fn len(&self) -> usize {
        self.sets.values().map(|s| s.len()).sum()
    }

    /// Whether the file has no entries.
    pub fn is_empty(&self) -> bool {
        self.sets.values().all(|s| s.is_empty())
    }

    /// Flat iterator over all `(hash, &value)` pairs across all sets.
    pub fn iter(&self) -> impl Iterator<Item = (&u32, &InibinValue)> {
        self.sets.values().flat_map(|s| s.iter())
    }
}

impl Default for InibinFile {
    fn default() -> Self {
        Self::new()
    }
}
