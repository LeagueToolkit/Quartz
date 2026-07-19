//! WAD Explorer backend — mount/browse/extract League `.wad`/`.wad.client`
//! archives.
//!
//! Wraps `ritoshark`'s `rs_wad` (parsing + decompression: stored/gzip/zstd/
//! zstd-multi) and the shared LMDB WAD hashtable in [`crate::hash`] for path
//! resolution. Parsed archives live in a process-global mount registry so the
//! frontend can navigate without re-parsing on every click.
//!
//! Archives are mounted TOC-only (`Wad::from_reader_toc`): the header and chunk
//! table are parsed, but the (often hundreds of MB) data section is never
//! buffered. Chunk reads and extraction seek to each chunk's offset and pull
//! only its bytes, so a mount costs a few KB plus its resolved-path table. Bulk
//! hash resolution mirrors the rest of the codebase: one parallel LMDB sweep
//! over every chunk hash, hex fallback for misses.

use crate::error::{Error, Result};
use crate::hash::{get_hash_dir, get_wad_env, resolve_hashes_lmdb_bulk};
use parking_lot::RwLock;
use rayon::prelude::*;
use ritoshark::wad::{Wad, WadChunk, WadCompression};
use rustc_hash::FxHashMap;
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::SystemTime;

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
    pub resolved: Arc<crate::hash::ResolvedHashes>,
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

struct SearchRecord {
    mount_id: MountId,
    chunk_index: u32,
    path_lower: String,
}

#[derive(Default)]
struct WadPathSearchIndex {
    records: Vec<SearchRecord>,
    tokens: FxHashMap<String, Vec<u32>>,
}

impl WadPathSearchIndex {
    fn add_mount(&mut self, mounted: &MountedWad) {
        for (chunk_index, chunk) in mounted.wad.chunks.iter().enumerate() {
            let record_id = self.records.len() as u32;
            let fallback;
            let path = match mounted.resolved.get(&chunk.path_hash) {
                Some(path) => path,
                None => {
                    fallback = format!("{:016x}", chunk.path_hash);
                    &fallback
                }
            };
            let path_lower = path.to_ascii_lowercase();
            self.records.push(SearchRecord {
                mount_id: mounted.id,
                chunk_index: chunk_index as u32,
                path_lower: path_lower.clone(),
            });
            for token in path_lower.split(|character: char| !character.is_ascii_alphanumeric()) {
                if token.len() < 2 {
                    continue;
                }
                if let Some(postings) = self.tokens.get_mut(token) {
                    postings.push(record_id);
                } else {
                    self.tokens.insert(token.to_owned(), vec![record_id]);
                }
            }
        }
    }

    fn clear(&mut self) {
        self.records.clear();
        self.tokens.clear();
    }
}

static SEARCH_INDEX: OnceLock<RwLock<WadPathSearchIndex>> = OnceLock::new();

struct ExtractedHashOverlay {
    path: PathBuf,
    modified: Option<SystemTime>,
    hashes: Arc<crate::hash::ResolvedHashes>,
}

static EXTRACTED_HASH_OVERLAY: OnceLock<RwLock<Option<ExtractedHashOverlay>>> = OnceLock::new();

fn registry() -> &'static RwLock<std::collections::HashMap<MountId, MountedWad>> {
    REGISTRY.get_or_init(|| RwLock::new(std::collections::HashMap::new()))
}

fn search_index() -> &'static RwLock<WadPathSearchIndex> {
    SEARCH_INDEX.get_or_init(|| RwLock::new(WadPathSearchIndex::default()))
}

fn extracted_hash_overlay() -> &'static RwLock<Option<ExtractedHashOverlay>> {
    EXTRACTED_HASH_OVERLAY.get_or_init(|| RwLock::new(None))
}

// ── Hash resolution ─────────────────────────────────────────────────────────

/// Bulk-resolve every chunk's path hash against the shared WAD LMDB, then
/// overlay paths learned by WAD Explorer's Extract Hashes action.
fn resolve_hash_values(hashes: &[u64]) -> crate::hash::ResolvedHashes {
    let Ok(hash_dir) = get_hash_dir() else {
        return crate::hash::ResolvedHashes::default();
    };
    let mut resolved = match get_wad_env(&hash_dir.to_string_lossy()) {
        Some(env) => resolve_hashes_lmdb_bulk(hashes, &env),
        None => crate::hash::ResolvedHashes::default(),
    };

    let requested: HashSet<u64> = hashes.iter().copied().collect();
    let overlay = load_extracted_hash_overlay(&hash_dir);
    for (hash, path) in overlay.iter() {
        if requested.contains(&hash) && !resolved.contains_key(&hash) {
            resolved.insert(hash, path);
        }
    }
    resolved
}

fn load_extracted_hash_overlay(hash_dir: &Path) -> Arc<crate::hash::ResolvedHashes> {
    let path = hash_dir.join("hashes.extracted.txt");
    let modified = std::fs::metadata(&path).and_then(|metadata| metadata.modified()).ok();
    {
        let cached = extracted_hash_overlay().read();
        if let Some(cached) = cached.as_ref() {
            if cached.path == path && cached.modified == modified {
                return Arc::clone(&cached.hashes);
            }
        }
    }

    let mut hashes = crate::hash::ResolvedHashes::new();
    if let Ok(content) = std::fs::read_to_string(&path) {
        let estimated = content.lines().count();
        hashes = crate::hash::ResolvedHashes::with_capacity(estimated, content.len());
        for line in content.lines() {
            let mut fields = line.split_whitespace();
            let (Some(hash), Some(path)) = (fields.next(), fields.next()) else {
                continue;
            };
            let Ok(hash) = u64::from_str_radix(hash.trim_start_matches("0x"), 16) else {
                continue;
            };
            hashes.insert(hash, path);
        }
    }

    let hashes = Arc::new(hashes);
    *extracted_hash_overlay().write() = Some(ExtractedHashOverlay {
        path,
        modified,
        hashes: Arc::clone(&hashes),
    });
    hashes
}

fn resolve_all(chunks: &[WadChunk]) -> crate::hash::ResolvedHashes {
    let hashes: Vec<u64> = chunks.iter().map(|chunk| chunk.path_hash).collect();
    resolve_hash_values(&hashes)
}

// ── Game-folder scan ──────────────────────────────────────────────────────────

/// One WAD discovered under a game's `DATA/FINAL`, serialized to the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedWad {
    pub name: String,
    pub path: String,
    /// Path relative to `FINAL`, POSIX-separated (e.g. `Champions/Aatrox.wad.client`).
    pub rel_path: String,
    pub size: u64,
    /// A language-suffixed voiceover WAD (e.g. `aatrox.en_US.wad.client`).
    pub is_voiceover: bool,
}

/// Result of [`scan_game_wads`]: WADs grouped by their top-level FINAL folder.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    /// `Champions` / `Maps` / `Global` / `Levels` / … → its WADs.
    pub groups: indexmap::IndexMap<String, Vec<ScannedWad>>,
    pub final_dir: String,
    pub total: usize,
}

/// Language-code suffixes that mark a voiceover WAD (mirrors the Electron list).
const LANG_CODES: &[&str] = &[
    "en_us", "en_gb", "de_de", "es_es", "fr_fr", "it_it", "pt_br", "ro_ro", "el_gr", "hu_hu",
    "cs_cz", "pl_pl", "ru_ru", "tr_tr", "zh_tw", "zh_cn", "ko_kr", "ja_jp", "ar_ae", "en_au",
    "es_mx", "vi_vn", "id_id", "th_th", "ms_my", "en_sg",
];

fn is_voiceover_name(file_name: &str) -> bool {
    let lower = file_name.to_ascii_lowercase();
    let stem = lower.strip_suffix(".wad.client").unwrap_or(&lower);
    let dot_suffix = stem.rsplit_once('.').map(|(_, s)| s);
    let under_suffix = stem.rsplit_once('_').map(|(_, s)| s);
    let matched = [dot_suffix, under_suffix]
        .into_iter()
        .flatten()
        .any(|s| LANG_CODES.contains(&s));
    matched
}

/// Recursively scan `<game_path>/DATA/FINAL` for `*.wad.client` files, grouping
/// each by the top-level FINAL subfolder (Champions/Maps/Global/Levels/Other).
/// Voiceover WADs are flagged and sorted last within their group. Mirrors the
/// Electron `wad:scanAll` IPC so the existing frontend tree renders unchanged.
pub fn scan_game_wads(game_path: &str) -> Result<ScanResult> {
    let supplied = Path::new(game_path);
    // Accept either the League root or its `Game` directory. Settings stores
    // the former while the old WAD Explorer field commonly stored the latter.
    let game_buf;
    let game = if supplied.join("DATA").join("FINAL").is_dir() {
        supplied
    } else {
        game_buf = supplied.join("Game");
        &game_buf
    };
    if !game.is_dir() {
        return Err(Error::InvalidInput(format!(
            "Game path does not exist: {}",
            game_path
        )));
    }
    let final_dir = game.join("DATA").join("FINAL");
    if !final_dir.is_dir() {
        return Err(Error::InvalidInput(format!(
            "DATA/FINAL not found inside: {}",
            game_path
        )));
    }

    let mut groups: indexmap::IndexMap<String, Vec<ScannedWad>> = indexmap::IndexMap::new();
    let mut total = 0usize;
    collect_wads(&final_dir, &final_dir, &mut groups, &mut total);

    // Alphabetical within each group; voiceovers last.
    for arr in groups.values_mut() {
        arr.sort_by(|a, b| match a.is_voiceover.cmp(&b.is_voiceover) {
            std::cmp::Ordering::Equal => a
                .name
                .to_ascii_lowercase()
                .cmp(&b.name.to_ascii_lowercase()),
            other => other,
        });
    }

    Ok(ScanResult {
        groups,
        final_dir: final_dir.to_string_lossy().into_owned(),
        total,
    })
}

/// Recursive `.wad.client` collector. `final_dir` is the scan root (for the
/// relative path); `dir` is the directory currently being walked. Unreadable
/// directories are skipped silently — a partial install shouldn't abort the scan.
fn collect_wads(
    final_dir: &Path,
    dir: &Path,
    groups: &mut indexmap::IndexMap<String, Vec<ScannedWad>>,
    total: &mut usize,
) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(ft) = entry.file_type() else { continue };
        if ft.is_dir() {
            collect_wads(final_dir, &path, groups, total);
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.to_ascii_lowercase().ends_with(".wad.client") {
            continue;
        }

        let rel = path.strip_prefix(final_dir).unwrap_or(&path);
        let rel_posix = rel.to_string_lossy().replace('\\', "/");
        // Top-level FINAL subfolder names the group; a WAD directly in FINAL → "Root".
        let group = if rel_posix.contains('/') {
            rel_posix.split('/').next().unwrap_or("Root").to_string()
        } else {
            "Root".to_string()
        };

        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        groups.entry(group).or_default().push(ScannedWad {
            name: name.clone(),
            path: path.to_string_lossy().into_owned(),
            rel_path: rel_posix,
            size,
            is_voiceover: is_voiceover_name(&name),
        });
        *total += 1;
    }
}

// ── Mount / unmount ───────────────────────────────────────────────────────────

/// Open a WAD, parse its header + chunk table + data section, bulk-resolve
/// every chunk hash, and register it. Returns the new [`MountId`].
pub fn mount(path: impl Into<PathBuf>) -> Result<MountId> {
    let path: PathBuf = path.into();
    // TOC-only mount: parse the header + chunk table but never buffer the (often
    // hundreds of MB) data section. Chunk reads and extraction seek to each
    // chunk's offset on demand, so a mounted archive costs a few KB of RAM plus
    // its resolved-path table, not the whole file.
    let file = std::fs::File::open(&path).map_err(|e| Error::io_with_path(e, &path))?;
    let mut reader = std::io::BufReader::new(file);
    let wad = Wad::from_reader_toc(&mut reader)
        .map_err(|e| Error::wad_with_path(e.to_string(), &path))?;

    let resolved = resolve_all(&wad.chunks);

    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let mounted = MountedWad {
        id,
        path,
        wad,
        resolved: Arc::new(resolved),
    };
    search_index().write().add_mount(&mounted);
    registry().write().insert(id, mounted);
    Ok(id)
}

/// Drop a mount. Returns `false` if `id` was unknown.
pub fn unmount(id: MountId) -> bool {
    let mut search = search_index().write();
    let mut mounts = registry().write();
    let removed = mounts.remove(&id).is_some();
    if removed {
        search.clear();
        for mounted in mounts.values() {
            search.add_mount(mounted);
        }
    }
    removed
}

/// Drop every mounted WAD in one pass. Rescanning used to call `unmount` once
/// per archive; because `unmount` rebuilds the shared search index, that made a
/// full rescan quadratic and could exhaust the UI/process. A rescan needs none
/// of the old mounts, so clear both stores atomically instead.
pub fn unmount_all() -> usize {
    let mut search = search_index().write();
    let mut mounts = registry().write();
    let removed = mounts.len();
    mounts.clear();
    search.clear();
    removed
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

/// One result from a full-game TOC batch. Archive headers and all path hashes
/// are indexed natively; only this compact metadata crosses the IPC boundary.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchMountResult {
    pub path: String,
    pub mount_id: Option<MountId>,
    pub name: String,
    pub version: String,
    pub chunk_count: usize,
    pub paths: Vec<String>,
    pub error: Option<String>,
}

/// Batch-mount a game's WAD TOCs and build one shared native path index. No
/// chunk payload is read, and the hundreds of thousands of resolved strings
/// stay in Rust instead of being serialized into the renderer.
pub fn mount_many(paths: &[String]) -> Vec<BatchMountResult> {
    struct Parsed {
        path: PathBuf,
        wad: Wad,
    }

    let existing: std::collections::HashMap<PathBuf, MountId> = registry()
        .read()
        .values()
        .map(|mounted| (mounted.path.clone(), mounted.id))
        .collect();

    let parsed: Vec<std::result::Result<Parsed, BatchMountResult>> = paths
        .par_iter()
        .map(|raw| {
            let path = PathBuf::from(raw);
            if let Some(id) = existing.get(&path).copied() {
                let info = list_mounted().into_iter().find(|item| item.id == id);
                if let Some(info) = info {
                    return Err(BatchMountResult {
                        path: info.path,
                        mount_id: Some(id),
                        name: info.name,
                        version: info.version,
                        chunk_count: info.chunk_count,
                        paths: Vec::new(),
                        error: None,
                    });
                }
            }

            let result = (|| -> Result<Parsed> {
                let file = std::fs::File::open(&path).map_err(|e| Error::io_with_path(e, &path))?;
                let mut reader = std::io::BufReader::new(file);
                let wad = Wad::from_reader_toc(&mut reader)
                    .map_err(|e| Error::wad_with_path(e.to_string(), &path))?;
                Ok(Parsed { path, wad })
            })();
            result.map_err(|error| BatchMountResult {
                path: raw.clone(),
                mount_id: None,
                name: Path::new(raw)
                    .file_name()
                    .map(|value| value.to_string_lossy().into_owned())
                    .unwrap_or_else(|| raw.clone()),
                version: String::new(),
                chunk_count: 0,
                paths: Vec::new(),
                error: Some(error.to_string()),
            })
        })
        .collect();

    let all_hashes: Vec<u64> = parsed
        .iter()
        .filter_map(|result| result.as_ref().ok())
        .flat_map(|parsed| parsed.wad.chunks.iter().map(|chunk| chunk.path_hash))
        .collect();
    let resolved_all = Arc::new(resolve_hash_values(&all_hashes));

    let mut search = search_index().write();
    parsed
        .into_iter()
        .map(|result| match result {
            Err(existing_or_error) => existing_or_error,
            Ok(parsed) => {
                let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
                let name = parsed
                    .path
                    .file_name()
                    .map(|value| value.to_string_lossy().into_owned())
                    .unwrap_or_else(|| parsed.path.to_string_lossy().into_owned());
                let version = format!("{}.{}", parsed.wad.version.0, parsed.wad.version.1);
                let chunk_count = parsed.wad.chunks.len();
                let path = parsed.path.to_string_lossy().into_owned();
                let mounted = MountedWad {
                    id,
                    path: parsed.path,
                    wad: parsed.wad,
                    resolved: Arc::clone(&resolved_all),
                };
                search.add_mount(&mounted);
                registry().write().insert(id, mounted);
                BatchMountResult {
                    path,
                    mount_id: Some(id),
                    name,
                    version,
                    chunk_count,
                    paths: Vec::new(),
                    error: None,
                }
            }
        })
        .collect()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WadSearchGroup {
    pub mount_id: MountId,
    pub wad_path: String,
    pub entries: Vec<WadEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WadSearchResult {
    pub groups: Vec<WadSearchGroup>,
    pub returned_matches: usize,
    pub truncated: bool,
}

/// Use the token table built during mounting to narrow a normal path query to
/// the relevant TOC rows. Complex regex expressions deliberately fall back to
/// the full in-memory scan so their semantics stay identical to old Quartz.
fn indexed_search_candidates(
    query: &str,
) -> Option<std::collections::HashMap<MountId, Vec<usize>>> {
    let complex_regex = query.bytes().any(|byte| {
        matches!(
            byte,
            b'*' | b'+'
                | b'?'
                | b'^'
                | b'$'
                | b'('
                | b')'
                | b'['
                | b']'
                | b'{'
                | b'}'
                | b'|'
                | b'\\'
        )
    });
    if complex_regex {
        return None;
    }

    let query_lower = query.to_ascii_lowercase();
    let token = query_lower
        .split(|character: char| !character.is_ascii_alphanumeric())
        .filter(|token| token.len() >= 2)
        .max_by_key(|token| token.len())?;
    let index = search_index().read();
    let mut seen = vec![false; index.records.len()];
    let mut mark_postings = |postings: &[u32]| {
        for record_id in postings {
            if let Some(slot) = seen.get_mut(*record_id as usize) {
                *slot = true;
            }
        }
    };
    if let Some(postings) = index.tokens.get(token) {
        // Exact folder/file terms are the normal workflow and resolve with a
        // single hash-table lookup (e.g. `kitpieces`, `aatrox`, `skin0`).
        mark_postings(postings);
    } else {
        // Preserve substring matching for partial terms. The lowercased path is
        // stored once at mount time, so this is a straight byte search over the
        // hot in-memory TOC index instead of rebuilding/lowercasing paths.
        for (record_id, record) in index.records.iter().enumerate() {
            if record.path_lower.contains(&query_lower) {
                if let Some(slot) = seen.get_mut(record_id) {
                    *slot = true;
                }
            }
        }
    }

    let mut by_mount: std::collections::HashMap<MountId, Vec<usize>> =
        std::collections::HashMap::new();
    for (record_id, matched) in seen.into_iter().enumerate() {
        if !matched {
            continue;
        }
        if let Some(record) = index.records.get(record_id) {
            by_mount
                .entry(record.mount_id)
                .or_default()
                .push(record.chunk_index as usize);
        }
    }
    Some(by_mount)
}

/// Search the path table built by `mount` / `mount_many`. This never opens the
/// LMDB or reparses a TOC. A hard cap keeps broad queries from recreating the
/// old 58 MiB renderer payload.
pub fn search_mounted(query: &str, limit: usize) -> WadSearchResult {
    let query = query.trim();
    if query.is_empty() {
        return WadSearchResult {
            groups: Vec::new(),
            returned_matches: 0,
            truncated: false,
        };
    }

    // Plain text is by far the common case. Avoid invoking the regex engine
    // unless the query actually contains regex syntax.
    let has_regex_syntax = query.bytes().any(|byte| {
        matches!(
            byte,
            b'.' | b'*'
                | b'+'
                | b'?'
                | b'^'
                | b'$'
                | b'('
                | b')'
                | b'['
                | b']'
                | b'{'
                | b'}'
                | b'|'
                | b'\\'
        )
    });
    let expression = has_regex_syntax
        .then(|| {
            regex::RegexBuilder::new(query)
                .case_insensitive(true)
                .build()
                .ok()
        })
        .flatten();
    let needle = query.as_bytes();
    let matches = |value: &str| match &expression {
        Some(regex) => regex.is_match(value),
        None => value
            .as_bytes()
            .windows(needle.len())
            .any(|window| window.eq_ignore_ascii_case(needle)),
    };
    let indexed_candidates = indexed_search_candidates(query);

    let limit = limit.clamp(1, 50_000);
    let mounts = registry().read();
    let mut ids: Vec<MountId> = mounts.keys().copied().collect();
    ids.sort_by(|left, right| {
        let left_path = mounts.get(left).map(|mounted| &mounted.path);
        let right_path = mounts.get(right).map(|mounted| &mounted.path);
        left_path.cmp(&right_path)
    });

    let mut groups = Vec::new();
    let mut returned_matches = 0usize;
    let mut truncated = false;

    'mounts: for id in ids {
        let Some(mounted) = mounts.get(&id) else {
            continue;
        };
        let mut entries = Vec::new();
        let mut append_match = |chunk: &WadChunk| {
            // Search borrowed strings from the shared arena. Allocate only
            // rows that will actually cross the Tauri IPC boundary.
            let resolved_path = mounted.resolved.get(&chunk.path_hash);
            let unknown_hex = resolved_path
                .is_none()
                .then(|| format!("{:016x}", chunk.path_hash));
            let candidate =
                resolved_path.unwrap_or_else(|| unknown_hex.as_deref().unwrap_or_default());
            if !matches(candidate) {
                return true;
            }
            if returned_matches == limit {
                truncated = true;
                return false;
            }
            let hex = format!("{:016x}", chunk.path_hash);
            entries.push(WadEntry {
                path_hash: hex,
                path: candidate.to_owned(),
                size: chunk.uncompressed_size as u64,
                compressed_size: chunk.compressed_size as u64,
                kind: compression_label(chunk.compression),
                unknown: resolved_path.is_none(),
            });
            returned_matches += 1;
            true
        };

        let completed = match &indexed_candidates {
            Some(by_mount) => {
                let Some(chunk_indices) = by_mount.get(&id) else {
                    continue;
                };
                chunk_indices
                    .iter()
                    .all(|chunk_index| match mounted.wad.chunks.get(*chunk_index) {
                        Some(chunk) => append_match(chunk),
                        None => true,
                    })
            }
            None => mounted.wad.chunks.iter().all(&mut append_match),
        };
        if !entries.is_empty() {
            entries.sort_by(|left, right| left.path.cmp(&right.path));
            groups.push(WadSearchGroup {
                mount_id: id,
                wad_path: mounted.path.to_string_lossy().into_owned(),
                entries,
            });
        }
        if !completed {
            break 'mounts;
        }
    }

    WadSearchResult {
        groups,
        returned_matches,
        truncated,
    }
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
/// path hash. Re-uses an existing mount's parsed TOC when one is open on the
/// same file (skips re-parsing the chunk table); either way the chunk is read
/// by seeking to its offset, never buffering the whole data section. Intended
/// for the preview pane. Heavy enough (multi-MB textures) to warrant the caller
/// running it on a blocking pool.
pub fn read_chunk(wad_path: &str, path_hash: u64) -> Result<Vec<u8>> {
    // Reuse a live mount's parsed TOC when possible; else parse the TOC fresh.
    // Either way we only need the chunk record, then we seek its bytes out of a
    // freshly opened reader.
    let chunk = {
        let reg = registry().read();
        match reg
            .values()
            .find(|m| m.path.as_os_str() == Path::new(wad_path).as_os_str())
        {
            Some(m) => m.wad.chunk_by_hash(path_hash).copied(),
            None => None,
        }
    };

    let file = std::fs::File::open(wad_path).map_err(|e| Error::io_with_path(e, wad_path))?;
    let mut reader = std::io::BufReader::new(file);
    let wad = Wad::from_reader_toc(&mut reader)
        .map_err(|e| Error::wad_with_path(e.to_string(), wad_path))?;
    let chunk = match chunk {
        Some(c) => c,
        None => *wad.chunk_by_hash(path_hash).ok_or_else(|| Error::Wad {
            message: format!("Chunk {:016x} not found in WAD", path_hash),
            path: Some(PathBuf::from(wad_path)),
        })?,
    };
    wad.chunk_data_from(&mut reader, &chunk)
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
    extract_selected_with_options(wad_path, hashes, out_dir, true, true, progress)
}

/// Explorer extraction variant with the two choices exposed by the old Quartz
/// workflow: keep/replace existing files and flat/preserved output paths.
pub fn extract_selected_with_options(
    wad_path: &str,
    hashes: &[u64],
    out_dir: &str,
    replace_existing: bool,
    preserve_paths: bool,
    progress: Option<&ProgressFn<'_>>,
) -> Result<ExtractResult> {
    let selected: HashSet<u64> = hashes.iter().copied().collect();
    let out_dir = Path::new(out_dir);

    // Reuse a live mount's parsed TOC + resolved table when possible; else parse
    // the TOC fresh. The `Wad` here is TOC-only (no data section), so cloning it
    // is cheap; each rayon worker opens its own reader and seeks to the chunks it
    // writes, so nothing buffers the whole archive.
    let wp = Path::new(wad_path);
    let (wad, mut plan): (Wad, Vec<PlanEntry>) = {
        let reg = registry().read();
        match reg.values().find(|m| m.path.as_os_str() == wp.as_os_str()) {
            Some(m) => {
                let plan = build_plan(&m.wad, &m.resolved, &selected);
                (m.wad.clone(), plan)
            }
            None => {
                drop(reg);
                let file =
                    std::fs::File::open(wad_path).map_err(|e| Error::io_with_path(e, wad_path))?;
                let mut reader = std::io::BufReader::new(file);
                let wad = Wad::from_reader_toc(&mut reader)
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

    if !preserve_paths {
        let mut seen = std::collections::HashMap::<String, usize>::new();
        for entry in &mut plan {
            let file_name = Path::new(&entry.path)
                .file_name()
                .map(|v| v.to_string_lossy().into_owned())
                .filter(|v| !v.is_empty())
                .unwrap_or_else(|| entry.hex.clone());
            let key = file_name.to_ascii_lowercase();
            let count = seen.entry(key).or_insert(0);
            if *count == 0 {
                entry.path = file_name;
            } else {
                let path = Path::new(&file_name);
                let stem = path
                    .file_stem()
                    .map(|v| v.to_string_lossy())
                    .unwrap_or_default();
                let ext = path
                    .extension()
                    .map(|v| format!(".{}", v.to_string_lossy()))
                    .unwrap_or_default();
                entry.path = format!("{}_{}{}", stem, entry.hex, ext);
            }
            *count += 1;
        }
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
        match extract_one(&wad, wad_path, entry, out_dir, replace_existing) {
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
            let path = resolved
                .get(&c.path_hash)
                .map(|p| p.to_string())
                .unwrap_or_else(|| hex.clone());
            PlanEntry {
                chunk: *c,
                path,
                hex,
            }
        })
        .collect();
    // Stream forward through the data section.
    plan.sort_by_key(|e| e.chunk.data_offset);
    plan
}

/// Returns `Ok(true)` written, `Ok(false)` skipped (e.g. Satellite).
///
/// Opens its own reader on `wad_path` and seeks to this chunk, so parallel
/// workers never share a reader and no worker buffers the whole data section.
fn extract_one(
    wad: &Wad,
    wad_path: &str,
    entry: &PlanEntry,
    out_dir: &Path,
    replace_existing: bool,
) -> Result<bool> {
    if matches!(entry.chunk.compression, WadCompression::Satellite) {
        return Ok(false);
    }
    let file = std::fs::File::open(wad_path).map_err(|e| Error::io_with_path(e, wad_path))?;
    let mut reader = std::io::BufReader::new(file);
    let data = wad
        .chunk_data_from(&mut reader, &entry.chunk)
        .map_err(|e| Error::Wad {
            message: e.to_string(),
            path: None,
        })?;

    let final_path = augment_path_with_extension(&entry.path, &data);
    let mut out_path = resolve_output_path(out_dir, &final_path);

    if path_too_long(&out_path) {
        out_path = out_dir.join(format!(
            "{}{}",
            entry.hex,
            sniff_extension(&data).unwrap_or("")
        ));
    }
    if !replace_existing && out_path.exists() {
        return Ok(false);
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

// ── Texture preview ───────────────────────────────────────────────────────────

/// Decode raw DDS or TEX bytes to a PNG buffer for the preview pane. Branches
/// on the 4-byte magic (`DDS ` vs. `TEX\0`/other) to pick the right RitoShark
/// constructor, decodes the top mipmap to RGBA, and re-encodes as PNG. The
/// frontend feeds this whatever `read_chunk` returned for a `.dds`/`.tex` entry.
pub fn decode_texture_to_png(data: &[u8]) -> Result<Vec<u8>> {
    decode_texture_to_png_sized(data, None)
}

/// Decode a texture for UI preview, optionally shrinking its longest edge
/// before PNG encoding. Folder cards never need a multi-megapixel payload.
pub fn decode_texture_to_png_sized(data: &[u8], max_dimension: Option<u32>) -> Result<Vec<u8>> {
    use ritoshark::prelude::Parse as _;
    use ritoshark::tex::Texture;

    if data.len() < 4 {
        return Err(Error::InvalidInput(
            "File too small to be a texture".to_string(),
        ));
    }

    let texture = if &data[0..4] == b"DDS " {
        Texture::from_dds_bytes(data)
            .map_err(|e| Error::InvalidInput(format!("Failed to parse DDS: {:?}", e)))?
    } else {
        Texture::from_bytes(data)
            .map_err(|e| Error::InvalidInput(format!("Failed to parse TEX: {:?}", e)))?
    };

    let rgba = texture
        .decode_rgba()
        .map_err(|e| Error::InvalidInput(format!("Failed to decode texture: {:?}", e)))?;
    let rgba = match max_dimension.filter(|dimension| *dimension > 0) {
        Some(max_dimension)
            if rgba.width() > max_dimension || rgba.height() > max_dimension =>
        {
            image::imageops::thumbnail(&rgba, max_dimension, max_dimension)
        }
        _ => rgba,
    };

    let mut png = Vec::new();
    {
        use image::ImageEncoder;
        image::codecs::png::PngEncoder::new_with_quality(
            &mut png,
            image::codecs::png::CompressionType::Fast,
            image::codecs::png::FilterType::Adaptive,
        )
            .write_image(
                rgba.as_raw(),
                rgba.width(),
                rgba.height(),
                image::ExtendedColorType::Rgba8,
            )
            .map_err(|e| Error::InvalidInput(format!("Failed to encode PNG: {}", e)))?;
    }
    Ok(png)
}

// ── Text preview ───────────────────────────────────────────────────────────

/// Convert an extracted WAD chunk to the same human-readable representation
/// used by the explorer preview pane. Binary formats are parsed natively;
/// ordinary text files are decoded lossily so a malformed byte never crashes
/// the page.
pub fn decode_chunk_to_text(data: &[u8], extension: &str) -> Result<String> {
    let extension = extension
        .trim_start_matches('.')
        .to_ascii_lowercase();
    let has_bin_magic = data.starts_with(b"PROP") || data.starts_with(b"PTCH");
    if matches!(extension.as_str(), "bin" | "inibin") || has_bin_magic {
        let tree = crate::bin::read_bin(data)
            .map_err(|e| Error::InvalidInput(format!("Failed to parse BIN: {e}")))?;
        return crate::bin::tree_to_text_cached(&tree)
            .map_err(|e| Error::InvalidInput(format!("Failed to render BIN: {e}")));
    }

    match extension.as_str() {
        "troybin" => render_troybin(data),
        "luabin" | "luabin64" | "luaobj" => render_luabin(data),
        _ => Ok(String::from_utf8_lossy(data).into_owned()),
    }
}

fn render_troybin(data: &[u8]) -> Result<String> {
    use ritoshark::prelude::Parse as _;
    use ritoshark::troybin::{ScalarValue, Troybin, TroybinBody};
    use std::collections::BTreeMap;

    let troy = Troybin::from_bytes(data)
        .map_err(|e| Error::InvalidInput(format!("Failed to parse Troybin: {e}")))?;
    let resolver = troy.resolver();
    let mut sections: BTreeMap<String, Vec<(String, String)>> = BTreeMap::new();

    let scalar = |value: &ScalarValue, flag_bit: Option<u8>| -> String {
        let scaled = matches!(flag_bit, Some(2 | 6 | 8 | 10));
        let u8_value = |v: u8| {
            if scaled {
                format_float(v as f64 * 0.1)
            } else {
                v.to_string()
            }
        };
        match value {
            ScalarValue::I32(v) => v.to_string(),
            ScalarValue::F32(v) => format_float(*v as f64),
            ScalarValue::U8(v) => u8_value(*v),
            ScalarValue::I16(v) => v.to_string(),
            ScalarValue::U16(v) => v.to_string(),
            ScalarValue::Bool(v) => {
                if *v {
                    "1".into()
                } else {
                    "0".into()
                }
            }
            ScalarValue::U8x2(v) => v.iter().map(|v| u8_value(*v)).collect::<Vec<_>>().join(" "),
            ScalarValue::U8x3(v) => v.iter().map(|v| u8_value(*v)).collect::<Vec<_>>().join(" "),
            ScalarValue::U8x4(v) => v.iter().map(|v| u8_value(*v)).collect::<Vec<_>>().join(" "),
            ScalarValue::F32x2(v) => v
                .iter()
                .map(|v| format_float(*v as f64))
                .collect::<Vec<_>>()
                .join(" "),
            ScalarValue::F32x3(v) => v
                .iter()
                .map(|v| format_float(*v as f64))
                .collect::<Vec<_>>()
                .join(" "),
            ScalarValue::F32x4(v) => v
                .iter()
                .map(|v| format_float(*v as f64))
                .collect::<Vec<_>>()
                .join(" "),
            ScalarValue::String(v) => {
                let text = String::from_utf8_lossy(v);
                if text.parse::<f64>().is_ok() {
                    text.into_owned()
                } else {
                    format!("\"{}\"", text.replace('"', "\\\""))
                }
            }
        }
    };

    match &troy.body {
        TroybinBody::V1(body) => {
            for entry in &body.entries {
                let start = entry.offset as usize;
                let end = body
                    .data
                    .get(start..)
                    .and_then(|tail| tail.iter().position(|b| *b == 0).map(|n| start + n))
                    .unwrap_or(body.data.len());
                let value = body
                    .data
                    .get(start..end)
                    .map(String::from_utf8_lossy)
                    .map(|v| v.into_owned())
                    .unwrap_or_default();
                sections
                    .entry("Hashes".into())
                    .or_default()
                    .push((format!("{:08x}", entry.hash), value));
            }
        }
        TroybinBody::V2(body) => {
            for bucket in &body.buckets {
                for (hash, value) in bucket.entries() {
                    let (section, name) = resolver
                        .resolve(hash)
                        .map(|r| (r.section.clone(), r.name.clone()))
                        .unwrap_or_else(|| ("Hashes".into(), format!("{:08x}", hash)));
                    sections
                        .entry(section)
                        .or_default()
                        .push((name, scalar(&value, Some(bucket.flag_bit))));
                }
            }
        }
    }

    let mut out = format!("; Troybin version {}\r\n", troy.version);
    for (section, mut values) in sections {
        values.sort_by(|a, b| a.0.to_ascii_lowercase().cmp(&b.0.to_ascii_lowercase()));
        out.push_str(&format!("\r\n[{section}]\r\n"));
        for (name, value) in values {
            out.push_str(&format!("{name}={value}\r\n"));
        }
    }
    Ok(out)
}

fn render_luabin(data: &[u8]) -> Result<String> {
    use ritoshark::luabin::{LuaBin, LuaConstant};
    use ritoshark::prelude::Parse as _;

    let lua = LuaBin::from_bytes(data)
        .map_err(|e| Error::InvalidInput(format!("Failed to parse Lua bytecode: {e}")))?;
    let format_constant = |value: &LuaConstant| -> String {
        match value {
            LuaConstant::Nil => "nil".into(),
            LuaConstant::Bool(v) => {
                if *v == 0 {
                    "false".into()
                } else {
                    "true".into()
                }
            }
            LuaConstant::Number(_) => value
                .as_f64()
                .map(format_float)
                .unwrap_or_else(|| "<number>".into()),
            LuaConstant::Str(None) => "nil".into(),
            LuaConstant::Str(Some(_)) => value
                .as_string()
                .map(|v| format!("\"{}\"", String::from_utf8_lossy(v).replace('"', "\\\"")))
                .unwrap_or_else(|| "\"\"".into()),
        }
    };

    let assignments = lua.global_assignments();
    let mut assigned = HashSet::new();
    let mut out = format!(
        "-- Lua 5.1 bytecode · format {} · {}-bit size_t\n",
        lua.format,
        u16::from(lua.size_t_size) * 8
    );
    if assignments.is_empty() {
        out.push_str("-- No reconstructable global assignments; constants follow.\n");
    }
    for assignment in assignments {
        if let Some(value) = lua.constant(&assignment.value) {
            assigned.insert(assignment.value.clone());
            out.push_str(&format!(
                "{} = {}\n",
                assignment.name,
                format_constant(value)
            ));
        }
    }
    let remaining: Vec<_> = lua
        .iter_constants()
        .filter(|(path, _)| !assigned.contains(path))
        .collect();
    if !remaining.is_empty() {
        out.push_str("\n-- Constant pool\n");
        for (path, value) in remaining {
            let scope = if path.proto.is_empty() {
                "main".into()
            } else {
                format!(
                    "proto:{}",
                    path.proto
                        .iter()
                        .map(usize::to_string)
                        .collect::<Vec<_>>()
                        .join(".")
                )
            };
            out.push_str(&format!(
                "-- {scope}[{}] = {}\n",
                path.index,
                format_constant(value)
            ));
        }
    }
    Ok(out)
}

fn format_float(value: f64) -> String {
    if value.is_nan() {
        return "NaN".into();
    }
    if value.is_infinite() {
        return if value.is_sign_negative() {
            "-Infinity".into()
        } else {
            "Infinity".into()
        };
    }
    if value.fract() == 0.0 {
        format!("{value:.1}")
    } else {
        value.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn voiceover_detection_matches_language_suffixes() {
        // VO archives are named `<ChampFile>.<lang>.wad.client` — the language
        // code is the dot-delimited suffix (it carries its own underscore).
        assert!(is_voiceover_name("aatrox.en_US.wad.client"));
        assert!(is_voiceover_name("Aatrox.ko_KR.wad.client"));
        assert!(is_voiceover_name("Map11.zh_CN.wad.client"));
        // Plain skin/data WADs are not voiceovers.
        assert!(!is_voiceover_name("Aatrox.wad.client"));
        assert!(!is_voiceover_name("Map11.wad.client"));
        assert!(!is_voiceover_name("Global.wad.client"));
    }
}
