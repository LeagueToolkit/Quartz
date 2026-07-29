//! NoSkinLite — clone a source skin BIN into every existing skin slot
//! (`skin0.bin`..`skin{max}.bin`) for that champion, rekeying the
//! `SkinCharacterDataProperties` / `ResourceResolver` entries and fixing the
//! `mResourceResolver` reference so each clone resolves to its own skin
//! index.
//!
//! Skin ceiling is fetched at runtime from CommunityDragon's raw game-data
//! directory listing (`raw.communitydragon.org/json/latest/game/data/...`)
//! because the marketing `champion-summary`/`champions/{id}` endpoints only
//! list officially released skins and miss chroma / PBE / unreleased slots
//! (Akali max=101, not 92; Bel'Veth max=28, not 5). We add
//! `NOSKINLITE_FUTURE_MARGIN` on top so the next Riot release still fits
//! without re-running. Fetch failures fall back to `NOSKINLITE_FALLBACK_MAX`.
//!
//! Any existing `skinN.bin` in the folder is skipped unconditionally so the
//! user's hand-edited skins never get clobbered.

use crate::bin::{read_bin, write_bin};
use crate::error::{Error, Result};
use rayon::prelude::*;
use ritoshark::bin::{Bin, BinValue};
use ritoshark::hash::fnv1a;
use std::fs;
use std::path::Path;
use std::time::Duration;

/// Extra skin slots generated above the current CDragon max, so newly-shipped
/// Riot skins still land in an existing clone without re-running NoSkinLite.
const NOSKINLITE_FUTURE_MARGIN: u32 = 20;
/// Ceiling used when the CDragon lookup fails (offline, unknown champ, etc.).
/// Matches the old hardcoded upper bound so behaviour degrades gracefully.
const NOSKINLITE_FALLBACK_MAX: u32 = 99;
/// Timeout budget for the CDragon fetch. Small so an unreachable network
/// doesn't leave the user staring at a frozen right-click menu.
const CDRAGON_TIMEOUT: Duration = Duration::from_secs(10);

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

/// Look up the highest live skin index for `champ_alias` on CommunityDragon.
///
/// Uses the raw game-data directory listing at
/// `raw.communitydragon.org/json/latest/game/data/characters/{alias}/skins/`.
/// The response is a JSON array of `{name, ...}` file entries; we filter for
/// `skin<N>.bin` and take the max `N`. Runs a self-contained tokio runtime so
/// the sync `run()` signature (called from a sync CLI dispatcher) doesn't
/// have to become async.
fn fetch_max_skin_index(champ_alias: &str) -> Result<u32> {
    let url = format!(
        "https://raw.communitydragon.org/json/latest/game/data/characters/{}/skins/",
        champ_alias.to_lowercase()
    );

    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| Error::InvalidInput(format!("cdragon runtime: {}", e)))?;

    let body: String = rt.block_on(async {
        let client = reqwest::Client::builder()
            .timeout(CDRAGON_TIMEOUT)
            .user_agent("quartz-noskinlite")
            .build()
            .map_err(|e| Error::InvalidInput(format!("cdragon client: {}", e)))?;
        let resp = client
            .get(&url)
            .send()
            .await
            .map_err(|e| Error::InvalidInput(format!("cdragon get: {}", e)))?;
        if !resp.status().is_success() {
            return Err(Error::InvalidInput(format!(
                "cdragon http {} for {}",
                resp.status(),
                url
            )));
        }
        resp.text()
            .await
            .map_err(|e| Error::InvalidInput(format!("cdragon read: {}", e)))
    })?;

    let listing: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| Error::InvalidInput(format!("cdragon parse: {}", e)))?;
    let entries = listing
        .as_array()
        .ok_or_else(|| Error::InvalidInput("cdragon listing not an array".to_string()))?;
    entries
        .iter()
        .filter_map(|e| e.get("name").and_then(|v| v.as_str()))
        .filter_map(parse_skin_bin_index)
        .max()
        .ok_or_else(|| Error::InvalidInput("no skinN.bin in cdragon listing".to_string()))
}

/// Parse `<digits>` out of a `skin<digits>.bin` filename (case-insensitive).
fn parse_skin_bin_index(name: &str) -> Option<u32> {
    let low = name.to_lowercase();
    low.strip_prefix("skin")?
        .strip_suffix(".bin")?
        .parse::<u32>()
        .ok()
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

/// Clone `source_bin_path` into `skin0.bin`..`skin{ceiling}.bin` (skipping
/// the source skin's own index) in the same directory. The ceiling is
/// `cdragon_max + NOSKINLITE_FUTURE_MARGIN`, falling back to
/// `NOSKINLITE_FALLBACK_MAX` if CDragon is unreachable. Any existing
/// `skinN.bin` file is skipped — the source skin is never touched, and
/// hand-edited skins are never clobbered.
pub fn run(source_bin_path: &Path) -> Result<usize> {
    if !source_bin_path.exists() {
        return Err(Error::InvalidInput(format!(
            "Source BIN not found: {}",
            source_bin_path.display()
        )));
    }

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

    // Ceiling from CDragon (or fallback), padded so future Riot releases fit.
    let ceiling = match fetch_max_skin_index(&champ) {
        Ok(n) => {
            let padded = n.saturating_add(NOSKINLITE_FUTURE_MARGIN);
            eprintln!(
                "[noskinlite] {}: cdragon max {}, generating skin0..skin{} (+{} margin)",
                champ, n, padded, NOSKINLITE_FUTURE_MARGIN
            );
            padded
        }
        Err(e) => {
            eprintln!(
                "[noskinlite] cdragon lookup failed ({}); falling back to skin0..skin{}",
                e, NOSKINLITE_FALLBACK_MAX
            );
            NOSKINLITE_FALLBACK_MAX
        }
    };

    // Targets: every slot up to the ceiling except the source's own index,
    // skipping anything that already has a bin on disk (no overwrite).
    let targets: Vec<u32> = (0u32..=ceiling)
        .filter(|&i| i != source_skin_idx)
        .filter(|&i| !out_dir.join(format!("skin{}.bin", i)).exists())
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
