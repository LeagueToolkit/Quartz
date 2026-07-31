/* Cross-session animation porting: lift a CLIP (or a single EVENT) out of a
donor session and land it in the target, dragging along the VFX systems its
particle events spawn.

This is the animation-side twin of `vfx_session::ops::port_system`, and it
follows that module's shape exactly: `check_donor_generation` first, then a
read-only donor phase that CLONES everything it needs, the donor guard released,
then a target phase that renames, inserts and registers. Two registry guards are
never held at once.

WHY THE VFX SYSTEMS COME ALONG
A `ParticleEventData` names a system indirectly, by `mEffectKey`. The key is a
fnv1a-32 that the `ResourceResolver`'s `resourceMap` maps to the path hash of a
`VfxSystemDefinitionData` entry. Porting the clip alone therefore produces an
animation whose particles resolve to nothing and silently never play, which is
the exact failure the old JS tool papered over with fuzzy name matching. Here
the chain is followed natively (see [`system_for_effect_key`]) and a key that
resolves to nothing is REPORTED in `unresolved_effect_keys` rather than guessed
at or treated as fatal: a donor clip commonly references a base-skin system the
target already has, and refusing the whole port over that would be wrong.

CLONE, NEVER REBUILD
The clip's `(key, value)` pair is moved across verbatim, as is each VFX system
entry. `anim_graph` models only a subset of each class (see its header), so a
rebuild from the projected form would drop `mTickDuration`, an `Updater`, and
everything else this view does not name. Only the clip's KEY is ever rewritten,
and only when the name collides in the target.

ONE UNDO STEP
Both ops capture a single tree frame over every bin they touch (the graph bin,
the VFX-owning bin, the resolver's bin) and push exactly one frame, so undo
reverses "port this clip and its three systems" in one go. */

use std::collections::HashSet;

use indexmap::IndexMap;
use ritoshark::bin::{Bin, BinEntry, BinType, BinValue};
use ritoshark::hash::fnv1a;
use serde::Serialize;

use super::project::{project_anm, AnmModel};
use super::structure::{
    bad, clip_map_steps, ensure_event_map_core, key_forms, locate_graph, map_of,
};
use crate::error::Result;
use crate::vfx_session::ops::{
    check_donor_generation, collect_asset_strings, entry_string_field, existing_system_names,
    find_resolver, hashish_value, minimal_resolver_entry_from_pairs, resolver_map_ok,
    resolver_upsert_pair_core, uniquify_name, vfx_owner_bin,
};
use crate::vfx_session::path::{walk_steps, Step, VfxPath};
use crate::vfx_session::schema::Hashes;
use crate::vfx_session::session::{self, LoadedBin, SessionId};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortClipResult {
    pub model: AnmModel,
    /// Donor asset strings to copy, same contract as `PortSystemResult::asset_paths`.
    pub asset_paths: Vec<String>,
    /// Names of VFX systems that came along.
    pub ported_systems: Vec<String>,
    /// Effect keys referenced by particle events that had NO resolvable VFX
    /// system in the donor. Surfaced so the UI can warn instead of silently
    /// porting a clip whose particles will not play.
    pub unresolved_effect_keys: Vec<String>,
}

// ── The effect-key -> VFX system lookup ─────────────────────────────────────

/// Every spelling an effect key can be compared under: its literal text
/// lowercased, and its `0x{h:08x}` hash form.
///
/// `mEffectKey` is typed `hash` in most real bins but `string` in some, and
/// `anim_graph::as_name` hands back whichever the dictionary produced. Comparing
/// only one spelling means a donor whose key resolved to text never matches a
/// resolver keyed by the bare hash, and vice versa. Same both-spellings
/// convention as `structure::key_forms` and `anm::project::name_keys`.
fn effect_key_forms(key: &str) -> Vec<String> {
    // A key that ALREADY arrived as `0x{h:08x}` has no text form to hash: it is
    // its own hash form, and hashing the literal "0x1234abcd" would invent a
    // different key entirely.
    if let Some(hex) = key.strip_prefix("0x") {
        if hex.len() == 8 && hex.chars().all(|c| c.is_ascii_hexdigit()) {
            return vec![key.to_lowercase()];
        }
    }
    vec![key.to_lowercase(), format!("0x{:08x}", fnv1a(key))]
}

/// True when a resolver map key means the same thing as `effect_key`.
fn key_matches(map_key: &BinValue, effect_key: &str) -> bool {
    let wanted = effect_key_forms(effect_key);
    key_forms(map_key).iter().any(|f| wanted.contains(f))
}

/// Every `(key, link)` pair of every `ResourceResolver` in the bin set.
///
/// The resolver's `resourceMap` is `map[hash, link]`: the KEY is an effect-key
/// hash and the VALUE links the target's path hash. Every resolver is walked,
/// not just the first, because a skin's linked VFX bin routinely carries its own
/// alongside the main bin's. Both directions of the lookup (key to link, and
/// link back to key) are served from this one scan.
fn resolver_pairs<'a>(
    bins: &'a [Bin],
    h: &Hashes,
) -> impl Iterator<Item = &'a (BinValue, BinValue)> {
    let (resolver, map) = (h.resource_resolver, h.resource_map);
    bins.iter()
        .flat_map(|b| b.entries.iter())
        .filter(move |e| e.class_hash == resolver)
        .filter_map(move |e| match e.fields.get(&map) {
            Some(BinValue::Map { entries, .. }) => Some(entries),
            _ => None,
        })
        .flatten()
}

/// Locate the donor `VfxSystemDefinitionData` a particle event's effect key
/// spawns, as `(bin, entry)`.
///
/// Two ways in, in order of authority:
///
/// 1. Through the RESOURCE RESOLVER: `effect_key -> resourceMap -> link -> the
///    entry whose `path_hash` matches AND whose class is VfxSystemDefinitionData.
///    This is the chain the engine itself walks, and the one the old JS tool
///    only approximated with substring matching.
/// 2. Failing that, the effect key taken AS a path hash. Hand-authored bins
///    frequently name a system directly, with no resolver mapping at all.
///
/// The class check is what makes both safe: a resolver link that points at
/// something other than a system (an animation graph, a texture) simply does not
/// resolve rather than porting the wrong entry.
fn system_for_effect_key(bins: &[Bin], h: &Hashes, effect_key: &str) -> Option<(usize, usize)> {
    let linked = resolver_pairs(bins, h)
        .find(|(k, _)| key_matches(k, effect_key))
        .and_then(|(_, v)| hashish_value(v));

    for want in linked.into_iter().chain(effect_key_hash(effect_key)) {
        let found = bins.iter().enumerate().find_map(|(bin_idx, bin)| {
            bin.entries
                .iter()
                .position(|e| {
                    e.path_hash == want && e.class_hash == h.vfx_system_definition_data
                })
                .map(|entry_idx| (bin_idx, entry_idx))
        });
        if found.is_some() {
            return found;
        }
    }
    None
}

/// The path hash an effect key could itself be: a `0x` form parsed literally,
/// anything else hashed.
fn effect_key_hash(effect_key: &str) -> Option<u32> {
    effect_key
        .strip_prefix("0x")
        .and_then(|hex| u32::from_str_radix(hex, 16).ok())
        .or_else(|| Some(fnv1a(effect_key)))
}

// ── Reading a donor event's effect keys ─────────────────────────────────────

/// Every `mEffectKey` under one event value, in bin order.
///
/// Read straight off the tree rather than through `anim_graph`, because the
/// donor phase already holds the raw value and going via a projection would
/// re-resolve hashes through the dictionary for no gain. The animation class and
/// field spellings live here rather than in `vfx_session::schema::Hashes`, which
/// covers the VFX schema only.
fn effect_keys_of_event(value: &BinValue, _h: &Hashes) -> Vec<String> {
    let Some(fields) = class_fields(value) else {
        return Vec::new();
    };
    if class_of(value) != Some(fnv1a("ParticleEventData")) {
        return Vec::new();
    }
    match fields.get(&fnv1a("mEffectKey")) {
        Some(BinValue::String(s)) if !s.is_empty() => vec![s.clone()],
        Some(BinValue::Hash(k)) | Some(BinValue::Link(k)) => vec![format!("0x{k:08x}")],
        _ => Vec::new(),
    }
}

/// Every effect key referenced by a clip value: its own events, in map order.
fn effect_keys_of_clip(clip: &BinValue, h: &Hashes) -> Vec<String> {
    let Some(fields) = class_fields(clip) else {
        return Vec::new();
    };
    let Some(BinValue::Map { entries, .. }) = fields.get(&fnv1a("mEventDataMap")) else {
        return Vec::new();
    };
    entries
        .iter()
        .flat_map(|(_k, v)| effect_keys_of_event(v, h))
        .collect()
}

fn class_fields(value: &BinValue) -> Option<&IndexMap<u32, BinValue>> {
    match value {
        BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => Some(fields),
        _ => None,
    }
}

fn class_of(value: &BinValue) -> Option<u32> {
    match value {
        BinValue::Pointer { class, .. } | BinValue::Embed { class, .. } => Some(*class),
        _ => None,
    }
}

// ── What the donor phase hands to the target phase ──────────────────────────

/// One donor VFX system, ready to be inserted into a target.
#[derive(Debug, Clone)]
pub(crate) struct DonorSystem {
    pub entry: BinEntry,
    /// The resolver `(key, link)` pairs that pointed at this system in the
    /// donor. Copied verbatim so the target's effect keys keep resolving.
    pub resolver_pairs: Vec<(BinValue, BinValue)>,
    /// Display name, for the result's `ported_systems`.
    pub name: String,
}

/// Everything phase 1 lifts out of the donor: the map pair itself plus the VFX
/// baggage its particle events pulled in.
#[derive(Debug, Clone)]
pub(crate) struct DonorPayload {
    /// The clip's or event's `(key, value)` pair, verbatim.
    pub pair: (BinValue, BinValue),
    /// The donor's display name for the pair's key, used as the naming base.
    pub name: String,
    pub systems: Vec<DonorSystem>,
    pub asset_paths: Vec<String>,
    pub unresolved_effect_keys: Vec<String>,
}

/// Read the map pair a path addresses, plus every VFX system its effect keys
/// reach. Pure over plain bins so the tests drive it without a session.
///
/// `keys_of` decides what to scan: a whole clip scans its event map, a single
/// event scans just itself. Duplicate systems are collapsed by entry address, so
/// two events sharing one effect key port that system ONCE.
pub(crate) fn collect_donor_core(
    bins: &[Bin],
    path: &VfxPath,
    h: &Hashes,
    keys_of: impl Fn(&BinValue, &Hashes) -> Vec<String>,
    what: &str,
) -> Result<DonorPayload> {
    let pair = clone_map_pair(bins, path, what)?;
    // Named through the BIN hash dictionary, exactly as the read layer names the
    // same key, so the target's map key spells what the UI showed the user.
    let name = crate::anim_graph::key_name_of(&pair.0)
        .unwrap_or_else(|| format!("0x{:08x}", fnv1a(what)));

    let mut assets: HashSet<String> = HashSet::new();
    collect_asset_strings(&pair.1, &mut assets);

    let mut systems: Vec<DonorSystem> = Vec::new();
    let mut seen_systems: HashSet<(usize, usize)> = HashSet::new();
    let mut unresolved: Vec<String> = Vec::new();
    let mut seen_keys: HashSet<String> = HashSet::new();

    for key in keys_of(&pair.1, h) {
        // Dedupe on the key itself first: several events routinely share one.
        if !seen_keys.insert(key.to_lowercase()) {
            continue;
        }
        let Some((bin_idx, entry_idx)) = system_for_effect_key(bins, h, &key) else {
            unresolved.push(key);
            continue;
        };
        if !seen_systems.insert((bin_idx, entry_idx)) {
            continue;
        }
        let entry = bins[bin_idx].entries[entry_idx].clone();
        for (_k, v) in &entry.fields {
            collect_asset_strings(v, &mut assets);
        }
        let display = entry_string_field(&entry, h.particle_name)
            .or_else(|| entry_string_field(&entry, h.particle_path))
            .unwrap_or_else(|| format!("0x{:08x}", entry.path_hash));
        systems.push(DonorSystem {
            resolver_pairs: resolver_pairs_for(bins, h, entry.path_hash),
            entry,
            name: display,
        });
    }

    let mut asset_paths: Vec<String> = assets.into_iter().collect();
    asset_paths.sort();
    Ok(DonorPayload {
        pair,
        name,
        systems,
        asset_paths,
        unresolved_effect_keys: unresolved,
    })
}

/// `ops::resolver_entries_for_system_hash` over plain `Bin`s.
///
/// That helper takes `&[LoadedBin]`, which the pure cores here do not have; the
/// filter is otherwise identical, matching both key and value because a resolver
/// keyed BY the system hash occurs alongside one linking TO it.
fn resolver_pairs_for(bins: &[Bin], h: &Hashes, system_hash: u32) -> Vec<(BinValue, BinValue)> {
    resolver_pairs(bins, h)
        .filter(|(k, v)| {
            hashish_value(v) == Some(system_hash) || hashish_value(k) == Some(system_hash)
        })
        .cloned()
        .collect()
}

/// Clone the `(key, value)` pair a map-entry path addresses, verbatim.
fn clone_map_pair(bins: &[Bin], path: &VfxPath, what: &str) -> Result<(BinValue, BinValue)> {
    let Some((last, parent)) = path.steps.split_last() else {
        return Err(bad(format!("{what} path must end in a map position")));
    };
    let Step::MapIndex { map_index } = *last else {
        return Err(bad(format!("{what} path must end in a map position")));
    };
    let entry = bins
        .get(path.bin)
        .and_then(|b| b.entries.get(path.entry))
        .ok_or_else(|| bad(format!("Donor {what} no longer resolves")))?;
    // `walk_steps` wants `&mut`; the donor tree is read-only here, so it is
    // cloned for the walk. A single entry, once, on an explicit port.
    let mut scratch = entry.clone();
    let Some(BinValue::Map { entries, .. }) = walk_steps(&mut scratch, parent) else {
        return Err(bad(format!("Donor {what} no longer resolves")));
    };
    entries
        .get(map_index)
        .cloned()
        .ok_or_else(|| bad(format!("Donor {what} no longer resolves")))
}

// ── Target-side insertion ───────────────────────────────────────────────────

/// Append a verbatim `(key, value)` pair to the map at `steps`, rewriting only
/// the KEY when `name` differs from what the donor carried.
///
/// The sibling `structure::append_to_map_core` BUILDS its value from a field
/// list, which is exactly what must not happen to a ported clip; this is the
/// verbatim counterpart. Duplicate-key rejection is not needed because the
/// caller has already uniquified `name` against the live map.
pub(crate) fn append_pair_core(
    entry: &mut BinEntry,
    steps: &[Step],
    name: &str,
    pair: (BinValue, BinValue),
    what: &str,
) -> Result<()> {
    let Some(BinValue::Map {
        key: key_type,
        entries,
        ..
    }) = map_of(entry, steps)
    else {
        return Err(bad(format!("{what} map no longer resolves")));
    };
    let key = match *key_type {
        BinType::String => BinValue::String(name.to_string()),
        BinType::Link => BinValue::Link(fnv1a(name)),
        _ => BinValue::Hash(fnv1a(name)),
    };
    entries.push((key, pair.1));
    Ok(())
}

/// The names already taken in the map at `steps`, under both spellings, so a
/// ported clip can be uniquified rather than rejected.
fn taken_map_names(entry: &mut BinEntry, steps: &[Step]) -> HashSet<String> {
    let mut out = HashSet::new();
    if let Some(BinValue::Map { entries, .. }) = map_of(entry, steps) {
        for (k, _) in entries.iter() {
            out.extend(key_forms(k));
        }
    }
    out
}

/// Suffix `_2`, `_3`, ... until neither spelling of the candidate is taken.
///
/// Mirrors `ops::uniquify_name`'s policy (and its 100-try bail-out via the
/// hash-set form), but works over map keys rather than system names, since a
/// clip's identity is its map key and nothing else.
fn uniquify_map_name(base: &str, taken: &HashSet<String>) -> String {
    let clashes = |c: &str| {
        key_forms(&BinValue::String(c.to_string()))
            .iter()
            .any(|f| taken.contains(f))
    };
    if !clashes(base) {
        return base.to_string();
    }
    for counter in 2..=100u32 {
        let candidate = format!("{base}_{counter}");
        if !clashes(&candidate) {
            return candidate;
        }
    }
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{base}_{ts}")
}

// ── Session ops ─────────────────────────────────────────────────────────────

/// Port a whole clip from `donor` into `target`, carrying every VFX system its
/// particle events reference.
///
/// `desired_name` renames the clip on arrival; without one the donor's own name
/// is kept. Either way the final name is uniquified against the target's clip
/// map, so a collision reorders nothing and overwrites nothing.
pub fn port_clip(
    target: SessionId,
    donor: SessionId,
    donor_clip: &VfxPath,
    desired_name: Option<&str>,
    donor_generation: Option<u64>,
) -> Result<PortClipResult> {
    check_donor_generation(donor, donor_generation)?;
    let payload = session::with_session(donor, |d| -> Result<DonorPayload> {
        let h = Hashes::new();
        let bins = trees_of(&d.bins);
        collect_donor_core(&bins, donor_clip, &h, effect_keys_of_clip, "clip")
    })??;

    let base = desired_name
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .map(String::from)
        .unwrap_or_else(|| payload.name.clone());

    session::with_session(target, |s| -> Result<PortClipResult> {
        let h = Hashes::new();
        let bins = trees_of(&s.bins);
        let (graph_bin, graph_entry) = locate_graph(&bins)
            .ok_or_else(|| bad("This skin has no animation graph to port a clip into"))?;
        let steps = clip_map_steps();

        // Everything that can fail is settled BEFORE the capture: the clip map
        // must exist, and every resolver that will be written must be a map.
        let unique = {
            let entry = &mut s.bins[graph_bin].tree.entries[graph_entry];
            if map_of(entry, &steps).is_none() {
                return Err(bad("The animation graph has no clip map"));
            }
            uniquify_map_name(&base, &taken_map_names(entry, &steps))
        };
        let plan = plan_systems(s, &h, &payload.systems)?;

        let frame = s.capture_tree(&touched_bins(graph_bin, &plan));
        {
            let entry = &mut s.bins[graph_bin].tree.entries[graph_entry];
            append_pair_core(entry, &steps, &unique, payload.pair.clone(), "clip")?;
        }
        s.mark_dirty(graph_bin);
        let ported_systems = install_systems(s, &h, &payload.systems, &plan);
        s.push_frame(frame);

        Ok(PortClipResult {
            model: project_anm(s),
            asset_paths: payload.asset_paths.clone(),
            ported_systems,
            unresolved_effect_keys: payload.unresolved_effect_keys.clone(),
        })
    })?
}

/// Port a single event into an EXISTING target clip, carrying its VFX system
/// when it is a particle event.
///
/// `target_clip` addresses the clip the event lands in; its `mEventDataMap` is
/// created when the clip has none yet, so "port an event onto a clip that has no
/// events" works.
pub fn port_event(
    target: SessionId,
    donor: SessionId,
    donor_event: &VfxPath,
    target_clip: &VfxPath,
    donor_generation: Option<u64>,
) -> Result<PortClipResult> {
    check_donor_generation(donor, donor_generation)?;
    let payload = session::with_session(donor, |d| -> Result<DonorPayload> {
        let h = Hashes::new();
        let bins = trees_of(&d.bins);
        // A single event has no event map of its own: scan the event value.
        collect_donor_core(
            &bins,
            donor_event,
            &h,
            |v, h| effect_keys_of_event(v, h),
            "event",
        )
    })??;

    session::with_session(target, |s| -> Result<PortClipResult> {
        let h = Hashes::new();
        // Validate the destination clip before anything is captured. The event
        // map is materialised after capture, so undo reverses that too.
        {
            let entry = target_clip
                .entry_of(&mut s.bins)
                .ok_or_else(|| bad("Target clip no longer resolves"))?;
            if walk_steps(entry, &target_clip.steps).is_none() {
                return Err(bad("Target clip no longer resolves"));
            }
        }
        let plan = plan_systems(s, &h, &payload.systems)?;

        let frame = s.capture_tree(&touched_bins(target_clip.bin, &plan));
        {
            let entry = target_clip.entry_of(&mut s.bins).expect("validated above");
            // A clip with no events omits the field entirely; materialise it so
            // the ported event has somewhere to land. Captured above, so undo
            // reverses this too.
            let map_steps = ensure_event_map_core(entry, &target_clip.steps)?;
            let unique = uniquify_map_name(&payload.name, &taken_map_names(entry, &map_steps));
            append_pair_core(entry, &map_steps, &unique, payload.pair.clone(), "event")?;
        }
        s.mark_dirty(target_clip.bin);
        let ported_systems = install_systems(s, &h, &payload.systems, &plan);
        s.push_frame(frame);

        Ok(PortClipResult {
            model: project_anm(s),
            asset_paths: payload.asset_paths.clone(),
            ported_systems,
            unresolved_effect_keys: payload.unresolved_effect_keys.clone(),
        })
    })?
}

// ── System installation, shared by both ops ─────────────────────────────────

/// Where a batch of donor systems will land, decided before any capture.
struct SystemPlan {
    /// The bin new systems are inserted into.
    owner_bin: usize,
    /// Where in that bin, just after its SkinCharacterDataProperties.
    insert_idx: usize,
    /// `(bin, entry)` of the resolver to upsert into; `None` means one must be
    /// created in the main bin.
    resolver: Option<(usize, usize)>,
    /// Per donor system, the name it will carry and whether it is new to the
    /// target at all (an already-present system is skipped, not duplicated).
    names: Vec<Option<String>>,
}

/// Decide, without mutating, where every donor system goes and under what name.
///
/// Validating here rather than mid-insert is what keeps a precondition failure
/// from leaving a half-ported target: nothing below this call can fail.
fn plan_systems(
    s: &crate::vfx_session::session::VfxSession,
    h: &Hashes,
    systems: &[DonorSystem],
) -> Result<SystemPlan> {
    let resolver = find_resolver(s, h);
    if !systems.is_empty() {
        if let Some((rb, re)) = resolver {
            resolver_map_ok(&s.bins[rb].tree.entries[re], h)?;
        }
    }

    let (mut names_taken, mut hashes_taken) = existing_system_names(s, h);
    let mut names = Vec::with_capacity(systems.len());
    for sys in systems {
        // A system already resident under the same path hash is the SAME system,
        // usually because donor and target share a base skin. Porting it again
        // would duplicate an entry the engine then resolves ambiguously.
        if hashes_taken.contains(&sys.entry.path_hash) {
            names.push(None);
            continue;
        }
        let base = entry_string_field(&sys.entry, h.particle_path)
            .or_else(|| entry_string_field(&sys.entry, h.particle_name));
        match base {
            Some(base) => {
                let unique = uniquify_name(&base, &names_taken, &hashes_taken);
                names_taken.insert(unique.to_lowercase());
                hashes_taken.insert(crate::vfx_session::schema::hash_or_hex(&unique));
                names.push(Some(unique));
            }
            None => {
                // No name to uniquify against; the entry keeps its own hash,
                // which the check above already proved is free.
                hashes_taken.insert(sys.entry.path_hash);
                names.push(Some(format!("0x{:08x}", sys.entry.path_hash)));
            }
        }
    }

    let owner_bin = vfx_owner_bin(s, h);
    let insert_idx = s.bins[owner_bin]
        .tree
        .entries
        .iter()
        .position(|e| e.class_hash == h.skin_character_data_properties)
        .map(|scdp| scdp + 1)
        .unwrap_or(0);

    Ok(SystemPlan {
        owner_bin,
        insert_idx,
        resolver,
        names,
    })
}

/// Every bin one op writes to, so a single tree frame covers the whole port.
fn touched_bins(primary: usize, plan: &SystemPlan) -> Vec<usize> {
    let mut out = vec![primary];
    let porting_any = plan.names.iter().any(Option::is_some);
    if porting_any {
        for bin in [plan.owner_bin, plan.resolver.map(|(b, _)| b).unwrap_or(0)] {
            if !out.contains(&bin) {
                out.push(bin);
            }
        }
    }
    out
}

/// Insert the planned systems and register them. Infallible by construction:
/// [`plan_systems`] already proved every precondition.
///
/// Returns the display names of the systems that actually landed.
fn install_systems(
    s: &mut crate::vfx_session::session::VfxSession,
    h: &Hashes,
    systems: &[DonorSystem],
    plan: &SystemPlan,
) -> Vec<String> {
    let mut ported = Vec::new();
    // Track the resolver's position: each insert into the owner bin shifts every
    // entry at or after `insert_idx` down by one, and an upsert landing on a
    // neighbour would corrupt an unrelated entry.
    let mut resolver = plan.resolver;
    let mut inserted = 0usize;

    for (sys, name) in systems.iter().zip(&plan.names) {
        let Some(name) = name else { continue };
        let mut clone = sys.entry.clone();
        // Rename only when uniquification actually changed the name; otherwise
        // the entry (and every hash derived from it) stays byte-identical.
        let renamed = entry_string_field(&clone, h.particle_path)
            .or_else(|| entry_string_field(&clone, h.particle_name))
            .map(|base| base != *name)
            .unwrap_or(false);
        if renamed {
            clone
                .fields
                .insert(h.particle_name, BinValue::String(name.clone()));
            clone
                .fields
                .insert(h.particle_path, BinValue::String(name.clone()));
            clone.path_hash = crate::vfx_session::schema::hash_or_hex(name);
        }

        let at = plan.insert_idx + inserted;
        let at = at.min(s.bins[plan.owner_bin].tree.entries.len());
        let system_hash = clone.path_hash;
        s.bins[plan.owner_bin].tree.entries.insert(at, clone);
        s.mark_dirty(plan.owner_bin);
        inserted += 1;
        if let Some((rb, re)) = resolver {
            if rb == plan.owner_bin && re >= at {
                resolver = Some((rb, re + 1));
            }
        }

        /* A renamed system's donor resolver pairs point at the OLD hash, so each
        pair keeps its effect KEY (the animation event still names that) and is
        re-pointed at the new hash. An unrenamed system keeps the donor's pairs
        verbatim, so the target's effect keys resolve exactly as the donor's did.
        A system the donor never registered gets a self-mapping, which is what
        the engine falls back to for a directly-named system. */
        let pairs: Vec<(BinValue, BinValue)> = if sys.resolver_pairs.is_empty() {
            vec![(BinValue::Hash(system_hash), BinValue::Link(system_hash))]
        } else if renamed {
            sys.resolver_pairs
                .iter()
                .map(|(k, _)| (k.clone(), BinValue::Link(system_hash)))
                .collect()
        } else {
            sys.resolver_pairs.clone()
        };

        match resolver {
            Some((rb, re)) => {
                for (k, v) in &pairs {
                    // `resolver_map_ok` passed in `plan_systems`, so this cannot
                    // fail; an error here would mean the tree changed underneath.
                    let _ = resolver_upsert_pair_core(&mut s.bins[rb].tree.entries[re], h, k, v);
                }
                s.mark_dirty(rb);
            }
            None => {
                let entry = minimal_resolver_entry_from_pairs(h, name, &pairs);
                s.bins[0].tree.entries.push(entry);
                s.mark_dirty(0);
                // The freshly created resolver is now the one to upsert into.
                resolver = Some((0, s.bins[0].tree.entries.len() - 1));
            }
        }
        ported.push(sys.name.clone());
    }
    ported
}

fn trees_of(bins: &[LoadedBin]) -> Vec<Bin> {
    bins.iter().map(|lb| lb.tree.clone()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::anim_graph::{resolve_clip_graph, AnimEventKind};
    use crate::vfx_session::schema::hash_or_hex;

    const GRAPH_NAME: &str = "Characters/Yone/Animations/Skin74";
    const SYS_PATH: &str = "Characters/Yone/Skins/Skin74/Particles/Yone_Skin74_Q";

    fn hs() -> Hashes {
        Hashes::new()
    }

    // ---- fixtures (mirroring `anm::project` / `anm::structure`) -------------

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

    fn anm(path: &str) -> (&'static str, BinValue) {
        (
            "mAnimationResourceData",
            embed(
                "AnimationResourceData",
                vec![("mAnimationFilePath", BinValue::String(path.to_string()))],
            ),
        )
    }

    /// A `ParticleEventData` naming `effect_key`, plus an unmodelled sibling so
    /// verbatim carriage is observable on the event too.
    fn particle_event(effect_key: &str) -> BinValue {
        pointer(
            "ParticleEventData",
            vec![
                ("mEffectKey", BinValue::Hash(fnv1a(effect_key))),
                ("mStartFrame", BinValue::F32(3.0)),
                ("mIsKillEvent", BinValue::Bool(true)),
            ],
        )
    }

    /// The graph entry, the SCDP that links it, plus whatever extra entries the
    /// caller wants alongside (VFX systems, a resolver).
    fn bins_with(clips: Vec<(BinValue, BinValue)>, extra: Vec<BinEntry>) -> Vec<Bin> {
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
                f.insert(fnv1a("mClipDataMap"), map_of_ptr(clips));
                f
            },
        };
        let mut entries = vec![scdp, graph];
        entries.extend(extra);
        vec![Bin {
            entries,
            ..Bin::new()
        }]
    }

    fn system_entry(path: &str) -> BinEntry {
        let h = hs();
        let mut fields = IndexMap::new();
        fields.insert(h.particle_name, BinValue::String(path.to_string()));
        fields.insert(h.particle_path, BinValue::String(path.to_string()));
        fields.insert(
            h.complex_emitter_definition_data,
            BinValue::List {
                is_list2: false,
                item: BinType::Pointer,
                items: vec![pointer(
                    "VfxEmitterDefinitionData",
                    vec![(
                        "texture",
                        BinValue::String(
                            "ASSETS/Characters/Yone/Particles/glow.dds".to_string(),
                        ),
                    )],
                )],
            },
        );
        BinEntry {
            path_hash: hash_or_hex(path),
            class_hash: h.vfx_system_definition_data,
            fields,
        }
    }

    fn resolver_entry(pairs: Vec<(BinValue, BinValue)>) -> BinEntry {
        let h = hs();
        let mut fields = IndexMap::new();
        fields.insert(
            h.resource_map,
            BinValue::Map {
                key: BinType::Hash,
                value: BinType::Link,
                entries: pairs,
            },
        );
        BinEntry {
            path_hash: fnv1a("Characters/Yone/Skins/Skin74/Resources"),
            class_hash: h.resource_resolver,
            fields,
        }
    }

    /// A donor holding one clip with `events`, the system `SYS_PATH`, and a
    /// resolver mapping `effect_key -> that system`.
    fn donor_bins(effect_key: &str, events: Vec<(BinValue, BinValue)>) -> Vec<Bin> {
        bins_with(
            vec![(
                BinValue::String("Spell1".into()),
                pointer(
                    "AtomicClipData",
                    vec![
                        anm("ASSETS/Characters/Yone/Animations/spell1.anm"),
                        // Unmodelled by `anim_graph`: must survive the port.
                        ("mTickDuration", BinValue::F32(0.25)),
                        ("mEventDataMap", map_of_ptr(events)),
                    ],
                ),
            )],
            vec![
                system_entry(SYS_PATH),
                resolver_entry(vec![(
                    BinValue::Hash(fnv1a(effect_key)),
                    BinValue::Link(hash_or_hex(SYS_PATH)),
                )]),
            ],
        )
    }

    /// An empty-ish target: the graph, an empty clip map, and its own resolver.
    fn target_bins(clips: Vec<(BinValue, BinValue)>) -> Vec<Bin> {
        bins_with(clips, vec![resolver_entry(Vec::new())])
    }

    fn clip_path(pos: usize) -> VfxPath {
        VfxPath {
            bin: 0,
            entry: 1,
            steps: vec![
                Step::Field {
                    field: fnv1a("mClipDataMap"),
                },
                Step::MapIndex { map_index: pos },
            ],
        }
    }

    fn event_path(clip_pos: usize, event_pos: usize) -> VfxPath {
        let mut steps = clip_path(clip_pos).steps;
        steps.push(Step::Field {
            field: fnv1a("mEventDataMap"),
        });
        steps.push(Step::MapIndex {
            map_index: event_pos,
        });
        VfxPath {
            bin: 0,
            entry: 1,
            steps,
        }
    }

    /// The clip-map keys of a bin set, rendered the way the read layer would.
    fn clip_keys(bins: &mut [Bin]) -> Vec<String> {
        let steps = clip_map_steps();
        let Some(BinValue::Map { entries, .. }) = walk_steps(&mut bins[0].entries[1], &steps) else {
            return Vec::new();
        };
        entries
            .iter()
            .map(|(k, _)| match k {
                BinValue::String(s) => s.clone(),
                BinValue::Hash(h) | BinValue::Link(h) => format!("0x{h:08x}"),
                other => format!("{other:?}"),
            })
            .collect()
    }

    fn collect_clip(bins: &[Bin], path: &VfxPath) -> Result<DonorPayload> {
        collect_donor_core(bins, path, &hs(), effect_keys_of_clip, "clip")
    }

    /// Drive the target half without a session: append the pair, then insert
    /// each planned system into a plain bin set. Mirrors what `install_systems`
    /// does for the resolver, minus the session bookkeeping.
    fn land(target: &mut Vec<Bin>, payload: &DonorPayload, base: &str) -> String {
        let h = hs();
        let (gb, ge) = locate_graph(target).expect("graph");
        let steps = clip_map_steps();
        let unique = {
            let entry = &mut target[gb].entries[ge];
            uniquify_map_name(base, &taken_map_names(entry, &steps))
        };
        append_pair_core(
            &mut target[gb].entries[ge],
            &steps,
            &unique,
            payload.pair.clone(),
            "clip",
        )
        .unwrap();
        for sys in &payload.systems {
            let already = target
                .iter()
                .any(|b| b.entries.iter().any(|e| e.path_hash == sys.entry.path_hash));
            if already {
                continue;
            }
            target[0].entries.push(sys.entry.clone());
            let resolver_idx = target[0]
                .entries
                .iter()
                .position(|e| e.class_hash == h.resource_resolver)
                .expect("resolver");
            let pairs = if sys.resolver_pairs.is_empty() {
                vec![(
                    BinValue::Hash(sys.entry.path_hash),
                    BinValue::Link(sys.entry.path_hash),
                )]
            } else {
                sys.resolver_pairs.clone()
            };
            for (k, v) in &pairs {
                resolver_upsert_pair_core(&mut target[0].entries[resolver_idx], &h, k, v).unwrap();
            }
        }
        unique
    }

    fn resolver_of(bins: &[Bin]) -> Vec<(BinValue, BinValue)> {
        let h = hs();
        for bin in bins {
            for entry in &bin.entries {
                if entry.class_hash != h.resource_resolver {
                    continue;
                }
                if let Some(BinValue::Map { entries, .. }) = entry.fields.get(&h.resource_map) {
                    return entries.clone();
                }
            }
        }
        Vec::new()
    }

    // ---- 1. the system comes across, resolver entry and all ----------------

    #[test]
    fn porting_a_clip_brings_its_particle_system_and_resolver_entry() {
        let donor = donor_bins("yone_q_cast", vec![(
            BinValue::String("P0".into()),
            particle_event("yone_q_cast"),
        )]);
        let payload = collect_clip(&donor, &clip_path(0)).unwrap();

        assert_eq!(payload.systems.len(), 1);
        assert_eq!(payload.systems[0].name, SYS_PATH);
        assert!(payload.unresolved_effect_keys.is_empty());
        // Both the clip's own `.anm` and the system's emitter texture ride along
        // as assets to copy: a ported clip whose animation file was left behind
        // is as broken as one whose particles were.
        assert_eq!(
            payload.asset_paths,
            vec![
                "ASSETS/Characters/Yone/Animations/spell1.anm".to_string(),
                "ASSETS/Characters/Yone/Particles/glow.dds".to_string(),
            ]
        );

        let mut target = target_bins(Vec::new());
        land(&mut target, &payload, &payload.name);

        let h = hs();
        assert!(
            target[0]
                .entries
                .iter()
                .any(|e| e.class_hash == h.vfx_system_definition_data
                    && e.path_hash == hash_or_hex(SYS_PATH)),
            "the donor system must be resident in the target"
        );
        assert_eq!(
            resolver_of(&target),
            vec![(
                BinValue::Hash(fnv1a("yone_q_cast")),
                BinValue::Link(hash_or_hex(SYS_PATH))
            )],
            "the donor resolver pair must come with it"
        );
    }

    // ---- 2. a shared effect key ports its system once ----------------------

    #[test]
    fn two_events_sharing_an_effect_key_port_one_system() {
        let donor = donor_bins(
            "yone_q_cast",
            vec![
                (BinValue::String("P0".into()), particle_event("yone_q_cast")),
                (BinValue::String("P1".into()), particle_event("yone_q_cast")),
            ],
        );
        let payload = collect_clip(&donor, &clip_path(0)).unwrap();
        assert_eq!(
            payload.systems.len(),
            1,
            "one system, not one per referencing event"
        );

        let mut target = target_bins(Vec::new());
        land(&mut target, &payload, &payload.name);
        let h = hs();
        let count = target[0]
            .entries
            .iter()
            .filter(|e| e.class_hash == h.vfx_system_definition_data)
            .count();
        assert_eq!(count, 1);
        assert_eq!(resolver_of(&target).len(), 1);
    }

    // ---- 3. an unresolvable key warns instead of aborting -------------------

    #[test]
    fn an_unresolvable_effect_key_is_reported_and_does_not_abort() {
        // The clip references two keys; only one has a system behind it.
        let donor = donor_bins(
            "yone_q_cast",
            vec![
                (BinValue::String("P0".into()), particle_event("yone_q_cast")),
                (
                    BinValue::String("P1".into()),
                    particle_event("nothing_maps_here"),
                ),
            ],
        );
        let payload = collect_clip(&donor, &clip_path(0)).unwrap();

        assert_eq!(payload.systems.len(), 1, "the resolvable one still ports");
        assert_eq!(
            payload.unresolved_effect_keys,
            vec![format!("0x{:08x}", fnv1a("nothing_maps_here"))],
            "the dangling key is surfaced, not swallowed"
        );

        // And the port still lands.
        let mut target = target_bins(Vec::new());
        land(&mut target, &payload, &payload.name);
        assert_eq!(clip_keys(&mut target).len(), 1);
    }

    // ---- 4. unmodelled fields survive --------------------------------------

    #[test]
    fn an_unmodelled_sibling_field_survives_the_port() {
        let donor = donor_bins("yone_q_cast", vec![(
            BinValue::String("P0".into()),
            particle_event("yone_q_cast"),
        )]);
        let payload = collect_clip(&donor, &clip_path(0)).unwrap();
        let mut target = target_bins(Vec::new());
        land(&mut target, &payload, &payload.name);

        let landed = walk_steps(&mut target[0].entries[1], &clip_path(0).steps).expect("clip");
        let BinValue::Pointer { fields, .. } = landed else {
            panic!("expected a pointer, got {landed:?}");
        };
        assert_eq!(
            fields.get(&fnv1a("mTickDuration")),
            Some(&BinValue::F32(0.25)),
            "a field `anim_graph` does not model must survive the port"
        );

        // The event's own unmodelled field too.
        let event = walk_steps(&mut target[0].entries[1], &event_path(0, 0).steps).expect("event");
        let BinValue::Pointer { fields, .. } = event else {
            panic!("expected a pointer, got {event:?}");
        };
        assert_eq!(
            fields.get(&fnv1a("mIsKillEvent")),
            Some(&BinValue::Bool(true))
        );
    }

    // ---- 5. a colliding name uniquifies ------------------------------------

    #[test]
    fn a_colliding_clip_name_uniquifies_rather_than_erroring() {
        let donor = donor_bins("yone_q_cast", vec![(
            BinValue::String("P0".into()),
            particle_event("yone_q_cast"),
        )]);
        let payload = collect_clip(&donor, &clip_path(0)).unwrap();

        // The target already holds a clip keyed by the SAME name, stored as its
        // hash - the spelling that a naive literal comparison would miss.
        let mut target = target_bins(vec![(
            BinValue::Hash(fnv1a("Spell1")),
            pointer("AtomicClipData", vec![anm("existing.anm")]),
        )]);
        let landed = land(&mut target, &payload, "Spell1");
        assert_eq!(landed, "Spell1_2");

        let keys = clip_keys(&mut target);
        assert_eq!(keys.len(), 2, "nothing was overwritten");
        assert_eq!(keys[0], format!("0x{:08x}", fnv1a("Spell1")));
        assert_eq!(keys[1], format!("0x{:08x}", fnv1a("Spell1_2")));
    }

    // ---- 6. a failed precondition leaves the target untouched --------------

    #[test]
    fn a_bad_donor_path_fails_before_the_target_is_touched() {
        let donor = donor_bins("yone_q_cast", vec![(
            BinValue::String("P0".into()),
            particle_event("yone_q_cast"),
        )]);
        let mut target = target_bins(Vec::new());
        let before = format!("{:?}", target);

        // Out of range in the map.
        assert!(collect_clip(&donor, &clip_path(9)).is_err());
        // Not a map position at all.
        let not_a_map_entry = VfxPath {
            bin: 0,
            entry: 1,
            steps: vec![Step::Field {
                field: fnv1a("mClipDataMap"),
            }],
        };
        assert!(collect_clip(&donor, &not_a_map_entry).is_err());
        // A bin index that does not exist.
        assert!(collect_clip(
            &donor,
            &VfxPath {
                bin: 9,
                entry: 0,
                steps: clip_path(0).steps,
            }
        )
        .is_err());

        assert_eq!(
            format!("{:?}", target),
            before,
            "a failed precondition must leave the target byte-identical"
        );
        // And the clip map is still empty.
        assert!(clip_keys(&mut target).is_empty());
    }

    // ---- 7. the ported clip round-trips through the read layer -------------

    #[test]
    fn the_ported_clip_round_trips_with_its_events() {
        let donor = donor_bins("yone_q_cast", vec![(
            BinValue::String("P0".into()),
            particle_event("yone_q_cast"),
        )]);
        let payload = collect_clip(&donor, &clip_path(0)).unwrap();
        let mut target = target_bins(Vec::new());
        land(&mut target, &payload, &payload.name);

        let clips = resolve_clip_graph(&target);
        // The donor key was a String, so the name came across as text; the
        // target's map is hash-keyed, so the read layer falls back to the `.anm`
        // stem. Either way it is the only clip and it kept its event.
        assert_eq!(clips.len(), 1, "got {:?}", clips.iter().map(|c| &c.name).collect::<Vec<_>>());
        let clip = &clips[0];
        assert_eq!(
            clip.anm_path.as_deref(),
            Some("ASSETS/Characters/Yone/Animations/spell1.anm")
        );
        assert_eq!(clip.all_events.len(), 1);
        match &clip.all_events[0].kind {
            AnimEventKind::Particle {
                effect_key,
                start_frame,
                ..
            } => {
                assert_eq!(
                    effect_key.as_deref(),
                    Some(format!("0x{:08x}", fnv1a("yone_q_cast")).as_str())
                );
                assert_eq!(*start_frame, Some(3.0));
            }
            other => panic!("expected a particle event, got {other:?}"),
        }
    }

    // ---- 8. port_event appends without disturbing existing events ----------

    #[test]
    fn porting_one_event_appends_without_disturbing_the_target_clip() {
        let donor = donor_bins("yone_q_cast", vec![(
            BinValue::String("P0".into()),
            particle_event("yone_q_cast"),
        )]);
        let payload = collect_donor_core(
            &donor,
            &event_path(0, 0),
            &hs(),
            |v, h| effect_keys_of_event(v, h),
            "event",
        )
        .unwrap();
        assert_eq!(payload.systems.len(), 1, "the event's system comes along");

        // A target clip that already has an event of its own.
        let mut target = target_bins(vec![(
            BinValue::String("Idle1".into()),
            pointer(
                "AtomicClipData",
                vec![
                    anm("idle1.anm"),
                    (
                        "mEventDataMap",
                        map_of_ptr(vec![(
                            BinValue::String("Existing".into()),
                            pointer(
                                "SoundEventData",
                                vec![("mSoundName", BinValue::String("boom".into()))],
                            ),
                        )]),
                    ),
                ],
            ),
        )]);

        let entry = &mut target[0].entries[1];
        let map_steps = ensure_event_map_core(entry, &clip_path(0).steps).unwrap();
        let unique = uniquify_map_name(&payload.name, &taken_map_names(entry, &map_steps));
        append_pair_core(entry, &map_steps, &unique, payload.pair.clone(), "event").unwrap();

        let Some(BinValue::Map { entries, .. }) = walk_steps(&mut target[0].entries[1], &map_steps)
        else {
            panic!("event map");
        };
        assert_eq!(entries.len(), 2, "the existing event is still there");
        assert_eq!(entries[0].0, BinValue::String("Existing".into()));
        assert_eq!(
            entries[1].0,
            BinValue::Hash(fnv1a("P0")),
            "the ported event lands last, keyed to the map's hash type"
        );
        // And its payload is the donor's, verbatim.
        let BinValue::Pointer { fields, class } = &entries[1].1 else {
            panic!("expected a pointer");
        };
        assert_eq!(*class, fnv1a("ParticleEventData"));
        assert_eq!(
            fields.get(&fnv1a("mIsKillEvent")),
            Some(&BinValue::Bool(true))
        );
    }

    // ---- the lookup itself --------------------------------------------------

    /// The effect-key chain must work from BOTH spellings, since `mEffectKey` is
    /// hash-typed in most bins and string-typed in some, and the resolver's key
    /// is likewise either form.
    #[test]
    fn the_effect_key_lookup_matches_both_spellings() {
        let h = hs();
        let bins = donor_bins("yone_q_cast", Vec::new());

        // Text key against a hash-keyed resolver.
        assert_eq!(system_for_effect_key(&bins, &h, "yone_q_cast"), Some((0, 2)));
        // Hash-form key against the same resolver.
        let hex = format!("0x{:08x}", fnv1a("yone_q_cast"));
        assert_eq!(system_for_effect_key(&bins, &h, &hex), Some((0, 2)));
        // Nothing at all.
        assert_eq!(system_for_effect_key(&bins, &h, "no_such_key"), None);

        // With no resolver mapping, the key taken AS the system path still finds
        // it (hand-authored bins routinely omit the mapping).
        let bare = bins_with(Vec::new(), vec![system_entry(SYS_PATH)]);
        assert_eq!(system_for_effect_key(&bare, &h, SYS_PATH), Some((0, 2)));

        // A resolver link that points at a NON-system must not resolve.
        let misdirected = bins_with(
            Vec::new(),
            vec![resolver_entry(vec![(
                BinValue::Hash(fnv1a("k")),
                BinValue::Link(fnv1a(GRAPH_NAME)),
            )])],
        );
        assert_eq!(system_for_effect_key(&misdirected, &h, "k"), None);
    }

    /// A system already resident in the target is not ported a second time.
    #[test]
    fn an_already_resident_system_is_not_duplicated() {
        let donor = donor_bins("yone_q_cast", vec![(
            BinValue::String("P0".into()),
            particle_event("yone_q_cast"),
        )]);
        let payload = collect_clip(&donor, &clip_path(0)).unwrap();

        // The target already owns the very same system.
        let mut target = bins_with(
            Vec::new(),
            vec![system_entry(SYS_PATH), resolver_entry(Vec::new())],
        );
        land(&mut target, &payload, &payload.name);

        let h = hs();
        let count = target[0]
            .entries
            .iter()
            .filter(|e| e.class_hash == h.vfx_system_definition_data)
            .count();
        assert_eq!(count, 1, "the resident system must not be duplicated");
    }
}
