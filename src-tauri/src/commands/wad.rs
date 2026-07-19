/* Generic WAD-reading commands.

Thin wrappers over `quartz_lib::wad`. These cover the primitives the Port
("load donor from game") and Sound Banks ("extract banks from game") flows
build on: find a champion's WAD, read its table of contents, and extract a
chosen set of chunks. Domain-specific orchestration commands live elsewhere
and call `quartz_lib::wad` directly. */

use quartz_lib::wad::{self, ChunkSel, ExtractResult, WadTocEntry};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

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

// ── WAD Explorer ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WadExplorerIndex {
    pub mount_id: u64,
    pub path: String,
    pub name: String,
    pub version: String,
    pub chunk_count: usize,
    pub paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WadExplorerProgress {
    wad_path: String,
    done: u64,
    total: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WadHashExtractResult {
    pub game_hashes: usize,
    pub bin_hashes: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WadPreviewItem {
    pub path_hash: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WadPreparedPreview {
    pub root: String,
    pub primary_path: String,
    pub texture_path: Option<String>,
    pub texture_paths: HashMap<String, String>,
    pub hidden_submeshes: Vec<String>,
    pub model_scale: f32,
    /// Prepared companion `.anm` paths on disk (for the animation viewer).
    pub anm_paths: Vec<String>,
    /// Resolved clips (submesh-visibility events + sequencer queues), anm paths
    /// remapped to the extracted disk files.
    pub anm_clips: Vec<quartz_lib::anim_graph::PreparedClip>,
}

#[tauri::command]
pub async fn wad_explorer_scan(
    game_path: String,
) -> Result<quartz_lib::wad_explorer::ScanResult, String> {
    tokio::task::spawn_blocking(move || {
        quartz_lib::wad_explorer::scan_game_wads(&game_path).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("WAD scan task failed: {e}"))?
}

/// Parse and hash-resolve one archive, but return only its path index. The
/// mounted TOC remains resident so expanding it later is instant.
#[tauri::command]
pub async fn wad_explorer_index(wad_path: String) -> Result<WadExplorerIndex, String> {
    tokio::task::spawn_blocking(move || {
        let mount_id = quartz_lib::wad_explorer::list_mounted()
            .into_iter()
            .find(|m| m.path == wad_path)
            .map(|m| m.id)
            .map(Ok)
            .unwrap_or_else(|| {
                quartz_lib::wad_explorer::mount(&wad_path).map_err(|e| e.to_string())
            })?;
        let entries =
            quartz_lib::wad_explorer::list_entries(mount_id).map_err(|e| e.to_string())?;
        let info = quartz_lib::wad_explorer::list_mounted()
            .into_iter()
            .find(|m| m.id == mount_id)
            .ok_or_else(|| "WAD mount disappeared while indexing".to_string())?;
        Ok(WadExplorerIndex {
            mount_id,
            path: info.path,
            name: info.name,
            version: info.version,
            chunk_count: info.chunk_count,
            paths: entries.into_iter().map(|e| e.path).collect(),
        })
    })
    .await
    .map_err(|e| format!("WAD index task failed: {e}"))?
}

#[tauri::command]
pub async fn wad_explorer_index_many(
    wad_paths: Vec<String>,
) -> Result<Vec<quartz_lib::wad_explorer::BatchMountResult>, String> {
    tokio::task::spawn_blocking(move || quartz_lib::wad_explorer::mount_many(&wad_paths))
        .await
        .map_err(|e| format!("WAD batch index task failed: {e}"))
}

#[tauri::command]
pub async fn wad_explorer_search(
    query: String,
    limit: usize,
) -> Result<quartz_lib::wad_explorer::WadSearchResult, String> {
    tokio::task::spawn_blocking(move || quartz_lib::wad_explorer::search_mounted(&query, limit))
        .await
        .map_err(|e| format!("WAD search task failed: {e}"))
}

#[tauri::command]
pub async fn wad_explorer_entries(
    mount_id: u64,
) -> Result<Vec<quartz_lib::wad_explorer::WadEntry>, String> {
    tokio::task::spawn_blocking(move || {
        quartz_lib::wad_explorer::list_entries(mount_id).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("WAD entry task failed: {e}"))?
}

#[tauri::command]
pub fn wad_explorer_unmount(mount_id: u64) -> bool {
    quartz_lib::wad_explorer::unmount(mount_id)
}

#[tauri::command]
pub fn wad_explorer_unmount_all() -> usize {
    quartz_lib::wad_explorer::unmount_all()
}

#[tauri::command]
pub async fn wad_explorer_texture(
    wad_path: String,
    path_hash: String,
    max_dimension: Option<u32>,
) -> Result<tauri::ipc::Response, String> {
    let png = tokio::task::spawn_blocking(move || {
        let hash =
            quartz_lib::wad_explorer::parse_path_hash(&path_hash).map_err(|e| e.to_string())?;
        let data =
            quartz_lib::wad_explorer::read_chunk(&wad_path, hash).map_err(|e| e.to_string())?;
        quartz_lib::wad_explorer::decode_texture_to_png_sized(&data, max_dimension)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Texture preview task failed: {e}"))??;
    // Raw IPC avoids serializing a multi-megabyte PNG as millions of JSON
    // integers. The frontend receives this directly as an ArrayBuffer.
    Ok(tauri::ipc::Response::new(png))
}

#[tauri::command]
pub async fn wad_explorer_text(
    wad_path: String,
    path_hash: String,
    extension: String,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let hash =
            quartz_lib::wad_explorer::parse_path_hash(&path_hash).map_err(|e| e.to_string())?;
        let data =
            quartz_lib::wad_explorer::read_chunk(&wad_path, hash).map_err(|e| e.to_string())?;
        quartz_lib::wad_explorer::decode_chunk_to_text(&data, &extension).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Text preview task failed: {e}"))?
}

#[tauri::command]
pub async fn wad_explorer_extract(
    app: AppHandle,
    wad_path: String,
    hashes: Vec<String>,
    output_dir: String,
    replace_existing: bool,
    preserve_paths: bool,
) -> Result<quartz_lib::wad_explorer::ExtractResult, String> {
    let parsed = hashes
        .iter()
        .map(|h| quartz_lib::wad_explorer::parse_path_hash(h).map_err(|e| e.to_string()))
        .collect::<Result<Vec<_>, _>>()?;
    let progress_path = wad_path.clone();
    tokio::task::spawn_blocking(move || {
        let progress_app = app.clone();
        let callback = move |done: u64, total: u64| {
            let _ = progress_app.emit(
                "wad-explorer-progress",
                WadExplorerProgress {
                    wad_path: progress_path.clone(),
                    done,
                    total,
                },
            );
        };
        quartz_lib::wad_explorer::extract_selected_with_options(
            &wad_path,
            &parsed,
            &output_dir,
            replace_existing,
            preserve_paths,
            Some(&callback),
        )
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("WAD extraction task failed: {e}"))?
}

#[tauri::command]
pub async fn wad_explorer_extract_hashes(wad_path: String) -> Result<WadHashExtractResult, String> {
    tokio::task::spawn_blocking(move || {
        let (game_hashes, bin_hashes) = quartz_lib::wad_tools::extract_hashes(Path::new(&wad_path))
            .map_err(|e| e.to_string())?;
        Ok(WadHashExtractResult {
            game_hashes,
            bin_hashes,
        })
    })
    .await
    .map_err(|e| format!("Hash extraction task failed: {e}"))?
}

/// Extract the small companion set needed by the shared model renderer to an
/// isolated temp folder and return native disk paths to the chosen model and
/// texture.
#[tauri::command]
pub async fn wad_explorer_prepare_model(
    wad_path: String,
    files: Vec<WadPreviewItem>,
    primary_path: String,
    texture_path: Option<String>,
) -> Result<WadPreparedPreview, String> {
    tokio::task::spawn_blocking(move || {
        if files.is_empty() {
            return Err("No model preview files were selected".to_string());
        }
        let cache = std::env::temp_dir().join("quartz-wad-preview");
        let _ = std::fs::remove_dir_all(&cache);
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|v| v.as_millis())
            .unwrap_or_default();
        let root = cache.join(stamp.to_string());
        std::fs::create_dir_all(&root).map_err(|e| format!("Create preview folder: {e}"))?;

        let normalize = |path: &str| {
            path.replace('\\', "/")
                .trim_start_matches('/')
                .to_ascii_lowercase()
        };
        let by_path: HashMap<String, &WadPreviewItem> = files
            .iter()
            .map(|item| (normalize(&item.path), item))
            .collect();

        // Parse ALL candidate skin bins and resolve against their combined entry
        // set. A skin's StaticMaterialDefs (that base/override Material links
        // point to) often live in a linked bin, not the one holding
        // SkinCharacterDataProperties; resolving a single bin then mis-binds the
        // base texture. Combining matches the Asset Extractor's correct result.
        let parsed_bins: Vec<quartz_lib::bin::Bin> = files
            .iter()
            .filter(|item| item.path.to_ascii_lowercase().ends_with(".bin"))
            .filter_map(|item| {
                let hash = quartz_lib::wad_explorer::parse_path_hash(&item.path_hash).ok()?;
                let bytes = quartz_lib::wad_explorer::read_chunk(&wad_path, hash).ok()?;
                quartz_lib::bin::read_bin(&bytes).ok()
            })
            .collect();
        // Champion data bins hold every skin's SkinCharacterDataProperties, so
        // resolve the SCDP for THIS skin (derived from the skn path) instead of
        // the first one. `assets/characters/x/skins/base/x.skn` -> skin0;
        // `.../skins/skinNN/...` -> skinNN.
        let skin_data_path = skin_data_path_from_model(&normalize(&primary_path));
        let definition = match &skin_data_path {
            Some(p) => quartz_lib::skin_preview::resolve_skin_preview_for(&parsed_bins, p),
            None => quartz_lib::skin_preview::resolve_skin_preview_combined(&parsed_bins),
        };

        let authored_primary = definition
            .as_ref()
            .and_then(|value| value.simple_skin.as_deref())
            .and_then(|path| by_path.get(&normalize(path)).copied());
        let primary_item = authored_primary
            .or_else(|| by_path.get(&normalize(&primary_path)).copied())
            .ok_or_else(|| format!("Model is not present in this WAD: {primary_path}"))?;

        let mut texture_items: HashMap<String, &WadPreviewItem> = HashMap::new();
        if let Some(value) = definition.as_ref() {
            if let Some(path) = value.base_texture.as_deref() {
                if let Some(item) = by_path.get(&normalize(path)).copied() {
                    texture_items.insert("*".to_string(), item);
                }
            }
            for (submesh, path) in &value.texture_overrides {
                if let Some(item) = by_path.get(&normalize(path)).copied() {
                    texture_items.insert(submesh.clone(), item);
                }
            }
        }
        // Legacy/non-skin fallback: retain the nearby texture selected by the
        // UI only when the BIN did not provide a base material.
        if !texture_items.contains_key("*") {
            if let Some(path) = texture_path.as_deref() {
                if let Some(item) = by_path.get(&normalize(path)).copied() {
                    texture_items.insert("*".to_string(), item);
                }
            }
        }

        let mut wanted: HashSet<String> = HashSet::new();
        wanted.insert(normalize(&primary_item.path));
        wanted.extend(texture_items.values().map(|item| normalize(&item.path)));

        // Extract the companion skeleton (.skl, needed to animate the mesh). It
        // sits beside the .skn.
        let primary_dir = {
            let p = normalize(&primary_item.path);
            p.rfind('/').map(|i| p[..i].to_string()).unwrap_or_default()
        };
        for item in &files {
            let norm = normalize(&item.path);
            let in_dir = norm.rfind('/').map(|i| &norm[..i]) == Some(primary_dir.as_str());
            if norm.ends_with(".skl") && in_dir {
                wanted.insert(norm);
            }
        }

        // Animations: resolve the skin's real `.anm` clips from the bins, not by
        // directory scan. A skin's SkinAnimationProperties links an
        // AnimationGraphData entry (often in `data/characters/<champ>/animations/
        // skinN.bin`, already in `parsed_bins`), whose clips reference `.anm` under
        // whatever folder the game authored (frequently the BASE skin's Animations
        // folder, not this skin's). Reading refs from the merged bins picks those up;
        // a directory scan of the skin folder would miss every base-shared clip.
        let mut anm_norms: Vec<String> = Vec::new();
        {
            // Every .anm ref authored across all parsed data bins, deduped.
            let mut refs: Vec<String> = Vec::new();
            let mut seen_ref = HashSet::new();
            for parsed in &parsed_bins {
                for r in quartz_lib::skin_preview::resolve_animations(parsed) {
                    let n = normalize(&r);
                    if seen_ref.insert(n.clone()) {
                        refs.push(n);
                    }
                }
            }
            // Match each ref to a real WAD entry (exact, else by path tail).
            let mut seen_anm = HashSet::new();
            for r in &refs {
                let matched = by_path.get(r).map(|i| normalize(&i.path)).or_else(|| {
                    files
                        .iter()
                        .map(|i| normalize(&i.path))
                        .find(|n| n.ends_with(r) || r.ends_with(n.as_str()))
                });
                if let Some(n) = matched {
                    if seen_anm.insert(n.clone()) {
                        wanted.insert(n.clone());
                        anm_norms.push(n);
                    }
                }
            }
            // Fallback: if the bins yielded no refs (unresolved/hash-only), extract
            // any .anm candidates the frontend supplied (old directory-scan behavior).
            if anm_norms.is_empty() {
                for item in &files {
                    let norm = normalize(&item.path);
                    if norm.ends_with(".anm") {
                        wanted.insert(norm.clone());
                        anm_norms.push(norm);
                    }
                }
            }
        }

        for item in files
            .iter()
            .filter(|item| wanted.contains(&normalize(&item.path)))
        {
            let hash = quartz_lib::wad_explorer::parse_path_hash(&item.path_hash)
                .map_err(|e| e.to_string())?;
            let data =
                quartz_lib::wad_explorer::read_chunk(&wad_path, hash).map_err(|e| e.to_string())?;
            let output = safe_preview_path(&root, &item.path);
            if let Some(parent) = output.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("Create preview path: {e}"))?;
            }
            std::fs::write(&output, data).map_err(|e| format!("Write preview file: {e}"))?;
        }

        let primary = safe_preview_path(&root, &primary_item.path);
        if !primary.is_file() {
            return Err(format!(
                "Prepared model was not written: {}",
                primary.display()
            ));
        }
        let texture_paths: HashMap<String, String> = texture_items
            .into_iter()
            .filter_map(|(submesh, item)| {
                let path = safe_preview_path(&root, &item.path);
                path.is_file()
                    .then(|| (submesh, path.to_string_lossy().into_owned()))
            })
            .collect();
        let texture = texture_paths.get("*").cloned();
        let hidden_submeshes = definition
            .as_ref()
            .map(|value| value.hidden_submeshes.clone())
            .unwrap_or_default();
        let model_scale = definition
            .as_ref()
            .map(|value| value.skin_scale)
            .unwrap_or(1.0);
        // Prepared .anm paths that actually landed on disk, plus a normalized-ref
        // -> disk-path map for remapping the clip graph's ASSETS refs.
        let mut anm_paths: Vec<String> = Vec::new();
        let mut anm_disk: HashMap<String, String> = HashMap::new();
        for norm in &anm_norms {
            if let Some(item) = by_path.get(norm) {
                let p = safe_preview_path(&root, &item.path);
                if p.is_file() {
                    let disk = p.to_string_lossy().into_owned();
                    anm_paths.push(disk.clone());
                    anm_disk.insert(norm.clone(), disk);
                }
            }
        }
        // Map an ASSETS/... .anm ref to its extracted disk path (exact, else tail).
        let ref_to_disk = |asset_ref: &str| -> Option<String> {
            let n = normalize(asset_ref);
            anm_disk.get(&n).cloned().or_else(|| {
                anm_disk
                    .iter()
                    .find(|(k, _)| k.ends_with(&n) || n.ends_with(k.as_str()))
                    .map(|(_, v)| v.clone())
            })
        };
        // Resolve the clip graph and remap anm refs to disk. Keeps clips whose anm
        // (or a sequencer member's) actually landed on disk.
        let anm_clips = quartz_lib::anim_graph::prepare_clips(
            quartz_lib::anim_graph::resolve_clip_graph(&parsed_bins),
            ref_to_disk,
        );
        Ok(WadPreparedPreview {
            root: root.to_string_lossy().into_owned(),
            primary_path: primary.to_string_lossy().into_owned(),
            texture_path: texture,
            texture_paths,
            hidden_submeshes,
            model_scale,
            anm_paths,
            anm_clips,
        })
    })
    .await
    .map_err(|e| format!("Model preparation task failed: {e}"))?
}

/// Derive the skin's data path (the SCDP entry key) from an assets skn path.
/// `assets/characters/aatrox/skins/base/aatrox.skn` -> `characters/aatrox/skins/skin0`;
/// `assets/characters/lux/skins/skin29/chibi.skn` -> `characters/lux/skins/skin29`.
fn skin_data_path_from_model(normalized_skn: &str) -> Option<String> {
    let n = normalized_skn.replace('\\', "/");
    let idx = n.find("/characters/").or_else(|| n.strip_prefix("characters/").map(|_| 0))?;
    let after = if n.starts_with("characters/") { &n[..] } else { &n[idx + 1..] };
    // after starts at "characters/<champ>/skins/<folder>/..."
    let parts: Vec<&str> = after.split('/').collect();
    let ci = parts.iter().position(|p| p.eq_ignore_ascii_case("characters"))?;
    if parts.len() <= ci + 3 || !parts[ci + 2].eq_ignore_ascii_case("skins") {
        return None;
    }
    let champ = parts[ci + 1];
    let folder = parts[ci + 3].to_ascii_lowercase();
    // The assets folder uses a zero-padded skin id ("Skin01") but the data-side
    // SCDP path uses the bare number ("Skin1"). Normalize to the bare number so
    // the entry hash matches. Base == Skin0.
    let skin = if folder == "base" {
        "skin0".to_string()
    } else if let Some(digits) = folder.strip_prefix("skin") {
        let n: u32 = digits.parse().ok()?;
        format!("skin{n}")
    } else {
        return None;
    };
    Some(format!("characters/{}/skins/{}", champ.to_lowercase(), skin))
}

fn safe_preview_path(root: &Path, asset_path: &str) -> PathBuf {
    let mut path = root.to_path_buf();
    for component in Path::new(&asset_path.replace('\\', "/")).components() {
        if let std::path::Component::Normal(segment) = component {
            path.push(segment);
        }
    }
    path
}
