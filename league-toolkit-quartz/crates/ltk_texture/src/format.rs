use super::{Dds, ReadError, Tex, Texture};
use byteorder::{ReadBytesExt, LE};
use ltk_io_ext::window;
use std::{
    fmt::Display,
    io::{self},
};

#[derive(Clone, Copy, Hash, Debug, PartialEq, Eq)]
pub enum TextureFileFormat {
    /// <https://en.wikipedia.org/wiki/DirectDraw_Surface>
    DDS,
    /// League of Legends proprietary format
    TEX,
    Unknown,
}

impl Display for TextureFileFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            TextureFileFormat::DDS => "DDS",
            TextureFileFormat::TEX => "TEX",
            TextureFileFormat::Unknown => "unknown",
        })
    }
}

impl TextureFileFormat {
    /// Get the format from a magic number
    pub fn from_magic(magic: u32) -> Self {
        match magic {
            Dds::MAGIC => Self::DDS,
            Tex::MAGIC => Self::TEX,
            _ => Self::Unknown,
        }
    }

    /// Read a texture from a reader
    pub fn read<R: io::Read + ?Sized>(&self, reader: &mut R) -> Result<Texture, ReadError> {
        match self {
            TextureFileFormat::DDS => Ok(Dds::from_reader(reader)?.into()),
            TextureFileFormat::TEX => Ok(Tex::from_reader(reader)?.into()),
            _ => Err(ReadError::UnsupportedTextureFormat(*self)),
        }
    }

    /// Attempts to read a texture of this format - without reading the 4 magic bytes at the start
    /// of the file.
    ///
    /// **NOTE**: You **must** make sure the reader does not include the magic bytes!
    ///
    /// Returns an error if the texture format is unsupported.
    pub fn read_no_magic<R: io::Read + ?Sized>(
        &self,
        reader: &mut R,
    ) -> Result<Texture, ReadError> {
        match self {
            TextureFileFormat::DDS => Ok(Dds::from_reader_no_magic(reader)?.into()),
            TextureFileFormat::TEX => Ok(Tex::from_reader_no_magic(reader)?.into()),
            _ => Err(ReadError::UnsupportedTextureFormat(*self)),
        }
    }

    /// Identify the texture format from a reader
    ///
    /// # Example
    /// ```no_run
    /// use ltk_texture::format::TextureFileFormat;
    /// use std::fs::File;
    ///
    /// let mut file = File::open("texture.tex").unwrap();
    /// let format = TextureFileFormat::identify(&mut file).unwrap();
    /// assert_eq!(format, TextureFileFormat::TEX);
    /// ```
    ///
    /// **NOTE**: The reader **must** implement `io::Seek` so we can seek back after reading the magic number.
    pub fn identify(reader: &mut (impl io::Read + io::Seek)) -> Result<Self, ReadError> {
        let magic = window(reader, |reader| -> Result<u32, io::Error> {
            let magic = reader.read_u32::<LE>()?;
            Ok(magic)
        })?;

        Ok(Self::from_magic(magic))
    }
}

//#[cfg(test)]
//mod tests {
//    use image::codecs::png::PngEncoder;
//    use image_dds::image_from_dds;
//    use io::BufWriter;
//    use std::fs;
//    use test_log::test;
//
//    use super::*;
//
//    #[test]
//    fn dds() {
//        let format = TextureFileFormat::DDS;
//        let mut file = fs::File::open("/home/alan/Downloads/aurora_square_0.aurora.dds").unwrap();
//        let Texture::Dds(dds) = format.read_no_magic(&mut file).unwrap() else {
//            unreachable!();
//        };
//        let dds = dds.decode_mipmap(0).unwrap();
//
//        let img = dds.into_image().unwrap();
//        let out = PngEncoder::new(
//            std::fs::File::create("./out.png")
//                .map(BufWriter::new)
//                .unwrap(),
//        );
//        img.write_with_encoder(out).unwrap();
//    }
//}
