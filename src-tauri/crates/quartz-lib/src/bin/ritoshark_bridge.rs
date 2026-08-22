//! Compatibility bridge to RitoShark's `rs_bin` for BIN file handling.
//!
//! This module provides a simplified interface to RitoShark's BIN reader/writer
//! and ritobin text printer/parser, wrapping their APIs for use throughout the
//! application. Hash-name resolution for the text form goes through a globally
//! cached `HashMapper` populated from the `hashes-bin.lmdb` dictionary, plus
//! `file =` game paths resolved on demand from `hashes-wad.lmdb` (see
//! [`tree_to_text_cached`]).

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
    Ok(ritoshark::bin::to_text(tree, Some(hashes)))
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

/// Collect every `file =` hash (xxh64 WAD path) reachable in `tree`.
///
/// `BinValue::File` is the only xxh64-typed value a BIN carries, so this is
/// the exact set of hashes that need the WAD dictionary. Typical champion bins
/// hold a few dozen to a few hundred.
fn collect_file_hashes(tree: &Bin, out: &mut Vec<u64>) {
    use ritoshark::bin::BinValue;

    fn walk(v: &BinValue, out: &mut Vec<u64>) {
        match v {
            BinValue::File(h) => {
                if *h != 0 {
                    out.push(*h);
                }
            }
            BinValue::List { items, .. } => {
                for it in items {
                    walk(it, out);
                }
            }
            BinValue::Map { entries, .. } => {
                for (k, val) in entries {
                    walk(k, out);
                    walk(val, out);
                }
            }
            BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => {
                for f in fields.values() {
                    walk(f, out);
                }
            }
            BinValue::Option { value, .. } => {
                if let Some(inner) = value {
                    walk(inner, out);
                }
            }
            // Everything else is a primitive or a 32-bit hash: no xxh64 inside.
            _ => {}
        }
    }

    for entry in &tree.entries {
        for f in entry.fields.values() {
            walk(f, out);
        }
    }
    for patch in &tree.patches {
        walk(&patch.value, out);
    }
}

/// Resolve `file =` hashes against `hashes-wad.lmdb` via point lookups.
///
/// `hashes` must be sorted and deduped by the caller.
///
/// The WAD dictionary is ~250 MB / 2.29M entries, so it is deliberately NOT
/// slurped into the global `HashMapper` the way BIN hashes are. A bin only
/// references a handful of paths, so we look up exactly those. Widened 32-bit
/// BIN hashes and xxh64 WAD hashes cannot collide in the shared `u64` keyspace:
/// every WAD hash in the dictionary is >= 2^32.
fn resolve_file_hashes(hashes: &[u64]) -> Vec<(u64, String)> {
    use crate::hash::{downloader::get_hash_dir, get_wad_env};

    if hashes.is_empty() {
        return Vec::new();
    }

    let Ok(hash_dir) = get_hash_dir() else {
        return Vec::new();
    };
    let hash_dir = hash_dir.to_string_lossy().into_owned();

    let Some(env) = get_wad_env(&hash_dir) else {
        tracing::warn!(
            "WAD LMDB not found at {}/hashes-wad.lmdb - `file =` values will print as hex",
            hash_dir
        );
        return Vec::new();
    };
    let Ok(rtxn) = env.read_txn() else {
        return Vec::new();
    };
    let Ok(Some(db)) =
        env.open_database::<heed::types::Bytes, heed::types::Str>(&rtxn, Some("wad"))
    else {
        tracing::warn!("WAD LMDB has no 'wad' named database");
        return Vec::new();
    };

    // Caller already sorted and deduped, so this walks the mapped file in key
    // order: LMDB page access stays local instead of random-faulting.
    let mut out = Vec::with_capacity(hashes.len());
    for &h in hashes {
        let key = h.to_be_bytes();
        if let Ok(Some(path)) = db.get(&rtxn, &key[..]) {
            out.push((h, path.to_string()));
        }
    }
    out
}

/// Convert a Bin to ritobin text format using the cached hash mapper
///
/// This is the preferred method for BIN conversion as it reuses the globally
/// cached hash mapper instead of loading from disk each time.
///
/// On top of the cached BIN dictionary, this resolves the tree's `file =`
/// values against the WAD dictionary so game paths print as real paths instead
/// of `0x...` hex.
pub fn tree_to_text_cached(tree: &Bin) -> Result<String> {
    let mut file_hashes = Vec::new();
    collect_file_hashes(tree, &mut file_hashes);

    // Only look up hashes the shared mapper hasn't already learned. Converting a
    // folder of bins repeatedly hits the same paths, so after the first few
    // files this usually resolves to nothing and skips the LMDB entirely.
    let unknown: Vec<u64> = {
        let hashes = get_cached_bin_hashes().read();
        let mut u: Vec<u64> = file_hashes
            .into_iter()
            .filter(|h| !hashes.contains(*h))
            .collect();
        u.sort_unstable();
        u.dedup();
        u
    };

    if !unknown.is_empty() {
        let resolved = resolve_file_hashes(&unknown);
        if !resolved.is_empty() {
            // Fold the resolved paths into the shared mapper instead of cloning
            // it per conversion: the BIN dictionary is ~533K entries / ~31 MB of
            // names, so a per-file clone would cost that much copying on every
            // bin (the "convert whole folder" path converts hundreds). These are
            // permanent hash->path facts and the keyspaces cannot collide, so
            // caching them is safe and makes repeat conversions free.
            let mut w = get_cached_bin_hashes().write();
            for (h, path) in resolved {
                w.insert(h, path);
            }
        }
    }

    let hashes = get_cached_bin_hashes().read();
    tree_to_text_with_hashes(tree, &hashes)
}

/// Resolve one `file =` (xxh64) hash to its asset path.
///
/// Checks the shared mapper first, then the WAD dictionary on a miss, folding
/// anything it finds back into the mapper. The bulk [`collect_hashed_assets`]
/// path is preferred when resolving many hashes at once — this exists for the
/// callers that hold one hash at a time (consolidate's protected-asset scan).
pub(crate) fn resolve_file_hash(hash: u64) -> Option<String> {
    if hash == 0 {
        return None;
    }
    if let Some(p) = get_cached_bin_hashes().read().get(hash) {
        return Some(p.to_string());
    }
    let resolved = resolve_file_hashes(&[hash]);
    let found = resolved.iter().find(|(h, _)| *h == hash).map(|(_, p)| p.clone());
    if !resolved.is_empty() {
        let mut w = get_cached_bin_hashes().write();
        for (h, path) in resolved {
            w.insert(h, path);
        }
    }
    found
}

/// Collect every asset path a BIN references through its HASHED value types
/// (`File` = xxh64 WAD path, `Hash`/`Link` = fnv1a32 BIN path), resolved to
/// real paths. This is the counterpart to the plaintext-`String` scan the
/// extractor already does — Riot is migrating asset refs from `string =` to
/// `file =` / `link =`, so a String-only scan silently drops them.
///
/// Resolution reuses the shared caches: `File`(xxh64) via the WAD dictionary
/// (looked up on demand, folded into the shared mapper), `Hash`/`Link`(fnv1a32)
/// via the BIN dictionary. Hashes that resolve to nothing are returned as their
/// bare hex form (`0x...` for u32, 16-hex for u64) in `unresolved`, so the caller
/// can still extract the chunk by hash and flag it for the reverse-map — never
/// silently dropped.
///
/// `out` receives resolved asset paths (lowercased, forward-slash). `unresolved`
/// receives the raw hashes that had no dictionary entry.
pub(crate) fn collect_hashed_assets(
    tree: &Bin,
    out: &mut std::collections::HashSet<String>,
    unresolved_files: &mut std::collections::HashSet<u64>,
    unresolved_bins: &mut std::collections::HashSet<u32>,
) {
    use ritoshark::bin::BinValue;

    // 1. Gather every File(u64) and Hash/Link(u32) hash in the tree.
    let mut file_hashes: Vec<u64> = Vec::new();
    let mut bin_hashes: Vec<u32> = Vec::new();

    fn walk(v: &BinValue, files: &mut Vec<u64>, bins: &mut Vec<u32>) {
        match v {
            BinValue::File(h) => {
                if *h != 0 {
                    files.push(*h);
                }
            }
            // Hash and Link are both fnv1a32 into the BIN namespace. A Link points
            // at a bin OBJECT (handled by the linked-bin graph walk elsewhere), but
            // a Hash is frequently an asset path-hash, so resolve both — a Link that
            // resolves to a non-bin asset path is still worth pulling in, and one
            // that resolves to a .bin is filtered by the caller's `.ends_with(".bin")`.
            BinValue::Hash(h) | BinValue::Link(h) => {
                if *h != 0 {
                    bins.push(*h);
                }
            }
            BinValue::List { items, .. } => {
                for it in items {
                    walk(it, files, bins);
                }
            }
            BinValue::Map { entries, .. } => {
                for (k, val) in entries {
                    walk(k, files, bins);
                    walk(val, files, bins);
                }
            }
            BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => {
                for f in fields.values() {
                    walk(f, files, bins);
                }
            }
            BinValue::Option { value, .. } => {
                if let Some(inner) = value {
                    walk(inner, files, bins);
                }
            }
            _ => {}
        }
    }

    for entry in &tree.entries {
        for f in entry.fields.values() {
            walk(f, &mut file_hashes, &mut bin_hashes);
        }
    }
    for patch in &tree.patches {
        walk(&patch.value, &mut file_hashes, &mut bin_hashes);
    }

    file_hashes.sort_unstable();
    file_hashes.dedup();
    bin_hashes.sort_unstable();
    bin_hashes.dedup();

    // 2. File(xxh64): resolve unknowns against the WAD dictionary, fold into the
    //    shared mapper (same pattern as tree_to_text_cached), then read paths out.
    {
        let unknown: Vec<u64> = {
            let known = get_cached_bin_hashes().read();
            file_hashes
                .iter()
                .copied()
                .filter(|h| known.get(*h).is_none())
                .collect()
        };
        if !unknown.is_empty() {
            let resolved = resolve_file_hashes(&unknown);
            if !resolved.is_empty() {
                let mut w = get_cached_bin_hashes().write();
                for (h, path) in resolved {
                    w.insert(h, path);
                }
            }
        }
    }

    // 3. Read every File + Hash/Link path out of the (now-updated) shared mapper.
    //    fnv1a32 keys are stored widened to u64 (keyspaces can't collide — every
    //    WAD hash is >= 2^32), so both lookups go through the same mapper.
    let mapper = get_cached_bin_hashes().read();
    let mut push_path = |p: &str, out: &mut std::collections::HashSet<String>| {
        let lower = p.to_lowercase().replace('\\', "/");
        if (lower.contains("assets/") || lower.contains("data/")) && !lower.ends_with(".bin") {
            out.insert(p.to_string());
        }
    };
    for h in &file_hashes {
        match mapper.get(*h) {
            Some(p) => push_path(p, out),
            None => {
                unresolved_files.insert(*h);
            }
        }
    }
    for h in &bin_hashes {
        match mapper.get(*h as u64) {
            Some(p) => push_path(p, out),
            None => {
                unresolved_bins.insert(*h);
            }
        }
    }
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
