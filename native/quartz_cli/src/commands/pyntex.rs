use std::collections::{BTreeSet, HashMap, HashSet};
use std::fs;
use std::fs::File;
use std::io;
use std::io::BufReader;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use ltk_meta::{property::PropertyValueEnum, Bin};
use ltk_ritobin::hashes::HashMapProvider;
use ltk_ritobin::writer::write_with_hashes;

use crate::hashes::{default_hash_dir, load_bin_hashes};

fn normalize_rel_path(p: &str) -> String {
    p.replace('\\', "/").trim_start_matches('/').to_ascii_lowercase()
}

fn is_probable_game_path(path: &str) -> bool {
    let p = path.trim_start_matches('/');
    p.starts_with("assets/") || p.starts_with("data/")
}

fn xxhash_path(s: &str) -> u64 {
    xxhash_rust::xxh64::xxh64(s.as_bytes(), 0)
}

fn parse_hex_stem(path: &str) -> Option<u64> {
    if path.contains('/') {
        return None;
    }
    let stem = path.split('.').next().unwrap_or(path);
    if stem.len() != 16 || !stem.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    u64::from_str_radix(stem, 16).ok()
}

fn unified_hash(path: &str) -> u64 {
    if let Some(h) = parse_hex_stem(path) {
        h
    } else {
        xxhash_path(path)
    }
}

fn collect_mentions_from_value(value: &PropertyValueEnum, out: &mut HashSet<String>) {
    match value {
        PropertyValueEnum::String(s) => {
            let normalized = normalize_rel_path(&s.value);
            if is_probable_game_path(&normalized) {
                out.insert(normalized.clone());
                if normalized.ends_with(".dds") {
                    if let Some(idx) = normalized.rfind('/') {
                        let dir = &normalized[..=idx];
                        let file = &normalized[idx + 1..];
                        out.insert(format!("{}2x_{}", dir, file));
                        out.insert(format!("{}4x_{}", dir, file));
                    } else {
                        out.insert(format!("2x_{}", normalized));
                        out.insert(format!("4x_{}", normalized));
                    }
                }
            }
        }
        PropertyValueEnum::Struct(v) => {
            for p in v.properties.values() {
                collect_mentions_from_value(&p.value, out);
            }
        }
        PropertyValueEnum::Embedded(v) => {
            for p in v.0.properties.values() {
                collect_mentions_from_value(&p.value, out);
            }
        }
        PropertyValueEnum::Container(v) => {
            for item in v.clone().into_items() {
                collect_mentions_from_value(&item, out);
            }
        }
        PropertyValueEnum::Optional(v) => {
            if let Some(inner) = v.clone().into_inner() {
                collect_mentions_from_value(&inner, out);
            }
        }
        PropertyValueEnum::Map(v) => {
            for (k, val) in v.entries() {
                collect_mentions_from_value(k, out);
                collect_mentions_from_value(val, out);
            }
        }
        _ => {}
    }
}

fn collect_mentions_from_resolved_text(text: &str, out: &mut HashSet<String>) {
    // Scan quoted strings from ritobin output, then keep LtMAO-style paths (assets/data only).
    let bytes = text.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'"' {
            let start = i + 1;
            i += 1;
            while i < bytes.len() && bytes[i] != b'"' {
                i += 1;
            }
            if i <= bytes.len() {
                let s = &text[start..i];
                let normalized = normalize_rel_path(s);
                if is_probable_game_path(&normalized) {
                    out.insert(normalized.clone());
                    if normalized.ends_with(".dds") {
                        if let Some(idx) = normalized.rfind('/') {
                            let dir = &normalized[..=idx];
                            let file = &normalized[idx + 1..];
                            out.insert(format!("{}2x_{}", dir, file));
                            out.insert(format!("{}4x_{}", dir, file));
                        } else {
                            out.insert(format!("2x_{}", normalized));
                            out.insert(format!("4x_{}", normalized));
                        }
                    }
                }
            }
        }
        i += 1;
    }
}

fn collect_mentions_from_bin(bin_path: &Path, hashes: &HashMapProvider) -> Result<HashSet<String>, String> {
    let file = File::open(bin_path)
        .map_err(|e| format!("Failed to open {}: {}", bin_path.display(), e))?;
    let mut reader = BufReader::new(file);
    let bin = Bin::from_reader(&mut reader)
        .map_err(|e| format!("Failed to parse {}: {}", bin_path.display(), e))?;

    let mut mentions = HashSet::new();
    for dep in &bin.dependencies {
        let normalized = normalize_rel_path(dep);
        if is_probable_game_path(&normalized) {
            mentions.insert(normalized);
        }
    }
    for obj in bin.objects.values() {
        for prop in obj.properties.values() {
            collect_mentions_from_value(&prop.value, &mut mentions);
        }
    }

    // LtMAO parity: unhash-like pass using bin hash tables to recover string paths.
    if let Ok(resolved_text) = write_with_hashes(&bin, hashes) {
        collect_mentions_from_resolved_text(&resolved_text, &mut mentions);
    }

    Ok(mentions)
}

fn walk_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = std::fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory {}: {}", dir.display(), e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let p = entry.path();
        if p.is_dir() {
            walk_files(&p, out)?;
        } else if p.is_file() {
            out.push(p);
        }
    }
    Ok(())
}

fn analyze_dir(dir: &Path) -> Result<(Vec<String>, Vec<String>), String> {
    if !dir.is_dir() {
        return Err(format!("Not a folder: {}", dir.display()));
    }

    let hashes = default_hash_dir()
        .map(|d| load_bin_hashes(&d))
        .unwrap_or_else(HashMapProvider::new);

    let mut full_files = Vec::new();
    walk_files(dir, &mut full_files)?;
    full_files.sort();

    let mut rel_files = Vec::with_capacity(full_files.len());
    for f in &full_files {
        let rel = f
            .strip_prefix(dir)
            .map_err(|e| format!("Failed to build relative path for {}: {}", f.display(), e))?;
        rel_files.push(normalize_rel_path(&rel.to_string_lossy()));
    }

    let mut exists_map: HashMap<String, bool> = rel_files
        .iter()
        .cloned()
        .map(|p| (p, true))
        .collect();

    let mut hash_to_rel: HashMap<u64, Vec<String>> = HashMap::new();
    for rel in &rel_files {
        hash_to_rel
            .entry(unified_hash(rel))
            .or_default()
            .push(rel.clone());
    }

    let mut missing_unique: BTreeSet<String> = BTreeSet::new();

    for (idx, full) in full_files.iter().enumerate() {
        let rel = &rel_files[idx];
        if full
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("bin"))
            .unwrap_or(false)
        {
            // Never delete source .bin files in folder mode.
            exists_map.insert(rel.clone(), false);
            match collect_mentions_from_bin(full, &hashes) {
                Ok(mentions) => {
                    for m in mentions {
                        let h = unified_hash(&m);
                        if let Some(paths) = hash_to_rel.get(&h) {
                            for p in paths {
                                exists_map.insert(p.clone(), false);
                            }
                        } else {
                            missing_unique.insert(m);
                        }
                    }
                    eprintln!("pyntex: parsed {}", full.display());
                }
                Err(err) => return Err(err),
            }
        }
    }

    if exists_map.contains_key("hashed_files.json") {
        exists_map.insert("hashed_files.json".to_string(), false);
    }

    let junk: Vec<String> = exists_map
        .iter()
        .filter_map(|(k, v)| if *v { Some(k.clone()) } else { None })
        .collect();

    let missing: Vec<String> = missing_unique.into_iter().collect();
    Ok((junk, missing))
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.is_dir() {
        return Err(format!("Not a folder: {}", src.display()));
    }

    fs::create_dir_all(dst)
        .map_err(|e| format!("Failed creating backup folder {}: {}", dst.display(), e))?;

    let entries = fs::read_dir(src)
        .map_err(|e| format!("Failed reading {}: {}", src.display(), e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed reading directory entry: {}", e))?;
        let from = entry.path();
        let to = dst.join(entry.file_name());

        if from.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else if from.is_file() {
            fs::copy(&from, &to)
                .map_err(|e| format!("Failed copying {} -> {}: {}", from.display(), to.display(), e))?;
        }
    }

    Ok(())
}

pub fn check_missing_files(dir: &Path) -> Result<(), String> {
    let (_junk, missing) = analyze_dir(dir)?;
    let report_path = dir.join("missing_files.txt");
    if missing.is_empty() {
        std::fs::write(&report_path, "# No missing files detected\n")
            .map_err(|e| format!("Failed to write {}: {}", report_path.display(), e))?;
        eprintln!("[OK] No missing files detected. Report: {}", report_path.display());
        return Ok(());
    }

    let mut out = String::new();
    for m in &missing {
        out.push_str(m);
        out.push('\n');
    }
    std::fs::write(&report_path, out)
        .map_err(|e| format!("Failed to write {}: {}", report_path.display(), e))?;
    eprintln!(
        "[OK] Missing files: {}. Report: {}",
        missing.len(),
        report_path.display()
    );
    Ok(())
}

pub fn remove_junk_files(dir: &Path) -> Result<(), String> {
    let (junk, missing) = analyze_dir(dir)?;

    eprintln!("============================================================");
    eprintln!("{:^60}", "!!! WARNING !!!");
    eprintln!("============================================================");
    eprintln!();
    eprintln!("Folder: {}", dir.display());
    eprintln!("Junk files to remove: {}", junk.len());
    eprintln!("Missing references detected: {}", missing.len());
    eprintln!();
    eprintln!("This will permanently delete files from the folder.");
    eprintln!("Type 'yes' (exactly) to continue:");

    let mut confirm = String::new();
    io::stdin()
        .read_line(&mut confirm)
        .map_err(|e| format!("Failed reading confirmation: {}", e))?;
    if confirm.trim().to_lowercase() != "yes" {
        return Err("Aborted by user (did not type 'yes')".to_string());
    }

    // Always create backup before deletion.
    let folder_name = dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("folder");
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("System clock error: {}", e))?
        .as_millis();
    let parent = dir
        .parent()
        .ok_or_else(|| format!("Folder has no parent: {}", dir.display()))?;
    let backup_path = parent.join(format!("{}_pyntex_backup_{}", folder_name, ts));
    copy_dir_recursive(dir, &backup_path)?;
    eprintln!("[OK] Backup created: {}", backup_path.display());

    for rel in &junk {
        let full = dir.join(rel);
        if let Err(e) = fs::remove_file(&full) {
            eprintln!("pyntex: warning: could not remove {}: {}", full.display(), e);
        } else {
            eprintln!("pyntex: removed {}", full.display());
        }
    }

    // Remove empty directories bottom-up.
    let mut dirs = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        dirs.push(d.clone());
        if let Ok(entries) = fs::read_dir(&d) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    stack.push(p);
                }
            }
        }
    }
    dirs.sort_by_key(|d| std::cmp::Reverse(d.components().count()));
    for d in dirs {
        if d == dir {
            continue;
        }
        if let Ok(mut it) = fs::read_dir(&d) {
            if it.next().is_none() {
                let _ = fs::remove_dir(&d);
            }
        }
    }

    eprintln!(
        "[OK] Removed {} junk files in {}",
        junk.len(),
        dir.display()
    );
    eprintln!("Backup: {}", backup_path.display());
    Ok(())
}
