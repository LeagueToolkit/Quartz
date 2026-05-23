use std::collections::HashSet;
use std::fs;
use std::path::Path;

use ltk_meta::BinObject;

use crate::utils::{fnv1a_32, find_root_dir, read_bin, write_bin};

fn detect_champ_name(path: &Path) -> Option<String> {
    let posix = path.to_string_lossy().replace('\\', "/").to_lowercase();
    let marker = "/characters/";
    let start = posix.find(marker)? + marker.len();
    let rest = &posix[start..];
    let end = rest.find('/')?;
    Some(rest[..end].to_string())
}

fn capitalize_first(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        Some(c) => c.to_ascii_uppercase().to_string() + chars.as_str(),
        None => String::new(),
    }
}

pub fn run(bin_path: &Path) -> Result<(), String> {
    let root_dir = find_root_dir(bin_path);

    eprintln!("--- CONTENT-BASED VFX SEPARATION ---");

    let vfx_type_hash = fnv1a_32("VfxSystemDefinitionData");
    eprintln!("  VFX Type Hash: {:08x} (int: {})", vfx_type_hash, vfx_type_hash);

    // Refuse to run when the input is already a pure split-vfx bin
    // (every entry is VfxSystemDefinitionData). Otherwise we'd hollow it
    // out and chain a new "<name>_vfx.bin" link beside it.
    {
        let input_bin = read_bin(bin_path)?;
        if !input_bin.objects.is_empty()
            && input_bin
                .objects
                .values()
                .all(|obj| obj.class_hash == vfx_type_hash)
        {
            eprintln!(
                "Input bin already contains only VfxSystemDefinitionData entries — already separated. Nothing to do."
            );
            return Ok(());
        }
    }

    let mut all_vfx_entries: Vec<(u32, BinObject)> = Vec::new();
    let mut managed_hashes: HashSet<u32> = HashSet::new();

    // Collect files to scan: main bin + all .bin files in root_dir
    let mut files_to_scan = vec![bin_path.to_path_buf()];
    if let Ok(entries) = fs::read_dir(&root_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.extension().map(|e| e.to_ascii_lowercase()) == Some("bin".into())
                && p != bin_path
            {
                files_to_scan.push(p);
            }
        }
    }

    for f_path in &files_to_scan {
        let mut bin = match read_bin(f_path) {
            Ok(b) => b,
            Err(_) => continue,
        };

        let mut extracted_count = 0u32;
        let mut vfx_keys: Vec<u32> = Vec::new();

        for (&path_hash, obj) in &bin.objects {
            if obj.class_hash == vfx_type_hash && !managed_hashes.contains(&path_hash) {
                vfx_keys.push(path_hash);
                managed_hashes.insert(path_hash);
                extracted_count += 1;
            }
        }

        if extracted_count > 0 {
            let name = f_path.file_name().unwrap_or_default().to_string_lossy();
            eprintln!("  [EXTRACT] {} VFX from {}", extracted_count, name);

            for key in &vfx_keys {
                if let Some(obj) = bin.objects.swap_remove(key) {
                    all_vfx_entries.push((*key, obj));
                }
            }

            write_bin(f_path, &bin)?;
        }
    }

    if all_vfx_entries.is_empty() {
        eprintln!("No VFX systems found in any bin.");
        return Ok(());
    }

    // Create the new VFX bin
    let stem = bin_path.file_stem().unwrap_or_default().to_string_lossy();
    let stem_lower = stem.to_lowercase();
    let (file_name_lower, link_name) = if let Some(champ) = detect_champ_name(bin_path) {
        let champ_cap = capitalize_first(&champ);
        (
            format!("{}_vfx_{}.bin", champ.to_lowercase(), stem_lower),
            format!("{}_vfx_{}.bin", champ_cap, stem_lower),
        )
    } else {
        (
            format!("{}_vfx.bin", stem_lower),
            format!("{}_vfx.bin", capitalize_first(&stem_lower)),
        )
    };
    let vfx_path = root_dir.join("data").join(&file_name_lower);

    if let Some(parent) = vfx_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory {}: {}", parent.display(), e))?;
    }

    let mut vfx_bin = ltk_meta::Bin::default();
    for (path_hash, obj) in all_vfx_entries.iter() {
        vfx_bin.objects.insert(*path_hash, obj.clone());
    }
    write_bin(&vfx_path, &vfx_bin)?;

    // Update main bin with the dependency link.
    // Case-insensitive check so re-runs of older mods (data/...) don't get a duplicate.
    let mut main_bin = read_bin(bin_path)?;
    let link_str = format!("DATA/{}", link_name);
    let already_linked = main_bin
        .dependencies
        .iter()
        .any(|d| d.eq_ignore_ascii_case(&link_str));
    if !already_linked {
        main_bin.add_dependency(&link_str);
    }
    write_bin(bin_path, &main_bin)?;

    eprintln!(
        "\n[OK] SUCCESS: Created data/{} with {} systems (link: {}).",
        file_name_lower,
        all_vfx_entries.len(),
        link_str
    );

    Ok(())
}
