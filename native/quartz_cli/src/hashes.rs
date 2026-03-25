use std::env;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use heed::types::{Bytes, Str};
use heed::EnvOpenOptions;
use ltk_ritobin::hashes::HashMapProvider;

/// Default hash directory: %APPDATA%/FrogTools/hashes/
pub fn default_hash_dir() -> Option<PathBuf> {
    env::var("APPDATA")
        .ok()
        .map(|appdata| PathBuf::from(appdata).join("FrogTools").join("hashes"))
}

/// Load bin hashes from the pre-built LMDB at `dir/hashes-bin.lmdb` (named DB "bin").
///
/// The pre-built LMDB from lmdb-hashes merges all 4 bin hash categories into one DB.
/// We load every entry into all 4 HashMapProvider fields (entries, fields, hashes, types)
/// so lookups work regardless of which category the caller needs.
pub fn load_bin_hashes(dir: &Path) -> HashMapProvider {
    let mut hashes = HashMapProvider::new();

    let lmdb_dir = dir.join("hashes-bin.lmdb");
    if lmdb_dir.exists() {
        if let Ok(env) = unsafe {
            EnvOpenOptions::new()
                .map_size(512 * 1024 * 1024)
                .max_dbs(2)
                .open(&lmdb_dir)
        } {
            if let Ok(rtxn) = env.read_txn() {
                if let Ok(Some(db)) = env.open_database::<Bytes, Str>(&rtxn, Some("bin")) {
                    if let Ok(iter) = db.iter(&rtxn) {
                        let mut count = 0u32;
                        for result in iter {
                            if let Ok((key_bytes, val_str)) = result {
                                if key_bytes.len() == 4 {
                                    let hash = u32::from_be_bytes([
                                        key_bytes[0],
                                        key_bytes[1],
                                        key_bytes[2],
                                        key_bytes[3],
                                    ]);
                                    let s = val_str.to_string();
                                    hashes.entries.insert(hash, s.clone());
                                    hashes.fields.insert(hash, s.clone());
                                    hashes.hashes.insert(hash, s.clone());
                                    hashes.types.insert(hash, s);
                                    count += 1;
                                }
                            }
                        }
                        eprintln!("[BIN] Loaded {} bin hashes from LMDB", count);
                    }
                }
            }
        }
    } else {
        eprintln!(
            "[BIN] LMDB not found at {}, bin hashes will be hex-only",
            lmdb_dir.display()
        );
    }

    // Merge extracted bin hashes overlay
    merge_extracted_binhashes(&mut hashes, &dir.join("hashes.binhashes.extracted.txt"));

    hashes
}

fn merge_extracted_binhashes(hashes: &mut HashMapProvider, file: &Path) {
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
                let s = name.trim().to_string();
                hashes.entries.entry(hash).or_insert_with(|| s.clone());
                hashes.fields.entry(hash).or_insert_with(|| s.clone());
                hashes.hashes.entry(hash).or_insert_with(|| s.clone());
                hashes.types.entry(hash).or_insert(s);
            }
        }
    }
}
