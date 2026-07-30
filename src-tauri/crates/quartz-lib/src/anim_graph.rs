/* Animation clip graph resolution.
 *
 * A skin's `SkinCharacterDataProperties.skinAnimationProperties.animationGraphData`
 * links an `AnimationGraphData` entry (often in a separate `animations/skinN.bin`).
 * That entry's `mClipDataMap` holds one clip per animation, each carrying:
 *   - `mAnimationResourceData.mAnimationFilePath` -> the `.anm` asset path (which
 *     frequently points at the BASE skin's Animations folder, not this skin's),
 *   - `mEventDataMap` -> per-clip events, including `SubmeshVisibilityEventData`
 *     (show/hide submesh lists over a frame window),
 *   - `mFlags` bit 2 = LOOP,
 *   - or, for a `SequencerClipData`, a `mClipNameList` queue of other clips.
 *
 * This module reads all of that from the (already-merged) bins. Pure read: it
 * never mutates a bin. Semantics mirror RubyRe's byte-verified `animations.ts`.
 *
 * ---------------------------------------------------------------------------
 * THIS IS A VIEW, NOT A REPLACEMENT
 *
 * The structs below model the fields the viewer needs. They deliberately do NOT
 * model every field a clip or event can carry: real bins also hold
 * `mTickDuration`, `mSyncGroupDataName`, `mIsKillEvent`, `mIsDetachable`,
 * `mChangeAnimationMidPlay`, `mFireIfAnimationEndsEarly`, an `Updater`'s own
 * class and fields, and more.
 *
 * Because of that, every parsed node carries a [`BinAddr`] pointing back at the
 * exact `BinValue` it was read from. A write path resolves that address and sets
 * ONE field in place, so unmodelled siblings are never rewritten or dropped. Do
 * not "reconstruct" a clip from the parsed struct - that is precisely the
 * data-loss bug this addressing design exists to avoid.
 *
 * Unknown classes are likewise PRESERVED, not skipped: an unrecognised clip
 * becomes `ClipKind::Unknown` and an unrecognised event becomes
 * `AnimEventKind::Unknown`, both keeping their class hash and their address. An
 * earlier version silently lost `JointSnapEventData` (97 real uses) and
 * `IdleParticlesVisibilityEventData` by filtering to known classes.
 *
 * Field-name spellings are byte-verified against ritobin dumps of real skin
 * bins; several classes mix `m`-prefixed and un-prefixed names within a single
 * class (see the per-class notes on [`ClipKind`] and [`AnimEventKind`]). Since
 * `fnv1a` lowercases, `animationGraphData` and `AnimationGraphData` hash alike,
 * but `YRotationDegrees` and `mYRotationDegrees` do NOT - the prefix matters.
 */

use std::collections::{HashMap, HashSet};

use ritoshark::bin::{Bin, BinEntry, BinValue};
use ritoshark::hash::fnv1a;
use serde::Serialize;

use crate::vfx_session::path::{Step, VfxPath};

/// mFlags bit 2 = LOOP (inherited on AtomicClipData).
const CLIP_FLAG_LOOP: u32 = 2;

/// Where a parsed node lives in the resident bins, so a write path can resolve
/// it and set a single field without rewriting unmodelled siblings.
///
/// Same wire shape as [`VfxPath`] (`{ bin, entry, steps }`); [`Self::to_vfx_path`]
/// converts. Kept as its own type so this module does not force every consumer
/// of a clip graph to depend on the VFX session.
///
/// # Known limitation: map-contained values are addressed by pair index
///
/// Clips live in `mClipDataMap` and events in `mEventDataMap`, both `BinValue::Map`s.
/// [`Step`] has only `Field` and `Index` variants - there is no map-key step - and
/// `path.rs::walk_steps` does not descend into `BinValue::Map` at all. So the step
/// recorded for a map entry is `Step::Index { index }` holding the entry's
/// POSITION in the map's `entries` vector, and such a path will NOT resolve
/// through `walk_steps` as-is.
///
/// A future write path must therefore special-case the map hop: walk to the map
/// with the leading steps, then index its `entries` directly. Positional indices
/// stay valid as long as nothing inserts or removes map entries in between.
/// Fixing this properly means adding a key-aware `Step` variant, which would
/// change the serialized path wire format shared with the frontend and
/// `bineditor` - deliberately out of scope here; `path.rs` is left untouched.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BinAddr {
    pub bin: usize,
    pub entry: usize,
    pub steps: Vec<Step>,
}

impl BinAddr {
    /// The addressed top-level entry, with no steps below it.
    pub fn root(bin: usize, entry: usize) -> BinAddr {
        BinAddr {
            bin,
            entry,
            steps: Vec::new(),
        }
    }

    /// This address extended by one step down.
    pub fn child(&self, step: Step) -> BinAddr {
        let mut steps = self.steps.clone();
        steps.push(step);
        BinAddr {
            bin: self.bin,
            entry: self.entry,
            steps,
        }
    }

    /// Descend into a named field.
    pub fn field(&self, name: &str) -> BinAddr {
        self.child(Step::Field { field: fnv1a(name) })
    }

    /// Descend into a list item, or a map entry by position (see the type docs
    /// for why a map hop does not resolve through `walk_steps`).
    pub fn index(&self, index: usize) -> BinAddr {
        self.child(Step::Index { index })
    }

    /// The equivalent [`VfxPath`] - identical wire shape and semantics.
    pub fn to_vfx_path(&self) -> VfxPath {
        VfxPath {
            bin: self.bin,
            entry: self.entry,
            steps: self.steps.clone(),
        }
    }
}

impl From<&BinAddr> for VfxPath {
    fn from(a: &BinAddr) -> VfxPath {
        a.to_vfx_path()
    }
}

/// A submesh-visibility event: while `[start_frame, end_frame]` is live during the
/// clip, HIDE `hide` and SHOW `show`. Tokens are submesh names OR `0x`-hashes when
/// the bin stored a `list[hash]` the hash DB couldn't resolve; the consumer matches
/// by name and by fnv1a-32 hash.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmeshVisEvent {
    pub start_frame: Option<f32>,
    pub end_frame: Option<f32>,
    pub show: Vec<String>,
    pub hide: Vec<String>,
}

/// A `mBoneName` / `mTargetBoneName` pair nested in a `ParticleEventData`'s
/// `mParticleEventDataPairList`.
///
/// VERIFIED: `ParticleEventDataPair` has EXACTLY these two fields and nothing
/// else - no event name, no hash, no frames. It is a bare list element, so it
/// cannot be identified by name; only its address locates it. (Trying to delete
/// one by name is what broke an earlier implementation.) `mBoneName` is present
/// on essentially every pair; `mTargetBoneName` is optional.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticlePair {
    pub bone_name: Option<String>,
    pub target_bone_name: Option<String>,
    pub addr: BinAddr,
}

/// The typed payload of one event in a clip's `mEventDataMap`.
///
/// Field spellings are byte-verified against ritobin dumps; the odd ones are
/// called out per variant. Anything unrecognised lands in [`Self::Unknown`]
/// rather than being dropped.
// `rename_all` renames the VARIANTS; `rename_all_fields` is also needed or a
// struct variant's fields would serialize snake_case (`start_frame`) inside an
// otherwise camelCase model. The frontend switches on `type`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum AnimEventKind {
    /// `ParticleEventData`: spawns a VFX system.
    ///
    /// VERIFIED: carries `mEffectKey`, `mStartFrame`, `mIsLoop`, and its bone
    /// bindings in `mParticleEventDataPairList`. It has NO `mBoneName` of its
    /// own - the bone lives on the nested [`ParticlePair`]s.
    Particle {
        effect_key: Option<String>,
        start_frame: Option<f32>,
        is_loop: Option<bool>,
        pairs: Vec<ParticlePair>,
    },
    /// `SoundEventData`: `mSoundName` + `mIsLoop`.
    Sound {
        sound_name: Option<String>,
        is_loop: Option<bool>,
    },
    /// `SubmeshVisibilityEventData`: show/hide submesh lists over a frame window.
    SubmeshVisibility {
        start_frame: Option<f32>,
        end_frame: Option<f32>,
        show: Vec<String>,
        hide: Vec<String>,
    },
    /// `FaceTargetEventData`: turns the model toward the camera/target.
    ///
    /// VERIFIED: the ENTIRE vocabulary is `mEndFrame` and `YRotationDegrees`.
    /// Note `YRotationDegrees` has NO `m` prefix, so it hashes differently from
    /// `mYRotationDegrees`; both spellings are read, prefixed form last. There is
    /// no `mFaceTarget`, no `mStartFrame` and no blend time. Most real instances
    /// are literally `FaceTargetEventData {}` - entirely empty.
    FaceTarget {
        end_frame: Option<f32>,
        y_rotation_degrees: Option<f32>,
    },
    /// `ConformToPathEventData`: blends the root onto a path.
    ///
    /// VERIFIED: ONLY `mMaskDataName`, `mBlendInTime`, `mBlendOutTime`. It has no
    /// frame fields at all.
    ConformToPath {
        mask_data_name: Option<String>,
        blend_in_time: Option<f32>,
        blend_out_time: Option<f32>,
    },
    /// `LockRootOrientationEventData`: pins root orientation to a joint.
    ///
    /// VERIFIED: mixes conventions inside one class - `mStartFrame` / `mEndFrame`
    /// carry the `m` prefix while `JointName` and `BlendOutTime` do NOT.
    LockRootOrientation {
        start_frame: Option<f32>,
        end_frame: Option<f32>,
        joint_name: Option<String>,
        blend_out_time: Option<f32>,
    },
    /// `StopAnimationEventData`: `mStopAnimationName`.
    StopAnimation { stop_animation_name: Option<String> },
    /// Any other event class, preserved with its class hash so it is neither
    /// lost nor misread. Real examples: `JointSnapEventData`,
    /// `IdleParticlesVisibilityEventData`.
    Unknown { class_hash: u32 },
}

/// One entry of a clip's `mEventDataMap`: its key, its typed payload, and where
/// it lives so a write path can reach the fields this view does not model.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimEvent {
    /// Resolved map key, or `0x{h:08x}` when the hash DB could not name it.
    pub name: String,
    pub class_hash: u32,
    pub kind: AnimEventKind,
    pub addr: BinAddr,
}

/// One entry of a `mSelectorPairDataList` / `mParametricPairDataList` /
/// `mConditionFloatPairDataList`.
///
/// All three element classes share the shape `{ mClipName, <weight> }`, so one
/// struct covers them: `probability` holds a `SelectorPairData.mProbability` and
/// `value` holds a `ParametricPairData` / `ConditionFloatPairData` `mValue`.
/// `mValue` is not always a scalar in the wild (it also appears as an embed or
/// pointer), so a non-f32 `mValue` simply reads as `None` while the pair itself
/// and its address are still kept.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipPair {
    pub clip_name: Option<String>,
    pub probability: Option<f32>,
    pub value: Option<f32>,
    pub addr: BinAddr,
}

/// Which class a clip is, plus the class-specific payload.
///
/// VERIFIED against ritobin dumps of real skin bins. Note that
/// `ConditionFloatClipData` uses its OWN list/element names
/// (`mConditionFloatPairDataList` of `ConditionFloatPairData`) rather than
/// sharing the parametric ones, and that `ConditionBoolClipData` has no pair
/// list at all - it branches on two named clips.
// See [`AnimEventKind`] on why `rename_all_fields` is needed alongside
// `rename_all`: without it `ConditionBool`'s two fields serialize snake_case.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum ClipKind {
    /// `AtomicClipData` - the leaf that actually names a `.anm`.
    Atomic,
    /// `SequencerClipData` - `mClipNameList` played in order.
    Sequencer,
    /// `ParallelClipData` - the same `mClipNameList` shape, but the members play
    /// simultaneously instead of in sequence. Rare (1 real use) but genuine.
    Parallel,
    /// `SelectorClipData` - weighted random pick over `mSelectorPairDataList`.
    Selector,
    /// `ParametricClipData` - blends `mParametricPairDataList` by a parameter.
    Parametric,
    /// `ConditionFloatClipData` - picks by float condition. Its list is
    /// `mConditionFloatPairDataList` of `ConditionFloatPairData`, NOT the
    /// parametric names. Also carries an `Updater` pointer (unmodelled: reach it
    /// through the clip's address).
    ConditionFloat,
    /// `ConditionBoolClipData` - branches between two named clips. Has NO pair
    /// list; it carries `mTrueConditionClipName` / `mFalseConditionClipName`
    /// plus an `Updater` pointer (unmodelled: reach it through the address).
    ConditionBool {
        true_clip: Option<String>,
        false_clip: Option<String>,
    },
    /// Any other clip class, preserved with its class hash.
    ///
    /// Note `BlendableClipData` does not occur in any real bin examined, so it is
    /// intentionally not given a variant of its own and lands here.
    Unknown,
}

/// One member of a sequencer's (or parallel/selector/parametric/condition
/// clip's) queue: a leaf clip that names a `.anm`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipMember {
    pub name: String,
    /// `.anm` asset path (ASSETS/...).
    pub anm_path: String,
    /// Legacy submesh-only view; a strict subset of `all_events`.
    pub events: Vec<SubmeshVisEvent>,
    pub loops: bool,
    pub kind: ClipKind,
    pub class_hash: u32,
    /// Raw `mFlags`, unmasked. `loops` is bit 2 of this.
    pub flags: u32,
    pub track_data_name: Option<String>,
    pub mask_data_name: Option<String>,
    /// `AtomicClipData`'s own clip-window frames.
    ///
    /// VERIFIED: this class carries the un-prefixed `startFrame` / `EndFrame`
    /// (note the inconsistent capitalisation - lowercase `s`, uppercase `E`)
    /// alongside the prefixed forms, so BOTH spellings are read.
    pub start_frame: Option<f32>,
    pub end_frame: Option<f32>,
    /// EVERY event on this member, including unmodelled classes.
    pub all_events: Vec<AnimEvent>,
    pub addr: BinAddr,
}

/// One resolved clip from the graph.
///
/// `events` / `loops` are the original viewer-facing fields and keep their exact
/// meaning; everything else is additive. `events` stays submesh-only because
/// `port_donor`, `commands/wad` and the TS `PreparedClip` consume it as such -
/// use `all_events` for the complete, typed list.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipInfo {
    pub name: String,
    /// `.anm` asset path (ASSETS/...); for a sequencer this is its first member's.
    pub anm_path: Option<String>,
    /// A sequencer's ordered queue; empty for an ordinary atomic clip.
    pub members: Vec<ClipMember>,
    /// This clip's own submesh-visibility events (global frames for a sequencer).
    /// Legacy view; a strict subset of `all_events`.
    pub events: Vec<SubmeshVisEvent>,
    pub loops: bool,
    /// Which clip class this is, with class-specific payload.
    pub kind: ClipKind,
    pub class_hash: u32,
    /// Raw `mFlags`, unmasked. `loops` is bit 2 of this.
    pub flags: u32,
    pub track_data_name: Option<String>,
    pub mask_data_name: Option<String>,
    /// `AtomicClipData`'s own clip-window frames.
    ///
    /// VERIFIED: this class carries the un-prefixed `startFrame` / `EndFrame`
    /// (note the inconsistent capitalisation - lowercase `s`, uppercase `E`)
    /// alongside the prefixed forms, so BOTH spellings are read.
    pub start_frame: Option<f32>,
    pub end_frame: Option<f32>,
    /// Pair list for a selector / parametric / condition-float clip.
    pub pairs: Vec<ClipPair>,
    /// EVERY event on this clip, including classes this module does not model.
    pub all_events: Vec<AnimEvent>,
    /// Where this clip lives, for a field-precise write path.
    pub addr: BinAddr,
}

/// A clip resolved for the viewer, with `.anm` refs remapped to on-disk files.
/// Members carry disk paths in `anm_path`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedClipMember {
    pub name: String,
    pub anm_path: String,
    pub events: Vec<SubmeshVisEvent>,
    pub loops: bool,
    pub kind: ClipKind,
    pub class_hash: u32,
    pub flags: u32,
    pub track_data_name: Option<String>,
    pub mask_data_name: Option<String>,
    /// `AtomicClipData`'s own clip-window frames.
    ///
    /// VERIFIED: this class carries the un-prefixed `startFrame` / `EndFrame`
    /// (note the inconsistent capitalisation - lowercase `s`, uppercase `E`)
    /// alongside the prefixed forms, so BOTH spellings are read.
    pub start_frame: Option<f32>,
    pub end_frame: Option<f32>,
    pub all_events: Vec<AnimEvent>,
    pub addr: BinAddr,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedClip {
    pub name: String,
    pub anm_path: Option<String>,
    pub members: Vec<PreparedClipMember>,
    pub events: Vec<SubmeshVisEvent>,
    pub loops: bool,
    pub kind: ClipKind,
    pub class_hash: u32,
    pub flags: u32,
    pub track_data_name: Option<String>,
    pub mask_data_name: Option<String>,
    /// `AtomicClipData`'s own clip-window frames.
    ///
    /// VERIFIED: this class carries the un-prefixed `startFrame` / `EndFrame`
    /// (note the inconsistent capitalisation - lowercase `s`, uppercase `E`)
    /// alongside the prefixed forms, so BOTH spellings are read.
    pub start_frame: Option<f32>,
    pub end_frame: Option<f32>,
    pub pairs: Vec<ClipPair>,
    pub all_events: Vec<AnimEvent>,
    pub addr: BinAddr,
}

/// Remap a resolved clip graph's ASSETS anm refs to disk paths via `to_disk`.
/// Drops clips (and members) whose anm did not resolve on disk.
pub fn prepare_clips(
    clips: Vec<ClipInfo>,
    to_disk: impl Fn(&str) -> Option<String>,
) -> Vec<PreparedClip> {
    clips
        .into_iter()
        .filter_map(|c| {
            let disk = c.anm_path.as_deref().and_then(&to_disk);
            let members: Vec<PreparedClipMember> = c
                .members
                .into_iter()
                .filter_map(|m| {
                    to_disk(&m.anm_path).map(|d| PreparedClipMember {
                        name: m.name,
                        anm_path: d,
                        events: m.events,
                        loops: m.loops,
                        kind: m.kind,
                        class_hash: m.class_hash,
                        flags: m.flags,
                        track_data_name: m.track_data_name,
                        mask_data_name: m.mask_data_name,
                        start_frame: m.start_frame,
                        end_frame: m.end_frame,
                        all_events: m.all_events,
                        addr: m.addr,
                    })
                })
                .collect();
            if disk.is_none() && members.is_empty() {
                return None;
            }
            Some(PreparedClip {
                anm_path: disk.or_else(|| members.first().map(|m| m.anm_path.clone())),
                name: c.name,
                members,
                events: c.events,
                loops: c.loops,
                kind: c.kind,
                class_hash: c.class_hash,
                flags: c.flags,
                track_data_name: c.track_data_name,
                mask_data_name: c.mask_data_name,
                start_frame: c.start_frame,
                end_frame: c.end_frame,
                pairs: c.pairs,
                all_events: c.all_events,
                addr: c.addr,
            })
        })
        .collect()
}

fn fields(value: &BinValue) -> Option<&indexmap::IndexMap<u32, BinValue>> {
    match value {
        BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => Some(fields),
        _ => None,
    }
}

fn as_string(value: Option<&BinValue>) -> Option<String> {
    match value {
        Some(BinValue::String(s)) if !s.is_empty() => Some(s.clone()),
        _ => None,
    }
}

fn as_f32(value: Option<&BinValue>) -> Option<f32> {
    match value {
        Some(BinValue::F32(v)) => Some(*v),
        _ => None,
    }
}

fn as_u32(value: Option<&BinValue>) -> Option<u32> {
    match value {
        Some(BinValue::U32(v)) => Some(*v),
        Some(BinValue::I32(v)) => Some(*v as u32),
        _ => None,
    }
}

/// A link/hash/string field resolved to a path-hash key.
fn link_hash(value: Option<&BinValue>) -> Option<u32> {
    match value? {
        BinValue::Link(h) | BinValue::Hash(h) => Some(*h),
        BinValue::String(s) => Some(fnv1a(s)),
        _ => None,
    }
}

/// One `list[hash]` / `list[string]` submesh token list, collected as strings
/// (a raw hash becomes `0x{h:08x}` so the consumer can match by hash).
fn submesh_list(value: Option<&BinValue>) -> Vec<String> {
    let BinValue::List { items, .. } = value.unwrap_or(&BinValue::None) else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|v| match v {
            BinValue::String(s) if !s.is_empty() => Some(s.clone()),
            BinValue::Hash(h) | BinValue::Link(h) => Some(format!("0x{h:08x}")),
            _ => None,
        })
        .collect()
}

/// A `bool` field. Real bins store these as `Bool`, but a `Flag` is the same
/// thing in the format, so both are accepted.
fn as_bool(value: Option<&BinValue>) -> Option<bool> {
    match value? {
        BinValue::Bool(b) | BinValue::Flag(b) => Some(*b),
        _ => None,
    }
}

/// A name-ish field: a plain string, or a hash rendered `0x{h:08x}`.
///
/// Most "name" fields in these classes are typed `hash` in the bin
/// (`mTrackDataName`, `mEffectKey`, `mBoneName`, `mClipName`, ...), and only
/// resolve to text when the hash DB knows them, so both forms must be handled.
fn as_name(value: Option<&BinValue>) -> Option<String> {
    match value? {
        BinValue::String(s) if !s.is_empty() => Some(s.clone()),
        BinValue::String(_) => None,
        BinValue::Hash(h) | BinValue::Link(h) => Some(format!("0x{h:08x}")),
        _ => None,
    }
}

/// Read the first present spelling of a field, in the order given.
///
/// Several classes mix conventions (`AtomicClipData` has both `mStartFrame` and
/// a bare `startFrame`; `FaceTargetEventData` uses `YRotationDegrees` with no
/// prefix). Since `fnv1a` lowercases only the case, not the prefix, the two
/// spellings are genuinely different keys and both must be probed.
fn first_of<'a>(
    f: &'a indexmap::IndexMap<u32, BinValue>,
    names: &[&str],
) -> Option<&'a BinValue> {
    names.iter().find_map(|n| f.get(&fnv1a(n)))
}

/// The class hash of a Pointer/Embed value.
fn class_of(value: &BinValue) -> Option<u32> {
    match value {
        BinValue::Pointer { class, .. } | BinValue::Embed { class, .. } => Some(*class),
        _ => None,
    }
}

/// A map key normalised to a display string: a resolved name, or `0x{h:08x}`.
fn key_name(key: &BinValue) -> Option<String> {
    match key {
        BinValue::String(s) => Some(s.clone()),
        BinValue::Hash(h) | BinValue::Link(h) => Some(format!("0x{h:08x}")),
        _ => None,
    }
}

/// Parse a `ParticleEventData`'s `mParticleEventDataPairList`.
///
/// Each element is a bare `ParticleEventDataPair { mBoneName, mTargetBoneName }`
/// with no name and no hash of its own, so `addr` is the ONLY way to address one.
fn parse_particle_pairs(
    f: &indexmap::IndexMap<u32, BinValue>,
    addr: &BinAddr,
) -> Vec<ParticlePair> {
    let list_addr = addr.field("mParticleEventDataPairList");
    let Some(BinValue::List { items, .. }) = f.get(&fnv1a("mParticleEventDataPairList")) else {
        return Vec::new();
    };
    items
        .iter()
        .enumerate()
        .map(|(i, item)| {
            let pf = fields(item);
            ParticlePair {
                bone_name: pf.and_then(|p| as_name(p.get(&fnv1a("mBoneName")))),
                target_bone_name: pf.and_then(|p| as_name(p.get(&fnv1a("mTargetBoneName")))),
                addr: list_addr.index(i),
            }
        })
        .collect()
}

/// Classify and read one event value by its class hash.
fn parse_event_kind(class: u32, v: &BinValue, addr: &BinAddr) -> AnimEventKind {
    let empty = indexmap::IndexMap::new();
    let f = fields(v).unwrap_or(&empty);

    if class == fnv1a("ParticleEventData") {
        return AnimEventKind::Particle {
            effect_key: as_name(f.get(&fnv1a("mEffectKey"))),
            start_frame: as_f32(f.get(&fnv1a("mStartFrame"))),
            is_loop: as_bool(f.get(&fnv1a("mIsLoop"))),
            pairs: parse_particle_pairs(f, addr),
        };
    }
    if class == fnv1a("SoundEventData") {
        return AnimEventKind::Sound {
            sound_name: as_name(f.get(&fnv1a("mSoundName"))),
            is_loop: as_bool(f.get(&fnv1a("mIsLoop"))),
        };
    }
    if class == fnv1a("SubmeshVisibilityEventData") {
        return AnimEventKind::SubmeshVisibility {
            start_frame: as_f32(f.get(&fnv1a("mStartFrame"))),
            end_frame: as_f32(f.get(&fnv1a("mEndFrame"))),
            show: submesh_list(f.get(&fnv1a("mShowSubmeshList"))),
            hide: submesh_list(f.get(&fnv1a("mHideSubmeshList"))),
        };
    }
    if class == fnv1a("FaceTargetEventData") {
        // Un-prefixed `YRotationDegrees` is the spelling real bins use; the
        // prefixed form is probed second purely defensively.
        return AnimEventKind::FaceTarget {
            end_frame: as_f32(f.get(&fnv1a("mEndFrame"))),
            y_rotation_degrees: as_f32(first_of(
                f,
                &["YRotationDegrees", "mYRotationDegrees"],
            )),
        };
    }
    if class == fnv1a("ConformToPathEventData") {
        return AnimEventKind::ConformToPath {
            mask_data_name: as_name(f.get(&fnv1a("mMaskDataName"))),
            blend_in_time: as_f32(f.get(&fnv1a("mBlendInTime"))),
            blend_out_time: as_f32(f.get(&fnv1a("mBlendOutTime"))),
        };
    }
    if class == fnv1a("LockRootOrientationEventData") {
        // Mixed convention inside one class: frames prefixed, the other two not.
        return AnimEventKind::LockRootOrientation {
            start_frame: as_f32(first_of(f, &["mStartFrame", "StartFrame"])),
            end_frame: as_f32(first_of(f, &["mEndFrame", "EndFrame"])),
            joint_name: as_name(first_of(f, &["JointName", "mJointName"])),
            blend_out_time: as_f32(first_of(f, &["BlendOutTime", "mBlendOutTime"])),
        };
    }
    if class == fnv1a("StopAnimationEventData") {
        return AnimEventKind::StopAnimation {
            stop_animation_name: as_name(f.get(&fnv1a("mStopAnimationName"))),
        };
    }
    AnimEventKind::Unknown { class_hash: class }
}

/// Parse a clip's `mEventDataMap` into typed events, preserving unknown classes.
///
/// `clip_addr` addresses the clip itself; each event's address is
/// `clip_addr / mEventDataMap / index`. See [`BinAddr`] on why the map hop is a
/// positional index.
fn parse_all_events(
    clip: &indexmap::IndexMap<u32, BinValue>,
    clip_addr: &BinAddr,
) -> Vec<AnimEvent> {
    let map_addr = clip_addr.field("mEventDataMap");
    let Some(BinValue::Map { entries, .. }) = clip.get(&fnv1a("mEventDataMap")) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for (i, (k, v)) in entries.iter().enumerate() {
        let Some(class) = class_of(v) else { continue };
        let addr = map_addr.index(i);
        out.push(AnimEvent {
            name: key_name(k).unwrap_or_default(),
            class_hash: class,
            kind: parse_event_kind(class, v, &addr),
            addr,
        });
    }
    out
}

/// The legacy submesh-only event view, derived from the typed list.
///
/// Keeps the original filter exactly: an event with neither a show nor a hide
/// list contributes nothing here (it is still present in `all_events`).
fn submesh_events(all: &[AnimEvent]) -> Vec<SubmeshVisEvent> {
    all.iter()
        .filter_map(|e| match &e.kind {
            AnimEventKind::SubmeshVisibility {
                start_frame,
                end_frame,
                show,
                hide,
            } if !(show.is_empty() && hide.is_empty()) => Some(SubmeshVisEvent {
                start_frame: *start_frame,
                end_frame: *end_frame,
                show: show.clone(),
                hide: hide.clone(),
            }),
            _ => None,
        })
        .collect()
}

fn clip_anm_path(clip: &indexmap::IndexMap<u32, BinValue>) -> Option<String> {
    let res = clip.get(&fnv1a("mAnimationResourceData"))?;
    let f = fields(res)?;
    as_string(f.get(&fnv1a("mAnimationFilePath")))
}

/// `AtomicClipData`'s clip-window start. Real bins spell this `startFrame` with
/// no `m` prefix (19 uses); the prefixed form is probed too.
fn clip_start_frame(clip: &indexmap::IndexMap<u32, BinValue>) -> Option<f32> {
    as_f32(first_of(clip, &["startFrame", "mStartFrame"]))
}

/// `AtomicClipData`'s clip-window end. Real bins spell this `EndFrame` with a
/// capital `E` and no prefix (9 uses); the prefixed form is probed too.
fn clip_end_frame(clip: &indexmap::IndexMap<u32, BinValue>) -> Option<f32> {
    as_f32(first_of(clip, &["EndFrame", "mEndFrame", "endFrame"]))
}

fn clip_flags(clip: &indexmap::IndexMap<u32, BinValue>) -> u32 {
    as_u32(clip.get(&fnv1a("mFlags"))).unwrap_or(0)
}

fn clip_loops(clip: &indexmap::IndexMap<u32, BinValue>) -> bool {
    (clip_flags(clip) & CLIP_FLAG_LOOP) != 0
}

/// The pair-list field name a clip class uses, if any.
///
/// Deliberately per-class: `ConditionFloatClipData` does NOT reuse the
/// parametric list name, and `ConditionBoolClipData` has no list at all.
fn pair_list_field(class: u32) -> Option<&'static str> {
    if class == fnv1a("SelectorClipData") {
        Some("mSelectorPairDataList")
    } else if class == fnv1a("ParametricClipData") {
        Some("mParametricPairDataList")
    } else if class == fnv1a("ConditionFloatClipData") {
        Some("mConditionFloatPairDataList")
    } else {
        None
    }
}

/// Read a selector / parametric / condition-float pair list.
fn parse_pairs(
    clip: &indexmap::IndexMap<u32, BinValue>,
    class: u32,
    clip_addr: &BinAddr,
) -> Vec<ClipPair> {
    let Some(field_name) = pair_list_field(class) else {
        return Vec::new();
    };
    let list_addr = clip_addr.field(field_name);
    let Some(BinValue::List { items, .. }) = clip.get(&fnv1a(field_name)) else {
        return Vec::new();
    };
    items
        .iter()
        .enumerate()
        .map(|(i, item)| {
            let pf = fields(item);
            ClipPair {
                clip_name: pf.and_then(|p| as_name(p.get(&fnv1a("mClipName")))),
                probability: pf.and_then(|p| as_f32(p.get(&fnv1a("mProbability")))),
                // `mValue` is f32 in most bins but also occurs as an embed or
                // pointer; a non-scalar simply reads as None.
                value: pf.and_then(|p| as_f32(p.get(&fnv1a("mValue")))),
                addr: list_addr.index(i),
            }
        })
        .collect()
}

/// Classify a clip by its class hash, reading class-specific payload.
fn clip_kind(class: u32, clip: &indexmap::IndexMap<u32, BinValue>) -> ClipKind {
    if class == fnv1a("AtomicClipData") {
        ClipKind::Atomic
    } else if class == fnv1a("SequencerClipData") {
        ClipKind::Sequencer
    } else if class == fnv1a("ParallelClipData") {
        ClipKind::Parallel
    } else if class == fnv1a("SelectorClipData") {
        ClipKind::Selector
    } else if class == fnv1a("ParametricClipData") {
        ClipKind::Parametric
    } else if class == fnv1a("ConditionFloatClipData") {
        ClipKind::ConditionFloat
    } else if class == fnv1a("ConditionBoolClipData") {
        ClipKind::ConditionBool {
            true_clip: as_name(clip.get(&fnv1a("mTrueConditionClipName"))),
            false_clip: as_name(clip.get(&fnv1a("mFalseConditionClipName"))),
        }
    } else {
        ClipKind::Unknown
    }
}

/// Every clip name this clip refers to, in play order, whatever its class:
/// `mClipNameList` (sequencer/parallel), the pair lists (selector / parametric /
/// condition-float), and the two condition-bool branches.
fn referenced_clip_names(
    clip: &indexmap::IndexMap<u32, BinValue>,
    class: u32,
) -> Vec<String> {
    let mut names = Vec::new();
    if let Some(BinValue::List { items, .. }) = clip.get(&fnv1a("mClipNameList")) {
        names.extend(items.iter().filter_map(|i| as_name(Some(i))));
    }
    if let Some(field_name) = pair_list_field(class) {
        if let Some(BinValue::List { items, .. }) = clip.get(&fnv1a(field_name)) {
            names.extend(
                items
                    .iter()
                    .filter_map(fields)
                    .filter_map(|p| as_name(p.get(&fnv1a("mClipName")))),
            );
        }
    }
    for branch in ["mTrueConditionClipName", "mFalseConditionClipName"] {
        if let Some(n) = as_name(clip.get(&fnv1a(branch))) {
            names.push(n);
        }
    }
    names
}

/// The clip map keys can be resolved names or hashes; when it's a hash, use the
/// `.anm` filename stem as a readable display name.
fn clip_display_name(key: &str, anm_path: Option<&str>) -> String {
    if !(key.starts_with("0x") && key.len() >= 3) {
        return key.to_string();
    }
    if let Some(p) = anm_path {
        let base = p.replace('\\', "/");
        if let Some(name) = base.rsplit('/').next() {
            let stem = name.trim_end_matches(".anm").trim_end_matches(".ANM");
            if !stem.is_empty() {
                return stem.to_string();
            }
        }
    }
    key.to_string()
}

/// A clip-map keyed by BOTH its original key and the key's fnv1a hash form, so a
/// `mClipNameList` reference (name or hash) can find either.
///
/// Each entry keeps its positional index in the map alongside the value, so a
/// member resolved through here can still be addressed (see [`BinAddr`]).
struct ClipMap<'a> {
    by_key: HashMap<String, (usize, &'a BinValue)>,
}

impl<'a> ClipMap<'a> {
    fn from(map: &'a BinValue) -> Option<Self> {
        let BinValue::Map { entries, .. } = map else { return None };
        let mut by_key = HashMap::new();
        for (i, (k, v)) in entries.iter().enumerate() {
            // Map keys are usually Hash or String.
            let Some(key) = key_name(k) else { continue };
            by_key.insert(key.to_lowercase(), (i, v));
            // Also index a string key by its hash form so a hash reference finds it.
            if let BinValue::String(s) = k {
                by_key.entry(format!("0x{:08x}", fnv1a(s))).or_insert((i, v));
            }
        }
        Some(ClipMap { by_key })
    }

    /// The map entry for a reference, as `(positional index, value)`.
    fn get(&self, name: &str) -> Option<(usize, &'a BinValue)> {
        self.by_key
            .get(&name.to_lowercase())
            .copied()
            .or_else(|| self.by_key.get(&format!("0x{:08x}", fnv1a(name))).copied())
    }
}

/// Resolve a composite clip's referenced clips into ordered playable members.
///
/// Follows every reference shape, not just `mClipNameList`: selector /
/// parametric / condition-float pair lists and both condition-bool branches all
/// name clips that a viewer must be able to reach. Flattens nested composites;
/// depth-capped; `seen` stops self-reference.
///
/// `map_addr` addresses the owning `mClipDataMap`, so each member's address is
/// `map_addr / <its own position in the map>` - members are addressed where they
/// really live, not under the clip that referenced them.
fn resolve_members(
    clip: &indexmap::IndexMap<u32, BinValue>,
    class: u32,
    map: &ClipMap,
    map_addr: &BinAddr,
    seen: &mut HashSet<String>,
    depth: u32,
) -> Vec<ClipMember> {
    if depth > 4 {
        return Vec::new();
    }
    let mut out = Vec::new();
    for name in referenced_clip_names(clip, class) {
        let low = name.to_lowercase();
        if seen.contains(&low) {
            continue;
        }
        seen.insert(low);
        let Some((idx, member)) = map.get(&name) else { continue };
        let Some(mf) = fields(member) else { continue };
        let member_class = class_of(member).unwrap_or(0);
        let addr = map_addr.index(idx);
        if let Some(anm) = clip_anm_path(mf) {
            let all_events = parse_all_events(mf, &addr);
            out.push(ClipMember {
                name: clip_display_name(&name, Some(&anm)),
                anm_path: anm,
                events: submesh_events(&all_events),
                loops: clip_loops(mf),
                kind: clip_kind(member_class, mf),
                class_hash: member_class,
                flags: clip_flags(mf),
                track_data_name: as_name(mf.get(&fnv1a("mTrackDataName"))),
                mask_data_name: as_name(mf.get(&fnv1a("mMaskDataName"))),
                start_frame: clip_start_frame(mf),
                end_frame: clip_end_frame(mf),
                all_events,
                addr,
            });
        } else {
            out.extend(resolve_members(
                mf,
                member_class,
                map,
                map_addr,
                seen,
                depth + 1,
            ));
        }
    }
    out
}

/// The animationGraphData link target reachable from ANY SkinCharacterDataProperties
/// in the merged bins. Champion data bins hold one SCDP per skin and some skins
/// (base especially) may omit `skinAnimationProperties`, so we must scan every
/// SCDP rather than bail on the first that lacks the field.
fn find_graph_entry(entries: &HashMap<u32, &BinEntry>) -> Option<u32> {
    find_graph_entry_for(entries, None)
}

/// Like `find_graph_entry` but, when `skin_data_hash` is given, prefers the SCDP
/// whose own path-hash matches that skin (so Akali skin01 uses its graph, not
/// base's). Falls back to the first SCDP that carries a graph link.
fn find_graph_entry_for(entries: &HashMap<u32, &BinEntry>, skin_data_hash: Option<u32>) -> Option<u32> {
    let scdp_class = fnv1a("SkinCharacterDataProperties");
    let graph_of = |entry: &BinEntry| -> Option<u32> {
        let sap = entry.fields.get(&fnv1a("skinAnimationProperties"))?;
        let f = fields(sap)?;
        link_hash(f.get(&fnv1a("animationGraphData")))
    };
    // Preferred: the SCDP for the previewed skin, if it links a graph.
    if let Some(want) = skin_data_hash {
        if let Some(entry) = entries.get(&want) {
            if entry.class_hash == scdp_class {
                if let Some(h) = graph_of(entry) {
                    return Some(h);
                }
            }
        }
    }
    // Otherwise any SCDP that carries a graph link.
    for entry in entries.values() {
        if entry.class_hash != scdp_class {
            continue;
        }
        if let Some(h) = graph_of(entry) {
            return Some(h);
        }
    }
    None
}

/// Resolve all clips (with events + sequencer members) from the merged bins'
/// AnimationGraphData. Empty when no graph is referenced / present.
pub fn resolve_clip_graph(bins: &[Bin]) -> Vec<ClipInfo> {
    // Merge entries by path-hash (first wins), KEEPING each winner's origin so
    // addresses point at the bin the graph actually lives in. A skin's graph is
    // frequently in a separate `animations/skinN.bin`, so the graph entry's bin
    // index is often not 0 and must not be assumed.
    let mut merged: HashMap<u32, &BinEntry> = HashMap::new();
    let mut origin: HashMap<u32, (usize, usize)> = HashMap::new();
    for (bin_idx, bin) in bins.iter().enumerate() {
        for (entry_idx, entry) in bin.entries.iter().enumerate() {
            if merged.contains_key(&entry.path_hash) {
                continue;
            }
            merged.insert(entry.path_hash, entry);
            origin.insert(entry.path_hash, (bin_idx, entry_idx));
        }
    }

    let Some(graph_hash) = find_graph_entry(&merged) else {
        return Vec::new();
    };
    let Some(graph) = merged.get(&graph_hash) else {
        return Vec::new();
    };
    let Some(&(bin_idx, entry_idx)) = origin.get(&graph_hash) else {
        return Vec::new();
    };
    let Some(clip_map_val) = graph.fields.get(&fnv1a("mClipDataMap")) else {
        return Vec::new();
    };
    let Some(clip_map) = ClipMap::from(clip_map_val) else {
        return Vec::new();
    };
    let BinValue::Map { entries, .. } = clip_map_val else {
        return Vec::new();
    };

    let map_addr = BinAddr::root(bin_idx, entry_idx).field("mClipDataMap");

    let mut clips = Vec::new();
    for (i, (k, v)) in entries.iter().enumerate() {
        let Some(key) = key_name(k) else { continue };
        let Some(cf) = fields(v) else { continue };
        let class = class_of(v).unwrap_or(0);
        let addr = map_addr.index(i);

        let direct = clip_anm_path(cf);
        let members = if direct.is_some() {
            Vec::new()
        } else {
            resolve_members(cf, class, &clip_map, &map_addr, &mut HashSet::new(), 0)
        };
        let anm_path = direct.or_else(|| members.first().map(|m| m.anm_path.clone()));
        let all_events = parse_all_events(cf, &addr);
        // Gate on ALL events, not just submesh ones: a clip whose only events are
        // sound / particle / face-target is still a real clip and must survive.
        if anm_path.is_none() && all_events.is_empty() {
            continue;
        }
        clips.push(ClipInfo {
            name: clip_display_name(&key, anm_path.as_deref()),
            anm_path,
            members,
            events: submesh_events(&all_events),
            loops: clip_loops(cf),
            kind: clip_kind(class, cf),
            class_hash: class,
            flags: clip_flags(cf),
            track_data_name: as_name(cf.get(&fnv1a("mTrackDataName"))),
            mask_data_name: as_name(cf.get(&fnv1a("mMaskDataName"))),
            start_frame: clip_start_frame(cf),
            end_frame: clip_end_frame(cf),
            pairs: parse_pairs(cf, class, &addr),
            all_events,
            addr,
        });
    }
    clips.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    clips
}

#[cfg(test)]
mod tests {
    use super::*;
    use indexmap::IndexMap;
    use ritoshark::bin::BinType;

    const GRAPH_HASH: u32 = 0xa11ce;

    // ---- builders -------------------------------------------------------

    /// An SCDP linking `GRAPH_HASH`, plus the graph entry holding `mClipDataMap`.
    /// The graph is the SECOND entry so tests also pin the entry index.
    fn bins_with_clips(entries: Vec<(BinValue, BinValue)>) -> Vec<Bin> {
        let mut sap_fields = IndexMap::new();
        sap_fields.insert(fnv1a("animationGraphData"), BinValue::Link(GRAPH_HASH));
        let mut scdp_fields = IndexMap::new();
        scdp_fields.insert(
            fnv1a("skinAnimationProperties"),
            BinValue::Embed {
                class: fnv1a("SkinAnimationProperties"),
                fields: sap_fields,
            },
        );
        let scdp = BinEntry {
            path_hash: 0x11,
            class_hash: fnv1a("SkinCharacterDataProperties"),
            fields: scdp_fields,
        };

        let mut graph_fields = IndexMap::new();
        graph_fields.insert(
            fnv1a("mClipDataMap"),
            BinValue::Map {
                key: BinType::Hash,
                value: BinType::Pointer,
                entries,
            },
        );
        let graph = BinEntry {
            path_hash: GRAPH_HASH,
            // Lowercase leading `a`: fnv1a lowercases, so this equals
            // fnv1a("AnimationGraphData").
            class_hash: fnv1a("animationGraphData"),
            fields: graph_fields,
        };

        vec![Bin {
            entries: vec![scdp, graph],
            ..Bin::new()
        }]
    }

    fn key(name: &str) -> BinValue {
        BinValue::String(name.to_string())
    }

    /// A clip pointer of `class` with the given fields.
    fn clip(class: &str, fields: Vec<(&str, BinValue)>) -> BinValue {
        let mut f = IndexMap::new();
        for (name, v) in fields {
            f.insert(fnv1a(name), v);
        }
        BinValue::Pointer {
            class: fnv1a(class),
            fields: f,
        }
    }

    /// `mAnimationResourceData.mAnimationFilePath = path`.
    fn anm(path: &str) -> (&'static str, BinValue) {
        let mut f = IndexMap::new();
        f.insert(
            fnv1a("mAnimationFilePath"),
            BinValue::String(path.to_string()),
        );
        (
            "mAnimationResourceData",
            BinValue::Embed {
                class: fnv1a("AnimationResourceData"),
                fields: f,
            },
        )
    }

    /// An `mEventDataMap` of `(key, event)` pairs.
    fn events(items: Vec<(&str, BinValue)>) -> (&'static str, BinValue) {
        (
            "mEventDataMap",
            BinValue::Map {
                key: BinType::Hash,
                value: BinType::Pointer,
                entries: items.into_iter().map(|(k, v)| (key(k), v)).collect(),
            },
        )
    }

    /// An event pointer of `class` with the given fields.
    fn event(class: &str, fields: Vec<(&str, BinValue)>) -> BinValue {
        clip(class, fields)
    }

    fn list_of(item: BinType, items: Vec<BinValue>) -> BinValue {
        BinValue::List {
            is_list2: false,
            item,
            items,
        }
    }

    fn str_list(names: &[&str]) -> BinValue {
        list_of(
            BinType::String,
            names.iter().map(|n| key(n)).collect(),
        )
    }

    /// A `list[embed]` of pair structs.
    fn embed_list(class: &str, rows: Vec<Vec<(&str, BinValue)>>) -> BinValue {
        list_of(
            BinType::Embed,
            rows.into_iter()
                .map(|fields| {
                    let mut f = IndexMap::new();
                    for (n, v) in fields {
                        f.insert(fnv1a(n), v);
                    }
                    BinValue::Embed {
                        class: fnv1a(class),
                        fields: f,
                    }
                })
                .collect(),
        )
    }

    fn by_name<'a>(clips: &'a [ClipInfo], name: &str) -> &'a ClipInfo {
        clips
            .iter()
            .find(|c| c.name == name)
            .unwrap_or_else(|| panic!("no clip named {name}; got {:?}", names(clips)))
    }

    fn names(clips: &[ClipInfo]) -> Vec<&str> {
        clips.iter().map(|c| c.name.as_str()).collect()
    }

    /// The single event on a clip, for the one-event-per-clip event tests.
    fn only_event(clips: &[ClipInfo], clip_name: &str) -> AnimEvent {
        let c = by_name(clips, clip_name);
        assert_eq!(c.all_events.len(), 1, "expected exactly one event");
        c.all_events[0].clone()
    }

    // ---- field-hash pinning ---------------------------------------------

    #[test]
    fn field_hashes_match_engine_values() {
        // Pinned so a change to the hash function is caught immediately.
        assert_eq!(fnv1a("mTrackDataName"), 0xd392_43c4);
        assert_eq!(fnv1a("mMaskDataName"), 0x0359_739b);

        // fnv1a lowercases, so leading-case spellings collide by design...
        assert_eq!(fnv1a("animationGraphData"), fnv1a("AnimationGraphData"));
        // ...but an `m` PREFIX is a different string and must not collide.
        assert_ne!(fnv1a("YRotationDegrees"), fnv1a("mYRotationDegrees"));
        assert_ne!(fnv1a("startFrame"), fnv1a("mStartFrame"));
        assert_ne!(fnv1a("EndFrame"), fnv1a("mEndFrame"));
        assert_ne!(fnv1a("JointName"), fnv1a("mJointName"));
        assert_ne!(fnv1a("BlendOutTime"), fnv1a("mBlendOutTime"));
    }

    // ---- clip kinds ------------------------------------------------------

    #[test]
    fn atomic_clip_reads_anm_flags_and_frames() {
        let clips = bins_with_clips(vec![(
            key("Idle1"),
            clip(
                "AtomicClipData",
                vec![
                    anm("ASSETS/Characters/Yone/Animations/idle1.anm"),
                    ("mFlags", BinValue::U32(2)),
                    // Un-prefixed spellings, as real AtomicClipData uses.
                    ("startFrame", BinValue::F32(2.0)),
                    ("EndFrame", BinValue::F32(10.0)),
                ],
            ),
        )]);
        let clips = resolve_clip_graph(&clips);
        let c = by_name(&clips, "Idle1");

        assert_eq!(c.kind, ClipKind::Atomic);
        assert_eq!(c.class_hash, fnv1a("AtomicClipData"));
        assert_eq!(
            c.anm_path.as_deref(),
            Some("ASSETS/Characters/Yone/Animations/idle1.anm")
        );
        assert!(c.loops, "mFlags bit 2 is LOOP");
        assert_eq!(c.flags, 2, "raw flags are preserved unmasked");
        assert_eq!(c.start_frame, Some(2.0));
        assert_eq!(c.end_frame, Some(10.0));
    }

    #[test]
    fn atomic_clip_reads_prefixed_frame_spellings_too() {
        let clips = bins_with_clips(vec![(
            key("Idle1"),
            clip(
                "AtomicClipData",
                vec![
                    anm("a.anm"),
                    ("mStartFrame", BinValue::F32(3.0)),
                    ("mEndFrame", BinValue::F32(9.0)),
                ],
            ),
        )]);
        let clips = resolve_clip_graph(&clips);
        let c = by_name(&clips, "Idle1");
        assert_eq!(c.start_frame, Some(3.0));
        assert_eq!(c.end_frame, Some(9.0));
    }

    #[test]
    fn clip_exposes_track_and_mask_names() {
        // A hex-keyed clip: the map key is an unresolved hash, so the display
        // name falls back to the `.anm` stem.
        let stem_hash = 0x1234_5678u32;
        let clips = bins_with_clips(vec![(
            BinValue::Hash(stem_hash),
            clip(
                "AtomicClipData",
                vec![
                    anm("ASSETS/Characters/Yone/Animations/Spell1.anm"),
                    // Stored as hashes, the way real bins type these fields.
                    ("mTrackDataName", BinValue::Hash(fnv1a("Wind"))),
                    ("mMaskDataName", BinValue::Hash(fnv1a("UpperBody"))),
                ],
            ),
        )]);
        let clips = resolve_clip_graph(&clips);

        // Hex key -> named from the anm stem.
        let c = by_name(&clips, "Spell1");
        assert_eq!(
            c.track_data_name.as_deref(),
            Some(format!("0x{:08x}", fnv1a("Wind")).as_str())
        );
        assert_eq!(
            c.mask_data_name.as_deref(),
            Some(format!("0x{:08x}", fnv1a("UpperBody")).as_str())
        );
    }

    #[test]
    fn sequencer_clip_resolves_ordered_members() {
        let clips = bins_with_clips(vec![
            (
                key("RecallSeq"),
                clip(
                    "SequencerClipData",
                    vec![("mClipNameList", str_list(&["PartA", "PartB"]))],
                ),
            ),
            (key("PartA"), clip("AtomicClipData", vec![anm("a.anm")])),
            (key("PartB"), clip("AtomicClipData", vec![anm("b.anm")])),
        ]);
        let clips = resolve_clip_graph(&clips);
        let seq = by_name(&clips, "RecallSeq");

        assert_eq!(seq.kind, ClipKind::Sequencer);
        let got: Vec<&str> = seq.members.iter().map(|m| m.anm_path.as_str()).collect();
        assert_eq!(got, vec!["a.anm", "b.anm"], "order is load-bearing");
        // The sequencer inherits its first member's anm.
        assert_eq!(seq.anm_path.as_deref(), Some("a.anm"));
        assert_eq!(seq.members[0].kind, ClipKind::Atomic);
    }

    #[test]
    fn parallel_clip_resolves_members() {
        let clips = bins_with_clips(vec![
            (
                key("Par"),
                clip(
                    "ParallelClipData",
                    vec![("mClipNameList", str_list(&["PartA", "PartB"]))],
                ),
            ),
            (key("PartA"), clip("AtomicClipData", vec![anm("a.anm")])),
            (key("PartB"), clip("AtomicClipData", vec![anm("b.anm")])),
        ]);
        let clips = resolve_clip_graph(&clips);
        let par = by_name(&clips, "Par");

        assert_eq!(par.kind, ClipKind::Parallel);
        assert_eq!(par.members.len(), 2, "parallel uses the same list shape");
    }

    #[test]
    fn selector_clip_reads_pairs_and_members() {
        let clips = bins_with_clips(vec![
            (
                key("Sel"),
                clip(
                    "SelectorClipData",
                    vec![(
                        "mSelectorPairDataList",
                        embed_list(
                            "SelectorPairData",
                            vec![
                                vec![
                                    ("mClipName", BinValue::Hash(fnv1a("PartA"))),
                                    ("mProbability", BinValue::F32(0.25)),
                                ],
                                vec![
                                    ("mClipName", BinValue::Hash(fnv1a("PartB"))),
                                    ("mProbability", BinValue::F32(0.75)),
                                ],
                            ],
                        ),
                    )],
                ),
            ),
            (key("PartA"), clip("AtomicClipData", vec![anm("a.anm")])),
            (key("PartB"), clip("AtomicClipData", vec![anm("b.anm")])),
        ]);
        let clips = resolve_clip_graph(&clips);
        let sel = by_name(&clips, "Sel");

        assert_eq!(sel.kind, ClipKind::Selector);
        assert_eq!(sel.pairs.len(), 2);
        assert_eq!(sel.pairs[0].probability, Some(0.25));
        assert_eq!(sel.pairs[1].probability, Some(0.75));
        // Pair lists are followed, so a selector still exposes playable members.
        assert_eq!(sel.members.len(), 2);
    }

    #[test]
    fn parametric_clip_reads_pairs_and_members() {
        let clips = bins_with_clips(vec![
            (
                key("Param"),
                clip(
                    "ParametricClipData",
                    vec![(
                        "mParametricPairDataList",
                        embed_list(
                            "ParametricPairData",
                            vec![
                                vec![
                                    ("mClipName", BinValue::Hash(fnv1a("PartA"))),
                                    ("mValue", BinValue::F32(0.0)),
                                ],
                                vec![
                                    ("mClipName", BinValue::Hash(fnv1a("PartB"))),
                                    ("mValue", BinValue::F32(1.0)),
                                ],
                            ],
                        ),
                    )],
                ),
            ),
            (key("PartA"), clip("AtomicClipData", vec![anm("a.anm")])),
            (key("PartB"), clip("AtomicClipData", vec![anm("b.anm")])),
        ]);
        let clips = resolve_clip_graph(&clips);
        let p = by_name(&clips, "Param");

        assert_eq!(p.kind, ClipKind::Parametric);
        assert_eq!(p.pairs.len(), 2);
        assert_eq!(p.pairs[0].value, Some(0.0));
        assert_eq!(p.pairs[1].value, Some(1.0));
        assert_eq!(p.members.len(), 2);
    }

    #[test]
    fn condition_float_clip_uses_its_own_pair_list_name() {
        let clips = bins_with_clips(vec![
            (
                key("CondF"),
                clip(
                    "ConditionFloatClipData",
                    vec![
                        (
                            "mConditionFloatPairDataList",
                            embed_list(
                                "ConditionFloatPairData",
                                vec![vec![
                                    ("mClipName", BinValue::Hash(fnv1a("PartA"))),
                                    ("mValue", BinValue::F32(0.5)),
                                ]],
                            ),
                        ),
                        // The Updater is intentionally unmodelled; it must not
                        // prevent the clip from parsing.
                        (
                            "Updater",
                            clip("LogicDriverFloatParametricUpdater", vec![]),
                        ),
                    ],
                ),
            ),
            (key("PartA"), clip("AtomicClipData", vec![anm("a.anm")])),
        ]);
        let clips = resolve_clip_graph(&clips);
        let c = by_name(&clips, "CondF");

        assert_eq!(c.kind, ClipKind::ConditionFloat);
        assert_eq!(c.pairs.len(), 1, "reads mConditionFloatPairDataList");
        assert_eq!(c.pairs[0].value, Some(0.5));
        assert_eq!(c.members.len(), 1);
    }

    #[test]
    fn condition_float_ignores_parametric_list_name() {
        // Guard against regressing to the shared/parametric spelling.
        let clips = bins_with_clips(vec![(
            key("CondF"),
            clip(
                "ConditionFloatClipData",
                vec![
                    (
                        "mParametricPairDataList",
                        embed_list(
                            "ParametricPairData",
                            vec![vec![("mClipName", BinValue::Hash(fnv1a("PartA")))]],
                        ),
                    ),
                    // Give it an event so it survives the discard gate.
                    events(vec![("s", event("SoundEventData", vec![]))]),
                ],
            ),
        )]);
        let clips = resolve_clip_graph(&clips);
        let c = by_name(&clips, "CondF");
        assert!(
            c.pairs.is_empty(),
            "ConditionFloatClipData must not read the parametric list name"
        );
    }

    #[test]
    fn condition_bool_clip_reads_branches_and_has_no_pairs() {
        let clips = bins_with_clips(vec![
            (
                key("CondB"),
                clip(
                    "ConditionBoolClipData",
                    vec![
                        ("mTrueConditionClipName", BinValue::Hash(fnv1a("PartA"))),
                        ("mFalseConditionClipName", BinValue::Hash(fnv1a("PartB"))),
                        ("Updater", clip("LogicDriverBoolParametricUpdater", vec![])),
                    ],
                ),
            ),
            (key("PartA"), clip("AtomicClipData", vec![anm("a.anm")])),
            (key("PartB"), clip("AtomicClipData", vec![anm("b.anm")])),
        ]);
        let clips = resolve_clip_graph(&clips);
        let c = by_name(&clips, "CondB");

        let want_true = format!("0x{:08x}", fnv1a("PartA"));
        let want_false = format!("0x{:08x}", fnv1a("PartB"));
        assert_eq!(
            c.kind,
            ClipKind::ConditionBool {
                true_clip: Some(want_true),
                false_clip: Some(want_false),
            }
        );
        assert!(c.pairs.is_empty(), "this class has no pair list at all");
        // Both branches are followed as members.
        assert_eq!(c.members.len(), 2);
    }

    #[test]
    fn unknown_clip_class_is_preserved() {
        // `BlendableClipData` does not occur in any real bin, so it is the
        // canonical stand-in for "a class we do not model".
        let clips = bins_with_clips(vec![(
            key("Blendy"),
            clip(
                "BlendableClipData",
                vec![
                    anm("blend.anm"),
                    ("mSomeUnmodelledField", BinValue::U32(7)),
                ],
            ),
        )]);
        let clips = resolve_clip_graph(&clips);
        let c = by_name(&clips, "Blendy");

        assert_eq!(c.kind, ClipKind::Unknown, "unmodelled class, not dropped");
        assert_eq!(
            c.class_hash,
            fnv1a("BlendableClipData"),
            "class hash is preserved so a write path can identify it"
        );
        assert_eq!(c.anm_path.as_deref(), Some("blend.anm"));
    }

    // ---- event kinds -----------------------------------------------------

    #[test]
    fn particle_event_reads_pairs_not_a_bone_of_its_own() {
        let clips = bins_with_clips(vec![(
            key("Idle1"),
            clip(
                "AtomicClipData",
                vec![
                    anm("a.anm"),
                    events(vec![(
                        "p",
                        event(
                            "ParticleEventData",
                            vec![
                                ("mEffectKey", BinValue::Hash(fnv1a("Yone_Recall"))),
                                ("mStartFrame", BinValue::F32(11.0)),
                                ("mIsLoop", BinValue::Bool(true)),
                                (
                                    "mParticleEventDataPairList",
                                    embed_list(
                                        "ParticleEventDataPair",
                                        vec![
                                            vec![(
                                                "mBoneName",
                                                BinValue::Hash(fnv1a("C_Head")),
                                            )],
                                            vec![
                                                (
                                                    "mBoneName",
                                                    BinValue::Hash(fnv1a("Root")),
                                                ),
                                                (
                                                    "mTargetBoneName",
                                                    BinValue::Hash(fnv1a("Weapon")),
                                                ),
                                            ],
                                        ],
                                    ),
                                ),
                            ],
                        ),
                    )]),
                ],
            ),
        )]);
        let clips = resolve_clip_graph(&clips);
        let e = only_event(&clips, "Idle1");

        assert_eq!(e.class_hash, fnv1a("ParticleEventData"));
        let AnimEventKind::Particle {
            effect_key,
            start_frame,
            is_loop,
            pairs,
        } = e.kind
        else {
            panic!("expected Particle, got {:?}", e.kind);
        };
        assert_eq!(
            effect_key.as_deref(),
            Some(format!("0x{:08x}", fnv1a("Yone_Recall")).as_str())
        );
        assert_eq!(start_frame, Some(11.0));
        assert_eq!(is_loop, Some(true));

        // The bone lives on the PAIR, never on the event itself.
        assert_eq!(pairs.len(), 2);
        assert_eq!(
            pairs[0].bone_name.as_deref(),
            Some(format!("0x{:08x}", fnv1a("C_Head")).as_str())
        );
        assert_eq!(pairs[0].target_bone_name, None);
        assert_eq!(
            pairs[1].target_bone_name.as_deref(),
            Some(format!("0x{:08x}", fnv1a("Weapon")).as_str())
        );

        // A pair has no name/hash, so only its address identifies it, and the
        // two pairs must have DIFFERENT addresses.
        assert_ne!(pairs[0].addr, pairs[1].addr);
        assert_eq!(*pairs[1].addr.steps.last().unwrap(), Step::Index { index: 1 });
    }

    #[test]
    fn sound_event_reads_name_and_loop() {
        let clips = bins_with_clips(vec![(
            key("Idle1"),
            clip(
                "AtomicClipData",
                vec![
                    anm("a.anm"),
                    events(vec![(
                        "s",
                        event(
                            "SoundEventData",
                            vec![
                                (
                                    "mSoundName",
                                    BinValue::String("Play_sfx_Yone".to_string()),
                                ),
                                ("mIsLoop", BinValue::Bool(false)),
                            ],
                        ),
                    )]),
                ],
            ),
        )]);
        let clips = resolve_clip_graph(&clips);
        let e = only_event(&clips, "Idle1");
        assert_eq!(
            e.kind,
            AnimEventKind::Sound {
                sound_name: Some("Play_sfx_Yone".to_string()),
                is_loop: Some(false),
            }
        );
    }

    #[test]
    fn submesh_visibility_event_feeds_both_views() {
        let clips = bins_with_clips(vec![(
            key("Idle1"),
            clip(
                "AtomicClipData",
                vec![
                    anm("a.anm"),
                    events(vec![(
                        "vis",
                        event(
                            "SubmeshVisibilityEventData",
                            vec![
                                ("mStartFrame", BinValue::F32(0.0)),
                                ("mEndFrame", BinValue::F32(30.0)),
                                ("mShowSubmeshList", str_list(&["Cape"])),
                                (
                                    "mHideSubmeshList",
                                    list_of(
                                        BinType::Hash,
                                        vec![BinValue::Hash(0xdead_beef)],
                                    ),
                                ),
                            ],
                        ),
                    )]),
                ],
            ),
        )]);
        let clips = resolve_clip_graph(&clips);
        let c = by_name(&clips, "Idle1");

        // Legacy submesh-only view still populated, unchanged in shape.
        assert_eq!(c.events.len(), 1);
        assert_eq!(c.events[0].show, vec!["Cape"]);
        assert_eq!(c.events[0].hide, vec!["0xdeadbeef"], "hash renders as hex");
        assert_eq!(c.events[0].start_frame, Some(0.0));
        assert_eq!(c.events[0].end_frame, Some(30.0));

        // And the typed view carries the same event.
        assert_eq!(c.all_events.len(), 1);
        assert!(matches!(
            c.all_events[0].kind,
            AnimEventKind::SubmeshVisibility { .. }
        ));
    }

    #[test]
    fn face_target_event_reads_unprefixed_rotation_and_tolerates_empty() {
        let clips = bins_with_clips(vec![
            (
                key("WithFields"),
                clip(
                    "AtomicClipData",
                    vec![
                        anm("a.anm"),
                        events(vec![(
                            "cam",
                            event(
                                "FaceTargetEventData",
                                vec![
                                    ("mEndFrame", BinValue::F32(260.0)),
                                    // No `m` prefix - the real spelling.
                                    ("YRotationDegrees", BinValue::F32(45.0)),
                                ],
                            ),
                        )]),
                    ],
                ),
            ),
            (
                key("Empty"),
                clip(
                    "AtomicClipData",
                    vec![
                        anm("b.anm"),
                        // `FaceTargetEventData {}` - most real instances.
                        events(vec![("cam", event("FaceTargetEventData", vec![]))]),
                    ],
                ),
            ),
        ]);
        let clips = resolve_clip_graph(&clips);

        assert_eq!(
            only_event(&clips, "WithFields").kind,
            AnimEventKind::FaceTarget {
                end_frame: Some(260.0),
                y_rotation_degrees: Some(45.0),
            }
        );
        assert_eq!(
            only_event(&clips, "Empty").kind,
            AnimEventKind::FaceTarget {
                end_frame: None,
                y_rotation_degrees: None,
            },
            "an entirely empty FaceTargetEventData is still an event"
        );
    }

    #[test]
    fn face_target_ignores_prefixed_rotation_spelling_collision() {
        // `mYRotationDegrees` hashes differently; if only it is present the
        // defensive fallback still reads it, but it must not be the same key.
        let clips = bins_with_clips(vec![(
            key("Idle1"),
            clip(
                "AtomicClipData",
                vec![
                    anm("a.anm"),
                    events(vec![(
                        "cam",
                        event(
                            "FaceTargetEventData",
                            vec![("mYRotationDegrees", BinValue::F32(90.0))],
                        ),
                    )]),
                ],
            ),
        )]);
        let clips = resolve_clip_graph(&clips);
        assert_eq!(
            only_event(&clips, "Idle1").kind,
            AnimEventKind::FaceTarget {
                end_frame: None,
                y_rotation_degrees: Some(90.0),
            }
        );
    }

    #[test]
    fn conform_to_path_event_has_only_mask_and_blend_times() {
        let clips = bins_with_clips(vec![(
            key("Idle1"),
            clip(
                "AtomicClipData",
                vec![
                    anm("a.anm"),
                    events(vec![(
                        "path",
                        event(
                            "ConformToPathEventData",
                            vec![
                                ("mMaskDataName", BinValue::Hash(fnv1a("Lower"))),
                                ("mBlendInTime", BinValue::F32(0.1)),
                                ("mBlendOutTime", BinValue::F32(0.25)),
                            ],
                        ),
                    )]),
                ],
            ),
        )]);
        let clips = resolve_clip_graph(&clips);
        assert_eq!(
            only_event(&clips, "Idle1").kind,
            AnimEventKind::ConformToPath {
                mask_data_name: Some(format!("0x{:08x}", fnv1a("Lower"))),
                blend_in_time: Some(0.1),
                blend_out_time: Some(0.25),
            }
        );
    }

    #[test]
    fn lock_root_orientation_event_mixes_prefixed_and_unprefixed() {
        let clips = bins_with_clips(vec![(
            key("Idle1"),
            clip(
                "AtomicClipData",
                vec![
                    anm("a.anm"),
                    events(vec![(
                        "lock",
                        event(
                            "LockRootOrientationEventData",
                            vec![
                                // Frames WITH the m prefix...
                                ("mStartFrame", BinValue::F32(8.0)),
                                ("mEndFrame", BinValue::F32(20.0)),
                                // ...the other two WITHOUT it.
                                ("JointName", BinValue::Hash(fnv1a("Root"))),
                                ("BlendOutTime", BinValue::F32(0.25)),
                            ],
                        ),
                    )]),
                ],
            ),
        )]);
        let clips = resolve_clip_graph(&clips);
        assert_eq!(
            only_event(&clips, "Idle1").kind,
            AnimEventKind::LockRootOrientation {
                start_frame: Some(8.0),
                end_frame: Some(20.0),
                joint_name: Some(format!("0x{:08x}", fnv1a("Root"))),
                blend_out_time: Some(0.25),
            }
        );
    }

    #[test]
    fn stop_animation_event_reads_name() {
        let clips = bins_with_clips(vec![(
            key("Idle1"),
            clip(
                "AtomicClipData",
                vec![
                    anm("a.anm"),
                    events(vec![(
                        "stop",
                        event(
                            "StopAnimationEventData",
                            vec![(
                                "mStopAnimationName",
                                BinValue::Hash(fnv1a("Recall")),
                            )],
                        ),
                    )]),
                ],
            ),
        )]);
        let clips = resolve_clip_graph(&clips);
        assert_eq!(
            only_event(&clips, "Idle1").kind,
            AnimEventKind::StopAnimation {
                stop_animation_name: Some(format!("0x{:08x}", fnv1a("Recall"))),
            }
        );
    }

    #[test]
    fn unknown_event_class_is_preserved() {
        // Both of these are real classes an earlier version silently dropped.
        let clips = bins_with_clips(vec![(
            key("Idle1"),
            clip(
                "AtomicClipData",
                vec![
                    anm("a.anm"),
                    events(vec![
                        (
                            "snap",
                            event(
                                "JointSnapEventData",
                                vec![(
                                    "mJointNameToOverride",
                                    BinValue::Hash(fnv1a("L_Foot")),
                                )],
                            ),
                        ),
                        (
                            "idle",
                            event("IdleParticlesVisibilityEventData", vec![]),
                        ),
                    ]),
                ],
            ),
        )]);
        let clips = resolve_clip_graph(&clips);
        let c = by_name(&clips, "Idle1");

        assert_eq!(c.all_events.len(), 2, "unknown events are kept, not dropped");
        assert_eq!(
            c.all_events[0].kind,
            AnimEventKind::Unknown {
                class_hash: fnv1a("JointSnapEventData")
            }
        );
        assert_eq!(
            c.all_events[1].kind,
            AnimEventKind::Unknown {
                class_hash: fnv1a("IdleParticlesVisibilityEventData")
            }
        );
        // Their keys survive too, so the UI can label them.
        assert_eq!(c.all_events[0].name, "snap");
        // ...but they are NOT submesh events.
        assert!(c.events.is_empty());
    }

    // ---- discard gate + addressing ---------------------------------------

    #[test]
    fn clip_with_only_non_submesh_events_is_kept() {
        // No anm and no submesh event: under the old gate this clip vanished.
        let clips = bins_with_clips(vec![(
            key("SoundOnly"),
            clip(
                "AtomicClipData",
                vec![events(vec![(
                    "s",
                    event(
                        "SoundEventData",
                        vec![("mSoundName", BinValue::String("Play_x".to_string()))],
                    ),
                )])],
            ),
        )]);
        let clips = resolve_clip_graph(&clips);

        assert_eq!(names(&clips), vec!["SoundOnly"]);
        let c = &clips[0];
        assert!(c.anm_path.is_none());
        assert!(c.events.is_empty(), "legacy submesh view stays empty");
        assert_eq!(c.all_events.len(), 1);
    }

    #[test]
    fn clip_with_nothing_at_all_is_still_discarded() {
        let clips = bins_with_clips(vec![(
            key("Nothing"),
            clip("AtomicClipData", vec![("mTickDuration", BinValue::F32(1.0))]),
        )]);
        assert!(resolve_clip_graph(&clips).is_empty());
    }

    #[test]
    fn addresses_point_at_the_bin_holding_the_graph() {
        // The graph lives in bins[1] (the `animations/skinN.bin` split case) and
        // is entry 0 there; bins[0] holds only the SCDP.
        let mut sap_fields = IndexMap::new();
        sap_fields.insert(fnv1a("animationGraphData"), BinValue::Link(GRAPH_HASH));
        let mut scdp_fields = IndexMap::new();
        scdp_fields.insert(
            fnv1a("skinAnimationProperties"),
            BinValue::Embed {
                class: fnv1a("SkinAnimationProperties"),
                fields: sap_fields,
            },
        );
        let skin_bin = Bin {
            entries: vec![BinEntry {
                path_hash: 0x11,
                class_hash: fnv1a("SkinCharacterDataProperties"),
                fields: scdp_fields,
            }],
            ..Bin::new()
        };

        let mut graph_fields = IndexMap::new();
        graph_fields.insert(
            fnv1a("mClipDataMap"),
            BinValue::Map {
                key: BinType::Hash,
                value: BinType::Pointer,
                entries: vec![
                    (key("First"), clip("AtomicClipData", vec![anm("a.anm")])),
                    (
                        key("Second"),
                        clip(
                            "AtomicClipData",
                            vec![
                                anm("b.anm"),
                                events(vec![(
                                    "p",
                                    event("ParticleEventData", vec![]),
                                )]),
                            ],
                        ),
                    ),
                ],
            },
        );
        let anim_bin = Bin {
            entries: vec![BinEntry {
                path_hash: GRAPH_HASH,
                class_hash: fnv1a("AnimationGraphData"),
                fields: graph_fields,
            }],
            ..Bin::new()
        };

        let clips = resolve_clip_graph(&[skin_bin, anim_bin]);

        let second = by_name(&clips, "Second");
        assert_eq!(second.addr.bin, 1, "graph lives in the second bin");
        assert_eq!(second.addr.entry, 0, "and is entry 0 of that bin");
        assert_eq!(
            second.addr.steps,
            vec![
                Step::Field {
                    field: fnv1a("mClipDataMap")
                },
                // Map hop is positional: "Second" is entry 1 of the map.
                Step::Index { index: 1 },
            ]
        );

        // The event address extends the clip's.
        let ev = &second.all_events[0];
        assert_eq!(
            ev.addr.steps,
            vec![
                Step::Field {
                    field: fnv1a("mClipDataMap")
                },
                Step::Index { index: 1 },
                Step::Field {
                    field: fnv1a("mEventDataMap")
                },
                Step::Index { index: 0 },
            ]
        );

        // Distinct clips get distinct addresses.
        assert_ne!(by_name(&clips, "First").addr, second.addr);

        // And the addr converts to the shared VfxPath wire shape.
        let p = second.addr.to_vfx_path();
        assert_eq!(p.bin, 1);
        assert_eq!(p.entry, 0);
        assert_eq!(p.steps, second.addr.steps);
    }

    #[test]
    fn member_addresses_point_where_the_member_really_lives() {
        // A sequencer's member is addressed at its OWN slot in mClipDataMap,
        // not nested under the sequencer that referenced it.
        let clips = bins_with_clips(vec![
            (
                key("Seq"),
                clip(
                    "SequencerClipData",
                    vec![("mClipNameList", str_list(&["PartA"]))],
                ),
            ),
            (key("PartA"), clip("AtomicClipData", vec![anm("a.anm")])),
        ]);
        let clips = resolve_clip_graph(&clips);
        let seq = by_name(&clips, "Seq");
        let member = &seq.members[0];

        assert_eq!(
            member.addr.steps,
            vec![
                Step::Field {
                    field: fnv1a("mClipDataMap")
                },
                // PartA is map entry 1, even though it is member 0 of Seq.
                Step::Index { index: 1 },
            ]
        );
        assert_eq!(member.addr, by_name(&clips, "PartA").addr);
    }

    #[test]
    fn addr_serializes_as_the_vfx_path_wire_shape() {
        let a = BinAddr::root(1, 3).field("mClipDataMap").index(2);
        let json = serde_json::to_value(&a).unwrap();
        assert_eq!(json["bin"], 1);
        assert_eq!(json["entry"], 3);
        assert_eq!(json["steps"][0]["field"], fnv1a("mClipDataMap"));
        assert_eq!(json["steps"][1]["index"], 2);
    }

    // ---- backward compatibility -----------------------------------------

    #[test]
    fn prepare_clips_maps_disk_paths_and_carries_new_fields() {
        let clips = bins_with_clips(vec![
            (
                key("Seq"),
                clip(
                    "SequencerClipData",
                    vec![("mClipNameList", str_list(&["PartA"]))],
                ),
            ),
            (
                key("PartA"),
                clip(
                    "AtomicClipData",
                    vec![
                        anm("ASSETS/a.anm"),
                        ("mFlags", BinValue::U32(2)),
                        ("mTrackDataName", BinValue::Hash(fnv1a("Wind"))),
                    ],
                ),
            ),
            // Never resolves on disk -> dropped by prepare_clips.
            (key("Gone"), clip("AtomicClipData", vec![anm("ASSETS/missing.anm")])),
        ]);
        let resolved = resolve_clip_graph(&clips);
        let prepared = prepare_clips(resolved, |asset| {
            (asset != "ASSETS/missing.anm").then(|| format!("C:/out/{asset}"))
        });

        let names: Vec<&str> = prepared.iter().map(|c| c.name.as_str()).collect();
        assert!(!names.contains(&"Gone"), "unresolvable clips are dropped");

        let part = prepared.iter().find(|c| c.name == "PartA").unwrap();
        assert_eq!(part.anm_path.as_deref(), Some("C:/out/ASSETS/a.anm"));
        // Legacy fields intact...
        assert!(part.loops);
        assert!(part.events.is_empty());
        // ...and the new ones carried through.
        assert_eq!(part.kind, ClipKind::Atomic);
        assert_eq!(part.flags, 2);
        assert_eq!(
            part.track_data_name.as_deref(),
            Some(format!("0x{:08x}", fnv1a("Wind")).as_str())
        );
        assert_eq!(part.addr.bin, 0);

        // Members carry the new fields too.
        let seq = prepared.iter().find(|c| c.name == "Seq").unwrap();
        assert_eq!(seq.members.len(), 1);
        assert_eq!(seq.members[0].anm_path, "C:/out/ASSETS/a.anm");
        assert_eq!(seq.members[0].kind, ClipKind::Atomic);
    }

    #[test]
    fn json_keeps_the_legacy_clip_fields() {
        // The TS `PreparedClip` reads these five; new fields are purely additive.
        let clips = bins_with_clips(vec![(
            key("Idle1"),
            clip("AtomicClipData", vec![anm("ASSETS/a.anm")]),
        )]);
        let prepared = prepare_clips(resolve_clip_graph(&clips), |a| Some(a.to_string()));
        let json = serde_json::to_value(&prepared[0]).unwrap();

        for field in ["name", "anmPath", "members", "events", "loops"] {
            assert!(json.get(field).is_some(), "missing legacy field {field}");
        }
        // camelCase is preserved for the additive fields as well.
        for field in ["kind", "classHash", "flags", "allEvents", "addr"] {
            assert!(json.get(field).is_some(), "missing new field {field}");
        }
    }

    #[test]
    fn no_graph_link_yields_no_clips() {
        assert!(resolve_clip_graph(&[]).is_empty());
        assert!(resolve_clip_graph(&[Bin::new()]).is_empty());
    }
}
