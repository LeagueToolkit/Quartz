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
        // dirent.metadata() reuses the directory-scan handle where the OS
        // supports it, avoiding a second stat syscall per entry.
        let Ok(meta) = dirent.metadata() else {
            continue;
        };
        let raw_name = dirent.file_name().to_string_lossy().to_string();
        let mut is_dir = meta.is_dir();
        let mut is_shortcut = false;
        let mut target = full.clone();
        let mut name = raw_name.clone();

        // Resolve .lnk by parsing the shell-link binary directly (no process
        // spawn). Only adopt the target if it still exists on disk.
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

/// Resolve a Windows .lnk to its target path by parsing the shell-link binary
/// (MS-SHLLINK) directly. Reading a few hundred bytes is microseconds, versus
/// ~150-300ms to spawn PowerShell per shortcut. Non-Windows / unparseable -> None.
#[cfg(windows)]
fn resolve_shortcut(lnk: &Path) -> Option<std::path::PathBuf> {
    let data = std::fs::read(lnk).ok()?;
    parse_lnk_target(&data).map(std::path::PathBuf::from)
}

/// Extract the target path from a .lnk byte buffer. Follows the MS-SHLLINK
/// layout: fixed 76-byte ShellLinkHeader, optional LinkTargetIDList, then the
/// LinkInfo structure which carries the local base path we want.
#[cfg(windows)]
fn parse_lnk_target(data: &[u8]) -> Option<String> {
    // Header is 0x4C bytes; LinkFlags is a u32 at offset 20 (LE).
    if data.len() < 0x4C {
        return None;
    }
    let flags = u32::from_le_bytes([data[20], data[21], data[22], data[23]]);
    let has_id_list = flags & 0x1 != 0; // HasLinkTargetIDList
    let has_link_info = flags & 0x2 != 0; // HasLinkInfo
    if !has_link_info {
        return None;
    }

    let mut off = 0x4C;
    // Skip the LinkTargetIDList (a u16 size prefix + that many bytes).
    if has_id_list {
        if data.len() < off + 2 {
            return None;
        }
        let id_size = u16::from_le_bytes([data[off], data[off + 1]]) as usize;
        off += 2 + id_size;
    }

    // LinkInfo starts here. Read its header fields (all LE u32).
    if data.len() < off + 32 {
        return None;
    }
    let li = off;
    let read_u32 = |p: usize| -> Option<u32> {
        data.get(p..p + 4)
            .map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    };
    let li_size = read_u32(li)? as usize;
    if data.len() < li + li_size {
        return None;
    }
    let flags2 = read_u32(li + 8)?;
    // Bit 0 = VolumeIDAndLocalBasePath present.
    if flags2 & 0x1 == 0 {
        return None;
    }

    // Prefer the Unicode base path when the header is large enough to carry the
    // extra optional offsets (LinkInfoHeaderSize >= 0x24).
    let header_size = read_u32(li + 4)?;
    if header_size >= 0x24 {
        if let Some(u_off) = read_u32(li + 28) {
            let start = li + u_off as usize;
            if let Some(s) = read_utf16z(&data[..li + li_size], start) {
                if !s.is_empty() {
                    return Some(s);
                }
            }
        }
    }
    // Fall back to the ANSI LocalBasePath.
    let base_off = read_u32(li + 16)? as usize;
    read_ansiz(&data[..li + li_size], li + base_off)
}

/// Read a NUL-terminated ANSI string starting at `start`.
#[cfg(windows)]
fn read_ansiz(data: &[u8], start: usize) -> Option<String> {
    let slice = data.get(start..)?;
    let end = slice.iter().position(|&b| b == 0).unwrap_or(slice.len());
    Some(String::from_utf8_lossy(&slice[..end]).into_owned())
}

/// Read a NUL-terminated UTF-16LE string starting at `start`.
#[cfg(windows)]
fn read_utf16z(data: &[u8], start: usize) -> Option<String> {
    let slice = data.get(start..)?;
    let mut units = Vec::new();
    let mut i = 0;
    while i + 1 < slice.len() {
        let u = u16::from_le_bytes([slice[i], slice[i + 1]]);
        if u == 0 {
            break;
        }
        units.push(u);
        i += 2;
    }
    Some(String::from_utf16_lossy(&units))
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

/// Keep only the paths that still exist on disk (preserving order). Used to
/// prune stale recents when the explorer opens.
#[tauri::command]
pub fn explorer_filter_existing(paths: Vec<String>) -> Vec<String> {
    paths
        .into_iter()
        .filter(|p| Path::new(p).exists())
        .collect()
}

/// Rename a file/folder in place. `new_name` is a bare name (no separators),
/// so a rename can never move the item to another directory. Refuses to
/// overwrite an existing sibling.
#[tauri::command]
pub fn explorer_rename(path: String, new_name: String) -> Result<String, String> {
    let src = Path::new(&path);
    let trimmed = new_name.trim();
    if trimmed.is_empty() || trimmed.contains(['/', '\\']) || trimmed == "." || trimmed == ".." {
        return Err("Invalid name".into());
    }
    let parent = src.parent().ok_or("No parent directory")?;
    let dst = parent.join(trimmed);
    if dst.exists() {
        return Err(format!("'{trimmed}' already exists"));
    }
    std::fs::rename(src, &dst).map_err(|e| format!("rename failed: {e}"))?;
    Ok(dst.to_string_lossy().to_string())
}

/// Delete a file or (recursively) a folder.
#[tauri::command]
pub fn explorer_delete(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    let meta = std::fs::metadata(p).map_err(|e| format!("stat failed: {e}"))?;
    if meta.is_dir() {
        std::fs::remove_dir_all(p).map_err(|e| format!("delete folder failed: {e}"))
    } else {
        std::fs::remove_file(p).map_err(|e| format!("delete file failed: {e}"))
    }
}

/// Copy a file or folder into `dest_dir`. If a name collision occurs, appends
/// " (copy)", " (copy 2)", ... before the extension. Returns the new path.
#[tauri::command]
pub fn explorer_copy(path: String, dest_dir: String) -> Result<String, String> {
    let src = Path::new(&path);
    let dest = Path::new(&dest_dir);
    if !dest.is_dir() {
        return Err("Destination is not a folder".into());
    }
    let stem = src
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let ext = src
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    let is_dir = src.is_dir();

    // Pick a non-colliding target name.
    let mut target = dest.join(src.file_name().ok_or("Bad source name")?);
    let mut n = 1;
    while target.exists() {
        let suffix = if n == 1 {
            " (copy)".to_string()
        } else {
            format!(" (copy {n})")
        };
        let name = if is_dir {
            format!("{stem}{suffix}")
        } else {
            format!("{stem}{suffix}{ext}")
        };
        target = dest.join(name);
        n += 1;
    }

    if is_dir {
        copy_dir_recursive(src, &target).map_err(|e| format!("copy folder failed: {e}"))?;
    } else {
        std::fs::copy(src, &target).map_err(|e| format!("copy file failed: {e}"))?;
    }
    Ok(target.to_string_lossy().to_string())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            std::fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

/// Create a new empty folder named `name` inside `parent`. Returns its path.
#[tauri::command]
pub fn explorer_new_folder(parent: String, name: String) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.contains(['/', '\\']) || trimmed == "." || trimmed == ".." {
        return Err("Invalid name".into());
    }
    let dir = Path::new(&parent).join(trimmed);
    if dir.exists() {
        return Err(format!("'{trimmed}' already exists"));
    }
    std::fs::create_dir(&dir).map_err(|e| format!("create folder failed: {e}"))?;
    Ok(dir.to_string_lossy().to_string())
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
                let bytes = std::fs::read(&path).map_err(|e| format!("read {path}: {e}"))?;
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
        assert_eq!(
            expand_env("%QZ_TEST_HOME%\\Desktop"),
            "C:\\Users\\Frog\\Desktop"
        );
    }

    #[test]
    fn expand_env_leaves_unknown_vars() {
        assert_eq!(expand_env("%NOPE_NOT_SET_XYZ%\\x"), "%NOPE_NOT_SET_XYZ%\\x");
    }

    #[test]
    fn expand_env_passthrough_without_vars() {
        assert_eq!(expand_env("C:\\plain\\path"), "C:\\plain\\path");
    }

    // Build a minimal .lnk with LinkInfo carrying an ANSI LocalBasePath and no
    // LinkTargetIDList, then confirm the parser extracts the target.
    #[cfg(windows)]
    #[test]
    fn parse_lnk_extracts_ansi_base_path() {
        let target = b"C:\\Users\\Frog\\Desktop\\game.exe\0";

        // LinkInfo: header(28 bytes: size, headerSize=0x1C, flags=1, volIdOff,
        // localBasePathOff, netRelOff, commonPathSuffixOff) + basePath bytes.
        let li_header_size: u32 = 0x1C;
        let base_off = li_header_size; // path immediately after the 28-byte header
        let li_size = li_header_size + target.len() as u32;
        let mut li = Vec::new();
        li.extend_from_slice(&li_size.to_le_bytes()); // LinkInfoSize
        li.extend_from_slice(&li_header_size.to_le_bytes()); // LinkInfoHeaderSize (0x1C -> ANSI only)
        li.extend_from_slice(&1u32.to_le_bytes()); // Flags: VolumeIDAndLocalBasePath
        li.extend_from_slice(&0u32.to_le_bytes()); // VolumeIDOffset
        li.extend_from_slice(&base_off.to_le_bytes()); // LocalBasePathOffset
        li.extend_from_slice(&0u32.to_le_bytes()); // CommonNetworkRelativeLinkOffset
        li.extend_from_slice(&0u32.to_le_bytes()); // CommonPathSuffixOffset
        li.extend_from_slice(target); // LocalBasePath (ANSI, NUL-terminated)

        // 0x4C-byte header: only LinkFlags (offset 20) matters here -> HasLinkInfo.
        let mut lnk = vec![0u8; 0x4C];
        lnk[20..24].copy_from_slice(&0x2u32.to_le_bytes()); // HasLinkInfo, no IDList
        lnk.extend_from_slice(&li);

        let got = parse_lnk_target(&lnk).expect("should parse target");
        assert_eq!(got, "C:\\Users\\Frog\\Desktop\\game.exe");
    }

    #[cfg(windows)]
    #[test]
    fn parse_lnk_rejects_truncated_buffer() {
        assert!(parse_lnk_target(&[0u8; 10]).is_none());
    }
}
