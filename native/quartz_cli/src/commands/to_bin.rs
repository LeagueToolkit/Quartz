use std::fs::{self, File};
use std::io::BufWriter;
use std::path::Path;
use std::time::Instant;

use ltk_ritobin::parse;

pub fn run(py_path: &Path) -> Result<(), String> {
    let text = fs::read_to_string(py_path)
        .map_err(|e| format!("Failed to read {}: {}", py_path.display(), e))?;

    let start = Instant::now();
    let file_ast = parse(&text)
        .map_err(|e| format!("Failed to parse py: {}", e))?;
    let tree = file_ast.to_bin_tree();
    let parse_time = start.elapsed();

    let bin_path = py_path.with_extension("bin");
    let out_file = File::create(&bin_path)
        .map_err(|e| format!("Failed to create {}: {}", bin_path.display(), e))?;

    let start = Instant::now();
    let mut writer = BufWriter::new(out_file);
    tree.to_writer(&mut writer)
        .map_err(|e| format!("Failed to write bin: {}", e))?;
    let write_time = start.elapsed();

    eprintln!(
        "OK: {} -> {} ({} objects, parse {:.1}ms, write {:.1}ms)",
        py_path.display(),
        bin_path.display(),
        tree.objects.len(),
        parse_time.as_secs_f64() * 1000.0,
        write_time.as_secs_f64() * 1000.0,
    );

    Ok(())
}
