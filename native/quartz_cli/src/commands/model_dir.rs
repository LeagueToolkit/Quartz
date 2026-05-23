// Batch model conversion: walk a directory, convert every supported file
// (XPS variants → .fbx, or .pmx → .fbx) using the same per-file commands
// as the single-file Quartz right-click entries. Recursive by default,
// stops on no input files, prints per-file errors, returns Err if any
// file failed so the shell shows non-zero exit.

use std::path::{Path, PathBuf};

use super::{pmx, xps};

const XPS_EXTS: &[&str] = &["xps", "mesh", "ascii"];
const PMX_EXTS: &[&str] = &["pmx"];

fn walk_files(dir: &Path, exts: &[&str], out: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = std::fs::read_dir(dir)
        .map_err(|e| format!("Failed to read dir {}: {}", dir.display(), e))?;
    for e in entries {
        let e = e.map_err(|err| format!("Failed to read dir entry in {}: {}", dir.display(), err))?;
        let p = e.path();
        if p.is_dir() {
            walk_files(&p, exts, out)?;
        } else {
            let ext_match = p
                .extension()
                .and_then(|x| x.to_str())
                .map(|x| exts.iter().any(|target| target.eq_ignore_ascii_case(x)))
                .unwrap_or(false);
            if ext_match {
                out.push(p);
            }
        }
    }
    Ok(())
}

pub fn xps_to_fbx_dir(dir: &Path) -> Result<(), String> {
    let mut files = Vec::new();
    walk_files(dir, XPS_EXTS, &mut files)?;
    let total = files.len();

    if total == 0 {
        eprintln!(
            "No .xps / .mesh / .ascii files found under {}",
            dir.display()
        );
        return Ok(());
    }

    let mut ok = 0usize;
    let mut failed = 0usize;

    for (idx, f) in files.iter().enumerate() {
        eprintln!("[{}/{}] {}", idx + 1, total, f.display());
        match xps::xps2fbx(f, None) {
            Ok(_) => ok += 1,
            Err(e) => {
                failed += 1;
                eprintln!("  Error: {}", e);
            }
        }
    }

    eprintln!(
        "DONE: XPS->FBX in {} | total={}, ok={}, failed={}",
        dir.display(),
        total,
        ok,
        failed
    );

    if failed > 0 {
        return Err(format!("{} file(s) failed during XPS->FBX", failed));
    }
    Ok(())
}

pub fn pmx_to_fbx_dir(dir: &Path) -> Result<(), String> {
    let mut files = Vec::new();
    walk_files(dir, PMX_EXTS, &mut files)?;
    let total = files.len();

    if total == 0 {
        eprintln!("No .pmx files found under {}", dir.display());
        return Ok(());
    }

    let mut ok = 0usize;
    let mut failed = 0usize;

    for (idx, f) in files.iter().enumerate() {
        eprintln!("[{}/{}] {}", idx + 1, total, f.display());
        match pmx::pmx2fbx(f, None) {
            Ok(_) => ok += 1,
            Err(e) => {
                failed += 1;
                eprintln!("  Error: {}", e);
            }
        }
    }

    eprintln!(
        "DONE: PMX->FBX in {} | total={}, ok={}, failed={}",
        dir.display(),
        total,
        ok,
        failed
    );

    if failed > 0 {
        return Err(format!("{} file(s) failed during PMX->FBX", failed));
    }
    Ok(())
}
