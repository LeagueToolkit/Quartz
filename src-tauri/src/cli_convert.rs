/* Headless convert dispatcher for the Windows Explorer right-click menu.
When the app exe is launched with a convert verb + path (registered by
context_menu.rs), we run the conversion and exit BEFORE Tauri starts — no
window, no sidecar binary. Output goes to the parent console (attached on
Windows) so the user sees success/errors. */

use std::path::{Path, PathBuf};

use quartz_lib::bin::{bin_trailer, converter, hash_capture, ritoshark_bridge};
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

    // Folder variant: one invocation with a single directory path. Merges every
    // `.bin` directly inside that folder (non-recursive) into `merged.bin`. No
    // batching needed — Explorer fires this once when the user right-clicks
    // the folder itself.
    if verb == "merge-bins-folder" {
        attach_console();
        let dir = args
            .get(2)
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(""));
        return Some(match merge_bins_folder_verb(&dir) {
            Ok(msg) => {
                println!("Quartz: {msg}");
                0
            }
            Err(e) => {
                eprintln!("Quartz: merge-bins-folder failed — {e}");
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
            | "unzip-fantome" | "zip-fantome"
            | "unpack-modpkg" | "pack-modpkg"
            | "fantome-to-modpkg" | "wad-to-modpkg"
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

        "sco2scb" => sco_to_scb(path),
        "sco2scbdir" => sco_to_scb_dir(path),

        "unzip-fantome" => unzip_fantome(path),
        "zip-fantome" => zip_fantome(path),
        "unpack-modpkg" => unpack_modpkg(path),
        "pack-modpkg" => pack_modpkg(path),
        "fantome-to-modpkg" => fantome_to_modpkg(path),
        "wad-to-modpkg" => wad_to_modpkg(path),

        _ => Err(format!("unknown verb '{verb}'")),
    }
}

/* ── bin <-> py ──────────────────────────────────────────────────────────── */

fn bin_to_py(bin_path: &Path) -> Result<String, String> {
    let data = std::fs::read(bin_path).map_err(|e| e.to_string())?;

    // Recover the embedded reverse-map (repathed `file =`/`hash =` paths that live
    // in NO hashtable). Register it into the shared mapper so those hashes render as
    // real paths in the .py instead of bare `0x...` hex. Strip the trailer before
    // parsing so the bin body is clean (read_bin reads to the declared end anyway,
    // but stripping keeps the tree free of any trailing-byte ambiguity).
    let trailer = bin_trailer::read_trailer(&data);
    if !trailer.is_empty() {
        register_trailer_into_mapper(&trailer);
    }
    /* Then two fallbacks for a bin whose trailer is missing — one written by a
       tool that emits none, or one whose trailer a reserialize dropped. Both
       only fill gaps, so a recorded name always beats an inferred one.

       `files.txt` first: it is a deliberate record of this mod's own paths, and
       it names them whether or not the file is still on disk. The folder scan
       second, which needs no sidecar at all but can only find what exists. */
    register_files_txt(bin_path);
    register_mod_root_paths(bin_path);
    let body = bin_trailer::strip_trailer(&data);

    let tree = ritoshark_bridge::read_bin(body).map_err(|e| e.to_string())?;
    let text = converter::bin_to_text(&tree).map_err(|e| e.to_string())?;
    let out = bin_path.with_extension("py");
    std::fs::write(&out, text).map_err(|e| e.to_string())?;

    // No sidecar: the trailer we registered above already made the .py render the
    // repathed paths readably, and py_to_bin re-captures them straight from the .py
    // text. The reverse-map lives ONLY inside the .bin (the trailer) — nothing on the
    // side to lose or leak.
    Ok(format!("{} -> {}", name(bin_path), name(&out)))
}

fn py_to_bin(py_path: &Path) -> Result<String, String> {
    let text = std::fs::read_to_string(py_path).map_err(|e| e.to_string())?;
    let tree = converter::text_to_bin(&text).map_err(|e| e.to_string())?;
    let body = ritoshark_bridge::write_bin(&tree).map_err(|e| e.to_string())?;
    let out = py_path.with_extension("bin");

    // AUTO-CAPTURE the reverse-map from the .py itself: THIS is the one moment
    // both a name and its hash are known, because `text_to_bin` just did the
    // hashing. For any hash no dictionary can reverse-resolve — a REPATHED or
    // custom name invented by this mod — we embed `hash -> name` as a trailer so
    // it is never "gone forever" once the bin holds only the hash. Vanilla names
    // are NOT embedded: the shared hashtable already resolves them, so the
    // trailer stays tiny.
    //
    // The parsed TREE is passed too, so matching is done against the hashes the
    // bin really contains rather than by guessing at the text's syntax.
    let map = hash_capture::capture_unresolvable_paths(&text, &tree);
    let bytes = bin_trailer::append_trailer(&body, &map);

    std::fs::write(&out, bytes).map_err(|e| e.to_string())?;

    /* And the same paths at the mod root, as `files.txt`.
       The trailer lives INSIDE the bin, so it is lost the moment any other tool
       reserializes the file — and then a custom path is unrecoverable, because
       it exists in no dictionary by definition. A plain list beside the mod
       survives that, needs no bin parsing to read, and is the format Quartz's
       repath already writes. Merged, not overwritten: a bin is converted one at
       a time, and rewriting the file per conversion would drop every other
       bin's paths. */
    if !map.is_empty() {
        merge_into_files_txt(&out, &map);
    }
    let note = if map.is_empty() {
        String::new()
    } else {
        format!("  (+{} embedded repath{})", map.len(), if map.len() == 1 { "" } else { "s" })
    };
    Ok(format!("{} -> {}{}", name(py_path), name(&out), note))
}

/// Fold a trailer's `hex hash -> path` entries into the shared BIN/WAD hash mapper
/// so the converter renders those hashes as real paths. File hashes are 16-hex
/// (xxh64, u64); Hash/Link are 8-hex (fnv1a32, widened to u64 — the mapper keyspace
/// can't collide since every WAD hash is >= 2^32).
fn register_trailer_into_mapper(trailer: &std::collections::HashMap<String, String>) {
    let mut w = ritoshark_bridge::get_cached_bin_hashes().write();
    for (hex, path) in trailer {
        if let Ok(h) = u64::from_str_radix(hex, 16) {
            w.insert(h, path.clone());
        }
    }
}

/// Mirror the trailer into `files.txt` at the mod root, keeping what is there.
///
/// EVERYTHING the trailer holds, not just asset paths. A custom VFX system name
/// (`"ebay" = VfxSystemDefinitionData {`) becomes an fnv1a32 hash in the bin
/// exactly the way a repathed texture becomes an xxh64 one, and is just as
/// unrecoverable once the trailer is gone. Anything that turns into a hash on
/// write has to be written down here too.
///
/// `<hex> <name>` per line, because the two keyspaces cannot be told apart from
/// the name alone — 8 hex digits is fnv1a32, 16 is xxh64. A bare list of paths
/// worked only while this held asset paths and nothing else.
///
/// Sorted by name and deduped, so reconverting the same bin produces no diff.
/// Only entries the dictionary cannot resolve are written: a vanilla name is
/// already recoverable, and listing those would bury the few that matter.
fn merge_into_files_txt(bin_path: &Path, map: &std::collections::HashMap<String, String>) {
    let Some(root) = mod_root(bin_path) else {
        return;
    };
    let list = root.join("files.txt");

    // Keyed by name so a re-hash of the same name cannot produce a duplicate row.
    let mut entries: std::collections::BTreeMap<String, String> = std::collections::BTreeMap::new();
    for line in std::fs::read_to_string(&list).unwrap_or_default().lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        match line.split_once(char::is_whitespace) {
            // `<hex> <name>` — the current format.
            Some((hex, name)) if is_hash_hex(hex) => {
                entries.insert(name.trim().to_string(), hex.to_ascii_lowercase());
            }
            // A bare path, from the older format or written by hand. Keep it by
            // hashing it as the asset path it must be.
            _ => {
                entries.insert(line.to_string(), format!("{:016x}", quartz_lib::wad::path_hash(line)));
            }
        }
    }

    let before = entries.len();
    for (hex, name) in map {
        entries.insert(name.clone(), hex.to_ascii_lowercase());
    }
    if entries.len() == before {
        return;
    }

    let contents = entries
        .iter()
        .map(|(name, hex)| format!("{hex} {name}"))
        .collect::<Vec<_>>()
        .join("\n");
    if let Err(e) = std::fs::write(&list, contents) {
        tracing::warn!("could not write {}: {e}", list.display());
    }
}

/// 8 hex digits (fnv1a32) or 16 (xxh64) — the two hash widths a bin uses.
fn is_hash_hex(s: &str) -> bool {
    (s.len() == 8 || s.len() == 16) && s.chars().all(|c| c.is_ascii_hexdigit())
}

/// Register `files.txt` at the mod root into the shared mapper.
///
/// The fallback for a bin with no trailer: the paths are listed beside the mod,
/// and `xxh64(path)` is exactly the hash the bin holds, so the list is a
/// dictionary for this mod's own invented names. Cheaper and more reliable than
/// walking the folder, because it names paths whether or not the file is
/// currently on disk.
fn register_files_txt(bin_path: &Path) -> usize {
    let Some(root) = mod_root(bin_path) else {
        return 0;
    };
    let Ok(text) = std::fs::read_to_string(root.join("files.txt")) else {
        return 0;
    };

    let mut w = ritoshark_bridge::get_cached_bin_hashes().write();
    let mut added = 0usize;
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        /* `<hex> <name>` is the current format; a bare path is the older one, or
           a hand-written line. The hex matters because a name alone cannot say
           which keyspace it belongs to — an fnv1a32 object name and an xxh64
           asset path look identical as text. */
        let (hash, name) = match line.split_once(char::is_whitespace) {
            Some((hex, name)) if is_hash_hex(hex) => {
                let Ok(h) = u64::from_str_radix(hex, 16) else { continue };
                (h, name.trim())
            }
            _ => (quartz_lib::wad::path_hash(line), line),
        };
        // Gap-fill only: a name from the trailer or the real dictionary wins.
        if w.get(hash).is_none() {
            w.insert(hash, name.to_string());
            added += 1;
        }
    }
    if added > 0 {
        tracing::info!("resolved {added} path(s) from files.txt at {}", root.display());
    }
    added
}

/// The mod folder a bin sits in: the directory holding `data/` or `assets/`.
///
/// Walks up from the bin, so `<mod>/data/characters/x/skins/skin0.bin` resolves
/// to `<mod>`. Returns `None` for a bin outside that layout.
fn mod_root(bin_path: &Path) -> Option<std::path::PathBuf> {
    let mut dir = bin_path.parent();
    while let Some(d) = dir {
        if d.join("data").is_dir() || d.join("assets").is_dir() {
            return Some(d.to_path_buf());
        }
        dir = d.parent();
    }
    None
}

/// Register every asset in the mod folder under its own `xxh64`, so a `file =`
/// pointing at one renders as a path.
///
/// WHY: Riot's `string =` -> `file =` migration means a bin names its assets
/// only by hash. A REPATHED asset's path was invented by the mod, so it exists
/// in no published dictionary — and unless the bin still carries the trailer
/// that records it, the hash resolves to nothing and the `.py` shows `0x...`.
///
/// The mod folder itself is the missing dictionary: the file is right there, and
/// its WAD-relative path is exactly what was hashed. Hashing what is on disk
/// recovers the name without any table, which also covers a bin written by a
/// tool that emits no trailer, or one whose trailer was dropped by a reserialize.
///
/// Only fills gaps: entries already known (the trailer, then the shared
/// dictionary) are left alone, so a real dictionary name always wins over a
/// guess from the filesystem.
fn register_mod_root_paths(bin_path: &Path) -> usize {
    const ASSET_EXTS: [&str; 12] = [
        "tex", "dds", "png", "jpg", "jpeg", "skn", "skl", "scb", "sco", "anm", "bnk", "wpk",
    ];
    let Some(root) = mod_root(bin_path) else {
        return 0;
    };

    let mut found = Vec::new();
    let mut stack = vec![root.clone()];
    let mut scanned = 0usize;
    // A mod is small, but a misplaced root must not turn this into a disk crawl.
    const MAX_FILES: usize = 100_000;

    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            if scanned >= MAX_FILES {
                tracing::warn!("mod-root scan hit the {MAX_FILES}-file cap; some `file =` refs may stay hex");
                stack.clear();
                break;
            }
            let path = entry.path();
            match entry.file_type() {
                Ok(t) if t.is_dir() => stack.push(path),
                Ok(t) if t.is_file() => {
                    let ext = path
                        .extension()
                        .map(|e| e.to_string_lossy().to_ascii_lowercase())
                        .unwrap_or_default();
                    if !ASSET_EXTS.contains(&ext.as_str()) {
                        continue;
                    }
                    scanned += 1;
                    let Ok(rel) = path.strip_prefix(&root) else { continue };
                    // A WAD path is lowercase and forward-slashed; that is the
                    // exact string the hash in the bin was computed from.
                    let rel = rel.to_string_lossy().replace('\\', "/").to_ascii_lowercase();
                    found.push((quartz_lib::wad::path_hash(&rel), rel));
                }
                _ => {}
            }
        }
    }

    let mut w = ritoshark_bridge::get_cached_bin_hashes().write();
    let mut added = 0usize;
    for (hash, rel) in found {
        if w.get(hash).is_none() {
            w.insert(hash, rel);
            added += 1;
        }
    }
    if added > 0 {
        tracing::info!("resolved {added} `file =` path(s) from the mod folder at {}", root.display());
    }
    added
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

/// Fold every `.bin` sitting directly in `dir` (non-recursive) into
/// `<dir>/merged.bin`. The pre-existing `merged.bin` is excluded from the
/// inputs so re-running never feeds the output back into itself. Requires ≥2
/// input bins.
fn merge_bins_folder_verb(dir: &Path) -> Result<String, String> {
    const OUTPUT_NAME: &str = "merged.bin";

    log_line(&format!("folder invocation: {}", dir.display()));

    if !dir.is_dir() {
        return Err(format!("not a directory: {}", dir.display()));
    }

    let entries = std::fs::read_dir(dir)
        .map_err(|e| format!("read {}: {}", dir.display(), e))?;
    let mut inputs: Vec<PathBuf> = entries
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .map(|e| e.path())
        .filter(|p| {
            p.extension()
                .and_then(|s| s.to_str())
                .map(|s| s.eq_ignore_ascii_case("bin"))
                .unwrap_or(false)
        })
        .filter(|p| {
            p.file_name()
                .and_then(|s| s.to_str())
                .map(|s| !s.eq_ignore_ascii_case(OUTPUT_NAME))
                .unwrap_or(true)
        })
        .collect();

    if inputs.len() < 2 {
        return Err(format!(
            "need at least 2 .bin files in {} (found {})",
            dir.display(),
            inputs.len()
        ));
    }

    // Deterministic order — Windows `read_dir` order is not stable.
    inputs.sort();

    let out = dir.join(OUTPUT_NAME);
    let stats = quartz_lib::bin::merge_bins(&inputs, &out).map_err(|e| e.to_string())?;
    for (p, entries_n, linked) in &stats.per_input {
        log_line(&format!(
            "  input: {} — {} entries, {} linked",
            p.display(),
            entries_n,
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
    // Change the CONTAINER, keep the pixel format. `fmt` only supplies the fallback
    // tag: re-encoding every texture at it would silently re-compress a BC7 normal map
    // as BC3, or block-compress one that shipped uncompressed, so a "convert to .tex"
    // would quietly degrade the asset instead of rewrapping it.
    let target = retag_format(fmt, &decoded.format);
    let encoded = tex::encode_texture(decoded.rgba, decoded.width, decoded.height, &target)?;
    std::fs::write(&out, encoded).map_err(|e| e.to_string())?;
    Ok(format!("{} -> {}", name(src), name(&out)))
}

/// Combine the requested container with the SOURCE's pixel format.
///
/// `fmt` is the caller's `container:tag` default (e.g. `tex:bc3`) and `source` is what
/// the decoder reported the input was (e.g. `dds:bc7`). The container always comes from
/// `fmt` because that is what the user asked to convert to; the tag comes from the
/// source so the texture keeps its own compression.
///
/// The source tag is dropped when the target container cannot express it: `png:rgba`
/// names no BC format, and a `.tex` has no BC7-less equivalent to fall back to, so the
/// caller's default is used instead.
fn retag_format(fmt: &str, source: &str) -> String {
    let container = fmt.split_once(':').map(|(c, _)| c).unwrap_or(fmt);
    let source_tag = source.split_once(':').map(|(_, t)| t).unwrap_or("");
    // The tags both containers can encode. Anything else (rgba from a PNG, or a format
    // rs_tex cannot re-encode) falls through to the caller's default.
    let keep = matches!(source_tag, "bc1" | "bc3" | "bc5" | "bc7" | "bgra8");
    if keep {
        format!("{container}:{source_tag}")
    } else {
        fmt.to_string()
    }
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

/* ── .modpkg <-> folder ──────────────────────────────────────────────────── */

/// The marker naming the folder a `.modpkg` was unpacked from.
///
/// Written at the root of the unpacked folder so `pack-modpkg` can rebuild the
/// package under its ORIGINAL name and metadata, rather than guessing from the folder.
/// Also the thing that identifies the folder as repackable at all.
const MODPKG_MARKER: &str = ".modpkg-origin.json";

/// Unpack a `.modpkg` into a sibling folder.
///
/// The folder is named `_<stem>`. The leading underscore keeps the unpacked tree
/// distinguishable from the archive's own stem, and is a one-character prefix so deep
/// chunk paths have as much room as possible before Windows' path limits bite.
///
/// Layout mirrors what the package holds, so the round-trip is mechanical:
///   `<layer>/<Wad>.wad.client/<chunk path>`
fn unpack_modpkg(archive_path: &Path) -> Result<String, String> {
    let file = std::fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut pkg = ltk_modpkg::Modpkg::mount_from_reader(std::io::BufReader::new(file))
        .map_err(|e| format!("not a readable modpkg: {e}"))?;

    let parent = archive_path.parent().unwrap_or_else(|| Path::new("."));
    let out_dir = unique_dir(parent, &format!("_{}", file_stem(archive_path)));
    std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;

    // The metadata is what lets `pack-modpkg` rebuild an identical package. Stored as
    // JSON beside the content rather than msgpack, so a human can read and edit it.
    let metadata = pkg.load_metadata().map_err(|e| e.to_string())?;
    let origin = serde_json::json!({
        "archive_name": name(archive_path),
        "metadata": metadata,
    });
    std::fs::write(
        out_dir.join(MODPKG_MARKER),
        serde_json::to_string_pretty(&origin).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    // Enumerate by the (WAD, layer) grid rather than by `chunk.wad()`. A chunk can be
    // registered under SEVERAL WADs, and `chunk.wad()` reports only one of them, so
    // walking the chunk map would drop every extra registration and the repack would
    // put the chunk back under a single WAD. `chunks_for_wad_layer` lists a shared
    // chunk under each WAD that claims it, which is what the round-trip needs.
    //
    // The tables are snapshotted first because the chunk reads below need `&mut pkg`.
    let paths = pkg.chunk_paths().clone();
    // Resolve each layer's TABLE POSITION by name. `layers()` is a HashMap, so its
    // iteration order says nothing about the on-disk index; pairing it with an
    // enumeration counter would address the wrong layer whenever there is more than one.
    let layer_list: Vec<String> = pkg.layers().values().map(|l| l.name.clone()).collect();
    let layer_names: Vec<(ltk_modpkg::LayerIndex, String)> = layer_list
        .into_iter()
        .filter_map(|n| pkg.layer_index(&n).map(|i| (i, n)))
        .collect();
    let wad_names: Vec<(ltk_modpkg::WadIndex, String)> = (0..pkg.wad_count())
        .filter_map(|i| {
            let idx = ltk_modpkg::WadIndex::new(i as u32);
            pkg.wad_name_for_index(idx).map(|n| (idx, n.to_string()))
        })
        .collect();

    // `(destination, key)` pairs, gathered before any read so the loads can borrow
    // `pkg` mutably without fighting the tables above.
    let mut planned: Vec<(PathBuf, ltk_modpkg::ChunkKey)> = Vec::new();
    for (layer_idx, layer_name) in &layer_names {
        for (wad_idx, wad_name) in &wad_names {
            for key in pkg.chunks_for_wad_layer(*wad_idx, *layer_idx) {
                let Some(rel) = paths.get(&key.path) else {
                    continue;
                };
                // The meta folder describes the package, and the marker above already
                // carries it; the builder regenerates those chunks on repack.
                if rel == ltk_modpkg::METADATA_FOLDER_NAME
                    || rel.starts_with(&format!("{}/", ltk_modpkg::METADATA_FOLDER_NAME))
                {
                    continue;
                }
                let mut out_path = out_dir.join(layer_name);
                out_path.push(wad_name);
                // Rebuild the chunk path component by component, dropping anything that
                // could escape the output directory.
                for seg in rel.split('/') {
                    if seg.is_empty() || seg == ".." || seg == "." {
                        continue;
                    }
                    out_path.push(seg);
                }
                planned.push((out_path, *key));
            }
        }
    }

    let mut extracted = 0usize;
    for (out_path, key) in planned {
        let Ok(data) = pkg.load_chunk_decompressed(key) else {
            continue;
        };
        if let Some(dir) = out_path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        std::fs::write(&out_path, &data).map_err(|e| e.to_string())?;
        extracted += 1;
    }

    Ok(format!(
        "{} -> {}/ ({extracted} files)",
        name(archive_path),
        name(&out_dir)
    ))
}

/// Repack a folder produced by [`unpack_modpkg`] back into its `.modpkg`.
///
/// Writes the archive under the name recorded in the marker and OVERWRITES it, so the
/// unpack -> edit -> pack round-trip lands on the same file the user started from
/// rather than accumulating copies.
fn pack_modpkg(dir: &Path) -> Result<String, String> {
    use ltk_modpkg::builder::{ModpkgBuilder, ModpkgChunkBuilder, ModpkgLayerBuilder};
    use ltk_modpkg::ModpkgCompression;

    if !dir.is_dir() {
        return Err(format!("{} is not a folder", name(dir)));
    }
    let marker_path = dir.join(MODPKG_MARKER);
    if !marker_path.exists() {
        return Err(format!(
            "no {MODPKG_MARKER} inside {}: unpack a .modpkg first",
            name(dir)
        ));
    }
    let marker: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(&marker_path).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("{MODPKG_MARKER} is invalid: {e}"))?;

    let metadata: ltk_modpkg::ModpkgMetadata = match marker.get("metadata") {
        Some(v) if !v.is_null() => serde_json::from_value(v.clone())
            .map_err(|e| format!("{MODPKG_MARKER} metadata is invalid: {e}"))?,
        // A hand-written marker may carry only `archive_name`; the format still needs
        // metadata, so fall back to the defaults rather than refusing to pack.
        _ => ltk_modpkg::ModpkgMetadata::default(),
    };
    let archive_name = marker
        .get("archive_name")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .unwrap_or_else(|| format!("{}.modpkg", file_stem(dir).trim_start_matches('_')));

    // Layer PRIORITY is what decides which layer wins for a chunk present in more
    // than one, and it lives only in the metadata. Building every layer at the default
    // priority would silently flatten a multi-layer mod's ordering on the round-trip,
    // so the priorities are read back out before the layers are declared.
    let priorities: std::collections::HashMap<String, i32> = metadata
        .layers
        .iter()
        .map(|l| (l.name.clone(), l.priority))
        .collect();

    // Layer directories are the top level; each holds one directory per WAD.
    let mut builder = ModpkgBuilder::default().with_metadata(metadata);
    let mut chunk_data: std::collections::HashMap<ltk_modpkg::ChunkKey, Vec<u8>> =
        std::collections::HashMap::new();
    let mut declared: Vec<String> = Vec::new();

    let Ok(layer_entries) = std::fs::read_dir(dir) else {
        return Err(format!("cannot read {}", name(dir)));
    };
    for layer_entry in layer_entries.flatten() {
        let layer_dir = layer_entry.path();
        if !layer_dir.is_dir() {
            continue;
        }
        // Lowercased because a layer name is a slug (ASCII lowercase, digits, hyphens)
        // while Windows will hand back whatever case the directory happens to carry.
        // `Slug::new` VALIDATES rather than normalizes, so a `Base/` folder would be
        // rejected outright instead of being read as the base layer.
        let layer_name = name(&layer_dir).to_ascii_lowercase();

        let Ok(wad_entries) = std::fs::read_dir(&layer_dir) else {
            continue;
        };
        for wad_entry in wad_entries.flatten() {
            let wad_dir = wad_entry.path();
            if !wad_dir.is_dir() {
                continue;
            }
            let wad_name = name(&wad_dir);

            let mut files = Vec::new();
            walk_all(&wad_dir, &mut files);
            for abs in files {
                let Ok(rel_path) = abs.strip_prefix(&wad_dir) else {
                    continue;
                };
                let rel = rel_path.to_string_lossy().replace('\\', "/");
                let Ok(bytes) = std::fs::read(&abs) else {
                    continue;
                };

                // A 16-hex stem IS the chunk hash, not something to hash: hashing the
                // hex STRING would move the chunk somewhere the game never looks.
                let file_name = rel.rsplit('/').next().unwrap_or(&rel);
                let stem = file_name.split('.').next().unwrap_or(file_name);
                let is_hex =
                    stem.len() == 16 && stem.bytes().all(|b| b.is_ascii_hexdigit());
                let cb = if is_hex {
                    ModpkgChunkBuilder::new()
                        .with_hashed_chunk_name(&rel)
                        .map_err(|e| format!("invalid chunk name {rel:?}: {e}"))?
                } else {
                    ModpkgChunkBuilder::new().with_path(&rel)
                };
                let ext = Path::new(&rel).extension().and_then(|e| e.to_str());
                let cb = cb
                    .with_compression(ModpkgCompression::for_extension(ext))
                    .with_layer(&layer_name)
                    .with_wad(&wad_name);

                // The layer is declared HERE, at its first real chunk, not when its
                // directory is seen. A top-level folder that holds no chunks (a stray
                // `META/`, a scratch dir) would otherwise be declared as an empty
                // phantom layer, or fail slug validation and abort a pack that had
                // nothing wrong with it.
                if !declared.contains(&layer_name) {
                    let mut layer = if layer_name == ltk_modpkg::BASE_LAYER_NAME {
                        ModpkgLayerBuilder::base()
                    } else {
                        ModpkgLayerBuilder::new(&layer_name)
                            .map_err(|e| format!("invalid layer name {layer_name:?}: {e}"))?
                    };
                    if let Some(priority) = priorities.get(&layer_name) {
                        layer = layer.with_priority(*priority);
                    }
                    builder = builder.with_layer(layer);
                    declared.push(layer_name.clone());
                }

                chunk_data.insert(cb.key(), bytes);
                builder = builder.with_chunk(cb);
            }
        }
    }

    if chunk_data.is_empty() {
        return Err(format!("{} holds no chunks to pack", name(dir)));
    }
    if !declared.iter().any(|l| l == ltk_modpkg::BASE_LAYER_NAME) {
        // The format requires a base layer even when every chunk sits elsewhere.
        builder = builder.with_layer(ModpkgLayerBuilder::base());
    }

    let mut out = std::io::Cursor::new(Vec::<u8>::new());
    builder
        .build_to_writer(&mut out, |cb| {
            // Every chunk handed to the provider was registered above, so a miss means
            // the key derivation disagrees with itself. Fail rather than quietly
            // writing an empty chunk that would look like a successful pack.
            chunk_data.get(&cb.key()).cloned().ok_or_else(|| {
                ltk_modpkg::builder::ModpkgBuilderError::InvalidChunkName(format!(
                    "no data registered for {}",
                    cb.path()
                ))
            })
        })
        .map_err(|e| format!("failed to build modpkg: {e}"))?;
    let bytes = out.into_inner();

    // Verify it mounts before replacing anything on disk.
    ltk_modpkg::Modpkg::mount_from_reader(std::io::Cursor::new(bytes.as_slice()))
        .map_err(|e| format!("rebuilt modpkg failed verification: {e}"))?;

    let parent = dir.parent().unwrap_or_else(|| Path::new("."));
    let out_path = parent.join(&archive_name);
    let tmp_path = parent.join(format!("{archive_name}.tmp"));
    std::fs::write(&tmp_path, &bytes).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&out_path);
    std::fs::rename(&tmp_path, &out_path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        e.to_string()
    })?;

    Ok(format!(
        "{}/ -> {} ({} chunks)",
        name(dir),
        name(&out_path),
        chunk_data.len()
    ))
}

/* ── fantome / wad.client -> modpkg ──────────────────────────────────────── */

/// A modpkg's `name` is a slug: ASCII lowercase, digits and hyphens, no leading or
/// trailing hyphen. `Slug::new` VALIDATES rather than normalizes, so anything derived
/// from a mod title has to be put in that shape first or the build is rejected.
fn slugify(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut prev_hyphen = false;
    for c in s.chars() {
        let c = c.to_ascii_lowercase();
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            out.push(c);
            prev_hyphen = false;
        } else if !prev_hyphen && !out.is_empty() {
            out.push('-');
            prev_hyphen = true;
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "mod".to_string()
    } else {
        trimmed
    }
}

/// Coerce whatever a mod calls its version into the semver a modpkg requires.
///
/// Fantome versions are free text in practice ("Patch 16.16", "2.0", "1.0.0"), while
/// the modpkg field is a `semver::Version`. Leading numbers are reused where there are
/// any, so `2.0` becomes `2.0.0`, and anything unparseable falls back to `1.0.0`
/// rather than failing a conversion over a cosmetic field.
fn coerce_version(raw: &str) -> semver::Version {
    if let Ok(v) = semver::Version::parse(raw.trim()) {
        return v;
    }
    let nums: Vec<u64> = raw
        .split(|c: char| !c.is_ascii_digit())
        .filter(|s| !s.is_empty())
        .filter_map(|s| s.parse().ok())
        .collect();
    match nums.as_slice() {
        [major] => semver::Version::new(*major, 0, 0),
        [major, minor] => semver::Version::new(*major, *minor, 0),
        [major, minor, patch, ..] => semver::Version::new(*major, *minor, *patch),
        [] => semver::Version::new(1, 0, 0),
    }
}

/// What a modpkg needs to describe itself, gathered from the user.
struct ModpkgAsk {
    display_name: String,
    author: String,
    version: semver::Version,
    description: Option<String>,
}

/// Ask for the metadata a modpkg carries, defaulting to what the source already knew.
///
/// A `.wad.client` knows nothing about itself, so every field is asked cold. A
/// `.fantome` has an `info.json`, but its fields are NOT mapped across as-is: they only
/// seed the defaults, and the user still confirms each one, because the two formats do
/// not describe a mod the same way.
///
/// Falls back to the defaults without asking when there is no console to ask through
/// (a piped or scripted run), so a conversion still completes unattended.
fn ask_modpkg_metadata(fallback_name: &str, defaults: Option<&serde_json::Value>) -> ModpkgAsk {
    let field = |key: &str| -> Option<String> {
        defaults
            .and_then(|v| v.get(key))
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
    };
    let default_name = field("Name").unwrap_or_else(|| fallback_name.to_string());
    let default_author = field("Author").unwrap_or_default();
    let default_version = field("Version").unwrap_or_else(|| "1.0.0".to_string());
    let default_description = field("Description").unwrap_or_default();

    if !ensure_console() {
        return ModpkgAsk {
            display_name: default_name,
            author: if default_author.is_empty() {
                "Unknown".to_string()
            } else {
                default_author
            },
            version: coerce_version(&default_version),
            description: Some(default_description).filter(|s| !s.is_empty()),
        };
    }

    println!();
    println!("Packing a modpkg. Press Enter to accept a [default].");

    let display_name = prompt("  Mod name", Some(&default_name)).unwrap_or(default_name);
    let author = prompt(
        "  Author",
        Some(if default_author.is_empty() {
            "Unknown"
        } else {
            &default_author
        }),
    )
    .unwrap_or_else(|| "Unknown".to_string());
    let version_raw =
        prompt("  Version", Some(&default_version)).unwrap_or_else(|| default_version.clone());
    // Description is the one optional field, so an empty answer is accepted as "none"
    // instead of being re-asked the way `prompt` would.
    let description = {
        use std::io::Write;
        if default_description.is_empty() {
            print!("  Description (optional): ");
        } else {
            print!("  Description (optional) [{default_description}]: ");
        }
        let _ = std::io::stdout().flush();
        let mut line = String::new();
        let answered = match std::io::stdin().read_line(&mut line) {
            Ok(0) | Err(_) => default_description.clone(),
            Ok(_) => {
                let answer = line.trim();
                if answer.is_empty() {
                    default_description.clone()
                } else {
                    answer.to_string()
                }
            }
        };
        Some(answered).filter(|s| !s.is_empty())
    };
    println!();

    ModpkgAsk {
        display_name,
        author,
        version: coerce_version(&version_raw),
        description,
    }
}

/// Build a modpkg from `(wad name -> chunks)` and write it to `out_path`.
///
/// Shared by both converters so the two produce comparable packages: one `base` layer,
/// the same chunk-naming rule, the same metadata shape.
fn write_modpkg_from_wads(
    wads: Vec<(String, Vec<(String, Vec<u8>)>)>,
    ask: &ModpkgAsk,
    champion: Option<String>,
    out_path: &Path,
) -> Result<usize, String> {
    use ltk_modpkg::builder::{ModpkgBuilder, ModpkgChunkBuilder, ModpkgLayerBuilder};
    use ltk_modpkg::ModpkgCompression;

    let metadata = ltk_modpkg::ModpkgMetadata {
        schema_version: ltk_modpkg::CURRENT_SCHEMA_VERSION,
        name: slugify(&ask.display_name),
        display_name: ask.display_name.clone(),
        description: ask.description.clone(),
        version: ask.version.clone(),
        distributor: None,
        authors: vec![ltk_modpkg::ModpkgAuthor::new(ask.author.clone(), None)],
        license: ltk_modpkg::ModpkgLicense::None,
        tags: Vec::new(),
        champions: champion.into_iter().collect(),
        maps: Vec::new(),
        layers: Vec::new(),
    };

    // One `base` layer: a converted mod has no variants to separate, and the format
    // requires a base layer regardless.
    let mut builder = ModpkgBuilder::default()
        .with_metadata(metadata)
        .with_layer(ModpkgLayerBuilder::base());
    let mut chunk_data: std::collections::HashMap<ltk_modpkg::ChunkKey, Vec<u8>> =
        std::collections::HashMap::new();

    for (wad_name, entries) in wads {
        for (rel, bytes) in entries {
            // A 16-hex stem IS the chunk hash, not something to hash: hashing the hex
            // STRING would move the chunk somewhere the game never looks.
            let file_name = rel.rsplit('/').next().unwrap_or(&rel);
            let stem = file_name.split('.').next().unwrap_or(file_name);
            let is_hex = stem.len() == 16 && stem.bytes().all(|b| b.is_ascii_hexdigit());
            let cb = if is_hex {
                ModpkgChunkBuilder::new()
                    .with_hashed_chunk_name(&rel)
                    .map_err(|e| format!("invalid chunk name {rel:?}: {e}"))?
            } else {
                ModpkgChunkBuilder::new().with_path(&rel)
            };
            let ext = Path::new(&rel).extension().and_then(|e| e.to_str());
            let cb = cb
                .with_compression(ModpkgCompression::for_extension(ext))
                .with_layer(ltk_modpkg::BASE_LAYER_NAME)
                .with_wad(&wad_name);

            chunk_data.insert(cb.key(), bytes);
            builder = builder.with_chunk(cb);
        }
    }

    if chunk_data.is_empty() {
        return Err("no WAD chunks found to pack".to_string());
    }

    let mut out = std::io::Cursor::new(Vec::<u8>::new());
    builder
        .build_to_writer(&mut out, |cb| {
            chunk_data.get(&cb.key()).cloned().ok_or_else(|| {
                ltk_modpkg::builder::ModpkgBuilderError::InvalidChunkName(format!(
                    "no data registered for {}",
                    cb.path()
                ))
            })
        })
        .map_err(|e| format!("failed to build modpkg: {e}"))?;
    let bytes = out.into_inner();

    // Verify it mounts before it is written, so a broken package never reaches disk.
    ltk_modpkg::Modpkg::mount_from_reader(std::io::Cursor::new(bytes.as_slice()))
        .map_err(|e| format!("built modpkg failed verification: {e}"))?;

    std::fs::write(out_path, &bytes).map_err(|e| e.to_string())?;
    Ok(chunk_data.len())
}

/// Read one packed `.wad.client` into `(chunk path, bytes)` pairs.
///
/// Delegates to `wad_tools::unpack` rather than reading the WAD directly, so the chunk
/// NAMING is the same as every other Quartz unpack: hashes resolved through the LMDB
/// dictionary and any bin trailer, and only what stays unresolved left as a 16-hex
/// stem. `write_modpkg_from_wads` reads that stem straight back as the hash, so an
/// unnamed chunk keeps its identity.
fn read_wad_chunks(wad_path: &Path) -> Result<Vec<(String, Vec<u8>)>, String> {
    let scratch = unique_dir(
        &std::env::temp_dir(),
        &format!("quartz-wadread-{}", file_stem(wad_path)),
    );
    quartz_lib::wad_tools::unpack(wad_path, Some(&scratch)).map_err(|e| {
        let _ = std::fs::remove_dir_all(&scratch);
        e.to_string()
    })?;

    let mut files = Vec::new();
    walk_all(&scratch, &mut files);
    let mut out = Vec::with_capacity(files.len());
    for abs in files {
        let Ok(rel) = abs.strip_prefix(&scratch) else {
            continue;
        };
        // Chunk paths are lowercase forward-slash, which is what the hash is taken over.
        let rel = rel.to_string_lossy().replace('\\', "/").to_ascii_lowercase();
        let Ok(bytes) = std::fs::read(&abs) else {
            continue;
        };
        out.push((rel, bytes));
    }
    let _ = std::fs::remove_dir_all(&scratch);
    Ok(out)
}

/// Convert a `.wad.client` into a `.modpkg` beside it.
///
/// The WAD knows nothing about who made it, so the metadata a modpkg requires is asked
/// for interactively. The champion is taken from the file name, the same convention the
/// launcher uses.
fn wad_to_modpkg(wad_path: &Path) -> Result<String, String> {
    let wad_name = name(wad_path);
    if !wad_name.to_ascii_lowercase().ends_with(".wad.client") {
        return Err(format!("{wad_name} is not a .wad.client"));
    }

    let chunks = read_wad_chunks(wad_path)?;
    if chunks.is_empty() {
        return Err(format!("{wad_name} holds no chunks"));
    }

    // `Samira.wad.client` -> base `Samira`, which is both the default mod name and the
    // champion. A locale or audio WAD has a dotted/underscored base and names no champ.
    let base = wad_name[..wad_name.len() - ".wad.client".len()].to_string();
    let champion = (!base.contains('.') && !base.contains('_')).then(|| base.clone());

    let ask = ask_modpkg_metadata(&base, None);
    let parent = wad_path.parent().unwrap_or_else(|| Path::new("."));
    let out_path = unique_file(parent, &sanitize_file_name(&ask.display_name), "modpkg");

    let count =
        write_modpkg_from_wads(vec![(wad_name.clone(), chunks)], &ask, champion, &out_path)?;
    Ok(format!("{wad_name} -> {} ({count} chunks)", name(&out_path)))
}

/// Convert a `.fantome` into a `.modpkg` beside it.
///
/// A fantome is a zip of `WAD/<name>.wad.client` payloads (and/or loose `RAW/`
/// content) plus `META/info.json`. The info.json is read only to SEED the prompts:
/// modpkg describes a mod its own way, so the fields are confirmed rather than copied.
fn fantome_to_modpkg(archive_path: &Path) -> Result<String, String> {
    let file = std::fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    // Extract the payload to a scratch dir first: the WAD reader seeks, and a zip entry
    // is a forward-only stream.
    let scratch = unique_dir(
        &std::env::temp_dir(),
        &format!("quartz-modpkg-{}", file_stem(archive_path)),
    );
    std::fs::create_dir_all(&scratch).map_err(|e| e.to_string())?;

    let mut info: Option<serde_json::Value> = None;
    let mut wad_files: Vec<(String, PathBuf)> = Vec::new();
    let mut raw_files: Vec<(String, PathBuf)> = Vec::new();

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        // `enclosed_name` rejects absolute paths and `..` traversal.
        let Some(rel) = entry.enclosed_name() else {
            continue;
        };
        if entry.is_dir() {
            continue;
        }
        let rel_str = rel.to_string_lossy().replace('\\', "/");
        let lower = rel_str.to_ascii_lowercase();

        if lower == "meta/info.json" {
            use std::io::Read;
            let mut text = String::new();
            if entry.read_to_string(&mut text).is_ok() {
                info = serde_json::from_str(&text).ok();
            }
            continue;
        }

        let out_path = scratch.join(&rel);
        if let Some(dir) = out_path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let mut out = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;

        // `WAD/<name>.wad.client` is a packed WAD; `RAW/<wad>/<path>` is loose content
        // that already carries its real path.
        if lower.starts_with("wad/") && lower.ends_with(".wad.client") {
            if let Some(wad_name) = rel_str.splitn(2, '/').nth(1) {
                wad_files.push((wad_name.to_string(), out_path));
            }
        } else if lower.starts_with("raw/") {
            raw_files.push((rel_str, out_path));
        }
    }

    let cleanup = || {
        let _ = std::fs::remove_dir_all(&scratch);
    };

    let mut wads: Vec<(String, Vec<(String, Vec<u8>)>)> = Vec::new();
    for (wad_name, path) in &wad_files {
        match read_wad_chunks(path) {
            Ok(chunks) if !chunks.is_empty() => wads.push((wad_name.clone(), chunks)),
            Ok(_) => {}
            Err(e) => eprintln!("  {wad_name}: {e}"),
        }
    }

    // RAW content is grouped under the WAD its first path component names, which is the
    // layout a fantome uses: `RAW/Samira.wad.client/assets/...`.
    if !raw_files.is_empty() {
        let mut grouped: std::collections::BTreeMap<String, Vec<(String, Vec<u8>)>> =
            std::collections::BTreeMap::new();
        for (rel_str, path) in &raw_files {
            let mut parts = rel_str.splitn(3, '/');
            let _raw = parts.next();
            let (Some(wad_name), Some(inner)) = (parts.next(), parts.next()) else {
                continue;
            };
            let Ok(bytes) = std::fs::read(path) else {
                continue;
            };
            grouped
                .entry(wad_name.to_string())
                .or_default()
                .push((inner.to_ascii_lowercase(), bytes));
        }
        for (wad_name, entries) in grouped {
            wads.push((wad_name, entries));
        }
    }

    if wads.is_empty() {
        cleanup();
        return Err(format!("{} holds no WAD payload", name(archive_path)));
    }

    // A single champion WAD names the champion, the same rule the launcher uses.
    let champion = match wads.as_slice() {
        [(only, _)] => only
            .to_ascii_lowercase()
            .strip_suffix(".wad.client")
            .filter(|b| !b.contains('.') && !b.contains('_'))
            .map(str::to_string),
        _ => None,
    };

    let ask = ask_modpkg_metadata(&file_stem(archive_path), info.as_ref());
    let parent = archive_path.parent().unwrap_or_else(|| Path::new("."));
    let out_path = unique_file(parent, &sanitize_file_name(&ask.display_name), "modpkg");

    let result = write_modpkg_from_wads(wads, &ask, champion, &out_path);
    cleanup();
    let count = result?;

    Ok(format!(
        "{} -> {} ({count} chunks)",
        name(archive_path),
        name(&out_path)
    ))
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

/* ── fantome ─────────────────────────────────────────────────────────────── */

/// Unzip a `.fantome` mod package into a sibling folder named after the archive
/// (`Foo.fantome` -> `Foo/`). A .fantome is a plain zip holding `META/info.json`
/// plus `WAD/` or `RAW/` payload folders, so this is a straight extraction.
/// If the target folder already exists a numeric suffix is appended rather than
/// merging into someone else's files.
fn unzip_fantome(archive_path: &Path) -> Result<String, String> {
    let file = std::fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    let parent = archive_path.parent().unwrap_or_else(|| Path::new("."));
    let out_dir = unique_dir(parent, &file_stem(archive_path));
    std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;

    let mut extracted = 0usize;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        // `enclosed_name` rejects absolute paths and `..` traversal, so a
        // malicious archive can't write outside `out_dir`.
        let Some(rel) = entry.enclosed_name() else {
            eprintln!("  skipped unsafe entry: {}", entry.name());
            continue;
        };
        let out_path = out_dir.join(rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(dir) = out_path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let mut out = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
        extracted += 1;
    }

    Ok(format!(
        "{} -> {}/ ({extracted} files)",
        name(archive_path),
        name(&out_dir)
    ))
}

/// Pack a mod folder into a `.fantome` next to it. The folder must contain
/// `META/info.json`. The archive keeps the folder's own name, so unzip → rezip
/// round-trips to the same filename. (LtMAO instead renames the archive to
/// `<Name> V<Version> by <Author>` out of info.json, which silently changes the
/// file name on every repack — we deliberately don't.)
fn zip_fantome(dir: &Path) -> Result<String, String> {
    use std::io::Write;

    if !dir.is_dir() {
        return Err(format!("{} is not a folder", name(dir)));
    }
    let info_path = dir.join("META").join("info.json");
    if !info_path.exists() {
        return Err(format!(
            "no META/info.json inside {} — not a mod folder",
            name(dir)
        ));
    }
    // Parsed only to validate the folder really is a mod; the name comes from
    // the folder itself.
    let info_text = std::fs::read_to_string(&info_path).map_err(|e| e.to_string())?;
    serde_json::from_str::<serde_json::Value>(&info_text)
        .map_err(|e| format!("META/info.json is invalid: {e}"))?;

    let parent = dir.parent().unwrap_or_else(|| Path::new("."));
    let out_path = unique_file(parent, &sanitize_file_name(&file_stem(dir)), "fantome");

    let mut files = Vec::new();
    walk_all(dir, &mut files);
    if files.is_empty() {
        return Err(format!("{} is empty", name(dir)));
    }

    let out = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(out);
    // Deflate at max level, matching what other Fantome packers produce.
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .compression_level(Some(9));

    let mut written = 0usize;
    for f in &files {
        // Archive paths are always forward-slash relative to the mod root.
        let Ok(rel) = f.strip_prefix(dir) else {
            continue;
        };
        let arcname = rel.to_string_lossy().replace('\\', "/");
        zip.start_file(arcname, options)
            .map_err(|e| e.to_string())?;
        let bytes = std::fs::read(f).map_err(|e| e.to_string())?;
        zip.write_all(&bytes).map_err(|e| e.to_string())?;
        written += 1;
    }
    zip.finish().map_err(|e| e.to_string())?;

    Ok(format!(
        "{}/ -> {} ({written} files)",
        name(dir),
        name(&out_path)
    ))
}

/// Collect every file under `dir` recursively (directories are implied by the
/// entry paths, so empty ones are not preserved).
fn walk_all(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            walk_all(&p, out);
        } else {
            out.push(p);
        }
    }
}

/// Strip characters Windows forbids in file names, so a mod's declared Name
/// can't produce an unwritable path.
fn sanitize_file_name(s: &str) -> String {
    let cleaned: String = s
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if (c as u32) < 0x20 => '_',
            c => c,
        })
        .collect();
    // Trailing dots/spaces are also illegal on Windows.
    let trimmed = cleaned.trim_end_matches([' ', '.']).trim();
    if trimmed.is_empty() {
        "mod".to_owned()
    } else {
        trimmed.to_owned()
    }
}

/// `parent/stem.ext`, or `parent/stem (2).ext`… if taken.
fn unique_file(parent: &Path, stem: &str, ext: &str) -> PathBuf {
    let first = parent.join(format!("{stem}.{ext}"));
    if !first.exists() {
        return first;
    }
    for n in 2..1000 {
        let candidate = parent.join(format!("{stem} ({n}).{ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    first
}

/// `parent/stem`, or `parent/stem (2)`, `parent/stem (3)`… if taken.
fn unique_dir(parent: &Path, stem: &str) -> PathBuf {
    let first = parent.join(stem);
    if !first.exists() {
        return first;
    }
    for n in 2..1000 {
        let candidate = parent.join(format!("{stem} ({n})"));
        if !candidate.exists() {
            return candidate;
        }
    }
    first
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

/// Make sure there IS a console, allocating one if [`attach_console`] found none.
///
/// A release build is `windows_subsystem = "windows"`, so a right-click from Explorer
/// starts with no console at all and `AttachConsole` is a no-op. Anything that needs to
/// ASK the user something has to own a window, or the prompt is written nowhere and the
/// read hits EOF immediately.
///
/// Allocating is not enough on its own: the process's std handles were bound before the
/// console existed, so they are reopened onto `CONIN$`/`CONOUT$` afterwards. Rust's
/// `std::io` looks the handles up per call rather than caching them, so this makes
/// `println!` and `stdin().read_line` work from that point on.
///
/// Returns whether a console is usable. Only the verbs that prompt call this; the rest
/// keep the quieter attach-only behaviour so a scripted run stays silent.
#[cfg(windows)]
fn ensure_console() -> bool {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::{GENERIC_READ, GENERIC_WRITE, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
    };
    use windows_sys::Win32::System::Console::{
        AllocConsole, GetConsoleWindow, SetConsoleTitleW, SetStdHandle, STD_ERROR_HANDLE,
        STD_INPUT_HANDLE, STD_OUTPUT_HANDLE,
    };

    unsafe {
        if GetConsoleWindow().is_null() && AllocConsole() == 0 {
            return false;
        }

        // Open the console device and point the std handles at it. Without this the
        // handles still refer to whatever they were bound to before the console
        // existed, so the prompt would be written nowhere and the read would see EOF.
        let open = |name: &str, access: u32| {
            let wide: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
            CreateFileW(
                wide.as_ptr(),
                access,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                null(),
                OPEN_EXISTING,
                0,
                null_mut(),
            )
        };

        let input = open("CONIN$", GENERIC_READ | GENERIC_WRITE);
        if input != INVALID_HANDLE_VALUE {
            SetStdHandle(STD_INPUT_HANDLE, input);
        }
        let output = open("CONOUT$", GENERIC_READ | GENERIC_WRITE);
        if output != INVALID_HANDLE_VALUE {
            SetStdHandle(STD_OUTPUT_HANDLE, output);
            SetStdHandle(STD_ERROR_HANDLE, output);
        }

        let title: Vec<u16> = "Quartz".encode_utf16().chain(std::iter::once(0)).collect();
        SetConsoleTitleW(title.as_ptr());
    }
    true
}

#[cfg(not(windows))]
fn ensure_console() -> bool {
    true
}

/// Ask the user for one value, offering `default` when they just press Enter.
///
/// An empty answer with no default re-asks rather than accepting a blank, because every
/// caller here needs the value. Returns `None` if stdin closes (a piped or scripted run
/// with nothing to read), so the caller can fall back instead of looping forever.
fn prompt(label: &str, default: Option<&str>) -> Option<String> {
    use std::io::Write;
    loop {
        match default {
            Some(d) if !d.is_empty() => print!("{label} [{d}]: "),
            _ => print!("{label}: "),
        }
        let _ = std::io::stdout().flush();

        let mut line = String::new();
        match std::io::stdin().read_line(&mut line) {
            Ok(0) | Err(_) => return None,
            Ok(_) => {}
        }
        let answer = line.trim();
        if !answer.is_empty() {
            return Some(answer.to_string());
        }
        if let Some(d) = default {
            if !d.is_empty() {
                return Some(d.to_string());
            }
        }
        println!("  (a value is required)");
    }
}
