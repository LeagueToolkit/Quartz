use crate::commands::settings::get_quartz_home;
use serde_json::Value;
use std::path::PathBuf;

/* Custom themes are stored as opaque JSON so the full token set (glass vars, MUI
   palette, liquid tuning) and behavior metadata round-trip without the backend
   needing to know every field. Built-in themes live in the frontend. */

fn themes_dir() -> Result<PathBuf, String> {
    let dir = get_quartz_home()?.join("themes");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create themes dir: {}", e))?;
    Ok(dir)
}

#[tauri::command]
pub fn list_custom_themes() -> Result<Vec<Value>, String> {
    let dir = themes_dir()?;
    let mut themes = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| format!("Failed to read themes dir: {}", e))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        match std::fs::read_to_string(&path).map_err(|e| e.to_string())
            .and_then(|d| serde_json::from_str::<Value>(&d).map_err(|e| e.to_string()))
        {
            Ok(mut theme) => {
                if let Some(obj) = theme.as_object_mut() {
                    obj.insert("builtin".to_string(), Value::Bool(false));
                }
                themes.push(theme);
            }
            Err(e) => tracing::warn!("Skipping bad theme {}: {}", path.display(), e),
        }
    }
    Ok(themes)
}

#[tauri::command]
pub fn save_custom_theme(theme: Value) -> Result<(), String> {
    let id = theme.get("id").and_then(|v| v.as_str()).ok_or("Theme is missing an id")?;
    let path = themes_dir()?.join(format!("{}.json", sanitize(id)));
    let json = serde_json::to_string_pretty(&theme).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to write theme: {}", e))
}

#[tauri::command]
pub fn delete_custom_theme(id: String) -> Result<(), String> {
    let path = themes_dir()?.join(format!("{}.json", sanitize(&id)));
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Failed to delete theme: {}", e))?;
    }
    Ok(())
}

// Keep theme ids to a safe filename charset.
fn sanitize(id: &str) -> String {
    id.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_unsafe_chars() {
        assert_eq!(sanitize("my theme/../x"), "my_theme____x");
        assert_eq!(sanitize("ok-id_1"), "ok-id_1");
    }
}
