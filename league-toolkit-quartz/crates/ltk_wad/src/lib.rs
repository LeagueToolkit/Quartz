//! Reading, writing, and extracting League of Legends WAD archives.
//!
//! # Reading a WAD
//!
//! ```no_run
//! use std::fs::File;
//! use ltk_wad::Wad;
//!
//! let file = File::open("archive.wad.client")?;
//! let mut wad = Wad::mount(file)?;
//!
//! // Iterate chunks in path-hash order
//! for chunk in wad.chunks() {
//!     println!("{:#016x} ({} bytes)", chunk.path_hash(), chunk.uncompressed_size());
//! }
//!
//! // Read and decompress a specific chunk
//! let chunk = *wad.chunks().get(0x1234567890abcdef).unwrap();
//! let data = wad.load_chunk_decompressed(&chunk)?;
//! # Ok::<(), Box<dyn std::error::Error>>(())
//! ```
//!
//! # Extracting to disk
//!
//! ```no_run
//! use std::fs::File;
//! use ltk_wad::{Wad, WadExtractor, HexPathResolver};
//!
//! let file = File::open("archive.wad.client")?;
//! let mut wad = Wad::mount(file)?;
//!
//! let extractor = WadExtractor::new(&HexPathResolver)
//!     .on_progress(|p| println!("{:.0}%", p.percent() * 100.0));
//!
//! let count = extractor.extract_all(&mut wad, "/output/path")?;
//! println!("Extracted {count} chunks");
//! # Ok::<(), Box<dyn std::error::Error>>(())
//! ```
//!
//! # Parallel decompression
//!
//! [`decompress_raw`] decouples decompression from I/O, so you can stream raw
//! reads sequentially and dispatch decompression to a thread pool:
//!
//! ```no_run
//! use std::fs::File;
//! use ltk_wad::{Wad, WadChunk, decompress_raw};
//!
//! let file = File::open("archive.wad.client")?;
//! let mut wad = Wad::mount(file)?;
//! let chunks: Vec<WadChunk> = wad.chunks().iter().copied().collect();
//!
//! // Sequential read, parallel decompress + process.
//! // With rayon you would send (chunk, raw) into a parallel iterator;
//! // here we show the sequential equivalent.
//! for chunk in &chunks {
//!     let raw = wad.load_chunk_raw(chunk)?;
//!
//!     // This can run on another thread — no borrow on `wad` needed.
//!     let decompressed = decompress_raw(
//!         &raw,
//!         chunk.compression_type(),
//!         chunk.uncompressed_size(),
//!     )?;
//!
//!     // ... write `decompressed` to disk, process it, etc.
//! }
//! # Ok::<(), Box<dyn std::error::Error>>(())
//! ```
//!
//! # Building a WAD
//!
//! ```no_run
//! use std::io::{Cursor, Write};
//! use ltk_wad::{WadBuilder, WadChunkBuilder};
//!
//! let mut builder = WadBuilder::default();
//! builder = builder.with_chunk(WadChunkBuilder::default().with_path("path/to/asset"));
//!
//! let mut output = Cursor::new(Vec::new());
//! builder.build_to_writer(&mut output, |_path_hash, cursor| {
//!     cursor.write_all(b"asset data")?;
//!     Ok(())
//! })?;
//! # Ok::<(), Box<dyn std::error::Error>>(())
//! ```

mod builder;
mod chunk;
mod chunks;
mod decoder;
mod error;
mod extractor;
mod file_ext;

pub use builder::*;
pub use chunk::*;
pub use chunks::*;
pub use decoder::*;
pub use error::*;
pub use extractor::*;
pub use file_ext::*;

use std::io::{BufReader, Read, Seek, SeekFrom};

use byteorder::{ReadBytesExt as _, LE};

#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Debug)]
/// A wad file
pub struct Wad<TSource: Read + Seek> {
    chunks: WadChunks,
    #[cfg_attr(feature = "serde", serde(skip))]
    source: TSource,
}

impl<TSource: Read + Seek> Wad<TSource> {
    pub fn chunks(&self) -> &WadChunks {
        &self.chunks
    }

    pub fn mount(mut source: TSource) -> Result<Wad<TSource>, WadError> {
        let mut reader = BufReader::new(&mut source);

        // 0x5752 = "RW"
        let magic = reader.read_u16::<LE>()?;
        if magic != 0x5752 {
            return Err(WadError::InvalidHeader {
                expected: String::from("RW"),
                actual: format!("0x{:x}", magic),
            });
        }

        let major = reader.read_u8()?;
        let minor = reader.read_u8()?;
        if major > 3 {
            return Err(WadError::InvalidVersion { major, minor });
        }

        if major == 2 {
            let _ecdsa_length = reader.seek(SeekFrom::Current(1))?;
            let _ecdsa_signature = reader.seek(SeekFrom::Current(83))?;
            let _data_checksum = reader.seek(SeekFrom::Current(8))?;
        } else if major == 3 {
            let _ecdsa_signature = reader.seek(SeekFrom::Current(256))?;
            let _data_checksum = reader.seek(SeekFrom::Current(8))?;
        }

        if major == 1 || major == 2 {
            let _toc_start_offset = reader.seek(SeekFrom::Current(2))?;
            let _toc_chunk_size = reader.seek(SeekFrom::Current(2))?;
        }

        let chunk_count = reader.read_i32::<LE>()? as usize;
        let mut raw_chunks = Vec::<WadChunk>::with_capacity(chunk_count);
        for _ in 0..chunk_count {
            let chunk = match (major, minor) {
                (3, 0..=3) => WadChunk::read_v3_1(&mut reader),
                (3, _) => WadChunk::read_v3_4(&mut reader),
                _ => Err(WadError::InvalidVersion { major, minor }),
            }?;

            raw_chunks.push(chunk);
        }

        let chunks = WadChunks::from_iter(raw_chunks);

        Ok(Wad { chunks, source })
    }

    /// Consumes the `Wad`, returning the underlying source and chunks.
    ///
    /// This enables callers to take ownership of both parts separately,
    /// e.g. to wrap the source in synchronization primitives or to create
    /// multiple readers for parallel extraction.
    pub fn into_parts(self) -> (TSource, WadChunks) {
        (self.source, self.chunks)
    }

    /// Reads the raw (compressed) bytes of a chunk from the source.
    pub fn load_chunk_raw(&mut self, chunk: &WadChunk) -> Result<Box<[u8]>, WadError> {
        let mut data = vec![0; chunk.compressed_size];

        self.source
            .seek(SeekFrom::Start(chunk.data_offset as u64))?;
        self.source.read_exact(&mut data)?;

        Ok(data.into_boxed_slice())
    }

    /// Reads and decompresses a chunk from the source.
    pub fn load_chunk_decompressed(&mut self, chunk: &WadChunk) -> Result<Box<[u8]>, WadError> {
        let raw_data = self.load_chunk_raw(chunk)?;
        decompress_raw(&raw_data, chunk.compression_type, chunk.uncompressed_size)
    }
}
