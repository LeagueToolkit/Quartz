/* Headless convert dispatcher for the Windows Explorer right-click menu.
When the app exe is launched with a convert verb + path (registered by
context_menu.rs), we run the conversion and exit BEFORE Tauri starts — no
window, no sidecar binary. Output goes to the parent console (attached on
Windows) so the user sees success/errors. */

use std::path::{Path, PathBuf};

use quartz_lib::bin::{converter, ritoshark_bridge};
use quartz_lib::tex;
use quartz_lib::wad_explorer;

/// Inspect argv for a convert verb. Returns `Some(exit_code)` when a verb was
/// handled (caller must exit with it); `None` to continue to the normal app.
pub fn try_run() -> Option<i32> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        return None;
    }
    let verb = args[1].as_str();

    // Multi-path verbs (Explorer MultiSelectModel = "Player") get every selected
    // file as its own argv entry via `%*`. Handle them before the single-path
    // dispatch below.
    if verb == "merge-bins" {
        attach_console();
        let paths: Vec<PathBuf> = args.iter().skip(2).map(PathBuf::from).collect();
        return Some(match merge_bins_verb(&paths) {
            Ok(msg) => {
                println!("Quartz: {msg}");
                0
            }
            Err(e) => {
                eprintln!("Quartz: merge-bins failed — {e}");
                1
            }
        });
    }

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
            | "sort-vfx-systems"
            | "separate-anm" | "combine-vfx" | "combine-anm" | "combine-linked"
            | "extract-hashes-bin" | "extract-hashes-bin-dir"
            | "extract-hashes-wad" | "unpack-wad" | "extract-unpack-wad" | "pack-wad"
            | "pyntex-missing" | "pyntex-deljunk"
            | "xps2fbx" | "xps2fbxdir" | "pmx2fbx" | "pnx2fbx" | "pmx2fbxdir"
            | "tex2dds" | "tex2png" | "dds2tex" | "dds2png" | "png2tex" | "png2dds"
            | "ritobindir2py" | "ritobindir2bin"
            | "tex2ddsdir" | "dds2texdir" | "tex2pngdir" | "dds2pngdir" | "png2texdir" | "png2ddsdir"
            | "sco2scb" | "sco2scbdir"
            // Listed in the menu but their conversion logic lands in a later slice.
            | "skinlite"
    )
}

fn dispatch(verb: &str, path: &Path) -> Result<String, String> {
    match verb {
        "to-py" => bin_to_py(path),
        "to-bin" => py_to_bin(path),
        "separate-vfx" => separate_vfx(path),
        "batch-split-vfx" => batch_split_vfx(path),
        "sort-vfx-systems" => sort_vfx_systems(path),

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
        "skinlite" => skinlite(path),

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

        "sco2scb" => sco_to_scb(path),
        "sco2scbdir" => sco_to_scb_dir(path),

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
    // Name the split BIN `<champ>_vfx_<stem>.bin` (e.g. `lux_vfx_skin0.bin`),
    // mirroring the separate-anm convention. Fall back to `<stem>_vfx.bin` when
    // the champion can't be read from the path.
    let out_name = match champ_from_path(bin_path) {
        Some(champ) => format!("{champ}_vfx_{stem}.bin"),
        None => format!("{stem}_vfx.bin"),
    };
    let res = quartz_lib::bin::split::split_bin(bin_path, &root, &out_name, &vfx)
        .map_err(|e| e.to_string())?;
    Ok(format!(
        "moved {} VFX systems → {} (link {})",
        res.moved, out_name, res.link_added
    ))
}

/// Sort top-level VFX systems in place, retaining a neighboring copy of the
/// exact original. A temporary file + rename keeps a failed write from
/// truncating the user's BIN.
fn sort_vfx_systems(bin_path: &Path) -> Result<String, String> {
    let data = std::fs::read(bin_path).map_err(|e| e.to_string())?;
    let mut tree = ritoshark_bridge::read_bin(&data).map_err(|e| e.to_string())?;
    let report = quartz_lib::bin::sort_vfx_systems(&mut tree);
    if report.systems == 0 {
        return Ok(format!("no VFX systems in {}", name(bin_path)));
    }
    if report.moved == 0 {
        return Ok(format!(
            "{} is already sorted ({} VFX systems)",
            name(bin_path),
            report.systems
        ));
    }

    let bytes = ritoshark_bridge::write_bin(&tree).map_err(|e| e.to_string())?;
    let file_name = bin_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "BIN has no valid file name".to_string())?;
    let parent = bin_path
        .parent()
        .ok_or_else(|| "BIN has no parent folder".to_string())?;
    let temp_path = parent.join(format!(".{file_name}.quartz-sort.tmp"));

    let mut backup_path = parent.join(format!("{file_name}.quartz-unsorted.bak"));
    let mut suffix = 2usize;
    while backup_path.exists() {
        backup_path = parent.join(format!("{file_name}.quartz-unsorted.{suffix}.bak"));
        suffix += 1;
    }

    std::fs::write(&temp_path, bytes).map_err(|e| format!("write temporary BIN: {e}"))?;
    std::fs::rename(bin_path, &backup_path).map_err(|e| {
        let _ = std::fs::remove_file(&temp_path);
        format!("create backup: {e}")
    })?;
    if let Err(error) = std::fs::rename(&temp_path, bin_path) {
        let _ = std::fs::rename(&backup_path, bin_path);
        let _ = std::fs::remove_file(&temp_path);
        return Err(format!("replace sorted BIN: {error}"));
    }

    Ok(format!(
        "sorted {} VFX systems ({} moved): P {}, BA/AA {}, Q {}, W {}, E {}, R {}, misc {}. Backup: {}",
        report.systems,
        report.moved,
        report.passive,
        report.basic_attack,
        report.q,
        report.w,
        report.e,
        report.r,
        report.miscellaneous,
        name(&backup_path),
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

/* ── merge selected .bins → merged.bin ──────────────────────────────────── */

/// Merge exactly the .bin files the user selected in Explorer into
/// `merged.bin` next to the first-selected file.
///
/// Explorer fires string-command verbs once per selected file (there is no
/// reliable way to force one-invocation-with-all-paths via pure registry
/// entries — `MultiSelectModel = Player` is honoured only by IContextMenu
/// handlers, not by our `shell\Verb\command` string). To reunite the
/// concurrent invocations we use a shared temp file:
///
/// 1. Every invocation appends its path to `%TEMP%\quartz-merge-batch.txt`.
/// 2. The first arrival wins an atomic create on a leader lock, sleeps
///    briefly to let the rest write in, then reads the batch and runs the
///    merge. Other arrivals just append and exit.
/// 3. Leader deletes both files after merging.
///
/// Everything is logged to `%TEMP%\quartz-merge.log` so silent failures from
/// the console-less Explorer launch are still recoverable.
fn merge_bins_verb(paths: &[PathBuf]) -> Result<String, String> {
    const OUTPUT_NAME: &str = "merged.bin";
    const BATCH_FILE: &str = "quartz-merge-batch.txt";
    const LEADER_FILE: &str = "quartz-merge-leader.lock";
    // Enough time for Explorer to fire every per-file invocation for the same
    // user click (empirically ~50-200ms even for 15+ files).
    const COLLECT_MS: u64 = 800;
    // Anything older than this is considered a crashed previous run.
    const STALE_LOCK_MS: u128 = 30_000;

    let temp_dir = std::env::temp_dir();
    let batch_path = temp_dir.join(BATCH_FILE);
    let leader_path = temp_dir.join(LEADER_FILE);

    log_line(&format!(
        "invocation with {} arg(s): {:?}",
        paths.len(),
        paths
    ));

    if paths.is_empty() {
        return Err("no paths provided".to_string());
    }

    // Nuke stale scratch files from a previous crashed run before we start.
    remove_if_stale(&leader_path, STALE_LOCK_MS);
    remove_if_stale(&batch_path, STALE_LOCK_MS);

    // Append our own paths to the shared batch file. FIFO order across
    // processes is not important — the merger dedupes anyway.
    append_paths(&batch_path, paths)
        .map_err(|e| format!("append to batch file: {e}"))?;

    // Try to become the leader. `create_new` is atomic on NTFS — exactly one
    // concurrent process wins; the rest hit AlreadyExists.
    let leader = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&leader_path)
        .is_ok();

    if !leader {
        log_line("not leader — appended paths and exited");
        return Ok("queued".to_string());
    }

    log_line("leader — waiting for other invocations to enqueue");
    std::thread::sleep(std::time::Duration::from_millis(COLLECT_MS));

    // Collect every path across concurrent invocations, dedup preserving
    // first-seen order (matches the merger's own dedupe semantics).
    let content = std::fs::read_to_string(&batch_path)
        .map_err(|e| format!("read batch file: {e}"))?;
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut collected: Vec<PathBuf> = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let key = trimmed.to_ascii_lowercase();
        if seen.insert(key) {
            collected.push(PathBuf::from(trimmed));
        }
    }

    // Clean up regardless of merge outcome so the next right-click starts fresh.
    let _ = std::fs::remove_file(&batch_path);
    let _ = std::fs::remove_file(&leader_path);

    log_line(&format!("leader collected {} path(s)", collected.len()));

    if collected.len() < 2 {
        return Err(format!(
            "select at least 2 .bin files (got {})",
            collected.len()
        ));
    }
    for p in &collected {
        if !p.exists() {
            return Err(format!("path not found: {}", p.display()));
        }
    }

    let dir = collected[0]
        .parent()
        .ok_or_else(|| format!("no parent directory for {}", name(&collected[0])))?;
    let out = dir.join(OUTPUT_NAME);

    let stats = quartz_lib::bin::merge_bins(&collected, &out).map_err(|e| e.to_string())?;
    for (p, entries, linked) in &stats.per_input {
        log_line(&format!(
            "  input: {} — {} entries, {} linked",
            p.display(),
            entries,
            linked
        ));
    }
    let msg = format!(
        "merged {} bin(s) → {} ({} entries, {} duplicate(s) dropped, {} linked deps)",
        stats.inputs,
        OUTPUT_NAME,
        stats.entries_written,
        stats.duplicates_skipped,
        stats.linked_deps,
    );
    log_line(&msg);

    // Round-trip verification: read merged.bin back off disk and log its entry
    // count. If this diverges from `entries_written`, the ritoshark serializer
    // is inflating/deflating during write — otherwise the file on disk is
    // exactly what we intended.
    match std::fs::read(&out) {
        Ok(bytes) => match quartz_lib::bin::read_bin(&bytes) {
            Ok(bin) => log_line(&format!(
                "  round-trip: {} on-disk entries, {} on-disk linked ({} bytes)",
                bin.entries.len(),
                bin.linked.len(),
                bytes.len()
            )),
            Err(e) => log_line(&format!("  round-trip read failed: {e}")),
        },
        Err(e) => log_line(&format!("  round-trip disk read failed: {e}")),
    }
    Ok(msg)
}

/// Delete `path` if its mtime is older than `max_age_ms`. Best-effort — any
/// filesystem error is swallowed. Used to recover from previous crashed runs
/// that left leader-lock or batch files behind.
fn remove_if_stale(path: &Path, max_age_ms: u128) {
    if let Ok(meta) = std::fs::metadata(path) {
        if let Ok(mtime) = meta.modified() {
            if let Ok(age) = mtime.elapsed() {
                if age.as_millis() > max_age_ms {
                    log_line(&format!("removing stale scratch file: {}", path.display()));
                    let _ = std::fs::remove_file(path);
                }
            }
        }
    }
}

/// Append every path (one per line) to `batch_path`, creating the file if it
/// doesn't exist. Uses append-mode which on Windows/NTFS is safe against
/// concurrent writers for single-line writes.
fn append_paths(batch_path: &Path, paths: &[PathBuf]) -> std::io::Result<()> {
    use std::io::Write;
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(batch_path)?;
    let mut buf = String::new();
    for p in paths {
        buf.push_str(&p.to_string_lossy());
        buf.push('\n');
    }
    f.write_all(buf.as_bytes())?;
    Ok(())
}

/// Append a diagnostic line to `%TEMP%\quartz-merge.log`. Best-effort — if
/// the log itself can't be opened, we silently drop the line.
fn log_line(msg: &str) {
    use std::io::Write;
    let path = std::env::temp_dir().join("quartz-merge.log");
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let pid = std::process::id();
        let _ = writeln!(f, "[pid {pid}] {msg}");
    }
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

/* ── skinlite ────────────────────────────────────────────────────────────── */

fn skinlite(bin_path: &Path) -> Result<String, String> {
    let n = quartz_lib::bin::skinlite(bin_path).map_err(|e| e.to_string())?;
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
    let out = src.with_extension(out_ext);

    if out_ext.eq_ignore_ascii_case("png") {
        let png = match wad_explorer::decode_texture_to_png(&bytes) {
            Ok(png) => png,
            Err(primary_err) => {
                let decoded = tex::decode_any(&bytes)
                    .map_err(|secondary_err| format!("{primary_err}; fallback failed: {secondary_err}"))?;
                tex::encode_texture(decoded.rgba, decoded.width, decoded.height, "png")
                    .map_err(|secondary_err| {
                        format!("{primary_err}; fallback failed: {secondary_err}")
                    })?
            }
        };
        std::fs::write(&out, png).map_err(|e| e.to_string())?;
        return Ok(format!("{} -> {}", name(src), name(&out)));
    }

    let decoded = tex::decode_any(&bytes)?;
    let encoded = tex::encode_texture(decoded.rgba, decoded.width, decoded.height, fmt)?;
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

/* ── sco -> scb ──────────────────────────────────────────────────────────── */

fn sco_to_scb(sco_path: &Path) -> Result<String, String> {
    let scb = quartz_lib::sco_scb::convert_one(sco_path)?;
    Ok(format!("{} -> {}", name(sco_path), name(&scb)))
}

fn sco_to_scb_dir(dir: &Path) -> Result<String, String> {
    let r = quartz_lib::sco_scb::convert_dir(dir)?;
    if r.scanned == 0 {
        return Ok(format!("no .sco files under {}", name(dir)));
    }
    // Surface individual failures to the console; overall message is a summary.
    for (p, err) in &r.errors {
        eprintln!("  {} — {err}", name(p));
    }
    if r.failed > 0 {
        return Err(format!(
            "{} converted, {} failed (of {})",
            r.converted, r.failed, r.scanned
        ));
    }
    Ok(format!("{} converted (of {})", r.converted, r.scanned))
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

/// Extract the champion name from a path like `.../characters/<champ>/skins/...`.
fn champ_from_path(path: &Path) -> Option<String> {
    let posix = path.to_string_lossy().replace('\\', "/").to_lowercase();
    let marker = "/characters/";
    let start = posix.find(marker)? + marker.len();
    let rest = &posix[start..];
    let end = rest.find('/')?;
    Some(rest[..end].to_string())
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
