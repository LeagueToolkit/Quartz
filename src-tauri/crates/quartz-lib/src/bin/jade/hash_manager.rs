use parking_lot::RwLock;
use std::sync::OnceLock;
use crate::hash::{get_bin_env, downloader::get_hash_dir};

/// High-performance hash manager with sorted arrays and binary search.
/// Matches the C# HashManager design: packed offset+length in a single
/// byte pool to minimize allocations.
#[derive(Default)]
pub struct HashManager {
    fnv_keys: Vec<u32>,
    fnv_data: Vec<u64>, // packed: (offset << 16) | length
    xxh_keys: Vec<u64>,
    xxh_data: Vec<u64>, // packed: (offset << 16) | length
    string_storage: Vec<u8>,
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

    /// Look up an XXH64 hash name.
    pub fn get_xxh64(&self, hash: u64) -> Option<&str> {
        let idx = self.xxh_keys.binary_search(&hash).ok()?;
        let dat = self.xxh_data[idx];
        let offset = (dat >> 16) as usize;
        let length = (dat & 0xFFFF) as usize;
        std::str::from_utf8(&self.string_storage[offset..offset + length]).ok()
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

    let env = match get_bin_env(&hash_dir) {
        Some(e) => e,
        None => {
            tracing::warn!("[jade::hash_manager] hashes-bin.lmdb not found at {}", hash_dir);
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
            mgr.fnv_data.push(((str_offset as u64) << 16) | (name_bytes.len() as u64 & 0xFFFF));
            count += 1;
        }
    }

    // Must be sorted for binary_search
    sort_parallel(&mut mgr.fnv_keys, &mut mgr.fnv_data);

    tracing::info!("[jade::hash_manager] Loaded {} BIN hashes from LMDB", count);
    mgr
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
