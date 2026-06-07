/* App asset files under %APPDATA%/Quartz: fonts, cursors, wallpapers. Backs the
   Appearance section (font scanning, cursor grid, wallpaper gallery). */

use crate::commands::settings::get_quartz_home;
use base64::Engine;
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetFile {
    pub name: String,
    pub path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WallpaperItem {
    pub id: String,
    pub display_name: String,
    pub file_path: String,
}

fn subdir(name: &str) -> Result<PathBuf, String> {
    let dir = get_quartz_home()?.join(name);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create {}: {}", dir.display(), e))?;
    Ok(dir)
}

fn ext_of(path: &Path) -> String {
    path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase()
}

fn list_files_with_exts(dir: &Path, exts: &[&str]) -> Vec<AssetFile> {
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && exts.contains(&ext_of(&path).as_str()) {
                let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                out.push(AssetFile { name, path: path.to_string_lossy().into_owned() });
            }
        }
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}

/* Copies bundled wallpapers/cursors (shipped as Tauri resources) into the app's
   wallpapers/cursors dirs on first run, so themed presets have their images.
   Existing files are never overwritten — user imports win. */
pub fn seed_bundled_assets(resource_dir: &Path) {
    for sub in ["wallpapers", "cursors"] {
        // Tauri keeps the declared `resources/<sub>` path under resource_dir; some
        // layouts flatten it. Try both.
        let candidates = [resource_dir.join("resources").join(sub), resource_dir.join(sub)];
        let Some(src) = candidates.into_iter().find(|p| p.is_dir()) else { continue };
        let Ok(dest) = subdir(sub) else { continue };
        let Ok(entries) = std::fs::read_dir(&src) else { continue };
        for entry in entries.flatten() {
            let from = entry.path();
            if !from.is_file() { continue; }
            let Some(name) = from.file_name() else { continue };
            let to = dest.join(name);
            if to.exists() { continue; }
            if let Err(e) = std::fs::copy(&from, &to) {
                tracing::warn!("Failed to seed {}: {}", to.display(), e);
            }
        }
    }
}

/// Read any file as a base64 string (for cursor/wallpaper previews via data URI).
#[tauri::command]
pub fn read_file_base64(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read {}: {}", path, e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

// ── Fonts ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_fonts_dir() -> Result<String, String> {
    Ok(subdir("fonts")?.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn list_fonts() -> Result<Vec<AssetFile>, String> {
    Ok(list_files_with_exts(&subdir("fonts")?, &["ttf", "otf", "woff", "woff2"]))
}

// ── Cursors ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_cursors_dir() -> Result<String, String> {
    Ok(subdir("cursors")?.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn list_cursors() -> Result<Vec<AssetFile>, String> {
    Ok(list_files_with_exts(&subdir("cursors")?, &["cur", "png", "gif"]))
}

// ── Wallpapers ─────────────────────────────────────────────────────────────

const WALLPAPER_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp"];

#[tauri::command]
pub fn get_wallpapers_dir() -> Result<String, String> {
    Ok(subdir("wallpapers")?.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn list_wallpapers() -> Result<Vec<WallpaperItem>, String> {
    let dir = subdir("wallpapers")?;
    Ok(list_files_with_exts(&dir, WALLPAPER_EXTS)
        .into_iter()
        .map(|f| {
            let stem = Path::new(&f.name).file_stem().and_then(|s| s.to_str()).unwrap_or(&f.name).to_string();
            WallpaperItem { id: f.name.clone(), display_name: stem, file_path: f.path }
        })
        .collect())
}

/// Copy a user-picked image into the wallpapers dir and return the new item.
#[tauri::command]
pub fn import_wallpaper(src_path: String) -> Result<WallpaperItem, String> {
    let src = PathBuf::from(&src_path);
    let ext = ext_of(&src);
    if !WALLPAPER_EXTS.contains(&ext.as_str()) {
        return Err(format!("Unsupported image type: .{}", ext));
    }
    let file_name = src.file_name().and_then(|n| n.to_str()).ok_or("Invalid source path")?.to_string();
    let dir = subdir("wallpapers")?;
    let mut dest = dir.join(&file_name);

    // Avoid clobbering an existing file with the same name.
    if dest.exists() {
        let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("wallpaper").to_string();
        let mut n = 1;
        loop {
            let candidate = dir.join(format!("{}-{}.{}", stem, n, ext));
            if !candidate.exists() { dest = candidate; break; }
            n += 1;
        }
    }

    std::fs::copy(&src, &dest).map_err(|e| format!("Failed to import wallpaper: {}", e))?;
    let id = dest.file_name().and_then(|n| n.to_str()).unwrap_or(&file_name).to_string();
    let display_name = dest.file_stem().and_then(|s| s.to_str()).unwrap_or(&id).to_string();
    Ok(WallpaperItem { id, display_name, file_path: dest.to_string_lossy().into_owned() })
}

#[tauri::command]
pub fn delete_wallpaper(id: String) -> Result<(), String> {
    let path = subdir("wallpapers")?.join(&id);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Failed to delete wallpaper: {}", e))?;
    }
    Ok(())
}
