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
 */

use std::collections::{HashMap, HashSet};

use ritoshark::bin::{Bin, BinEntry, BinValue};
use ritoshark::hash::fnv1a;
use serde::Serialize;

/// mFlags bit 2 = LOOP (inherited on AtomicClipData).
const CLIP_FLAG_LOOP: u32 = 2;

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

/// One member of a sequencer's queue: an atomic clip played in order.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipMember {
    pub name: String,
    /// `.anm` asset path (ASSETS/...).
    pub anm_path: String,
    pub events: Vec<SubmeshVisEvent>,
    pub loops: bool,
}

/// One resolved clip from the graph.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipInfo {
    pub name: String,
    /// `.anm` asset path (ASSETS/...); for a sequencer this is its first member's.
    pub anm_path: Option<String>,
    /// A sequencer's ordered queue; empty for an ordinary atomic clip.
    pub members: Vec<ClipMember>,
    /// This clip's own submesh-visibility events (global frames for a sequencer).
    pub events: Vec<SubmeshVisEvent>,
    pub loops: bool,
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
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedClip {
    pub name: String,
    pub anm_path: Option<String>,
    pub members: Vec<PreparedClipMember>,
    pub events: Vec<SubmeshVisEvent>,
    pub loops: bool,
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

/// Parse an AtomicClipData's `mEventDataMap` for SubmeshVisibilityEventData.
fn parse_events(clip: &indexmap::IndexMap<u32, BinValue>) -> Vec<SubmeshVisEvent> {
    let vis_class = fnv1a("SubmeshVisibilityEventData");
    let mut out = Vec::new();
    let Some(BinValue::Map { entries, .. }) = clip.get(&fnv1a("mEventDataMap")) else {
        return out;
    };
    for (_k, v) in entries {
        // Event is a Pointer/Embed whose class is SubmeshVisibilityEventData.
        let class = match v {
            BinValue::Pointer { class, .. } | BinValue::Embed { class, .. } => *class,
            _ => continue,
        };
        if class != vis_class {
            continue;
        }
        let Some(f) = fields(v) else { continue };
        let show = submesh_list(f.get(&fnv1a("mShowSubmeshList")));
        let hide = submesh_list(f.get(&fnv1a("mHideSubmeshList")));
        if show.is_empty() && hide.is_empty() {
            continue;
        }
        out.push(SubmeshVisEvent {
            start_frame: as_f32(f.get(&fnv1a("mStartFrame"))),
            end_frame: as_f32(f.get(&fnv1a("mEndFrame"))),
            show,
            hide,
        });
    }
    out
}

fn clip_anm_path(clip: &indexmap::IndexMap<u32, BinValue>) -> Option<String> {
    let res = clip.get(&fnv1a("mAnimationResourceData"))?;
    let f = fields(res)?;
    as_string(f.get(&fnv1a("mAnimationFilePath")))
}

fn clip_loops(clip: &indexmap::IndexMap<u32, BinValue>) -> bool {
    (as_u32(clip.get(&fnv1a("mFlags"))).unwrap_or(0) & CLIP_FLAG_LOOP) != 0
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
struct ClipMap<'a> {
    by_key: HashMap<String, &'a BinValue>,
}

impl<'a> ClipMap<'a> {
    fn from(map: &'a BinValue) -> Option<Self> {
        let BinValue::Map { entries, .. } = map else { return None };
        let mut by_key = HashMap::new();
        for (k, v) in entries {
            // Map keys are usually Hash or String.
            let key = match k {
                BinValue::String(s) => s.clone(),
                BinValue::Hash(h) | BinValue::Link(h) => format!("0x{h:08x}"),
                _ => continue,
            };
            by_key.insert(key.to_lowercase(), v);
            // Also index a string key by its hash form so a hash reference finds it.
            if let BinValue::String(s) = k {
                by_key.entry(format!("0x{:08x}", fnv1a(s))).or_insert(v);
            }
        }
        Some(ClipMap { by_key })
    }

    fn get(&self, name: &str) -> Option<&'a BinValue> {
        self.by_key
            .get(&name.to_lowercase())
            .copied()
            .or_else(|| self.by_key.get(&format!("0x{:08x}", fnv1a(name))).copied())
    }
}

/// Resolve a SequencerClipData's `mClipNameList` into ordered playable members.
/// Flattens nested sequencers; depth-capped; `seen` stops self-reference.
fn resolve_members(
    clip: &indexmap::IndexMap<u32, BinValue>,
    map: &ClipMap,
    seen: &mut HashSet<String>,
    depth: u32,
) -> Vec<ClipMember> {
    if depth > 4 {
        return Vec::new();
    }
    let Some(BinValue::List { items, .. }) = clip.get(&fnv1a("mClipNameList")) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for item in items {
        let name = match item {
            BinValue::String(s) => s.clone(),
            BinValue::Hash(h) | BinValue::Link(h) => format!("0x{h:08x}"),
            _ => continue,
        };
        let low = name.to_lowercase();
        if seen.contains(&low) {
            continue;
        }
        seen.insert(low);
        let Some(member) = map.get(&name) else { continue };
        let Some(mf) = fields(member) else { continue };
        if let Some(anm) = clip_anm_path(mf) {
            out.push(ClipMember {
                name: clip_display_name(&name, Some(&anm)),
                anm_path: anm,
                events: parse_events(mf),
                loops: clip_loops(mf),
            });
        } else {
            out.extend(resolve_members(mf, map, seen, depth + 1));
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
    // Merge entries by path-hash (first wins).
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
    let Some(clip_map_val) = graph.fields.get(&fnv1a("mClipDataMap")) else {
        return Vec::new();
    };
    let Some(clip_map) = ClipMap::from(clip_map_val) else {
        return Vec::new();
    };
    let BinValue::Map { entries, .. } = clip_map_val else {
        return Vec::new();
    };

    let mut clips = Vec::new();
    for (k, v) in entries {
        let key = match k {
            BinValue::String(s) => s.clone(),
            BinValue::Hash(h) | BinValue::Link(h) => format!("0x{h:08x}"),
            _ => continue,
        };
        let Some(cf) = fields(v) else { continue };
        let direct = clip_anm_path(cf);
        let members = if direct.is_some() {
            Vec::new()
        } else {
            resolve_members(cf, &clip_map, &mut HashSet::new(), 0)
        };
        let anm_path = direct.or_else(|| members.first().map(|m| m.anm_path.clone()));
        let events = parse_events(cf);
        if anm_path.is_none() && events.is_empty() {
            continue;
        }
        clips.push(ClipInfo {
            name: clip_display_name(&key, anm_path.as_deref()),
            anm_path,
            members,
            events,
            loops: clip_loops(cf),
        });
    }
    clips.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    clips
}
