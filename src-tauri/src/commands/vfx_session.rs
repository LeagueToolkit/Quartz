/* VFX porting session commands — open a skin bin plus every bin its `linked:`
list resolves to into one resident multi-bin session, port systems and
emitters between sessions, and edit idle / persistent / resolver data
natively. The heavy lifting lives in `quartz_lib::vfx_session`; these
commands stay thin and translate to/from the camelCase shapes the frontend
consumes. */

use quartz_lib::vfx_session::construct::{ChildParams, PersistentPayload};
use quartz_lib::vfx_session::ops::{self, PortEmittersResult, PortSystemResult};
use quartz_lib::vfx_session::path::VfxPath;
use quartz_lib::vfx_session::project::VfxPortModel;
use quartz_lib::vfx_session::session;
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VfxOpenResult {
    pub session_id: u64,
    pub model: VfxPortModel,
}

/// Open a skin bin (and its resolvable linked bins) into a resident session.
/// Runs on the blocking pool — parsing several bins shouldn't stall the async
/// runtime.
#[tauri::command]
pub async fn vfx_open(path: String) -> Result<VfxOpenResult, String> {
    tokio::task::spawn_blocking(move || session::open(&path))
        .await
        .map_err(|e| format!("Open task failed to join: {}", e))?
        .map(|r| VfxOpenResult {
            session_id: r.session_id,
            model: r.model,
        })
        .map_err(|e| e.to_string())
}

/// Reproject the model from the live trees.
#[tauri::command]
pub async fn vfx_model(session_id: u64) -> Result<VfxPortModel, String> {
    tokio::task::spawn_blocking(move || session::model_of(session_id))
        .await
        .map_err(|e| format!("Model task failed to join: {}", e))?
        .map_err(|e| e.to_string())
}

/// Reparse the session if any source BIN changed outside Quartz.
#[tauri::command]
pub async fn vfx_reload_if_changed(session_id: u64) -> Result<Option<VfxPortModel>, String> {
    tokio::task::spawn_blocking(move || session::reload_if_changed(session_id))
        .await
        .map_err(|e| format!("Reload task failed to join: {}", e))?
        .map_err(|e| e.to_string())
}

/// Write every dirty bin back to its own original file. Returns the paths
/// written. Unless `force` is true, a bin whose file changed on disk since
/// opening aborts the save with a `STALE_FILE:` error so the UI can prompt.
#[tauri::command]
pub async fn vfx_save(session_id: u64, force: Option<bool>) -> Result<Vec<String>, String> {
    let force = force.unwrap_or(false);
    tokio::task::spawn_blocking(move || session::save(session_id, force))
        .await
        .map_err(|e| format!("Save task failed to join: {}", e))?
        .map(|paths| {
            paths
                .iter()
                .map(|p| p.to_string_lossy().into_owned())
                .collect()
        })
        .map_err(|e| e.to_string())
}

/// Close a session and free its trees. Idempotent.
#[tauri::command]
pub async fn vfx_close(session_id: u64) -> Result<bool, String> {
    Ok(session::close(session_id))
}

/// Undo the last edit. Returns the refreshed model, or null if nothing to undo.
#[tauri::command]
pub async fn vfx_undo(session_id: u64) -> Result<Option<VfxPortModel>, String> {
    tokio::task::spawn_blocking(move || session::undo(session_id))
        .await
        .map_err(|e| format!("Undo task failed to join: {}", e))?
        .map_err(|e| e.to_string())
}

/// Redo the last undone edit. Returns the refreshed model, or null if nothing
/// to redo.
#[tauri::command]
pub async fn vfx_redo(session_id: u64) -> Result<Option<VfxPortModel>, String> {
    tokio::task::spawn_blocking(move || session::redo(session_id))
        .await
        .map_err(|e| format!("Redo task failed to join: {}", e))?
        .map_err(|e| e.to_string())
}

/// Create a new empty VFX system named `name` and register it in the resolver.
#[tauri::command]
pub async fn vfx_create_system(session_id: u64, name: String) -> Result<VfxPortModel, String> {
    tokio::task::spawn_blocking(move || ops::create_system(session_id, &name))
        .await
        .map_err(|e| format!("Create system task failed to join: {}", e))?
        .map_err(|e| e.to_string())
}

/// Clone emitters from a donor session into a target system. `assetPaths` are
/// the donor asset strings the frontend copies via port_copy_assets_to_target.
#[tauri::command]
pub async fn vfx_port_emitters(
    target_session_id: u64,
    donor_session_id: u64,
    donor_emitters: Vec<VfxPath>,
    target_system: VfxPath,
) -> Result<PortEmittersResult, String> {
    tokio::task::spawn_blocking(move || {
        ops::port_emitters(
            target_session_id,
            donor_session_id,
            &donor_emitters,
            &target_system,
        )
    })
    .await
    .map_err(|e| format!("Port emitters task failed to join: {}", e))?
    .map_err(|e| e.to_string())
}

/// Clone a whole system from a donor session into the target, renaming unless
/// `preserveName` is set, and upsert it into the resolver.
#[tauri::command]
pub async fn vfx_port_system(
    target_session_id: u64,
    donor_session_id: u64,
    donor_system: VfxPath,
    desired_name: Option<String>,
    preserve_name: bool,
) -> Result<PortSystemResult, String> {
    tokio::task::spawn_blocking(move || {
        ops::port_system(
            target_session_id,
            donor_session_id,
            &donor_system,
            desired_name.as_deref(),
            preserve_name,
        )
    })
    .await
    .map_err(|e| format!("Port system task failed to join: {}", e))?
    .map_err(|e| e.to_string())
}

/// Remove one emitter from its owning system.
#[tauri::command]
pub async fn vfx_delete_emitter(session_id: u64, emitter: VfxPath) -> Result<VfxPortModel, String> {
    tokio::task::spawn_blocking(move || ops::delete_emitter(session_id, &emitter))
        .await
        .map_err(|e| format!("Delete emitter task failed to join: {}", e))?
        .map_err(|e| e.to_string())
}

/// Remove several emitters as one edit (one undo step, one reprojection).
#[tauri::command]
pub async fn vfx_delete_emitters(
    session_id: u64,
    emitters: Vec<VfxPath>,
) -> Result<VfxPortModel, String> {
    tokio::task::spawn_blocking(move || ops::delete_emitters(session_id, &emitters))
        .await
        .map_err(|e| format!("Delete emitters task failed to join: {}", e))?
        .map_err(|e| e.to_string())
}

/// Remove a system entry and any resolver entries pointing at it.
#[tauri::command]
pub async fn vfx_delete_system(session_id: u64, system: VfxPath) -> Result<VfxPortModel, String> {
    tokio::task::spawn_blocking(move || ops::delete_system(session_id, &system))
        .await
        .map_err(|e| format!("Delete system task failed to join: {}", e))?
        .map_err(|e| e.to_string())
}

/// Upsert (16 floats) or remove (null) a system's `transform` matrix.
#[tauri::command]
pub async fn vfx_set_matrix(
    session_id: u64,
    system: VfxPath,
    values: Option<Vec<f32>>,
) -> Result<VfxPortModel, String> {
    let values = match values {
        Some(v) => Some(
            <[f32; 16]>::try_from(v)
                .map_err(|_| "Matrix must have exactly 16 values".to_string())?,
        ),
        None => None,
    };
    tokio::task::spawn_blocking(move || ops::set_matrix(session_id, &system, values))
        .await
        .map_err(|e| format!("Set matrix task failed to join: {}", e))?
        .map_err(|e| e.to_string())
}

/// Add one idle-particle effect per bone for `effectKey`.
#[tauri::command]
pub async fn vfx_idle_add(
    session_id: u64,
    effect_key: String,
    bones: Vec<String>,
) -> Result<VfxPortModel, String> {
    tokio::task::spawn_blocking(move || ops::idle_add(session_id, &effect_key, &bones))
        .await
        .map_err(|e| format!("Idle add task failed to join: {}", e))?
        .map_err(|e| e.to_string())
}

/// Remove every idle-particle effect matching `effectKey`.
#[tauri::command]
pub async fn vfx_idle_remove(session_id: u64, effect_key: String) -> Result<VfxPortModel, String> {
    tokio::task::spawn_blocking(move || ops::idle_remove(session_id, &effect_key))
        .await
        .map_err(|e| format!("Idle remove task failed to join: {}", e))?
        .map_err(|e| e.to_string())
}

/// Append a new child (_cbdl) emitter to the host system.
#[tauri::command]
pub async fn vfx_child_add(
    session_id: u64,
    host_system: VfxPath,
    params: ChildParams,
) -> Result<VfxPortModel, String> {
    tokio::task::spawn_blocking(move || ops::child_add(session_id, &host_system, &params))
        .await
        .map_err(|e| format!("Child add task failed to join: {}", e))?
        .map_err(|e| e.to_string())
}

/// Overwrite an existing child emitter's parameters.
#[tauri::command]
pub async fn vfx_child_update(
    session_id: u64,
    emitter: VfxPath,
    params: ChildParams,
) -> Result<VfxPortModel, String> {
    tokio::task::spawn_blocking(move || ops::child_update(session_id, &emitter, &params))
        .await
        .map_err(|e| format!("Child update task failed to join: {}", e))?
        .map_err(|e| e.to_string())
}

/// Append (index = null) or replace (index = i) a persistent-effect condition.
#[tauri::command]
pub async fn vfx_persistent_upsert(
    session_id: u64,
    index: Option<u32>,
    payload: PersistentPayload,
) -> Result<VfxPortModel, String> {
    tokio::task::spawn_blocking(move || {
        ops::persistent_upsert(session_id, index.map(|i| i as usize), &payload)
    })
    .await
    .map_err(|e| format!("Persistent upsert task failed to join: {}", e))?
    .map_err(|e| e.to_string())
}

/// Remove one persistent-effect condition by index.
#[tauri::command]
pub async fn vfx_persistent_remove(session_id: u64, index: u32) -> Result<VfxPortModel, String> {
    tokio::task::spawn_blocking(move || ops::persistent_remove(session_id, index as usize))
        .await
        .map_err(|e| format!("Persistent remove task failed to join: {}", e))?
        .map_err(|e| e.to_string())
}

/// Upsert a resolver map entry (key hash -> system link).
#[tauri::command]
pub async fn vfx_resolver_upsert(
    session_id: u64,
    key: String,
    value: String,
) -> Result<VfxPortModel, String> {
    tokio::task::spawn_blocking(move || ops::resolver_upsert_op(session_id, &key, &value))
        .await
        .map_err(|e| format!("Resolver upsert task failed to join: {}", e))?
        .map_err(|e| e.to_string())
}

/// Set an emitter's `emitterName`.
#[tauri::command]
pub async fn vfx_rename_emitter(
    session_id: u64,
    emitter: VfxPath,
    new_name: String,
) -> Result<VfxPortModel, String> {
    tokio::task::spawn_blocking(move || ops::rename_emitter(session_id, &emitter, &new_name))
        .await
        .map_err(|e| format!("Rename emitter task failed to join: {}", e))?
        .map_err(|e| e.to_string())
}

/// Rewrite an emitter's texture path. `old_path` identifies the texture node
/// (its current value); `new_path` replaces it.
#[tauri::command]
pub async fn vfx_set_texture(
    session_id: u64,
    emitter: VfxPath,
    old_path: String,
    new_path: String,
) -> Result<VfxPortModel, String> {
    tokio::task::spawn_blocking(move || {
        ops::set_texture(session_id, &emitter, &old_path, &new_path)
    })
    .await
    .map_err(|e| format!("Set texture task failed to join: {}", e))?
    .map_err(|e| e.to_string())
}

/// Rename a system (particleName/particlePath + path hash + resolver relink).
#[tauri::command]
pub async fn vfx_rename_system(
    session_id: u64,
    system: VfxPath,
    new_name: String,
) -> Result<VfxPortModel, String> {
    tokio::task::spawn_blocking(move || ops::rename_system(session_id, &system, &new_name))
        .await
        .map_err(|e| format!("Rename system task failed to join: {}", e))?
        .map_err(|e| e.to_string())
}
