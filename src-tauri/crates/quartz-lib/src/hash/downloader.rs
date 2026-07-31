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
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::fs;
use tokio::io::AsyncWriteExt;

const RELEASE_API_URL: &str = "https://api.github.com/repos/RitoShark/lmdb-hashes/releases/latest";
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
    Asset {
        release_name: "lol-hashes-wad.zst",
        lmdb_dir: "hashes-wad.lmdb",
        label: "WAD hashes",
    },
    Asset {
        release_name: "lol-hashes-bin.zst",
        lmdb_dir: "hashes-bin.lmdb",
        label: "BIN hashes",
    },
];

/// Statistics about a hash download operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadStats {
    pub downloaded: usize,
    pub skipped: usize,
    pub errors: usize,
}

/// Byte progress for one asset, for a UI indicator.
///
/// `total` is 0 when the server sent no `Content-Length` (chunked transfer);
/// a consumer must treat that as indeterminate rather than dividing by it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HashProgress {
    /// Which asset is downloading, e.g. "WAD hashes".
    pub label: String,
    pub received: u64,
    pub total: u64,
}

/// Progress sink. `Fn` (not `FnMut`) so it can be shared across the per-asset
/// loop without a lock; callers that need to mutate should capture a channel
/// or an atomic.
pub trait ProgressSink: Fn(HashProgress) + Send + Sync {}
impl<T: Fn(HashProgress) + Send + Sync> ProgressSink for T {}

/// A sink that discards progress, for callers that do not display it.
pub fn no_progress(_: HashProgress) {}

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

    Ok(PathBuf::from(appdata)
        .join("RitoShark")
        .join("Requirements")
        .join("Hashes"))
}

/// Legacy alias for [`get_hash_dir`]. Kept for compatibility with existing callers.
pub fn get_ritoshark_hash_dir() -> Result<PathBuf> {
    get_hash_dir()
}

/// Check whether both LMDB `data.mdb` files are already present on disk.
pub fn hashes_present(hash_dir: &Path) -> bool {
    ASSETS
        .iter()
        .all(|a| hash_dir.join(a.lmdb_dir).join("data.mdb").exists())
}

/// Default startup cooldown: check GitHub at most once a day per machine.
pub const AUTO_SYNC_COOLDOWN_MINUTES: i64 = 60 * 24;

/// Fast-path gate for startup auto-sync: true when the LMDBs exist AND the
/// metadata was refreshed within `max_age_minutes`.
///
/// WHY THIS EXISTS
/// Presence alone is the wrong gate. `download_hashes` used to return early the
/// moment both `data.mdb` files existed, which meant the release-tag comparison
/// below it was unreachable on any normal boot and a machine silently kept
/// months-old hashes. Names Riot shipped after the local snapshot then resolve
/// to nothing, and a brand new skin looks absent from its own WAD.
///
/// Time is the gate instead, matching the Electron build's `isAutoSyncFresh`:
/// stale metadata means "go ask", fresh metadata means "skip the network".
/// Anything unreadable / unparseable / missing counts as stale, so a corrupt
/// meta file re-checks rather than pinning the user forever.
///
/// A clock that jumped backwards would make `updated_at` look like the future;
/// that reads as stale too, which costs one API call rather than an indefinite
/// skip.
pub fn is_auto_sync_fresh(hash_dir: &Path, max_age_minutes: i64) -> bool {
    if !hashes_present(hash_dir) {
        return false;
    }
    let Ok(raw) = std::fs::read_to_string(hash_dir.join(META_FILE_NAME)) else {
        return false;
    };
    let Ok(meta) = serde_json::from_str::<HashesMeta>(&raw) else {
        return false;
    };
    let Some(updated_at) = meta.updated_at.as_deref() else {
        return false;
    };
    let Ok(updated) = chrono::DateTime::parse_from_rfc3339(updated_at) else {
        return false;
    };
    let age = chrono::Utc::now().signed_duration_since(updated.with_timezone(&chrono::Utc));
    // A negative age means the stamp is in the future (clock skew): treat as
    // stale so it re-checks instead of skipping forever.
    age >= chrono::Duration::zero() && age.num_minutes() <= max_age_minutes
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
    download_hashes_with_progress(output_dir, force, no_progress).await
}

/// [`download_hashes`], reporting per-asset byte progress to `progress`.
pub async fn download_hashes_with_progress(
    output_dir: impl AsRef<Path>,
    force: bool,
    progress: impl ProgressSink,
) -> Result<DownloadStats> {
    let output_dir = output_dir.as_ref();

    tracing::debug!("Hash dir: {}", output_dir.display());
    fs::create_dir_all(output_dir).await.map_err(|e| {
        tracing::error!(
            "Failed to create hash dir '{}': {}",
            output_dir.display(),
            e
        );
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

    let mut stats = DownloadStats {
        downloaded: 0,
        skipped: 0,
        errors: 0,
    };

    /* No presence-based early return here on purpose.
    Gating on "the files exist" made the release-tag comparison below
    unreachable on every normal boot, so a machine kept whatever snapshot it
    first installed indefinitely. Startup callers gate on TIME instead, via
    `auto_sync`, and reaching this function means a check was actually wanted.
    The per-asset tag check below still skips the download itself when the
    local tag already matches the release, so the cost of an up-to-date check
    is one small API call, not a re-download. */

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

        match download_and_extract(&client, release_asset, &lmdb_dir, asset.label, &progress).await {
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
        crate::bin::ritoshark_bridge::reload_bin_hash_cache();
        crate::bin::jade::hash_manager::reload_jade_hashes();
        tracing::info!("BIN hash caches reloaded after successful download");
    }
    meta.last_checked_at = Some(now_iso());
    write_meta(output_dir, &meta).await;

    tracing::info!(
        "Hash download complete: {} downloaded, {} skipped, {} errors",
        stats.downloaded,
        stats.skipped,
        stats.errors
    );

    Ok(stats)
}

/// Startup auto-sync: check for newer hashes at most once per cooldown window.
///
/// Returns `Ok(None)` when the check was skipped as fresh, so a caller can tell
/// "nothing to do" from "checked and up to date" (`Ok(Some(stats))`).
///
/// Network failure is deliberately NOT an error here: a machine that boots
/// offline must still start with the hashes it already has. The failure is
/// logged and reported as a skip.
pub async fn auto_sync(
    output_dir: impl AsRef<Path>,
    progress: impl ProgressSink,
) -> Option<DownloadStats> {
    let output_dir = output_dir.as_ref();

    if is_auto_sync_fresh(output_dir, AUTO_SYNC_COOLDOWN_MINUTES) {
        tracing::info!("Hash auto-sync: skipped, metadata is fresh");
        return None;
    }

    tracing::info!("Hash auto-sync: checking for newer hashes");
    match download_hashes_with_progress(output_dir, false, progress).await {
        Ok(stats) => {
            tracing::info!(
                "Hash auto-sync: {} downloaded, {} skipped, {} errors",
                stats.downloaded,
                stats.skipped,
                stats.errors
            );
            Some(stats)
        }
        Err(e) => {
            // Offline, rate-limited, or GitHub down. Not fatal: the existing
            // LMDBs stay usable and the next launch tries again.
            tracing::warn!("Hash auto-sync failed (keeping existing hashes): {}", e);
            None
        }
    }
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

    response
        .json::<GitHubRelease>()
        .await
        .map_err(Error::Network)
}

async fn download_and_extract(
    client: &Client,
    release_asset: &GitHubReleaseAsset,
    lmdb_dir: &Path,
    label: &str,
    progress: &impl ProgressSink,
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
            release_asset.name,
            response.status()
        )));
    }

    /* Streamed rather than `response.bytes()` so the UI can show real byte
    progress. These assets are ~50-80 MB compressed and the pair expands to
    ~240 MB on disk, which is long enough on a slow link that a silent wait
    reads as a hang. `content_length` is absent on a chunked response, in which
    case `total` stays 0 and the indicator falls back to an indeterminate
    spinner instead of a bogus percentage. */
    let total = response.content_length().unwrap_or(0);
    let mut compressed: Vec<u8> = Vec::with_capacity(total as usize);
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(Error::Network)?;
        compressed.extend_from_slice(&chunk);
        progress(HashProgress {
            label: label.to_string(),
            received: compressed.len() as u64,
            total,
        });
    }
    let compressed = bytes::Bytes::from(compressed);

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
            tracing::warn!(
                "Could not remove old data.mdb (will attempt rename anyway): {}",
                e
            );
        }
    }

    fs::rename(&tmp_path, &data_mdb)
        .await
        .map_err(|e| Error::Hash(format!("Failed to rename data.mdb.tmp -> data.mdb: {}", e)))?;

    tracing::info!(
        "Successfully installed new data.mdb at {}",
        data_mdb.display()
    );
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
        let stats = DownloadStats {
            downloaded: 5,
            skipped: 2,
            errors: 1,
        };
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

    // ── Auto-sync freshness gate ─────────────────────────────────────────────

    /// A scratch hash dir with both LMDBs "present" and a meta file whose
    /// `updatedAt` is `age_minutes` in the past. Uses a unique dir per test so
    /// the cases can run in parallel.
    fn scratch(tag: &str, age_minutes: Option<i64>) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("quartz-hashtest-{tag}"));
        let _ = std::fs::remove_dir_all(&dir);
        for asset in ASSETS {
            let lmdb = dir.join(asset.lmdb_dir);
            std::fs::create_dir_all(&lmdb).unwrap();
            std::fs::write(lmdb.join("data.mdb"), b"x").unwrap();
        }
        if let Some(age) = age_minutes {
            let stamp = chrono::Utc::now() - chrono::Duration::minutes(age);
            let meta = format!(
                r#"{{"releaseTag":"v1","updatedAt":"{}"}}"#,
                stamp.to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
            );
            std::fs::write(dir.join(META_FILE_NAME), meta).unwrap();
        }
        dir
    }

    /* The regression this whole gate exists for: the old code returned early
    whenever both data.mdb files existed, so the release-tag check below it
    never ran and a machine kept months-old hashes forever. Freshness must be
    decided by TIME, not by presence. */
    #[test]
    fn stale_metadata_is_not_fresh_even_though_the_lmdbs_exist() {
        let dir = scratch("stale", Some(60 * 24 * 90)); // 90 days old
        assert!(hashes_present(&dir), "fixture should look installed");
        assert!(!is_auto_sync_fresh(&dir, AUTO_SYNC_COOLDOWN_MINUTES));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn recent_metadata_is_fresh() {
        let dir = scratch("recent", Some(60)); // an hour ago
        assert!(is_auto_sync_fresh(&dir, AUTO_SYNC_COOLDOWN_MINUTES));
        // ...but not under a cooldown shorter than its age.
        assert!(!is_auto_sync_fresh(&dir, 30));
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Anything unreadable counts as stale: better one wasted API call than a
    /// machine pinned to old hashes by a corrupt meta file.
    #[test]
    fn missing_or_unparseable_metadata_is_stale() {
        let dir = scratch("nometa", None);
        assert!(!is_auto_sync_fresh(&dir, AUTO_SYNC_COOLDOWN_MINUTES));

        std::fs::write(dir.join(META_FILE_NAME), b"{not json").unwrap();
        assert!(!is_auto_sync_fresh(&dir, AUTO_SYNC_COOLDOWN_MINUTES));

        // Present but with no `updatedAt` at all.
        std::fs::write(dir.join(META_FILE_NAME), br#"{"releaseTag":"v1"}"#).unwrap();
        assert!(!is_auto_sync_fresh(&dir, AUTO_SYNC_COOLDOWN_MINUTES));
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// A future stamp (clock skew, or a restored backup) must not read as
    /// fresh forever.
    #[test]
    fn future_metadata_is_stale() {
        let dir = scratch("future", Some(-60 * 24 * 3));
        assert!(!is_auto_sync_fresh(&dir, AUTO_SYNC_COOLDOWN_MINUTES));
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// No LMDBs is a first run, which the download prompts own; auto-sync must
    /// stay out of its way rather than racing it for the same files.
    #[test]
    fn absent_lmdbs_are_never_fresh() {
        let dir = std::env::temp_dir().join("quartz-hashtest-empty");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        assert!(!is_auto_sync_fresh(&dir, AUTO_SYNC_COOLDOWN_MINUTES));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
