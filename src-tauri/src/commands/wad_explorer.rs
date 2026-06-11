/* WAD Explorer commands — browse + extract League WAD archives. The heavy
   lifting (parsing, decompression, hash resolution, extraction) lives in
   quartz_lib::wad_explorer; these commands stay thin and translate to/from
   the camelCase shapes the frontend consumes. */

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use quartz_lib::wad_explorer as core;
use serde::Serialize;
use tauri::Emitter;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WadOpenResult {
    pub id: u64,
    pub name: String,
    pub path: String,
    pub version: String,
    pub chunk_count: usize,
}

/// Open + parse a WAD, bulk-resolve its path hashes, and register it in the
/// in-process mount registry. Returns the new mount id + a short header.
#[tauri::command]
pub async fn wad_mount(path: String) -> Result<WadOpenResult, String> {
    tokio::task::spawn_blocking(move || {
        let id = core::mount(&path).map_err(|e| e.to_string())?;
        core::with_mount(id, |m| WadOpenResult {
            id: m.id,
            name: m.display_name(),
            path: m.path.to_string_lossy().into_owned(),
            version: m.version_string(),
            chunk_count: m.wad.chunks.len(),
        })
        .ok_or_else(|| "Mount disappeared between insert and read".to_string())
    })
    .await
    .map_err(|e| format!("Mount task failed to join: {}", e))?
}

/// Drop a mount and free its parsed WAD + resolved paths. Idempotent.
#[tauri::command]
pub async fn wad_unmount(mount_id: u64) -> Result<bool, String> {
    Ok(core::unmount(mount_id))
}

/// Snapshot of every currently-mounted WAD.
#[tauri::command]
pub async fn wad_list_mounted() -> Vec<core::MountInfo> {
    core::list_mounted()
}

/// Every entry of a mounted WAD as a flat list, for the frontend to fold into
/// a folder tree by splitting `path` on `/`.
#[tauri::command]
pub async fn wad_list(mount_id: u64) -> Result<Vec<core::WadEntry>, String> {
    core::list_entries(mount_id).map_err(|e| e.to_string())
}

/// Read + decompress a single chunk, returned as base64. Feeds the preview
/// pane (DDS/TEX/PNG/text). Runs on the blocking pool — multi-MB textures
/// shouldn't stall the async runtime. `path` is the WAD file path;
/// `path_hash` is the 16-char hex (or `0x`-prefixed) chunk hash.
#[tauri::command]
pub async fn wad_read_chunk(path: String, path_hash: String) -> Result<String, String> {
    let hash = core::parse_path_hash(&path_hash).map_err(|e| e.to_string())?;
    let bytes = tokio::task::spawn_blocking(move || core::read_chunk(&path, hash))
        .await
        .map_err(|e| format!("Read task failed to join: {}", e))?
        .map_err(|e| e.to_string())?;
    Ok(B64.encode(&bytes))
}

/// Extract selected chunks (or all, when `hashes` is empty) from the WAD at
/// `path` into `out_dir`, preserving the resolved directory layout. Progress
/// is streamed on the `wad-extract-progress` event so the UI can show a bar.
#[tauri::command]
pub async fn wad_extract_selected(
    app: tauri::AppHandle,
    path: String,
    hashes: Vec<String>,
    out_dir: String,
) -> Result<core::ExtractResult, String> {
    // Parse selected hex hashes up front; silently drop malformed entries.
    let selected: Vec<u64> = hashes
        .iter()
        .filter_map(|h| core::parse_path_hash(h).ok())
        .collect();

    let app_clone = app.clone();
    tokio::task::spawn_blocking(move || {
        let progress = move |done: u64, total: u64| {
            let _ = app_clone.emit(
                "wad-extract-progress",
                serde_json::json!({ "current": done, "total": total }),
            );
        };
        core::extract_selected(&path, &selected, &out_dir, Some(&progress))
    })
    .await
    .map_err(|e| format!("Extract task failed to join: {}", e))?
    .map_err(|e| e.to_string())
}
