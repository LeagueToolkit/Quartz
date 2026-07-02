//! FNV1a-32 hash constants for the VFX porting schema (mirrors
//! `paint::model::Hashes`). Field names are the mechanical snake_case of the
//! exact bin class/field spelling; `ritoshark::hash::fnv1a` lowercases
//! internally, so the original-cased literals hash to the bin convention.

use ritoshark::hash::fnv1a;

pub struct Hashes {
    // entry classes
    pub vfx_system_definition_data: u32,
    pub skin_character_data_properties: u32,
    pub resource_resolver: u32,
    pub vfx_emitter_definition_data: u32,
    pub vfx_child_particle_set_definition_data: u32,
    pub vfx_child_identifier: u32,
    pub skin_character_data_properties_character_idle_effect: u32,
    pub persistent_effect_condition_data: u32,
    pub persistent_vfx_data: u32,
    pub value_float: u32,
    pub is_animation_playing_dynamic_material_bool_driver: u32,
    pub has_buff_dynamic_material_bool_driver: u32,
    pub learned_spell_dynamic_material_bool_driver: u32,
    pub has_gear_dynamic_material_bool_driver: u32,
    pub float_comparison_material_driver: u32,
    pub buff_counter_dynamic_material_float_driver: u32,
    pub delayed_bool_material_driver: u32,
    pub skin_mesh_data_properties: u32,
    // fields
    pub particle_name: u32,
    pub particle_path: u32,
    pub complex_emitter_definition_data: u32,
    pub simple_emitter_definition_data: u32,
    pub transform: u32,
    pub emitter_name: u32,
    pub child_particle_set_definition: u32,
    pub children_identifiers: u32,
    pub effect_key: u32,
    pub rate: u32,
    pub particle_lifetime: u32,
    pub bind_weight: u32,
    pub translation_override: u32,
    pub is_single_particle: u32,
    pub time_before_first_emission: u32,
    pub pass: u32,
    pub blend_mode: u32,
    pub misc_render_flags: u32,
    pub constant_value: u32,
    pub idle_particles_effects: u32,
    pub bone_name: u32,
    pub persistent_effect_conditions: u32,
    pub owner_condition: u32,
    pub persistent_vfxs: u32,
    pub submeshes_to_show: u32,
    pub submeshes_to_hide: u32,
    pub scale: u32,
    pub show_to_owner_only: u32,
    pub attach_to_camera: u32,
    pub force_render_vfx: u32,
    pub m_animation_names: u32,
    pub spell: u32,
    pub m_script_name: u32,
    pub m_slot: u32,
    pub m_gear_index: u32,
    pub m_operator: u32,
    pub m_value: u32,
    pub m_delay_on: u32,
    pub m_delay_off: u32,
    pub m_bool_driver: u32,
    pub resource_map: u32,
    pub skin_mesh_properties: u32,
    pub initial_submesh_to_hide: u32,
    pub texture: u32,
    pub particle_color_texture: u32,
    pub erosion_map_name: u32,
    pub texture_mult: u32,
    pub palette_texture: u32,
    pub color: u32,
    pub birth_color: u32,
}

impl Hashes {
    pub fn new() -> Self {
        Hashes {
            vfx_system_definition_data: fnv1a("VfxSystemDefinitionData"),
            skin_character_data_properties: fnv1a("SkinCharacterDataProperties"),
            resource_resolver: fnv1a("ResourceResolver"),
            vfx_emitter_definition_data: fnv1a("VfxEmitterDefinitionData"),
            vfx_child_particle_set_definition_data: fnv1a("VfxChildParticleSetDefinitionData"),
            vfx_child_identifier: fnv1a("VfxChildIdentifier"),
            skin_character_data_properties_character_idle_effect: fnv1a(
                "SkinCharacterDataProperties_CharacterIdleEffect",
            ),
            persistent_effect_condition_data: fnv1a("PersistentEffectConditionData"),
            persistent_vfx_data: fnv1a("PersistentVfxData"),
            value_float: fnv1a("ValueFloat"),
            is_animation_playing_dynamic_material_bool_driver: fnv1a(
                "IsAnimationPlayingDynamicMaterialBoolDriver",
            ),
            has_buff_dynamic_material_bool_driver: fnv1a("HasBuffDynamicMaterialBoolDriver"),
            learned_spell_dynamic_material_bool_driver: fnv1a(
                "LearnedSpellDynamicMaterialBoolDriver",
            ),
            has_gear_dynamic_material_bool_driver: fnv1a("HasGearDynamicMaterialBoolDriver"),
            float_comparison_material_driver: fnv1a("FloatComparisonMaterialDriver"),
            buff_counter_dynamic_material_float_driver: fnv1a(
                "BuffCounterDynamicMaterialFloatDriver",
            ),
            delayed_bool_material_driver: fnv1a("DelayedBoolMaterialDriver"),
            skin_mesh_data_properties: fnv1a("SkinMeshDataProperties"),
            particle_name: fnv1a("particleName"),
            particle_path: fnv1a("particlePath"),
            complex_emitter_definition_data: fnv1a("complexEmitterDefinitionData"),
            simple_emitter_definition_data: fnv1a("simpleEmitterDefinitionData"),
            transform: fnv1a("transform"),
            emitter_name: fnv1a("emitterName"),
            child_particle_set_definition: fnv1a("childParticleSetDefinition"),
            children_identifiers: fnv1a("childrenIdentifiers"),
            effect_key: fnv1a("effectKey"),
            rate: fnv1a("rate"),
            particle_lifetime: fnv1a("particleLifetime"),
            bind_weight: fnv1a("bindWeight"),
            translation_override: fnv1a("translationOverride"),
            is_single_particle: fnv1a("isSingleParticle"),
            time_before_first_emission: fnv1a("timeBeforeFirstEmission"),
            pass: fnv1a("pass"),
            blend_mode: fnv1a("blendMode"),
            misc_render_flags: fnv1a("miscRenderFlags"),
            constant_value: fnv1a("constantValue"),
            idle_particles_effects: fnv1a("idleParticlesEffects"),
            bone_name: fnv1a("boneName"),
            persistent_effect_conditions: fnv1a("PersistentEffectConditions"),
            owner_condition: fnv1a("OwnerCondition"),
            persistent_vfxs: fnv1a("PersistentVfxs"),
            submeshes_to_show: fnv1a("SubmeshesToShow"),
            submeshes_to_hide: fnv1a("SubmeshesToHide"),
            scale: fnv1a("scale"),
            show_to_owner_only: fnv1a("ShowToOwnerOnly"),
            attach_to_camera: fnv1a("AttachToCamera"),
            force_render_vfx: fnv1a("ForceRenderVfx"),
            m_animation_names: fnv1a("mAnimationNames"),
            spell: fnv1a("Spell"),
            m_script_name: fnv1a("mScriptName"),
            m_slot: fnv1a("mSlot"),
            m_gear_index: fnv1a("mGearIndex"),
            m_operator: fnv1a("mOperator"),
            m_value: fnv1a("mValue"),
            m_delay_on: fnv1a("mDelayOn"),
            m_delay_off: fnv1a("mDelayOff"),
            m_bool_driver: fnv1a("mBoolDriver"),
            resource_map: fnv1a("resourceMap"),
            skin_mesh_properties: fnv1a("skinMeshProperties"),
            initial_submesh_to_hide: fnv1a("initialSubmeshToHide"),
            texture: fnv1a("texture"),
            particle_color_texture: fnv1a("particleColorTexture"),
            erosion_map_name: fnv1a("erosionMapName"),
            texture_mult: fnv1a("textureMult"),
            palette_texture: fnv1a("paletteTexture"),
            color: fnv1a("color"),
            birth_color: fnv1a("birthColor"),
        }
    }
}

impl Default for Hashes {
    fn default() -> Self {
        Hashes::new()
    }
}

/// Parse `"0x<hex8>"` as a literal hash, hash anything else with FNV1a-32
/// lowercase (same semantics as `bineditor::value::hash32_of`). Infallible:
/// malformed hex falls back to hashing the literal string.
pub fn hash_or_hex(s: &str) -> u32 {
    crate::bineditor::value::hash32_of(s).unwrap_or_else(|_| fnv1a(s))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_or_hex_parses_hex_and_hashes_names() {
        assert_eq!(hash_or_hex("0x1234abcd"), 0x1234abcd);
        assert_eq!(hash_or_hex("particleName"), fnv1a("particlename"));

        let h = Hashes::new();
        assert_eq!(hash_or_hex("particleName"), h.particle_name);
        assert_eq!(
            hash_or_hex("VfxSystemDefinitionData"),
            h.vfx_system_definition_data
        );
        // Malformed hex hashes as a literal string instead of erroring.
        assert_eq!(hash_or_hex("0xzz"), fnv1a("0xzz"));
    }
}
