//! The VFX porting operations. Every op follows the same shape: locate and
//! validate FIRST (no mutation on a precondition miss), capture the undo
//! frame, mutate through an infallible-or-validate-first core helper, mark
//! the touched bins dirty, push the frame, reproject. Cross-session ports are
//! two-phase: read + clone from the donor session, release its guard, then
//! mutate the target — two registry guards are never held at once.
//!
//! The core mutation helpers are plain `BinEntry`/`Bin` functions so the unit
//! tests can drive them on synthetic bins without a session registry.

use super::construct::{self, ChildParams, PersistentPayload};
use super::path::{walk_steps, Step, VfxPath};
use super::project::{self, VfxPortModel};
use super::schema::{hash_or_hex, Hashes};
use super::session::{self, LoadedBin, SessionId, VfxSession};
use crate::error::{Error, Result};
use indexmap::IndexMap;
use ritoshark::bin::{BinEntry, BinType, BinValue};
use serde::Serialize;
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortEmittersResult {
    pub model: VfxPortModel,
    pub ported: Vec<String>,
    pub asset_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortSystemResult {
    pub model: VfxPortModel,
    pub system_key: String,
    pub final_name: String,
    pub asset_paths: Vec<String>,
}

// ── Ops ──────────────────────────────────────────────────────────────────────

/// Create a fresh VFX system named `name`, uniquified against every resident
/// bin, pushed into the VFX-owning bin, and registered in the resolver
/// (created in the main bin when none exists).
pub fn create_system(id: SessionId, name: &str) -> Result<VfxPortModel> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(Error::InvalidInput(
            "System name cannot be empty".to_string(),
        ));
    }
    session::with_session(id, |s| -> Result<VfxPortModel> {
        let h = Hashes::new();

        // The name is the path, verbatim (the old tool wrote `"test" = "test"`);
        // the effectKey -> resolver -> entry chain stays consistent because
        // every hash derives from this one string.
        let (names, hashes) = existing_system_names(s, &h);
        let unique_path = uniquify_name(&name, &names, &hashes);
        let final_name = unique_path
            .rsplit('/')
            .next()
            .unwrap_or(&unique_path)
            .to_string();

        // Validate the resolver up front so nothing can fail after capture.
        let resolver = find_resolver(s, &h);
        if let Some((rb, re)) = resolver {
            resolver_map_ok(&s.bins[rb].tree.entries[re], &h)?;
        }

        let target_bin = vfx_owner_bin(s, &h);
        let resolver_bin = resolver.map(|(b, _)| b).unwrap_or(0);
        tracing::info!(
            "vfx create_system: name={:?} path={:?} target_bin={} ({}) resolver_bin={:?} bins={}",
            final_name,
            unique_path,
            target_bin,
            s.bins
                .get(target_bin)
                .map(|b| b.path.display().to_string())
                .unwrap_or_default(),
            resolver.map(|(b, _)| b),
            s.bins.len()
        );
        let mut touched = vec![target_bin];
        if !touched.contains(&resolver_bin) {
            touched.push(resolver_bin);
        }
        let frame = s.capture_tree(&touched);

        // Insert new systems at the top so they render first in the list.
        s.bins[target_bin]
            .tree
            .entries
            .insert(0, construct::new_vfx_system(&final_name, &unique_path));
        s.mark_dirty(target_bin);

        let short_key = construct::derive_short_key(&unique_path, &final_name);
        match resolver {
            Some((rb, re)) => {
                resolver_upsert_core(
                    &mut s.bins[rb].tree.entries[re],
                    &h,
                    &short_key,
                    &unique_path,
                )?;
                s.mark_dirty(rb);
            }
            None => {
                s.bins[0]
                    .tree
                    .entries
                    .push(minimal_resolver_entry(&h, &short_key, &unique_path));
                s.mark_dirty(0);
            }
        }
        s.push_frame(frame);
        let model = project::project(s);
        tracing::info!(
            "vfx create_system done: model now has {} systems ({} in target bin)",
            model.systems.len(),
            model
                .systems
                .iter()
                .filter(|sy| sy.bin_index == target_bin)
                .count()
        );
        Ok(model)
    })?
}

/// Clone the selected donor emitters into the target system, preserving which
/// list (complex vs simple) each came from. Returns the referenced asset
/// strings so the frontend can copy them alongside.
pub fn port_emitters(
    target: SessionId,
    donor: SessionId,
    donor_emitters: &[VfxPath],
    target_system: &VfxPath,
) -> Result<PortEmittersResult> {
    if donor_emitters.is_empty() {
        return Err(Error::InvalidInput("No emitters selected".to_string()));
    }

    // Phase 1: read + clone from the donor.
    let cloned =
        session::with_session(donor, |d| -> Result<(Vec<(bool, BinValue)>, Vec<String>)> {
            let h = Hashes::new();
            let mut clones = Vec::with_capacity(donor_emitters.len());
            let mut assets = HashSet::new();
            for p in donor_emitters {
                let entry = d
                    .bins
                    .get(p.bin)
                    .and_then(|b| b.tree.entries.get(p.entry))
                    .ok_or_else(|| {
                        Error::InvalidInput("Donor emitter no longer resolves".to_string())
                    })?;
                let (complex, value) = clone_emitter_core(entry, &p.steps, &h)?;
                collect_asset_strings(&value, &mut assets);
                clones.push((complex, value));
            }
            let mut assets: Vec<String> = assets.into_iter().collect();
            assets.sort();
            Ok((clones, assets))
        })?;
    let (clones, asset_paths) = cloned?;

    // Phase 2: mutate the target system.
    session::with_session(target, |s| -> Result<PortEmittersResult> {
        let h = Hashes::new();
        if !target_system.steps.is_empty() {
            return Err(Error::InvalidInput(
                "Target system path must address a top-level entry".to_string(),
            ));
        }
        {
            let entry = s
                .bins
                .get(target_system.bin)
                .and_then(|b| b.tree.entries.get(target_system.entry))
                .ok_or_else(|| {
                    Error::InvalidInput("Target system no longer resolves".to_string())
                })?;
            if entry.class_hash != h.vfx_system_definition_data {
                return Err(Error::InvalidInput(
                    "Target entry is not a VFX system".to_string(),
                ));
            }
        }
        let frame = s.capture(&[(target_system.bin, vec![target_system.entry])]);
        let entry = &mut s.bins[target_system.bin].tree.entries[target_system.entry];
        let ported = push_emitters_core(entry, &h, clones)?;
        s.mark_dirty(target_system.bin);
        s.push_frame(frame);
        Ok(PortEmittersResult {
            model: project::project(s),
            ported,
            asset_paths,
        })
    })?
}

/// Clone a whole donor system into the target. `preserve_name` keeps the
/// donor's particleName/particlePath (uniquified only on collision); otherwise
/// the clone is renamed to `desired_name`. The clone's `path_hash` follows the
/// final particle path (fnv1a) and the resolver links to the same hash.
pub fn port_system(
    target: SessionId,
    donor: SessionId,
    donor_system: &VfxPath,
    desired_name: Option<&str>,
    preserve_name: bool,
) -> Result<PortSystemResult> {
    // Phase 1: clone the donor entry and collect its asset strings.
    let cloned = session::with_session(
        donor,
        |d| -> Result<(BinEntry, Vec<String>, Vec<(BinValue, BinValue)>)> {
            let h = Hashes::new();
            if !donor_system.steps.is_empty() {
                return Err(Error::InvalidInput(
                    "Donor system path must address a top-level entry".to_string(),
                ));
            }
            let entry = d
                .bins
                .get(donor_system.bin)
                .and_then(|b| b.tree.entries.get(donor_system.entry))
                .ok_or_else(|| {
                    Error::InvalidInput("Donor system no longer resolves".to_string())
                })?;
            if entry.class_hash != h.vfx_system_definition_data {
                return Err(Error::InvalidInput(
                    "Donor entry is not a VFX system".to_string(),
                ));
            }
            let clone = entry.clone();
            let mut set = HashSet::new();
            for (_k, v) in &clone.fields {
                collect_asset_strings(v, &mut set);
            }
            let mut assets: Vec<String> = set.into_iter().collect();
            assets.sort();
            let resolver_entries = resolver_entries_for_system_hash(&d.bins, &h, clone.path_hash);
            Ok((clone, assets, resolver_entries))
        },
    )?;
    let (mut clone, asset_paths, donor_resolver_entries) = cloned?;

    // Phase 2: rename/uniquify, insert, register.
    session::with_session(target, |s| -> Result<PortSystemResult> {
        let h = Hashes::new();
        let (names, hashes) = existing_system_names(s, &h);
        let donor_name = entry_string_field(&clone, h.particle_name);
        let donor_path = entry_string_field(&clone, h.particle_path);

        // In preserve mode, old Port2 copied donor ResourceResolver entries as-is
        // for original bins. Only renamed/conflicting systems derive a new entry.
        let (resolver_value, preserved_resolver_entries, final_name) = if preserve_name {
            match donor_path.clone().or_else(|| donor_name.clone()) {
                Some(base) => {
                    let unique = uniquify_name(&base, &names, &hashes);
                    if unique != base {
                        clone
                            .fields
                            .insert(h.particle_name, BinValue::String(unique.clone()));
                        clone
                            .fields
                            .insert(h.particle_path, BinValue::String(unique.clone()));
                        clone.path_hash = hash_or_hex(&unique);
                        (Some(unique.clone()), Vec::new(), unique)
                    } else {
                        if hashes.contains(&clone.path_hash) {
                            return Err(Error::InvalidInput(
                                "A system with the same id already exists in the target"
                                    .to_string(),
                            ));
                        }
                        let final_name = donor_name.clone().unwrap_or_else(|| base.clone());
                        let preserved = if donor_resolver_entries.is_empty() {
                            vec![(
                                BinValue::Hash(hash_or_hex(&final_name)),
                                BinValue::Link(hash_or_hex(&final_name)),
                            )]
                        } else {
                            donor_resolver_entries.clone()
                        };
                        (None, preserved, final_name)
                    }
                }
                None => {
                    if hashes.contains(&clone.path_hash) {
                        return Err(Error::InvalidInput(
                            "A system with the same id already exists in the target".to_string(),
                        ));
                    }
                    let preserved = if donor_resolver_entries.is_empty() {
                        Vec::new()
                    } else {
                        donor_resolver_entries.clone()
                    };
                    (None, preserved, format!("{:08x}", clone.path_hash))
                }
            }
        } else {
            let desired = desired_name
                .map(str::trim)
                .filter(|n| !n.is_empty())
                .map(String::from)
                .or_else(|| donor_path.clone())
                .or_else(|| donor_name.clone())
                .unwrap_or_else(|| "NewVFXSystem".to_string());
            let unique = uniquify_name(&desired, &names, &hashes);
            clone
                .fields
                .insert(h.particle_name, BinValue::String(unique.clone()));
            clone
                .fields
                .insert(h.particle_path, BinValue::String(unique.clone()));
            clone.path_hash = hash_or_hex(&unique);
            (Some(unique.clone()), Vec::new(), unique)
        };

        // Validate the resolver before capture so mutation cannot fail.
        let resolver = find_resolver(s, &h);
        if resolver_value.is_some() || !preserved_resolver_entries.is_empty() {
            if let Some((rb, re)) = resolver {
                resolver_map_ok(&s.bins[rb].tree.entries[re], &h)?;
            }
        }

        let target_bin = vfx_owner_bin(s, &h);
        let mut touched = vec![target_bin];
        if resolver_value.is_some() || !preserved_resolver_entries.is_empty() {
            let rb = resolver.map(|(b, _)| b).unwrap_or(0);
            if !touched.contains(&rb) {
                touched.push(rb);
            }
        }
        let frame = s.capture_tree(&touched);

        let system_key = format!("{:08x}", clone.path_hash);
        // Insert ported systems at the top so they render first in the list.
        s.bins[target_bin].tree.entries.insert(0, clone);
        s.mark_dirty(target_bin);

        if !preserved_resolver_entries.is_empty() {
            match resolver {
                Some((rb, re)) => {
                    for (key, value) in &preserved_resolver_entries {
                        resolver_upsert_pair_core(
                            &mut s.bins[rb].tree.entries[re],
                            &h,
                            key,
                            value,
                        )?;
                    }
                    s.mark_dirty(rb);
                }
                None => {
                    s.bins[0]
                        .tree
                        .entries
                        .push(minimal_resolver_entry_from_pairs(
                            &h,
                            &final_name,
                            &preserved_resolver_entries,
                        ));
                    s.mark_dirty(0);
                }
            }
        } else if let Some(path_str) = &resolver_value {
            let short_key = construct::derive_short_key(path_str, &final_name);
            match resolver {
                Some((rb, re)) => {
                    resolver_upsert_core(
                        &mut s.bins[rb].tree.entries[re],
                        &h,
                        &short_key,
                        path_str,
                    )?;
                    s.mark_dirty(rb);
                }
                None => {
                    s.bins[0]
                        .tree
                        .entries
                        .push(minimal_resolver_entry(&h, &short_key, path_str));
                    s.mark_dirty(0);
                }
            }
        }
        s.push_frame(frame);
        Ok(PortSystemResult {
            model: project::project(s),
            system_key,
            final_name,
            asset_paths,
        })
    })?
}

/// Remove one emitter from its parent list (the path's last step must be an
/// index).
pub fn delete_emitter(id: SessionId, emitter: &VfxPath) -> Result<VfxPortModel> {
    session::with_session(id, |s| -> Result<VfxPortModel> {
        let Some((last, parent_steps)) = emitter.steps.split_last() else {
            return Err(Error::InvalidInput(
                "Emitter path must end in a list index".to_string(),
            ));
        };
        let Step::Index { index } = *last else {
            return Err(Error::InvalidInput(
                "Emitter path must end in a list index".to_string(),
            ));
        };
        {
            let entry = emitter.entry_of(&mut s.bins).ok_or_else(|| {
                Error::InvalidInput("Emitter path no longer resolves".to_string())
            })?;
            let ok = matches!(
                walk_steps(entry, parent_steps),
                Some(BinValue::List { items, .. }) if index < items.len()
            );
            if !ok {
                return Err(Error::InvalidInput(
                    "Emitter path no longer resolves".to_string(),
                ));
            }
        }
        let frame = s.capture(&[(emitter.bin, vec![emitter.entry])]);
        let entry = emitter.entry_of(&mut s.bins).expect("validated above");
        if let Some(BinValue::List { items, .. }) = walk_steps(entry, parent_steps) {
            items.remove(index);
        }
        s.mark_dirty(emitter.bin);
        s.push_frame(frame);
        Ok(project::project(s))
    })?
}

/// Remove a whole system entry plus every resolver mapping whose Link targets
/// its path hash.
pub fn delete_system(id: SessionId, system: &VfxPath) -> Result<VfxPortModel> {
    session::with_session(id, |s| -> Result<VfxPortModel> {
        let h = Hashes::new();
        if !system.steps.is_empty() {
            return Err(Error::InvalidInput(
                "System path must address a top-level entry".to_string(),
            ));
        }
        let path_hash = {
            let entry = s
                .bins
                .get(system.bin)
                .and_then(|b| b.tree.entries.get(system.entry))
                .ok_or_else(|| Error::InvalidInput("System no longer resolves".to_string()))?;
            if entry.class_hash != h.vfx_system_definition_data {
                return Err(Error::InvalidInput("Entry is not a VFX system".to_string()));
            }
            entry.path_hash
        };
        let resolver = find_resolver(s, &h);
        let mut touched = vec![system.bin];
        if let Some((rb, _)) = resolver {
            if !touched.contains(&rb) {
                touched.push(rb);
            }
        }
        let frame = s.capture_tree(&touched);

        s.bins[system.bin].tree.entries.remove(system.entry);
        s.mark_dirty(system.bin);
        if let Some((rb, mut re)) = resolver {
            // The removal above shifts later entry indices in the same bin.
            if rb == system.bin && re > system.entry {
                re -= 1;
            }
            let removed = resolver_remove_links(&mut s.bins[rb].tree.entries[re], &h, path_hash);
            if removed > 0 {
                s.mark_dirty(rb);
            }
        }
        s.push_frame(frame);
        Ok(project::project(s))
    })?
}

/// Upsert (Some) or remove (None) the system's `transform: mtx44` field.
pub fn set_matrix(
    id: SessionId,
    system: &VfxPath,
    values: Option<[f32; 16]>,
) -> Result<VfxPortModel> {
    session::with_session(id, |s| -> Result<VfxPortModel> {
        let h = Hashes::new();
        if !system.steps.is_empty() {
            return Err(Error::InvalidInput(
                "System path must address a top-level entry".to_string(),
            ));
        }
        let will_change = {
            let entry = s
                .bins
                .get(system.bin)
                .and_then(|b| b.tree.entries.get(system.entry))
                .ok_or_else(|| Error::InvalidInput("System no longer resolves".to_string()))?;
            if entry.class_hash != h.vfx_system_definition_data {
                return Err(Error::InvalidInput("Entry is not a VFX system".to_string()));
            }
            values.is_some() || entry.fields.contains_key(&h.transform)
        };
        if !will_change {
            return Ok(project::project(s));
        }
        let frame = s.capture(&[(system.bin, vec![system.entry])]);
        set_matrix_core(
            &mut s.bins[system.bin].tree.entries[system.entry],
            &h,
            values,
        );
        s.mark_dirty(system.bin);
        s.push_frame(frame);
        Ok(project::project(s))
    })?
}

/// Set an emitter's `emitterName` string.
pub fn rename_emitter(id: SessionId, emitter: &VfxPath, new_name: &str) -> Result<VfxPortModel> {
    let name = new_name.trim().to_string();
    if name.is_empty() {
        return Err(Error::InvalidInput("Missing emitter name".to_string()));
    }
    session::with_session(id, |s| -> Result<VfxPortModel> {
        let h = Hashes::new();
        {
            let value = emitter.resolve_mut(&mut s.bins).ok_or_else(|| {
                Error::InvalidInput("Emitter path no longer resolves".to_string())
            })?;
            if !matches!(value, BinValue::Pointer { .. } | BinValue::Embed { .. }) {
                return Err(Error::InvalidInput(
                    "Path does not address an emitter".to_string(),
                ));
            }
        }
        let frame = s.capture(&[(emitter.bin, vec![emitter.entry])]);
        if let Some(BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. }) =
            emitter.resolve_mut(&mut s.bins)
        {
            fields.insert(h.emitter_name, BinValue::String(name));
        }
        s.mark_dirty(emitter.bin);
        s.push_frame(frame);
        Ok(project::project(s))
    })?
}

/// Rename a system: update `particleName`/`particlePath`, recompute the
/// entry's path hash, and re-point every resolver mapping that targeted the
/// old hash. The new name is uniquified against every other system.
pub fn rename_system(id: SessionId, system: &VfxPath, new_name: &str) -> Result<VfxPortModel> {
    let desired = new_name.trim().to_string();
    if desired.is_empty() {
        return Err(Error::InvalidInput("Missing system name".to_string()));
    }
    session::with_session(id, |s| -> Result<VfxPortModel> {
        let h = Hashes::new();
        if !system.steps.is_empty() {
            return Err(Error::InvalidInput(
                "System path must address a top-level entry".to_string(),
            ));
        }
        let (old_hash, old_path, old_name) = {
            let entry = s
                .bins
                .get(system.bin)
                .and_then(|b| b.tree.entries.get(system.entry))
                .ok_or_else(|| Error::InvalidInput("System no longer resolves".to_string()))?;
            if entry.class_hash != h.vfx_system_definition_data {
                return Err(Error::InvalidInput("Entry is not a VFX system".to_string()));
            }
            (
                entry.path_hash,
                entry_string_field(entry, h.particle_path),
                entry_string_field(entry, h.particle_name),
            )
        };

        // Keep the old directory prefix when renaming to a bare name.
        let new_path_str = match old_path.as_deref().or(old_name.as_deref()) {
            Some(old) if old.contains('/') && !desired.contains('/') => {
                let prefix = &old[..old.rfind('/').unwrap() + 1];
                format!("{prefix}{desired}")
            }
            _ => desired.clone(),
        };

        // Uniquify against every system except this one.
        let (mut names, mut hashes) = existing_system_names(s, &h);
        if let Some(p) = &old_path {
            names.remove(&p.to_lowercase());
        }
        if let Some(n) = &old_name {
            names.remove(&n.to_lowercase());
        }
        hashes.remove(&old_hash);
        let unique = uniquify_name(&new_path_str, &names, &hashes);
        if hash_or_hex(&unique) == old_hash && old_path.as_deref() == Some(unique.as_str()) {
            return Ok(project::project(s));
        }

        let resolver = find_resolver(s, &h);
        if let Some((rb, re)) = resolver {
            resolver_map_ok(&s.bins[rb].tree.entries[re], &h)?;
        }

        let mut touched = vec![(system.bin, vec![system.entry])];
        if let Some((rb, re)) = resolver {
            if rb == system.bin {
                touched[0].1.push(re);
            } else {
                touched.push((rb, vec![re]));
            }
        }
        let frame = s.capture(&touched);

        let entry = &mut s.bins[system.bin].tree.entries[system.entry];
        entry
            .fields
            .insert(h.particle_name, BinValue::String(unique.clone()));
        entry
            .fields
            .insert(h.particle_path, BinValue::String(unique.clone()));
        entry.path_hash = hash_or_hex(&unique);
        s.mark_dirty(system.bin);

        if let Some((rb, re)) = resolver {
            resolver_remove_links(&mut s.bins[rb].tree.entries[re], &h, old_hash);
            let short_key = construct::derive_short_key(&unique, &unique);
            resolver_upsert_core(&mut s.bins[rb].tree.entries[re], &h, &short_key, &unique)?;
            s.mark_dirty(rb);
        }
        s.push_frame(frame);
        Ok(project::project(s))
    })?
}

/// Append one CharacterIdleEffect per bone to the main bin's
/// SkinCharacterDataProperties (the list is created when missing).
pub fn idle_add(id: SessionId, effect_key: &str, bones: &[String]) -> Result<VfxPortModel> {
    let key = effect_key.trim().to_string();
    if key.is_empty() {
        return Err(Error::InvalidInput("Missing effect key".to_string()));
    }
    if bones.is_empty() {
        return Err(Error::InvalidInput("No bones selected".to_string()));
    }
    session::with_session(id, |s| -> Result<VfxPortModel> {
        let h = Hashes::new();
        let entry_idx = main_skin_props_idx(s, &h)?;
        idle_list_ok(&s.bins[0].tree.entries[entry_idx], &h)?;
        let frame = s.capture(&[(0, vec![entry_idx])]);
        idle_add_core(&mut s.bins[0].tree.entries[entry_idx], &h, &key, bones);
        s.mark_dirty(0);
        s.push_frame(frame);
        Ok(project::project(s))
    })?
}

/// Remove every idle entry whose effectKey hash matches. Matching nothing is
/// a no-op success (no frame pushed).
pub fn idle_remove(id: SessionId, effect_key: &str) -> Result<VfxPortModel> {
    let key = effect_key.trim().to_string();
    if key.is_empty() {
        return Err(Error::InvalidInput("Missing effect key".to_string()));
    }
    session::with_session(id, |s| -> Result<VfxPortModel> {
        let h = Hashes::new();
        let key_hash = hash_or_hex(&key);
        let entry_idx = main_skin_props_idx(s, &h)?;
        if idle_match_count(&s.bins[0].tree.entries[entry_idx], &h, key_hash) == 0 {
            return Ok(project::project(s));
        }
        let frame = s.capture(&[(0, vec![entry_idx])]);
        idle_remove_core(&mut s.bins[0].tree.entries[entry_idx], &h, key_hash);
        s.mark_dirty(0);
        s.push_frame(frame);
        Ok(project::project(s))
    })?
}

/// Add a `_cbdl` child emitter to the host system's complex list. The default
/// emitter name is `<effectKey>_cbdl`, uniquified within the system.
pub fn child_add(
    id: SessionId,
    host_system: &VfxPath,
    params: &ChildParams,
) -> Result<VfxPortModel> {
    session::with_session(id, |s| -> Result<VfxPortModel> {
        let h = Hashes::new();
        if !host_system.steps.is_empty() {
            return Err(Error::InvalidInput(
                "Host system path must address a top-level entry".to_string(),
            ));
        }
        {
            let entry = s
                .bins
                .get(host_system.bin)
                .and_then(|b| b.tree.entries.get(host_system.entry))
                .ok_or_else(|| Error::InvalidInput("Host system no longer resolves".to_string()))?;
            if entry.class_hash != h.vfx_system_definition_data {
                return Err(Error::InvalidInput(
                    "Host entry is not a VFX system".to_string(),
                ));
            }
        }
        let frame = s.capture(&[(host_system.bin, vec![host_system.entry])]);
        child_add_core(
            &mut s.bins[host_system.bin].tree.entries[host_system.entry],
            &h,
            params,
        )?;
        s.mark_dirty(host_system.bin);
        s.push_frame(frame);
        Ok(project::project(s))
    })?
}

/// Overwrite an existing emitter's child fields (rate, lifetime, bindWeight,
/// translation, isSingleParticle, effectKey). The emitter name and any other
/// fields are left untouched.
pub fn child_update(
    id: SessionId,
    emitter: &VfxPath,
    params: &ChildParams,
) -> Result<VfxPortModel> {
    if params.effect_key.trim().is_empty() {
        return Err(Error::InvalidInput("Missing child effect key".to_string()));
    }
    session::with_session(id, |s| -> Result<VfxPortModel> {
        let h = Hashes::new();
        {
            let value = emitter.resolve_mut(&mut s.bins).ok_or_else(|| {
                Error::InvalidInput("Emitter path no longer resolves".to_string())
            })?;
            if !matches!(value, BinValue::Pointer { .. } | BinValue::Embed { .. }) {
                return Err(Error::InvalidInput(
                    "Path does not address an emitter".to_string(),
                ));
            }
        }
        let frame = s.capture(&[(emitter.bin, vec![emitter.entry])]);
        let value = emitter.resolve_mut(&mut s.bins).expect("validated above");
        child_update_core(value, &h, params);
        s.mark_dirty(emitter.bin);
        s.push_frame(frame);
        Ok(project::project(s))
    })?
}

/// Append (index None) or replace (index Some) a persistent condition on the
/// main bin. Replacing with an unknown/raw preset type keeps the existing
/// OwnerCondition subtree verbatim, updating only delays, vfx, and submeshes.
pub fn persistent_upsert(
    id: SessionId,
    index: Option<usize>,
    payload: &PersistentPayload,
) -> Result<VfxPortModel> {
    session::with_session(id, |s| -> Result<VfxPortModel> {
        let h = Hashes::new();
        let entry_idx = main_skin_props_idx(s, &h)?;
        let frame = s.capture(&[(0, vec![entry_idx])]);
        persistent_upsert_core(&mut s.bins[0].tree.entries[entry_idx], &h, index, payload)?;
        s.mark_dirty(0);
        s.push_frame(frame);
        Ok(project::project(s))
    })?
}

/// Remove the persistent condition at `index`.
pub fn persistent_remove(id: SessionId, index: usize) -> Result<VfxPortModel> {
    session::with_session(id, |s| -> Result<VfxPortModel> {
        let h = Hashes::new();
        let entry_idx = main_skin_props_idx(s, &h)?;
        {
            let entry = &s.bins[0].tree.entries[entry_idx];
            match entry.fields.get(&h.persistent_effect_conditions) {
                Some(BinValue::List { items, .. }) if index < items.len() => {}
                _ => {
                    return Err(Error::InvalidInput(format!(
                        "No persistent condition at index {}",
                        index
                    )))
                }
            }
        }
        let frame = s.capture(&[(0, vec![entry_idx])]);
        if let Some(BinValue::List { items, .. }) = s.bins[0].tree.entries[entry_idx]
            .fields
            .get_mut(&h.persistent_effect_conditions)
        {
            items.remove(index);
        }
        s.mark_dirty(0);
        s.push_frame(frame);
        Ok(project::project(s))
    })?
}

/// Upsert a resolver mapping; creates a minimal ResourceResolver entry in the
/// main bin when none exists anywhere (tree frame in that case).
pub fn resolver_upsert_op(id: SessionId, key: &str, value: &str) -> Result<VfxPortModel> {
    let key = key.trim().to_string();
    let value = value.trim().to_string();
    if key.is_empty() || value.is_empty() {
        return Err(Error::InvalidInput(
            "Resolver key and value are required".to_string(),
        ));
    }
    session::with_session(id, |s| -> Result<VfxPortModel> {
        let h = Hashes::new();
        match find_resolver(s, &h) {
            Some((rb, re)) => {
                resolver_map_ok(&s.bins[rb].tree.entries[re], &h)?;
                let frame = s.capture(&[(rb, vec![re])]);
                resolver_upsert_core(&mut s.bins[rb].tree.entries[re], &h, &key, &value)?;
                s.mark_dirty(rb);
                s.push_frame(frame);
            }
            None => {
                let frame = s.capture_tree(&[0]);
                s.bins[0]
                    .tree
                    .entries
                    .push(minimal_resolver_entry(&h, &key, &value));
                s.mark_dirty(0);
                s.push_frame(frame);
            }
        }
        Ok(project::project(s))
    })?
}

// ── Session locators ─────────────────────────────────────────────────────────

/// The bin new systems land in: most VfxSystemDefinitionData entries wins,
/// ties (and no systems anywhere) go to the main bin.
fn vfx_owner_bin(s: &VfxSession, h: &Hashes) -> usize {
    // New systems go into the linked bin whose file name carries "vfx";
    // without one, the main bin. (Matches how skin mods ship a dedicated
    // VFX bin next to the skin bin.)
    let _ = h;
    s.bins
        .iter()
        .position(|b| {
            !matches!(b.role, crate::vfx_session::session::BinRole::Main)
                && b.path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.to_lowercase().contains("vfx"))
        })
        .unwrap_or(0)
}

/// First ResourceResolver across all bins (main bin first).
fn find_resolver(s: &VfxSession, h: &Hashes) -> Option<(usize, usize)> {
    s.entries_by_class(h.resource_resolver).into_iter().next()
}

/// SkinCharacterDataProperties entry index in the MAIN bin.
fn main_skin_props_idx(s: &VfxSession, h: &Hashes) -> Result<usize> {
    s.bins
        .first()
        .and_then(|b| {
            b.tree
                .entries
                .iter()
                .position(|e| e.class_hash == h.skin_character_data_properties)
        })
        .ok_or_else(|| {
            Error::InvalidInput("No SkinCharacterDataProperties in the main bin".to_string())
        })
}

/// Lowercased particleName/particlePath strings plus entry path hashes of
/// every resident system, for collision-free naming.
fn existing_system_names(s: &VfxSession, h: &Hashes) -> (HashSet<String>, HashSet<u32>) {
    let mut names = HashSet::new();
    let mut hashes = HashSet::new();
    for (b, e) in s.entries_by_class(h.vfx_system_definition_data) {
        let entry = &s.bins[b].tree.entries[e];
        hashes.insert(entry.path_hash);
        for f in [h.particle_name, h.particle_path] {
            if let Some(BinValue::String(v)) = entry.fields.get(&f) {
                names.insert(v.to_lowercase());
            }
        }
    }
    (names, hashes)
}

/// Suffix `_2`, `_3`, ... until the candidate collides with neither a known
/// name nor a known entry hash (mirrors generateUniqueSystemName, including
/// its timestamp bail-out past 100 tries).
fn uniquify_name(base: &str, names: &HashSet<String>, hashes: &HashSet<u32>) -> String {
    let taken = |c: &str| names.contains(&c.to_lowercase()) || hashes.contains(&hash_or_hex(c));
    if !taken(base) {
        return base.to_string();
    }
    for counter in 2..=100u32 {
        let candidate = format!("{}_{}", base, counter);
        if !taken(&candidate) {
            return candidate;
        }
    }
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{}_{}", base, ts)
}

// ── Core mutation helpers (session-free, driven by the unit tests) ──────────

/// Validate + clone one donor emitter; reports which list it came from.
fn clone_emitter_core(entry: &BinEntry, steps: &[Step], h: &Hashes) -> Result<(bool, BinValue)> {
    let (field, index) = match steps {
        [Step::Field { field }, Step::Index { index }] => (*field, *index),
        _ => {
            return Err(Error::InvalidInput(
                "Emitter path must address a list element of a system".to_string(),
            ))
        }
    };
    let complex = if field == h.complex_emitter_definition_data {
        true
    } else if field == h.simple_emitter_definition_data {
        false
    } else {
        return Err(Error::InvalidInput(
            "Emitter path is not inside an emitter list".to_string(),
        ));
    };
    let Some(BinValue::List { items, .. }) = entry.fields.get(&field) else {
        return Err(Error::InvalidInput(
            "Donor emitter no longer resolves".to_string(),
        ));
    };
    let value = items
        .get(index)
        .cloned()
        .ok_or_else(|| Error::InvalidInput("Donor emitter no longer resolves".to_string()))?;
    Ok((complex, value))
}

/// Push clones into the target system's complex/simple lists, creating a
/// missing list field. Validates every destination before mutating.
fn push_emitters_core(
    entry: &mut BinEntry,
    h: &Hashes,
    clones: Vec<(bool, BinValue)>,
) -> Result<Vec<String>> {
    for (complex, _) in &clones {
        match entry.fields.get(&emitter_list_field(*complex, h)) {
            None | Some(BinValue::List { .. }) => {}
            Some(_) => {
                return Err(Error::InvalidInput(
                    "The target system's emitter field is not a list".to_string(),
                ))
            }
        }
    }
    let mut ported = Vec::with_capacity(clones.len());
    for (complex, value) in clones {
        ported.push(emitter_display_name(&value, h));
        let list = entry
            .fields
            .entry(emitter_list_field(complex, h))
            .or_insert_with(empty_pointer_list);
        if let BinValue::List { items, .. } = list {
            items.push(value);
        }
    }
    Ok(ported)
}

fn emitter_list_field(complex: bool, h: &Hashes) -> u32 {
    if complex {
        h.complex_emitter_definition_data
    } else {
        h.simple_emitter_definition_data
    }
}

fn empty_pointer_list() -> BinValue {
    BinValue::List {
        is_list2: false,
        item: BinType::Pointer,
        items: Vec::new(),
    }
}

fn emitter_display_name(v: &BinValue, h: &Hashes) -> String {
    match v {
        BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => {
            match fields.get(&h.emitter_name) {
                Some(BinValue::String(s)) => s.clone(),
                _ => "Unnamed".to_string(),
            }
        }
        _ => "Unnamed".to_string(),
    }
}

fn idle_list_ok(entry: &BinEntry, h: &Hashes) -> Result<()> {
    match entry.fields.get(&h.idle_particles_effects) {
        None | Some(BinValue::List { .. }) => Ok(()),
        Some(_) => Err(Error::InvalidInput(
            "idleParticlesEffects is not a list".to_string(),
        )),
    }
}

/// Append one idle effect per bone (idle lists are plain list of embeds).
fn idle_add_core(entry: &mut BinEntry, h: &Hashes, effect_key: &str, bones: &[String]) {
    let list = entry
        .fields
        .entry(h.idle_particles_effects)
        .or_insert_with(|| BinValue::List {
            is_list2: false,
            item: BinType::Embed,
            items: Vec::new(),
        });
    if let BinValue::List { items, .. } = list {
        for bone in bones {
            items.push(construct::new_idle_effect(effect_key, bone));
        }
    }
}

fn idle_item_matches(item: &BinValue, h: &Hashes, key_hash: u32) -> bool {
    match item {
        BinValue::Embed { fields, .. } | BinValue::Pointer { fields, .. } => {
            matches!(fields.get(&h.effect_key), Some(BinValue::Hash(k)) if *k == key_hash)
        }
        _ => false,
    }
}

fn idle_match_count(entry: &BinEntry, h: &Hashes, key_hash: u32) -> usize {
    match entry.fields.get(&h.idle_particles_effects) {
        Some(BinValue::List { items, .. }) => items
            .iter()
            .filter(|i| idle_item_matches(i, h, key_hash))
            .count(),
        _ => 0,
    }
}

fn idle_remove_core(entry: &mut BinEntry, h: &Hashes, key_hash: u32) -> usize {
    let Some(BinValue::List { items, .. }) = entry.fields.get_mut(&h.idle_particles_effects) else {
        return 0;
    };
    let before = items.len();
    items.retain(|i| !idle_item_matches(i, h, key_hash));
    before - items.len()
}

/// Build + append a child emitter, uniquifying its name within the host
/// system (counter goes before the `_cbdl` marker so detection still works).
fn child_add_core(entry: &mut BinEntry, h: &Hashes, params: &ChildParams) -> Result<String> {
    let key = params.effect_key.trim();
    if key.is_empty() {
        return Err(Error::InvalidInput("Missing child effect key".to_string()));
    }
    match entry.fields.get(&h.complex_emitter_definition_data) {
        None | Some(BinValue::List { .. }) => {}
        Some(_) => {
            return Err(Error::InvalidInput(
                "complexEmitterDefinitionData is not a list".to_string(),
            ))
        }
    }
    let existing = system_emitter_names(entry, h);
    let base = params
        .emitter_name
        .clone()
        .unwrap_or_else(|| key.to_string());
    let stem = base.strip_suffix("_cbdl").unwrap_or(&base).to_string();
    let mut name = format!("{}_cbdl", stem);
    let mut counter = 2;
    while existing.contains(&name.to_lowercase()) {
        name = format!("{}_{}_cbdl", stem, counter);
        counter += 1;
    }

    let mut p = params.clone();
    p.effect_key = key.to_string();
    p.emitter_name = Some(name.clone());
    let emitter = construct::new_child_emitter(&p);
    let list = entry
        .fields
        .entry(h.complex_emitter_definition_data)
        .or_insert_with(empty_pointer_list);
    if let BinValue::List { items, .. } = list {
        items.push(emitter);
    }
    Ok(name)
}

fn system_emitter_names(entry: &BinEntry, h: &Hashes) -> HashSet<String> {
    let mut out = HashSet::new();
    for fh in [
        h.complex_emitter_definition_data,
        h.simple_emitter_definition_data,
    ] {
        if let Some(BinValue::List { items, .. }) = entry.fields.get(&fh) {
            for it in items {
                if let BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } = it {
                    if let Some(BinValue::String(s)) = fields.get(&h.emitter_name) {
                        out.insert(s.to_lowercase());
                    }
                }
            }
        }
    }
    out
}

/// Overwrite the child-editable fields; everything else (name,
/// timeBeforeFirstEmission, render flags) stays as the emitter had it.
fn child_update_core(value: &mut BinValue, h: &Hashes, params: &ChildParams) {
    let (BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. }) = value else {
        return;
    };
    fields.insert(
        h.time_before_first_emission,
        BinValue::F32(params.time_before_first_emission),
    );
    fields.insert(h.rate, construct::value_float(params.rate));
    fields.insert(h.particle_lifetime, construct::value_float(params.lifetime));
    fields.insert(h.bind_weight, construct::value_float(params.bind_weight));
    fields.insert(h.translation_override, BinValue::Vec3(params.translation));
    fields.insert(
        h.is_single_particle,
        BinValue::Flag(params.is_single_particle),
    );
    fields.insert(
        h.child_particle_set_definition,
        construct::child_set_definition(params.effect_key.trim()),
    );
}

fn set_matrix_core(entry: &mut BinEntry, h: &Hashes, values: Option<[f32; 16]>) -> bool {
    match values {
        Some(m) => {
            entry.fields.insert(h.transform, BinValue::Mtx44(m));
            true
        }
        None => entry.fields.shift_remove(&h.transform).is_some(),
    }
}

/// Keep a preserved OwnerCondition subtree while applying the payload's
/// delays: an existing DelayedBoolMaterialDriver gets its delays overwritten,
/// a bare driver gets wrapped when delays are nonzero (mirrors
/// preserveRawOwnerCondition intent).
fn preserve_owner_with_delays(
    owner: Option<BinValue>,
    delay_on: f32,
    delay_off: f32,
    h: &Hashes,
) -> Option<BinValue> {
    let mut owner = owner?;
    let is_delayed = matches!(
        &owner,
        BinValue::Pointer { class, .. } | BinValue::Embed { class, .. }
            if *class == h.delayed_bool_material_driver
    );
    if is_delayed {
        if let BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } = &mut owner {
            fields.insert(h.m_delay_on, BinValue::F32(delay_on));
            fields.insert(h.m_delay_off, BinValue::F32(delay_off));
        }
        Some(owner)
    } else if delay_on > 0.0 || delay_off > 0.0 {
        Some(construct::delay_wrapped(owner, delay_on, delay_off))
    } else {
        Some(owner)
    }
}

fn persistent_upsert_core(
    entry: &mut BinEntry,
    h: &Hashes,
    index: Option<usize>,
    payload: &PersistentPayload,
) -> Result<()> {
    match entry.fields.get(&h.persistent_effect_conditions) {
        None | Some(BinValue::List { .. }) => {}
        Some(_) => {
            return Err(Error::InvalidInput(
                "PersistentEffectConditions is not a list".to_string(),
            ))
        }
    }
    match index {
        None => {
            // Build first so a payload error never leaves a half-made list.
            let cond = construct::new_persistent_condition(payload)?;
            let list = entry
                .fields
                .entry(h.persistent_effect_conditions)
                .or_insert_with(|| BinValue::List {
                    is_list2: true,
                    item: BinType::Pointer,
                    items: Vec::new(),
                });
            if let BinValue::List { items, .. } = list {
                items.push(cond);
            }
            Ok(())
        }
        Some(i) => {
            let Some(BinValue::List { items, .. }) =
                entry.fields.get_mut(&h.persistent_effect_conditions)
            else {
                return Err(Error::InvalidInput(format!(
                    "No persistent condition at index {}",
                    i
                )));
            };
            let Some(slot) = items.get_mut(i) else {
                return Err(Error::InvalidInput(format!(
                    "No persistent condition at index {}",
                    i
                )));
            };
            let known = matches!(
                payload.preset.r#type.as_str(),
                "IsAnimationPlaying"
                    | "HasBuffScript"
                    | "LearnedSpell"
                    | "HasGear"
                    | "FloatComparison"
                    | "BuffCounterFloatComparison"
            );
            let new_cond = if known {
                construct::new_persistent_condition(payload)?
            } else {
                let existing_owner = match &*slot {
                    BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => {
                        fields.get(&h.owner_condition).cloned()
                    }
                    _ => None,
                };
                let owner = preserve_owner_with_delays(
                    existing_owner,
                    payload.preset.delay_on,
                    payload.preset.delay_off,
                    h,
                );
                construct::condition_with_owner(payload, owner)?
            };
            *slot = new_cond;
            Ok(())
        }
    }
}

// ── Resolver helpers ─────────────────────────────────────────────────────────

fn resolver_map_ok(entry: &BinEntry, h: &Hashes) -> Result<()> {
    match entry.fields.get(&h.resource_map) {
        None | Some(BinValue::Map { .. }) => Ok(()),
        Some(_) => Err(Error::InvalidInput(
            "Resolver resourceMap is not a map".to_string(),
        )),
    }
}

fn empty_resource_map() -> BinValue {
    BinValue::Map {
        key: BinType::Hash,
        value: BinType::Link,
        entries: Vec::new(),
    }
}

/// Upsert into an existing resolver entry, creating the resourceMap field
/// when missing. Returns true when a new mapping was pushed.
fn resolver_upsert_core(entry: &mut BinEntry, h: &Hashes, key: &str, value: &str) -> Result<bool> {
    resolver_map_ok(entry, h)?;
    let map = entry
        .fields
        .entry(h.resource_map)
        .or_insert_with(empty_resource_map);
    construct::resolver_upsert(map, key, value)
}

fn resolver_upsert_pair_core(
    entry: &mut BinEntry,
    h: &Hashes,
    key: &BinValue,
    value: &BinValue,
) -> Result<bool> {
    resolver_map_ok(entry, h)?;
    let map = entry
        .fields
        .entry(h.resource_map)
        .or_insert_with(empty_resource_map);
    let BinValue::Map { entries, .. } = map else {
        return Err(Error::InvalidInput(
            "Resolver resourceMap is not a map".to_string(),
        ));
    };
    let Some(key_hash) = hashish_value(key) else {
        return Err(Error::InvalidInput(
            "Resolver key is not a hash/link".to_string(),
        ));
    };
    for (existing_key, existing_value) in entries.iter_mut() {
        if hashish_value(existing_key) == Some(key_hash) {
            *existing_value = value.clone();
            return Ok(false);
        }
    }
    entries.push((key.clone(), value.clone()));
    Ok(true)
}

fn resolver_entries_for_system_hash(
    bins: &[LoadedBin],
    h: &Hashes,
    system_hash: u32,
) -> Vec<(BinValue, BinValue)> {
    let mut out = Vec::new();
    for lb in bins {
        for entry in &lb.tree.entries {
            if entry.class_hash != h.resource_resolver {
                continue;
            }
            let Some(BinValue::Map { entries, .. }) = entry.fields.get(&h.resource_map) else {
                continue;
            };
            for (k, v) in entries {
                if hashish_value(v) == Some(system_hash) || hashish_value(k) == Some(system_hash) {
                    out.push((k.clone(), v.clone()));
                }
            }
        }
    }
    out
}

fn hashish_value(v: &BinValue) -> Option<u32> {
    match v {
        BinValue::Hash(x) | BinValue::Link(x) => Some(*x),
        _ => None,
    }
}

/// `"<base>/Resources"` derived from a particle path, mirroring
/// deriveResolverKey / appendMinimalResolver.
fn resolver_entry_name(particle_path: &str) -> String {
    match particle_path.find("/Particles/") {
        Some(idx) => format!("{}/Resources", &particle_path[..idx]),
        None => "Resources".to_string(),
    }
}

fn minimal_resolver_entry(h: &Hashes, key: &str, value: &str) -> BinEntry {
    let mut map = empty_resource_map();
    let _ = construct::resolver_upsert(&mut map, key, value);
    let mut fields = IndexMap::new();
    fields.insert(h.resource_map, map);
    BinEntry {
        path_hash: hash_or_hex(&resolver_entry_name(value)),
        class_hash: h.resource_resolver,
        fields,
    }
}

fn minimal_resolver_entry_from_pairs(
    h: &Hashes,
    seed_name: &str,
    pairs: &[(BinValue, BinValue)],
) -> BinEntry {
    let mut fields = IndexMap::new();
    fields.insert(
        h.resource_map,
        BinValue::Map {
            key: BinType::Hash,
            value: BinType::Link,
            entries: pairs.to_vec(),
        },
    );
    BinEntry {
        path_hash: hash_or_hex(&resolver_entry_name(seed_name)),
        class_hash: h.resource_resolver,
        fields,
    }
}

fn resolver_remove_links(entry: &mut BinEntry, h: &Hashes, target: u32) -> usize {
    let Some(BinValue::Map { entries, .. }) = entry.fields.get_mut(&h.resource_map) else {
        return 0;
    };
    let before = entries.len();
    entries.retain(|(_, v)| !matches!(v, BinValue::Link(l) if *l == target));
    before - entries.len()
}

// ── Misc ─────────────────────────────────────────────────────────────────────

fn entry_string_field(entry: &BinEntry, key: u32) -> Option<String> {
    match entry.fields.get(&key) {
        Some(BinValue::String(s)) => Some(s.clone()),
        _ => None,
    }
}

/// Local copy of `port_donor::collect_assets` (private there): every
/// asset/data string referenced under a value, minus `.bin` links.
fn collect_asset_strings(value: &BinValue, out: &mut HashSet<String>) {
    match value {
        BinValue::String(s) => {
            let lower = s.to_lowercase();
            if (lower.contains("assets/") || lower.contains("data/")) && !lower.ends_with(".bin") {
                out.insert(s.clone());
            }
        }
        BinValue::List { items, .. } => items.iter().for_each(|v| collect_asset_strings(v, out)),
        BinValue::Option {
            value: Some(inner), ..
        } => collect_asset_strings(inner, out),
        BinValue::Map { entries, .. } => {
            for (k, v) in entries {
                collect_asset_strings(k, out);
                collect_asset_strings(v, out);
            }
        }
        BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => {
            for (_k, v) in fields {
                collect_asset_strings(v, out);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bin::write_bin;
    use crate::undo::UndoFrame;
    use crate::vfx_session::construct::{
        PersistentPresetPayload, PersistentVfxPayload, H_M_VALUE_A, H_SPELL_SLOT,
    };
    use ritoshark::bin::Bin;
    use ritoshark::hash::fnv1a;

    fn hs() -> Hashes {
        Hashes::new()
    }

    fn bin_of(entries: Vec<BinEntry>) -> Bin {
        Bin {
            entries,
            ..Bin::new()
        }
    }

    fn bytes(bin: &Bin) -> Vec<u8> {
        write_bin(bin).unwrap()
    }

    fn skin_entry(h: &Hashes) -> BinEntry {
        BinEntry {
            path_hash: 0x11,
            class_hash: h.skin_character_data_properties,
            fields: IndexMap::new(),
        }
    }

    fn system_entry(h: &Hashes, path_hash: u32) -> BinEntry {
        BinEntry {
            path_hash,
            class_hash: h.vfx_system_definition_data,
            fields: IndexMap::new(),
        }
    }

    fn emitter_value(h: &Hashes, name: &str) -> BinValue {
        let mut fields = IndexMap::new();
        fields.insert(h.emitter_name, BinValue::String(name.to_string()));
        BinValue::Pointer {
            class: h.vfx_emitter_definition_data,
            fields,
        }
    }

    fn child_params(effect_key: &str, name: Option<&str>) -> ChildParams {
        ChildParams {
            effect_key: effect_key.to_string(),
            rate: 1.0,
            lifetime: 9999.0,
            bind_weight: 1.0,
            translation: [0.0, 0.0, 0.0],
            is_single_particle: true,
            emitter_name: name.map(String::from),
            time_before_first_emission: 0.0,
        }
    }

    fn preset(t: &str) -> PersistentPresetPayload {
        PersistentPresetPayload {
            r#type: t.to_string(),
            animation_name: Some("Spell1".to_string()),
            script_name: Some("SettQ".to_string()),
            spell_hash: None,
            slot: Some(1),
            operator: Some(4),
            value: Some(2.5),
            delay_on: 0.0,
            delay_off: 0.0,
        }
    }

    fn payload(t: &str) -> PersistentPayload {
        PersistentPayload {
            preset: preset(t),
            vfx: vec![PersistentVfxPayload {
                key: "SomeKey".to_string(),
                bone_name: None,
                scale: None,
                owner_only: None,
                attach_to_camera: None,
                force_render: None,
            }],
            submeshes_show: Vec::new(),
            submeshes_hide: Vec::new(),
        }
    }

    #[test]
    fn create_system_uniquifies_and_registers_resolver() {
        let h = hs();
        let existing = "Characters/Eve/Skins/Skin0/Particles/Eve_Skin0_Q";

        let mut names = HashSet::new();
        names.insert(existing.to_lowercase());
        let mut hashes = HashSet::new();
        hashes.insert(hash_or_hex(existing));

        // Fresh names pass through; a colliding one gets _2, then _3.
        let fresh = "Characters/Eve/Skins/Skin0/Particles/MyFx";
        assert_eq!(uniquify_name(fresh, &names, &hashes), fresh);
        assert_eq!(
            uniquify_name(existing, &names, &hashes),
            format!("{}_2", existing)
        );
        names.insert(format!("{}_2", existing).to_lowercase());
        assert_eq!(
            uniquify_name(existing, &names, &hashes),
            format!("{}_3", existing)
        );
        // A pure hash collision (name unknown, same fnv1a) also bumps.
        let mut hh = HashSet::new();
        hh.insert(hash_or_hex("Foo"));
        assert_eq!(uniquify_name("Foo", &HashSet::new(), &hh), "Foo_2");

        // Resolver registration: resourceMap created when absent, second
        // upsert of the same key replaces instead of duplicating.
        let mut resolver = BinEntry {
            path_hash: 1,
            class_hash: h.resource_resolver,
            fields: IndexMap::new(),
        };
        assert!(resolver_upsert_core(&mut resolver, &h, "MyFx", fresh).unwrap());
        assert!(!resolver_upsert_core(&mut resolver, &h, "MyFx", "elsewhere/MyFx").unwrap());
        let Some(BinValue::Map { entries, .. }) = resolver.fields.get(&h.resource_map) else {
            panic!("resourceMap not created");
        };
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].0, BinValue::Hash(hash_or_hex("MyFx")));
        assert_eq!(entries[0].1, BinValue::Link(hash_or_hex("elsewhere/MyFx")));
        // Non-map resourceMap is rejected.
        let mut bad = BinEntry {
            path_hash: 2,
            class_hash: h.resource_resolver,
            fields: IndexMap::new(),
        };
        bad.fields.insert(h.resource_map, BinValue::F32(0.0));
        assert!(resolver_upsert_core(&mut bad, &h, "a", "b").is_err());
        assert!(construct::resolver_upsert(&mut BinValue::F32(0.0), "a", "b").is_err());

        // Minimal resolver entry derives "<base>/Resources" from the path,
        // and a new system's path_hash equals the resolver Link hash (the
        // cross-reference invariant).
        let minimal = minimal_resolver_entry(&h, "MyFx", fresh);
        assert_eq!(
            minimal.path_hash,
            hash_or_hex("Characters/Eve/Skins/Skin0/Resources")
        );
        assert_eq!(minimal.class_hash, h.resource_resolver);
        let sys = construct::new_vfx_system("MyFx", fresh);
        assert_eq!(sys.path_hash, hash_or_hex(fresh));
        let Some(BinValue::Map { entries, .. }) = minimal.fields.get(&h.resource_map) else {
            panic!("map");
        };
        assert_eq!(entries[0].1, BinValue::Link(sys.path_hash));
        assert_eq!(resolver_entry_name("no_particles_segment"), "Resources");

        // Short-key derivation strips the _Base_ marker like computeMappingValue.
        assert_eq!(
            construct::derive_short_key(
                "Characters/Eve/Skins/Skin0/Particles/Eve_Base_R_mis",
                "Eve_Base_R_mis"
            ),
            "Eve_R_mis"
        );
        assert_eq!(construct::derive_short_key("myfx", "myfx"), "myfx");
    }

    #[test]
    fn preserved_port_copies_matching_donor_resolver_pair() {
        use crate::vfx_session::session::{BinRole, LoadedBin};

        let h = hs();
        let system_path = "Characters/Darius/Skins/Skin15/Particles/Darius_Skin15_darius_Base_hemo_counter_02Minion";
        let system_hash = hash_or_hex(system_path);
        let donor_key = BinValue::Hash(hash_or_hex("darius_hemo_counter_02Minion"));
        let donor_value = BinValue::Link(system_hash);

        let mut resolver_fields = IndexMap::new();
        resolver_fields.insert(
            h.resource_map,
            BinValue::Map {
                key: BinType::Hash,
                value: BinType::Link,
                entries: vec![
                    (
                        BinValue::Hash(hash_or_hex("unrelated")),
                        BinValue::Link(hash_or_hex("elsewhere")),
                    ),
                    (donor_key.clone(), donor_value.clone()),
                ],
            },
        );
        let resolver = BinEntry {
            path_hash: hash_or_hex("Characters/Darius/Skins/Skin15/Resources"),
            class_hash: h.resource_resolver,
            fields: resolver_fields,
        };
        let donor_bins = vec![LoadedBin {
            path: Default::default(),
            role: BinRole::Main,
            tree: bin_of(vec![resolver, system_entry(&h, system_hash)]),
            dirty: false,
            link_str: None,
        }];

        let pairs = resolver_entries_for_system_hash(&donor_bins, &h, system_hash);
        assert_eq!(pairs, vec![(donor_key.clone(), donor_value.clone())]);

        let mut target_resolver = BinEntry {
            path_hash: hash_or_hex("Characters/Evelynn/Skins/Skin0/Resources"),
            class_hash: h.resource_resolver,
            fields: IndexMap::new(),
        };
        resolver_upsert_pair_core(&mut target_resolver, &h, &donor_key, &donor_value).unwrap();
        let Some(BinValue::Map { entries, .. }) = target_resolver.fields.get(&h.resource_map)
        else {
            panic!("resourceMap");
        };
        assert_eq!(entries, &vec![(donor_key, donor_value)]);
    }

    #[test]
    fn port_emitters_clone_into_empty_and_existing_lists() {
        let h = hs();
        let mut donor = system_entry(&h, 1);
        donor.fields.insert(
            h.complex_emitter_definition_data,
            BinValue::List {
                is_list2: false,
                item: BinType::Pointer,
                items: vec![emitter_value(&h, "flames")],
            },
        );
        donor.fields.insert(
            h.simple_emitter_definition_data,
            BinValue::List {
                is_list2: false,
                item: BinType::Pointer,
                items: vec![emitter_value(&h, "glow")],
            },
        );

        let complex_steps = [
            Step::Field {
                field: h.complex_emitter_definition_data,
            },
            Step::Index { index: 0 },
        ];
        let simple_steps = [
            Step::Field {
                field: h.simple_emitter_definition_data,
            },
            Step::Index { index: 0 },
        ];
        let c1 = clone_emitter_core(&donor, &complex_steps, &h).unwrap();
        let c2 = clone_emitter_core(&donor, &simple_steps, &h).unwrap();
        assert!(c1.0);
        assert!(!c2.0);
        // Bad paths error: not an emitter list, index out of range.
        let bad_field = [Step::Field { field: h.transform }, Step::Index { index: 0 }];
        assert!(clone_emitter_core(&donor, &bad_field, &h).is_err());
        let bad_index = [
            Step::Field {
                field: h.complex_emitter_definition_data,
            },
            Step::Index { index: 5 },
        ];
        assert!(clone_emitter_core(&donor, &bad_index, &h).is_err());

        // Empty target: both lists created, each clone lands in its source list.
        let mut target = system_entry(&h, 2);
        let ported = push_emitters_core(&mut target, &h, vec![c1.clone(), c2.clone()]).unwrap();
        assert_eq!(ported, vec!["flames".to_string(), "glow".to_string()]);
        match target.fields.get(&h.complex_emitter_definition_data) {
            Some(BinValue::List {
                is_list2,
                item,
                items,
            }) => {
                assert!(!*is_list2);
                assert_eq!(*item, BinType::Pointer);
                assert_eq!(items.len(), 1);
            }
            other => panic!("expected complex list, got {:?}", other),
        }
        match target.fields.get(&h.simple_emitter_definition_data) {
            Some(BinValue::List { items, .. }) => assert_eq!(items.len(), 1),
            other => panic!("expected simple list, got {:?}", other),
        }

        // Populated target list: appended at the end.
        let mut target2 = system_entry(&h, 3);
        target2.fields.insert(
            h.complex_emitter_definition_data,
            BinValue::List {
                is_list2: false,
                item: BinType::Pointer,
                items: vec![emitter_value(&h, "old")],
            },
        );
        push_emitters_core(&mut target2, &h, vec![c1.clone()]).unwrap();
        match target2.fields.get(&h.complex_emitter_definition_data) {
            Some(BinValue::List { items, .. }) => {
                assert_eq!(items.len(), 2);
                assert_eq!(emitter_display_name(&items[1], &h), "flames");
            }
            other => panic!("expected list, got {:?}", other),
        }

        // Non-list destination errors without mutating.
        let mut bad = system_entry(&h, 4);
        bad.fields
            .insert(h.complex_emitter_definition_data, BinValue::F32(1.0));
        let before = bad.clone();
        assert!(push_emitters_core(&mut bad, &h, vec![c1]).is_err());
        assert_eq!(bad, before);
    }

    #[test]
    fn idle_add_and_remove_with_undo_byte_equal() {
        let h = hs();
        let mut bin = bin_of(vec![skin_entry(&h)]);
        let pristine = bytes(&bin);

        let mut frame = UndoFrame::capture(&bin, [0]);
        idle_list_ok(&bin.entries[0], &h).unwrap();
        idle_add_core(
            &mut bin.entries[0],
            &h,
            "Eve_R_mis",
            &["head".to_string(), "root".to_string()],
        );
        assert_ne!(bytes(&bin), pristine);
        match bin.entries[0].fields.get(&h.idle_particles_effects) {
            Some(BinValue::List {
                is_list2,
                item,
                items,
            }) => {
                assert!(!*is_list2);
                assert_eq!(*item, BinType::Embed);
                assert_eq!(items.len(), 2);
            }
            other => panic!("expected idle list, got {:?}", other),
        }

        // Removing one key drops all its bones and leaves other keys alone.
        idle_add_core(&mut bin.entries[0], &h, "Other_Key", &["head".to_string()]);
        assert_eq!(
            idle_match_count(&bin.entries[0], &h, hash_or_hex("Eve_R_mis")),
            2
        );
        assert_eq!(
            idle_remove_core(&mut bin.entries[0], &h, hash_or_hex("Eve_R_mis")),
            2
        );
        assert_eq!(
            idle_match_count(&bin.entries[0], &h, hash_or_hex("Other_Key")),
            1
        );
        assert_eq!(
            idle_remove_core(&mut bin.entries[0], &h, hash_or_hex("missing")),
            0
        );
        // A non-list field is rejected by validation.
        let mut bad = skin_entry(&h);
        bad.fields
            .insert(h.idle_particles_effects, BinValue::F32(0.0));
        assert!(idle_list_ok(&bad, &h).is_err());

        // Undo restores the pristine bytes despite the extra edits.
        frame.swap_with(&mut bin);
        assert_eq!(bytes(&bin), pristine);
    }

    #[test]
    fn persistent_condition_builds_per_driver_type() {
        let h = hs();
        let owner_of = |cond: &BinValue| -> (u32, IndexMap<u32, BinValue>) {
            let BinValue::Pointer { fields, .. } = cond else {
                panic!("condition pointer")
            };
            match fields.get(&h.owner_condition) {
                Some(BinValue::Pointer { class, fields }) => (*class, fields.clone()),
                other => panic!("owner condition missing: {:?}", other),
            }
        };

        // IsAnimationPlaying: list[hash] with the animation name.
        let (class, fields) =
            owner_of(&construct::new_persistent_condition(&payload("IsAnimationPlaying")).unwrap());
        assert_eq!(class, h.is_animation_playing_dynamic_material_bool_driver);
        match fields.get(&h.m_animation_names) {
            Some(BinValue::List {
                item: BinType::Hash,
                items,
                ..
            }) => {
                assert_eq!(items[0], BinValue::Hash(hash_or_hex("Spell1")));
            }
            other => panic!("expected hash list, got {:?}", other),
        }

        // HasBuffScript without a spell hash uses mScriptName.
        let (class, fields) =
            owner_of(&construct::new_persistent_condition(&payload("HasBuffScript")).unwrap());
        assert_eq!(class, h.has_buff_dynamic_material_bool_driver);
        assert_eq!(
            fields.get(&h.m_script_name),
            Some(&BinValue::String("SettQ".to_string()))
        );
        // With a spell hash it uses Spell instead.
        let mut p = payload("HasBuffScript");
        p.preset.spell_hash = Some("SomeBuff".to_string());
        let (_, fields) = owner_of(&construct::new_persistent_condition(&p).unwrap());
        assert_eq!(
            fields.get(&h.spell),
            Some(&BinValue::Hash(hash_or_hex("SomeBuff")))
        );
        assert!(!fields.contains_key(&h.m_script_name));

        // LearnedSpell / HasGear carry the slot byte.
        let (class, fields) =
            owner_of(&construct::new_persistent_condition(&payload("LearnedSpell")).unwrap());
        assert_eq!(class, h.learned_spell_dynamic_material_bool_driver);
        assert_eq!(fields.get(&h.m_slot), Some(&BinValue::U8(1)));
        let (class, fields) =
            owner_of(&construct::new_persistent_condition(&payload("HasGear")).unwrap());
        assert_eq!(class, h.has_gear_dynamic_material_bool_driver);
        assert_eq!(fields.get(&h.m_gear_index), Some(&BinValue::U8(1)));

        // FloatComparison: SpellRankIntDriver vs FloatLiteral.
        let (class, fields) =
            owner_of(&construct::new_persistent_condition(&payload("FloatComparison")).unwrap());
        assert_eq!(class, h.float_comparison_material_driver);
        assert_eq!(fields.get(&h.m_operator), Some(&BinValue::U32(4)));
        match fields.get(&H_M_VALUE_A) {
            Some(BinValue::Pointer { fields: af, .. }) => {
                assert_eq!(af.get(&H_SPELL_SLOT), Some(&BinValue::U32(1)));
            }
            other => panic!("expected SpellRankIntDriver, got {:?}", other),
        }

        // BuffCounterFloatComparison nests the buff counter as mValueA.
        let mut p = payload("BuffCounterFloatComparison");
        p.preset.spell_hash = Some("SomeStacks".to_string());
        let (class, fields) = owner_of(&construct::new_persistent_condition(&p).unwrap());
        assert_eq!(class, h.float_comparison_material_driver);
        match fields.get(&H_M_VALUE_A) {
            Some(BinValue::Pointer {
                class: ac,
                fields: af,
            }) => {
                assert_eq!(*ac, h.buff_counter_dynamic_material_float_driver);
                assert_eq!(
                    af.get(&h.spell),
                    Some(&BinValue::Hash(hash_or_hex("SomeStacks")))
                );
            }
            other => panic!("expected buff counter, got {:?}", other),
        }

        // Delays wrap the driver in DelayedBoolMaterialDriver.
        let mut p = payload("LearnedSpell");
        p.preset.delay_on = 1.0;
        p.preset.delay_off = 2.0;
        let cond = construct::new_persistent_condition(&p).unwrap();
        let (class, fields) = owner_of(&cond);
        assert_eq!(class, h.delayed_bool_material_driver);
        assert_eq!(fields.get(&h.m_delay_on), Some(&BinValue::F32(1.0)));
        assert_eq!(fields.get(&h.m_delay_off), Some(&BinValue::F32(2.0)));
        assert!(matches!(
            fields.get(&h.m_bool_driver),
            Some(BinValue::Pointer { class, .. }) if *class == h.learned_spell_dynamic_material_bool_driver
        ));
        // Persistent VFX list is list2 of embeds.
        let BinValue::Pointer { fields: cf, .. } = &cond else {
            panic!()
        };
        match cf.get(&h.persistent_vfxs) {
            Some(BinValue::List {
                is_list2: true,
                item: BinType::Embed,
                items,
            }) => {
                assert_eq!(items.len(), 1);
            }
            other => panic!("expected list2 of embeds, got {:?}", other),
        }

        // An empty vfx effect key is rejected.
        let mut bad = payload("IsAnimationPlaying");
        bad.vfx[0].key = "  ".to_string();
        assert!(construct::new_persistent_condition(&bad).is_err());
    }

    #[test]
    fn persistent_upsert_preserves_raw_owner_and_updates_delays() {
        let h = hs();
        let mut unknown_fields = IndexMap::new();
        unknown_fields.insert(fnv1a("mDrivers"), BinValue::F32(1.0));
        let unknown = BinValue::Pointer {
            class: fnv1a("AllTrueMaterialDriver"),
            fields: unknown_fields,
        };

        let mut cond_fields = IndexMap::new();
        cond_fields.insert(h.owner_condition, unknown.clone());
        let cond = BinValue::Pointer {
            class: h.persistent_effect_condition_data,
            fields: cond_fields,
        };
        let mut entry = skin_entry(&h);
        entry.fields.insert(
            h.persistent_effect_conditions,
            BinValue::List {
                is_list2: true,
                item: BinType::Pointer,
                items: vec![cond],
            },
        );

        // Replace index 0 with a raw payload: the unknown subtree survives,
        // nonzero delays wrap it, vfx + submeshes come from the payload.
        let mut raw = payload("raw");
        raw.preset.delay_on = 0.75;
        raw.preset.delay_off = 0.25;
        raw.submeshes_show = vec!["Body".to_string()];
        persistent_upsert_core(&mut entry, &h, Some(0), &raw).unwrap();
        {
            let Some(BinValue::List { items, .. }) =
                entry.fields.get(&h.persistent_effect_conditions)
            else {
                panic!("list");
            };
            let BinValue::Pointer { fields, .. } = &items[0] else {
                panic!("cond")
            };
            let Some(BinValue::Pointer { class, fields: df }) = fields.get(&h.owner_condition)
            else {
                panic!("owner");
            };
            assert_eq!(*class, h.delayed_bool_material_driver);
            assert_eq!(df.get(&h.m_bool_driver), Some(&unknown));
            assert_eq!(df.get(&h.m_delay_on), Some(&BinValue::F32(0.75)));
            assert_eq!(df.get(&h.m_delay_off), Some(&BinValue::F32(0.25)));
            assert!(fields.contains_key(&h.persistent_vfxs));
            assert!(fields.contains_key(&h.submeshes_to_show));
        }

        // Raw upsert again with zero delays: the existing wrapper's delays
        // update in place, its inner driver stays the original subtree.
        let raw0 = payload("raw");
        persistent_upsert_core(&mut entry, &h, Some(0), &raw0).unwrap();
        {
            let Some(BinValue::List { items, .. }) =
                entry.fields.get(&h.persistent_effect_conditions)
            else {
                panic!("list");
            };
            let BinValue::Pointer { fields, .. } = &items[0] else {
                panic!("cond")
            };
            let Some(BinValue::Pointer { class, fields: df }) = fields.get(&h.owner_condition)
            else {
                panic!("owner");
            };
            assert_eq!(*class, h.delayed_bool_material_driver);
            assert_eq!(df.get(&h.m_delay_on), Some(&BinValue::F32(0.0)));
            assert_eq!(df.get(&h.m_bool_driver), Some(&unknown));
        }

        // Appending adds a second condition; a known type replaces the driver
        // outright; out-of-range indices error without mutating.
        persistent_upsert_core(&mut entry, &h, None, &payload("IsAnimationPlaying")).unwrap();
        persistent_upsert_core(&mut entry, &h, Some(1), &payload("LearnedSpell")).unwrap();
        let Some(BinValue::List { items, .. }) = entry.fields.get(&h.persistent_effect_conditions)
        else {
            panic!("list");
        };
        assert_eq!(items.len(), 2);
        assert!(persistent_upsert_core(&mut entry, &h, Some(5), &payload("raw")).is_err());
    }

    #[test]
    fn child_emitter_matches_ts_skeleton_field_for_field() {
        let h = hs();
        let params = child_params("Eve_R_mis", Some("mychild"));
        let v = construct::new_child_emitter(&params);
        let BinValue::Pointer { class, fields } = &v else {
            panic!("pointer emitter")
        };
        assert_eq!(*class, h.vfx_emitter_definition_data);

        // Exact field order of the TS childParticlesManager block.
        let order: Vec<u32> = fields.keys().copied().collect();
        assert_eq!(
            order,
            vec![
                h.time_before_first_emission,
                h.rate,
                h.particle_lifetime,
                h.bind_weight,
                h.translation_override,
                h.child_particle_set_definition,
                h.is_single_particle,
                h.emitter_name,
                h.blend_mode,
                h.pass,
                h.misc_render_flags,
            ]
        );
        assert_eq!(
            fields.get(&h.time_before_first_emission),
            Some(&BinValue::F32(0.0))
        );
        for (fh, expect) in [
            (h.rate, 1.0f32),
            (h.particle_lifetime, 9999.0),
            (h.bind_weight, 1.0),
        ] {
            let Some(BinValue::Embed { class, fields: ef }) = fields.get(&fh) else {
                panic!("ValueFloat embed");
            };
            assert_eq!(*class, h.value_float);
            assert_eq!(ef.get(&h.constant_value), Some(&BinValue::F32(expect)));
        }
        assert_eq!(
            fields.get(&h.translation_override),
            Some(&BinValue::Vec3([0.0, 0.0, 0.0]))
        );
        assert_eq!(
            fields.get(&h.is_single_particle),
            Some(&BinValue::Flag(true))
        );
        assert_eq!(
            fields.get(&h.emitter_name),
            Some(&BinValue::String("mychild_cbdl".to_string()))
        );
        assert_eq!(fields.get(&h.blend_mode), Some(&BinValue::U8(1)));
        assert_eq!(fields.get(&h.pass), Some(&BinValue::I16(9999)));
        assert_eq!(fields.get(&h.misc_render_flags), Some(&BinValue::U8(1)));

        let Some(BinValue::Pointer { class, fields: cf }) =
            fields.get(&h.child_particle_set_definition)
        else {
            panic!("child set pointer");
        };
        assert_eq!(*class, h.vfx_child_particle_set_definition_data);
        let Some(BinValue::List {
            is_list2,
            item,
            items,
        }) = cf.get(&h.children_identifiers)
        else {
            panic!("children list");
        };
        assert!(!*is_list2);
        assert_eq!(*item, BinType::Embed);
        let BinValue::Embed { class, fields: idf } = &items[0] else {
            panic!("identifier")
        };
        assert_eq!(*class, h.vfx_child_identifier);
        assert_eq!(
            idf.get(&h.effect_key),
            Some(&BinValue::Hash(hash_or_hex("Eve_R_mis")))
        );

        // child_add uniquifies within the host system, keeping the marker.
        let mut host = system_entry(&h, 3);
        assert_eq!(
            child_add_core(&mut host, &h, &params).unwrap(),
            "mychild_cbdl"
        );
        assert_eq!(
            child_add_core(&mut host, &h, &params).unwrap(),
            "mychild_2_cbdl"
        );
        // Default name comes from the effect key.
        assert_eq!(
            child_add_core(&mut host, &h, &child_params("Eve_R_mis", None)).unwrap(),
            "Eve_R_mis_cbdl"
        );

        // Update overwrites tracked fields, leaves the rest alone.
        let Some(BinValue::List { items, .. }) =
            host.fields.get_mut(&h.complex_emitter_definition_data)
        else {
            panic!("complex list");
        };
        let mut upd = child_params("OtherKey", None);
        upd.rate = 7.0;
        upd.is_single_particle = false;
        child_update_core(&mut items[0], &h, &upd);
        let BinValue::Pointer { fields, .. } = &items[0] else {
            panic!()
        };
        let Some(BinValue::Embed { fields: rf, .. }) = fields.get(&h.rate) else {
            panic!()
        };
        assert_eq!(rf.get(&h.constant_value), Some(&BinValue::F32(7.0)));
        assert_eq!(
            fields.get(&h.is_single_particle),
            Some(&BinValue::Flag(false))
        );
        assert_eq!(
            fields.get(&h.emitter_name),
            Some(&BinValue::String("mychild_cbdl".to_string()))
        );
        assert_eq!(
            fields.get(&h.time_before_first_emission),
            Some(&BinValue::F32(0.0))
        );
        let Some(BinValue::Pointer { fields: cf, .. }) =
            fields.get(&h.child_particle_set_definition)
        else {
            panic!();
        };
        let Some(BinValue::List { items: ids, .. }) = cf.get(&h.children_identifiers) else {
            panic!()
        };
        let BinValue::Embed { fields: idf, .. } = &ids[0] else {
            panic!()
        };
        assert_eq!(
            idf.get(&h.effect_key),
            Some(&BinValue::Hash(hash_or_hex("OtherKey")))
        );
    }

    #[test]
    fn set_matrix_upserts_and_removes() {
        let h = hs();
        let mut entry = system_entry(&h, 1);
        let m: [f32; 16] = core::array::from_fn(|i| i as f32);
        assert!(set_matrix_core(&mut entry, &h, Some(m)));
        assert_eq!(entry.fields.get(&h.transform), Some(&BinValue::Mtx44(m)));

        let BinValue::Mtx44(ident) = construct::identity_mtx44() else {
            panic!("mtx44")
        };
        assert!(set_matrix_core(&mut entry, &h, Some(ident)));
        assert_eq!(
            entry.fields.get(&h.transform),
            Some(&BinValue::Mtx44(ident))
        );
        assert_eq!(
            entry.fields.len(),
            1,
            "overwrite must not duplicate the field"
        );

        assert!(set_matrix_core(&mut entry, &h, None));
        assert!(!entry.fields.contains_key(&h.transform));
        assert!(!set_matrix_core(&mut entry, &h, None));
    }

    /// Entry-granular frames captured before each core mutation must restore
    /// the whole bin byte-exact; the tree frame covers the entry add/remove
    /// shape delete_system/create_system use.
    #[test]
    fn undo_frames_restore_byte_equal_state() {
        let h = hs();
        let mut bin = bin_of(vec![skin_entry(&h), system_entry(&h, 9)]);
        let pristine = bytes(&bin);

        // Skin entry: idle add + persistent append under one Entries frame.
        let mut f1 = UndoFrame::capture(&bin, [0]);
        idle_add_core(&mut bin.entries[0], &h, "K", &["head".to_string()]);
        persistent_upsert_core(
            &mut bin.entries[0],
            &h,
            None,
            &payload("IsAnimationPlaying"),
        )
        .unwrap();
        assert_ne!(bytes(&bin), pristine);
        f1.swap_with(&mut bin);
        assert_eq!(bytes(&bin), pristine);

        // System entry: emitter push + matrix upsert + child add.
        let mut f2 = UndoFrame::capture(&bin, [1]);
        push_emitters_core(
            &mut bin.entries[1],
            &h,
            vec![(true, emitter_value(&h, "e1"))],
        )
        .unwrap();
        set_matrix_core(&mut bin.entries[1], &h, Some([0.5; 16]));
        child_add_core(&mut bin.entries[1], &h, &child_params("K", None)).unwrap();
        assert_ne!(bytes(&bin), pristine);
        f2.swap_with(&mut bin);
        assert_eq!(bytes(&bin), pristine);

        // Tree frame around entry removal + resolver-link cleanup
        // (the delete_system shape).
        let path = "Characters/X/Skins/Skin0/Particles/Fx";
        let sys = construct::new_vfx_system("Fx", path);
        let sys_hash = sys.path_hash;
        let resolver = minimal_resolver_entry(&h, "Fx", path);
        let mut bin2 = bin_of(vec![resolver, sys]);
        let pristine2 = bytes(&bin2);
        let mut f3 = UndoFrame::Tree(Box::new(bin2.clone()));
        bin2.entries.remove(1);
        assert_eq!(resolver_remove_links(&mut bin2.entries[0], &h, sys_hash), 1);
        assert_ne!(bytes(&bin2), pristine2);
        f3.swap_with(&mut bin2);
        assert_eq!(bytes(&bin2), pristine2);
    }
}
