/* Field-value edits for the animation graph editor.
 *
 * Every op here is the write counterpart to a value `anim_graph.rs` reads, and
 * follows `vfx_session::ops`' shape exactly: validate FIRST so a precondition
 * miss leaves the session byte-identical, capture ONE undo frame, mutate, mark
 * the bin dirty, push the frame, reproject.
 *
 * ---------------------------------------------------------------------------
 * TWO RULES THIS MODULE EXISTS TO ENFORCE
 *
 * 1. SET ONE FIELD IN PLACE. A clip or event carries fields this codebase does
 *    not model (`mTickDuration`, `mSyncGroupDataName`, an `Updater` pointer,
 *    ...). Rebuilding a node from the projected struct drops all of them, which
 *    is the data-loss bug `anim_graph.rs`'s addressing design exists to avoid.
 *
 * 2. PRESERVE THE EXISTING SPELLING AND THE EXISTING TYPE. Real bins mix `m`-
 *    prefixed and un-prefixed names inside one class (`AtomicClipData` has a
 *    bare `startFrame`/`EndFrame`; `LockRootOrientationEventData` pairs
 *    `mStartFrame`/`mEndFrame` with bare `JointName`/`BlendOutTime`;
 *    `FaceTargetEventData` uses bare `YRotationDegrees`). `fnv1a` lowercases but
 *    does not strip a prefix, so those are genuinely different keys. Writing the
 *    prefixed twin next to an existing un-prefixed field would leave the entry
 *    with two contradictory values and the reader picking the wrong one, so a
 *    write ALWAYS reuses whichever spelling the entry already has. The same
 *    applies to the value's type: a name field stored as `String` stays a
 *    `String`, one stored as `Hash` takes the `fnv1a` of the input.
 *
 * The field-name spellings below are copied from `anim_graph.rs`'s readers,
 * which are byte-verified against ritobin dumps. Change them only together.
 *
 * Structural edits (delete / reorder) live elsewhere; this module only sets,
 * clears, and renames.
 */

use indexmap::IndexMap;
use ritoshark::bin::{BinEntry, BinType, BinValue};
use ritoshark::hash::fnv1a;
use serde::{Deserialize, Serialize};

use super::project::{project_anm, AnmModel};
use crate::error::{Error, Result};
use crate::vfx_session::path::{walk_map_key, walk_steps, Step, VfxPath};
use crate::vfx_session::session::{self, SessionId};

/// mFlags bit 2 = LOOP. Mirrors `anim_graph::CLIP_FLAG_LOOP`, which is private.
const CLIP_FLAG_LOOP: u32 = 2;

// ── Wire types ───────────────────────────────────────────────────────────────

/// A value the frontend sends for one field. Untagged, so the TS side sends the
/// bare JSON scalar: `true`, `12.5`, `"UpperBody"`, or `null`.
///
/// Variant ORDER is load-bearing under `untagged`: serde tries them top to
/// bottom, so `Bool` must precede `Num` or `true` would be probed as a number
/// first. `Null` is the unit variant `null` deserializes into, and it means
/// CLEAR: the field is removed from its field map rather than set to a zero.
/// Clearing matters because most of these fields are optional in the engine and
/// an explicit `0.0` frame is not the same thing as no frame at all.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(untagged)]
pub enum AnmValue {
    Bool(bool),
    Num(f64),
    Text(String),
    Null,
}

impl AnmValue {
    fn as_f32(&self, field: &str) -> Result<f32> {
        match self {
            AnmValue::Num(n) => Ok(*n as f32),
            // A number typed into a text input arrives as a string often enough
            // that rejecting it would just be friction.
            AnmValue::Text(t) => t
                .trim()
                .parse::<f32>()
                .map_err(|_| Error::InvalidInput(format!("{field} must be a number"))),
            _ => Err(Error::InvalidInput(format!("{field} must be a number"))),
        }
    }

    fn as_bool(&self, field: &str) -> Result<bool> {
        match self {
            AnmValue::Bool(b) => Ok(*b),
            AnmValue::Num(n) => Ok(*n != 0.0),
            _ => Err(Error::InvalidInput(format!("{field} must be true or false"))),
        }
    }

    fn as_text(&self, field: &str) -> Result<String> {
        match self {
            AnmValue::Text(t) => Ok(t.clone()),
            AnmValue::Num(n) => Ok(n.to_string()),
            _ => Err(Error::InvalidInput(format!("{field} must be text"))),
        }
    }

    fn is_clear(&self) -> bool {
        matches!(self, AnmValue::Null)
    }
}

/// An editable field on a clip. `TrueClip`/`FalseClip` only mean anything on a
/// `ConditionBoolClipData`, but setting them is not gated on the class: an
/// unknown clip class may legitimately carry the same branch fields.
#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ClipField {
    TrackDataName,
    MaskDataName,
    AnmPath,
    StartFrame,
    EndFrame,
    Loops,
    TrueClip,
    FalseClip,
}

/// An editable field across every event class `AnimEventKind` models. One flat
/// enum rather than one per class: the classes overlap heavily (`mStartFrame`,
/// `mEndFrame` and `mIsLoop` each appear on several) and the write path is
/// identical, so splitting them would only duplicate arms.
#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EventField {
    EffectKey,
    StartFrame,
    EndFrame,
    IsLoop,
    SoundName,
    Show,
    Hide,
    YRotationDegrees,
    MaskDataName,
    BlendInTime,
    BlendOutTime,
    JointName,
    StopAnimationName,
}

// ── Field-map helpers ────────────────────────────────────────────────────────

type Fields = IndexMap<u32, BinValue>;

/// The field map of a Pointer/Embed value. Every clip and event is one or the
/// other, so anything else is a path that no longer addresses a node.
fn fields_mut(value: &mut BinValue) -> Option<&mut Fields> {
    match value {
        BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => Some(fields),
        _ => None,
    }
}

/// The one of `names` already present in `f`, else the first (the canonical
/// spelling to create with).
///
/// Probe order must match the READ order in `anim_graph.rs` for the same field,
/// or an edit could write the spelling the reader ignores.
fn pick_existing_spelling(f: &Fields, names: &[&str]) -> u32 {
    names
        .iter()
        .map(|n| fnv1a(n))
        .find(|h| f.contains_key(h))
        .unwrap_or_else(|| fnv1a(names[0]))
}

/// Set or clear one scalar, reusing the existing spelling and keeping the
/// existing `BinValue` variant where the new value can inhabit it.
///
/// `make` builds the value to store from the variant already there (`None` when
/// the field is absent), so a name stored as `Hash` stays a `Hash` and one
/// stored as `String` stays a `String`. `IndexMap::insert` on a present key
/// keeps its position, so field ORDER in the bin is untouched.
fn set_scalar_preserving_variant(
    f: &mut Fields,
    names: &[&str],
    value: &AnmValue,
    make: impl FnOnce(Option<&BinValue>) -> Result<BinValue>,
) -> Result<()> {
    let key = pick_existing_spelling(f, names);
    if value.is_clear() {
        // Clear every spelling, not just the chosen one: leaving a stale twin
        // behind would make the reader see the field as still set.
        for name in names {
            f.shift_remove(&fnv1a(name));
        }
        return Ok(());
    }
    let next = make(f.get(&key))?;
    f.insert(key, next);
    Ok(())
}

/// A float field: `F32` in every class that has one.
fn set_f32(f: &mut Fields, names: &[&str], label: &str, value: &AnmValue) -> Result<()> {
    let v = if value.is_clear() {
        0.0
    } else {
        value.as_f32(label)?
    };
    set_scalar_preserving_variant(f, names, value, |_| Ok(BinValue::F32(v)))
}

/// A bool field. Bins store these as `Bool`, but `Flag` is the same thing in the
/// format (see `anim_graph::as_bool`), so an existing `Flag` is preserved.
fn set_bool(f: &mut Fields, names: &[&str], label: &str, value: &AnmValue) -> Result<()> {
    let v = if value.is_clear() {
        false
    } else {
        value.as_bool(label)?
    };
    set_scalar_preserving_variant(f, names, value, |cur| {
        Ok(match cur {
            Some(BinValue::Flag(_)) => BinValue::Flag(v),
            _ => BinValue::Bool(v),
        })
    })
}

/// A name-ish field (`mTrackDataName`, `mEffectKey`, `mSoundName`, ...).
///
/// These are typed `hash` in most real bins and `string` in others, and
/// `anim_graph::as_name` reads both. Which one this writes is decided by what is
/// already stored, never by a guess: rewriting a `string` field as a `hash`
/// would silently discard a name the hash DB cannot recover. A `0x{h:08x}`
/// input (what the reader renders an unresolved hash as) is written back as
/// that exact hash rather than as the literal text.
fn set_name(f: &mut Fields, names: &[&str], label: &str, value: &AnmValue) -> Result<()> {
    let text = if value.is_clear() {
        String::new()
    } else {
        value.as_text(label)?.trim().to_string()
    };
    set_scalar_preserving_variant(f, names, value, |cur| {
        Ok(match cur {
            Some(BinValue::String(_)) => BinValue::String(text),
            Some(BinValue::Link(_)) => BinValue::Link(name_hash(&text)),
            // Absent, or already a hash: hash is the type these fields carry in
            // the overwhelming majority of shipped bins.
            _ => BinValue::Hash(name_hash(&text)),
        })
    })
}

/// The hash a name-ish input denotes: a `0x`-prefixed literal is the hash
/// itself (round-tripping what `as_name` printed), anything else is fnv1a'd.
fn name_hash(text: &str) -> u32 {
    text.strip_prefix("0x")
        .or_else(|| text.strip_prefix("0X"))
        .and_then(|h| u32::from_str_radix(h, 16).ok())
        .unwrap_or_else(|| fnv1a(text))
}

/// One token of a submesh list, typed to match the list it goes into.
fn submesh_token(item: BinType, token: &str) -> BinValue {
    match item {
        BinType::Hash => BinValue::Hash(name_hash(token)),
        BinType::Link => BinValue::Link(name_hash(token)),
        _ => BinValue::String(token.to_string()),
    }
}

/// Replace a `mShowSubmeshList` / `mHideSubmeshList` from a comma-separated
/// string, preserving the list's item type.
///
/// A submesh list is `list[string]` in some bins and `list[hash]` in others
/// (`anim_graph::submesh_list` reads both, rendering a hash as `0x{h:08x}`), so
/// an edit must not retype the list under the engine. A fresh list is created as
/// `list[string]`, which is what an author typing submesh names means.
fn set_submesh_list(f: &mut Fields, name: &str, value: &AnmValue) -> Result<()> {
    let key = fnv1a(name);
    if value.is_clear() {
        f.shift_remove(&key);
        return Ok(());
    }
    let text = value.as_text(name)?;
    let tokens: Vec<&str> = text
        .split(',')
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .collect();

    let item = match f.get(&key) {
        Some(BinValue::List { item, .. }) => *item,
        _ => BinType::String,
    };
    let is_list2 = matches!(f.get(&key), Some(BinValue::List { is_list2: true, .. }));
    let items = tokens.iter().map(|t| submesh_token(item, t)).collect();
    f.insert(
        key,
        BinValue::List {
            is_list2,
            item,
            items,
        },
    );
    Ok(())
}

/// Toggle one bit of `mFlags`, preserving every other bit.
///
/// `mFlags` carries more than LOOP, so this reads-modifies-writes rather than
/// assigning the bit's value. An absent `mFlags` starts from 0, matching how
/// `anim_graph::clip_flags` reads it.
fn set_flag_bit(f: &mut Fields, bit: u32, on: bool) {
    let key = fnv1a("mFlags");
    let cur = match f.get(&key) {
        Some(BinValue::U32(v)) => *v,
        Some(BinValue::I32(v)) => *v as u32,
        _ => 0,
    };
    let next = if on { cur | bit } else { cur & !bit };
    // Preserve an I32-typed flags field rather than retyping it to U32.
    let value = match f.get(&key) {
        Some(BinValue::I32(_)) => BinValue::I32(next as i32),
        _ => BinValue::U32(next),
    };
    f.insert(key, value);
}

/// Set `mAnimationResourceData.mAnimationFilePath`, creating the embed when the
/// clip has none. Only that ONE nested field is touched, so an existing
/// resource embed keeps whatever else it carries.
fn set_anm_path(f: &mut Fields, value: &AnmValue) -> Result<()> {
    let res_key = fnv1a("mAnimationResourceData");
    let path_key = fnv1a("mAnimationFilePath");

    if value.is_clear() {
        // Clear the path, not the embed: the embed may hold sibling fields, and
        // dropping the whole node would lose them.
        if let Some(res) = f.get_mut(&res_key).and_then(fields_mut) {
            res.shift_remove(&path_key);
        }
        return Ok(());
    }
    let path = value.as_text("Animation path")?.trim().to_string();
    if path.is_empty() {
        return Err(Error::InvalidInput(
            "Animation path cannot be empty".to_string(),
        ));
    }
    if !f.contains_key(&res_key) {
        f.insert(
            res_key,
            BinValue::Embed {
                class: fnv1a("AnimationResourceData"),
                fields: IndexMap::new(),
            },
        );
    }
    let res = f
        .get_mut(&res_key)
        .and_then(fields_mut)
        .ok_or_else(|| Error::InvalidInput("mAnimationResourceData is not a struct".to_string()))?;
    res.insert(path_key, BinValue::String(path));
    Ok(())
}

// ── Cores ────────────────────────────────────────────────────────────────────

/// Resolve `steps` to a clip/event node's field map, or report the path stale.
fn node_fields<'a>(entry: &'a mut BinEntry, steps: &[Step]) -> Result<&'a mut Fields> {
    let value = walk_steps(entry, steps)
        .ok_or_else(|| Error::InvalidInput("Path no longer resolves".to_string()))?;
    fields_mut(value)
        .ok_or_else(|| Error::InvalidInput("Path does not address a clip or event".to_string()))
}

/// Apply one clip-field edit in place. Pure over a `BinEntry` so tests can drive
/// it without a session registry, like `ops::set_matrix_core`.
pub fn set_clip_field_core(
    entry: &mut BinEntry,
    steps: &[Step],
    field: ClipField,
    value: &AnmValue,
) -> Result<()> {
    let f = node_fields(entry, steps)?;
    match field {
        ClipField::TrackDataName => set_name(f, &["mTrackDataName"], "Track name", value),
        ClipField::MaskDataName => set_name(f, &["mMaskDataName"], "Mask name", value),
        ClipField::AnmPath => set_anm_path(f, value),
        // Un-prefixed first: that is the spelling `AtomicClipData` really uses,
        // and the order matches `anim_graph::clip_start_frame`/`clip_end_frame`.
        ClipField::StartFrame => set_f32(f, &["startFrame", "mStartFrame"], "Start frame", value),
        ClipField::EndFrame => set_f32(f, &["EndFrame", "mEndFrame", "endFrame"], "End frame", value),
        ClipField::Loops => {
            let on = if value.is_clear() {
                false
            } else {
                value.as_bool("Loops")?
            };
            set_flag_bit(f, CLIP_FLAG_LOOP, on);
            Ok(())
        }
        ClipField::TrueClip => set_name(f, &["mTrueConditionClipName"], "True clip", value),
        ClipField::FalseClip => set_name(f, &["mFalseConditionClipName"], "False clip", value),
    }
}

/// Apply one event-field edit in place.
///
/// The spelling lists mirror `anim_graph::parse_event_kind` field for field,
/// including the classes that mix conventions: `FaceTargetEventData` reads bare
/// `YRotationDegrees` first, and `LockRootOrientationEventData` reads bare
/// `JointName` / `BlendOutTime` first while its frames stay prefixed.
pub fn set_event_field_core(
    entry: &mut BinEntry,
    steps: &[Step],
    field: EventField,
    value: &AnmValue,
) -> Result<()> {
    let f = node_fields(entry, steps)?;
    match field {
        EventField::EffectKey => set_name(f, &["mEffectKey"], "Effect key", value),
        EventField::SoundName => set_name(f, &["mSoundName"], "Sound name", value),
        EventField::MaskDataName => set_name(f, &["mMaskDataName"], "Mask name", value),
        EventField::JointName => set_name(f, &["JointName", "mJointName"], "Joint name", value),
        EventField::StopAnimationName => {
            set_name(f, &["mStopAnimationName"], "Stop animation name", value)
        }
        EventField::StartFrame => set_f32(f, &["mStartFrame", "StartFrame"], "Start frame", value),
        EventField::EndFrame => set_f32(f, &["mEndFrame", "EndFrame"], "End frame", value),
        EventField::BlendInTime => set_f32(f, &["mBlendInTime", "BlendInTime"], "Blend in", value),
        EventField::BlendOutTime => {
            set_f32(f, &["BlendOutTime", "mBlendOutTime"], "Blend out", value)
        }
        EventField::YRotationDegrees => set_f32(
            f,
            &["YRotationDegrees", "mYRotationDegrees"],
            "Y rotation",
            value,
        ),
        EventField::IsLoop => set_bool(f, &["mIsLoop"], "Is loop", value),
        EventField::Show => set_submesh_list(f, "mShowSubmeshList", value),
        EventField::Hide => set_submesh_list(f, "mHideSubmeshList", value),
    }
}

/// Rewrite the map KEY that `steps` addresses, keeping its `BinValue` variant.
///
/// Rejects a name that already keys another entry of the same map. A duplicate
/// key is not an error the bin writer catches: both entries are written and the
/// reader keeps only one, so the other clip is silently destroyed on save.
/// Comparison is case-insensitive on names and cross-form against hashes,
/// because `ClipMap` resolves references that way and two keys that resolve
/// alike are a collision even when their bytes differ.
pub fn rename_map_key_core(
    entry: &mut BinEntry,
    steps: &[Step],
    new_name: &str,
    what: &str,
) -> Result<()> {
    let name = new_name.trim();
    if name.is_empty() {
        return Err(Error::InvalidInput(format!("{what} name cannot be empty")));
    }
    let Some((last, parent)) = steps.split_last() else {
        return Err(Error::InvalidInput(format!(
            "{what} path does not address a map entry"
        )));
    };
    let Step::MapIndex { map_index } = last else {
        return Err(Error::InvalidInput(format!(
            "{what} path does not address a map entry"
        )));
    };
    let target = *map_index;

    // Collision check first, over a read-only borrow, so a rejected rename has
    // touched nothing.
    {
        let container = walk_steps(entry, parent).ok_or_else(|| {
            Error::InvalidInput(format!("{what} path no longer resolves"))
        })?;
        let BinValue::Map { entries, .. } = container else {
            return Err(Error::InvalidInput(format!(
                "{what} path does not address a map entry"
            )));
        };
        if target >= entries.len() {
            return Err(Error::InvalidInput(format!(
                "{what} path no longer resolves"
            )));
        }
        let wanted = key_forms(name);
        let clash = entries.iter().enumerate().any(|(i, (k, _))| {
            i != target && key_forms_of(k).iter().any(|f| wanted.contains(f))
        });
        if clash {
            return Err(Error::InvalidInput(format!(
                "A {} named \"{name}\" already exists",
                what.to_lowercase()
            )));
        }
    }

    let key = walk_map_key(entry, steps)
        .ok_or_else(|| Error::InvalidInput(format!("{what} path no longer resolves")))?;
    *key = match key {
        BinValue::String(_) => BinValue::String(name.to_string()),
        BinValue::Link(_) => BinValue::Link(name_hash(name)),
        _ => BinValue::Hash(name_hash(name)),
    };
    Ok(())
}

/// The two spellings a name can collide under: its lowercase text and its hash
/// form. Mirrors `anm::project::name_keys` and `anim_graph::ClipMap`.
fn key_forms(name: &str) -> [String; 2] {
    [
        name.to_lowercase(),
        format!("0x{:08x}", name_hash(name)),
    ]
}

/// The same two forms for a key already in the map.
fn key_forms_of(key: &BinValue) -> Vec<String> {
    match key {
        BinValue::String(s) => key_forms(s).to_vec(),
        BinValue::Hash(h) | BinValue::Link(h) => vec![format!("0x{h:08x}")],
        _ => Vec::new(),
    }
}

// ── Session ops ──────────────────────────────────────────────────────────────

/// Run one mutating core against a session and reproject.
///
/// Every op in this module shares the exact frame discipline, so it lives in one
/// place: resolve, run the core (which validates before it writes), then a
/// single capture/mutate/dirty/push cycle so undo restores the edit in one step.
///
/// The capture happens BEFORE the mutation but the core is what validates, so
/// the core is run twice: once on a throwaway clone to prove it succeeds, then
/// for real. Cloning one entry is cheap next to the undo frame that is captured
/// anyway, and it is the only way to keep "a failed op mutates nothing" true
/// without duplicating each core's validation at the call site.
fn apply<F>(id: SessionId, path: &VfxPath, mutate: F) -> Result<AnmModel>
where
    F: Fn(&mut BinEntry) -> Result<()>,
{
    session::with_session(id, |s| -> Result<AnmModel> {
        let entry = s
            .bins
            .get(path.bin)
            .and_then(|b| b.tree.entries.get(path.entry))
            .ok_or_else(|| Error::InvalidInput("Path no longer resolves".to_string()))?;

        let mut probe = entry.clone();
        mutate(&mut probe)?;

        let frame = s.capture(&[(path.bin, vec![path.entry])]);
        s.bins[path.bin].tree.entries[path.entry] = probe;
        s.mark_dirty(path.bin);
        s.push_frame(frame);
        Ok(project_anm(s))
    })?
}

/// Set (or clear, with [`AnmValue::Null`]) one field on the clip `clip`
/// addresses.
pub fn set_clip_field(
    id: SessionId,
    clip: &VfxPath,
    field: ClipField,
    value: AnmValue,
) -> Result<AnmModel> {
    apply(id, clip, |entry| {
        set_clip_field_core(entry, &clip.steps, field, &value)
    })
}

/// Set (or clear) one field on the event `event` addresses.
pub fn set_event_field(
    id: SessionId,
    event: &VfxPath,
    field: EventField,
    value: AnmValue,
) -> Result<AnmModel> {
    apply(id, event, |entry| {
        set_event_field_core(entry, &event.steps, field, &value)
    })
}

/// Rename a clip by rewriting its `mClipDataMap` key.
///
/// Only the key changes. References to the old name from other clips
/// (`mClipNameList`, pair lists, condition branches) are NOT rewritten here, so
/// a rename can leave a dangling reference; `project_anm`'s warnings surface it.
pub fn rename_clip(id: SessionId, clip: &VfxPath, new_name: &str) -> Result<AnmModel> {
    apply(id, clip, |entry| {
        rename_map_key_core(entry, &clip.steps, new_name, "Clip")
    })
}

/// Rename an event by rewriting its `mEventDataMap` key.
pub fn rename_event(id: SessionId, event: &VfxPath, new_name: &str) -> Result<AnmModel> {
    apply(id, event, |entry| {
        rename_map_key_core(entry, &event.steps, new_name, "Event")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- fixtures --------------------------------------------------------

    fn pointer(class: &str, pairs: Vec<(&str, BinValue)>) -> BinValue {
        let mut fields = IndexMap::new();
        for (key, value) in pairs {
            fields.insert(fnv1a(key), value);
        }
        BinValue::Pointer {
            class: fnv1a(class),
            fields,
        }
    }

    fn embed(class: &str, pairs: Vec<(&str, BinValue)>) -> BinValue {
        let mut fields = IndexMap::new();
        for (key, value) in pairs {
            fields.insert(fnv1a(key), value);
        }
        BinValue::Embed {
            class: fnv1a(class),
            fields,
        }
    }

    fn map_of(entries: Vec<(BinValue, BinValue)>) -> BinValue {
        BinValue::Map {
            key: BinType::Hash,
            value: BinType::Pointer,
            entries,
        }
    }

    fn list_of(item: BinType, items: Vec<BinValue>) -> BinValue {
        BinValue::List {
            is_list2: false,
            item,
            items,
        }
    }

    /// A graph entry whose `mClipDataMap` holds `clips`.
    fn graph_with(clips: Vec<(BinValue, BinValue)>) -> BinEntry {
        let mut fields = IndexMap::new();
        fields.insert(fnv1a("mClipDataMap"), map_of(clips));
        BinEntry {
            path_hash: fnv1a("Characters/Yone/Animations/Skin0"),
            class_hash: fnv1a("AnimationGraphData"),
            fields,
        }
    }

    /// Steps to clip 0 of the graph's `mClipDataMap`.
    fn clip_steps(i: usize) -> Vec<Step> {
        vec![
            Step::Field {
                field: fnv1a("mClipDataMap"),
            },
            Step::MapIndex { map_index: i },
        ]
    }

    /// Steps to event `e` of clip `c`.
    fn event_steps(c: usize, e: usize) -> Vec<Step> {
        let mut s = clip_steps(c);
        s.push(Step::Field {
            field: fnv1a("mEventDataMap"),
        });
        s.push(Step::MapIndex { map_index: e });
        s
    }

    /// The field map of the node `steps` addresses.
    fn at<'a>(entry: &'a mut BinEntry, steps: &[Step]) -> &'a Fields {
        match walk_steps(entry, steps).unwrap() {
            BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => fields,
            other => panic!("not a struct: {other:?}"),
        }
    }

    fn get<'a>(entry: &'a mut BinEntry, steps: &[Step], name: &str) -> Option<&'a BinValue> {
        at(entry, steps).get(&fnv1a(name))
    }

    fn set_clip(entry: &mut BinEntry, field: ClipField, value: AnmValue) -> Result<()> {
        set_clip_field_core(entry, &clip_steps(0), field, &value)
    }

    fn set_event(entry: &mut BinEntry, field: EventField, value: AnmValue) -> Result<()> {
        set_event_field_core(entry, &event_steps(0, 0), field, &value)
    }

    // ---- wire shape ------------------------------------------------------

    #[test]
    fn anm_value_deserializes_the_json_forms_the_frontend_sends() {
        let parse = |s: &str| serde_json::from_str::<AnmValue>(s).unwrap();
        // Bool must win over Num, or `true` would be probed as a number first.
        assert_eq!(parse("true"), AnmValue::Bool(true));
        assert_eq!(parse("false"), AnmValue::Bool(false));
        assert_eq!(parse("12.5"), AnmValue::Num(12.5));
        assert_eq!(parse("7"), AnmValue::Num(7.0));
        assert_eq!(parse(r#""text""#), AnmValue::Text("text".into()));
        assert_eq!(parse("null"), AnmValue::Null);
    }

    #[test]
    fn field_enums_deserialize_as_camel_case() {
        assert_eq!(
            serde_json::from_str::<ClipField>(r#""trackDataName""#).unwrap(),
            ClipField::TrackDataName
        );
        assert_eq!(
            serde_json::from_str::<EventField>(r#""stopAnimationName""#).unwrap(),
            EventField::StopAnimationName
        );
    }

    // ---- variant preservation -------------------------------------------

    #[test]
    fn setting_a_name_preserves_the_stored_variant() {
        // Stored as String -> stays a String, so a name the hash DB cannot
        // recover is not silently replaced by its hash.
        let mut e = graph_with(vec![(
            BinValue::String("Idle1".into()),
            pointer(
                "AtomicClipData",
                vec![("mMaskDataName", BinValue::String("UpperBody".into()))],
            ),
        )]);
        set_clip(&mut e, ClipField::MaskDataName, AnmValue::Text("LowerBody".into())).unwrap();
        assert_eq!(
            get(&mut e, &clip_steps(0), "mMaskDataName"),
            Some(&BinValue::String("LowerBody".into()))
        );

        // Stored as Hash -> stays a Hash.
        let mut e = graph_with(vec![(
            BinValue::String("Idle1".into()),
            pointer(
                "AtomicClipData",
                vec![("mMaskDataName", BinValue::Hash(fnv1a("UpperBody")))],
            ),
        )]);
        set_clip(&mut e, ClipField::MaskDataName, AnmValue::Text("LowerBody".into())).unwrap();
        assert_eq!(
            get(&mut e, &clip_steps(0), "mMaskDataName"),
            Some(&BinValue::Hash(fnv1a("LowerBody")))
        );

        // Absent -> created as a Hash, the type shipped bins use.
        let mut e = graph_with(vec![(
            BinValue::String("Idle1".into()),
            pointer("AtomicClipData", vec![]),
        )]);
        set_clip(&mut e, ClipField::TrackDataName, AnmValue::Text("Wind".into())).unwrap();
        assert_eq!(
            get(&mut e, &clip_steps(0), "mTrackDataName"),
            Some(&BinValue::Hash(fnv1a("Wind")))
        );
    }

    #[test]
    fn a_hex_name_input_round_trips_as_that_exact_hash() {
        // `as_name` renders an unresolved hash as `0x{h:08x}`; typing it back
        // must not fnv1a the literal text.
        let mut e = graph_with(vec![(
            BinValue::String("Idle1".into()),
            pointer("AtomicClipData", vec![]),
        )]);
        let hex = format!("0x{:08x}", fnv1a("UpperBody"));
        set_clip(&mut e, ClipField::MaskDataName, AnmValue::Text(hex)).unwrap();
        assert_eq!(
            get(&mut e, &clip_steps(0), "mMaskDataName"),
            Some(&BinValue::Hash(fnv1a("UpperBody")))
        );
    }

    // ---- spellings -------------------------------------------------------

    #[test]
    fn frames_write_the_spelling_already_present_and_never_both() {
        // AtomicClipData's real spellings are un-prefixed.
        let mut e = graph_with(vec![(
            BinValue::String("Idle1".into()),
            pointer(
                "AtomicClipData",
                vec![
                    ("startFrame", BinValue::F32(1.0)),
                    ("EndFrame", BinValue::F32(9.0)),
                ],
            ),
        )]);
        set_clip(&mut e, ClipField::StartFrame, AnmValue::Num(4.0)).unwrap();
        set_clip(&mut e, ClipField::EndFrame, AnmValue::Num(12.0)).unwrap();

        let steps = clip_steps(0);
        assert_eq!(get(&mut e, &steps, "startFrame"), Some(&BinValue::F32(4.0)));
        assert_eq!(get(&mut e, &steps, "EndFrame"), Some(&BinValue::F32(12.0)));
        assert!(
            get(&mut e, &steps, "mStartFrame").is_none(),
            "the prefixed twin must not be introduced"
        );
        assert!(get(&mut e, &steps, "mEndFrame").is_none());

        // A clip that already has the prefixed spelling keeps it.
        let mut e = graph_with(vec![(
            BinValue::String("Idle1".into()),
            pointer(
                "AtomicClipData",
                vec![("mStartFrame", BinValue::F32(1.0))],
            ),
        )]);
        set_clip(&mut e, ClipField::StartFrame, AnmValue::Num(4.0)).unwrap();
        assert_eq!(get(&mut e, &steps, "mStartFrame"), Some(&BinValue::F32(4.0)));
        assert!(get(&mut e, &steps, "startFrame").is_none());
    }

    #[test]
    fn mixed_convention_event_classes_keep_their_own_spellings() {
        // LockRootOrientationEventData: prefixed frames, un-prefixed JointName
        // and BlendOutTime, all in the same class.
        let mut e = graph_with(vec![(
            BinValue::String("Idle1".into()),
            pointer(
                "AtomicClipData",
                vec![(
                    "mEventDataMap",
                    map_of(vec![(
                        BinValue::String("Lock".into()),
                        pointer(
                            "LockRootOrientationEventData",
                            vec![
                                ("mStartFrame", BinValue::F32(0.0)),
                                ("JointName", BinValue::String("Root".into())),
                                ("BlendOutTime", BinValue::F32(0.1)),
                            ],
                        ),
                    )]),
                )],
            ),
        )]);
        set_event(&mut e, EventField::StartFrame, AnmValue::Num(3.0)).unwrap();
        set_event(&mut e, EventField::JointName, AnmValue::Text("Spine".into())).unwrap();
        set_event(&mut e, EventField::BlendOutTime, AnmValue::Num(0.4)).unwrap();

        let steps = event_steps(0, 0);
        assert_eq!(get(&mut e, &steps, "mStartFrame"), Some(&BinValue::F32(3.0)));
        assert_eq!(
            get(&mut e, &steps, "JointName"),
            Some(&BinValue::String("Spine".into()))
        );
        assert_eq!(get(&mut e, &steps, "BlendOutTime"), Some(&BinValue::F32(0.4)));
        assert!(get(&mut e, &steps, "mJointName").is_none());
        assert!(get(&mut e, &steps, "mBlendOutTime").is_none());
    }

    #[test]
    fn y_rotation_defaults_to_the_un_prefixed_spelling() {
        // FaceTargetEventData's entire vocabulary is mEndFrame + YRotationDegrees.
        let mut e = graph_with(vec![(
            BinValue::String("Idle1".into()),
            pointer(
                "AtomicClipData",
                vec![(
                    "mEventDataMap",
                    map_of(vec![(
                        BinValue::String("Face".into()),
                        pointer("FaceTargetEventData", vec![]),
                    )]),
                )],
            ),
        )]);
        set_event(&mut e, EventField::YRotationDegrees, AnmValue::Num(90.0)).unwrap();
        let steps = event_steps(0, 0);
        assert_eq!(
            get(&mut e, &steps, "YRotationDegrees"),
            Some(&BinValue::F32(90.0))
        );
        assert!(get(&mut e, &steps, "mYRotationDegrees").is_none());
    }

    // ---- flags -----------------------------------------------------------

    #[test]
    fn loops_toggles_only_bit_two() {
        let mut e = graph_with(vec![(
            BinValue::String("Idle1".into()),
            // 0b1101: bits 1, 4 and 8 set, LOOP clear.
            pointer("AtomicClipData", vec![("mFlags", BinValue::U32(13))]),
        )]);
        let steps = clip_steps(0);

        set_clip(&mut e, ClipField::Loops, AnmValue::Bool(true)).unwrap();
        assert_eq!(get(&mut e, &steps, "mFlags"), Some(&BinValue::U32(15)));

        set_clip(&mut e, ClipField::Loops, AnmValue::Bool(false)).unwrap();
        assert_eq!(
            get(&mut e, &steps, "mFlags"),
            Some(&BinValue::U32(13)),
            "every other bit survives the round trip"
        );

        // Absent mFlags starts from 0.
        let mut e = graph_with(vec![(
            BinValue::String("Idle1".into()),
            pointer("AtomicClipData", vec![]),
        )]);
        set_clip(&mut e, ClipField::Loops, AnmValue::Bool(true)).unwrap();
        assert_eq!(get(&mut e, &steps, "mFlags"), Some(&BinValue::U32(2)));
    }

    // ---- anm path --------------------------------------------------------

    #[test]
    fn anm_path_creates_the_resource_embed_and_sets_through_an_existing_one() {
        let mut e = graph_with(vec![(
            BinValue::String("Idle1".into()),
            pointer("AtomicClipData", vec![]),
        )]);
        let steps = clip_steps(0);
        set_clip(&mut e, ClipField::AnmPath, AnmValue::Text("a.anm".into())).unwrap();

        let res = get(&mut e, &steps, "mAnimationResourceData").unwrap().clone();
        let BinValue::Embed { class, fields } = &res else {
            panic!("expected an embed, got {res:?}");
        };
        assert_eq!(*class, fnv1a("AnimationResourceData"));
        assert_eq!(
            fields.get(&fnv1a("mAnimationFilePath")),
            Some(&BinValue::String("a.anm".into()))
        );

        // An existing embed keeps its unmodelled siblings.
        let mut e = graph_with(vec![(
            BinValue::String("Idle1".into()),
            pointer(
                "AtomicClipData",
                vec![(
                    "mAnimationResourceData",
                    embed(
                        "AnimationResourceData",
                        vec![
                            ("mAnimationFilePath", BinValue::String("old.anm".into())),
                            ("mTickDuration", BinValue::F32(0.033)),
                        ],
                    ),
                )],
            ),
        )]);
        set_clip(&mut e, ClipField::AnmPath, AnmValue::Text("new.anm".into())).unwrap();
        let res = get(&mut e, &steps, "mAnimationResourceData").unwrap().clone();
        let BinValue::Embed { fields, .. } = &res else { panic!() };
        assert_eq!(
            fields.get(&fnv1a("mAnimationFilePath")),
            Some(&BinValue::String("new.anm".into()))
        );
        assert_eq!(
            fields.get(&fnv1a("mTickDuration")),
            Some(&BinValue::F32(0.033)),
            "an unmodelled sibling must survive a one-field edit"
        );
    }

    #[test]
    fn an_empty_anm_path_is_rejected() {
        let mut e = graph_with(vec![(
            BinValue::String("Idle1".into()),
            pointer("AtomicClipData", vec![]),
        )]);
        assert!(set_clip(&mut e, ClipField::AnmPath, AnmValue::Text("  ".into())).is_err());
        assert!(get(&mut e, &clip_steps(0), "mAnimationResourceData").is_none());
    }

    // ---- submesh lists ---------------------------------------------------

    fn submesh_event(list: Option<BinValue>) -> BinEntry {
        let mut fields = vec![];
        if let Some(l) = list {
            fields.push(("mShowSubmeshList", l));
        }
        graph_with(vec![(
            BinValue::String("Idle1".into()),
            pointer(
                "AtomicClipData",
                vec![(
                    "mEventDataMap",
                    map_of(vec![(
                        BinValue::String("Vis".into()),
                        pointer("SubmeshVisibilityEventData", fields),
                    )]),
                )],
            ),
        )])
    }

    #[test]
    fn submesh_list_round_trips_a_comma_separated_string() {
        let mut e = submesh_event(Some(list_of(
            BinType::String,
            vec![BinValue::String("Body".into())],
        )));
        set_event(
            &mut e,
            EventField::Show,
            AnmValue::Text(" Cape , Hood ,, Body ".into()),
        )
        .unwrap();

        let steps = event_steps(0, 0);
        let got = get(&mut e, &steps, "mShowSubmeshList").unwrap().clone();
        assert_eq!(
            got,
            list_of(
                BinType::String,
                vec![
                    BinValue::String("Cape".into()),
                    BinValue::String("Hood".into()),
                    BinValue::String("Body".into()),
                ]
            ),
            "tokens are trimmed and empties dropped"
        );
    }

    #[test]
    fn submesh_list_preserves_a_hash_item_type() {
        let mut e = submesh_event(Some(list_of(
            BinType::Hash,
            vec![BinValue::Hash(fnv1a("Body"))],
        )));
        set_event(&mut e, EventField::Show, AnmValue::Text("Cape,Hood".into())).unwrap();

        let steps = event_steps(0, 0);
        assert_eq!(
            get(&mut e, &steps, "mShowSubmeshList").unwrap().clone(),
            list_of(
                BinType::Hash,
                vec![BinValue::Hash(fnv1a("Cape")), BinValue::Hash(fnv1a("Hood"))]
            ),
            "a list[hash] must not be retyped to list[string]"
        );

        // A fresh list is created as list[string].
        let mut e = submesh_event(None);
        set_event(&mut e, EventField::Hide, AnmValue::Text("Cape".into())).unwrap();
        assert_eq!(
            get(&mut e, &steps, "mHideSubmeshList").unwrap().clone(),
            list_of(BinType::String, vec![BinValue::String("Cape".into())])
        );
    }

    // ---- clearing --------------------------------------------------------

    #[test]
    fn null_removes_the_field_from_the_map() {
        let mut e = graph_with(vec![(
            BinValue::String("Idle1".into()),
            pointer(
                "AtomicClipData",
                vec![
                    ("mMaskDataName", BinValue::Hash(fnv1a("UpperBody"))),
                    ("startFrame", BinValue::F32(2.0)),
                    ("mStartFrame", BinValue::F32(2.0)),
                ],
            ),
        )]);
        let steps = clip_steps(0);

        set_clip(&mut e, ClipField::MaskDataName, AnmValue::Null).unwrap();
        assert!(get(&mut e, &steps, "mMaskDataName").is_none());

        // Both spellings go, or the reader would still see a frame.
        set_clip(&mut e, ClipField::StartFrame, AnmValue::Null).unwrap();
        assert!(get(&mut e, &steps, "startFrame").is_none());
        assert!(get(&mut e, &steps, "mStartFrame").is_none());

        // Clearing a submesh list drops the list itself.
        let mut e = submesh_event(Some(list_of(
            BinType::String,
            vec![BinValue::String("Body".into())],
        )));
        set_event(&mut e, EventField::Show, AnmValue::Null).unwrap();
        assert!(get(&mut e, &event_steps(0, 0), "mShowSubmeshList").is_none());
    }

    // ---- renames ---------------------------------------------------------

    fn two_clips() -> BinEntry {
        graph_with(vec![
            (
                BinValue::String("Idle1".into()),
                pointer(
                    "AtomicClipData",
                    vec![("mFlags", BinValue::U32(2))],
                ),
            ),
            (
                BinValue::String("Idle2".into()),
                pointer("AtomicClipData", vec![]),
            ),
        ])
    }

    fn map_keys(entry: &mut BinEntry) -> Vec<BinValue> {
        let v = walk_steps(
            entry,
            &[Step::Field {
                field: fnv1a("mClipDataMap"),
            }],
        )
        .unwrap();
        let BinValue::Map { entries, .. } = v else { panic!() };
        entries.iter().map(|(k, _)| k.clone()).collect()
    }

    #[test]
    fn rename_rewrites_the_key_and_leaves_the_value_alone() {
        let mut e = two_clips();
        let before = walk_steps(&mut e.clone(), &clip_steps(0)).unwrap().clone();

        rename_map_key_core(&mut e, &clip_steps(0), " Recall ", "Clip").unwrap();
        assert_eq!(
            map_keys(&mut e),
            vec![
                BinValue::String("Recall".into()),
                BinValue::String("Idle2".into())
            ],
            "the name is trimmed and only the target key changes"
        );
        assert_eq!(
            walk_steps(&mut e, &clip_steps(0)).unwrap().clone(),
            before,
            "the value is untouched"
        );

        // A hash key stays a hash.
        let mut e = graph_with(vec![(
            BinValue::Hash(fnv1a("Idle1")),
            pointer("AtomicClipData", vec![]),
        )]);
        rename_map_key_core(&mut e, &clip_steps(0), "Recall", "Clip").unwrap();
        assert_eq!(map_keys(&mut e), vec![BinValue::Hash(fnv1a("Recall"))]);
    }

    #[test]
    fn a_colliding_rename_is_rejected_and_changes_nothing() {
        let mut e = two_clips();
        let before = map_keys(&mut e);

        // Exact, and case-insensitively, since ClipMap resolves that way.
        assert!(rename_map_key_core(&mut e, &clip_steps(0), "Idle2", "Clip").is_err());
        assert!(rename_map_key_core(&mut e, &clip_steps(0), "IDLE2", "Clip").is_err());
        assert_eq!(map_keys(&mut e), before);

        // A hash key colliding with a named sibling counts too: a reference to
        // either would resolve to the same entry.
        let mut e = graph_with(vec![
            (
                BinValue::Hash(fnv1a("Idle1")),
                pointer("AtomicClipData", vec![]),
            ),
            (
                BinValue::String("Idle2".into()),
                pointer("AtomicClipData", vec![]),
            ),
        ]);
        let before = map_keys(&mut e);
        assert!(rename_map_key_core(&mut e, &clip_steps(0), "Idle2", "Clip").is_err());
        assert_eq!(map_keys(&mut e), before);

        // Renaming to its own current name is not a collision.
        rename_map_key_core(&mut e, &clip_steps(1), "Idle2", "Clip").unwrap();
    }

    #[test]
    fn rename_rejects_empty_names_and_non_map_paths() {
        let mut e = two_clips();
        let before = map_keys(&mut e);
        assert!(rename_map_key_core(&mut e, &clip_steps(0), "   ", "Clip").is_err());
        assert!(rename_map_key_core(&mut e, &[], "Recall", "Clip").is_err());
        // A field step is not a map entry.
        assert!(rename_map_key_core(
            &mut e,
            &[Step::Field {
                field: fnv1a("mClipDataMap")
            }],
            "Recall",
            "Clip"
        )
        .is_err());
        // Out of range.
        assert!(rename_map_key_core(&mut e, &clip_steps(9), "Recall", "Clip").is_err());
        assert_eq!(map_keys(&mut e), before);
    }

    // ---- path validation -------------------------------------------------

    #[test]
    fn a_stale_path_is_an_error_not_a_panic() {
        let mut e = two_clips();
        assert!(set_clip_field_core(
            &mut e,
            &clip_steps(9),
            ClipField::Loops,
            &AnmValue::Bool(true)
        )
        .is_err());
        // A path addressing the map itself is not a clip.
        assert!(set_clip_field_core(
            &mut e,
            &[Step::Field {
                field: fnv1a("mClipDataMap")
            }],
            ClipField::Loops,
            &AnmValue::Bool(true)
        )
        .is_err());
    }

    #[test]
    fn a_bad_value_type_is_rejected_before_anything_is_written() {
        let mut e = two_clips();
        let before = e.clone();
        assert!(set_clip(&mut e, ClipField::StartFrame, AnmValue::Bool(true)).is_err());
        assert!(set_clip(&mut e, ClipField::MaskDataName, AnmValue::Bool(true)).is_err());
        assert_eq!(e, before);
    }
}
