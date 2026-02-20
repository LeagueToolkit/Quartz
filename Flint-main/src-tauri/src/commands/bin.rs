use crate::core::bin::{bin_to_json, bin_to_text, json_to_bin, read_bin, text_to_bin, write_bin};
use crate::state::HashtableState;
use serde::{Deserialize, Serialize};
use tauri::State;
use std::fs;
use std::path::Path;

/// Metadata information about a bin file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinInfo {
    pub entry_count: usize,
    pub version: u32,
}

/// Converts a binary .bin file to Python-like text format (.py)
///
/// # Arguments
/// * `input_path` - Path to the input .bin file
/// * `output_path` - Path to the output .py file
/// * `state` - The managed HashtableState for hash resolution
///
/// # Returns
/// * `Result<(), String>` - Ok if conversion succeeded, error message otherwise
#[tauri::command]
pub async fn convert_bin_to_text(
    input_path: String,
    output_path: String,
    state: State<'_, HashtableState>,
) -> Result<(), String> {
    tracing::info!("Converting bin to text: {} -> {}", input_path, output_path);
    
    // Validate input path
    if input_path.is_empty() {
        tracing::error!("Input path cannot be empty");
        return Err("Input path cannot be empty".to_string());
    }
    if output_path.is_empty() {
        tracing::error!("Output path cannot be empty");
        return Err("Output path cannot be empty".to_string());
    }

    let input = Path::new(&input_path);
    if !input.exists() {
        tracing::error!("Input file does not exist: {}", input_path);
        return Err(format!("Input file does not exist: {}", input_path));
    }

    // Read the binary file
    let data = fs::read(input)
        .map_err(|e| {
            tracing::error!("Failed to read input file '{}': {}", input_path, e);
            format!("Failed to read input file '{}': {}", input_path, e)
        })?;

    tracing::debug!("Read {} bytes from {}", data.len(), input_path);

    // Parse the bin file
    let bin = read_bin(&data)
        .map_err(|e| {
            tracing::error!("Failed to parse bin file '{}': {}", input_path, e);
            format!("Failed to parse bin file '{}': {}", input_path, e)
        })?;

    tracing::debug!("Parsed bin file with {} objects", bin.objects.len());

    // Get hashtable for resolution (lazy loaded on first use)
    let hashtable = state.get_hashtable();
    let hashtable_ref = hashtable.as_ref().map(|h| h.as_ref());

    // Convert to text format
    let text = bin_to_text(&bin, hashtable_ref)
        .map_err(|e| {
            tracing::error!("Failed to convert to text: {}", e);
            format!("Failed to convert to text: {}", e)
        })?;

    // Write to output file
    fs::write(&output_path, text)
        .map_err(|e| {
            tracing::error!("Failed to write output file '{}': {}", output_path, e);
            format!("Failed to write output file '{}': {}", output_path, e)
        })?;

    tracing::info!("Successfully converted bin to text: {}", output_path);

    Ok(())
}

/// Converts a binary .bin file to JSON format (.json)
///
/// # Arguments
/// * `input_path` - Path to the input .bin file
/// * `output_path` - Path to the output .json file
/// * `state` - The managed HashtableState for hash resolution
///
/// # Returns
/// * `Result<(), String>` - Ok if conversion succeeded, error message otherwise
#[tauri::command]
pub async fn convert_bin_to_json(
    input_path: String,
    output_path: String,
    state: State<'_, HashtableState>,
) -> Result<(), String> {
    // Validate input path
    if input_path.is_empty() {
        return Err("Input path cannot be empty".to_string());
    }
    if output_path.is_empty() {
        return Err("Output path cannot be empty".to_string());
    }

    let input = Path::new(&input_path);
    if !input.exists() {
        return Err(format!("Input file does not exist: {}", input_path));
    }

    // Read the binary file
    let data = fs::read(input)
        .map_err(|e| format!("Failed to read input file: {}", e))?;

    // Parse the bin file
    let bin = read_bin(&data)
        .map_err(|e| format!("Failed to parse bin file: {}", e))?;

    // Get hashtable for resolution (lazy loaded on first use)
    let hashtable = state.get_hashtable();
    let hashtable_ref = hashtable.as_ref().map(|h| h.as_ref());

    // Convert to JSON format
    let json = bin_to_json(&bin, hashtable_ref)
        .map_err(|e| format!("Failed to convert to JSON: {}", e))?;

    // Write to output file
    fs::write(&output_path, json)
        .map_err(|e| format!("Failed to write output file: {}", e))?;

    Ok(())
}

/// Converts a Python-like text format (.py) to binary .bin file
///
/// # Arguments
/// * `input_path` - Path to the input .py file
/// * `output_path` - Path to the output .bin file
/// * `state` - The managed HashtableState for string-to-hash conversion
///
/// # Returns
/// * `Result<(), String>` - Ok if conversion succeeded, error message otherwise
#[tauri::command]
pub async fn convert_text_to_bin(
    input_path: String,
    output_path: String,
    state: State<'_, HashtableState>,
) -> Result<(), String> {
    tracing::info!("Converting text to bin: {} -> {}", input_path, output_path);
    
    // Validate input path
    if input_path.is_empty() {
        tracing::error!("Input path cannot be empty");
        return Err("Input path cannot be empty".to_string());
    }
    if output_path.is_empty() {
        tracing::error!("Output path cannot be empty");
        return Err("Output path cannot be empty".to_string());
    }

    let input = Path::new(&input_path);
    if !input.exists() {
        tracing::error!("Input file does not exist: {}", input_path);
        return Err(format!("Input file does not exist: {}", input_path));
    }

    // Read the text file
    let text = fs::read_to_string(input)
        .map_err(|e| {
            tracing::error!("Failed to read input file '{}': {}", input_path, e);
            format!("Failed to read input file '{}': {}", input_path, e)
        })?;

    tracing::debug!("Read {} characters from {}", text.len(), input_path);

    // Get hashtable for conversion (lazy loaded on first use)
    let hashtable = state.get_hashtable();
    let hashtable_ref = hashtable.as_ref().map(|h| h.as_ref());

    // Parse text to bin
    let bin = text_to_bin(&text, hashtable_ref)
        .map_err(|e| {
            tracing::error!("Failed to parse text from '{}': {}", input_path, e);
            format!("Failed to parse text from '{}': {}", input_path, e)
        })?;

    tracing::debug!("Parsed text to bin with {} objects", bin.objects.len());

    // Convert to binary
    let data = write_bin(&bin)
        .map_err(|e| {
            tracing::error!("Failed to write bin: {}", e);
            format!("Failed to write bin: {}", e)
        })?;

    // Write to output file
    fs::write(&output_path, data)
        .map_err(|e| {
            tracing::error!("Failed to write output file '{}': {}", output_path, e);
            format!("Failed to write output file '{}': {}", output_path, e)
        })?;

    tracing::info!("Successfully converted text to bin: {}", output_path);

    Ok(())
}

/// Converts a JSON format (.json) to binary .bin file
///
/// # Arguments
/// * `input_path` - Path to the input .json file
/// * `output_path` - Path to the output .bin file
/// * `state` - The managed HashtableState for string-to-hash conversion
///
/// # Returns
/// * `Result<(), String>` - Ok if conversion succeeded, error message otherwise
#[tauri::command]
pub async fn convert_json_to_bin(
    input_path: String,
    output_path: String,
    state: State<'_, HashtableState>,
) -> Result<(), String> {
    // Validate input path
    if input_path.is_empty() {
        return Err("Input path cannot be empty".to_string());
    }
    if output_path.is_empty() {
        return Err("Output path cannot be empty".to_string());
    }

    let input = Path::new(&input_path);
    if !input.exists() {
        return Err(format!("Input file does not exist: {}", input_path));
    }

    // Read the JSON file
    let json = fs::read_to_string(input)
        .map_err(|e| format!("Failed to read input file: {}", e))?;

    // Get hashtable for conversion (lazy loaded on first use)
    let hashtable = state.get_hashtable();
    let hashtable_ref = hashtable.as_ref().map(|h| h.as_ref());

    // Parse JSON to bin
    let bin = json_to_bin(&json, hashtable_ref)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    // Convert to binary
    let data = write_bin(&bin)
        .map_err(|e| format!("Failed to write bin: {}", e))?;

    // Write to output file
    fs::write(&output_path, data)
        .map_err(|e| format!("Failed to write output file: {}", e))?;

    Ok(())
}

/// Returns metadata about a bin file
///
/// # Arguments
/// * `input_path` - Path to the .bin file
///
/// # Returns
/// * `Result<BinInfo, String>` - Metadata about the bin file
#[tauri::command]
pub async fn read_bin_info(input_path: String) -> Result<BinInfo, String> {
    // Validate input path
    if input_path.is_empty() {
        return Err("Input path cannot be empty".to_string());
    }

    let input = Path::new(&input_path);
    if !input.exists() {
        return Err(format!("Input file does not exist: {}", input_path));
    }

    // Read the binary file
    let data = fs::read(input)
        .map_err(|e| format!("Failed to read input file: {}", e))?;

    // Parse the bin file
    let bin = read_bin(&data)
        .map_err(|e| format!("Failed to parse bin file: {}", e))?;

    // Return metadata
    Ok(BinInfo {
        entry_count: bin.objects.len(),
        version: 1, // TODO: Extract actual version from bin file if available
    })
}

/// Parses a BIN file and returns Python-like text format for the editor
///
/// # Arguments
/// * `path` - Path to the .bin file
/// * `state` - The managed HashtableState for hash resolution
///
/// # Returns
/// * `Result<String, String>` - Python-like text format for the editor
#[tauri::command]
pub async fn parse_bin_file_to_text(
    path: String,
    _state: State<'_, HashtableState>,
) -> Result<String, String> {
    tracing::info!("Parsing BIN file for editor: {}", path);
    
    // Validate path
    if path.is_empty() {
        return Err("Path cannot be empty".to_string());
    }

    let input = Path::new(&path);
    if !input.exists() {
        return Err(format!("File does not exist: {}", path));
    }

    // Read the binary file
    let data = fs::read(input)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    tracing::debug!("Read {} bytes from {}", data.len(), path);

    // Parse with ritobin_rust
    let bin = crate::core::bin::read_bin_ltk(&data)
        .map_err(|e| format!("Failed to parse bin file: {}", e))?;

    tracing::debug!("Parsed bin file with {} objects", bin.objects.len());

    // Convert to text format using cached hash resolution (faster)
    let text = crate::core::bin::tree_to_text_cached(&bin)
        .map_err(|e| format!("Failed to convert to text: {}", e))?;

    tracing::info!("Successfully parsed BIN file to text ({} chars)", text.len());

    Ok(text)
}

/// Reads a BIN file, using cached .ritobin if available and up-to-date
///
/// This provides fast reopening of BIN files by caching the converted text.
/// If the .ritobin cache doesn't exist or is older than the .bin file, it will
/// be regenerated.
///
/// # Arguments
/// * `bin_path` - Path to the .bin file
///
/// # Returns
/// * `Result<String, String>` - The text content (either from cache or freshly converted)
#[tauri::command]
pub async fn read_or_convert_bin(
    bin_path: String,
    _state: State<'_, HashtableState>,
) -> Result<String, String> {
    tracing::info!("[BIN_READ] === Starting read_or_convert_bin ===");
    tracing::info!("[BIN_READ] Path: {}", bin_path);
    
    if bin_path.is_empty() {
        return Err("Path cannot be empty".to_string());
    }

    let bin_file = Path::new(&bin_path);
    if !bin_file.exists() {
        return Err(format!("File does not exist: {}", bin_path));
    }

    // Log .bin file size
    if let Ok(meta) = fs::metadata(bin_file) {
        tracing::info!("[BIN_READ] .bin file size: {} bytes", meta.len());
    }

    // Check for cached .ritobin file
    let ritobin_path = format!("{}.ritobin", bin_path);
    let ritobin_file = Path::new(&ritobin_path);

    // Check if cache is valid (exists and is newer than .bin)
    if ritobin_file.exists() {
        tracing::info!("[BIN_READ] Cache file exists: {}", ritobin_path);
        
        if let (Ok(bin_meta), Ok(ritobin_meta)) = (fs::metadata(bin_file), fs::metadata(ritobin_file)) {
            tracing::info!("[BIN_READ] Cache file size: {} bytes", ritobin_meta.len());
            
            if let (Ok(bin_time), Ok(ritobin_time)) = (bin_meta.modified(), ritobin_meta.modified()) {
                tracing::info!("[BIN_READ] .bin modified: {:?}", bin_time);
                tracing::info!("[BIN_READ] .ritobin modified: {:?}", ritobin_time);
                
                if ritobin_time >= bin_time {
                    // Cache is valid, read it directly - NO CONVERSION!
                    tracing::info!("[BIN_READ] *** CACHE HIT *** Reading cached file directly");
                    let content = fs::read_to_string(ritobin_file)
                        .map_err(|e| format!("Failed to read cached file: {}", e))?;
                    tracing::info!("[BIN_READ] *** CACHE HIT *** Loaded {} chars from cache", content.len());
                    return Ok(content);
                } else {
                    tracing::info!("[BIN_READ] Cache is STALE (bin is newer)");
                }
            }
        }
    } else {
        tracing::info!("[BIN_READ] No cache file found");
    }

    // Cache miss or stale - need to convert
    tracing::warn!("[BIN_READ] *** CACHE MISS *** Converting BIN file...");
    
    // Read and parse the binary file
    let data = fs::read(bin_file)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    tracing::info!("[BIN_READ] Read {} bytes from .bin file", data.len());

    tracing::info!("[BIN_READ] Parsing BIN structure...");
    let bin = crate::core::bin::read_bin_ltk(&data)
        .map_err(|e| format!("Failed to parse bin file: {}", e))?;
    tracing::info!("[BIN_READ] Parsed: {} objects, {} dependencies", bin.objects.len(), bin.dependencies.len());

    tracing::info!("[BIN_READ] Converting to text (using cached hashes)...");
    let text = crate::core::bin::tree_to_text_cached(&bin)
        .map_err(|e| format!("Failed to convert to text: {}", e))?;
    tracing::info!("[BIN_READ] Converted to {} chars of text", text.len());

    // Cache the result
    if let Err(e) = fs::write(&ritobin_path, &text) {
        tracing::warn!("[BIN_READ] Failed to cache .ritobin file: {}", e);
    } else {
        tracing::info!("[BIN_READ] Wrote cache file: {}", ritobin_path);
    }

    tracing::info!("[BIN_READ] === Completed (converted) ===");
    Ok(text)
}

/// Saves edited ritobin content back to both .bin and .ritobin files
///
/// # Arguments
/// * `bin_path` - Path to the .bin file
/// * `content` - The edited text content
///
/// # Returns
/// * `Result<(), String>` - Ok if save succeeded
#[tauri::command]
pub async fn save_ritobin_to_bin(
    bin_path: String,
    content: String,
    _state: State<'_, HashtableState>,
) -> Result<(), String> {
    tracing::info!("Saving ritobin content to: {}", bin_path);
    
    if bin_path.is_empty() {
        return Err("Path cannot be empty".to_string());
    }

    // Parse the text content back to BIN structure
    let bin = crate::core::bin::text_to_tree(&content)
        .map_err(|e| format!("Failed to parse text content: {}", e))?;

    // Convert to binary format
    let binary_data = crate::core::bin::write_bin_ltk(&bin)
        .map_err(|e| format!("Failed to convert to binary: {}", e))?;

    // Write the .bin file
    fs::write(&bin_path, &binary_data)
        .map_err(|e| format!("Failed to write .bin file: {}", e))?;

    tracing::info!("Saved .bin file: {} ({} bytes)", bin_path, binary_data.len());

    // Update the .ritobin cache
    let ritobin_path = format!("{}.ritobin", bin_path);
    if let Err(e) = fs::write(&ritobin_path, &content) {
        tracing::warn!("Failed to update .ritobin cache: {}", e);
    } else {
        tracing::info!("Updated .ritobin cache: {}", ritobin_path);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_bin_info_serialization() {
        let info = BinInfo {
            entry_count: 10,
            version: 1,
        };

        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("entry_count"));
        assert!(json.contains("10"));
        assert!(json.contains("version"));
        assert!(json.contains("1"));
    }

    #[tokio::test]
    async fn test_read_bin_info_empty_path() {
        let result = read_bin_info("".to_string()).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Input path cannot be empty"));
    }

    #[tokio::test]
    async fn test_read_bin_info_nonexistent_file() {
        let result = read_bin_info("nonexistent.bin".to_string()).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not exist"));
    }
}
