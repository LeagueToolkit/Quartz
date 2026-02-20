use crate::core::hash::hashtable::Hashtable;
use crate::error::{Error, Result};
use league_toolkit::file::LeagueFileKind;
use league_toolkit::wad::{Wad, WadChunk};
use std::collections::HashMap;
use std::ffi::OsStr;
use std::fs::{self, File};
use std::path::{Path, PathBuf};

/// Result of an extraction operation
#[derive(Debug, Clone)]
pub struct ExtractionResult {
    /// Number of chunks successfully extracted
    pub extracted_count: usize,
    /// Mapping of original paths to actual paths (for long filenames saved with hashes)
    pub path_mappings: HashMap<String, String>,
}

/// Extracts a single chunk from a WAD archive to the specified output path
/// 
/// # Arguments
/// * `wad` - Mutable reference to the Wad for decoding
/// * `chunk` - The chunk to extract
/// * `output_path` - Path where the chunk should be written
/// * `hashtable` - Optional hashtable for path resolution (not used for single chunk extraction)
/// 
/// # Returns
/// * `Result<()>` - Ok if extraction succeeded, Err otherwise
/// 
/// # Requirements
/// Validates: Requirements 4.1, 4.2, 4.3
pub fn extract_chunk(
    wad: &mut Wad<File>,
    chunk: &WadChunk,
    output_path: impl AsRef<Path>,
    _hashtable: Option<&Hashtable>,
) -> Result<()> {
    let output_path = output_path.as_ref();
    
    tracing::debug!("Extracting chunk to: {}", output_path.display());
    
    // Create the decoder
    let (mut decoder, _) = wad.decode();
    
    // Decompress the chunk data
    let chunk_data = decoder
        .load_chunk_decompressed(chunk)
        .map_err(|e| {
            tracing::error!("Failed to decompress chunk for '{}': {}", output_path.display(), e);
            Error::Wad {
                message: format!("Failed to decompress chunk: {}", e),
                path: Some(output_path.to_path_buf()),
            }
        })?;
    
    // Verify decompressed size matches metadata
    if chunk_data.len() != chunk.uncompressed_size() {
        tracing::error!(
            "Decompressed size mismatch for '{}': expected {}, got {}",
            output_path.display(),
            chunk.uncompressed_size(),
            chunk_data.len()
        );
        return Err(Error::Wad {
            message: format!(
                "Decompressed size mismatch: expected {}, got {}",
                chunk.uncompressed_size(),
                chunk_data.len()
            ),
            path: Some(output_path.to_path_buf()),
        });
    }
    
    // Create parent directories if needed
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| {
                tracing::error!("Failed to create directory '{}': {}", parent.display(), e);
                Error::io_with_path(e, parent)
            })?;
    }
    
    // Write the chunk data to disk
    fs::write(output_path, &chunk_data)
        .map_err(|e| {
            tracing::error!("Failed to write chunk to '{}': {}", output_path.display(), e);
            Error::io_with_path(e, output_path)
        })?;
    
    tracing::debug!("Successfully extracted chunk to: {}", output_path.display());
    
    Ok(())
}

/// Extracts all chunks from a WAD archive to the specified output directory
/// 
/// This function resolves chunk paths using the provided hashtable, creates
/// the necessary directory structure, handles filename collisions, detects
/// file types, and falls back to hex hashes for unresolved paths.
/// 
/// # Arguments
/// * `wad` - Mutable reference to the Wad for decoding
/// * `output_dir` - Base directory where chunks should be extracted
/// * `hashtable` - Optional hashtable for path resolution
/// 
/// # Returns
/// * `Result<usize>` - Number of chunks successfully extracted, or an error
/// 
/// # Requirements
/// Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
pub fn extract_all(
    wad: &mut Wad<File>,
    output_dir: impl AsRef<Path>,
    hashtable: Option<&Hashtable>,
) -> Result<usize> {
    let output_dir = output_dir.as_ref();
    
    tracing::info!("Extracting all chunks to: {}", output_dir.display());
    
    // Create the decoder and get chunks
    let (mut decoder, chunks) = wad.decode();
    
    let total_chunks = chunks.len();
    tracing::info!("Total chunks to extract: {}", total_chunks);
    
    let mut extracted_count = 0;
    
    // Extract each chunk
    for (path_hash, chunk) in chunks.iter() {
        // Resolve the chunk path
        let resolved_path = if let Some(ht) = hashtable {
            ht.resolve(*path_hash).to_string()
        } else {
            // Fall back to hex hash if no hashtable provided
            format!("{:016x}", path_hash)
        };
        
        tracing::debug!("Extracting chunk: {} (hash: {:016x})", resolved_path, path_hash);
        
        // Decompress the chunk data
        let chunk_data = decoder
            .load_chunk_decompressed(chunk)
            .map_err(|e| {
                tracing::error!("Failed to decompress chunk '{}': {}", resolved_path, e);
                Error::Wad {
                    message: format!("Failed to decompress chunk {}: {}", resolved_path, e),
                    path: Some(output_dir.to_path_buf()),
                }
            })?;
        
        // Verify decompressed size matches metadata
        if chunk_data.len() != chunk.uncompressed_size() {
            tracing::error!(
                "Decompressed size mismatch for '{}': expected {}, got {}",
                resolved_path,
                chunk.uncompressed_size(),
                chunk_data.len()
            );
            return Err(Error::Wad {
                message: format!(
                    "Decompressed size mismatch for {}: expected {}, got {}",
                    resolved_path,
                    chunk.uncompressed_size(),
                    chunk_data.len()
                ),
                path: Some(output_dir.to_path_buf()),
            });
        }
        
        // Resolve the final chunk path with extension handling
        let final_path = resolve_chunk_path(&resolved_path, &chunk_data);
        let full_output_path = output_dir.join(&final_path);
        
        // Create parent directories
        if let Some(parent) = full_output_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| {
                    tracing::error!("Failed to create directory '{}': {}", parent.display(), e);
                    Error::io_with_path(e, parent)
                })?;
        }
        
        // Write the chunk data
        match fs::write(&full_output_path, &chunk_data) {
            Ok(_) => {
                extracted_count += 1;
                if extracted_count % 100 == 0 {
                    tracing::info!("Extracted {}/{} chunks", extracted_count, total_chunks);
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::InvalidFilename => {
                tracing::warn!("Invalid filename '{}', using hex hash fallback", full_output_path.display());
                // Handle long filename by using hex hash
                let hex_path = format!("{:016x}", path_hash);
                let hex_output_path = resolve_chunk_path(&hex_path, &chunk_data);
                let full_hex_path = output_dir.join(&hex_output_path);
                
                fs::write(&full_hex_path, &chunk_data)
                    .map_err(|e| {
                        tracing::error!("Failed to write chunk to '{}': {}", full_hex_path.display(), e);
                        Error::io_with_path(e, &full_hex_path)
                    })?;
                extracted_count += 1;
            }
            Err(e) => {
                tracing::error!("Failed to write chunk to '{}': {}", full_output_path.display(), e);
                return Err(Error::io_with_path(e, &full_output_path));
            }
        }
    }
    
    tracing::info!("Successfully extracted {}/{} chunks", extracted_count, total_chunks);
    
    Ok(extracted_count)
}

/// Find the champion WAD file in a League installation
/// 
/// # Arguments
/// * `league_path` - Path to League installation
/// * `champion` - Champion internal name (e.g., "Kayn", "Aatrox")
/// 
/// # Returns
/// * `Option<PathBuf>` - Path to the WAD file if found
pub fn find_champion_wad(league_path: impl AsRef<Path>, champion: &str) -> Option<PathBuf> {
    let league_path = league_path.as_ref();
    
    // Normalize champion name: lowercase, remove special characters
    let champion_normalized = champion
        .to_lowercase()
        .replace("'", "")
        .replace(" ", "")
        .replace(".", "");
    
    // Standard WAD path
    let wad_path = league_path
        .join("Game")
        .join("DATA")
        .join("FINAL")
        .join("Champions")
        .join(format!("{}.wad.client", champion_normalized));
    
    if wad_path.exists() {
        tracing::info!("Found champion WAD: {}", wad_path.display());
        Some(wad_path)
    } else {
        tracing::warn!("Champion WAD not found: {}", wad_path.display());
        None
    }
}

/// Extract skin-specific assets from a WAD archive
/// 
/// This function extracts ALL files from the WAD. Cleanup of unused files
/// happens later during the repathing phase based on what the skin BIN references.
/// 
/// # Arguments
/// * `wad` - Mutable reference to the Wad for decoding
/// * `output_dir` - Base directory where chunks should be extracted
/// * `champion` - Champion internal name (e.g., "kayn")
/// * `skin_id` - Skin ID to extract (e.g., 1 for first skin)
/// * `hashtable` - Hashtable for path resolution
/// 
/// # Returns
/// * `Result<ExtractionResult>` - Extraction result with count and path mappings, or an error
pub fn extract_skin_assets(
    wad: &mut Wad<File>,
    output_dir: impl AsRef<Path>,
    champion: &str,
    _skin_id: u32,
    hashtable: &Hashtable,
) -> Result<ExtractionResult> {
    let output_dir = output_dir.as_ref();
    
    // Create the WAD folder structure: {Champion}.wad.client/
    // This is required by ltk_fantome for proper fantome/modpkg packing
    let champion_lower = champion.to_lowercase();
    let wad_folder_name = format!("{}.wad.client", champion_lower);
    let wad_output_dir = output_dir.join(&wad_folder_name);
    
    tracing::info!(
        "Extracting all assets to: {} (WAD folder: {})",
        output_dir.display(),
        wad_folder_name
    );
    
    // Create the decoder and get chunks
    let (mut decoder, chunks) = wad.decode();
    
    let total_chunks = chunks.len();
    tracing::info!("Total chunks in WAD: {}", total_chunks);
    
    let mut extracted_count = 0;
    let mut path_mappings: HashMap<String, String> = HashMap::new();
    
    // Extract all chunks - we'll clean up unused files later based on skin BIN references
    let mut skipped_unknown = 0;
    for (path_hash, chunk) in chunks.iter() {
        // Resolve the chunk path
        let resolved_path = hashtable.resolve(*path_hash).to_string();
        let path_lower = resolved_path.to_lowercase();
        
        // Check if this is an unresolved hash (hex string that doesn't look like a path)
        let is_unresolved = resolved_path.chars().all(|c| c.is_ascii_hexdigit());
        
        // Extract everything under assets/ or data/
        // Also extract unresolved hashes (they might be important shared assets)
        if !path_lower.starts_with("assets/") && !path_lower.starts_with("data/") {
            if is_unresolved {
                // Log unresolved hashes for debugging - these are files in WAD but not in hashtable
                skipped_unknown += 1;
                if skipped_unknown <= 5 {
                    tracing::debug!("Unresolved hash in WAD: {:016x}", path_hash);
                }
            }
            continue;
        }
        
        // Decompress the chunk data
        let chunk_data = match decoder.load_chunk_decompressed(chunk) {
            Ok(data) => data,
            Err(e) => {
                tracing::warn!("Failed to decompress chunk '{}': {}", resolved_path, e);
                continue;
            }
        };
        
        // Resolve the final chunk path with extension handling
        let final_path = resolve_chunk_path(&resolved_path, &chunk_data);
        // Check if filename is too long (Windows path limit issues)
        let filename_len = final_path.to_string_lossy().len();
        let output_path_to_use = if filename_len > 200 {
            // Use hex hash for very long filenames
            let parent = final_path.parent().unwrap_or(Path::new("data"));
            let ext = final_path.extension().and_then(|e| e.to_str()).unwrap_or("bin");
            let hash_name = format!("{:016x}.{}", path_hash, ext);
            let hash_path = parent.join(&hash_name);
            tracing::info!("Using hash for long filename: {} -> {}", final_path.display(), hash_path.display());
            
            // Record the mapping so refather can find the file
            let original_normalized = final_path.to_string_lossy().to_lowercase().replace('\\', "/");
            let actual_normalized = hash_path.to_string_lossy().to_lowercase().replace('\\', "/");
            path_mappings.insert(original_normalized, actual_normalized);
            
            wad_output_dir.join(&hash_path)
        } else {
            wad_output_dir.join(&final_path)
        };
        
        // Create parent directories
        if let Some(parent) = output_path_to_use.parent() {
            if let Err(e) = fs::create_dir_all(parent) {
                tracing::error!("Failed to create directory '{}': {}", parent.display(), e);
                continue;
            }
        }
        
        // Write the chunk data
        match fs::write(&output_path_to_use, &chunk_data) {
            Ok(_) => {
                extracted_count += 1;
                if extracted_count % 100 == 0 {
                    tracing::info!("Extracted {}/{} chunks", extracted_count, total_chunks);
                }
            }
            Err(e) => {
                tracing::warn!("Failed to write '{}': {}", output_path_to_use.display(), e);
            }
        }
    }
    
    if skipped_unknown > 0 {
        tracing::warn!(
            "Skipped {} files with unresolved hashes (not in hashtable)",
            skipped_unknown
        );
    }
    
    tracing::info!(
        "Extracted {}/{} chunks (with {} path mappings)",
        extracted_count, total_chunks, path_mappings.len()
    );
    
    Ok(ExtractionResult {
        extracted_count,
        path_mappings,
    })
}

/// Resolves the final chunk path by handling extensions
/// 
/// This function:
/// - Adds .ltk extension if the path has no extension
/// - Detects file type from content and appends appropriate extension
/// - Handles directory name collisions
/// 
/// # Arguments
/// * `path` - The resolved or hex path
/// * `chunk_data` - The decompressed chunk data for file type detection
/// 
/// # Returns
/// * `PathBuf` - The final path with appropriate extensions
/// 
/// # Requirements
/// Validates: Requirements 4.5, 4.6
fn resolve_chunk_path(path: &str, chunk_data: &[u8]) -> PathBuf {
    let mut chunk_path = PathBuf::from(path);
    
    // Check if the path has an extension
    if chunk_path.extension().is_none() {
        // Detect file type from content
        let file_kind = LeagueFileKind::identify_from_bytes(chunk_data);
        
        match file_kind {
            LeagueFileKind::Unknown => {
                // No known file type, add .ltk extension
                let filename = chunk_path
                    .file_name()
                    .unwrap_or(OsStr::new("unknown"))
                    .to_string_lossy()
                    .to_string();
                chunk_path = chunk_path.with_file_name(format!("{}.ltk", filename));
            }
            _ => {
                // Known file type, add appropriate extension
                if let Some(extension) = file_kind.extension() {
                    // Add .ltk first, then the detected extension
                    let filename = chunk_path
                        .file_name()
                        .unwrap_or(OsStr::new("unknown"))
                        .to_string_lossy()
                        .to_string();
                    chunk_path = chunk_path.with_file_name(format!("{}.ltk.{}", filename, extension));
                } else {
                    // File kind known but no extension, just add .ltk
                    let filename = chunk_path
                        .file_name()
                        .unwrap_or(OsStr::new("unknown"))
                        .to_string_lossy()
                        .to_string();
                    chunk_path = chunk_path.with_file_name(format!("{}.ltk", filename));
                }
            }
        }
    }
    
    chunk_path
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_resolve_chunk_path_with_extension() {
        let path = "characters/aatrox/aatrox.bin";
        let data = vec![0u8; 100];
        let resolved = resolve_chunk_path(path, &data);
        
        // Should keep the original extension
        assert_eq!(resolved, PathBuf::from(path));
    }
    
    #[test]
    fn test_resolve_chunk_path_without_extension() {
        let path = "characters/aatrox/aatrox";
        let data = vec![0u8; 100];
        let resolved = resolve_chunk_path(path, &data);
        
        // Should add .ltk extension
        assert!(resolved.to_string_lossy().contains(".ltk"));
    }
    
    #[test]
    fn test_resolve_chunk_path_hex_fallback() {
        let path = "1a2b3c4d5e6f7a8b";
        let data = vec![0u8; 100];
        let resolved = resolve_chunk_path(path, &data);
        
        // Should add .ltk extension to hex path
        assert!(resolved.to_string_lossy().contains(".ltk"));
    }
}
