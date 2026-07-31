use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

const SCHEMA_VERSION: u32 = 1;

/* User-facing settings, persisted to %APPDATA%/Quartz/settings.json.
Optional fields and serde defaults keep old files loadable as the shape grows. */
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuartzSettings {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,

    pub league_path: Option<String>,
    pub champions_path: Option<String>,
    pub wad_output_path: Option<String>,

    pub creator_name: Option<String>,

    #[serde(default = "default_true")]
    pub auto_update_enabled: bool,
    pub skipped_update_version: Option<String>,

    pub selected_theme: Option<String>,

    // Theme base mode ("dark" | "light") and per-theme accent overrides
    // (themeId -> hex). Both optional so older settings files still load.
    pub theme_base: Option<String>,
    #[serde(default)]
    pub theme_overrides: HashMap<String, String>,
}

fn default_schema_version() -> u32 {
    SCHEMA_VERSION
}
fn default_true() -> bool {
    true
}

impl Default for QuartzSettings {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            league_path: None,
            champions_path: None,
            wad_output_path: None,
            creator_name: None,
            auto_update_enabled: true,
            skipped_update_version: None,
            selected_theme: None,
            theme_base: None,
            theme_overrides: HashMap::new(),
        }
    }
}

// %APPDATA%/Quartz — the app home.
pub fn get_quartz_home() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA")
        .map_err(|_| "APPDATA environment variable not found".to_string())?;
    Ok(PathBuf::from(appdata).join("Quartz"))
}

pub fn ensure_folder_structure() -> Result<PathBuf, String> {
    let home = get_quartz_home()?;
    let dirs = [
        home.join("themes"),
        home.join("hashes"),
        home.join("logs"),
        home.join("cache"),
    ];
    for dir in &dirs {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("Failed to create {}: {}", dir.display(), e))?;
    }
    Ok(home)
}

fn settings_path() -> Result<PathBuf, String> {
    Ok(get_quartz_home()?.join("settings.json"))
}

fn read_settings_from_disk() -> Result<QuartzSettings, String> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(QuartzSettings::default());
    }
    let data =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read settings: {}", e))?;
    serde_json::from_str(&data).map_err(|e| format!("Failed to parse settings: {}", e))
}

/// Only the release startup path consults this; the debug path skips updates
/// entirely, so without this gate it reads as dead code in a debug build.
#[cfg(not(debug_assertions))]
pub(crate) fn auto_update_enabled() -> bool {
    read_settings_from_disk()
        .map(|settings| settings.auto_update_enabled)
        .unwrap_or_else(|error| {
            tracing::warn!("could not read automatic update preference: {error}");
            true
        })
}

fn write_settings_to_disk(settings: &QuartzSettings) -> Result<(), String> {
    let path = settings_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create settings dir: {}", e))?;
    }
    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to write settings: {}", e))
}

// Called once from main.rs setup.
pub fn initialize_app_home() -> Result<PathBuf, String> {
    let home = ensure_folder_structure()?;
    tracing::info!("Quartz home: {}", home.display());
    Ok(home)
}

#[tauri::command]
pub fn get_app_home() -> Result<String, String> {
    get_quartz_home().map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn get_settings() -> Result<QuartzSettings, String> {
    read_settings_from_disk()
}

#[tauri::command]
pub fn save_settings(settings: QuartzSettings) -> Result<(), String> {
    write_settings_to_disk(&settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_have_current_schema_and_auto_update_on() {
        let s = QuartzSettings::default();
        assert_eq!(s.schema_version, SCHEMA_VERSION);
        assert!(s.auto_update_enabled);
        assert!(s.league_path.is_none());
    }

    #[test]
    fn settings_roundtrip_through_json() {
        let mut s = QuartzSettings::default();
        s.creator_name = Some("Frog".into());
        s.league_path = Some(r"C:\Riot Games\League of Legends".into());
        let json = serde_json::to_string(&s).unwrap();
        let back: QuartzSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.creator_name.as_deref(), Some("Frog"));
        assert_eq!(back.league_path, s.league_path);
    }
}
