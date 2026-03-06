use std::cell::Cell;
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use heed::types::{Bytes, Str};
use heed::{Database, EnvOpenOptions};
use ltk_file::LeagueFileKind;
use ltk_wad::{Wad, WadBuilder, WadChunkBuilder};

fn normalize_rel_path(v: &str) -> String {
    v.replace('\\', "/").trim_start_matches('/').to_string()
}

fn is_safe_relative_path(path: &str) -> bool {
    let p = Path::new(path);
    if p.is_absolute() {
        return false;
    }
    for comp in p.components() {
        use std::path::Component;
        match comp {
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return false,
            _ => {}
        }
    }
    true
}

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

fn load_extracted_hashes(hash_dir: &Path) -> HashMap<u64, String> {
    parse_hash_text_file(&hash_dir.join("hashes.extracted.txt"), 16)
}

fn parse_hash_entries(path: &Path, hash_len: usize) -> Vec<([u8; 8], String)> {
    let mut out = Vec::new();
    let Ok(content) = fs::read_to_string(path) else {
        return out;
    };
    for line in content.lines() {
        let l = line.trim();
        if l.is_empty() || l.starts_with('#') || l.len() <= hash_len + 1 {
            continue;
        }
        let h = &l[..hash_len];
        let p = l[hash_len + 1..].trim_end_matches('\r');
        if let Ok(v) = u64::from_str_radix(h, 16) {
            out.push((v.to_be_bytes(), p.to_string()));
        }
    }
    out
}

fn lmdb_dir(hash_dir: &Path) -> PathBuf {
    hash_dir.join("hashes.lmdb")
}

fn build_hash_db(hash_dir: &Path) -> Result<(), String> {
    let db_dir = lmdb_dir(hash_dir);
    let sources: &[(&str, usize)] = &[
        ("hashes.game.txt", 16),
        ("hashes.lcu.txt", 16),
        ("hashes.extracted.txt", 16),
    ];

    let db_mtime: Option<SystemTime> = fs::metadata(db_dir.join("data.mdb"))
        .and_then(|m| m.modified())
        .ok();

    let needs_rebuild = !db_dir.exists()
        || sources.iter().any(|(name, _)| {
            let source_mtime = fs::metadata(hash_dir.join(name))
                .and_then(|m| m.modified())
                .ok();
            match (db_mtime, source_mtime) {
                (Some(db), Some(src)) => src > db,
                (None, Some(_)) => true,
                _ => false,
            }
        });

    if !needs_rebuild {
        return Ok(());
    }

    if db_dir.exists() {
        fs::remove_dir_all(&db_dir)
            .map_err(|e| format!("Failed to remove {}: {}", db_dir.display(), e))?;
    }
    fs::create_dir_all(&db_dir)
        .map_err(|e| format!("Failed to create {}: {}", db_dir.display(), e))?;

    let env = unsafe {
        EnvOpenOptions::new()
            .map_size(512 * 1024 * 1024)
            .max_dbs(1)
            .open(&db_dir)
    }
    .map_err(|e| format!("Failed to open LMDB {}: {}", db_dir.display(), e))?;

    let mut wtxn = env
        .write_txn()
        .map_err(|e| format!("Failed to start LMDB write transaction: {}", e))?;
    let db: Database<Bytes, Str> = env
        .create_database(&mut wtxn, None)
        .map_err(|e| format!("Failed to create LMDB database: {}", e))?;

    let mut entries: Vec<([u8; 8], String)> = Vec::with_capacity(2_000_000);
    for (name, hash_len) in sources {
        entries.extend(parse_hash_entries(&hash_dir.join(name), *hash_len));
    }
    entries.sort_unstable_by_key(|(k, _)| *k);
    entries.dedup_by_key(|(k, _)| *k);

    for (key, value) in &entries {
        db.put(&mut wtxn, key.as_slice(), value.as_str())
            .map_err(|e| format!("Failed LMDB put: {}", e))?;
    }

    wtxn.commit()
        .map_err(|e| format!("Failed LMDB commit: {}", e))?;
    eprintln!("[WAD] LMDB rebuilt: {} entries", entries.len());
    Ok(())
}

fn open_hash_db(hash_dir: &Path) -> Result<heed::Env, String> {
    let db_dir = lmdb_dir(hash_dir);
    if !db_dir.exists() {
        return Err(format!(
            "LMDB not found at {} (build failed or hash sources missing)",
            db_dir.display()
        ));
    }
    unsafe {
        EnvOpenOptions::new()
            .map_size(512 * 1024 * 1024)
            .max_dbs(1)
            .open(&db_dir)
    }
    .map_err(|e| format!("Failed to open LMDB {}: {}", db_dir.display(), e))
}

fn default_unpack_output(wad_path: &Path) -> PathBuf {
    let parent = wad_path.parent().unwrap_or_else(|| Path::new("."));
    let name = wad_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("wad");
    let lower = name.to_ascii_lowercase();
    let folder_name = if lower.ends_with(".wad.client") {
        // Match LtMAO behavior: Champion.wad.client -> Champion.wad
        format!("{}.wad", &name[..name.len() - ".wad.client".len()])
    } else if lower.ends_with(".wad") {
        // Keep .wad for already-converted names when possible.
        name.to_string()
    } else {
        name.to_string()
    };
    let preferred = parent.join(&folder_name);

    // If preferred points to the source file path itself (common for *.wad input),
    // pick a deterministic sibling directory instead.
    if preferred == wad_path {
        return parent.join(format!("{}.unpacked", folder_name));
    }

    preferred
}

pub fn default_pack_output(input_dir: &Path) -> PathBuf {
    let parent = input_dir.parent().unwrap_or_else(|| Path::new("."));
    let name = input_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("output")
        .to_string();
    if name.to_ascii_lowercase().ends_with(".wad") {
        parent.join(format!("{}.client", name))
    } else if name.to_ascii_lowercase().ends_with(".wad.client") {
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

const PATH_PREFIXES: &[&[u8]] = &[
    b"assets/",
    b"data/",
    b"maps/",
    b"levels/",
    b"clientstates/",
    b"ux/",
    b"uiautoatlas/",
];

fn xxhash_path(s: &str) -> u64 {
    xxhash_rust::xxh64::xxh64(s.as_bytes(), 0)
}

fn fnv1a_lower(s: &str) -> u32 {
    let mut h: u32 = 0x811c9dc5;
    for b in s.bytes().map(|b| b.to_ascii_lowercase()) {
        h ^= b as u32;
        h = h.wrapping_mul(0x01000193);
    }
    h
}

fn scan_bin_game_hashes(data: &[u8]) -> Vec<(u64, String)> {
    if data.len() < 4 {
        return vec![];
    }
    if &data[..4] != b"PROP" && &data[..4] != b"PTCH" {
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
                        results.push((xxhash_path(&lower), lower.clone()));
                        if lower.ends_with(".dds") {
                            let slash = lower.rfind('/').map(|i| i + 1).unwrap_or(0);
                            let dir = &lower[..slash];
                            let fname = &lower[slash..];
                            let v2x = format!("{}2x_{}", dir, fname);
                            let v4x = format!("{}4x_{}", dir, fname);
                            results.push((xxhash_path(&v2x), v2x));
                            results.push((xxhash_path(&v4x), v4x));
                        }
                        if lower.ends_with(".bin") {
                            let py = format!("{}.py", &lower[..lower.len() - 4]);
                            results.push((xxhash_path(&py), py));
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

fn scan_skn_bin_hashes(data: &[u8]) -> Vec<(u32, String)> {
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
                results.push((fnv1a_lower(name), name.to_string()));
            }
        }
        pos += 80;
    }
    results
}

pub fn extract_hashes(wad_path: &Path, hash_dir: &Path) -> Result<(), String> {
    eprintln!("[WAD] Extracting hashes from {}", wad_path.display());
    eprintln!("[WAD] Hash output dir: {}", hash_dir.display());
    fs::create_dir_all(hash_dir)
        .map_err(|e| format!("Failed to create hash dir {}: {}", hash_dir.display(), e))?;

    let file = fs::File::open(wad_path)
        .map_err(|e| format!("Failed to open {}: {}", wad_path.display(), e))?;
    let mut wad = Wad::mount(file).map_err(|e| format!("Failed to mount wad: {}", e))?;

    let chunks: Vec<_> = wad.chunks().iter().copied().collect();
    let mut game_hashes: BTreeMap<u64, String> = BTreeMap::new();
    let mut bin_hashes: BTreeMap<u32, String> = BTreeMap::new();

    let total_chunks = chunks.len();
    let mut next_progress_step = 1usize;
    let mut decompress_fail_count = 0u32;
    for (idx, chunk) in chunks.into_iter().enumerate() {
        let Ok(data) = wad.load_chunk_decompressed(&chunk) else {
            decompress_fail_count += 1;
            continue;
        };
        for (k, v) in scan_bin_game_hashes(&data) {
            game_hashes.entry(k).or_insert(v);
        }
        for (k, v) in scan_skn_bin_hashes(&data) {
            bin_hashes.entry(k).or_insert(v);
        }
        if total_chunks > 0 {
            let pct = ((idx + 1) * 100) / total_chunks;
            while next_progress_step <= 100 && pct >= next_progress_step {
                eprintln!(
                    "[HASH] Progress {:>3}% ({}/{})",
                    next_progress_step,
                    idx + 1,
                    total_chunks
                );
                next_progress_step += 1;
            }
        }
    }

    let game_path = hash_dir.join("hashes.extracted.txt");
    let mut merged_game = parse_hash_text_file(&game_path, 16);
    for (k, v) in game_hashes {
        merged_game.entry(k).or_insert(v);
    }
    let mut game_pairs: Vec<_> = merged_game.into_iter().collect();
    game_pairs.sort_by(|a, b| a.1.cmp(&b.1));
    let mut game_out = String::new();
    for (k, v) in game_pairs {
        game_out.push_str(&format!("{:016x} {}\n", k, v));
    }
    fs::write(&game_path, game_out)
        .map_err(|e| format!("Failed to write {}: {}", game_path.display(), e))?;

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
        let mut out = String::new();
        for (k, v) in merged_bin {
            out.push_str(&format!("{:08x} {}\n", k, v));
        }
        fs::write(&bin_path, out)
            .map_err(|e| format!("Failed to write {}: {}", bin_path.display(), e))?;
    }

    eprintln!(
        "[OK] Extracted/updated hash files in {} (game hashes: {}, bin hashes: {}, decompress_failures: {})",
        hash_dir.display(),
        parse_hash_text_file(&hash_dir.join("hashes.extracted.txt"), 16).len(),
        if hash_dir.join("hashes.binhashes.extracted.txt").exists() {
            fs::read_to_string(hash_dir.join("hashes.binhashes.extracted.txt"))
                .ok()
                .map(|t| t.lines().filter(|l| !l.trim().is_empty()).count())
                .unwrap_or(0)
        } else {
            0
        },
        decompress_fail_count
    );
    Ok(())
}

pub fn unpack(wad_path: &Path, output_dir: Option<&Path>, hash_dir: Option<&Path>) -> Result<(), String> {
    eprintln!("[WAD] Unpacking {}", wad_path.display());
    let out_dir = output_dir
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| default_unpack_output(wad_path));
    eprintln!("[WAD] Output dir: {}", out_dir.display());
    fs::create_dir_all(&out_dir)
        .map_err(|e| format!("Failed to create output dir {}: {}", out_dir.display(), e))?;

    let hash_dir = hash_dir.ok_or_else(|| {
        "Hash directory is required for LMDB unpack (expected %APPDATA%/FrogTools/hashes/)".to_string()
    })?;
    let env = match open_hash_db(hash_dir) {
        Ok(env) => env,
        Err(_) => {
            eprintln!("[WAD] LMDB missing; building initial DB...");
            build_hash_db(hash_dir)?;
            open_hash_db(hash_dir)?
        }
    };
    let extracted_resolver = load_extracted_hashes(hash_dir);
    let rtxn = env
        .read_txn()
        .map_err(|e| format!("Failed to start LMDB read transaction: {}", e))?;
    let db: Database<Bytes, Str> = env
        .open_database(&rtxn, None)
        .map_err(|e| format!("Failed to open LMDB database: {}", e))?
        .ok_or_else(|| "LMDB database missing".to_string())?;

    let file = fs::File::open(wad_path)
        .map_err(|e| format!("Failed to open {}: {}", wad_path.display(), e))?;
    let mut wad = Wad::mount(file).map_err(|e| format!("Failed to mount wad: {}", e))?;

    let chunks: Vec<_> = wad.chunks().iter().copied().collect();
    let total_chunks = chunks.len();
    eprintln!("[WAD] Total chunks: {}", total_chunks);
    let mut next_progress_step = 1usize;
    let mut extracted = 0u32;
    let mut skipped = 0u32;
    let mut skip_unsafe_path = 0u32;
    let mut skip_invalid_parent = 0u32;
    let mut skip_decompress_failed = 0u32;
    let mut skip_write_failed = 0u32;
    let mut hashed_files: HashMap<String, String> = HashMap::new();

    for (idx, chunk) in chunks.into_iter().enumerate() {
        let path_hash = chunk.path_hash();
        let resolved = if let Some(v) = extracted_resolver.get(&path_hash) {
            v.clone()
        } else {
            let key = path_hash.to_be_bytes();
            db.get(&rtxn, key.as_slice())
                .map_err(|e| format!("LMDB lookup failed for {:016x}: {}", path_hash, e))?
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("{:016x}", path_hash))
        };
        let mut rel = normalize_rel_path(&resolved);
        if !is_safe_relative_path(&rel) {
            skipped += 1;
            skip_unsafe_path += 1;
            continue;
        }

        let mut out_path = out_dir.join(&rel);
        let mut hashed_name: Option<String> = None;
        let file_name = out_path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();

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
            skipped += 1;
            skip_invalid_parent += 1;
            continue;
        };
        if let Err(e) = fs::create_dir_all(parent) {
            return Err(format!("Failed to create dir {}: {}", parent.display(), e));
        }

        match wad.load_chunk_decompressed(&chunk) {
            Ok(data) => {
                let mut final_path = out_path.clone();
                if final_path.extension().is_none() {
                    if let Some(ext) = LeagueFileKind::identify_from_bytes_with_offset(&data, 64).extension() {
                        final_path.set_extension(ext);
                        if let Some(old) = hashed_name {
                            let new_name = final_path
                                .file_name()
                                .map(|n| n.to_string_lossy().to_string())
                                .unwrap_or(old.clone());
                            if new_name != old {
                                if let Some(orig) = hashed_files.remove(&old) {
                                    hashed_files.insert(new_name, orig);
                                }
                            }
                        }
                    }
                }
                if fs::write(&final_path, &data).is_ok() {
                    extracted += 1;
                } else {
                    skipped += 1;
                    skip_write_failed += 1;
                }
            }
            Err(_) => {
                skipped += 1
                ;
                skip_decompress_failed += 1;
            }
        }

        if total_chunks > 0 {
            let pct = ((idx + 1) * 100) / total_chunks;
            while next_progress_step <= 100 && pct >= next_progress_step {
                eprintln!(
                    "[WAD] Progress {:>3}% ({}/{}) extracted={} skipped={}",
                    next_progress_step,
                    idx + 1,
                    total_chunks,
                    extracted,
                    skipped
                );
                next_progress_step += 1;
            }
        }
    }

    let hashed_name_count = hashed_files.len();
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
            .map_err(|e| format!("Failed to encode {}: {}", json_path.display(), e))?;
        fs::write(&json_path, text)
            .map_err(|e| format!("Failed to write {}: {}", json_path.display(), e))?;
    }

    eprintln!(
        "[OK] Unpack complete: extracted={}, skipped={} (unsafe_path={}, invalid_parent={}, decompress_failed={}, write_failed={}), hashed_name_map={}, out={}",
        extracted,
        skipped,
        skip_unsafe_path,
        skip_invalid_parent,
        skip_decompress_failed,
        skip_write_failed,
        hashed_name_count,
        out_dir.display()
    );
    Ok(())
}

pub fn extract_and_unpack(wad_path: &Path, output_dir: Option<&Path>, hash_dir: &Path) -> Result<(), String> {
    eprintln!("[WAD] Phase 1/2: extract hashes");
    extract_hashes(wad_path, hash_dir)?;
    eprintln!("[WAD] Phase 2/2: unpack");
    unpack(wad_path, output_dir, Some(hash_dir))
}

pub fn pack_dir_to_wad(input_dir: &Path, output_wad: Option<&Path>) -> Result<(), String> {
    if !input_dir.is_dir() {
        return Err(format!("Input is not a folder: {}", input_dir.display()));
    }

    let out_path = output_wad
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| default_pack_output(input_dir));
    let out_parent = out_path.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(out_parent)
        .map_err(|e| format!("Failed to create {}: {}", out_parent.display(), e))?;

    eprintln!("[WAD] Packing folder {}", input_dir.display());

    let mut files: Vec<(u64, PathBuf)> = Vec::new();

    let mut stack = vec![input_dir.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = fs::read_dir(&dir)
            .map_err(|e| format!("Failed to read directory {}: {}", dir.display(), e))?;
        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
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
                .map_err(|e| format!("Failed to build relative path for {}: {}", p.display(), e))?
                .to_string_lossy()
                .replace('\\', "/");

            let hash = if let Some(v) = parse_hex_name_from_root(&rel) {
                v
            } else {
                xxhash_path(&rel.to_ascii_lowercase())
            };
            files.push((hash, p));
        }
    }

    if files.is_empty() {
        return Err(format!("No files found in {}", input_dir.display()));
    }

    files.sort_by_key(|(h, _)| *h);

    let mut index: HashMap<u64, PathBuf> = HashMap::new();
    let mut builder = WadBuilder::default();
    let mut duplicate_hashes = 0usize;
    for (hash, path) in files {
        if index.contains_key(&hash) {
            eprintln!("Warning: duplicate chunk hash {:016x} (keeping first)", hash);
            duplicate_hashes += 1;
            continue;
        }
        index.insert(hash, path);
        builder = builder.with_chunk(WadChunkBuilder::default().with_path_hash(hash));
    }

    let total_chunks = index.len();
    eprintln!(
        "[WAD] Pack prep: chunks={} duplicates_skipped={}",
        total_chunks, duplicate_hashes
    );

    let mut out_file = fs::File::create(&out_path)
        .map_err(|e| format!("Failed to create {}: {}", out_path.display(), e))?;

    let written = Cell::new(0usize);
    let next_progress_step = Cell::new(1usize);
    builder
        .build_to_writer(&mut out_file, |path_hash, cursor: &mut Cursor<Vec<u8>>| {
            let Some(src) = index.get(&path_hash) else {
                return Err(ltk_wad::WadBuilderError::IoError(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    format!("Missing source for chunk {:016x}", path_hash),
                )));
            };
            let data = fs::read(src).map_err(ltk_wad::WadBuilderError::IoError)?;
            cursor.write_all(&data).map_err(ltk_wad::WadBuilderError::IoError)?;

            let current_written = written.get() + 1;
            written.set(current_written);
            if total_chunks > 0 {
                let pct = (current_written * 100) / total_chunks;
                while next_progress_step.get() <= 100 && pct >= next_progress_step.get() {
                    eprintln!(
                        "[WAD] Pack Progress {:>3}% ({}/{})",
                        next_progress_step.get(),
                        current_written,
                        total_chunks
                    );
                    next_progress_step.set(next_progress_step.get() + 1);
                }
            }
            Ok(())
        })
        .map_err(|e| format!("Failed to build WAD {}: {}", out_path.display(), e))?;

    eprintln!("[OK] Packed WAD: {} ({} chunks)", out_path.display(), total_chunks);
    Ok(())
}
