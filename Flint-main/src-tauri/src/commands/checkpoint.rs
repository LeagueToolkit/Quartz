use crate::core::checkpoint::{Checkpoint, CheckpointDiff, CheckpointFileContent, CheckpointManager, CheckpointProgress};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn create_checkpoint(
    app: AppHandle,
    project_path: String,
    message: String,
    tags: Vec<String>,
) -> Result<Checkpoint, String> {
    let path = PathBuf::from(project_path);
    let manager = CheckpointManager::new(path);
    manager.init().map_err(|e| e.to_string())?;

    let app_handle = app.clone();
    manager.create_checkpoint_with_progress(
        message,
        tags,
        Some(move |phase: &str, current: u64, total: u64| {
            let _ = app_handle.emit("checkpoint-progress", CheckpointProgress {
                phase: phase.to_string(),
                current,
                total,
            });
        }),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_checkpoints(project_path: String) -> Result<Vec<Checkpoint>, String> {
    let path = PathBuf::from(project_path);
    let manager = CheckpointManager::new(path);
    manager.list_checkpoints().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_checkpoint(project_path: String, checkpoint_id: String) -> Result<(), String> {
    let path = PathBuf::from(project_path);
    let manager = CheckpointManager::new(path);
    manager.init().map_err(|e| e.to_string())?;
    manager.restore_checkpoint(&checkpoint_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn compare_checkpoints(
    project_path: String,
    from_id: String,
    to_id: String,
) -> Result<CheckpointDiff, String> {
    let path = PathBuf::from(project_path);
    let manager = CheckpointManager::new(path);
    manager.compare_checkpoints(&from_id, &to_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_checkpoint(project_path: String, checkpoint_id: String) -> Result<(), String> {
    let path = PathBuf::from(project_path);
    let manager = CheckpointManager::new(path);
    manager.delete_checkpoint(&checkpoint_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn read_checkpoint_file(
    project_path: String,
    hash: String,
    file_path: String,
) -> Result<CheckpointFileContent, String> {
    let path = PathBuf::from(project_path);
    let manager = CheckpointManager::new(path);
    manager.read_checkpoint_file(&hash, &file_path).map_err(|e| e.to_string())
}
