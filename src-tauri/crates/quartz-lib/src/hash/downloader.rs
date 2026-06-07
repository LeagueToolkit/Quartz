//! Hash database downloader.
//!
//! Mirrors Quartz's approach: downloads pre-built LMDB databases from
//! [LeagueToolkit/lmdb-hashes](https://github.com/LeagueToolkit/lmdb-hashes)
//! GitHub releases instead of building from CommunityDragon text files.
//!
//! Two separate LMDBs:
//! - `hashes-wad.lmdb` — 64-bit xxh64 WAD path hashes (named DB `"wad"`)
//! - `hashes-bin.lmdb` — 32-bit FNV1a BIN hashes (named DB `"bin"`)
//!
//! Hash dir: `%APPDATA%/RitoShark/Requirements/Hashes/` — shared with other
//! RitoShark tools.

use crate::error::{Error, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::fs;
use tokio::io::AsyncWriteExt;

const RELEASE_API_URL: &str =
    "https://api.github.com/repos/RitoShark/lmdb-hashes/releases/latest";
const META_FILE_NAME: &str = "hashes-meta.json";
const USER_AGENT: &str = "flint-hash-manager";

/// A single LMDB asset published by lmdb-hashes.
struct Asset {
    /// Release asset filename, e.g. `lol-hashes-wad.zst`.
    release_name: &'static str,
    /// LMDB directory name under the hash dir, e.g. `hashes-wad.lmdb`.
    lmdb_dir: &'static str,
    /// Short label for logs/progress events.
    label: &'static str,
}

const ASSETS: &[Asset] = &[
    Asset { release_name: "lol-hashes-wad.zst", lmdb_dir: "hashes-wad.lmdb", label: "WAD hashes" },
    Asset { release_name: "lol-hashes-bin.zst", lmdb_dir: "hashes-bin.lmdb", label: "BIN hashes" },
];

/// Statistics about a hash download operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadStats {
    pub downloaded: usize,
    pub skipped: usize,
    pub errors: usize,
}

/// GitHub release JSON — only the fields we need.
#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: Option<String>,
    assets: Vec<GitHubReleaseAsset>,
}

#[derive(Debug, Deserialize)]
struct GitHubReleaseAsset {
    name: String,
    browser_download_url: String,
}

/// Meta file written next to the LMDBs. Same shape as Quartz's `hashes-meta.json`
/// so both tools can share the hash cache.
#[derive(Debug, Default, Serialize, Deserialize)]
struct HashesMeta {
    #[serde(rename = "releaseTag", skip_serializing_if = "Option::is_none")]
    release_tag: Option<String>,
    #[serde(rename = "updatedAt", skip_serializing_if = "Option::is_none")]
    updated_at: Option<String>,
    #[serde(rename = "lastCheckedAt", skip_serializing_if = "Option::is_none")]
    last_checked_at: Option<String>,
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Returns the hash directory: `%APPDATA%/RitoShark/Requirements/Hashes/`.
pub fn get_hash_dir() -> Result<PathBuf> {
    let appdata = std::env::var("APPDATA")
        .map_err(|_| Error::Hash("APPDATA environment variable not found".to_string()))?;

    Ok(PathBuf::from(appdata).join("RitoShark").join("Requirements").join("Hashes"))
}

/// Legacy alias for [`get_hash_dir`]. Kept for compatibility with existing callers.
pub fn get_ritoshark_hash_dir() -> Result<PathBuf> {
    get_hash_dir()
}

/// Check whether both LMDB `data.mdb` files are already present on disk.
pub fn hashes_present(hash_dir: &Path) -> bool {
    ASSETS.iter().all(|a| hash_dir.join(a.lmdb_dir).join("data.mdb").exists())
}

/// Download hash databases from `lmdb-hashes` GitHub releases.
///
/// # Behaviour
/// - If `force == false` and both LMDB `data.mdb` files are already on disk,
///   returns immediately without touching the network — this is the common
///   case on every startup after the first.
/// - Otherwise hits `releases/latest` to discover the current tag, then
///   downloads any missing assets (or re-downloads all when `force == true`).
/// - Downloads `.zst` into memory, decompresses to `data.mdb.tmp`, then
///   atomically renames over `data.mdb`.
/// - Writes `hashes-meta.json` with the tag + timestamp.
///
/// Re-checking for a newer tag only happens when the user explicitly clicks
/// "Reload hashes" (`reload_hashes` / `force_rebuild_hashes` commands).
pub async fn download_hashes(output_dir: impl AsRef<Path>, force: bool) -> Result<DownloadStats> {
    let output_dir = output_dir.as_ref();

    tracing::debug!("Hash dir: {}", output_dir.display());
    fs::create_dir_all(output_dir).await.map_err(|e| {
        tracing::error!("Failed to create hash dir '{}': {}", output_dir.display(), e);
        e
    })?;

    // Clean up any leftover .tmp files from a previous interrupted download.
    // On Windows the LMDB env holds a file lock on data.mdb, so the rename
    // of data.mdb.tmp -> data.mdb can fail and leave a stale .tmp behind.
    for asset in ASSETS {
        let tmp = output_dir.join(asset.lmdb_dir).join("data.mdb.tmp");
        if tmp.exists() {
            tracing::info!("Removing stale {}", tmp.display());
            let _ = fs::remove_file(&tmp).await;
        }
    }

    let mut stats = DownloadStats { downloaded: 0, skipped: 0, errors: 0 };

    // Fast path: LMDBs already on disk and caller didn't force a refresh.
    // Skip the GitHub API entirely — a startup that finds its hashes should
    // not hit the network. Users can re-check via the reload commands.
    if !force && hashes_present(output_dir) {
        tracing::info!("Hash databases already present — skipping check");
        stats.skipped = ASSETS.len();
        return Ok(stats);
    }

    let client = Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(Error::Network)?;

    // 1. Fetch latest release info.
    let release = fetch_latest_release(&client).await?;
    let latest_tag = release.tag_name.clone().unwrap_or_default();

    let mut meta = read_meta(output_dir).await;
    let stored_tag = meta.release_tag.clone().unwrap_or_default();

    // 2. Download each asset.
    for asset in ASSETS {
        let lmdb_dir = output_dir.join(asset.lmdb_dir);
        let data_mdb = lmdb_dir.join("data.mdb");

        let release_asset = match release.assets.iter().find(|a| a.name == asset.release_name) {
            Some(a) => a,
            None => {
                tracing::error!("Asset {} missing from release", asset.release_name);
                stats.errors += 1;
                continue;
            }
        };

        // Skip if already up-to-date.
        if !force && data_mdb.exists() && !latest_tag.is_empty() && latest_tag == stored_tag {
            tracing::debug!("{} up-to-date (tag {})", asset.label, latest_tag);
            stats.skipped += 1;
            continue;
        }

        match download_and_extract(&client, release_asset, &lmdb_dir).await {
            Ok(()) => {
                tracing::info!("Downloaded {} (tag {})", asset.label, latest_tag);
                stats.downloaded += 1;
            }
            Err(e) => {
                tracing::error!("Failed to download {}: {}", asset.label, e);
                stats.errors += 1;
            }
        }
    }

    // 3. Update meta.
    if !latest_tag.is_empty() && stats.errors == 0 {
        meta.release_tag = Some(latest_tag);
        meta.updated_at = Some(now_iso());

        // Reload both in-process hash caches so new data is live immediately
        // without requiring an app restart.
        crate::bin::ltk_bridge::reload_bin_hash_cache();
        crate::bin::jade::hash_manager::reload_jade_hashes();
        tracing::info!("BIN hash caches reloaded after successful download");
    }
    meta.last_checked_at = Some(now_iso());
    write_meta(output_dir, &meta).await;

    tracing::info!(
        "Hash download complete: {} downloaded, {} skipped, {} errors",
        stats.downloaded, stats.skipped, stats.errors
    );

    Ok(stats)
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async fn fetch_latest_release(client: &Client) -> Result<GitHubRelease> {
    let response = client
        .get(RELEASE_API_URL)
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(Error::Network)?;

    if !response.status().is_success() {
        return Err(Error::Hash(format!(
            "GitHub releases API failed: HTTP {}",
            response.status()
        )));
    }

    response.json::<GitHubRelease>().await.map_err(Error::Network)
}

async fn download_and_extract(
    client: &Client,
    release_asset: &GitHubReleaseAsset,
    lmdb_dir: &Path,
) -> Result<()> {
    fs::create_dir_all(lmdb_dir).await?;

    // Download .zst into memory (~50-80 MB, well within budget).
    let response = client
        .get(&release_asset.browser_download_url)
        .send()
        .await
        .map_err(Error::Network)?;

    if !response.status().is_success() {
        return Err(Error::Hash(format!(
            "Download {} failed: HTTP {}",
            release_asset.name, response.status()
        )));
    }

    let compressed = response.bytes().await.map_err(Error::Network)?;

    // Decompress in a blocking task — zstd is CPU-bound.
    let decompressed = tokio::task::spawn_blocking(move || {
        zstd::stream::decode_all(Cursor::new(compressed.as_ref()))
    })
    .await
    .map_err(|e| Error::Hash(format!("Zstd task join failed: {}", e)))?
    .map_err(|e| Error::Hash(format!("Zstd decode failed: {}", e)))?;

    // Atomically replace data.mdb: write to .tmp, then rename over.
    //
    // WINDOWS NOTE: LMDB memory-maps data.mdb, which holds an open file handle.
    // fs::rename over a locked file fails with ERROR_ACCESS_DENIED (os error 5).
    // We must drop the cached env *before* attempting the rename so Windows
    // releases its handle on data.mdb.
    let data_mdb = lmdb_dir.join("data.mdb");
    let tmp_path = lmdb_dir.join("data.mdb.tmp");

    let mut f = fs::File::create(&tmp_path).await?;
    f.write_all(&decompressed).await?;
    f.flush().await?;
    drop(f);

    // Drop the cached LMDB envs so Windows releases its handle on data.mdb.
    crate::hash::lmdb_cache::drop_lmdb_cache();

    // Remove LMDB's lock file so a future open starts clean.
    let _ = fs::remove_file(lmdb_dir.join("lock.mdb")).await;

    // Explicitly delete the old data.mdb first — Windows may refuse to
    // rename over a file that recently had open handles even after drop.
    if data_mdb.exists() {
        if let Err(e) = fs::remove_file(&data_mdb).await {
            tracing::warn!("Could not remove old data.mdb (will attempt rename anyway): {}", e);
        }
    }

    fs::rename(&tmp_path, &data_mdb).await
        .map_err(|e| Error::Hash(format!("Failed to rename data.mdb.tmp -> data.mdb: {}", e)))?;

    tracing::info!("Successfully installed new data.mdb at {}", data_mdb.display());
    Ok(())
}


async fn read_meta(hash_dir: &Path) -> HashesMeta {
    let path = hash_dir.join(META_FILE_NAME);
    let Ok(data) = fs::read_to_string(&path).await else {
        return HashesMeta::default();
    };
    serde_json::from_str(&data).unwrap_or_default()
}

async fn write_meta(hash_dir: &Path, meta: &HashesMeta) {
    let path = hash_dir.join(META_FILE_NAME);
    if let Ok(json) = serde_json::to_string_pretty(meta) {
        if let Err(e) = fs::write(&path, json).await {
            tracing::warn!("Failed to write {}: {}", META_FILE_NAME, e);
        }
    }
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_download_stats_creation() {
        let stats = DownloadStats { downloaded: 5, skipped: 2, errors: 1 };
        assert_eq!(stats.downloaded, 5);
        assert_eq!(stats.skipped, 2);
        assert_eq!(stats.errors, 1);
    }

    #[test]
    fn test_get_hash_dir() {
        if std::env::var("APPDATA").is_ok() {
            let path = get_hash_dir().unwrap();
            let s = path.to_string_lossy();
            assert!(s.contains("RitoShark"));
            assert!(s.contains("Hashes"));
        }
    }
}
