use crate::commands::settings::get_quartz_home;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeTokens {
    pub accent: String,
    pub accent2: String,
    pub accent_muted: String,
    pub bg: String,
    pub bg2: String,
    pub surface: String,
    pub surface2: String,
    pub text: String,
    pub text2: String,
    pub accent_green: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Theme {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub builtin: bool,
    pub tokens: ThemeTokens,
}

fn themes_dir() -> Result<PathBuf, String> {
    let dir = get_quartz_home()?.join("themes");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create themes dir: {}", e))?;
    Ok(dir)
}

// Returns custom themes saved to disk. Built-in themes live in the frontend.
#[tauri::command]
pub fn list_custom_themes() -> Result<Vec<Theme>, String> {
    let dir = themes_dir()?;
    let mut themes = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| format!("Failed to read themes dir: {}", e))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        match std::fs::read_to_string(&path).map_err(|e| e.to_string())
            .and_then(|d| serde_json::from_str::<Theme>(&d).map_err(|e| e.to_string()))
        {
            Ok(mut theme) => {
                theme.builtin = false;
                themes.push(theme);
            }
            Err(e) => tracing::warn!("Skipping bad theme {}: {}", path.display(), e),
        }
    }
    Ok(themes)
}

#[tauri::command]
pub fn save_custom_theme(theme: Theme) -> Result<(), String> {
    let path = themes_dir()?.join(format!("{}.json", sanitize(&theme.id)));
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
