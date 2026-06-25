/* AI image upscaling via the Upscayl NCNN binary. Ported from Quartz's
   upscale.js IPC channels.

   - Downloads the upscayl-bin release zip + Real-ESRGAN model files into a
     cache under the Quartz app home, with progress events.
   - Spawns upscayl-bin.exe for single-file and batch upscaling, streaming
     stdout/stderr lines back as log events and parsing the `NN%` progress.
   - A managed UpscaleState holds the running child so it can be cancelled.

   Tauri command names can't contain ':', so the original colon-style channel
   names became underscores (e.g. upscayl:stream -> upscayl_stream). Tauri
   *event* names may keep the colons, so the emitted events match the Electron
   build 1:1 (upscayl:log, upscayl:progress, upscale:progress, etc.). */

use crate::commands::settings::get_quartz_home;
use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const BINARY_URL: &str = "https://github.com/upscayl/upscayl-ncnn/releases/download/20240601-103425/upscayl-bin-20240601-103425-windows.zip";
const BINARY_DIR_NAME: &str = "upscayl-bin-20240601-103425-windows";
const EXE_NAME: &str = "upscayl-bin.exe";

const SUPPORTED_EXTENSIONS: &[&str] =
    &["png", "jpg", "jpeg", "jfif", "bmp", "tif", "tiff"];

/* Models mirror the UPSCALE_DOWNLOADS.models list from upscale.js. Each entry
   ships a .bin + .param pair pulled from the upscayl resources repo. The first
   two are required; the rest are optional but still downloaded by download-all. */
struct ModelDef {
    name: &'static str,
    files: &'static [&'static str],
}

const MODEL_BASE_URL: &str =
    "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models/";

const MODELS: &[ModelDef] = &[
    ModelDef { name: "Upscayl Standard 4x", files: &["upscayl-standard-4x.bin", "upscayl-standard-4x.param"] },
    ModelDef { name: "Upscayl Lite 4x", files: &["upscayl-lite-4x.bin", "upscayl-lite-4x.param"] },
    ModelDef { name: "Digital Art 4x", files: &["digital-art-4x.bin", "digital-art-4x.param"] },
    ModelDef { name: "High Fidelity 4x", files: &["high-fidelity-4x.bin", "high-fidelity-4x.param"] },
    ModelDef { name: "Ultrasharp 4x", files: &["ultrasharp-4x.bin", "ultrasharp-4x.param"] },
    ModelDef { name: "Remacri 4x", files: &["remacri-4x.bin", "remacri-4x.param"] },
    ModelDef { name: "Ultramix Balanced 4x", files: &["ultramix-balanced-4x.bin", "ultramix-balanced-4x.param"] },
];

// Holds the currently running upscayl child so upscayl_cancel can kill it.
#[derive(Default)]
pub struct UpscaleState {
    child: Mutex<Option<Child>>,
}

// ─── path helpers ────────────────────────────────────────────────────────────

// %APPDATA%/Quartz/upscale-backends — cache root for the binary + models.
fn install_dir() -> Result<PathBuf, String> {
    Ok(get_quartz_home()?.join("upscale-backends"))
}

fn binary_dir() -> Result<PathBuf, String> {
    Ok(install_dir()?.join(BINARY_DIR_NAME))
}

fn exe_path() -> Result<PathBuf, String> {
    Ok(binary_dir()?.join(EXE_NAME))
}

fn models_dir() -> Result<PathBuf, String> {
    Ok(binary_dir()?.join("models"))
}

fn prefs_path() -> Result<PathBuf, String> {
    Ok(get_quartz_home()?.join("upscale-prefs.json"))
}

// ─── prefs (small standalone JSON, independent of settings.json) ─────────────

fn read_prefs() -> serde_json::Map<String, serde_json::Value> {
    let Ok(path) = prefs_path() else {
        return serde_json::Map::new();
    };
    let Ok(data) = std::fs::read_to_string(&path) else {
        return serde_json::Map::new();
    };
    serde_json::from_str(&data).unwrap_or_default()
}

fn write_prefs(map: &serde_json::Map<String, serde_json::Value>) -> Result<(), String> {
    let path = prefs_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(map).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn prefs_get(key: String) -> Result<Option<String>, String> {
    Ok(read_prefs().get(&key).and_then(|v| v.as_str().map(String::from)))
}

#[tauri::command]
pub fn prefs_set(key: String, value: String) -> Result<(), String> {
    let mut map = read_prefs();
    map.insert(key, serde_json::Value::String(value));
    write_prefs(&map)
}

// ─── status ──────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct BinaryStatus {
    pub installed: bool,
    pub path: String,
}

#[derive(Serialize)]
pub struct ModelsStatus {
    pub installed: Vec<String>,
    pub total: usize,
}

#[derive(Serialize)]
pub struct DownloadStatus {
    pub binary: BinaryStatus,
    pub models: ModelsStatus,
}

#[tauri::command]
pub fn upscale_check_status() -> Result<DownloadStatus, String> {
    let exe = exe_path()?;
    let models = models_dir()?;

    let mut installed = Vec::new();
    for model in MODELS {
        if model.files.iter().all(|f| models.join(f).exists()) {
            installed.push(model.name.to_string());
        }
    }

    Ok(DownloadStatus {
        binary: BinaryStatus {
            installed: exe.exists(),
            path: exe.to_string_lossy().into_owned(),
        },
        models: ModelsStatus { installed, total: MODELS.len() },
    })
}

// ─── download ────────────────────────────────────────────────────────────────

#[derive(Clone, Serialize)]
struct ProgressPayload {
    step: String,
    message: String,
    progress: f64,
}

fn emit_progress(app: &AppHandle, step: &str, message: &str, progress: f64) {
    let _ = app.emit(
        "upscale:progress",
        ProgressPayload {
            step: step.to_string(),
            message: message.to_string(),
            progress,
        },
    );
}

async fn download_to_file(url: &str, dest: &Path) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent("Quartz")
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {} for {}", resp.status(), url));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;

    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // Write to a tmp sibling, then atomically rename into place.
    let tmp = dest.with_extension("download.tmp");
    std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dest).map_err(|e| e.to_string())?;
    Ok(())
}

fn extract_zip(zip_path: &Path, out_dir: &Path) -> Result<(), String> {
    let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let Some(rel) = entry.enclosed_name() else { continue };
        let out_path = out_dir.join(rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn upscale_download_all(app: AppHandle) -> Result<String, String> {
    let install = install_dir()?;
    let models = models_dir()?;
    let exe = exe_path()?;

    emit_progress(&app, "init", "Initializing download...", 0.0);
    std::fs::create_dir_all(&install).map_err(|e| e.to_string())?;

    // Binary zip → extract → cleanup.
    emit_progress(&app, "binary", "Downloading Upscayl Binary...", 0.0);
    let zip_path = install.join("upscayl-bin-20240601-103425-windows.zip");
    download_to_file(BINARY_URL, &zip_path).await?;

    emit_progress(&app, "binary", "Extracting Binary...", 50.0);
    let install_owned = install.clone();
    let zip_owned = zip_path.clone();
    tokio::task::spawn_blocking(move || extract_zip(&zip_owned, &install_owned))
        .await
        .map_err(|e| e.to_string())??;
    let _ = std::fs::remove_file(&zip_path);
    emit_progress(&app, "binary", "Binary Ready!", 100.0);

    // Models.
    std::fs::create_dir_all(&models).map_err(|e| e.to_string())?;
    for (i, model) in MODELS.iter().enumerate() {
        emit_progress(
            &app,
            "models",
            &format!("Downloading {}...", model.name),
            (i as f64 / MODELS.len() as f64) * 100.0,
        );
        for file in model.files {
            let url = format!("{MODEL_BASE_URL}{file}");
            download_to_file(&url, &models.join(file)).await?;
        }
    }

    emit_progress(&app, "complete", "All components downloaded successfully!", 100.0);

    let exe_str = exe.to_string_lossy().into_owned();
    let mut prefs = read_prefs();
    prefs.insert("RealesrganExePath".into(), serde_json::Value::String(exe_str.clone()));
    write_prefs(&prefs)?;
    Ok(exe_str)
}

// ─── ensure ──────────────────────────────────────────────────────────────────

// Returns the exe path if the binary is on disk, else null. Mirrors
// realesrgan.ensure: prefer the cached install, fall back to a saved pref.
#[tauri::command]
pub fn realesrgan_ensure() -> Result<Option<String>, String> {
    let exe = exe_path()?;
    if exe.exists() {
        let s = exe.to_string_lossy().into_owned();
        let mut prefs = read_prefs();
        prefs.insert("RealesrganExePath".into(), serde_json::Value::String(s.clone()));
        write_prefs(&prefs)?;
        return Ok(Some(s));
    }
    if let Some(serde_json::Value::String(saved)) = read_prefs().get("RealesrganExePath") {
        if Path::new(saved).exists() {
            return Ok(Some(saved.clone()));
        }
    }
    Ok(None)
}

// ─── upscaling ───────────────────────────────────────────────────────────────

fn build_command(exe: &str, args: &[String], cwd: Option<&str>) -> Command {
    let mut cmd = Command::new(exe);
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    } else if let Some(parent) = Path::new(exe).parent() {
        cmd.current_dir(parent);
    }
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

// Parse a trailing "NN%" / "NN,N%" out of a stderr line, like upscayl-bin emits.
fn parse_percent(line: &str) -> Option<f64> {
    let idx = line.find('%')?;
    let mut start = idx;
    let bytes = line.as_bytes();
    while start > 0 {
        let c = bytes[start - 1] as char;
        if c.is_ascii_digit() || c == '.' || c == ',' {
            start -= 1;
        } else {
            break;
        }
    }
    if start == idx {
        return None;
    }
    let num: String = line[start..idx].replace(',', ".");
    num.parse::<f64>().ok().filter(|p| *p >= 0.0 && *p <= 100.0)
}

#[derive(Serialize)]
pub struct StreamResult {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[tauri::command]
pub async fn upscayl_stream(
    app: AppHandle,
    state: State<'_, UpscaleState>,
    exe_path: String,
    args: Vec<String>,
    cwd: Option<String>,
) -> Result<StreamResult, String> {
    let mut child = build_command(&exe_path, &args, cwd.as_deref())
        .spawn()
        .map_err(|e| format!("failed to spawn {exe_path}: {e}"))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    *state.child.lock().unwrap() = Some(child);

    let app_out = app.clone();
    let out_handle = std::thread::spawn(move || {
        let mut collected = String::new();
        if let Some(out) = stdout {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                let _ = app_out.emit("upscayl:log", format!("{line}\n"));
                collected.push_str(&line);
                collected.push('\n');
            }
        }
        collected
    });

    let app_err = app.clone();
    let err_handle = std::thread::spawn(move || {
        let mut collected = String::new();
        if let Some(err) = stderr {
            for line in BufReader::new(err).lines().map_while(Result::ok) {
                if let Some(pct) = parse_percent(&line) {
                    let _ = app_err.emit("upscayl:progress", pct);
                }
                let _ = app_err.emit("upscayl:log", format!("{line}\n"));
                collected.push_str(&line);
                collected.push('\n');
            }
        }
        collected
    });

    let stdout_text = out_handle.join().unwrap_or_default();
    let stderr_text = err_handle.join().unwrap_or_default();

    // Reclaim the child to wait on it; clears the cancel handle either way.
    let child = state.child.lock().unwrap().take();
    let code = match child {
        Some(mut c) => c.wait().map(|s| s.code().unwrap_or(-1)).unwrap_or(-1),
        None => -1, // cancelled out from under us
    };

    Ok(StreamResult { code, stdout: stdout_text, stderr: stderr_text })
}

#[tauri::command]
pub fn upscayl_cancel(state: State<'_, UpscaleState>) -> Result<(), String> {
    if let Some(mut child) = state.child.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok(())
}

// ─── batch ───────────────────────────────────────────────────────────────────

#[derive(Clone, Serialize)]
struct BatchStart {
    #[serde(rename = "totalFiles")]
    total_files: usize,
    files: Vec<String>,
}

#[derive(Clone, Serialize)]
struct BatchProgress {
    #[serde(rename = "currentFile")]
    current_file: usize,
    #[serde(rename = "totalFiles")]
    total_files: usize,
    #[serde(rename = "currentFileName")]
    current_file_name: String,
    #[serde(rename = "overallProgress")]
    overall_progress: u32,
    #[serde(rename = "fileProgress")]
    file_progress: f64,
}

#[derive(Clone, Serialize)]
pub struct BatchResults {
    pub total: usize,
    pub successful: usize,
    pub failed: usize,
    pub errors: Vec<String>,
}

fn discover_image_files(folder: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    let entries = std::fs::read_dir(folder).map_err(|e| format!("Failed to read folder: {e}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .unwrap_or_default();
        if SUPPORTED_EXTENSIONS.contains(&ext.as_str()) {
            files.push(path);
        }
    }
    files.sort();
    Ok(files)
}

#[tauri::command]
pub async fn upscayl_batch_process(
    app: AppHandle,
    state: State<'_, UpscaleState>,
    input_folder: String,
    output_folder: String,
    model: String,
    scale: u32,
    extra_args: String,
    exe_path: String,
) -> Result<BatchResults, String> {
    let out_dir = PathBuf::from(&output_folder);
    std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;

    let images = discover_image_files(Path::new(&input_folder))?;
    if images.is_empty() {
        return Err("No supported image files found in the selected folder".into());
    }

    let total = images.len();
    let _ = app.emit(
        "upscayl:batch-start",
        BatchStart {
            total_files: total,
            files: images
                .iter()
                .map(|p| p.file_name().unwrap_or_default().to_string_lossy().into_owned())
                .collect(),
        },
    );

    let mut results = BatchResults { total, successful: 0, failed: 0, errors: Vec::new() };

    for (i, input) in images.iter().enumerate() {
        let file_name = input.file_name().unwrap_or_default().to_string_lossy().into_owned();
        let stem = input.file_stem().unwrap_or_default().to_string_lossy().into_owned();
        let ext = input
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();
        let output_file = out_dir.join(format!("{stem}_x{scale}{ext}"));

        let overall = ((i as f64 / total as f64) * 100.0).round() as u32;
        let _ = app.emit(
            "upscayl:batch-progress",
            BatchProgress {
                current_file: i + 1,
                total_files: total,
                current_file_name: file_name.clone(),
                overall_progress: overall,
                file_progress: 0.0,
            },
        );

        let mut args = vec![
            "-i".into(),
            input.to_string_lossy().into_owned(),
            "-o".into(),
            output_file.to_string_lossy().into_owned(),
            "-s".into(),
            scale.to_string(),
            "-n".into(),
            model.clone(),
        ];
        if !extra_args.trim().is_empty() {
            args.extend(extra_args.split_whitespace().map(String::from));
        }

        match run_batch_file(&app, &state, &exe_path, &args, i, total, &file_name) {
            Ok(0) => results.successful += 1,
            Ok(code) => {
                results.failed += 1;
                results.errors.push(format!("Failed to process {file_name}: exit {code}"));
            }
            Err(e) => {
                results.failed += 1;
                results.errors.push(format!("Error processing {file_name}: {e}"));
            }
        }

        let overall_done = (((i + 1) as f64 / total as f64) * 100.0).round() as u32;
        let _ = app.emit(
            "upscayl:batch-progress",
            BatchProgress {
                current_file: i + 1,
                total_files: total,
                current_file_name: file_name.clone(),
                overall_progress: overall_done,
                file_progress: 100.0,
            },
        );
    }

    let _ = app.emit("upscayl:batch-complete", results.clone());
    Ok(results)
}

// Run a single file inside a batch, emitting per-file progress as batch events.
fn run_batch_file(
    app: &AppHandle,
    state: &State<'_, UpscaleState>,
    exe_path: &str,
    args: &[String],
    index: usize,
    total: usize,
    file_name: &str,
) -> Result<i32, String> {
    let mut child = build_command(exe_path, args, None)
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    *state.child.lock().unwrap() = Some(child);

    let app_out = app.clone();
    let out_handle = std::thread::spawn(move || {
        if let Some(out) = stdout {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                let _ = app_out.emit("upscayl:log", format!("{line}\n"));
            }
        }
    });

    let app_err = app.clone();
    let name = file_name.to_string();
    let overall = ((index as f64 / total as f64) * 100.0).round() as u32;
    let err_handle = std::thread::spawn(move || {
        if let Some(err) = stderr {
            for line in BufReader::new(err).lines().map_while(Result::ok) {
                if let Some(pct) = parse_percent(&line) {
                    let _ = app_err.emit(
                        "upscayl:batch-progress",
                        BatchProgress {
                            current_file: index + 1,
                            total_files: total,
                            current_file_name: name.clone(),
                            overall_progress: overall,
                            file_progress: pct,
                        },
                    );
                }
                let _ = app_err.emit("upscayl:log", format!("{line}\n"));
            }
        }
    });

    let _ = out_handle.join();
    let _ = err_handle.join();

    let child = state.child.lock().unwrap().take();
    match child {
        Some(mut c) => c.wait().map(|s| s.code().unwrap_or(-1)).map_err(|e| e.to_string()),
        None => Err("cancelled".into()),
    }
}
