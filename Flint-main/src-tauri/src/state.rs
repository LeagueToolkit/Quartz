use parking_lot::Mutex;
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};
use crate::core::hash::Hashtable;

/// Global lazy-loaded hashtable — only initialized on the first call to `get_hashtable`.
static LAZY_HASHTABLE: OnceLock<Arc<Hashtable>> = OnceLock::new();

/// Holds the hash directory path so the hashtable can be loaded on demand.
#[derive(Clone)]
pub struct HashtableState(pub Arc<Mutex<Option<PathBuf>>>);

impl Default for HashtableState {
    fn default() -> Self {
        Self::new()
    }
}

impl HashtableState {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(None)))
    }

    pub fn set_hash_dir(&self, path: PathBuf) {
        *self.0.lock() = Some(path);
    }

    /// Returns the loaded hashtable, lazily initializing it on the first call.
    pub fn get_hashtable(&self) -> Option<Arc<Hashtable>> {
        // Fast path — already loaded.
        if let Some(ht) = LAZY_HASHTABLE.get() {
            return Some(Arc::clone(ht));
        }

        let hash_dir = self.0.lock().clone()?;

        let ht = LAZY_HASHTABLE.get_or_init(|| {
            tracing::info!("Lazy-loading hashtable from {}…", hash_dir.display());
            match Hashtable::from_directory(&hash_dir) {
                Ok(ht)  => { tracing::info!("Hashtable ready: {} entries", ht.len()); Arc::new(ht) }
                Err(e)  => { tracing::warn!("Hashtable load failed: {}", e); Arc::new(Hashtable::empty()) }
            }
        });

        Some(Arc::clone(ht))
    }

    #[allow(clippy::len_without_is_empty)]
    pub fn len(&self) -> usize {
        LAZY_HASHTABLE.get().map_or(0, |h| h.len())
    }
}
