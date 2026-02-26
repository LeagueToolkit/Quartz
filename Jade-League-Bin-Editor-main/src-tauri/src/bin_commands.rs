use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use crate::core::bin::{read_bin_ltk, tree_to_text_cached, text_to_tree, write_bin_ltk, BinTree};
use std::fs;

#[derive(Debug, Serialize, Deserialize)]
pub struct BinInfo {
    pub success: bool,
    pub message: String,
    pub data: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BatchConvertResult {
    pub path: String,
    pub success: bool,
    pub content: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn convert_bin_to_text(input_path: String) -> Result<BinInfo, String> {
    let data = std::fs::read(&input_path)
        .map_err(|e| format!("Failed to read input file: {}", e))?;

    let text = convert_bin_data_to_text(&data)?;

    Ok(BinInfo {
        success: true,
        message: format!("Converted: {}", input_path),
        data: Some(text),
    })
}

#[tauri::command]
pub async fn convert_text_to_bin(text_content: String, output_path: String) -> Result<BinInfo, String> {
    // Debug: Log the first 200 chars safely
    let preview: String = text_content.chars().take(200).collect();
    println!("[convert_text_to_bin] Parsing {} bytes, preview:\n{}", text_content.len(), preview);
    
    // Parse the ritobin text to BinTree
    let tree = text_to_tree(&text_content)
        .map_err(|e| format!("Failed to parse ritobin text: {}", e))?;
    
    println!("[convert_text_to_bin] Parsed successfully: {} objects", tree.objects.len());
    
    // Write to binary
    let bin_data = write_bin_ltk(&tree)
        .map_err(|e| format!("Failed to write binary: {}", e))?;
    
    std::fs::write(&output_path, &bin_data)
        .map_err(|e| format!("Failed to write output file: {}", e))?;
    
    Ok(BinInfo {
        success: true,
        message: format!("Saved: {}", output_path),
        data: None,
    })
}

/// Batch convert multiple bin files to text.
/// Uses cached hash provider for fast conversion.
#[tauri::command]
pub async fn batch_convert_bins(input_paths: Vec<String>) -> Result<Vec<BatchConvertResult>, String> {
    if input_paths.is_empty() {
        return Ok(vec![]);
    }
    
    let start = std::time::Instant::now();
    println!("[BatchConvert] Converting {} files", input_paths.len());
    
    let mut results = Vec::with_capacity(input_paths.len());
    
    for path in input_paths {
        let result = convert_single_bin(&path);
        results.push(result);
    }
    
    println!("[BatchConvert] Completed {} files in {:?}", results.len(), start.elapsed());
    
    Ok(results)
}

/// Convert a single bin file
fn convert_single_bin(input_path: &str) -> BatchConvertResult {
    // Read file
    let data = match std::fs::read(input_path) {
        Ok(d) => d,
        Err(e) => return BatchConvertResult {
            path: input_path.to_string(),
            success: false,
            content: None,
            error: Some(format!("Failed to read file: {}", e)),
        },
    };
    
    // Convert using the cached hash provider
    match convert_bin_data_to_text(&data) {
        Ok(text) => BatchConvertResult {
            path: input_path.to_string(),
            success: true,
            content: Some(text),
            error: None,
        },
        Err(e) => BatchConvertResult {
            path: input_path.to_string(),
            success: false,
            content: None,
            error: Some(e),
        },
    }
}

/// Convert bin data to text using ltk_meta/ltk_ritobin with cached hashes
fn convert_bin_data_to_text(bin_data: &[u8]) -> Result<String, String> {
    // Check if the data is UTF-8 text
    if let Ok(text) = std::str::from_utf8(bin_data) {
        let trimmed = text.trim_start();
        
        // Already in ritobin text format
        if trimmed.starts_with("#PROP") || trimmed.starts_with("#PTCH") {
            return Ok(text.to_string());
        }
        
        // JSON format (BinTree serialized)
        if trimmed.starts_with('{') {
            let tree: BinTree = serde_json::from_str(text)
                .map_err(|e| format!("Failed to parse JSON: {}", e))?;
            return tree_to_text_cached(&tree)
                .map_err(|e| format!("Failed to convert to text: {}", e));
        }
        
        // Check for ritobin text format without header
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with("//") {
                continue;
            }
            if line.contains(':') && line.contains('=') {
                let tree = text_to_tree(text)
                    .map_err(|e| format!("Failed to parse text: {}", e))?;
                return tree_to_text_cached(&tree)
                    .map_err(|e| format!("Failed to convert to text: {}", e));
            }
            break;
        }
    }
    
    // Binary format - use ltk_bridge
    let tree = read_bin_ltk(bin_data)
        .map_err(|e| format!("Failed to parse BIN: {}", e))?;
    
    tree_to_text_cached(&tree)
        .map_err(|e| format!("Failed to convert to text: {}", e))
}

/// Searches for a bin file by name in the DATA folder hierarchy.
/// Starts from the given base directory and searches recursively.
#[tauri::command]
pub async fn find_linked_bin_file(base_directory: String, file_name: String) -> Result<Option<String>, String> {
    let base_path = Path::new(&base_directory);
    
    // Look for DATA folder in the path hierarchy
    let data_folder = find_data_folder(base_path);
    
    let search_root = data_folder.unwrap_or_else(|| base_path.to_path_buf());
    
    // Search for the file recursively
    match search_file_recursively(&search_root, &file_name, 0, 5) {
        Some(path) => Ok(Some(path.to_string_lossy().to_string())),
        None => Ok(None),
    }
}

/// Walks up the directory tree to find a DATA folder
fn find_data_folder(start: &Path) -> Option<PathBuf> {
    let mut current = Some(start.to_path_buf());
    
    for _ in 0..10 {
        if let Some(ref dir) = current {
            // Check if there's a DATA subdirectory
            let potential_data = dir.join("DATA");
            if potential_data.exists() && potential_data.is_dir() {
                return Some(potential_data);
            }
            
            // Check if current folder IS the DATA folder
            if let Some(name) = dir.file_name() {
                if name.to_string_lossy().eq_ignore_ascii_case("DATA") {
                    return Some(dir.clone());
                }
            }
            
            // Check for lowercase 'data' as well
            let potential_data_lower = dir.join("data");
            if potential_data_lower.exists() && potential_data_lower.is_dir() {
                return Some(potential_data_lower);
            }
            
            current = dir.parent().map(|p| p.to_path_buf());
        } else {
            break;
        }
    }
    
    None
}

/// Recursively searches for a file by name
fn search_file_recursively(directory: &Path, file_name: &str, current_depth: u32, max_depth: u32) -> Option<PathBuf> {
    if current_depth > max_depth {
        return None;
    }
    
    // Check for file in current directory
    let file_path = directory.join(file_name);
    if file_path.exists() && file_path.is_file() {
        return Some(file_path);
    }
    
    // Search subdirectories
    if let Ok(entries) = fs::read_dir(directory) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(found) = search_file_recursively(&path, file_name, current_depth + 1, max_depth) {
                    return Some(found);
                }
            }
        }
    }
    
    None
}
