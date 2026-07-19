//! Ability-aware ordering for top-level `VfxSystemDefinitionData` entries.
//!
//! Riot BIN entry order is preserved by `rs_bin`, so changing the order here is
//! reflected by Jade/ritobin and Quartz's hierarchy. Only VFX entries exchange
//! positions with other VFX entries; every other top-level entry keeps its
//! exact index. Names are classified conservatively into passive, basic attack,
//! Q/W/E/R and miscellaneous buckets, then alphabetized inside each bucket.

use ritoshark::bin::{Bin, BinEntry, BinValue};
use ritoshark::hash::fnv1a;

const H_VFX_SYSTEM: u32 = fnv1a("VfxSystemDefinitionData");
const H_PARTICLE_NAME: u32 = fnv1a("particleName");
const H_PARTICLE_PATH: u32 = fnv1a("particlePath");

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum AbilityBucket {
    Passive,
    BasicAttack,
    Q,
    W,
    E,
    R,
    Misc,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct SortVfxReport {
    pub systems: usize,
    pub moved: usize,
    pub passive: usize,
    pub basic_attack: usize,
    pub q: usize,
    pub w: usize,
    pub e: usize,
    pub r: usize,
    pub miscellaneous: usize,
}

fn entry_name(entry: &BinEntry) -> Option<&str> {
    [H_PARTICLE_NAME, H_PARTICLE_PATH]
        .into_iter()
        .find_map(|field| match entry.fields.get(&field) {
            Some(BinValue::String(value)) if !value.trim().is_empty() => Some(value.as_str()),
            _ => None,
        })
}

/// Split separators, camel-case boundaries and letter/number boundaries while
/// keeping champion names such as `Qiyana` distinct from the `Q` ability token.
fn name_tokens(name: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let chars: Vec<char> = name.chars().collect();

    for (index, &ch) in chars.iter().enumerate() {
        if !ch.is_ascii_alphanumeric() {
            if !current.is_empty() {
                tokens.push(current.to_ascii_lowercase());
                current.clear();
            }
            continue;
        }

        let previous = current.chars().last();
        let next = chars.get(index + 1).copied();
        let camel_boundary =
            previous.is_some_and(|p| p.is_ascii_lowercase() && ch.is_ascii_uppercase());
        let acronym_boundary = previous.is_some_and(|p| p.is_ascii_uppercase())
            && ch.is_ascii_uppercase()
            && next.is_some_and(|n| n.is_ascii_lowercase());
        let number_boundary = previous.is_some_and(|p| p.is_ascii_digit()) != ch.is_ascii_digit();

        if !current.is_empty() && (camel_boundary || acronym_boundary || number_boundary) {
            tokens.push(current.to_ascii_lowercase());
            current.clear();
        }
        current.push(ch);
    }

    if !current.is_empty() {
        tokens.push(current.to_ascii_lowercase());
    }
    tokens
}

fn contains_pair(tokens: &[String], left: &str, right: &str) -> bool {
    tokens
        .windows(2)
        .any(|pair| pair[0] == left && pair[1] == right)
}

fn has_spell_number(tokens: &[String], number: &str) -> bool {
    tokens
        .windows(2)
        .any(|pair| matches!(pair[0].as_str(), "spell" | "ability" | "slot") && pair[1] == number)
}

fn classify(name: Option<&str>) -> AbilityBucket {
    let Some(name) = name else {
        return AbilityBucket::Misc;
    };
    let tokens = name_tokens(name);
    let has = |value: &str| tokens.iter().any(|token| token == value);

    if has("passive") || has("trait") || has("p") {
        AbilityBucket::Passive
    } else if has("ba")
        || has("aa")
        || has("basicattack")
        || contains_pair(&tokens, "basic", "attack")
        || contains_pair(&tokens, "crit", "attack")
        || has("attack")
        || has("crit")
    {
        AbilityBucket::BasicAttack
    } else if has("q") || has_spell_number(&tokens, "1") {
        AbilityBucket::Q
    } else if has("w") || has_spell_number(&tokens, "2") {
        AbilityBucket::W
    } else if has("e") || has_spell_number(&tokens, "3") {
        AbilityBucket::E
    } else if has("r") || has("ult") || has("ultimate") || has_spell_number(&tokens, "4") {
        AbilityBucket::R
    } else {
        AbilityBucket::Misc
    }
}

/// Reorder only the VFX entries occupying the BIN's existing VFX slots.
pub fn sort_vfx_systems(bin: &mut Bin) -> SortVfxReport {
    let mut report = SortVfxReport::default();
    let mut systems: Vec<(usize, BinEntry, AbilityBucket, String)> = bin
        .entries
        .iter()
        .enumerate()
        .filter(|(_, entry)| entry.class_hash == H_VFX_SYSTEM)
        .map(|(original_index, entry)| {
            let name = entry_name(entry).unwrap_or_default();
            let bucket = classify(Some(name));
            match bucket {
                AbilityBucket::Passive => report.passive += 1,
                AbilityBucket::BasicAttack => report.basic_attack += 1,
                AbilityBucket::Q => report.q += 1,
                AbilityBucket::W => report.w += 1,
                AbilityBucket::E => report.e += 1,
                AbilityBucket::R => report.r += 1,
                AbilityBucket::Misc => report.miscellaneous += 1,
            }
            (
                original_index,
                entry.clone(),
                bucket,
                name.to_ascii_lowercase(),
            )
        })
        .collect();

    report.systems = systems.len();
    systems.sort_by(|left, right| {
        left.2
            .cmp(&right.2)
            .then_with(|| left.3.cmp(&right.3))
            .then_with(|| left.0.cmp(&right.0))
    });

    let mut sorted = systems.into_iter();
    for (entry_index, entry) in bin.entries.iter_mut().enumerate() {
        if entry.class_hash != H_VFX_SYSTEM {
            continue;
        }
        if let Some((original_index, replacement, _, _)) = sorted.next() {
            if original_index != entry_index {
                report.moved += 1;
            }
            *entry = replacement;
        }
    }
    report
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_common_riot_and_modder_names_without_matching_champion_letters() {
        assert_eq!(classify(Some("Lux_Base_P_Shield")), AbilityBucket::Passive);
        assert_eq!(
            classify(Some("Jade_Katarina_BasicAttack1")),
            AbilityBucket::BasicAttack
        );
        assert_eq!(classify(Some("Lux_Base_Q_tar")), AbilityBucket::Q);
        assert_eq!(classify(Some("Lux_Spell2_Mis")), AbilityBucket::W);
        assert_eq!(classify(Some("Lux_Base_E_AOE")), AbilityBucket::E);
        assert_eq!(classify(Some("Lux_Ult_Beam")), AbilityBucket::R);
        assert_eq!(classify(Some("Qiyana_Recall")), AbilityBucket::Misc);
        assert_eq!(classify(Some("Rumble_Emote")), AbilityBucket::Misc);
    }
}
