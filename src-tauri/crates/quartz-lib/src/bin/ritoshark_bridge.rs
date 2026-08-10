//! Compatibility bridge to RitoShark's `rs_bin` for BIN file handling.
//!
//! This module provides a simplified interface to RitoShark's BIN reader/writer
//! and ritobin text printer/parser, wrapping their APIs for use throughout the
//! application. Hash-name resolution for the text form goes through a globally
//! cached `HashMapper` populated from the `hashes-bin.lmdb` dictionary.

use parking_lot::RwLock;
use ritoshark::bin::Bin;
use ritoshark::hash::HashMapper;
use ritoshark::prelude::{Parse as _, Serialize as _};
use std::sync::OnceLock;

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
/// A `Bin` structure containing the parsed data
///
/// # Safety
/// This function validates file size and magic bytes to prevent memory issues
/// from corrupt files. Files larger than 50MB are rejected.
pub fn read_bin(data: &[u8]) -> Result<Bin> {
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
        tracing::error!(
            "BIN file too small: {} bytes (minimum 4 bytes for magic)",
            data.len()
        );
        return Err(BinError(format!(
            "BIN file too small ({} bytes, minimum 4 bytes for magic)",
            data.len()
        )));
    }

    // catch_unwind to handle OOM panics from the parser
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| Bin::from_bytes(data)));

    match result {
        Ok(Ok(tree)) => {
            tracing::debug!(
                "Successfully parsed BIN: {} entries, {} linked",
                tree.entries.len(),
                tree.linked.len()
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

/// Write a Bin to binary format.
///
/// # Arguments
/// * `tree` - The Bin to serialize
///
/// # Returns
/// A Vec<u8> containing the binary data
pub fn write_bin(tree: &Bin) -> Result<Vec<u8>> {
    tree.to_bytes()
        .map_err(|e| BinError(format!("Failed to write bin: {}", e)))
}

/// Convert a Bin to ritobin text format with hash name lookup.
///
/// # Arguments
/// * `tree` - The Bin to convert
/// * `hashes` - Hash mapper for name lookup
///
/// # Returns
/// A String containing the ritobin text format with resolved names
pub fn tree_to_text_with_hashes(tree: &Bin, hashes: &HashMapper) -> Result<String> {
    /* `AnimationGraphData.mBlendDataTable` keys pack two clip hashes into a u64;
       printed plainly they are meaningless 20-digit integers. `from_text` accepts
       the readable `"From" -> "To"` form and the raw u64 alike, so every text→bin
       path still round-trips whichever form the text carries. */
    let opts = ritoshark::bin::TextOptions { blend_keys: true };
    Ok(ritoshark::bin::to_text_with(tree, Some(hashes), &opts))
}

/// Load BIN hashes from `hashes-bin.lmdb` (named DB `"bin"`, 4-byte BE keys).
///
/// The lmdb-hashes release bundles all 4 BIN hash categories (entries, fields,
/// hashes, types) into a single DB keyed by FNV1a-32. `rs_bin::to_text` resolves
/// every u32 hash by widening it to `u64` (`mapper.get(hash as u64)`), so we
/// insert each 32-bit key as `hash as u64` and a single map covers all categories.
pub fn load_bin_hashes() -> HashMapper {
    use crate::hash::{downloader::get_hash_dir, get_bin_env};

    let mut hashes = HashMapper::new();

    let hash_dir = match get_hash_dir() {
        Ok(dir) => dir.to_string_lossy().into_owned(),
        Err(e) => {
            tracing::warn!("Failed to get hash directory: {}", e);
            return hashes;
        }
    };

    let env = match get_bin_env(&hash_dir) {
        Some(e) => e,
        None => {
            tracing::warn!(
                "BIN LMDB not found at {}/hashes-bin.lmdb — BIN hashes unavailable",
                hash_dir
            );
            return hashes;
        }
    };

    let rtxn = match env.read_txn() {
        Ok(t) => t,
        Err(e) => {
            tracing::warn!("Failed to open BIN LMDB read txn: {}", e);
            return hashes;
        }
    };

    let db = match env.open_database::<heed::types::Bytes, heed::types::Str>(&rtxn, Some("bin")) {
        Ok(Some(d)) => d,
        Ok(None) => {
            tracing::warn!("BIN LMDB has no 'bin' named database");
            return hashes;
        }
        Err(e) => {
            tracing::warn!("Failed to open 'bin' named DB: {}", e);
            return hashes;
        }
    };

    let iter = match db.iter(&rtxn) {
        Ok(i) => i,
        Err(e) => {
            tracing::warn!("Failed to create BIN LMDB iterator: {}", e);
            return hashes;
        }
    };

    let mut count = 0;
    for result in iter {
        match result {
            Ok((key_bytes, path_str)) => {
                if key_bytes.len() == 4 {
                    let hash = u32::from_be_bytes([
                        key_bytes[0],
                        key_bytes[1],
                        key_bytes[2],
                        key_bytes[3],
                    ]);
                    hashes.insert(hash as u64, path_str.to_string());
                    count += 1;
                }
            }
            Err(e) => {
                tracing::warn!("Error reading BIN LMDB entry: {}", e);
            }
        }
    }

    tracing::info!("Loaded {} BIN hashes from hashes-bin.lmdb", count);
    hashes
}

/// Global cache for BIN hash mapper - loaded once, reused for all conversions
/// This eliminates the massive overhead of loading hash files for every BIN conversion
static BIN_HASHES_CACHE: OnceLock<RwLock<HashMapper>> = OnceLock::new();

/// Get or initialize the cached BIN hash mapper
///
/// This is thread-safe and will only load hashes from disk once.
/// All subsequent calls return the cached version.
pub fn get_cached_bin_hashes() -> &'static RwLock<HashMapper> {
    BIN_HASHES_CACHE.get_or_init(|| {
        tracing::info!("Initializing global BIN hash cache...");
        let hashes = load_bin_hashes();
        tracing::info!(
            "Global BIN hash cache initialized with {} hashes",
            hashes.len()
        );
        RwLock::new(hashes)
    })
}

/// Reload the BIN hash cache from disk
///
/// Call this after updating hash files to refresh the cache
pub fn reload_bin_hash_cache() {
    if let Some(cache) = BIN_HASHES_CACHE.get() {
        tracing::info!("Reloading BIN hash cache from disk...");
        let new_hashes = load_bin_hashes();
        let total = new_hashes.len();
        *cache.write() = new_hashes;
        tracing::info!("BIN hash cache reloaded with {} hashes", total);
    }
}

/// Convert a Bin to ritobin text format using the cached hash mapper
///
/// This is the preferred method for BIN conversion as it reuses the globally
/// cached hash mapper instead of loading from disk each time.
pub fn tree_to_text_cached(tree: &Bin) -> Result<String> {
    let hashes = get_cached_bin_hashes().read();
    tree_to_text_with_hashes(tree, &hashes)
}

/// Parse ritobin text format to Bin.
///
/// # Arguments
/// * `text` - The ritobin text to parse
///
/// # Returns
/// A Bin structure
pub fn text_to_tree(text: &str) -> Result<Bin> {
    ritoshark::bin::from_text(text, None)
        .map_err(|e| BinError(format!("Failed to parse text: {}", e)))
}

#[cfg(test)]
mod blend_text_tests {
    use super::*;
    use ritoshark::bin::{BinEntry, BinType, BinValue, BlendKey, BLEND_DATA_TABLE};
    use ritoshark::hash::fnv1a;

    #[test]
    fn blend_keys_print_readable_and_round_trip() {
        let resolved = BlendKey::from_names("Attack1", "Laugh").to_u64();
        let unresolved = ((fnv1a("Attack1") as u64) << 32) | 0xdead_beef;
        let mut fields = indexmap::IndexMap::new();
        fields.insert(
            BLEND_DATA_TABLE,
            BinValue::Map {
                key: BinType::U64,
                value: BinType::F32,
                entries: vec![
                    (BinValue::U64(resolved), BinValue::F32(0.1)),
                    (BinValue::U64(unresolved), BinValue::F32(0.2)),
                ],
            },
        );
        let mut bin = Bin::new();
        bin.entries.push(BinEntry {
            path_hash: 0x1,
            class_hash: 0x2,
            fields,
        });

        let mut mapper = HashMapper::new();
        mapper.insert(fnv1a("Attack1") as u64, "Attack1");
        mapper.insert(fnv1a("Laugh") as u64, "Laugh");

        let text = tree_to_text_with_hashes(&bin, &mapper).unwrap();
        assert!(
            text.contains("\"Attack1\" -> \"Laugh\""),
            "resolved pair readable: {text}"
        );
        assert!(
            text.contains("\"Attack1\" -> 0xdeadbeef"),
            "unresolved half stays hex: {text}"
        );

        let parsed = text_to_tree(&text).unwrap();
        assert_eq!(write_bin(&bin).unwrap(), write_bin(&parsed).unwrap());
    }
}
