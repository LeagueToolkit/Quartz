use super::Error;
use num_enum::{IntoPrimitive, TryFromPrimitive};

#[derive(TryFromPrimitive, IntoPrimitive, Clone, Copy, Debug, Hash, PartialEq, Eq)]
#[repr(u8)]
pub enum Format {
    Etc1 = 1,
    #[num_enum(alternatives = [3])]
    Etc2Eac = 2,
    #[num_enum(alternatives = [11])]
    Bc1 = 10,
    Bc3 = 12,
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
            Format::Bc3 => 16,
            Format::Bgra8 => 4,
        }
    }
}
