use byteorder::{ByteOrder, ReadBytesExt, WriteBytesExt};
use std::io::{self, Read, Write};

/// Generic RGBA Color struct
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Debug, Clone, Copy, PartialEq, PartialOrd, Default)]
pub struct Color<T = f32> {
    pub r: T,
    pub g: T,
    pub b: T,
    pub a: T,
}

impl<T> AsRef<Color<T>> for Color<T> {
    fn as_ref(&self) -> &Color<T> {
        self
    }
}

impl<T> Color<T> {
    pub const fn new(r: T, g: T, b: T, a: T) -> Self {
        Self { r, g, b, a }
    }
}

impl Color<u8> {
    pub const ONE: Color<u8> = Color::new(255, 255, 255, 255);

    /// Writes color as RGBA u8 (4 bytes)
    pub fn to_writer(&self, writer: &mut (impl Write + ?Sized)) -> io::Result<()> {
        writer.write_u8(self.r)?;
        writer.write_u8(self.g)?;
        writer.write_u8(self.b)?;
        writer.write_u8(self.a)?;
        Ok(())
    }

    /// Writes color as BGRA u8 (4 bytes)
    pub fn to_writer_bgra(&self, writer: &mut (impl Write + ?Sized)) -> io::Result<()> {
        writer.write_u8(self.b)?;
        writer.write_u8(self.g)?;
        writer.write_u8(self.r)?;
        writer.write_u8(self.a)?;
        Ok(())
    }

    /// Writes color as RGB u8 (3 bytes, no alpha)
    pub fn to_writer_rgb(&self, writer: &mut (impl Write + ?Sized)) -> io::Result<()> {
        writer.write_u8(self.r)?;
        writer.write_u8(self.g)?;
        writer.write_u8(self.b)?;
        Ok(())
    }

    /// Reads color as RGBA u8 (4 bytes)
    #[inline]
    pub fn from_reader(reader: &mut (impl Read + ?Sized)) -> io::Result<Self> {
        Ok(Self {
            r: reader.read_u8()?,
            g: reader.read_u8()?,
            b: reader.read_u8()?,
            a: reader.read_u8()?,
        })
    }

    /// Reads color as BGRA u8 (4 bytes) - common in DirectX formats
    #[inline]
    pub fn from_reader_bgra(reader: &mut (impl Read + ?Sized)) -> io::Result<Self> {
        let b = reader.read_u8()?;
        let g = reader.read_u8()?;
        let r = reader.read_u8()?;
        let a = reader.read_u8()?;
        Ok(Self { r, g, b, a })
    }

    /// Reads color as RGB u8 (3 bytes, alpha defaults to 255)
    #[inline]
    pub fn from_reader_rgb(reader: &mut (impl Read + ?Sized)) -> io::Result<Self> {
        Ok(Self {
            r: reader.read_u8()?,
            g: reader.read_u8()?,
            b: reader.read_u8()?,
            a: 255,
        })
    }

    /// Convert to normalized f32 color
    #[inline]
    pub fn to_f32(self) -> Color<f32> {
        Color {
            r: self.r as f32 / 255.0,
            g: self.g as f32 / 255.0,
            b: self.b as f32 / 255.0,
            a: self.a as f32 / 255.0,
        }
    }
}

impl Color<f32> {
    pub const ONE: Color<f32> = Color::new(1.0, 1.0, 1.0, 1.0);

    /// Writes color as RGBA f32 (16 bytes)
    pub fn to_writer<E: ByteOrder>(&self, writer: &mut (impl Write + ?Sized)) -> io::Result<()> {
        writer.write_f32::<E>(self.r)?;
        writer.write_f32::<E>(self.g)?;
        writer.write_f32::<E>(self.b)?;
        writer.write_f32::<E>(self.a)?;
        Ok(())
    }

    /// Reads color as RGBA f32 (16 bytes)
    #[inline]
    pub fn from_reader<E: ByteOrder, R: Read + ?Sized>(reader: &mut R) -> io::Result<Self> {
        Ok(Self {
            r: reader.read_f32::<E>()?,
            g: reader.read_f32::<E>()?,
            b: reader.read_f32::<E>()?,
            a: reader.read_f32::<E>()?,
        })
    }

    /// Convert to u8 color (clamped to [0, 255])
    #[inline]
    pub fn to_u8(self) -> Color<u8> {
        Color {
            r: (self.r.clamp(0.0, 1.0) * 255.0) as u8,
            g: (self.g.clamp(0.0, 1.0) * 255.0) as u8,
            b: (self.b.clamp(0.0, 1.0) * 255.0) as u8,
            a: (self.a.clamp(0.0, 1.0) * 255.0) as u8,
        }
    }
}

impl From<Color<u8>> for Color<f32> {
    fn from(c: Color<u8>) -> Self {
        c.to_f32()
    }
}

impl From<Color<f32>> for Color<u8> {
    fn from(c: Color<f32>) -> Self {
        c.to_u8()
    }
}
