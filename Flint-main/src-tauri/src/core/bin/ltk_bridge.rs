//! Compatibility bridge to ltk_meta and ltk_ritobin for BIN file handling.
//!
//! This module provides a simplified interface to the League Toolkit libraries,
//! wrapping their APIs for use throughout the application.

use std::io::Cursor;
use std::sync::OnceLock;
use parking_lot::RwLock;
use ltk_meta::{BinTree, BinTreeObject};

/// Maximum allowed BIN file size (50MB - no legitimate BIN should be larger)
pub const MAX_BIN_SIZE: usize = 50 * 1024 * 1024;

/// Error type for BIN operations
#[derive(Debug)]
pub struct BinError(pub String);

impl std::fmt::Display for BinError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for BinError {}

/// Result type for BIN operations
pub type Result<T> = std::result::Result<T, BinError>;

/// Read a binary BIN file from bytes.
///
/// # Arguments
/// * `data` - The binary data to parse
///
/// # Returns
/// A `BinTree` structure containing the parsed data
///
/// # Safety
/// This function validates file size and magic bytes to prevent memory issues
/// from corrupt files. Files larger than 50MB are rejected.
pub fn read_bin(data: &[u8]) -> Result<BinTree> {
    // DEFENSIVE: Log file info before parsing
    tracing::debug!(
        "read_bin: size={} bytes, magic={:02x?}",
        data.len(),
        &data[..std::cmp::min(8, data.len())]
    );

    // Reject obviously corrupt files (too large)
    if data.len() > MAX_BIN_SIZE {
        tracing::error!(
            "BIN file rejected: {} bytes exceeds max size of {} bytes",
            data.len(),
            MAX_BIN_SIZE
        );
        return Err(BinError(format!(
            "BIN file too large ({} bytes, max {} bytes) - likely corrupt",
            data.len(),
            MAX_BIN_SIZE
        )));
    }

    // Validate BIN magic bytes (PROP or PTCH)
    if data.len() >= 4 {
        let magic = &data[0..4];
        if magic != b"PROP" && magic != b"PTCH" {
            tracing::error!(
                "Invalid BIN magic bytes: {:02x?} (expected PROP or PTCH)",
                magic
            );
            return Err(BinError(format!(
                "Invalid BIN magic bytes: {:02x?} (expected PROP or PTCH)",
                magic
            )));
        }
    } else {
        tracing::error!("BIN file too small: {} bytes (minimum 4 bytes for magic)", data.len());
        return Err(BinError(format!(
            "BIN file too small ({} bytes, minimum 4 bytes for magic)",
            data.len()
        )));
    }

    // catch_unwind to handle OOM panics from ltk_meta
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        // CRITICAL: Print right before the dangerous call - flush to ensure visibility before crash
        use std::io::Write;
        println!("[ltk_bridge] Calling BinTree::from_reader ({} bytes)...", data.len());
        let _ = std::io::stdout().flush();
        
        let mut cursor = Cursor::new(data);
        BinTree::from_reader(&mut cursor)
    }));

    match result {
        Ok(Ok(tree)) => {
            tracing::debug!(
                "Successfully parsed BIN: {} objects, {} dependencies",
                tree.objects.len(),
                tree.dependencies.len()
            );
            Ok(tree)
        }
        Ok(Err(e)) => {
            tracing::error!("BIN parse failed: {} (file was {} bytes)", e, data.len());
            Err(BinError(format!("Failed to parse bin: {}", e)))
        }
        Err(panic_info) => {
            let panic_msg = if let Some(s) = panic_info.downcast_ref::<&str>() {
                s.to_string()
            } else if let Some(s) = panic_info.downcast_ref::<String>() {
                s.clone()
            } else {
                "unknown panic".to_string()
            };
            tracing::error!(
                "CRITICAL: Parser panicked on {} byte file: {}",
                data.len(),
                panic_msg
            );
            Err(BinError(format!(
                "Parser panicked (likely OOM or stack overflow): {}",
                panic_msg
            )))
        }
    }
}

/// Write a BinTree to binary format.
///
/// # Arguments
/// * `tree` - The BinTree to serialize
///
/// # Returns
/// A Vec<u8> containing the binary data
pub fn write_bin(tree: &BinTree) -> Result<Vec<u8>> {
    let mut buffer = Cursor::new(Vec::new());
    tree.to_writer(&mut buffer)
        .map_err(|e| BinError(format!("Failed to write bin: {}", e)))?;
    Ok(buffer.into_inner())
}

/// Convert a BinTree to ritobin text format.
///
/// # Arguments
/// * `tree` - The BinTree to convert
///
/// # Returns
/// A String containing the ritobin text format
pub fn tree_to_text(tree: &BinTree) -> Result<String> {
    ltk_ritobin::write(tree)
        .map_err(|e| BinError(format!("Failed to convert to text: {}", e)))
}

/// Convert a BinTree to ritobin text format with hash name lookup.
///
/// # Arguments
/// * `tree` - The BinTree to convert
/// * `hashes` - Hash provider for name lookup
///
/// # Returns
/// A String containing the ritobin text format with resolved names
pub fn tree_to_text_with_hashes<H: ltk_ritobin::HashProvider>(
    tree: &BinTree,
    hashes: &H,
) -> Result<String> {
    ltk_ritobin::write_with_hashes(tree, hashes)
        .map_err(|e| BinError(format!("Failed to convert to text: {}", e)))
}

/// Load BIN-specific hash files into a HashMapProvider
///
/// Loads hashes from the RitoShark hash directory:
/// - hashes.bintypes.txt (type names)
/// - hashes.binfields.txt (field/property names)
/// - hashes.binentries.txt (entry/object names)
/// - hashes.binhashes.txt (generic hashes)
///
/// Uses the built-in load_from_directory method which properly maps
/// each file to its category (entries, fields, hashes, types).
///
/// # Returns
/// A HashMapProvider populated with all loaded hashes
pub fn load_bin_hashes() -> HashMapProvider {
    let mut hashes = HashMapProvider::new();
    
    // Get the RitoShark hash directory
    let hash_dir = if let Ok(appdata) = std::env::var("APPDATA") {
        std::path::PathBuf::from(appdata)
            .join("RitoShark")
            .join("Requirements")
            .join("Hashes")
    } else {
        tracing::warn!("APPDATA not set, cannot load hash files");
        return hashes;
    };
    
    if !hash_dir.exists() {
        tracing::warn!("Hash directory does not exist: {}", hash_dir.display());
        return hashes;
    }
    
    // Use the built-in load_from_directory method
    // This loads each category from its respective file:
    // - hashes.binentries.txt -> entries (entry path hashes)
    // - hashes.binfields.txt  -> fields (property/field name hashes)
    // - hashes.binhashes.txt  -> hashes (hash value hashes)
    // - hashes.bintypes.txt   -> types (type/class name hashes)
    hashes.load_from_directory(&hash_dir);
    
    let total = hashes.total_count();
    tracing::info!("Loaded {} total BIN hashes for name resolution", total);
    
    hashes
}

/// Global cache for BIN hash provider - loaded once, reused for all conversions
/// This eliminates the massive overhead of loading hash files for every BIN conversion
static BIN_HASHES_CACHE: OnceLock<RwLock<HashMapProvider>> = OnceLock::new();

/// Get or initialize the cached BIN hash provider
/// 
/// This is thread-safe and will only load hashes from disk once.
/// All subsequent calls return the cached version.
pub fn get_cached_bin_hashes() -> &'static RwLock<HashMapProvider> {
    BIN_HASHES_CACHE.get_or_init(|| {
        tracing::info!("Initializing global BIN hash cache...");
        let hashes = load_bin_hashes();
        tracing::info!("Global BIN hash cache initialized with {} hashes", hashes.total_count());
        RwLock::new(hashes)
    })
}

/// Convert a BinTree to ritobin text format using the cached hash provider
/// 
/// This is the preferred method for BIN conversion as it reuses the globally
/// cached hash provider instead of loading from disk each time.
pub fn tree_to_text_cached(tree: &BinTree) -> Result<String> {
    let hashes = get_cached_bin_hashes().read();
    tree_to_text_with_hashes(tree, &*hashes)
}

/// Convert a BinTree to ritobin text format with automatic hash loading
///
/// **DEPRECATED**: Use `tree_to_text_cached()` instead for better performance.
/// This function is kept for backwards compatibility but now uses the cache internally.
#[allow(dead_code)]
pub fn tree_to_text_with_resolved_names(tree: &BinTree) -> Result<String> {
    // Use cached version for performance
    tree_to_text_cached(tree)
}

/// Parse ritobin text format to BinTree.
///
/// # Arguments
/// * `text` - The ritobin text to parse
///
/// # Returns
/// A BinTree structure
pub fn text_to_tree(text: &str) -> Result<BinTree> {
    ltk_ritobin::parse_to_bin_tree(text)
        .map_err(|e| BinError(format!("Failed to parse text: {}", e)))
}

/// Get the list of linked/dependency BIN files from a BinTree.
#[allow(dead_code)]
pub fn get_dependencies(tree: &BinTree) -> &[String] {
    &tree.dependencies
}

/// Set the list of linked/dependency BIN files for a BinTree.
#[allow(dead_code)]
pub fn set_dependencies(tree: &mut BinTree, deps: Vec<String>) {
    tree.dependencies = deps;
}

/// Get an object from the tree by path hash.
#[allow(dead_code)]
pub fn get_object(tree: &BinTree, path_hash: u32) -> Option<&BinTreeObject> {
    tree.objects.get(&path_hash)
}

/// Get a mutable object from the tree by path hash.
#[allow(dead_code)]
pub fn get_object_mut(tree: &mut BinTree, path_hash: u32) -> Option<&mut BinTreeObject> {
    tree.objects.get_mut(&path_hash)
}

/// Insert an object into the tree.
#[allow(dead_code)]
pub fn insert_object(tree: &mut BinTree, object: BinTreeObject) {
    tree.objects.insert(object.path_hash, object);
}

/// Remove an object from the tree by path hash.
#[allow(dead_code)]
pub fn remove_object(tree: &mut BinTree, path_hash: u32) -> Option<BinTreeObject> {
    tree.objects.shift_remove(&path_hash)
}

// Re-export ltk_ritobin types for hash provider support
pub use ltk_ritobin::HashMapProvider;
