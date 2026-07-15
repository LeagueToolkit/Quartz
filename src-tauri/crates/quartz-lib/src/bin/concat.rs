//! Linked BIN concatenation — 1:1 port of old Quartz `bumpathCore._combineLinkedBins`.
//!
//! For each seed skin BIN, this recursively gathers its linked (Type3
//! LinkedData) BINs and merges their entries DIRECTLY INTO the skin BIN
//! (skipping duplicate hashes), removes the merged links from the skin BIN's
//! `linked` list (keeping character-BIN links), writes the skin BIN back, and
//! deletes the merged source BINs from disk. There is NO separate `_Concat.bin`
//! file — the skin BIN itself becomes self-contained, exactly like old Quartz.

use crate::bin::ritoshark_bridge::{read_bin, write_bin};
use crate::error::{Error, Result};
use ritoshark::bin::Bin;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

/// Category of a BIN file based on its path pattern
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BinCategory {
    /// Type 1: Champion root BIN (DATA/Characters/{Champion}/{Champion}.bin)
    /// Never modify - contains core champion data
    ChampionRoot,

    /// Type 2: Animation BINs (DATA/Characters/{Champion}/Animations/*.bin)
    /// Never modify - contains animation data
    Animation,

    /// Type 3: Linked data BINs (everything else)
    /// Concatenate these into a single BIN
    LinkedData,

    /// Filtered: Ignore these files
    /// Corrupted, recursive, or explicitly ignored files
    Ignore,
}

/// Result of a concatenation operation
#[derive(Debug, Clone)]
pub struct ConcatResult {
    /// The path where the concat BIN was saved (relative DATA path)
    pub concat_path: String,
    /// Number of source BINs that were concatenated
    pub source_count: usize,
    /// Paths of source BINs that were concatenated (for deletion)
    pub source_paths: Vec<String>,
}

/// Classify a BIN file path into its category
pub fn classify_bin(path: &str) -> BinCategory {
    let normalized = path.replace('\\', "/");
    let lower = normalized.to_lowercase();

    // Extract just the filename for pattern matching
    let filename = lower.split('/').next_back().unwrap_or("");

    // Type 1: Champion Root BIN - detect by path pattern
    // e.g., data/characters/kayn/kayn.bin
    if lower.starts_with("data/characters/") && !lower.contains("/animations/") {
        let parts: Vec<&str> = normalized.split('/').collect();
        if parts.len() == 4 && parts[3].to_lowercase().ends_with(".bin") {
            let champion_folder = parts[2].to_lowercase();
            let bin_filename = parts[3].to_lowercase();
            if bin_filename == format!("{}.bin", champion_folder) {
                return BinCategory::ChampionRoot;
            }
        }
    }

    // Also detect "root.bin" anywhere as ChampionRoot (should be removed)
    if filename == "root.bin" {
        return BinCategory::ChampionRoot;
    }

    // Type 2: Animation BINs - in the animations folder
    // e.g., data/characters/kayn/animations/skin2.bin
    if lower.starts_with("data/characters/") && lower.contains("/animations/") {
        return BinCategory::Animation;
    }

    // Type 3: Everything else is LinkedData
    // This includes all the skin data BINs like:
    // - data/kayn_skins_skin0_skins_skin1_....bin (combined skin data)
    // - data/characters/kayn/skins/skin2.bin (main skin BIN)
    // We don't judge by filename - only by whether the file can be parsed
    BinCategory::LinkedData
}

/// Get the linked paths from a Bin (uses the `linked` field)
pub fn get_linked_paths(bin: &Bin) -> Vec<String> {
    bin.linked.clone()
}

/// Set the linked paths in a Bin
pub fn set_linked_paths(bin: &mut Bin, paths: Vec<String>) {
    bin.linked = paths;
}

/// Create a concatenated BIN from all Type 3 (LinkedData) BINs
/// Resolve a bin's rel path (as stored in a `linked:` entry) to a real file
/// under `content_base`, tolerating the things that differ between what the BIN
/// records and what the WAD extractor wrote to disk:
///   1. root: `data/...` vs `assets/...` (modern champs resolve under assets/),
///   2. path-segment casing (Windows FS is case-insensitive; League mixes case),
///   3. HEX-NAMED files: mod-internal combined BINs (e.g.
///      `Evelynn_Multi_Skins_...bin`) whose xxh64 isn't in the hashtable get
///      written as `<hex>.bin` by the extractor, so also try that name.
/// Public wrapper: resolve a `linked:` entry to a real file on disk (tolerating
/// data/assets swap, casing, and hex-named fallbacks). Used by the repath
/// cleanup to know which linked BINs still exist.
pub fn resolve_linked_on_disk(content_base: &Path, link: &str) -> Option<PathBuf> {
    let norm = link.to_lowercase().replace('\\', "/");
    resolve_bin_on_disk(content_base, &norm)
}

fn resolve_bin_on_disk(content_base: &Path, rel: &str) -> Option<PathBuf> {
    let rel = rel.replace('\\', "/");
    let rel = rel.trim_start_matches('/');

    // Candidate rel paths: as-is, plus data<->assets root swap (case-insensitive).
    let mut candidates: Vec<String> = vec![rel.to_string()];
    let lower = rel.to_lowercase();
    if lower.starts_with("data/") {
        candidates.push(format!("assets/{}", &rel["data/".len()..]));
    } else if lower.starts_with("assets/") {
        candidates.push(format!("data/{}", &rel["assets/".len()..]));
    }

    for cand in &candidates {
        let direct = content_base.join(cand);
        if direct.is_file() {
            return Some(direct);
        }
    }
    // Case-insensitive descent (one dir read per segment; no full-tree walk).
    for cand in &candidates {
        if let Some(hit) = descend_case_insensitive(content_base, cand) {
            return Some(hit);
        }
    }
    // Hex-named fallback: the extractor names unresolved chunks `<xxh64>.bin`.
    // Match the linked path's own hash (recursively, in case it sits in a
    // subfolder that itself failed to resolve — but usually at the content root).
    let hex = format!("{:016x}", crate::wad::path_hash(&lower));
    let hex_name = format!("{}.bin", hex);
    let at_root = content_base.join(&hex_name);
    if at_root.is_file() {
        return Some(at_root);
    }
    find_file_named(content_base, &hex_name)
}

fn descend_case_insensitive(base: &Path, rel: &str) -> Option<PathBuf> {
    let mut current = base.to_path_buf();
    for seg in rel.split('/').filter(|s| !s.is_empty()) {
        let exact = current.join(seg);
        if exact.exists() {
            current = exact;
            continue;
        }
        let seg_lower = seg.to_lowercase();
        let entries = fs::read_dir(&current).ok()?;
        let mut matched = None;
        for e in entries.flatten() {
            if e.file_name().to_string_lossy().to_lowercase() == seg_lower {
                matched = Some(e.path());
                break;
            }
        }
        current = matched?;
    }
    current.is_file().then_some(current)
}

/// Bounded recursive search for a file with the exact (case-insensitive) name.
/// Used for the hex-named linked-BIN fallback when it isn't at the content root.
fn find_file_named(base: &Path, name: &str) -> Option<PathBuf> {
    let target = name.to_lowercase();
    let mut stack = vec![base.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(rd) = fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                stack.push(p);
            } else if p.file_name().map(|n| n.to_string_lossy().to_lowercase())
                == Some(target.clone())
            {
                return Some(p);
            }
        }
    }
    None
}

/// Recursively flatten a skin BIN's linked graph into the ordered list of
/// Type3 LinkedData BINs to merge. Follows each linked BIN's own `linked`
/// list, skipping character BINs (ChampionRoot/Animation) and cycles/dupes.
/// Mirrors old Quartz `_flatListLinkedBins` + the scan-time character-bin skip.
fn flatten_linked_bins(
    seed_path: &Path,
    content_base: &Path,
    path_mappings: &HashMap<String, String>,
) -> Vec<(String, PathBuf)> {
    let mut out: Vec<(String, PathBuf)> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut stack: Vec<PathBuf> = vec![seed_path.to_path_buf()];
    let mut visited_files: std::collections::HashSet<String> = std::collections::HashSet::new();

    while let Some(cur) = stack.pop() {
        let key = cur.to_string_lossy().to_lowercase().replace('\\', "/");
        if !visited_files.insert(key) {
            continue;
        }
        let Ok(data) = fs::read(&cur) else { continue };
        let Ok(bin) = read_bin(&data) else { continue };
        for link in &bin.linked {
            // Old Quartz keeps (never merges) character BINs — our
            // ChampionRoot + Animation categories.
            if classify_bin(link) != BinCategory::LinkedData {
                continue;
            }
            let norm = link.to_lowercase().replace('\\', "/");
            let actual = path_mappings
                .get(&norm)
                .cloned()
                .unwrap_or_else(|| norm.clone());
            let Some(disk) = resolve_bin_on_disk(content_base, &actual) else {
                tracing::warn!("Linked BIN not found on disk, skipping: {}", link);
                continue;
            };
            let disk_key = disk.to_string_lossy().to_lowercase().replace('\\', "/");
            if seen.insert(disk_key) {
                out.push((link.clone(), disk.clone()));
                stack.push(disk);
            }
        }
    }
    out
}

/// 1:1 port of old Quartz `bumpathCore._combineLinkedBins` for one seed skin BIN.
///
/// Merges every Type3 linked BIN's entries DIRECTLY INTO the seed skin BIN
/// (skipping duplicate hashes), removes the merged links from the seed's
/// `linked` list (keeping character-BIN links), writes the seed back, and
/// deletes the merged source BINs from disk. No `_Concat.bin` is produced.
///
/// `project_name`/`creator_name`/`champion` are unused now (kept for the
/// organizer's call-site signature); the result's `concat_path` is the seed
/// BIN itself since that's where the entries now live.
pub fn concatenate_linked_bins(
    main_bin_path: &Path,
    _project_name: &str,
    _creator_name: &str,
    _champion: &str,
    content_base: &Path,
    path_mappings: &HashMap<String, String>,
) -> Result<ConcatResult> {
    tracing::info!("Combining linked BINs into: {}", main_bin_path.display());

    let data = fs::read(main_bin_path).map_err(|e| Error::io_with_path(e, main_bin_path))?;
    let mut main_bin = read_bin(&data)
        .map_err(|e| Error::InvalidInput(format!("Failed to parse main BIN: {}", e)))?;
    drop(data);

    // Gather the transitively linked Type3 BINs (in old Quartz's DFS order).
    let linked = flatten_linked_bins(main_bin_path, content_base, path_mappings);
    if linked.is_empty() {
        return Ok(ConcatResult {
            concat_path: rel_of(content_base, main_bin_path),
            source_count: 0,
            source_paths: Vec::new(),
        });
    }

    // Merge entries INTO the main BIN, first-writer-wins by hash.
    let mut existing: std::collections::HashSet<u32> =
        main_bin.entries.iter().map(|e| e.path_hash).collect();
    let mut merged_disk: Vec<PathBuf> = Vec::new();
    let mut merged_link_keys: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut source_paths: Vec<String> = Vec::new();
    let mut added = 0usize;

    for (link, disk) in &linked {
        let Ok(bytes) = fs::read(disk) else { continue };
        let src = match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| read_bin(&bytes)))
        {
            Ok(Ok(b)) => b,
            Ok(Err(e)) => {
                tracing::warn!("Failed to parse linked BIN {}: {}", disk.display(), e);
                continue;
            }
            Err(_) => {
                tracing::error!(
                    "CRASH PREVENTED: parser panicked on {}. Skipping.",
                    disk.display()
                );
                continue;
            }
        };
        for entry in src.entries {
            if existing.insert(entry.path_hash) {
                main_bin.entries.push(entry);
                added += 1;
            }
        }
        merged_disk.push(disk.clone());
        merged_link_keys.insert(link_key(link));
        source_paths.push(rel_of(content_base, disk));
    }

    // Remove merged links from the seed's linked list; keep character BINs and
    // any link that didn't get merged (matches old Quartz's filter).
    main_bin.linked.retain(|link| {
        if classify_bin(link) != BinCategory::LinkedData {
            return true; // always keep character/animation BIN links
        }
        !merged_link_keys.contains(&link_key(link))
    });

    let out = write_bin(&main_bin)
        .map_err(|e| Error::InvalidInput(format!("Failed to write combined BIN: {}", e)))?;
    fs::write(main_bin_path, &out).map_err(|e| Error::io_with_path(e, main_bin_path))?;
    tracing::info!(
        "Merged {} entries from {} linked BINs into {}",
        added,
        merged_disk.len(),
        main_bin_path.display()
    );

    // Delete merged source BINs from disk + prune now-empty parent dirs.
    let mut deleted = 0;
    for disk in &merged_disk {
        if disk.exists() {
            match fs::remove_file(disk) {
                Ok(_) => {
                    deleted += 1;
                    cleanup_empty_parents(disk, content_base);
                }
                Err(e) => tracing::warn!("Failed to delete merged BIN {}: {}", disk.display(), e),
            }
        }
    }
    tracing::info!("Deleted {} merged source BINs", deleted);

    Ok(ConcatResult {
        concat_path: rel_of(content_base, main_bin_path),
        source_count: merged_disk.len(),
        source_paths,
    })
}

/// Normalize a link string to a comparable key (lowercased, forward slashes,
/// leading `data/`/`assets/` root ignored so `DATA/x.bin` == `assets/x.bin`).
fn link_key(link: &str) -> String {
    let l = link.replace('\\', "/").to_lowercase();
    let l = l.trim_start_matches('/');
    if let Some(rest) = l.strip_prefix("data/") {
        rest.to_string()
    } else if let Some(rest) = l.strip_prefix("assets/") {
        rest.to_string()
    } else {
        l.to_string()
    }
}

/// Relative (forward-slashed) path of `p` under `base`, else the file name.
fn rel_of(base: &Path, p: &Path) -> String {
    p.strip_prefix(base)
        .map(|r| r.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| {
            p.file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default()
        })
}

/// Remove now-empty parent directories of `file` up to (not including) `base`.
fn cleanup_empty_parents(file: &Path, base: &Path) {
    let mut dir = file.parent().map(|p| p.to_path_buf());
    while let Some(d) = dir {
        if d == base || !d.starts_with(base) {
            break;
        }
        let is_empty = fs::read_dir(&d)
            .map(|mut rd| rd.next().is_none())
            .unwrap_or(false);
        if !is_empty || fs::remove_dir(&d).is_err() {
            break;
        }
        dir = d.parent().map(|p| p.to_path_buf());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_bin_champion_root() {
        assert_eq!(
            classify_bin("DATA/Characters/Kayn/Kayn.bin"),
            BinCategory::ChampionRoot
        );
        assert_eq!(
            classify_bin("data/characters/kayn/kayn.bin"),
            BinCategory::ChampionRoot
        );
    }

    #[test]
    fn test_classify_bin_animation() {
        assert_eq!(
            classify_bin("DATA/Characters/Kayn/Animations/Skin8.bin"),
            BinCategory::Animation
        );
    }

    #[test]
    fn test_classify_bin_linked_data() {
        assert_eq!(
            classify_bin("DATA/Kayn_Skins_Skin0_Skins_Skin1.bin"),
            BinCategory::LinkedData
        );
    }
}
