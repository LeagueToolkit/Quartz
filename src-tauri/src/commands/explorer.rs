/* Custom in-app file explorer backend.

The Tauri WebView is sandboxed (no renderer fs/os/path/shell), so the custom
file selector stands on these commands:

- explorer_list_dir:    read a directory into FsEntry rows (resolves .lnk).
- explorer_quick_links: Desktop/Documents/Downloads/Home + drive roots.
- explorer_resolve_path: expand %VARS%, normalize, report exists/kind.
- explorer_reveal:       reveal a path in the OS file manager.
- explorer_thumbnail:    decode an image / game texture to a PNG data URL.

Ported (rewritten) from old Quartz's CustomExplorer, whose Electron fs/os/shell
calls all move here. */

use base64::Engine;
use serde::Serialize;
use std::path::Path;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub is_shortcut: bool,
    pub size: u64,
    pub modified: i64,
    pub extension: String,
}

/// Sort: directories first, then case-insensitive name.
fn sort_entries(entries: &mut [FsEntry]) {
    entries.sort_by(|a, b| {
        b.is_directory
            .cmp(&a.is_directory)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
}

/// True if `ext` (lowercased, no dot) passes the optional filter.
fn ext_allowed(ext: &str, filter: &Option<Vec<String>>) -> bool {
    match filter {
        None => true,
        Some(list) => list.iter().any(|e| e.eq_ignore_ascii_case(ext)),
    }
}

/// Read a directory into FsEntry rows. Resolves Windows .lnk shortcuts to
/// their target (folder shortcuts become directories). Applies an optional
/// lowercased-extension filter (directories always pass). Sorted dirs-first.
#[tauri::command]
pub fn explorer_list_dir(
    path: String,
    ext_filter: Option<Vec<String>>,
) -> Result<Vec<FsEntry>, String> {
    let read = std::fs::read_dir(Path::new(&path)).map_err(|e| format!("read_dir {path}: {e}"))?;
    let mut out: Vec<FsEntry> = Vec::new();

    for dirent in read.flatten() {
        let full = dirent.path();
        let Ok(meta) = std::fs::metadata(&full) else { continue };
        let raw_name = dirent.file_name().to_string_lossy().to_string();
        let mut is_dir = meta.is_dir();
        let mut is_shortcut = false;
        let mut target = full.clone();
        let mut name = raw_name.clone();

        // Resolve .lnk (best effort; only real, existing targets are adopted).
        if raw_name.to_lowercase().ends_with(".lnk") {
            if let Some(resolved) = resolve_shortcut(&full) {
                if let Ok(tmeta) = std::fs::metadata(&resolved) {
                    is_shortcut = true;
                    is_dir = tmeta.is_dir();
                    target = resolved;
                    name = raw_name[..raw_name.len() - 4].to_string();
                }
            }
        }

        let extension = if is_dir {
            String::new()
        } else {
            target
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default()
        };
        if !is_dir && !ext_allowed(&extension, &ext_filter) {
            continue;
        }
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);

        out.push(FsEntry {
            name,
            path: target.to_string_lossy().to_string(),
            is_directory: is_dir,
            is_shortcut,
            size: if is_dir { 0 } else { meta.len() },
            modified,
            extension,
        });
    }

    sort_entries(&mut out);
    Ok(out)
}

/// Resolve a Windows .lnk to its target path via WScript.Shell (no extra crate).
/// Non-Windows / failure -> None.
#[cfg(windows)]
fn resolve_shortcut(lnk: &Path) -> Option<std::path::PathBuf> {
    let script = format!(
        "(New-Object -ComObject WScript.Shell).CreateShortcut('{}').TargetPath",
        lnk.to_string_lossy().replace('\'', "''")
    );
    let out = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .ok()?;
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(std::path::PathBuf::from(s))
    }
}

#[cfg(not(windows))]
fn resolve_shortcut(_lnk: &Path) -> Option<std::path::PathBuf> {
    None
}

/// Expand %VAR% environment references. Unknown vars are left verbatim.
fn expand_env(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(start) = rest.find('%') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        if let Some(end) = after.find('%') {
            let var = &after[..end];
            match std::env::var(var).or_else(|_| std::env::var(var.to_uppercase())) {
                Ok(val) => out.push_str(&val),
                Err(_) => {
                    out.push('%');
                    out.push_str(var);
                    out.push('%');
                }
            }
            rest = &after[end + 1..];
        } else {
            // Lone '%' with no closing pair: keep the remainder verbatim.
            out.push('%');
            rest = after;
        }
    }
    out.push_str(rest);
    out
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickLink {
    pub name: String,
    pub path: String,
    pub kind: String,
}

#[tauri::command]
pub fn explorer_quick_links() -> Result<Vec<QuickLink>, String> {
    let mut links = Vec::new();
    if let Some(home) = home_dir() {
        for (label, sub) in [
            ("Desktop", "Desktop"),
            ("Documents", "Documents"),
            ("Downloads", "Downloads"),
        ] {
            let p = home.join(sub);
            if p.exists() {
                links.push(QuickLink {
                    name: label.into(),
                    path: p.to_string_lossy().to_string(),
                    kind: "folder".into(),
                });
            }
        }
        links.push(QuickLink {
            name: "Home".into(),
            path: home.to_string_lossy().to_string(),
            kind: "folder".into(),
        });
    }
    for drive in drive_roots() {
        links.push(QuickLink {
            name: drive.clone(),
            path: drive,
            kind: "drive".into(),
        });
    }
    Ok(links)
}

fn home_dir() -> Option<std::path::PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(std::path::PathBuf::from)
}

#[cfg(windows)]
fn drive_roots() -> Vec<String> {
    ('A'..='Z')
        .map(|c| format!("{c}:\\"))
        .filter(|d| Path::new(d).exists())
        .collect()
}
#[cfg(not(windows))]
fn drive_roots() -> Vec<String> {
    vec!["/".into()]
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedPath {
    pub resolved: String,
    pub exists: bool,
    pub is_dir: bool,
    pub is_file: bool,
}

#[tauri::command]
pub fn explorer_resolve_path(path: String) -> ResolvedPath {
    let resolved = expand_env(&path);
    let meta = std::fs::metadata(Path::new(&resolved)).ok();
    ResolvedPath {
        exists: meta.is_some(),
        is_dir: meta.as_ref().map(|m| m.is_dir()).unwrap_or(false),
        is_file: meta.as_ref().map(|m| m.is_file()).unwrap_or(false),
        resolved,
    }
}

#[tauri::command]
pub fn explorer_reveal(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .reveal_item_in_dir(&path)
        .map_err(|e| format!("reveal {path}: {e}"))
}

/// Decode an image / game texture to a small PNG data URL for thumbnails.
/// Plain images go straight through `image`; .tex/.dds decode via quartz-lib
/// first. Runs on a blocking thread so large textures never stall the UI.
#[tauri::command]
pub async fn explorer_thumbnail(path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let ext = Path::new(&path)
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();

        let dynimg = match ext.as_str() {
            "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp" | "ico" => {
                image::open(&path).map_err(|e| format!("open {path}: {e}"))?
            }
            "tex" | "dds" => {
                let bytes =
                    std::fs::read(&path).map_err(|e| format!("read {path}: {e}"))?;
                let decoded = quartz_lib::tex::decode_texture(&bytes)?;
                let buf = image::RgbaImage::from_raw(decoded.width, decoded.height, decoded.rgba)
                    .ok_or("texture rgba dimensions mismatch")?;
                image::DynamicImage::ImageRgba8(buf)
            }
            _ => return Err(format!("no thumbnail for .{ext}")),
        };

        let thumb = dynimg.thumbnail(96, 96);
        let mut buf = std::io::Cursor::new(Vec::new());
        thumb
            .write_to(&mut buf, image::ImageFormat::Png)
            .map_err(|e| format!("png encode: {e}"))?;
        let b64 = base64::engine::general_purpose::STANDARD.encode(buf.into_inner());
        Ok(format!("data:image/png;base64,{b64}"))
    })
    .await
    .map_err(|e| format!("thumbnail task join: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn e(name: &str, dir: bool) -> FsEntry {
        FsEntry {
            name: name.into(),
            path: name.into(),
            is_directory: dir,
            is_shortcut: false,
            size: 0,
            modified: 0,
            extension: String::new(),
        }
    }

    #[test]
    fn dirs_sort_before_files_then_alpha() {
        let mut v = vec![
            e("zeta", false),
            e("Beta", true),
            e("alpha", false),
            e("Alpha", true),
        ];
        sort_entries(&mut v);
        let names: Vec<_> = v.iter().map(|x| x.name.as_str()).collect();
        assert_eq!(names, vec!["Alpha", "Beta", "alpha", "zeta"]);
    }

    #[test]
    fn ext_filter_is_case_insensitive_and_optional() {
        assert!(ext_allowed("bin", &None));
        assert!(ext_allowed("BIN", &Some(vec!["bin".into()])));
        assert!(!ext_allowed("png", &Some(vec!["bin".into()])));
    }

    #[test]
    fn expand_env_replaces_known_vars() {
        std::env::set_var("QZ_TEST_HOME", "C:\\Users\\Frog");
        assert_eq!(expand_env("%QZ_TEST_HOME%\\Desktop"), "C:\\Users\\Frog\\Desktop");
    }

    #[test]
    fn expand_env_leaves_unknown_vars() {
        assert_eq!(expand_env("%NOPE_NOT_SET_XYZ%\\x"), "%NOPE_NOT_SET_XYZ%\\x");
    }

    #[test]
    fn expand_env_passthrough_without_vars() {
        assert_eq!(expand_env("C:\\plain\\path"), "C:\\plain\\path");
    }
}
