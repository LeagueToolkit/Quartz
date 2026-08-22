use crate::hash::{downloader::get_hash_dir, get_bin_env, get_wad_env};
use heed::types::{Bytes, Str};
use heed::Database;
use parking_lot::RwLock;
use std::sync::{Arc, OnceLock};

/// High-performance hash manager with sorted arrays and binary search.
/// Matches the C# HashManager design: packed offset+length in a single
/// byte pool to minimize allocations.
///
/// BIN hashes (FNV1a, `hashes-bin.lmdb`, ~40 MB) are loaded eagerly into the
/// sorted arrays. WAD path hashes (xxh64, `hashes-wad.lmdb`) are NOT: that
/// database is ~250 MB and a single .bin references only a few dozen `file =`
/// paths, so slurping it would cost a full sequential read plus ~250 MB
/// resident to answer a handful of lookups. Instead we keep the memory-mapped
/// env and do point lookups; the OS pages in only the B-tree nodes touched.
#[derive(Default)]
pub struct HashManager {
    fnv_keys: Vec<u32>,
    fnv_data: Vec<u64>, // packed: (offset << 16) | length
    string_storage: Vec<u8>,
    /// Memory-mapped `hashes-wad.lmdb` env + its named `"wad"` DB handle, for
    /// on-demand `file =` resolution. The `Database` handle is cheap to copy
    /// and valid for the life of the env, so it is opened once here rather
    /// than per lookup.
    wad: Option<(Arc<heed::Env>, Database<Bytes, Str>)>,
}

impl HashManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Look up an FNV1a hash name.
    pub fn get_fnv1a(&self, hash: u32) -> Option<&str> {
        let idx = self.fnv_keys.binary_search(&hash).ok()?;
        let dat = self.fnv_data[idx];
        let offset = (dat >> 16) as usize;
        let length = (dat & 0xFFFF) as usize;
        std::str::from_utf8(&self.string_storage[offset..offset + length]).ok()
    }

    /// Look up an XXH64 WAD path hash (a bin's `file =` values).
    ///
    /// Point lookup against the memory-mapped `hashes-wad.lmdb`. Returns an
    /// owned `String` rather than `&str` because the value borrows the read
    /// transaction, which cannot outlive this call.
    pub fn get_xxh64(&self, hash: u64) -> Option<String> {
        let (env, db) = self.wad.as_ref()?;
        let rtxn = env.read_txn().ok()?;
        let key = hash.to_be_bytes();
        db.get(&rtxn, &key[..]).ok().flatten().map(str::to_owned)
    }
}

fn sort_parallel(keys: &mut Vec<u32>, data: &mut Vec<u64>) {
    let mut indices: Vec<usize> = (0..keys.len()).collect();
    indices.sort_by_key(|&i| keys[i]);
    let sorted_keys: Vec<u32> = indices.iter().map(|&i| keys[i]).collect();
    let sorted_data: Vec<u64> = indices.iter().map(|&i| data[i]).collect();
    *keys = sorted_keys;
    *data = sorted_data;
}

fn load_from_lmdb() -> HashManager {
    let hash_dir = match get_hash_dir() {
        Ok(d) => d.to_string_lossy().into_owned(),
        Err(e) => {
            tracing::warn!("[jade::hash_manager] Failed to get hash dir: {}", e);
            return HashManager::new();
        }
    };

    let mut mgr = load_bin_hashes(&hash_dir);

    // Attach the WAD env so `file =` values (xxh64 game paths) resolve to real
    // paths instead of printing as `0x...` hex. Not slurped into RAM; see the
    // note on `HashManager`. Done outside `load_bin_hashes` so a missing or
    // broken BIN db does not also cost us `file =` resolution.
    mgr.wad = attach_wad_env(&hash_dir);

    mgr
}

/// Eagerly load the FNV1a BIN hashes into the sorted arrays.
fn load_bin_hashes(hash_dir: &str) -> HashManager {
    let env = match get_bin_env(hash_dir) {
        Some(e) => e,
        None => {
            tracing::warn!(
                "[jade::hash_manager] hashes-bin.lmdb not found at {}",
                hash_dir
            );
            return HashManager::new();
        }
    };

    let rtxn = match env.read_txn() {
        Ok(t) => t,
        Err(e) => {
            tracing::warn!("[jade::hash_manager] LMDB read txn failed: {}", e);
            return HashManager::new();
        }
    };

    let db = match env.open_database::<heed::types::Bytes, heed::types::Str>(&rtxn, Some("bin")) {
        Ok(Some(d)) => d,
        Ok(None) => {
            tracing::warn!("[jade::hash_manager] No 'bin' named DB in hashes-bin.lmdb");
            return HashManager::new();
        }
        Err(e) => {
            tracing::warn!("[jade::hash_manager] Failed to open 'bin' DB: {}", e);
            return HashManager::new();
        }
    };

    let iter = match db.iter(&rtxn) {
        Ok(i) => i,
        Err(e) => {
            tracing::warn!("[jade::hash_manager] LMDB iter failed: {}", e);
            return HashManager::new();
        }
    };

    let mut mgr = HashManager::new();
    let mut count = 0usize;
    for (key_bytes, name) in iter.flatten() {
        if key_bytes.len() == 4 {
            let hash = u32::from_be_bytes([key_bytes[0], key_bytes[1], key_bytes[2], key_bytes[3]]);
            let name_bytes = name.as_bytes();
            let str_offset = mgr.string_storage.len();
            mgr.string_storage.extend_from_slice(name_bytes);
            mgr.fnv_keys.push(hash);
            mgr.fnv_data
                .push(((str_offset as u64) << 16) | (name_bytes.len() as u64 & 0xFFFF));
            count += 1;
        }
    }

    // Must be sorted for binary_search
    sort_parallel(&mut mgr.fnv_keys, &mut mgr.fnv_data);

    tracing::info!("[jade::hash_manager] Loaded {} BIN hashes from LMDB", count);
    mgr
}

/// Open `hashes-wad.lmdb` and its named `"wad"` DB, for on-demand lookups.
fn attach_wad_env(hash_dir: &str) -> Option<(Arc<heed::Env>, Database<Bytes, Str>)> {
    let env = match get_wad_env(hash_dir) {
        Some(e) => e,
        None => {
            tracing::warn!(
                "[jade::hash_manager] hashes-wad.lmdb not found at {} - `file =` values will print as hex",
                hash_dir
            );
            return None;
        }
    };

    // The DB handle outlives this txn (heed ties handles to the env, not the
    // txn), so the read txn is only needed to open it.
    let rtxn = match env.read_txn() {
        Ok(t) => t,
        Err(e) => {
            tracing::warn!("[jade::hash_manager] WAD LMDB read txn failed: {}", e);
            return None;
        }
    };
    let db = match env.open_database::<Bytes, Str>(&rtxn, Some("wad")) {
        Ok(Some(d)) => d,
        Ok(None) => {
            tracing::warn!("[jade::hash_manager] No 'wad' named DB in hashes-wad.lmdb");
            return None;
        }
        Err(e) => {
            tracing::warn!("[jade::hash_manager] Failed to open 'wad' DB: {}", e);
            return None;
        }
    };
    drop(rtxn);

    tracing::info!("[jade::hash_manager] Attached WAD hash LMDB for `file =` resolution");
    Some((env, db))
}

/// Global cached hash manager. Uses RwLock so it can be refreshed in-process.
static JADE_HASHES: OnceLock<RwLock<HashManager>> = OnceLock::new();

/// Get or initialize the cached hash manager.
pub fn get_cached_hashes() -> &'static RwLock<HashManager> {
    JADE_HASHES.get_or_init(|| RwLock::new(load_from_lmdb()))
}

/// Reload the Jade hash cache from LMDB (call after a successful hash download).
pub fn reload_jade_hashes() {
    if let Some(lock) = JADE_HASHES.get() {
        *lock.write() = load_from_lmdb();
        tracing::info!("[jade::hash_manager] Jade hash cache reloaded");
    }
}

/// Release the WAD LMDB env this manager holds, WITHOUT discarding the loaded
/// fnv1a32 tables.
///
/// **Required before replacing `hashes-wad.lmdb/data.mdb` on Windows.**
/// `heed::Env` unmaps the file only when its LAST `Arc` drops, and this manager
/// keeps one for the process lifetime (`JADE_HASHES` is a never-dropped
/// `OnceLock`). So `lmdb_cache::drop_lmdb_cache()` clearing the cache slot
/// released only ONE refcount, the mapping stayed live, and the download's
/// swap failed every single time:
///
/// ```text
///   WARN  Could not remove old data.mdb ...: used by another process. (os error 32)
///   ERROR Failed to rename data.mdb.tmp -> data.mdb: Access is denied. (os error 5)
/// ```
///
/// which left the hash DBs permanently pinned to whatever snapshot installed first.
///
/// Only the env is dropped: the in-memory fnv/string tables stay, so `hash =` /
/// `link =` resolution keeps working during the swap. `file =` resolution falls
/// back to hex until [`reload_jade_hashes`] re-attaches.
pub fn detach_envs() {
    if let Some(lock) = JADE_HASHES.get() {
        let mut mgr = lock.write();
        if mgr.wad.take().is_some() {
            tracing::info!("[jade::hash_manager] Detached WAD hash LMDB for replacement");
        }
    }
}
