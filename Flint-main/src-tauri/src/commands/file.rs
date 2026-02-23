use base64::{engine::general_purpose::STANDARD, Engine};
use ltk_file::LeagueFileKind;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;
use image::{RgbaImage, Rgba};
use ltk_texture::Texture;
use std::io::Cursor;

/// Information about a file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub path: String,
    pub size: u64,
    pub file_type: String,
    pub extension: String,
    /// For images: width x height
    pub dimensions: Option<(u32, u32)>,
}

/// Result of decoding a DDS file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecodedImage {
    /// Base64-encoded PNG data
    pub data: String,
    pub width: u32,
    pub height: u32,
    pub format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecolorFolderResult {
    pub processed: u32,
    pub failed: u32,
}

// =============================================================================
// HSL Color Transformation Helpers
// =============================================================================

fn rgb_to_hsl(r: f32, g: f32, b: f32) -> (f32, f32, f32) {
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let l = (max + min) / 2.0;

    if max == min {
        return (0.0, 0.0, l);
    }

    let d = max - min;
    let s = if l > 0.5 { d / (2.0 - max - min) } else { d / (max + min) };

    let mut h = if max == r {
        (g - b) / d + (if g < b { 6.0 } else { 0.0 })
    } else if max == g {
        (b - r) / d + 2.0
    } else {
        (r - g) / d + 4.0
    };
    h /= 6.0;

    (h * 360.0, s, l)
}

fn hue_to_rgb(p: f32, q: f32, mut t: f32) -> f32 {
    if t < 0.0 { t += 1.0; }
    if t > 1.0 { t -= 1.0; }
    if t < 1.0/6.0 { return p + (q - p) * 6.0 * t; }
    if t < 1.0/2.0 { return q; }
    if t < 2.0/3.0 { return p + (q - p) * (2.0/3.0 - t) * 6.0; }
    p
}

fn hsl_to_rgb(h: f32, s: f32, l: f32) -> (f32, f32, f32) {
    if s == 0.0 {
        return (l, l, l);
    }

    let q = if l < 0.5 { l * (1.0 + s) } else { l + s - l * s };
    let p = 2.0 * l - q;

    let h = h / 360.0;
    let r = hue_to_rgb(p, q, h + 1.0/3.0);
    let g = hue_to_rgb(p, q, h);
    let b = hue_to_rgb(p, q, h - 1.0/3.0);

    (r, g, b)
}

fn apply_hsl_to_image(img: &mut RgbaImage, hue_shift: f32, sat_mult: f32, bri_mult: f32) {
    for pixel in img.pixels_mut() {
        let Rgba([r, g, b, a]) = *pixel;
        
        // Convert to normalized float
        let rf = r as f32 / 255.0;
        let gf = g as f32 / 255.0;
        let bf = b as f32 / 255.0;
        
        // Convert to HSL
        let (h, s, l) = rgb_to_hsl(rf, gf, bf);
        
        // Apply shifts/multipliers
        let new_h = (h + hue_shift) % 360.0;
        let new_h = if new_h < 0.0 { new_h + 360.0 } else { new_h };
        let new_s = (s * sat_mult).clamp(0.0, 1.0);
        let new_l = (l * bri_mult).clamp(0.0, 1.0);
        
        // Convert back to RGB
        let (nr, ng, nb) = hsl_to_rgb(new_h, new_s, new_l);
        
        // Update pixel
        *pixel = Rgba([
            (nr * 255.0).round() as u8,
            (ng * 255.0).round() as u8,
            (nb * 255.0).round() as u8,
            a
        ]);
    }
}

/// Colorize mode: Set all pixels to a target hue while preserving lightness
/// This makes everything "one color" while keeping the original shading
/// Skips transparent pixels and very dark/black pixels to preserve backgrounds
fn colorize_image_impl(img: &mut RgbaImage, target_hue: f32, preserve_saturation: bool) {
    for pixel in img.pixels_mut() {
        let Rgba([r, g, b, a]) = *pixel;
        
        // Skip fully transparent pixels (preserve alpha)
        if a == 0 {
            continue;
        }
        
        // Convert to normalized float
        let rf = r as f32 / 255.0;
        let gf = g as f32 / 255.0;
        let bf = b as f32 / 255.0;
        
        // Convert to HSL
        let (_h, s, l) = rgb_to_hsl(rf, gf, bf);
        
        // Skip very dark pixels (black backgrounds) - threshold at ~10% lightness
        if l < 0.10 {
            continue;
        }
        
        // Skip very light pixels (pure white areas) - optional, keep for now
        // if l > 0.95 { continue; }
        
        // Set to target hue, optionally preserve original saturation
        let new_s = if preserve_saturation { s } else { 0.7_f32.min(s.max(0.3)) };
        
        // Convert back to RGB with target hue
        let (nr, ng, nb) = hsl_to_rgb(target_hue, new_s, l);
        
        // Update pixel (alpha is preserved)
        *pixel = Rgba([
            (nr * 255.0).round() as u8,
            (ng * 255.0).round() as u8,
            (nb * 255.0).round() as u8,
            a
        ]);
    }
}

/// Detect file type from extension and magic bytes using league-toolkit's LeagueFileKind
fn detect_file_type(path: &Path, data: &[u8]) -> (String, String) {
    let extension = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    // Use league-toolkit's file identification for known LoL formats
    let ltk_kind = LeagueFileKind::identify_from_bytes(data);

    // Map LeagueFileKind to MIME-like types
    let file_type = match ltk_kind {
        LeagueFileKind::PropertyBin | LeagueFileKind::PropertyBinOverride => {
            "application/x-bin".to_string()
        }
        LeagueFileKind::Texture => "image/tex".to_string(),
        LeagueFileKind::TextureDds => "image/dds".to_string(),
        LeagueFileKind::SimpleSkin => "model/x-lol-skn".to_string(),
        LeagueFileKind::Skeleton => "model/x-lol-skl".to_string(),
        LeagueFileKind::Animation => "animation/x-lol-anm".to_string(),
        LeagueFileKind::Png => "image/png".to_string(),
        LeagueFileKind::Jpeg => "image/jpeg".to_string(),
        LeagueFileKind::WwiseBank => "audio/x-wwise-bnk".to_string(),
        LeagueFileKind::WwisePackage => "audio/x-wwise-wpk".to_string(),
        LeagueFileKind::MapGeometry => "model/x-lol-mapgeo".to_string(),
        LeagueFileKind::WorldGeometry => "model/x-lol-wgeo".to_string(),
        LeagueFileKind::StaticMeshAscii => "model/x-lol-sco".to_string(),
        LeagueFileKind::StaticMeshBinary => "model/x-lol-scb".to_string(),
        LeagueFileKind::RiotStringTable => "text/x-stringtable".to_string(),
        LeagueFileKind::LightGrid => "application/x-lightgrid".to_string(),
        LeagueFileKind::Preload => "application/x-preload".to_string(),
        LeagueFileKind::LuaObj => "application/x-luaobj".to_string(),
        LeagueFileKind::Tga => "image/tga".to_string(),
        LeagueFileKind::Svg => "image/svg+xml".to_string(),
        LeagueFileKind::Unknown => {
            // Fall back to extension-based detection for unknown formats
            match extension.as_str() {
                "dds" => "image/dds".to_string(),
                "tex" => "image/tex".to_string(),
                "png" => "image/png".to_string(),
                "jpg" | "jpeg" => "image/jpeg".to_string(),
                "bin" => "application/x-bin".to_string(),
                "py" | "ritobin" => "text/x-python".to_string(),
                "json" => "application/json".to_string(),
                "txt" => "text/plain".to_string(),
                "lua" => "text/x-lua".to_string(),
                "xml" => "application/xml".to_string(),
                "wav" | "ogg" | "mp3" => "audio".to_string(),
                "skn" | "skl" | "anm" => "model".to_string(),
                _ => "application/octet-stream".to_string(),
            }
        }
    };

    (file_type, extension)
}

/// Read raw file bytes from disk
///
/// # Arguments
/// * `path` - Path to the file
///
/// # Returns
/// * `Ok(Vec<u8>)` - File contents as bytes
/// * `Err(String)` - Error message
#[tauri::command]
pub async fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    let path = Path::new(&path);

    if !path.exists() {
        return Err(format!("File not found: {}", path.display()));
    }

    fs::read(path).map_err(|e| format!("Failed to read file: {}", e))
}

/// Get file metadata and type information
///
/// # Arguments
/// * `path` - Path to the file
///
/// # Returns
/// * `Ok(FileInfo)` - File metadata
/// * `Err(String)` - Error message
#[tauri::command]
pub async fn read_file_info(path: String) -> Result<FileInfo, String> {
    let path_buf = std::path::PathBuf::from(&path);

    if !path_buf.exists() {
        return Err(format!("File not found: {}", path));
    }

    let metadata = fs::metadata(&path_buf).map_err(|e| format!("Failed to read metadata: {}", e))?;

    // Read first few bytes for magic detection
    let data = fs::read(&path_buf).map_err(|e| format!("Failed to read file: {}", e))?;

    let (file_type, extension) = detect_file_type(&path_buf, &data);

    // Try to get dimensions for texture files (DDS and TEX)
    let dimensions = if file_type == "image/dds" || file_type == "image/tex" {
        parse_texture_dimensions(&data).ok()
    } else {
        None
    };

    Ok(FileInfo {
        path,
        size: metadata.len(),
        file_type,
        extension,
        dimensions,
    })
}

/// Parse texture dimensions using ltk_texture (handles both DDS and TEX)
fn parse_texture_dimensions(data: &[u8]) -> Result<(u32, u32), String> {
    use ltk_texture::Texture;
    use std::io::Cursor;

    let mut cursor = Cursor::new(data);
    let texture = Texture::from_reader(&mut cursor)
        .map_err(|e| format!("Failed to parse texture: {:?}", e))?;

    Ok((texture.width(), texture.height()))
}

/// Shared decode logic: take raw DDS/TEX bytes and produce a base64-encoded PNG.
fn decode_texture_bytes_impl(data: &[u8]) -> Result<DecodedImage, String> {
    if data.len() < 4 {
        return Err("Data too small to be a valid texture".to_string());
    }

    let mut cursor = Cursor::new(data);
    let texture = Texture::from_reader(&mut cursor)
        .map_err(|e| format!("Failed to parse texture: {:?}", e))?;

    let width = texture.width();
    let height = texture.height();

    let surface = texture
        .decode_mipmap(0)
        .map_err(|e| format!("Failed to decode texture: {:?}", e))?;

    let rgba_image = surface
        .into_rgba_image()
        .map_err(|e| format!("Failed to convert to RGBA: {:?}", e))?;

    let format = match &data[0..4] {
        [0x54, 0x45, 0x58, 0x00] => "TEX",
        [0x44, 0x44, 0x53, 0x20] => "DDS",
        _ => "Unknown",
    };

    let mut png_data = Vec::new();
    {
        use image::ImageEncoder;
        let encoder = image::codecs::png::PngEncoder::new(&mut png_data);
        encoder
            .write_image(rgba_image.as_raw(), width, height, image::ExtendedColorType::Rgba8)
            .map_err(|e| format!("Failed to encode PNG: {}", e))?;
    }

    Ok(DecodedImage {
        data: STANDARD.encode(&png_data),
        width,
        height,
        format: format.to_string(),
    })
}

/// Decode a DDS or TEX texture file to base64-encoded PNG
///
/// # Arguments
/// * `path` - Path to the texture file (DDS or TEX)
///
/// # Returns
/// * `Ok(DecodedImage)` - Base64 PNG data with dimensions
/// * `Err(String)` - Error message
#[tauri::command]
pub async fn decode_dds_to_png(path: String) -> Result<DecodedImage, String> {
    let data = fs::read(&path).map_err(|e| format!("Failed to read texture file: {}", e))?;
    decode_texture_bytes_impl(&data)
}

/// Decode raw DDS/TEX bytes (already in memory) to base64-encoded PNG.
///
/// Used by the WAD browser for in-memory preview — no intermediate disk file needed.
///
/// # Arguments
/// * `data` - Raw decompressed DDS or TEX bytes
///
/// # Returns
/// * `Ok(DecodedImage)` - Base64 PNG data with width/height
/// * `Err(String)` - Error message
#[tauri::command]
pub async fn decode_bytes_to_png(data: Vec<u8>) -> Result<DecodedImage, String> {
    decode_texture_bytes_impl(&data)
}



/// Read text file content with encoding detection
///
/// # Arguments
/// * `path` - Path to the text file
///
/// # Returns
/// * `Ok(String)` - File content as string
/// * `Err(String)` - Error message
#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    let path = Path::new(&path);

    if !path.exists() {
        return Err(format!("File not found: {}", path.display()));
    }

    fs::read_to_string(path).map_err(|e| format!("Failed to read file: {}", e))
}

/// Recolor a single texture file (DDS or TEX)
#[tauri::command]
pub async fn recolor_image(
    path: String,
    hue: f32,
    saturation: f32,
    brightness: f32,
) -> Result<(), String> {
    recolor_single_file(&path, hue, saturation, brightness).await
}

/// Helper to recolor a single file
async fn recolor_single_file(
    path: &str,
    hue: f32,
    saturation: f32,
    brightness: f32,
) -> Result<(), String> {
    let path_buf = PathBuf::from(path);
    if !path_buf.exists() {
        return Err(format!("File not found: {}", path));
    }

    let data = fs::read(&path_buf).map_err(|e| format!("Failed to read file: {}", e))?;
    if data.len() < 4 {
        return Err("File too small".into());
    }

    let is_tex = &data[0..4] == b"TEX\0";
    let is_dds = &data[0..4] == b"DDS ";

    if !is_tex && !is_dds {
        return Err("Not a supported texture format (DDS or TEX)".into());
    }

    // Decode using ltk_texture
    let mut cursor = Cursor::new(&data);
    let texture = Texture::from_reader(&mut cursor)
        .map_err(|e| format!("Failed to parse texture: {:?}", e))?;

    // Decode top mipmap
    let surface = texture.decode_mipmap(0)
        .map_err(|e| format!("Failed to decode mipmap: {:?}", e))?;
    
    let mut rgba_img = surface.into_rgba_image()
        .map_err(|e| format!("Failed to get RGBA image: {:?}", e))?;

    // Apply HSL transform
    apply_hsl_to_image(&mut rgba_img, hue, saturation, brightness);

    // Save back to original file
    match texture {
        Texture::Tex(tex) => {
            use ltk_texture::tex::EncodeOptions;
            let options = EncodeOptions::new(tex.format).with_mipmaps();
            let new_tex = ltk_texture::Tex::encode_rgba_image(&rgba_img, options)
                .map_err(|e| format!("Failed to encode TEX: {:?}", e))?;
            
            let mut output = fs::File::create(&path_buf).map_err(|e| format!("Failed to create output file: {}", e))?;
            new_tex.write(&mut output).map_err(|e| format!("Failed to write TEX: {}", e))?;
        }
        Texture::Dds(mut _dds) => {
            // Re-parse with ddsfile to get header info and encode with image_dds
            let mut cursor = Cursor::new(&data);
            let dds = ddsfile::Dds::read(&mut cursor).map_err(|e| format!("Failed to parse DDS: {}", e))?;
            
            // Try to match format
            let format = if let Some(fourcc) = dds.header.spf.fourcc {
                if fourcc.0 == u32::from_le_bytes(*b"DXT1") {
                    image_dds::ImageFormat::BC1RgbaUnorm
                } else {
                    // DXT5 and other formats default to BC3
                    image_dds::ImageFormat::BC3RgbaUnorm
                }
            } else {
                image_dds::ImageFormat::Bgra8Unorm
            };

            let new_dds = image_dds::dds_from_image(
                &rgba_img,
                format,
                image_dds::Quality::Normal,
                image_dds::Mipmaps::GeneratedAutomatic,
            ).map_err(|e| format!("Failed to encode DDS: {:?}", e))?;

            let mut output = fs::File::create(&path_buf).map_err(|e| format!("Failed to create output file: {}", e))?;
            new_dds.write(&mut output).map_err(|e| format!("Failed to write DDS: {}", e))?;
        }
    }

    Ok(())
}

/// Recolor all texture files in a folder recursively
#[tauri::command]
pub async fn recolor_folder(
    path: String,
    hue: f32,
    saturation: f32,
    brightness: f32,
    skip_distortion: Option<bool>,
) -> Result<RecolorFolderResult, String> {
    let root = PathBuf::from(&path);
    if !root.exists() || !root.is_dir() {
        return Err("Invalid folder path".into());
    }

    let should_skip_distortion = skip_distortion.unwrap_or(true);
    let mut processed = 0;
    let mut failed = 0;

    for entry in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() {
            let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_lowercase();
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or_default().to_lowercase();
            
            // Skip distortion/distort textures - they use special UV effects
            if should_skip_distortion && (filename.contains("distortion") || filename.contains("distort")) {
                tracing::debug!("Skipping distortion texture: {}", path.display());
                continue;
            }
            
            if ext == "dds" || ext == "tex" {
                match recolor_single_file(&path.to_string_lossy(), hue, saturation, brightness).await {
                    Ok(_) => processed += 1,
                    Err(e) => {
                        tracing::warn!("Failed to recolor {}: {}", path.display(), e);
                        failed += 1;
                    }
                }
            }
        }
    }

    Ok(RecolorFolderResult { processed, failed })
}

/// Colorize a single texture file - set all pixels to target hue
#[tauri::command]
pub async fn colorize_image(
    path: String,
    target_hue: f32,
    preserve_saturation: bool,
) -> Result<(), String> {
    colorize_single_file(&path, target_hue, preserve_saturation).await
}

/// Helper to colorize a single file
async fn colorize_single_file(
    path: &str,
    target_hue: f32,
    preserve_saturation: bool,
) -> Result<(), String> {
    let path_buf = PathBuf::from(path);
    if !path_buf.exists() {
        return Err(format!("File not found: {}", path));
    }

    let data = fs::read(&path_buf).map_err(|e| format!("Failed to read file: {}", e))?;
    if data.len() < 4 {
        return Err("File too small".into());
    }

    let is_tex = &data[0..4] == b"TEX\0";
    let is_dds = &data[0..4] == b"DDS ";

    if !is_tex && !is_dds {
        return Err("Not a supported texture format (DDS or TEX)".into());
    }

    // Decode using ltk_texture
    let mut cursor = Cursor::new(&data);
    let texture = Texture::from_reader(&mut cursor)
        .map_err(|e| format!("Failed to parse texture: {:?}", e))?;

    // Decode top mipmap
    let surface = texture.decode_mipmap(0)
        .map_err(|e| format!("Failed to decode mipmap: {:?}", e))?;
    
    let mut rgba_img = surface.into_rgba_image()
        .map_err(|e| format!("Failed to get RGBA image: {:?}", e))?;

    // Apply colorize transform
    colorize_image_impl(&mut rgba_img, target_hue, preserve_saturation);

    // Save back to original file
    match texture {
        Texture::Tex(tex) => {
            use ltk_texture::tex::EncodeOptions;
            let options = EncodeOptions::new(tex.format).with_mipmaps();
            let new_tex = ltk_texture::Tex::encode_rgba_image(&rgba_img, options)
                .map_err(|e| format!("Failed to encode TEX: {:?}", e))?;
            
            let mut output = fs::File::create(&path_buf).map_err(|e| format!("Failed to create output file: {}", e))?;
            new_tex.write(&mut output).map_err(|e| format!("Failed to write TEX: {}", e))?;
        }
        Texture::Dds(mut _dds) => {
            // Re-parse with ddsfile to get header info and encode with image_dds
            let mut cursor = Cursor::new(&data);
            let dds = ddsfile::Dds::read(&mut cursor).map_err(|e| format!("Failed to parse DDS: {}", e))?;
            
            // Try to match format
            let format = if let Some(fourcc) = dds.header.spf.fourcc {
                if fourcc.0 == u32::from_le_bytes(*b"DXT1") {
                    image_dds::ImageFormat::BC1RgbaUnorm
                } else {
                    // DXT5 and other formats default to BC3
                    image_dds::ImageFormat::BC3RgbaUnorm
                }
            } else {
                image_dds::ImageFormat::Bgra8Unorm
            };

            let new_dds = image_dds::dds_from_image(
                &rgba_img,
                format,
                image_dds::Quality::Normal,
                image_dds::Mipmaps::GeneratedAutomatic,
            ).map_err(|e| format!("Failed to encode DDS: {:?}", e))?;

            let mut output = fs::File::create(&path_buf).map_err(|e| format!("Failed to create output file: {}", e))?;
            new_dds.write(&mut output).map_err(|e| format!("Failed to write DDS: {}", e))?;
        }
    }

    Ok(())
}

/// Colorize all texture files in a folder recursively
#[tauri::command]
pub async fn colorize_folder(
    path: String,
    target_hue: f32,
    preserve_saturation: bool,
    skip_distortion: Option<bool>,
) -> Result<RecolorFolderResult, String> {
    let root = PathBuf::from(&path);
    if !root.exists() || !root.is_dir() {
        return Err("Invalid folder path".into());
    }

    let should_skip_distortion = skip_distortion.unwrap_or(true);
    let mut processed = 0;
    let mut failed = 0;

    for entry in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() {
            let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_lowercase();
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or_default().to_lowercase();
            
            // Skip distortion/distort textures - they use special UV effects
            if should_skip_distortion && (filename.contains("distortion") || filename.contains("distort")) {
                tracing::debug!("Skipping distortion texture: {}", path.display());
                continue;
            }
            
            if ext == "dds" || ext == "tex" {
                match colorize_single_file(&path.to_string_lossy(), target_hue, preserve_saturation).await {
                    Ok(_) => processed += 1,
                    Err(e) => {
                        tracing::warn!("Failed to colorize {}: {}", path.display(), e);
                        failed += 1;
                    }
                }
            }
        }
    }

    Ok(RecolorFolderResult { processed, failed })
}
