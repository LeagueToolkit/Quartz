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
pub fn imgrecolor_decode_texture(path: String) -> Result<DecodedTexture, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read {path}: {e}"))?;
    let decoded = quartz_lib::tex::decode_texture(&bytes)?;
    Ok(DecodedTexture {
        width: decoded.width,
        height: decoded.height,
        format: decoded.format,
        rgba: base64::engine::general_purpose::STANDARD.encode(&decoded.rgba),
    })
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

    let format = if args.format.is_empty() { "tex:bc3" } else { &args.format };
    let bytes = quartz_lib::tex::encode_texture(rgba, args.width, args.height, format)?;

    std::fs::write(&args.path, bytes).map_err(|e| format!("Failed to write {}: {e}", args.path))
}

fn ext_of(path: &Path) -> String {
    path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase()
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
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if recursive {
                scan_into(&path, recursive, out);
            }
        } else if path.is_file() {
            let ext = ext_of(&path);
            if IMAGE_EXTENSIONS.contains(&ext.as_str()) {
                let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                out.push(ScannedImage {
                    path: path.to_string_lossy().into_owned(),
                    name,
                    kind: ext,
                });
            }
        }
    }
}
