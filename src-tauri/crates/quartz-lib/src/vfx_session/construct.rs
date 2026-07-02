//! Native `BinValue` builders for the VFX porting ops — the exact subtrees the
//! old TS text utils emitted (`childParticlesManager`, `idleParticlesManager`,
//! `persistentEffectsManager.buildOwnerCondition`, `vfxInsertSystem`),
//! re-expressed as owned bin values. Field insertion order mirrors the TS
//! blocks so text dumps stay familiar; correctness only needs the hashes.

use super::schema::{hash_or_hex, Hashes};
use crate::error::{Error, Result};
use indexmap::IndexMap;
use ritoshark::bin::{BinEntry, BinType, BinValue};
use ritoshark::hash::fnv1a;
use serde::Deserialize;

// Names used by the FloatComparison driver family that sit outside the shared
// schema vocabulary (also read by project.rs when classifying drivers).
pub(crate) const H_M_VALUE_A: u32 = fnv1a("mValueA");
pub(crate) const H_M_VALUE_B: u32 = fnv1a("mValueB");
pub(crate) const H_SPELL_SLOT: u32 = fnv1a("SpellSlot");
pub(crate) const H_SPELL_RANK_INT_DRIVER: u32 = fnv1a("SpellRankIntDriver");
pub(crate) const H_FLOAT_LITERAL_MATERIAL_DRIVER: u32 = fnv1a("FloatLiteralMaterialDriver");

// ── Op parameter payloads (wire shapes shared with the commands layer) ──────

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChildParams {
    pub effect_key: String,
    pub rate: f32,
    pub lifetime: f32,
    pub bind_weight: f32,
    pub translation: [f32; 3],
    pub is_single_particle: bool,
    pub emitter_name: Option<String>,
    #[serde(default)]
    pub time_before_first_emission: f32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistentPayload {
    pub preset: PersistentPresetPayload,
    #[serde(default)]
    pub vfx: Vec<PersistentVfxPayload>,
    #[serde(default)]
    pub submeshes_show: Vec<String>,
    #[serde(default)]
    pub submeshes_hide: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistentPresetPayload {
    pub r#type: String,
    pub animation_name: Option<String>,
    pub script_name: Option<String>,
    pub spell_hash: Option<String>,
    pub slot: Option<u32>,
    pub operator: Option<u32>,
    pub value: Option<f32>,
    #[serde(default)]
    pub delay_on: f32,
    #[serde(default)]
    pub delay_off: f32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistentVfxPayload {
    pub key: String,
    pub bone_name: Option<String>,
    pub scale: Option<f32>,
    pub owner_only: Option<bool>,
    pub attach_to_camera: Option<bool>,
    pub force_render: Option<bool>,
}

// ── Builders ─────────────────────────────────────────────────────────────────

/// A fresh `VfxSystemDefinitionData` entry: `particleName`, `particlePath`,
/// and an empty complex emitter list. `path_hash = fnv1a(particle_path)` so
/// the resolver `Link` built from the same string resolves in-engine.
pub fn new_vfx_system(particle_name: &str, particle_path: &str) -> BinEntry {
    let h = Hashes::new();
    let mut fields = IndexMap::new();
    fields.insert(h.particle_name, BinValue::String(particle_name.to_string()));
    fields.insert(h.particle_path, BinValue::String(particle_path.to_string()));
    fields.insert(
        h.complex_emitter_definition_data,
        BinValue::List {
            is_list2: false,
            item: BinType::Pointer,
            items: Vec::new(),
        },
    );
    BinEntry {
        path_hash: hash_or_hex(particle_path),
        class_hash: h.vfx_system_definition_data,
        fields,
    }
}

/// `embed = ValueFloat { constantValue: f32 }`.
pub fn value_float(v: f32) -> BinValue {
    let h = Hashes::new();
    let mut fields = IndexMap::new();
    fields.insert(h.constant_value, BinValue::F32(v));
    BinValue::Embed {
        class: h.value_float,
        fields,
    }
}

/// `childParticleSetDefinition: pointer = VfxChildParticleSetDefinitionData`
/// holding a single `VfxChildIdentifier { effectKey }`.
pub(crate) fn child_set_definition(effect_key: &str) -> BinValue {
    let h = Hashes::new();
    let mut ident_fields = IndexMap::new();
    ident_fields.insert(h.effect_key, BinValue::Hash(hash_or_hex(effect_key)));
    let mut fields = IndexMap::new();
    fields.insert(
        h.children_identifiers,
        BinValue::List {
            is_list2: false,
            item: BinType::Embed,
            items: vec![BinValue::Embed {
                class: h.vfx_child_identifier,
                fields: ident_fields,
            }],
        },
    );
    BinValue::Pointer {
        class: h.vfx_child_particle_set_definition_data,
        fields,
    }
}

/// The `_cbdl` child-emitter skeleton, field-for-field the block
/// `childParticlesManager.ts` emitted (blendMode 1, pass 9999,
/// miscRenderFlags 1). The emitter name gets the `_cbdl` suffix appended when
/// the base does not already carry it.
pub fn new_child_emitter(p: &ChildParams) -> BinValue {
    let h = Hashes::new();
    let base = p
        .emitter_name
        .clone()
        .unwrap_or_else(|| p.effect_key.clone());
    let name = if base.ends_with("_cbdl") {
        base
    } else {
        format!("{}_cbdl", base)
    };
    let mut fields = IndexMap::new();
    fields.insert(
        h.time_before_first_emission,
        BinValue::F32(p.time_before_first_emission),
    );
    fields.insert(h.rate, value_float(p.rate));
    fields.insert(h.particle_lifetime, value_float(p.lifetime));
    fields.insert(h.bind_weight, value_float(p.bind_weight));
    fields.insert(h.translation_override, BinValue::Vec3(p.translation));
    fields.insert(
        h.child_particle_set_definition,
        child_set_definition(&p.effect_key),
    );
    fields.insert(h.is_single_particle, BinValue::Flag(p.is_single_particle));
    fields.insert(h.emitter_name, BinValue::String(name));
    fields.insert(h.blend_mode, BinValue::U8(1));
    fields.insert(h.pass, BinValue::I16(9999));
    fields.insert(h.misc_render_flags, BinValue::U8(1));
    BinValue::Pointer {
        class: h.vfx_emitter_definition_data,
        fields,
    }
}

/// `embed = SkinCharacterDataProperties_CharacterIdleEffect { effectKey, boneName }`.
pub fn new_idle_effect(effect_key: &str, bone: &str) -> BinValue {
    let h = Hashes::new();
    let mut fields = IndexMap::new();
    fields.insert(h.effect_key, BinValue::Hash(hash_or_hex(effect_key)));
    fields.insert(h.bone_name, BinValue::String(bone.to_string()));
    BinValue::Embed {
        class: h.skin_character_data_properties_character_idle_effect,
        fields,
    }
}

/// The OwnerCondition driver for a preset type, defaults matching
/// `buildOwnerCondition` in persistentEffectsManager.ts. Unknown types fall
/// back to the IsAnimationPlaying default (mirrors the TS default arm); the
/// raw-preserve path never calls this.
pub(crate) fn build_owner_condition(preset: &PersistentPresetPayload) -> BinValue {
    let h = Hashes::new();
    match preset.r#type.as_str() {
        "HasBuffScript" => {
            let mut fields = IndexMap::new();
            match &preset.spell_hash {
                Some(spell) if !spell.trim().is_empty() => {
                    fields.insert(h.spell, BinValue::Hash(hash_or_hex(spell.trim())));
                }
                _ => {
                    let script = preset
                        .script_name
                        .as_deref()
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                        .unwrap_or("SettQ");
                    fields.insert(h.m_script_name, BinValue::String(script.to_string()));
                }
            }
            BinValue::Pointer {
                class: h.has_buff_dynamic_material_bool_driver,
                fields,
            }
        }
        "LearnedSpell" => {
            let mut fields = IndexMap::new();
            fields.insert(h.m_slot, BinValue::U8(preset.slot.unwrap_or(3) as u8));
            BinValue::Pointer {
                class: h.learned_spell_dynamic_material_bool_driver,
                fields,
            }
        }
        "HasGear" => {
            // The payload carries the gear index in `slot` (TS used a separate
            // `index` field; the wire shape only has one integer slot).
            let mut fields = IndexMap::new();
            fields.insert(h.m_gear_index, BinValue::U8(preset.slot.unwrap_or(0) as u8));
            BinValue::Pointer {
                class: h.has_gear_dynamic_material_bool_driver,
                fields,
            }
        }
        "FloatComparison" => {
            let mut a_fields = IndexMap::new();
            a_fields.insert(H_SPELL_SLOT, BinValue::U32(preset.slot.unwrap_or(3)));
            let mut b_fields = IndexMap::new();
            b_fields.insert(h.m_value, BinValue::F32(preset.value.unwrap_or(1.0)));
            let mut fields = IndexMap::new();
            fields.insert(h.m_operator, BinValue::U32(preset.operator.unwrap_or(3)));
            fields.insert(
                H_M_VALUE_A,
                BinValue::Pointer {
                    class: H_SPELL_RANK_INT_DRIVER,
                    fields: a_fields,
                },
            );
            fields.insert(
                H_M_VALUE_B,
                BinValue::Pointer {
                    class: H_FLOAT_LITERAL_MATERIAL_DRIVER,
                    fields: b_fields,
                },
            );
            BinValue::Pointer {
                class: h.float_comparison_material_driver,
                fields,
            }
        }
        "BuffCounterFloatComparison" => {
            let spell = preset
                .spell_hash
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .unwrap_or("Characters/Ezreal/Spells/EzrealPassiveAbility/EzrealPassiveStacks");
            let mut a_fields = IndexMap::new();
            a_fields.insert(h.spell, BinValue::Hash(hash_or_hex(spell)));
            let mut b_fields = IndexMap::new();
            b_fields.insert(h.m_value, BinValue::F32(preset.value.unwrap_or(5.0)));
            let mut fields = IndexMap::new();
            fields.insert(h.m_operator, BinValue::U32(preset.operator.unwrap_or(2)));
            fields.insert(
                H_M_VALUE_A,
                BinValue::Pointer {
                    class: h.buff_counter_dynamic_material_float_driver,
                    fields: a_fields,
                },
            );
            fields.insert(
                H_M_VALUE_B,
                BinValue::Pointer {
                    class: H_FLOAT_LITERAL_MATERIAL_DRIVER,
                    fields: b_fields,
                },
            );
            BinValue::Pointer {
                class: h.float_comparison_material_driver,
                fields,
            }
        }
        // "IsAnimationPlaying" and anything unknown.
        _ => {
            let name = preset
                .animation_name
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .unwrap_or("Spell4");
            let mut fields = IndexMap::new();
            fields.insert(
                h.m_animation_names,
                BinValue::List {
                    is_list2: false,
                    item: BinType::Hash,
                    items: vec![BinValue::Hash(hash_or_hex(name))],
                },
            );
            BinValue::Pointer {
                class: h.is_animation_playing_dynamic_material_bool_driver,
                fields,
            }
        }
    }
}

/// Wrap a driver in `DelayedBoolMaterialDriver` when either delay is set,
/// field order mirroring the TS block (mBoolDriver, mDelayOff, mDelayOn).
pub(crate) fn delay_wrapped(inner: BinValue, delay_on: f32, delay_off: f32) -> BinValue {
    if delay_on <= 0.0 && delay_off <= 0.0 {
        return inner;
    }
    let h = Hashes::new();
    let mut fields = IndexMap::new();
    fields.insert(h.m_bool_driver, inner);
    fields.insert(h.m_delay_off, BinValue::F32(delay_off));
    fields.insert(h.m_delay_on, BinValue::F32(delay_on));
    BinValue::Pointer {
        class: h.delayed_bool_material_driver,
        fields,
    }
}

/// `list2[hash]` of submesh names (hex strings pass through as literals).
fn hash_list2(items: &[String]) -> BinValue {
    BinValue::List {
        is_list2: true,
        item: BinType::Hash,
        items: items
            .iter()
            .map(|s| BinValue::Hash(hash_or_hex(s)))
            .collect(),
    }
}

/// One `PersistentVfxData` embed; optional fields are written only when set,
/// bools only when true (mirrors buildPersistentVfxDataBlock).
fn persistent_vfx_item(v: &PersistentVfxPayload) -> Result<BinValue> {
    let h = Hashes::new();
    let key = v.key.trim();
    if key.is_empty() {
        return Err(Error::InvalidInput(
            "Persistent VFX entry is missing an effect key".to_string(),
        ));
    }
    let mut fields = IndexMap::new();
    fields.insert(h.effect_key, BinValue::Hash(hash_or_hex(key)));
    if let Some(bone) = v
        .bone_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        fields.insert(h.bone_name, BinValue::String(bone.to_string()));
    }
    if let Some(scale) = v.scale {
        fields.insert(h.scale, BinValue::F32(scale));
    }
    if v.owner_only == Some(true) {
        fields.insert(h.show_to_owner_only, BinValue::Bool(true));
    }
    if v.attach_to_camera == Some(true) {
        fields.insert(h.attach_to_camera, BinValue::Bool(true));
    }
    if v.force_render == Some(true) {
        fields.insert(h.force_render_vfx, BinValue::Bool(true));
    }
    Ok(BinValue::Embed {
        class: h.persistent_vfx_data,
        fields,
    })
}

/// The `PersistentEffectConditionData` pointer body around a given (possibly
/// preserved) OwnerCondition subtree. Empty submesh/vfx lists are omitted,
/// matching the TS emitter. Used directly by the raw-preserve upsert path.
pub(crate) fn condition_with_owner(
    p: &PersistentPayload,
    owner: Option<BinValue>,
) -> Result<BinValue> {
    let h = Hashes::new();
    let mut fields = IndexMap::new();
    if let Some(owner) = owner {
        fields.insert(h.owner_condition, owner);
    }
    if !p.submeshes_show.is_empty() {
        fields.insert(h.submeshes_to_show, hash_list2(&p.submeshes_show));
    }
    if !p.submeshes_hide.is_empty() {
        fields.insert(h.submeshes_to_hide, hash_list2(&p.submeshes_hide));
    }
    if !p.vfx.is_empty() {
        let mut items = Vec::with_capacity(p.vfx.len());
        for v in &p.vfx {
            items.push(persistent_vfx_item(v)?);
        }
        fields.insert(
            h.persistent_vfxs,
            BinValue::List {
                is_list2: true,
                item: BinType::Embed,
                items,
            },
        );
    }
    Ok(BinValue::Pointer {
        class: h.persistent_effect_condition_data,
        fields,
    })
}

/// A full new `PersistentEffectConditionData` from a payload: driver per
/// preset type, delay-wrapped when delays are set.
pub fn new_persistent_condition(p: &PersistentPayload) -> Result<BinValue> {
    let owner = delay_wrapped(
        build_owner_condition(&p.preset),
        p.preset.delay_on,
        p.preset.delay_off,
    );
    condition_with_owner(p, Some(owner))
}

/// Row-major identity mtx44.
pub fn identity_mtx44() -> BinValue {
    BinValue::Mtx44([
        1.0, 0.0, 0.0, 0.0, //
        0.0, 1.0, 0.0, 0.0, //
        0.0, 0.0, 1.0, 0.0, //
        0.0, 0.0, 0.0, 1.0,
    ])
}

/// Upsert a `(Hash(key), Link(value))` pair into a resolver `resourceMap`.
/// Returns true when a new entry was pushed, false when an existing key's
/// value was replaced. Errors when the node is not a map.
pub fn resolver_upsert(map: &mut BinValue, key: &str, value: &str) -> Result<bool> {
    let BinValue::Map { entries, .. } = map else {
        return Err(Error::InvalidInput(
            "Resolver resourceMap is not a map".to_string(),
        ));
    };
    let key_hash = hash_or_hex(key);
    let value_hash = hash_or_hex(value);
    for (k, v) in entries.iter_mut() {
        let existing = match k {
            BinValue::Hash(x) | BinValue::Link(x) => Some(*x),
            _ => None,
        };
        if existing == Some(key_hash) {
            *v = BinValue::Link(value_hash);
            return Ok(false);
        }
    }
    entries.push((BinValue::Hash(key_hash), BinValue::Link(value_hash)));
    Ok(true)
}

/// The resolver short key for a system, mirroring `computeMappingValue` in
/// vfxSystemParser/vfxInsertSystem: last path segment with the
/// `<X>_Base_` prefix collapsed to `<X>_`.
pub fn derive_short_key(particle_path: &str, particle_name: &str) -> String {
    fn last_segment(s: &str) -> &str {
        s.rsplit('/').next().unwrap_or(s)
    }
    fn strip_base(last: &str) -> String {
        // "Eve_Base_R_mis" -> "Eve_R_mis" (TS: /^([^_]+)_Base_/ -> "$1_").
        if let Some(us) = last.find('_') {
            let (head, rest) = last.split_at(us);
            if let Some(tail) = rest.strip_prefix("_Base_") {
                return format!("{}_{}", head, tail);
            }
        }
        last.to_string()
    }

    if particle_path.starts_with("Characters/") {
        strip_base(last_segment(particle_path))
    } else if particle_name.contains('/') {
        strip_base(last_segment(particle_name))
    } else if !particle_name.is_empty() {
        strip_base(particle_name)
    } else {
        strip_base(last_segment(particle_path))
    }
}
