/* Sound Banks (BnkExtract) backend.

Everything here is in-process. BNK/WPK containers, WEM decoding and Wwise Vorbis encoding come
from ritoshark::audio; user-supplied mp3/flac/ogg/m4a is decoded by quartz_lib::audio::decode.

This used to download WwiseConsole.exe and vgmstream-cli.exe from a third-party repo into
%APPDATA%/RitoShark/AudioTools and shell out to them. The Rust encoder replaced the only thing
that genuinely needed an external toolchain, so the download is gone and any copy a previous
version left behind is removed on startup. */

use base64::Engine;
use quartz_lib::audio::bank;
use quartz_lib::audio::decode;
use quartz_lib::audio::tree::{self, LoadBanksResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

// ---------------------------------------------------------------------------
// Legacy toolchain cleanup
// ---------------------------------------------------------------------------

fn audio_tools_root() -> Option<PathBuf> {
    std::env::var("APPDATA")
        .ok()
        .map(|appdata| PathBuf::from(appdata).join("RitoShark").join("AudioTools"))
}

/** Deletes the Wwise/vgmstream toolchain older versions downloaded.

Several hundred megabytes of third-party binaries that nothing reads any more. Called once at
startup; a missing directory is the normal case and not an error. */
pub fn remove_legacy_audio_tools() {
    let Some(root) = audio_tools_root() else {
        return;
    };
    if !root.exists() {
        return;
    }
    match std::fs::remove_dir_all(&root) {
        Ok(()) => tracing::info!("removed the legacy audio toolchain at {}", root.display()),
        Err(e) => tracing::warn!("could not remove {}: {e}", root.display()),
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
    .map_err(|e| format!("load banks task failed: {e}"))?
}

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

/// Decode raw WEM bytes to a playable container (OGG for Vorbis, WAV for PCM).
#[tauri::command]
pub async fn bnk_wem_to_ogg(data: Vec<u8>) -> Result<Vec<u8>, String> {
    tokio::task::spawn_blocking(move || bank::decode_wem(&data).map(|d| d.data))
        .await
        .map_err(|e| format!("wem decode task failed: {e}"))?
}

/// Decode raw WEM bytes all the way to a WAV, whatever the source codec was.
#[tauri::command]
pub async fn bnk_wem_to_wav(data: Vec<u8>) -> Result<Vec<u8>, String> {
    tokio::task::spawn_blocking(move || bank::wem_to_pcm(&data).map(|pcm| bank::pcm_to_wav(&pcm)))
        .await
        .map_err(|e| format!("wem decode task failed: {e}"))?
}

/// There is no MP3 encoder here, so this yields the decoded container instead.
#[tauri::command]
pub async fn bnk_wem_to_mp3(data: Vec<u8>, bitrate: u32) -> Result<Vec<u8>, String> {
    let _ = bitrate;
    bnk_wem_to_ogg(data).await
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
    /// Set on a root node — the container the tree was loaded from.
    #[serde(default)]
    pub original_path: Option<String>,
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
    /// Part of the frontend's payload; unread because there is no MP3 encoder.
    #[allow(dead_code)]
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
        // ogg and mp3 both land as the decoded container; only wav is converted.
        if formats.iter().any(|f| f == "ogg" || f == "mp3") {
            if let Ok(decoded) = bank::decode_wem(&audio.data) {
                let ext = if decoded.format == "wav" { "wav" } else { "ogg" };
                let _ = std::fs::write(cur_dir.join(format!("{base}.{ext}")), &decoded.data);
                *count += 1;
            }
        }
        if formats.iter().any(|f| f == "wav") {
            if let Ok(pcm) = bank::wem_to_pcm(&audio.data) {
                let _ = std::fs::write(
                    cur_dir.join(format!("{base}.wav")),
                    bank::pcm_to_wav(&pcm),
                );
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

/// Collect every audio leaf under a node into entries.
fn collect_audio(node: &ExtractNode, out: &mut Vec<bank::AudioEntry>) {
    if let Some(audio) = &node.audio_data {
        out.push(bank::AudioEntry {
            id: audio.id,
            data: audio.data.clone(),
        });
    }
    if let Some(children) = &node.children {
        for child in children {
            collect_audio(child, out);
        }
    }
}

/** Write a root node's audio back into its container.

The edit is applied to the bank the tree was loaded from rather than to a fresh one, so the header
revision, the bank id and the object hierarchy survive. Rebuilding from scratch — which is what
this did before — produced a bank the engine could not load however good the audio inside it was,
so a missing source is an error rather than a silent fallback. */
#[tauri::command]
pub async fn bnk_save_bank(args: SaveBankArgs) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let source = args
            .root
            .original_path
            .as_deref()
            .ok_or("This bank has no source file recorded, so it cannot be saved safely")?;
        let original = std::fs::read(source)
            .map_err(|e| format!("could not read the source bank '{source}': {e}"))?;

        let mut entries: Vec<bank::AudioEntry> = Vec::new();
        collect_audio(&args.root, &mut entries);
        entries.sort_by_key(|e| e.id);
        entries.dedup_by_key(|e| e.id);

        let bytes = bank::save_with_entries(&original, &entries)?;
        std::fs::write(&args.out_path, bytes).map_err(|e| format!("write bank failed: {e}"))
    })
    .await
    .map_err(|e| format!("save task failed: {e}"))?
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/// Convert a user audio file on disk to a Wwise Vorbis WEM.
#[tauri::command]
pub async fn audio_convert_to_wem(input_path: String) -> Result<Vec<u8>, String> {
    tokio::task::spawn_blocking(move || {
        let data = std::fs::read(&input_path)
            .map_err(|e| format!("could not read '{input_path}': {e}"))?;
        bank::to_wem(&data, None)
    })
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

/// Convert splitter segments to WEM. One failure does not sink the batch.
#[tauri::command]
pub async fn audio_convert_wavs_to_wem(
    inputs: Vec<BatchWemInput>,
) -> Result<Vec<BatchWemOutput>, String> {
    tokio::task::spawn_blocking(move || {
        inputs
            .into_iter()
            .map(|input| match bank::to_wem(&input.data, None) {
                Ok(wem) => BatchWemOutput {
                    name: input.name,
                    data_base64: Some(base64::engine::general_purpose::STANDARD.encode(wem)),
                    error: None,
                },
                Err(error) => BatchWemOutput {
                    name: input.name,
                    data_base64: None,
                    error: Some(error),
                },
            })
            .collect()
    })
    .await
    .map_err(|e| format!("batch convert task failed: {e}"))
}

/// Decode a WEM, MP3, OGG, FLAC or WAV to WAV bytes, base64 for the IPC boundary.
#[tauri::command]
pub async fn audio_decode_to_wav(data: Vec<u8>) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let pcm = bank::wem_to_pcm(&data).or_else(|_| decode::decode_any(&data))?;
        Ok(base64::engine::general_purpose::STANDARD.encode(bank::pcm_to_wav(&pcm)))
    })
    .await
    .map_err(|e| format!("decode task failed: {e}"))?
}

/// Write raw bytes to a path, creating parent directories.
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

/// Amplify a WEM by gain_db, re-encoding into the codec it already used.
#[tauri::command]
pub async fn audio_amplify_wem(data: Vec<u8>, gain_db: f32) -> Result<Vec<u8>, String> {
    tokio::task::spawn_blocking(move || bank::amplify_wem(&data, gain_db))
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

