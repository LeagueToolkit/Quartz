/* Animation-page projection — the read layer's three pieces (clip graph, blend
masks, tracks) plus the skeleton those masks index into, gathered from ONE
session into the single model the UI renders.

Everything here is already built and byte-verified elsewhere; this module only
composes it and cross-checks the references between the pieces:

  anim_graph::resolve_clip_graph  -> clips  (each clip may name a mask / a track)
  anm::masks::read_masks          -> masks  (weights indexed BY JOINT INDEX)
  anm::masks::read_tracks         -> tracks
  anm::skeleton_link              -> the `.skl` those weights apply to

WHY THE WARNINGS EXIST
The legacy page computed exactly these three checks and then dropped them on the
floor, so a clip pointing at a mask name that no longer exists in
`mMaskDataMap` looked identical to a healthy clip. Every one of them is a real
authoring mistake the user can only fix if they are told:

  - a clip names a mask that no `mMaskDataMap` entry provides,
  - a clip names a track that no `mTrackDataMap` entry provides,
  - a mask's weight count disagrees with the skeleton's joint count. This one
    reuses `pair_weights`' own message verbatim rather than inventing a second
    wording for the same defect (see `skeleton_link`: a mismatch corrupts the
    mask on save, which is why it is surfaced instead of silently padded).

Matching is CASE-INSENSITIVE, and a clip's `mask_data_name` may arrive as a
resolved string OR as `0x{h:08x}` when the hash DB could not name it; map keys
land in the same two forms (see `masks::key_name`), so a hash-form reference is
also matched against the fnv1a of a named key and vice versa. Without that, an
unresolved hash on either side would warn about a mask that is plainly there.

Pure read: nothing in this module mutates a bin. */

use std::collections::HashSet;
use std::path::Path;

use ritoshark::bin::{Bin, BinEntry, BinValue};
use ritoshark::hash::fnv1a;
use serde::Serialize;

use super::masks::{read_masks, read_tracks, MaskData, TrackData};
use super::skeleton_link::{pair_weights, skeleton_for_graph, SkeletonLink};
use crate::anim_graph::{resolve_clip_graph, ClipInfo};
use crate::error::Result;
use crate::vfx_session::resolve::project_root_for;
use crate::skeleton::read_skeleton_file;
use crate::vfx_session::session::{self, SessionId, VfxSession};

/// Everything the animation page reads out of one session, plus the non-fatal
/// problems worth showing the user.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnmModel {
    pub clips: Vec<ClipInfo>,
    pub masks: Vec<MaskData>,
    pub tracks: Vec<TrackData>,
    pub skeleton: Option<SkeletonLink>,
    /// Non-fatal problems worth showing the user: dangling mask/track
    /// references and mask/skeleton length mismatches.
    pub warnings: Vec<String>,
}

fn fields(value: &BinValue) -> Option<&indexmap::IndexMap<u32, BinValue>> {
    match value {
        BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => Some(fields),
        _ => None,
    }
}

/// Mirrors `anim_graph::link_hash` / `masks::link_hash`.
fn link_hash(value: Option<&BinValue>) -> Option<u32> {
    match value? {
        BinValue::Link(h) | BinValue::Hash(h) => Some(*h),
        BinValue::String(s) => Some(fnv1a(s)),
        _ => None,
    }
}

/* The animation graph's path-hash, reached the only correct way: through a
`SkinCharacterDataProperties`' `skinAnimationProperties.animationGraphData`.
Both `anim_graph` and `masks` keep their own private copy of this walk; this is
a third because `skeleton_for_graph` takes the hash as an argument and neither
of those exposes it. Do NOT replace it with "the first AnimationGraphData entry
in the bins" - a multi-skin bin set holds several and the first is the wrong
one (see `skeleton_link`'s header). */
pub(crate) fn graph_hash(bins: &[Bin]) -> Option<u32> {
    let scdp_class = fnv1a("SkinCharacterDataProperties");
    let mut seen: HashSet<u32> = HashSet::new();
    let graph_of = |entry: &BinEntry| -> Option<u32> {
        let sap = entry.fields.get(&fnv1a("skinAnimationProperties"))?;
        link_hash(fields(sap)?.get(&fnv1a("animationGraphData")))
    };
    for bin in bins {
        for entry in &bin.entries {
            // First entry wins per path-hash, matching the merge convention the
            // sibling readers use.
            if !seen.insert(entry.path_hash) {
                continue;
            }
            if entry.class_hash != scdp_class {
                continue;
            }
            if let Some(h) = graph_of(entry) {
                return Some(h);
            }
        }
    }
    None
}

/// A name reference normalised for matching: lowercased, and additionally
/// indexed by its hash form so a `0x{h:08x}` reference finds a named key.
fn name_keys(name: &str) -> [String; 2] {
    let lower = name.to_lowercase();
    let hashed = format!("0x{:08x}", fnv1a(name));
    [lower, hashed]
}

/// Index a set of map-key names by BOTH their lowercase text and their hash
/// form, so either spelling of a reference resolves.
fn name_index<'a>(names: impl Iterator<Item = &'a str>) -> HashSet<String> {
    let mut out = HashSet::new();
    for name in names {
        for key in name_keys(name) {
            out.insert(key);
        }
    }
    out
}

/// True when `reference` names something in `index` under either spelling.
fn resolves(index: &HashSet<String>, reference: &str) -> bool {
    name_keys(reference).iter().any(|k| index.contains(k))
}

/// The clip-level mask/track reference checks. Each clip is reported once per
/// missing reference; members are checked too, since a sequencer's members
/// carry their own `mMaskDataName` / `mTrackDataName`.
fn reference_warnings(clips: &[ClipInfo], masks: &[MaskData], tracks: &[TrackData]) -> Vec<String> {
    let mask_index = name_index(masks.iter().map(|m| m.name.as_str()));
    let track_index = name_index(tracks.iter().map(|t| t.name.as_str()));

    let mut out = Vec::new();
    let mut check = |clip_name: &str, mask: Option<&String>, track: Option<&String>| {
        if let Some(m) = mask.filter(|m| !resolves(&mask_index, m)) {
            out.push(format!(
                "Clip \"{clip_name}\" uses mask \"{m}\", which this animation graph does not define."
            ));
        }
        if let Some(t) = track.filter(|t| !resolves(&track_index, t)) {
            out.push(format!(
                "Clip \"{clip_name}\" uses track \"{t}\", which this animation graph does not define."
            ));
        }
    };

    for clip in clips {
        check(
            &clip.name,
            clip.mask_data_name.as_ref(),
            clip.track_data_name.as_ref(),
        );
        for member in &clip.members {
            check(
                &member.name,
                member.mask_data_name.as_ref(),
                member.track_data_name.as_ref(),
            );
        }
    }
    out
}

/* Mask-length warnings, only when a skeleton actually resolved on disk.
Without joints there is nothing to compare against, and guessing a joint count
would produce a warning that is wrong more often than it is right. The wording
comes straight from `pair_weights` so the mask editor and this page never
describe the same defect two different ways. */
fn skeleton_warnings(masks: &[MaskData], skeleton: Option<&SkeletonLink>) -> Vec<String> {
    let Some(path) = skeleton.and_then(|s| s.skl_path.as_ref()) else {
        return Vec::new();
    };
    let Ok(info) = read_skeleton_file(path) else {
        return Vec::new();
    };
    masks
        .iter()
        .filter_map(|mask| {
            let (_, warning) = pair_weights(&info.joints, &mask.weights);
            warning.map(|w| format!("Mask \"{}\": {w}", mask.name))
        })
        .collect()
}

/// Project a session's resident bins into the animation-page model.
///
/// Mirrors `vfx_session::project::project`: a thin wrapper that walks
/// `session.bins` (the animation bin is already resident among them) and hands
/// the trees to [`project_bins`].
///
/// The read layer's three entry points all take `&[Bin]`, so the resident trees
/// are cloned into a contiguous slice here. That is a per-call cost paid only
/// on an explicit animation-page read, never on the VFX edit path.
pub fn project_anm(session: &VfxSession) -> AnmModel {
    let bins: Vec<Bin> = session.bins.iter().map(|lb| lb.tree.clone()).collect();
    // The skeleton is anchored on the MAIN bin's project root - the same root
    // the linked-bin resolver used to find these bins in the first place.
    let root = session.bins.first().and_then(|lb| project_root_for(&lb.path));
    project_bins(&bins, root.as_deref())
}

/// The projection proper, on plain trees so tests can drive it without a
/// session registry. `project_root` anchors the skeleton lookup; `None` (or a
/// root that ships no `.skl`) simply yields no skeleton and no length warnings.
fn project_bins(bins: &[Bin], project_root: Option<&Path>) -> AnmModel {
    let clips = resolve_clip_graph(bins);
    let masks = read_masks(bins);
    let tracks = read_tracks(bins);

    let skeleton = project_root
        .zip(graph_hash(bins))
        .and_then(|(root, h)| skeleton_for_graph(bins, root, h));

    let mut warnings = reference_warnings(&clips, &masks, &tracks);
    warnings.extend(skeleton_warnings(&masks, skeleton.as_ref()));

    AnmModel {
        clips,
        masks,
        tracks,
        skeleton,
        warnings,
    }
}

/// Project the animation model for a registered session id.
pub fn anm_model_of(id: SessionId) -> Result<AnmModel> {
    session::with_session(id, |s| project_anm(s))
}

#[cfg(test)]
mod tests {
    use super::*;
    use indexmap::IndexMap;
    use ritoshark::bin::BinType;

    const GRAPH_HASH_NAME: &str = "Characters/Yone/Animations/Skin74";

    /// Project synthetic bins with no project root, so the skeleton never
    /// resolves and only the reference warnings are exercised.
    fn project(bins: &[Bin]) -> AnmModel {
        project_bins(bins, None)
    }

    // ---- fixtures -------------------------------------------------------

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

    fn map_of(value: BinType, entries: Vec<(BinValue, BinValue)>) -> BinValue {
        BinValue::Map {
            key: BinType::Hash,
            value,
            entries,
        }
    }

    /// `mAnimationResourceData.mAnimationFilePath = path`.
    fn anm(path: &str) -> (&'static str, BinValue) {
        (
            "mAnimationResourceData",
            embed(
                "AnimationResourceData",
                vec![("mAnimationFilePath", BinValue::String(path.to_string()))],
            ),
        )
    }

    fn mask(weights: &[f32]) -> BinValue {
        embed(
            "MaskData",
            vec![(
                "mWeightList",
                BinValue::List {
                    is_list2: false,
                    item: BinType::F32,
                    items: weights.iter().map(|w| BinValue::F32(*w)).collect(),
                },
            )],
        )
    }

    fn track(priority: u8) -> BinValue {
        embed("TrackData", vec![("mPriority", BinValue::U8(priority))])
    }

    /// One bin holding an SCDP that links a graph entry carrying `maps`.
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
                        vec![(
                            "animationGraphData",
                            BinValue::Link(fnv1a(GRAPH_HASH_NAME)),
                        )],
                    ),
                );
                f
            },
        };
        let graph = BinEntry {
            path_hash: fnv1a(GRAPH_HASH_NAME),
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

    /// A graph with one clip, one mask and one track, where the clip's mask /
    /// track references are whatever the caller passes.
    fn bins_with_clip(mask_ref: Option<&str>, track_ref: Option<&str>) -> Vec<Bin> {
        let mut clip_fields = vec![anm("ASSETS/Characters/Yone/Animations/idle1.anm")];
        if let Some(m) = mask_ref {
            clip_fields.push(("mMaskDataName", BinValue::String(m.to_string())));
        }
        if let Some(t) = track_ref {
            clip_fields.push(("mTrackDataName", BinValue::String(t.to_string())));
        }
        bins_with(vec![
            (
                "mClipDataMap",
                map_of(
                    BinType::Pointer,
                    vec![(
                        BinValue::String("Idle1".into()),
                        pointer("AtomicClipData", clip_fields),
                    )],
                ),
            ),
            (
                "mMaskDataMap",
                map_of(
                    BinType::Embed,
                    vec![(BinValue::String("UpperBody".into()), mask(&[0.0, 1.0, 0.5]))],
                ),
            ),
            (
                "mTrackDataMap",
                map_of(
                    BinType::Embed,
                    vec![(BinValue::String("Wind".into()), track(3))],
                ),
            ),
        ])
    }

    // ---- tests -----------------------------------------------------------

    #[test]
    fn projects_clips_masks_tracks_together() {
        let model = project(&bins_with_clip(Some("UpperBody"), Some("Wind")));

        assert_eq!(model.clips.len(), 1);
        assert_eq!(model.clips[0].name, "Idle1");
        assert_eq!(
            model.clips[0].anm_path.as_deref(),
            Some("ASSETS/Characters/Yone/Animations/idle1.anm")
        );
        assert_eq!(model.masks.len(), 1);
        assert_eq!(model.masks[0].name, "UpperBody");
        assert_eq!(model.masks[0].weights, vec![0.0, 1.0, 0.5]);
        assert_eq!(model.tracks.len(), 1);
        assert_eq!(model.tracks[0].name, "Wind");
        assert_eq!(model.tracks[0].priority, Some(3));
        // Nothing on disk, so no skeleton and no length warnings.
        assert!(model.skeleton.is_none());
        assert!(model.warnings.is_empty(), "{:?}", model.warnings);
    }

    #[test]
    fn warns_on_missing_mask_reference() {
        let model = project(&bins_with_clip(Some("LowerBody"), Some("Wind")));
        assert_eq!(model.warnings.len(), 1, "{:?}", model.warnings);
        let w = &model.warnings[0];
        assert!(w.contains("Idle1") && w.contains("LowerBody"), "{w}");
        assert!(w.contains("mask"), "{w}");
    }

    #[test]
    fn warns_on_missing_track_reference() {
        let model = project(&bins_with_clip(Some("UpperBody"), Some("Storm")));
        assert_eq!(model.warnings.len(), 1, "{:?}", model.warnings);
        let w = &model.warnings[0];
        assert!(w.contains("Idle1") && w.contains("Storm"), "{w}");
        assert!(w.contains("track"), "{w}");
    }

    #[test]
    fn no_warnings_when_all_references_resolve() {
        // Both spellings must resolve: plain text, and the hash form a bin uses
        // when the hash DB could not name the key.
        let model = project(&bins_with_clip(Some("UpperBody"), Some("Wind")));
        assert!(model.warnings.is_empty(), "{:?}", model.warnings);

        let hashed = format!("0x{:08x}", fnv1a("UpperBody"));
        let model = project(&bins_with_clip(Some(&hashed), Some("Wind")));
        assert!(
            model.warnings.is_empty(),
            "a hash-form reference to a named mask must resolve: {:?}",
            model.warnings
        );

        // And a clip naming neither warns about neither.
        let model = project(&bins_with_clip(None, None));
        assert!(model.warnings.is_empty(), "{:?}", model.warnings);
    }

    #[test]
    fn empty_graph_projects_empty_model() {
        let model = project(&bins_with(Vec::new()));
        assert!(model.clips.is_empty());
        assert!(model.masks.is_empty());
        assert!(model.tracks.is_empty());
        assert!(model.skeleton.is_none());
        assert!(model.warnings.is_empty());

        // Maps present but empty, and no clip map at all.
        let model = project(&bins_with(vec![
            ("mMaskDataMap", map_of(BinType::Embed, Vec::new())),
            ("mTrackDataMap", map_of(BinType::Embed, Vec::new())),
        ]));
        assert!(model.clips.is_empty());
        assert!(model.masks.is_empty());
        assert!(model.tracks.is_empty());
        assert!(model.warnings.is_empty());
    }

    /* The wire shape the TS `AnmModel` is typed against. Pinned because
    `rename_all` alone renames only the VARIANTS - a struct variant's fields
    stay snake_case unless `rename_all_fields` is set too, and that mismatch is
    invisible in Rust and silently `undefined` in the UI. */
    #[test]
    fn enums_serialize_as_camel_case_discriminated_unions() {
        use crate::anim_graph::{AnimEventKind, ClipKind};

        /* Serialize STRAIGHT to a string. Going via `serde_json::Value` first
        would alphabetise the keys - without the `preserve_order` feature a
        `Value::Object` is a BTreeMap - so the assertions below would be
        pinning BTreeMap's ordering rather than the derive's. */
        assert_eq!(
            serde_json::to_string(&ClipKind::Atomic).unwrap(),
            r#"{"type":"atomic"}"#
        );
        assert_eq!(
            serde_json::to_string(&ClipKind::ConditionBool {
                true_clip: Some("Yes".into()),
                false_clip: None,
            })
            .unwrap(),
            r#"{"type":"conditionBool","trueClip":"Yes","falseClip":null}"#
        );
        assert_eq!(
            serde_json::to_string(&AnimEventKind::FaceTarget {
                end_frame: Some(1.0),
                y_rotation_degrees: None,
            })
            .unwrap(),
            r#"{"type":"faceTarget","endFrame":1.0,"yRotationDegrees":null}"#
        );
        assert_eq!(
            serde_json::to_string(&AnimEventKind::Unknown { class_hash: 7 }).unwrap(),
            r#"{"type":"unknown","classHash":7}"#
        );
    }
}
