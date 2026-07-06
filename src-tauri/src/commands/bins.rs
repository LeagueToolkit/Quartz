/* BIN reading/writing via Flint's ritoshark bridge. Hash names are resolved from
the cached hashes-bin.lmdb dictionary (loaded lazily on first use). */

use quartz_lib::bin::{text_to_tree, tree_to_text_cached};

/// Read a `.bin` file and return its ritobin text form with resolved hash names.
#[tauri::command]
pub fn read_bin(path: String) -> Result<String, String> {
    let data = std::fs::read(&path).map_err(|e| format!("Failed to read {}: {}", path, e))?;
    let tree = quartz_lib::bin::read_bin(&data).map_err(|e| e.to_string())?;
    tree_to_text_cached(&tree).map_err(|e| e.to_string())
}

/// Convert ritobin text to a `.bin` and write it to `out_path`.
#[tauri::command]
pub fn write_bin(text: String, out_path: String) -> Result<(), String> {
    let tree = text_to_tree(&text).map_err(|e| e.to_string())?;
    let bytes = quartz_lib::bin::write_bin(&tree).map_err(|e| e.to_string())?;
    std::fs::write(&out_path, bytes).map_err(|e| format!("Failed to write {}: {}", out_path, e))
}

/// Convert ritobin text directly to BIN bytes (no file write) — for previews.
#[tauri::command]
pub fn text_to_bin_bytes(text: String) -> Result<Vec<u8>, String> {
    let tree = text_to_tree(&text).map_err(|e| e.to_string())?;
    quartz_lib::bin::write_bin(&tree).map_err(|e| e.to_string())
}
