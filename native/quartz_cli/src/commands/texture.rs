use std::fs;
use std::io::{BufReader, Write};
use std::path::{Path, PathBuf};

use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use ltk_texture::tex::{EncodeOptions, Format, MipmapFilter};
use ltk_texture::Tex;

const DDS_MAGIC: u32 = u32::from_le_bytes(*b"DDS ");
const TEX_MAGIC: u32 = u32::from_le_bytes(*b"TEX\0");
const FOURCC_DXT1: u32 = u32::from_le_bytes(*b"DXT1");
const FOURCC_DXT3: u32 = u32::from_le_bytes(*b"DXT3");
const FOURCC_DXT5: u32 = u32::from_le_bytes(*b"DXT5");
const FOURCC_DX10: u32 = u32::from_le_bytes(*b"DX10");
const FOURCC_ATI2: u32 = u32::from_le_bytes(*b"ATI2"); // BC5 legacy
const FOURCC_BC5U: u32 = u32::from_le_bytes(*b"BC5U"); // BC5 legacy (alt)

// DXGI format codes used in the DDS DX10 extended header.
const DXGI_BC1_UNORM: u32 = 71;
const DXGI_BC2_UNORM: u32 = 74;
const DXGI_BC3_UNORM: u32 = 77;
const DXGI_BC5_UNORM: u32 = 83;
const DXGI_BC7_UNORM: u32 = 98;
const DXGI_BC7_UNORM_SRGB: u32 = 99;

const TEX_FMT_BC1: u8 = 10;
const TEX_FMT_BC2: u8 = 11;
const TEX_FMT_BC3: u8 = 12;
const TEX_FMT_BC7: u8 = 13;
const TEX_FMT_BC5: u8 = 14;
const TEX_FMT_BGRA8: u8 = 20;
const TEX_FLAG_HAS_MIPS: u8 = 1;

#[derive(Debug, Clone, Copy, PartialEq)]
enum FormatKind {
    Bc1,
    Bc2,
    Bc3,
    Bc5,
    Bc7,
    Bgra8,
}

impl FormatKind {
    fn block_size(self) -> usize {
        match self {
            Self::Bc1 => 8,
            Self::Bc2 => 16,
            Self::Bc3 => 16,
            Self::Bc5 => 16,
            Self::Bc7 => 16,
            Self::Bgra8 => 4,
        }
    }
    fn block_dim(self) -> usize {
        match self {
            Self::Bgra8 => 1,
            _ => 4,
        }
    }
    fn tex_format(self) -> u8 {
        match self {
            Self::Bc1 => TEX_FMT_BC1,
            Self::Bc2 => TEX_FMT_BC2,
            Self::Bc3 => TEX_FMT_BC3,
            Self::Bc5 => TEX_FMT_BC5,
            Self::Bc7 => TEX_FMT_BC7,
            Self::Bgra8 => TEX_FMT_BGRA8,
        }
    }
}

fn mip_count(width: u32, height: u32) -> u32 {
    ((width.max(height) as f32).log2().floor() as u32) + 1
}

fn level_size(width: u32, height: u32, level: u32, fmt: FormatKind) -> usize {
    let w = (width >> level).max(1) as usize;
    let h = (height >> level).max(1) as usize;
    let dim = fmt.block_dim();
    let bw = w.div_ceil(dim);
    let bh = h.div_ceil(dim);
    bw * bh * fmt.block_size()
}

fn default_out_path(src: &Path, _from_ext: &str, to_ext: &str) -> PathBuf {
    src.with_extension(to_ext)
}

/// Case-insensitive extension check.
fn matches_ext(p: &Path, ext: &str) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case(ext))
        .unwrap_or(false)
}

/// Round n to the nearest multiple of 4, with a minimum of 4.
/// Ties (n ≡ 2 mod 4) round up. Examples:
///   1 → 4, 2 → 4, 99 → 100, 1025 → 1024, 1027 → 1028, 6 → 8, 100 → 100.
#[inline]
fn round_to_4(n: u32) -> u32 {
    ((n + 2) & !3).max(4)
}

/// If the just-encoded TEX bytes have width or height not divisible by 4,
/// decode mip0 → resize (Lanczos3) → re-encode at the rounded-up dimensions
/// using the original TEX format and mipmap presence. Returns the input bytes
/// untouched if the texture is already 4-aligned.
///
/// LoL's block-compressed TEX formats (BC1/BC3) require both dimensions to be
/// multiples of 4 or the in-game renderer can't decode the bottom/right edges.
/// This normalizes the result before writing.
fn auto_resize_tex_to_4_aligned(src: &Path, tex_bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    // TEX header layout: [4 magic][2 width][2 height][1 ?][1 fmt][1 ?][1 flags]
    if tex_bytes.len() < 12 {
        return Ok(tex_bytes);
    }
    let width = u16::from_le_bytes([tex_bytes[4], tex_bytes[5]]) as u32;
    let height = u16::from_le_bytes([tex_bytes[6], tex_bytes[7]]) as u32;
    if width % 4 == 0 && height % 4 == 0 {
        return Ok(tex_bytes);
    }
    // BC2 is decode-only (no encoder), so we can't re-encode after a resize.
    // Such textures are virtually always already 4-aligned; leave as-is rather
    // than failing the whole conversion.
    if tex_bytes[9] == TEX_FMT_BC2 {
        return Ok(tex_bytes);
    }
    let new_w = round_to_4(width);
    let new_h = round_to_4(height);

    let tex = Tex::from_reader(&mut std::io::Cursor::new(&tex_bytes))
        .map_err(|e| format!("Auto-resize: failed to re-parse TEX from {}: {}", src.display(), e))?;
    let surface = tex
        .decode_mipmap(0)
        .map_err(|e| format!("Auto-resize: failed to decode TEX mip0 from {}: {}", src.display(), e))?;
    let rgba = surface
        .into_rgba_image()
        .map_err(|e| format!("Auto-resize: failed to RGBA-convert TEX from {}: {}", src.display(), e))?;

    let resized = image::imageops::resize(&rgba, new_w, new_h, image::imageops::FilterType::Lanczos3);
    let dynamic = image::DynamicImage::ImageRgba8(resized);

    let mut opts = EncodeOptions::new(tex.format);
    if tex.mip_count > 1 {
        opts = opts.with_mipmaps().with_mipmap_filter(MipmapFilter::Triangle);
    }
    let new_tex = Tex::encode_dynamic_image(dynamic, opts)
        .map_err(|e| format!("Auto-resize: failed to re-encode TEX from {}: {}", src.display(), e))?;

    let mut out = Vec::new();
    new_tex
        .write(&mut out)
        .map_err(|e| format!("Auto-resize: failed to serialize re-encoded TEX from {}: {}", src.display(), e))?;

    eprintln!(
        "Auto-resized {} from {}x{} to {}x{} (.tex requires dims divisible by 4)",
        src.display(), width, height, new_w, new_h
    );
    Ok(out)
}

pub fn tex2png(src: &Path) -> Result<(), String> {
    // Auto-route for mixed multi-select (see dds2tex for full rationale).
    if matches_ext(src, "png") {
        eprintln!("SKIP: {} is already .png", src.display());
        return Ok(());
    }
    if matches_ext(src, "dds") {
        return dds2png(src);
    }
    let file = fs::File::open(src).map_err(|e| format!("Failed to open {}: {}", src.display(), e))?;
    let mut reader = BufReader::new(file);
    let tex = Tex::from_reader(&mut reader)
        .map_err(|e| format!("Failed to parse TEX {}: {}", src.display(), e))?;
    let surface = tex
        .decode_mipmap(0)
        .map_err(|e| format!("Failed to decode TEX mip0 {}: {}", src.display(), e))?;
    let image = surface
        .into_rgba_image()
        .map_err(|e| format!("Failed to convert TEX to image {}: {}", src.display(), e))?;
    let out = default_out_path(src, "tex", "png");
    image
        .save(&out)
        .map_err(|e| format!("Failed to save PNG {}: {}", out.display(), e))?;
    eprintln!("OK: {} -> {}", src.display(), out.display());
    Ok(())
}

fn dds_to_tex_bytes(src: &Path) -> Result<Vec<u8>, String> {
    let bytes = fs::read(src).map_err(|e| format!("Failed to read {}: {}", src.display(), e))?;
    if bytes.len() < 128 {
        return Err(format!("DDS too small: {}", src.display()));
    }
    let mut r = std::io::Cursor::new(&bytes);
    let sig = r.read_u32::<LittleEndian>().map_err(|e| e.to_string())?;
    if sig != DDS_MAGIC {
        return Err(format!("Wrong DDS signature in {}", src.display()));
    }

    let mut u = [0u32; 31];
    for v in &mut u {
        *v = r.read_u32::<LittleEndian>().map_err(|e| e.to_string())?;
    }
    let height = u[2];
    let width = u[3];
    let dw_mips = u[6];
    let pf_flags = u[19];
    let fourcc = u[20];
    let bit_count = u[21];
    let rmask = u[22];
    let gmask = u[23];
    let bmask = u[24];
    let amask = u[25];

    // Data offset is 128 (standard header) unless a DX10 extended header (20
    // bytes) follows, which pushes it to 148.
    let mut data_offset = 128usize;

    let (fmt, mut needs_swizzle) = if fourcc == FOURCC_DXT1 {
        (FormatKind::Bc1, false)
    } else if fourcc == FOURCC_DXT3 {
        (FormatKind::Bc2, false)
    } else if fourcc == FOURCC_DXT5 {
        (FormatKind::Bc3, false)
    } else if fourcc == FOURCC_ATI2 || fourcc == FOURCC_BC5U {
        (FormatKind::Bc5, false)
    } else if fourcc == FOURCC_DX10 {
        // DX10 extended header: dxgiFormat is the first u32 at offset 128.
        if bytes.len() < 148 {
            return Err(format!("Truncated DX10 header in {}", src.display()));
        }
        data_offset = 148;
        let dxgi = u32::from_le_bytes([bytes[128], bytes[129], bytes[130], bytes[131]]);
        let f = match dxgi {
            DXGI_BC1_UNORM => FormatKind::Bc1,
            DXGI_BC2_UNORM => FormatKind::Bc2,
            DXGI_BC3_UNORM => FormatKind::Bc3,
            DXGI_BC5_UNORM => FormatKind::Bc5,
            DXGI_BC7_UNORM | DXGI_BC7_UNORM_SRGB => FormatKind::Bc7,
            _ => return Err(format!("Unsupported DX10 DXGI format {} in {}", dxgi, src.display())),
        };
        (f, false)
    } else if (pf_flags & 0x0000_0041) == 0x0000_0041 {
        if bit_count != 32 {
            return Err(format!("Unsupported BGRA bitcount {} in {}", bit_count, src.display()));
        }
        let standard = bmask == 0x0000_00ff
            && gmask == 0x0000_ff00
            && rmask == 0x00ff_0000
            && amask == 0xff00_0000;
        (FormatKind::Bgra8, !standard)
    } else {
        return Err(format!("Unsupported DDS pixel format in {}", src.display()));
    };

    let mut data = bytes[data_offset..].to_vec();
    if needs_swizzle {
        let index_for_mask = |mask: u32| -> Option<usize> {
            match mask {
                0x0000_00ff => Some(0),
                0x0000_ff00 => Some(1),
                0x00ff_0000 => Some(2),
                0xff00_0000 => Some(3),
                _ => None,
            }
        };
        let ri = index_for_mask(rmask).ok_or_else(|| format!("Unsupported R mask in {}", src.display()))?;
        let gi = index_for_mask(gmask).ok_or_else(|| format!("Unsupported G mask in {}", src.display()))?;
        let bi = index_for_mask(bmask).ok_or_else(|| format!("Unsupported B mask in {}", src.display()))?;
        let ai = index_for_mask(amask).ok_or_else(|| format!("Unsupported A mask in {}", src.display()))?;
        let mut out = vec![0u8; data.len()];
        for (i, px) in data.chunks_exact(4).enumerate() {
            let o = i * 4;
            out[o] = px[bi];
            out[o + 1] = px[gi];
            out[o + 2] = px[ri];
            out[o + 3] = px[ai];
        }
        data = out;
        needs_swizzle = false;
    }
    debug_assert!(!needs_swizzle);

    let has_mips = dw_mips > 1;
    if has_mips {
        let expected = mip_count(width, height);
        if dw_mips != expected {
            return Err(format!(
                "Wrong DDS mipmap count {} (expected {}) in {}",
                dw_mips,
                expected,
                src.display()
            ));
        }
    }

    let tex_data = if has_mips {
        let mut off = 0usize;
        let mut blocks = Vec::with_capacity(dw_mips as usize);
        for level in 0..dw_mips {
            let sz = level_size(width, height, level, fmt);
            if off + sz > data.len() {
                return Err(format!("DDS mip data truncated in {}", src.display()));
            }
            blocks.push(data[off..off + sz].to_vec());
            off += sz;
        }
        blocks.reverse();
        blocks.concat()
    } else {
        data
    };

    let mut out = Vec::with_capacity(12 + tex_data.len());
    out.write_u32::<LittleEndian>(TEX_MAGIC).map_err(|e| e.to_string())?;
    out.write_u16::<LittleEndian>(width as u16).map_err(|e| e.to_string())?;
    out.write_u16::<LittleEndian>(height as u16).map_err(|e| e.to_string())?;
    out.write_u8(0).map_err(|e| e.to_string())?;
    out.write_u8(fmt.tex_format()).map_err(|e| e.to_string())?;
    out.write_u8(0).map_err(|e| e.to_string())?;
    out.write_u8(if has_mips { TEX_FLAG_HAS_MIPS } else { 0 })
        .map_err(|e| e.to_string())?;
    out.extend_from_slice(&tex_data);
    Ok(out)
}

/// League's in-game TEX renderer doesn't support BC2 (format 11) — a BC2 .tex
/// is structurally valid (and Quartz decodes it fine) but renders empty in
/// game. So when a BC2 source is written to .tex, transcode it to BC3 (DXT5):
/// game-supported, identical BC1-style color, equal-or-better alpha. No-op for
/// any other format.
fn transcode_bc2_tex_to_bc3(src: &Path, tex_bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    if tex_bytes.len() < 12 || tex_bytes[9] != TEX_FMT_BC2 {
        return Ok(tex_bytes);
    }
    let tex = Tex::from_reader(&mut std::io::Cursor::new(&tex_bytes))
        .map_err(|e| format!("BC2->BC3: failed to parse TEX from {}: {}", src.display(), e))?;
    let had_mips = tex.mip_count > 1;
    let surface = tex
        .decode_mipmap(0)
        .map_err(|e| format!("BC2->BC3: failed to decode BC2 mip0 from {}: {}", src.display(), e))?;
    let rgba = surface
        .into_rgba_image()
        .map_err(|e| format!("BC2->BC3: failed to RGBA-convert from {}: {}", src.display(), e))?;
    let mut opts = EncodeOptions::new(Format::Bc3);
    if had_mips {
        opts = opts.with_mipmaps().with_mipmap_filter(MipmapFilter::Triangle);
    }
    let new_tex = Tex::encode_dynamic_image(image::DynamicImage::ImageRgba8(rgba), opts)
        .map_err(|e| format!("BC2->BC3: failed to re-encode as BC3 from {}: {}", src.display(), e))?;
    let mut out = Vec::new();
    new_tex
        .write(&mut out)
        .map_err(|e| format!("BC2->BC3: failed to serialize from {}: {}", src.display(), e))?;
    eprintln!("Transcoded BC2 -> BC3 for {} (.tex format doesn't support BC2)", src.display());
    Ok(out)
}

pub fn dds2tex(src: &Path) -> Result<(), String> {
    // Auto-route: when multi-selecting mixed .png + .dds files in Explorer and
    // picking "Convert to .tex", Windows runs the menu's command for every
    // selected file regardless of its actual extension. Detect and re-dispatch
    // so either entry point handles either source format.
    if matches_ext(src, "tex") {
        eprintln!("SKIP: {} is already .tex", src.display());
        return Ok(());
    }
    if matches_ext(src, "png") {
        return png2tex(src);
    }
    let tex_bytes = dds_to_tex_bytes(src)?;
    let tex_bytes = transcode_bc2_tex_to_bc3(src, tex_bytes)?;
    let tex_bytes = auto_resize_tex_to_4_aligned(src, tex_bytes)?;
    let dst = default_out_path(src, "dds", "tex");
    fs::write(&dst, tex_bytes).map_err(|e| format!("Failed to write {}: {}", dst.display(), e))?;
    eprintln!("OK: {} -> {}", src.display(), dst.display());
    Ok(())
}

pub fn dds2png(src: &Path) -> Result<(), String> {
    if matches_ext(src, "png") {
        eprintln!("SKIP: {} is already .png", src.display());
        return Ok(());
    }
    if matches_ext(src, "tex") {
        return tex2png(src);
    }
    let tex_bytes = dds_to_tex_bytes(src)?;
    let mut reader = BufReader::new(std::io::Cursor::new(tex_bytes));
    let tex = Tex::from_reader(&mut reader)
        .map_err(|e| format!("Failed to parse generated TEX from {}: {}", src.display(), e))?;
    let surface = tex
        .decode_mipmap(0)
        .map_err(|e| format!("Failed to decode DDS mip0 {}: {}", src.display(), e))?;
    let image = surface
        .into_rgba_image()
        .map_err(|e| format!("Failed to convert DDS to image {}: {}", src.display(), e))?;
    let out = default_out_path(src, "dds", "png");
    image
        .save(&out)
        .map_err(|e| format!("Failed to save PNG {}: {}", out.display(), e))?;
    eprintln!("OK: {} -> {}", src.display(), out.display());
    Ok(())
}

fn tex_to_dds_bytes(src: &Path, bytes: &[u8]) -> Result<Vec<u8>, String> {
    if bytes.len() < 12 {
        return Err(format!("TEX too small: {}", src.display()));
    }
    let mut r = std::io::Cursor::new(bytes);
    let magic = r.read_u32::<LittleEndian>().map_err(|e| e.to_string())?;
    if magic != TEX_MAGIC {
        return Err(format!("Wrong TEX signature in {}", src.display()));
    }
    let width = r.read_u16::<LittleEndian>().map_err(|e| e.to_string())? as u32;
    let height = r.read_u16::<LittleEndian>().map_err(|e| e.to_string())? as u32;
    let _ext = r.read_u8().map_err(|e| e.to_string())?;
    let tex_format = r.read_u8().map_err(|e| e.to_string())?;
    let _resource_type = r.read_u8().map_err(|e| e.to_string())?;
    let flags = r.read_u8().map_err(|e| e.to_string())?;
    let data = bytes[12..].to_vec();

    let (fmt, pf_flags, fourcc, rgb_bits, rmask, gmask, bmask, amask) = match tex_format {
        TEX_FMT_BC1 => (FormatKind::Bc1, 0x0000_0004u32, FOURCC_DXT1, 0, 0, 0, 0, 0),
        TEX_FMT_BC2 => (FormatKind::Bc2, 0x0000_0004u32, FOURCC_DXT3, 0, 0, 0, 0, 0),
        TEX_FMT_BC3 => (FormatKind::Bc3, 0x0000_0004u32, FOURCC_DXT5, 0, 0, 0, 0, 0),
        TEX_FMT_BC5 => (FormatKind::Bc5, 0x0000_0004u32, FOURCC_ATI2, 0, 0, 0, 0, 0),
        // BC7 has no legacy FourCC — it requires the DX10 extended header.
        TEX_FMT_BC7 => (FormatKind::Bc7, 0x0000_0004u32, FOURCC_DX10, 0, 0, 0, 0, 0),
        TEX_FMT_BGRA8 => (
            FormatKind::Bgra8,
            0x0000_0041u32,
            0u32,
            32u32,
            0x00ff_0000,
            0x0000_ff00,
            0x0000_00ff,
            0xff00_0000,
        ),
        _ => return Err(format!("Unsupported TEX format {} in {}", tex_format, src.display())),
    };

    let has_mips = (flags & TEX_FLAG_HAS_MIPS) != 0;
    let mip_cnt = if has_mips { mip_count(width, height) } else { 1 };

    let blocks_small_to_large = if has_mips {
        let mut off = 0usize;
        let mut blocks = Vec::with_capacity(mip_cnt as usize);
        for level in (0..mip_cnt).rev() {
            let sz = level_size(width, height, level, fmt);
            if off + sz > data.len() {
                return Err(format!("TEX mip data truncated in {}", src.display()));
            }
            blocks.push(data[off..off + sz].to_vec());
            off += sz;
        }
        blocks
    } else {
        vec![data]
    };

    let mut out = Vec::new();
    out.write_u32::<LittleEndian>(DDS_MAGIC).map_err(|e| e.to_string())?;
    out.write_u32::<LittleEndian>(124).map_err(|e| e.to_string())?;
    let mut dw_flags = 0x0000_1007u32;
    if has_mips {
        dw_flags |= 0x0002_0000;
    }
    out.write_u32::<LittleEndian>(dw_flags).map_err(|e| e.to_string())?;
    out.write_u32::<LittleEndian>(height).map_err(|e| e.to_string())?;
    out.write_u32::<LittleEndian>(width).map_err(|e| e.to_string())?;
    out.write_u32::<LittleEndian>(0).map_err(|e| e.to_string())?;
    out.write_u32::<LittleEndian>(0).map_err(|e| e.to_string())?;
    out.write_u32::<LittleEndian>(if has_mips { mip_cnt } else { 0 })
        .map_err(|e| e.to_string())?;
    for _ in 0..11 {
        out.write_u32::<LittleEndian>(0).map_err(|e| e.to_string())?;
    }

    out.write_u32::<LittleEndian>(32).map_err(|e| e.to_string())?;
    out.write_u32::<LittleEndian>(pf_flags).map_err(|e| e.to_string())?;
    out.write_u32::<LittleEndian>(fourcc).map_err(|e| e.to_string())?;
    out.write_u32::<LittleEndian>(rgb_bits).map_err(|e| e.to_string())?;
    out.write_u32::<LittleEndian>(rmask).map_err(|e| e.to_string())?;
    out.write_u32::<LittleEndian>(gmask).map_err(|e| e.to_string())?;
    out.write_u32::<LittleEndian>(bmask).map_err(|e| e.to_string())?;
    out.write_u32::<LittleEndian>(amask).map_err(|e| e.to_string())?;

    let mut caps = 0x0000_1000u32;
    if has_mips {
        caps |= 0x0040_0008;
    }
    out.write_u32::<LittleEndian>(caps).map_err(|e| e.to_string())?;
    out.write_u32::<LittleEndian>(0).map_err(|e| e.to_string())?;
    out.write_u32::<LittleEndian>(0).map_err(|e| e.to_string())?;
    out.write_u32::<LittleEndian>(0).map_err(|e| e.to_string())?;
    out.write_u32::<LittleEndian>(0).map_err(|e| e.to_string())?;

    // DX10 extended header (20 bytes) for BC7 — required since BC7 has no
    // legacy FourCC. resourceDimension=3 (TEXTURE2D), arraySize=1.
    if tex_format == TEX_FMT_BC7 {
        out.write_u32::<LittleEndian>(DXGI_BC7_UNORM).map_err(|e| e.to_string())?;
        out.write_u32::<LittleEndian>(3).map_err(|e| e.to_string())?;
        out.write_u32::<LittleEndian>(0).map_err(|e| e.to_string())?;
        out.write_u32::<LittleEndian>(1).map_err(|e| e.to_string())?;
        out.write_u32::<LittleEndian>(0).map_err(|e| e.to_string())?;
    }

    if has_mips {
        for b in blocks_small_to_large.iter().rev() {
            out.write_all(b).map_err(|e| e.to_string())?;
        }
    } else if let Some(b0) = blocks_small_to_large.first() {
        out.write_all(b0).map_err(|e| e.to_string())?;
    }

    Ok(out)
}

pub fn tex2dds(src: &Path) -> Result<(), String> {
    if matches_ext(src, "dds") {
        eprintln!("SKIP: {} is already .dds", src.display());
        return Ok(());
    }
    if matches_ext(src, "png") {
        return png2dds(src);
    }
    let bytes = fs::read(src).map_err(|e| format!("Failed to read {}: {}", src.display(), e))?;
    let dds = tex_to_dds_bytes(src, &bytes)?;
    let dst = default_out_path(src, "tex", "dds");
    fs::write(&dst, dds).map_err(|e| format!("Failed to write {}: {}", dst.display(), e))?;
    eprintln!("OK: {} -> {}", src.display(), dst.display());
    Ok(())
}

pub fn png2tex(src: &Path) -> Result<(), String> {
    // See dds2tex for the multi-select rationale.
    if matches_ext(src, "tex") {
        eprintln!("SKIP: {} is already .tex", src.display());
        return Ok(());
    }
    if matches_ext(src, "dds") {
        return dds2tex(src);
    }
    let mut img = image::open(src).map_err(|e| format!("Failed to open image {}: {}", src.display(), e))?;
    let (w, h) = (img.width(), img.height());
    let nw = round_to_4(w);
    let nh = round_to_4(h);
    if nw != w || nh != h {
        img = img.resize_exact(nw, nh, image::imageops::FilterType::Lanczos3);
        eprintln!(
            "Auto-resized {} from {}x{} to {}x{} (.tex requires dims divisible by 4)",
            src.display(), w, h, nw, nh
        );
    }
    let dst = default_out_path(src, "png", "tex");

    // Default to BC7 (same 16 bytes/block as BC3, much higher quality). Prefer
    // the GPU encoder (Bc7Native.dll, DirectXTex DirectCompute) when available;
    // fall back to the intel_tex CPU encoder otherwise.
    let rgba = img.to_rgba8();
    if let Some(tex_bytes) = crate::commands::bc7_gpu::encode_rgba_to_bc7_tex(&rgba, true, None) {
        fs::write(&dst, &tex_bytes).map_err(|e| format!("Failed to write {}: {}", dst.display(), e))?;
        eprintln!("OK (BC7 GPU): {} -> {}", src.display(), dst.display());
        return Ok(());
    }

    let tex = Tex::encode_dynamic_image(
        img,
        EncodeOptions::new(Format::Bc7)
            .with_mipmaps()
            .with_mipmap_filter(MipmapFilter::Triangle),
    )
    .map_err(|e| format!("Failed to encode TEX from {}: {}", src.display(), e))?;

    let mut out = fs::File::create(&dst).map_err(|e| format!("Failed to create {}: {}", dst.display(), e))?;
    tex.write(&mut out)
        .map_err(|e| format!("Failed to write TEX {}: {}", dst.display(), e))?;
    eprintln!("OK (BC7 CPU): {} -> {}", src.display(), dst.display());
    Ok(())
}

pub fn png2dds(src: &Path) -> Result<(), String> {
    if matches_ext(src, "dds") {
        eprintln!("SKIP: {} is already .dds", src.display());
        return Ok(());
    }
    if matches_ext(src, "tex") {
        return tex2dds(src);
    }
    let img = image::open(src).map_err(|e| format!("Failed to open image {}: {}", src.display(), e))?;
    let (orig_w, orig_h) = (img.width(), img.height());

    // DDS output keeps the original dimensions. BC encoders still need a
    // 4-aligned input, so when the source isn't aligned we pad an internal
    // RGBA buffer up to the next multiple of 4 with edge-replicated pixels,
    // encode that, then overwrite the intermediate TEX header back to the
    // original dims. DDS readers crop block data to the claimed dimensions.
    // Mipmaps get disabled for the padded case because the DDS reader's mip
    // chain (derived from the claimed dims via >>level) can diverge from the
    // encoder's chain (derived from padded dims) on non-power-of-2 sources.
    let need_pad = (orig_w % 4 != 0) || (orig_h % 4 != 0);
    let img_to_encode = if need_pad {
        let pw = (orig_w + 3) & !3;
        let ph = (orig_h + 3) & !3;
        let src_rgba = img.to_rgba8();
        let mut padded = image::RgbaImage::new(pw, ph);
        image::imageops::overlay(&mut padded, &src_rgba, 0, 0);
        // Edge-replicate to fill the padding band so BC blocks at the edge
        // don't bleed transparent/black into the visible area.
        for y in 0..orig_h {
            let edge = *src_rgba.get_pixel(orig_w - 1, y);
            for x in orig_w..pw {
                padded.put_pixel(x, y, edge);
            }
        }
        for y in orig_h..ph {
            for x in 0..pw {
                let edge = *padded.get_pixel(x, orig_h - 1);
                padded.put_pixel(x, y, edge);
            }
        }
        image::DynamicImage::ImageRgba8(padded)
    } else {
        img
    };

    // Default to BC7 (same size as BC3, higher quality). When padding, disable
    // mips and report the original dims in the header; otherwise generate mips.
    let with_mips = !need_pad;
    let override_dims = if need_pad { Some((orig_w as u16, orig_h as u16)) } else { None };

    // Prefer the GPU encoder (Bc7Native.dll); fall back to intel_tex CPU.
    let rgba_enc = img_to_encode.to_rgba8();
    let tex_bytes = if let Some(b) =
        crate::commands::bc7_gpu::encode_rgba_to_bc7_tex(&rgba_enc, with_mips, override_dims)
    {
        eprintln!("(BC7 GPU) {}", src.display());
        b
    } else {
        let opts = if need_pad {
            EncodeOptions::new(Format::Bc7)
        } else {
            EncodeOptions::new(Format::Bc7)
                .with_mipmaps()
                .with_mipmap_filter(MipmapFilter::Triangle)
        };
        let tex = Tex::encode_dynamic_image(img_to_encode, opts)
            .map_err(|e| format!("Failed to encode intermediate TEX from {}: {}", src.display(), e))?;
        let mut tb = Vec::new();
        tex.write(&mut tb)
            .map_err(|e| format!("Failed to serialize intermediate TEX from {}: {}", src.display(), e))?;
        if need_pad && tb.len() >= 8 {
            tb[4..6].copy_from_slice(&(orig_w as u16).to_le_bytes());
            tb[6..8].copy_from_slice(&(orig_h as u16).to_le_bytes());
        }
        tb
    };

    let dds = tex_to_dds_bytes(src, &tex_bytes)?;
    let dst = default_out_path(src, "png", "dds");
    fs::write(&dst, dds).map_err(|e| format!("Failed to write {}: {}", dst.display(), e))?;
    eprintln!("OK: {} -> {}", src.display(), dst.display());
    Ok(())
}

fn walk_files(dir: &Path, ext: &str, out: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read dir {}: {}", dir.display(), e))?;
    for e in entries {
        let e = e.map_err(|err| format!("Failed to read dir entry in {}: {}", dir.display(), err))?;
        let p = e.path();
        if p.is_dir() {
            walk_files(&p, ext, out)?;
        } else if p
            .extension()
            .and_then(|x| x.to_str())
            .map(|x| x.eq_ignore_ascii_case(ext))
            .unwrap_or(false)
        {
            out.push(p);
        }
    }
    Ok(())
}

pub fn tex2dds_dir(dir: &Path) -> Result<(), String> {
    let mut files = Vec::new();
    walk_files(dir, "tex", &mut files)?;
    let total = files.len();
    for f in files {
        tex2dds(&f)?;
    }
    eprintln!("OK: converted {} .tex files in {}", total, dir.display());
    Ok(())
}

pub fn dds2tex_dir(dir: &Path) -> Result<(), String> {
    let mut files = Vec::new();
    walk_files(dir, "dds", &mut files)?;
    let total = files.len();
    for f in files {
        dds2tex(&f)?;
    }
    eprintln!("OK: converted {} .dds files in {}", total, dir.display());
    Ok(())
}

pub fn tex2png_dir(dir: &Path) -> Result<(), String> {
    let mut files = Vec::new();
    walk_files(dir, "tex", &mut files)?;
    let total = files.len();
    for f in files {
        tex2png(&f)?;
    }
    eprintln!("OK: converted {} .tex files to .png in {}", total, dir.display());
    Ok(())
}

pub fn dds2png_dir(dir: &Path) -> Result<(), String> {
    let mut files = Vec::new();
    walk_files(dir, "dds", &mut files)?;
    let total = files.len();
    for f in files {
        dds2png(&f)?;
    }
    eprintln!("OK: converted {} .dds files to .png in {}", total, dir.display());
    Ok(())
}

pub fn png2tex_dir(dir: &Path) -> Result<(), String> {
    let mut files = Vec::new();
    walk_files(dir, "png", &mut files)?;
    let total = files.len();
    for f in files {
        png2tex(&f)?;
    }
    eprintln!("OK: converted {} .png files to .tex in {}", total, dir.display());
    Ok(())
}

pub fn png2dds_dir(dir: &Path) -> Result<(), String> {
    let mut files = Vec::new();
    walk_files(dir, "png", &mut files)?;
    let total = files.len();
    for f in files {
        png2dds(&f)?;
    }
    eprintln!("OK: converted {} .png files to .dds in {}", total, dir.display());
    Ok(())
}
