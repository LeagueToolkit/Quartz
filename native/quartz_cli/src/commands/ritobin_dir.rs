use std::path::{Path, PathBuf};

use super::{to_bin, to_py};

fn walk_files(dir: &Path, ext: &str, out: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = std::fs::read_dir(dir)
        .map_err(|e| format!("Failed to read dir {}: {}", dir.display(), e))?;
    for e in entries {
        let e = e.map_err(|err| format!("Failed to read dir entry in {}: {}", dir.display(), err))?;
        let p = e.path();
        if p.is_dir() {
            walk_files(&p, ext, out)?;
        } else if p
            .extension()
            .and_then(|x| x.to_str())
            .map(|x| x.eq_ignore_ascii_case(ext))
            .unwrap_or(false)
        {
            out.push(p);
        }
    }
    Ok(())
}

pub fn bin_to_py_dir(dir: &Path, hash_dir: Option<&Path>) -> Result<(), String> {
    let mut files = Vec::new();
    walk_files(dir, "bin", &mut files)?;
    let total = files.len();
    let mut ok = 0usize;
    let mut failed = 0usize;

    for f in files {
        match to_py::run(&f, hash_dir) {
            Ok(_) => ok += 1,
            Err(e) => {
                failed += 1;
                eprintln!("Error: {} ({})", f.display(), e);
            }
        }
    }

    eprintln!(
        "DONE: BIN->PY in {} | total={}, ok={}, failed={}",
        dir.display(),
        total,
        ok,
        failed
    );

    if failed > 0 {
        return Err(format!("{} file(s) failed during BIN->PY", failed));
    }
    Ok(())
}

pub fn py_to_bin_dir(dir: &Path) -> Result<(), String> {
    let mut files = Vec::new();
    walk_files(dir, "py", &mut files)?;
    let total = files.len();
    let mut ok = 0usize;
    let mut failed = 0usize;

    for f in files {
        match to_bin::run(&f) {
            Ok(_) => ok += 1,
            Err(e) => {
                failed += 1;
                eprintln!("Error: {} ({})", f.display(), e);
            }
        }
    }

    eprintln!(
        "DONE: PY->BIN in {} | total={}, ok={}, failed={}",
        dir.display(),
        total,
        ok,
        failed
    );

    if failed > 0 {
        return Err(format!("{} file(s) failed during PY->BIN", failed));
    }
    Ok(())
}

