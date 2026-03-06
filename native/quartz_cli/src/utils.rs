use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::path::{Path, PathBuf};

use ltk_meta::Bin;

/// FNV-1a 32-bit hash (same algorithm League uses for bin class/path hashes).
pub fn fnv1a_32(s: &str) -> u32 {
    let mut hash: u32 = 0x811c_9dc5;
    for byte in s.to_lowercase().bytes() {
        hash ^= byte as u32;
        hash = hash.wrapping_mul(0x0100_0193);
    }
    hash
}

/// Walk up from a path to find the "data" folder, return its parent as root_dir.
pub fn find_root_dir(bin_path: &Path) -> PathBuf {
    let mut temp = bin_path.parent().unwrap().to_path_buf();
    loop {
        if temp.file_name().map(|n| n.to_ascii_lowercase()) == Some("data".into()) {
            return temp.parent().unwrap().to_path_buf();
        }
        match temp.parent() {
            Some(p) if p != temp => temp = p.to_path_buf(),
            _ => break,
        }
    }
    bin_path.parent().unwrap().to_path_buf()
}

pub fn read_bin(path: &Path) -> Result<Bin, String> {
    let file = File::open(path)
        .map_err(|e| format!("Failed to open {}: {}", path.display(), e))?;
    let mut reader = BufReader::new(file);
    Bin::from_reader(&mut reader)
        .map_err(|e| format!("Failed to parse {}: {}", path.display(), e))
}

pub fn write_bin(path: &Path, bin: &Bin) -> Result<(), String> {
    let file = File::create(path)
        .map_err(|e| format!("Failed to create {}: {}", path.display(), e))?;
    let mut writer = BufWriter::new(file);
    bin.to_writer(&mut writer)
        .map_err(|e| format!("Failed to write {}: {}", path.display(), e))
}
