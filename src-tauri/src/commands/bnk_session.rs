/* On-disk session store for BnkExtract.

   Sessions are JSON files under %APPDATA%/Quartz/bnk_sessions, matching the
   Electron build's bnk_sessions folder. Each file is one session payload; the
   filename is the session key. */

use super::settings::get_quartz_home;
use std::path::PathBuf;

fn sessions_dir() -> Result<PathBuf, String> {
    let dir = get_quartz_home()?.join("bnk_sessions");
    std::fs::create_dir_all(&dir).map_err(|e| format!("create bnk_sessions: {e}"))?;
    Ok(dir)
}

fn session_path(filename: &str) -> Result<PathBuf, String> {
    // Guard against path traversal — keep names to a flat folder.
    if filename.is_empty() || filename.contains(['/', '\\', '.']) {
        return Err("invalid session filename".into());
    }
    Ok(sessions_dir()?.join(format!("{filename}.json")))
}

#[tauri::command]
pub fn bnk_session_save(filename: String, payload: String) -> Result<(), String> {
    let path = session_path(&filename)?;
    std::fs::write(&path, payload).map_err(|e| format!("write session: {e}"))
}

#[tauri::command]
pub fn bnk_session_load(filename: String) -> Result<Option<String>, String> {
    let path = session_path(&filename)?;
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("read session: {e}")),
    }
}

#[tauri::command]
pub fn bnk_session_delete(filename: String) -> Result<(), String> {
    let path = session_path(&filename)?;
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("delete session: {e}")),
    }
}

/// Every stored session payload, keyed by filename (without extension).
#[tauri::command]
pub fn bnk_session_list() -> Result<Vec<(String, String)>, String> {
    let dir = sessions_dir()?;
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| format!("read bnk_sessions: {e}"))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else { continue };
        if let Ok(content) = std::fs::read_to_string(&path) {
            out.push((stem.to_string(), content));
        }
    }
    Ok(out)
}
