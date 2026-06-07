/* Hash database management — ported from Flint. Hashes are prebuilt LMDB databases
   pulled from the `RitoShark/lmdb-hashes` GitHub releases and stored in the shared
   RitoShark hash dir (%APPDATA%/RitoShark/Requirements/Hashes). No ritobin, no
   CommunityDragon text files. */

use quartz_lib::hash::{
    download_hashes as core_download_hashes, drop_lmdb_cache, get_hash_dir, get_wad_env,
    DownloadStats,
};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HashStatus {
    pub dir: String,
    /// Whether both LMDBs are present on disk.
    pub present: bool,
    /// Approximate combined entry count (data.mdb size heuristic).
    pub loaded_count: usize,
    pub last_updated: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResult {
    pub downloaded: usize,
    pub skipped: usize,
    pub errors: usize,
}

impl From<DownloadStats> for DownloadResult {
    fn from(s: DownloadStats) -> Self {
        DownloadResult { downloaded: s.downloaded, skipped: s.skipped, errors: s.errors }
    }
}

#[tauri::command]
pub fn get_hash_status() -> Result<HashStatus, String> {
    let hash_dir = get_hash_dir().map_err(|e| e.to_string())?;

    let wad_mdb = hash_dir.join("hashes-wad.lmdb").join("data.mdb");
    let bin_mdb = hash_dir.join("hashes-bin.lmdb").join("data.mdb");
    let wad_bytes = std::fs::metadata(&wad_mdb).map(|m| m.len()).unwrap_or(0);
    let bin_bytes = std::fs::metadata(&bin_mdb).map(|m| m.len()).unwrap_or(0);
    let present = wad_mdb.exists() && bin_mdb.exists();
    let loaded_count = ((wad_bytes + bin_bytes) / 40) as usize;

    let last_updated = std::fs::metadata(hash_dir.join("hashes-meta.json"))
        .or_else(|_| std::fs::metadata(&hash_dir))
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|time| {
            time.duration_since(std::time::SystemTime::UNIX_EPOCH).ok().map(|d| {
                chrono::DateTime::from_timestamp(d.as_secs() as i64, 0)
                    .unwrap_or_default()
                    .format("%Y-%m-%dT%H:%M:%SZ")
                    .to_string()
            })
        });

    Ok(HashStatus {
        dir: hash_dir.to_string_lossy().into_owned(),
        present,
        loaded_count,
        last_updated,
    })
}

/* Download (or refresh) the prebuilt LMDB hash databases. `force` re-downloads
   regardless of the cached release tag. Large (~50-80 MB each), so it's an
   explicit user action. */
#[tauri::command]
pub async fn download_hashes(force: bool) -> Result<DownloadResult, String> {
    let hash_dir = get_hash_dir().map_err(|e| e.to_string())?;
    // Drop any open envs so Windows can replace the mmap'd data.mdb.
    drop_lmdb_cache();
    let stats = core_download_hashes(&hash_dir, force)
        .await
        .map_err(|e| format!("Failed to download hashes: {}", e))?;
    // Warm the WAD env after a successful pull.
    let _ = get_wad_env(&hash_dir.to_string_lossy());
    Ok(stats.into())
}

/// Re-sync hashes from the latest release (no forced tag bypass).
#[tauri::command]
pub async fn reload_hashes() -> Result<DownloadResult, String> {
    download_hashes(false).await
}

/// Force a full re-download regardless of the local release-tag cache.
#[tauri::command]
pub async fn force_rebuild_hashes() -> Result<DownloadResult, String> {
    download_hashes(true).await
}
