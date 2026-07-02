/* File operations: the Universal File Randomizer/Renamer and the custom-tool
EXE runner. Ported from Quartz's fileRandomizer.js + tools.js IPC channels.

- file_randomize: replace files in a target folder with random picks from a
  supplied set, matched by extension (optional smart same-base-name reuse).
- file_rename: batch rename via find/replace and/or prefix/suffix.
- tools_execute: run an external EXE, optionally with a console window. */

use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Tiny xorshift PRNG seeded from the system clock — avoids pulling in the
/// `rand` crate just to pick a random replacement file.
struct Rng(u64);

impl Rng {
    fn new() -> Self {
        let seed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0x9e3779b97f4a7c15)
            | 1;
        Rng(seed)
    }

    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }

    /// Uniform pick from a non-empty slice.
    fn pick<'a, T>(&mut self, items: &'a [T]) -> &'a T {
        &items[(self.next() % items.len() as u64) as usize]
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RandomizeResult {
    pub replaced_count: usize,
    pub errors: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameResult {
    pub renamed_count: usize,
    pub errors: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecResult {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

fn ext_of(path: &Path) -> String {
    path.extension()
        .map(|e| format!(".{}", e.to_string_lossy().to_lowercase()))
        .unwrap_or_default()
}

/// Recursively collect files under `dir`. When `recursive` is false only the
/// top level is scanned. Skips obvious system folders for safety.
fn collect_files(dir: &Path, recursive: bool, out: &mut Vec<PathBuf>) {
    const SKIP: &[&str] = &[
        "node_modules",
        ".git",
        "backup_",
        "$recycle.bin",
        "system volume information",
    ];
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let ft = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if ft.is_dir() {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            if SKIP.iter().any(|s| name.contains(s)) {
                continue;
            }
            if recursive {
                collect_files(&path, recursive, out);
            }
        } else if ft.is_file() {
            out.push(path);
        }
    }
}

/// Replace files in `target_dir` with random picks from `images`, matched by
/// extension. `smart_name_matching` reuses the same replacement for files that
/// share a base name (e.g. emote_a / emote_a_mask).
#[tauri::command]
pub async fn file_randomize(
    images: Vec<String>,
    target_dir: String,
    smart_name_matching: Option<bool>,
    scan_subdirectories: Option<bool>,
) -> Result<RandomizeResult, String> {
    let smart = smart_name_matching.unwrap_or(true);
    let recursive = scan_subdirectories.unwrap_or(true);

    tokio::task::spawn_blocking(move || {
        let target = PathBuf::from(&target_dir);
        if !target.is_dir() {
            return Err(format!("target folder not found: {}", target_dir));
        }

        // Group replacement files by extension.
        let mut by_ext: HashMap<String, Vec<PathBuf>> = HashMap::new();
        for img in &images {
            let p = PathBuf::from(img);
            by_ext.entry(ext_of(&p)).or_default().push(p);
        }

        let mut targets = Vec::new();
        collect_files(&target, recursive, &mut targets);

        let mut rng = Rng::new();
        let mut base_pick: HashMap<String, PathBuf> = HashMap::new();
        let mut replaced = 0usize;
        let mut errors = Vec::new();

        for file in &targets {
            let ext = ext_of(file);
            let pool = match by_ext.get(&ext) {
                Some(p) if !p.is_empty() => p,
                _ => continue,
            };

            let pick = if smart {
                let stem = file
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default();
                // Strip a trailing _suffix to group related files.
                let base = match stem.rfind('_') {
                    Some(i) => stem[..i].to_string(),
                    None => stem,
                };
                if !base_pick.contains_key(&base) {
                    let chosen = rng.pick(pool).clone();
                    base_pick.insert(base.clone(), chosen);
                }
                base_pick.get(&base).cloned().unwrap()
            } else {
                rng.pick(pool).clone()
            };

            match std::fs::copy(&pick, file) {
                Ok(_) => replaced += 1,
                Err(e) => errors.push(format!("{}: {}", file.display(), e)),
            }
        }

        Ok(RandomizeResult {
            replaced_count: replaced,
            errors,
        })
    })
    .await
    .map_err(|e| format!("randomize task panicked: {}", e))?
}

/// Batch-rename files in `dir`. Applies find/replace first (literal text), then
/// prepends `prefix` and inserts `suffix` before the extension.
#[tauri::command]
pub async fn file_rename(
    dir: String,
    prefix: Option<String>,
    suffix: Option<String>,
    text_to_find: Option<String>,
    text_to_replace_with: Option<String>,
    scan_subdirectories: Option<bool>,
) -> Result<RenameResult, String> {
    let recursive = scan_subdirectories.unwrap_or(true);
    let prefix = prefix.unwrap_or_default();
    let suffix = suffix.unwrap_or_default();
    let find = text_to_find.unwrap_or_default();
    let replace = text_to_replace_with.unwrap_or_default();

    tokio::task::spawn_blocking(move || {
        let root = PathBuf::from(&dir);
        if !root.is_dir() {
            return Err(format!("directory not found: {}", dir));
        }

        let mut files = Vec::new();
        collect_files(&root, recursive, &mut files);

        let mut renamed = 0usize;
        let mut errors = Vec::new();

        for file in &files {
            let old_name = match file.file_name() {
                Some(n) => n.to_string_lossy().to_string(),
                None => continue,
            };
            let mut new_name = old_name.clone();

            if !find.is_empty() {
                new_name = new_name.replace(&find, &replace);
            }
            if !prefix.is_empty() {
                new_name = format!("{}{}", prefix, new_name);
            }
            if !suffix.is_empty() {
                new_name = match new_name.rfind('.') {
                    Some(i) => format!("{}{}{}", &new_name[..i], suffix, &new_name[i..]),
                    None => format!("{}{}", new_name, suffix),
                };
            }

            if new_name == old_name {
                continue;
            }
            let new_path = file.with_file_name(&new_name);
            if new_path.exists() {
                continue;
            }
            match std::fs::rename(file, &new_path) {
                Ok(_) => renamed += 1,
                Err(e) => errors.push(format!("{}: {}", file.display(), e)),
            }
        }

        Ok(RenameResult {
            renamed_count: renamed,
            errors,
        })
    })
    .await
    .map_err(|e| format!("rename task panicked: {}", e))?
}

/// Run an external EXE. With `open_console` (Windows), launches it detached in
/// its own console window; otherwise runs it and captures stdout/stderr.
#[tauri::command]
pub async fn tools_execute(
    exe: String,
    args: Vec<String>,
    cwd: Option<String>,
    open_console: Option<bool>,
) -> Result<ExecResult, String> {
    let open_console = open_console.unwrap_or(false);

    tokio::task::spawn_blocking(move || {
        let work_dir = cwd
            .map(PathBuf::from)
            .or_else(|| Path::new(&exe).parent().map(|p| p.to_path_buf()));

        if cfg!(target_os = "windows") && open_console {
            // cmd /c start "" "exe" args… — detached window, no captured output.
            let mut cmd = Command::new("cmd.exe");
            cmd.arg("/c").arg("start").arg("");
            cmd.arg(&exe);
            for a in &args {
                cmd.arg(a);
            }
            if let Some(d) = &work_dir {
                cmd.current_dir(d);
            }
            cmd.spawn()
                .map_err(|e| format!("failed to launch {}: {}", exe, e))?;
            return Ok(ExecResult {
                code: 0,
                stdout: String::new(),
                stderr: String::new(),
            });
        }

        let mut cmd = Command::new(&exe);
        cmd.args(&args);
        if let Some(d) = &work_dir {
            cmd.current_dir(d);
        }
        let output = cmd
            .output()
            .map_err(|e| format!("failed to run {}: {}", exe, e))?;

        Ok(ExecResult {
            code: output.status.code().unwrap_or(-1),
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        })
    })
    .await
    .map_err(|e| format!("execute task panicked: {}", e))?
}
