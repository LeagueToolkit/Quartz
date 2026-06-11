/* Champion / skin discovery + skin asset extraction.

   Thin Tauri layer over `quartz_lib::extractor`. League detection layers a
   Windows-registry probe (this crate already depends on `winreg`) and the
   stored `settings.json` path on top of quartz-lib's common-path scan.
   Extraction streams `extract-progress` events to the frontend. */

use quartz_lib::extractor::{self, ExtractOptions, ExtractProgress};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

/// Event name the frontend listens on for live extraction progress.
const PROGRESS_EVENT: &str = "extract-progress";

// Re-exported shapes (camelCase) — defined in quartz-lib, surfaced here. The
// nested `SkinEntry` rides along inside `Champion`'s serialization.
pub use extractor::Champion;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractResult {
    pub ok: bool,
    pub output_dir: String,
    pub files: u32,
    pub skipped: u32,
    pub errors: u32,
    pub elapsed_ms: u64,
}

// ── League path detection ──────────────────────────────────────────────────

/// Detect the League of Legends install root.
///
/// Order: stored setting → Windows registry (uninstall keys / Riot client) →
/// common install paths. Returns `None` when nothing valid is found.
#[tauri::command]
pub fn get_league_path() -> Option<String> {
    // 1. Honour an explicitly configured path if it still validates.
    if let Some(stored) = stored_league_path() {
        let p = PathBuf::from(&stored);
        if extractor::is_valid_league_root(&p) {
            return Some(stored);
        }
    }

    // 2. Windows registry.
    #[cfg(windows)]
    if let Some(p) = detect_from_registry() {
        if extractor::is_valid_league_root(&p) {
            return Some(p.to_string_lossy().into_owned());
        }
    }

    // 3. Common install locations.
    extractor::detect_league_path_by_common_paths().map(|p| p.to_string_lossy().into_owned())
}

/// Read the `leaguePath` field out of the persisted settings, if present.
fn stored_league_path() -> Option<String> {
    let appdata = std::env::var("APPDATA").ok()?;
    let path = Path::new(&appdata).join("Quartz").join("settings.json");
    let data = std::fs::read_to_string(path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&data).ok()?;
    json.get("leaguePath")?.as_str().map(|s| s.to_string())
}

/// Probe the registry for a League / Riot Client install location and map it
/// back to the `League of Legends` root.
#[cfg(windows)]
fn detect_from_registry() -> Option<PathBuf> {
    use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY};
    use winreg::RegKey;

    // League's uninstall key carries an InstallLocation that points straight at
    // the install root on most machines.
    const UNINSTALL_KEYS: &[&str] = &[
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Riot Game league_of_legends.live",
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Riot Game league_of_legends.live",
    ];

    for view in [KEY_WOW64_64KEY, KEY_WOW64_32KEY] {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        for sub in UNINSTALL_KEYS {
            if let Ok(key) = hklm.open_subkey_with_flags(sub, KEY_READ | view) {
                if let Ok(loc) = key.get_value::<String, _>("InstallLocation") {
                    let p = PathBuf::from(loc);
                    if p.is_dir() {
                        return Some(p);
                    }
                }
            }
        }
    }
    None
}

// ── Discovery ────────────────────────────────────────────────────────────────

/// Scan the detected (or configured) League install for champions and their
/// skins. Errors when no install can be located or the Champions folder is
/// missing.
#[tauri::command]
pub async fn discover_champions() -> Result<Vec<Champion>, String> {
    let league = get_league_path()
        .ok_or_else(|| "Could not locate a League of Legends install. Set the path in Settings.".to_string())?;
    let root = PathBuf::from(league);

    // Discovery parses every champion WAD's TOC — run it off the async runtime.
    tokio::task::spawn_blocking(move || extractor::discover_champions(&root))
        .await
        .map_err(|e| format!("Discovery task failed: {}", e))?
        .map_err(|e| e.to_string())
}

// ── Extraction ─────────────────────────────────────────────────────────────

/// Extract a champion skin's asset bundle (main WAD + optional voiceover WADs)
/// into `output_dir`. Streams `extract-progress` events while it runs.
#[tauri::command]
pub async fn extract_champion_assets(
    app: AppHandle,
    champion: String,
    skin_id: u32,
    output_dir: String,
    include_vo: Option<bool>,
) -> Result<ExtractResult, String> {
    let league = get_league_path()
        .ok_or_else(|| "Could not locate a League of Legends install. Set the path in Settings.".to_string())?;
    let include_vo = include_vo.unwrap_or(false);

    let summary = tokio::task::spawn_blocking(move || {
        let root = PathBuf::from(&league);
        let out = PathBuf::from(&output_dir);
        let app = app.clone();
        let progress = move |p: ExtractProgress| {
            let _ = app.emit(PROGRESS_EVENT, p);
        };
        extractor::extract_skin(
            ExtractOptions {
                league_root: &root,
                champion: &champion,
                skin_id,
                output_dir: &out,
                include_vo,
            },
            progress,
        )
    })
    .await
    .map_err(|e| format!("Extraction task failed: {}", e))?
    .map_err(|e| e.to_string())?;

    Ok(ExtractResult {
        ok: summary.ok,
        output_dir: summary.output_dir,
        files: summary.files,
        skipped: summary.skipped,
        errors: summary.errors,
        elapsed_ms: summary.elapsed_ms,
    })
}
