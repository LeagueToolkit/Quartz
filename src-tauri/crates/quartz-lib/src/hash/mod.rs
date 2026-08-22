// Hash module exports
pub mod downloader;
pub mod lmdb_cache;

// Re-export the raw hashers so crates that don't depend on `ritoshark` directly
// (e.g. src-tauri) can hash a path the same way the bin writer does: `xxh64` for
// `file =` values, `fnv1a` for `hash =` / `link =` values.
pub use ritoshark::hash::{fnv1a, xxh64};

pub use downloader::{
    auto_sync, download_hashes, download_hashes_with_progress, get_hash_dir,
    get_ritoshark_hash_dir, hashes_present, is_auto_sync_fresh, no_progress, DownloadStats,
    HashProgress, ProgressSink, AUTO_SYNC_COOLDOWN_MINUTES,
};
pub use lmdb_cache::{
    drop_lmdb_cache, get_bin_env, get_or_open_env, get_wad_env, resolve_bin_hashes_lmdb,
    resolve_hashes_lmdb, resolve_hashes_lmdb_bulk,
};

/// Map of `xxh64 path hash → resolved path`, returned by the WAD-LMDB
/// resolver and consumed everywhere else in the codebase.
///
/// **Layout — arena, not `HashMap<u64, String>`.** A full-game resolve
/// produces ~720K hits and the previous `FxHashMap<u64, String>` paid one
/// heap allocation per hit (~720K mallocs + as many drops on cleanup, plus
/// per-`String` capacity padding wasting ~16-24 bytes/entry). The arena
/// flattens every resolved path into a single `Vec<u8>` and stores the
/// index as `(offset, len)` u32 pairs in an `FxHashMap`. One alloc for the
/// arena, no per-entry alloc, lookups still O(1).
///
/// Keys are xxh64 outputs already, so the index uses `FxHasher` rather than
/// std's SipHash-1-3 (the previous design's other ~700ms tax on a 720K
/// merge).
pub use lmdb_cache::ResolvedHashes;
