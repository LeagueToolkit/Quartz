/* Headless convert dispatcher for the Windows Explorer right-click menu.
When the app exe is launched with a convert verb + path (registered by
context_menu.rs), we run the conversion and exit BEFORE Tauri starts — no
window, no sidecar binary. Output goes to the parent console (attached on
Windows) so the user sees success/errors. */

use std::path::{Path, PathBuf};

use quartz_lib::bin::{converter, ritoshark_bridge};
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
            | "separate-anm" | "combine-vfx" | "combine-anm" | "combine-linked"
            | "extract-hashes-bin" | "extract-hashes-bin-dir"
            | "extract-hashes-wad" | "unpack-wad" | "extract-unpack-wad" | "pack-wad"
            | "pyntex-missing" | "pyntex-deljunk"
            | "xps2fbx" | "xps2fbxdir" | "pmx2fbx" | "pnx2fbx" | "pmx2fbxdir"
            | "tex2dds" | "tex2png" | "dds2tex" | "dds2png" | "png2tex" | "png2dds"
            | "ritobindir2py" | "ritobindir2bin"
            | "tex2ddsdir" | "dds2texdir" | "tex2pngdir" | "dds2pngdir" | "png2texdir" | "png2ddsdir"
            // Listed in the menu but their conversion logic lands in a later slice.
            | "noskinlite"
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

        "separate-anm" => separate_anm(path),
        "combine-vfx" => combine_vfx(path),
        "combine-anm" => combine_anm(path),
        "combine-linked" => combine_linked(path),
        "extract-hashes-bin" => extract_hashes_bin(path),
        "extract-hashes-bin-dir" => extract_hashes_bin_dir(path),
        "extract-hashes-wad" => extract_hashes_wad(path),
        "unpack-wad" => unpack_wad(path),
        "extract-unpack-wad" => extract_unpack_wad(path),
        "pack-wad" => pack_wad(path),
        "pyntex-missing" => pyntex_missing(path),
        "pyntex-deljunk" => pyntex_deljunk(path),
        "noskinlite" => noskinlite(path),

        "xps2fbx" => xps2fbx(path),
        "xps2fbxdir" => xps2fbxdir(path),
        "pmx2fbx" | "pnx2fbx" => pmx2fbx(path),
        "pmx2fbxdir" => pmx2fbxdir(path),

        "ritobindir2py" => ritobin_dir(path, "bin"),
        "ritobindir2bin" => ritobin_dir(path, "py"),

        "tex2ddsdir" => texture_dir(path, "tex", "dds", "dds:bc3"),
        "dds2texdir" => texture_dir(path, "dds", "tex", "tex:bc3"),
        "tex2pngdir" => texture_dir(path, "tex", "png", "png"),
        "dds2pngdir" => texture_dir(path, "dds", "png", "png"),
        "png2texdir" => texture_dir(path, "png", "tex", "tex:bc3"),
        "png2ddsdir" => texture_dir(path, "png", "dds", "dds:bc3"),

        _ => Err(format!("unknown verb '{verb}'")),
    }
}

/* ── bin <-> py ──────────────────────────────────────────────────────────── */

fn bin_to_py(bin_path: &Path) -> Result<String, String> {
    let data = std::fs::read(bin_path).map_err(|e| e.to_string())?;
    let tree = ritoshark_bridge::read_bin(&data).map_err(|e| e.to_string())?;
    let text = converter::bin_to_text(&tree).map_err(|e| e.to_string())?;
    let out = bin_path.with_extension("py");
    std::fs::write(&out, text).map_err(|e| e.to_string())?;
    Ok(format!("{} -> {}", name(bin_path), name(&out)))
}

fn py_to_bin(py_path: &Path) -> Result<String, String> {
    let text = std::fs::read_to_string(py_path).map_err(|e| e.to_string())?;
    let tree = converter::text_to_bin(&text).map_err(|e| e.to_string())?;
    let bytes = ritoshark_bridge::write_bin(&tree).map_err(|e| e.to_string())?;
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
    let tree = ritoshark_bridge::read_bin(&data).map_err(|e| e.to_string())?;
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

fn separate_anm(bin_path: &Path) -> Result<String, String> {
    let moved = quartz_lib::bin::separate_anm(bin_path).map_err(|e| e.to_string())?;
    if moved == 0 {
        Ok(format!(
            "no AnimationGraphData to separate in {}",
            name(bin_path)
        ))
    } else {
        Ok(format!(
            "moved {} AnimationGraphData entries out of {}",
            moved,
            name(bin_path)
        ))
    }
}

/* ── VFX / animation / linked merge ──────────────────────────────────────── */

fn combine_vfx(bin_path: &Path) -> Result<String, String> {
    let r = quartz_lib::bin::combine_vfx(bin_path).map_err(|e| e.to_string())?;
    Ok(format!(
        "merged {} VFX entries into {} ({} linked files removed)",
        r.merged,
        name(bin_path),
        r.files_deleted
    ))
}

fn combine_anm(bin_path: &Path) -> Result<String, String> {
    let r = quartz_lib::bin::combine_anm(bin_path).map_err(|e| e.to_string())?;
    Ok(format!(
        "merged {} animation entries into {} ({} linked files removed)",
        r.merged,
        name(bin_path),
        r.files_deleted
    ))
}

fn combine_linked(bin_path: &Path) -> Result<String, String> {
    let r = quartz_lib::bin::combine_linked(bin_path).map_err(|e| e.to_string())?;
    Ok(format!(
        "merged {} entries into {} ({} linked files removed)",
        r.merged,
        name(bin_path),
        r.files_deleted
    ))
}

/* ── hash extraction ─────────────────────────────────────────────────────── */

fn extract_hashes_bin(bin_path: &Path) -> Result<String, String> {
    let (game, bin) = quartz_lib::bin::extract_hashes_bin(bin_path).map_err(|e| e.to_string())?;
    Ok(format!(
        "extracted {} game hashes + {} bin hashes from {}",
        game,
        bin,
        name(bin_path)
    ))
}

fn extract_hashes_bin_dir(dir: &Path) -> Result<String, String> {
    let (scanned, game, bin) =
        quartz_lib::bin::extract_hashes_bin_dir(dir).map_err(|e| e.to_string())?;
    Ok(format!(
        "scanned {} bins → {} game hashes + {} bin hashes",
        scanned, game, bin
    ))
}

/* ── WAD tools ───────────────────────────────────────────────────────────── */

fn extract_hashes_wad(wad_path: &Path) -> Result<String, String> {
    let (game, bin) = quartz_lib::wad_tools::extract_hashes(wad_path).map_err(|e| e.to_string())?;
    Ok(format!(
        "extracted hashes from {} ({} game, {} bin)",
        name(wad_path),
        game,
        bin
    ))
}

fn unpack_wad(wad_path: &Path) -> Result<String, String> {
    let r = quartz_lib::wad_tools::unpack(wad_path, None).map_err(|e| e.to_string())?;
    Ok(format!(
        "unpacked {} ({} extracted, {} skipped, {} hash-named)",
        name(wad_path),
        r.extracted,
        r.skipped,
        r.hashed_named
    ))
}

fn extract_unpack_wad(wad_path: &Path) -> Result<String, String> {
    let r = quartz_lib::wad_tools::extract_and_unpack(wad_path, None).map_err(|e| e.to_string())?;
    Ok(format!(
        "extract+unpack {} ({} extracted, {} skipped)",
        name(wad_path),
        r.extracted,
        r.skipped
    ))
}

fn pack_wad(dir: &Path) -> Result<String, String> {
    let chunks = quartz_lib::wad_tools::pack_dir_to_wad(dir, None).map_err(|e| e.to_string())?;
    let out = quartz_lib::wad_tools::default_pack_output(dir);
    Ok(format!("packed {} chunks → {}", chunks, name(&out)))
}

/* ── model → FBX bridges ─────────────────────────────────────────────────── */

fn xps2fbx(input: &Path) -> Result<String, String> {
    quartz_lib::model_bridge::xps2fbx(input, None)?;
    Ok(format!("{} → {}.fbx", name(input), file_stem(input)))
}

fn xps2fbxdir(dir: &Path) -> Result<String, String> {
    let (ok, failed) = quartz_lib::model_bridge::xps_to_fbx_dir(dir)?;
    Ok(format!("{} converted, {} failed", ok, failed))
}

fn pmx2fbx(input: &Path) -> Result<String, String> {
    quartz_lib::model_bridge::pmx2fbx(input, None)?;
    Ok(format!("{} → {}.fbx", name(input), file_stem(input)))
}

fn pmx2fbxdir(dir: &Path) -> Result<String, String> {
    let (ok, failed) = quartz_lib::model_bridge::pmx_to_fbx_dir(dir)?;
    Ok(format!("{} converted, {} failed", ok, failed))
}

/* ── noskinlite ──────────────────────────────────────────────────────────── */

fn noskinlite(bin_path: &Path) -> Result<String, String> {
    let n = quartz_lib::bin::noskinlite(bin_path).map_err(|e| e.to_string())?;
    Ok(format!("wrote {} skin bins from {}", n, name(bin_path)))
}

/* ── pyntex ──────────────────────────────────────────────────────────────── */

fn pyntex_missing(dir: &Path) -> Result<String, String> {
    let n = quartz_lib::pyntex::check_missing_files(dir).map_err(|e| e.to_string())?;
    Ok(format!(
        "{} missing references → missing_files.txt in {}",
        n,
        name(dir)
    ))
}

fn pyntex_deljunk(dir: &Path) -> Result<String, String> {
    let n = quartz_lib::pyntex::remove_junk_files(dir).map_err(|e| e.to_string())?;
    Ok(format!("removed {} junk files from {}", n, name(dir)))
}

fn batch_split_vfx(bin_path: &Path) -> Result<String, String> {
    // Destructive trigger-emitter rewrite for replay viewing. Writes a
    // <stem>_backup.bin sibling before rewriting (restore it when done).
    let r = quartz_lib::bin::batch_split_vfx(bin_path).map_err(|e| e.to_string())?;
    Ok(format!(
        "split {} emitters into {} wrapper systems (backup: {})",
        r.emitters_split,
        r.wrapper_entries,
        name(&r.backup_path)
    ))
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

fn file_stem(p: &Path) -> String {
    p.file_stem()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
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
