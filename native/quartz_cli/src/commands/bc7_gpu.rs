//! GPU BC7 encoding via the bundled `Bc7Native.dll` (RitoShark's Paint.NET
//! Tex plugin DLL — a DirectXTex DirectCompute wrapper).
//!
//! The DLL exports (cdecl):
//!   int EncodeBC7ImageGPU(out, inRgba, w, h, flags)  -- DirectCompute path
//!   int EncodeBC7Image   (out, inRgba, w, h, flags)  -- native CPU fallback
//!   int GpuAvailable()                                -- 1 if a D3D11 device opens
//!
//! Loaded at runtime; if the DLL (or GPU) is unavailable we return None and the
//! caller falls back to the intel_tex CPU encoder in ltk_texture.

use libloading::{Library, Symbol};
use ltk_texture::tex::Format;
use std::path::PathBuf;
use std::sync::OnceLock;

const TEX_MAGIC: u32 = u32::from_le_bytes(*b"TEX\0");
const TEX_FMT_BC7: u8 = 13;
const TEX_FLAG_HAS_MIPS: u8 = 1;

type EncodeFn = unsafe extern "C" fn(*mut u8, *const u8, u32, u32, u32) -> i32;
type GpuAvailFn = unsafe extern "C" fn() -> i32;

fn dll_candidates() -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            // Production: bundled next to quartz_cli.exe (electron resources/).
            v.push(dir.join("Bc7Native.dll"));
            // Dev: native/bc7_native/Bc7Native.dll, located by walking up from
            // native/quartz_cli/target/release/.
            for anc in dir.ancestors().take(6) {
                v.push(anc.join("bc7_native").join("Bc7Native.dll"));
                v.push(anc.join("native").join("bc7_native").join("Bc7Native.dll"));
            }
        }
    }
    v
}

fn lib() -> Option<&'static Library> {
    static LIB: OnceLock<Option<Library>> = OnceLock::new();
    LIB.get_or_init(|| {
        for cand in dll_candidates() {
            if cand.exists() {
                if let Ok(l) = unsafe { Library::new(&cand) } {
                    return Some(l);
                }
            }
        }
        // Fall back to the OS search path (exe dir is on it).
        unsafe { Library::new("Bc7Native.dll").ok() }
    })
    .as_ref()
}

/// True if the DLL is present and a D3D11 device can be created.
pub fn gpu_available() -> bool {
    let Some(l) = lib() else { return false };
    unsafe {
        match l.get::<GpuAvailFn>(b"GpuAvailable\0") {
            Ok(f) => f() != 0,
            Err(_) => false,
        }
    }
}

/// Encode one RGBA8 image to BC7 blocks. Tries the GPU path first, then the
/// DLL's native CPU path. Returns None if the DLL isn't usable at all.
fn encode_blocks(rgba: &[u8], width: u32, height: u32) -> Option<Vec<u8>> {
    let l = lib()?;
    let bw = width.div_ceil(4) as usize;
    let bh = height.div_ceil(4) as usize;
    let mut out = vec![0u8; bw * bh * 16];
    unsafe {
        if let Ok(f) = l.get::<Symbol<EncodeFn>>(b"EncodeBC7ImageGPU\0") {
            if f(out.as_mut_ptr(), rgba.as_ptr(), width, height, 0) != 0 {
                return Some(out);
            }
        }
        if let Ok(f) = l.get::<Symbol<EncodeFn>>(b"EncodeBC7Image\0") {
            if f(out.as_mut_ptr(), rgba.as_ptr(), width, height, 0) != 0 {
                return Some(out);
            }
        }
    }
    None
}

/// Build full BC7 TEX bytes from an RGBA image using the DLL encoder.
/// Generates the mip chain (Triangle filter, matching ltk_texture) and lays the
/// blocks out smallest-first, exactly like ltk's writer. `override_dims` lets
/// callers (png2dds padded path) report the original dimensions in the header
/// while encoding a padded surface. Returns None if the DLL is unusable.
pub fn encode_rgba_to_bc7_tex(
    rgba: &image::RgbaImage,
    with_mips: bool,
    override_dims: Option<(u16, u16)>,
) -> Option<Vec<u8>> {
    let (w, h) = rgba.dimensions();
    let mip_count = if with_mips {
        ((w.max(h) as f32).log2().floor() as u32) + 1
    } else {
        1
    };

    // Each EncodeBC7ImageGPU call spins up a fresh D3D11 device + BC7 compute
    // pipeline (~tens of ms of fixed overhead the DLL gives us no way to amortize).
    // The big mip dominates the actual encode cost and is where the GPU wins; the
    // smaller mips are a handful of blocks each and encode in ~ms on the CPU. So
    // GPU-encode only mips at/above this dimension and use the intel_tex CPU
    // encoder for the rest — this collapses ~N device creations down to a few.
    const GPU_MIN_DIM: u32 = 256;

    // Encode each level; collect largest-first, emit smallest-first.
    let mut levels: Vec<Vec<u8>> = Vec::with_capacity(mip_count as usize);
    for level in 0..mip_count {
        let mw = (w >> level).max(1);
        let mh = (h >> level).max(1);
        let owned;
        let rgba_level: &[u8] = if level == 0 {
            rgba.as_raw()
        } else {
            owned = image::imageops::resize(rgba, mw, mh, image::imageops::FilterType::Triangle);
            owned.as_raw()
        };

        let blocks = if mw.max(mh) >= GPU_MIN_DIM {
            // Large mip → GPU. If level 0 can't be GPU-encoded at all, bail so the
            // caller falls back to the full CPU encoder.
            match encode_blocks(rgba_level, mw, mh) {
                Some(b) => b,
                None if level == 0 => return None,
                None => ltk_texture::tex::encode_rgba(mw, mh, rgba_level, Format::Bc7).ok()?,
            }
        } else {
            // Small mip → CPU (intel_tex), no device overhead.
            ltk_texture::tex::encode_rgba(mw, mh, rgba_level, Format::Bc7).ok()?
        };
        levels.push(blocks);
    }

    let (hdr_w, hdr_h) = override_dims.unwrap_or((w as u16, h as u16));

    let total: usize = levels.iter().map(|b| b.len()).sum();
    let mut out = Vec::with_capacity(12 + total);
    out.extend_from_slice(&TEX_MAGIC.to_le_bytes());
    out.extend_from_slice(&hdr_w.to_le_bytes());
    out.extend_from_slice(&hdr_h.to_le_bytes());
    out.push(0); // is_extended_format
    out.push(TEX_FMT_BC7);
    out.push(0); // resource_type
    out.push(if with_mips { TEX_FLAG_HAS_MIPS } else { 0 });
    for blocks in levels.iter().rev() {
        out.extend_from_slice(blocks);
    }
    Some(out)
}
