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

/// Whether a candidate League folder is usable, and why not when it isn't.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaguePathCheck {
    pub valid: bool,
    /// One short sentence naming what is actually wrong, for the Settings field
    /// to show. Empty when the path is valid.
    pub reason: String,
}

/// Check a League install path WITHOUT falling back to detection.
///
/// `get_league_path` silently ignores a bad stored path and moves on to the
/// registry and the common locations, which is right for "just find me an
/// install" but wrong for telling someone whether the path they typed works: a
/// user with a wrong path got "Could not locate a League of Legends install"
/// only once an extraction failed, which reads as "no path set" rather than
/// "your path is wrong". This answers for the given path and nothing else, so
/// Settings can say so the moment it is entered.
///
/// The rules mirror `extractor::is_valid_league_root` — a `Game` subfolder,
/// plus either `LeagueClient.exe` or the champion WAD folder — and each failure
/// is reported separately so the message names the real problem.
#[tauri::command]
pub fn check_league_path(path: String) -> LeaguePathCheck {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return LeaguePathCheck { valid: false, reason: String::new() };
    }

    let root = Path::new(trimmed);
    if !root.is_dir() {
        return LeaguePathCheck {
            valid: false,
            reason: "That folder does not exist.".into(),
        };
    }
    if !root.join("Game").is_dir() {
        /* Say what to pick, not what is missing.
           The two mistakes are picking the `Game` folder INSIDE the install and
           picking the `Riot Games` parent ABOVE it, and in both cases the right
           answer is one folder away — so name that folder instead of reporting
           the absent `Game` directory, which only makes sense to someone who
           already knows the layout. */
        if root.file_name().is_some_and(|n| n.eq_ignore_ascii_case("Game")) {
            // Their own parent IS the answer, so quote it back verbatim.
            let parent = root
                .parent()
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_else(|| "League of Legends".into());
            return LeaguePathCheck {
                valid: false,
                reason: format!("Go up one folder: {parent}"),
            };
        }
        if root.join("League of Legends").join("Game").is_dir() {
            let inner = root.join("League of Legends");
            return LeaguePathCheck {
                valid: false,
                reason: format!("Go one folder deeper: {}", inner.to_string_lossy()),
            };
        }
        return LeaguePathCheck {
            valid: false,
            reason: "Not a League install. Pick the \"League of Legends\" folder itself, \
                     e.g. C:\\Riot Games\\League of Legends"
                .into(),
        };
    }
    if !extractor::is_valid_league_root(root) {
        return LeaguePathCheck {
            valid: false,
            reason: "This folder has a \"Game\" subfolder but no League files in it.".into(),
        };
    }

    LeaguePathCheck { valid: true, reason: String::new() }
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
