use std::collections::HashMap;

use super::WadChunk;

/// An ordered collection of WAD chunks, sorted by path hash.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Debug, Clone)]
pub struct WadChunks {
    /// Chunks sorted by `path_hash`.
    chunks: Vec<WadChunk>,
    /// Maps `path_hash` to index in `chunks`.
    #[cfg_attr(feature = "serde", serde(skip))]
    index: HashMap<u64, usize>,
}

impl WadChunks {
    /// Creates a `WadChunks` from an iterator of chunks.
    ///
    /// The chunks will be sorted by `path_hash` internally.
    pub(crate) fn from_iter(iter: impl IntoIterator<Item = WadChunk>) -> Self {
        let mut chunks: Vec<WadChunk> = iter.into_iter().collect();
        chunks.sort_by_key(|c| c.path_hash);

        let index = chunks
            .iter()
            .enumerate()
            .map(|(i, c)| (c.path_hash, i))
            .collect();

        Self { chunks, index }
    }

    /// Returns the number of chunks.
    pub fn len(&self) -> usize {
        self.chunks.len()
    }

    /// Returns `true` if there are no chunks.
    pub fn is_empty(&self) -> bool {
        self.chunks.is_empty()
    }

    /// Look up a chunk by its path hash.
    pub fn get(&self, path_hash: u64) -> Option<&WadChunk> {
        self.index.get(&path_hash).map(|&i| &self.chunks[i])
    }

    /// Iterate over all chunks in path hash order.
    pub fn iter(&self) -> impl Iterator<Item = &WadChunk> {
        self.chunks.iter()
    }

    /// Returns a slice of all chunks in path hash order.
    pub fn as_slice(&self) -> &[WadChunk] {
        &self.chunks
    }

    /// Returns `true` if a chunk with the given path hash exists.
    pub fn contains(&self, path_hash: u64) -> bool {
        self.index.contains_key(&path_hash)
    }
}

impl<'a> IntoIterator for &'a WadChunks {
    type Item = &'a WadChunk;
    type IntoIter = std::slice::Iter<'a, WadChunk>;

    fn into_iter(self) -> Self::IntoIter {
        self.chunks.iter()
    }
}

impl IntoIterator for WadChunks {
    type Item = WadChunk;
    type IntoIter = std::vec::IntoIter<WadChunk>;

    fn into_iter(self) -> Self::IntoIter {
        self.chunks.into_iter()
    }
}
