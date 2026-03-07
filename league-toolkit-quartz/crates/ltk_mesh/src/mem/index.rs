//! Index buffer types
use std::{fmt::Debug, io, marker::PhantomData, mem::size_of};

/// Trait to read from an index buffer, in a given format. (u16, u32)
pub trait Format {
    type Item;
    #[must_use]
    fn get(buf: &[u8], index: usize) -> Self::Item;
}

/// Wrapper around a raw buffer of indices, supporting either u16 or u32 indices.
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct IndexBuffer<F: Format> {
    count: usize,

    buffer: Vec<u8>,

    _format: PhantomData<F>,
}

impl<F: Format> Debug for IndexBuffer<F> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("IndexBuffer")
            .field("count", &self.count)
            .field("stride", &self.stride())
            .field("buffer (size)", &self.buffer.len())
            .finish()
    }
}

impl Format for u32 {
    type Item = u32;
    fn get(buf: &[u8], index: usize) -> u32 {
        let off = index * size_of::<u32>();
        u32::from_le_bytes(buf[off..off + 4].try_into().unwrap())
    }
}
impl Format for u16 {
    type Item = u16;
    fn get(buf: &[u8], index: usize) -> u16 {
        let off = index * size_of::<u16>();
        u16::from_le_bytes(buf[off..off + 2].try_into().unwrap())
    }
}
impl<F: Format> IndexBuffer<F> {
    #[must_use]
    /// Creates a new index buffer from a buffer
    pub fn new(buffer: Vec<u8>) -> Self {
        let stride = size_of::<F>();
        if !buffer.len().is_multiple_of(stride) {
            panic!("Index buffer size must be a multiple of index size!");
        }
        Self {
            count: buffer.len() / stride,
            buffer,
            _format: PhantomData,
        }
    }

    /// Reads an index buffer from a reader.
    ///
    /// # Arguments
    /// * `reader` - The reader to read from.
    /// * `count` - The number of indices to read.
    pub fn read<R: io::Read>(reader: &mut R, count: usize) -> Result<Self, io::Error> {
        let mut buffer = vec![0u8; size_of::<F>() * count];
        reader.read_exact(&mut buffer)?;
        Ok(Self::new(buffer))
    }

    #[inline(always)]
    #[must_use]
    /// The size in bytes of a single index.
    pub fn stride(&self) -> usize {
        size_of::<F>()
    }

    #[inline(always)]
    #[must_use]
    /// An iterator over the indices in the buffer.
    pub fn iter(&self) -> IndexBufferIter<'_, F> {
        IndexBufferIter {
            buffer: self,
            counter: 0,
        }
    }

    #[inline]
    #[must_use]
    /// Get an item from the buffer, at a given index.
    pub fn get(&self, index: usize) -> F::Item {
        F::get(&self.buffer, index)
    }

    #[inline(always)]
    #[must_use]
    /// The number of indices in the buffer.
    pub fn count(&self) -> usize {
        self.count
    }

    #[inline(always)]
    #[must_use]
    /// The raw underlying bytes.
    pub fn as_bytes(&self) -> &[u8] {
        &self.buffer
    }
    #[inline(always)]
    #[must_use]
    /// Take ownership of the underlying bytes.
    pub fn into_inner(self) -> Vec<u8> {
        self.buffer
    }
}

pub struct IndexBufferIter<'a, F: Format> {
    buffer: &'a IndexBuffer<F>,
    counter: usize,
}

impl<'a, F: Format> Iterator for IndexBufferIter<'a, F> {
    type Item = F::Item;

    fn next(&mut self) -> Option<Self::Item> {
        if self.counter >= self.buffer.count {
            return None;
        }
        let item = F::get(self.buffer.as_bytes(), self.counter);
        self.counter += 1;
        Some(item)
    }
}
