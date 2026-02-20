use crate::core::wad::extractor::{extract_all, extract_chunk};
use crate::core::wad::reader::WadReader;
use crate::state::HashtableState;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use tauri::State;
use walkdir::WalkDir;

/// Information about a WAD archive
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WadInfo {
    pub path: String,
    pub chunk_count: usize,
}

/// Information about a chunk within a WAD archive
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkInfo {
    pub hash: String,
    pub path: Option<String>,
    pub size: u32,
}

/// Result of a WAD extraction operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractionResult {
    pub extracted_count: usize,
    pub failed_count: usize,
}

/// Opens a WAD file and returns metadata about it
/// 
/// # Arguments
/// * `path` - Path to the WAD file
/// 
/// # Returns
/// * `Result<WadInfo, String>` - WAD metadata or error message
/// 
/// # Requirements
/// Validates: Requirements 3.1
#[tauri::command]
pub async fn read_wad(path: String) -> Result<WadInfo, String> {
    let reader = WadReader::open(&path)?;
    
    Ok(WadInfo {
        path,
        chunk_count: reader.chunk_count(),
    })
}

/// Returns a list of all chunks in a WAD archive with resolved paths
/// 
/// # Arguments
/// * `path` - Path to the WAD file
/// * `state` - Hashtable state for path resolution
/// 
/// # Returns
/// * `Result<Vec<ChunkInfo>, String>` - List of chunk information or error message
/// 
/// # Requirements
/// Validates: Requirements 3.2, 3.3, 3.4
#[tauri::command]
pub async fn get_wad_chunks(
    path: String,
    state: State<'_, HashtableState>,
) -> Result<Vec<ChunkInfo>, String> {
    let reader = WadReader::open(&path)?;
    let chunks = reader.chunks();
    
    // Get hashtable for path resolution (lazy loaded on first use)
    let hashtable = state.get_hashtable();
    
    let mut chunk_infos = Vec::new();
    
    for (path_hash, chunk) in chunks.iter() {
        let resolved_path = if let Some(ref ht) = hashtable {
            let resolved = ht.resolve(*path_hash);
            // Only include as resolved if it's not a hex fallback
            if !resolved.starts_with(|c: char| c.is_ascii_hexdigit()) || resolved.len() != 16 {
                Some(resolved.to_string())
            } else {
                None
            }
        } else {
            None
        };
        
        chunk_infos.push(ChunkInfo {
            hash: format!("{:016x}", path_hash),
            path: resolved_path,
            size: chunk.uncompressed_size() as u32,
        });
    }
    
    Ok(chunk_infos)
}

/// Result of loading one WAD in a batch operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WadChunkBatch {
    /// Absolute path to the WAD file (matches the input path)
    pub path: String,
    /// Chunk metadata list (empty on error)
    pub chunks: Vec<ChunkInfo>,
    /// Set if this WAD failed to load
    pub error: Option<String>,
}

/// Loads chunk metadata for multiple WAD files in one call using parallel I/O.
///
/// This is much faster than calling `get_wad_chunks` once per WAD because:
/// - A single IPC round-trip instead of N
/// - WADs are read in parallel via rayon
/// - One combined JSON serialization
#[tauri::command]
pub async fn load_all_wad_chunks(
    paths: Vec<String>,
    state: State<'_, HashtableState>,
) -> Result<Vec<WadChunkBatch>, String> {
    // Clone the Arc so we can move it into the rayon closure
    let hashtable = state.get_hashtable();

    let batches: Vec<WadChunkBatch> = paths
        .par_iter()
        .map(|wad_path| {
            let result: Result<Vec<ChunkInfo>, String> = (|| {
                let reader = WadReader::open(wad_path).map_err(|e| e.to_string())?;
                let chunks = reader.chunks();
                let mut chunk_infos = Vec::with_capacity(chunks.len());
                for (path_hash, chunk) in chunks.iter() {
                    let resolved = hashtable.as_ref().and_then(|ht| {
                        let r = ht.resolve(*path_hash);
                        // Hex-only 16-char strings are unknown hashes — treat as None
                        if r.len() == 16 && r.bytes().all(|b| b.is_ascii_hexdigit()) {
                            None
                        } else {
                            Some(r.to_string())
                        }
                    });
                    chunk_infos.push(ChunkInfo {
                        hash: format!("{:016x}", path_hash),
                        path: resolved,
                        size: chunk.uncompressed_size() as u32,
                    });
                }
                Ok(chunk_infos)
            })();

            match result {
                Ok(chunks) => WadChunkBatch { path: wad_path.clone(), chunks, error: None },
                Err(e) => WadChunkBatch { path: wad_path.clone(), chunks: vec![], error: Some(e) },
            }
        })
        .collect();

    Ok(batches)
}

/// Extracts chunks from a WAD archive to the specified output directory
///
/// # Arguments
/// * `wad_path` - Path to the WAD file
/// * `output_dir` - Directory where chunks should be extracted
/// * `chunk_hashes` - Optional list of chunk hashes to extract (None = extract all)
/// * `state` - Hashtable state for path resolution
/// 
/// # Returns
/// * `Result<ExtractionResult, String>` - Extraction statistics or error message
/// 
/// # Requirements
/// Validates: Requirements 4.1, 4.2, 4.3, 4.4
#[tauri::command]
pub async fn extract_wad(
    wad_path: String,
    output_dir: String,
    chunk_hashes: Option<Vec<String>>,
    state: State<'_, HashtableState>,
) -> Result<ExtractionResult, String> {
    let mut reader = WadReader::open(&wad_path)?;
    
    // Get hashtable for path resolution (lazy loaded on first use)
    let hashtable = state.get_hashtable();
    let hashtable_ref = hashtable.as_ref().map(|h| h.as_ref());
    
    let mut extracted_count = 0;
    let mut failed_count = 0;
    
    if let Some(hashes) = chunk_hashes {
        // Extract specific chunks
        for hash_str in hashes {
            // Parse the hash string
            let path_hash = u64::from_str_radix(&hash_str, 16)
                .map_err(|e| format!("Invalid hash format '{}': {}", hash_str, e))?;
            
            // Check if the chunk exists and get its data
            let chunk_exists = reader.get_chunk(path_hash).is_some();
            
            if chunk_exists {
                // Get the chunk again (we need to release the previous borrow)
                let chunk = reader.get_chunk(path_hash).unwrap();
                
                // Resolve the path
                let resolved_path = if let Some(ht) = hashtable_ref {
                    ht.resolve(path_hash).to_string()
                } else {
                    format!("{:016x}", path_hash)
                };
                
                // Determine output path
                let output_path = std::path::Path::new(&output_dir).join(&resolved_path);

                // Copy the chunk data we need before borrowing mutably
                let chunk_copy = *chunk;

                // Extract the chunk
                match extract_chunk(reader.wad_mut(), &chunk_copy, &output_path, hashtable_ref) {
                    Ok(_) => extracted_count += 1,
                    Err(_) => failed_count += 1,
                }
            } else {
                failed_count += 1;
            }
        }
    } else {
        // Extract all chunks
        match extract_all(reader.wad_mut(), &output_dir, hashtable_ref) {
            Ok(count) => extracted_count = count,
            Err(e) => return Err(e.into()),
        }
    }
    
    Ok(ExtractionResult {
        extracted_count,
        failed_count,
    })
}

/// Info about a WAD file found on disk (for game WAD scanning)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameWadInfo {
    pub path: String,
    pub name: String,
    /// Parent directory name used as a display category (e.g. "Champions", "Maps")
    pub category: String,
}

/// Read decompressed chunk data from a WAD archive into memory — no disk write.
///
/// # Arguments
/// * `wad_path` - Path to the WAD file
/// * `hash`     - Chunk path-hash as a 16-char lowercase hex string
///
/// # Returns
/// * `Ok(Vec<u8>)` - Decompressed chunk bytes
/// * `Err(String)` - Error message
#[tauri::command]
pub async fn read_wad_chunk_data(
    wad_path: String,
    hash: String,
) -> Result<Vec<u8>, String> {
    let path_hash = u64::from_str_radix(&hash, 16)
        .map_err(|e| format!("Invalid hash '{}': {}", hash, e))?;

    let mut reader = WadReader::open(&wad_path)?;

    // Clone the chunk to release the immutable borrow before decoding
    let chunk = *reader
        .get_chunk(path_hash)
        .ok_or_else(|| format!("Chunk {:016x} not found in WAD", path_hash))?;

    let (mut decoder, _) = reader.wad_mut().decode();
    decoder
        .load_chunk_decompressed(&chunk)
        .map(|b| b.into())
        .map_err(|e| format!("Failed to decompress chunk {:016x}: {}", path_hash, e))
}

/// Scan a game installation directory for all WAD archive files.
///
/// Searches `{game_path}/DATA/FINAL/` recursively for `*.wad.client` and `*.wad`
/// files, grouping them by their parent directory name.
///
/// # Arguments
/// * `game_path` - Path to the League `Game/` directory
///
/// # Returns
/// * `Ok(Vec<GameWadInfo>)` - Discovered WAD files sorted by category then name
/// * `Err(String)`          - Error if the WAD root does not exist
#[tauri::command]
pub async fn scan_game_wads(game_path: String) -> Result<Vec<GameWadInfo>, String> {
    let root = std::path::Path::new(&game_path).join("DATA").join("FINAL");

    if !root.exists() {
        return Err(format!(
            "WAD directory not found: {} — make sure this is the League Game/ folder",
            root.display()
        ));
    }

    let mut wads: Vec<GameWadInfo> = WalkDir::new(&root)
        .max_depth(5)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| {
            let path = e.path();
            let name = path.file_name()?.to_str()?;
            if !name.ends_with(".wad.client") && !name.ends_with(".wad") {
                return None;
            }
            let category = path
                .parent()
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .unwrap_or("Other")
                .to_string();
            Some(GameWadInfo {
                path: path.to_string_lossy().to_string(),
                name: name.to_string(),
                category,
            })
        })
        .collect();

    wads.sort_unstable_by(|a, b| a.category.cmp(&b.category).then(a.name.cmp(&b.name)));

    Ok(wads)
}
