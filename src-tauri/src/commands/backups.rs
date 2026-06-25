/* Backup backend for Port/Paint/VFXHub .py files.

   Mirrors the original Quartz `backupManager.js`: backups live in a `zbackups/`
   folder next to the source file, named `{basename}_backup_{ISO}_{component}.py`.
   Only the 10 newest per file are kept. Duplicate content is skipped so loading
   a file twice doesn't spam backups. */

use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    /// Modified time in epoch milliseconds (newest-first sort key on the UI).
    pub modified: u64,
    pub component: String,
}

const MAX_BACKUPS: usize = 10;

fn backup_dir(file_path: &Path) -> Option<PathBuf> {
    file_path.parent().map(|p| p.join("zbackups"))
}

fn base_name(file_path: &Path) -> String {
    file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file")
        .to_string()
}

fn modified_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Component is the trailing `_component.py` token in a backup filename.
fn component_of(name: &str) -> String {
    name.strip_suffix(".py")
        .and_then(|stem| stem.rsplit_once('_'))
        .map(|(_, comp)| comp.to_string())
        .filter(|c| !c.is_empty())
        .unwrap_or_else(|| "Unknown".to_string())
}

/// List the backups for a file, newest first. Returns empty when none exist.
fn list_for_file(file_path: &Path) -> Vec<BackupInfo> {
    let Some(dir) = backup_dir(file_path) else {
        return Vec::new();
    };
    let prefix = format!("{}_backup_", base_name(file_path));

    let Ok(entries) = fs::read_dir(&dir) else {
        return Vec::new();
    };

    let mut out: Vec<BackupInfo> = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.starts_with(&prefix) || !name.ends_with(".py") {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        out.push(BackupInfo {
            name: name.clone(),
            path: entry.path().to_string_lossy().into_owned(),
            size: meta.len(),
            modified: modified_ms(&meta),
            component: component_of(&name),
        });
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    out
}

/// Create a backup of `content` for `file_path`, tagged with `component`.
/// Skips when the newest existing backup already holds identical content.
#[tauri::command]
pub fn backup_create(file_path: String, content: String, component: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    let Some(dir) = backup_dir(&path) else {
        return Ok(());
    };

    let existing = list_for_file(&path);
    if let Some(latest) = existing.first() {
        if let Ok(prev) = fs::read_to_string(&latest.path) {
            if prev == content {
                return Ok(());
            }
        }
    }

    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create backup dir: {e}"))?;

    // Filesystem-safe ISO timestamp (colons/dots → dashes).
    let stamp = chrono::Utc::now()
        .format("%Y-%m-%dT%H-%M-%S-%3fZ")
        .to_string();
    let comp = if component.trim().is_empty() {
        "Unknown".to_string()
    } else {
        component
    };
    let name = format!("{}_backup_{}_{}.py", base_name(&path), stamp, comp);
    let dest = dir.join(&name);

    fs::write(&dest, &content).map_err(|e| format!("Failed to write backup: {e}"))?;

    // Prune to the 10 newest.
    let mut all = list_for_file(&path);
    if all.len() > MAX_BACKUPS {
        for old in all.split_off(MAX_BACKUPS) {
            let _ = fs::remove_file(&old.path);
        }
    }
    Ok(())
}

/// List backups for a file, newest first.
#[tauri::command]
pub fn backup_list(file_path: String) -> Result<Vec<BackupInfo>, String> {
    Ok(list_for_file(&PathBuf::from(file_path)))
}

/// Read a backup file's content and write it back to `original_path`. Returns
/// the restored content for the caller to load into the editor.
#[tauri::command]
pub fn backup_restore(backup_path: String, original_path: String) -> Result<String, String> {
    let content = fs::read_to_string(&backup_path)
        .map_err(|e| format!("Failed to read backup: {e}"))?;
    fs::write(&original_path, &content)
        .map_err(|e| format!("Failed to restore backup: {e}"))?;
    Ok(content)
}
