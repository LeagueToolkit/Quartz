use std::fs;
use std::io::Cursor;
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

    // Use in-memory buffer: Bin::to_writer seeks heavily (~336k lseeks),
    // BufWriter<File> flushes on every seek. Cursor<Vec> makes seeks free.
    let start = Instant::now();
    let mut writer = Cursor::new(Vec::new());
    tree.to_writer(&mut writer)
        .map_err(|e| format!("Failed to write bin: {}", e))?;
    fs::write(&bin_path, writer.into_inner())
        .map_err(|e| format!("Failed to write {}: {}", bin_path.display(), e))?;
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
