//! Hash provider traits and implementations for ritobin writing.
//!
//! When writing ritobin files, hashes can be written as hex values (e.g., `0xdeadbeef`)
//! or as human-readable strings (e.g., `"Characters/Aatrox/Skins/Skin0"`).
//!
//! This module provides traits and implementations for looking up hash values
//! to convert them back to their original strings.

use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

/// Trait for looking up hash values to get their original string representation.
///
/// Implement this trait to provide custom hash lookup behavior when writing ritobin files.
pub trait HashProvider {
    /// Look up a bin entry path hash (root object paths like "Characters/Aatrox/Skins/Skin0").
    fn lookup_entry(&self, hash: u32) -> Option<&str>;

    /// Look up a bin field/property name hash.
    fn lookup_field(&self, hash: u32) -> Option<&str>;

    /// Look up a bin hash value (hash property type values).
    fn lookup_hash(&self, hash: u32) -> Option<&str>;

    /// Look up a bin type/class name hash (for objects, structs, embeds).
    fn lookup_type(&self, hash: u32) -> Option<&str>;
}

/// A hash provider that always returns `None`, causing all hashes to be written as hex.
///
/// This is the default provider and is useful when you don't have hash tables available.
#[derive(Debug, Clone, Copy, Default)]
pub struct HexHashProvider;

impl HashProvider for HexHashProvider {
    fn lookup_entry(&self, _hash: u32) -> Option<&str> {
        None
    }

    fn lookup_field(&self, _hash: u32) -> Option<&str> {
        None
    }

    fn lookup_hash(&self, _hash: u32) -> Option<&str> {
        None
    }

    fn lookup_type(&self, _hash: u32) -> Option<&str> {
        None
    }
}

/// A hash provider backed by HashMaps for each hash category.
///
/// This is the primary implementation for looking up hashes from loaded hash tables.
#[derive(Debug, Clone, Default)]
pub struct HashMapProvider {
    /// Hashes for bin entry paths (root object paths).
    pub entries: HashMap<u32, String>,
    /// Hashes for bin field/property names.
    pub fields: HashMap<u32, String>,
    /// Hashes for bin hash property values.
    pub hashes: HashMap<u32, String>,
    /// Hashes for bin type/class names.
    pub types: HashMap<u32, String>,
}

impl HashMapProvider {
    pub fn new() -> Self {
        Self::default()
    }

    /// Load hash entries from a file with format "{hex_hash} {string}".
    ///
    /// Hash values are expected to be raw hex without "0x" prefix (e.g., "deadbeef SomeName").
    /// Lines starting with '#' are treated as comments and skipped.
    fn load_file(path: impl AsRef<Path>) -> std::io::Result<HashMap<u32, String>> {
        let file = File::open(path)?;
        let reader = BufReader::new(file);
        let mut map = HashMap::new();

        for line in reader.lines() {
            let line = line?;
            let line = line.trim();

            // Skip empty lines and comments
            if line.is_empty() || line.starts_with('#') {
                continue;
            }

            // Parse "{hex} {string}" format (hex without 0x prefix)
            if let Some((hash_str, value)) = line.split_once(' ') {
                if let Ok(hash) = u32::from_str_radix(hash_str, 16) {
                    map.insert(hash, value.to_string());
                }
            }
        }

        Ok(map)
    }

    /// Load bin entry hashes from a file (hashes.binentries.txt).
    pub fn load_entries(&mut self, path: impl AsRef<Path>) -> std::io::Result<&mut Self> {
        self.entries = Self::load_file(path)?;
        Ok(self)
    }

    /// Load bin field hashes from a file (hashes.binfields.txt).
    pub fn load_fields(&mut self, path: impl AsRef<Path>) -> std::io::Result<&mut Self> {
        self.fields = Self::load_file(path)?;
        Ok(self)
    }

    /// Load bin hash value hashes from a file (hashes.binhashes.txt).
    pub fn load_hashes(&mut self, path: impl AsRef<Path>) -> std::io::Result<&mut Self> {
        self.hashes = Self::load_file(path)?;
        Ok(self)
    }

    /// Load bin type/class hashes from a file (hashes.bintypes.txt).
    pub fn load_types(&mut self, path: impl AsRef<Path>) -> std::io::Result<&mut Self> {
        self.types = Self::load_file(path)?;
        Ok(self)
    }

    /// Load all hash files from a directory.
    ///
    /// Expects files named:
    /// - `hashes.binentries.txt`
    /// - `hashes.binfields.txt`
    /// - `hashes.binhashes.txt`
    /// - `hashes.bintypes.txt`
    ///
    /// Missing files are silently ignored.
    pub fn load_from_directory(&mut self, dir: impl AsRef<Path>) -> &mut Self {
        let dir = dir.as_ref();

        let _ = self.load_entries(dir.join("hashes.binentries.txt"));
        let _ = self.load_fields(dir.join("hashes.binfields.txt"));
        let _ = self.load_hashes(dir.join("hashes.binhashes.txt"));
        let _ = self.load_types(dir.join("hashes.bintypes.txt"));

        self
    }

    pub fn insert_entry(&mut self, hash: u32, value: impl Into<String>) -> &mut Self {
        self.entries.insert(hash, value.into());
        self
    }

    pub fn insert_field(&mut self, hash: u32, value: impl Into<String>) -> &mut Self {
        self.fields.insert(hash, value.into());
        self
    }

    pub fn insert_hash(&mut self, hash: u32, value: impl Into<String>) -> &mut Self {
        self.hashes.insert(hash, value.into());
        self
    }

    pub fn insert_type(&mut self, hash: u32, value: impl Into<String>) -> &mut Self {
        self.types.insert(hash, value.into());
        self
    }

    /// The total number of loaded hashes across all categories.
    pub fn total_count(&self) -> usize {
        self.entries.len() + self.fields.len() + self.hashes.len() + self.types.len()
    }
}

impl HashProvider for HashMapProvider {
    fn lookup_entry(&self, hash: u32) -> Option<&str> {
        self.entries.get(&hash).map(|s| s.as_str())
    }

    fn lookup_field(&self, hash: u32) -> Option<&str> {
        self.fields.get(&hash).map(|s| s.as_str())
    }

    fn lookup_hash(&self, hash: u32) -> Option<&str> {
        self.hashes.get(&hash).map(|s| s.as_str())
    }

    fn lookup_type(&self, hash: u32) -> Option<&str> {
        self.types.get(&hash).map(|s| s.as_str())
    }
}

impl<T: HashProvider + ?Sized> HashProvider for &T {
    fn lookup_entry(&self, hash: u32) -> Option<&str> {
        (*self).lookup_entry(hash)
    }

    fn lookup_field(&self, hash: u32) -> Option<&str> {
        (*self).lookup_field(hash)
    }

    fn lookup_hash(&self, hash: u32) -> Option<&str> {
        (*self).lookup_hash(hash)
    }

    fn lookup_type(&self, hash: u32) -> Option<&str> {
        (*self).lookup_type(hash)
    }
}

impl HashProvider for Box<dyn HashProvider> {
    fn lookup_entry(&self, hash: u32) -> Option<&str> {
        self.as_ref().lookup_entry(hash)
    }

    fn lookup_field(&self, hash: u32) -> Option<&str> {
        self.as_ref().lookup_field(hash)
    }

    fn lookup_hash(&self, hash: u32) -> Option<&str> {
        self.as_ref().lookup_hash(hash)
    }

    fn lookup_type(&self, hash: u32) -> Option<&str> {
        self.as_ref().lookup_type(hash)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hex_provider() {
        let provider = HexHashProvider;
        assert_eq!(provider.lookup_entry(0x12345678), None);
        assert_eq!(provider.lookup_field(0x12345678), None);
        assert_eq!(provider.lookup_hash(0x12345678), None);
        assert_eq!(provider.lookup_type(0x12345678), None);
    }

    #[test]
    fn test_hashmap_provider() {
        let mut provider = HashMapProvider::new();
        provider.insert_entry(0x12345678, "Characters/Test/Skin0");
        provider.insert_field(0xdeadbeef, "skinName");
        provider.insert_hash(0xcafebabe, "some/path");
        provider.insert_type(0xfeedface, "SkinData");

        assert_eq!(
            provider.lookup_entry(0x12345678),
            Some("Characters/Test/Skin0")
        );
        assert_eq!(provider.lookup_field(0xdeadbeef), Some("skinName"));
        assert_eq!(provider.lookup_hash(0xcafebabe), Some("some/path"));
        assert_eq!(provider.lookup_type(0xfeedface), Some("SkinData"));

        // Unknown hashes return None
        assert_eq!(provider.lookup_entry(0x11111111), None);
    }
}
