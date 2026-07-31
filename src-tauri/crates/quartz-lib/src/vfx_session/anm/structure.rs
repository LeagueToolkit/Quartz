/* Structural edits to the animation graph: create / delete / reorder / move a
clip or an event. Field-value edits live next door in `anm::ops`; this module
only changes WHICH nodes exist and in WHAT ORDER.

Every op follows the house shape from `vfx_session::ops`: validate the whole
request FIRST so a precondition miss leaves the session byte-identical, capture
ONE undo frame covering every touched entry, mutate, mark each touched bin
dirty, push the frame, reproject once. A "delete all events" is therefore one
undo step, not N.

POSITIONAL PATHS ARE THE HAZARD HERE
Clips live in `mClipDataMap` and events in `mEventDataMap`, both
`BinValue::Map`s addressed by `Step::MapIndex` - the entry's POSITION in the
map's `entries` vector (see `path::Step` on why position and not key). Removing
position N shifts every later entry down, so a batch delete in ascending order
hits the wrong nodes from the second removal on. `remove_batch` is the one place
that gets this right and both batch ops go through it.

MOVES ARE RELOCATIONS, NEVER REBUILDS
`move_event` lifts the existing `(key, value)` pair out of one map and pushes it
into another verbatim. The read layer models only a subset of each event class
(see `anim_graph`'s header), so rebuilding a moved event from its projected form
would silently drop `mIsKillEvent`, an `Updater`, and everything else this view
does not name. Creation is the only path that builds a node, and it writes the
full required field set for its class so the result round-trips through
`resolve_clip_graph` immediately. */

use indexmap::IndexMap;
use ritoshark::bin::{Bin, BinEntry, BinType, BinValue};
use ritoshark::hash::fnv1a;
use serde::Deserialize;

use super::project::{graph_hash, project_anm, AnmModel};
use crate::error::{Error, Result};
use crate::vfx_session::path::{walk_steps, Step, VfxPath};
use crate::vfx_session::session::{self, LoadedBin, SessionId};

// ── Wire payloads ────────────────────────────────────────────────────────────

/// What to build for `create_event`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewEvent {
    pub name: String,
    /// Which class to construct: matches AnimEventKind's serde tag names
    /// (`particle`, `sound`, `submeshVisibility`, `faceTarget`,
    /// `conformToPath`, `lockRootOrientation`, `stopAnimation`).
    pub kind: String,
}

/// What to build for `create_clip`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewClip {
    pub name: String,
    /// Matches ClipKind's serde tag names (`atomic`, `sequencer`, `parallel`,
    /// `selector`, `parametric`, `conditionFloat`, `conditionBool`).
    pub kind: String,
    /// The `.anm` an atomic clip plays. Required for `atomic`, ignored
    /// otherwise.
    pub anm_path: Option<String>,
}

// ── Shared helpers ───────────────────────────────────────────────────────────

pub(crate) fn bad(msg: impl Into<String>) -> Error {
    Error::InvalidInput(msg.into())
}

/// The `(key, value)` entries of the map a path's parent steps address, given
/// the path's last step is a `MapIndex`. Returns the entries plus that position.
///
/// Splitting the last step off is what lets a caller reach the SIBLING key: the
/// normal walk resolves a `MapIndex` straight to the value, and both a delete
/// and a move need the key too.
fn map_at<'a>(
    entry: &'a mut BinEntry,
    steps: &[Step],
) -> Option<(&'a mut Vec<(BinValue, BinValue)>, usize)> {
    let (last, parent) = steps.split_last()?;
    let Step::MapIndex { map_index } = *last else {
        return None;
    };
    match walk_steps(entry, parent)? {
        BinValue::Map { entries, .. } => Some((entries, map_index)),
        _ => None,
    }
}

/// The map a path addresses directly (the path ends AT the map, not at one of
/// its entries).
pub(crate) fn map_of<'a>(entry: &'a mut BinEntry, steps: &[Step]) -> Option<&'a mut BinValue> {
    match walk_steps(entry, steps)? {
        v @ BinValue::Map { .. } => Some(v),
        _ => None,
    }
}

/// True when `steps` addresses a live map entry.
fn map_entry_resolves(bins: &mut [LoadedBin], path: &VfxPath) -> bool {
    let Some(entry) = path.entry_of(bins) else {
        return false;
    };
    matches!(map_at(entry, &path.steps), Some((entries, i)) if i < entries.len())
}

/// A map key compared for duplicate detection: text lowercased, a hash rendered
/// `0x{h:08x}`, and a text key ALSO matched against its own fnv1a. Real graphs
/// mix resolved names and bare hashes in one map (see `anim_graph::ClipMap`), so
/// comparing only the literal `BinValue` would let "Idle1" be added next to the
/// hash that already means Idle1.
pub(crate) fn key_forms(key: &BinValue) -> Vec<String> {
    match key {
        BinValue::String(s) => vec![s.to_lowercase(), format!("0x{:08x}", fnv1a(s))],
        BinValue::Hash(h) | BinValue::Link(h) => vec![format!("0x{h:08x}")],
        _ => Vec::new(),
    }
}

/// True when `entries` already holds a key meaning the same thing as `name`.
fn has_key(entries: &[(BinValue, BinValue)], name: &str) -> bool {
    let wanted = key_forms(&BinValue::String(name.to_string()));
    entries
        .iter()
        .any(|(k, _)| key_forms(k).iter().any(|f| wanted.contains(f)))
}

/// The key BinValue to store for a new entry, matching the map's declared key
/// type. A `map[hash, ...]` must not receive a `String` key or the writer emits
/// a type the reader cannot parse back.
fn key_value(key_type: BinType, name: &str) -> BinValue {
    match key_type {
        BinType::String => BinValue::String(name.to_string()),
        BinType::Link => BinValue::Link(fnv1a(name)),
        _ => BinValue::Hash(fnv1a(name)),
    }
}

/// Wrap fields as the map's declared value type. Both clip and event maps are
/// `pointer`-valued in every real bin, but an embed-valued map is legal and
/// writing the wrong kind into it corrupts the map on save.
fn class_value(value_type: BinType, class: &str, fields: Vec<(&str, BinValue)>) -> BinValue {
    let mut f = IndexMap::new();
    for (name, v) in fields {
        f.insert(fnv1a(name), v);
    }
    match value_type {
        BinType::Embed => BinValue::Embed {
            class: fnv1a(class),
            fields: f,
        },
        _ => BinValue::Pointer {
            class: fnv1a(class),
            fields: f,
        },
    }
}

/* Remove several map entries under ONE parent map, deepest position first.

Callers pass positions that were all resolved against the SAME pre-edit map, so
they are only simultaneously valid if the removals happen back-to-front. Sorting
descending and deduplicating is the whole correctness argument; ascending order
silently deletes the wrong neighbours. */
fn remove_batch(entries: &mut Vec<(BinValue, BinValue)>, mut positions: Vec<usize>) {
    positions.sort_unstable_by(|a, b| b.cmp(a));
    positions.dedup();
    for pos in positions {
        if pos < entries.len() {
            entries.remove(pos);
        }
    }
}

/* Group map-entry paths by the map they live in, so each group's positions can
be removed back-to-front independently.

The key is `(bin, entry, parent steps)` - the full address of the containing
map, not just the last step. `vfx_session::ops::delete_emitters` sorts on the
LAST step alone, which is only correct when every target shares one parent; a
nested container puts an index in the PARENT steps too, and that sort then
interleaves positions belonging to different lists. Grouping removes the failure
mode instead of relying on the caller's selection being flat.

ANCESTOR/DESCENDANT STRATEGY: targets in an ancestor/descendant relationship
(a clip AND an event inside that same clip) are handled by ORDERING, not
rejection. Groups are visited longest-parent-path first, so a descendant's map
is emptied while its positions are still valid, and the ancestor's removal then
discards the container wholesale. Rejecting the batch would make "select a clip
and one of its events, press delete" an error, which is an ordinary gesture. */
type MapGroup = ((usize, usize, Vec<Step>), Vec<usize>);

fn group_by_parent(paths: &[VfxPath]) -> Result<Vec<MapGroup>> {
    let mut groups: Vec<MapGroup> = Vec::new();
    for path in paths {
        let Some((last, parent)) = path.steps.split_last() else {
            return Err(bad("Path must end in a map position"));
        };
        let Step::MapIndex { map_index } = *last else {
            return Err(bad("Path must end in a map position"));
        };
        let key = (path.bin, path.entry, parent.to_vec());
        match groups.iter_mut().find(|(k, _)| *k == key) {
            Some((_, positions)) => positions.push(map_index),
            None => groups.push((key, vec![map_index])),
        }
    }
    // Deepest container first: see the ancestor/descendant note above.
    groups.sort_by_key(|((_, _, parent), _)| std::cmp::Reverse(parent.len()));
    Ok(groups)
}

/// The `(bin, entry indices)` shape `VfxSession::capture` wants, deduplicated.
fn touched_entries(paths: impl IntoIterator<Item = (usize, usize)>) -> Vec<(usize, Vec<usize>)> {
    let mut touched: Vec<(usize, Vec<usize>)> = Vec::new();
    for (bin, entry) in paths {
        match touched.iter_mut().find(|(b, _)| *b == bin) {
            Some((_, entries)) => {
                if !entries.contains(&entry) {
                    entries.push(entry);
                }
            }
            None => touched.push((bin, vec![entry])),
        }
    }
    touched
}

/// Clamp a requested destination to a valid position in a `len`-long map.
///
/// Drag-to-reorder routinely asks for "past the end" when the user drops below
/// the last row; that is an ordinary gesture, not an error, so it clamps.
fn clamp_index(new_index: usize, len: usize) -> usize {
    new_index.min(len.saturating_sub(1))
}

// ── Cores: pure mutations on plain bins, so tests need no session ────────────

/// Delete every addressed map entry across one bin set. Returns how many were
/// removed. Positions that no longer resolve are skipped, not an error: the
/// caller validated them, and a mid-batch ancestor removal legitimately takes
/// descendants with it.
pub(crate) fn delete_map_entries_core(bins: &mut [Bin], paths: &[VfxPath]) -> Result<usize> {
    let groups = group_by_parent(paths)?;
    let mut removed = 0;
    for ((bin, entry, parent), positions) in groups {
        let Some(target) = bins.get_mut(bin).and_then(|b| b.entries.get_mut(entry)) else {
            continue;
        };
        let Some(BinValue::Map { entries, .. }) = walk_steps(target, &parent) else {
            continue;
        };
        let before = entries.len();
        remove_batch(entries, positions);
        removed += before - entries.len();
    }
    Ok(removed)
}

/// Append `(key, value)` to the map `steps` addresses on `entry`, rejecting a
/// duplicate key. `class` and `fields` are wrapped to the map's declared value
/// type.
pub(crate) fn append_to_map_core(
    entry: &mut BinEntry,
    steps: &[Step],
    name: &str,
    class: &str,
    fields: Vec<(&str, BinValue)>,
    what: &str,
) -> Result<()> {
    let Some(BinValue::Map {
        key: key_type,
        value: value_type,
        entries,
    }) = map_of(entry, steps)
    else {
        return Err(bad(format!("{what} map no longer resolves")));
    };
    if has_key(entries, name) {
        return Err(bad(format!("A {what} named \"{name}\" already exists")));
    }
    let key = key_value(*key_type, name);
    let value = class_value(*value_type, class, fields);
    entries.push((key, value));
    Ok(())
}

/// Move one map entry to a new position WITHIN its own map, clamping the
/// destination. Preserves the pair verbatim.
pub(crate) fn reorder_in_map_core(
    entry: &mut BinEntry,
    steps: &[Step],
    new_index: usize,
) -> Result<()> {
    let Some((entries, from)) = map_at(entry, steps) else {
        return Err(bad("Path does not address a map entry"));
    };
    if from >= entries.len() {
        return Err(bad("Path no longer resolves"));
    }
    let to = clamp_index(new_index, entries.len());
    if to == from {
        return Ok(());
    }
    let pair = entries.remove(from);
    entries.insert(to, pair);
    Ok(())
}

/// Lift the `(key, value)` pair at `from` and append it to the map at
/// `to_map_steps`, both inside one bin set.
///
/// The pair is MOVED, never rebuilt, so unmodelled fields on the event survive
/// (that is the whole point - see this module's header). Removal happens before
/// the append, so a same-map move degrades to "send to the end" rather than
/// duplicating the entry.
pub(crate) fn move_map_entry_core(
    bins: &mut [Bin],
    from: &VfxPath,
    to_bin: usize,
    to_entry: usize,
    to_map_steps: &[Step],
) -> Result<()> {
    // BOTH endpoints are checked before anything is detached. Otherwise a bad
    // target leaves the entry removed from its source with nowhere to land.
    let pos = {
        let source = bins
            .get_mut(from.bin)
            .and_then(|b| b.entries.get_mut(from.entry))
            .ok_or_else(|| bad("Source no longer resolves"))?;
        let Some((entries, pos)) = map_at(source, &from.steps) else {
            return Err(bad("Source does not address a map entry"));
        };
        if pos >= entries.len() {
            return Err(bad("Source no longer resolves"));
        }
        pos
    };
    {
        let target = bins
            .get_mut(to_bin)
            .and_then(|b| b.entries.get_mut(to_entry))
            .ok_or_else(|| bad("Target clip no longer resolves"))?;
        if map_of(target, to_map_steps).is_none() {
            return Err(bad("Target clip has no event map"));
        }
    }

    let moved = {
        let source = bins[from.bin]
            .entries
            .get_mut(from.entry)
            .expect("validated above");
        let (entries, _) = map_at(source, &from.steps).expect("validated above");
        entries.remove(pos)
    };

    let target = bins[to_bin]
        .entries
        .get_mut(to_entry)
        .expect("validated above");
    let Some(BinValue::Map { entries, .. }) = map_of(target, to_map_steps) else {
        unreachable!("target map validated above")
    };
    entries.push(moved);
    Ok(())
}

/// Ensure the clip at `clip_steps` has an `mEventDataMap`, creating an empty
/// `map[hash, pointer]` when it does not. Returns the steps addressing the map.
///
/// A clip with no events at all simply omits the field, so "add the first event
/// to this clip" must be able to materialise it. The key/value types match what
/// `anim_graph::parse_all_events` reads and what every real bin uses.
pub(crate) fn ensure_event_map_core(
    entry: &mut BinEntry,
    clip_steps: &[Step],
) -> Result<Vec<Step>> {
    let mut steps = clip_steps.to_vec();
    steps.push(Step::Field {
        field: fnv1a("mEventDataMap"),
    });
    if map_of(entry, &steps).is_some() {
        return Ok(steps);
    }
    let clip = walk_steps(entry, clip_steps).ok_or_else(|| bad("Clip no longer resolves"))?;
    let fields = match clip {
        BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => fields,
        _ => return Err(bad("Clip is not a class node")),
    };
    // Only overwrite when the field is absent or is not a map; a real map was
    // already returned above.
    fields.insert(
        fnv1a("mEventDataMap"),
        BinValue::Map {
            key: BinType::Hash,
            value: BinType::Pointer,
            entries: Vec::new(),
        },
    );
    Ok(steps)
}

// ── Class construction ───────────────────────────────────────────────────────

/// The class fields a fresh node is built from.
type ClassFields = (&'static str, Vec<(&'static str, BinValue)>);

/// An empty `list[item]`. New nodes get their containers present but empty, so
/// the UI has something to append into and the read layer classifies the node.
fn empty_list(item: BinType) -> BinValue {
    BinValue::List {
        is_list2: false,
        item,
        items: Vec::new(),
    }
}

fn empty_str() -> BinValue {
    BinValue::String(String::new())
}

/* The required field set per event class, at defaults that make the new node
parse back as its own kind through `anim_graph::parse_event_kind`.

Spellings come from `anim_graph` verbatim, INCLUDING its verified
inconsistencies: `FaceTargetEventData` writes the un-prefixed `YRotationDegrees`
(the prefixed form hashes differently), and `LockRootOrientationEventData` mixes
prefixed frames with un-prefixed `JointName` / `BlendOutTime`. Writing the tidy
spelling instead produces a node the engine ignores. */
fn event_class_fields(kind: &str) -> Result<ClassFields> {
    let frame = || BinValue::F32(0.0);
    Ok(match kind {
        "particle" => (
            "ParticleEventData",
            vec![
                ("mEffectKey", empty_str()),
                ("mStartFrame", frame()),
                ("mParticleEventDataPairList", empty_list(BinType::Embed)),
            ],
        ),
        "sound" => (
            "SoundEventData",
            vec![
                ("mSoundName", empty_str()),
                ("mIsLoop", BinValue::Bool(false)),
            ],
        ),
        "submeshVisibility" => (
            "SubmeshVisibilityEventData",
            vec![
                ("mStartFrame", frame()),
                ("mEndFrame", frame()),
                ("mShowSubmeshList", empty_list(BinType::Hash)),
                ("mHideSubmeshList", empty_list(BinType::Hash)),
            ],
        ),
        // `YRotationDegrees` carries NO `m` prefix; see the note above.
        "faceTarget" => (
            "FaceTargetEventData",
            vec![("mEndFrame", frame()), ("YRotationDegrees", frame())],
        ),
        "conformToPath" => (
            "ConformToPathEventData",
            vec![
                ("mMaskDataName", empty_str()),
                ("mBlendInTime", frame()),
                ("mBlendOutTime", frame()),
            ],
        ),
        // Prefixed frames, un-prefixed `JointName` / `BlendOutTime`.
        "lockRootOrientation" => (
            "LockRootOrientationEventData",
            vec![
                ("mStartFrame", frame()),
                ("mEndFrame", frame()),
                ("JointName", empty_str()),
                ("BlendOutTime", frame()),
            ],
        ),
        "stopAnimation" => (
            "StopAnimationEventData",
            vec![("mStopAnimationName", empty_str())],
        ),
        other => return Err(bad(format!("Unknown event kind \"{other}\""))),
    })
}

/// The required field set per clip class. An atomic clip carries its
/// `mAnimationResourceData.mAnimationFilePath`; each composite gets its own
/// empty reference container.
fn clip_class_fields(spec: &NewClip) -> Result<ClassFields> {
    let names = || empty_list(BinType::Hash);
    let pairs = || empty_list(BinType::Embed);
    Ok(match spec.kind.as_str() {
        "atomic" => {
            let anm = spec
                .anm_path
                .as_deref()
                .map(str::trim)
                .filter(|p| !p.is_empty())
                .ok_or_else(|| bad("An atomic clip needs an .anm path"))?;
            let mut res = IndexMap::new();
            res.insert(
                fnv1a("mAnimationFilePath"),
                BinValue::String(anm.to_string()),
            );
            (
                "AtomicClipData",
                vec![
                    (
                        "mAnimationResourceData",
                        BinValue::Embed {
                            class: fnv1a("AnimationResourceData"),
                            fields: res,
                        },
                    ),
                    ("mFlags", BinValue::U32(0)),
                ],
            )
        }
        "sequencer" => ("SequencerClipData", vec![("mClipNameList", names())]),
        "parallel" => ("ParallelClipData", vec![("mClipNameList", names())]),
        "selector" => ("SelectorClipData", vec![("mSelectorPairDataList", pairs())]),
        "parametric" => (
            "ParametricClipData",
            vec![("mParametricPairDataList", pairs())],
        ),
        // Its own list name, NOT the parametric one (verified in `anim_graph`).
        "conditionFloat" => (
            "ConditionFloatClipData",
            vec![("mConditionFloatPairDataList", pairs())],
        ),
        // No pair list at all: two named branches.
        "conditionBool" => (
            "ConditionBoolClipData",
            vec![
                ("mTrueConditionClipName", empty_str()),
                ("mFalseConditionClipName", empty_str()),
            ],
        ),
        other => return Err(bad(format!("Unknown clip kind \"{other}\""))),
    })
}

/// Where the animation graph entry lives in a bin set, as `(bin, entry)`.
///
/// Reached through `project::graph_hash`, which walks
/// `SkinCharacterDataProperties.skinAnimationProperties.animationGraphData`.
/// Deliberately NOT "the first AnimationGraphData entry": a multi-skin bin set
/// holds several and the first is the wrong one.
pub(crate) fn locate_graph(bins: &[Bin]) -> Option<(usize, usize)> {
    let want = graph_hash(bins)?;
    for (bin_idx, bin) in bins.iter().enumerate() {
        for (entry_idx, entry) in bin.entries.iter().enumerate() {
            if entry.path_hash == want {
                return Some((bin_idx, entry_idx));
            }
        }
    }
    None
}

/// The steps addressing the graph entry's `mClipDataMap`.
pub(crate) fn clip_map_steps() -> Vec<Step> {
    vec![Step::Field {
        field: fnv1a("mClipDataMap"),
    }]
}

// ── Session ops: events ──────────────────────────────────────────────────────

/// Delete several events in one edit: one undo frame, one reprojection.
///
/// An empty selection is a no-op returning the current model rather than an
/// error, so a UI that fires "delete selected" with nothing selected does not
/// have to special-case it.
pub fn delete_events(id: SessionId, events: &[VfxPath]) -> Result<AnmModel> {
    delete_map_paths(id, events, "Event")
}

/// Delete several clips in one edit. Same batching discipline as
/// [`delete_events`].
pub fn delete_clips(id: SessionId, clips: &[VfxPath]) -> Result<AnmModel> {
    delete_map_paths(id, clips, "Clip")
}

fn delete_map_paths(id: SessionId, paths: &[VfxPath], what: &str) -> Result<AnmModel> {
    if paths.is_empty() {
        return session::with_session(id, |s| project_anm(s));
    }
    session::with_session(id, |s| -> Result<AnmModel> {
        // Validate every path before touching anything.
        for path in paths {
            if !map_entry_resolves(&mut s.bins, path) {
                return Err(bad(format!("{what} no longer resolves")));
            }
        }
        let frame = s.capture(&touched_entries(paths.iter().map(|p| (p.bin, p.entry))));

        let mut trees: Vec<Bin> = s.bins.iter().map(|lb| lb.tree.clone()).collect();
        delete_map_entries_core(&mut trees, paths)?;
        for (i, tree) in trees.into_iter().enumerate() {
            s.bins[i].tree = tree;
        }
        for path in paths {
            s.mark_dirty(path.bin);
        }
        s.push_frame(frame);
        Ok(project_anm(s))
    })?
}

/// Append a new event to a clip's `mEventDataMap`, creating the map when the
/// clip has none yet.
pub fn create_event(id: SessionId, clip: &VfxPath, spec: &NewEvent) -> Result<AnmModel> {
    let name = spec.name.trim().to_string();
    if name.is_empty() {
        return Err(bad("Event name cannot be empty"));
    }
    // Reject an unknown kind before the session guard so nothing is captured.
    let (class, fields) = event_class_fields(&spec.kind)?;

    session::with_session(id, |s| -> Result<AnmModel> {
        {
            let entry = clip
                .entry_of(&mut s.bins)
                .ok_or_else(|| bad("Clip no longer resolves"))?;
            if walk_steps(entry, &clip.steps).is_none() {
                return Err(bad("Clip no longer resolves"));
            }
        }
        let frame = s.capture(&[(clip.bin, vec![clip.entry])]);
        let entry = clip.entry_of(&mut s.bins).expect("validated above");
        let map_steps = ensure_event_map_core(entry, &clip.steps)?;
        // A duplicate key aborts here, AFTER capture but BEFORE any mutation of
        // the map itself; `ensure_event_map_core` may have added an empty map,
        // which the frame restores on undo and which is harmless meanwhile.
        append_to_map_core(entry, &map_steps, &name, class, fields, "event")?;
        s.mark_dirty(clip.bin);
        s.push_frame(frame);
        Ok(project_anm(s))
    })?
}

/// Move an event from its clip to `target_clip`, preserving the entry verbatim.
///
/// Backs drag-and-drop between clips. A drop onto the event's own clip is not an
/// error: it degrades to "send to the end of this clip", which is what the
/// gesture looks like to the user.
pub fn move_event(id: SessionId, event: &VfxPath, target_clip: &VfxPath) -> Result<AnmModel> {
    session::with_session(id, |s| -> Result<AnmModel> {
        // Validate both ends before capture; the target's event map is only
        // materialised AFTER capture, so undo also reverses that.
        if !map_entry_resolves(&mut s.bins, event) {
            return Err(bad("Event no longer resolves"));
        }
        {
            let entry = target_clip
                .entry_of(&mut s.bins)
                .ok_or_else(|| bad("Target clip no longer resolves"))?;
            if walk_steps(entry, &target_clip.steps).is_none() {
                return Err(bad("Target clip no longer resolves"));
            }
        }

        let frame = s.capture(&touched_entries([
            (event.bin, event.entry),
            (target_clip.bin, target_clip.entry),
        ]));

        // A target with no events yet simply omits the field; create it so the
        // drop has somewhere to land.
        let entry = target_clip.entry_of(&mut s.bins).expect("validated above");
        let map_steps = ensure_event_map_core(entry, &target_clip.steps)?;

        let mut trees: Vec<Bin> = s.bins.iter().map(|lb| lb.tree.clone()).collect();
        move_map_entry_core(
            &mut trees,
            event,
            target_clip.bin,
            target_clip.entry,
            &map_steps,
        )?;
        for (i, tree) in trees.into_iter().enumerate() {
            s.bins[i].tree = tree;
        }
        s.mark_dirty(event.bin);
        s.mark_dirty(target_clip.bin);
        s.push_frame(frame);
        Ok(project_anm(s))
    })?
}

/// Move an event to a new position inside its own clip's event map. Backs
/// drag-to-reorder; an out-of-range destination clamps.
pub fn reorder_event(id: SessionId, event: &VfxPath, new_index: usize) -> Result<AnmModel> {
    reorder_map_entry(id, event, new_index, "Event")
}

/// Move a clip to a new position in the graph's `mClipDataMap`.
pub fn reorder_clip(id: SessionId, clip: &VfxPath, new_index: usize) -> Result<AnmModel> {
    reorder_map_entry(id, clip, new_index, "Clip")
}

fn reorder_map_entry(
    id: SessionId,
    path: &VfxPath,
    new_index: usize,
    what: &str,
) -> Result<AnmModel> {
    session::with_session(id, |s| -> Result<AnmModel> {
        if !map_entry_resolves(&mut s.bins, path) {
            return Err(bad(format!("{what} no longer resolves")));
        }
        let frame = s.capture(&[(path.bin, vec![path.entry])]);
        let entry = path.entry_of(&mut s.bins).expect("validated above");
        reorder_in_map_core(entry, &path.steps, new_index)?;
        s.mark_dirty(path.bin);
        s.push_frame(frame);
        Ok(project_anm(s))
    })?
}

// ── Session ops: clips ───────────────────────────────────────────────────────

/// Append a new clip to the animation graph's `mClipDataMap`.
pub fn create_clip(id: SessionId, spec: &NewClip) -> Result<AnmModel> {
    let name = spec.name.trim().to_string();
    if name.is_empty() {
        return Err(bad("Clip name cannot be empty"));
    }
    // Kind and anm-path validation happen before the guard so a bad request
    // never reaches a capture.
    let (class, fields) = clip_class_fields(spec)?;

    session::with_session(id, |s| -> Result<AnmModel> {
        let trees: Vec<Bin> = s.bins.iter().map(|lb| lb.tree.clone()).collect();
        let (bin, entry_idx) = locate_graph(&trees)
            .ok_or_else(|| bad("This skin has no animation graph to add a clip to"))?;

        let steps = clip_map_steps();
        {
            let entry = &mut s.bins[bin].tree.entries[entry_idx];
            if map_of(entry, &steps).is_none() {
                return Err(bad("The animation graph has no clip map"));
            }
        }
        let frame = s.capture(&[(bin, vec![entry_idx])]);
        let entry = &mut s.bins[bin].tree.entries[entry_idx];
        append_to_map_core(entry, &steps, &name, class, fields, "clip")?;
        s.mark_dirty(bin);
        s.push_frame(frame);
        Ok(project_anm(s))
    })?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::anim_graph::{resolve_clip_graph, AnimEventKind, ClipKind};

    const GRAPH_NAME: &str = "Characters/Yone/Animations/Skin74";

    // ---- fixtures (mirroring `anm::project`'s test builders) ----------------

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

    fn map_of_ptr(entries: Vec<(BinValue, BinValue)>) -> BinValue {
        BinValue::Map {
            key: BinType::Hash,
            value: BinType::Pointer,
            entries,
        }
    }

    /// How the read layer names an entry this module created in a hash-keyed
    /// map. A `map[hash, ...]` must receive a `Hash` key, and `anim_graph`
    /// renders an unresolved hash as `0x{h:08x}` (a clip additionally falls back
    /// to its `.anm` stem, which is why the clip tests look up by stem).
    fn hashed(name: &str) -> String {
        format!("0x{:08x}", fnv1a(name))
    }

    fn anm(path: &str) -> (&'static str, BinValue) {
        (
            "mAnimationResourceData",
            embed(
                "AnimationResourceData",
                vec![("mAnimationFilePath", BinValue::String(path.to_string()))],
            ),
        )
    }

    /// One bin: an SCDP linking a graph entry that carries `maps`.
    fn bins_with(maps: Vec<(&str, BinValue)>) -> Vec<Bin> {
        let scdp = BinEntry {
            path_hash: fnv1a("Characters/Yone/Skins/Skin74"),
            class_hash: fnv1a("SkinCharacterDataProperties"),
            fields: {
                let mut f = IndexMap::new();
                f.insert(
                    fnv1a("skinAnimationProperties"),
                    embed(
                        "SkinAnimationProperties",
                        vec![("animationGraphData", BinValue::Link(fnv1a(GRAPH_NAME)))],
                    ),
                );
                f
            },
        };
        let graph = BinEntry {
            path_hash: fnv1a(GRAPH_NAME),
            class_hash: fnv1a("animationGraphData"),
            fields: {
                let mut f = IndexMap::new();
                for (name, value) in maps {
                    f.insert(fnv1a(name), value);
                }
                f
            },
        };
        vec![Bin {
            entries: vec![scdp, graph],
            ..Bin::new()
        }]
    }

    /// A graph whose single clip "Idle1" carries `count` events named `E0..`.
    fn bins_with_events(count: usize) -> Vec<Bin> {
        let events: Vec<(BinValue, BinValue)> = (0..count)
            .map(|i| {
                (
                    BinValue::String(format!("E{i}")),
                    pointer(
                        "SoundEventData",
                        vec![("mSoundName", BinValue::String(format!("snd{i}")))],
                    ),
                )
            })
            .collect();
        bins_with(vec![(
            "mClipDataMap",
            map_of_ptr(vec![(
                BinValue::String("Idle1".into()),
                pointer(
                    "AtomicClipData",
                    vec![anm("idle1.anm"), ("mEventDataMap", map_of_ptr(events))],
                ),
            )]),
        )])
    }

    /// The graph entry (index 1 in the single test bin).
    fn graph_mut(bins: &mut [Bin]) -> &mut BinEntry {
        &mut bins[0].entries[1]
    }

    fn clip_steps(clip_pos: usize) -> Vec<Step> {
        vec![
            Step::Field {
                field: fnv1a("mClipDataMap"),
            },
            Step::MapIndex {
                map_index: clip_pos,
            },
        ]
    }

    fn event_steps(clip_pos: usize, event_pos: usize) -> Vec<Step> {
        let mut steps = clip_steps(clip_pos);
        steps.push(Step::Field {
            field: fnv1a("mEventDataMap"),
        });
        steps.push(Step::MapIndex {
            map_index: event_pos,
        });
        steps
    }

    fn event_path(clip_pos: usize, event_pos: usize) -> VfxPath {
        VfxPath {
            bin: 0,
            entry: 1,
            steps: event_steps(clip_pos, event_pos),
        }
    }

    /// The keys of the map at `steps`, in order. Order is the assertion in
    /// nearly every test here, since that is what positional paths index into.
    fn keys_at(bins: &mut [Bin], steps: &[Step]) -> Vec<String> {
        let Some(BinValue::Map { entries, .. }) = walk_steps(graph_mut(bins), steps) else {
            return Vec::new();
        };
        entries
            .iter()
            .map(|(k, _)| match k {
                BinValue::String(s) => s.clone(),
                other => format!("{other:?}"),
            })
            .collect()
    }

    fn event_keys(bins: &mut [Bin], clip_pos: usize) -> Vec<String> {
        let mut steps = clip_steps(clip_pos);
        steps.push(Step::Field {
            field: fnv1a("mEventDataMap"),
        });
        keys_at(bins, &steps)
    }

    fn clip_keys(bins: &mut [Bin]) -> Vec<String> {
        keys_at(bins, &clip_map_steps())
    }

    // ---- batch delete -------------------------------------------------------

    /// The regression test for ascending-order removal: with 5 events, removing
    /// 0/2/4 front-to-back would delete E0, E3 and then nothing.
    #[test]
    fn batch_delete_removes_exactly_the_addressed_positions() {
        let mut bins = bins_with_events(5);
        let targets = vec![event_path(0, 0), event_path(0, 2), event_path(0, 4)];
        let removed = delete_map_entries_core(&mut bins, &targets).unwrap();
        assert_eq!(removed, 3);
        assert_eq!(event_keys(&mut bins, 0), vec!["E1", "E3"]);
    }

    #[test]
    fn batch_delete_preserves_survivor_order() {
        let mut bins = bins_with_events(6);
        // Deliberately out of order so the sort, not the caller, does the work.
        let targets = vec![event_path(0, 3), event_path(0, 0), event_path(0, 4)];
        delete_map_entries_core(&mut bins, &targets).unwrap();
        assert_eq!(event_keys(&mut bins, 0), vec!["E1", "E2", "E5"]);
    }

    #[test]
    fn empty_batch_is_a_no_op() {
        let mut bins = bins_with_events(3);
        let removed = delete_map_entries_core(&mut bins, &[]).unwrap();
        assert_eq!(removed, 0);
        assert_eq!(event_keys(&mut bins, 0), vec!["E0", "E1", "E2"]);
    }

    /// A clip and one of its own events selected together: the descendant's map
    /// is emptied first, then the ancestor clip goes wholesale. Neither removal
    /// may land on the wrong node.
    #[test]
    fn batch_delete_handles_ancestor_and_descendant_together() {
        let mut bins = bins_with(vec![(
            "mClipDataMap",
            map_of_ptr(vec![
                (
                    BinValue::String("A".into()),
                    pointer(
                        "AtomicClipData",
                        vec![
                            anm("a.anm"),
                            (
                                "mEventDataMap",
                                map_of_ptr(vec![(
                                    BinValue::String("E0".into()),
                                    pointer("SoundEventData", vec![]),
                                )]),
                            ),
                        ],
                    ),
                ),
                (
                    BinValue::String("B".into()),
                    pointer("AtomicClipData", vec![anm("b.anm")]),
                ),
            ]),
        )]);
        let targets = vec![
            VfxPath {
                bin: 0,
                entry: 1,
                steps: clip_steps(0),
            },
            event_path(0, 0),
        ];
        delete_map_entries_core(&mut bins, &targets).unwrap();
        assert_eq!(clip_keys(&mut bins), vec!["B"]);
    }

    #[test]
    fn batch_delete_rejects_a_non_map_path() {
        let mut bins = bins_with_events(2);
        let bad_path = VfxPath {
            bin: 0,
            entry: 1,
            steps: vec![Step::Field {
                field: fnv1a("mClipDataMap"),
            }],
        };
        assert!(delete_map_entries_core(&mut bins, &[bad_path]).is_err());
        assert_eq!(event_keys(&mut bins, 0), vec!["E0", "E1"]);
    }

    // ---- create_event -------------------------------------------------------

    /// Every modelled kind must construct a node the READ layer parses back as
    /// that same kind, or the new event appears as `Unknown` in the UI.
    #[test]
    fn create_event_round_trips_every_modelled_kind() {
        type IsKind = fn(&AnimEventKind) -> bool;
        let cases: &[(&str, IsKind)] = &[
            ("particle", |k| matches!(k, AnimEventKind::Particle { .. })),
            ("sound", |k| matches!(k, AnimEventKind::Sound { .. })),
            ("submeshVisibility", |k| {
                matches!(k, AnimEventKind::SubmeshVisibility { .. })
            }),
            ("faceTarget", |k| {
                matches!(k, AnimEventKind::FaceTarget { .. })
            }),
            ("conformToPath", |k| {
                matches!(k, AnimEventKind::ConformToPath { .. })
            }),
            ("lockRootOrientation", |k| {
                matches!(k, AnimEventKind::LockRootOrientation { .. })
            }),
            ("stopAnimation", |k| {
                matches!(k, AnimEventKind::StopAnimation { .. })
            }),
        ];

        for (kind, is_kind) in cases {
            let mut bins = bins_with_events(0);
            let (class, fields) = event_class_fields(kind).unwrap();
            let steps = ensure_event_map_core(graph_mut(&mut bins), &clip_steps(0)).unwrap();
            append_to_map_core(graph_mut(&mut bins), &steps, "New", class, fields, "event")
                .unwrap();

            let clips = resolve_clip_graph(&bins);
            let clip = clips.iter().find(|c| c.name == "Idle1").expect("clip");
            let want = hashed("New");
            let ev = clip
                .all_events
                .iter()
                .find(|e| e.name == want)
                .unwrap_or_else(|| panic!("{kind}: new event not read back"));
            assert!(is_kind(&ev.kind), "{kind} round-tripped as {:?}", ev.kind);
        }
    }

    #[test]
    fn create_event_rejects_unknown_kind_and_duplicate_key() {
        assert!(event_class_fields("teleport").is_err());

        let mut bins = bins_with_events(2);
        let (class, fields) = event_class_fields("sound").unwrap();
        let steps = ensure_event_map_core(graph_mut(&mut bins), &clip_steps(0)).unwrap();
        assert!(
            append_to_map_core(graph_mut(&mut bins), &steps, "E1", class, fields, "event").is_err()
        );
        assert_eq!(event_keys(&mut bins, 0), vec!["E0", "E1"]);
    }

    /// A clip with no events at all must gain a correctly typed map.
    #[test]
    fn ensure_event_map_creates_a_hash_keyed_pointer_map() {
        let mut bins = bins_with(vec![(
            "mClipDataMap",
            map_of_ptr(vec![(
                BinValue::String("Idle1".into()),
                pointer("AtomicClipData", vec![anm("idle1.anm")]),
            )]),
        )]);
        let steps = ensure_event_map_core(graph_mut(&mut bins), &clip_steps(0)).unwrap();
        match walk_steps(graph_mut(&mut bins), &steps) {
            Some(BinValue::Map { key, value, .. }) => {
                assert_eq!(*key, BinType::Hash);
                assert_eq!(*value, BinType::Pointer);
            }
            other => panic!("expected a map, got {other:?}"),
        }
    }

    // ---- move_event ---------------------------------------------------------

    /// Two clips, the second empty: moving an event across must carry fields the
    /// read layer does not model.
    fn bins_two_clips() -> Vec<Bin> {
        bins_with(vec![(
            "mClipDataMap",
            map_of_ptr(vec![
                (
                    BinValue::String("A".into()),
                    pointer(
                        "AtomicClipData",
                        vec![
                            anm("a.anm"),
                            (
                                "mEventDataMap",
                                map_of_ptr(vec![(
                                    BinValue::String("E0".into()),
                                    pointer(
                                        "SoundEventData",
                                        vec![
                                            ("mSoundName", BinValue::String("boom".into())),
                                            // Unmodelled by `anim_graph`: the
                                            // field a rebuild would silently drop.
                                            ("mIsKillEvent", BinValue::Bool(true)),
                                        ],
                                    ),
                                )]),
                            ),
                        ],
                    ),
                ),
                (
                    BinValue::String("B".into()),
                    pointer(
                        "AtomicClipData",
                        vec![anm("b.anm"), ("mEventDataMap", map_of_ptr(Vec::new()))],
                    ),
                ),
            ]),
        )])
    }

    #[test]
    fn move_event_preserves_unmodelled_fields() {
        let mut bins = bins_two_clips();
        let mut target = clip_steps(1);
        target.push(Step::Field {
            field: fnv1a("mEventDataMap"),
        });
        move_map_entry_core(&mut bins, &event_path(0, 0), 0, 1, &target).unwrap();

        assert!(
            event_keys(&mut bins, 0).is_empty(),
            "source must be emptied"
        );
        assert_eq!(event_keys(&mut bins, 1), vec!["E0"]);

        let moved = walk_steps(graph_mut(&mut bins), &event_steps(1, 0)).expect("moved event");
        let BinValue::Pointer { fields, .. } = moved else {
            panic!("expected a pointer, got {moved:?}");
        };
        assert_eq!(
            fields.get(&fnv1a("mIsKillEvent")),
            Some(&BinValue::Bool(true)),
            "an unmodelled sibling field must survive the move"
        );
        assert_eq!(
            fields.get(&fnv1a("mSoundName")),
            Some(&BinValue::String("boom".into()))
        );
    }

    #[test]
    fn move_event_to_its_own_clip_is_not_destructive() {
        let mut bins = bins_with_events(3);
        let mut target = clip_steps(0);
        target.push(Step::Field {
            field: fnv1a("mEventDataMap"),
        });
        move_map_entry_core(&mut bins, &event_path(0, 0), 0, 1, &target).unwrap();
        // Nothing lost; the entry simply lands at the end.
        assert_eq!(event_keys(&mut bins, 0), vec!["E1", "E2", "E0"]);
    }

    #[test]
    fn move_event_rejects_a_target_without_a_map_and_keeps_the_source() {
        let mut bins = bins_two_clips();
        // Address a target map that does not exist on clip B.
        let mut target = clip_steps(1);
        target.push(Step::Field {
            field: fnv1a("mNotAMap"),
        });
        assert!(move_map_entry_core(&mut bins, &event_path(0, 0), 0, 1, &target).is_err());
        assert_eq!(
            event_keys(&mut bins, 0),
            vec!["E0"],
            "a failed move must leave the source untouched"
        );
    }

    // ---- reorder ------------------------------------------------------------

    #[test]
    fn reorder_event_clamps_an_out_of_range_index() {
        let mut bins = bins_with_events(3);
        reorder_in_map_core(graph_mut(&mut bins), &event_steps(0, 0), 99).unwrap();
        assert_eq!(event_keys(&mut bins, 0), vec!["E1", "E2", "E0"]);

        // And a same-position reorder changes nothing.
        reorder_in_map_core(graph_mut(&mut bins), &event_steps(0, 1), 1).unwrap();
        assert_eq!(event_keys(&mut bins, 0), vec!["E1", "E2", "E0"]);
    }

    #[test]
    fn reorder_event_moves_backwards_too() {
        let mut bins = bins_with_events(4);
        reorder_in_map_core(graph_mut(&mut bins), &event_steps(0, 3), 0).unwrap();
        assert_eq!(event_keys(&mut bins, 0), vec!["E3", "E0", "E1", "E2"]);
    }

    // ---- create_clip --------------------------------------------------------

    #[test]
    fn create_clip_rejects_a_duplicate_name_and_leaves_the_map_unchanged() {
        let mut bins = bins_with_events(1);
        let spec = NewClip {
            name: "Idle1".into(),
            kind: "atomic".into(),
            anm_path: Some("other.anm".into()),
        };
        let (class, fields) = clip_class_fields(&spec).unwrap();
        let steps = clip_map_steps();
        assert!(append_to_map_core(
            graph_mut(&mut bins),
            &steps,
            &spec.name,
            class,
            fields,
            "clip"
        )
        .is_err());
        assert_eq!(clip_keys(&mut bins), vec!["Idle1"]);
    }

    #[test]
    fn create_clip_atomic_round_trips_with_its_anm_path() {
        let mut bins = bins_with_events(0);
        let spec = NewClip {
            name: "Spell1".into(),
            kind: "atomic".into(),
            anm_path: Some("ASSETS/Characters/Yone/Animations/spell1.anm".into()),
        };
        let (class, fields) = clip_class_fields(&spec).unwrap();
        append_to_map_core(
            graph_mut(&mut bins),
            &clip_map_steps(),
            &spec.name,
            class,
            fields,
            "clip",
        )
        .unwrap();

        /* The map is hash-keyed, so the key stored is `fnv1a("Spell1")`. In the
           app the read layer names that back through the BIN hash dictionary;
           the dictionary is disabled under test (see `anim_graph`), so here it
           falls back to the `.anm` stem. Either way the clip is found and its
           class and path round-trip, which is what this test is about. */
        let clips = resolve_clip_graph(&bins);
        let created = clips.iter().find(|c| c.name == "spell1").expect("new clip");
        assert_eq!(created.kind, ClipKind::Atomic);
        assert_eq!(
            created.anm_path.as_deref(),
            Some("ASSETS/Characters/Yone/Animations/spell1.anm")
        );
    }

    #[test]
    fn create_clip_rejects_unknown_kind_and_a_missing_anm_path() {
        let unknown = NewClip {
            name: "X".into(),
            kind: "blendable".into(),
            anm_path: None,
        };
        assert!(clip_class_fields(&unknown).is_err());

        let no_anm = NewClip {
            name: "X".into(),
            kind: "atomic".into(),
            anm_path: None,
        };
        assert!(clip_class_fields(&no_anm).is_err());
    }

    /// The composite kinds must round-trip too. A composite with no members
    /// carries no anm and no events, so `resolve_clip_graph` would drop it; each
    /// one is therefore given a member clip that does name an anm.
    #[test]
    fn create_clip_composite_kinds_round_trip() {
        for (kind, want) in [
            ("sequencer", ClipKind::Sequencer),
            ("parallel", ClipKind::Parallel),
        ] {
            let spec = NewClip {
                name: "Comp".into(),
                kind: kind.into(),
                anm_path: None,
            };
            let (class, _) = clip_class_fields(&spec).unwrap();
            // The composite needs a member that names an anm, or the read layer
            // drops the whole clip as unplayable.
            let fields = vec![(
                "mClipNameList",
                BinValue::List {
                    is_list2: false,
                    item: BinType::String,
                    items: vec![BinValue::String("Idle1".into())],
                },
            )];
            let mut bins = bins_with_events(0);
            append_to_map_core(
                graph_mut(&mut bins),
                &clip_map_steps(),
                "Comp",
                class,
                fields,
                "clip",
            )
            .unwrap();
            // The hash key displays as the inherited member's `.anm` stem, so
            // the new clip is identified by its class, not by its name.
            let clips = resolve_clip_graph(&bins);
            let c = clips
                .iter()
                .find(|c| c.class_hash == fnv1a(class))
                .unwrap_or_else(|| panic!("{kind}: new clip not read back"));
            assert_eq!(c.kind, want);
            assert_eq!(c.members.len(), 1, "{kind} must expose its member");
        }
    }

    /// `ConditionFloatClipData` must get its OWN list name; reusing the
    /// parametric one produces a clip the engine reads as empty.
    #[test]
    fn condition_float_clip_uses_its_own_pair_list_name() {
        let spec = NewClip {
            name: "CF".into(),
            kind: "conditionFloat".into(),
            anm_path: None,
        };
        let (class, fields) = clip_class_fields(&spec).unwrap();
        assert_eq!(class, "ConditionFloatClipData");
        assert!(fields
            .iter()
            .any(|(n, _)| *n == "mConditionFloatPairDataList"));
        assert!(!fields.iter().any(|(n, _)| *n == "mParametricPairDataList"));
    }

    // ---- graph location -----------------------------------------------------

    /// The graph must be found through the SCDP link, not by taking the first
    /// AnimationGraphData entry: here a decoy graph sits ahead of the real one.
    #[test]
    fn locate_graph_follows_the_scdp_link_not_the_first_graph_entry() {
        let mut bins = bins_with_events(1);
        let decoy = BinEntry {
            path_hash: fnv1a("Characters/Yone/Animations/Skin00"),
            class_hash: fnv1a("animationGraphData"),
            fields: IndexMap::new(),
        };
        bins[0].entries.insert(0, decoy);
        // The real graph shifted to index 2; the decoy is index 0.
        assert_eq!(locate_graph(&bins), Some((0, 2)));
    }
}
