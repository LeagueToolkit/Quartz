/* Headless convert dispatcher for the Windows Explorer right-click menu.
When the app exe is launched with a convert verb + path (registered by
context_menu.rs), we run the conversion and exit BEFORE Tauri starts — no
window, no sidecar binary. Output goes to the parent console (attached on
Windows) so the user sees success/errors. */

use std::path::{Path, PathBuf};

use quartz_lib::bin::{converter, ltk_bridge};
use quartz_lib::tex;

/// Inspect argv for a convert verb. Returns `Some(exit_code)` when a verb was
/// handled (caller must exit with it); `None` to continue to the normal app.
pub fn try_run() -> Option<i32> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        return None;
    }
    let verb = args[1].as_str();
    if !is_convert_verb(verb) {
        return None;
    }

    attach_console();

    let path_arg = args.get(2).map(|s| s.as_str()).unwrap_or("");
    if path_arg.is_empty() {
        eprintln!("Quartz: '{verb}' needs a file or folder path");
        return Some(2);
    }
    let path = PathBuf::from(path_arg);
    if !path.exists() {
        eprintln!("Quartz: path not found: {}", path.display());
        return Some(2);
    }

    let result = dispatch(verb, &path);
    match result {
        Ok(msg) => {
            println!("Quartz: {msg}");
            Some(0)
        }
        Err(e) => {
            eprintln!("Quartz: {verb} failed — {e}");
            Some(1)
        }
    }
}

fn is_convert_verb(verb: &str) -> bool {
    matches!(
        verb,
        "to-py" | "to-bin" | "separate-vfx" | "batch-split-vfx"
            | "tex2dds" | "tex2png" | "dds2tex" | "dds2png" | "png2tex" | "png2dds"
            | "ritobindir2py" | "ritobindir2bin"
            | "tex2ddsdir" | "dds2texdir" | "tex2pngdir" | "dds2pngdir" | "png2texdir" | "png2ddsdir"
            // Listed in the menu but their conversion logic lands in a later slice.
            | "combine-vfx" | "combine-linked" | "noskinlite" | "separate-anm" | "combine-anm"
    )
}

fn dispatch(verb: &str, path: &Path) -> Result<String, String> {
    match verb {
        "to-py" => bin_to_py(path),
        "to-bin" => py_to_bin(path),
        "separate-vfx" => separate_vfx(path),
        "batch-split-vfx" => batch_split_vfx(path),

        "tex2dds" => convert_texture(path, "dds", "dds:bc3"),
        "tex2png" => convert_texture(path, "png", "png"),
        "dds2tex" => convert_texture(path, "tex", "tex:bc3"),
        "dds2png" => convert_texture(path, "png", "png"),
        "png2tex" => convert_texture(path, "tex", "tex:bc3"),
        "png2dds" => convert_texture(path, "dds", "dds:bc3"),

        "ritobindir2py" => ritobin_dir(path, "bin"),
        "ritobindir2bin" => ritobin_dir(path, "py"),

        "tex2ddsdir" => texture_dir(path, "tex", "dds", "dds:bc3"),
        "dds2texdir" => texture_dir(path, "dds", "tex", "tex:bc3"),
        "tex2pngdir" => texture_dir(path, "tex", "png", "png"),
        "dds2pngdir" => texture_dir(path, "dds", "png", "png"),
        "png2texdir" => texture_dir(path, "png", "tex", "tex:bc3"),
        "png2ddsdir" => texture_dir(path, "png", "dds", "dds:bc3"),

        // Slated for the menu; logic arrives in a follow-up slice.
        "combine-vfx" | "combine-linked" | "noskinlite" | "separate-anm" | "combine-anm" => {
            Err(format!("'{verb}' is not implemented yet"))
        }
        _ => Err(format!("unknown verb '{verb}'")),
    }
}

/* ── bin <-> py ──────────────────────────────────────────────────────────── */

fn bin_to_py(bin_path: &Path) -> Result<String, String> {
    let data = std::fs::read(bin_path).map_err(|e| e.to_string())?;
    let tree = ltk_bridge::read_bin(&data).map_err(|e| e.to_string())?;
    let text = converter::bin_to_text(&tree).map_err(|e| e.to_string())?;
    let out = bin_path.with_extension("py");
    std::fs::write(&out, text).map_err(|e| e.to_string())?;
    Ok(format!("{} -> {}", name(bin_path), name(&out)))
}

fn py_to_bin(py_path: &Path) -> Result<String, String> {
    let text = std::fs::read_to_string(py_path).map_err(|e| e.to_string())?;
    let tree = converter::text_to_bin(&text).map_err(|e| e.to_string())?;
    let bytes = ltk_bridge::write_bin(&tree).map_err(|e| e.to_string())?;
    let out = py_path.with_extension("bin");
    std::fs::write(&out, bytes).map_err(|e| e.to_string())?;
    Ok(format!("{} -> {}", name(py_path), name(&out)))
}

fn ritobin_dir(dir: &Path, from_ext: &str) -> Result<String, String> {
    let mut files = Vec::new();
    walk_ext(dir, from_ext, &mut files);
    if files.is_empty() {
        return Ok(format!("no .{from_ext} files under {}", name(dir)));
    }
    let (mut ok, mut failed) = (0usize, 0usize);
    for f in &files {
        let r = if from_ext == "bin" {
            bin_to_py(f)
        } else {
            py_to_bin(f)
        };
        match r {
            Ok(_) => ok += 1,
            Err(e) => {
                failed += 1;
                eprintln!("  {} — {e}", name(f));
            }
        }
    }
    Ok(format!("{} converted, {} failed", ok, failed))
}

/* ── VFX split ───────────────────────────────────────────────────────────── */

fn separate_vfx(bin_path: &Path) -> Result<String, String> {
    use std::collections::HashSet;
    let data = std::fs::read(bin_path).map_err(|e| e.to_string())?;
    let tree = ltk_bridge::read_bin(&data).map_err(|e| e.to_string())?;
    let vfx: HashSet<u32> = quartz_lib::bin::split::classify_vfx_objects(&tree)
        .into_iter()
        .collect();
    if vfx.is_empty() {
        return Ok(format!("no VFX systems in {}", name(bin_path)));
    }
    let root = find_root_dir(bin_path);
    let stem = bin_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let out_name = format!("{stem}_vfx.bin");
    let res = quartz_lib::bin::split::split_bin(bin_path, &root, &out_name, &vfx)
        .map_err(|e| e.to_string())?;
    Ok(format!(
        "moved {} VFX systems → {} (link {})",
        res.moved, out_name, res.link_added
    ))
}

fn batch_split_vfx(target: &Path) -> Result<String, String> {
    // Run separate-vfx on every .bin in the folder (or the file's folder).
    let dir = if target.is_dir() {
        target.to_path_buf()
    } else {
        target.parent().map(Path::to_path_buf).unwrap_or_default()
    };
    let mut files = Vec::new();
    walk_ext(&dir, "bin", &mut files);
    let (mut done, mut skipped) = (0usize, 0usize);
    for f in &files {
        match separate_vfx(f) {
            Ok(_) => done += 1,
            Err(_) => skipped += 1,
        }
    }
    Ok(format!("processed {} bins ({} skipped)", done, skipped))
}

/* ── textures ────────────────────────────────────────────────────────────── */

fn convert_texture(src: &Path, out_ext: &str, fmt: &str) -> Result<String, String> {
    let bytes = std::fs::read(src).map_err(|e| e.to_string())?;
    let decoded = tex::decode_any(&bytes)?;
    let encoded = tex::encode_texture(decoded.rgba, decoded.width, decoded.height, fmt)?;
    let out = src.with_extension(out_ext);
    std::fs::write(&out, encoded).map_err(|e| e.to_string())?;
    Ok(format!("{} -> {}", name(src), name(&out)))
}

fn texture_dir(dir: &Path, from_ext: &str, out_ext: &str, fmt: &str) -> Result<String, String> {
    let mut files = Vec::new();
    walk_ext(dir, from_ext, &mut files);
    if files.is_empty() {
        return Ok(format!("no .{from_ext} files under {}", name(dir)));
    }
    let (mut ok, mut failed) = (0usize, 0usize);
    for f in &files {
        match convert_texture(f, out_ext, fmt) {
            Ok(_) => ok += 1,
            Err(e) => {
                failed += 1;
                eprintln!("  {} — {e}", name(f));
            }
        }
    }
    Ok(format!("{} converted, {} failed", ok, failed))
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

fn name(p: &Path) -> String {
    p.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| p.display().to_string())
}

/// Walk `dir` recursively, collecting files whose extension matches `ext`.
fn walk_ext(dir: &Path, ext: &str, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            walk_ext(&p, ext, out);
        } else if p
            .extension()
            .and_then(|x| x.to_str())
            .map(|x| x.eq_ignore_ascii_case(ext))
            .unwrap_or(false)
        {
            out.push(p);
        }
    }
}

/// The WAD project root used as the base for engine-relative link paths.
/// Mirrors the original: walk up until a `data`/`DATA` folder parent or the
/// `.wad.client` boundary; fall back to the file's own folder.
fn find_root_dir(bin_path: &Path) -> PathBuf {
    let mut cur = bin_path.parent();
    while let Some(dir) = cur {
        let lower = dir
            .file_name()
            .map(|n| n.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        if lower == "data" {
            if let Some(parent) = dir.parent() {
                return parent.to_path_buf();
            }
        }
        if lower.ends_with(".wad.client") || lower.ends_with(".wad") {
            return dir.to_path_buf();
        }
        cur = dir.parent();
    }
    bin_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."))
}

/* On Windows, GUI subsystem exes have no console. When invoked from Explorer's
right-click we attach to the launching console (if any) so prints are visible.
No-op when there's no parent console (double-click). */
#[cfg(windows)]
fn attach_console() {
    use windows_sys::Win32::System::Console::{AttachConsole, ATTACH_PARENT_PROCESS};
    unsafe {
        AttachConsole(ATTACH_PARENT_PROCESS);
    }
}

#[cfg(not(windows))]
fn attach_console() {}
