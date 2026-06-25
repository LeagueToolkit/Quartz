/* League of Legends install detection.

   Order: stored setting → Windows registry (uninstall keys) → common install
   paths. Panels that pull assets from the live game (Port, Sound Banks) and the
   League Path settings section read this. Thin layer over
   `quartz_lib::extractor`'s path helpers. */

use quartz_lib::extractor;
use std::path::{Path, PathBuf};

/// Detect the League of Legends install root. Returns `None` when nothing valid
/// is found.
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
