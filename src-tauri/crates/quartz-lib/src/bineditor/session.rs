//! Resident bin-editor session registry, mirroring `crate::vfx_session`:
//! a session holds the main skin bin plus every resolved linked bin (via
//! [`crate::linked_bins`]) as resident trees, a bounded undo/redo stack of
//! per-bin entry-granular COW frames (see [`crate::undo`]), and the pristine
//! per-bin `initial` trees for restore. Edits resolve `NodePath`s (which carry
//! a bin index) against the owning bin's tree and mark only that bin dirty; any
//! mid-batch failure swaps every captured frame back. Save writes ONLY dirty
//! bins, each back to its own file.

use super::path::{NodePath, Step};
use super::project::{self, EditorModel, EditorSystem};
use super::value::{self, JsonBinValue};
use crate::bin::write_bin;
use crate::error::{Error, Result};
use crate::linked_bins::{self, LoadedBin};
use crate::undo::UndoFrame;
use crate::vfx_session::construct::{self, ChildParams};
use crate::vfx_session::schema::{hash_or_hex, Hashes};
use indexmap::IndexMap;
use parking_lot::RwLock;
use ritoshark::bin::{Bin, BinEntry, BinType, BinValue};
use ritoshark::hash::fnv1a;
use serde::Deserialize;
use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;

pub type SessionId = u64;

const UNDO_CAP: usize = 50;

/// One leaf overwrite in an `apply` batch.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditOp {
    pub path: NodePath,
    pub value: JsonBinValue,
}

/// One reversible edit across the session: per-bin entry (or whole-tree) frames.
/// Mirrors `crate::vfx_session`'s multi-bin undo shape so a single Ctrl+Z
/// reverses the last logical edit regardless of which bins it touched.
struct MultiUndoFrame {
    parts: Vec<(usize, UndoFrame)>,
}

impl MultiUndoFrame {
    /// Swap every part back into its owning bin's tree and re-mark that bin
    /// dirty (its tree may now differ from disk regardless of save state).
    fn swap_with(&mut self, bins: &mut [LoadedBin]) {
        for (bin_idx, frame) in self.parts.iter_mut() {
            if let Some(lb) = bins.get_mut(*bin_idx) {
                frame.swap_with(&mut lb.tree);
                lb.dirty = true;
            }
        }
    }

    /// The `(bin, entry)` pairs this frame touched, for a partial reprojection.
    /// Returns `None` if any part is a whole-tree frame (restore), signalling a
    /// full reproject.
    fn touched(&self) -> Option<Vec<(usize, usize)>> {
        let mut out = Vec::new();
        for (bin_idx, frame) in &self.parts {
            let entries = frame.touched_entries()?;
            for e in entries {
                out.push((*bin_idx, e));
            }
        }
        Some(out)
    }
}

pub struct EditorSession {
    pub id: SessionId,
    /// Index 0 is always the main bin; linked bins follow in `linked` order.
    pub bins: Vec<LoadedBin>,
    /// Pristine per-bin parse from open time, for restore.
    pub initial: Vec<Bin>,
    undo: Vec<MultiUndoFrame>,
    redo: Vec<MultiUndoFrame>,
}

impl EditorSession {
    /// Commit a completed edit's frame to the undo stack. A fresh edit
    /// invalidates the redo history.
    fn push_undo(&mut self, frame: MultiUndoFrame) {
        if self.undo.len() >= UNDO_CAP {
            self.undo.remove(0);
        }
        self.undo.push(frame);
        self.redo.clear();
    }
}

static REGISTRY: OnceLock<RwLock<HashMap<SessionId, EditorSession>>> = OnceLock::new();
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

fn registry() -> &'static RwLock<HashMap<SessionId, EditorSession>> {
    REGISTRY.get_or_init(|| RwLock::new(HashMap::new()))
}

pub struct OpenResult {
    pub session_id: SessionId,
    pub model: EditorModel,
}

/// Open a `.bin` (plus its resolvable linked bins) into a resident session and
/// register it. The main bin is index 0; linked bins follow. A `.py`/`.ritobin`
/// main opens as a single bin with no link resolution.
pub fn open(path: impl AsRef<Path>) -> Result<OpenResult> {
    let path = path.as_ref().to_path_buf();
    let bins = linked_bins::open_with_linked(&path)?;
    let initial = bins.iter().map(|b| b.tree.clone()).collect();
    let model = project::project_all(&bins);
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    registry().write().insert(
        id,
        EditorSession {
            id,
            bins,
            initial,
            undo: Vec::new(),
            redo: Vec::new(),
        },
    );
    Ok(OpenResult {
        session_id: id,
        model,
    })
}

/// Drop a session and free its trees. Returns false if the id was unknown.
pub fn close(id: SessionId) -> bool {
    registry().write().remove(&id).is_some()
}

fn with_session<R>(id: SessionId, f: impl FnOnce(&mut EditorSession) -> R) -> Result<R> {
    let mut reg = registry().write();
    let session = reg
        .get_mut(&id)
        .ok_or_else(|| Error::InvalidInput(format!("No bin editor session with id {}", id)))?;
    Ok(f(session))
}

/// Reproject the whole model from the live bins.
pub fn model_of(id: SessionId) -> Result<EditorModel> {
    with_session(id, |s| project::project_all(&s.bins))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum StructuralEdit {
    Insert {
        #[serde(rename = "parentPath")]
        parent_path: NodePath,
        key: Option<String>,
        index: Option<u32>,
        value: JsonBinValue,
    },
    Remove {
        path: NodePath,
    },
}

fn whole_tree_frame(s: &EditorSession, bins: &[usize]) -> MultiUndoFrame {
    MultiUndoFrame {
        parts: bins
            .iter()
            .copied()
            .map(|bin| (bin, UndoFrame::Tree(Box::new(s.bins[bin].tree.clone()))))
            .collect(),
    }
}

fn empty_resource_map() -> BinValue {
    BinValue::Map {
        key: BinType::Hash,
        value: BinType::Link,
        entries: Vec::new(),
    }
}

fn minimal_resolver(h: &Hashes, key: &str, value: &str) -> BinEntry {
    let mut map = empty_resource_map();
    let _ = construct::resolver_upsert(&mut map, key, value);
    let mut fields = IndexMap::new();
    fields.insert(h.resource_map, map);
    BinEntry {
        path_hash: hash_or_hex("Resources"),
        class_hash: h.resource_resolver,
        fields,
    }
}

/// Create a VFX system in the current editor document and register it in the
/// first ResourceResolver (or create a minimal resolver in the main bin).
pub fn create_vfx_system(id: SessionId, requested: &str) -> Result<EditorModel> {
    let requested = requested.trim();
    if requested.is_empty() {
        return Err(Error::InvalidInput(
            "System name cannot be empty".to_string(),
        ));
    }
    with_session(id, |s| -> Result<EditorModel> {
        let h = Hashes::new();
        let mut candidate = requested.to_string();
        let mut suffix = 2u32;
        let taken = |name: &str, bins: &[LoadedBin]| {
            bins.iter().any(|bin| bin.tree.entries.iter().any(|entry| {
            entry.class_hash == h.vfx_system_definition_data &&
                (entry.path_hash == hash_or_hex(name) ||
                 matches!(entry.fields.get(&h.particle_name), Some(BinValue::String(v)) if v.eq_ignore_ascii_case(name)) ||
                 matches!(entry.fields.get(&h.particle_path), Some(BinValue::String(v)) if v.eq_ignore_ascii_case(name)))
        }))
        };
        while taken(&candidate, &s.bins) {
            candidate = format!("{}_{}", requested, suffix);
            suffix += 1;
        }
        let target_bin = s
            .bins
            .iter()
            .position(|b| {
                b.path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.to_lowercase().contains("vfx"))
            })
            .unwrap_or(0);
        let resolver_bin = s
            .bins
            .iter()
            .position(|b| {
                b.tree
                    .entries
                    .iter()
                    .any(|e| e.class_hash == h.resource_resolver)
            })
            .unwrap_or(0);
        let mut touched = vec![target_bin];
        if resolver_bin != target_bin {
            touched.push(resolver_bin);
        }
        let frame = whole_tree_frame(s, &touched);

        let display_name = candidate.rsplit('/').next().unwrap_or(&candidate);
        s.bins[target_bin]
            .tree
            .entries
            .insert(0, construct::new_vfx_system(display_name, &candidate));
        s.bins[target_bin].dirty = true;

        let short_key = construct::derive_short_key(&candidate, display_name);
        if let Some(entry) = s.bins[resolver_bin]
            .tree
            .entries
            .iter_mut()
            .find(|e| e.class_hash == h.resource_resolver)
        {
            let map = entry
                .fields
                .entry(h.resource_map)
                .or_insert_with(empty_resource_map);
            construct::resolver_upsert(map, &short_key, &candidate)?;
        } else {
            s.bins[0]
                .tree
                .entries
                .push(minimal_resolver(&h, &short_key, &candidate));
        }
        s.bins[resolver_bin].dirty = true;
        s.push_undo(frame);
        Ok(project::project_all(&s.bins))
    })?
}

fn default_emitter(name: &str) -> BinValue {
    let h = Hashes::new();
    let mut fields = IndexMap::new();
    fields.insert(h.rate, construct::value_float(1.0));
    fields.insert(h.particle_lifetime, construct::value_float(1.0));
    fields.insert(h.emitter_name, BinValue::String(name.to_string()));
    fields.insert(h.bind_weight, construct::value_float(1.0));
    fields.insert(h.is_single_particle, BinValue::Flag(false));
    let mut scale = IndexMap::new();
    scale.insert(h.constant_value, BinValue::Vec3([1.0, 1.0, 1.0]));
    fields.insert(
        fnv1a("birthScale0"),
        BinValue::Embed {
            class: fnv1a("ValueVector3"),
            fields: scale.clone(),
        },
    );
    fields.insert(
        fnv1a("scale0"),
        BinValue::Embed {
            class: fnv1a("ValueVector3"),
            fields: scale,
        },
    );
    let mut color = IndexMap::new();
    color.insert(h.constant_value, BinValue::Vec4([1.0, 1.0, 1.0, 1.0]));
    fields.insert(
        h.birth_color,
        BinValue::Embed {
            class: fnv1a("ValueColor"),
            fields: color,
        },
    );
    fields.insert(
        fnv1a("primitive"),
        BinValue::Pointer {
            class: fnv1a("VfxPrimitiveArbitraryQuad"),
            fields: IndexMap::new(),
        },
    );
    fields.insert(h.blend_mode, BinValue::U8(1));
    fields.insert(h.texture, BinValue::String(String::new()));
    BinValue::Pointer {
        class: h.vfx_emitter_definition_data,
        fields,
    }
}

fn system_entry_mut<'a>(
    s: &'a mut EditorSession,
    path: &NodePath,
    h: &Hashes,
) -> Result<&'a mut BinEntry> {
    if !path.steps.is_empty() {
        return Err(Error::InvalidInput(
            "System path must address a top-level entry".to_string(),
        ));
    }
    let entry = s
        .bins
        .get_mut(path.bin)
        .and_then(|b| b.tree.entries.get_mut(path.entry))
        .ok_or_else(|| Error::InvalidInput("System no longer resolves".to_string()))?;
    if entry.class_hash != h.vfx_system_definition_data {
        return Err(Error::InvalidInput("Entry is not a VFX system".to_string()));
    }
    Ok(entry)
}

/// Add a usable default emitter to a system's complex emitter list.
pub fn add_vfx_emitter(id: SessionId, system: &NodePath, requested: &str) -> Result<EditorModel> {
    let base = if requested.trim().is_empty() {
        "Emitter"
    } else {
        requested.trim()
    };
    with_session(id, |s| -> Result<EditorModel> {
        let h = Hashes::new();
        let frame = MultiUndoFrame {
            parts: vec![(
                system.bin,
                UndoFrame::capture(&s.bins[system.bin].tree, [system.entry]),
            )],
        };
        let entry = system_entry_mut(s, system, &h)?;
        let mut name = base.to_string();
        let mut suffix = 2;
        let names: Vec<String> = [
            h.complex_emitter_definition_data,
            h.simple_emitter_definition_data,
        ]
        .iter()
        .filter_map(|key| entry.fields.get(key))
        .flat_map(|v| match v {
            BinValue::List { items, .. } => items.as_slice(),
            _ => &[],
        })
        .filter_map(|v| match v {
            BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => {
                match fields.get(&h.emitter_name) {
                    Some(BinValue::String(v)) => Some(v.clone()),
                    _ => None,
                }
            }
            _ => None,
        })
        .collect();
        while names.iter().any(|v| v.eq_ignore_ascii_case(&name)) {
            name = format!("{}_{}", base, suffix);
            suffix += 1;
        }
        let list = entry
            .fields
            .entry(h.complex_emitter_definition_data)
            .or_insert_with(|| BinValue::List {
                is_list2: false,
                item: BinType::Pointer,
                items: Vec::new(),
            });
        let BinValue::List { item, items, .. } = list else {
            return Err(Error::InvalidInput(
                "Complex emitter field is not a list".to_string(),
            ));
        };
        if *item != BinType::Pointer {
            return Err(Error::InvalidInput(
                "Complex emitter list does not contain pointers".to_string(),
            ));
        }
        items.push(default_emitter(&name));
        s.bins[system.bin].dirty = true;
        s.push_undo(frame);
        Ok(project::project_all(&s.bins))
    })?
}

/// Add Quartz's native child-particle emitter skeleton to a system.
pub fn add_child_emitter(
    id: SessionId,
    system: &NodePath,
    params: &ChildParams,
) -> Result<EditorModel> {
    if params.effect_key.trim().is_empty() {
        return Err(Error::InvalidInput(
            "Child effect key is required".to_string(),
        ));
    }
    with_session(id, |s| -> Result<EditorModel> {
        let h = Hashes::new();
        let frame = MultiUndoFrame {
            parts: vec![(
                system.bin,
                UndoFrame::capture(&s.bins[system.bin].tree, [system.entry]),
            )],
        };
        let entry = system_entry_mut(s, system, &h)?;
        let list = entry
            .fields
            .entry(h.complex_emitter_definition_data)
            .or_insert_with(|| BinValue::List {
                is_list2: false,
                item: BinType::Pointer,
                items: Vec::new(),
            });
        let BinValue::List { item, items, .. } = list else {
            return Err(Error::InvalidInput(
                "Complex emitter field is not a list".to_string(),
            ));
        };
        if *item != BinType::Pointer {
            return Err(Error::InvalidInput(
                "Complex emitter list does not contain pointers".to_string(),
            ));
        }
        items.push(construct::new_child_emitter(params));
        s.bins[system.bin].dirty = true;
        s.push_undo(frame);
        Ok(project::project_all(&s.bins))
    })?
}

/// Batch leaf overwrites across any resident bins. One undo frame for the whole
/// batch, capturing only the entries the edit paths touch (per bin), so a
/// single-field commit is O(one system), not O(whole file). If any edit fails
/// to resolve or its value tag mismatches, every captured frame is swapped back
/// and the whole batch errors. Each bin an edit lands in is marked dirty.
pub fn apply(id: SessionId, edits: &[EditOp]) -> Result<usize> {
    with_session(id, |s| apply_to(s, edits))?
}

/// Registry-free core of [`apply`], so tests can drive it against a session
/// value directly.
fn apply_to(s: &mut EditorSession, edits: &[EditOp]) -> Result<usize> {
    if edits.is_empty() {
        return Ok(0);
    }
    // Group touched entries by bin so each bin gets one capture frame.
    let mut by_bin: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
    for e in edits {
        by_bin.entry(e.path.bin).or_default().push(e.path.entry);
    }
    let mut parts: Vec<(usize, UndoFrame)> = by_bin
        .iter()
        .filter_map(|(&b, entries)| {
            s.bins
                .get(b)
                .map(|lb| (b, UndoFrame::capture(&lb.tree, entries.iter().copied())))
        })
        .collect();

    for (i, op) in edits.iter().enumerate() {
        if let Err(e) = apply_one(&mut s.bins, op) {
            for (b, frame) in parts.iter_mut() {
                if let Some(lb) = s.bins.get_mut(*b) {
                    frame.swap_with(&mut lb.tree);
                }
            }
            return Err(Error::InvalidInput(format!("Edit {} failed: {}", i, e)));
        }
    }
    for (b, _) in &parts {
        if let Some(lb) = s.bins.get_mut(*b) {
            lb.dirty = true;
        }
    }
    s.push_undo(MultiUndoFrame {
        parts: std::mem::take(&mut parts),
    });
    Ok(edits.len())
}

fn apply_one(bins: &mut [LoadedBin], op: &EditOp) -> Result<()> {
    let mut new_val = value::json_to_bin(&op.value)?;
    let target = op
        .path
        .resolve_mut(bins)
        .ok_or_else(|| Error::InvalidInput("Path no longer resolves to a value".to_string()))?;

    match (&*target, &new_val) {
        // JSON lists arrive as plain "list"; either List flavor is accepted,
        // but the item type must match.
        (BinValue::List { item, .. }, BinValue::List { item: new_item, .. }) => {
            if new_item != item {
                return Err(Error::InvalidInput(format!(
                    "List item type mismatch: node holds {}, edit holds {}",
                    value::bintype_tag(*item),
                    value::bintype_tag(*new_item)
                )));
            }
        }
        (BinValue::Option { item, .. }, BinValue::Option { item: new_item, .. }) => {
            if new_item != item {
                return Err(Error::InvalidInput(format!(
                    "Option inner type mismatch: node holds {}, edit holds {}",
                    value::bintype_tag(*item),
                    value::bintype_tag(*new_item)
                )));
            }
        }
        (old, new) => {
            if new.ty() != old.ty() {
                return Err(Error::InvalidInput(format!(
                    "Type mismatch: node is {}, edit value is {}",
                    value::bintype_tag(old.ty()),
                    value::bintype_tag(new.ty())
                )));
            }
        }
    }

    // Preserve the node's original List2 flavor across the overwrite.
    if let (
        BinValue::List { is_list2, .. },
        BinValue::List {
            is_list2: new_l2, ..
        },
    ) = (&*target, &mut new_val)
    {
        *new_l2 = *is_list2;
    }

    *target = new_val;
    Ok(())
}

/// Add a field to a struct (`key`) or an element to a list (`index`; `None`
/// appends). Returns the fresh projection.
pub fn insert(
    id: SessionId,
    parent_path: &NodePath,
    key: Option<&str>,
    index: Option<u32>,
    val: &JsonBinValue,
) -> Result<EditorModel> {
    with_session(id, |s| -> Result<EditorModel> {
        let frame = match s.bins.get(parent_path.bin) {
            Some(lb) => UndoFrame::capture(&lb.tree, [parent_path.entry]),
            None => {
                return Err(Error::InvalidInput(
                    "Parent path no longer resolves".to_string(),
                ))
            }
        };
        // A failed insert never mutates, so there is nothing to swap back.
        insert_impl(&mut s.bins, parent_path, key, index, val)?;
        if let Some(lb) = s.bins.get_mut(parent_path.bin) {
            lb.dirty = true;
        }
        s.push_undo(MultiUndoFrame {
            parts: vec![(parent_path.bin, frame)],
        });
        Ok(project::project_all(&s.bins))
    })?
}

/// Apply a logical group of inserts/removes as one transaction, one undo
/// frame, and one projection. This is used for curve conversion/keyframes and
/// bulk property creation so the UI does not reproject the whole document per
/// sub-operation.
pub fn structural_batch(id: SessionId, edits: &[StructuralEdit]) -> Result<EditorModel> {
    if edits.is_empty() {
        return model_of(id);
    }
    with_session(id, |s| -> Result<EditorModel> {
        let mut by_bin: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
        for edit in edits {
            let path = match edit {
                StructuralEdit::Insert { parent_path, .. } => parent_path,
                StructuralEdit::Remove { path } => path,
            };
            by_bin.entry(path.bin).or_default().push(path.entry);
        }
        let mut parts: Vec<(usize, UndoFrame)> = by_bin
            .iter()
            .map(|(&bin, entries)| {
                let tree = &s
                    .bins
                    .get(bin)
                    .ok_or_else(|| {
                        Error::InvalidInput("Structural edit bin no longer exists".to_string())
                    })?
                    .tree;
                Ok((bin, UndoFrame::capture(tree, entries.iter().copied())))
            })
            .collect::<Result<_>>()?;
        for (index, edit) in edits.iter().enumerate() {
            let result = match edit {
                StructuralEdit::Insert {
                    parent_path,
                    key,
                    index,
                    value,
                } => insert_impl(&mut s.bins, parent_path, key.as_deref(), *index, value),
                StructuralEdit::Remove { path } => remove_impl(&mut s.bins, path),
            };
            if let Err(error) = result {
                for (bin, frame) in parts.iter_mut() {
                    frame.swap_with(&mut s.bins[*bin].tree);
                }
                return Err(Error::InvalidInput(format!(
                    "Structural edit {} failed: {}",
                    index, error
                )));
            }
        }
        for bin in by_bin.keys() {
            s.bins[*bin].dirty = true;
        }
        s.push_undo(MultiUndoFrame { parts });
        Ok(project::project_all(&s.bins))
    })?
}

fn insert_impl(
    bins: &mut [LoadedBin],
    parent_path: &NodePath,
    key: Option<&str>,
    index: Option<u32>,
    val: &JsonBinValue,
) -> Result<()> {
    let new_val = value::json_to_bin(val)?;

    // An empty-steps path addresses the top-level entry's own field map.
    if parent_path.steps.is_empty() {
        let entry = bins
            .get_mut(parent_path.bin)
            .and_then(|lb| lb.tree.entries.get_mut(parent_path.entry))
            .ok_or_else(|| Error::InvalidInput("Parent path no longer resolves".to_string()))?;
        let key = key.ok_or_else(|| {
            Error::InvalidInput("A key is required when inserting into a struct".to_string())
        })?;
        return insert_field(&mut entry.fields, key, new_val);
    }

    let parent = parent_path
        .resolve_mut(bins)
        .ok_or_else(|| Error::InvalidInput("Parent path no longer resolves".to_string()))?;
    match parent {
        BinValue::Embed { fields, .. } | BinValue::Pointer { fields, .. } => {
            let key = key.ok_or_else(|| {
                Error::InvalidInput("A key is required when inserting into a struct".to_string())
            })?;
            insert_field(fields, key, new_val)
        }
        BinValue::List { item, items, .. } => {
            if key.is_some() {
                return Err(Error::InvalidInput(
                    "A key is not valid when inserting into a list".to_string(),
                ));
            }
            if new_val.ty() != *item {
                return Err(Error::InvalidInput(format!(
                    "List holds {}, inserted value is {}",
                    value::bintype_tag(*item),
                    value::bintype_tag(new_val.ty())
                )));
            }
            let idx = index.map(|i| i as usize).unwrap_or(items.len());
            if idx > items.len() {
                return Err(Error::InvalidInput(format!(
                    "Insert index {} out of bounds (list has {} items)",
                    idx,
                    items.len()
                )));
            }
            items.insert(idx, new_val);
            Ok(())
        }
        other => Err(Error::InvalidInput(format!(
            "Parent is a {}, not a struct or list",
            value::bintype_tag(other.ty())
        ))),
    }
}

fn insert_field(fields: &mut IndexMap<u32, BinValue>, key: &str, val: BinValue) -> Result<()> {
    let hash = value::hash32_of(key)?;
    if fields.contains_key(&hash) {
        return Err(Error::InvalidInput(format!(
            "Field '{}' already exists",
            key
        )));
    }
    fields.insert(hash, val);
    Ok(())
}

/// Move a field/element up (`delta < 0`) or down (`delta > 0`) within its
/// parent struct/list by `|delta|` positions, clamped to the container bounds.
/// Struct fields reorder via `IndexMap::move_index`; list items via a `Vec`
/// shift. Returns the fresh projection. A no-op move (already at the edge)
/// still succeeds without pushing an undo frame.
pub fn move_node(id: SessionId, path: &NodePath, delta: i32) -> Result<EditorModel> {
    with_session(id, |s| -> Result<EditorModel> {
        let frame = match s.bins.get(path.bin) {
            Some(lb) => UndoFrame::capture(&lb.tree, [path.entry]),
            None => return Err(Error::InvalidInput("Path no longer resolves".to_string())),
        };
        // A failed/no-op move never mutates, so there is nothing to swap back.
        let moved = move_impl(&mut s.bins, path, delta)?;
        if moved {
            if let Some(lb) = s.bins.get_mut(path.bin) {
                lb.dirty = true;
            }
            s.push_undo(MultiUndoFrame {
                parts: vec![(path.bin, frame)],
            });
        }
        Ok(project::project_all(&s.bins))
    })?
}

/// Returns `true` if a reorder actually happened (`false` for an edge no-op).
fn move_impl(bins: &mut [LoadedBin], path: &NodePath, delta: i32) -> Result<bool> {
    let Some((last, parent_steps)) = path.steps.split_last() else {
        return Err(Error::InvalidInput(
            "Cannot move a top-level entry".to_string(),
        ));
    };
    let parent = NodePath {
        bin: path.bin,
        entry: path.entry,
        steps: parent_steps.to_vec(),
    };

    match last {
        Step::Field { field } => {
            let fields = if parent.steps.is_empty() {
                &mut bins
                    .get_mut(path.bin)
                    .and_then(|lb| lb.tree.entries.get_mut(path.entry))
                    .ok_or_else(|| Error::InvalidInput("Path no longer resolves".to_string()))?
                    .fields
            } else {
                match parent.resolve_mut(bins) {
                    Some(BinValue::Embed { fields, .. })
                    | Some(BinValue::Pointer { fields, .. }) => fields,
                    Some(other) => {
                        return Err(Error::InvalidInput(format!(
                            "Parent is a {}, not a struct",
                            value::bintype_tag(other.ty())
                        )))
                    }
                    None => return Err(Error::InvalidInput("Path no longer resolves".to_string())),
                }
            };
            let from = fields
                .get_index_of(field)
                .ok_or_else(|| Error::InvalidInput(format!("Field 0x{:08x} not found", field)))?;
            let to = clamp_target(from, delta, fields.len());
            if to == from {
                return Ok(false);
            }
            fields.move_index(from, to);
            Ok(true)
        }
        Step::Index { index } => match parent.resolve_mut(bins) {
            Some(BinValue::List { items, .. }) => {
                if *index >= items.len() {
                    return Err(Error::InvalidInput(format!(
                        "Index {} out of bounds (list has {} items)",
                        index,
                        items.len()
                    )));
                }
                let to = clamp_target(*index, delta, items.len());
                if to == *index {
                    return Ok(false);
                }
                let item = items.remove(*index);
                items.insert(to, item);
                Ok(true)
            }
            Some(other) => Err(Error::InvalidInput(format!(
                "Parent is a {}, not a list",
                value::bintype_tag(other.ty())
            ))),
            None => Err(Error::InvalidInput("Path no longer resolves".to_string())),
        },
    }
}

/// Clamp `from + delta` into `[0, len - 1]` (len is always >= 1 here since the
/// node itself resolved).
fn clamp_target(from: usize, delta: i32, len: usize) -> usize {
    let target = from as i64 + delta as i64;
    target.clamp(0, len as i64 - 1) as usize
}

/// Remove a field from its parent struct or splice an element out of its
/// parent list. Returns the fresh projection.
pub fn remove(id: SessionId, path: &NodePath) -> Result<EditorModel> {
    with_session(id, |s| -> Result<EditorModel> {
        let frame = match s.bins.get(path.bin) {
            Some(lb) => UndoFrame::capture(&lb.tree, [path.entry]),
            None => return Err(Error::InvalidInput("Path no longer resolves".to_string())),
        };
        // A failed remove never mutates, so there is nothing to swap back.
        remove_impl(&mut s.bins, path)?;
        if let Some(lb) = s.bins.get_mut(path.bin) {
            lb.dirty = true;
        }
        s.push_undo(MultiUndoFrame {
            parts: vec![(path.bin, frame)],
        });
        Ok(project::project_all(&s.bins))
    })?
}

fn remove_impl(bins: &mut [LoadedBin], path: &NodePath) -> Result<()> {
    let Some((last, parent_steps)) = path.steps.split_last() else {
        return Err(Error::InvalidInput(
            "Cannot remove a top-level entry".to_string(),
        ));
    };
    let parent = NodePath {
        bin: path.bin,
        entry: path.entry,
        steps: parent_steps.to_vec(),
    };

    match last {
        Step::Field { field } => {
            let fields = if parent.steps.is_empty() {
                &mut bins
                    .get_mut(path.bin)
                    .and_then(|lb| lb.tree.entries.get_mut(path.entry))
                    .ok_or_else(|| Error::InvalidInput("Path no longer resolves".to_string()))?
                    .fields
            } else {
                match parent.resolve_mut(bins) {
                    Some(BinValue::Embed { fields, .. })
                    | Some(BinValue::Pointer { fields, .. }) => fields,
                    Some(other) => {
                        return Err(Error::InvalidInput(format!(
                            "Parent is a {}, not a struct",
                            value::bintype_tag(other.ty())
                        )))
                    }
                    None => return Err(Error::InvalidInput("Path no longer resolves".to_string())),
                }
            };
            // shift_remove keeps the remaining field order intact.
            fields
                .shift_remove(field)
                .map(|_| ())
                .ok_or_else(|| Error::InvalidInput(format!("Field 0x{:08x} not found", field)))
        }
        Step::Index { index } => match parent.resolve_mut(bins) {
            Some(BinValue::List { items, .. }) => {
                if *index >= items.len() {
                    return Err(Error::InvalidInput(format!(
                        "Index {} out of bounds (list has {} items)",
                        index,
                        items.len()
                    )));
                }
                items.remove(*index);
                Ok(())
            }
            Some(other) => Err(Error::InvalidInput(format!(
                "Parent is a {}, not a list",
                value::bintype_tag(other.ty())
            ))),
            None => Err(Error::InvalidInput("Path no longer resolves".to_string())),
        },
    }
}

/// What an undo/redo hands back: entry-granular frames re-project only the
/// systems they touched (O(touched), not O(file)); whole-tree frames
/// (restore) return a full refreshed model.
pub enum UndoOutcome {
    Full(EditorModel),
    Partial {
        /// `(bin, entry)` pairs the frame touched.
        entries: Vec<(usize, usize)>,
        systems: Vec<EditorSystem>,
    },
}

fn outcome_for(bins: &[LoadedBin], touched: Option<Vec<(usize, usize)>>) -> UndoOutcome {
    match touched {
        Some(entries) => UndoOutcome::Partial {
            systems: project::project_entries_multi(bins, &entries),
            entries,
        },
        None => UndoOutcome::Full(project::project_all(bins)),
    }
}

/// Undo the last mutating edit. Returns the refreshed view, or `None` if the
/// undo stack was empty.
pub fn undo(id: SessionId) -> Result<Option<UndoOutcome>> {
    with_session(id, |s| match s.undo.pop() {
        Some(mut frame) => {
            let touched = frame.touched();
            frame.swap_with(&mut s.bins);
            s.redo.push(frame);
            Some(outcome_for(&s.bins, touched))
        }
        None => None,
    })
}

/// Redo the last undone edit. Returns the refreshed view, or `None` if
/// there's nothing to redo.
pub fn redo(id: SessionId) -> Result<Option<UndoOutcome>> {
    with_session(id, |s| match s.redo.pop() {
        Some(mut frame) => {
            let touched = frame.touched();
            frame.swap_with(&mut s.bins);
            if s.undo.len() >= UNDO_CAP {
                s.undo.remove(0);
            }
            s.undo.push(frame);
            Some(outcome_for(&s.bins, touched))
        }
        None => None,
    })
}

/// Reset every bin to its pristine open-time parse. The pre-restore trees are
/// kept as whole-tree undo frames (one per bin), so restore itself is undoable.
pub fn restore(id: SessionId) -> Result<EditorModel> {
    with_session(id, |s| {
        let mut parts = Vec::with_capacity(s.bins.len());
        for (i, lb) in s.bins.iter_mut().enumerate() {
            let pristine = s.initial[i].clone();
            let prev = std::mem::replace(&mut lb.tree, pristine);
            lb.dirty = true;
            parts.push((i, UndoFrame::Tree(Box::new(prev))));
        }
        s.push_undo(MultiUndoFrame { parts });
        project::project_all(&s.bins)
    })
}

/// Save the session. With `out_path = None`, writes ONLY the dirty bins, each
/// back to its own file in its own format (via [`crate::linked_bins::save_dirty`]),
/// and returns the paths written. With `out_path = Some(dest)`, this is a
/// Save-As of the MAIN bin (index 0) to `dest`; linked bins are not written.
pub fn save(id: SessionId, out_path: Option<PathBuf>, force: bool) -> Result<Vec<PathBuf>> {
    with_session(id, |s| -> Result<Vec<PathBuf>> {
        match out_path {
            None => linked_bins::save_dirty_checked(&mut s.bins, force),
            Some(dest) => {
                let main = s
                    .bins
                    .get_mut(0)
                    .ok_or_else(|| Error::InvalidInput("Session has no bins".to_string()))?;
                let bytes =
                    write_bin(&main.tree).map_err(|e| Error::InvalidInput(e.to_string()))?;
                std::fs::write(&dest, bytes).map_err(|e| Error::io_with_path(e, &dest))?;
                main.dirty = false;
                Ok(vec![dest])
            }
        }
    })?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bin::read_bin;
    use ritoshark::hash::fnv1a;
    use std::time::Instant;

    fn sample_bin() -> Bin {
        // Reuse the projection test fixture: one VfxSystemDefinitionData entry,
        // one complex emitter { emitterName, rate: f32, color: embed { values: list[vec4] } }.
        crate::bineditor::project::tests::sample_bin()
    }

    /// Wrap a tree as a single resident main bin.
    fn loaded_one(tree: Bin) -> LoadedBin {
        LoadedBin {
            path: PathBuf::new(),
            role: crate::linked_bins::BinRole::Main,
            source_format: crate::linked_bins::SourceFormat::Bin,
            tree,
            dirty: false,
            link_str: None,
            mtime: None,
        }
    }

    /// Register an in-memory single-bin session (no disk) for undo/redo tests.
    fn open_tree_for_test(tree: Bin) -> SessionId {
        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        registry().write().insert(
            id,
            EditorSession {
                id,
                bins: vec![loaded_one(tree.clone())],
                initial: vec![tree],
                undo: Vec::new(),
                redo: Vec::new(),
            },
        );
        id
    }

    /// Serialize the session's main tree — byte-exact state fingerprint.
    fn bytes_of(id: SessionId) -> Vec<u8> {
        with_session(id, |s| write_bin(&s.bins[0].tree).unwrap()).unwrap()
    }

    /// The real-file fixture: `QUARTZ_TEST_BIN` env override, defaulting to the
    /// locke skin bin. Tests that need it skip gracefully when it's absent.
    fn real_bin_path() -> Option<PathBuf> {
        let p = std::env::var("QUARTZ_TEST_BIN")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                PathBuf::from(r"D:\updated skins\Frozen Locke\data\locke_vfx_skin0.bin")
            });
        p.is_file().then_some(p)
    }

    /// Collect NodePaths to f32 leaves, walking the same containers
    /// `NodePath::resolve_mut` descends (entry fields, embeds/pointers, lists).
    fn collect_f32_paths(bin: &Bin, cap: usize) -> Vec<NodePath> {
        fn walk(v: &BinValue, path: &NodePath, out: &mut Vec<NodePath>, cap: usize) {
            if out.len() >= cap {
                return;
            }
            match v {
                BinValue::F32(_) => out.push(path.clone()),
                BinValue::Embed { fields, .. } | BinValue::Pointer { fields, .. } => {
                    for (h, c) in fields.iter() {
                        walk(c, &path.child(Step::Field { field: *h }), out, cap);
                    }
                }
                BinValue::List { items, .. } => {
                    for (i, c) in items.iter().enumerate() {
                        walk(c, &path.child(Step::Index { index: i }), out, cap);
                    }
                }
                _ => {}
            }
        }
        let mut out = Vec::new();
        for (ei, e) in bin.entries.iter().enumerate() {
            for (h, v) in e.fields.iter() {
                walk(
                    v,
                    &NodePath {
                        bin: 0,
                        entry: ei,
                        steps: vec![Step::Field { field: *h }],
                    },
                    &mut out,
                    cap,
                );
                if out.len() >= cap {
                    return out;
                }
            }
        }
        out
    }

    /// Build scaling EditOps for a slice of f32 paths from their live values.
    fn scale_edits(id: SessionId, paths: &[NodePath], factor: f64) -> Vec<EditOp> {
        with_session(id, |s| {
            paths
                .iter()
                .filter_map(|p| match p.resolve_mut(&mut s.bins) {
                    Some(BinValue::F32(v)) => Some(EditOp {
                        path: p.clone(),
                        value: JsonBinValue::F32 {
                            v: (*v as f64) * factor + 0.011,
                        },
                    }),
                    _ => None,
                })
                .collect()
        })
        .unwrap()
    }

    #[test]
    fn undo_redo_replays_states_byte_exact() {
        let id = open_tree_for_test(sample_bin());
        let rate_path = emitter_path().child(Step::Field {
            field: fnv1a("rate"),
        });
        let mut states = vec![bytes_of(id)];

        // 1) leaf apply
        apply(
            id,
            &[EditOp {
                path: rate_path.clone(),
                value: JsonBinValue::F32 { v: 42.5 },
            }],
        )
        .unwrap();
        states.push(bytes_of(id));
        // 2) structural insert
        insert(
            id,
            &emitter_path(),
            Some("bindWeight"),
            None,
            &JsonBinValue::F32 { v: 0.5 },
        )
        .unwrap();
        states.push(bytes_of(id));
        // 3) structural remove of the same field
        remove(
            id,
            &emitter_path().child(Step::Field {
                field: fnv1a("bindWeight"),
            }),
        )
        .unwrap();
        states.push(bytes_of(id));
        // 4) another leaf apply
        apply(
            id,
            &[EditOp {
                path: rate_path,
                value: JsonBinValue::F32 { v: 7.25 },
            }],
        )
        .unwrap();
        states.push(bytes_of(id));

        // Undo replays every recorded state in reverse, byte-exact.
        for expect in states.iter().rev().skip(1) {
            undo(id).unwrap().expect("undo frame available");
            assert_eq!(&bytes_of(id), expect, "undo diverged from recorded state");
        }
        assert!(
            with_session(id, |s| s.bins[0].tree == s.initial[0]).unwrap(),
            "tree != pristine after full undo"
        );
        assert!(undo(id).unwrap().is_none(), "undo stack should be empty");

        // Redo replays forward, byte-exact.
        for expect in states.iter().skip(1) {
            redo(id).unwrap().expect("redo frame available");
            assert_eq!(&bytes_of(id), expect, "redo diverged from recorded state");
        }
        assert!(redo(id).unwrap().is_none(), "redo stack should be empty");
        close(id);
    }

    #[test]
    fn failed_batch_swaps_back_byte_exact() {
        let id = open_tree_for_test(sample_bin());
        let rate_path = emitter_path().child(Step::Field {
            field: fnv1a("rate"),
        });
        let before = bytes_of(id);

        // First edit is valid, second has a type mismatch — the whole batch
        // must roll back, leaving no trace and no undo frame.
        let batch = [
            EditOp {
                path: rate_path.clone(),
                value: JsonBinValue::F32 { v: 99.0 },
            },
            EditOp {
                path: rate_path,
                value: JsonBinValue::U8 { v: 1.0 },
            },
        ];
        assert!(apply(id, &batch).is_err());
        assert_eq!(bytes_of(id), before, "failed batch mutated the tree");
        assert!(
            undo(id).unwrap().is_none(),
            "failed batch left an undo frame"
        );
        close(id);
    }

    #[test]
    fn restore_is_undoable() {
        let id = open_tree_for_test(sample_bin());
        let rate_path = emitter_path().child(Step::Field {
            field: fnv1a("rate"),
        });
        let s0 = bytes_of(id);
        apply(
            id,
            &[EditOp {
                path: rate_path,
                value: JsonBinValue::F32 { v: 3.0 },
            }],
        )
        .unwrap();
        let s1 = bytes_of(id);

        restore(id).unwrap();
        assert_eq!(bytes_of(id), s0);
        undo(id).unwrap().expect("restore should be undoable");
        assert_eq!(bytes_of(id), s1);
        close(id);
    }

    /// Hard round-trip on the real skin bin: batches of scaling edits plus
    /// structural insert/remove, every intermediate state fingerprinted, then
    /// undo/redo must replay the exact byte sequence both directions.
    #[test]
    fn real_bin_undo_redo_replays_byte_exact() {
        let Some(path) = real_bin_path() else {
            eprintln!("skipping: real test bin not found (set QUARTZ_TEST_BIN)");
            return;
        };

        // Serializer stability: write(parse(write(parse(file)))) == write(parse(file)).
        let raw = std::fs::read(&path).unwrap();
        let b0 = write_bin(&read_bin(&raw).unwrap()).unwrap();
        let b1 = write_bin(&read_bin(&b0).unwrap()).unwrap();
        assert_eq!(b0, b1, "serializer is not round-trip stable");

        let opened = open(&path).unwrap();
        let id = opened.session_id;
        let paths = with_session(id, |s| collect_f32_paths(&s.bins[0].tree, 400)).unwrap();
        assert!(!paths.is_empty(), "no f32 leaves in the test bin");

        let mut states = vec![bytes_of(id)];
        // 10 batches of 40 scaling edits.
        for chunk in paths.chunks(40).take(10) {
            let edits = scale_edits(id, chunk, 1.37);
            if edits.is_empty() {
                continue;
            }
            apply(id, &edits).unwrap();
            states.push(bytes_of(id));
        }
        // Structural: insert a fresh field into entry 0, then remove an
        // existing struct field (one whose last step is Field).
        insert(
            id,
            &NodePath::root(0, 0),
            Some("quartzTestField"),
            None,
            &JsonBinValue::F32 { v: 1.0 },
        )
        .unwrap();
        states.push(bytes_of(id));
        if let Some(p) = paths
            .iter()
            .find(|p| matches!(p.steps.last(), Some(Step::Field { .. })))
        {
            remove(id, p).unwrap();
            states.push(bytes_of(id));
        }

        for expect in states.iter().rev().skip(1) {
            undo(id).unwrap().expect("undo frame available");
            assert_eq!(&bytes_of(id), expect, "undo diverged on real bin");
        }
        assert!(
            with_session(id, |s| s.bins[0].tree == s.initial[0]).unwrap(),
            "tree != pristine after full undo"
        );
        assert_eq!(bytes_of(id), states[0]);

        for expect in states.iter().skip(1) {
            redo(id).unwrap().expect("redo frame available");
            assert_eq!(&bytes_of(id), expect, "redo diverged on real bin");
        }
        close(id);
    }

    /// Perf report: old per-edit cost (whole-tree clone) vs the new
    /// entry-granular apply, on the real bin. Run with:
    /// `cargo test -p quartz-lib --release bench_apply -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn bench_apply_vs_whole_tree_clone() {
        let Some(path) = real_bin_path() else {
            eprintln!("skipping: real test bin not found (set QUARTZ_TEST_BIN)");
            return;
        };
        let opened = open(&path).unwrap();
        let id = opened.session_id;

        let (n_entries, clone_avg) = with_session(id, |s| {
            let iters = 10u32;
            let t0 = Instant::now();
            for _ in 0..iters {
                std::hint::black_box(s.bins[0].tree.clone());
            }
            (s.bins[0].tree.entries.len(), t0.elapsed() / iters)
        })
        .unwrap();

        let paths = with_session(id, |s| collect_f32_paths(&s.bins[0].tree, 500)).unwrap();

        // Single-edit applies (the keystroke path).
        let singles = scale_edits(id, &paths, 1.001);
        let t0 = Instant::now();
        for op in &singles {
            apply(id, std::slice::from_ref(op)).unwrap();
        }
        let single_avg = t0.elapsed() / singles.len().max(1) as u32;

        // Bulk batches of 100 (the "×2 birthscale on N emitters" path).
        let t0 = Instant::now();
        let mut bulks = 0u32;
        for chunk in paths.chunks(100).take(5) {
            let edits = scale_edits(id, chunk, 1.002);
            apply(id, &edits).unwrap();
            bulks += 1;
        }
        let bulk_avg = t0.elapsed() / bulks.max(1);

        // Undo/redo pairs (includes full model projection, as the UI pays it).
        let t0 = Instant::now();
        let pairs = 20u32;
        for _ in 0..pairs {
            undo(id).unwrap().unwrap();
            redo(id).unwrap().unwrap();
        }
        let pair_avg = t0.elapsed() / pairs;

        println!(
            "bineditor bench: {} entries | whole-tree clone (old per-edit cost) {:?} | \
             single apply {:?} | bulk-100 apply {:?} | undo+redo pair {:?}",
            n_entries, clone_avg, single_avg, bulk_avg, pair_avg
        );
        close(id);
    }

    fn emitter_path() -> NodePath {
        NodePath {
            bin: 0,
            entry: 0,
            steps: vec![
                Step::Field {
                    field: fnv1a("ComplexEmitterDefinitionData"),
                },
                Step::Index { index: 0 },
            ],
        }
    }

    #[test]
    fn edit_marks_only_the_owning_bin_dirty() {
        // Two resident bins, each with one VFX system. An edit into bin 1 must
        // dirty only bin 1 and write only bin 1's value.
        let mut s = EditorSession {
            id: 1,
            bins: vec![loaded_one(sample_bin()), loaded_one(sample_bin())],
            initial: vec![sample_bin(), sample_bin()],
            undo: Vec::new(),
            redo: Vec::new(),
        };

        // The rate leaf lives at bin/entry 0, same steps in each bin.
        let mut rate_path = emitter_path().child(Step::Field {
            field: fnv1a("rate"),
        });
        rate_path.bin = 1;

        apply_to(
            &mut s,
            &[EditOp {
                path: rate_path.clone(),
                value: JsonBinValue::F32 { v: 9.0 },
            }],
        )
        .unwrap();

        assert!(!s.bins[0].dirty, "bin 0 must be untouched");
        assert!(s.bins[1].dirty, "bin 1 must be dirty");
        assert!(matches!(rate_path.resolve_mut(&mut s.bins), Some(BinValue::F32(v)) if *v == 9.0));
        // Bin 0's rate is unchanged (still the fixture's 4.0).
        let mut bin0_rate = emitter_path().child(Step::Field {
            field: fnv1a("rate"),
        });
        bin0_rate.bin = 0;
        assert!(matches!(bin0_rate.resolve_mut(&mut s.bins), Some(BinValue::F32(v)) if *v == 4.0));
    }

    #[test]
    fn apply_overwrites_and_rejects_mismatch() {
        let mut bins = vec![loaded_one(sample_bin())];
        let rate_path = emitter_path().child(Step::Field {
            field: fnv1a("rate"),
        });

        let ok = EditOp {
            path: rate_path.clone(),
            value: JsonBinValue::F32 { v: 9.5 },
        };
        apply_one(&mut bins, &ok).unwrap();
        assert!(matches!(rate_path.resolve_mut(&mut bins), Some(BinValue::F32(v)) if *v == 9.5));

        let bad = EditOp {
            path: rate_path.clone(),
            value: JsonBinValue::U8 { v: 1.0 },
        };
        assert!(apply_one(&mut bins, &bad).is_err());
    }

    #[test]
    fn insert_and_remove_field_and_list_item() {
        let mut bins = vec![loaded_one(sample_bin())];
        let epath = emitter_path();

        // Add a new f32 field to the emitter struct.
        insert_impl(
            &mut bins,
            &epath,
            Some("bindWeight"),
            None,
            &JsonBinValue::F32 { v: 1.0 },
        )
        .unwrap();
        let field_path = epath.child(Step::Field {
            field: fnv1a("bindWeight"),
        });
        assert!(matches!(
            field_path.resolve_mut(&mut bins),
            Some(BinValue::F32(_))
        ));

        // Duplicate key errors.
        assert!(insert_impl(
            &mut bins,
            &epath,
            Some("bindWeight"),
            None,
            &JsonBinValue::F32 { v: 2.0 }
        )
        .is_err());

        // Append a vec4 keyframe to the color values list.
        let list_path = epath
            .child(Step::Field {
                field: fnv1a("color"),
            })
            .child(Step::Field {
                field: fnv1a("values"),
            });
        insert_impl(
            &mut bins,
            &list_path,
            None,
            None,
            &JsonBinValue::Vec4 {
                v: [0.0, 1.0, 0.0, 1.0],
            },
        )
        .unwrap();
        match list_path.resolve_mut(&mut bins) {
            Some(BinValue::List { items, .. }) => assert_eq!(items.len(), 2),
            other => panic!("expected list, got {:?}", other),
        }

        // Wrong item type into the list errors.
        assert!(insert_impl(
            &mut bins,
            &list_path,
            None,
            None,
            &JsonBinValue::F32 { v: 1.0 }
        )
        .is_err());

        // Remove the list element, then the added field.
        remove_impl(&mut bins, &list_path.child(Step::Index { index: 1 })).unwrap();
        match list_path.resolve_mut(&mut bins) {
            Some(BinValue::List { items, .. }) => assert_eq!(items.len(), 1),
            other => panic!("expected list, got {:?}", other),
        }
        remove_impl(&mut bins, &field_path).unwrap();
        assert!(field_path.resolve_mut(&mut bins).is_none());
    }
}
