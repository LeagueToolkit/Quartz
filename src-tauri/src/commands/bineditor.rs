/* Bin Editor V2 commands — open a `.bin`/`.py`/`.ritobin` into a resident
in-memory tree, edit any emitter field natively via ritoshark, and save it
back in its original format. The heavy lifting lives in
`quartz_lib::bineditor`; these commands stay thin and translate to/from the
camelCase shapes the frontend consumes. */

use quartz_lib::bineditor::project::{EditorModel, EditorSystem};
use quartz_lib::bineditor::session::{self, EditOp, UndoOutcome};
use quartz_lib::bineditor::{JsonBinValue, NodePath};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BinEditorOpenResult {
    pub session_id: u64,
    pub model: EditorModel,
}

/// Open a bin/text file into a resident session. Runs on the blocking pool —
/// parsing a large skin bin shouldn't stall the async runtime.
#[tauri::command]
pub async fn bin_editor_open(path: String) -> Result<BinEditorOpenResult, String> {
    tokio::task::spawn_blocking(move || session::open(&path))
        .await
        .map_err(|e| format!("Open task failed to join: {}", e))?
        .map(|r| BinEditorOpenResult {
            session_id: r.session_id,
            model: r.model,
        })
        .map_err(|e| e.to_string())
}

/// Close a session and free its trees. Idempotent.
#[tauri::command]
pub async fn bin_editor_close(session_id: u64) -> Result<bool, String> {
    Ok(session::close(session_id))
}

/// Reproject the model from the live tree.
#[tauri::command]
pub async fn bin_editor_model(session_id: u64) -> Result<EditorModel, String> {
    tokio::task::spawn_blocking(move || session::model_of(session_id))
        .await
        .map_err(|e| format!("Model task failed to join: {}", e))?
        .map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BinEditorApplyResult {
    pub changed: usize,
}

/// Batch leaf overwrites; one undo snapshot per batch. The frontend mutates
/// its local model copy itself, so only the count comes back.
#[tauri::command]
pub async fn bin_editor_apply(
    session_id: u64,
    edits: Vec<EditOp>,
) -> Result<BinEditorApplyResult, String> {
    tokio::task::spawn_blocking(move || session::apply(session_id, &edits))
        .await
        .map_err(|e| format!("Apply task failed to join: {}", e))?
        .map(|changed| BinEditorApplyResult { changed })
        .map_err(|e| e.to_string())
}

/// Add a struct/pointer/embed field (`key`) or a list item (`index`; null =
/// append). Returns the fresh projection.
#[tauri::command]
pub async fn bin_editor_insert(
    session_id: u64,
    parent_path: NodePath,
    key: Option<String>,
    index: Option<u32>,
    value: JsonBinValue,
) -> Result<EditorModel, String> {
    tokio::task::spawn_blocking(move || {
        session::insert(session_id, &parent_path, key.as_deref(), index, &value)
    })
    .await
    .map_err(|e| format!("Insert task failed to join: {}", e))?
    .map_err(|e| e.to_string())
}

/// Remove a field or list element. Returns the fresh projection.
#[tauri::command]
pub async fn bin_editor_remove(session_id: u64, path: NodePath) -> Result<EditorModel, String> {
    tokio::task::spawn_blocking(move || session::remove(session_id, &path))
        .await
        .map_err(|e| format!("Remove task failed to join: {}", e))?
        .map_err(|e| e.to_string())
}

/// A `(bin, entry)` address the frontend uses to reconcile a partial refresh.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryRef {
    pub bin: usize,
    pub entry: usize,
}

/// Undo/redo response: entry-granular edits return only the re-projected
/// systems they touched; whole-tree frames (restore) return a full model.
#[derive(Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum UndoResponse {
    Full {
        model: EditorModel,
    },
    Partial {
        entries: Vec<EntryRef>,
        systems: Vec<EditorSystem>,
    },
}

impl From<UndoOutcome> for UndoResponse {
    fn from(o: UndoOutcome) -> UndoResponse {
        match o {
            UndoOutcome::Full(model) => UndoResponse::Full { model },
            UndoOutcome::Partial { entries, systems } => UndoResponse::Partial {
                entries: entries
                    .into_iter()
                    .map(|(bin, entry)| EntryRef { bin, entry })
                    .collect(),
                systems,
            },
        }
    }
}

/// Undo the last edit. Returns the refreshed view, or null if nothing to undo.
#[tauri::command]
pub async fn bin_editor_undo(session_id: u64) -> Result<Option<UndoResponse>, String> {
    tokio::task::spawn_blocking(move || session::undo(session_id))
        .await
        .map_err(|e| format!("Undo task failed to join: {}", e))?
        .map(|opt| opt.map(UndoResponse::from))
        .map_err(|e| e.to_string())
}

/// Redo the last undone edit. Returns the refreshed view, or null if nothing
/// to redo.
#[tauri::command]
pub async fn bin_editor_redo(session_id: u64) -> Result<Option<UndoResponse>, String> {
    tokio::task::spawn_blocking(move || session::redo(session_id))
        .await
        .map_err(|e| format!("Redo task failed to join: {}", e))?
        .map(|opt| opt.map(UndoResponse::from))
        .map_err(|e| e.to_string())
}

/// Reset the tree to the pristine open-time parse (undoable).
#[tauri::command]
pub async fn bin_editor_restore(session_id: u64) -> Result<EditorModel, String> {
    tokio::task::spawn_blocking(move || session::restore(session_id))
        .await
        .map_err(|e| format!("Restore task failed to join: {}", e))?
        .map_err(|e| e.to_string())
}

/// Save the session. With no `outPath`, writes every dirty bin back to its own
/// file and returns the paths written. With `outPath`, saves the main bin to
/// that path (Save As). Returns the list of files written.
#[tauri::command]
pub async fn bin_editor_save(
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
