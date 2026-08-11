/* Texture decode/encode for the Image Recolor panel. Wraps ritoshark's rs_tex so the
frontend can pull RGBA pixels out of a League .tex / .dds for the canvas and write the
recolored result back in the file's original container and block format.

The `format` string round-trips through the frontend: decode hands it back, save passes
it in unchanged so the re-encode preserves the original on-disk format. Shape is
"<container>:<fmt>", e.g. "tex:bc3", "dds:bgra8". */

use image::RgbaImage;
use ritoshark::prelude::*;
use ritoshark::tex::{TexFormat, Texture};

const DDS_MAGIC: &[u8; 4] = b"DDS ";

pub struct DecodedTexture {
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub rgba: Vec<u8>,
}

fn tex_format_tag(format: TexFormat) -> &'static str {
    match format {
        TexFormat::Bc1 | TexFormat::Bc1Alt => "bc1",
        TexFormat::Bc3 => "bc3",
        TexFormat::Bc5 => "bc5",
        TexFormat::Bc7 => "bc7",
        TexFormat::Bgra8 => "bgra8",
        TexFormat::Rgba16Snorm => "rgba16snorm",
        TexFormat::Etc1 => "etc1",
        TexFormat::Etc2 => "etc2",
        TexFormat::Etc2Eac => "etc2eac",
    }
}

const PNG_MAGIC: &[u8; 4] = b"\x89PNG";

/* Decode any supported texture input to RGBA8. PNG/JPEG go through the image
crate; .tex/.dds go through `decode_texture`. The engine decoders only know
TEX/DDS magic, so standard images must be handled separately (used by the
right-click "convert to .tex/.dds" verbs that take a PNG/JPG source). */
pub fn decode_any(bytes: &[u8]) -> Result<DecodedTexture, String> {
    if bytes.len() < 4 {
        return Err("File too small to be an image".into());
    }
    let is_standard = &bytes[0..4] == PNG_MAGIC || (bytes[0] == 0xFF && bytes[1] == 0xD8); // PNG or JPEG SOI
    if is_standard {
        let img = image::load_from_memory(bytes)
            .map_err(|e| format!("Failed to read image: {e}"))?
            .to_rgba8();
        let (width, height) = (img.width(), img.height());
        Ok(DecodedTexture {
            width,
            height,
            format: "png:rgba".into(),
            rgba: img.into_raw(),
        })
    } else {
        decode_texture(bytes)
    }
}

/* Decode a .tex or .dds buffer into RGBA8 plus a tag describing its container and format.
The container is taken from the magic bytes; DDS surfaces with no .tex equivalent (e.g.
BC7) are decoded straight from the DDS reader and reported as "dds:rgba". */
pub fn decode_texture(bytes: &[u8]) -> Result<DecodedTexture, String> {
    if bytes.len() < 4 {
        return Err("File too small to be a texture".into());
    }

    if &bytes[0..4] == DDS_MAGIC {
        // Prefer the Texture path so we recover the original block format for round-trip.
        match Texture::from_dds_bytes(bytes) {
            Ok(texture) => {
                let img = texture
                    .decode_rgba()
                    .map_err(|e| format!("Failed to decode DDS: {e:?}"))?;
                Ok(DecodedTexture {
                    width: img.width(),
                    height: img.height(),
                    format: format!("dds:{}", tex_format_tag(texture.format)),
                    rgba: img.into_raw(),
                })
            }
            // Formats Texture rejects (BC7 etc.) still decode via the raw DDS reader.
            Err(_) => {
                let img = ritoshark::tex::read_dds_bytes(bytes)
                    .map_err(|e| format!("Failed to decode DDS: {e:?}"))?;
                Ok(DecodedTexture {
                    width: img.width(),
                    height: img.height(),
                    format: "dds:rgba".into(),
                    rgba: img.into_raw(),
                })
            }
        }
    } else {
        let texture =
            Texture::from_bytes(bytes).map_err(|e| format!("Failed to parse TEX: {e:?}"))?;
        let img = texture
            .decode_rgba()
            .map_err(|e| format!("Failed to decode TEX: {e:?}"))?;
        Ok(DecodedTexture {
            width: img.width(),
            height: img.height(),
            format: format!("tex:{}", tex_format_tag(texture.format)),
            rgba: img.into_raw(),
        })
    }
}

/* Decide whether a decoded RGBA buffer carries real color, using the same rule the
frontend's isGrayscaleImage applies: sample every 8th pixel, ignore near-transparent
texels, and call the image colored when more than 5% of the sampled texels have a
channel spread above 10.

This lives here so the Filter Grayscale sweep can answer the question next to the
pixels. Shipping a multi-MB RGBA buffer to the frontend just to compute one boolean
costs a base64 encode, an IPC hop and a per-character JS decode per file. */
fn rgba_is_colored(rgba: &[u8]) -> bool {
    let mut colorful = 0u32;
    let mut sampled = 0u32;
    // 32 bytes = every 8th RGBA pixel.
    for px in rgba.chunks_exact(4).step_by(8) {
        if px[3] < 128 {
            continue;
        }
        sampled += 1;
        let (r, g, b) = (px[0] as i32, px[1] as i32, px[2] as i32);
        let max_diff = (r - g).abs().max((g - b).abs()).max((r - b).abs());
        if max_diff > 10 {
            colorful += 1;
        }
    }
    if sampled == 0 {
        return false;
    }
    f64::from(colorful) / f64::from(sampled) >= 0.05
}

/* Decode `path` far enough to decide whether it holds color. Returns None when the file
cannot be decoded, so a broken texture is skipped rather than failing the whole sweep. */
pub fn texture_is_colored(path: &std::path::Path) -> Option<bool> {
    let bytes = std::fs::read(path).ok()?;
    let decoded = decode_any(&bytes).ok()?;
    Some(rgba_is_colored(&decoded.rgba))
}

/* Decode any supported image and re-encode it as a PNG bounded by `max_dimension` on its
long edge. Downscaling before the encode is the point: a 1024x1024 texture leaves here as a
small PNG instead of a 4 MB RGBA buffer. Aspect ratio is preserved, and images already
within the bound are encoded at their native size. */
pub fn decode_to_png_sized(bytes: &[u8], max_dimension: u32) -> Result<Vec<u8>, String> {
    let decoded = decode_any(bytes)?;
    let img = RgbaImage::from_raw(decoded.width, decoded.height, decoded.rgba)
        .ok_or_else(|| "Failed to build RGBA image from pixels".to_string())?;

    let img = if max_dimension > 0 && (img.width() > max_dimension || img.height() > max_dimension)
    {
        /* `thumbnail` resizes to exactly the dimensions given, so the target has to be
        scaled by hand or a non-square texture comes back squashed into a square. */
        let scale = f64::from(max_dimension) / f64::from(img.width().max(img.height()));
        let w = ((f64::from(img.width()) * scale).round() as u32).max(1);
        let h = ((f64::from(img.height()) * scale).round() as u32).max(1);
        image::imageops::thumbnail(&img, w, h)
    } else {
        img
    };

    encode_standard(&img, image::ImageFormat::Png)
}

/* The recolor sliders, mirroring the frontend's RecolorParams.

`curve` is the Value-channel tone curve as a 256-entry lookup table: index is the input
level, value is the output level. None means identity (no curve applied). Passing the
baked table rather than the control points keeps the spline math in one place, on the
frontend that draws it, and makes applying it here a single array index per channel. */
#[derive(Clone, Debug)]
pub struct RecolorParams {
    pub target_hue: f64,
    pub saturation_boost: f64,
    pub lightness_adjust: f64,
    pub opacity: f64,
    pub preserve_original_colors: bool,
    pub curve: Option<Vec<u8>>,
}

/* RGB (0-255) to HSL (h 0-360, s/l 0-100). A direct port of the frontend's rgbToHsl;
the two must agree or a batch save would not match the on-screen preview. */
fn rgb_to_hsl(r: u8, g: u8, b: u8) -> (f64, f64, f64) {
    let (r, g, b) = (
        f64::from(r) / 255.0,
        f64::from(g) / 255.0,
        f64::from(b) / 255.0,
    );
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let l = (max + min) / 2.0;

    if (max - min).abs() < f64::EPSILON {
        return (0.0, 0.0, l * 100.0);
    }

    let d = max - min;
    let s = if l > 0.5 {
        d / (2.0 - max - min)
    } else {
        d / (max + min)
    };
    // Matches the JS switch on which channel is the max.
    let h = if max == r {
        ((g - b) / d + if g < b { 6.0 } else { 0.0 }) / 6.0
    } else if max == g {
        ((b - r) / d + 2.0) / 6.0
    } else {
        ((r - g) / d + 4.0) / 6.0
    };
    (h * 360.0, s * 100.0, l * 100.0)
}

fn hue_to_rgb(p: f64, q: f64, mut t: f64) -> f64 {
    if t < 0.0 {
        t += 1.0;
    }
    if t > 1.0 {
        t -= 1.0;
    }
    if t < 1.0 / 6.0 {
        return p + (q - p) * 6.0 * t;
    }
    if t < 1.0 / 2.0 {
        return q;
    }
    if t < 2.0 / 3.0 {
        return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
    }
    p
}

/* HSL (h 0-360, s/l 0-100) to RGB (0-255), the port of the frontend's hslToRgb. */
fn hsl_to_rgb(h: f64, s: f64, l: f64) -> (f64, f64, f64) {
    let (h, s, l) = (h / 360.0, s / 100.0, l / 100.0);
    if s == 0.0 {
        let v = l * 255.0;
        return (v, v, v);
    }
    let q = if l < 0.5 { l * (1.0 + s) } else { l + s - l * s };
    let p = 2.0 * l - q;
    (
        hue_to_rgb(p, q, h + 1.0 / 3.0) * 255.0,
        hue_to_rgb(p, q, h) * 255.0,
        hue_to_rgb(p, q, h - 1.0 / 3.0) * 255.0,
    )
}

/* Apply the recolor to an RGBA buffer in place. Port of applyAdjustmentInPlace, including
its `ceil` rounding and its skip of fully transparent texels, so a batch save produces the
same bytes the preview showed. */
pub fn apply_adjustment(rgba: &mut [u8], params: &RecolorParams) {
    let lightness_adjustment = params.lightness_adjust / 100.0;
    let saturation_multiplier = params.saturation_boost / 100.0;
    let opacity_multiplier = params.opacity / 100.0;
    // Only honour a well-formed table; a short one would panic on index.
    let curve = params.curve.as_deref().filter(|c| c.len() == 256);

    for px in rgba.chunks_exact_mut(4) {
        if px[3] == 0 {
            continue;
        }
        /* The tone curve runs first, on the raw RGB, so the HSL stage below sees the
        curved values. This matches GIMP, where Curves is a separate earlier operation
        rather than something folded into a hue/saturation pass. */
        if let Some(lut) = curve {
            px[0] = lut[px[0] as usize];
            px[1] = lut[px[1] as usize];
            px[2] = lut[px[2] as usize];
        }
        let (h, s, l) = rgb_to_hsl(px[0], px[1], px[2]);

        let (new_hue, new_sat, new_light) = if params.preserve_original_colors {
            // Hue SHIFT mode: 180 = no change, the slider rotates the wheel.
            let hue_shift = params.target_hue - 180.0;
            (
                ((h + hue_shift) % 360.0 + 360.0) % 360.0,
                ((s / 100.0) * (saturation_multiplier * 2.0)).clamp(0.0, 1.0),
                (l / 100.0 + lightness_adjustment).clamp(0.0, 1.0),
            )
        } else {
            (
                params.target_hue,
                saturation_multiplier.clamp(0.0, 1.0),
                (l / 100.0 + lightness_adjustment).clamp(0.0, 1.0),
            )
        };

        let (r, g, b) = hsl_to_rgb(new_hue, new_sat * 100.0, new_light * 100.0);
        px[0] = r.clamp(0.0, 255.0).ceil() as u8;
        px[1] = g.clamp(0.0, 255.0).ceil() as u8;
        px[2] = b.clamp(0.0, 255.0).ceil() as u8;
        px[3] = (f64::from(px[3]) * opacity_multiplier).clamp(0.0, 255.0).ceil() as u8;
    }
}

/* Decode `path`, apply the recolor, and write it back in its original container/format. */
pub fn recolor_file_in_place(path: &str, params: &RecolorParams) -> Result<(), String> {
    let bytes = std::fs::read(path).map_err(|e| format!("Failed to read {path}: {e}"))?;
    let mut decoded = decode_texture(&bytes)?;
    apply_adjustment(&mut decoded.rgba, params);
    let out = encode_texture(decoded.rgba, decoded.width, decoded.height, &decoded.format)?;
    std::fs::write(path, out).map_err(|e| format!("Failed to write {path}: {e}"))
}

/* Recolor every path in parallel, returning each failure as (path, error). The whole
decode → adjust → re-encode round trip stays in Rust: the frontend previously pulled every
texture over IPC as base64, looped the pixels in JS, and pushed the result back the same
way, one file at a time. */
pub fn recolor_files(paths: &[String], params: &RecolorParams) -> Vec<(String, String)> {
    use rayon::prelude::*;
    paths
        .par_iter()
        .filter_map(|path| {
            recolor_file_in_place(path, params)
                .err()
                .map(|e| (path.clone(), e))
        })
        .collect()
}

/* Keep the paths whose textures carry color, examining the files in parallel. Undecodable
files are dropped rather than reported, matching the frontend's old skip-on-error behavior. */
pub fn filter_colored_textures(paths: Vec<String>) -> Vec<String> {
    use rayon::prelude::*;
    paths
        .into_par_iter()
        .filter(|path| texture_is_colored(std::path::Path::new(path)).unwrap_or(false))
        .collect()
}

/* Encode an RGBA image to a standard container (PNG/JPEG) in memory. */
fn encode_standard(img: &RgbaImage, format: image::ImageFormat) -> Result<Vec<u8>, String> {
    use std::io::Cursor;
    let mut out = Cursor::new(Vec::new());
    image::DynamicImage::ImageRgba8(img.clone())
        .write_to(&mut out, format)
        .map_err(|e| format!("Failed to encode image: {e}"))?;
    Ok(out.into_inner())
}

fn tag_to_tex_format(tag: &str) -> Option<TexFormat> {
    Some(match tag {
        "bc1" => TexFormat::Bc1,
        "bc3" => TexFormat::Bc3,
        "bc5" => TexFormat::Bc5,
        "bc7" => TexFormat::Bc7,
        "bgra8" => TexFormat::Bgra8,
        _ => return None,
    })
}

/* Encode RGBA8 pixels back into the container/format named by `format` (as produced by
decode_texture). TEX uncompressed (bgra8) is written directly; BC1/BC3/BC5/BC7 are block
compressed. DDS mirrors this with rs_tex's DDS writers. Formats rs_tex can't re-encode
(ETC, RGBA16_SNORM) fall back to BC3, the safe DXT5 equivalent the Electron build used. */
pub fn encode_texture(
    rgba: Vec<u8>,
    width: u32,
    height: u32,
    format: &str,
) -> Result<Vec<u8>, String> {
    let expected = width as usize * height as usize * 4;
    if rgba.len() != expected {
        return Err(format!(
            "RGBA buffer is {} bytes but {width}x{height} needs {expected}",
            rgba.len()
        ));
    }

    let img = RgbaImage::from_raw(width, height, rgba)
        .ok_or_else(|| "Failed to build RGBA image from pixels".to_string())?;

    let (container, tag) = format.split_once(':').unwrap_or(("tex", "bc3"));

    match container {
        "png" => encode_standard(&img, image::ImageFormat::Png),
        "jpg" | "jpeg" => encode_standard(&img, image::ImageFormat::Jpeg),
        "dds" => {
            let bytes = match tag_to_tex_format(tag) {
                Some(TexFormat::Bgra8) | None => ritoshark::tex::write_dds_bytes(&img)
                    .map_err(|e| format!("Failed to write DDS: {e:?}"))?,
                Some(bc) => ritoshark::tex::write_dds_bytes_bc(&img, bc)
                    .map_err(|e| format!("Failed to write DDS: {e:?}"))?,
            };
            Ok(bytes)
        }
        _ => {
            // tex container (default)
            let texture = match tag {
                "bgra8" => Texture::from_rgba_bgra8(&img),
                "bc1" => Texture::encode_bc1(&img, false)
                    .map_err(|e| format!("Failed to encode TEX: {e:?}"))?,
                "bc7" => Texture::encode_bc7(&img, false)
                    .map_err(|e| format!("Failed to encode TEX: {e:?}"))?,
                "bc5" => Texture::encode(&img, TexFormat::Bc5, false)
                    .map_err(|e| format!("Failed to encode TEX: {e:?}"))?,
                // bc3 / dxt5 default, also covers ETC and other formats we can't re-encode.
                _ => Texture::encode_bc3(&img, false)
                    .map_err(|e| format!("Failed to encode TEX: {e:?}"))?,
            };
            texture
                .to_bytes()
                .map_err(|e| format!("Failed to serialize TEX: {e:?}"))
        }
    }
}
