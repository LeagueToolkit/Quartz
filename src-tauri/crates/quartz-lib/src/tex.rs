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
        Ok(DecodedTexture { width, height, format: "png:rgba".into(), rgba: img.into_raw() })
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
        let texture = Texture::from_bytes(bytes).map_err(|e| format!("Failed to parse TEX: {e:?}"))?;
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
