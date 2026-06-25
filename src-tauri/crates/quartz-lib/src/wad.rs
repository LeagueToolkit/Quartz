/*! WAD-reading backend.

   The foundation for pulling assets straight out of a live League install:
   locate a champion's WAD, read its table of contents (resolving chunk path
   hashes to real paths via the WAD-hash LMDB), decompress individual chunks,
   and extract a selected subset to disk.

   Built on `ritoshark::wad` (rev d6af5ac). That crate parses the archive and
   decompresses chunks (stored / gzip / zstd / zstd-multi) but exposes no
   `from_path` and no path-hash resolution, so the file IO, hash resolution
   (reusing `crate::hash`'s WAD LMDB), and the find/list/extract orchestration
   live here. */

use crate::error::{Error, Result};
use crate::hash::{get_hash_dir, get_wad_env, resolve_hashes_lmdb_bulk, ResolvedHashes};
use ritoshark::wad::{Wad, WadChunk, WadCompression};
use std::collections::HashSet;
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

/// One TOC entry, flattened for the command layer and the frontend.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WadTocEntry {
    /// xxh64 of the lowercased path — the archive's primary key. Serialized as
    /// a 16-char hex string so it survives the JS number boundary intact.
    #[serde(with = "hex_u64")]
    pub path_hash: u64,
    pub compressed_size: u32,
    pub uncompressed_size: u32,
    /// `none` | `gzip` | `satellite` | `zstd` | `zstd_multi`.
    pub compression: &'static str,
    pub data_offset: u32,
    /// Resolved path from the WAD LMDB, or `None` when the hash is unknown.
    pub resolved_path: Option<String>,
}

/// Outcome of [`extract_selected`].
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractResult {
    pub extracted: usize,
    pub failed: usize,
    /// Absolute paths of every file written, in extraction order.
    pub written: Vec<String>,
}

/// A chunk the caller wants extracted, named by its path hash.
#[derive(Debug, Clone, Copy)]
pub struct ChunkSel {
    pub path_hash: u64,
}

fn compression_name(c: WadCompression) -> &'static str {
    match c {
        WadCompression::None => "none",
        WadCompression::Gzip => "gzip",
        WadCompression::Satellite => "satellite",
        WadCompression::Zstd => "zstd",
        WadCompression::ZstdMulti => "zstd_multi",
    }
}

// ── Champion / WAD location ────────────────────────────────────────────────────

/// Normalize a champion display name to its WAD basename.
///
/// Lowercase, strip apostrophes/spaces/dots, then apply Riot's internal-name
/// aliases (e.g. Wukong's files live under `monkeyking`).
pub fn normalize_champion(champion: &str) -> String {
    let base = champion
        .to_lowercase()
        .replace('\'', "")
        .replace(' ', "")
        .replace('.', "");

    match base.as_str() {
        "wukong" => "monkeyking".to_string(),
        "nunu" | "nunuwillump" | "nunu&willump" => "nunu".to_string(),
        "renataglasc" => "renata".to_string(),
        "drmundo" => "drmundo".to_string(),
        "kaisa" => "kaisa".to_string(),
        _ => base,
    }
}

/// `<root>/Game/DATA/FINAL/Champions`.
fn champions_dir(league_root: &Path) -> PathBuf {
    league_root
        .join("Game")
        .join("DATA")
        .join("FINAL")
        .join("Champions")
}

/// Locate a champion's main WAD: `Game/DATA/FINAL/Champions/<name>.wad.client`.
pub fn find_champion_wad(league_root: &Path, champion: &str) -> Option<PathBuf> {
    let name = normalize_champion(champion);
    let wad_path = champions_dir(league_root).join(format!("{}.wad.client", name));

    if wad_path.exists() {
        tracing::info!("Found champion WAD: {}", wad_path.display());
        Some(wad_path)
    } else {
        tracing::warn!("Champion WAD not found: {}", wad_path.display());
        None
    }
}

/// List a champion's voice-over WADs.
///
/// VO archives ship per-locale as `<name>.<locale>.wad.client` (e.g.
/// `aatrox.en_us.wad.client`) and are stored under the same Champions folder as
/// the main WAD. We return every archive whose basename starts with the
/// champion name but isn't the bare main WAD.
pub fn list_voiceover_wads(league_root: &Path, champion: &str) -> Vec<PathBuf> {
    let name = normalize_champion(champion);
    let dir = champions_dir(league_root);
    let main = format!("{}.wad.client", name);
    let prefix = format!("{}.", name);

    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(&dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let file_name = entry.file_name();
        let fname = file_name.to_string_lossy().to_lowercase();
        if fname == main {
            continue;
        }
        if fname.starts_with(&prefix) && fname.ends_with(".wad.client") {
            out.push(entry.path());
        }
    }
    out.sort();
    out
}

// ── Reading ────────────────────────────────────────────────────────────────────

/// Mount a WAD off disk. ritoshark on this rev has no `from_path`, so we read
/// the whole file (the archive owns its data section in memory anyway) and
/// parse from a cursor.
fn mount(wad_path: &Path) -> Result<Wad> {
    let bytes = fs::read(wad_path).map_err(|e| Error::io_with_path(e, wad_path))?;
    Wad::from_reader(&mut Cursor::new(bytes)).map_err(|e| Error::Wad {
        message: format!("Failed to parse WAD: {}", e),
        path: Some(wad_path.to_path_buf()),
    })
}

/// Build the bulk path resolver backed by the WAD-hash LMDB. Falls back to an
/// empty map (every hash unresolved) when the hash DB isn't installed.
fn resolve_paths(hashes: &[u64]) -> ResolvedHashes {
    let Ok(hash_dir) = get_hash_dir() else {
        return ResolvedHashes::default();
    };
    let Some(env) = get_wad_env(&hash_dir.to_string_lossy()) else {
        return ResolvedHashes::default();
    };
    resolve_hashes_lmdb_bulk(hashes, &env)
}

/// Read a WAD's table of contents, resolving every chunk's path hash to a real
/// path through the WAD LMDB. Nothing is decompressed or written.
pub fn read_wad_toc(wad_path: &Path) -> Result<Vec<WadTocEntry>> {
    let wad = mount(wad_path)?;

    let hashes: Vec<u64> = wad.chunks.iter().map(|c| c.path_hash).collect();
    let resolved = resolve_paths(&hashes);

    let toc = wad
        .chunks
        .iter()
        .map(|c| WadTocEntry {
            path_hash: c.path_hash,
            compressed_size: c.compressed_size,
            uncompressed_size: c.uncompressed_size,
            compression: compression_name(c.compression),
            data_offset: c.data_offset,
            resolved_path: resolved.get(&c.path_hash).map(String::from),
        })
        .collect();

    Ok(toc)
}

/// Decompress a single chunk by its path hash.
pub fn read_chunk_by_hash(wad_path: &Path, path_hash: u64) -> Result<Vec<u8>> {
    let wad = mount(wad_path)?;
    let chunk = wad.chunk_by_hash(path_hash).ok_or_else(|| Error::Wad {
        message: format!("chunk {:016x} not found", path_hash),
        path: Some(wad_path.to_path_buf()),
    })?;
    decompress_chunk(&wad, chunk)
}

/// Decompress an already-located chunk against a mounted WAD.
pub fn read_chunk(wad: &Wad, chunk: &WadChunk) -> Result<Vec<u8>> {
    decompress_chunk(wad, chunk)
}

fn decompress_chunk(wad: &Wad, chunk: &WadChunk) -> Result<Vec<u8>> {
    wad.chunk_data(chunk).map_err(|e| Error::Wad {
        message: format!("Failed to decompress chunk {:016x}: {}", chunk.path_hash, e),
        path: None,
    })
}

// ── Extraction ─────────────────────────────────────────────────────────────────

/// Extract the chunks named in `selected` to `out_dir`.
///
/// With `preserve_paths` set, each chunk is written under its resolved relative
/// path (sub-directories created as needed); unresolved hashes — and paths too
/// long for Windows — fall back to a flat `<hash>.<ext>` name. With it cleared
/// every chunk is written flat as `<hash>` (plus the detected extension where a
/// resolved path supplies one).
pub fn extract_selected(
    wad_path: &Path,
    selected: &[ChunkSel],
    out_dir: &Path,
    preserve_paths: bool,
) -> Result<ExtractResult> {
    let wad = mount(wad_path)?;

    let want: HashSet<u64> = selected.iter().map(|s| s.path_hash).collect();
    let targets: Vec<&WadChunk> = wad
        .chunks
        .iter()
        .filter(|c| want.contains(&c.path_hash))
        .collect();

    if targets.is_empty() {
        return Ok(ExtractResult::default());
    }

    let resolved = if preserve_paths {
        let hashes: Vec<u64> = targets.iter().map(|c| c.path_hash).collect();
        resolve_paths(&hashes)
    } else {
        ResolvedHashes::default()
    };

    fs::create_dir_all(out_dir).map_err(|e| Error::io_with_path(e, out_dir))?;

    let mut result = ExtractResult::default();

    for chunk in targets {
        let data = match decompress_chunk(&wad, chunk) {
            Ok(d) => d,
            Err(e) => {
                tracing::warn!("skip chunk {:016x}: {}", chunk.path_hash, e);
                result.failed += 1;
                continue;
            }
        };

        let out_path = output_path_for(out_dir, chunk.path_hash, resolved.get(&chunk.path_hash), preserve_paths);

        if let Some(parent) = out_path.parent() {
            if let Err(e) = fs::create_dir_all(parent) {
                tracing::warn!("mkdir failed for {}: {}", parent.display(), e);
                result.failed += 1;
                continue;
            }
        }

        match fs::write(&out_path, &data) {
            Ok(()) => {
                result.extracted += 1;
                result.written.push(out_path.to_string_lossy().into_owned());
            }
            Err(e) => {
                tracing::warn!("write failed for {}: {}", out_path.display(), e);
                result.failed += 1;
            }
        }
    }

    Ok(result)
}

/// Decide the on-disk path for one extracted chunk.
fn output_path_for(
    out_dir: &Path,
    path_hash: u64,
    resolved: Option<&str>,
    preserve_paths: bool,
) -> PathBuf {
    match (preserve_paths, resolved) {
        (true, Some(rel)) => {
            let candidate = out_dir.join(rel);
            // Windows MAX_PATH safety net: long names fall back to a flat hash
            // name carrying the original extension.
            if candidate.to_string_lossy().len() > 240 {
                let ext = Path::new(rel)
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("bin");
                out_dir.join(format!("{:016x}.{}", path_hash, ext))
            } else {
                candidate
            }
        }
        // No resolved path, or flat mode: keep the original extension when we
        // have one so downstream tooling can sniff the file.
        (_, Some(rel)) => {
            let ext = Path::new(rel).extension().and_then(|e| e.to_str());
            match ext {
                Some(ext) => out_dir.join(format!("{:016x}.{}", path_hash, ext)),
                None => out_dir.join(format!("{:016x}", path_hash)),
            }
        }
        (_, None) => out_dir.join(format!("{:016x}", path_hash)),
    }
}

// ── Path-hash helper ───────────────────────────────────────────────────────────

/// xxh64 of a lowercased WAD path — the archive's chunk key.
pub fn path_hash(path: &str) -> u64 {
    ritoshark::hash::xxh64(&path.to_lowercase())
}

// ── serde: u64 as hex string ───────────────────────────────────────────────────

mod hex_u64 {
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(v: &u64, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&format!("{:016x}", v))
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> std::result::Result<u64, D::Error> {
        let s = String::deserialize(d)?;
        u64::from_str_radix(s.trim_start_matches("0x"), 16).map_err(serde::de::Error::custom)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_strips_punctuation() {
        assert_eq!(normalize_champion("Kai'Sa"), "kaisa");
        assert_eq!(normalize_champion("Dr. Mundo"), "drmundo");
        assert_eq!(normalize_champion("Wukong"), "monkeyking");
        assert_eq!(normalize_champion("Aatrox"), "aatrox");
    }

    #[test]
    fn path_hash_is_xxh64_of_lowercase() {
        let a = path_hash("DATA/Characters/Aatrox/Aatrox.bin");
        let b = path_hash("data/characters/aatrox/aatrox.bin");
        assert_eq!(a, b);
    }

    #[test]
    fn flat_output_keeps_extension() {
        let p = output_path_for(Path::new("/out"), 0x1a2b3c4d5e6f7a8b, Some("data/x.bin"), false);
        assert!(p.to_string_lossy().ends_with("1a2b3c4d5e6f7a8b.bin"));
    }

    #[test]
    fn preserve_output_uses_resolved_path() {
        let p = output_path_for(Path::new("/out"), 1, Some("data/characters/aatrox/aatrox.bin"), true);
        assert!(p.to_string_lossy().replace('\\', "/").ends_with("data/characters/aatrox/aatrox.bin"));
    }
}
