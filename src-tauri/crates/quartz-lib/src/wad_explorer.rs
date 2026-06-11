//! WAD Explorer backend — mount/browse/extract League `.wad`/`.wad.client`
//! archives.
//!
//! Wraps `ritoshark`'s `rs_wad` (parsing + decompression: stored/gzip/zstd/
//! zstd-multi) and the shared LMDB WAD hashtable in [`crate::hash`] for path
//! resolution. Parsed archives live in a process-global mount registry so the
//! frontend can navigate without re-parsing on every click.
//!
//! `rs_wad::Wad` reads the whole data section into memory on open; chunk reads
//! and extraction then decompress straight out of that buffer with no extra
//! disk I/O. Bulk hash resolution mirrors the rest of the codebase: one
//! parallel LMDB sweep over every chunk hash, hex fallback for misses.

use crate::error::{Error, Result};
use crate::hash::{get_hash_dir, get_wad_env, resolve_hashes_lmdb_bulk};
use parking_lot::RwLock;
use rayon::prelude::*;
use ritoshark::wad::{Wad, WadChunk, WadCompression};
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;

/// Process-monotonic mount id. Stable for the process lifetime; usable as a
/// string key on the JS side.
pub type MountId = u64;

/// A parsed WAD plus bulk-resolved paths, held in the registry until
/// [`unmount`].
pub struct MountedWad {
    pub id: MountId,
    pub path: PathBuf,
    pub wad: Wad,
    /// `path_hash → resolved path`. Misses are absent (caller hex-falls-back).
    pub resolved: crate::hash::ResolvedHashes,
}

impl MountedWad {
    /// File-name component of the WAD path (UI tab title).
    pub fn display_name(&self) -> String {
        self.path
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| self.path.to_string_lossy().into_owned())
    }

    pub fn version_string(&self) -> String {
        format!("{}.{}", self.wad.version.0, self.wad.version.1)
    }
}

static REGISTRY: OnceLock<RwLock<std::collections::HashMap<MountId, MountedWad>>> = OnceLock::new();
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

fn registry() -> &'static RwLock<std::collections::HashMap<MountId, MountedWad>> {
    REGISTRY.get_or_init(|| RwLock::new(std::collections::HashMap::new()))
}

// ── Hash resolution ─────────────────────────────────────────────────────────

/// Bulk-resolve every chunk's path hash against the shared WAD LMDB. Returns
/// an empty table (every entry hex-falls-back) when the hashtable is absent.
fn resolve_all(chunks: &[WadChunk]) -> crate::hash::ResolvedHashes {
    let hashes: Vec<u64> = chunks.iter().map(|c| c.path_hash).collect();
    let Ok(hash_dir) = get_hash_dir() else {
        return crate::hash::ResolvedHashes::default();
    };
    match get_wad_env(&hash_dir.to_string_lossy()) {
        Some(env) => resolve_hashes_lmdb_bulk(&hashes, &env),
        None => crate::hash::ResolvedHashes::default(),
    }
}

// ── Mount / unmount ───────────────────────────────────────────────────────────

/// Open a WAD, parse its header + chunk table + data section, bulk-resolve
/// every chunk hash, and register it. Returns the new [`MountId`].
pub fn mount(path: impl Into<PathBuf>) -> Result<MountId> {
    let path: PathBuf = path.into();
    let file = std::fs::File::open(&path).map_err(|e| Error::io_with_path(e, &path))?;
    let mut reader = std::io::BufReader::new(file);
    let wad = Wad::from_reader(&mut reader)
        .map_err(|e| Error::wad_with_path(e.to_string(), &path))?;

    let resolved = resolve_all(&wad.chunks);

    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    registry().write().insert(
        id,
        MountedWad { id, path, wad, resolved },
    );
    Ok(id)
}

/// Drop a mount. Returns `false` if `id` was unknown.
pub fn unmount(id: MountId) -> bool {
    registry().write().remove(&id).is_some()
}

/// Run `f` against the mount under a read lock, or `None` if `id` is unknown.
pub fn with_mount<R>(id: MountId, f: impl FnOnce(&MountedWad) -> R) -> Option<R> {
    registry().read().get(&id).map(f)
}

// ── Entry listing ─────────────────────────────────────────────────────────────

/// One row of a mounted WAD's chunk list, serialized to the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WadEntry {
    /// 16-char hex form of the xxh64 path hash.
    pub path_hash: String,
    /// Resolved WAD path, or the hex form when the hash is unknown.
    pub path: String,
    /// Decompressed size in bytes.
    pub size: u64,
    pub compressed_size: u64,
    /// Compression label: "None" | "Gzip" | "Satellite" | "Zstd" | "ZstdMulti".
    #[serde(rename = "type")]
    pub kind: &'static str,
    /// True when the path didn't resolve (rendered under an "unknown" bucket).
    pub unknown: bool,
}

fn compression_label(c: WadCompression) -> &'static str {
    match c {
        WadCompression::None => "None",
        WadCompression::Gzip => "Gzip",
        WadCompression::Satellite => "Satellite",
        WadCompression::Zstd => "Zstd",
        WadCompression::ZstdMulti => "ZstdMulti",
    }
}

/// Every entry of a mounted WAD, sorted by resolved path for stable ordering.
pub fn list_entries(id: MountId) -> Result<Vec<WadEntry>> {
    with_mount(id, |m| {
        let mut entries: Vec<WadEntry> = m
            .wad
            .chunks
            .iter()
            .map(|c| {
                let hex = format!("{:016x}", c.path_hash);
                let (path, unknown) = match m.resolved.get(&c.path_hash) {
                    Some(p) => (p.to_string(), false),
                    None => (hex.clone(), true),
                };
                WadEntry {
                    path_hash: hex,
                    path,
                    size: c.uncompressed_size as u64,
                    compressed_size: c.compressed_size as u64,
                    kind: compression_label(c.compression),
                    unknown,
                }
            })
            .collect();
        entries.sort_by(|a, b| a.path.cmp(&b.path));
        entries
    })
    .ok_or_else(|| Error::Wad {
        message: format!("No mounted WAD with id {}", id),
        path: None,
    })
}

/// Lightweight projection of a mount, for the "open WADs" list.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MountInfo {
    pub id: MountId,
    pub path: String,
    pub name: String,
    pub version: String,
    pub chunk_count: usize,
}

/// Snapshot every currently-mounted WAD.
pub fn list_mounted() -> Vec<MountInfo> {
    registry()
        .read()
        .values()
        .map(|m| MountInfo {
            id: m.id,
            path: m.path.to_string_lossy().into_owned(),
            name: m.display_name(),
            version: m.version_string(),
            chunk_count: m.wad.chunks.len(),
        })
        .collect()
}

// ── Single-chunk read ─────────────────────────────────────────────────────────

/// Parse a hex / `0x`-prefixed path-hash string into a `u64`.
pub fn parse_path_hash(hex: &str) -> Result<u64> {
    let trimmed = hex.trim().trim_start_matches("0x").trim_start_matches("0X");
    u64::from_str_radix(trimmed, 16)
        .map_err(|e| Error::InvalidInput(format!("Invalid hex hash '{}': {}", hex, e)))
}

/// Decompress a single chunk from the WAD at `wad_path`, addressed by its
/// path hash. Re-uses an existing mount when one is open on the same file
/// (no re-read of the 100s-of-MB data section); otherwise opens the WAD
/// fresh. Intended for the preview pane. Heavy enough (multi-MB textures)
/// to warrant the caller running it on a blocking pool.
pub fn read_chunk(wad_path: &str, path_hash: u64) -> Result<Vec<u8>> {
    // Fast path: a mount already holds this file's data section in memory.
    let from_mount = {
        let reg = registry().read();
        reg.values()
            .find(|m| m.path.as_os_str() == Path::new(wad_path).as_os_str())
            .and_then(|m| {
                m.wad
                    .chunk_by_hash(path_hash)
                    .map(|c| m.wad.chunk_data(c))
            })
    };
    if let Some(res) = from_mount {
        return res.map_err(|e| Error::wad_with_path(e.to_string(), wad_path));
    }

    // Slow path: open the WAD just for this read.
    let file = std::fs::File::open(wad_path).map_err(|e| Error::io_with_path(e, wad_path))?;
    let mut reader = std::io::BufReader::new(file);
    let wad = Wad::from_reader(&mut reader)
        .map_err(|e| Error::wad_with_path(e.to_string(), wad_path))?;
    let chunk = wad.chunk_by_hash(path_hash).ok_or_else(|| Error::Wad {
        message: format!("Chunk {:016x} not found in WAD", path_hash),
        path: Some(PathBuf::from(wad_path)),
    })?;
    wad.chunk_data(chunk)
        .map_err(|e| Error::wad_with_path(e.to_string(), wad_path))
}

// ── Extraction ────────────────────────────────────────────────────────────────

/// Summary returned to the frontend on extraction completion.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractResult {
    pub written: usize,
    pub skipped: usize,
    pub errors: usize,
    pub output_dir: String,
}

/// Per-chunk progress callback signature: `(done, total)`.
pub type ProgressFn<'a> = dyn Fn(u64, u64) + Send + Sync + 'a;

/// Extract chunks from the WAD at `wad_path` into `output_dir`.
///
/// `hashes` are the selected chunk path-hashes; an empty slice extracts every
/// chunk. Paths are resolved via the open mount's table (or a fresh resolve
/// when no mount holds the file). Output preserves the resolved directory
/// layout; unresolved entries are written under their hex name with a sniffed
/// extension. `progress` is invoked roughly per chunk so the caller can emit
/// a Tauri event.
pub fn extract_selected(
    wad_path: &str,
    hashes: &[u64],
    out_dir: &str,
    progress: Option<&ProgressFn<'_>>,
) -> Result<ExtractResult> {
    let selected: HashSet<u64> = hashes.iter().copied().collect();
    let out_dir = Path::new(out_dir);

    // Reuse a live mount's parsed WAD + resolved table when possible; else
    // open + resolve fresh. We need owned data because the rayon closures
    // outlive the registry read guard, so we parse our own `Wad` when no
    // mount matches and clone the resolved paths we need either way.
    let wp = Path::new(wad_path);
    let (wad, plan): (Wad, Vec<PlanEntry>) = {
        let reg = registry().read();
        match reg
            .values()
            .find(|m| m.path.as_os_str() == wp.as_os_str())
        {
            Some(m) => {
                let plan = build_plan(&m.wad, &m.resolved, &selected);
                (m.wad.clone(), plan)
            }
            None => {
                drop(reg);
                let file =
                    std::fs::File::open(wad_path).map_err(|e| Error::io_with_path(e, wad_path))?;
                let mut reader = std::io::BufReader::new(file);
                let wad = Wad::from_reader(&mut reader)
                    .map_err(|e| Error::wad_with_path(e.to_string(), wad_path))?;
                let resolved = resolve_all(&wad.chunks);
                let plan = build_plan(&wad, &resolved, &selected);
                (wad, plan)
            }
        }
    };

    if plan.is_empty() {
        return Err(Error::Wad {
            message: "No chunks matched the extraction selection".to_string(),
            path: Some(wp.to_path_buf()),
        });
    }

    std::fs::create_dir_all(out_dir).map_err(|e| Error::io_with_path(e, out_dir))?;

    // Pre-create every parent directory once (sequential, cheap) so workers
    // don't race on `create_dir_all`.
    let mut prepared: HashSet<PathBuf> = HashSet::new();
    for entry in &plan {
        if let Some(parent) = resolve_output_path(out_dir, &entry.path).parent() {
            if prepared.insert(parent.to_path_buf()) {
                let _ = std::fs::create_dir_all(parent);
            }
        }
    }

    let total = plan.len() as u64;
    let written = AtomicU64::new(0);
    let skipped = AtomicU64::new(0);
    let errors = AtomicU64::new(0);
    let done = AtomicU64::new(0);

    plan.par_iter().for_each(|entry| {
        match extract_one(&wad, entry, out_dir) {
            Ok(true) => {
                written.fetch_add(1, Ordering::Relaxed);
            }
            Ok(false) => {
                skipped.fetch_add(1, Ordering::Relaxed);
            }
            Err(e) => {
                errors.fetch_add(1, Ordering::Relaxed);
                tracing::warn!("WAD extract {} -> {}", entry.path, e);
            }
        }
        let d = done.fetch_add(1, Ordering::Relaxed) + 1;
        if let Some(cb) = progress {
            cb(d, total);
        }
    });

    Ok(ExtractResult {
        written: written.load(Ordering::Relaxed) as usize,
        skipped: skipped.load(Ordering::Relaxed) as usize,
        errors: errors.load(Ordering::Relaxed) as usize,
        output_dir: out_dir.to_string_lossy().into_owned(),
    })
}

struct PlanEntry {
    chunk: WadChunk,
    /// Resolved path, or hex fallback.
    path: String,
    hex: String,
}

fn build_plan(
    wad: &Wad,
    resolved: &crate::hash::ResolvedHashes,
    selected: &HashSet<u64>,
) -> Vec<PlanEntry> {
    let mut plan: Vec<PlanEntry> = wad
        .chunks
        .iter()
        .filter(|c| selected.is_empty() || selected.contains(&c.path_hash))
        .map(|c| {
            let hex = format!("{:016x}", c.path_hash);
            let path = resolved.get(&c.path_hash).map(|p| p.to_string()).unwrap_or_else(|| hex.clone());
            PlanEntry { chunk: *c, path, hex }
        })
        .collect();
    // Stream forward through the data section.
    plan.sort_by_key(|e| e.chunk.data_offset);
    plan
}

/// Returns `Ok(true)` written, `Ok(false)` skipped (e.g. Satellite).
fn extract_one(wad: &Wad, entry: &PlanEntry, out_dir: &Path) -> Result<bool> {
    if matches!(entry.chunk.compression, WadCompression::Satellite) {
        return Ok(false);
    }
    let data = wad
        .chunk_data(&entry.chunk)
        .map_err(|e| Error::Wad { message: e.to_string(), path: None })?;

    let final_path = augment_path_with_extension(&entry.path, &data);
    let mut out_path = resolve_output_path(out_dir, &final_path);

    if path_too_long(&out_path) {
        out_path = out_dir.join(format!(
            "{}{}",
            entry.hex,
            sniff_extension(&data).unwrap_or("")
        ));
    }
    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| Error::io_with_path(e, parent))?;
    }
    std::fs::write(&out_path, &data).map_err(|e| Error::io_with_path(e, &out_path))?;
    Ok(true)
}

// ── Path handling ─────────────────────────────────────────────────────────────

const MAX_PATH_LEN: usize = 240;

/// Join `asset_path` under `output_dir`, stripping `..` / drive components.
fn resolve_output_path(output_dir: &Path, asset_path: &str) -> PathBuf {
    let normalized = asset_path.replace('\\', "/");
    let trimmed = normalized.trim_start_matches('/');
    let mut safe = PathBuf::new();
    for component in Path::new(trimmed).components() {
        if let std::path::Component::Normal(seg) = component {
            safe.push(seg);
        }
    }
    output_dir.join(safe)
}

fn path_too_long(path: &Path) -> bool {
    path.to_string_lossy().len() > MAX_PATH_LEN
}

fn augment_path_with_extension(path: &str, data: &[u8]) -> String {
    let p = Path::new(path);
    if p.extension().is_some() {
        return path.to_string();
    }
    match sniff_extension(data) {
        Some(ext) => format!("{}{}", path, ext),
        None => path.to_string(),
    }
}

/// Cheap magic-byte sniffer for the formats League ships. Returns the
/// extension with the leading dot, or `None` for unrecognised data.
pub fn sniff_extension(data: &[u8]) -> Option<&'static str> {
    if data.len() < 4 {
        return None;
    }

    if data.len() >= 8 && &data[0..4] == b"r3d2" {
        return Some(match &data[0..8] {
            b"r3d2sklt" => ".skl",
            b"r3d2anmd" | b"r3d2canm" => ".anm",
            b"r3d2Mesh" => ".scb",
            b"r3d2aims" => ".aimesh",
            _ => ".wpk",
        });
    }

    if u32::from_le_bytes([data[0], data[1], data[2], data[3]]) == 0x0011_2233 {
        return Some(".skn");
    }

    match &data[0..4] {
        b"PROP" | b"PTCH" => return Some(".bin"),
        b"DDS " => return Some(".dds"),
        b"OggS" => return Some(".ogg"),
        b"\x89PNG" => return Some(".png"),
        b"BKHD" => return Some(".bnk"),
        b"OEGM" => return Some(".mapgeo"),
        b"TEX\0" => return Some(".tex"),
        b"\x1bLua" | b"\x1bLJ\x01" | b"\x1bLJ\x02" => return Some(".luaobj"),
        _ => {}
    }

    if data.starts_with(b"\xff\xd8\xff") {
        return Some(".jpg");
    }
    if data.starts_with(b"RST") {
        return Some(".stringtable");
    }
    if data.starts_with(b"<lua") {
        return Some(".lua");
    }
    if data.starts_with(b"GIF8") {
        return Some(".gif");
    }
    if data.starts_with(b"{") {
        return Some(".json");
    }
    None
}
