use byteorder::{ReadBytesExt, LE};
use std::io;

use image_dds::SurfaceRgba8;

use super::error::ReadError;

/// .dds texture file
#[derive(Debug)]
pub struct Dds {
    file: ddsfile::Dds,
}

impl Dds {
    pub const MAGIC: u32 = u32::from_le_bytes(*b"DDS ");

    /// Get the width of the texture
    #[inline]
    #[must_use]
    pub fn width(&self) -> u32 {
        self.file.get_width()
    }

    /// Get the height of the texture
    #[inline]
    #[must_use]
    pub fn height(&self) -> u32 {
        self.file.get_width()
    }

    /// Get the number of mipmaps in the texture
    #[inline]
    #[must_use]
    pub fn mip_count(&self) -> u32 {
        self.file.get_num_mipmap_levels()
    }
}

impl Dds {
    /// Decode a mipmap from the texture
    #[inline]
    pub fn decode_mipmap(&self, mipmap: u32) -> Result<SurfaceRgba8<Vec<u8>>, DecodeErr> {
        let mipmap = mipmap.min(self.file.get_num_mipmap_levels() - 1);
        Ok(image_dds::Surface::from_dds(&self.file)?
            .decode_layers_mipmaps_rgba8(0..self.file.get_num_array_layers(), mipmap..mipmap + 1)?)
    }
}

#[derive(thiserror::Error, Debug)]
pub enum DecodeErr {
    /// Error decoding the DDS file
    #[error(transparent)]
    DdsErr(#[from] image_dds::error::CreateImageError),
    /// Error decoding the surface
    #[error(transparent)]
    SurfaceErr(#[from] image_dds::error::SurfaceError),
}

impl Dds {
    /// Read a DDS texture from a reader
    pub fn from_reader<R: io::Read + ?Sized>(reader: &mut R) -> Result<Self, ReadError> {
        let magic = reader.read_u32::<LE>()?; // skip magic
        if magic != Self::MAGIC {
            return Err(ReadError::UnexpectedMagic {
                expected: Self::MAGIC,
                got: magic,
            });
        }
        Ok(Self::from_reader_no_magic(reader)?)
    }

    /// Read a DDS texture from a reader without magic
    pub fn from_reader_no_magic<R: io::Read + ?Sized>(
        reader: &mut R,
    ) -> Result<Self, ddsfile::Error> {
        let header = ddsfile::Header::read(&mut *reader)?;

        let header10 = if header.spf.fourcc == Some(ddsfile::FourCC(<ddsfile::FourCC>::DX10)) {
            Some(ddsfile::Header10::read(&mut *reader)?)
        } else {
            None
        };

        let mut data: Vec<u8> = Vec::new();
        reader.read_to_end(&mut data)?;
        Ok(Self {
            file: ddsfile::Dds {
                header,
                header10,
                data,
            },
        })
    }
}
