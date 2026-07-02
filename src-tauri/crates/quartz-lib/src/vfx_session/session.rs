//! Multi-bin session registry. A session holds the main skin bin plus every
//! resolved linked bin as resident `Bin` trees — never merged. Edits mutate
//! the owning tree in place, mark that bin dirty, and snapshot per-bin
//! entry-granular undo frames (see [`crate::undo`]); save writes ONLY dirty
//! bins, each back to its own original file. Mirrors `paint::session`'s
//! registry pattern.

use super::project::{self, VfxPortModel};
use super::resolve;
use crate::bin::{read_bin_ltk, write_bin_ltk};
use crate::error::{Error, Result};
use crate::undo::UndoFrame;
use parking_lot::RwLock;
use ritoshark::bin::Bin;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;

pub type SessionId = u64;

const UNDO_CAP: usize = 50;

/// Whether a bin is the opened main skin bin or one resolved from its
/// `linked` list.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BinRole {
    Main,
    Linked,
}

/// One resident bin: its disk path, parsed tree, and whether the in-memory
/// tree differs from what save last wrote.
pub struct LoadedBin {
    pub path: PathBuf,
    pub role: BinRole,
    pub tree: Bin,
    pub dirty: bool,
    /// The `linked`-list string that resolved here (`None` for the main bin).
    pub link_str: Option<String>,
}

/// One reversible edit across the session: per-bin entry/tree frames.
pub struct VfxUndoFrame {
    pub parts: Vec<(usize, UndoFrame)>,
}

impl VfxUndoFrame {
    /// Symmetric swap against the owning bins, like [`UndoFrame::swap_with`]:
    /// calling twice is a no-op. Every swapped bin is marked dirty — its tree
    /// may now differ from disk regardless of what save did in between.
    fn swap_with(&mut self, bins: &mut [LoadedBin]) {
        for (bin_idx, frame) in self.parts.iter_mut() {
            if let Some(lb) = bins.get_mut(*bin_idx) {
                frame.swap_with(&mut lb.tree);
                lb.dirty = true;
            }
        }
    }
}

/// Bounded push for the session's frame stacks. Local because
/// `crate::undo::push_bounded` is monomorphic over `UndoFrame`.
fn push_frame_bounded(stack: &mut Vec<VfxUndoFrame>, frame: VfxUndoFrame, cap: usize) {
    if stack.len() >= cap {
        stack.remove(0);
    }
    stack.push(frame);
}

pub struct VfxSession {
    pub id: SessionId,
    /// Index 0 is always the main bin; linked bins follow in `linked` order.
    pub bins: Vec<LoadedBin>,
    undo: Vec<VfxUndoFrame>,
    redo: Vec<VfxUndoFrame>,
}

impl VfxSession {
    pub fn main(&self) -> &LoadedBin {
        &self.bins[0]
    }

    /// Every `(bin_index, entry_index)` whose entry has `class_hash`,
    /// scanning ALL resident bins in order (main first).
    pub fn entries_by_class(&self, class_hash: u32) -> Vec<(usize, usize)> {
        let mut out = Vec::new();
        for (bin_idx, lb) in self.bins.iter().enumerate() {
            for (entry_idx, entry) in lb.tree.entries.iter().enumerate() {
                if entry.class_hash == class_hash {
                    out.push((bin_idx, entry_idx));
                }
            }
        }
        out
    }

    /// Commit a completed edit's frame to the undo stack. A fresh edit
    /// invalidates the redo history.
    pub fn push_frame(&mut self, frame: VfxUndoFrame) {
        push_frame_bounded(&mut self.undo, frame, UNDO_CAP);
        self.redo.clear();
    }

    /// Entry-granular snapshot of the `(bin, entry indices)` pairs an edit
    /// touches, for value-level ops. Unknown bin indices are skipped.
    pub fn capture(&self, touched: &[(usize, Vec<usize>)]) -> VfxUndoFrame {
        let parts = touched
            .iter()
            .filter_map(|(bin_idx, entries)| {
                let lb = self.bins.get(*bin_idx)?;
                Some((
                    *bin_idx,
                    UndoFrame::capture(&lb.tree, entries.iter().copied()),
                ))
            })
            .collect();
        VfxUndoFrame { parts }
    }

    /// Whole-tree snapshot of `bins`, for ops that add or remove top-level
    /// entries.
    pub fn capture_tree(&self, bins: &[usize]) -> VfxUndoFrame {
        let parts = bins
            .iter()
            .filter_map(|&bin_idx| {
                let lb = self.bins.get(bin_idx)?;
                Some((bin_idx, UndoFrame::Tree(Box::new(lb.tree.clone()))))
            })
            .collect();
        VfxUndoFrame { parts }
    }

    pub fn mark_dirty(&mut self, bin: usize) {
        if let Some(lb) = self.bins.get_mut(bin) {
            lb.dirty = true;
        }
    }
}

static REGISTRY: OnceLock<RwLock<HashMap<SessionId, VfxSession>>> = OnceLock::new();
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

fn registry() -> &'static RwLock<HashMap<SessionId, VfxSession>> {
    REGISTRY.get_or_init(|| RwLock::new(HashMap::new()))
}

/// Result of opening a main bin: the session id plus the initial port model.
pub struct OpenResult {
    pub session_id: SessionId,
    pub model: VfxPortModel,
}

/// Case-fold a path for duplicate detection (two links may resolve to the
/// same file; Windows paths compare case-insensitively).
fn dedup_key(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/").to_lowercase()
}

/// Open a main skin `.bin`, resolve and parse its linked bins from the
/// project folder, and register the session. Unresolvable or unparseable
/// linked bins are skipped with a warning, never fatal.
pub fn open(path: impl AsRef<Path>) -> Result<OpenResult> {
    let path = path.as_ref().to_path_buf();
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase());
    if matches!(ext.as_deref(), Some("py") | Some("ritobin") | Some("txt")) {
        return Err(Error::InvalidInput(
            "Open the .bin, not the .py".to_string(),
        ));
    }

    let data = std::fs::read(&path).map_err(|e| Error::io_with_path(e, &path))?;
    let main = read_bin_ltk(&data).map_err(|e| Error::InvalidInput(e.to_string()))?;

    let links = resolve::gather_linked(&path, &main);
    let mut seen: HashSet<String> = HashSet::new();
    seen.insert(dedup_key(&path));

    let mut bins = vec![LoadedBin {
        path: path.clone(),
        role: BinRole::Main,
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
        let bytes = match std::fs::read(&link_path) {
            Ok(b) => b,
            Err(e) => {
                tracing::warn!("failed to read linked bin {}: {}", link_path.display(), e);
                continue;
            }
        };
        match read_bin_ltk(&bytes) {
            Ok(tree) => bins.push(LoadedBin {
                path: link_path,
                role: BinRole::Linked,
                tree,
                dirty: false,
                link_str: Some(link.link),
            }),
            Err(e) => {
                tracing::warn!(
                    "skipping unparseable linked bin {}: {}",
                    link_path.display(),
                    e
                );
            }
        }
    }

    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    tracing::info!(
        "vfx open: {} -> {} resident bin(s): {}",
        path.display(),
        bins.len(),
        bins.iter()
            .map(|b| format!(
                "{}[{:?}]",
                b.path.file_name().and_then(|n| n.to_str()).unwrap_or("?"),
                b.role
            ))
            .collect::<Vec<_>>()
            .join(", ")
    );
    let session = VfxSession {
        id,
        bins,
        undo: Vec::new(),
        redo: Vec::new(),
    };
    let model = project::project(&session);
    registry().write().insert(id, session);
    Ok(OpenResult {
        session_id: id,
        model,
    })
}

/// Drop a session and free its trees. Returns false if the id was unknown.
pub fn close(id: SessionId) -> bool {
    registry().write().remove(&id).is_some()
}

pub(crate) fn with_session<R>(id: SessionId, f: impl FnOnce(&mut VfxSession) -> R) -> Result<R> {
    let mut reg = registry().write();
    let session = reg
        .get_mut(&id)
        .ok_or_else(|| Error::InvalidInput(format!("No VFX session with id {}", id)))?;
    Ok(f(session))
}

/// Re-fetch the full port model (after edits, to refresh views).
pub fn model_of(id: SessionId) -> Result<VfxPortModel> {
    with_session(id, |s| project::project(s))
}

/// Write ONLY the dirty bins, each to its own original path, and clear their
/// dirty flags. Untouched bins are never rewritten. A mid-way failure
/// propagates; bins already written stay written (their flags are already
/// cleared, so a retried save resumes with the rest).
pub fn save(id: SessionId) -> Result<Vec<PathBuf>> {
    with_session(id, |s| -> Result<Vec<PathBuf>> {
        let mut written = Vec::new();
        for lb in s.bins.iter_mut().filter(|b| b.dirty) {
            let bytes = write_bin_ltk(&lb.tree).map_err(|e| Error::InvalidInput(e.to_string()))?;
            std::fs::write(&lb.path, bytes).map_err(|e| Error::io_with_path(e, &lb.path))?;
            lb.dirty = false;
            written.push(lb.path.clone());
        }
        Ok(written)
    })?
}

/// Undo the last mutating edit. Returns the refreshed model, or `None` if the
/// undo stack was empty.
pub fn undo(id: SessionId) -> Result<Option<VfxPortModel>> {
    with_session(id, |s| match s.undo.pop() {
        Some(mut frame) => {
            frame.swap_with(&mut s.bins);
            s.redo.push(frame);
            Some(project::project(s))
        }
        None => None,
    })
}

/// Redo the last undone edit. Returns the refreshed model, or `None` if
/// there's nothing to redo.
pub fn redo(id: SessionId) -> Result<Option<VfxPortModel>> {
    with_session(id, |s| match s.redo.pop() {
        Some(mut frame) => {
            frame.swap_with(&mut s.bins);
            push_frame_bounded(&mut s.undo, frame, UNDO_CAP);
            Some(project::project(s))
        }
        None => None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use indexmap::IndexMap;
    use ritoshark::bin::{BinEntry, BinValue};

    fn f32_entry(path_hash: u32, class_hash: u32, field: u32, v: f32) -> BinEntry {
        let mut fields = IndexMap::new();
        fields.insert(field, BinValue::F32(v));
        BinEntry {
            path_hash,
            class_hash,
            fields,
        }
    }

    fn loaded(tree: Bin, role: BinRole) -> LoadedBin {
        LoadedBin {
            path: PathBuf::new(),
            role,
            tree,
            dirty: false,
            link_str: None,
        }
    }

    /// Main bin: one class-100 entry. Linked bin: a class-200 and a class-100.
    fn two_bin_session() -> VfxSession {
        let main = Bin {
            entries: vec![f32_entry(1, 100, 7, 1.0)],
            ..Bin::new()
        };
        let vfx = Bin {
            entries: vec![f32_entry(2, 200, 7, 2.0), f32_entry(3, 100, 7, 3.0)],
            ..Bin::new()
        };
        VfxSession {
            id: 0,
            bins: vec![loaded(main, BinRole::Main), loaded(vfx, BinRole::Linked)],
            undo: Vec::new(),
            redo: Vec::new(),
        }
    }

    fn field_value(s: &VfxSession, bin: usize, entry: usize, field: u32) -> f32 {
        match s.bins[bin].tree.entries[entry].fields.get(&field) {
            Some(BinValue::F32(v)) => *v,
            other => panic!("expected f32, got {:?}", other),
        }
    }

    #[test]
    fn entries_by_class_scans_all_bins_main_first() {
        let s = two_bin_session();
        assert_eq!(s.entries_by_class(100), vec![(0, 0), (1, 1)]);
        assert_eq!(s.entries_by_class(200), vec![(1, 0)]);
        assert!(s.entries_by_class(999).is_empty());
    }

    /// Capture, mutate both bins, swap: both trees restore and both bins mark
    /// dirty; swapping again re-applies the edit (symmetry).
    #[test]
    fn capture_swap_restores_trees_and_marks_dirty() {
        let mut s = two_bin_session();
        let mut frame = s.capture(&[(0, vec![0]), (1, vec![0])]);

        s.bins[0].tree.entries[0]
            .fields
            .insert(7, BinValue::F32(10.0));
        s.bins[1].tree.entries[0]
            .fields
            .insert(7, BinValue::F32(20.0));
        s.mark_dirty(0);
        s.mark_dirty(1);
        // Simulate a save between edit and undo: flags cleared, disk has the edit.
        s.bins[0].dirty = false;
        s.bins[1].dirty = false;

        frame.swap_with(&mut s.bins);
        assert_eq!(field_value(&s, 0, 0, 7), 1.0);
        assert_eq!(field_value(&s, 1, 0, 7), 2.0);
        // Untouched sibling entry survives the swap.
        assert_eq!(field_value(&s, 1, 1, 7), 3.0);
        // The reverted trees differ from disk again, so both bins must be dirty.
        assert!(s.bins[0].dirty && s.bins[1].dirty);

        frame.swap_with(&mut s.bins);
        assert_eq!(field_value(&s, 0, 0, 7), 10.0);
        assert_eq!(field_value(&s, 1, 0, 7), 20.0);
        assert!(s.bins[0].dirty && s.bins[1].dirty);
    }

    /// Tree frames restore top-level entry add/remove on just the captured bin.
    #[test]
    fn capture_tree_restores_entry_count() {
        let mut s = two_bin_session();
        let mut frame = s.capture_tree(&[1]);
        s.bins[1].tree.entries.push(f32_entry(9, 900, 7, 9.0));
        s.mark_dirty(1);

        frame.swap_with(&mut s.bins);
        assert_eq!(s.bins[1].tree.entries.len(), 2);
        assert_eq!(s.bins[0].tree.entries.len(), 1);
        assert!(s.bins[1].dirty);

        frame.swap_with(&mut s.bins);
        assert_eq!(s.bins[1].tree.entries.len(), 3);
    }

    #[test]
    fn push_frame_clears_redo_and_caps_undo() {
        let mut s = two_bin_session();
        s.redo.push(VfxUndoFrame { parts: Vec::new() });
        for _ in 0..(UNDO_CAP + 5) {
            s.push_frame(VfxUndoFrame { parts: Vec::new() });
        }
        assert!(s.redo.is_empty());
        assert_eq!(s.undo.len(), UNDO_CAP);
    }
}
