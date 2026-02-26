/// Extra commands: file association, autostart, updater
use serde::{Deserialize, Serialize};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use futures::StreamExt;

// ============================================================
// File Association (Windows Registry)
// ============================================================

#[cfg(windows)]
fn get_exe_path() -> Result<String, String> {
    std::env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to get exe path: {}", e))
}

/// Notify Windows shell of association changes
#[cfg(windows)]
fn notify_shell_change() {
    // SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, NULL, NULL)
    unsafe {
        type SHChangeNotifyFn = unsafe extern "system" fn(i32, u32, *const std::ffi::c_void, *const std::ffi::c_void);
        if let Ok(lib) = libloading::Library::new("shell32.dll") {
            if let Ok(func) = lib.get::<SHChangeNotifyFn>(b"SHChangeNotify") {
                func(0x08000000i32, 0x0000u32, std::ptr::null(), std::ptr::null());
            }
        }
    }
}

/// Register .bin file association in Windows registry (HKCU, no admin needed)
#[tauri::command]
pub async fn register_bin_association() -> Result<(), String> {
    #[cfg(windows)]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let exe_path = get_exe_path()?;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);

        let (class_key, _) = hkcu
            .create_subkey(r"Software\Classes\JadeBinFile")
            .map_err(|e| format!("Failed to create class key: {}", e))?;
        class_key.set_value("", &"Jade League Bin File")
            .map_err(|e| format!("Failed to set class name: {}", e))?;

        let (icon_key, _) = class_key
            .create_subkey("DefaultIcon")
            .map_err(|e| format!("Failed to create icon key: {}", e))?;
        icon_key.set_value("", &format!("{},0", exe_path))
            .map_err(|e| format!("Failed to set icon: {}", e))?;

        let (cmd_key, _) = class_key
            .create_subkey(r"shell\open\command")
            .map_err(|e| format!("Failed to create command key: {}", e))?;
        cmd_key.set_value("", &format!("\"{}\" \"%1\"", exe_path))
            .map_err(|e| format!("Failed to set open command: {}", e))?;

        let (ext_key, _) = hkcu
            .create_subkey(r"Software\Classes\.bin")
            .map_err(|e| format!("Failed to create .bin key: {}", e))?;
        ext_key.set_value("", &"JadeBinFile")
            .map_err(|e| format!("Failed to set .bin default: {}", e))?;

        notify_shell_change();
        println!("[FileAssoc] Registered .bin association for: {}", exe_path);
        Ok(())
    }
    #[cfg(not(windows))]
    {
        Err("File association is only supported on Windows".to_string())
    }
}

/// Unregister .bin file association from Windows registry
#[tauri::command]
pub async fn unregister_bin_association() -> Result<(), String> {
    #[cfg(windows)]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);

        if let Ok(ext_key) = hkcu.open_subkey(r"Software\Classes\.bin") {
            let current_val: Result<String, _> = ext_key.get_value("");
            if current_val.ok().as_deref() == Some("JadeBinFile") {
                let _ = hkcu.delete_subkey_all(r"Software\Classes\.bin");
            }
        }
        let _ = hkcu.delete_subkey_all(r"Software\Classes\JadeBinFile");

        notify_shell_change();
        println!("[FileAssoc] Unregistered .bin association");
        Ok(())
    }
    #[cfg(not(windows))]
    {
        Err("File association is only supported on Windows".to_string())
    }
}

/// Check if .bin file association is registered for Jade
#[tauri::command]
pub async fn get_bin_association_status() -> bool {
    #[cfg(windows)]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(ext_key) = hkcu.open_subkey(r"Software\Classes\.bin") {
            let val: Result<String, _> = ext_key.get_value("");
            return val.ok().as_deref() == Some("JadeBinFile");
        }
        false
    }
    #[cfg(not(windows))]
    {
        false
    }
}

// ============================================================
// Autostart
// ============================================================

/// Enable or disable start at startup
#[tauri::command]
pub async fn toggle_autostart(app: tauri::AppHandle, enable: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let autolaunch = app.autolaunch();
    if enable {
        autolaunch.enable().map_err(|e| format!("Failed to enable autostart: {}", e))?;
        println!("[Autostart] Enabled startup");
    } else {
        autolaunch.disable().map_err(|e| format!("Failed to disable autostart: {}", e))?;
        println!("[Autostart] Disabled startup");
    }
    crate::app_commands::set_preference(
        app,
        "StartAtStartup".to_string(),
        if enable { "True" } else { "False" }.to_string(),
    ).await
}

/// Check if autostart is currently enabled
#[tauri::command]
pub async fn get_autostart_status(app: tauri::AppHandle) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().unwrap_or(false)
}

// ============================================================
// Updater
// ============================================================

const GITHUB_REPO: &str = "LeagueToolkit/Jade";
const RELEASES_URL: &str = "https://github.com/LeagueToolkit/Jade/releases/latest";

/// Holds the path to the downloaded installer so it can be run separately
static INSTALLER_PATH: Lazy<Mutex<Option<std::path::PathBuf>>> =
    Lazy::new(|| Mutex::new(None));

#[derive(Clone, Serialize)]
struct DownloadProgress {
    downloaded: u64,
    total: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub available: bool,
    pub version: String,
    pub notes: String,
    pub release_url: String,
}

fn is_newer_version(remote: &str, current: &str) -> bool {
    let parse = |v: &str| -> Vec<u64> {
        v.split('.').filter_map(|p| p.parse().ok()).collect()
    };
    parse(remote) > parse(current)
}

fn make_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("jade-app")
        .build()
        .unwrap_or_default()
}

async fn fetch_latest_release() -> Result<serde_json::Value, String> {
    let url = format!("https://api.github.com/repos/{}/releases/latest", GITHUB_REPO);
    let resp = make_client()
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API returned {}", resp.status()));
    }

    resp.json().await.map_err(|e| format!("Failed to parse response: {}", e))
}

/// Check GitHub releases API for a newer version
#[tauri::command]
pub async fn check_for_update() -> Result<UpdateInfo, String> {
    let current = env!("CARGO_PKG_VERSION");
    let json = fetch_latest_release().await?;

    let tag = json["tag_name"].as_str().unwrap_or("").trim_start_matches('v').to_string();
    let notes = json["body"].as_str().unwrap_or("").to_string();
    let release_url = json["html_url"].as_str().unwrap_or(RELEASES_URL).to_string();

    Ok(UpdateInfo {
        available: is_newer_version(&tag, current),
        version: tag,
        notes,
        release_url,
    })
}

/// Stream-download the installer, emitting progress events, then store the path
#[tauri::command]
pub async fn start_update_download(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Emitter;

    let json = fetch_latest_release().await?;

    let assets = json["assets"].as_array()
        .ok_or("No assets found in release")?;

    let installer = assets.iter()
        .find(|a| a["name"].as_str().unwrap_or("").to_lowercase().ends_with(".exe"))
        .ok_or("No .exe installer found in the latest release")?;

    let download_url = installer["browser_download_url"].as_str()
        .ok_or("Installer asset has no download URL")?;
    let filename = installer["name"].as_str().unwrap_or("jade-setup.exe");
    let installer_path = std::env::temp_dir().join(filename);

    let resp = make_client()
        .get(download_url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    let total = resp.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut bytes: Vec<u8> = if total > 0 { Vec::with_capacity(total as usize) } else { Vec::new() };

    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
        downloaded += chunk.len() as u64;
        bytes.extend_from_slice(&chunk);
        let _ = app.emit("update-download-progress", DownloadProgress { downloaded, total });
    }

    std::fs::write(&installer_path, &bytes)
        .map_err(|e| format!("Failed to save installer: {}", e))?;

    *INSTALLER_PATH.lock() = Some(installer_path);
    Ok(())
}

/// Run the previously downloaded installer.
/// Pass silent=true for NSIS /S (no prompts), then exits the app.
#[tauri::command]
pub async fn run_installer(silent: bool, app: tauri::AppHandle) -> Result<(), String> {
    let path = INSTALLER_PATH.lock().clone()
        .ok_or("No installer has been downloaded yet")?;

    if !path.exists() {
        return Err("Installer file no longer exists on disk".to_string());
    }

    let mut cmd = std::process::Command::new(&path);
    if silent {
        cmd.arg("/S");
    }
    cmd.spawn().map_err(|e| format!("Failed to launch installer: {}", e))?;

    app.exit(0);
    Ok(())
}
