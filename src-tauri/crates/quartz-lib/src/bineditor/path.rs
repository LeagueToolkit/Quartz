//! Relocatable paths into a live `Bin` tree. Serde-visible (unlike paint's
//! private paths) because the frontend holds them opaquely and passes them back
//! verbatim: `{ "bin": 0, "entry": 3, "steps": [{ "field": 123 }, { "index": 2 }] }`.
//! `bin` selects which resident bin (main at index 0, linked bins follow) the
//! `entry`/`steps` address, so one session can hold a skin bin plus its linked
//! bins and edit across all of them.

use ritoshark::bin::BinValue;
use serde::{Deserialize, Serialize};

/// One step from a parent field-map (embed/pointer/entry) or list down to a
/// child. Untagged: serializes as `{"field": u32}` or `{"index": usize}`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Step {
    Field { field: u32 },
    Index { index: usize },
}

/// Which bin, then which top-level entry, then the steps down to the value.
/// Resolved against the resident bins at edit time so no borrow is held across
/// IPC.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodePath {
    pub bin: usize,
    pub entry: usize,
    pub steps: Vec<Step>,
}

impl NodePath {
    pub fn root(bin: usize, entry: usize) -> NodePath {
        NodePath {
            bin,
            entry,
            steps: Vec::new(),
        }
    }

    pub fn child(&self, step: Step) -> NodePath {
        let mut steps = self.steps.clone();
        steps.push(step);
        NodePath {
            bin: self.bin,
            entry: self.entry,
            steps,
        }
    }

    /// Resolve to a mutable reference into the addressed bin's tree, or `None`
    /// if the bin index is out of range or the path no longer points at a value
    /// (tree shape changed). A path with no steps addresses the entry itself,
    /// not a `BinValue`, so it resolves to `None`.
    pub fn resolve_mut<'a>(
        &self,
        bins: &'a mut [crate::linked_bins::LoadedBin],
    ) -> Option<&'a mut BinValue> {
        let entry = bins.get_mut(self.bin)?.tree.entries.get_mut(self.entry)?;
        let mut steps = self.steps.iter();
        // First step must descend from the entry's field map.
        let first = steps.next()?;
        let mut cur: &mut BinValue = match first {
            Step::Field { field } => entry.fields.get_mut(field)?,
            Step::Index { .. } => return None,
        };
        for step in steps {
            cur = match (step, cur) {
                (Step::Field { field }, BinValue::Embed { fields, .. })
                | (Step::Field { field }, BinValue::Pointer { fields, .. }) => {
                    fields.get_mut(field)?
                }
                (Step::Index { index }, BinValue::List { items, .. }) => items.get_mut(*index)?,
                _ => return None,
            };
        }
        Some(cur)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::linked_bins::{BinRole, LoadedBin, SourceFormat};
    use indexmap::IndexMap;
    use ritoshark::bin::{Bin, BinEntry, BinValue};

    fn bin_with_f32(field: u32, v: f32) -> Bin {
        let mut fields = IndexMap::new();
        fields.insert(field, BinValue::F32(v));
        Bin {
            entries: vec![BinEntry {
                path_hash: 1,
                class_hash: 2,
                fields,
            }],
            ..Bin::new()
        }
    }

    fn loaded(tree: Bin) -> LoadedBin {
        LoadedBin {
            path: Default::default(),
            role: BinRole::Main,
            source_format: SourceFormat::Bin,
            tree,
            dirty: false,
            link_str: None,
            mtime: None,
        }
    }

    #[test]
    fn resolves_against_the_addressed_bin() {
        let mut bins = vec![loaded(bin_with_f32(10, 1.0)), loaded(bin_with_f32(10, 2.0))];
        // Path into bin 1 must read bin 1's value, not bin 0's.
        let p = NodePath::root(1, 0).child(Step::Field { field: 10 });
        assert!(matches!(p.resolve_mut(&mut bins), Some(BinValue::F32(v)) if *v == 2.0));

        // Out-of-range bin resolves to None, never panics.
        let bad = NodePath::root(9, 0).child(Step::Field { field: 10 });
        assert!(bad.resolve_mut(&mut bins).is_none());
    }
}
