use std::io::{BufReader, Read};
use std::{fmt, io};

use byteorder::{ReadBytesExt as _, WriteBytesExt as _, LE};
use num_enum::{IntoPrimitive, TryFromPrimitive};

use super::WadError;

#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, TryFromPrimitive, IntoPrimitive)]
#[repr(u8)]
pub enum WadChunkCompression {
    None = 0,
    GZip = 1,
    Satellite = 2,
    Zstd = 3,
    ZstdMulti = 4,
}

impl fmt::Display for WadChunkCompression {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            WadChunkCompression::None => write!(f, "None"),
            WadChunkCompression::GZip => write!(f, "GZip"),
            WadChunkCompression::Satellite => write!(f, "Satellite"),
            WadChunkCompression::Zstd => write!(f, "Zstd"),
            WadChunkCompression::ZstdMulti => write!(f, "ZstdMulti"),
        }
    }
}

#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
/// A single wad chunk
pub struct WadChunk {
    pub path_hash: u64,
    pub data_offset: usize,
    pub compressed_size: usize,
    pub uncompressed_size: usize,
    pub compression_type: WadChunkCompression,
    pub is_duplicated: bool,
    pub frame_count: u8,
    pub start_frame: u32,
    pub checksum: u64,
}

impl WadChunk {
    pub fn read_v3_1<R: Read>(reader: &mut BufReader<R>) -> Result<WadChunk, WadError> {
        let path_hash = reader.read_u64::<LE>()?;
        let data_offset = reader.read_u32::<LE>()? as usize;
        let compressed_size = reader.read_i32::<LE>()? as usize;
        let uncompressed_size = reader.read_i32::<LE>()? as usize;

        let type_frame_count = reader.read_u8()?;
        let frame_count = type_frame_count >> 4;
        let compression_type = WadChunkCompression::try_from_primitive(type_frame_count & 0xF)
            .map_err(|_| WadError::InvalidChunkCompression {
                compression: type_frame_count & 0xF,
            })?;

        let is_duplicated = reader.read_u8()? == 1;
        let start_frame = reader.read_u16::<LE>()?;
        let checksum = reader.read_u64::<LE>()?;

        Ok(WadChunk {
            path_hash,
            data_offset,
            compressed_size,
            uncompressed_size,
            compression_type,
            is_duplicated,
            frame_count,
            start_frame: start_frame as u32,
            checksum,
        })
    }

    pub fn read_v3_4<R: Read>(reader: &mut BufReader<R>) -> Result<WadChunk, WadError> {
        let path_hash = reader.read_u64::<LE>()?;
        let data_offset = reader.read_u32::<LE>()? as usize;
        let compressed_size = reader.read_u32::<LE>()? as usize;
        let uncompressed_size = reader.read_u32::<LE>()? as usize;

        let type_frame_count = reader.read_u8()?;
        let frame_count = type_frame_count >> 4;
        let compression_type = WadChunkCompression::try_from_primitive(type_frame_count & 0xF)
            .map_err(|_| WadError::InvalidChunkCompression {
                compression: type_frame_count & 0xF,
            })?;

        let start_frame = read_24_bit_subchunk_start_frame(reader)?;

        let checksum = reader.read_u64::<LE>()?;

        Ok(WadChunk {
            path_hash,
            data_offset,
            compressed_size,
            uncompressed_size,
            compression_type,
            is_duplicated: false, // v3.4 always has is_duplicated = false
            frame_count,
            start_frame: start_frame as u32,
            checksum,
        })
    }

    pub fn write_v3_4<W: io::Write>(&self, writer: &mut W) -> Result<(), WadError> {
        writer.write_u64::<LE>(self.path_hash)?;
        writer.write_u32::<LE>(self.data_offset as u32)?;
        writer.write_u32::<LE>(self.compressed_size as u32)?;
        writer.write_u32::<LE>(self.uncompressed_size as u32)?;

        let type_frame_count = (self.frame_count << 4) | (self.compression_type as u8 & 0xF);
        writer.write_u8(type_frame_count)?;

        write_24_bit_subchunk_start_frame(writer, self.start_frame)?;

        writer.write_u64::<LE>(self.checksum)?;

        Ok(())
    }

    pub fn path_hash(&self) -> u64 {
        self.path_hash
    }
    pub fn data_offset(&self) -> usize {
        self.data_offset
    }
    pub fn compressed_size(&self) -> usize {
        self.compressed_size
    }
    pub fn uncompressed_size(&self) -> usize {
        self.uncompressed_size
    }
    pub fn compression_type(&self) -> WadChunkCompression {
        self.compression_type
    }
    pub fn checksum(&self) -> u64 {
        self.checksum
    }
}

pub(crate) fn read_24_bit_subchunk_start_frame<R: Read>(
    reader: &mut BufReader<R>,
) -> Result<u32, WadError> {
    let start_frame_hi = reader.read_u8()? as u32;
    let start_frame_lo = reader.read_u8()? as u32;
    let start_frame_mi = reader.read_u8()? as u32;
    let start_frame = start_frame_hi << 16 | start_frame_mi << 8 | start_frame_lo;

    Ok(start_frame)
}

pub(crate) fn write_24_bit_subchunk_start_frame<W: io::Write>(
    writer: &mut W,
    start_frame: u32,
) -> Result<(), WadError> {
    writer.write_u8(((start_frame >> 16) & 0xFF) as u8)?;
    writer.write_u8((start_frame & 0xFF) as u8)?;
    writer.write_u8(((start_frame >> 8) & 0xFF) as u8)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::io::{BufReader, Cursor};

    use crate::{read_24_bit_subchunk_start_frame, write_24_bit_subchunk_start_frame};

    #[test]
    fn test_read_24_bit_subchunk_start_frame() {
        let mut reader = BufReader::new(Cursor::new([0x01, 0x03, 0x02]));
        let start_frame = read_24_bit_subchunk_start_frame(&mut reader).unwrap();
        assert_eq!(start_frame, 0x010203);
    }

    #[test]
    fn test_write_24_bit_subchunk_start_frame() {
        let mut writer = Vec::new();
        write_24_bit_subchunk_start_frame(&mut writer, 0x010302).unwrap();
        assert_eq!(writer, [0x01, 0x02, 0x03]);
    }
}
