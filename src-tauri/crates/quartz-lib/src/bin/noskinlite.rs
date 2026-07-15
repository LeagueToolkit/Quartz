//! NoSkinLite — clone a source skin BIN into `skin0.bin`..`skin99.bin`,
//! rekeying the `SkinCharacterDataProperties` / `ResourceResolver` entries and
//! fixing the `mResourceResolver` reference so each clone resolves to its own
//! skin index. 1:1 port of old quartz_cli `noskinlite.rs`, retargeted from
//! `ltk_meta` onto ritoshark's `Bin`.
//!
//! ltk → ritoshark mapping: `bin.objects.shift_remove/insert` +
//! `obj.path_hash` → mutate the matching `BinEntry.path_hash` in `bin.entries`;
//! `obj.properties` → `entry.fields`; `PropertyValueEnum::{String,ObjectLink}` →
//! `BinValue::{String,Link}`; `BinProperty{name_hash,value}` → an
//! `entry.fields` insert keyed by the field hash.

use crate::bin::{read_bin, write_bin};
use crate::error::{Error, Result};
use rayon::prelude::*;
use ritoshark::bin::{Bin, BinValue};
use ritoshark::hash::fnv1a;
use std::fs;
use std::path::Path;

/// Parse `(champion, skin_index)` out of a path like
/// `.../characters/<champ>/skins/skin<N>...`.
fn parse_skin_info(path: &Path) -> (String, u32) {
    let s = path.to_string_lossy().replace('\\', "/").to_lowercase();
    let marker = "/characters/";
    if let Some(champ_start) = s.find(marker) {
        let rest = &s[(champ_start + marker.len())..];
        if let Some(champ_end) = rest.find('/') {
            let champ = rest[..champ_end].to_string();
            let rest2 = &rest[champ_end..];
            let skin_marker = "/skins/skin";
            if let Some(skin_start) = rest2.find(skin_marker) {
                let digits = &rest2[(skin_start + skin_marker.len())..];
                let idx: String = digits.chars().take_while(|c| c.is_ascii_digit()).collect();
                if let Ok(parsed) = idx.parse::<u32>() {
                    return (champ, parsed);
                }
            }
            return (champ, 0);
        }
    }
    ("unknown".to_string(), 0)
}

/// Change the `path_hash` of the entry currently keyed by `old_key` to
/// `new_key`, in place. No-op when the keys match.
fn rekey_entry(bin: &mut Bin, old_key: u32, new_key: u32) -> Result<()> {
    if old_key == new_key {
        return Ok(());
    }
    let entry = bin
        .entries
        .iter_mut()
        .find(|e| e.path_hash == old_key)
        .ok_or_else(|| {
            Error::InvalidInput(format!("Entry {:08x} not found while rekeying", old_key))
        })?;
    entry.path_hash = new_key;
    Ok(())
}

/// Clone `source_bin_path` into `skin0.bin`..`skin99.bin` (skipping the source
/// skin's own index) in the same directory. Skips any target that already
/// exists with a different byte size (assumed hand-edited). Returns the number
/// of skin bins written.
pub fn run(source_bin_path: &Path) -> Result<usize> {
    if !source_bin_path.exists() {
        return Err(Error::InvalidInput(format!(
            "Source BIN not found: {}",
            source_bin_path.display()
        )));
    }

    let source_size = fs::metadata(source_bin_path)
        .map_err(|e| Error::io_with_path(e, source_bin_path))?
        .len();
    let source_data =
        fs::read(source_bin_path).map_err(|e| Error::io_with_path(e, source_bin_path))?;
    let source_bin = read_bin(&source_data)
        .map_err(|e| Error::InvalidInput(format!("Failed to parse source BIN: {}", e)))?;

    let scdp_type = fnv1a("SkinCharacterDataProperties");
    let rr_type = fnv1a("ResourceResolver");
    let mrr_field = fnv1a("mResourceResolver");

    let base_scdp_hash = source_bin
        .entries
        .iter()
        .find(|e| e.class_hash == scdp_type)
        .map(|e| e.path_hash)
        .ok_or_else(|| {
            Error::InvalidInput("SkinCharacterDataProperties not found in source BIN".to_string())
        })?;

    let base_rr_hash = source_bin
        .entries
        .iter()
        .find(|e| e.class_hash == rr_type)
        .map(|e| e.path_hash);

    let (champ, source_skin_idx) = parse_skin_info(source_bin_path);
    let out_dir = source_bin_path
        .parent()
        .ok_or_else(|| Error::InvalidInput("Source bin has no parent directory".to_string()))?;

    // Targets: skin0..99 except the source's own index, skipping any existing
    // file whose size differs from the source (likely hand-edited).
    let targets: Vec<u32> = (0u32..100u32)
        .filter(|&i| i != source_skin_idx)
        .filter(|&i| {
            let out_path = out_dir.join(format!("skin{}.bin", i));
            match out_path.metadata() {
                Ok(meta) => meta.len() == source_size,
                Err(_) => true, // doesn't exist → write it
            }
        })
        .collect();

    targets
        .par_iter()
        .try_for_each(|&target_idx| -> Result<()> {
            let out_path = out_dir.join(format!("skin{}.bin", target_idx));
            let mut bin = source_bin.clone();

            // Rekey the SkinCharacterDataProperties entry.
            let new_scdp_path = format!("characters/{}/skins/skin{}", champ, target_idx);
            let new_scdp_hash = fnv1a(&new_scdp_path);
            rekey_entry(&mut bin, base_scdp_hash, new_scdp_hash)?;

            // Rekey the ResourceResolver entry (if any).
            let mut new_rr_hash = None;
            if let Some(rr_old) = base_rr_hash {
                let new_rr_link =
                    format!("Characters/{}/Skins/Skin{}/Resources", champ, target_idx);
                let rr_hash = fnv1a(&new_rr_link.to_lowercase());
                rekey_entry(&mut bin, rr_old, rr_hash)?;
                new_rr_hash = Some(rr_hash);
            }

            // Fix the mResourceResolver field on the SCDP entry.
            if let Some(scdp) = bin
                .entries
                .iter_mut()
                .find(|e| e.path_hash == new_scdp_hash)
            {
                match scdp.fields.get_mut(&mrr_field) {
                    Some(value) => {
                        if let Some(rr_hash) = new_rr_hash {
                            *value = match value {
                                // Keep string form when the source used a string link.
                                BinValue::String(_) => BinValue::String(format!(
                                    "Characters/{}/Skins/Skin{}/Resources",
                                    champ, target_idx
                                )),
                                // Otherwise re-point the object link.
                                _ => BinValue::Link(rr_hash),
                            };
                        }
                    }
                    None => {
                        if let Some(rr_hash) = new_rr_hash {
                            scdp.fields.insert(mrr_field, BinValue::Link(rr_hash));
                        }
                    }
                }
            }

            let bytes = write_bin(&bin).map_err(|e| {
                Error::InvalidInput(format!("Failed to serialize {}: {}", out_path.display(), e))
            })?;
            fs::write(&out_path, bytes).map_err(|e| Error::io_with_path(e, &out_path))?;
            Ok(())
        })?;

    Ok(targets.len())
}
