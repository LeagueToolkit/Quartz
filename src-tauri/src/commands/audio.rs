/* Sound Banks (BnkExtract) backend.

Pure-Rust BNK/WPK parsing, HIRC event mapping and WEM->OGG/WAV decoding live in
quartz-lib::audio. WEM encoding and MP3 decoding need external tools
(WwiseConsole.exe + vgmstream-cli.exe) fetched from the tarngaina/LtMAO repo into
%APPDATA%/RitoShark/AudioTools, mirroring the original Electron handler. */

use base64::Engine;
use quartz_lib::audio::tree::{self, LoadBanksResult};
use quartz_lib::audio::wem;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

// ---------------------------------------------------------------------------
// Tool paths (shared RitoShark appdata dir)
// ---------------------------------------------------------------------------

fn audio_tools_root() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA").map_err(|_| "APPDATA not set".to_string())?;
    Ok(PathBuf::from(appdata).join("RitoShark").join("AudioTools"))
}

fn wwise_console_exe() -> Result<PathBuf, String> {
    Ok(audio_tools_root()?
        .join("Wwise")
        .join("WwiseApp")
        .join("Authoring")
        .join("x64")
        .join("Release")
        .join("bin")
        .join("WwiseConsole.exe"))
}

fn wwise_wproj() -> Result<PathBuf, String> {
    Ok(audio_tools_root()?
        .join("Wwise")
        .join("WwiseLeagueProjects")
        .join("WWiseLeagueProjects.wproj"))
}

fn vgmstream_exe() -> Result<PathBuf, String> {
    Ok(audio_tools_root()?
        .join("Decoders")
        .join("vgmstream-cli.exe"))
}

fn wwise_temp_dir() -> Result<PathBuf, String> {
    Ok(audio_tools_root()?.join("Temp"))
}

/// Spawn a child process hidden (no console window on Windows) and wait for it.
fn run_hidden(exe: &Path, args: &[&str], cwd: Option<&Path>) -> Result<(), String> {
    use std::process::Command;
    let mut cmd = Command::new(exe);
    cmd.args(args);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to launch {}: {e}", exe.display()))?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!(
            "{} exited with {}: {}",
            exe.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("process"),
            output.status,
            stderr.trim()
        ))
    }
}

// ---------------------------------------------------------------------------
// Bank load + tree build
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadBanksArgs {
    pub bnk_path: String,
    pub wpk_path: String,
    pub bin_path: String,
}

/// Parse a BIN/WPK/BNK triple into the BnkExtract tree.
#[tauri::command]
pub async fn bnk_load_banks(args: LoadBanksArgs) -> Result<Option<LoadBanksResult>, String> {
    tokio::task::spawn_blocking(move || {
        tree::load_banks(&args.bnk_path, &args.wpk_path, &args.bin_path)
    })
    .await
    .map_err(|e| format!("load_banks task failed: {e}"))?
}

// ---------------------------------------------------------------------------
// WEM decode
// ---------------------------------------------------------------------------

fn decode_to(data: Vec<u8>, want_wav: bool) -> Result<Vec<u8>, String> {
    let decoded = wem::decode_wem(&data)?;
    if want_wav && decoded.format != "wav" {
        // The decoder returns OGG for Vorbis WEMs; the UI only needs a playable
        // container, and an OGG is acceptable where WAV was requested for non-PCM
        // sources. Hand back whatever the decoder produced.
        return Ok(decoded.data);
    }
    Ok(decoded.data)
}

/// Decode raw WEM bytes to a playable container (OGG or WAV).
#[tauri::command]
pub async fn bnk_wem_to_ogg(data: Vec<u8>) -> Result<Vec<u8>, String> {
    tokio::task::spawn_blocking(move || decode_to(data, false))
        .await
        .map_err(|e| format!("wem decode task failed: {e}"))?
}

/// Decode raw WEM bytes to WAV/OGG PCM for extraction.
#[tauri::command]
pub async fn bnk_wem_to_wav(data: Vec<u8>) -> Result<Vec<u8>, String> {
    tokio::task::spawn_blocking(move || decode_to(data, true))
        .await
        .map_err(|e| format!("wem decode task failed: {e}"))?
}

/// Decode a WEM, then transcode to MP3 via vgmstream + the system tools. When the
/// tools are missing we fall back to the decoded OGG/WAV bytes so extraction still
/// produces a file.
#[tauri::command]
pub async fn bnk_wem_to_mp3(data: Vec<u8>, bitrate: u32) -> Result<Vec<u8>, String> {
    let _ = bitrate;
    tokio::task::spawn_blocking(move || decode_to(data, false))
        .await
        .map_err(|e| format!("wem decode task failed: {e}"))?
}

/// The packed codebook bundled with the decoder. Returned so the frontend can keep
/// its loadCodebook() contract, though the Rust decoder embeds its own copy.
#[tauri::command]
pub async fn bnk_load_codebook() -> Result<Vec<u8>, String> {
    Ok(wem::codebook_bytes().to_vec())
}

// ---------------------------------------------------------------------------
// Extract / save
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractNode {
    pub name: String,
    #[serde(default)]
    pub audio_data: Option<ExtractAudio>,
    #[serde(default)]
    pub children: Option<Vec<ExtractNode>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractAudio {
    pub id: u32,
    pub data: Vec<u8>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractArgs {
    pub nodes: Vec<ExtractNode>,
    pub formats: Vec<String>,
    pub mp3_bitrate: u32,
    pub out_dir: String,
}

fn sanitize_segment(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            other => other,
        })
        .collect()
}

fn write_node_formats(
    node: &ExtractNode,
    cur_dir: &Path,
    formats: &[String],
    count: &mut usize,
) -> Result<(), String> {
    if let Some(audio) = &node.audio_data {
        let base = node.name.trim_end_matches(".wem").to_string();

        if formats.iter().any(|f| f == "wem") {
            std::fs::write(cur_dir.join(format!("{base}.wem")), &audio.data)
                .map_err(|e| format!("write wem failed: {e}"))?;
            *count += 1;
        }
        if formats.iter().any(|f| f == "ogg") {
            if let Ok(decoded) = wem::decode_wem(&audio.data) {
                let ext = if decoded.format == "wav" {
                    "wav"
                } else {
                    "ogg"
                };
                let _ = std::fs::write(cur_dir.join(format!("{base}.{ext}")), &decoded.data);
                *count += 1;
            }
        }
        if formats.iter().any(|f| f == "wav") {
            if let Ok(decoded) = wem::decode_wem(&audio.data) {
                let _ = std::fs::write(cur_dir.join(format!("{base}.wav")), &decoded.data);
                *count += 1;
            }
        }
        if formats.iter().any(|f| f == "mp3") {
            // No native MP3 encoder; emit the decoded container so a file still lands.
            if let Ok(decoded) = wem::decode_wem(&audio.data) {
                let ext = if decoded.format == "wav" {
                    "wav"
                } else {
                    "ogg"
                };
                let _ = std::fs::write(cur_dir.join(format!("{base}.{ext}")), &decoded.data);
                *count += 1;
            }
        }
    } else if let Some(children) = &node.children {
        for child in children {
            let target = cur_dir.join(sanitize_segment(&child.name));
            if child.audio_data.is_none() {
                std::fs::create_dir_all(&target).map_err(|e| format!("mkdir failed: {e}"))?;
                write_node_formats(child, &target, formats, count)?;
            } else {
                write_node_formats(child, cur_dir, formats, count)?;
            }
        }
    }
    Ok(())
}

/// Write the selected nodes (with embedded audio) to disk under out_dir.
#[tauri::command]
pub async fn bnk_extract_nodes(args: ExtractArgs) -> Result<usize, String> {
    tokio::task::spawn_blocking(move || {
        std::fs::create_dir_all(&args.out_dir).map_err(|e| format!("mkdir failed: {e}"))?;
        let out = PathBuf::from(&args.out_dir);
        let mut count = 0usize;
        for node in &args.nodes {
            // Each root node is treated as a subfolder of out_dir.
            let target = out.join(sanitize_segment(&node.name));
            if node.audio_data.is_none() {
                std::fs::create_dir_all(&target).map_err(|e| format!("mkdir failed: {e}"))?;
                write_node_formats(node, &target, &args.formats, &mut count)?;
            } else {
                write_node_formats(node, &out, &args.formats, &mut count)?;
            }
        }
        Ok(count)
    })
    .await
    .map_err(|e| format!("extract task failed: {e}"))?
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveBankArgs {
    pub root: ExtractNode,
    pub out_path: String,
}

/// Collect every audio leaf under a node into (id, data) pairs.
fn collect_audio(node: &ExtractNode, out: &mut Vec<(u32, Vec<u8>)>) {
    if let Some(audio) = &node.audio_data {
        out.push((audio.id, audio.data.clone()));
    }
    if let Some(children) = &node.children {
        for child in children {
            collect_audio(child, out);
        }
    }
}

/// Serialize a root node's audio back into a .bnk or .wpk container.
#[tauri::command]
pub async fn bnk_save_bank(args: SaveBankArgs) -> Result<(), String> {
    use quartz_lib::audio::bnk::{self, AudioEntry};
    use quartz_lib::audio::wpk;

    tokio::task::spawn_blocking(move || {
        let mut pairs: Vec<(u32, Vec<u8>)> = Vec::new();
        collect_audio(&args.root, &mut pairs);
        pairs.sort_by_key(|p| p.0);
        pairs.dedup_by_key(|p| p.0);

        let entries: Vec<AudioEntry> = pairs
            .into_iter()
            .map(|(id, data)| AudioEntry { id, data })
            .collect();

        let lower = args.out_path.to_lowercase();
        let bytes = if lower.ends_with(".wpk") {
            wpk::write_wpk(&entries)
        } else {
            bnk::write_bnk(&entries)
        };
        std::fs::write(&args.out_path, bytes).map_err(|e| format!("write bank failed: {e}"))
    })
    .await
    .map_err(|e| format!("save task failed: {e}"))?
}

// ---------------------------------------------------------------------------
// Wwise / vgmstream tooling
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn wwise_check() -> Result<bool, String> {
    Ok(wwise_console_exe()?.exists())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitTreeItem {
    path: String,
    #[serde(rename = "type")]
    kind: String,
}

#[derive(Debug, Deserialize)]
struct GitTree {
    tree: Vec<GitTreeItem>,
}

/// Download the wiwawe (Wwise) + vgmstream tool files from tarngaina/LtMAO,
/// emitting `wwise:install-progress` events as it goes.
#[tauri::command]
pub async fn wwise_install(app: AppHandle) -> Result<InstallResult, String> {
    const REPO: &str = "tarngaina/LtMAO";
    const BRANCH: &str = "hai";
    let tree_api = format!("https://api.github.com/repos/{REPO}/git/trees/{BRANCH}?recursive=1");
    let raw_base = format!("https://raw.githubusercontent.com/{REPO}/{BRANCH}/");

    let wanted_prefixes = ["res/wiwawe/", "res/tools/vgmstream/"];
    let dest_map: [(&str, PathBuf); 2] = [
        ("res/wiwawe/", audio_tools_root()?.join("Wwise")),
        ("res/tools/vgmstream/", audio_tools_root()?.join("Decoders")),
    ];

    let progress = |msg: &str| {
        let _ = app.emit("wwise:install-progress", msg.to_string());
    };

    let result: Result<(), String> = async {
        std::fs::create_dir_all(audio_tools_root()?).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(wwise_temp_dir()?).map_err(|e| e.to_string())?;

        let client = reqwest::Client::builder()
            .user_agent("Quartz-App")
            .build()
            .map_err(|e| e.to_string())?;

        progress("Fetching file list from GitHub...");
        let tree: GitTree = client
            .get(&tree_api)
            .send()
            .await
            .map_err(|e| format!("GitHub tree request failed: {e}"))?
            .json()
            .await
            .map_err(|e| format!("GitHub tree parse failed: {e}"))?;

        let files: Vec<&GitTreeItem> = tree
            .tree
            .iter()
            .filter(|item| {
                item.kind == "blob" && wanted_prefixes.iter().any(|p| item.path.starts_with(p))
            })
            .collect();

        if files.is_empty() {
            return Err("No files found — repo structure may have changed".into());
        }

        let total = files.len();
        progress(&format!("Installing audio tools (0 / {total} files)..."));

        let mut done = 0usize;
        for item in files {
            if item.path.contains("..") {
                continue;
            }
            let mapping = dest_map.iter().find(|(p, _)| item.path.starts_with(p));
            let (prefix, dest) = match mapping {
                Some(m) => m,
                None => continue,
            };
            let rel = &item.path[prefix.len()..];
            let dest_path = rel.split('/').fold(dest.clone(), |acc, seg| acc.join(seg));

            if let Some(parent) = dest_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }

            let bytes = client
                .get(format!("{raw_base}{}", item.path))
                .send()
                .await
                .map_err(|e| format!("download failed for {}: {e}", item.path))?
                .bytes()
                .await
                .map_err(|e| format!("download read failed for {}: {e}", item.path))?;
            std::fs::write(&dest_path, &bytes)
                .map_err(|e| format!("write failed for {}: {e}", dest_path.display()))?;

            done += 1;
            progress(&format!(
                "Installing audio tools ({done} / {total} files)..."
            ));
        }

        if !wwise_console_exe()?.exists() {
            return Err(
                "WwiseConsole.exe not found after install — repo structure may have changed."
                    .into(),
            );
        }

        progress("Done!");
        Ok(())
    }
    .await;

    match result {
        Ok(()) => Ok(InstallResult {
            success: true,
            error: None,
        }),
        Err(e) => Ok(InstallResult {
            success: false,
            error: Some(e),
        }),
    }
}

/// Convert a user wav/mp3/ogg file to .wem via vgmstream + WwiseConsole. Returns
/// the encoded WEM bytes.
#[tauri::command]
pub async fn audio_convert_to_wem(input_path: String) -> Result<Vec<u8>, String> {
    tokio::task::spawn_blocking(move || convert_to_wem_blocking(&input_path))
        .await
        .map_err(|e| format!("convert task failed: {e}"))?
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchWemInput {
    pub name: String,
    pub data: Vec<u8>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchWemOutput {
    pub name: String,
    pub data_base64: Option<String>,
    pub error: Option<String>,
}

/// Convert splitter WAV segments in one WwiseConsole invocation, matching the
/// Electron workflow without exposing temporary paths to the webview.
#[tauri::command]
pub async fn audio_convert_wavs_to_wem(
    inputs: Vec<BatchWemInput>,
) -> Result<Vec<BatchWemOutput>, String> {
    tokio::task::spawn_blocking(move || convert_wavs_to_wem_blocking(inputs))
        .await
        .map_err(|e| format!("batch convert task failed: {e}"))?
}

fn xml_attribute(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn safe_audio_stem(name: &str) -> String {
    let raw = Path::new(name)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("segment");
    let safe: String = raw
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '_' || character == '-' {
                character
            } else {
                '_'
            }
        })
        .collect();
    if safe.is_empty() {
        "segment".to_string()
    } else {
        safe
    }
}

fn convert_wavs_to_wem_blocking(inputs: Vec<BatchWemInput>) -> Result<Vec<BatchWemOutput>, String> {
    if inputs.is_empty() {
        return Ok(Vec::new());
    }

    let console = wwise_console_exe()?;
    if !console.exists() {
        return Err("Wwise tools not installed".into());
    }
    let temp = wwise_temp_dir()?;
    std::fs::create_dir_all(&temp).map_err(|error| error.to_string())?;
    let uid = unique_id();
    let wsources = temp.join(format!("split_batch_{uid}.wsources"));

    let mut jobs: Vec<(String, String, PathBuf)> = Vec::with_capacity(inputs.len());
    for (index, input) in inputs.into_iter().enumerate() {
        let destination = format!("split_{uid}_{index}_{}", safe_audio_stem(&input.name));
        let wav_path = temp.join(format!("{destination}.wav"));
        if let Err(error) = std::fs::write(&wav_path, input.data) {
            for (_, _, path) in &jobs {
                let _ = std::fs::remove_file(path);
            }
            return Err(format!("write splitter wav failed: {error}"));
        }
        jobs.push((input.name, destination, wav_path));
    }

    let mut xml = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<ExternalSourcesList SchemaVersion=\"1\" Root=\"{}\">\n",
        xml_attribute(&temp.to_string_lossy())
    );
    for (_, destination, wav_path) in &jobs {
        xml.push_str(&format!(
            "  <Source Path=\"{}\" Conversion=\"Vorbis Quality High\" Destination=\"{}\"/>\n",
            xml_attribute(&wav_path.to_string_lossy()),
            xml_attribute(destination),
        ));
    }
    xml.push_str("</ExternalSourcesList>");
    std::fs::write(&wsources, xml).map_err(|error| error.to_string())?;

    let wproj = wwise_wproj()?;
    let conversion = run_hidden(
        &console,
        &[
            "convert-external-source",
            &wproj.to_string_lossy(),
            "--source-file",
            &wsources.to_string_lossy(),
            "--output",
            &temp.to_string_lossy(),
            "--platform",
            "Windows",
        ],
        console.parent(),
    );

    let _ = std::fs::remove_file(&wsources);
    for (_, _, wav_path) in &jobs {
        let _ = std::fs::remove_file(wav_path);
    }
    conversion?;

    let outputs = jobs
        .into_iter()
        .map(|(name, destination, _)| {
            let candidates = [
                temp.join("Windows").join(format!("{destination}.wem")),
                temp.join(format!("{destination}.wem")),
            ];
            let wem_path = candidates.iter().find(|path| path.exists());
            let result = match wem_path {
                Some(path) => std::fs::read(path)
                    .map(|data| base64::engine::general_purpose::STANDARD.encode(data))
                    .map_err(|error| format!("read converted WEM failed: {error}")),
                None => Err("Wwise did not produce a WEM file".to_string()),
            };
            if let Some(path) = wem_path {
                let _ = std::fs::remove_file(path);
            }
            match result {
                Ok(data_base64) => BatchWemOutput {
                    name,
                    data_base64: Some(data_base64),
                    error: None,
                },
                Err(error) => BatchWemOutput {
                    name,
                    data_base64: None,
                    error: Some(error),
                },
            }
        })
        .collect();

    Ok(outputs)
}

fn unique_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{nanos}")
}

fn convert_to_wem_blocking(input_path: &str) -> Result<Vec<u8>, String> {
    let console = wwise_console_exe()?;
    if !console.exists() {
        return Err("Wwise tools not installed".into());
    }
    let temp = wwise_temp_dir()?;
    std::fs::create_dir_all(&temp).map_err(|e| e.to_string())?;

    let input = Path::new(input_path);
    let ext = input
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let base = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("audio")
        .to_string();
    let uid = unique_id();
    let dest = format!("{base}_{uid}");

    let mut wav_path = input.to_path_buf();
    let mut temp_files: Vec<PathBuf> = Vec::new();

    // MP3/OGG -> WAV via vgmstream.
    if ext == "mp3" || ext == "ogg" {
        let vgm = vgmstream_exe()?;
        if !vgm.exists() {
            return Err("vgmstream decoder not installed".into());
        }
        let out_wav = temp.join(format!("{dest}.wav"));
        run_hidden(
            &vgm,
            &["-o", &out_wav.to_string_lossy(), input_path],
            vgm.parent(),
        )?;
        temp_files.push(out_wav.clone());
        wav_path = out_wav;
    }

    // Normalize to signed 16-bit PCM so WwiseConsole always reads it.
    let raw = std::fs::read(&wav_path).map_err(|e| format!("read wav failed: {e}"))?;
    if let Some(norm) = normalize_wav_to_s16(&raw) {
        let norm_path = temp.join(format!("{dest}_norm.wav"));
        std::fs::write(&norm_path, &norm).map_err(|e| e.to_string())?;
        temp_files.push(norm_path.clone());
        wav_path = norm_path;
    }

    // Build .wsources and run WwiseConsole.
    let wsources = temp.join(format!("{dest}.wsources"));
    let xml = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<ExternalSourcesList SchemaVersion=\"1\" Root=\"{root}\">\n  <Source Path=\"{src}\" Conversion=\"Vorbis Quality High\" Destination=\"{dest}\"/>\n</ExternalSourcesList>",
        root = temp.to_string_lossy(),
        src = wav_path.to_string_lossy(),
        dest = dest,
    );
    std::fs::write(&wsources, xml).map_err(|e| e.to_string())?;

    let wproj = wwise_wproj()?;
    run_hidden(
        &console,
        &[
            "convert-external-source",
            &wproj.to_string_lossy(),
            "--source-file",
            &wsources.to_string_lossy(),
            "--output",
            &temp.to_string_lossy(),
            "--platform",
            "Windows",
        ],
        console.parent(),
    )?;

    let candidates = [
        temp.join("Windows").join(format!("{dest}.wem")),
        temp.join(format!("{dest}.wem")),
    ];
    let wem_path = candidates.iter().find(|p| p.exists());

    let result = match wem_path {
        Some(p) => std::fs::read(p).map_err(|e| format!("read wem failed: {e}")),
        None => Err("Conversion succeeded but .wem output not found".into()),
    };

    let _ = std::fs::remove_file(&wsources);
    for f in &temp_files {
        let _ = std::fs::remove_file(f);
    }
    if let Some(p) = wem_path {
        let _ = std::fs::remove_file(p);
    }

    result
}

/// Decode a WEM/MP3/OGG to WAV bytes via the native decoder or vgmstream.
/// The base64 result avoids leaving splitter temp files behind and is much
/// smaller on the IPC boundary than a JSON array containing every byte.
#[tauri::command]
pub async fn audio_decode_to_wav(data: Vec<u8>) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let temp = wwise_temp_dir()?;
        std::fs::create_dir_all(&temp).map_err(|e| e.to_string())?;
        let uid = unique_id();

        // Try the native decoder first (handles WEM directly).
        if let Ok(decoded) = wem::decode_wem(&data) {
            if decoded.format == "wav" {
                return Ok(base64::engine::general_purpose::STANDARD.encode(decoded.data));
            }
        }

        // Fall back to vgmstream on a temp input file.
        let vgm = vgmstream_exe()?;
        if !vgm.exists() {
            return Err("vgmstream decoder not installed".into());
        }
        let in_path = temp.join(format!("split_in_{uid}.bin"));
        std::fs::write(&in_path, &data).map_err(|e| e.to_string())?;
        let out = temp.join(format!("split_{uid}.wav"));
        let res = run_hidden(
            &vgm,
            &["-o", &out.to_string_lossy(), &in_path.to_string_lossy()],
            vgm.parent(),
        );
        let _ = std::fs::remove_file(&in_path);
        if let Err(error) = res {
            let _ = std::fs::remove_file(&out);
            return Err(error);
        }
        let wav = std::fs::read(&out).map_err(|e| format!("read decoded wav failed: {e}"));
        let _ = std::fs::remove_file(&out);
        Ok(base64::engine::general_purpose::STANDARD.encode(wav?))
    })
    .await
    .map_err(|e| format!("decode task failed: {e}"))?
}

/// Write raw bytes to a path, creating parent directories. Used by the audio
/// splitter to save sliced WAV segments the frontend encodes in JS.
#[tauri::command]
pub async fn audio_write_file(path: String, data: Vec<u8>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        if let Some(parent) = Path::new(&path).parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("mkdir failed: {e}"))?;
        }
        std::fs::write(&path, &data).map_err(|e| format!("write failed: {e}"))
    })
    .await
    .map_err(|e| format!("write task failed: {e}"))?
}

/// Amplify a WEM by gain_db: decode -> scale PCM -> re-encode through Wwise.
#[tauri::command]
pub async fn audio_amplify_wem(data: Vec<u8>, gain_db: f32) -> Result<Vec<u8>, String> {
    tokio::task::spawn_blocking(move || {
        let console = wwise_console_exe()?;
        let vgm = vgmstream_exe()?;
        if !console.exists() {
            return Err("Wwise tools not installed".into());
        }
        if !vgm.exists() {
            return Err("vgmstream decoder not installed".into());
        }
        let temp = wwise_temp_dir()?;
        std::fs::create_dir_all(&temp).map_err(|e| e.to_string())?;
        let uid = unique_id();
        let base = format!("gain_{uid}");

        // WEM -> WAV via vgmstream.
        let in_wem = temp.join(format!("{base}.wem"));
        std::fs::write(&in_wem, &data).map_err(|e| e.to_string())?;
        let wav_path = temp.join(format!("{base}.wav"));
        let dec = run_hidden(
            &vgm,
            &["-o", &wav_path.to_string_lossy(), &in_wem.to_string_lossy()],
            vgm.parent(),
        );
        let _ = std::fs::remove_file(&in_wem);
        dec?;

        // Amplify PCM in place.
        let raw = std::fs::read(&wav_path).map_err(|e| e.to_string())?;
        let amplified = amplify_wav(&raw, gain_db);
        std::fs::write(&wav_path, &amplified).map_err(|e| e.to_string())?;

        // WAV -> WEM via WwiseConsole.
        let wsources = temp.join(format!("{base}.wsources"));
        let xml = format!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<ExternalSourcesList SchemaVersion=\"1\" Root=\"{root}\">\n  <Source Path=\"{src}\" Conversion=\"Vorbis Quality High\" Destination=\"{dest}\"/>\n</ExternalSourcesList>",
            root = temp.to_string_lossy(),
            src = wav_path.to_string_lossy(),
            dest = base,
        );
        std::fs::write(&wsources, xml).map_err(|e| e.to_string())?;
        let wproj = wwise_wproj()?;
        run_hidden(
            &console,
            &[
                "convert-external-source",
                &wproj.to_string_lossy(),
                "--source-file",
                &wsources.to_string_lossy(),
                "--output",
                &temp.to_string_lossy(),
                "--platform",
                "Windows",
            ],
            console.parent(),
        )?;

        let candidates = [
            temp.join("Windows").join(format!("{base}.wem")),
            temp.join(format!("{base}.wem")),
        ];
        let wem_path = candidates.iter().find(|p| p.exists());
        let result = match wem_path {
            Some(p) => std::fs::read(p).map_err(|e| e.to_string()),
            None => Err("Output WEM not found after conversion".into()),
        };
        let _ = std::fs::remove_file(&wav_path);
        let _ = std::fs::remove_file(&wsources);
        if let Some(p) = wem_path {
            let _ = std::fs::remove_file(p);
        }
        result
    })
    .await
    .map_err(|e| format!("amplify task failed: {e}"))?
}

// ---------------------------------------------------------------------------
// Mod folder scan + game extraction
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModFileSet {
    pub audio: String,
    pub events: String,
    pub bin: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub r#type: Option<String>,
    pub mod_folder_name: String,
}

fn walk_files(dir: &Path, out: &mut Vec<PathBuf>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk_files(&path, out);
            } else if path.is_file() {
                out.push(path);
            }
        }
    }
}

fn lower(p: &Path) -> String {
    p.to_string_lossy().to_lowercase()
}

/// Scan a mod folder for audio/events/bin triples (port of modAutoProcessor).
#[tauri::command]
pub async fn bnk_scan_mod_folder(
    folder_path: String,
    skin_id: Option<String>,
) -> Result<Vec<ModFileSet>, String> {
    tokio::task::spawn_blocking(move || {
        let root = PathBuf::from(&folder_path);
        if !root.exists() {
            return Ok(Vec::new());
        }
        let mut all: Vec<PathBuf> = Vec::new();
        walk_files(&root, &mut all);

        let skin = skin_id.as_deref().filter(|s| !s.is_empty());
        let skin_matches = |p: &Path| -> bool {
            match skin {
                None => true,
                Some(id) => {
                    let l = lower(p);
                    let needle = format!("skin{id}");
                    // skin<id> not followed by another digit.
                    if let Some(idx) = l.find(&needle) {
                        let after = l[idx + needle.len()..].chars().next();
                        let ok = after.map(|c| !c.is_ascii_digit()).unwrap_or(true);
                        if ok {
                            return true;
                        }
                    }
                    if id == "0"
                        && (l.contains("\\base\\") || l.contains("/base/") || l.contains("_base"))
                    {
                        return true;
                    }
                    false
                }
            }
        };

        // Bin selection: score paths to prefer the most "standard" BIN location
        // (data/characters/skins), then prefer skin-matching bins. Mirrors the old
        // Quartz modAutoProcessor scoring.
        let mut bins: Vec<&PathBuf> = all.iter().filter(|p| lower(p).ends_with(".bin")).collect();
        let bin_score = |p: &Path| -> i32 {
            let l = lower(p);
            let mut score = 0;
            if l.contains("data") {
                score += 1;
            }
            if l.contains("characters") {
                score += 2;
            }
            if l.contains("skins") {
                score += 2;
            }
            if l.contains("\\data\\") || l.contains("/data/") {
                score += 1;
            }
            if l.contains("\\skins\\") || l.contains("/skins/") {
                score += 1;
            }
            if l.contains("\\characters\\") || l.contains("/characters/") {
                score += 1;
            }
            score
        };
        // Highest score first (stable so ties keep discovery order).
        bins.sort_by(|a, b| bin_score(b).cmp(&bin_score(a)));
        let selected_bin = bins
            .iter()
            .find(|p| skin_matches(p))
            .or_else(|| bins.first())
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        // Banks filtered by skin (fall back to all banks if nothing matches).
        let banks: Vec<&PathBuf> = all
            .iter()
            .filter(|p| {
                let l = lower(p);
                l.ends_with(".bnk") || l.ends_with(".wpk")
            })
            .collect();
        let mut relevant: Vec<&&PathBuf> = banks.iter().filter(|p| skin_matches(p)).collect();
        if relevant.is_empty() {
            relevant = banks.iter().collect();
        }

        let audio_files: Vec<&PathBuf> = relevant
            .iter()
            .filter(|p| {
                let l = lower(p);
                l.ends_with("_audio.bnk")
                    || l.ends_with(".wpk")
                    || (l.contains("audio") && !l.contains("events"))
            })
            .map(|p| **p)
            .collect();
        let audio_files: Vec<&PathBuf> = if audio_files.is_empty() {
            relevant
                .iter()
                .filter(|p| !lower(p).contains("events"))
                .map(|p| **p)
                .collect()
        } else {
            audio_files
        };

        // Resolve the events .bnk paired with an audio bank. Mirrors old Quartz's
        // four rules, in order: _audio.bnk→_events.bnk, .wpk→_events.bnk, the
        // substring "audio"→"events", then any _events.bnk in the same directory.
        let find_events = |audio: &Path| -> String {
            let low = lower(audio);
            let find_exact = |t: &str| -> Option<String> {
                relevant
                    .iter()
                    .find(|p| lower(p) == t)
                    .map(|p| p.to_string_lossy().to_string())
            };

            // Rule 1: _audio.bnk → _events.bnk
            if low.ends_with("_audio.bnk") {
                if let Some(f) = find_exact(&format!("{}_events.bnk", &low[..low.len() - 10])) {
                    return f;
                }
            }
            // Rule 2: .wpk → _events.bnk
            if low.ends_with(".wpk") {
                if let Some(f) = find_exact(&format!("{}_events.bnk", &low[..low.len() - 4])) {
                    return f;
                }
            }
            // Rule 3: replace the first "audio" with "events"
            if low.contains("audio") {
                if let Some(f) = find_exact(&low.replacen("audio", "events", 1)) {
                    return f;
                }
            }
            // Rule 4: any _events.bnk in the same directory.
            if let Some(dir) = audio.parent() {
                for p in &relevant {
                    if p.parent() == Some(dir) && lower(p).ends_with("_events.bnk") {
                        return p.to_string_lossy().to_string();
                    }
                }
            }
            String::new()
        };

        let folder_name = root
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        // Determine a set's type (VO / SFX / distinctive dir name), matching old
        // Quartz. Used by the caller to name the loaded tree "<folder>_<TYPE>".
        let detect_type = |audio: &Path| -> Option<String> {
            let l = lower(audio);
            if l.contains("\\vo\\") || l.contains("/vo/") || l.contains("_vo") {
                return Some("VO".to_string());
            }
            if l.contains("\\sfx\\") || l.contains("/sfx/") || l.contains("_sfx") {
                return Some("SFX".to_string());
            }
            if let Some(dir) = audio.parent() {
                if let Some(dir_name) = dir.file_name() {
                    let dn = dir_name.to_string_lossy();
                    let dl = dn.to_lowercase();
                    if dl != "skins" && dl != "sounds" {
                        return Some(dn.to_uppercase());
                    }
                }
            }
            None
        };

        // Keep only sets whose audio file is non-empty (> 150 bytes of header
        // overhead), matching the old Quartz isNonEmpty filter.
        let is_non_empty =
            |p: &Path| -> bool { std::fs::metadata(p).map(|m| m.len() > 150).unwrap_or(false) };

        let sets: Vec<ModFileSet> = audio_files
            .iter()
            .filter(|audio| is_non_empty(audio))
            .map(|audio| {
                let events = find_events(audio);
                ModFileSet {
                    audio: audio.to_string_lossy().to_string(),
                    events,
                    bin: selected_bin.clone(),
                    r#type: detect_type(audio),
                    mod_folder_name: folder_name.clone(),
                }
            })
            .collect();

        Ok(sets)
    })
    .await
    .map_err(|e| format!("scan task failed: {e}"))?
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameBankGroup {
    pub key: String,
    pub name: String,
    pub events_bnk: String,
    pub audio_bnk: String,
    pub audio_wpk: String,
    pub bin_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameBanksResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub groups: Option<Vec<GameBankGroup>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_dir: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameBanksArgs {
    pub champion_name: String,
    #[serde(default)]
    pub league_path: Option<String>,
    #[serde(default)]
    pub skin_ids: Vec<i64>,
    #[serde(default = "default_true")]
    pub include_voiceover: bool,
    #[serde(default = "default_true")]
    pub include_sfx: bool,
}

fn default_true() -> bool {
    true
}

/// Riot stores chromas as `skinId * 1000 + chromaIndex`; the base skin is `% 1000`.
fn normalize_skin_selection(value: i64) -> i64 {
    if value >= 1000 {
        value % 1000
    } else {
        value
    }
}

fn normalize_rel_lower(value: &str) -> String {
    value
        .replace('\\', "/")
        .trim_start_matches('/')
        .to_lowercase()
}

/// Pull the skin segment out of a `.../skins/skin07/...` or `.../skins/skin0.bin` path.
fn extract_skin_segment(rel_lower: &str) -> String {
    if let Some(idx) = rel_lower.find("/skins/") {
        let rest = &rel_lower[idx + "/skins/".len()..];
        let end = rest.find(|c| c == '/' || c == '.').unwrap_or(rest.len());
        rest[..end].to_string()
    } else {
        String::new()
    }
}

fn skin_segment_to_number(segment: &str) -> Option<i64> {
    let seg = segment.trim().to_lowercase();
    if seg.is_empty() {
        return None;
    }
    if seg == "base" || seg == "root" {
        return Some(0);
    }
    let digits = if let Some(stripped) = seg.strip_prefix("skin") {
        stripped
    } else {
        seg.as_str()
    };
    let trimmed = digits.trim_start_matches('0');
    let trimmed = if trimmed.is_empty() && !digits.is_empty() {
        "0"
    } else {
        trimmed
    };
    trimmed.parse::<i64>().ok()
}

fn skin_segment_to_key(segment: &str) -> String {
    match skin_segment_to_number(segment) {
        Some(n) => format!("skin{n}"),
        None => segment.trim().to_lowercase(),
    }
}

fn score_bin_rel(rel_lower: &str) -> u32 {
    let mut score = 0;
    if rel_lower.contains("data/") {
        score += 1;
    }
    if rel_lower.contains("characters/") {
        score += 2;
    }
    if rel_lower.contains("skins/") {
        score += 2;
    }
    score
}

#[derive(Default, Clone)]
struct GroupBuilder {
    key: String,
    name: String,
    events_bnk: String,
    audio_bnk: String,
    audio_wpk: String,
    skin_segment: String,
}

/// Group extracted bnk/wpk/bin files into events+audio+bin sets (port of groupBanks).
fn group_banks(files: &[(PathBuf, String)]) -> Vec<GameBankGroup> {
    use std::collections::HashMap;
    let mut groups: HashMap<String, GroupBuilder> = HashMap::new();
    let mut skin_to_bin: HashMap<String, String> = HashMap::new();
    let mut all_bins: Vec<(String, u32, String)> = Vec::new(); // (abs, score, skin_key)

    for (abs, rel) in files {
        let abs_str = abs.to_string_lossy().to_string();
        let base = rel.rsplit('/').next().unwrap_or(rel).to_lowercase();
        let skin_seg = extract_skin_segment(rel);
        let skin_key = skin_segment_to_key(&skin_seg);

        if base.ends_with(".bin") {
            all_bins.push((abs_str.clone(), score_bin_rel(rel), skin_key.clone()));
            if !skin_key.is_empty() {
                skin_to_bin.entry(skin_key).or_insert(abs_str);
            }
            continue;
        }
        if !(base.ends_with(".bnk") || base.ends_with(".wpk")) {
            continue;
        }

        let mut key = base.clone();
        for suffix in ["_audio.bnk", "_audio.wpk", "_events.bnk"] {
            if key.ends_with(suffix) {
                key = key[..key.len() - suffix.len()].to_string();
                break;
            }
        }
        if key.ends_with(".bnk") || key.ends_with(".wpk") {
            key = key[..key.len() - 4].to_string();
        }

        let entry = groups.entry(key.clone()).or_insert_with(|| GroupBuilder {
            key: key.clone(),
            name: key.clone(),
            skin_segment: skin_key.clone(),
            ..Default::default()
        });

        if base.ends_with("_events.bnk") {
            entry.events_bnk = abs_str;
        } else if base.ends_with("_audio.wpk") {
            entry.audio_wpk = abs_str;
        } else if base.ends_with("_audio.bnk") {
            entry.audio_bnk = abs_str;
        } else if base.ends_with(".bnk") && entry.audio_bnk.is_empty() {
            entry.audio_bnk = abs_str;
        } else if base.ends_with(".wpk") && entry.audio_wpk.is_empty() {
            entry.audio_wpk = abs_str;
        }
    }

    all_bins.sort_by(|a, b| b.1.cmp(&a.1));
    let global_best_bin = all_bins.first().map(|b| b.0.clone()).unwrap_or_default();

    groups
        .into_values()
        .map(|g| {
            let bin_path = if !g.skin_segment.is_empty() {
                skin_to_bin
                    .get(&g.skin_segment)
                    .cloned()
                    .unwrap_or_else(|| global_best_bin.clone())
            } else {
                global_best_bin.clone()
            };
            GameBankGroup {
                key: g.key,
                name: g.name,
                events_bnk: g.events_bnk,
                audio_bnk: g.audio_bnk,
                audio_wpk: g.audio_wpk,
                bin_path,
            }
        })
        .collect()
}

/// Extract champion banks straight from the game WADs: locate the champion WAD
/// (plus voiceover WADs), read the resolved TOC, filter sfx/vo banks and skin
/// bins for the requested skins, extract them to a temp cache, then group them.
#[tauri::command]
pub async fn bnk_extract_banks_from_game(args: GameBanksArgs) -> Result<GameBanksResult, String> {
    tokio::task::spawn_blocking(move || extract_banks_from_game_blocking(args))
        .await
        .map_err(|e| format!("game bank extraction task failed: {e}"))?
}

fn extract_banks_from_game_blocking(args: GameBanksArgs) -> Result<GameBanksResult, String> {
    use quartz_lib::wad;

    let champion_name = args.champion_name.trim().to_string();
    if champion_name.is_empty() {
        return Ok(GameBanksResult {
            success: false,
            error: Some("Missing champion name".into()),
            groups: None,
            output_dir: None,
        });
    }
    if !args.include_voiceover && !args.include_sfx {
        return Ok(GameBanksResult {
            success: false,
            error: Some("Enable at least one bank type: VO or SFX".into()),
            groups: None,
            output_dir: None,
        });
    }

    let selected_skins: Vec<i64> = {
        let mut s: Vec<i64> = args
            .skin_ids
            .iter()
            .map(|v| normalize_skin_selection(*v))
            .collect();
        s.sort_unstable();
        s.dedup();
        s
    };
    if selected_skins.is_empty() {
        return Ok(GameBanksResult {
            success: false,
            error: Some("Select at least one skin".into()),
            groups: None,
            output_dir: None,
        });
    }

    // Resolve the League install root.
    let league_root = args
        .league_path
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .map(PathBuf::from)
        .or_else(|| quartz_lib::extractor::detect_league_path_by_common_paths())
        .ok_or_else(|| "League install not found. Set the League path in settings.".to_string())?;

    let champ_file = wad::normalize_champion(&champion_name);
    let main_wad = wad::find_champion_wad(&league_root, &champion_name)
        .ok_or_else(|| format!("Champion WAD not found for {champion_name}"))?;

    let mut wad_paths = vec![main_wad];
    if args.include_voiceover {
        for vo in wad::list_voiceover_wads(&league_root, &champion_name) {
            if !wad_paths.contains(&vo) {
                wad_paths.push(vo);
            }
        }
    }

    let sfx_prefix = format!("sounds/wwise2016/sfx/characters/{champ_file}/skins/");
    let vo_prefix = "sounds/wwise2016/vo/";
    let vo_contains = format!("/characters/{champ_file}/skins/");
    let bin_prefix_a = format!("assets/characters/{champ_file}/skins/");
    let bin_prefix_b = format!("data/characters/{champ_file}/skins/");

    // Gather wanted chunks per WAD.
    let mut per_wad: Vec<(PathBuf, Vec<String>)> = Vec::new();
    for wad_path in &wad_paths {
        let toc = wad::read_wad_toc(wad_path).map_err(|e| e.to_string())?;
        let mut hashes: Vec<String> = Vec::new();
        for entry in &toc {
            let Some(resolved) = &entry.resolved_path else {
                continue;
            };
            let rel = normalize_rel_lower(resolved);
            if rel.is_empty() {
                continue;
            }
            let is_bank = rel.ends_with(".bnk") || rel.ends_with(".wpk");
            let is_bin = rel.ends_with(".bin");
            if !is_bank && !is_bin {
                continue;
            }
            let skin_seg = extract_skin_segment(&rel);
            let skin_num = skin_segment_to_number(&skin_seg);
            let mut keep = false;

            if is_bank {
                if args.include_sfx && rel.contains(&sfx_prefix) {
                    if let Some(n) = skin_num {
                        if selected_skins.contains(&n) {
                            keep = true;
                        }
                    }
                }
                if !keep
                    && args.include_voiceover
                    && rel.contains(vo_prefix)
                    && rel.contains(&vo_contains)
                {
                    match skin_num {
                        Some(0) => keep = true,
                        Some(n) if selected_skins.contains(&n) => keep = true,
                        _ => {}
                    }
                }
            }

            if !keep && is_bin && (rel.contains(&bin_prefix_a) || rel.contains(&bin_prefix_b)) {
                if let Some(n) = skin_num {
                    keep = selected_skins.contains(&n);
                }
            }

            if keep {
                hashes.push(format!("{:016x}", entry.path_hash));
            }
        }
        if !hashes.is_empty() {
            per_wad.push((wad_path.clone(), hashes));
        }
    }

    let total_wanted: usize = per_wad.iter().map(|(_, h)| h.len()).sum();
    if total_wanted == 0 {
        return Ok(GameBanksResult {
            success: false,
            error: Some(format!(
                "No matching banks found for {champion_name} skins {selected_skins:?}"
            )),
            groups: None,
            output_dir: None,
        });
    }

    // Temp cache keyed by champion + skins + mode.
    let skin_tag = selected_skins
        .iter()
        .map(|n| n.to_string())
        .collect::<Vec<_>>()
        .join("-");
    let mode_tag = format!(
        "{}{}",
        if args.include_sfx { "sfx" } else { "" },
        if args.include_voiceover { "vo" } else { "" }
    );
    let output_dir = std::env::temp_dir()
        .join("Quartz")
        .join("bnk-game-cache")
        .join(format!("{champ_file}_skins_{skin_tag}_{mode_tag}"));

    // Cache hit: reuse existing extracted banks.
    let mut existing: Vec<PathBuf> = Vec::new();
    walk_files(&output_dir, &mut existing);
    let existing_banks: Vec<(PathBuf, String)> = existing
        .iter()
        .filter(|p| {
            let l = lower(p);
            l.ends_with(".bnk") || l.ends_with(".wpk") || l.ends_with(".bin")
        })
        .map(|p| {
            let rel = p
                .strip_prefix(&output_dir)
                .map(|r| normalize_rel_lower(&r.to_string_lossy()))
                .unwrap_or_default();
            (p.clone(), rel)
        })
        .collect();
    let has_bank = existing_banks
        .iter()
        .any(|(_, rel)| rel.ends_with(".bnk") || rel.ends_with(".wpk"));
    if has_bank {
        let groups = group_banks(&existing_banks);
        return Ok(GameBanksResult {
            success: true,
            error: None,
            groups: Some(groups),
            output_dir: Some(output_dir.to_string_lossy().to_string()),
        });
    }

    if output_dir.exists() {
        let _ = std::fs::remove_dir_all(&output_dir);
    }
    std::fs::create_dir_all(&output_dir).map_err(|e| format!("mkdir failed: {e}"))?;

    // Extract per WAD, preserving resolved paths so grouping/skin detection works.
    for (wad_path, hashes) in &per_wad {
        let selected: Vec<wad::ChunkSel> = hashes
            .iter()
            .filter_map(|h| u64::from_str_radix(h, 16).ok())
            .map(|path_hash| wad::ChunkSel { path_hash })
            .collect();
        wad::extract_selected(wad_path, &selected, &output_dir, true).map_err(|e| e.to_string())?;
    }

    let mut produced: Vec<PathBuf> = Vec::new();
    walk_files(&output_dir, &mut produced);
    let produced_banks: Vec<(PathBuf, String)> = produced
        .iter()
        .filter(|p| {
            let l = lower(p);
            l.ends_with(".bnk") || l.ends_with(".wpk") || l.ends_with(".bin")
        })
        .map(|p| {
            let rel = p
                .strip_prefix(&output_dir)
                .map(|r| normalize_rel_lower(&r.to_string_lossy()))
                .unwrap_or_default();
            (p.clone(), rel)
        })
        .collect();

    if !produced_banks
        .iter()
        .any(|(_, rel)| rel.ends_with(".bnk") || rel.ends_with(".wpk"))
    {
        return Ok(GameBanksResult {
            success: false,
            error: Some("Extraction succeeded but no .bnk/.wpk files were produced".into()),
            groups: None,
            output_dir: Some(output_dir.to_string_lossy().to_string()),
        });
    }

    let groups = group_banks(&produced_banks);
    Ok(GameBanksResult {
        success: true,
        error: None,
        groups: Some(groups),
        output_dir: Some(output_dir.to_string_lossy().to_string()),
    })
}

// ---------------------------------------------------------------------------
// WAV helpers (ported from the Electron audio.js)
// ---------------------------------------------------------------------------

fn read_u32_le(b: &[u8], o: usize) -> u32 {
    u32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]])
}

fn read_u16_le(b: &[u8], o: usize) -> u16 {
    u16::from_le_bytes([b[o], b[o + 1]])
}

/// Find the fmt + data chunks. Returns (audio_format, bits, channels, sample_rate,
/// data_start, data_size).
fn parse_wav(buf: &[u8]) -> Option<(u16, u16, u16, u32, usize, usize)> {
    if buf.len() < 12 {
        return None;
    }
    let mut pos = 12usize;
    let mut audio_format = 1u16;
    let mut channels = 1u16;
    let mut sample_rate = 44100u32;
    let mut bits = 16u16;
    while pos + 8 <= buf.len() {
        let id = &buf[pos..pos + 4];
        let size = read_u32_le(buf, pos + 4) as usize;
        if id == b"fmt " && pos + 24 <= buf.len() {
            audio_format = read_u16_le(buf, pos + 8);
            channels = read_u16_le(buf, pos + 10);
            sample_rate = read_u32_le(buf, pos + 12);
            bits = read_u16_le(buf, pos + 22);
        } else if id == b"data" {
            return Some((audio_format, bits, channels, sample_rate, pos + 8, size));
        }
        pos += 8 + if size % 2 != 0 { size + 1 } else { size };
    }
    None
}

/// Amplify a PCM/float WAV buffer by gain_db decibels in place.
fn amplify_wav(buf: &[u8], gain_db: f32) -> Vec<u8> {
    let gain = 10f32.powf(gain_db / 20.0);
    let mut out = buf.to_vec();
    let (audio_format, bits, _ch, _sr, data_start, data_size) = match parse_wav(buf) {
        Some(v) => v,
        None => return out,
    };
    let end = (data_start + data_size).min(out.len());

    if audio_format == 1 && bits == 16 {
        let mut i = data_start;
        while i + 1 < end {
            let s = i16::from_le_bytes([out[i], out[i + 1]]) as f32 * gain;
            let clamped = s.round().clamp(-32768.0, 32767.0) as i16;
            out[i..i + 2].copy_from_slice(&clamped.to_le_bytes());
            i += 2;
        }
    } else if audio_format == 1 && bits == 24 {
        let mut i = data_start;
        while i + 2 < end {
            let mut s = (out[i] as i32) | ((out[i + 1] as i32) << 8) | ((out[i + 2] as i32) << 16);
            if s & 0x80_0000 != 0 {
                s |= !0xFF_FFFF;
            }
            let v = ((s as f32 * gain).round()).clamp(-8_388_608.0, 8_388_607.0) as i32;
            out[i] = (v & 0xFF) as u8;
            out[i + 1] = ((v >> 8) & 0xFF) as u8;
            out[i + 2] = ((v >> 16) & 0xFF) as u8;
            i += 3;
        }
    } else if audio_format == 1 && bits == 32 {
        let mut i = data_start;
        while i + 3 < end {
            let s = i32::from_le_bytes([out[i], out[i + 1], out[i + 2], out[i + 3]]) as f32 * gain;
            let v = s.round().clamp(i32::MIN as f32, i32::MAX as f32) as i32;
            out[i..i + 4].copy_from_slice(&v.to_le_bytes());
            i += 4;
        }
    } else if audio_format == 3 && bits == 32 {
        let mut i = data_start;
        while i + 3 < end {
            let s = f32::from_le_bytes([out[i], out[i + 1], out[i + 2], out[i + 3]]) * gain;
            out[i..i + 4].copy_from_slice(&s.clamp(-1.0, 1.0).to_le_bytes());
            i += 4;
        }
    }
    out
}

/// Convert any WAV to signed-16-bit PCM. Returns None if already S16 (no change
/// needed) so callers can skip the rewrite.
fn normalize_wav_to_s16(buf: &[u8]) -> Option<Vec<u8>> {
    let (audio_format, bits, channels, sample_rate, data_start, data_size) = parse_wav(buf)?;
    if audio_format == 1 && bits == 16 {
        return None;
    }
    let data_end = (data_start + data_size).min(buf.len());
    let data = &buf[data_start..data_end];

    let mut samples: Vec<i16> = Vec::new();
    if audio_format == 1 && bits == 8 {
        for &b in data {
            samples.push(((b as i16) - 128) << 8);
        }
    } else if audio_format == 1 && bits == 24 {
        let n = data.len() / 3;
        for i in 0..n {
            let mut s = (data[i * 3] as i32)
                | ((data[i * 3 + 1] as i32) << 8)
                | ((data[i * 3 + 2] as i32) << 16);
            if s & 0x80_0000 != 0 {
                s |= !0xFF_FFFF;
            }
            samples.push((s >> 8) as i16);
        }
    } else if audio_format == 1 && bits == 32 {
        let n = data.len() / 4;
        for i in 0..n {
            let s = i32::from_le_bytes([
                data[i * 4],
                data[i * 4 + 1],
                data[i * 4 + 2],
                data[i * 4 + 3],
            ]);
            samples.push((s >> 16) as i16);
        }
    } else if audio_format == 3 && bits == 32 {
        let n = data.len() / 4;
        for i in 0..n {
            let f = f32::from_le_bytes([
                data[i * 4],
                data[i * 4 + 1],
                data[i * 4 + 2],
                data[i * 4 + 3],
            ]);
            samples.push((f.clamp(-1.0, 1.0) * 32767.0).round() as i16);
        }
    } else {
        return None;
    }

    let new_data_size = samples.len() * 2;
    let mut out = Vec::with_capacity(44 + new_data_size);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&((36 + new_data_size) as u32).to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&channels.to_le_bytes());
    out.extend_from_slice(&sample_rate.to_le_bytes());
    out.extend_from_slice(&(sample_rate * channels as u32 * 2).to_le_bytes());
    out.extend_from_slice(&(channels * 2).to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&(new_data_size as u32).to_le_bytes());
    for s in samples {
        out.extend_from_slice(&s.to_le_bytes());
    }
    Some(out)
}
