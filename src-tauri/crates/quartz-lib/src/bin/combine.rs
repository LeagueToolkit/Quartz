//! Linked-BIN merge — 1:1 port of the old quartz_cli `combine_vfx`,
//! `combine_anm`, and `combine_linked` commands, retargeted from `ltk_meta`
//! onto ritoshark's `Bin`.
//!
//! All three walk the main BIN's `linked` list, resolve each link to an
//! on-disk sibling `.bin` (by name, by relative path, or by the hashed name
//! recorded in `hashed_files.json` / computed via xxh64), pull matching
//! entries out of the linked file into the main BIN (skipping duplicate path
//! hashes), then delete emptied linked files and prune their links.
//!
//! - `combine_vfx` / `combine_anm` merge only entries whose `class_hash`
//!   matches `VfxSystemDefinitionData` / `AnimationGraphData` respectively, and
//!   only consider links that look like split output (`_vfx` marker for VFX).
//! - `combine_linked` is the catch-all: it merges *every* non-duplicate entry
//!   from each resolved link, with a link-prune rule that keeps champion-base
//!   and non-`.bin` links.
//!
//! ltk → ritoshark mapping: `bin.objects` (map) → `bin.entries` (Vec of
//! `BinEntry`); `obj.class_hash` → `entry.class_hash`; `bin.dependencies` →
//! `bin.linked`.

use crate::bin::ritoshark_bridge::{read_bin, write_bin};
use crate::error::{Error, Result};
use ritoshark::bin::{Bin, BinEntry};
use ritoshark::hash::{fnv1a, xxh64};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

/// Outcome of a merge, for the CLI success message.
#[derive(Debug, Clone, Default)]
pub struct CombineResult {
    /// Entries merged into the main BIN.
    pub merged: usize,
    /// Linked source files deleted (emptied by the merge).
    pub files_deleted: usize,
}

/// What to merge: a single VFX/anm class, or everything.
#[derive(Clone, Copy)]
enum Filter {
    /// Only entries whose class hash equals this.
    Class(u32),
    /// Every entry.
    All,
}

/// Read a BIN off disk, returning a friendly error on failure.
fn read(path: &Path) -> Result<Bin> {
    let data = fs::read(path).map_err(|e| Error::io_with_path(e, path))?;
    read_bin(&data)
        .map_err(|e| Error::InvalidInput(format!("Failed to parse {}: {}", path.display(), e)))
}

fn write(path: &Path, bin: &Bin) -> Result<()> {
    let bytes = write_bin(bin)
        .map_err(|e| Error::InvalidInput(format!("Failed to serialize BIN: {}", e)))?;
    fs::write(path, bytes).map_err(|e| Error::io_with_path(e, path))
}

/// The WAD project root used as the base for engine-relative link paths.
/// Walk up until a `data` folder's parent, else the file's own folder.
pub fn find_root_dir(bin_path: &Path) -> PathBuf {
    let mut cur = bin_path.parent();
    while let Some(dir) = cur {
        let lower = dir
            .file_name()
            .map(|n| n.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        if lower == "data" {
            if let Some(parent) = dir.parent() {
                return parent.to_path_buf();
            }
        }
        cur = dir.parent();
    }
    bin_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."))
}

/// Extract champion name from a path like `/characters/akali/skins/...`.
fn detect_champ_name(path: &Path) -> Option<String> {
    let posix = path.to_string_lossy().replace('\\', "/").to_lowercase();
    let marker = "/characters/";
    let start = posix.find(marker)? + marker.len();
    let rest = &posix[start..];
    let end = rest.find('/')?;
    Some(rest[..end].to_string())
}

/// Load `hashed_files.json` (map of `<hashedName>.bin` → original path) into a
/// reverse map of normalized-original-path → hashed stem.
fn load_path_to_hash(root_dir: &Path) -> HashMap<String, String> {
    let mut path_to_hash = HashMap::new();
    let json_path = root_dir.join("hashed_files.json");
    if let Ok(content) = fs::read_to_string(&json_path) {
        if let Ok(data) = serde_json::from_str::<HashMap<String, String>>(&content) {
            for (hashed_name, orig_path) in &data {
                let h = hashed_name.replace(".bin", "").to_lowercase();
                let p = orig_path.to_lowercase().replace('\\', "/");
                path_to_hash.insert(p, h);
            }
        }
    }
    path_to_hash
}

/// Resolve the main BIN's links to real sibling files on disk.
///
/// Returns `(resolved_file, original_link)` pairs, de-duplicated by canonical
/// path, skipping the champion-base BIN and the main BIN itself. When
/// `vfx_marker_only` is set (VFX combine), links without a `_vfx` marker in
/// their filename are ignored so the generic combine-linked stays the
/// catch-all merger.
fn resolve_links(
    main_bin: &Bin,
    main_bin_path: &Path,
    root_dir: &Path,
    vfx_marker_only: bool,
) -> Vec<(PathBuf, String)> {
    let path_to_hash = load_path_to_hash(root_dir);
    let champ_name = detect_champ_name(main_bin_path);

    let is_base_bin = |p: &Path| -> bool {
        champ_name
            .as_ref()
            .map(|champ| {
                p.file_name()
                    .map(|n| n.to_string_lossy().to_lowercase() == format!("{}.bin", champ))
                    .unwrap_or(false)
            })
            .unwrap_or(false)
    };
    let is_main_bin =
        |p: &Path| -> bool { p.canonicalize().ok() == main_bin_path.canonicalize().ok() };

    let mut out: Vec<(PathBuf, String)> = Vec::new();
    let mut processed: HashSet<PathBuf> = HashSet::new();

    for link in &main_bin.linked {
        if !link.to_lowercase().ends_with(".bin") {
            continue;
        }
        let link_name = Path::new(link)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        if vfx_marker_only && !link_name.to_ascii_lowercase().contains("_vfx") {
            continue;
        }
        let normalized_link = link.to_lowercase().replace('\\', "/");

        let mut candidates: Vec<PathBuf> = vec![root_dir.join(&link_name), root_dir.join(link)];
        if let Some(h) = path_to_hash.get(&normalized_link) {
            candidates.push(root_dir.join(format!("{}.bin", h)));
        } else {
            candidates.push(root_dir.join(format!("{:016x}.bin", xxh64(&normalized_link))));
        }

        for cand in &candidates {
            if cand.exists() && cand.is_file() {
                let resolved = cand.canonicalize().unwrap_or_else(|_| cand.clone());
                if !processed.contains(&resolved) && !is_base_bin(cand) && !is_main_bin(cand) {
                    out.push((cand.clone(), link.clone()));
                    processed.insert(resolved);
                }
                break;
            }
        }
    }
    out
}

/// Shared merge core for all three combine variants.
fn combine(bin_path: &Path, filter: Filter, vfx_marker_only: bool) -> Result<CombineResult> {
    let main_bin_path = bin_path.to_path_buf();
    let root_dir = find_root_dir(bin_path);

    let mut main_bin = read(&main_bin_path)?;
    let mut main_hashes: HashSet<u32> = main_bin.entries.iter().map(|e| e.path_hash).collect();
    let champ_name = detect_champ_name(&main_bin_path);

    let links = resolve_links(&main_bin, &main_bin_path, &root_dir, vfx_marker_only);

    let mut links_to_remove: HashSet<String> = HashSet::new();
    let mut files_to_delete: Vec<PathBuf> = Vec::new();
    let mut total_merged = 0usize;

    for (f, original_link) in &links {
        let mut linked = match read(f) {
            Ok(b) => b,
            Err(e) => {
                eprintln!("  [Error] Failed to read {}: {}", f.display(), e);
                continue;
            }
        };

        // Select the entries to pull out of this linked BIN.
        let take: Vec<u32> = linked
            .entries
            .iter()
            .filter(|e| match filter {
                Filter::Class(c) => e.class_hash == c,
                Filter::All => true,
            })
            .map(|e| e.path_hash)
            .filter(|h| !main_hashes.contains(h))
            .collect();

        if take.is_empty() {
            continue;
        }
        let take_set: HashSet<u32> = take.iter().copied().collect();

        let mut moved: Vec<BinEntry> = Vec::new();
        linked.entries.retain(|e| {
            if take_set.contains(&e.path_hash) {
                moved.push(e.clone());
                false
            } else {
                true
            }
        });

        let merged_here = moved.len();
        if merged_here == 0 {
            continue;
        }
        for e in moved {
            main_hashes.insert(e.path_hash);
            main_bin.entries.push(e);
        }
        total_merged += merged_here;

        // Empty linked file → delete it and drop the link; otherwise rewrite it.
        if linked.entries.is_empty() {
            files_to_delete.push(f.clone());
            links_to_remove.insert(original_link.clone());
        } else {
            // combine_linked also drops the link even when the file survives.
            if matches!(filter, Filter::All) {
                links_to_remove.insert(original_link.clone());
            }
            if let Err(e) = write(f, &linked) {
                eprintln!("  Warning: could not rewrite {}: {}", f.display(), e);
            }
        }
    }

    if total_merged == 0 {
        return Ok(CombineResult::default());
    }

    // Prune links.
    main_bin.linked = match filter {
        // VFX/anm: simply drop the removed links.
        Filter::Class(_) => main_bin
            .linked
            .iter()
            .filter(|l| !links_to_remove.contains(*l))
            .cloned()
            .collect(),
        // combine_linked: keep only champion-base links and non-`.bin` links.
        Filter::All => main_bin
            .linked
            .iter()
            .filter(|link| {
                if links_to_remove.contains(*link) {
                    return false;
                }
                let is_champ_bin = champ_name
                    .as_ref()
                    .map(|c| link.to_lowercase().contains(&format!("{}.bin", c)))
                    .unwrap_or(false);
                let is_non_bin = link.contains('/') && !link.ends_with(".bin");
                is_champ_bin || is_non_bin
            })
            .cloned()
            .collect(),
    };

    write(&main_bin_path, &main_bin)?;

    let mut files_deleted = 0usize;
    for f in &files_to_delete {
        if fs::remove_file(f).is_ok() {
            files_deleted += 1;
        }
    }

    Ok(CombineResult {
        merged: total_merged,
        files_deleted,
    })
}

/// Merge `VfxSystemDefinitionData` entries from split-vfx linked bins back in.
pub fn combine_vfx(bin_path: &Path) -> Result<CombineResult> {
    combine(
        bin_path,
        Filter::Class(fnv1a("VfxSystemDefinitionData")),
        true,
    )
}

/// Merge `AnimationGraphData` entries from linked bins back in.
pub fn combine_anm(bin_path: &Path) -> Result<CombineResult> {
    combine(bin_path, Filter::Class(fnv1a("AnimationGraphData")), false)
}

/// Catch-all: merge every non-duplicate entry from all resolved linked bins.
pub fn combine_linked(bin_path: &Path) -> Result<CombineResult> {
    combine(bin_path, Filter::All, false)
}
