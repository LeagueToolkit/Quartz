//! WAD chunk extraction utilities.
//!
//! This module provides abstractions for extracting chunks from WAD archives to disk.
//!
//! # Example
//!
//! ```no_run
//! use std::fs::File;
//! use std::borrow::Cow;
//! use std::collections::HashMap;
//! use ltk_wad::{Wad, PathResolver, WadExtractor, ExtractProgress};
//!
//! // Implement your own path resolver (e.g., from a hashtable file)
//! struct MyHashtable {
//!     paths: HashMap<u64, String>,
//! }
//!
//! impl PathResolver for MyHashtable {
//!     fn resolve(&self, path_hash: u64) -> Cow<'_, str> {
//!         self.paths
//!             .get(&path_hash)
//!             .map(|s| Cow::Borrowed(s.as_str()))
//!             .unwrap_or_else(|| Cow::Owned(format!("{:016x}", path_hash)))
//!     }
//! }
//!
//! fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let file = File::open("archive.wad.client")?;
//!     let mut wad = Wad::mount(file)?;
//!     let hashtable = MyHashtable { paths: HashMap::new() };
//!
//!     // Build the extractor with a progress callback
//!     let extractor = WadExtractor::new(&hashtable)
//!         .on_progress(|progress| {
//!             println!("Progress: {:.1}% - {}", progress.percent() * 100.0, progress.current_path());
//!         });
//!
//!     let extracted = extractor.extract_all(&mut wad, "/output/path")?;
//!     println!("Extracted {} chunks", extracted);
//!
//!     Ok(())
//! }
//! ```

use std::{
    borrow::Cow,
    collections::HashMap,
    fs,
    io::{self, Read, Seek},
};

use camino::{Utf8Path, Utf8PathBuf};
use ltk_file::LeagueFileKind;

use crate::{Wad, WadChunk, WadError};

/// A trait for resolving path hashes to human-readable paths.
///
/// Implement this trait to provide path resolution from a hashtable or other source.
pub trait PathResolver {
    /// Resolve a path hash to a path string.
    ///
    /// If the hash cannot be resolved, implementations should return the hash
    /// formatted as a hex string (e.g., `format!("{:016x}", path_hash)`).
    fn resolve(&self, path_hash: u64) -> Cow<'_, str>;
}

/// A trait for filtering chunks by path pattern.
///
/// Implement this trait to provide custom pattern matching logic.
pub trait PathFilter {
    /// Returns `true` if the path matches the filter pattern.
    fn matches(&self, path: &str) -> bool;
}

/// A path resolver that simply returns the hash as a hex string.
///
/// Useful when no hashtable is available.
#[derive(Debug, Clone, Copy, Default)]
pub struct HexPathResolver;

impl PathResolver for HexPathResolver {
    fn resolve(&self, path_hash: u64) -> Cow<'_, str> {
        Cow::Owned(format!("{:016x}", path_hash))
    }
}

/// A path resolver backed by a `HashMap<u64, String>`.
#[derive(Debug, Clone, Default)]
pub struct HashMapPathResolver {
    paths: HashMap<u64, String>,
}

impl HashMapPathResolver {
    /// Create a new resolver with the given path mappings.
    pub fn new(paths: HashMap<u64, String>) -> Self {
        Self { paths }
    }

    /// Insert a path mapping.
    pub fn insert(&mut self, hash: u64, path: String) {
        self.paths.insert(hash, path);
    }

    /// Get a reference to the inner map.
    pub fn inner(&self) -> &HashMap<u64, String> {
        &self.paths
    }

    /// Get a mutable reference to the inner map.
    pub fn inner_mut(&mut self) -> &mut HashMap<u64, String> {
        &mut self.paths
    }
}

impl PathResolver for HashMapPathResolver {
    fn resolve(&self, path_hash: u64) -> Cow<'_, str> {
        self.paths
            .get(&path_hash)
            .map(|s| Cow::Borrowed(s.as_str()))
            .unwrap_or_else(|| Cow::Owned(format!("{:016x}", path_hash)))
    }
}

impl From<HashMap<u64, String>> for HashMapPathResolver {
    fn from(paths: HashMap<u64, String>) -> Self {
        Self::new(paths)
    }
}

/// Information about extraction progress.
#[derive(Debug, Clone)]
pub struct ExtractProgress<'a> {
    /// Current chunk index (0-based).
    pub current: usize,
    /// Total number of chunks.
    pub total: usize,
    /// Path of the current chunk being processed.
    pub current_path: &'a str,
    /// Path hash of the current chunk.
    pub path_hash: u64,
}

impl ExtractProgress<'_> {
    /// Progress as a fraction from 0.0 to 1.0.
    #[inline]
    pub fn percent(&self) -> f64 {
        if self.total == 0 {
            0.0
        } else {
            self.current as f64 / self.total as f64
        }
    }

    /// Get the current path being processed.
    #[inline]
    pub fn current_path(&self) -> &str {
        self.current_path
    }
}

/// Result of a single chunk extraction.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExtractResult {
    /// The chunk was extracted successfully.
    Extracted,
    /// The chunk was skipped due to type filtering.
    SkippedByType,
    /// The chunk was skipped due to pattern filtering.
    SkippedByPattern,
}

/// Type alias for the progress callback function.
pub type ProgressCallback<'a> = Box<dyn Fn(ExtractProgress<'_>) + 'a>;

/// Configuration and execution of WAD chunk extraction.
///
/// # Type Parameters
///
/// * `R` - The path resolver type
/// * `F` - The path filter type (optional)
pub struct WadExtractor<'a, R: PathResolver, F: PathFilter = NoFilter> {
    resolver: &'a R,
    filter: Option<F>,
    type_filter: Option<Vec<LeagueFileKind>>,
    progress_callback: Option<ProgressCallback<'a>>,
}

/// A filter that matches all paths (no filtering).
#[derive(Debug, Clone, Copy, Default)]
pub struct NoFilter;

impl PathFilter for NoFilter {
    fn matches(&self, _path: &str) -> bool {
        true
    }
}

impl<'a, R: PathResolver> WadExtractor<'a, R, NoFilter> {
    /// Create a new extractor with the given path resolver.
    pub fn new(resolver: &'a R) -> Self {
        Self {
            resolver,
            filter: None,
            type_filter: None,
            progress_callback: None,
        }
    }
}

impl<'a, R: PathResolver, F: PathFilter> WadExtractor<'a, R, F> {
    /// Set a path filter for the extractor.
    ///
    /// Only chunks whose paths match the filter will be extracted.
    pub fn with_filter<F2: PathFilter>(self, filter: F2) -> WadExtractor<'a, R, F2> {
        WadExtractor {
            resolver: self.resolver,
            filter: Some(filter),
            type_filter: self.type_filter,
            progress_callback: self.progress_callback,
        }
    }

    /// Set a type filter for the extractor.
    ///
    /// Only chunks whose detected file type is in the list will be extracted.
    pub fn with_type_filter(mut self, types: Vec<LeagueFileKind>) -> Self {
        self.type_filter = Some(types);
        self
    }

    /// Set a progress callback.
    ///
    /// The callback will be invoked for each chunk processed (including skipped chunks).
    pub fn on_progress<C: Fn(ExtractProgress<'_>) + 'a>(mut self, callback: C) -> Self {
        self.progress_callback = Some(Box::new(callback));
        self
    }

    /// Extract all chunks from a WAD to the specified directory.
    ///
    /// Returns the number of chunks actually extracted (not skipped).
    pub fn extract_all<TSource: Read + Seek>(
        &self,
        wad: &mut Wad<TSource>,
        output_dir: impl AsRef<Utf8Path>,
    ) -> Result<usize, WadError> {
        let output_dir = output_dir.as_ref();
        let chunks: Vec<WadChunk> = wad.chunks().iter().copied().collect();
        let total = chunks.len();
        let mut extracted_count = 0;

        for (index, chunk) in chunks.iter().enumerate() {
            let chunk_path_str = self.resolver.resolve(chunk.path_hash());
            let chunk_path = Utf8Path::new(chunk_path_str.as_ref());

            // Report progress
            if let Some(ref callback) = self.progress_callback {
                callback(ExtractProgress {
                    current: index,
                    total,
                    current_path: chunk_path_str.as_ref(),
                    path_hash: chunk.path_hash(),
                });
            }

            // Check path filter
            if let Some(ref filter) = self.filter {
                if !filter.matches(chunk_path_str.as_ref()) {
                    continue;
                }
            }

            // Load and decompress
            let chunk_data = wad.load_chunk_decompressed(chunk)?;

            // Extract the chunk
            match self.extract_chunk_data(chunk, &chunk_data, chunk_path, output_dir)? {
                ExtractResult::Extracted => extracted_count += 1,
                ExtractResult::SkippedByType | ExtractResult::SkippedByPattern => {}
            }
        }

        Ok(extracted_count)
    }

    /// Extract a single chunk from already-decompressed data to the specified directory.
    ///
    /// This is useful for parallel workflows where decompression is done separately
    /// (e.g. via [`decompress_raw`](crate::decompress_raw)).
    pub fn extract_chunk_data(
        &self,
        chunk: &WadChunk,
        chunk_data: &[u8],
        chunk_path: &Utf8Path,
        output_dir: &Utf8Path,
    ) -> Result<ExtractResult, WadError> {
        // Identify the file type
        let chunk_kind = LeagueFileKind::identify_from_bytes(chunk_data);

        // Check type filter
        if let Some(ref type_filter) = self.type_filter {
            if !type_filter.contains(&chunk_kind) {
                return Ok(ExtractResult::SkippedByType);
            }
        }

        // Determine the final output path
        let final_path = self.resolve_final_path(chunk_path, output_dir, chunk_data, chunk_kind);
        let full_path = output_dir.join(&final_path);

        // Create parent directories
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent)?;
        }

        // Write the file
        match fs::write(&full_path, chunk_data) {
            Ok(()) => Ok(ExtractResult::Extracted),
            Err(error) if error.kind() == io::ErrorKind::InvalidFilename => {
                // Fallback for long filenames
                self.write_with_hashed_name(chunk, chunk_data, chunk_kind, output_dir)?;
                Ok(ExtractResult::Extracted)
            }
            Err(error) => Err(WadError::IoError(error)),
        }
    }

    /// Resolve the final output path for a chunk.
    fn resolve_final_path(
        &self,
        chunk_path: &Utf8Path,
        output_dir: &Utf8Path,
        chunk_data: &[u8],
        chunk_kind: LeagueFileKind,
    ) -> Utf8PathBuf {
        let mut final_path = chunk_path.to_path_buf();

        // If the path looks like a hex hash (no extension), add the detected extension
        if is_hex_chunk_path(&final_path) {
            if let Some(ext) = chunk_kind.extension() {
                final_path.set_extension(ext);
            }
            return final_path;
        }

        // - If the original path has no extension, affix .ltk (and real extension if known)
        // - OR if the destination path collides with an existing directory, affix .ltk
        let has_extension = final_path.extension().is_some();
        let collides_with_dir = output_dir.join(&final_path).is_dir();
        if !has_extension || collides_with_dir {
            final_path.set_file_name(build_ltk_name(
                chunk_path.file_stem().unwrap_or_default(),
                chunk_data,
            ));
        }

        final_path
    }

    /// Write a chunk with a hashed filename (fallback for long filenames).
    fn write_with_hashed_name(
        &self,
        chunk: &WadChunk,
        chunk_data: &[u8],
        chunk_kind: LeagueFileKind,
        output_dir: &Utf8Path,
    ) -> Result<(), WadError> {
        let mut hashed_path = Utf8PathBuf::from(format!("{:016x}", chunk.path_hash()));
        if let Some(ext) = chunk_kind.extension() {
            hashed_path.set_extension(ext);
        }

        fs::write(output_dir.join(hashed_path), chunk_data)?;
        Ok(())
    }
}

/// Check if a path looks like a hex-encoded hash (e.g., "0123456789abcdef").
///
/// This is useful for determining if a chunk path is unresolved (just a hash)
/// or if it has been resolved to a human-readable path.
///
/// # Example
///
/// ```
/// use ltk_wad::is_hex_chunk_path;
/// use camino::Utf8Path;
///
/// assert!(is_hex_chunk_path(Utf8Path::new("0123456789abcdef")));
/// assert!(is_hex_chunk_path(Utf8Path::new("0123456789abcdef.bin")));
/// assert!(!is_hex_chunk_path(Utf8Path::new("assets/champions/aatrox.bin")));
/// ```
pub fn is_hex_chunk_path(path: &Utf8Path) -> bool {
    let file_stem = path.file_stem().unwrap_or("");
    file_stem.len() == 16 && file_stem.chars().all(|c| c.is_ascii_hexdigit())
}

/// Build a filename with `.ltk` suffix and optional type extension.
fn build_ltk_name(file_stem: impl AsRef<str>, chunk_data: &[u8]) -> String {
    let kind = LeagueFileKind::identify_from_bytes(chunk_data);
    match kind.extension() {
        Some(ext) => format!("{}.ltk.{}", file_stem.as_ref(), ext),
        None => format!("{}.ltk", file_stem.as_ref()),
    }
}

#[cfg(feature = "regex")]
mod regex_filter {
    use super::PathFilter;

    /// A path filter using a regular expression.
    #[derive(Debug, Clone)]
    pub struct RegexFilter {
        pattern: regex::Regex,
    }

    impl RegexFilter {
        /// Create a new regex filter from a pattern string.
        ///
        /// Returns `None` if the pattern is invalid.
        pub fn new(pattern: &str) -> Option<Self> {
            regex::Regex::new(pattern)
                .ok()
                .map(|pattern| Self { pattern })
        }

        /// Create a new regex filter from a compiled regex.
        pub fn from_regex(pattern: regex::Regex) -> Self {
            Self { pattern }
        }
    }

    impl PathFilter for RegexFilter {
        fn matches(&self, path: &str) -> bool {
            self.pattern.is_match(path)
        }
    }
}

#[cfg(feature = "regex")]
pub use regex_filter::RegexFilter;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::WadChunks;
    use std::io::{Read, Seek, SeekFrom, Write};

    // =============================================================================
    // Mock WAD Source for Testing
    // =============================================================================

    /// A mock WAD source that holds chunk data at specific offsets.
    struct MockWadSource {
        data: Vec<u8>,
        position: u64,
    }

    impl MockWadSource {
        fn new() -> Self {
            Self {
                data: vec![0; 1024 * 1024], // 1MB buffer
                position: 0,
            }
        }

        /// Write data at a specific offset and return the offset.
        fn write_at(&mut self, offset: usize, data: &[u8]) -> usize {
            if offset + data.len() > self.data.len() {
                self.data.resize(offset + data.len(), 0);
            }
            self.data[offset..offset + data.len()].copy_from_slice(data);
            offset
        }

        /// Write gzip-compressed data at a specific offset.
        fn write_gzip_at(&mut self, offset: usize, data: &[u8]) -> (usize, usize) {
            use flate2::write::GzEncoder;
            use flate2::Compression;

            let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
            encoder.write_all(data).unwrap();
            let compressed = encoder.finish().unwrap();
            let compressed_size = compressed.len();
            self.write_at(offset, &compressed);
            (offset, compressed_size)
        }

        /// Create a mock Wad from this source with the given chunks.
        fn into_wad(self, chunks: WadChunks) -> Wad<Self> {
            Wad {
                chunks,
                source: self,
            }
        }
    }

    impl Read for MockWadSource {
        fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
            let start = self.position as usize;
            let end = (start + buf.len()).min(self.data.len());
            let bytes_read = end - start;
            buf[..bytes_read].copy_from_slice(&self.data[start..end]);
            self.position += bytes_read as u64;
            Ok(bytes_read)
        }
    }

    impl Seek for MockWadSource {
        fn seek(&mut self, pos: SeekFrom) -> io::Result<u64> {
            let new_pos = match pos {
                SeekFrom::Start(p) => p as i64,
                SeekFrom::End(p) => self.data.len() as i64 + p,
                SeekFrom::Current(p) => self.position as i64 + p,
            };
            if new_pos < 0 {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "negative seek position",
                ));
            }
            self.position = new_pos as u64;
            Ok(self.position)
        }
    }

    /// Create a test chunk with uncompressed data.
    fn create_uncompressed_chunk(path_hash: u64, data_offset: usize, data: &[u8]) -> WadChunk {
        WadChunk {
            path_hash,
            data_offset,
            compressed_size: data.len(),
            uncompressed_size: data.len(),
            compression_type: crate::WadChunkCompression::None,
            is_duplicated: false,
            frame_count: 0,
            start_frame: 0,
            checksum: 0,
        }
    }

    /// Create a test chunk with gzip-compressed data.
    fn create_gzip_chunk(
        path_hash: u64,
        data_offset: usize,
        compressed_size: usize,
        uncompressed_size: usize,
    ) -> WadChunk {
        WadChunk {
            path_hash,
            data_offset,
            compressed_size,
            uncompressed_size,
            compression_type: crate::WadChunkCompression::GZip,
            is_duplicated: false,
            frame_count: 0,
            start_frame: 0,
            checksum: 0,
        }
    }

    /// Custom path filter for testing.
    struct PrefixFilter {
        prefix: String,
    }

    impl PrefixFilter {
        fn new(prefix: impl Into<String>) -> Self {
            Self {
                prefix: prefix.into(),
            }
        }
    }

    impl PathFilter for PrefixFilter {
        fn matches(&self, path: &str) -> bool {
            path.starts_with(&self.prefix)
        }
    }

    // =============================================================================
    // is_hex_chunk_path Tests
    // =============================================================================

    #[test]
    fn test_is_hex_path() {
        assert!(is_hex_chunk_path(Utf8Path::new("0123456789abcdef")));
        assert!(is_hex_chunk_path(Utf8Path::new("0123456789ABCDEF")));
        assert!(is_hex_chunk_path(Utf8Path::new("0123456789abcdef.bin")));

        assert!(!is_hex_chunk_path(Utf8Path::new("0123456789abcde"))); // too short
        assert!(!is_hex_chunk_path(Utf8Path::new("0123456789abcdefg"))); // too long
        assert!(!is_hex_chunk_path(Utf8Path::new(
            "assets/champions/aatrox.bin"
        )));
        assert!(!is_hex_chunk_path(Utf8Path::new("")));
    }

    #[test]
    fn test_is_hex_path_with_extension() {
        // Hex paths with extensions should still be detected
        assert!(is_hex_chunk_path(Utf8Path::new("0123456789abcdef.bin")));
        assert!(is_hex_chunk_path(Utf8Path::new("0123456789abcdef.png")));
        assert!(is_hex_chunk_path(Utf8Path::new("0123456789abcdef.unknown")));
    }

    #[test]
    fn test_is_hex_path_edge_cases() {
        // All zeros
        assert!(is_hex_chunk_path(Utf8Path::new("0000000000000000")));
        // All f's
        assert!(is_hex_chunk_path(Utf8Path::new("ffffffffffffffff")));
        // Non-hex characters
        assert!(!is_hex_chunk_path(Utf8Path::new("ghijklmnopqrstuv")));
        assert!(!is_hex_chunk_path(Utf8Path::new("0123456789abcdeg")));
    }

    // =============================================================================
    // PathResolver Tests
    // =============================================================================

    #[test]
    fn test_hex_path_resolver() {
        let resolver = HexPathResolver;
        assert_eq!(resolver.resolve(0x0123456789abcdef), "0123456789abcdef");
    }

    #[test]
    fn test_hex_path_resolver_formats_hash_correctly() {
        let resolver = HexPathResolver;

        // Test various hashes
        assert_eq!(resolver.resolve(0x0), "0000000000000000");
        assert_eq!(resolver.resolve(0x1), "0000000000000001");
        assert_eq!(resolver.resolve(0x123456789abcdef0), "123456789abcdef0");
        assert_eq!(resolver.resolve(u64::MAX), "ffffffffffffffff");
    }

    #[test]
    fn test_hashmap_path_resolver() {
        let mut resolver = HashMapPathResolver::new(HashMap::new());
        resolver.insert(0x1234, "assets/test.bin".to_string());

        assert_eq!(resolver.resolve(0x1234), "assets/test.bin");
        assert_eq!(resolver.resolve(0x5678), "0000000000005678");
    }

    #[test]
    fn test_hashmap_path_resolver_resolves_known_paths() {
        let mut resolver = HashMapPathResolver::default();
        resolver.insert(0x1234, "assets/champions/aatrox.bin".to_string());
        resolver.insert(0x5678, "data/maps/summoners_rift.mapgeo".to_string());

        assert_eq!(resolver.resolve(0x1234), "assets/champions/aatrox.bin");
        assert_eq!(resolver.resolve(0x5678), "data/maps/summoners_rift.mapgeo");
    }

    #[test]
    fn test_hashmap_path_resolver_falls_back_to_hex() {
        let resolver = HashMapPathResolver::new(HashMap::new());

        // Unknown hashes should return hex format
        assert_eq!(resolver.resolve(0xdeadbeef), "00000000deadbeef");
        assert_eq!(resolver.resolve(0x1234567890abcdef), "1234567890abcdef");
    }

    #[test]
    fn test_hashmap_path_resolver_from_hashmap() {
        let mut paths = HashMap::new();
        paths.insert(0xabc, "test/path.bin".to_string());

        let resolver: HashMapPathResolver = paths.into();
        assert_eq!(resolver.resolve(0xabc), "test/path.bin");
    }

    #[test]
    fn test_hashmap_path_resolver_inner_access() {
        let mut resolver = HashMapPathResolver::default();
        resolver.insert(0x1, "one".to_string());

        // Test inner() access
        assert_eq!(resolver.inner().get(&0x1), Some(&"one".to_string()));

        // Test inner_mut() access
        resolver.inner_mut().insert(0x2, "two".to_string());
        assert_eq!(resolver.resolve(0x2), "two");
    }

    // =============================================================================
    // PathFilter Tests
    // =============================================================================

    #[test]
    fn test_no_filter_matches_everything() {
        let filter = NoFilter;

        assert!(filter.matches(""));
        assert!(filter.matches("any/path/here.bin"));
        assert!(filter.matches("0123456789abcdef"));
    }

    #[test]
    fn test_custom_prefix_filter() {
        let filter = PrefixFilter::new("assets/");

        assert!(filter.matches("assets/champions/aatrox.bin"));
        assert!(filter.matches("assets/maps/test.mapgeo"));
        assert!(!filter.matches("data/test.bin"));
        assert!(!filter.matches(""));
    }

    // =============================================================================
    // build_ltk_name Tests
    // =============================================================================

    #[test]
    fn test_build_ltk_name() {
        // Unknown type
        assert_eq!(build_ltk_name("myfile", &[]), "myfile.ltk");

        // PNG magic bytes
        let png_magic = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        assert_eq!(build_ltk_name("myfile", &png_magic), "myfile.ltk.png");
    }

    #[test]
    fn test_build_ltk_name_various_types() {
        // JPEG magic
        let jpg_magic = [0xFF, 0xD8, 0xFF, 0xE0];
        assert_eq!(build_ltk_name("image", &jpg_magic), "image.ltk.jpg");

        // DDS magic
        let dds_magic = [0x44, 0x44, 0x53, 0x20]; // "DDS "
        assert_eq!(build_ltk_name("texture", &dds_magic), "texture.ltk.dds");
    }

    // =============================================================================
    // ExtractProgress Tests
    // =============================================================================

    #[test]
    fn test_extract_progress() {
        let progress = ExtractProgress {
            current: 50,
            total: 100,
            current_path: "test/path.bin",
            path_hash: 0x1234,
        };

        assert!((progress.percent() - 0.5).abs() < f64::EPSILON);
        assert_eq!(progress.current_path(), "test/path.bin");
    }

    #[test]
    fn test_extract_progress_at_boundaries() {
        // Start
        let start = ExtractProgress {
            current: 0,
            total: 100,
            current_path: "test.bin",
            path_hash: 0,
        };
        assert!((start.percent() - 0.0).abs() < f64::EPSILON);

        // End
        let end = ExtractProgress {
            current: 100,
            total: 100,
            current_path: "test.bin",
            path_hash: 0,
        };
        assert!((end.percent() - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_extract_progress_zero_total() {
        let progress = ExtractProgress {
            current: 0,
            total: 0,
            current_path: "test.bin",
            path_hash: 0,
        };

        // Should not panic, returns 0.0
        assert!((progress.percent() - 0.0).abs() < f64::EPSILON);
    }

    // =============================================================================
    // WadExtractor Integration Tests
    // =============================================================================

    #[test]
    fn test_extract_uncompressed_chunk() {
        let temp_dir = tempfile::TempDir::new().unwrap();
        let output_path = Utf8Path::from_path(temp_dir.path()).unwrap();

        // Create mock WAD source with test data
        let test_data = b"Hello, World!";
        let mut source = MockWadSource::new();
        let offset = source.write_at(1000, test_data);

        let chunk = create_uncompressed_chunk(0x1234567890abcdef, offset, test_data);
        let chunks = WadChunks::from_iter([chunk]);

        // Create resolver and extractor
        let mut resolver = HashMapPathResolver::default();
        resolver.insert(0x1234567890abcdef, "test/hello.txt".to_string());

        let extractor = WadExtractor::new(&resolver);

        let mut wad = source.into_wad(chunks);
        let chunk = *wad.chunks().iter().next().unwrap();
        let chunk_data = wad.load_chunk_decompressed(&chunk).unwrap();

        let result = extractor
            .extract_chunk_data(
                &chunk,
                &chunk_data,
                Utf8Path::new("test/hello.txt"),
                output_path,
            )
            .unwrap();

        assert_eq!(result, ExtractResult::Extracted);

        // Verify file was created with correct content
        let extracted_path = temp_dir.path().join("test/hello.txt");
        assert!(extracted_path.exists());

        let content = fs::read_to_string(&extracted_path).unwrap();
        assert_eq!(content, "Hello, World!");
    }

    #[test]
    fn test_extract_gzip_chunk() {
        let temp_dir = tempfile::TempDir::new().unwrap();
        let output_path = Utf8Path::from_path(temp_dir.path()).unwrap();

        // Create mock WAD source with gzip-compressed test data
        let test_data = b"This is gzip compressed data!";
        let mut source = MockWadSource::new();
        let (offset, compressed_size) = source.write_gzip_at(1000, test_data);

        let chunk = create_gzip_chunk(0xabcdef1234567890, offset, compressed_size, test_data.len());
        let chunks = WadChunks::from_iter([chunk]);

        // Create resolver and extractor
        let mut resolver = HashMapPathResolver::default();
        resolver.insert(0xabcdef1234567890, "compressed/data.txt".to_string());

        let extractor = WadExtractor::new(&resolver);

        let mut wad = source.into_wad(chunks);
        let chunk = *wad.chunks().iter().next().unwrap();
        let chunk_data = wad.load_chunk_decompressed(&chunk).unwrap();

        let result = extractor
            .extract_chunk_data(
                &chunk,
                &chunk_data,
                Utf8Path::new("compressed/data.txt"),
                output_path,
            )
            .unwrap();

        assert_eq!(result, ExtractResult::Extracted);

        // Verify file was created with correct content
        let extracted_path = temp_dir.path().join("compressed/data.txt");
        assert!(extracted_path.exists());

        let content = fs::read_to_string(&extracted_path).unwrap();
        assert_eq!(content, "This is gzip compressed data!");
    }

    #[test]
    fn test_extract_all_chunks() {
        let temp_dir = tempfile::TempDir::new().unwrap();
        let output_path = Utf8Path::from_path(temp_dir.path()).unwrap();

        // Create mock WAD source with multiple chunks
        let mut source = MockWadSource::new();

        let data1 = b"File one content";
        let data2 = b"File two content";
        let data3 = b"File three content";

        let offset1 = source.write_at(1000, data1);
        let offset2 = source.write_at(2000, data2);
        let offset3 = source.write_at(3000, data3);

        let chunk1 = create_uncompressed_chunk(0x1111, offset1, data1);
        let chunk2 = create_uncompressed_chunk(0x2222, offset2, data2);
        let chunk3 = create_uncompressed_chunk(0x3333, offset3, data3);

        let chunks = WadChunks::from_iter([chunk1, chunk2, chunk3]);

        // Create resolver
        let mut resolver = HashMapPathResolver::default();
        resolver.insert(0x1111, "dir1/file1.txt".to_string());
        resolver.insert(0x2222, "dir2/file2.txt".to_string());
        resolver.insert(0x3333, "dir3/file3.txt".to_string());

        let extractor = WadExtractor::new(&resolver);

        let mut wad = source.into_wad(chunks);
        let extracted = extractor.extract_all(&mut wad, output_path).unwrap();

        assert_eq!(extracted, 3);

        // Verify all files were created
        assert!(temp_dir.path().join("dir1/file1.txt").exists());
        assert!(temp_dir.path().join("dir2/file2.txt").exists());
        assert!(temp_dir.path().join("dir3/file3.txt").exists());
    }

    #[test]
    fn test_extract_with_path_filter() {
        let temp_dir = tempfile::TempDir::new().unwrap();
        let output_path = Utf8Path::from_path(temp_dir.path()).unwrap();

        // Create mock WAD source with multiple chunks
        let mut source = MockWadSource::new();

        let data1 = b"Assets file";
        let data2 = b"Data file";

        let offset1 = source.write_at(1000, data1);
        let offset2 = source.write_at(2000, data2);

        let chunk1 = create_uncompressed_chunk(0x1111, offset1, data1);
        let chunk2 = create_uncompressed_chunk(0x2222, offset2, data2);

        let chunks = WadChunks::from_iter([chunk1, chunk2]);

        // Create resolver
        let mut resolver = HashMapPathResolver::default();
        resolver.insert(0x1111, "assets/file1.txt".to_string());
        resolver.insert(0x2222, "data/file2.txt".to_string());

        // Create extractor with prefix filter
        let filter = PrefixFilter::new("assets/");
        let extractor = WadExtractor::new(&resolver).with_filter(filter);

        let mut wad = source.into_wad(chunks);
        let extracted = extractor.extract_all(&mut wad, output_path).unwrap();

        // Only assets/ file should be extracted
        assert_eq!(extracted, 1);
        assert!(temp_dir.path().join("assets/file1.txt").exists());
        assert!(!temp_dir.path().join("data/file2.txt").exists());
    }

    #[test]
    fn test_extract_with_type_filter() {
        let temp_dir = tempfile::TempDir::new().unwrap();
        let output_path = Utf8Path::from_path(temp_dir.path()).unwrap();

        // Create mock WAD source
        let mut source = MockWadSource::new();

        // PNG magic bytes + some data
        let png_data = [
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG header
            0x00, 0x00, 0x00, 0x00, // Extra data
        ];
        // Random non-PNG data
        let other_data = b"Random text data";

        let offset1 = source.write_at(1000, &png_data);
        let offset2 = source.write_at(2000, other_data);

        let chunk1 = create_uncompressed_chunk(0x1111, offset1, &png_data);
        let chunk2 = create_uncompressed_chunk(0x2222, offset2, other_data);

        let chunks = WadChunks::from_iter([chunk1, chunk2]);

        // Create resolver
        let mut resolver = HashMapPathResolver::default();
        resolver.insert(0x1111, "images/test.png".to_string());
        resolver.insert(0x2222, "text/readme.txt".to_string());

        // Create extractor with type filter (only PNG)
        let extractor = WadExtractor::new(&resolver).with_type_filter(vec![LeagueFileKind::Png]);

        let mut wad = source.into_wad(chunks);
        let extracted = extractor.extract_all(&mut wad, output_path).unwrap();

        // Only PNG file should be extracted
        assert_eq!(extracted, 1);
        assert!(temp_dir.path().join("images/test.png").exists());
        assert!(!temp_dir.path().join("text/readme.txt").exists());
    }

    #[test]
    fn test_extract_progress_callback() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        use std::sync::Arc;

        let temp_dir = tempfile::TempDir::new().unwrap();
        let output_path = Utf8Path::from_path(temp_dir.path()).unwrap();

        // Create mock WAD source
        let mut source = MockWadSource::new();
        let data = b"Test data";
        let offset = source.write_at(1000, data);

        let chunk = create_uncompressed_chunk(0x1234, offset, data);
        let chunks = WadChunks::from_iter([chunk]);

        let mut resolver = HashMapPathResolver::default();
        resolver.insert(0x1234, "test.txt".to_string());

        // Track progress calls
        let progress_count = Arc::new(AtomicUsize::new(0));
        let progress_count_clone = progress_count.clone();

        let extractor = WadExtractor::new(&resolver).on_progress(move |progress| {
            progress_count_clone.fetch_add(1, Ordering::SeqCst);
            assert_eq!(progress.total, 1);
            assert_eq!(progress.current_path(), "test.txt");
        });

        let mut wad = source.into_wad(chunks);
        extractor.extract_all(&mut wad, output_path).unwrap();

        // Progress callback should have been called once
        assert_eq!(progress_count.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn test_extract_hex_path_gets_extension() {
        let temp_dir = tempfile::TempDir::new().unwrap();
        let output_path = Utf8Path::from_path(temp_dir.path()).unwrap();

        // Create mock WAD source with PNG data
        let mut source = MockWadSource::new();
        let png_data = [
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG header
            0x00, 0x00, 0x00, 0x00,
        ];
        let offset = source.write_at(1000, &png_data);

        let chunk = create_uncompressed_chunk(0x1234567890abcdef, offset, &png_data);
        let chunks = WadChunks::from_iter([chunk]);

        // Use HexPathResolver - no known path, just hex
        let resolver = HexPathResolver;
        let extractor = WadExtractor::new(&resolver);

        let mut wad = source.into_wad(chunks);
        let chunk = *wad.chunks().iter().next().unwrap();
        let chunk_data = wad.load_chunk_decompressed(&chunk).unwrap();

        let result = extractor
            .extract_chunk_data(
                &chunk,
                &chunk_data,
                Utf8Path::new("1234567890abcdef"),
                output_path,
            )
            .unwrap();

        assert_eq!(result, ExtractResult::Extracted);

        // File should have .png extension added based on magic bytes
        assert!(temp_dir.path().join("1234567890abcdef.png").exists());
    }

    #[test]
    fn test_extract_path_without_extension_gets_ltk() {
        let temp_dir = tempfile::TempDir::new().unwrap();
        let output_path = Utf8Path::from_path(temp_dir.path()).unwrap();

        // Create mock WAD source with PNG data (known type)
        let mut source = MockWadSource::new();
        let png_data = [
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x00,
        ];
        let offset = source.write_at(1000, &png_data);

        let chunk = create_uncompressed_chunk(0x1234, offset, &png_data);
        let chunks = WadChunks::from_iter([chunk]);

        let mut resolver = HashMapPathResolver::default();
        resolver.insert(0x1234, "assets/noextension".to_string());

        let extractor = WadExtractor::new(&resolver);

        let mut wad = source.into_wad(chunks);
        let chunk = *wad.chunks().iter().next().unwrap();
        let chunk_data = wad.load_chunk_decompressed(&chunk).unwrap();

        let result = extractor
            .extract_chunk_data(
                &chunk,
                &chunk_data,
                Utf8Path::new("assets/noextension"),
                output_path,
            )
            .unwrap();

        assert_eq!(result, ExtractResult::Extracted);

        // File should have .ltk.png suffix
        assert!(temp_dir.path().join("assets/noextension.ltk.png").exists());
    }

    #[test]
    fn test_extract_path_without_extension_unknown_type() {
        let temp_dir = tempfile::TempDir::new().unwrap();
        let output_path = Utf8Path::from_path(temp_dir.path()).unwrap();

        // Create mock WAD source with unknown data
        let mut source = MockWadSource::new();
        let unknown_data = b"Unknown file type content";
        let offset = source.write_at(1000, unknown_data);

        let chunk = create_uncompressed_chunk(0x1234, offset, unknown_data);
        let chunks = WadChunks::from_iter([chunk]);

        let mut resolver = HashMapPathResolver::default();
        resolver.insert(0x1234, "assets/noextension".to_string());

        let extractor = WadExtractor::new(&resolver);

        let mut wad = source.into_wad(chunks);
        let chunk = *wad.chunks().iter().next().unwrap();
        let chunk_data = wad.load_chunk_decompressed(&chunk).unwrap();

        let result = extractor
            .extract_chunk_data(
                &chunk,
                &chunk_data,
                Utf8Path::new("assets/noextension"),
                output_path,
            )
            .unwrap();

        assert_eq!(result, ExtractResult::Extracted);

        // File should have only .ltk suffix (no type extension)
        assert!(temp_dir.path().join("assets/noextension.ltk").exists());
    }

    #[test]
    fn test_extract_creates_nested_directories() {
        let temp_dir = tempfile::TempDir::new().unwrap();
        let output_path = Utf8Path::from_path(temp_dir.path()).unwrap();

        let mut source = MockWadSource::new();
        let data = b"Deeply nested file";
        let offset = source.write_at(1000, data);

        let chunk = create_uncompressed_chunk(0x1234, offset, data);
        let chunks = WadChunks::from_iter([chunk]);

        let mut resolver = HashMapPathResolver::default();
        resolver.insert(0x1234, "a/b/c/d/e/deep.txt".to_string());

        let extractor = WadExtractor::new(&resolver);

        let mut wad = source.into_wad(chunks);
        let chunk = *wad.chunks().iter().next().unwrap();
        let chunk_data = wad.load_chunk_decompressed(&chunk).unwrap();

        let result = extractor
            .extract_chunk_data(
                &chunk,
                &chunk_data,
                Utf8Path::new("a/b/c/d/e/deep.txt"),
                output_path,
            )
            .unwrap();

        assert_eq!(result, ExtractResult::Extracted);
        assert!(temp_dir.path().join("a/b/c/d/e/deep.txt").exists());
    }

    #[test]
    fn test_extract_empty_chunks_returns_zero() {
        let temp_dir = tempfile::TempDir::new().unwrap();
        let output_path = Utf8Path::from_path(temp_dir.path()).unwrap();

        let source = MockWadSource::new();
        let chunks = WadChunks::from_iter([]);

        let resolver = HexPathResolver;
        let extractor = WadExtractor::new(&resolver);

        let mut wad = source.into_wad(chunks);
        let extracted = extractor.extract_all(&mut wad, output_path).unwrap();

        assert_eq!(extracted, 0);
    }

    #[test]
    fn test_extractor_builder_pattern() {
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::sync::Arc;

        let resolver = HexPathResolver;
        let called = Arc::new(AtomicBool::new(false));
        let called_clone = called.clone();

        // Test that builder pattern works correctly
        let _extractor = WadExtractor::new(&resolver)
            .with_filter(PrefixFilter::new("assets/"))
            .with_type_filter(vec![LeagueFileKind::Png, LeagueFileKind::Jpeg])
            .on_progress(move |_| {
                called_clone.store(true, Ordering::SeqCst);
            });

        // Builder compiles and type inference works
    }

    // =============================================================================
    // Regex Filter Tests (feature-gated)
    // =============================================================================

    #[cfg(feature = "regex")]
    mod regex_tests {
        use super::*;

        #[test]
        fn test_regex_filter_matches_pattern() {
            let filter = RegexFilter::new(r"^assets/.*\.bin$").unwrap();

            assert!(filter.matches("assets/champions/aatrox.bin"));
            assert!(filter.matches("assets/test.bin"));
            assert!(!filter.matches("data/test.bin"));
            assert!(!filter.matches("assets/test.png"));
        }

        #[test]
        fn test_regex_filter_complex_patterns() {
            let filter = RegexFilter::new(r"champions/(aatrox|ahri|akali)/").unwrap();

            assert!(filter.matches("assets/champions/aatrox/skin0.bin"));
            assert!(filter.matches("data/champions/ahri/animations.anm"));
            assert!(filter.matches("champions/akali/test"));
            assert!(!filter.matches("champions/ashe/test"));
        }

        #[test]
        fn test_regex_filter_invalid_pattern_returns_none() {
            let filter = RegexFilter::new(r"[invalid");
            assert!(filter.is_none());
        }

        #[test]
        fn test_regex_filter_from_compiled_regex() {
            let regex = regex::Regex::new(r"\.png$").unwrap();
            let filter = RegexFilter::from_regex(regex);

            assert!(filter.matches("test.png"));
            assert!(!filter.matches("test.jpg"));
        }
    }
}
