//! WAD command tooling — 1:1 port of old quartz_cli `wad.rs`, retargeted from
//! `ltk_wad`/`ltk_file` onto ritoshark's `rs_wad`/`rs_file`.
//!
//! Four right-click actions:
//! - [`extract_hashes`] — scan every chunk for asset-path / SKN-range strings
//!   and merge them into the shared extracted-hash text files.
//! - [`unpack`] — decompress every chunk to disk under its resolved path
//!   (resolving hashes via the WAD LMDB + `hashes.extracted.txt`), writing a
//!   `hashed_files.json` map for any chunk that had to fall back to a hash name.
//! - [`extract_and_unpack`] — [`extract_hashes`] then [`unpack`].
//! - [`pack_dir_to_wad`] — pack a folder back into a `.wad.client`.
//!
//! ltk → ritoshark mapping: `Wad::mount`→`Wad::from_reader`; `wad.chunks()`→
//! `wad.chunks`; `chunk.path_hash()`→`chunk.path_hash`;
//! `wad.load_chunk_decompressed`→`wad.chunk_data`;
//! `LeagueFileKind::identify_from_bytes(..).extension()`→
//! `ritoshark::file::detect(..)` + [`file_kind_ext`];
//! `ltk_wad::{WadBuilder, WadChunkBuilder}`→`rs_wad::WadBuilder`.

use crate::bin::hash_extract::scan_skn_bin_hashes;
use crate::error::{Error, Result};
use crate::hash::{get_hash_dir, get_wad_env, resolve_hashes_lmdb_bulk};
use ritoshark::file::{detect, FileKind};
use ritoshark::hash::xxh64;
use ritoshark::wad::{Wad, WadBuilder};
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};

/// Summary counts for the CLI success line.
#[derive(Debug, Clone, Default)]
pub struct WadExtractResult {
    pub extracted: usize,
    pub skipped: usize,
    pub hashed_named: usize,
}

// ── path helpers ────────────────────────────────────────────────────────────

fn normalize_rel_path(v: &str) -> String {
    v.replace('\\', "/").trim_start_matches('/').to_string()
}

fn is_safe_relative_path(path: &str) -> bool {
    let p = Path::new(path);
    if p.is_absolute() {
        return false;
    }
    use std::path::Component;
    for comp in p.components() {
        match comp {
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return false,
            _ => {}
        }
    }
    true
}

/// Extension string for a detected league file kind, or `None` when unknown.
/// Replaces `ltk_file`'s `LeagueFileKind::extension()`.
fn file_kind_ext(kind: FileKind) -> Option<&'static str> {
    Some(match kind {
        FileKind::PropBin | FileKind::PatchBin => "bin",
        FileKind::Wad => "wad",
        FileKind::Tex => "tex",
        FileKind::Dds => "dds",
        FileKind::SkinnedMesh => "skn",
        FileKind::Skeleton => "skl",
        FileKind::AnimUncompressed | FileKind::AnimCompressed => "anm",
        FileKind::StaticMeshBinary => "scb",
        FileKind::StaticMeshText => "sco",
        FileKind::MapGeo => "mapgeo",
        FileKind::Rst => "stringtable",
        FileKind::Rman => "manifest",
        FileKind::Wpk => "wpk",
        FileKind::Bnk => "bnk",
        FileKind::Unknown => return None,
    })
}

fn default_unpack_output(wad_path: &Path) -> PathBuf {
    let parent = wad_path.parent().unwrap_or_else(|| Path::new("."));
    let name = wad_path.file_name().and_then(|n| n.to_str()).unwrap_or("wad");
    let lower = name.to_ascii_lowercase();
    let folder_name = if lower.ends_with(".wad.client") {
        format!("{}.wad", &name[..name.len() - ".wad.client".len()])
    } else {
        name.to_string()
    };
    let preferred = parent.join(&folder_name);
    if preferred == wad_path {
        return parent.join(format!("{}.unpacked", folder_name));
    }
    preferred
}

/// Default output for [`pack_dir_to_wad`].
pub fn default_pack_output(input_dir: &Path) -> PathBuf {
    let parent = input_dir.parent().unwrap_or_else(|| Path::new("."));
    let name = input_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("output")
        .to_string();
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".wad") {
        parent.join(format!("{}.client", name))
    } else if lower.ends_with(".wad.client") {
        parent.join(name)
    } else {
        parent.join(format!("{}.wad.client", name))
    }
}

fn parse_hex_name_from_root(rel: &str) -> Option<u64> {
    if rel.contains('/') {
        return None;
    }
    let stem = rel.split('.').next().unwrap_or(rel);
    if stem.len() != 16 || !stem.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    u64::from_str_radix(stem, 16).ok()
}

// ── hash scanning (WAD variant: extended root-asset path recognition) ───────

const PATH_PREFIXES: &[&[u8]] = &[
    b"assets/",
    b"data/",
    b"maps/",
    b"levels/",
    b"clientstates/",
    b"ux/",
    b"uiautoatlas/",
];

const ROOT_ASSET_EXTS: &[&[u8]] = &[
    b".dds", b".tex", b".skn", b".skl", b".anm", b".bin", b".bnk", b".wpk", b".wem", b".scb",
    b".sco", b".scn", b".troybin", b".luaobj", b".lua", b".dat", b".png", b".jpg", b".webp",
    b".mapgeo",
];

fn looks_like_path(s: &[u8]) -> bool {
    if PATH_PREFIXES
        .iter()
        .any(|p| s.len() >= p.len() && s[..p.len()].eq_ignore_ascii_case(p))
    {
        return true;
    }
    if !s.contains(&b'/') {
        return false;
    }
    ROOT_ASSET_EXTS.iter().any(|ext| {
        s.len() >= ext.len() && s[s.len() - ext.len()..].eq_ignore_ascii_case(ext)
    })
}

fn scan_wad_game_hashes(data: &[u8]) -> Vec<(u64, String)> {
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
                    if s.contains('/') && s.is_ascii() && looks_like_path(s.as_bytes()) {
                        let lower = s.to_ascii_lowercase();
                        results.push((xxh64(&lower), lower.clone()));
                        if lower.ends_with(".dds") {
                            let slash = lower.rfind('/').map(|v| v + 1).unwrap_or(0);
                            let (dir, fname) = lower.split_at(slash);
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

// ── hash text file merge ────────────────────────────────────────────────────

fn parse_hash_text_file(path: &Path, hash_len: usize) -> HashMap<u64, String> {
    let mut out = HashMap::new();
    let Ok(content) = fs::read_to_string(path) else {
        return out;
    };
    for line in content.lines() {
        let l = line.trim();
        if l.is_empty() || l.starts_with('#') || l.len() <= hash_len + 1 {
            continue;
        }
        let h = &l[..hash_len];
        let p = l[hash_len + 1..].trim();
        if let Ok(v) = u64::from_str_radix(h, 16) {
            out.entry(v).or_insert_with(|| p.to_string());
        }
    }
    out
}

fn ensure_hash_dir() -> Result<PathBuf> {
    let dir = get_hash_dir()?;
    fs::create_dir_all(&dir).map_err(|e| Error::io_with_path(e, &dir))?;
    Ok(dir)
}

fn mount(wad_path: &Path) -> Result<Wad> {
    let bytes = fs::read(wad_path).map_err(|e| Error::io_with_path(e, wad_path))?;
    Wad::from_reader(&mut Cursor::new(bytes)).map_err(|e| Error::Wad {
        message: format!("Failed to parse WAD: {}", e),
        path: Some(wad_path.to_path_buf()),
    })
}

// ── extract-hashes ──────────────────────────────────────────────────────────

/// Scan every chunk of `wad_path` and merge discovered asset-path (xxh64) and
/// SKN-range (fnv1a) hashes into the extracted-hash text files. Returns the
/// number of game + bin hashes now present.
pub fn extract_hashes(wad_path: &Path) -> Result<(usize, usize)> {
    let hash_dir = ensure_hash_dir()?;
    let wad = mount(wad_path)?;

    let mut game_hashes: BTreeMap<u64, String> = BTreeMap::new();
    let mut bin_hashes: BTreeMap<u32, String> = BTreeMap::new();

    for chunk in &wad.chunks {
        let Ok(data) = wad.chunk_data(chunk) else {
            continue;
        };
        for (k, v) in scan_wad_game_hashes(&data) {
            game_hashes.entry(k).or_insert(v);
        }
        for (k, v) in scan_skn_bin_hashes(&data) {
            bin_hashes.entry(k).or_insert(v);
        }
    }

    // Merge game hashes into hashes.extracted.txt (sorted by path).
    let game_path = hash_dir.join("hashes.extracted.txt");
    let mut merged_game = parse_hash_text_file(&game_path, 16);
    for (k, v) in game_hashes {
        merged_game.entry(k).or_insert(v);
    }
    let mut game_pairs: Vec<_> = merged_game.into_iter().collect();
    game_pairs.sort_by(|a, b| a.1.cmp(&b.1));
    let game_count = game_pairs.len();
    let mut game_out = String::new();
    for (k, v) in game_pairs {
        game_out.push_str(&format!("{:016x} {}\n", k, v));
    }
    fs::write(&game_path, game_out).map_err(|e| Error::io_with_path(e, &game_path))?;

    // Merge bin hashes into hashes.binhashes.extracted.txt.
    let mut bin_count = 0usize;
    if !bin_hashes.is_empty() {
        let bin_path = hash_dir.join("hashes.binhashes.extracted.txt");
        let mut merged_bin: BTreeMap<u32, String> = BTreeMap::new();
        if let Ok(content) = fs::read_to_string(&bin_path) {
            for line in content.lines() {
                if let Some((h, p)) = line.split_once(' ') {
                    if let Ok(v) = u32::from_str_radix(h.trim_start_matches("0x"), 16) {
                        merged_bin.entry(v).or_insert_with(|| p.to_string());
                    }
                }
            }
        }
        for (k, v) in bin_hashes {
            merged_bin.entry(k).or_insert(v);
        }
        bin_count = merged_bin.len();
        let mut out = String::new();
        for (k, v) in merged_bin {
            out.push_str(&format!("{:08x} {}\n", k, v));
        }
        fs::write(&bin_path, out).map_err(|e| Error::io_with_path(e, &bin_path))?;
    }

    Ok((game_count, bin_count))
}

// ── unpack ──────────────────────────────────────────────────────────────────

/// Unpack every chunk of `wad_path` to disk, resolving hashes to real paths
/// via the WAD LMDB and `hashes.extracted.txt`. Unresolved / too-long / clashing
/// paths fall back to a flat `<hash>.<ext>` name recorded in `hashed_files.json`.
pub fn unpack(wad_path: &Path, output_dir: Option<&Path>) -> Result<WadExtractResult> {
    let out_dir = output_dir
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| default_unpack_output(wad_path));
    fs::create_dir_all(&out_dir).map_err(|e| Error::io_with_path(e, &out_dir))?;

    let hash_dir = get_hash_dir()?;
    let extracted_resolver = parse_hash_text_file(&hash_dir.join("hashes.extracted.txt"), 16);

    let wad = mount(wad_path)?;

    // Bulk-resolve all chunk hashes through the WAD LMDB up front.
    let all_hashes: Vec<u64> = wad.chunks.iter().map(|c| c.path_hash).collect();
    let lmdb_resolved = match get_wad_env(&hash_dir.to_string_lossy()) {
        Some(env) => resolve_hashes_lmdb_bulk(&all_hashes, &env),
        None => Default::default(),
    };

    let resolve = |path_hash: u64| -> String {
        if let Some(v) = extracted_resolver.get(&path_hash) {
            return v.clone();
        }
        if let Some(v) = lmdb_resolved.get(&path_hash) {
            return v.to_string();
        }
        format!("{:016x}", path_hash)
    };

    let mut result = WadExtractResult::default();
    let mut hashed_files: HashMap<String, String> = HashMap::new();

    for chunk in &wad.chunks {
        let path_hash = chunk.path_hash;
        let resolved = resolve(path_hash);
        let mut rel = normalize_rel_path(&resolved);
        if !is_safe_relative_path(&rel) {
            result.skipped += 1;
            continue;
        }

        let mut out_path = out_dir.join(&rel);
        let mut hashed_name: Option<String> = None;
        let file_name = out_path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();

        // Fall back to a flat hash name if the name is too long or a directory
        // already occupies the target path.
        let should_hash = file_name.len() > 255 || (out_path.exists() && out_path.is_dir());
        if should_hash {
            let ext = Path::new(&rel)
                .extension()
                .map(|e| format!(".{}", e.to_string_lossy()))
                .unwrap_or_default();
            let basename = format!("{:016x}{}", path_hash, ext);
            hashed_files.insert(basename.clone(), resolved.clone());
            hashed_name = Some(basename.clone());
            rel = basename;
            out_path = out_dir.join(&rel);
        }

        let Some(parent) = out_path.parent() else {
            result.skipped += 1;
            continue;
        };
        if fs::create_dir_all(parent).is_err() {
            result.skipped += 1;
            continue;
        }

        let data = match wad.chunk_data(chunk) {
            Ok(d) => d,
            Err(_) => {
                result.skipped += 1;
                continue;
            }
        };

        // Assign an extension from the file magic when the resolved name had none.
        let mut final_path = out_path.clone();
        if final_path.extension().is_none() {
            if let Some(ext) = file_kind_ext(detect(&data)) {
                final_path.set_extension(ext);
                if let Some(old) = hashed_name {
                    let new_name = final_path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| old.clone());
                    if new_name != old {
                        if let Some(orig) = hashed_files.remove(&old) {
                            hashed_files.insert(new_name, orig);
                        }
                    }
                }
            }
        }

        if fs::write(&final_path, &data).is_ok() {
            result.extracted += 1;
        } else {
            result.skipped += 1;
        }
    }

    result.hashed_named = hashed_files.len();
    if !hashed_files.is_empty() {
        let json_path = out_dir.join("hashed_files.json");
        let mut merged: HashMap<String, String> = HashMap::new();
        if let Ok(content) = fs::read_to_string(&json_path) {
            if let Ok(parsed) = serde_json::from_str::<HashMap<String, String>>(&content) {
                merged = parsed;
            }
        }
        for (k, v) in hashed_files {
            merged.insert(k, v);
        }
        let text = serde_json::to_string_pretty(&merged)
            .map_err(|e| Error::InvalidInput(format!("Failed to encode hashed_files.json: {}", e)))?;
        fs::write(&json_path, text).map_err(|e| Error::io_with_path(e, &json_path))?;
    }

    Ok(result)
}

/// [`extract_hashes`] then [`unpack`].
pub fn extract_and_unpack(wad_path: &Path, output_dir: Option<&Path>) -> Result<WadExtractResult> {
    extract_hashes(wad_path)?;
    unpack(wad_path, output_dir)
}

// ── pack ────────────────────────────────────────────────────────────────────

/// Pack a folder into a `.wad.client`. Files named as 16-hex stems keep their
/// hash; everything else is hashed by its relative path (xxh64, lowercased).
/// `hashed_files.json` is excluded from the archive.
pub fn pack_dir_to_wad(input_dir: &Path, output_wad: Option<&Path>) -> Result<usize> {
    if !input_dir.is_dir() {
        return Err(Error::InvalidInput(format!(
            "Input is not a folder: {}",
            input_dir.display()
        )));
    }
    let out_path = output_wad
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| default_pack_output(input_dir));
    if let Some(parent) = out_path.parent() {
        fs::create_dir_all(parent).map_err(|e| Error::io_with_path(e, parent))?;
    }

    // Collect (path_hash, file) for every file, skipping hashed_files.json.
    let mut files: Vec<(u64, PathBuf)> = Vec::new();
    let mut stack = vec![input_dir.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = fs::read_dir(&dir).map_err(|e| Error::io_with_path(e, &dir))?;
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                stack.push(p);
                continue;
            }
            if p.file_name().map(|n| n == "hashed_files.json").unwrap_or(false) {
                continue;
            }
            let rel = p
                .strip_prefix(input_dir)
                .map_err(|e| Error::InvalidInput(format!("relative path failed: {}", e)))?
                .to_string_lossy()
                .replace('\\', "/");
            let hash = parse_hex_name_from_root(&rel).unwrap_or_else(|| xxh64(&rel.to_ascii_lowercase()));
            files.push((hash, p));
        }
    }

    if files.is_empty() {
        return Err(Error::InvalidInput(format!("No files found in {}", input_dir.display())));
    }
    files.sort_by_key(|(h, _)| *h);

    // First-wins on duplicate hashes. Buffer bytes because the builder's
    // provider closure is invoked more than once and must be reproducible.
    let mut index: HashMap<u64, Vec<u8>> = HashMap::new();
    let mut builder = WadBuilder::new();
    for (hash, path) in files {
        if index.contains_key(&hash) {
            continue;
        }
        let data = fs::read(&path).map_err(|e| Error::io_with_path(e, &path))?;
        index.insert(hash, data);
        builder.add_chunk_hash(hash);
    }
    let total_chunks = index.len();

    let bytes = builder
        .build_to_bytes(|path_hash, out: &mut dyn Write| {
            let data = index.get(&path_hash).expect("chunk hash was registered");
            out.write_all(data).map_err(|e| {
                ritoshark::wad::Error::Io(std::io::Error::new(std::io::ErrorKind::Other, e).into())
            })
        })
        .map_err(|e| Error::Wad {
            message: format!("Failed to build WAD: {}", e),
            path: Some(out_path.clone()),
        })?;

    fs::write(&out_path, bytes).map_err(|e| Error::io_with_path(e, &out_path))?;
    Ok(total_chunks)
}
