//! The daily auto-sync cooldown gate.
//!
//! `is_auto_sync_fresh` decides whether startup even LOOKS for new hashes. Getting it wrong in
//! the "too fresh" direction disables auto-update entirely and silently: the user sits on a
//! stale hash table forever and the only way out is pressing Download in Settings by hand.
//! That is exactly what happened when a failed download still stamped `lastCheckedAt`.

use std::path::Path;

use quartz_lib::hash::{is_auto_sync_fresh, AUTO_SYNC_COOLDOWN_MINUTES};

/// Lay down the two `data.mdb` files the presence check requires, plus a meta file.
fn make_hash_dir(name: &str, meta: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(name);
    let _ = std::fs::remove_dir_all(&dir);
    for lmdb in ["hashes-bin.lmdb", "hashes-wad.lmdb"] {
        let sub = dir.join(lmdb);
        std::fs::create_dir_all(&sub).unwrap();
        std::fs::write(sub.join("data.mdb"), b"not a real lmdb").unwrap();
    }
    std::fs::write(dir.join("hashes-meta.json"), meta).unwrap();
    dir
}

fn iso(minutes_ago: i64) -> String {
    (chrono::Utc::now() - chrono::Duration::minutes(minutes_ago)).to_rfc3339()
}

#[test]
fn a_recent_check_is_fresh() {
    let dir = make_hash_dir(
        "quartz_gate_recent",
        &format!(r#"{{"lastCheckedAt":"{}"}}"#, iso(10)),
    );
    assert!(
        is_auto_sync_fresh(&dir, AUTO_SYNC_COOLDOWN_MINUTES),
        "a check 10 minutes ago should still be within the daily cooldown"
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn a_check_older_than_the_cooldown_is_stale() {
    let dir = make_hash_dir(
        "quartz_gate_old",
        &format!(r#"{{"lastCheckedAt":"{}"}}"#, iso(60 * 25)),
    );
    assert!(
        !is_auto_sync_fresh(&dir, AUTO_SYNC_COOLDOWN_MINUTES),
        "a check 25 hours ago is past the daily cooldown and must re-check"
    );
    let _ = std::fs::remove_dir_all(&dir);
}

/// The regression. A download that ERRORED must not leave behind a stamp that makes the next
/// startup skip: that is what made a failing swap disable auto-update permanently.
#[test]
fn a_failed_run_leaves_no_check_stamp_so_the_next_startup_retries() {
    // What the meta file looks like after a run where every asset failed: the tag and
    // updatedAt were never advanced (they are already guarded), and lastCheckedAt is absent
    // because the run errored.
    let dir = make_hash_dir("quartz_gate_failed", r#"{"releaseTag":"v66dfaa94de0d"}"#);
    assert!(
        !is_auto_sync_fresh(&dir, AUTO_SYNC_COOLDOWN_MINUTES),
        "a failed run must not count as a check - the next startup has to try again"
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn missing_databases_are_never_fresh() {
    let dir = std::env::temp_dir().join("quartz_gate_absent");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(
        dir.join("hashes-meta.json"),
        format!(r#"{{"lastCheckedAt":"{}"}}"#, iso(1)),
    )
    .unwrap();
    assert!(
        !is_auto_sync_fresh(&dir, AUTO_SYNC_COOLDOWN_MINUTES),
        "a just-checked stamp must not mask the databases being absent"
    );
    let _ = std::fs::remove_dir_all(&dir);
}

/// Metadata written by an older build had no `lastCheckedAt`; `updatedAt` stands in so those
/// users are not forced into a re-download on first launch of a new build.
#[test]
fn older_metadata_falls_back_to_updated_at() {
    let dir = make_hash_dir(
        "quartz_gate_legacy",
        &format!(r#"{{"updatedAt":"{}"}}"#, iso(10)),
    );
    assert!(is_auto_sync_fresh(&dir, AUTO_SYNC_COOLDOWN_MINUTES));
    let _ = std::fs::remove_dir_all(&dir);
}

/// A clock that jumped backwards makes the stamp look like the future. That must read as
/// stale (one API call) rather than as fresh forever.
#[test]
fn a_future_stamp_is_stale_not_fresh() {
    let dir = make_hash_dir(
        "quartz_gate_future",
        &format!(r#"{{"lastCheckedAt":"{}"}}"#, iso(-60 * 5)),
    );
    assert!(!is_auto_sync_fresh(&dir, AUTO_SYNC_COOLDOWN_MINUTES));
    let _ = std::fs::remove_dir_all(&dir);
}

/// An unreadable or corrupt meta file must re-check, never pin the user.
#[test]
fn corrupt_metadata_is_stale() {
    let dir = make_hash_dir("quartz_gate_corrupt", "{ this is not json");
    assert!(!is_auto_sync_fresh(&dir, AUTO_SYNC_COOLDOWN_MINUTES));
    let _ = std::fs::remove_dir_all(&dir);

    let dir = std::env::temp_dir().join("quartz_gate_nometa");
    let _ = std::fs::remove_dir_all(&dir);
    for lmdb in ["hashes-bin.lmdb", "hashes-wad.lmdb"] {
        let sub = dir.join(lmdb);
        std::fs::create_dir_all(&sub).unwrap();
        std::fs::write(sub.join("data.mdb"), b"x").unwrap();
    }
    assert!(
        !is_auto_sync_fresh(&dir, AUTO_SYNC_COOLDOWN_MINUTES),
        "no meta file at all means never checked"
    );
    let _ = std::fs::remove_dir_all(Path::new(&dir));
}
