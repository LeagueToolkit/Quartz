/* Paint commands — open a `.bin`/`.py`/`.ritobin` into a resident in-memory
tree, recolor / edit it natively via ritoshark, and save it back in its
original format. The heavy lifting lives in `quartz_lib::paint`; these
commands stay thin and translate to/from the camelCase shapes the frontend
consumes. */

use quartz_lib::paint::model::{EmitterColors, VfxModel};
use quartz_lib::paint::recolor::{ColorTargetSel, PaletteStop, RecolorMode, RecolorOptions};
use quartz_lib::paint::session;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaintOpenResult {
    pub session_id: u64,
    pub model: VfxModel,
}

/// Open a bin/text file into a resident session. Runs on the blocking pool —
/// parsing a large skin bin shouldn't stall the async runtime.
#[tauri::command]
pub async fn paint_open(path: String) -> Result<PaintOpenResult, String> {
    tokio::task::spawn_blocking(move || session::open(&path))
        .await
        .map_err(|e| format!("Open task failed to join: {}", e))?
        .map(|r| PaintOpenResult {
            session_id: r.session_id,
            model: r.model,
        })
        .map_err(|e| e.to_string())
}

/// Close a session and free its tree. Idempotent.
#[tauri::command]
pub async fn paint_close(session_id: u64) -> Result<bool, String> {
    Ok(session::close(session_id))
}

/// Reparse the session if any source BIN changed outside Quartz.
#[tauri::command]
pub async fn paint_reload_if_changed(session_id: u64) -> Result<Option<VfxModel>, String> {
    tokio::task::spawn_blocking(move || session::reload_if_changed(session_id))
        .await
        .map_err(|e| format!("Reload task failed to join: {}", e))?
        .map_err(|e| e.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaletteStopInput {
    pub vec4: [f32; 4],
    pub time: f32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecolorOptionsInput {
    pub mode: String,
    #[serde(default = "default_true")]
    pub ignore_black_white: bool,
    #[serde(default = "default_true")]
    pub preserve_alpha: bool,
    #[serde(default)]
    pub hsl_shift: Option<[f32; 3]>,
    #[serde(default)]
    pub hue_target: Option<f32>,
    /// Optional seed for random modes; the frontend passes a varying value so
    /// repeated recolors differ.
    #[serde(default)]
    pub seed: Option<u64>,
}

fn default_true() -> bool {
    true
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecolorResult {
    pub changed: usize,
    /// Refreshed colors for the touched emitters only — the UI patches its
    /// resident model in place instead of swallowing a whole-model
    /// reprojection over IPC.
    pub colors: HashMap<String, EmitterColors>,
}

fn parse_targets(targets: &[String]) -> Vec<ColorTargetSel> {
    targets
        .iter()
        .filter_map(|t| match t.as_str() {
            "all" => Some(ColorTargetSel::All),
            "color" | "base" => Some(ColorTargetSel::Base),
            "birthColor" | "birth" => Some(ColorTargetSel::Birth),
            "fresnelColor" | "fresnel" | "oc" => Some(ColorTargetSel::Fresnel),
            "lingerColor" | "linger" => Some(ColorTargetSel::Linger),
            _ => None,
        })
        .collect()
}

/// Recolor selected emitters' selected color slots, then return the refreshed
/// model so the UI repaints the affected blocks.
#[tauri::command]
pub async fn paint_recolor(
    session_id: u64,
    emitter_keys: Vec<String>,
    color_targets: Vec<String>,
    palette: Vec<PaletteStopInput>,
    options: RecolorOptionsInput,
) -> Result<RecolorResult, String> {
    let mode = RecolorMode::from_str(&options.mode)
        .ok_or_else(|| format!("Unknown recolor mode: {}", options.mode))?;
    let targets = parse_targets(&color_targets);
    if targets.is_empty() {
        return Err("No color targets selected".to_string());
    }
    let palette: Vec<PaletteStop> = palette
        .into_iter()
        .map(|p| PaletteStop {
            vec4: p.vec4,
            time: p.time,
        })
        .collect();
    let (hr, hs, hl) = options
        .hsl_shift
        .map(|a| (a[0], a[1], a[2]))
        .unwrap_or((0.0, 0.0, 0.0));
    let opts = RecolorOptions {
        mode,
        ignore_black_white: options.ignore_black_white,
        preserve_alpha: options.preserve_alpha,
        hsl_shift: (hr, hs, hl),
        hue_target: options.hue_target,
        seed: options.seed.unwrap_or(0x9E37_79B9_7F4A_7C15),
    };

    tokio::task::spawn_blocking(move || {
        let changed =
            session::recolor_emitters(session_id, &emitter_keys, &targets, &palette, &opts)?;
        let colors = session::emitter_colors_of(session_id, &emitter_keys)?;
        Ok::<_, quartz_lib::error::Error>(RecolorResult { changed, colors })
    })
    .await
    .map_err(|e| format!("Recolor task failed to join: {}", e))?
    .map_err(|e| e.to_string())
}

/// Set a single emitter's blend mode.
#[tauri::command]
pub async fn paint_set_blend_mode(
    session_id: u64,
    emitter_key: String,
    mode: u8,
) -> Result<bool, String> {
    session::set_blend_mode(session_id, &emitter_key, mode).map_err(|e| e.to_string())
}

/// Set a single static-material color param. `selectionKey` is the
/// `mat::<materialKey>::<paramName>` key from the model.
#[tauri::command]
pub async fn paint_set_material_param(
    session_id: u64,
    selection_key: String,
    values: [f32; 4],
    preserve_alpha: Option<bool>,
) -> Result<bool, String> {
    session::set_material_param(
        session_id,
        &selection_key,
        values,
        preserve_alpha.unwrap_or(false),
    )
    .map_err(|e| e.to_string())
}

/// Rewrite an emitter's texture path. `old_path` is the texture's current value
/// (identifies the node); `new_path` replaces it. Returns the refreshed model,
/// or null if the node wasn't found / value unchanged.
#[tauri::command]
pub async fn paint_set_texture(
    session_id: u64,
    emitter_key: String,
    old_path: String,
    new_path: String,
) -> Result<Option<VfxModel>, String> {
    session::set_texture(session_id, &emitter_key, &old_path, &new_path).map_err(|e| e.to_string())
}

/// Set the per-keyframe alpha of an emitter color slot (color / birthColor /
/// fresnelColor / lingerColor), preserving RGB. Returns the refreshed model, or
/// null if nothing changed / the slot wasn't found.
#[tauri::command]
pub async fn paint_set_color_alpha(
    session_id: u64,
    emitter_key: String,
    slot: String,
    alphas: Vec<f32>,
) -> Result<Option<VfxModel>, String> {
    session::set_color_alpha(session_id, &emitter_key, &slot, &alphas).map_err(|e| e.to_string())
}

/// Undo the last edit. Returns the refreshed model, or null if nothing to undo.
#[tauri::command]
pub async fn paint_undo(session_id: u64) -> Result<Option<VfxModel>, String> {
    session::undo(session_id).map_err(|e| e.to_string())
}

/// Redo the last undone edit. Returns the refreshed model, or null if nothing
/// to redo.
#[tauri::command]
pub async fn paint_redo(session_id: u64) -> Result<Option<VfxModel>, String> {
    session::redo(session_id).map_err(|e| e.to_string())
}

/// Save the session. With no `outPath`, writes every dirty bin back to its own
/// file and returns the paths written. With `outPath`, saves the main bin to
/// that path (Save As). Returns the list of files written.
#[tauri::command]
pub async fn paint_save(
    session_id: u64,
    out_path: Option<String>,
    force: Option<bool>,
) -> Result<Vec<String>, String> {
    let out = out_path.map(std::path::PathBuf::from);
    let force = force.unwrap_or(false);
    tokio::task::spawn_blocking(move || session::save(session_id, out, force))
        .await
        .map_err(|e| format!("Save task failed to join: {}", e))?
        .map(|paths| {
            paths
                .into_iter()
                .map(|p| p.to_string_lossy().into_owned())
                .collect()
        })
        .map_err(|e| e.to_string())
}
