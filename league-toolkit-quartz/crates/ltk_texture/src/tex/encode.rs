use super::Format;

#[cfg(feature = "intel-tex")]
use intel_tex_2::{bc1, bc3, RgbaSurface};

#[cfg(any(feature = "intel-tex", test))]
#[inline]
fn clamp01(x: f32) -> f32 {
    x.clamp(0.0, 1.0)
}

#[cfg(any(feature = "intel-tex", test))]
#[inline]
fn quantize_to_bits(x: f32, bits: u8) -> f32 {
    debug_assert!((1..=8).contains(&bits));
    let levels = (1u32 << bits) - 1;
    (x * levels as f32).round() / levels as f32
}

/// Dither RGB toward 5/6/5 (BC1/BC3 color endpoint-ish). Alpha is untouched.
///
/// Floyd–Steinberg error diffusion with serpentine scan to reduce directional artifacts.
#[cfg(any(feature = "intel-tex", test))]
fn floyd_steinberg_dither_rgb565_in_place(width: u32, height: u32, rgba: &mut [u8]) {
    let w = width as usize;
    let h = height as usize;
    if w == 0 || h == 0 {
        return;
    }
    debug_assert_eq!(rgba.len(), w * h * 4);

    // Error buffers for current and next row: per-x accumulated error for RGB.
    let mut err_curr = vec![[0.0f32; 3]; w];
    let mut err_next = vec![[0.0f32; 3]; w];

    for y in 0..h {
        let left_to_right = (y & 1) == 0;

        let (x_start, x_end, step): (isize, isize, isize) = if left_to_right {
            (0, w as isize, 1)
        } else {
            (w as isize - 1, -1, -1)
        };

        let mut x = x_start;
        while x != x_end {
            let xi = x as usize;
            let idx = (y * w + xi) * 4;

            let r0 = rgba[idx] as f32 / 255.0 + err_curr[xi][0];
            let g0 = rgba[idx + 1] as f32 / 255.0 + err_curr[xi][1];
            let b0 = rgba[idx + 2] as f32 / 255.0 + err_curr[xi][2];

            let r = clamp01(r0);
            let g = clamp01(g0);
            let b = clamp01(b0);

            // Quantize to 5/6/5
            let rq = quantize_to_bits(r, 5);
            let gq = quantize_to_bits(g, 6);
            let bq = quantize_to_bits(b, 5);

            // Write back (alpha untouched)
            rgba[idx] = (rq * 255.0).round().clamp(0.0, 255.0) as u8;
            rgba[idx + 1] = (gq * 255.0).round().clamp(0.0, 255.0) as u8;
            rgba[idx + 2] = (bq * 255.0).round().clamp(0.0, 255.0) as u8;

            // Error
            let er = r - rq;
            let eg = g - gq;
            let eb = b - bq;

            // Floyd–Steinberg weights:
            // right 7/16, down-left 3/16, down 5/16, down-right 1/16
            let xr = x + step; // "right" in scan direction
            let xl = x - step; // "left" in scan direction

            // right (same row)
            if xr >= 0 && (xr as usize) < w {
                let xri = xr as usize;
                err_curr[xri][0] += er * (7.0 / 16.0);
                err_curr[xri][1] += eg * (7.0 / 16.0);
                err_curr[xri][2] += eb * (7.0 / 16.0);
            }

            // next row
            if y + 1 < h {
                // down
                err_next[xi][0] += er * (5.0 / 16.0);
                err_next[xi][1] += eg * (5.0 / 16.0);
                err_next[xi][2] += eb * (5.0 / 16.0);

                // down-left (relative to scan direction)
                if xl >= 0 && (xl as usize) < w {
                    let xli = xl as usize;
                    err_next[xli][0] += er * (3.0 / 16.0);
                    err_next[xli][1] += eg * (3.0 / 16.0);
                    err_next[xli][2] += eb * (3.0 / 16.0);
                }

                // down-right
                if xr >= 0 && (xr as usize) < w {
                    let xri = xr as usize;
                    err_next[xri][0] += er * (1.0 / 16.0);
                    err_next[xri][1] += eg * (1.0 / 16.0);
                    err_next[xri][2] += eb * (1.0 / 16.0);
                }
            }

            x += step;
        }

        // Rotate error buffers
        std::mem::swap(&mut err_curr, &mut err_next);
        err_next.fill([0.0; 3]);
    }
}

/// Options for encoding textures
#[derive(Debug, Clone)]
pub struct EncodeOptions {
    /// Texture format to encode to
    pub format: Format,
    /// Whether to generate mipmaps
    pub generate_mipmaps: bool,
    /// Filter type to use for mipmap generation
    pub mipmap_filter: MipmapFilter,
}

/// Filter types for mipmap generation
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum MipmapFilter {
    /// Nearest neighbor (fastest, lowest quality)
    Nearest,
    /// Triangle/Bilinear (good balance of speed and quality)
    #[default]
    Triangle,
    /// Cubic/Bicubic (slower, higher quality)
    CatmullRom,
    /// Lanczos3 (slowest, highest quality)
    Lanczos3,
}

impl MipmapFilter {
    fn to_image_filter(self) -> image::imageops::FilterType {
        match self {
            Self::Nearest => image::imageops::FilterType::Nearest,
            Self::Triangle => image::imageops::FilterType::Triangle,
            Self::CatmullRom => image::imageops::FilterType::CatmullRom,
            Self::Lanczos3 => image::imageops::FilterType::Lanczos3,
        }
    }
}

impl EncodeOptions {
    /// Create new options with the specified format and no mipmaps
    pub fn new(format: Format) -> Self {
        Self {
            format,
            generate_mipmaps: false,
            mipmap_filter: MipmapFilter::default(),
        }
    }

    /// Enable mipmap generation with default filter. Uses Triangle by default.
    pub fn with_mipmaps(mut self) -> Self {
        self.generate_mipmaps = true;
        self
    }

    /// Set the mipmap filter type
    pub fn with_mipmap_filter(mut self, filter: MipmapFilter) -> Self {
        self.mipmap_filter = filter;
        self
    }
}

impl Default for EncodeOptions {
    fn default() -> Self {
        Self::new(Format::Bc3)
    }
}

/// Encode an RGBA8 image into the specified format
///
/// # Example
/// ```no_run
/// use ltk_texture::tex::{encode_rgba, Format};
///
/// let width = 256;
/// let height = 256;
/// let rgba_data: Vec<u8> = vec![0; (width * height * 4) as usize];
///
/// // Encode to BC3 format
/// let compressed = encode_rgba(width, height, &rgba_data, Format::Bc3).unwrap();
/// ```
pub fn encode_rgba(
    width: u32,
    height: u32,
    rgba_data: &[u8],
    format: Format,
) -> Result<Vec<u8>, EncodeError> {
    match format {
        Format::Bc1 => encode_bc1(width, height, rgba_data),
        Format::Bc3 => encode_bc3(width, height, rgba_data),
        Format::Bgra8 => encode_bgra8(rgba_data),
        _ => Err(EncodeError::UnsupportedFormat(format)),
    }
}

/// Encode an RGBA8 image with mipmaps into the specified format
///
/// Mipmaps are stored from smallest to largest (1x1, 2x2, 4x4, ... up to full size).
///
/// # Example
/// ```no_run
/// use ltk_texture::tex::{encode_rgba_with_mipmaps, Format, MipmapFilter};
/// use image::RgbaImage;
///
/// let img = RgbaImage::new(256, 256);
/// let (data, mip_count) = encode_rgba_with_mipmaps(&img, Format::Bc3, MipmapFilter::Triangle).unwrap();
/// ```
pub fn encode_rgba_with_mipmaps(
    img: &image::RgbaImage,
    format: Format,
    filter: MipmapFilter,
) -> Result<(Vec<u8>, u32), EncodeError> {
    let (width, height) = img.dimensions();

    // Calculate mipmap count
    let mip_count = ((height.max(width) as f32).log2().floor() + 1.0) as u32;

    // Generate all mip levels (from full size down to 1x1)
    let mut mip_levels = Vec::new();
    let mut current_img = img.clone();

    for level in 0..mip_count {
        let mip_width = (width >> level).max(1);
        let mip_height = (height >> level).max(1);

        // Resize if not the base level
        if level > 0 {
            current_img = image::imageops::resize(
                &current_img,
                mip_width,
                mip_height,
                filter.to_image_filter(),
            );
        }

        mip_levels.push(current_img.clone());
    }

    // Encode mipmaps from smallest to largest (reverse order)
    // League .tex format stores: mip[n-1] (1x1), mip[n-2] (2x2), ..., mip[0] (full size)
    let mut encoded_data = Vec::new();

    for img in mip_levels.iter().rev() {
        let (w, h) = img.dimensions();
        let rgba_data = img.as_raw();
        let encoded = encode_rgba(w, h, rgba_data, format)?;
        encoded_data.extend_from_slice(&encoded);
    }

    Ok((encoded_data, mip_count))
}

/// Encode RGBA8 data to BC1 format
#[cfg(feature = "intel-tex")]
fn encode_bc1(width: u32, height: u32, rgba_data: &[u8]) -> Result<Vec<u8>, EncodeError> {
    let expected_len = width as usize * height as usize * 4;
    if rgba_data.len() != expected_len {
        return Err(EncodeError::InvalidPixelData);
    }

    // Pre-dither toward RGB565 to reduce visible block artifacts in BC1.
    let mut rgba = rgba_data.to_vec();
    floyd_steinberg_dither_rgb565_in_place(width, height, &mut rgba);

    let surface = RgbaSurface {
        data: &rgba,
        width,
        height,
        stride: 4 * width,
    };
    Ok(bc1::compress_blocks(&surface))
}

#[cfg(not(feature = "intel-tex"))]
fn encode_bc1(_width: u32, _height: u32, _rgba_data: &[u8]) -> Result<Vec<u8>, EncodeError> {
    Err(EncodeError::UnsupportedFormat(Format::Bc1))
}

/// Encode RGBA8 data to BC3 format
#[cfg(feature = "intel-tex")]
fn encode_bc3(width: u32, height: u32, rgba_data: &[u8]) -> Result<Vec<u8>, EncodeError> {
    let expected_len = width as usize * height as usize * 4;
    if rgba_data.len() != expected_len {
        return Err(EncodeError::InvalidPixelData);
    }

    // Pre-dither toward RGB565 to reduce visible block artifacts in BC3 (color endpoints).
    let mut rgba = rgba_data.to_vec();
    floyd_steinberg_dither_rgb565_in_place(width, height, &mut rgba);

    let surface = RgbaSurface {
        data: &rgba,
        width,
        height,
        stride: 4 * width,
    };
    Ok(bc3::compress_blocks(&surface))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn allowed_levels(bits: u8) -> std::collections::HashSet<u8> {
        let levels = (1u32 << bits) - 1;
        (0..=levels)
            .map(|n| {
                ((n as f32 / levels as f32) * 255.0)
                    .round()
                    .clamp(0.0, 255.0) as u8
            })
            .collect()
    }

    #[test]
    fn dither_preserves_alpha_and_quantizes_rgb_to_565_levels() {
        let (w, h) = (8u32, 4u32);
        let mut rgba = vec![0u8; (w * h * 4) as usize];

        // Fill with a gradient-ish pattern and varying alpha
        for y in 0..h as usize {
            for x in 0..w as usize {
                let idx = (y * w as usize + x) * 4;
                rgba[idx] = (x as u8).wrapping_mul(31);
                rgba[idx + 1] = (y as u8).wrapping_mul(47);
                rgba[idx + 2] = ((x + y) as u8).wrapping_mul(19);
                rgba[idx + 3] = (255u8).wrapping_sub((x as u8).wrapping_mul(17));
            }
        }

        let alpha_before: Vec<u8> = rgba.chunks_exact(4).map(|p| p[3]).collect();
        floyd_steinberg_dither_rgb565_in_place(w, h, &mut rgba);
        let alpha_after: Vec<u8> = rgba.chunks_exact(4).map(|p| p[3]).collect();
        assert_eq!(alpha_before, alpha_after);

        let allowed_r = allowed_levels(5);
        let allowed_g = allowed_levels(6);
        let allowed_b = allowed_levels(5);

        for px in rgba.chunks_exact(4) {
            assert!(allowed_r.contains(&px[0]));
            assert!(allowed_g.contains(&px[1]));
            assert!(allowed_b.contains(&px[2]));
        }
    }
}

#[cfg(not(feature = "intel-tex"))]
fn encode_bc3(_width: u32, _height: u32, _rgba_data: &[u8]) -> Result<Vec<u8>, EncodeError> {
    Err(EncodeError::UnsupportedFormat(Format::Bc3))
}

/// Convert RGBA8 to BGRA8 (uncompressed)
fn encode_bgra8(rgba_data: &[u8]) -> Result<Vec<u8>, EncodeError> {
    let mut bgra = Vec::with_capacity(rgba_data.len());

    for pixel in rgba_data.chunks_exact(4) {
        let [r, g, b, a] = pixel else {
            return Err(EncodeError::InvalidPixelData);
        };
        bgra.extend_from_slice(&[*b, *g, *r, *a]);
    }

    Ok(bgra)
}

#[derive(Debug, thiserror::Error)]
pub enum EncodeError {
    #[error("Unsupported format for encoding: {0:?}")]
    UnsupportedFormat(Format),
    #[error("Invalid pixel data")]
    InvalidPixelData,
}
