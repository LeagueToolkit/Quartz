use crate::error::{Error, Result};
use league_toolkit::wad::{Wad, WadChunk, WadChunks};
use std::fs::File;
use std::io::Read;
use std::path::Path;

/// A reader for WAD archive files that provides access to chunk metadata
///
/// Supports WAD versions 3.0 through 3.4+, including:
/// - WAD 3.0: SHA-256 checksums
/// - WAD 3.1-3.2: xxh3_64bits checksums
/// - WAD 3.3: Subchunked entries (compression type 4 with multiple ZStandard frames)
/// - WAD 3.4+: Extended subchunk indexing
///
/// # Legacy Mod Support
///
/// WAD 3.3 is commonly used in legacy League of Legends mods. This reader fully
/// supports loading and extracting WAD 3.3 archives through the underlying
/// `league-toolkit` crate, which handles all version-specific parsing and
/// decompression logic including:
/// - Subchunked ZStandard decompression (type 4)
/// - SHA-256 checksums (v3.0) and xxh3_64bits checksums (v3.1+)
/// - Subchunk Table of Contents (.wad.SubChunkTOC) resolution
pub struct WadReader {
    wad: Wad<File>,
}

impl WadReader {
    /// Opens a WAD file and parses its structure
    ///
    /// Supports WAD format versions 3.0-3.4+, including legacy mods using WAD 3.3.
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

        // Read WAD version before mounting (for logging purposes)
        let version = Self::read_wad_version(path)?;
        tracing::debug!(
            "WAD version {}.{} detected in '{}'",
            version.0,
            version.1,
            path.display()
        );

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

        tracing::debug!(
            "Successfully opened WAD v{}.{} file '{}' with {} chunks",
            version.0,
            version.1,
            path.display(),
            wad.chunks().len()
        );

        Ok(Self { wad })
    }

    /// Reads the WAD version from a file without fully parsing it
    ///
    /// Returns (major, minor) version tuple
    fn read_wad_version(path: impl AsRef<Path>) -> Result<(u8, u8)> {
        let mut file = File::open(path.as_ref())
            .map_err(|e| Error::io_with_path(e, path.as_ref()))?;

        // Read magic bytes (2 bytes: "RW")
        let mut magic = [0u8; 2];
        file.read_exact(&mut magic)
            .map_err(|e| Error::io_with_path(e, path.as_ref()))?;

        if magic != [0x52, 0x57] {  // "RW"
            return Err(Error::Wad {
                message: format!("Invalid WAD magic bytes: expected 'RW', got '{:?}'", magic),
                path: Some(path.as_ref().to_path_buf()),
            });
        }

        // Read version (major, minor)
        let mut version = [0u8; 2];
        file.read_exact(&mut version)
            .map_err(|e| Error::io_with_path(e, path.as_ref()))?;

        Ok((version[0], version[1]))
    }

    /// Returns a reference to all chunks in the WAD archive
    ///
    /// # Returns
    /// * A reference to the WadChunks collection
    ///
    /// # Requirements
    /// Validates: Requirements 3.2, 3.3
    pub fn chunks(&self) -> &WadChunks {
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
        self.wad.chunks().get(path_hash)
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_read_wad_version_33() {
        // Create a mock WAD 3.3 header
        let mut temp_file = NamedTempFile::new().unwrap();

        // Write WAD header: magic "RW" + version 3.3
        temp_file.write_all(&[0x52, 0x57]).unwrap(); // "RW" magic
        temp_file.write_all(&[3, 3]).unwrap();        // version 3.3
        temp_file.flush().unwrap();

        let version = WadReader::read_wad_version(temp_file.path()).unwrap();
        assert_eq!(version, (3, 3), "Should detect WAD version 3.3");
    }

    #[test]
    fn test_read_wad_version_31() {
        // Create a mock WAD 3.1 header
        let mut temp_file = NamedTempFile::new().unwrap();

        temp_file.write_all(&[0x52, 0x57]).unwrap(); // "RW" magic
        temp_file.write_all(&[3, 1]).unwrap();        // version 3.1
        temp_file.flush().unwrap();

        let version = WadReader::read_wad_version(temp_file.path()).unwrap();
        assert_eq!(version, (3, 1), "Should detect WAD version 3.1");
    }

    #[test]
    fn test_read_wad_version_34() {
        // Create a mock WAD 3.4 header
        let mut temp_file = NamedTempFile::new().unwrap();

        temp_file.write_all(&[0x52, 0x57]).unwrap(); // "RW" magic
        temp_file.write_all(&[3, 4]).unwrap();        // version 3.4
        temp_file.flush().unwrap();

        let version = WadReader::read_wad_version(temp_file.path()).unwrap();
        assert_eq!(version, (3, 4), "Should detect WAD version 3.4");
    }

    #[test]
    fn test_read_wad_version_invalid_magic() {
        // Create a file with invalid magic bytes
        let mut temp_file = NamedTempFile::new().unwrap();

        temp_file.write_all(&[0x00, 0x00]).unwrap(); // Invalid magic
        temp_file.write_all(&[3, 3]).unwrap();
        temp_file.flush().unwrap();

        let result = WadReader::read_wad_version(temp_file.path());
        assert!(result.is_err(), "Should fail with invalid magic bytes");

        if let Err(Error::Wad { message, .. }) = result {
            assert!(message.contains("Invalid WAD magic"), "Error should mention invalid magic");
        } else {
            panic!("Expected WAD error with invalid magic message");
        }
    }
}
