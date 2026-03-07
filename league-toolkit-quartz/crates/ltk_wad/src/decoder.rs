use std::io::{Cursor, Read};

use super::{WadChunkCompression, WadError};
use flate2::read::GzDecoder;
use memchr::memmem;

const ZSTD_MAGIC: [u8; 4] = [0x28, 0xB5, 0x2F, 0xFD];

#[cfg(all(feature = "zstd", feature = "ruzstd"))]
compile_error!("feature \"zstd\" and feature \"ruzstd\" cannot be enabled at the same time");

/// Decompresses raw chunk data that has already been read from a WAD source.
///
/// This enables a two-phase parallel workflow:
/// 1. Read raw compressed bytes sequentially via [`crate::Wad::load_chunk_raw`]
/// 2. Decompress in parallel using this function (e.g. with rayon)
///
/// For [`WadChunkCompression::None`], the input data is returned as-is.
pub fn decompress_raw(
    raw_data: &[u8],
    compression: WadChunkCompression,
    uncompressed_size: usize,
) -> Result<Box<[u8]>, WadError> {
    match compression {
        WadChunkCompression::None => Ok(raw_data.into()),
        WadChunkCompression::GZip => decompress_gzip(raw_data, uncompressed_size),
        WadChunkCompression::Satellite => Err(WadError::Other(String::from(
            "satellite chunks are not supported",
        ))),
        WadChunkCompression::Zstd => decompress_zstd(raw_data, uncompressed_size),
        WadChunkCompression::ZstdMulti => decompress_zstd_multi(raw_data, uncompressed_size),
    }
}

fn decompress_gzip(raw_data: &[u8], uncompressed_size: usize) -> Result<Box<[u8]>, WadError> {
    let mut data = vec![0; uncompressed_size];
    GzDecoder::new(Cursor::new(raw_data)).read_exact(&mut data)?;
    Ok(data.into_boxed_slice())
}

fn decompress_zstd(raw_data: &[u8], uncompressed_size: usize) -> Result<Box<[u8]>, WadError> {
    let mut data = vec![0; uncompressed_size];

    #[cfg(feature = "zstd")]
    {
        zstd::Decoder::new(Cursor::new(raw_data))
            .expect("failed to create zstd decoder")
            .read_exact(&mut data)?;
    }
    #[cfg(feature = "ruzstd")]
    {
        ruzstd::decoding::StreamingDecoder::new(Cursor::new(raw_data))
            .expect("failed to create ruzstd decoder")
            .read_exact(&mut data)?;
    }

    Ok(data.into_boxed_slice())
}

fn decompress_zstd_multi(raw_data: &[u8], uncompressed_size: usize) -> Result<Box<[u8]>, WadError> {
    let mut data = vec![0; uncompressed_size];

    let zstd_magic_offset =
        memmem::find(raw_data, &ZSTD_MAGIC).ok_or(WadError::DecompressionFailure {
            path_hash: 0,
            reason: String::from("failed to find zstd magic"),
        })?;

    // copy raw uncompressed data which exists before first zstd frame
    data[..zstd_magic_offset].copy_from_slice(&raw_data[..zstd_magic_offset]);

    // decode zstd data from the magic offset onward
    let zstd_data = &raw_data[zstd_magic_offset..];

    #[cfg(feature = "zstd")]
    {
        zstd::Decoder::new(Cursor::new(zstd_data))
            .expect("failed to create zstd decoder")
            .read_exact(&mut data[zstd_magic_offset..])?;
    }
    #[cfg(feature = "ruzstd")]
    {
        ruzstd::decoding::StreamingDecoder::new(Cursor::new(zstd_data))
            .expect("failed to create ruzstd decoder")
            .read(&mut data[zstd_magic_offset..])?;
    }

    Ok(data.into_boxed_slice())
}
