//! pyntex — "missing files" / "junk files" analyzer for a folder of extracted
//! League assets. 1:1 port of old quartz_cli `pyntex.rs`, retargeted from
//! `ltk_meta`/`ltk_ritobin` onto ritoshark's `Bin`/text serializer.
//!
//! Walks every `.bin` in the folder, collects the game paths it references
//! (`assets/…` / `data/…`) from both the raw string values and the resolved
//! ritobin text, then diffs those references against the files actually on
//! disk. [`check_missing_files`] reports referenced-but-absent paths;
//! [`remove_junk_files`] deletes on-disk files that nothing references (after a
//! full backup + an explicit `yes` confirmation on the console).
//!
//! ltk → ritoshark mapping: `ltk_meta::Bin` + `PropertyValueEnum` walk →
//! `ritoshark::bin::Bin` + `BinValue` walk; `bin.dependencies`→`bin.linked`;
//! `ltk_ritobin::writer::write_with_hashes` (resolved text) →
//! `crate::bin::tree_to_text_cached` (uses the cached bin-hash LMDB mapper).

use crate::bin::{read_bin, tree_to_text_cached};
use crate::error::{Error, Result};
use ritoshark::bin::BinValue;
use ritoshark::hash::xxh64;
use std::collections::{BTreeSet, HashMap, HashSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

fn normalize_rel_path(p: &str) -> String {
    p.replace('\\', "/")
        .trim_start_matches('/')
        .to_ascii_lowercase()
}

fn is_probable_game_path(path: &str) -> bool {
    let p = path.trim_start_matches('/');
    p.starts_with("assets/") || p.starts_with("data/")
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

/// Hash a relative path the way the WAD does, except a bare 16-hex filename is
/// taken as its own hash (unpacked hash-named files).
fn unified_hash(path: &str) -> u64 {
    parse_hex_stem(path).unwrap_or_else(|| xxh64(path))
}

/// Add a normalized game path (and, for `.dds`, its `2x_`/`4x_` variants) to
/// the mention set.
fn add_mention(normalized: String, out: &mut HashSet<String>) {
    if !is_probable_game_path(&normalized) {
        return;
    }
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
    out.insert(normalized);
}

/// Recursively collect literal string game-paths from a `BinValue` tree.
/// (Hash/File/Link values resolve to paths only via the text pass below.)
fn collect_mentions_from_value(value: &BinValue, out: &mut HashSet<String>) {
    match value {
        BinValue::String(s) => add_mention(normalize_rel_path(s), out),
        BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => {
            for v in fields.values() {
                collect_mentions_from_value(v, out);
            }
        }
        BinValue::List { items, .. } => {
            for item in items {
                collect_mentions_from_value(item, out);
            }
        }
        BinValue::Option {
            value: Some(inner), ..
        } => collect_mentions_from_value(inner, out),
        BinValue::Map { entries, .. } => {
            for (k, v) in entries {
                collect_mentions_from_value(k, out);
                collect_mentions_from_value(v, out);
            }
        }
        _ => {}
    }
}

/// Scan quoted strings out of ritobin text and keep the game paths.
fn collect_mentions_from_resolved_text(text: &str, out: &mut HashSet<String>) {
    let bytes = text.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'"' {
            let start = i + 1;
            i += 1;
            while i < bytes.len() && bytes[i] != b'"' {
                i += 1;
            }
            if start <= text.len() && i <= text.len() {
                add_mention(normalize_rel_path(&text[start..i]), out);
            }
        }
        i += 1;
    }
}

fn collect_mentions_from_bin(bin_path: &Path) -> Result<HashSet<String>> {
    let data = fs::read(bin_path).map_err(|e| Error::io_with_path(e, bin_path))?;
    let bin = read_bin(&data).map_err(|e| {
        Error::InvalidInput(format!("Failed to parse {}: {}", bin_path.display(), e))
    })?;

    let mut mentions = HashSet::new();
    for dep in &bin.linked {
        let normalized = normalize_rel_path(dep);
        if is_probable_game_path(&normalized) {
            mentions.insert(normalized);
        }
    }
    for entry in &bin.entries {
        for v in entry.fields.values() {
            collect_mentions_from_value(v, &mut mentions);
        }
    }

    // Recover hash-resolved string paths via the cached bin-hash mapper.
    if let Ok(resolved_text) = tree_to_text_cached(&bin) {
        collect_mentions_from_resolved_text(&resolved_text, &mut mentions);
    }

    Ok(mentions)
}

fn walk_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<()> {
    let entries = fs::read_dir(dir).map_err(|e| Error::io_with_path(e, dir))?;
    for entry in entries {
        let entry = entry.map_err(|e| Error::InvalidInput(format!("dir entry: {}", e)))?;
        let p = entry.path();
        if p.is_dir() {
            walk_files(&p, out)?;
        } else if p.is_file() {
            out.push(p);
        }
    }
    Ok(())
}

/// Analyze `dir`, returning `(junk, missing)`: files on disk nothing
/// references, and referenced paths not present on disk.
fn analyze_dir(dir: &Path) -> Result<(Vec<String>, Vec<String>)> {
    if !dir.is_dir() {
        return Err(Error::InvalidInput(format!(
            "Not a folder: {}",
            dir.display()
        )));
    }

    let mut full_files = Vec::new();
    walk_files(dir, &mut full_files)?;
    full_files.sort();

    let mut rel_files = Vec::with_capacity(full_files.len());
    for f in &full_files {
        let rel = f
            .strip_prefix(dir)
            .map_err(|e| Error::InvalidInput(format!("relative path: {}", e)))?;
        rel_files.push(normalize_rel_path(&rel.to_string_lossy()));
    }

    let mut exists_map: HashMap<String, bool> =
        rel_files.iter().cloned().map(|p| (p, true)).collect();

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
        let is_bin = full
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("bin"))
            .unwrap_or(false);
        if !is_bin {
            continue;
        }
        // Never delete source .bin files.
        exists_map.insert(rel.clone(), false);
        let mentions = collect_mentions_from_bin(full)?;
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
    }

    /* Mod metadata is never REFERENCED by a bin, so the rule above would call
       all of it junk and delete it.
       `files.txt` is the one that actually hurts: it is the record of every
       custom path and object name this mod invented, and those exist in no
       dictionary by definition — delete it and a reserialize that drops the
       in-bin trailer makes them unrecoverable. The rest are cheap to keep and
       cost a user real work to lose. */
    for keep in [
        "hashed_files.json",
        "files.txt",
        "missing_files.txt",
        "meta/info.json",
        "readme.txt",
    ] {
        if exists_map.contains_key(keep) {
            exists_map.insert(keep.to_string(), false);
        }
    }

    let junk: Vec<String> = exists_map
        .iter()
        .filter_map(|(k, v)| if *v { Some(k.clone()) } else { None })
        .collect();
    let missing: Vec<String> = missing_unique.into_iter().collect();
    Ok((junk, missing))
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<()> {
    fs::create_dir_all(dst).map_err(|e| Error::io_with_path(e, dst))?;
    let entries = fs::read_dir(src).map_err(|e| Error::io_with_path(e, src))?;
    for entry in entries {
        let entry = entry.map_err(|e| Error::InvalidInput(format!("dir entry: {}", e)))?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if from.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else if from.is_file() {
            fs::copy(&from, &to).map_err(|e| Error::io_with_path(e, &from))?;
        }
    }
    Ok(())
}

/// List every referenced-but-missing path into `missing_files.txt` in the
/// folder. Returns the number of missing references.
pub fn check_missing_files(dir: &Path) -> Result<usize> {
    let (_junk, missing) = analyze_dir(dir)?;
    let report_path = dir.join("missing_files.txt");
    if missing.is_empty() {
        fs::write(&report_path, "# No missing files detected\n")
            .map_err(|e| Error::io_with_path(e, &report_path))?;
        return Ok(0);
    }
    let mut out = String::new();
    for m in &missing {
        out.push_str(m);
        out.push('\n');
    }
    fs::write(&report_path, out).map_err(|e| Error::io_with_path(e, &report_path))?;
    Ok(missing.len())
}

/// Back up the folder, then delete every unreferenced junk file (and empty
/// directories). Prompts for an exact `yes` on the console first. Returns the
/// number of files removed.
pub fn remove_junk_files(dir: &Path) -> Result<usize> {
    let (junk, missing) = analyze_dir(dir)?;

    eprintln!("============================================================");
    eprintln!("{:^60}", "!!! WARNING !!!");
    eprintln!("============================================================");
    eprintln!("Folder: {}", dir.display());
    eprintln!("Junk files to remove: {}", junk.len());
    eprintln!("Missing references detected: {}", missing.len());
    eprintln!("This will permanently delete files from the folder.");
    eprintln!("Type 'yes' (exactly) to continue:");

    let mut confirm = String::new();
    io::stdin()
        .read_line(&mut confirm)
        .map_err(|e| Error::InvalidInput(format!("Failed reading confirmation: {}", e)))?;
    if confirm.trim().to_lowercase() != "yes" {
        return Err(Error::InvalidInput(
            "Aborted by user (did not type 'yes')".to_string(),
        ));
    }

    // Always back up before deleting.
    let folder_name = dir.file_name().and_then(|n| n.to_str()).unwrap_or("folder");
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| Error::InvalidInput(format!("System clock error: {}", e)))?
        .as_millis();
    let parent = dir
        .parent()
        .ok_or_else(|| Error::InvalidInput(format!("Folder has no parent: {}", dir.display())))?;
    let backup_path = parent.join(format!("{}_pyntex_backup_{}", folder_name, ts));
    copy_dir_recursive(dir, &backup_path)?;
    eprintln!("[OK] Backup created: {}", backup_path.display());

    for rel in &junk {
        let full = dir.join(rel);
        if let Err(e) = fs::remove_file(&full) {
            eprintln!(
                "pyntex: warning: could not remove {}: {}",
                full.display(),
                e
            );
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

    Ok(junk.len())
}
