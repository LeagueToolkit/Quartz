/* Generic WAD-reading commands.

Thin wrappers over `quartz_lib::wad`. These cover the primitives the Port
("load donor from game") and Sound Banks ("extract banks from game") flows
build on: find a champion's WAD, read its table of contents, and extract a
chosen set of chunks. Domain-specific orchestration commands live elsewhere
and call `quartz_lib::wad` directly. */

use quartz_lib::wad::{self, ChunkSel, ExtractResult, WadTocEntry};
use std::path::PathBuf;

/// Locate a champion's main WAD inside a League install.
/// Returns the absolute WAD path, or `None` when it isn't present.
#[tauri::command]
pub fn wad_find_champion(league_path: String, champion: String) -> Option<String> {
    wad::find_champion_wad(&PathBuf::from(league_path), &champion)
        .map(|p| p.to_string_lossy().into_owned())
}

/// List a champion's voice-over WADs (per-locale archives) in a League install.
#[tauri::command]
pub fn wad_list_voiceovers(league_path: String, champion: String) -> Vec<String> {
    wad::list_voiceover_wads(&PathBuf::from(league_path), &champion)
        .into_iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

/// Read a WAD's table of contents, resolving chunk path hashes to real paths.
#[tauri::command]
pub fn wad_read_toc(wad_path: String) -> Result<Vec<WadTocEntry>, String> {
    wad::read_wad_toc(&PathBuf::from(wad_path)).map_err(|e| e.to_string())
}

/// Decompress a single chunk and return its raw bytes (base64-friendly on the
/// JS side via the byte array). `hash` is the 16-char hex path hash.
#[tauri::command]
pub fn wad_read_chunk(wad_path: String, hash: String) -> Result<Vec<u8>, String> {
    let path_hash = parse_hash(&hash)?;
    wad::read_chunk_by_hash(&PathBuf::from(wad_path), path_hash).map_err(|e| e.to_string())
}

/// Extract the named chunks to `out_dir`. `hashes` are 16-char hex path hashes.
/// With `preserve_paths` set, files land under their resolved relative paths;
/// otherwise they're written flat under their hash.
#[tauri::command]
pub fn wad_extract_chunks(
    wad_path: String,
    hashes: Vec<String>,
    out_dir: String,
    preserve_paths: bool,
) -> Result<ExtractResult, String> {
    let selected: Vec<ChunkSel> = hashes
        .iter()
        .map(|h| parse_hash(h).map(|path_hash| ChunkSel { path_hash }))
        .collect::<Result<_, _>>()?;

    wad::extract_selected(
        &PathBuf::from(wad_path),
        &selected,
        &PathBuf::from(out_dir),
        preserve_paths,
    )
    .map_err(|e| e.to_string())
}

fn parse_hash(hash: &str) -> Result<u64, String> {
    u64::from_str_radix(hash.trim_start_matches("0x"), 16)
        .map_err(|_| format!("invalid path hash: {}", hash))
}
