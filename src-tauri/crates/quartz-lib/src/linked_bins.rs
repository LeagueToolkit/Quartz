//! Shared linked-bin loading: open a main `.bin` plus every bin its `linked`
//! list resolves to on disk, as a flat `Vec<LoadedBin>` (main first). Format
//! aware, so text-sourced bins round-trip on save. Save writes ONLY dirty bins,
//! each back to its own path in its own format. Session-free: callers wrap the
//! returned bins in their own session type. Reuses `vfx_session::resolve` for
//! the disk resolution and never recurses into linked bins' own `linked` lists.

use crate::bin::{read_bin, text_to_tree, tree_to_text_cached, write_bin};
use crate::error::{Error, Result};
use crate::vfx_session::resolve;
use ritoshark::bin::Bin;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// How a bin was loaded, so save writes it back the same way.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceFormat {
    /// Binary `.bin` (serialize the tree to bytes).
    Bin,
    /// `.py` / `.ritobin` text (serialize the tree to ritobin text).
    Text,
}

/// Whether a bin is the opened main bin or one resolved from its `linked` list.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BinRole {
    Main,
    Linked,
}

/// One resident bin: its disk path, load format, parsed tree, dirty flag, the
/// `linked`-list string that resolved here (`None` for the main bin), and the
/// file's modification time at load, used to detect out-of-band changes before
/// a save clobbers them.
pub struct LoadedBin {
    pub path: PathBuf,
    pub role: BinRole,
    pub source_format: SourceFormat,
    pub tree: Bin,
    pub dirty: bool,
    pub link_str: Option<String>,
    /// File mtime when this bin was loaded (`None` if it could not be read).
    /// Compared against the current mtime on save to catch external edits.
    pub mtime: Option<std::time::SystemTime>,
}

/// Classify a path as binary or text by its extension.
pub fn format_for_path(path: &Path) -> SourceFormat {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
    {
        Some(ext) if ext == "py" || ext == "ritobin" || ext == "txt" => SourceFormat::Text,
        _ => SourceFormat::Bin,
    }
}

/// A sibling `.ritobin` / `.py` text dump for a saved `.bin`, if one already
/// exists on disk. `.ritobin` wins when both are present.
fn existing_text_sidecar(bin_path: &Path) -> Option<PathBuf> {
    for ext in ["ritobin", "py"] {
        let candidate = bin_path.with_extension(ext);
        if candidate != bin_path && candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

/// Case-fold a path for duplicate detection (two links may resolve to the same
/// file; Windows paths compare case-insensitively).
fn dedup_key(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/").to_lowercase()
}

/// The file's last-modified time, or `None` if it can't be read. Used to detect
/// out-of-band edits between open and save.
fn mtime_of(path: &Path) -> Option<std::time::SystemTime> {
    std::fs::metadata(path).and_then(|m| m.modified()).ok()
}

/// True when any resident source file has changed since it was parsed.
/// Missing/unreadable files are left alone so a temporary external write does
/// not destroy the resident session; the next poll retries once the file is
/// readable again.
pub fn has_external_changes(bins: &[LoadedBin]) -> bool {
    bins.iter().any(|bin| match (bin.mtime, mtime_of(&bin.path)) {
        (Some(recorded), Some(current)) => recorded != current,
        _ => false,
    })
}

/// Reparse the main BIN and all of its currently-resolvable linked BINs when
/// any resident source changed on disk. Returns `None` when nothing changed.
pub fn reload_if_changed(bins: &[LoadedBin]) -> Result<Option<Vec<LoadedBin>>> {
    if !has_external_changes(bins) {
        return Ok(None);
    }
    let main_path = bins
        .first()
        .map(|bin| bin.path.clone())
        .ok_or_else(|| Error::InvalidInput("BIN session has no main file".to_string()))?;
    open_with_linked(&main_path).map(Some)
}

/// Read + parse one bin from disk in the format implied by its extension.
fn load_tree(path: &Path) -> Result<(Bin, SourceFormat)> {
    let format = format_for_path(path);
    let tree = match format {
        SourceFormat::Bin => {
            let data = std::fs::read(path).map_err(|e| Error::io_with_path(e, path))?;
            read_bin(&data).map_err(|e| Error::InvalidInput(e.to_string()))?
        }
        SourceFormat::Text => {
            let text = std::fs::read_to_string(path).map_err(|e| Error::io_with_path(e, path))?;
            text_to_tree(&text).map_err(|e| Error::InvalidInput(e.to_string()))?
        }
    };
    Ok((tree, format))
}

/// Open `path` as the main bin, resolve its `linked` list against the project
/// root, and load every resolvable linked bin. Index 0 is always the main bin.
/// Unresolvable / unreadable / unparseable linked bins are skipped with a
/// warning, never fatal. Never recurses into linked bins' own `linked` lists.
pub fn open_with_linked(path: &Path) -> Result<Vec<LoadedBin>> {
    let path = path.to_path_buf();
    let (main, main_format) = load_tree(&path)?;

    let links = resolve::gather_linked(&path, &main);

    let mut seen: HashSet<String> = HashSet::new();
    seen.insert(dedup_key(&path));

    let mut bins = vec![LoadedBin {
        mtime: mtime_of(&path),
        path: path.clone(),
        role: BinRole::Main,
        source_format: main_format,
        tree: main,
        dirty: false,
        link_str: None,
    }];

    for link in links {
        let Some(link_path) = link.path else {
            tracing::warn!("linked bin not found in project, skipping: {}", link.link);
            continue;
        };
        if !seen.insert(dedup_key(&link_path)) {
            continue;
        }
        match load_tree(&link_path) {
            Ok((tree, format)) => bins.push(LoadedBin {
                mtime: mtime_of(&link_path),
                path: link_path,
                role: BinRole::Linked,
                source_format: format,
                tree,
                dirty: false,
                link_str: Some(link.link),
            }),
            Err(e) => {
                tracing::warn!(
                    "skipping unloadable linked bin {}: {}",
                    link_path.display(),
                    e
                );
            }
        }
    }

    tracing::info!(
        "linked-bins open: {} -> {} resident bin(s)",
        path.display(),
        bins.len()
    );
    Ok(bins)
}

/// Write every dirty bin back to its own path, guarding against out-of-band
/// edits. Equivalent to [`save_dirty_checked`] with `force = false`.
pub fn save_dirty(bins: &mut [LoadedBin]) -> Result<Vec<PathBuf>> {
    save_dirty_checked(bins, false)
}

/// Write every dirty bin back to its own path in its own format, keeping an
/// existing sibling `.ritobin`/`.py` in sync (never creating one). Clears the
/// dirty flag on each written bin. Returns the paths written, in bin order.
/// Non-dirty bins are never touched.
///
/// When `force` is false, first checks every dirty bin's current file mtime
/// against the mtime recorded at open. If ANY changed on disk (another editor
/// or process wrote it), returns [`Error::StaleFile`] with the affected paths
/// and writes NOTHING, so the caller can prompt before clobbering. `force`
/// skips the check and overwrites. A file with no recorded mtime (or whose
/// mtime is now unreadable) is treated as not-stale.
pub fn save_dirty_checked(bins: &mut [LoadedBin], force: bool) -> Result<Vec<PathBuf>> {
    if !force {
        let stale: Vec<String> = bins
            .iter()
            .filter(|b| b.dirty)
            .filter(|b| match (b.mtime, mtime_of(&b.path)) {
                // Both known and different -> the file changed underneath us.
                (Some(recorded), Some(current)) => recorded != current,
                // Recorded but now unreadable, or never recorded -> don't block.
                _ => false,
            })
            .map(|b| b.path.to_string_lossy().into_owned())
            .collect();
        if !stale.is_empty() {
            return Err(Error::StaleFile { paths: stale });
        }
    }

    let mut written = Vec::new();
    for lb in bins.iter_mut().filter(|b| b.dirty) {
        match lb.source_format {
            SourceFormat::Bin => {
                let bytes = write_bin(&lb.tree).map_err(|e| Error::InvalidInput(e.to_string()))?;
                std::fs::write(&lb.path, bytes).map_err(|e| Error::io_with_path(e, &lb.path))?;
                // Keep a sibling text dump in sync only if one already exists.
                if let Some(sidecar) = existing_text_sidecar(&lb.path) {
                    let text = tree_to_text_cached(&lb.tree)
                        .map_err(|e| Error::InvalidInput(e.to_string()))?;
                    std::fs::write(&sidecar, text).map_err(|e| Error::io_with_path(e, &sidecar))?;
                }
            }
            SourceFormat::Text => {
                let text = tree_to_text_cached(&lb.tree)
                    .map_err(|e| Error::InvalidInput(e.to_string()))?;
                std::fs::write(&lb.path, text).map_err(|e| Error::io_with_path(e, &lb.path))?;
            }
        }
        lb.dirty = false;
        // Re-stamp so a subsequent save in the same session isn't falsely stale.
        lb.mtime = mtime_of(&lb.path);
        written.push(lb.path.clone());
    }
    Ok(written)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_for_path_classifies_by_extension() {
        assert_eq!(format_for_path(Path::new("a/b.bin")), SourceFormat::Bin);
        assert_eq!(format_for_path(Path::new("a/b.py")), SourceFormat::Text);
        assert_eq!(
            format_for_path(Path::new("a/b.ritobin")),
            SourceFormat::Text
        );
        assert_eq!(format_for_path(Path::new("a/b.txt")), SourceFormat::Text);
        // Unknown / no extension defaults to Bin.
        assert_eq!(format_for_path(Path::new("a/b")), SourceFormat::Bin);
    }

    #[test]
    fn open_with_linked_loads_main_and_resolvable_links() {
        let root =
            std::env::temp_dir().join(format!("quartz_linked_bins_open_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let skins = root
            .join("data")
            .join("characters")
            .join("evelynn")
            .join("skins");
        std::fs::create_dir_all(&skins).unwrap();

        // A linked VFX bin on disk (real casing differs from the link string).
        let vfx_real = root.join("data").join("Test_VFX.bin");
        let vfx_tree = Bin::new();
        std::fs::write(&vfx_real, write_bin(&vfx_tree).unwrap()).unwrap();

        // Main bin references the linked bin (lowercased) plus a not-shipped link.
        let main_path = skins.join("skin0.bin");
        let mut main_tree = Bin::new();
        main_tree.linked = vec![
            "data/test_vfx.bin".to_string(),
            "DATA/Characters/Evelynn/Evelynn.bin".to_string(), // not on disk -> skipped
        ];
        std::fs::write(&main_path, write_bin(&main_tree).unwrap()).unwrap();

        let bins = open_with_linked(&main_path).unwrap();

        // Main + one resolvable link; the unshipped link is skipped, not fatal.
        assert_eq!(bins.len(), 2);
        assert_eq!(bins[0].role, BinRole::Main);
        assert_eq!(bins[0].link_str, None);
        assert_eq!(bins[0].source_format, SourceFormat::Bin);
        assert!(!bins[0].dirty);
        assert_eq!(bins[1].role, BinRole::Linked);
        assert_eq!(bins[1].link_str.as_deref(), Some("data/test_vfx.bin"));
        assert_eq!(bins[1].path, vfx_real);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn open_with_linked_single_bin_when_no_links() {
        let root =
            std::env::temp_dir().join(format!("quartz_linked_bins_single_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("loose.bin");
        std::fs::write(&path, write_bin(&Bin::new()).unwrap()).unwrap();

        let bins = open_with_linked(&path).unwrap();
        assert_eq!(bins.len(), 1);
        assert_eq!(bins[0].role, BinRole::Main);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn open_with_linked_reads_text_source_as_text() {
        // A .py/.ritobin main opens as a single text bin (no project link scan).
        let root =
            std::env::temp_dir().join(format!("quartz_linked_bins_text_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("loose.py");
        let text = tree_to_text_cached(&Bin::new()).unwrap();
        std::fs::write(&path, text).unwrap();

        let bins = open_with_linked(&path).unwrap();
        assert_eq!(bins.len(), 1);
        assert_eq!(bins[0].source_format, SourceFormat::Text);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn save_dirty_writes_only_dirty_bins_each_to_its_own_path() {
        let root =
            std::env::temp_dir().join(format!("quartz_linked_bins_save_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();

        let main_path = root.join("main.bin");
        let linked_path = root.join("linked.bin");
        std::fs::write(&main_path, write_bin(&Bin::new()).unwrap()).unwrap();
        std::fs::write(&linked_path, write_bin(&Bin::new()).unwrap()).unwrap();

        // Record the linked file's bytes so we can prove it is untouched.
        let linked_before = std::fs::read(&linked_path).unwrap();

        let mut bins = vec![
            LoadedBin {
                path: main_path.clone(),
                role: BinRole::Main,
                source_format: SourceFormat::Bin,
                tree: Bin::new(),
                dirty: true, // only the main bin is dirty
                link_str: None,
                mtime: None,
            },
            LoadedBin {
                path: linked_path.clone(),
                role: BinRole::Linked,
                source_format: SourceFormat::Bin,
                tree: Bin::new(),
                dirty: false,
                link_str: Some("linked.bin".to_string()),
                mtime: None,
            },
        ];

        let written = save_dirty(&mut bins).unwrap();

        // Exactly the main file was written; both dirty flags are clear afterward.
        assert_eq!(written, vec![main_path.clone()]);
        assert!(!bins[0].dirty);
        assert!(!bins[1].dirty);
        // The linked file on disk is byte-identical to before (never rewritten).
        assert_eq!(std::fs::read(&linked_path).unwrap(), linked_before);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn save_dirty_noop_when_nothing_dirty() {
        let root = std::env::temp_dir().join(format!(
            "quartz_linked_bins_save_noop_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let p = root.join("x.bin");
        std::fs::write(&p, write_bin(&Bin::new()).unwrap()).unwrap();

        let mut bins = vec![LoadedBin {
            path: p.clone(),
            role: BinRole::Main,
            source_format: SourceFormat::Bin,
            tree: Bin::new(),
            dirty: false,
            link_str: None,
            mtime: None,
        }];
        let written = save_dirty(&mut bins).unwrap();
        assert!(written.is_empty());

        let _ = std::fs::remove_dir_all(&root);
    }

    // End-to-end: open a bin (stamps real mtime), rewrite the file externally,
    // and confirm an unforced save is blocked as stale while force overrides.
    #[test]
    fn open_then_external_write_makes_save_stale() {
        let root = std::env::temp_dir().join(format!(
            "quartz_linked_bins_e2e_stale_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let p = root.join("skin.bin");
        std::fs::write(&p, write_bin(&Bin::new()).unwrap()).unwrap();

        // Open stamps the current mtime.
        let mut bins = open_with_linked(&p).unwrap();
        assert_eq!(bins.len(), 1);
        assert!(bins[0].mtime.is_some(), "open must stamp mtime");
        bins[0].dirty = true; // pretend we edited it

        // Force the recorded mtime to differ (simulates an external write without
        // depending on filesystem mtime granularity between the two writes).
        bins[0].mtime = Some(std::time::SystemTime::UNIX_EPOCH);

        assert!(
            matches!(save_dirty(&mut bins), Err(Error::StaleFile { .. })),
            "unforced save of an externally-changed file must be stale"
        );
        // Force overrides.
        assert_eq!(
            save_dirty_checked(&mut bins, true).unwrap(),
            vec![p.clone()]
        );

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn save_dirty_blocks_stale_file_and_force_overrides() {
        let root =
            std::env::temp_dir().join(format!("quartz_linked_bins_stale_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let p = root.join("x.bin");
        std::fs::write(&p, write_bin(&Bin::new()).unwrap()).unwrap();

        // Open-time mtime, then simulate an external write with a NEWER mtime.
        let opened_mtime = mtime_of(&p);
        // A distinct, definitely-different timestamp (avoids filesystem mtime
        // granularity flakiness): stamp the recorded mtime as the UNIX epoch.
        let stale_stamp = Some(std::time::SystemTime::UNIX_EPOCH);
        assert_ne!(opened_mtime, stale_stamp, "epoch should differ from now");

        let mut bins = vec![LoadedBin {
            path: p.clone(),
            role: BinRole::Main,
            source_format: SourceFormat::Bin,
            tree: Bin::new(),
            dirty: true,
            link_str: None,
            mtime: stale_stamp, // recorded mtime != current file mtime
        }];

        // Unforced save must refuse and write nothing.
        match save_dirty_checked(&mut bins, false) {
            Err(Error::StaleFile { paths }) => {
                assert_eq!(paths, vec![p.to_string_lossy().into_owned()]);
            }
            other => panic!("expected StaleFile, got {:?}", other.map(|_| "Ok")),
        }
        assert!(bins[0].dirty, "stale save must not clear dirty");

        // Forced save overwrites and clears dirty, re-stamping the mtime.
        let written = save_dirty_checked(&mut bins, true).unwrap();
        assert_eq!(written, vec![p.clone()]);
        assert!(!bins[0].dirty);
        assert!(bins[0].mtime.is_some(), "mtime re-stamped after write");

        let _ = std::fs::remove_dir_all(&root);
    }
}
