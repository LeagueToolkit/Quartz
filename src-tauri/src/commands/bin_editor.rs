/* BIN editor backend: parameter scaling (birthScale0/scale0 + optional VFX
shape fix), skin-bin splitting by class (VFX/ANM), and VFX asset
consolidation. The heavy lifting lives in quartz-lib's bin_editor module;
these commands handle IO on a blocking thread and shape the results for the
frontend. */

use quartz_lib::bin::bin_editor;
use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaleParamsResult {
    pub modified: usize,
    pub systems_touched: usize,
    pub shapes_fixed: usize,
    pub out_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SplitFile {
    pub kind: String,
    pub file: String,
    pub count: usize,
    pub link: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsolidateResult {
    pub moved: usize,
    pub referenced: usize,
    pub skipped_shared: usize,
    pub bin_rewritten: bool,
}

/// Scale `birthScale0` / `scale0` parameters of every VFX emitter in a BIN.
///
/// Reads `path`, multiplies the selected properties, optionally runs the VFX
/// shape/matrix fix, and writes the result back to `target_path` (defaults to
/// `path` when omitted). Returns counters plus the path that was written.
#[tauri::command]
pub async fn bin_scale_params(
    path: String,
    birth_scale: f32,
    scale: f32,
    apply_matrix_fix: bool,
    target_path: Option<String>,
) -> Result<ScaleParamsResult, String> {
    tokio::task::spawn_blocking(move || {
        let data = std::fs::read(&path).map_err(|e| format!("Failed to read {}: {}", path, e))?;
        let mut bin = quartz_lib::bin::read_bin(&data).map_err(|e| e.to_string())?;

        let res = bin_editor::scale_params(&mut bin, birth_scale, scale, apply_matrix_fix);

        let bytes = quartz_lib::bin::write_bin(&bin).map_err(|e| e.to_string())?;
        let out = target_path.unwrap_or(path);
        std::fs::write(&out, &bytes).map_err(|e| format!("Failed to write {}: {}", out, e))?;

        Ok(ScaleParamsResult {
            modified: res.modified,
            systems_touched: res.systems_touched,
            shapes_fixed: res.shapes_fixed,
            out_path: out,
        })
    })
    .await
    .map_err(|e| format!("task join error: {}", e))?
}

/// Split a skin BIN into per-class sibling files (VFX / ANM).
///
/// `out_dir` is the directory the new files are written to; pass an empty
/// string to use the derived `<project-root>/data/` folder. Returns the list
/// of files that were actually written.
#[tauri::command]
pub async fn bin_split_skin(path: String, out_dir: String) -> Result<Vec<SplitFile>, String> {
    tokio::task::spawn_blocking(move || {
        let bin_path = PathBuf::from(&path);
        let out = PathBuf::from(&out_dir);
        let files = bin_editor::split_skin_bin(&bin_path, &out).map_err(|e| e.to_string())?;
        Ok(files
            .into_iter()
            .map(|f| SplitFile {
                kind: f.kind,
                file: f.file.to_string_lossy().into_owned(),
                count: f.count,
                link: f.link,
            })
            .collect())
    })
    .await
    .map_err(|e| format!("task join error: {}", e))?
}

/// Consolidate VFX-referenced assets of a BIN into a shared folder under the
/// project directory, rewriting the BIN's asset strings.
#[tauri::command]
pub async fn bin_consolidate_assets(
    bin_path: String,
    project_dir: String,
) -> Result<ConsolidateResult, String> {
    tokio::task::spawn_blocking(move || {
        let bp = PathBuf::from(&bin_path);
        let pd = PathBuf::from(&project_dir);
        let res = bin_editor::consolidate_assets(&bp, &pd).map_err(|e| e.to_string())?;
        Ok(ConsolidateResult {
            moved: res.moved,
            referenced: res.referenced,
            skipped_shared: res.skipped_shared,
            bin_rewritten: res.bin_rewritten,
        })
    })
    .await
    .map_err(|e| format!("task join error: {}", e))?
}
