/* VFX bin tools backend: the "Fix VFX Shape" and "Copy BIN Colors" Tools
cards. Ports the Electron `bin:fixVfxShape` and `bin:copyColors` IPC
handlers. Heavy bin walking lives in quartz-lib's vfx_tools module; these
commands handle recursive folder collection, backups, and IO on a blocking
thread. */

use quartz_lib::vfx_tools::{self, FixShapeStats};
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FixFileResult {
    pub file_path: String,
    pub modified: bool,
    pub shapes_rewritten_radius: usize,
    pub shapes_rewritten_vec3: usize,
    pub shapes_rewritten_empty: usize,
    pub birth_translations_lifted: usize,
    pub error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FixVfxShapeResult {
    pub files_processed: usize,
    pub files_modified: usize,
    pub files_failed: usize,
    pub shapes_rewritten_radius: usize,
    pub shapes_rewritten_vec3: usize,
    pub shapes_rewritten_empty: usize,
    pub birth_translations_lifted: usize,
    pub results: Vec<FixFileResult>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyColorsResult {
    pub output_path: String,
    pub entries_matched: usize,
    pub entries_skipped: usize,
    pub fields_copied: usize,
    pub mismatches: usize,
}

/// Recursively collect every `.bin` file under `dir`, using an explicit stack
/// so deep trees don't blow the call stack (mirrors the JS implementation).
fn collect_bins_recursive(dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(cur) = stack.pop() {
        let entries = match std::fs::read_dir(&cur) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for ent in entries.flatten() {
            let path = ent.path();
            match ent.file_type() {
                Ok(ft) if ft.is_dir() => stack.push(path),
                Ok(ft) if ft.is_file() => {
                    if path
                        .extension()
                        .and_then(|e| e.to_str())
                        .map(|e| e.eq_ignore_ascii_case("bin"))
                        .unwrap_or(false)
                    {
                        out.push(path);
                    }
                }
                _ => {}
            }
        }
    }
    out
}

/// Run the shape fix on one bin file, backing up to a sibling `.bak` before
/// overwriting when modified and `create_backup` is set.
fn fix_one_bin(path: &Path, create_backup: bool) -> Result<(bool, FixShapeStats), String> {
    let data = std::fs::read(path).map_err(|e| format!("read {}: {}", path.display(), e))?;
    let mut bin = quartz_lib::bin::read_bin(&data).map_err(|e| e.to_string())?;

    let stats = vfx_tools::fix_vfx_shape(&mut bin);
    if !stats.any_change() {
        return Ok((false, stats));
    }

    if create_backup {
        let bak = bak_path(path);
        if !bak.exists() {
            std::fs::copy(path, &bak).map_err(|e| format!("backup {}: {}", bak.display(), e))?;
        }
    }

    let bytes = quartz_lib::bin::write_bin(&bin).map_err(|e| e.to_string())?;
    std::fs::write(path, &bytes).map_err(|e| format!("write {}: {}", path.display(), e))?;
    Ok((true, stats))
}

/// Append `.bak` to a path, keeping the original extension (`foo.bin.bak`).
fn bak_path(path: &Path) -> PathBuf {
    let mut s = path.as_os_str().to_os_string();
    s.push(".bak");
    PathBuf::from(s)
}

/// Fix legacy VFX shapes in a single `.bin` (`file_path`) or every `.bin` under
/// a folder (`folder_path`), recursively. Backs up modified files to `.bak`
/// when `create_backup` is set. Returns per-file and aggregate stats.
#[tauri::command]
pub async fn tools_fix_vfx_shape(
    file_path: Option<String>,
    folder_path: Option<String>,
    create_backup: bool,
) -> Result<FixVfxShapeResult, String> {
    tokio::task::spawn_blocking(move || {
        // Accept the target via either `file_path` or `folder_path` (kept for
        // backward-compat with callers that still distinguish them), then
        // route on the actual filesystem type: dir → recurse for .bin files,
        // file → process that one. The frontend picker UI dropped the
        // file-vs-folder mode toggle, so it just passes whatever the user
        // picked / typed.
        let raw = file_path
            .filter(|s| !s.is_empty())
            .or_else(|| folder_path.filter(|s| !s.is_empty()));
        let Some(target) = raw else {
            return Err("Provide a file or folder path".to_string());
        };
        let p = PathBuf::from(&target);
        if !p.exists() {
            return Err(format!("Path not found: {}", p.display()));
        }
        let targets: Vec<PathBuf> = if p.is_dir() {
            collect_bins_recursive(&p)
        } else {
            vec![p]
        };

        let mut out = FixVfxShapeResult {
            files_processed: 0,
            files_modified: 0,
            files_failed: 0,
            shapes_rewritten_radius: 0,
            shapes_rewritten_vec3: 0,
            shapes_rewritten_empty: 0,
            birth_translations_lifted: 0,
            results: Vec::with_capacity(targets.len()),
        };

        for t in targets {
            match fix_one_bin(&t, create_backup) {
                Ok((modified, stats)) => {
                    out.files_processed += 1;
                    if modified {
                        out.files_modified += 1;
                    }
                    out.shapes_rewritten_radius += stats.shapes_rewritten_radius;
                    out.shapes_rewritten_vec3 += stats.shapes_rewritten_vec3;
                    out.shapes_rewritten_empty += stats.shapes_rewritten_empty;
                    out.birth_translations_lifted += stats.birth_translations_lifted;
                    out.results.push(FixFileResult {
                        file_path: t.to_string_lossy().into_owned(),
                        modified,
                        shapes_rewritten_radius: stats.shapes_rewritten_radius,
                        shapes_rewritten_vec3: stats.shapes_rewritten_vec3,
                        shapes_rewritten_empty: stats.shapes_rewritten_empty,
                        birth_translations_lifted: stats.birth_translations_lifted,
                        error: None,
                    });
                }
                Err(e) => {
                    out.files_failed += 1;
                    out.results.push(FixFileResult {
                        file_path: t.to_string_lossy().into_owned(),
                        modified: false,
                        shapes_rewritten_radius: 0,
                        shapes_rewritten_vec3: 0,
                        shapes_rewritten_empty: 0,
                        birth_translations_lifted: 0,
                        error: Some(e),
                    });
                }
            }
        }

        Ok(out)
    })
    .await
    .map_err(|e| format!("task join error: {}", e))?
}

/// Copy VFX colors (RGBA + whitelisted VEC4 fields) from `source_path` into a
/// structurally identical `target_path`, matching entries by hash. Writes to
/// `output_path` when given, otherwise overwrites the target (backing it up to
/// `.bak` first when `create_backup` is set). Returns copy stats.
#[tauri::command]
pub async fn tools_bin_copy_colors(
    source_path: String,
    target_path: String,
    output_path: Option<String>,
    create_backup: bool,
) -> Result<CopyColorsResult, String> {
    tokio::task::spawn_blocking(move || {
        let src_p = PathBuf::from(&source_path);
        let dst_p = PathBuf::from(&target_path);
        if !src_p.exists() {
            return Err("Source bin not found".to_string());
        }
        if !dst_p.exists() {
            return Err("Target bin not found".to_string());
        }

        let src_data = std::fs::read(&src_p).map_err(|e| format!("read {}: {}", source_path, e))?;
        let dst_data = std::fs::read(&dst_p).map_err(|e| format!("read {}: {}", target_path, e))?;
        let src_bin = quartz_lib::bin::read_bin(&src_data).map_err(|e| e.to_string())?;
        let mut dst_bin = quartz_lib::bin::read_bin(&dst_data).map_err(|e| e.to_string())?;

        let stats = vfx_tools::copy_bin_colors(&src_bin, &mut dst_bin);

        let write_path = output_path.filter(|s| !s.is_empty()).unwrap_or(target_path);
        let same_as_target = Path::new(&write_path) == dst_p;
        if same_as_target && create_backup {
            let bak = bak_path(&dst_p);
            if !bak.exists() {
                std::fs::copy(&dst_p, &bak)
                    .map_err(|e| format!("backup {}: {}", bak.display(), e))?;
            }
        }

        let bytes = quartz_lib::bin::write_bin(&dst_bin).map_err(|e| e.to_string())?;
        std::fs::write(&write_path, &bytes).map_err(|e| format!("write {}: {}", write_path, e))?;

        Ok(CopyColorsResult {
            output_path: write_path,
            entries_matched: stats.entries_matched,
            entries_skipped: stats.entries_skipped,
            fields_copied: stats.fields_copied,
            mismatches: stats.mismatches,
        })
    })
    .await
    .map_err(|e| format!("task join error: {}", e))?
}

