//! Batch-split VFX — destructively rewrites a VFX BIN so each emitter becomes
//! its own `REC_`-wrapped trigger system, for viewing separated VFX in League
//! Director replays. 1:1 port of old quartz_cli `batch_split_vfx.rs`,
//! retargeted from `ltk_meta`'s `property::values::*` builders onto ritoshark's
//! flat `BinValue`.
//!
//! ltk → ritoshark value mapping:
//! - `values::F32/Bool/String::new/from`   → `BinValue::F32/Bool/String`
//! - `values::ObjectLink::new(h)`          → `BinValue::Link(h)`
//! - `PVE::Struct(values::Struct{..})`     → `BinValue::Pointer { class, fields }`
//! - `values::Embedded(values::Struct{..})`→ `BinValue::Embed   { class, fields }`
//! - `Container::Struct  { items }`        → `BinValue::List { item: Pointer, .. }`
//! - `Container::Embedded{ items }`        → `BinValue::List { item: Embed,   .. }`
//! - `BinProperty{name_hash,value}` in an `IndexMap` → `entry.fields` keyed by
//!   the field-name hash (values are `BinValue` directly, no wrapper).
//!
//! CRITICAL: this is destructive. The original always writes a `<stem>_backup.bin`
//! sibling plus a temp copy before rewriting, exactly like the original.

use crate::bin::{read_bin, write_bin};
use crate::error::{Error, Result};
use indexmap::IndexMap;
use ritoshark::bin::{BinEntry, BinType, BinValue};
use ritoshark::hash::fnv1a as h;
use std::fs;
use std::path::Path;

type Fields = IndexMap<u32, BinValue>;

/// A `ValueFloat { constantValue: <v> }` embedded struct.
fn make_value_float(v: f32) -> BinValue {
    let constant_hash = h("constantValue");
    let mut fields: Fields = IndexMap::new();
    fields.insert(constant_hash, BinValue::F32(v));
    BinValue::Embed {
        class: h("ValueFloat"),
        fields,
    }
}

/// Read `emitterName` (a String field) off an emitter Pointer/Embed value.
fn get_emitter_name(emitter: &BinValue) -> Option<String> {
    let fields = match emitter {
        BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => fields,
        _ => return None,
    };
    match fields.get(&h("emitterName")) {
        Some(BinValue::String(s)) => Some(s.clone()),
        _ => None,
    }
}

/// Derive a short display name for a VFX system, from `particleName` /
/// `particlePath`, trimming `Base_` / `SkinNN_` prefixes and capping at 25
/// chars. Mirrors the original's regex parity.
fn get_system_short_name(entry: &BinEntry) -> String {
    let read_str = |field: u32| -> Option<String> {
        match entry.fields.get(&field) {
            Some(BinValue::String(s)) => Some(s.clone()),
            _ => None,
        }
    };

    let mut name = read_str(h("particleName"))
        .or_else(|| read_str(h("particlePath")))
        .unwrap_or_else(|| format!("{:08x}", entry.path_hash));

    if let Some(last) = name.rsplit('/').next() {
        name = last.to_string();
    }

    let mut short = name.as_str();
    if let Some(first_underscore) = short.find('_') {
        let prefix = &short[..first_underscore];
        let rest = &short[(first_underscore + 1)..];
        if prefix.chars().all(|c| c.is_ascii_alphabetic()) {
            if let Some(rest2) = rest.strip_prefix("Base_") {
                short = rest2;
            } else if let Some(rest2) = rest.strip_prefix("Skin") {
                let digits: String = rest2.chars().take_while(|c| c.is_ascii_digit()).collect();
                let after_digits = &rest2[digits.len()..];
                if !digits.is_empty() && after_digits.starts_with('_') {
                    short = &after_digits[1..];
                }
            }
        }
    }

    let mut out = short.to_string();
    if out.len() > 25 {
        out.truncate(25);
    }
    out
}

/// Build the `VfxEmitterDefinitionData` trigger emitter that fires the wrapper
/// system named `trigger_name`.
fn make_trigger_emitter(trigger_name: &str, emitter_name_original: &str, count: usize) -> BinValue {
    let effect_link_hash = h(trigger_name);

    // childrenIdentifiers: [ VfxChildIdentifier { effect: Link(<trigger>) } ]
    let mut child_identifier_fields: Fields = IndexMap::new();
    child_identifier_fields.insert(h("effect"), BinValue::Link(effect_link_hash));
    let child_identifier = BinValue::Embed {
        class: h("VfxChildIdentifier"),
        fields: child_identifier_fields,
    };
    let children_identifiers = BinValue::List {
        is_list2: false,
        item: BinType::Embed,
        items: vec![child_identifier],
    };

    // childParticleSetDefinition: VfxChildParticleSetDefinitionData { childrenIdentifiers }
    let mut child_particle_set_fields: Fields = IndexMap::new();
    child_particle_set_fields.insert(h("childrenIdentifiers"), children_identifiers);
    let child_particle_set = BinValue::Pointer {
        class: h("VfxChildParticleSetDefinitionData"),
        fields: child_particle_set_fields,
    };

    let mut fields: Fields = IndexMap::new();
    fields.insert(h("isSingleParticle"), BinValue::Bool(true));
    fields.insert(h("childParticleSetDefinition"), child_particle_set);
    fields.insert(h("bindWeight"), make_value_float(1.0));
    fields.insert(h("particleIsLocalOrientation"), BinValue::Bool(true));
    fields.insert(h("rate"), make_value_float(1.0));
    fields.insert(
        h("emitterName"),
        BinValue::String(format!("Trigger_{}_{}", count, emitter_name_original)),
    );

    BinValue::Pointer {
        class: h("VfxEmitterDefinitionData"),
        fields,
    }
}

/// Build the wrapper `VfxSystemDefinitionData` entry holding the original
/// emitter, keyed by `fnv1a(trigger_name)`.
fn make_wrapper_system(trigger_name: &str, original_emitter: BinValue) -> BinEntry {
    let path_hash = h(trigger_name);

    let emitter_list = BinValue::List {
        is_list2: false,
        item: BinType::Pointer,
        items: vec![original_emitter],
    };

    let mut fields: Fields = IndexMap::new();
    fields.insert(h("complexEmitterDefinitionData"), emitter_list);
    fields.insert(
        h("particleName"),
        BinValue::String(trigger_name.to_string()),
    );
    fields.insert(
        h("particlePath"),
        BinValue::String(trigger_name.to_string()),
    );

    BinEntry {
        path_hash,
        class_hash: h("VfxSystemDefinitionData"),
        fields,
    }
}

/// Result of a batch split.
#[derive(Debug, Clone, Default)]
pub struct BatchSplitResult {
    pub emitters_split: usize,
    pub wrapper_entries: usize,
    /// The `<stem>_backup.bin` written next to the target.
    pub backup_path: std::path::PathBuf,
}

/// Rewrite `bin_path` so each emitter of every VFX system becomes its own
/// `REC_`-wrapped trigger system. Writes a `<stem>_backup.bin` sibling and a
/// temp copy first. Returns the split counts.
///
/// Unlike the original CLI this does NOT prompt on stdin — the destructive
/// confirmation is expected to have happened in the UI / caller.
pub fn run(bin_path: &Path) -> Result<BatchSplitResult> {
    // Temp backup (best-effort) + the local <stem>_backup.bin the user restores.
    let temp_backup = std::env::temp_dir().join(format!(
        "{}_quartz_temp_{}.bin",
        bin_path.file_stem().unwrap_or_default().to_string_lossy(),
        std::process::id()
    ));
    let _ = fs::copy(bin_path, &temp_backup);

    let local_backup = bin_path
        .parent()
        .ok_or_else(|| Error::InvalidInput("Target bin has no parent directory".to_string()))?
        .join(format!(
            "{}_backup.bin",
            bin_path.file_stem().unwrap_or_default().to_string_lossy()
        ));
    fs::copy(bin_path, &local_backup).map_err(|e| Error::io_with_path(e, &local_backup))?;

    let data = fs::read(bin_path).map_err(|e| Error::io_with_path(e, bin_path))?;
    let mut bin =
        read_bin(&data).map_err(|e| Error::InvalidInput(format!("Failed to parse BIN: {}", e)))?;

    let vfx_type_hash = h("VfxSystemDefinitionData");
    let complex_emitter_hash = h("complexEmitterDefinitionData");

    // Index of every VFX system entry.
    let vfx_indices: Vec<usize> = bin
        .entries
        .iter()
        .enumerate()
        .filter(|(_, e)| e.class_hash == vfx_type_hash)
        .map(|(i, _)| i)
        .collect();

    if vfx_indices.is_empty() {
        return Err(Error::InvalidInput(
            "No VFX systems found in this BIN".to_string(),
        ));
    }

    let mut new_entries: Vec<BinEntry> = Vec::new();
    let mut total_emitters = 0usize;

    for idx in vfx_indices {
        let short_name = get_system_short_name(&bin.entries[idx]);

        // The system's complexEmitterDefinitionData must be a List of emitter
        // Pointers. Clone the originals, build triggers + wrappers, then
        // replace the system's emitter list with the triggers.
        let original_emitters: Vec<BinValue> = match bin.entries[idx].fields.get(&complex_emitter_hash) {
            Some(BinValue::List { items, .. }) if !items.is_empty() => items.clone(),
            _ => continue,
        };

        let mut triggers: Vec<BinValue> = Vec::with_capacity(original_emitters.len());
        for (i, emitter) in original_emitters.iter().enumerate() {
            let emitter_name =
                get_emitter_name(emitter).unwrap_or_else(|| format!("Emitter_{}", i + 1));
            let trigger_name = format!("REC_{}_{}", short_name, emitter_name);

            triggers.push(make_trigger_emitter(&trigger_name, &emitter_name, i + 1));
            new_entries.push(make_wrapper_system(&trigger_name, emitter.clone()));
            total_emitters += 1;
        }

        // Overwrite the system's emitter list with the trigger emitters,
        // preserving the list's tag.
        if let Some(BinValue::List { items, .. }) =
            bin.entries[idx].fields.get_mut(&complex_emitter_hash)
        {
            *items = triggers;
        }
    }

    let wrapper_entries = new_entries.len();
    bin.entries.extend(new_entries);

    let bytes =
        write_bin(&bin).map_err(|e| Error::InvalidInput(format!("Failed to serialize BIN: {}", e)))?;
    fs::write(bin_path, bytes).map_err(|e| Error::io_with_path(e, bin_path))?;

    Ok(BatchSplitResult {
        emitters_split: total_emitters,
        wrapper_entries,
        backup_path: local_backup,
    })
}
