//! Entry-granular copy-on-write undo frames, shared by the paint and bineditor
//! sessions.
//!
//! The old undo stacks cloned the ENTIRE `Bin` tree per edit, which made every
//! keystroke-commit O(whole file) — the dominant cost on large skin bins. No
//! session op ever adds or removes a *top-level* entry (bineditor's `remove`
//! rejects it, paint is value-only), so an edit batch can snapshot just the
//! top-level entries its paths touch.
//!
//! A frame stores those entries as they stood on the OTHER side of the edit,
//! and undo/redo is a `mem::swap` against the live tree: after an undo the same
//! frame holds the "after" state, ready for redo. This makes undo/redo exact
//! inverses by construction — the restored entries are bit-identical clones,
//! not replayed operations.

use ritoshark::bin::{Bin, BinEntry};

/// One reversible edit frame on the undo/redo stacks.
pub enum UndoFrame {
    /// The touched top-level entries (sorted, deduped) from the other side of
    /// the swap.
    Entries(Vec<(usize, BinEntry)>),
    /// Whole-tree fallback for ops without a bounded touch set (restore).
    Tree(Box<Bin>),
}

impl UndoFrame {
    /// The entry indices this frame swaps, or `None` for a whole-tree frame.
    pub fn touched_entries(&self) -> Option<Vec<usize>> {
        match self {
            UndoFrame::Entries(entries) => Some(entries.iter().map(|(i, _)| *i).collect()),
            UndoFrame::Tree(_) => None,
        }
    }

    /// Snapshot the entries at `touched` indices out of `tree`. Out-of-range
    /// indices are skipped — an edit addressing one fails without mutating, so
    /// there is nothing to restore for it.
    pub fn capture(tree: &Bin, touched: impl IntoIterator<Item = usize>) -> UndoFrame {
        let mut idxs: Vec<usize> = touched
            .into_iter()
            .filter(|&i| i < tree.entries.len())
            .collect();
        idxs.sort_unstable();
        idxs.dedup();
        UndoFrame::Entries(
            idxs.into_iter()
                .map(|i| (i, tree.entries[i].clone()))
                .collect(),
        )
    }

    /// Swap the stored state with the live tree. Symmetric: calling it twice is
    /// a no-op, so the same frame serves undo and redo as it moves between
    /// stacks.
    pub fn swap_with(&mut self, tree: &mut Bin) {
        match self {
            UndoFrame::Entries(entries) => {
                for (idx, stored) in entries.iter_mut() {
                    if let Some(live) = tree.entries.get_mut(*idx) {
                        std::mem::swap(stored, live);
                    }
                }
            }
            UndoFrame::Tree(stored) => std::mem::swap(stored.as_mut(), tree),
        }
    }
}

