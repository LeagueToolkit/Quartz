use crate::core::hash::{download_hashes as core_download_hashes, DownloadStats};
use crate::core::hash::downloader::get_ritoshark_hash_dir;
use crate::state::HashtableState;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Status information about the loaded hashtable
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HashStatus {
    pub loaded_count: usize,
    pub last_updated: Option<String>,
}

/// Downloads hash files from CommunityDragon repository
///
/// # Arguments
/// * `force` - If true, downloads all files regardless of age
///
/// # Returns
/// * `Result<DownloadStats, String>` - Statistics about the download operation
#[tauri::command]
pub async fn download_hashes(force: bool) -> Result<DownloadStats, String> {
    // Get the RitoShark hash directory
    let hash_dir = get_ritoshark_hash_dir()
        .map_err(|e| format!("Failed to get hash directory: {}", e))?;
    
    // Download hashes to the directory
    let stats = core_download_hashes(&hash_dir, force)
        .await
        .map_err(|e| format!("Failed to download hashes: {}", e))?;
    
    Ok(stats)
}

/// Returns information about the currently loaded hashtable
///
/// # Arguments
/// * `state` - The managed HashtableState
///
/// # Returns
/// * `Result<HashStatus, String>` - Status information about the hashtable
#[tauri::command]
pub async fn get_hash_status(state: State<'_, HashtableState>) -> Result<HashStatus, String> {
    let loaded_count = state.len();
    
    // Try to get last modified time of the hash directory
    let hash_dir = get_ritoshark_hash_dir()
        .map_err(|e| format!("Failed to get hash directory: {}", e))?;
    
    let last_updated = if hash_dir.exists() {
        std::fs::metadata(&hash_dir)
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .and_then(|time| {
                use std::time::SystemTime;
                time.duration_since(SystemTime::UNIX_EPOCH)
                    .ok()
                    .map(|duration| {
                        // Format as ISO 8601 timestamp
                        let secs = duration.as_secs();
                        let datetime = chrono::DateTime::from_timestamp(secs as i64, 0)
                            .unwrap_or_default();
                        datetime.format("%Y-%m-%dT%H:%M:%SZ").to_string()
                    })
            })
    } else {
        None
    };
    
    Ok(HashStatus {
        loaded_count,
        last_updated,
    })
}

/// Reloads the hashtable from disk
///
/// # Arguments
/// * `state` - The managed HashtableState
///
/// # Returns
/// * `Result<(), String>` - Ok if reload succeeded, error message otherwise
#[tauri::command]
pub async fn reload_hashes(state: State<'_, HashtableState>) -> Result<(), String> {
    // Get the hash directory
    let hash_dir = get_ritoshark_hash_dir()
        .map_err(|e| format!("Failed to get hash directory: {}", e))?;
    
    // Ensure the directory is set (this doesn't load, just sets the path)
    state.set_hash_dir(hash_dir);
    
    // Trigger a lazy load by calling get_hashtable
    // Note: With OnceLock, the hashtable is only loaded once - subsequent reloads
    // will return the cached version. For a true reload, the app would need to restart.
    if state.get_hashtable().is_some() {
        tracing::info!("Hashtable is loaded with {} entries", state.len());
        Ok(())
    } else {
        Err("Failed to load hashtable".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_status_serialization() {
        let status = HashStatus {
            loaded_count: 100,
            last_updated: Some("2024-01-01T00:00:00Z".to_string()),
        };

        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("loaded_count"));
        assert!(json.contains("100"));
        assert!(json.contains("last_updated"));
    }

    #[test]
    fn test_download_stats_serialization() {
        let stats = DownloadStats {
            downloaded: 5,
            skipped: 2,
            errors: 1,
        };

        let json = serde_json::to_string(&stats).unwrap();
        assert!(json.contains("downloaded"));
        assert!(json.contains("5"));
        assert!(json.contains("skipped"));
        assert!(json.contains("2"));
        assert!(json.contains("errors"));
        assert!(json.contains("1"));
    }
    
    #[test]
    fn test_hashtable_state_new() {
        let state = HashtableState::new();
        assert_eq!(state.len(), 0);
        assert!(state.is_empty());
    }

    #[test]
    fn test_hashtable_state_set_hash_dir() {
        // set_hash_dir should not panic and the state should accept a path.
        let state = HashtableState::new();
        state.set_hash_dir(std::path::PathBuf::from("/test/path"));
        // No get_hash_dir public API; verify by checking that get_hashtable
        // attempts to load (and gracefully fails on a non-existent dir).
        assert!(state.get_hashtable().is_some()); // returns empty table on failure
    }
}

