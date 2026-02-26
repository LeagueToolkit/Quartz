use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::env;
use tauri::Manager;

const ICON_PREF_KEY: &str = "custom_icon_path";

/// Get the custom config directory: AppData\Roaming\LeagueToolkit\Jade
fn get_config_dir() -> Result<PathBuf, String> {
    let appdata = env::var("APPDATA").map_err(|e| format!("Failed to get APPDATA: {}", e))?;
    let path = PathBuf::from(appdata).join("LeagueToolkit").join("Jade");
    
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| format!("Failed to create config dir: {}", e))?;
    }
    Ok(path)
}

/// Migrate preferences from old txt format to new JSON format
fn migrate_txt_to_json(txt_path: &Path, json_path: &Path) -> Result<(), String> {
    println!("[Migrate] Reading old preferences.txt from {:?}", txt_path);
    
    let content = fs::read_to_string(txt_path)
        .map_err(|e| format!("Failed to read preferences.txt: {}", e))?;
    
    let mut json_prefs = serde_json::json!({});
    
    // Parse the txt file - assuming key=value format, one per line
    for line in content.lines() {
        let line = line.trim();
        
        // Skip empty lines and comments
        if line.is_empty() || line.starts_with('#') || line.starts_with("//") {
            continue;
        }
        
        // Parse key=value
        if let Some(eq_pos) = line.find('=') {
            let key = line[..eq_pos].trim();
            let value = line[eq_pos + 1..].trim();
            
            // Store as string in JSON
            json_prefs[key] = serde_json::Value::String(value.to_string());
            println!("[Migrate] Migrated: {} = {}", key, value);
        }
    }
    
    // Write to JSON file
    let json_content = serde_json::to_string_pretty(&json_prefs)
        .map_err(|e| format!("Failed to serialize to JSON: {}", e))?;
    
    write_file_atomic(json_path, &json_content)
        .map_err(|e| format!("Failed to write JSON: {}", e))?;
    
    println!("[Migrate] Successfully migrated {} preferences to JSON", json_prefs.as_object().map(|o| o.len()).unwrap_or(0));
    
    Ok(())
}

/// Migrate preferences from old locations to new LeagueToolkit\Jade\preferences.json
pub fn migrate_preferences_if_needed(app: &tauri::AppHandle) -> Result<(), String> {
    let new_config_dir = get_config_dir()?;
    let new_pref_json = new_config_dir.join("preferences.json");
    let old_pref_txt = new_config_dir.join("preferences.txt");
    
    // Priority 1: If new JSON already exists, check if we should merge txt into it
    if new_pref_json.exists() {
        println!("[Migrate] New preferences.json already exists at {:?}", new_pref_json);
        
        // Check if old txt file exists and has content we should merge
        if old_pref_txt.exists() {
            println!("[Migrate] Found preferences.txt, checking if merge needed");
            
            // Read existing JSON
            let json_content = fs::read_to_string(&new_pref_json)
                .map_err(|e| format!("Failed to read existing JSON: {}", e))?;
            
            let mut json_prefs: serde_json::Value = serde_json::from_str(&json_content)
                .unwrap_or_else(|_| serde_json::json!({}));
            
            // Read txt file
            let txt_content = fs::read_to_string(&old_pref_txt)
                .map_err(|e| format!("Failed to read txt: {}", e))?;
            
            let mut merged_count = 0;
            
            // Merge txt preferences that don't exist in JSON
            for line in txt_content.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') || line.starts_with("//") {
                    continue;
                }
                
                if let Some(eq_pos) = line.find('=') {
                    let key = line[..eq_pos].trim();
                    let value = line[eq_pos + 1..].trim();
                    
                    // Only add if key doesn't exist in JSON
                    if json_prefs.get(key).is_none() {
                        json_prefs[key] = serde_json::Value::String(value.to_string());
                        merged_count += 1;
                        println!("[Migrate] Merged from txt: {} = {}", key, value);
                    }
                }
            }
            
            if merged_count > 0 {
                // Write updated JSON
                let content = serde_json::to_string_pretty(&json_prefs)
                    .map_err(|e| format!("Failed to serialize: {}", e))?;
                write_file_atomic(&new_pref_json, &content)
                    .map_err(|e| format!("Failed to write merged JSON: {}", e))?;
                println!("[Migrate] Merged {} preferences from txt to JSON", merged_count);
            }
            
            // Backup and remove old txt file
            let backup_path = old_pref_txt.with_extension("txt.backup");
            let _ = fs::rename(&old_pref_txt, &backup_path);
            println!("[Migrate] Backed up preferences.txt to {:?}", backup_path);
        }
        
        return Ok(());
    }
    
    // Priority 2: Check for old preferences.txt in the same folder
    if old_pref_txt.exists() {
        println!("[Migrate] Found preferences.txt, converting to JSON");
        migrate_txt_to_json(&old_pref_txt, &new_pref_json)?;
        
        // Backup and remove old txt file
        let backup_path = old_pref_txt.with_extension("txt.backup");
        let _ = fs::rename(&old_pref_txt, &backup_path);
        println!("[Migrate] Backed up old preferences.txt to {:?}", backup_path);
        
        return Ok(());
    }
    
    // Priority 3: Check for old JSON in Tauri default location
    if let Ok(old_config_dir) = app.path().app_config_dir() {
        let old_pref_json = old_config_dir.join("preferences.json");
        
        if old_pref_json.exists() {
            println!("[Migrate] Found old JSON preferences at {:?}, migrating to {:?}", old_pref_json, new_pref_json);
            
            // Copy the old preferences to new location
            match fs::copy(&old_pref_json, &new_pref_json) {
                Ok(_) => {
                    println!("[Migrate] Successfully migrated JSON preferences");
                    // Remove old file
                    let _ = fs::remove_file(&old_pref_json);
                    println!("[Migrate] Removed old JSON file");
                }
                Err(e) => {
                    eprintln!("[Migrate] Failed to copy preferences: {}", e);
                }
            }
            
            return Ok(());
        }
    }
    
    println!("[Migrate] No old preferences found to migrate");
    Ok(())
}

/// Write content to file atomically to prevent corruption
fn write_file_atomic(path: &Path, content: &str) -> std::io::Result<()> {
    // Ensure parent directory exists (defensive: get_config_dir should already do this,
    // but guard against races or first-run situations)
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    // Write to a temporary file first
    let temp_path = path.with_extension("tmp");
    fs::write(&temp_path, content)?;
    
    // Then atomically rename to the target file
    // On Windows, we need to remove the target file first if it exists
    #[cfg(windows)]
    {
        if path.exists() {
            fs::remove_file(path)?;
        }
    }
    
    fs::rename(&temp_path, path)?;
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct AppInfo {
    pub version: String,
    pub name: String,
    pub author: String,
}

#[tauri::command]
pub async fn get_app_version() -> Result<String, String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

#[tauri::command]
pub async fn get_custom_icon_path(_app: tauri::AppHandle) -> Result<Option<String>, String> {
    let config_dir = get_config_dir()?;
    let pref_file = config_dir.join("preferences.json");
    
    if !pref_file.exists() {
        return Ok(None);
    }
    
    let content = fs::read_to_string(&pref_file)
        .map_err(|e| format!("Failed to read preferences: {}", e))?;
    
    let prefs: serde_json::Value = match serde_json::from_str(&content) {
        Ok(parsed) => parsed,
        Err(e) => {
            eprintln!("Warning: Failed to parse preferences.json when getting custom icon: {}. Returning None.", e);
            return Ok(None);
        }
    };
    
    Ok(prefs.get(ICON_PREF_KEY)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string()))
}

#[tauri::command]
pub async fn get_custom_icon_data(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let icon_path = get_custom_icon_path(app.clone()).await?;
    
    if let Some(path) = icon_path {
        // Apply to window immediately (persistence fix)
        let _ = update_window_icon(&app, &path);

        // Read the icon file and convert to base64 data URL
        let icon_data = fs::read(&path)
            .map_err(|e| format!("Failed to read icon file: {}", e))?;
        
        // Determine MIME type based on file extension
        let mime_type = if path.to_lowercase().ends_with(".png") {
            "image/png"
        } else if path.to_lowercase().ends_with(".ico") {
            "image/x-icon"
        } else if path.to_lowercase().ends_with(".jpg") || path.to_lowercase().ends_with(".jpeg") {
            "image/jpeg"
        } else {
            "image/png" // default
        };
        
        // Convert to base64
        let base64_data = base64_encode(&icon_data);
        let data_url = format!("data:{};base64,{}", mime_type, base64_data);
        
        Ok(Some(data_url))
    } else {
        Ok(None)
    }
}

fn base64_encode(data: &[u8]) -> String {
    use base64::{Engine as _, engine::general_purpose};
    general_purpose::STANDARD.encode(data)
}

#[tauri::command]
pub async fn set_custom_icon(app: tauri::AppHandle, icon_path: String) -> Result<(), String> {
    let config_dir = get_config_dir()?;
    let pref_file = config_dir.join("preferences.json");
    
    // Read existing preferences or create new
    let mut prefs: serde_json::Value = if pref_file.exists() {
        let content = fs::read_to_string(&pref_file)
            .map_err(|e| format!("Failed to read preferences: {}", e))?;
        match serde_json::from_str(&content) {
            Ok(parsed) => parsed,
            Err(e) => {
                eprintln!("Warning: Failed to parse preferences.json: {}. Creating new preferences file.", e);
                // Back up the corrupted file
                let backup_file = pref_file.with_extension("json.backup");
                let _ = fs::copy(&pref_file, &backup_file);
                eprintln!("Backed up corrupted preferences to: {:?}", backup_file);
                serde_json::json!({})
            }
        }
    } else {
        serde_json::json!({})
    };
    
    // Update icon path
    prefs[ICON_PREF_KEY] = serde_json::Value::String(icon_path.clone());
    
    // Write back atomically
    let content = serde_json::to_string_pretty(&prefs)
        .map_err(|e| format!("Failed to serialize preferences: {}", e))?;
    
    write_file_atomic(&pref_file, &content)
        .map_err(|e| format!("Failed to write preferences: {}", e))?;
    
    // Update window icon immediately
    update_window_icon(&app, &icon_path)?;
    
    Ok(())
}

pub fn update_window_icon(app: &tauri::AppHandle, icon_path: &str) -> Result<(), String> {
    // Load and decode the image
    let img = image::open(icon_path)
        .map_err(|e| format!("Failed to load icon image: {}", e))?;
    
    // Convert to RGBA8
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    let rgba_data = rgba.into_raw();
    
    // Create Tauri Image
    let icon = tauri::image::Image::new_owned(rgba_data, width, height);
    
    // Update all windows
    if let Some(window) = app.get_webview_window("main") {
        window.set_icon(icon)
            .map_err(|e| format!("Failed to set window icon: {}", e))?;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn open_url(url: String) -> Result<(), String> {
    opener::open(url)
        .map_err(|e| format!("Failed to open URL: {}", e))
}

#[tauri::command]
pub async fn get_preferences_path(_app: tauri::AppHandle) -> Result<String, String> {
    let config_dir = get_config_dir()?;
    let pref_file = config_dir.join("preferences.json");
    Ok(pref_file.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn open_preferences_folder(_app: tauri::AppHandle) -> Result<(), String> {
    let config_dir = get_config_dir()?;
    opener::open(config_dir)
        .map_err(|e| format!("Failed to open config folder: {}", e))
}

#[tauri::command]
pub async fn get_all_preferences(_app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let config_dir = get_config_dir()?;
    let pref_file = config_dir.join("preferences.json");
    
    if !pref_file.exists() {
        return Ok(serde_json::json!({}));
    }
    
    let content = fs::read_to_string(&pref_file)
        .map_err(|e| format!("Failed to read preferences: {}", e))?;
    
    let prefs: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse preferences: {}", e))?;
    
    Ok(prefs)
}

const WINDOW_STATE_KEY: &str = "window_state";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WindowState {
    pub width: f64,
    pub height: f64,
    pub x: i32,
    pub y: i32,
    pub maximized: bool,
    #[serde(default)]
    pub fullscreen: bool,
}

#[tauri::command]
pub async fn save_window_state(_app: tauri::AppHandle, state: WindowState) -> Result<(), String> {
    println!("[WindowState] Saving: {:?}", state);
    
    // Ensure minimum window size (default is 800x600)
    const MIN_WIDTH: f64 = 800.0;
    const MIN_HEIGHT: f64 = 600.0;
    
    let mut validated_state = state.clone();
    
    if validated_state.width < MIN_WIDTH {
        println!("[WindowState] Width {} is too small, enforcing minimum {}", validated_state.width, MIN_WIDTH);
        validated_state.width = MIN_WIDTH;
    }
    
    if validated_state.height < MIN_HEIGHT {
        println!("[WindowState] Height {} is too small, enforcing minimum {}", validated_state.height, MIN_HEIGHT);
        validated_state.height = MIN_HEIGHT;
    }
    
    // Validate position - don't save if it's the minimized position or way off-screen
    // Windows uses -32000 for minimized windows
    let position_valid = validated_state.x > -10000 && validated_state.y > -10000 
                        && validated_state.x < 10000 && validated_state.y < 10000;
    
    if !position_valid {
        println!("[WindowState] Position ({}, {}) is invalid (likely minimized or off-screen), will not save this state", 
                 validated_state.x, validated_state.y);
        // Don't save invalid positions
        return Ok(());
    }
    
    let config_dir = get_config_dir()?;
    let pref_file = config_dir.join("preferences.json");
    println!("[WindowState] Preferences file: {:?}", pref_file);
    
    // Read existing preferences or create new
    let mut prefs: serde_json::Value = if pref_file.exists() {
        let content = fs::read_to_string(&pref_file)
            .map_err(|e| format!("Failed to read preferences: {}", e))?;
        match serde_json::from_str(&content) {
            Ok(parsed) => parsed,
            Err(e) => {
                eprintln!("Warning: Failed to parse preferences.json: {}. Creating new preferences file.", e);
                // Back up the corrupted file
                let backup_file = pref_file.with_extension("json.backup");
                let _ = fs::copy(&pref_file, &backup_file);
                eprintln!("Backed up corrupted preferences to: {:?}", backup_file);
                serde_json::json!({})
            }
        }
    } else {
        serde_json::json!({})
    };
    
    // Update window state with validated dimensions
    prefs[WINDOW_STATE_KEY] = serde_json::to_value(validated_state.clone())
        .map_err(|e| format!("Failed to serialize window state: {}", e))?;
    
    // Write back atomically
    let content = serde_json::to_string_pretty(&prefs)
        .map_err(|e| format!("Failed to serialize preferences: {}", e))?;
    
    write_file_atomic(&pref_file, &content)
        .map_err(|e| format!("Failed to write preferences: {}", e))?;
    
    println!("[WindowState] Successfully saved window state");
    Ok(())
}

#[tauri::command]
pub async fn get_window_state(_app: tauri::AppHandle) -> Result<Option<WindowState>, String> {
    let config_dir = get_config_dir()?;
    let pref_file = config_dir.join("preferences.json");
    println!("[WindowState] Reading from: {:?}", pref_file);
    
    if !pref_file.exists() {
        println!("[WindowState] Preferences file doesn't exist");
        return Ok(None);
    }
    
    let content = fs::read_to_string(&pref_file)
        .map_err(|e| format!("Failed to read preferences: {}", e))?;
    
    let prefs: serde_json::Value = match serde_json::from_str(&content) {
        Ok(parsed) => parsed,
        Err(e) => {
            eprintln!("Warning: Failed to parse preferences.json when getting window state: {}. Returning None.", e);
            return Ok(None);
        }
    };
    
    let state = prefs.get(WINDOW_STATE_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok());
    
    println!("[WindowState] Loaded state: {:?}", state);
    Ok(state)
}

#[tauri::command]
pub async fn get_preference(_app: tauri::AppHandle, key: String, default_value: String) -> Result<String, String> {
    let config_dir = get_config_dir()?;
    let pref_file = config_dir.join("preferences.json");
    
    if !pref_file.exists() {
        return Ok(default_value);
    }
    
    let content = fs::read_to_string(&pref_file)
        .map_err(|e| format!("Failed to read preferences: {}", e))?;
    
    let prefs: serde_json::Value = match serde_json::from_str(&content) {
        Ok(parsed) => parsed,
        Err(e) => {
            eprintln!("Warning: Failed to parse preferences.json when getting '{}': {}. Using default value.", key, e);
            // Return default instead of failing
            return Ok(default_value);
        }
    };
    
    let value = prefs.get(&key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| default_value.clone());
    
    Ok(value)
}

#[tauri::command]
pub async fn set_preference(_app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    let config_dir = get_config_dir()?;
    let pref_file = config_dir.join("preferences.json");
    
    // Read existing preferences or create new
    let mut prefs: serde_json::Value = if pref_file.exists() {
        let content = fs::read_to_string(&pref_file)
            .map_err(|e| format!("Failed to read preferences: {}", e))?;
        match serde_json::from_str(&content) {
            Ok(parsed) => parsed,
            Err(e) => {
                eprintln!("Warning: Failed to parse preferences.json: {}. Creating new preferences file.", e);
                // Back up the corrupted file
                let backup_file = pref_file.with_extension("json.backup");
                let _ = fs::copy(&pref_file, &backup_file);
                eprintln!("Backed up corrupted preferences to: {:?}", backup_file);
                serde_json::json!({})
            }
        }
    } else {
        serde_json::json!({})
    };
    
    // Update preference
    prefs[key.clone()] = serde_json::Value::String(value.clone());
    
    // Write back atomically
    let content = serde_json::to_string_pretty(&prefs)
        .map_err(|e| format!("Failed to serialize preferences: {}", e))?;
    
    write_file_atomic(&pref_file, &content)
        .map_err(|e| format!("Failed to write preferences: {}", e))?;
    
    Ok(())
}

const RECENT_FILES_KEY: &str = "recent_files";
const MAX_RECENT_FILES: usize = 10;

#[tauri::command]
pub async fn get_recent_files(_app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let config_dir = get_config_dir()?;
    let pref_file = config_dir.join("preferences.json");
    
    if !pref_file.exists() {
        return Ok(Vec::new());
    }
    
    let content = fs::read_to_string(&pref_file)
        .map_err(|e| format!("Failed to read preferences: {}", e))?;
    
    let prefs: serde_json::Value = match serde_json::from_str(&content) {
        Ok(parsed) => parsed,
        Err(e) => {
            eprintln!("Warning: Failed to parse preferences.json when getting recent files: {}. Returning empty list.", e);
            return Ok(Vec::new());
        }
    };
    
    Ok(prefs.get(RECENT_FILES_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default())
}

#[tauri::command]
pub async fn add_recent_file(app: tauri::AppHandle, path: String) -> Result<Vec<String>, String> {
    let mut recent = get_recent_files(app.clone()).await?;
    
    // Remove if already exists
    recent.retain(|p| p.to_lowercase() != path.to_lowercase());
    
    // Add to front
    recent.insert(0, path);
    
    // Keep only MAX_RECENT_FILES
    recent.truncate(MAX_RECENT_FILES);
    
    // Save back
    let config_dir = get_config_dir()?;
    let pref_file = config_dir.join("preferences.json");
    
    let mut prefs: serde_json::Value = if pref_file.exists() {
        let content = fs::read_to_string(&pref_file)
            .map_err(|e| format!("Failed to read preferences: {}", e))?;
        match serde_json::from_str(&content) {
            Ok(parsed) => parsed,
            Err(e) => {
                eprintln!("Warning: Failed to parse preferences.json: {}. Creating new preferences file.", e);
                // Back up the corrupted file
                let backup_file = pref_file.with_extension("json.backup");
                let _ = fs::copy(&pref_file, &backup_file);
                eprintln!("Backed up corrupted preferences to: {:?}", backup_file);
                serde_json::json!({})
            }
        }
    } else {
        serde_json::json!({})
    };
    
    prefs[RECENT_FILES_KEY] = serde_json::to_value(&recent)
        .map_err(|e| format!("Failed to serialize recent files: {}", e))?;
    
    let content = serde_json::to_string_pretty(&prefs)
        .map_err(|e| format!("Failed to serialize preferences: {}", e))?;
    
    write_file_atomic(&pref_file, &content)
        .map_err(|e| format!("Failed to write preferences: {}", e))?;
    
    Ok(recent)
}

/// Return the last-modified timestamp (seconds since Unix epoch) for a file.
/// Used by the texture preview tab to detect external edits.
#[tauri::command]
pub async fn get_file_mtime(path: String) -> Result<u64, String> {
    let meta = fs::metadata(&path)
        .map_err(|e| format!("Cannot stat '{}': {}", path, e))?;
    let mtime = meta
        .modified()
        .map_err(|e| format!("Cannot read mtime: {}", e))?;
    let secs = mtime
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    Ok(secs)
}

/// Read a binary file and return its contents as a base64-encoded string.
#[tauri::command]
pub async fn read_file_base64(path: String) -> Result<String, String> {
    let bytes = fs::read(&path)
        .map_err(|e| format!("Failed to read file '{}': {}", path, e))?;
    Ok(base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes))
}

/// Given the path of the currently open file and a relative asset path (e.g.
/// "ASSETS/Characters/Ahri/...tex"), walk up the directory tree of the open
/// file looking for a parent that contains the asset and return the first
/// resolved absolute path that actually exists.
#[tauri::command]
pub async fn resolve_asset_path(base_file: String, asset_path: String) -> Result<Option<String>, String> {
    // Normalise to forward slashes for uniform handling
    let asset_norm = asset_path.replace('\\', "/");

    // 1. If the asset path is already absolute, check directly.
    let as_path = std::path::Path::new(&asset_norm);
    if as_path.is_absolute() {
        return Ok(if as_path.exists() { Some(asset_norm) } else { None });
    }

    // 2. Walk up from the directory of base_file.
    let base = std::path::Path::new(&base_file);
    let mut dir = if base.is_file() {
        base.parent().map(|p| p.to_path_buf())
    } else {
        Some(base.to_path_buf())
    };

    while let Some(d) = dir {
        let candidate = d.join(&asset_norm);
        if candidate.exists() {
            return Ok(Some(candidate.to_string_lossy().replace('\\', "/")));
        }
        dir = d.parent().map(|p| p.to_path_buf());
    }

    Ok(None)
}

// ─────────────────────────────────────────────────────────────────────────────
// Image editor detection + launch
// ─────────────────────────────────────────────────────────────────────────────

/// Try a list of candidate paths; return the first one that exists.
fn find_exe(candidates: &[&str]) -> Option<String> {
    for c in candidates {
        if !c.is_empty() && std::path::Path::new(c).exists() {
            return Some(c.to_string());
        }
    }
    None
}

/// Look up an App Paths entry in HKLM (Windows only).
#[cfg(windows)]
fn find_exe_via_registry(app_paths_key: &str) -> Option<String> {
    use winreg::enums::*;
    use winreg::RegKey;
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let variants = [
        format!(r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{}", app_paths_key),
        format!(r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\{}", app_paths_key),
    ];
    for path in &variants {
        if let Ok(key) = hklm.open_subkey(path) {
            if let Ok(exe) = key.get_value::<String, _>("") {
                if std::path::Path::new(&exe).exists() {
                    return Some(exe);
                }
            }
        }
    }
    None
}

fn locate_paintnet() -> Option<String> {
    let r = find_exe(&[
        r"C:\Program Files\paint.net\paintdotnet.exe",
        r"C:\Program Files\paint.net\PaintDotNet.exe",
        r"C:\Program Files (x86)\paint.net\paintdotnet.exe",
        r"C:\Program Files (x86)\paint.net\PaintDotNet.exe",
    ]);
    if r.is_some() { return r; }
    #[cfg(windows)] { find_exe_via_registry("PaintDotNet.exe") }
    #[cfg(not(windows))] { None }
}

fn locate_photoshop() -> Option<String> {
    // Try common Adobe install paths (newest versions first)
    let common_bases = [
        r"C:\Program Files\Adobe",
        r"C:\Program Files (x86)\Adobe",
    ];
    for base in &common_bases {
        if let Ok(entries) = std::fs::read_dir(base) {
            let mut dirs: Vec<_> = entries
                .filter_map(|e| e.ok())
                .filter(|e| {
                    let name = e.file_name();
                    let n = name.to_string_lossy().to_lowercase();
                    n.starts_with("adobe photoshop")
                })
                .collect();
            // Sort descending so newest version is first
            dirs.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
            for dir in dirs {
                let exe = dir.path().join("Photoshop.exe");
                if exe.exists() {
                    return Some(exe.to_string_lossy().into_owned());
                }
            }
        }
    }
    #[cfg(windows)] { find_exe_via_registry("Photoshop.exe") }
    #[cfg(not(windows))] { None }
}

fn locate_gimp() -> Option<String> {
    let r = find_exe(&[
        r"C:\Program Files\GIMP 3\bin\gimp-3.0.exe",
        r"C:\Program Files\GIMP 2\bin\gimp-2.10.exe",
        r"C:\Program Files\GIMP 2\bin\gimp-2.0.exe",
        r"C:\Program Files (x86)\GIMP 2\bin\gimp-2.10.exe",
    ]);
    if r.is_some() { return r; }
    // Try registry
    #[cfg(windows)]
    {
        use winreg::enums::*;
        use winreg::RegKey;
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let search_keys = [
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\GIMP_is1",
            r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\GIMP_is1",
        ];
        for key_path in &search_keys {
            if let Ok(key) = hklm.open_subkey(key_path) {
                if let Ok(install_location) = key.get_value::<String, _>("InstallLocation") {
                    let exe = std::path::Path::new(&install_location).join("bin").join("gimp-2.10.exe");
                    if exe.exists() { return Some(exe.to_string_lossy().into_owned()); }
                    let exe3 = std::path::Path::new(&install_location).join("bin").join("gimp-3.0.exe");
                    if exe3.exists() { return Some(exe3.to_string_lossy().into_owned()); }
                }
            }
        }
    }
    None
}

#[derive(serde::Serialize)]
pub struct ImageEditorStatus {
    pub paintnet: bool,
    pub photoshop: bool,
    pub gimp: bool,
}

/// Detect which image editors are installed and return their availability.
#[tauri::command]
pub async fn detect_image_editors() -> Result<ImageEditorStatus, String> {
    Ok(ImageEditorStatus {
        paintnet:  locate_paintnet().is_some(),
        photoshop: locate_photoshop().is_some(),
        gimp:      locate_gimp().is_some(),
    })
}

/// Open a .tex file for editing.
/// Reads the `TexEditorApp` preference (default|paintnet|photoshop|gimp) and
/// launches the appropriate application. Falls back to the OS default handler.
#[tauri::command]
pub async fn open_tex_for_edit(app: tauri::AppHandle, file_path: String) -> Result<(), String> {
    let pref = get_preference(app, "TexEditorApp".to_string(), "default".to_string())
        .await
        .unwrap_or_else(|_| "default".to_string());

    let exe_path: Option<String> = match pref.as_str() {
        "paintnet"  => locate_paintnet(),
        "photoshop" => locate_photoshop(),
        "gimp"      => locate_gimp(),
        _           => None, // "default" or unknown → use OS default
    };

    if let Some(exe) = exe_path {
        std::process::Command::new(&exe)
            .arg(&file_path)
            .spawn()
            .map_err(|e| format!("Failed to launch image editor: {}", e))?;
        return Ok(());
    }

    // Open with OS default handler
    open_with_os_default(&file_path)
}

/// Open a file with the operating-system default handler.
///
/// On Windows we use `cmd /c start "" "path"` which is exactly what Windows
/// Explorer does when you double-click a file, so it honours whatever default
/// app the user has set — even for uncommon extensions like `.tex`.
fn open_with_os_default(file_path: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        // Normalise to backslashes so cmd.exe is happy
        let win_path = file_path.replace('/', "\\");
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &win_path])
            .spawn()
            .map_err(|e| format!("Failed to open file with default handler: {}", e))?;
        return Ok(());
    }
    #[cfg(not(windows))]
    {
        opener::open(file_path)
            .map_err(|e| format!("Failed to open file with default handler: {}", e))?;
        Ok(())
    }
}