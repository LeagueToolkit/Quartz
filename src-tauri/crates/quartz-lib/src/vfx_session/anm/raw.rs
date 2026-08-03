//! Generic read/write for any node in an animation graph.
//!
//! WHY THIS EXISTS
//! The typed layer (`ops::set_event_field`) covers the seven event classes the
//! read layer models. The bin ships more than that — `JointSnapEventData`,
//! `FadeEventData`, `SpringPhysicsEventData`, `StateLogicEventData`,
//! `EnableLookAtEventData`, `FaceCameraEventData`, `JointOrientationEventData`,
//! `IdleParticlesVisibilityEventData` — and those arrived in the projection as
//! `Unknown { class_hash }`, editable nowhere. A particle event's bone bindings
//! had the same problem for a different reason: they live on nested
//! `ParticleEventDataPair` nodes, which no flat `(event, field, value)` command
//! can address.
//!
//! Rather than hand-model eight more classes and be short again next patch, this
//! projects whatever is actually at a `VfxPath` and writes back a single
//! primitive. Every node in the graph is already addressable — `VfxPath` walks
//! fields, list indices and map positions — so the addressing was never the
//! missing part; a generic read and a generic write were.
//!
//! WHAT IT DELIBERATELY DOES NOT DO
//! Adding or removing fields, and changing a field's type. A write must land on
//! an existing node and produce the same `BinType` it found, so an `f32` field
//! cannot silently become a string. Structural editing of arbitrary bins is
//! BinEditorV2's job; this is for reaching the fields the animation editor
//! already shows but could not change.

use ritoshark::bin::BinValue;
use ritoshark::hash::{fnv1a, HashMapper};
use serde::{Deserialize, Serialize};

use super::project::{project_anm, AnmModel};
use crate::bineditor::value::{bin_to_json, json_to_bin, JsonBinValue};
use crate::error::{Error, Result};
use crate::vfx_session::path::{walk_steps, Step, VfxPath};
use crate::vfx_session::session::{self, SessionId};

/// One editable field of a node, as the editor renders it.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawField {
    /// Resolved field name, or `0x{h:08x}` when the hash DB cannot name it.
    pub name: String,
    /// The field-name hash, so a caller can address it without re-hashing.
    pub key: u32,
    /// The value, in the same wire shape BinEditorV2 uses.
    pub value: JsonBinValue,
    /// Full path to this field, ready to hand back to [`set_raw_node`].
    pub path: VfxPath,
    /// True for a container (embed / pointer / list / map). Containers are
    /// descended into rather than edited: only leaves are writable.
    pub is_container: bool,
}

/// The projection of one node: its class (when it has one) and its fields.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawNode {
    /// Resolved class name for an embed/pointer, else `None`.
    pub class_name: Option<String>,
    pub fields: Vec<RawField>,
}

/// Name a fnv1a-32 through an ALREADY-HELD mapper guard.
///
/// Takes the mapper rather than locking, because the projection below holds a
/// read guard for the whole node and re-locking per field inside that scope
/// would be both wasteful and a deadlock risk if the lock is ever upgraded.
fn resolve32(h: u32, m: &HashMapper) -> String {
    match m.get(h as u64) {
        Some(name) if !name.is_empty() => name.to_string(),
        _ => format!("0x{h:08x}"),
    }
}

fn is_container(v: &BinValue) -> bool {
    matches!(
        v,
        BinValue::Embed { .. }
            | BinValue::Pointer { .. }
            | BinValue::List { .. }
            | BinValue::Map { .. }
    )
}

/// Append `step` to `base`, producing the child's own path.
fn child_path(base: &VfxPath, step: Step) -> VfxPath {
    let mut steps = base.steps.clone();
    steps.push(step);
    VfxPath {
        bin: base.bin,
        entry: base.entry,
        steps,
    }
}

/// Project the node `path` addresses into its editable fields.
///
/// Lists and maps are projected too: a list yields one entry per index (which is
/// how a particle event's bone pairs are reached), a map one per position.
pub fn raw_node(id: SessionId, path: &VfxPath) -> Result<RawNode> {
    session::with_session(id, |s| -> Result<RawNode> {
        let entry = s
            .bins
            .get_mut(path.bin)
            .and_then(|b| b.tree.entries.get_mut(path.entry))
            .ok_or_else(|| Error::InvalidInput("Path no longer resolves".to_string()))?;

        let node = walk_steps(entry, &path.steps)
            .ok_or_else(|| Error::InvalidInput("Path no longer resolves".to_string()))?;

        let mapper = crate::bin::get_cached_bin_hashes().read();

        let (class_name, fields) = match &*node {
            BinValue::Embed { class, fields } | BinValue::Pointer { class, fields } => {
                let rows = fields
                    .iter()
                    .map(|(k, v)| RawField {
                        name: resolve32(*k, &mapper),
                        key: *k,
                        value: bin_to_json(v, &mapper),
                        path: child_path(path, Step::Field { field: *k }),
                        is_container: is_container(v),
                    })
                    .collect();
                (Some(resolve32(*class, &mapper)), rows)
            }
            BinValue::List { items, .. } => {
                let rows = items
                    .iter()
                    .enumerate()
                    .map(|(i, v)| RawField {
                        name: format!("[{i}]"),
                        key: 0,
                        value: bin_to_json(v, &mapper),
                        path: child_path(path, Step::Index { index: i }),
                        is_container: is_container(v),
                    })
                    .collect();
                (None, rows)
            }
            BinValue::Map { entries, .. } => {
                let rows = entries
                    .iter()
                    .enumerate()
                    .map(|(i, (k, v))| RawField {
                        // The key is itself a value; render it so a hash-keyed
                        // map still identifies its rows.
                        name: match k {
                            BinValue::String(s) => s.clone(),
                            BinValue::Hash(h) | BinValue::Link(h) => resolve32(*h, &mapper),
                            other => format!("{other:?}"),
                        },
                        key: 0,
                        value: bin_to_json(v, &mapper),
                        path: child_path(path, Step::MapIndex { map_index: i }),
                        is_container: is_container(v),
                    })
                    .collect();
                (None, rows)
            }
            // A leaf addressed directly has no fields of its own; report it as a
            // single anonymous row so the caller can still show and edit it.
            other => (
                None,
                vec![RawField {
                    name: String::new(),
                    key: 0,
                    value: bin_to_json(other, &mapper),
                    path: path.clone(),
                    is_container: false,
                }],
            ),
        };

        Ok(RawNode { class_name, fields })
    })?
}

/// True when two values are the same BIN variant. Guards a write against
/// changing a field's type, which is how a malformed bin gets written.
fn same_variant(a: &BinValue, b: &BinValue) -> bool {
    std::mem::discriminant(a) == std::mem::discriminant(b)
}

/// Add a field to the embed/pointer that `parent` addresses.
///
/// WHY THIS IS NEEDED SEPARATELY FROM [`set_raw_node`]
/// League omits a field that still holds its default, so a `ParticleEventData`
/// on disk routinely carries three of its sixteen fields. The rest are not
/// "empty" — they are absent, and `walk_steps` cannot address something that is
/// not there. Editing alone could therefore never reach `mIsKillEvent`, `scale`,
/// `mEffectName` or any other defaulted field; they had to be creatable.
///
/// `name` is hashed with fnv1a, or parsed as `0x…` so a field whose name the
/// dictionary does not know is still addressable.
pub fn add_raw_field(
    id: SessionId,
    parent: &VfxPath,
    name: &str,
    value: &JsonBinValue,
) -> Result<AnmModel> {
    let key = parse_field_key(name)?;
    let incoming = json_to_bin(value)?;

    session::with_session(id, |s| -> Result<AnmModel> {
        let entry = s
            .bins
            .get(parent.bin)
            .and_then(|b| b.tree.entries.get(parent.entry))
            .ok_or_else(|| Error::InvalidInput("Path no longer resolves".to_string()))?;

        let mut probe = entry.clone();
        {
            let node = walk_steps(&mut probe, &parent.steps)
                .ok_or_else(|| Error::InvalidInput("Path no longer resolves".to_string()))?;
            let fields = match node {
                BinValue::Embed { fields, .. } | BinValue::Pointer { fields, .. } => fields,
                _ => {
                    return Err(Error::InvalidInput(
                        "Only a structure can take a new field.".to_string(),
                    ))
                }
            };
            if fields.contains_key(&key) {
                return Err(Error::InvalidInput(format!(
                    "This structure already has a field named {name}."
                )));
            }
            fields.insert(key, incoming);
        }

        let frame = s.capture(&[(parent.bin, vec![parent.entry])]);
        s.bins[parent.bin].tree.entries[parent.entry] = probe;
        s.mark_dirty(parent.bin);
        s.push_frame(frame);
        Ok(project_anm(s))
    })?
}

/// Remove the field `path` addresses from its parent structure.
///
/// The counterpart to [`add_raw_field`]: a field added by mistake, or one whose
/// absence IS the intended state (League reads an omitted field as its default),
/// has to be removable again.
pub fn remove_raw_field(id: SessionId, path: &VfxPath) -> Result<AnmModel> {
    let Some((last, parent_steps)) = path.steps.split_last() else {
        return Err(Error::InvalidInput(
            "That path does not address a field".to_string(),
        ));
    };
    let Step::Field { field } = last else {
        return Err(Error::InvalidInput(
            "Only a named field can be removed; use the list or map editor for an element."
                .to_string(),
        ));
    };
    let key = *field;

    session::with_session(id, |s| -> Result<AnmModel> {
        let entry = s
            .bins
            .get(path.bin)
            .and_then(|b| b.tree.entries.get(path.entry))
            .ok_or_else(|| Error::InvalidInput("Path no longer resolves".to_string()))?;

        let mut probe = entry.clone();
        {
            // An empty parent path means the field sits on the entry itself.
            let fields = if parent_steps.is_empty() {
                &mut probe.fields
            } else {
                match walk_steps(&mut probe, parent_steps) {
                    Some(BinValue::Embed { fields, .. })
                    | Some(BinValue::Pointer { fields, .. }) => fields,
                    _ => {
                        return Err(Error::InvalidInput(
                            "Path no longer resolves".to_string(),
                        ))
                    }
                }
            };
            if fields.shift_remove(&key).is_none() {
                return Err(Error::InvalidInput("That field is already gone.".to_string()));
            }
        }

        let frame = s.capture(&[(path.bin, vec![path.entry])]);
        s.bins[path.bin].tree.entries[path.entry] = probe;
        s.mark_dirty(path.bin);
        s.push_frame(frame);
        Ok(project_anm(s))
    })?
}

/// A field name as its fnv1a-32, accepting a literal `0x…` so a field the
/// dictionary cannot name is still reachable.
fn parse_field_key(name: &str) -> Result<u32> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(Error::InvalidInput("Field name cannot be empty".to_string()));
    }
    if let Some(hex) = trimmed.strip_prefix("0x").or_else(|| trimmed.strip_prefix("0X")) {
        return u32::from_str_radix(hex, 16)
            .map_err(|_| Error::InvalidInput(format!("{trimmed} is not a valid field hash")));
    }
    Ok(fnv1a(trimmed))
}

/// Write one primitive at `path`, keeping its existing BIN type.
///
/// Rejects a container target and a type change: the point is to edit values the
/// animation editor already displays, not to reshape the tree.
pub fn set_raw_node(id: SessionId, path: &VfxPath, value: &JsonBinValue) -> Result<AnmModel> {
    let incoming = json_to_bin(value)?;

    session::with_session(id, |s| -> Result<AnmModel> {
        let entry = s
            .bins
            .get(path.bin)
            .and_then(|b| b.tree.entries.get(path.entry))
            .ok_or_else(|| Error::InvalidInput("Path no longer resolves".to_string()))?;

        // Probe a clone so a rejected write leaves the session untouched.
        let mut probe = entry.clone();
        {
            let node = walk_steps(&mut probe, &path.steps)
                .ok_or_else(|| Error::InvalidInput("Path no longer resolves".to_string()))?;

            if is_container(node) {
                return Err(Error::InvalidInput(
                    "This field holds a structure; open it and edit its own fields instead."
                        .to_string(),
                ));
            }
            if !same_variant(node, &incoming) {
                return Err(Error::InvalidInput(format!(
                    "This field is {}, so it cannot take that value.",
                    variant_name(node)
                )));
            }
            *node = incoming;
        }

        let frame = s.capture(&[(path.bin, vec![path.entry])]);
        s.bins[path.bin].tree.entries[path.entry] = probe;
        s.mark_dirty(path.bin);
        s.push_frame(frame);
        Ok(project_anm(s))
    })?
}

/// Human-readable variant name, for the type-mismatch message.
fn variant_name(v: &BinValue) -> &'static str {
    match v {
        BinValue::None => "empty",
        BinValue::Bool(_) => "a boolean",
        BinValue::I8(_) | BinValue::I16(_) | BinValue::I32(_) | BinValue::I64(_) => {
            "a signed integer"
        }
        BinValue::U8(_) | BinValue::U16(_) | BinValue::U32(_) | BinValue::U64(_) => {
            "an unsigned integer"
        }
        BinValue::F32(_) => "a number",
        BinValue::Vec2(_) => "a 2-component vector",
        BinValue::Vec3(_) => "a 3-component vector",
        BinValue::Vec4(_) => "a 4-component vector",
        BinValue::Rgba(_) => "a colour",
        BinValue::String(_) => "text",
        BinValue::Hash(_) | BinValue::Link(_) => "a hash reference",
        BinValue::File(_) => "a file reference",
        BinValue::Flag(_) => "a flag",
        BinValue::Mtx44(_) => "a 4x4 matrix",
        _ => "a different type",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use indexmap::IndexMap;
    use ritoshark::hash::fnv1a;

    fn embed(class: &str, pairs: Vec<(&str, BinValue)>) -> BinValue {
        let mut fields = IndexMap::new();
        for (k, v) in pairs {
            fields.insert(fnv1a(k), v);
        }
        BinValue::Embed {
            class: fnv1a(class),
            fields,
        }
    }

    #[test]
    fn a_container_is_recognised_so_it_is_never_overwritten_wholesale() {
        let e = embed("JointSnapEventData", vec![("mJointName", BinValue::String("root".into()))]);
        assert!(is_container(&e));
        assert!(!is_container(&BinValue::F32(1.0)));
        assert!(is_container(&BinValue::List {
            item: ritoshark::bin::BinType::F32,
            items: vec![],
            is_list2: false,
        }));
    }

    #[test]
    fn a_type_change_is_rejected_but_a_same_type_write_is_allowed() {
        // The guard that keeps a raw editor from writing a malformed bin: an
        // f32 field must not become a string.
        assert!(!same_variant(&BinValue::F32(1.0), &BinValue::String("x".into())));
        assert!(same_variant(&BinValue::F32(1.0), &BinValue::F32(2.0)));
        assert!(same_variant(
            &BinValue::String("a".into()),
            &BinValue::String("b".into())
        ));
        // Same width, different signedness is still a different variant.
        assert!(!same_variant(&BinValue::I32(1), &BinValue::U32(1)));
    }

    #[test]
    fn a_field_name_resolves_by_hash_or_by_literal_hex() {
        // The common case: a name the dictionary knows.
        assert_eq!(parse_field_key("mIsKillEvent").unwrap(), fnv1a("mIsKillEvent"));
        // And the escape hatch: ParticleEventData carries a field the wiki only
        // knows as `0x4fce52ba`, so a raw hash has to be addressable too.
        assert_eq!(parse_field_key("0x4fce52ba").unwrap(), 0x4fce52ba);
        assert_eq!(parse_field_key("0X4FCE52BA").unwrap(), 0x4fce52ba);
        assert!(parse_field_key("  ").is_err());
        assert!(parse_field_key("0xzzzz").is_err());
    }

    #[test]
    fn child_path_appends_without_disturbing_the_parent() {
        let base = VfxPath {
            bin: 1,
            entry: 2,
            steps: vec![Step::Field { field: 7 }],
        };
        let child = child_path(&base, Step::Index { index: 3 });
        assert_eq!(base.steps.len(), 1, "parent path must not be mutated");
        assert_eq!(child.bin, 1);
        assert_eq!(child.entry, 2);
        assert_eq!(
            child.steps,
            vec![Step::Field { field: 7 }, Step::Index { index: 3 }]
        );
    }
}
