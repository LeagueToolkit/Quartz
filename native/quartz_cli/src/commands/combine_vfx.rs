use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use xxhash_rust::xxh64::xxh64;

use crate::utils::{fnv1a_32, find_root_dir, read_bin, write_bin};

fn wad_hash(s: &str) -> u64 {
    xxh64(s.as_bytes(), 0)
}

fn detect_champ_name(path: &Path) -> Option<String> {
    let posix = path.to_string_lossy().replace('\\', "/").to_lowercase();
    let marker = "/characters/";
    let start = posix.find(marker)? + marker.len();
    let rest = &posix[start..];
    let end = rest.find('/')?;
    Some(rest[..end].to_string())
}

/// Heuristic: only merge bins that look like a separate-vfx output.
/// Matches `<champ>_vfx*.bin` (case-insensitive) so the user can hand-name
/// their split bins as long as they include the `_vfx` marker.
fn looks_like_split_vfx(file_name: &str) -> bool {
    file_name.to_ascii_lowercase().contains("_vfx")
}

pub fn run(bin_path: &Path) -> Result<(), String> {
    let main_bin_path = bin_path.to_path_buf();
    let root_dir = find_root_dir(bin_path);

    eprintln!("--- VFX MERGE (split bins only) ---");
    eprintln!(
        "Main BIN: {}",
        main_bin_path.file_name().unwrap_or_default().to_string_lossy()
    );

    let vfx_type_hash = fnv1a_32("VfxSystemDefinitionData");
    eprintln!("  VfxSystemDefinitionData Type Hash: {:08x}", vfx_type_hash);

    let mut main_bin = read_bin(&main_bin_path)?;
    let mut main_entry_hashes: HashSet<u32> = main_bin.objects.keys().copied().collect();

    let champ_name = detect_champ_name(&main_bin_path);

    let mut path_to_hash: HashMap<String, String> = HashMap::new();
    let hashed_json_path = root_dir.join("hashed_files.json");
    if hashed_json_path.exists() {
        if let Ok(content) = fs::read_to_string(&hashed_json_path) {
            if let Ok(data) = serde_json::from_str::<HashMap<String, String>>(&content) {
                for (hashed_name, orig_path) in &data {
                    let h = hashed_name.replace(".bin", "").to_lowercase();
                    let p = orig_path.to_lowercase().replace('\\', "/");
                    path_to_hash.insert(p, h);
                }
            }
        }
    }

    let is_base_bin = |p: &Path| -> bool {
        if let Some(ref champ) = champ_name {
            p.file_name()
                .map(|n| n.to_string_lossy().to_lowercase() == format!("{}.bin", champ))
                .unwrap_or(false)
        } else {
            false
        }
    };
    let is_main_bin = |p: &Path| -> bool {
        p.canonicalize().ok() == main_bin_path.canonicalize().ok()
    };

    let links: Vec<String> = main_bin.dependencies.clone();
    eprintln!("\n--- LINKED BINS ({} links) ---", links.len());

    let mut files_to_process: Vec<(PathBuf, String)> = Vec::new();
    let mut processed_paths: HashSet<PathBuf> = HashSet::new();

    for link in &links {
        if !link.to_lowercase().ends_with(".bin") {
            continue;
        }

        let link_name = Path::new(link).file_name().unwrap_or_default().to_string_lossy().to_string();
        let normalized_link = link.to_lowercase().replace('\\', "/");

        // Skip links that don't look like a custom-split vfx bin so the
        // generic "combine linked" remains the catch-all merger.
        if !looks_like_split_vfx(&link_name) {
            continue;
        }

        let mut candidates: Vec<(PathBuf, &str)> = vec![
            (root_dir.join(&link_name), "name"),
            (root_dir.join(link), "path"),
        ];

        if let Some(h) = path_to_hash.get(&normalized_link) {
            candidates.push((root_dir.join(format!("{}.bin", h)), "hash-lookup"));
        } else {
            let computed = format!("{:016x}.bin", wad_hash(&normalized_link));
            candidates.push((root_dir.join(&computed), "hash-computed"));
        }

        for (cand, method) in &candidates {
            if cand.exists() && cand.is_file() {
                let resolved = cand.canonicalize().unwrap_or_else(|_| cand.clone());
                if !processed_paths.contains(&resolved) && !is_base_bin(cand) && !is_main_bin(cand) {
                    eprintln!(
                        "  Link: {} -> {} (via {})",
                        link,
                        cand.file_name().unwrap_or_default().to_string_lossy(),
                        method
                    );
                    files_to_process.push((cand.clone(), link.clone()));
                    processed_paths.insert(resolved);
                }
                break;
            }
        }
    }

    let mut links_to_remove: HashSet<String> = HashSet::new();
    let mut files_to_delete: Vec<PathBuf> = Vec::new();
    let mut total_merged = 0usize;

    for (f, original_link) in &files_to_process {
        match read_bin(f) {
            Ok(mut linked_bin) => {
                let vfx_keys: Vec<u32> = linked_bin
                    .objects
                    .iter()
                    .filter(|(_, obj)| obj.class_hash == vfx_type_hash)
                    .map(|(&k, _)| k)
                    .collect();

                if vfx_keys.is_empty() {
                    continue;
                }

                let mut merged_here = 0;
                for key in &vfx_keys {
                    if main_entry_hashes.contains(key) {
                        continue;
                    }
                    if let Some(obj) = linked_bin.objects.swap_remove(key) {
                        main_entry_hashes.insert(*key);
                        main_bin.objects.insert(*key, obj);
                        merged_here += 1;
                    }
                }

                if merged_here == 0 {
                    continue;
                }

                eprintln!(
                    "  [MERGE] {} VfxSystemDefinitionData entries from {} (link: {})",
                    merged_here,
                    f.file_name().unwrap_or_default().to_string_lossy(),
                    original_link
                );
                total_merged += merged_here;

                if linked_bin.objects.is_empty() {
                    files_to_delete.push(f.clone());
                    links_to_remove.insert(original_link.clone());
                } else {
                    if let Err(e) = write_bin(f, &linked_bin) {
                        eprintln!("  Warning: could not rewrite {}: {}", f.display(), e);
                    }
                }
            }
            Err(e) => {
                eprintln!(
                    "  [Error] Failed to read {}: {}",
                    f.file_name().unwrap_or_default().to_string_lossy(),
                    e
                );
            }
        }
    }

    if total_merged == 0 {
        eprintln!("No VfxSystemDefinitionData entries found in split-vfx linked bins.");
        return Ok(());
    }

    if !links_to_remove.is_empty() {
        let new_links: Vec<String> = main_bin
            .dependencies
            .iter()
            .filter(|l| !links_to_remove.contains(*l))
            .cloned()
            .collect();
        main_bin.dependencies = new_links;
    }

    write_bin(&main_bin_path, &main_bin)?;

    for f in &files_to_delete {
        if let Err(e) = fs::remove_file(f) {
            eprintln!("  Warning: could not delete {}: {}", f.display(), e);
        }
    }

    eprintln!(
        "\n[OK] SUCCESS: Merged {} VfxSystemDefinitionData entries into {}",
        total_merged,
        main_bin_path.file_name().unwrap_or_default().to_string_lossy()
    );

    Ok(())
}
