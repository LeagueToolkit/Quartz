use crate::error::{Error, Result};
use league_toolkit::wad::{Wad, WadChunk};
use std::collections::HashMap;
use std::fs::File;
use std::path::Path;

/// A reader for WAD archive files that provides access to chunk metadata
pub struct WadReader {
    wad: Wad<File>,
}

impl WadReader {
    /// Opens a WAD file and parses its structure
    /// 
    /// # Arguments
    /// * `path` - Path to the WAD file
    /// 
    /// # Returns
    /// * `Result<Self>` - A WadReader instance or an error
    /// 
    /// # Requirements
    /// Validates: Requirements 3.1
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        tracing::debug!("Opening WAD file: {}", path.display());
        
        let file = File::open(path)
            .map_err(|e| {
                tracing::error!("Failed to open WAD file '{}': {}", path.display(), e);
                Error::io_with_path(e, path)
            })?;
        
        let wad = Wad::mount(file)
            .map_err(|e| {
                tracing::error!("Failed to mount WAD file '{}': {}", path.display(), e);
                Error::wad_with_path(format!("Failed to mount WAD file: {}", e), path)
            })?;
        
        tracing::info!("Successfully opened WAD file '{}' with {} chunks", path.display(), wad.chunks().len());
        
        Ok(Self { wad })
    }

    /// Returns a reference to all chunks in the WAD archive as a HashMap
    /// 
    /// # Returns
    /// * A reference to the HashMap of path_hash -> WadChunk
    /// 
    /// # Requirements
    /// Validates: Requirements 3.2, 3.3
    pub fn chunks(&self) -> &HashMap<u64, WadChunk> {
        self.wad.chunks()
    }

    /// Looks up a specific chunk by its path hash
    /// 
    /// # Arguments
    /// * `path_hash` - The hash of the chunk's path
    /// 
    /// # Returns
    /// * `Option<&WadChunk>` - The chunk metadata if found, None otherwise
    /// 
    /// # Requirements
    /// Validates: Requirements 3.4
    pub fn get_chunk(&self, path_hash: u64) -> Option<&WadChunk> {
        self.wad.chunks().get(&path_hash)
    }

    /// Returns the total number of chunks in the WAD
    pub fn chunk_count(&self) -> usize {
        self.wad.chunks().len()
    }

    /// Consumes the reader and returns the underlying Wad for decoding operations
    /// 
    /// This is useful when you need to extract chunks, as the decoder requires
    /// mutable access to the Wad.
    #[allow(dead_code)] // Kept for API completeness
    pub fn into_wad(self) -> Wad<File> {
        self.wad
    }

    /// Gets a reference to the underlying Wad
    #[allow(dead_code)] // Kept for API completeness
    pub fn wad(&self) -> &Wad<File> {
        &self.wad
    }

    /// Gets a mutable reference to the underlying Wad
    pub fn wad_mut(&mut self) -> &mut Wad<File> {
        &mut self.wad
    }
}
