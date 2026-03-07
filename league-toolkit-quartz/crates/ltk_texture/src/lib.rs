//! League extended texture (.tex) & DDS texture handling

pub mod dds;
pub mod error;
pub mod format;
mod read;
pub mod tex;

pub use dds::Dds;
pub use error::*;
pub use tex::Tex;
use tex::TexSurface;

/// Represents a texture file
#[derive(Debug)]
pub enum Texture {
    Dds(Dds),
    Tex(Tex),
}

/// Represents a texture surface
pub enum Surface<'a> {
    Tex(TexSurface<'a>),
    DdsRgba8(image_dds::SurfaceRgba8<Vec<u8>>),
}

impl Surface<'_> {
    /// Convert the surface to an [image::RgbaImage]
    pub fn into_rgba_image(self) -> Result<image::RgbaImage, ToImageError> {
        match self {
            Surface::Tex(tex) => tex.into_rgba_image(),
            Surface::DdsRgba8(surface_rgba8) => Ok(surface_rgba8.into_image()?),
        }
    }
}

impl<'a> From<TexSurface<'a>> for Surface<'a> {
    fn from(value: TexSurface<'a>) -> Self {
        Surface::Tex(value)
    }
}

/// Create a Surface from an RGBA image
///
/// # Example
/// ```no_run
/// use ltk_texture::Surface;
/// use image::RgbaImage;
///
/// let img = RgbaImage::new(256, 256);
/// let surface: Surface = img.into();
/// let rgba_image = surface.into_rgba_image().unwrap();
/// ```
impl From<image::RgbaImage> for Surface<'static> {
    fn from(img: image::RgbaImage) -> Self {
        let (width, height) = img.dimensions();
        let data = img.into_raw();

        Surface::Tex(TexSurface {
            width,
            height,
            data: tex::TexSurfaceData::Bgra8Owned(
                data.chunks_exact(4)
                    .map(|pixel| {
                        let [r, g, b, a] = pixel else { unreachable!() };
                        u32::from_le_bytes([*b, *g, *r, *a])
                    })
                    .collect(),
            ),
        })
    }
}

impl From<image::DynamicImage> for Surface<'static> {
    fn from(img: image::DynamicImage) -> Self {
        img.to_rgba8().into()
    }
}

impl Texture {
    /// Decode a mipmap from the texture
    pub fn decode_mipmap(&self, mipmap: u32) -> Result<Surface<'_>, DecompressError> {
        Ok(match self {
            Self::Dds(dds) => Surface::DdsRgba8(dds.decode_mipmap(mipmap)?),
            Self::Tex(tex) => Surface::Tex(tex.decode_mipmap(mipmap)?),
        })
    }
}

impl Texture {
    /// Get the width of the texture
    #[inline]
    #[must_use]
    pub fn width(&self) -> u32 {
        match self {
            Texture::Dds(dds) => dds.width(),
            Texture::Tex(tex) => tex.width.into(),
        }
    }
    /// Get the height of the texture
    #[inline]
    #[must_use]
    pub fn height(&self) -> u32 {
        match self {
            Texture::Dds(dds) => dds.height(),
            Texture::Tex(tex) => tex.height.into(),
        }
    }
    /// Get the number of mipmaps in the texture
    #[inline]
    #[must_use]
    pub fn mip_count(&self) -> u32 {
        match self {
            Texture::Dds(dds) => dds.mip_count(),
            Texture::Tex(tex) => tex.mip_count,
        }
    }
}

impl From<Tex> for Texture {
    fn from(value: Tex) -> Self {
        Self::Tex(value)
    }
}
impl From<Dds> for Texture {
    fn from(value: Dds) -> Self {
        Self::Dds(value)
    }
}
