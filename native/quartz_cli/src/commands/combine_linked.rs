use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use xxhash_rust::xxh64::xxh64;

use crate::utils::{find_root_dir, read_bin, write_bin};

/// Compute xxhash64 of a path (same as WADHasher.raw_to_hex).
fn wad_hash(s: &str) -> u64 {
    xxh64(s.as_bytes(), 0)
}

/// Extract champion name from path like "/characters/akali/skins/..."
fn detect_champ_name(path: &Path) -> Option<String> {
    let posix = path.to_string_lossy().replace('\\', "/").to_lowercase();
    let marker = "/characters/";
    let start = posix.find(marker)? + marker.len();
    let rest = &posix[start..];
    let end = rest.find('/')?;
    Some(rest[..end].to_string())
}

pub fn run(bin_path: &Path) -> Result<(), String> {
    let main_bin_path = bin_path.to_path_buf();
    let root_dir = find_root_dir(bin_path);

    eprintln!("--- CONTENT-BASED MERGE ---");
    eprintln!("Main BIN: {}", main_bin_path.file_name().unwrap_or_default().to_string_lossy());
    eprintln!("Scanning Root: {}", root_dir.display());

    // 2. Read Main BIN
    let mut main_bin = read_bin(&main_bin_path)?;
    let mut main_entry_hashes: HashSet<u32> = main_bin.objects.keys().copied().collect();

    // 3. Detect champ name to skip base bin
    let champ_name = detect_champ_name(&main_bin_path);

    // Load hashed_files.json
    let mut path_to_hash: HashMap<String, String> = HashMap::new();
    let hashed_json_path = root_dir.join("hashed_files.json");
    if hashed_json_path.exists() {
        if let Ok(content) = fs::read_to_string(&hashed_json_path) {
            if let Ok(data) = serde_json::from_str::<HashMap<String, String>>(&content) {
                eprintln!("  Loaded {} entries from hashed_files.json", data.len());
                for (hashed_name, orig_path) in &data {
                    let h = hashed_name.replace(".bin", "").to_lowercase();
                    let p = orig_path.to_lowercase().replace('\\', "/");
                    path_to_hash.insert(p, h);
                }
            }
        }
    } else {
        eprintln!("  No hashed_files.json found (files may not be hashed)");
    }

    // Helpers
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

    // 4. Find bins via LINKS
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

        let mut candidates: Vec<(PathBuf, &str)> = vec![
            (root_dir.join(&link_name), "name"),
            (root_dir.join(link), "path"),
        ];

        // Try hash lookup from hashed_files.json
        let mut hashed_name: Option<String> = None;
        if let Some(h) = path_to_hash.get(&normalized_link) {
            hashed_name = Some(format!("{}.bin", h));
            candidates.push((root_dir.join(format!("{}.bin", h)), "hash-lookup"));
        }

        // Fallback: compute xxhash64
        if hashed_name.is_none() {
            let computed = format!("{:016x}.bin", wad_hash(&normalized_link));
            candidates.push((root_dir.join(&computed), "hash-computed"));
            hashed_name = Some(computed);
        }

        eprintln!("  Link: {}", link);
        if let Some(ref h) = hashed_name {
            eprintln!("    -> Hash: {}", h);
        }

        let mut found = false;
        for (cand, method) in &candidates {
            if cand.exists() && cand.is_file() {
                let resolved = cand.canonicalize().unwrap_or_else(|_| cand.clone());
                if !processed_paths.contains(&resolved) && !is_base_bin(cand) && !is_main_bin(cand)
                {
                    eprintln!("    -> Found via {}: {}", method, cand.file_name().unwrap_or_default().to_string_lossy());
                    files_to_process.push((cand.clone(), link.clone()));
                    processed_paths.insert(resolved);
                    found = true;
                }
                break;
            }
        }

        if !found {
            eprintln!("    -> NOT FOUND");
        }
    }

    let mut merged_files: Vec<PathBuf> = Vec::new();
    let mut links_to_remove: HashSet<String> = HashSet::new();

    for (f, original_link) in &files_to_process {
        match read_bin(f) {
            Ok(mystery_bin) => {
                let mut new_entries = Vec::new();
                for (&path_hash, obj) in &mystery_bin.objects {
                    if !main_entry_hashes.contains(&path_hash) {
                        new_entries.push((path_hash, obj.clone()));
                    }
                }

                if !new_entries.is_empty() {
                    eprintln!(
                        "  [MERGE] Found {} relevant entries in {}",
                        new_entries.len(),
                        f.file_name().unwrap_or_default().to_string_lossy()
                    );
                    eprintln!("          (Matched via link: {})", original_link);

                    for (path_hash, obj) in new_entries {
                        main_entry_hashes.insert(path_hash);
                        main_bin.objects.insert(path_hash, obj);
                    }
                    merged_files.push(f.clone());
                    links_to_remove.insert(original_link.clone());
                }
            }
            Err(e) => {
                eprintln!("  [Error] Failed to merge {}: {}", f.file_name().unwrap_or_default().to_string_lossy(), e);
            }
        }
    }

    if merged_files.is_empty() {
        eprintln!("No matching content found to merge.");
        return Ok(());
    }

    // 5. Save and Cleanup — filter links
    let mut new_links: Vec<String> = Vec::new();
    for link in &main_bin.dependencies {
        if links_to_remove.contains(link) {
            continue;
        }
        let is_champ_bin = champ_name
            .as_ref()
            .map(|c| link.to_lowercase().contains(&format!("{}.bin", c)))
            .unwrap_or(false);
        let is_non_bin = link.contains('/') && !link.ends_with(".bin");

        if is_champ_bin || is_non_bin {
            new_links.push(link.clone());
        }
    }
    main_bin.dependencies = new_links;

    write_bin(&main_bin_path, &main_bin)?;

    for f in &merged_files {
        if let Err(e) = fs::remove_file(f) {
            eprintln!("  Warning: could not delete {}: {}", f.display(), e);
        }
    }

    eprintln!(
        "\n[OK] SUCCESS: Combined {} files into {}",
        merged_files.len(),
        main_bin_path.file_name().unwrap_or_default().to_string_lossy()
    );

    Ok(())
}
