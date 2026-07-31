/* Animation blend masks and tracks (READ layer).
 *
 * An `animationGraphData` entry carries two sibling maps beside `mClipDataMap`:
 *
 *   mMaskDataMap:  map[hash, embed MaskData]  -> { mWeightList: list[f32] }
 *   mTrackDataMap: map[hash, embed TrackData] -> { mPriority: u8, mBlendMode: u8 }
 *
 * THE POSITIONAL-INDEX CONTRACT (the non-obvious part):
 * A mask's `mWeightList` is indexed POSITIONALLY BY SKELETON JOINT INDEX. There
 * is no joint name and no joint hash stored anywhere inside the mask - element
 * `i` of the list is the blend weight for `skeleton.joints[i]`, full stop. The
 * list length equals the skeleton's joint count exactly (verified: yone_skin74,
 * 162 joints / 162 weights across all 5 masks). Consequences:
 *   - NEVER sort, filter, dedupe or otherwise reorder `weights`; index IS identity.
 *   - The list is meaningless without the matching `.skl`. A weight vector read
 *     from one skeleton cannot be applied to another with a different joint order.
 *   - A future write path must emit exactly the same length, in the same order.
 *
 * TrackData's two fields are BOTH OPTIONAL and are therefore modelled as
 * `Option<u8>`. Absent must stay distinguishable from `0`, because a write path
 * must not materialise a `mPriority: 0` into a file that never had the field.
 * Real bins contain `TrackData {}` with neither field set.
 *
 * Map keys may be resolved names ("Wind", "TURN") or bare unresolved hashes; the
 * latter render as `0x{h:08x}`, matching `anim_graph`'s convention, so both key
 * forms round-trip. Pure read: nothing here mutates a bin.
 */

use std::collections::HashMap;

use ritoshark::bin::{Bin, BinEntry, BinValue};
use ritoshark::hash::fnv1a;
use serde::Serialize;

/// One entry of `mMaskDataMap`: a per-joint blend weight vector.
///
/// `weights[i]` is the weight of skeleton joint `i` (see the module header - the
/// index is the only link back to the joint, so order is load-bearing).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaskData {
    /// Resolved map key, or `0x{h:08x}` when the hash DB couldn't name it.
    pub name: String,
    pub weights: Vec<f32>,
}

/// One entry of `mTrackDataMap`. Both fields are optional in the file format;
/// `None` means the field was absent, which is NOT the same as `Some(0)`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackData {
    /// Resolved map key, or `0x{h:08x}` when the hash DB couldn't name it.
    pub name: String,
    pub priority: Option<u8>,
    pub blend_mode: Option<u8>,
}

fn fields(value: &BinValue) -> Option<&indexmap::IndexMap<u32, BinValue>> {
    match value {
        BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => Some(fields),
        _ => None,
    }
}

/// A `u8` field. Accepts the wider integer tags too, since a writer may widen a
/// small enum; out-of-range values are dropped rather than truncated.
fn as_u8(value: Option<&BinValue>) -> Option<u8> {
    match value? {
        BinValue::U8(v) => Some(*v),
        BinValue::I8(v) => u8::try_from(*v).ok(),
        BinValue::U16(v) => u8::try_from(*v).ok(),
        BinValue::U32(v) => u8::try_from(*v).ok(),
        BinValue::I32(v) => u8::try_from(*v).ok(),
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

/// A map key normalised to a display string. Delegates to `anim_graph` rather
/// than repeating the match: `mMaskDataMap` / `mTrackDataMap` are hash-keyed
/// exactly like the clip and event maps, so a private copy that skipped the
/// hash-database lookup showed every mask and track as `0x{h:08x}` while a
/// ritobin dump of the same bin named them. A clip's `mMaskDataName` is
/// resolved through the same path, so the two must agree or a healthy
/// reference reads as dangling.
fn key_name(key: &BinValue) -> Option<String> {
    crate::anim_graph::key_name_of(key)
}

/// Every `f32` of a `list[f32]`, in file order.
///
/// Unlike `anim_graph::submesh_list` (which tolerantly skips items it can't turn
/// into a token) this REFUSES a list containing any non-`F32` item: positional
/// indexing means a silently dropped element shifts every later weight onto the
/// wrong joint. A malformed list yields `None`, not a short vector.
fn f32_list(value: Option<&BinValue>) -> Option<Vec<f32>> {
    let BinValue::List { items, .. } = value? else {
        return None;
    };
    let mut out = Vec::with_capacity(items.len());
    for item in items {
        match item {
            BinValue::F32(v) => out.push(*v),
            _ => return None,
        }
    }
    Some(out)
}

/// The `animationGraphData` link target reachable from any
/// `SkinCharacterDataProperties` in the merged bins. Mirrors
/// `anim_graph::find_graph_entry` - following the SCDP link is required because a
/// multi-skin bin set holds several graphs and "the first one" is the wrong one.
fn find_graph_entry(entries: &HashMap<u32, &BinEntry>) -> Option<u32> {
    let scdp_class = fnv1a("SkinCharacterDataProperties");
    for entry in entries.values() {
        if entry.class_hash != scdp_class {
            continue;
        }
        let Some(sap) = entry.fields.get(&fnv1a("skinAnimationProperties")) else {
            continue;
        };
        let Some(f) = fields(sap) else { continue };
        if let Some(h) = link_hash(f.get(&fnv1a("animationGraphData"))) {
            return Some(h);
        }
    }
    None
}

/// The graph entry's `map_field`, as ordered `(key name, value)` pairs.
/// Empty when no graph is linked / present, or the map field is absent.
fn graph_map<'a>(bins: &'a [Bin], map_field: &str) -> Vec<(String, &'a BinValue)> {
    let mut merged: HashMap<u32, &BinEntry> = HashMap::new();
    for bin in bins {
        for entry in &bin.entries {
            merged.entry(entry.path_hash).or_insert(entry);
        }
    }

    let Some(graph_hash) = find_graph_entry(&merged) else {
        return Vec::new();
    };
    let Some(graph) = merged.get(&graph_hash) else {
        return Vec::new();
    };
    let Some(BinValue::Map { entries, .. }) = graph.fields.get(&fnv1a(map_field)) else {
        return Vec::new();
    };
    entries
        .iter()
        .filter_map(|(k, v)| key_name(k).map(|n| (n, v)))
        .collect()
}

/// Read `mMaskDataMap` from the linked animation graph, in file order.
///
/// Each mask's weights stay in their original order - see the module header for
/// why reordering them corrupts the joint mapping.
pub fn read_masks(bins: &[Bin]) -> Vec<MaskData> {
    let h_weights = fnv1a("mWeightList");
    graph_map(bins, "mMaskDataMap")
        .into_iter()
        .filter_map(|(name, v)| {
            let f = fields(v)?;
            Some(MaskData {
                name,
                weights: f32_list(f.get(&h_weights)).unwrap_or_default(),
            })
        })
        .collect()
}

/// Read `mTrackDataMap` from the linked animation graph, in file order.
///
/// A `TrackData {}` with no fields is a real and common shape; it yields
/// `priority: None, blend_mode: None` and is kept, not skipped.
pub fn read_tracks(bins: &[Bin]) -> Vec<TrackData> {
    let h_priority = fnv1a("mPriority");
    let h_blend_mode = fnv1a("mBlendMode");
    graph_map(bins, "mTrackDataMap")
        .into_iter()
        .filter_map(|(name, v)| {
            let f = fields(v)?;
            Some(TrackData {
                name,
                priority: as_u8(f.get(&h_priority)),
                blend_mode: as_u8(f.get(&h_blend_mode)),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use indexmap::IndexMap;
    use ritoshark::bin::BinType;

    const GRAPH_HASH: u32 = 0xa11ce;

    /// An SCDP linking `GRAPH_HASH`, plus the graph entry holding `maps`.
    fn bins_with(maps: Vec<(&str, BinValue)>) -> Vec<Bin> {
        let mut sap_fields = IndexMap::new();
        sap_fields.insert(
            fnv1a("animationGraphData"),
            BinValue::Link(GRAPH_HASH),
        );
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
        for (name, value) in maps {
            graph_fields.insert(fnv1a(name), value);
        }
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

    fn map_of(entries: Vec<(BinValue, BinValue)>) -> BinValue {
        BinValue::Map {
            key: BinType::Hash,
            value: BinType::Embed,
            entries,
        }
    }

    fn mask(weights: &[f32]) -> BinValue {
        let mut fields = IndexMap::new();
        fields.insert(
            fnv1a("mWeightList"),
            BinValue::List {
                is_list2: false,
                item: BinType::F32,
                items: weights.iter().map(|w| BinValue::F32(*w)).collect(),
            },
        );
        BinValue::Embed {
            class: fnv1a("MaskData"),
            fields,
        }
    }

    fn track(priority: Option<u8>, blend_mode: Option<u8>) -> BinValue {
        let mut fields = IndexMap::new();
        if let Some(p) = priority {
            fields.insert(fnv1a("mPriority"), BinValue::U8(p));
        }
        if let Some(b) = blend_mode {
            fields.insert(fnv1a("mBlendMode"), BinValue::U8(b));
        }
        BinValue::Embed {
            class: fnv1a("TrackData"),
            fields,
        }
    }

    #[test]
    fn reads_named_and_hex_keyed_masks() {
        let bins = bins_with(vec![(
            "mMaskDataMap",
            map_of(vec![
                (BinValue::String("Wind".into()), mask(&[0.0, 0.0, 1.0])),
                (BinValue::Hash(0x8f3b0f3d), mask(&[1.0])),
            ]),
        )]);
        let masks = read_masks(&bins);
        assert_eq!(masks.len(), 2);
        assert_eq!(masks[0].name, "Wind");
        assert_eq!(masks[0].weights, vec![0.0, 0.0, 1.0]);
        assert_eq!(masks[1].name, "0x8f3b0f3d");
        assert_eq!(masks[1].weights, vec![1.0]);
    }

    #[test]
    fn mask_weights_preserve_order_and_length() {
        // Positional index = joint index, so order and length must survive verbatim.
        let want = vec![0.0, 0.25, 1.0, 0.5, 0.0, 0.75];
        let bins = bins_with(vec![(
            "mMaskDataMap",
            map_of(vec![(BinValue::String("Upper".into()), mask(&want))]),
        )]);
        let masks = read_masks(&bins);
        assert_eq!(masks.len(), 1);
        assert_eq!(masks[0].weights, want);
    }

    #[test]
    fn track_absent_fields_are_none() {
        // `TrackData {}` must NOT become Some(0) - a write path would otherwise
        // materialise fields the file never had.
        let bins = bins_with(vec![(
            "mTrackDataMap",
            map_of(vec![(BinValue::String("Death".into()), track(None, None))]),
        )]);
        let tracks = read_tracks(&bins);
        assert_eq!(
            tracks,
            vec![TrackData {
                name: "Death".into(),
                priority: None,
                blend_mode: None,
            }]
        );
    }

    #[test]
    fn track_partial_fields() {
        let bins = bins_with(vec![(
            "mTrackDataMap",
            map_of(vec![
                (BinValue::String("Recall".into()), track(Some(1), None)),
                (BinValue::String("TURN".into()), track(Some(4), Some(2))),
                (BinValue::Hash(0x3dddb9fd), track(Some(2), None)),
            ]),
        )]);
        let tracks = read_tracks(&bins);
        assert_eq!(tracks.len(), 3);
        assert_eq!(tracks[0].priority, Some(1));
        assert_eq!(tracks[0].blend_mode, None);
        assert_eq!(tracks[1].priority, Some(4));
        assert_eq!(tracks[1].blend_mode, Some(2));
        assert_eq!(tracks[2].name, "0x3dddb9fd");
        assert_eq!(tracks[2].priority, Some(2));
        assert_eq!(tracks[2].blend_mode, None);
    }

    #[test]
    fn empty_map_yields_empty_vec() {
        // Graph present but carrying neither map.
        let bins = bins_with(Vec::new());
        assert!(read_masks(&bins).is_empty());
        assert!(read_tracks(&bins).is_empty());
        // Maps present but empty.
        let bins = bins_with(vec![
            ("mMaskDataMap", map_of(Vec::new())),
            ("mTrackDataMap", map_of(Vec::new())),
        ]);
        assert!(read_masks(&bins).is_empty());
        assert!(read_tracks(&bins).is_empty());
        // No bins / no graph at all.
        assert!(read_masks(&[]).is_empty());
        assert!(read_tracks(&[]).is_empty());
    }
}
