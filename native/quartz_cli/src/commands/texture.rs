use std::fs;
use std::io::{BufReader, Write};
use std::path::{Path, PathBuf};

use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use ltk_texture::tex::{EncodeOptions, Format, MipmapFilter};
use ltk_texture::Tex;

const DDS_MAGIC: u32 = u32::from_le_bytes(*b"DDS ");
const TEX_MAGIC: u32 = u32::from_le_bytes(*b"TEX\0");
const FOURCC_DXT1: u32 = u32::from_le_bytes(*b"DXT1");
const FOURCC_DXT5: u32 = u32::from_le_bytes(*b"DXT5");
const FOURCC_DX10: u32 = u32::from_le_bytes(*b"DX10");

const TEX_FMT_BC1: u8 = 10;
const TEX_FMT_BC3: u8 = 12;
const TEX_FMT_BGRA8: u8 = 20;
const TEX_FLAG_HAS_MIPS: u8 = 1;

#[derive(Debug, Clone, Copy)]
enum FormatKind {
    Bc1,
    Bc3,
    Bgra8,
}

impl FormatKind {
    fn block_size(self) -> usize {
        match self {
            Self::Bc1 => 8,
            Self::Bc3 => 16,
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
            Self::Bc3 => TEX_FMT_BC3,
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

pub fn tex2png(src: &Path) -> Result<(), String> {
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

    if fourcc == FOURCC_DX10 {
        return Err(format!("DX10 DDS not supported for {}", src.display()));
    }

    let (fmt, mut needs_swizzle) = if fourcc == FOURCC_DXT1 {
        (FormatKind::Bc1, false)
    } else if fourcc == FOURCC_DXT5 {
        (FormatKind::Bc3, false)
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

    let mut data = bytes[128..].to_vec();
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

pub fn dds2tex(src: &Path) -> Result<(), String> {
    let tex_bytes = dds_to_tex_bytes(src)?;
    let dst = default_out_path(src, "dds", "tex");
    fs::write(&dst, tex_bytes).map_err(|e| format!("Failed to write {}: {}", dst.display(), e))?;
    eprintln!("OK: {} -> {}", src.display(), dst.display());
    Ok(())
}

pub fn dds2png(src: &Path) -> Result<(), String> {
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
        TEX_FMT_BC3 => (FormatKind::Bc3, 0x0000_0004u32, FOURCC_DXT5, 0, 0, 0, 0, 0),
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
    let bytes = fs::read(src).map_err(|e| format!("Failed to read {}: {}", src.display(), e))?;
    let dds = tex_to_dds_bytes(src, &bytes)?;
    let dst = default_out_path(src, "tex", "dds");
    fs::write(&dst, dds).map_err(|e| format!("Failed to write {}: {}", dst.display(), e))?;
    eprintln!("OK: {} -> {}", src.display(), dst.display());
    Ok(())
}

pub fn png2tex(src: &Path) -> Result<(), String> {
    let img = image::open(src).map_err(|e| format!("Failed to open image {}: {}", src.display(), e))?;
    let tex = Tex::encode_dynamic_image(
        img,
        EncodeOptions::new(Format::Bc3)
            .with_mipmaps()
            .with_mipmap_filter(MipmapFilter::Triangle),
    )
    .map_err(|e| format!("Failed to encode TEX from {}: {}", src.display(), e))?;

    let dst = default_out_path(src, "png", "tex");
    let mut out = fs::File::create(&dst).map_err(|e| format!("Failed to create {}: {}", dst.display(), e))?;
    tex.write(&mut out)
        .map_err(|e| format!("Failed to write TEX {}: {}", dst.display(), e))?;
    eprintln!("OK: {} -> {}", src.display(), dst.display());
    Ok(())
}

pub fn png2dds(src: &Path) -> Result<(), String> {
    let img = image::open(src).map_err(|e| format!("Failed to open image {}: {}", src.display(), e))?;
    let tex = Tex::encode_dynamic_image(
        img,
        EncodeOptions::new(Format::Bc3)
            .with_mipmaps()
            .with_mipmap_filter(MipmapFilter::Triangle),
    )
    .map_err(|e| format!("Failed to encode intermediate TEX from {}: {}", src.display(), e))?;

    let mut tex_bytes = Vec::new();
    tex.write(&mut tex_bytes)
        .map_err(|e| format!("Failed to serialize intermediate TEX from {}: {}", src.display(), e))?;

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
