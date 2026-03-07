use std::io::{self, BufReader, BufWriter, Cursor, Read, Seek, SeekFrom, Write};

use byteorder::{WriteBytesExt, LE};
use flate2::read::GzEncoder;
use itertools::Itertools;
use ltk_io_ext::measure;
use xxhash_rust::{xxh3, xxh64};

use ltk_file::LeagueFileKind;

use crate::FileExt as _;

use super::{WadChunk, WadChunkCompression, WadError};

#[derive(Debug, thiserror::Error)]
pub enum WadBuilderError {
    #[error("wad error")]
    WadError(#[from] WadError),

    #[error("io error")]
    IoError(#[from] io::Error),

    #[error("unsupported compression type: {0}")]
    UnsupportedCompressionType(WadChunkCompression),
}

/// Implements a builder interface for creating WAD files.
///
/// ## This example builds a WAD file in memory
/// ```
/// # use ltk_wad::*;
/// # use std::io::{Cursor, Write};
///
/// let mut builder = WadBuilder::default();
/// let scratch = Vec::new();
/// let mut wad_cursor = Cursor::new(scratch);
///
/// builder = builder.with_chunk(WadChunkBuilder::default().with_path("path/to/chunk"));
/// builder.build_to_writer(&mut wad_cursor, |path, cursor| {
///     cursor.write_all(&[0xAA; 100])?;
///
///     Ok(())
/// })
/// .expect("Failed to build WAD");
/// ```
#[derive(Debug, Default)]
pub struct WadBuilder {
    chunk_builders: Vec<WadChunkBuilder>,
}

impl WadBuilder {
    pub fn with_chunk(mut self, chunk: WadChunkBuilder) -> Self {
        self.chunk_builders.push(chunk);
        self
    }

    /// Build the WAD file and write it to the given writer.
    ///
    /// * `writer` - The writer to write the WAD file to.
    /// * `provide_chunk_data` - A function that provides the rawdata for each chunk.
    pub fn build_to_writer<
        TWriter: io::Write + io::Seek,
        TChunkDataProvider: Fn(u64, &mut Cursor<Vec<u8>>) -> Result<(), WadBuilderError>,
    >(
        self,
        writer: &mut TWriter,
        provide_chunk_data: TChunkDataProvider,
    ) -> Result<(), WadBuilderError> {
        // First we need to write a dummy header and TOC, so we can calculate from where to start writing the chunks
        let mut writer = BufWriter::new(writer);

        let (_, toc_offset) = self.write_dummy_toc::<TWriter>(&mut writer)?;

        // Sort the chunks by path hash, otherwise League wont load the WAD
        let ordered_chunks = self
            .chunk_builders
            .iter()
            .sorted_by_key(|chunk| chunk.path)
            .collect::<Vec<_>>();

        let mut final_chunks = Vec::new();

        for chunk in ordered_chunks {
            let mut cursor = Cursor::new(Vec::new());
            provide_chunk_data(chunk.path, &mut cursor)?;

            let chunk_data_size = cursor.get_ref().len();
            let (compressed_data, compression) =
                Self::compress_chunk_data(cursor.get_ref(), chunk.force_compression)?;
            let compressed_data_size = compressed_data.len();
            let compressed_checksum = xxh3::xxh3_64(&compressed_data);

            let chunk_data_offset = writer.stream_position()?;
            writer.write_all(&compressed_data)?;

            final_chunks.push(WadChunk {
                path_hash: chunk.path,
                data_offset: chunk_data_offset as usize,
                compressed_size: compressed_data_size,
                uncompressed_size: chunk_data_size,
                compression_type: compression,
                is_duplicated: false,
                frame_count: 0,
                start_frame: 0,
                checksum: compressed_checksum,
            });
        }

        writer.seek(SeekFrom::Start(toc_offset))?;

        for chunk in final_chunks {
            chunk.write_v3_4(&mut writer)?;
        }

        Ok(())
    }

    fn write_dummy_toc<W: io::Write + io::Seek>(
        &self,
        writer: &mut BufWriter<&mut W>,
    ) -> Result<(u64, u64), WadBuilderError> {
        let (header_toc_size, toc_offset) = measure(writer, |writer| {
            // Write the header
            writer.write_u16::<LE>(0x5752)?;
            writer.write_u8(3)?; // major
            writer.write_u8(4)?; // minor

            // Write dummy ECDSA signature
            writer.write_all(&[0; 256])?;
            writer.write_u64::<LE>(0)?;

            // Write dummy TOC
            writer.write_u32::<LE>(self.chunk_builders.len() as u32)?;
            let toc_offset = writer.stream_position()?;
            for _ in self.chunk_builders.iter() {
                writer.write_all(&[0; 32])?;
            }

            Ok::<_, WadBuilderError>(toc_offset)
        })?;

        Ok((header_toc_size, toc_offset))
    }

    fn compress_chunk_data(
        data: &[u8],
        force_compression: Option<WadChunkCompression>,
    ) -> Result<(Vec<u8>, WadChunkCompression), WadBuilderError> {
        let (compressed_data, compression) = match force_compression {
            Some(compression) => (
                Self::compress_chunk_data_by_compression(data, compression)?,
                compression,
            ),
            None => {
                let kind = LeagueFileKind::identify_from_bytes(data);
                let compression = kind.ideal_compression();
                let compressed_data = Self::compress_chunk_data_by_compression(data, compression)?;

                (compressed_data, compression)
            }
        };

        Ok((compressed_data, compression))
    }

    fn compress_chunk_data_by_compression(
        data: &[u8],
        compression: WadChunkCompression,
    ) -> Result<Vec<u8>, WadBuilderError> {
        let mut compressed_data = Vec::new();
        match compression {
            WadChunkCompression::None => {
                compressed_data = data.to_vec();
            }
            WadChunkCompression::GZip => {
                let reader = BufReader::new(data);
                let mut encoder = GzEncoder::new(reader, flate2::Compression::default());

                encoder.read_to_end(&mut compressed_data)?;
            }
            WadChunkCompression::Zstd => {
                #[cfg(feature = "zstd")]
                {
                    let mut encoder = zstd::Encoder::new(BufWriter::new(&mut compressed_data), 3)?;
                    encoder.write_all(data)?;
                    encoder.finish()?;
                }
                #[cfg(feature = "ruzstd")]
                {
                    ruzstd::encoding::compress(
                        data,
                        &mut compressed_data,
                        ruzstd::encoding::CompressionLevel::Fastest,
                    );
                }
            }
            WadChunkCompression::Satellite => {
                return Err(WadBuilderError::UnsupportedCompressionType(compression));
            }
            WadChunkCompression::ZstdMulti => {
                return Err(WadBuilderError::UnsupportedCompressionType(compression));
            }
        }

        Ok(compressed_data)
    }
}

/// Implements a builder interface for creating WAD chunks.
///
/// # Examples
/// ```
/// # use ltk_wad::*;
/// #
/// let builder = WadChunkBuilder::default();
/// builder.with_path("path/to/chunk");
/// builder.with_force_compression(WadChunkCompression::Zstd);
/// ```
#[derive(Debug, Clone, Copy, Default)]
pub struct WadChunkBuilder {
    /// The path hash of the chunk. Hashed using xxhash64.
    path: u64,

    /// If provided, the chunk will be compressed using the given compression type, otherwise the ideal compression will be used.
    force_compression: Option<WadChunkCompression>,
}

impl WadChunkBuilder {
    pub fn with_path(mut self, path: impl AsRef<str>) -> Self {
        self.path = xxh64::xxh64(path.as_ref().to_lowercase().as_bytes(), 0);
        self
    }

    pub fn with_path_hash(mut self, path_hash: u64) -> Self {
        self.path = path_hash;
        self
    }

    pub fn with_force_compression(mut self, compression: WadChunkCompression) -> Self {
        self.force_compression = Some(compression);
        self
    }
}

#[cfg(test)]
mod tests {
    use crate::Wad;

    use super::*;

    #[test]
    fn test_wad_builder() {
        let scratch = Vec::new();
        let mut cursor = Cursor::new(scratch);

        let mut builder = WadBuilder::default();
        builder = builder.with_chunk(WadChunkBuilder::default().with_path("test1"));
        builder = builder.with_chunk(WadChunkBuilder::default().with_path("test2"));
        builder = builder.with_chunk(WadChunkBuilder::default().with_path("test3"));

        builder
            .build_to_writer(&mut cursor, |_path, cursor| {
                cursor.write_all(&[0xAA; 100])?;

                Ok(())
            })
            .expect("Failed to build WAD");

        cursor.set_position(0);

        let wad = Wad::mount(cursor).expect("Failed to mount WAD");
        assert_eq!(wad.chunks().len(), 3);

        let chunk = wad.chunks().get(xxh64::xxh64(b"test1", 0)).unwrap();
        assert_eq!(chunk.path_hash, xxh64::xxh64(b"test1", 0));
        assert_eq!(chunk.compressed_size, 17);
        assert_eq!(chunk.uncompressed_size, 100);
        assert_eq!(chunk.compression_type, WadChunkCompression::Zstd);
    }
}
