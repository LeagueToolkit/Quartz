use byteorder::{ReadBytesExt, LE};
use num_enum::{IntoPrimitive, TryFromPrimitive};
use std::{hint::unreachable_unchecked, io};

mod encode;
mod error;
mod format;
mod surface;
mod write;

pub use encode::*;
pub use error::*;
pub use format::*;
pub use surface::*;

use super::ReadError;

/// League extended texture file (.tex)
#[derive(Debug)]
pub struct Tex {
    pub width: u16,
    pub height: u16,
    pub format: Format,
    pub resource_type: u8,
    pub flags: TextureFlags,
    pub mip_count: u32,
    data: Vec<u8>,
}

impl Tex {
    pub const MAGIC: u32 = u32::from_le_bytes(*b"TEX\0");

    /// Checks the texture flags for whether the texture contains mipmaps
    pub fn has_mipmaps(&self) -> bool {
        self.flags.contains(TextureFlags::HasMipMaps)
    }

    /// Encode a new Tex from an RGBA image with encoding options
    ///
    /// # Example
    /// ```no_run
    /// use ltk_texture::Tex;
    /// use ltk_texture::tex::{EncodeOptions, Format, MipmapFilter};
    /// use image::RgbaImage;
    ///
    /// let img = RgbaImage::new(256, 256);
    ///
    /// // Without mipmaps
    /// let tex = Tex::encode_rgba_image(&img, EncodeOptions::new(Format::Bc3)).unwrap();
    ///
    /// // With mipmaps
    /// let tex_mips = Tex::encode_rgba_image(
    ///     &img,
    ///     EncodeOptions::new(Format::Bc3).with_mipmaps()
    /// ).unwrap();
    ///
    /// // With mipmaps and custom filter
    /// let tex_lanczos = Tex::encode_rgba_image(
    ///     &img,
    ///     EncodeOptions::new(Format::Bc3)
    ///         .with_mipmaps()
    ///         .with_mipmap_filter(MipmapFilter::Lanczos3)
    /// ).unwrap();
    /// ```
    pub fn encode_rgba_image(
        img: &image::RgbaImage,
        options: EncodeOptions,
    ) -> Result<Self, EncodeError> {
        let (width, height) = img.dimensions();

        let (data, mip_count, flags) = if options.generate_mipmaps {
            let (mip_data, mip_count) =
                encode_rgba_with_mipmaps(img, options.format, options.mipmap_filter)?;
            (mip_data, mip_count, TextureFlags::HasMipMaps)
        } else {
            let rgba_data = img.as_raw();
            let encoded = encode_rgba(width, height, rgba_data, options.format)?;
            (encoded, 1, TextureFlags::empty())
        };

        Ok(Self {
            width: width as u16,
            height: height as u16,
            format: options.format,
            resource_type: 0, // texture
            flags,
            mip_count,
            data,
        })
    }

    /// Encode a new Tex from a DynamicImage with encoding options
    ///
    /// # Example
    /// ```no_run
    /// use ltk_texture::Tex;
    /// use ltk_texture::tex::{EncodeOptions, Format};
    ///
    /// let img = image::open("texture.png").unwrap();
    /// let tex = Tex::encode_dynamic_image(
    ///     img,
    ///     EncodeOptions::new(Format::Bc3).with_mipmaps()
    /// ).unwrap();
    /// ```
    pub fn encode_dynamic_image(
        img: image::DynamicImage,
        options: EncodeOptions,
    ) -> Result<Self, EncodeError> {
        Self::encode_rgba_image(&img.to_rgba8(), options)
    }
}

impl Tex {
    /// Try to decode a single mipmap, where 0 is full resolution, and [Self::mip_count] is the smallest
    /// mip (1x1).
    pub fn decode_mipmap(&self, level: u32) -> Result<TexSurface<'_>, DecodeErr> {
        let level = level.min(self.mip_count - 1);
        let width = self.width as usize;
        let height = self.height as usize;
        let (block_w, block_h) = self.format.block_size();

        let mip_dims = |level: u32| ((width >> level).max(1), (height >> level).max(1));
        let mip_bytes = |dims: (usize, usize)| {
            (dims.0.div_ceil(block_w)) * (dims.1.div_ceil(block_h)) * self.format.bytes_per_block()
        };

        // sum all mips before our one
        // (league sorts mips smallest -> largest so our iterator counts up)
        let off = (level + 1..self.mip_count)
            .map(|level| mip_bytes(mip_dims(level)))
            .sum::<usize>();

        // size of mip
        let (w, h) = mip_dims(level);

        let data = match matches!(self.format, Format::Bgra8) {
            true => TexSurfaceData::Bgra8Slice(
                // TODO: test me (this is likely wrong)
                &self.data[off..off + (w * h * self.format.bytes_per_block())],
            ),
            false => {
                let mut data = vec![0; w * h];
                let i = &self.data[off..off + mip_bytes((w, h))];
                let o = &mut data;
                match self.format {
                    Format::Etc1 => {
                        texture2ddecoder::decode_etc1(i, w, h, o).map_err(DecodeErr::Etc1)
                    }
                    Format::Bc1 => texture2ddecoder::decode_bc1(i, w, h, o).map_err(DecodeErr::Bc1),
                    Format::Bc3 => texture2ddecoder::decode_bc3(i, w, h, o).map_err(DecodeErr::Bc3),
                    Format::Etc2Eac => {
                        texture2ddecoder::decode_etc2_rgba8(i, w, h, o).map_err(DecodeErr::Etc2Eac)
                    }
                    // Safety: the outer match ensures we can't reach this arm
                    Format::Bgra8 => unsafe { unreachable_unchecked() },
                }?;
                TexSurfaceData::Bgra8Owned(data)
            }
        };

        Ok(TexSurface {
            width: w as _,
            height: h as _,
            data,
        })
    }

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
    pub fn from_reader_no_magic<R: io::Read + ?Sized>(reader: &mut R) -> Result<Self, Error> {
        let (width, height) = (reader.read_u16::<LE>()?, reader.read_u16::<LE>()?);

        let _is_extended_format = reader.read_u8(); // maybe..
        let format = Format::from_u8(reader.read_u8()?)?;

        // (0: texture, 1: cubemap, 2: surface, 3: volumetexture)
        let resource_type = reader.read_u8()?; // maybe..

        let flags = reader.read_u8()?;
        let flags = TextureFlags::from_bits(flags).ok_or(Error::InvalidTextureFlags(flags))?;

        let mut data = Vec::new();
        reader.read_to_end(&mut data)?;

        Ok(Self {
            width,
            height,
            format,
            flags,
            resource_type,
            data,
            mip_count: match flags.contains(TextureFlags::HasMipMaps) {
                true => ((height.max(width) as f32).log2().floor() + 1.0) as u32,
                false => 1,
            },
        })
    }
}

bitflags::bitflags! {
    #[derive(Debug, Clone, Copy)]
    pub struct TextureFlags: u8 {
        const HasMipMaps = 1;
        const Mystery = 2;
    }
}

#[derive(TryFromPrimitive, IntoPrimitive, Clone, Copy, Debug, Hash, PartialEq, Eq)]
#[repr(u8)]
pub enum TextureFilter {
    None,
    Nearest,
    Linear,
}

#[derive(TryFromPrimitive, IntoPrimitive, Clone, Copy, Debug, Hash, PartialEq, Eq)]
#[repr(u8)]
pub enum TextureAddress {
    Wrap,
    Clamp,
}

//#[cfg(test)]
//mod tests {
//    use super::*;
//    use image::codecs::png::PngEncoder;
//    use io::BufWriter;
//    use std::fs;
//    use test_log::test;
//
//    #[test]
//    fn tex() {
//        let mut file = fs::File::open("/home/alan/Downloads/ashe_base_2011_tx_cm.tex").unwrap();
//        let tex = Tex::from_reader(&mut file).unwrap();
//
//        dbg!(tex.format);
//        dbg!(tex.width, tex.height);
//        dbg!(tex.has_mipmaps());
//        dbg!(tex.mip_count);
//        for i in 0..tex.mip_count {
//            let tex = tex.decode_mipmap(i).unwrap();
//            let img = tex.into_rgba_image().unwrap();
//
//            let out = PngEncoder::new(
//                std::fs::File::create(format!("./out_{i}.png"))
//                    .map(BufWriter::new)
//                    .unwrap(),
//            );
//            img.write_with_encoder(out).unwrap();
//        }
//        panic!("success");
//    }
//}
