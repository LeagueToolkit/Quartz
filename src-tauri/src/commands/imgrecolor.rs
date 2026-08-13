/* Image Recolor backend: decode a .tex/.dds to RGBA for the canvas, write recolored RGBA
back in the file's original format, and scan a directory for image files. Heavy texture
work lives in quartz_lib::tex; these commands just bridge the filesystem and base64. */

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodedTexture {
    pub width: u32,
    pub height: u32,
    pub format: String,
    // RGBA8 pixels, base64-encoded for transport to the canvas.
    pub rgba: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedImage {
    pub path: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
}

const IMAGE_EXTENSIONS: &[&str] = &["tex", "dds", "png", "jpg", "jpeg"];

/* Decode a TEX/DDS file at `path` into RGBA8 plus its format tag (e.g. "tex:bc3"). The
frontend hands the tag back to imgrecolor_save_texture so the write preserves the
original container/format. */
#[tauri::command]
pub async fn imgrecolor_decode_texture(path: String) -> Result<DecodedTexture, String> {
    // Decode + base64 of a multi-MB RGBA buffer must not run on the main thread,
    // or a large texture freezes the whole window while it works.
    tokio::task::spawn_blocking(move || {
        let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read {path}: {e}"))?;
        let decoded = quartz_lib::tex::decode_texture(&bytes)?;
        Ok::<_, String>(DecodedTexture {
            width: decoded.width,
            height: decoded.height,
            format: decoded.format,
            rgba: base64::engine::general_purpose::STANDARD.encode(&decoded.rgba),
        })
    })
    .await
    .map_err(|e| format!("Decode task failed to join: {e}"))?
}

/* Decode `path` and return it as a PNG no larger than `max_dimension` on its long edge.

For the selection grid, which only ever displays a small preview, this replaces decoding a
full-resolution texture, base64-encoding the whole RGBA buffer and rebuilding it pixel by
pixel in JS. The downscale happens before encoding, so what crosses the bridge is a small
PNG rather than megabytes of raw pixels. Returned as raw IPC bytes (the same approach the
WAD explorer's preview uses) so nothing is serialized as JSON. */
#[tauri::command]
pub async fn imgrecolor_thumbnail(
    path: String,
    max_dimension: u32,
) -> Result<tauri::ipc::Response, String> {
    let png = tokio::task::spawn_blocking(move || {
        let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read {path}: {e}"))?;
        quartz_lib::tex::decode_to_png_sized(&bytes, max_dimension)
    })
    .await
    .map_err(|e| format!("Thumbnail task failed to join: {e}"))??;
    Ok(tauri::ipc::Response::new(png))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecolorBatchArgs {
    pub paths: Vec<String>,
    pub target_hue: f64,
    pub saturation_boost: f64,
    pub lightness_adjust: f64,
    pub opacity: f64,
    pub preserve_original_colors: bool,
    // 256-entry Value-channel tone curve LUT; omitted/None means identity.
    #[serde(default)]
    pub curve: Option<Vec<u8>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecolorBatchResult {
    pub saved: usize,
    // (path, error) for each file that could not be recolored.
    pub failures: Vec<(String, String)>,
}

/* Recolor every path in place, in parallel.

Saving used to run entirely in the frontend: for each file it decoded the texture over IPC
as base64, rebuilt the buffer character by character, looped the pixels in JS, base64'd the
result and sent it back, one file at a time on the main thread. The pixels never needed to
leave Rust, and the files have no reason to be done one at a time. */
#[tauri::command]
pub async fn imgrecolor_recolor_batch(
    args: RecolorBatchArgs,
) -> Result<RecolorBatchResult, String> {
    tokio::task::spawn_blocking(move || {
        let params = quartz_lib::tex::RecolorParams {
            target_hue: args.target_hue,
            saturation_boost: args.saturation_boost,
            lightness_adjust: args.lightness_adjust,
            opacity: args.opacity,
            preserve_original_colors: args.preserve_original_colors,
            curve: args.curve,
        };
        let failures = quartz_lib::tex::recolor_files(&args.paths, &params);
        RecolorBatchResult {
            saved: args.paths.len() - failures.len(),
            failures,
        }
    })
    .await
    .map_err(|e| format!("Recolor task failed to join: {e}"))
}

/* Fade black to transparent across `paths`, in place and in parallel.

A standalone operation rather than part of the recolor: it is a one-off fix for textures
authored against an additive blend mode, not something wanted on every save. */
#[tauri::command]
pub async fn imgrecolor_black_to_alpha(paths: Vec<String>) -> Result<RecolorBatchResult, String> {
    tokio::task::spawn_blocking(move || {
        let failures = quartz_lib::tex::black_to_alpha_files(&paths);
        RecolorBatchResult {
            saved: paths.len() - failures.len(),
            failures,
        }
    })
    .await
    .map_err(|e| format!("Black-to-alpha task failed to join: {e}"))
}

/* Return the subset of `paths` whose textures carry real color.

Filter Grayscale used to answer this in the frontend: decode every file, base64 the whole
RGBA buffer, ship it over IPC, decode that string one character at a time in JS, then read
a handful of pixels and throw the buffer away. The pixels never needed to leave Rust. Here
the files are examined in parallel and only the matching paths come back. */
#[tauri::command]
pub async fn imgrecolor_filter_colored(paths: Vec<String>) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || quartz_lib::tex::filter_colored_textures(paths))
        .await
        .map_err(|e| format!("Filter task failed to join: {e}"))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTextureArgs {
    pub path: String,
    pub width: u32,
    pub height: u32,
    // RGBA8 pixels, base64-encoded.
    pub rgba: String,
    // Format tag from imgrecolor_decode_texture; defaults to "tex:bc3" if empty.
    pub format: String,
}

/* Overwrite `path` with the recolored RGBA, re-encoded into `format`. Matches the Electron
build's format-preserving save (TEX → same TexFormat, DDS → same DDS format). */
#[tauri::command]
pub fn imgrecolor_save_texture(args: SaveTextureArgs) -> Result<(), String> {
    let rgba = base64::engine::general_purpose::STANDARD
        .decode(args.rgba.as_bytes())
        .map_err(|e| format!("Invalid RGBA base64: {e}"))?;

    let format = if args.format.is_empty() {
        "tex:bc3"
    } else {
        &args.format
    };
    let bytes = quartz_lib::tex::encode_texture(rgba, args.width, args.height, format)?;

    std::fs::write(&args.path, bytes).map_err(|e| format!("Failed to write {}: {e}", args.path))
}

fn ext_of(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
}

/* List image files under `dir`, optionally recursing. Mirrors the Electron scanDirectory:
returns every .tex/.dds/.png/.jpg/.jpeg found. */
#[tauri::command]
pub fn imgrecolor_scan_dir(dir: String, recursive: bool) -> Result<Vec<ScannedImage>, String> {
    let mut out = Vec::new();
    scan_into(Path::new(&dir), recursive, &mut out);
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

fn scan_into(dir: &Path, recursive: bool, out: &mut Vec<ScannedImage>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if recursive {
                scan_into(&path, recursive, out);
            }
        } else if path.is_file() {
            let ext = ext_of(&path);
            if IMAGE_EXTENSIONS.contains(&ext.as_str()) {
                let name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();
                out.push(ScannedImage {
                    path: path.to_string_lossy().into_owned(),
                    name,
                    kind: ext,
                });
            }
        }
    }
}
