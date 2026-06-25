//! "Load donor from game" pipeline — ported from Quartz's
//! `main/ipc/channels/portDonor.js` (`port:prepareDonorFromSkin`).
//!
//! Locates a champion's skin BIN inside the live WAD, walks the linked-BIN
//! graph, extracts the selected BINs and their referenced assets to a per-skin
//! temp cache, combines the linked BINs into the main BIN, repaths the VFX
//! assets under a single porting prefix, and converts the combined BIN to
//! ritobin text so the Port panel can load it as a donor.
//!
//! Heavy WAD IO reuses `crate::wad`; BIN parsing/printing reuses
//! `crate::bin::ltk_bridge`; asset path rewriting reuses `crate::bumpath`.

use crate::bin::ltk_bridge::{read_bin, write_bin};
use crate::bin::converter::bin_to_text;
use crate::error::{Error, Result};
use crate::wad::{self, ChunkSel, WadTocEntry};
use ritoshark::bin::{Bin, BinValue};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

/// Result of preparing a donor from a live skin.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DonorResult {
    /// Combined donor BIN converted to ritobin text — what the Port panel loads.
    pub donor_py_content: String,
    /// Root of the per-skin temp cache, returned so the caller can clean it up.
    pub temp_root: String,
    /// Absolute path of the combined main BIN.
    pub combined_bin_path: String,
    /// Resolved champion WAD basename (e.g. `aatrox`, `monkeyking`).
    pub champion_file_name: String,
    /// Normalized skin id actually located.
    pub skin_id: u32,
    /// Number of BINs in the extracted graph.
    pub selected_bin_count: usize,
    /// Number of referenced asset files extracted.
    pub extracted_asset_count: usize,
    /// True when the cached combined BIN was reused without re-extracting.
    pub cache_hit: bool,
}

fn normalize_rel(value: &str) -> String {
    value.replace('\\', "/").trim_start_matches('/').to_lowercase()
}

/// Normalize a skin selection id: ids >= 1000 are chroma ids encoded as
/// `skinId * 1000 + chromaIndex`, so the base skin is `id % 1000`.
fn normalize_skin_id(value: u32) -> u32 {
    if value >= 1000 {
        value % 1000
    } else {
        value
    }
}

/// Build a `path -> WadTocEntry` map from a resolved TOC, first entry wins.
fn toc_by_path(toc: &[WadTocEntry]) -> HashMap<String, WadTocEntry> {
    let mut map = HashMap::new();
    for entry in toc {
        if let Some(resolved) = &entry.resolved_path {
            let rel = normalize_rel(resolved);
            map.entry(rel).or_insert_with(|| entry.clone());
        }
    }
    map
}

/// Locate the main skin BIN in the TOC for `champ` / `skin`. Riot uses both
/// `assets/` and `data/` roots and both `skinN`/`skin0N` spellings.
fn find_main_bin(by_path: &HashMap<String, WadTocEntry>, champ: &str, skin: u32) -> Option<String> {
    let candidates = [
        format!("assets/characters/{champ}/skins/skin{skin}.bin"),
        format!("assets/characters/{champ}/skins/skin{skin:02}.bin"),
        format!("data/characters/{champ}/skins/skin{skin}.bin"),
        format!("data/characters/{champ}/skins/skin{skin:02}.bin"),
    ];
    candidates
        .iter()
        .map(|c| normalize_rel(c))
        .find(|c| by_path.contains_key(c))
}

/// A link string can be a real rel path or a bare 16-hex path hash. Return the
/// normalized rel-path candidates worth trying against the TOC.
fn link_candidates(link: &str) -> Vec<String> {
    let raw = normalize_rel(link);
    if raw.is_empty() {
        return Vec::new();
    }
    let mut out = vec![raw.clone()];
    if !raw.ends_with(".bin") {
        out.push(format!("{raw}.bin"));
    }
    out
}

/// Pull the linked-BIN references out of a parsed BIN (the `linked` table).
fn linked_bins(bin: &Bin) -> Vec<String> {
    bin.linked.clone()
}

/// Recursively collect every asset/data string referenced in a BIN value.
fn collect_assets(value: &BinValue, out: &mut HashSet<String>) {
    match value {
        BinValue::String(s) => {
            let lower = s.to_lowercase();
            if (lower.contains("assets/") || lower.contains("data/")) && !lower.ends_with(".bin") {
                out.insert(s.clone());
            }
        }
        BinValue::List { items, .. } => items.iter().for_each(|v| collect_assets(v, out)),
        BinValue::Option { value: Some(inner), .. } => collect_assets(inner, out),
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

/// Per-skin cache root: `%TEMP%/Quartz/port-donor-cache/<champ>_skin<N>_<tag>`.
fn cache_root(champ: &str, skin: u32, wad_path: &Path) -> PathBuf {
    let tag = std::fs::metadata(wad_path)
        .ok()
        .map(|m| {
            let size = m.len();
            let mtime = m
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            format!("w{size}_m{mtime}")
        })
        .unwrap_or_else(|| "w0_m0".to_string());

    std::env::temp_dir()
        .join("Quartz")
        .join("port-donor-cache")
        .join(format!("{champ}_skin{skin}_{tag}"))
}

/// Extract the named rel paths from the WAD into `out_dir`, preserving paths.
fn extract_paths(
    wad_path: &Path,
    by_path: &HashMap<String, WadTocEntry>,
    wanted: &HashSet<String>,
    out_dir: &Path,
) -> Result<usize> {
    let selected: Vec<ChunkSel> = wanted
        .iter()
        .filter_map(|rel| by_path.get(rel))
        .map(|e| ChunkSel { path_hash: e.path_hash })
        .collect();
    if selected.is_empty() {
        return Ok(0);
    }
    let result = wad::extract_selected(wad_path, &selected, out_dir, true)?;
    Ok(result.extracted)
}

/// Read a BIN file off disk, tolerating missing/unparseable files.
fn try_read_bin(path: &Path) -> Option<Bin> {
    let data = std::fs::read(path).ok()?;
    read_bin(&data).ok()
}

/// Merge every linked BIN's entries into `main`, de-duped by path hash.
fn merge_bins(main: &mut Bin, linked: Vec<Bin>) {
    let mut existing: HashSet<u32> = main.entries.iter().map(|e| e.path_hash).collect();
    for bin in linked {
        for entry in bin.entries {
            if existing.insert(entry.path_hash) {
                main.entries.push(entry);
            }
        }
    }
    main.linked.clear();
}

/// Insert `prefix` after the first path segment of an asset string.
/// `assets/foo/bar.dds` + `mymod` → `assets/mymod/foo/bar.dds`. Idempotent.
fn prefix_asset(path: &str, prefix: &str) -> String {
    if path.is_empty() || prefix.is_empty() {
        return path.to_string();
    }
    if path.contains(&format!("/{prefix}/")) || path.starts_with(&format!("{prefix}/")) {
        return path.to_string();
    }
    match path.find('/') {
        Some(idx) => format!("{}/{}{}", &path[..idx], prefix, &path[idx..]),
        None => format!("{prefix}/{path}"),
    }
}

/// Rewrite every VFX asset string in a value with the consolidation prefix.
fn consolidate_value(value: &mut BinValue, prefix: &str) {
    match value {
        BinValue::String(s) => {
            let lower = s.to_lowercase();
            if (lower.contains("assets/") || lower.contains("data/")) && !lower.ends_with(".bin") {
                *s = prefix_asset(s, prefix);
            }
        }
        BinValue::List { items, .. } => items.iter_mut().for_each(|v| consolidate_value(v, prefix)),
        BinValue::Option { value: Some(inner), .. } => consolidate_value(inner, prefix),
        BinValue::Map { entries, .. } => {
            for (k, v) in entries.iter_mut() {
                consolidate_value(k, prefix);
                consolidate_value(v, prefix);
            }
        }
        BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => {
            for (_k, v) in fields.iter_mut() {
                consolidate_value(v, prefix);
            }
        }
        _ => {}
    }
}

fn consolidate_bin(bin: &mut Bin, prefix: &str) {
    for entry in bin.entries.iter_mut() {
        for (_k, v) in entry.fields.iter_mut() {
            consolidate_value(v, prefix);
        }
    }
    for patch in bin.patches.iter_mut() {
        consolidate_value(&mut patch.value, prefix);
    }
}

/// Sanitize a user-supplied porting prefix to `[a-z0-9_]`.
fn sanitize_prefix(raw: &str) -> String {
    raw.trim()
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_')
        .collect()
}

/// Prepare a donor from a live skin WAD.
///
/// `prefix` (when non-empty) is inserted after the first path segment of every
/// VFX asset string in the combined BIN so emitters ported into the target
/// reference predictable, collision-free paths.
pub fn prepare_donor_from_skin(
    league_path: &Path,
    champion: &str,
    skin_id: u32,
    prefix: &str,
) -> Result<DonorResult> {
    let wad_path = wad::find_champion_wad(league_path, champion).ok_or_else(|| {
        Error::InvalidInput(format!("Champion WAD not found for '{champion}' in {}", league_path.display()))
    })?;
    let champ_file = wad::normalize_champion(champion);
    let skin = normalize_skin_id(skin_id);

    let toc = wad::read_wad_toc(&wad_path)?;
    let by_path = toc_by_path(&toc);

    let main_bin = find_main_bin(&by_path, &champ_file, skin).ok_or_else(|| {
        Error::InvalidInput(format!("Could not locate skin BIN for {champion} skin {skin}"))
    })?;

    let temp_root = cache_root(&champ_file, skin, &wad_path);
    let combined_dir = temp_root.join("combined");
    let stage_dir = temp_root.join("bins");
    let combined_main = combined_dir.join(&main_bin);
    let clean_prefix = sanitize_prefix(prefix);

    // Cache hit: reuse the previously combined + consolidated donor.
    if combined_main.exists() {
        if let Some(text) = donor_text_from_combined(&combined_main) {
            return Ok(DonorResult {
                donor_py_content: text,
                temp_root: temp_root.to_string_lossy().into_owned(),
                combined_bin_path: combined_main.to_string_lossy().into_owned(),
                champion_file_name: champ_file,
                skin_id: skin,
                selected_bin_count: 0,
                extracted_asset_count: 0,
                cache_hit: true,
            });
        }
    }

    // Fresh extraction.
    let _ = std::fs::remove_dir_all(&temp_root);
    std::fs::create_dir_all(&stage_dir).map_err(|e| Error::io_with_path(e, &stage_dir))?;
    std::fs::create_dir_all(&combined_dir).map_err(|e| Error::io_with_path(e, &combined_dir))?;

    // Walk the linked-BIN graph from the main skin BIN.
    let mut selected: HashSet<String> = HashSet::new();
    selected.insert(main_bin.clone());
    let mut queue: Vec<String> = vec![main_bin.clone()];
    let mut parsed: HashSet<String> = HashSet::new();

    while let Some(rel) = queue.pop() {
        if parsed.contains(&rel) {
            continue;
        }
        parsed.insert(rel.clone());

        let mut single = HashSet::new();
        single.insert(rel.clone());
        extract_paths(&wad_path, &by_path, &single, &stage_dir)?;

        let abs = stage_dir.join(&rel);
        let Some(bin) = try_read_bin(&abs) else { continue };
        for link in linked_bins(&bin) {
            let resolved = link_candidates(&link)
                .into_iter()
                .find(|c| by_path.contains_key(c));
            if let Some(link_rel) = resolved {
                if link_rel.ends_with(".bin") && selected.insert(link_rel.clone()) {
                    queue.push(link_rel);
                }
            }
        }
    }

    // Combine the linked graph into the main BIN.
    let mut main = try_read_bin(&stage_dir.join(&main_bin)).ok_or_else(|| {
        Error::BinConversion {
            message: "Failed to read extracted main BIN".into(),
            path: Some(stage_dir.join(&main_bin)),
        }
    })?;

    let mut referenced: HashSet<String> = HashSet::new();
    collect_bin_assets(&main, &mut referenced);

    let mut linked_parsed = Vec::new();
    for rel in &selected {
        if rel == &main_bin {
            continue;
        }
        if let Some(bin) = try_read_bin(&stage_dir.join(rel)) {
            collect_bin_assets(&bin, &mut referenced);
            linked_parsed.push(bin);
        }
    }
    merge_bins(&mut main, linked_parsed);

    // Extract referenced (non-BIN) assets that exist in the TOC.
    let wanted_assets: HashSet<String> = referenced
        .iter()
        .map(|a| normalize_rel(a))
        .filter(|rel| !rel.ends_with(".bin") && by_path.contains_key(rel))
        .collect();
    let extracted_asset_count = extract_paths(&wad_path, &by_path, &wanted_assets, &combined_dir)?;

    // Consolidate VFX asset paths under the porting prefix.
    if !clean_prefix.is_empty() {
        consolidate_bin(&mut main, &clean_prefix);
    }

    // Write the combined BIN, then convert it to donor py text.
    if let Some(parent) = combined_main.parent() {
        std::fs::create_dir_all(parent).map_err(|e| Error::io_with_path(e, parent))?;
    }
    let bytes = write_bin(&main).map_err(|e| Error::BinConversion {
        message: e.to_string(),
        path: Some(combined_main.clone()),
    })?;
    std::fs::write(&combined_main, &bytes).map_err(|e| Error::io_with_path(e, &combined_main))?;

    let text = bin_to_text(&main)?;
    let py_path = combined_main.with_extension("py");
    let _ = std::fs::write(&py_path, &text);

    Ok(DonorResult {
        donor_py_content: text,
        temp_root: temp_root.to_string_lossy().into_owned(),
        combined_bin_path: combined_main.to_string_lossy().into_owned(),
        champion_file_name: champ_file,
        skin_id: skin,
        selected_bin_count: selected.len(),
        extracted_asset_count,
        cache_hit: false,
    })
}

/// Convert an on-disk combined BIN back to donor py text (cache-hit path).
fn donor_text_from_combined(combined_main: &Path) -> Option<String> {
    let bin = try_read_bin(combined_main)?;
    bin_to_text(&bin).ok()
}

/// Delete a previously created donor temp cache root.
pub fn cleanup_temp(temp_root: &Path) {
    let _ = std::fs::remove_dir_all(temp_root);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_skin_id_handles_chroma() {
        assert_eq!(normalize_skin_id(0), 0);
        assert_eq!(normalize_skin_id(14), 14);
        assert_eq!(normalize_skin_id(14001), 1);
    }

    #[test]
    fn prefix_asset_is_idempotent() {
        let once = prefix_asset("assets/foo/bar.dds", "mod");
        assert_eq!(once, "assets/mod/foo/bar.dds");
        assert_eq!(prefix_asset(&once, "mod"), once);
    }

    #[test]
    fn sanitize_strips_specials() {
        assert_eq!(sanitize_prefix(" My-Mod 1! "), "mymod1");
    }
}
