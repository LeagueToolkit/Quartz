use super::Tex;
use byteorder::{WriteBytesExt, LE};
use std::io::{self, Write};

impl Tex {
    /// Write the Tex to a writer
    ///
    /// # Example
    /// ```no_run
    /// use ltk_texture::Tex;
    /// use ltk_texture::tex::{EncodeOptions, Format};
    /// use image::RgbaImage;
    /// use std::fs::File;
    ///
    /// let img = RgbaImage::new(256, 256);
    /// let tex = Tex::encode_rgba_image(&img, EncodeOptions::new(Format::Bc3)).unwrap();
    ///
    /// // Write to file
    /// let mut file = File::create("texture.tex").unwrap();
    /// tex.write(&mut file).unwrap();
    /// ```
    pub fn write<W: Write>(&self, writer: &mut W) -> io::Result<()> {
        // Write magic
        writer.write_u32::<LE>(Self::MAGIC)?;

        // Write header
        writer.write_u16::<LE>(self.width)?;
        writer.write_u16::<LE>(self.height)?;
        writer.write_u8(0)?; // is_extended_format (maybe)
        writer.write_u8(self.format.into())?;
        writer.write_u8(self.resource_type)?;
        writer.write_u8(self.flags.bits())?;

        // Write data
        writer.write_all(&self.data)?;

        Ok(())
    }
}
