use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

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

const PATH_PREFIXES: &[&[u8]] = &[
    b"assets/",
    b"data/",
    b"maps/",
    b"levels/",
    b"clientstates/",
    b"ux/",
    b"uiautoatlas/",
];

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
                            let slash = lower.rfind('/').map(|v| v + 1).unwrap_or(0);
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

fn scan_one_file(data: &[u8], game_out: &mut BTreeMap<u64, String>, bin_out: &mut BTreeMap<u32, String>) {
    for (k, v) in scan_bin_game_hashes(data) {
        game_out.entry(k).or_insert(v);
    }
    for (k, v) in scan_skn_bin_hashes(data) {
        bin_out.entry(k).or_insert(v);
    }
}

fn write_merged_hashes(
    hash_dir: &Path,
    new_game_hashes: BTreeMap<u64, String>,
    new_bin_hashes: BTreeMap<u32, String>,
) -> Result<bool, String> {
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
        fs::write(&game_path, out)
            .map_err(|e| format!("Failed to write {}: {}", game_path.display(), e))?;
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
        fs::write(&bin_path_out, out)
            .map_err(|e| format!("Failed to write {}: {}", bin_path_out.display(), e))?;
        written_any = true;
    }

    if written_any {
        eprintln!("[OK] Extracted/updated hash files in {}", hash_dir.display());
    }
    Ok(written_any)
}

pub fn extract_hashes(bin_path: &Path, hash_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(hash_dir)
        .map_err(|e| format!("Failed to create hash dir {}: {}", hash_dir.display(), e))?;

    let data = fs::read(bin_path)
        .map_err(|e| format!("Failed to read {}: {}", bin_path.display(), e))?;

    let mut game_hashes: BTreeMap<u64, String> = BTreeMap::new();
    let mut bin_hashes: BTreeMap<u32, String> = BTreeMap::new();
    scan_one_file(&data, &mut game_hashes, &mut bin_hashes);

    if write_merged_hashes(hash_dir, game_hashes, bin_hashes)? {
        return Ok(());
    }
    eprintln!(
        "[OK] No extractable hashes found in {} (file may not contain supported hash strings)",
        bin_path.display()
    );
    Ok(())
}

pub fn extract_hashes_dir(dir: &Path, hash_dir: &Path) -> Result<(), String> {
    if !dir.is_dir() {
        return Err(format!("Not a folder: {}", dir.display()));
    }
    fs::create_dir_all(hash_dir)
        .map_err(|e| format!("Failed to create hash dir {}: {}", hash_dir.display(), e))?;

    let mut stack = vec![dir.to_path_buf()];
    let mut game_hashes: BTreeMap<u64, String> = BTreeMap::new();
    let mut bin_hashes: BTreeMap<u32, String> = BTreeMap::new();
    let mut scanned = 0usize;

    while let Some(current) = stack.pop() {
        let entries = fs::read_dir(&current)
            .map_err(|e| format!("Failed to read {}: {}", current.display(), e))?;
        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read dir entry: {}", e))?;
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

    let wrote_any = write_merged_hashes(hash_dir, game_hashes, bin_hashes)?;
    if !wrote_any {
        eprintln!(
            "[OK] Scanned {} .bin files in {} but found no extractable hashes",
            scanned,
            dir.display()
        );
    } else {
        eprintln!("[OK] Scanned {} .bin files in {}", scanned, dir.display());
    }
    Ok(())
}
