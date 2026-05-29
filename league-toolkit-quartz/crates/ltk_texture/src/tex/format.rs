use super::Error;
use num_enum::{IntoPrimitive, TryFromPrimitive};

#[derive(TryFromPrimitive, IntoPrimitive, Clone, Copy, Debug, Hash, PartialEq, Eq)]
#[repr(u8)]
pub enum Format {
    Etc1 = 1,
    #[num_enum(alternatives = [3])]
    Etc2Eac = 2,
    Bc1 = 10,
    /// BC2 / DXT3 — explicit 4-bit alpha. League TEX format code 11.
    /// (Previously mis-mapped as a BC1 alternative, which mis-decoded the data.)
    Bc2 = 11,
    Bc3 = 12,
    /// BC7 — high-quality RGBA. League TEX format code 13.
    Bc7 = 13,
    /// BC5 — two-channel (RG), e.g. normal maps. League TEX format code 14.
    Bc5 = 14,
    /// Uncompressed BGRA8
    Bgra8 = 20,
}

impl Format {
    pub fn from_u8(format: u8) -> Result<Self, Error> {
        Self::try_from(format).map_err(|_| Error::UnknownTextureFormat(format))
    }

    pub fn to_u8(&self) -> u8 {
        (*self).into()
    }

    /// Get the block size of the format
    pub fn block_size(&self) -> (usize, usize) {
        match self {
            Format::Bgra8 => (1, 1),
            _ => (4, 4),
        }
    }

    /// Get the bytes per block of the format
    pub fn bytes_per_block(&self) -> usize {
        match self {
            Format::Etc1 => 8,
            Format::Etc2Eac => 16,
            Format::Bc1 => 8,
            Format::Bc2 => 16,
            Format::Bc3 => 16,
            Format::Bc7 => 16,
            Format::Bc5 => 16,
            Format::Bgra8 => 4,
        }
    }
}
