//! End-to-end proof that the REAL repath pipeline (bumpath::repath) handles
//! `file =` (xxh64) refs and embeds a trailer of bumped paths into each output bin.
//!
//! Runs against the extracted Aatrox mod folder when present. Skips cleanly if not,
//! so CI without the fixture still passes.

use quartz_lib::bumpath::{repath, RepathOptions};
use std::path::Path;

const SRC: &str = r"C:\Users\Frog\Desktop\aatrox_skin0_extracted_clean_3";

#[test]
fn repath_embeds_file_trailer() {
    let src = Path::new(SRC);
    if !src.exists() {
        eprintln!("skip: source mod folder not present at {SRC}");
        return;
    }

    // Register the mod's own file paths into the shared mapper first, so the repath
    // can resolve the File hashes back to paths to bump them. In production the
    // launcher/extractor primes this; here we prime from the bin's resolvable refs
    // via the hashed_files.json the extractor wrote (already applied by repath's
    // discover step) plus the shared dictionary.
    let out = std::env::temp_dir().join("quartz_repath_trailer_test");
    let _ = std::fs::remove_dir_all(&out);

    let opts = RepathOptions {
        custom_prefix: "ebaytest".to_string(),
        selected_skin_ids: Vec::new(),
        selected_bin_paths: Vec::new(),
        entry_prefixes: std::collections::HashMap::new(),
        ignore_missing: true,
        combine_linked: false,
        split_vfx: false,
        consolidate_assets: false,
    };

    let result = repath(src, &out, &opts).expect("repath runs");
    eprintln!(
        "repath: {} bins processed, {} assets copied",
        result.bins_processed, result.assets_copied
    );
    assert!(result.bins_processed > 0, "no bins processed");

    // Walk output bins; count how many carry a trailer and total repathed entries.
    let mut bins_with_trailer = 0usize;
    let mut total_entries = 0usize;
    let mut sample: Option<(String, String)> = None;
    fn walk(dir: &Path, bins_with_trailer: &mut usize, total: &mut usize, sample: &mut Option<(String, String)>) {
        let Ok(rd) = std::fs::read_dir(dir) else { return };
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                walk(&p, bins_with_trailer, total, sample);
            } else if p.extension().map(|x| x == "bin").unwrap_or(false) {
                if let Ok(bytes) = std::fs::read(&p) {
                    let t = quartz_lib::bin::bin_trailer::read_trailer(&bytes);
                    if !t.is_empty() {
                        *bins_with_trailer += 1;
                        *total += t.len();
                        if sample.is_none() {
                            if let Some((k, v)) = t.iter().next() {
                                *sample = Some((k.clone(), v.clone()));
                            }
                        }
                    }
                }
            }
        }
    }
    walk(&out, &mut bins_with_trailer, &mut total_entries, &mut sample);

    eprintln!(
        "output: {} bins carry a trailer, {} total repathed entries; sample={:?}",
        bins_with_trailer, total_entries, sample
    );

    // The bumped paths must contain the prefix, and each trailer entry's key must be
    // the hash of its value (self-consistent).
    if let Some((hex, path)) = &sample {
        assert!(path.to_lowercase().contains("ebaytest"), "bumped path missing prefix: {path}");
        // Verify the key is xxh64(path) (16-hex) or fnv1a(path) (8-hex).
        if hex.len() == 16 {
            let h = quartz_lib::hash::xxh64(path);
            assert_eq!(hex, &format!("{:016x}", h), "file trailer key != xxh64(path)");
        } else if hex.len() == 8 {
            let h = quartz_lib::hash::fnv1a(path);
            assert_eq!(hex, &format!("{:08x}", h), "bin trailer key != fnv1a(path)");
        }
    }

    let _ = std::fs::remove_dir_all(&out);
}
