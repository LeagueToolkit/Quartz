use std::fs::{self, File};
use std::io::BufReader;
use std::path::Path;
use std::time::Instant;

use ltk_meta::Bin;
use ltk_ritobin::writer::write_with_hashes;

use crate::hashes::load_bin_hashes;

pub fn run(bin_path: &Path, hash_dir: Option<&Path>) -> Result<(), String> {
    let file = File::open(bin_path)
        .map_err(|e| format!("Failed to open {}: {}", bin_path.display(), e))?;
    let mut reader = BufReader::new(file);

    let start = Instant::now();
    let tree = Bin::from_reader(&mut reader)
        .map_err(|e| format!("Failed to parse bin: {}", e))?;
    let parse_time = start.elapsed();

    let hashes = match hash_dir {
        Some(dir) => load_bin_hashes(dir),
        None => Default::default(),
    };

    let start = Instant::now();
    let output = write_with_hashes(&tree, &hashes)
        .map_err(|e| format!("Failed to write text: {}", e))?;
    let write_time = start.elapsed();

    let py_path = bin_path.with_extension("py");
    fs::write(&py_path, &output)
        .map_err(|e| format!("Failed to write {}: {}", py_path.display(), e))?;

    eprintln!(
        "OK: {} -> {} ({} objects, parse {:.1}ms, write {:.1}ms)",
        bin_path.display(),
        py_path.display(),
        tree.objects.len(),
        parse_time.as_secs_f64() * 1000.0,
        write_time.as_secs_f64() * 1000.0,
    );

    Ok(())
}
