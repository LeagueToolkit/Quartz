//! Relocatable paths across a session's resident bins. Serde-visible: the
//! frontend holds them opaquely and passes them back verbatim:
//! `{ "bin": 1, "entry": 3, "steps": [{ "field": 123 }, { "index": 2 }] }`.
//! Same wire shape as `bineditor::path` with a leading bin index.

use super::session::LoadedBin;
use ritoshark::bin::{BinEntry, BinValue};
use serde::{Deserialize, Serialize};

/// One step from a parent field-map (embed/pointer/entry) or list down to a
/// child. Untagged: serializes as `{"field": u32}` or `{"index": usize}`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Step {
    Field { field: u32 },
    Index { index: usize },
}

/// Which bin, which top-level entry, then the steps down to the value.
/// Resolved against the resident trees at edit time so no borrow is held
/// across IPC.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VfxPath {
    pub bin: usize,
    pub entry: usize,
    pub steps: Vec<Step>,
}

/// Walk `steps` down from an entry's field map to a value, or `None` if the
/// path no longer points at one (tree shape changed). The first step must be
/// a `Field` into the entry's fields; a path with no steps addresses the
/// entry itself, not a `BinValue`, so it resolves to `None`.
pub fn walk_steps<'a>(entry: &'a mut BinEntry, steps: &[Step]) -> Option<&'a mut BinValue> {
    let mut steps = steps.iter();
    let first = steps.next()?;
    let mut cur: &mut BinValue = match first {
        Step::Field { field } => entry.fields.get_mut(field)?,
        Step::Index { .. } => return None,
    };
    for step in steps {
        cur = match (step, cur) {
            (Step::Field { field }, BinValue::Embed { fields, .. })
            | (Step::Field { field }, BinValue::Pointer { fields, .. }) => fields.get_mut(field)?,
            (Step::Index { index }, BinValue::List { items, .. }) => items.get_mut(*index)?,
            _ => return None,
        };
    }
    Some(cur)
}

impl VfxPath {
    pub fn root(bin: usize, entry: usize) -> VfxPath {
        VfxPath {
            bin,
            entry,
            steps: Vec::new(),
        }
    }

    pub fn child(&self, step: Step) -> VfxPath {
        let mut steps = self.steps.clone();
        steps.push(step);
        VfxPath {
            bin: self.bin,
            entry: self.entry,
            steps,
        }
    }

    /// Resolve to a mutable value reference in the owning bin's tree.
    pub fn resolve_mut<'a>(&self, bins: &'a mut [LoadedBin]) -> Option<&'a mut BinValue> {
        let entry = bins.get_mut(self.bin)?.tree.entries.get_mut(self.entry)?;
        walk_steps(entry, &self.steps)
    }

    /// The addressed top-level entry (steps ignored).
    pub fn entry_of<'a>(&self, bins: &'a mut [LoadedBin]) -> Option<&'a mut BinEntry> {
        bins.get_mut(self.bin)?.tree.entries.get_mut(self.entry)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vfx_session::session::{BinRole, LoadedBin};
    use indexmap::IndexMap;
    use ritoshark::bin::{Bin, BinEntry, BinType};

    /// entry.fields[10] = List[ Embed { 20: F32(5.0) } ]
    fn test_bins() -> Vec<LoadedBin> {
        let mut inner = IndexMap::new();
        inner.insert(20u32, BinValue::F32(5.0));
        let mut fields = IndexMap::new();
        fields.insert(
            10u32,
            BinValue::List {
                is_list2: false,
                item: BinType::Embed,
                items: vec![BinValue::Embed {
                    class: 1,
                    fields: inner,
                }],
            },
        );
        let bin = Bin {
            entries: vec![BinEntry {
                path_hash: 1,
                class_hash: 2,
                fields,
            }],
            ..Bin::new()
        };
        vec![LoadedBin {
            path: Default::default(),
            role: BinRole::Main,
            source_format: crate::linked_bins::SourceFormat::Bin,
            tree: bin,
            dirty: false,
            link_str: None,
            mtime: None,
        }]
    }

    #[test]
    fn resolves_field_index_field_steps() {
        let mut bins = test_bins();
        let path = VfxPath::root(0, 0)
            .child(Step::Field { field: 10 })
            .child(Step::Index { index: 0 })
            .child(Step::Field { field: 20 });
        assert!(matches!(path.resolve_mut(&mut bins), Some(BinValue::F32(v)) if *v == 5.0));

        // A step-less path addresses the entry, not a value.
        let root = VfxPath::root(0, 0);
        assert!(root.entry_of(&mut bins).is_some());
        assert!(root.resolve_mut(&mut bins).is_none());

        // Out-of-range bin / index resolve to None instead of panicking.
        assert!(VfxPath::root(1, 0).entry_of(&mut bins).is_none());
        let bad = VfxPath::root(0, 0)
            .child(Step::Field { field: 10 })
            .child(Step::Index { index: 5 });
        assert!(bad.resolve_mut(&mut bins).is_none());
    }

    #[test]
    fn step_wire_shape_matches_bineditor() {
        let s: Step = serde_json::from_str(r#"{ "field": 7 }"#).unwrap();
        assert_eq!(s, Step::Field { field: 7 });
        let s: Step = serde_json::from_str(r#"{ "index": 2 }"#).unwrap();
        assert_eq!(s, Step::Index { index: 2 });

        let p = VfxPath {
            bin: 1,
            entry: 3,
            steps: vec![Step::Field { field: 7 }],
        };
        assert_eq!(
            serde_json::to_string(&p).unwrap(),
            r#"{"bin":1,"entry":3,"steps":[{"field":7}]}"#
        );
    }
}
