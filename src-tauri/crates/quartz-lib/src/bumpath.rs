//! Bumpath repath engine — ported from Quartz's `utils/bumpath/bumpathCore.js`.
//!
//! Repaths a mod folder: inserts a user prefix segment after the first
//! `data/` or `assets/` path component in every asset/data string referenced
//! by the selected skin BINs, copies those assets to the output under their
//! repathed paths, and (optionally) combines linked BINs into the main BIN so
//! a single skin BIN carries everything.
//!
//! Source-file matching uses normalized lowercase relative paths. Extracted
//! mod folders carry real Riot paths (assets/.../foo.dds), so this is the
//! common case; hashed_files.json mappings are honored when present.

use crate::bin::ltk_bridge::{get_cached_bin_hashes, read_bin, write_bin};
use crate::error::{Error, Result};
use ritoshark::bin::{Bin, BinValue};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

/// Options controlling a repath pass. Mirrors `bumpath:repath` IPC data.
#[derive(Debug, Clone)]
pub struct RepathOptions {
    /// Prefix segment to insert (e.g. "mymod"). Required — no `bum` default.
    pub custom_prefix: String,
    /// Skin ids to repath (e.g. `[1, 14]` → `skins/skin1.bin`). Empty = all BINs.
    pub selected_skin_ids: Vec<u32>,
    /// Don't error on missing referenced files; skip them instead.
    pub ignore_missing: bool,
    /// Merge linked BINs into their main BIN and drop the link.
    pub combine_linked: bool,
}

/// Outcome of a repath pass.
#[derive(Debug, Clone, Default)]
pub struct RepathResult {
    pub output_dir: String,
    /// BIN files repathed + written.
    pub bins_processed: usize,
    /// Asset files copied to the output with repathed paths.
    pub assets_copied: usize,
    /// Referenced assets that could not be found under the source dir.
    pub missing: usize,
    /// Linked BINs combined into their main BIN.
    pub combined: usize,
}

fn normalize(p: &str) -> String {
    p.replace('\\', "/").to_lowercase()
}

/// Strip a leading slash and collapse separators to forward slash.
fn rel_normalize(p: &str) -> String {
    normalize(p).trim_start_matches('/').to_string()
}

/// True for a champion root BIN like `characters/aatrox/aatrox.bin` — these
/// are never repathed or combined.
pub(crate) fn is_character_bin(path: &str) -> bool {
    let lower = normalize(path);
    if !(lower.contains("characters/") && lower.ends_with(".bin")) {
        return false;
    }
    if let Some(after) = lower.split("characters/").nth(1) {
        let stem = after.trim_end_matches(".bin");
        let parts: Vec<&str> = stem.split('/').collect();
        return parts.len() >= 2 && parts[0] == parts[1];
    }
    false
}

/// Insert `prefix` after the first path segment (matching JS `bumPath`).
/// `assets/foo/bar.dds` + `mymod` → `assets/mymod/foo/bar.dds`.
fn bum_path(file_path: &str, prefix: &str) -> String {
    if file_path.is_empty() || prefix.is_empty() {
        return file_path.to_string();
    }
    let trimmed = file_path.trim();
    // Already prefixed.
    if trimmed.contains(&format!("/{}/", prefix)) || trimmed.starts_with(&format!("{}/", prefix)) {
        return trimmed.to_string();
    }
    match trimmed.find('/') {
        Some(idx) => format!("{}/{}{}", &trimmed[..idx], prefix, &trimmed[idx..]),
        None => format!("{}/{}", prefix, trimmed),
    }
}

/// Does this string look like an asset/data reference worth repathing?
fn is_asset_string(value: &str) -> bool {
    let v = value.to_lowercase();
    v.contains("assets/")
        || v.contains("data/")
        || v.contains("characters/")
        || v.contains("particles/")
        || v.contains("materials/")
        || v.ends_with(".tex")
        || v.ends_with(".anm")
        || v.ends_with(".dds")
        || v.ends_with(".png")
        || v.ends_with(".jpg")
}

/// A discovered source file. Keyed in the map by its normalized rel path.
struct SourceFile {
    full_path: PathBuf,
}

/// Walk `dir` recursively, recording every file keyed by its normalized
/// relative path (first occurrence wins).
fn discover_files(dir: &Path, base: &Path, out: &mut HashMap<String, SourceFile>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let file_type = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if file_type.is_dir() {
            discover_files(&path, base, out);
        } else if file_type.is_file() {
            if let Ok(rel) = path.strip_prefix(base) {
                let rel_norm = rel_normalize(&rel.to_string_lossy());
                out.entry(rel_norm)
                    .or_insert(SourceFile { full_path: path });
            }
        }
    }
}

/// Load `hashed_files.json` (hashedName → originalPath) and register the
/// hashed files under their original relative paths so links/assets resolve.
fn apply_hashed_files_map(source_dir: &Path, files: &mut HashMap<String, SourceFile>) {
    let json_path = source_dir.join("hashed_files.json");
    let raw = match std::fs::read_to_string(&json_path) {
        Ok(s) => s,
        Err(_) => return,
    };
    let map: HashMap<String, String> = match serde_json::from_str(&raw) {
        Ok(m) => m,
        Err(_) => return,
    };
    for (hashed_name, original_path) in map {
        let full = source_dir.join(&hashed_name);
        if !full.exists() {
            continue;
        }
        let rel = rel_normalize(&original_path);
        files.entry(rel).or_insert(SourceFile { full_path: full });
    }
}

/// Recursively rewrite every asset/data string inside a value.
fn repath_value(value: &mut BinValue, prefix: &str) {
    match value {
        BinValue::String(s) => {
            if is_asset_string(s) {
                let lower = s.to_lowercase();
                if lower.contains("assets/") || lower.contains("data/") {
                    *s = bum_path(s, prefix);
                }
            }
        }
        BinValue::List { items, .. } => {
            for item in items.iter_mut() {
                repath_value(item, prefix);
            }
        }
        BinValue::Option {
            value: Some(inner), ..
        } => {
            repath_value(inner, prefix);
        }
        BinValue::Map { entries, .. } => {
            for (k, v) in entries.iter_mut() {
                repath_value(k, prefix);
                repath_value(v, prefix);
            }
        }
        BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => {
            for (_k, v) in fields.iter_mut() {
                repath_value(v, prefix);
            }
        }
        _ => {}
    }
}

/// Rewrite a single linked-BIN path with the prefix (skip character BINs).
fn bum_link(link: &str, prefix: &str) -> String {
    if is_character_bin(link) {
        return link.to_string();
    }
    let lower = link.to_lowercase();
    if !lower.contains("assets/") && !lower.contains("data/") {
        return link.to_string();
    }
    bum_path(link, prefix)
}

/// Repath every string/link in a parsed BIN in place.
fn repath_bin(bin: &mut Bin, prefix: &str) {
    for link in bin.linked.iter_mut() {
        *link = bum_link(link, prefix);
    }
    for entry in bin.entries.iter_mut() {
        for (_k, v) in entry.fields.iter_mut() {
            repath_value(v, prefix);
        }
    }
    for patch in bin.patches.iter_mut() {
        repath_value(&mut patch.value, prefix);
    }
}

/// Collect every asset/data string referenced anywhere in a BIN value.
fn collect_assets(value: &BinValue, out: &mut HashSet<String>) {
    match value {
        BinValue::String(s) => {
            if is_asset_string(s) {
                let lower = s.to_lowercase();
                if lower.contains("assets/") || lower.contains("data/") {
                    out.insert(s.clone());
                }
            }
        }
        BinValue::List { items, .. } => {
            for item in items {
                collect_assets(item, out);
            }
        }
        BinValue::Option {
            value: Some(inner), ..
        } => collect_assets(inner, out),
        BinValue::Map { entries, .. } => {
            for (k, v) in entries {
                collect_assets(k, out);
                collect_assets(v, out);
            }
        }
        BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => {
            for (_k, v) in fields {
                collect_assets(v, out);
            }
        }
        _ => {}
    }
}

fn collect_bin_assets(bin: &Bin, out: &mut HashSet<String>) {
    for entry in &bin.entries {
        for (_k, v) in &entry.fields {
            collect_assets(v, out);
        }
    }
    for patch in &bin.patches {
        collect_assets(&patch.value, out);
    }
}

/// Does `rel` match `**/skins/skin{N}.bin` for one of `skin_ids`?
fn matches_skin(rel: &str, skin_ids: &[u32]) -> bool {
    let lower = rel.to_lowercase();
    for id in skin_ids {
        if lower.ends_with(&format!("/skins/skin{}.bin", id))
            || lower == format!("skins/skin{}.bin", id)
        {
            return true;
        }
    }
    false
}

/// Walk linked BINs from the seed set, returning the full ordered set of
/// source-relative BIN paths to process (seeds + their resolvable links).
fn resolve_linked_bins(
    seeds: &[String],
    files: &HashMap<String, SourceFile>,
) -> (Vec<String>, HashMap<String, Vec<String>>) {
    let mut ordered: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut links_of: HashMap<String, Vec<String>> = HashMap::new();
    let mut queue: Vec<String> = seeds.to_vec();

    while let Some(rel) = queue.pop() {
        if seen.contains(&rel) {
            continue;
        }
        seen.insert(rel.clone());
        ordered.push(rel.clone());

        let src = match files.get(&rel) {
            Some(s) => s,
            None => continue,
        };
        let data = match std::fs::read(&src.full_path) {
            Ok(d) => d,
            Err(_) => continue,
        };
        let bin = match read_bin(&data) {
            Ok(b) => b,
            Err(_) => continue,
        };
        let mut resolved_links = Vec::new();
        for link in &bin.linked {
            if is_character_bin(link) {
                continue;
            }
            let link_rel = rel_normalize(link);
            if files.contains_key(&link_rel) {
                resolved_links.push(link_rel.clone());
                if !seen.contains(&link_rel) {
                    queue.push(link_rel);
                }
            }
        }
        links_of.insert(rel, resolved_links);
    }
    (ordered, links_of)
}

/// Run a repath pass over `source_dir`, writing results to `output_dir`.
pub fn repath(
    source_dir: &Path,
    output_dir: &Path,
    options: &RepathOptions,
) -> Result<RepathResult> {
    if options.custom_prefix.trim().is_empty() {
        return Err(Error::InvalidInput("custom_prefix is required".into()));
    }
    if !source_dir.exists() {
        return Err(Error::InvalidInput(format!(
            "source directory not found: {}",
            source_dir.display()
        )));
    }
    let prefix = options.custom_prefix.trim();

    // 1. Discover every source file.
    let mut files: HashMap<String, SourceFile> = HashMap::new();
    let base = source_dir;
    discover_files(source_dir, base, &mut files);
    apply_hashed_files_map(source_dir, &mut files);

    // 2. Pick seed BINs: skin BINs matching the requested ids, or all BINs.
    let seeds: Vec<String> = files
        .keys()
        .filter(|rel| rel.ends_with(".bin") && !is_character_bin(rel))
        .filter(|rel| {
            if options.selected_skin_ids.is_empty() {
                true
            } else {
                matches_skin(rel, &options.selected_skin_ids)
            }
        })
        .cloned()
        .collect();

    if seeds.is_empty() {
        return Err(Error::InvalidInput(
            "no BIN files matched the selection".into(),
        ));
    }

    // 3. Walk the linked-BIN graph from the seeds.
    let (bin_order, links_of) = resolve_linked_bins(&seeds, &files);
    let seed_set: HashSet<String> = seeds.iter().cloned().collect();

    std::fs::create_dir_all(output_dir).map_err(|e| Error::io_with_path(e, output_dir))?;

    let mut result = RepathResult {
        output_dir: output_dir.to_string_lossy().into_owned(),
        ..Default::default()
    };

    // 4. Gather referenced assets (from the unmodified source BINs) and
    //    repath + write each BIN to the output under its original rel path.
    let mut referenced: HashSet<String> = HashSet::new();
    // outputs of each processed bin: rel -> absolute output path
    let mut bin_outputs: HashMap<String, PathBuf> = HashMap::new();

    for rel in &bin_order {
        let src = match files.get(rel) {
            Some(s) => s,
            None => continue,
        };
        let data =
            std::fs::read(&src.full_path).map_err(|e| Error::io_with_path(e, &src.full_path))?;
        let mut bin = match read_bin(&data) {
            Ok(b) => b,
            Err(e) => {
                tracing::warn!("skipping unparseable BIN {}: {}", rel, e);
                continue;
            }
        };
        collect_bin_assets(&bin, &mut referenced);
        repath_bin(&mut bin, prefix);

        let out_path = output_dir.join(rel);
        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| Error::io_with_path(e, parent))?;
        }
        let bytes = write_bin(&bin).map_err(|e| Error::BinConversion {
            message: e.to_string(),
            path: Some(out_path.clone()),
        })?;
        std::fs::write(&out_path, bytes).map_err(|e| Error::io_with_path(e, &out_path))?;
        bin_outputs.insert(rel.clone(), out_path);
        result.bins_processed += 1;
    }

    // 5. Copy referenced asset files to the output under repathed paths.
    for asset in &referenced {
        let asset_rel = rel_normalize(asset);
        let src = match files.get(&asset_rel) {
            Some(s) => s,
            None => {
                if !options.ignore_missing {
                    return Err(Error::InvalidInput(format!(
                        "missing referenced file: {}",
                        asset
                    )));
                }
                result.missing += 1;
                continue;
            }
        };
        let repathed = bum_path(asset, prefix);
        let out_path = output_dir.join(rel_normalize(&repathed));
        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| Error::io_with_path(e, parent))?;
        }
        std::fs::copy(&src.full_path, &out_path).map_err(|e| Error::io_with_path(e, &out_path))?;
        result.assets_copied += 1;
    }

    // 6. Optionally combine linked BINs into their seed main BINs.
    if options.combine_linked {
        for seed in &seed_set {
            result.combined += combine_into(seed, &links_of, &bin_outputs)?;
        }
    }

    Ok(result)
}

/// Merge every (recursively) linked BIN's entries into the seed BIN, prune the
/// merged links, delete the linked files. Returns the number merged.
fn combine_into(
    seed: &str,
    links_of: &HashMap<String, Vec<String>>,
    bin_outputs: &HashMap<String, PathBuf>,
) -> Result<usize> {
    let main_path = match bin_outputs.get(seed) {
        Some(p) => p.clone(),
        None => return Ok(0),
    };

    // Flatten the link graph below the seed.
    let mut flat: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut stack: Vec<String> = links_of.get(seed).cloned().unwrap_or_default();
    while let Some(cur) = stack.pop() {
        if cur == seed || seen.contains(&cur) {
            continue;
        }
        seen.insert(cur.clone());
        flat.push(cur.clone());
        if let Some(children) = links_of.get(&cur) {
            stack.extend(children.iter().cloned());
        }
    }
    if flat.is_empty() {
        return Ok(0);
    }

    let data = std::fs::read(&main_path).map_err(|e| Error::io_with_path(e, &main_path))?;
    let mut main = read_bin(&data).map_err(|e| Error::BinConversion {
        message: e.to_string(),
        path: Some(main_path.clone()),
    })?;

    let mut existing: HashSet<u32> = main.entries.iter().map(|e| e.path_hash).collect();
    let mut merged_rels: HashSet<String> = HashSet::new();
    let mut merged_count = 0;

    for linked_rel in &flat {
        let linked_path = match bin_outputs.get(linked_rel) {
            Some(p) => p.clone(),
            None => continue,
        };
        let ldata = match std::fs::read(&linked_path) {
            Ok(d) => d,
            Err(_) => continue,
        };
        let linked = match read_bin(&ldata) {
            Ok(b) => b,
            Err(_) => continue,
        };
        for entry in linked.entries {
            if existing.insert(entry.path_hash) {
                main.entries.push(entry);
            }
        }
        merged_rels.insert(linked_rel.clone());
        merged_count += 1;
        let _ = std::fs::remove_file(&linked_path);
    }

    // Prune links that point at the merged files (compare on normalized rel,
    // tolerating the inserted prefix segment).
    main.linked.retain(|link| {
        if is_character_bin(link) {
            return true;
        }
        let link_rel = rel_normalize(link);
        let stripped = strip_prefix_segment(&link_rel);
        !(merged_rels.contains(&link_rel) || merged_rels.contains(&stripped))
    });

    let bytes = write_bin(&main).map_err(|e| Error::BinConversion {
        message: e.to_string(),
        path: Some(main_path.clone()),
    })?;
    std::fs::write(&main_path, bytes).map_err(|e| Error::io_with_path(e, &main_path))?;

    Ok(merged_count)
}

/// Drop the prefix segment right after `data/` or `assets/` so a prefixed link
/// can be matched against an unprefixed source rel path.
fn strip_prefix_segment(rel: &str) -> String {
    let parts: Vec<&str> = rel.split('/').filter(|p| !p.is_empty()).collect();
    if parts.len() < 3 {
        return rel.to_string();
    }
    if parts[0] != "data" && parts[0] != "assets" {
        return rel.to_string();
    }
    let mut rebuilt = vec![parts[0]];
    rebuilt.extend_from_slice(&parts[2..]);
    rebuilt.join("/")
}

// ---- Source enumeration + per-entry scan (Bumpath panel) ----

/// A `.bin` file discovered under a source folder.
#[derive(Debug, Clone)]
pub struct SourceBinFile {
    /// Absolute path to the BIN on disk.
    pub path: PathBuf,
    /// Normalized relative path from its source folder.
    pub rel_path: String,
}

/// Enumerate every `.bin` under `folders` (recursively), keyed by absolute path.
/// Honors `hashed_files.json` so hashed-name extractions surface their real rel
/// path. First occurrence of a given rel path wins.
pub fn enumerate_source_bins(folders: &[PathBuf]) -> Vec<SourceBinFile> {
    let mut files: HashMap<String, SourceFile> = HashMap::new();
    for folder in folders {
        discover_files(folder, folder, &mut files);
        apply_hashed_files_map(folder, &mut files);
    }

    let mut out = Vec::new();
    for (rel, src) in files {
        if rel.ends_with(".bin") {
            out.push(SourceBinFile {
                path: src.full_path,
                rel_path: rel,
            });
        }
    }
    out.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
    out
}

/// A referenced asset/data path found inside an entry.
#[derive(Debug, Clone)]
pub struct ScannedReference {
    /// The original path string as stored in the BIN.
    pub path: String,
    /// Whether the referenced file exists under the scanned source folders.
    pub exists: bool,
    /// Normalized relative path used as the lookup key.
    pub unify_file: String,
}

/// A single BIN entry with its resolved name/type and referenced files.
#[derive(Debug, Clone)]
pub struct ScannedEntry {
    /// Hash key (`path_hash` as 8-char hex), used as the map key.
    pub hash: String,
    pub name: String,
    pub type_name: Option<String>,
    pub referenced_files: Vec<ScannedReference>,
}

/// Result of scanning the selected BINs.
#[derive(Debug, Clone, Default)]
pub struct ScanResult {
    pub entries: Vec<ScannedEntry>,
}

/// Resolve a u32 BIN hash to its name via the cached LMDB mapper, falling back
/// to `Entry_{hash:08x}` when unknown.
fn resolve_entry_name(hash: u32) -> String {
    let hashes = get_cached_bin_hashes().read();
    match hashes.get(hash as u64) {
        Some(name) => name.to_string(),
        None => format!("Entry_{:08x}", hash),
    }
}

/// Resolve a u32 type/class hash, returning `None` for the null hash.
fn resolve_type_name(hash: u32) -> Option<String> {
    if hash == 0 {
        return Some("0x00000000".to_string());
    }
    let hashes = get_cached_bin_hashes().read();
    Some(match hashes.get(hash as u64) {
        Some(name) => name.to_string(),
        None => format!("0x{:08x}", hash),
    })
}

/// Scan the selected `bin_paths` (absolute) for their entries and referenced
/// assets, following linked BINs that resolve within `folders`. `exists` flags
/// are computed against every file discovered under `folders`.
pub fn scan_entries(folders: &[PathBuf], bin_paths: &[PathBuf]) -> Result<ScanResult> {
    // Discover every source file so we can resolve links + asset existence.
    let mut files: HashMap<String, SourceFile> = HashMap::new();
    for folder in folders {
        discover_files(folder, folder, &mut files);
        apply_hashed_files_map(folder, &mut files);
    }

    // Build a reverse map (absolute path -> rel) for the explicitly selected
    // BINs, then seed the scan queue with their rel paths.
    let mut seeds: Vec<String> = Vec::new();
    for bin_path in bin_paths {
        let rel = files
            .iter()
            .find(|(_, src)| src.full_path == *bin_path)
            .map(|(rel, _)| rel.clone());
        match rel {
            Some(r) => seeds.push(r),
            None => {
                // Not under a source folder; index it directly by file name.
                let name = bin_path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_lowercase())
                    .unwrap_or_default();
                let rel = rel_normalize(&name);
                files.insert(
                    rel.clone(),
                    SourceFile {
                        full_path: bin_path.clone(),
                    },
                );
                seeds.push(rel);
            }
        }
    }

    let mut entries: Vec<ScannedEntry> = Vec::new();
    let mut seen_entries: HashSet<String> = HashSet::new();
    let mut scanned_bins: HashSet<String> = HashSet::new();
    let mut queue: Vec<String> = seeds;

    while let Some(rel) = queue.pop() {
        if scanned_bins.contains(&rel) {
            continue;
        }
        scanned_bins.insert(rel.clone());

        let src = match files.get(&rel) {
            Some(s) => s,
            None => continue,
        };
        let data = match std::fs::read(&src.full_path) {
            Ok(d) => d,
            Err(_) => continue,
        };
        let bin = match read_bin(&data) {
            Ok(b) => b,
            Err(e) => {
                tracing::warn!("bumpath scan: skipping unparseable BIN {}: {}", rel, e);
                continue;
            }
        };

        for entry in &bin.entries {
            let entry_hash = format!("{:08x}", entry.path_hash);
            if seen_entries.contains(&entry_hash) {
                continue;
            }
            seen_entries.insert(entry_hash.clone());

            let mut refs: HashSet<String> = HashSet::new();
            for (_k, v) in &entry.fields {
                collect_assets(v, &mut refs);
            }

            let mut referenced_files: Vec<ScannedReference> = refs
                .into_iter()
                .map(|path| {
                    let unify = rel_normalize(&path);
                    let exists = files.contains_key(&unify);
                    ScannedReference {
                        path,
                        exists,
                        unify_file: unify,
                    }
                })
                .collect();
            referenced_files.sort_by(|a, b| a.path.cmp(&b.path));

            entries.push(ScannedEntry {
                hash: entry_hash,
                name: resolve_entry_name(entry.path_hash),
                type_name: resolve_type_name(entry.class_hash),
                referenced_files,
            });
        }

        // Follow linked BINs that resolve to a discovered source file.
        for link in &bin.linked {
            if is_character_bin(link) {
                continue;
            }
            let link_rel = rel_normalize(link);
            if files.contains_key(&link_rel) && !scanned_bins.contains(&link_rel) {
                queue.push(link_rel);
            }
        }
    }

    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(ScanResult { entries })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bum_path_inserts_after_first_segment() {
        assert_eq!(
            bum_path("assets/foo/bar.dds", "mod"),
            "assets/mod/foo/bar.dds"
        );
        assert_eq!(bum_path("data/x.bin", "mod"), "data/mod/x.bin");
        assert_eq!(bum_path("loose.dds", "mod"), "mod/loose.dds");
    }

    #[test]
    fn bum_path_is_idempotent() {
        let once = bum_path("assets/foo.dds", "mod");
        assert_eq!(bum_path(&once, "mod"), once);
    }

    #[test]
    fn character_bin_detected() {
        assert!(is_character_bin("data/characters/aatrox/aatrox.bin"));
        assert!(!is_character_bin("data/characters/aatrox/skins/skin0.bin"));
    }

    #[test]
    fn skin_matching() {
        assert!(matches_skin("data/characters/x/skins/skin1.bin", &[1]));
        assert!(!matches_skin("data/characters/x/skins/skin2.bin", &[1]));
    }

    #[test]
    fn strip_prefix_segment_works() {
        assert_eq!(strip_prefix_segment("assets/mod/foo.dds"), "assets/foo.dds");
        assert_eq!(strip_prefix_segment("data/mod/x.bin"), "data/x.bin");
    }
}
