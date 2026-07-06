//! Resident bin-editor session registry, mirroring `crate::paint::session`:
//! a session holds the parsed `Bin` tree, its source format for round-trip
//! saves, a bounded undo/redo stack of entry-granular COW frames (see
//! [`crate::undo`]), and — unlike paint — the pristine `initial` tree for
//! restore. Edits resolve `NodePath`s against the live tree; any mid-batch
//! failure swaps the frame back so the tree returns to its pre-batch state.

use super::path::{NodePath, Step};
use super::project::{self, EditorModel, EditorSystem};
use super::value::{self, JsonBinValue};
use crate::bin::{read_bin, text_to_tree, tree_to_text_cached, write_bin};
use crate::error::{Error, Result};
use crate::undo::{push_bounded, UndoFrame};
use indexmap::IndexMap;
use parking_lot::RwLock;
use ritoshark::bin::{Bin, BinValue};
use serde::Deserialize;
use std::collections::HashMap;
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

/// How the file was loaded, so save writes it back the same way.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceFormat {
    Bin,
    Text,
}

fn format_for_path(path: &Path) -> SourceFormat {
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

pub struct EditorSession {
    pub id: SessionId,
    pub source_path: PathBuf,
    pub source_format: SourceFormat,
    pub tree: Bin,
    /// Pristine parse from open time, for restore.
    pub initial: Bin,
    undo: Vec<UndoFrame>,
    redo: Vec<UndoFrame>,
}

impl EditorSession {
    /// Commit a completed edit's frame to the undo stack. A fresh edit
    /// invalidates the redo history.
    fn push_undo(&mut self, frame: UndoFrame) {
        push_bounded(&mut self.undo, frame, UNDO_CAP);
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

/// Open a `.bin`/`.py`/`.ritobin`, parse it into a resident tree, and register
/// the session. Binary files load straight into the tree (no text conversion).
pub fn open(path: impl AsRef<Path>) -> Result<OpenResult> {
    let path = path.as_ref().to_path_buf();
    let format = format_for_path(&path);

    let tree = match format {
        SourceFormat::Bin => {
            let data = std::fs::read(&path).map_err(|e| Error::io_with_path(e, &path))?;
            read_bin(&data).map_err(|e| Error::InvalidInput(e.to_string()))?
        }
        SourceFormat::Text => {
            let text = std::fs::read_to_string(&path).map_err(|e| Error::io_with_path(e, &path))?;
            text_to_tree(&text).map_err(|e| Error::InvalidInput(e.to_string()))?
        }
    };

    let model = project::project(&tree);
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    registry().write().insert(
        id,
        EditorSession {
            id,
            source_path: path,
            source_format: format,
            initial: tree.clone(),
            tree,
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

/// Reproject the model from the live tree.
pub fn model_of(id: SessionId) -> Result<EditorModel> {
    with_session(id, |s| project::project(&s.tree))
}

/// Batch leaf overwrites. One undo frame for the whole batch — only the
/// entries the edit paths touch are cloned, so a single-field commit is
/// O(one system), not O(whole file). If any edit fails to resolve or its
/// value tag mismatches the node's variant, the frame is swapped back and
/// the whole batch errors.
pub fn apply(id: SessionId, edits: &[EditOp]) -> Result<usize> {
    with_session(id, |s| -> Result<usize> {
        if edits.is_empty() {
            return Ok(0);
        }
        let mut frame = UndoFrame::capture(&s.tree, edits.iter().map(|e| e.path.entry));
        for (i, op) in edits.iter().enumerate() {
            if let Err(e) = apply_one(&mut s.tree, op) {
                frame.swap_with(&mut s.tree);
                return Err(Error::InvalidInput(format!("Edit {} failed: {}", i, e)));
            }
        }
        s.push_undo(frame);
        Ok(edits.len())
    })?
}

fn apply_one(tree: &mut Bin, op: &EditOp) -> Result<()> {
    let mut new_val = value::json_to_bin(&op.value)?;
    let target = op
        .path
        .resolve_mut(tree)
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
        let frame = UndoFrame::capture(&s.tree, [parent_path.entry]);
        if let Err(e) = insert_impl(&mut s.tree, parent_path, key, index, val) {
            // Nothing to swap back: a failed insert never mutates.
            return Err(e);
        }
        s.push_undo(frame);
        Ok(project::project(&s.tree))
    })?
}

fn insert_impl(
    tree: &mut Bin,
    parent_path: &NodePath,
    key: Option<&str>,
    index: Option<u32>,
    val: &JsonBinValue,
) -> Result<()> {
    let new_val = value::json_to_bin(val)?;

    // An empty-steps path addresses the top-level entry's own field map.
    if parent_path.steps.is_empty() {
        let entry = tree
            .entries
            .get_mut(parent_path.entry)
            .ok_or_else(|| Error::InvalidInput("Parent path no longer resolves".to_string()))?;
        let key = key.ok_or_else(|| {
            Error::InvalidInput("A key is required when inserting into a struct".to_string())
        })?;
        return insert_field(&mut entry.fields, key, new_val);
    }

    let parent = parent_path
        .resolve_mut(tree)
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

/// Remove a field from its parent struct or splice an element out of its
/// parent list. Returns the fresh projection.
pub fn remove(id: SessionId, path: &NodePath) -> Result<EditorModel> {
    with_session(id, |s| -> Result<EditorModel> {
        let frame = UndoFrame::capture(&s.tree, [path.entry]);
        if let Err(e) = remove_impl(&mut s.tree, path) {
            // Nothing to swap back: a failed remove never mutates.
            return Err(e);
        }
        s.push_undo(frame);
        Ok(project::project(&s.tree))
    })?
}

fn remove_impl(tree: &mut Bin, path: &NodePath) -> Result<()> {
    let Some((last, parent_steps)) = path.steps.split_last() else {
        return Err(Error::InvalidInput(
            "Cannot remove a top-level entry".to_string(),
        ));
    };
    let parent = NodePath {
        entry: path.entry,
        steps: parent_steps.to_vec(),
    };

    match last {
        Step::Field { field } => {
            let fields = if parent.steps.is_empty() {
                &mut tree
                    .entries
                    .get_mut(path.entry)
                    .ok_or_else(|| Error::InvalidInput("Path no longer resolves".to_string()))?
                    .fields
            } else {
                match parent.resolve_mut(tree) {
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
        Step::Index { index } => match parent.resolve_mut(tree) {
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
        entries: Vec<usize>,
        systems: Vec<EditorSystem>,
    },
}

fn outcome_for(tree: &Bin, touched: Option<Vec<usize>>) -> UndoOutcome {
    match touched {
        Some(entries) => UndoOutcome::Partial {
            systems: project::project_entries(tree, &entries),
            entries,
        },
        None => UndoOutcome::Full(project::project(tree)),
    }
}

/// Undo the last mutating edit. Returns the refreshed view, or `None` if the
/// undo stack was empty.
pub fn undo(id: SessionId) -> Result<Option<UndoOutcome>> {
    with_session(id, |s| match s.undo.pop() {
        Some(mut frame) => {
            let touched = frame.touched_entries();
            frame.swap_with(&mut s.tree);
            s.redo.push(frame);
            Some(outcome_for(&s.tree, touched))
        }
        None => None,
    })
}

/// Redo the last undone edit. Returns the refreshed view, or `None` if
/// there's nothing to redo.
pub fn redo(id: SessionId) -> Result<Option<UndoOutcome>> {
    with_session(id, |s| match s.redo.pop() {
        Some(mut frame) => {
            let touched = frame.touched_entries();
            frame.swap_with(&mut s.tree);
            push_bounded(&mut s.undo, frame, UNDO_CAP);
            Some(outcome_for(&s.tree, touched))
        }
        None => None,
    })
}

/// Reset the tree to the pristine open-time parse. The pre-restore tree is
/// kept as a whole-tree undo frame, so restore itself is undoable.
pub fn restore(id: SessionId) -> Result<EditorModel> {
    with_session(id, |s| {
        let prev = std::mem::replace(&mut s.tree, s.initial.clone());
        s.push_undo(UndoFrame::Tree(Box::new(prev)));
        project::project(&s.tree)
    })
}

/// Serialize the resident tree to disk in its original format. `out_path`
/// overrides the source path (e.g. Save As); otherwise saves in place.
pub fn save(id: SessionId, out_path: Option<PathBuf>) -> Result<PathBuf> {
    with_session(id, |s| -> Result<PathBuf> {
        let dest = out_path.unwrap_or_else(|| s.source_path.clone());
        // Honor the destination's own extension (Save As to a different format),
        // falling back to the source format when the dest has no extension.
        let format = match dest.extension() {
            Some(_) => format_for_path(&dest),
            None => s.source_format,
        };
        match format {
            SourceFormat::Bin => {
                let bytes =
                    write_bin(&s.tree).map_err(|e| Error::InvalidInput(e.to_string()))?;
                std::fs::write(&dest, bytes).map_err(|e| Error::io_with_path(e, &dest))?;
                // Keep a sibling .ritobin / .py text dump in sync, but only if one
                // already sits next to the bin — don't create new files.
                if let Some(sidecar) = existing_text_sidecar(&dest) {
                    let text = tree_to_text_cached(&s.tree)
                        .map_err(|e| Error::InvalidInput(e.to_string()))?;
                    std::fs::write(&sidecar, text).map_err(|e| Error::io_with_path(e, &sidecar))?;
                }
            }
            SourceFormat::Text => {
                let text =
                    tree_to_text_cached(&s.tree).map_err(|e| Error::InvalidInput(e.to_string()))?;
                std::fs::write(&dest, text).map_err(|e| Error::io_with_path(e, &dest))?;
            }
        }
        Ok(dest)
    })?
}

#[cfg(test)]
mod tests {
    use super::*;
    use ritoshark::hash::fnv1a;
    use std::time::Instant;

    fn sample_bin() -> Bin {
        // Reuse the projection test fixture: one VfxSystemDefinitionData entry,
        // one complex emitter { emitterName, rate: f32, color: embed { values: list[vec4] } }.
        crate::bineditor::project::tests::sample_bin()
    }

    /// Register an in-memory session (no disk) for undo/redo tests.
    fn open_tree_for_test(tree: Bin) -> SessionId {
        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        registry().write().insert(
            id,
            EditorSession {
                id,
                source_path: PathBuf::new(),
                source_format: SourceFormat::Bin,
                initial: tree.clone(),
                tree,
                undo: Vec::new(),
                redo: Vec::new(),
            },
        );
        id
    }

    /// Serialize the session's live tree — byte-exact state fingerprint.
    fn bytes_of(id: SessionId) -> Vec<u8> {
        with_session(id, |s| write_bin(&s.tree).unwrap()).unwrap()
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
                .filter_map(|p| match p.resolve_mut(&mut s.tree) {
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
            with_session(id, |s| s.tree == s.initial).unwrap(),
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
        let paths = with_session(id, |s| collect_f32_paths(&s.tree, 400)).unwrap();
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
            &NodePath::root(0),
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
            with_session(id, |s| s.tree == s.initial).unwrap(),
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
                std::hint::black_box(s.tree.clone());
            }
            (s.tree.entries.len(), t0.elapsed() / iters)
        })
        .unwrap();

        let paths = with_session(id, |s| collect_f32_paths(&s.tree, 500)).unwrap();

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
    fn apply_overwrites_and_rejects_mismatch() {
        let mut tree = sample_bin();
        let rate_path = emitter_path().child(Step::Field {
            field: fnv1a("rate"),
        });

        let ok = EditOp {
            path: rate_path.clone(),
            value: JsonBinValue::F32 { v: 9.5 },
        };
        apply_one(&mut tree, &ok).unwrap();
        assert!(matches!(rate_path.resolve_mut(&mut tree), Some(BinValue::F32(v)) if *v == 9.5));

        let bad = EditOp {
            path: rate_path.clone(),
            value: JsonBinValue::U8 { v: 1.0 },
        };
        assert!(apply_one(&mut tree, &bad).is_err());
    }

    #[test]
    fn insert_and_remove_field_and_list_item() {
        let mut tree = sample_bin();
        let epath = emitter_path();

        // Add a new f32 field to the emitter struct.
        insert_impl(
            &mut tree,
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
            field_path.resolve_mut(&mut tree),
            Some(BinValue::F32(_))
        ));

        // Duplicate key errors.
        assert!(insert_impl(
            &mut tree,
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
            &mut tree,
            &list_path,
            None,
            None,
            &JsonBinValue::Vec4 {
                v: [0.0, 1.0, 0.0, 1.0],
            },
        )
        .unwrap();
        match list_path.resolve_mut(&mut tree) {
            Some(BinValue::List { items, .. }) => assert_eq!(items.len(), 2),
            other => panic!("expected list, got {:?}", other),
        }

        // Wrong item type into the list errors.
        assert!(insert_impl(
            &mut tree,
            &list_path,
            None,
            None,
            &JsonBinValue::F32 { v: 1.0 }
        )
        .is_err());

        // Remove the list element, then the added field.
        remove_impl(&mut tree, &list_path.child(Step::Index { index: 1 })).unwrap();
        match list_path.resolve_mut(&mut tree) {
            Some(BinValue::List { items, .. }) => assert_eq!(items.len(), 1),
            other => panic!("expected list, got {:?}", other),
        }
        remove_impl(&mut tree, &field_path).unwrap();
        assert!(field_path.resolve_mut(&mut tree).is_none());
    }
}
