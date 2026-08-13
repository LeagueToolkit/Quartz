use serde::Serialize;
use std::path::{Path, PathBuf};

/// Result returned after Windows accepts the Jade launch request.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JadeOpenResult {
    pub launched: Option<String>,
    pub warning: Option<String>,
}

fn validate_bin_path(raw: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw);
    if !path.is_file() {
        return Err(format!("BIN path was not found: {}", path.display()));
    }
    let supported = path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|ext| matches!(ext.to_ascii_lowercase().as_str(), "bin" | "py" | "ritobin"));
    if !supported {
        return Err("Jade can only open .bin, .py, or .ritobin files from Quartz.".to_string());
    }
    // Canonicalize to resolve `..` and symlinks, then DROP the `\\?\` prefix it adds
    // on Windows. The receiving tool derives its project root from this path and
    // appends asset paths to it; `\\?\` paths are used verbatim by the filesystem,
    // so a forward slash in an appended asset path never resolves. RubyRe showed
    // exactly that: the bin opened, but no character and no VFX textures.
    let canonical = std::fs::canonicalize(&path).unwrap_or(path);
    Ok(strip_extended_prefix(canonical))
}

/// Drop a Windows extended-length `\\?\` prefix, leaving `\\?\UNC\...` alone
/// (stripping that yields `UNC\server\...`, which is not a usable path).
fn strip_extended_prefix(path: PathBuf) -> PathBuf {
    let stripped = {
        let text = path.to_string_lossy();
        text.strip_prefix(r"\\?\")
            .filter(|rest| !rest.starts_with("UNC\\"))
            .map(PathBuf::from)
    };
    stripped.unwrap_or(path)
}

#[cfg(target_os = "windows")]
fn start_menu_shortcut(name: &str) -> Option<PathBuf> {
    let leaf = format!("{name}.lnk");
    let user = std::env::var_os("APPDATA").map(PathBuf::from).map(|root| {
        root.join("Microsoft")
            .join("Windows")
            .join("Start Menu")
            .join("Programs")
            .join(&leaf)
    });
    let machine = std::env::var_os("ProgramData")
        .map(PathBuf::from)
        .map(|root| {
            root.join("Microsoft")
                .join("Windows")
                .join("Start Menu")
                .join("Programs")
                .join(&leaf)
        });
    user.into_iter().chain(machine).find(|path| path.is_file())
}

#[cfg(target_os = "windows")]
fn start_menu_jade_shortcut() -> Option<PathBuf> {
    start_menu_shortcut("Jade")
}

#[cfg(target_os = "windows")]
fn wide(value: &std::ffi::OsStr) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    value.encode_wide().chain(std::iter::once(0)).collect()
}

/// Uses the Windows shell, just like double-clicking the installed Jade entry.
/// The Start-menu shortcut is the install contract; an explicit path is only
/// retained for portable/dev builds configured by the user.
#[cfg(target_os = "windows")]
fn shell_open_jade(target: &Path, bin_path: Option<&Path>) -> Result<(), String> {
    use windows_sys::Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL};

    let operation = wide(std::ffi::OsStr::new("open"));
    let target = wide(target.as_os_str());
    let parameters = bin_path.map(|path| {
        let quoted = format!("\"{}\"", path.display());
        wide(std::ffi::OsStr::new(&quoted))
    });
    let parameters_ptr = parameters
        .as_ref()
        .map_or(std::ptr::null(), |value| value.as_ptr());

    // ShellExecuteW returns a value greater than 32 when Windows accepted it.
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            target.as_ptr(),
            parameters_ptr,
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    } as isize;
    if result <= 32 {
        return Err(format!(
            "Windows could not start Jade (ShellExecute error {result})."
        ));
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn shell_open_jade(_target: &Path, _bin_path: Option<&Path>) -> Result<(), String> {
    Err("Opening Jade is currently supported on Windows only.".to_string())
}

/// Opens a BIN through the natively installed Jade application, or opens Jade
/// by itself when the active Quartz page has no BIN loaded.
#[tauri::command]
pub fn jade_open(
    bin_path: Option<String>,
    configured_executable: Option<String>,
) -> Result<JadeOpenResult, String> {
    let bin_path = bin_path.as_deref().map(validate_bin_path).transpose()?;

    let configured = configured_executable
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .filter(|path| path.is_file());

    #[cfg(target_os = "windows")]
    let target = configured.or_else(start_menu_jade_shortcut);
    #[cfg(not(target_os = "windows"))]
    let target = configured;

    let Some(target) = target else {
        return Ok(JadeOpenResult {
            launched: None,
            warning: Some(
                "Jade is not installed in the Windows Start menu. Install Jade or set a portable Jade Executable Path in Settings > External Tools."
                    .to_string(),
            ),
        });
    };

    shell_open_jade(&target, bin_path.as_deref())?;
    Ok(JadeOpenResult {
        launched: Some(target.to_string_lossy().into_owned()),
        warning: None,
    })
}

/// True when RubyRe resolves to something launchable, so the UI can show its
/// button in a "not installed" state instead of failing on click.
#[tauri::command]
pub fn ruby_installed(configured_executable: Option<String>) -> bool {
    resolve_ruby(configured_executable).is_some()
}

fn resolve_ruby(configured_executable: Option<String>) -> Option<PathBuf> {
    let configured = configured_executable
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .filter(|path| path.is_file());

    #[cfg(target_os = "windows")]
    {
        // Both names are in the wild: the product is "RubyRe" but the installer
        // has shipped a plain "Ruby" shortcut too.
        configured
            .or_else(|| start_menu_shortcut("RubyRe"))
            .or_else(|| start_menu_shortcut("Ruby"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        configured
    }
}

/// Open a BIN in RubyRe, the VFX previewer. Mirrors `jade_open`: the Start-menu
/// shortcut is the install contract, and `launched: None` with a warning means
/// "not installed" rather than an error.
#[tauri::command]
pub fn ruby_open(
    bin_path: Option<String>,
    configured_executable: Option<String>,
) -> Result<JadeOpenResult, String> {
    let bin_path = bin_path.as_deref().map(validate_bin_path).transpose()?;

    let Some(target) = resolve_ruby(configured_executable) else {
        return Ok(JadeOpenResult {
            launched: None,
            warning: Some("RubyRe is not installed.".to_string()),
        });
    };

    shell_open_jade(&target, bin_path.as_deref())?;
    Ok(JadeOpenResult {
        launched: Some(target.to_string_lossy().into_owned()),
        warning: None,
    })
}
