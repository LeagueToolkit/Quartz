use byteorder::{ReadBytesExt, LE};
use std::io;

use super::{format::TextureFileFormat, ReadError, Texture};

impl Texture {
    /// Read a texture from a reader
    pub fn from_reader<R: io::Read + io::Seek + ?Sized>(reader: &mut R) -> Result<Self, ReadError> {
        let magic = reader.read_u32::<LE>()?;

        match TextureFileFormat::from_magic(magic) {
            TextureFileFormat::Unknown => Err(ReadError::UnknownTextureFormat(magic)),
            format => format.read_no_magic(reader),
        }
    }
}
