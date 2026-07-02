//! Relocatable paths into a live `Bin` tree. Serde-visible (unlike paint's
//! private paths) because the frontend holds them opaquely and passes them back
//! verbatim: `{ "entry": 3, "steps": [{ "field": 123 }, { "index": 2 }] }`.

use ritoshark::bin::{Bin, BinValue};
use serde::{Deserialize, Serialize};

/// One step from a parent field-map (embed/pointer/entry) or list down to a
/// child. Untagged: serializes as `{"field": u32}` or `{"index": usize}`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Step {
    Field { field: u32 },
    Index { index: usize },
}

/// Which top-level entry, then the steps down to the value. Resolved against
/// the resident tree at edit time so no borrow is held across IPC.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodePath {
    pub entry: usize,
    pub steps: Vec<Step>,
}

impl NodePath {
    pub fn root(entry: usize) -> NodePath {
        NodePath {
            entry,
            steps: Vec::new(),
        }
    }

    pub fn child(&self, step: Step) -> NodePath {
        let mut steps = self.steps.clone();
        steps.push(step);
        NodePath {
            entry: self.entry,
            steps,
        }
    }

    /// Resolve to a mutable reference into `bin`, or `None` if the path no
    /// longer points at a value (tree shape changed). A path with no steps
    /// addresses the entry itself, not a `BinValue`, so it resolves to `None`.
    pub fn resolve_mut<'a>(&self, bin: &'a mut Bin) -> Option<&'a mut BinValue> {
        let entry = bin.entries.get_mut(self.entry)?;
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
