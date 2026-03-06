use std::env;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

use ltk_ritobin::hashes::HashMapProvider;

/// Default hash directory: %APPDATA%/FrogTools/hashes/
pub fn default_hash_dir() -> Option<PathBuf> {
    env::var("APPDATA")
        .ok()
        .map(|appdata| PathBuf::from(appdata).join("FrogTools").join("hashes"))
}

/// Load bin hashes from a directory (binentries, binfields, binhashes, bintypes).
pub fn load_bin_hashes(dir: &std::path::Path) -> HashMapProvider {
    let mut hashes = HashMapProvider::new();
    if dir.exists() {
        hashes.load_from_directory(dir);
        merge_extracted_binhashes(&mut hashes, &dir.join("hashes.binhashes.extracted.txt"));
    }
    hashes
}

fn merge_extracted_binhashes(hashes: &mut HashMapProvider, file: &std::path::Path) {
    let Ok(f) = fs::File::open(file) else {
        return;
    };
    let reader = BufReader::new(f);
    for line in reader.lines().map_while(Result::ok) {
        let l = line.trim();
        if l.is_empty() || l.starts_with('#') {
            continue;
        }
        if let Some((hash_str, name)) = l.split_once(' ') {
            if let Ok(hash) = u32::from_str_radix(hash_str.trim_start_matches("0x"), 16) {
                hashes.hashes.entry(hash).or_insert_with(|| name.trim().to_string());
            }
        }
    }
}
