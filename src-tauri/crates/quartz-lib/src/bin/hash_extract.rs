//! BIN hash extraction — 1:1 port of old quartz_cli `bin_hashes.rs`.
//!
//! Scans `.bin` files for two kinds of hashable strings and merges them into
//! the shared extracted-hash text files so the unpacker / ritobin resolver can
//! name them later:
//!
//! - **Game paths** (xxh64) — length-prefixed UTF-8 strings in the BIN's string
//!   table that look like asset paths (`assets/…`, `data/…`, etc). `.dds` paths
//!   also get their `2x_`/`4x_` variants; `.bin` paths get their `.py` sibling.
//!   Written to `hashes.extracted.txt` (16-hex key).
//! - **SKN mesh range names** (fnv1a-32) — from embedded skinned-mesh blobs.
//!   Written to `hashes.binhashes.extracted.txt` (8-hex key).
//!
//! No `ltk_*` dependency — this is pure byte scanning. Hashing uses
//! `ritoshark::hash::{xxh64, fnv1a}` (both lowercase internally, matching the
//! original's explicit lowercasing).

use crate::error::{Error, Result};
use crate::hash::get_hash_dir;
use ritoshark::hash::{fnv1a, xxh64};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

pub(crate) const PATH_PREFIXES: &[&[u8]] = &[
    b"assets/",
    b"data/",
    b"maps/",
    b"levels/",
    b"clientstates/",
    b"ux/",
    b"uiautoatlas/",
];

/// Scan a BIN's string table for asset-path-looking strings and hash them
/// (xxh64 of the lowercased path). Emits `.dds` 2x/4x variants and `.py`
/// siblings of `.bin` paths, matching the original.
pub(crate) fn scan_bin_game_hashes(data: &[u8]) -> Vec<(u64, String)> {
    if data.len() < 4 || (&data[..4] != b"PROP" && &data[..4] != b"PTCH") {
        return vec![];
    }
    let mut results = Vec::new();
    let mut i = 0usize;
    while i + 2 <= data.len() {
        let len = u16::from_le_bytes([data[i], data[i + 1]]) as usize;
        if (8..=300).contains(&len) {
            if let Some(slice) = data.get(i + 2..i + 2 + len) {
                if let Ok(s) = std::str::from_utf8(slice) {
                    let lb = s.as_bytes();
                    let is_path = s.contains('/')
                        && s.is_ascii()
                        && PATH_PREFIXES
                            .iter()
                            .any(|p| lb.len() >= p.len() && lb[..p.len()].eq_ignore_ascii_case(p));
                    if is_path {
                        let lower = s.to_ascii_lowercase();
                        results.push((xxh64(&lower), lower.clone()));
                        if lower.ends_with(".dds") {
                            let slash = lower.rfind('/').map(|v| v + 1).unwrap_or(0);
                            let dir = &lower[..slash];
                            let fname = &lower[slash..];
                            let v2x = format!("{}2x_{}", dir, fname);
                            let v4x = format!("{}4x_{}", dir, fname);
                            results.push((xxh64(&v2x), v2x));
                            results.push((xxh64(&v4x), v4x));
                        }
                        if lower.ends_with(".bin") {
                            let py = format!("{}.py", &lower[..lower.len() - 4]);
                            results.push((xxh64(&py), py));
                        }
                        i += 2 + len;
                        continue;
                    }
                }
            }
        }
        i += 1;
    }
    results
}

/// Scan an embedded skinned-mesh (SKN) blob for its submesh range names,
/// hashing each with fnv1a-32.
pub(crate) fn scan_skn_bin_hashes(data: &[u8]) -> Vec<(u32, String)> {
    if data.len() < 12 {
        return vec![];
    }
    let magic = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
    if magic != 0x00112233 {
        return vec![];
    }
    let major = u16::from_le_bytes([data[4], data[5]]);
    if major == 0 {
        return vec![];
    }
    let range_count = u32::from_le_bytes([data[8], data[9], data[10], data[11]]) as usize;
    if range_count == 0 || range_count > 256 {
        return vec![];
    }
    let mut results = Vec::with_capacity(range_count);
    let mut pos = 12usize;
    for _ in 0..range_count {
        if pos + 80 > data.len() {
            break;
        }
        let name_bytes = &data[pos..pos + 64];
        let null_pos = name_bytes.iter().position(|&b| b == 0).unwrap_or(64);
        if let Ok(name) = std::str::from_utf8(&name_bytes[..null_pos]) {
            if !name.is_empty() {
                results.push((fnv1a(name), name.to_string()));
            }
        }
        pos += 80;
    }
    results
}

fn scan_one_file(
    data: &[u8],
    game_out: &mut BTreeMap<u64, String>,
    bin_out: &mut BTreeMap<u32, String>,
) {
    for (k, v) in scan_bin_game_hashes(data) {
        game_out.entry(k).or_insert(v);
    }
    for (k, v) in scan_skn_bin_hashes(data) {
        bin_out.entry(k).or_insert(v);
    }
}

/// Merge freshly-scanned hashes into the on-disk extracted-hash text files.
/// Returns whether anything was written.
fn write_merged_hashes(
    hash_dir: &Path,
    new_game_hashes: BTreeMap<u64, String>,
    new_bin_hashes: BTreeMap<u32, String>,
) -> Result<bool> {
    let mut written_any = false;

    if !new_game_hashes.is_empty() {
        let game_path = hash_dir.join("hashes.extracted.txt");
        let mut merged: BTreeMap<u64, String> = BTreeMap::new();
        if let Ok(content) = fs::read_to_string(&game_path) {
            for line in content.lines() {
                if let Some((h, p)) = line.split_once(' ') {
                    if let Ok(v) = u64::from_str_radix(h, 16) {
                        merged.entry(v).or_insert_with(|| p.to_string());
                    }
                }
            }
        }
        for (k, v) in new_game_hashes {
            merged.entry(k).or_insert(v);
        }
        let mut out = String::new();
        for (k, v) in merged {
            out.push_str(&format!("{:016x} {}\n", k, v));
        }
        fs::write(&game_path, out).map_err(|e| Error::io_with_path(e, &game_path))?;
        written_any = true;
    }

    if !new_bin_hashes.is_empty() {
        let bin_path_out = hash_dir.join("hashes.binhashes.extracted.txt");
        let mut merged: BTreeMap<u32, String> = BTreeMap::new();
        if let Ok(content) = fs::read_to_string(&bin_path_out) {
            for line in content.lines() {
                if let Some((h, p)) = line.split_once(' ') {
                    if let Ok(v) = u32::from_str_radix(h.trim_start_matches("0x"), 16) {
                        merged.entry(v).or_insert_with(|| p.to_string());
                    }
                }
            }
        }
        for (k, v) in new_bin_hashes {
            merged.entry(k).or_insert(v);
        }
        let mut out = String::new();
        for (k, v) in merged {
            out.push_str(&format!("{:08x} {}\n", k, v));
        }
        fs::write(&bin_path_out, out).map_err(|e| Error::io_with_path(e, &bin_path_out))?;
        written_any = true;
    }

    Ok(written_any)
}

/// The hash directory extracted hashes are written to
/// (`%APPDATA%/RitoShark/Requirements/Hashes`), created if missing.
fn ensure_hash_dir() -> Result<std::path::PathBuf> {
    let dir = get_hash_dir()?;
    fs::create_dir_all(&dir).map_err(|e| Error::io_with_path(e, &dir))?;
    Ok(dir)
}

/// Extract hashes from a single `.bin` file. Returns a human summary count of
/// (game_hashes_written, bin_hashes_written) as `(usize, usize)`.
pub fn extract_hashes_bin(bin_path: &Path) -> Result<(usize, usize)> {
    let hash_dir = ensure_hash_dir()?;
    let data = fs::read(bin_path).map_err(|e| Error::io_with_path(e, bin_path))?;

    let mut game_hashes: BTreeMap<u64, String> = BTreeMap::new();
    let mut bin_hashes: BTreeMap<u32, String> = BTreeMap::new();
    scan_one_file(&data, &mut game_hashes, &mut bin_hashes);
    let counts = (game_hashes.len(), bin_hashes.len());
    write_merged_hashes(&hash_dir, game_hashes, bin_hashes)?;
    Ok(counts)
}

/// Extract hashes from every `.bin` under `dir` recursively. Returns
/// `(files_scanned, game_hashes, bin_hashes)`.
pub fn extract_hashes_bin_dir(dir: &Path) -> Result<(usize, usize, usize)> {
    if !dir.is_dir() {
        return Err(Error::InvalidInput(format!(
            "Not a folder: {}",
            dir.display()
        )));
    }
    let hash_dir = ensure_hash_dir()?;

    let mut stack = vec![dir.to_path_buf()];
    let mut game_hashes: BTreeMap<u64, String> = BTreeMap::new();
    let mut bin_hashes: BTreeMap<u32, String> = BTreeMap::new();
    let mut scanned = 0usize;

    while let Some(current) = stack.pop() {
        let entries = match fs::read_dir(&current) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            let is_bin = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("bin"))
                .unwrap_or(false);
            if !is_bin {
                continue;
            }
            if let Ok(data) = fs::read(&path) {
                scan_one_file(&data, &mut game_hashes, &mut bin_hashes);
                scanned += 1;
            }
        }
    }

    let counts = (scanned, game_hashes.len(), bin_hashes.len());
    write_merged_hashes(&hash_dir, game_hashes, bin_hashes)?;
    Ok(counts)
}
