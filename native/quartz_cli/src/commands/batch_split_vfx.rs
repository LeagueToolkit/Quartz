use std::fs;
use std::io;
use std::path::Path;

use indexmap::IndexMap;
use ltk_meta::property::{values, BinProperty, PropertyValueEnum};
use ltk_meta::{BinObject, PropertyValueEnum as PVE};

use crate::utils::{fnv1a_32, read_bin, write_bin};

fn h(name: &str) -> u32 {
    fnv1a_32(name)
}

fn make_prop(name_hash: u32, value: PropertyValueEnum) -> BinProperty {
    BinProperty { name_hash, value }
}

fn make_value_float(v: f32) -> PropertyValueEnum {
    let constant_hash = h("constantValue");
    let mut props = IndexMap::new();
    props.insert(
        constant_hash,
        make_prop(constant_hash, PVE::F32(values::F32::new(v))),
    );
    PVE::Embedded(values::Embedded(values::Struct {
        class_hash: h("ValueFloat"),
        properties: props,
        meta: Default::default(),
    }))
}

fn get_emitter_name(emitter_struct: &values::Struct) -> Option<String> {
    let emitter_name_hash = h("emitterName");
    emitter_struct.properties.get(&emitter_name_hash).and_then(|p| match &p.value {
        PVE::String(s) => Some(s.value.clone()),
        _ => None,
    })
}

fn get_system_short_name(system: &BinObject) -> String {
    let particle_name_hash = h("particleName");
    let particle_path_hash = h("particlePath");

    let mut name = system
        .properties
        .get(&particle_name_hash)
        .and_then(|p| match &p.value {
            PVE::String(s) => Some(s.value.clone()),
            _ => None,
        })
        .or_else(|| {
            system.properties.get(&particle_path_hash).and_then(|p| match &p.value {
                PVE::String(s) => Some(s.value.clone()),
                _ => None,
            })
        })
        .unwrap_or_else(|| format!("{:08x}", system.path_hash));

    if let Some(last) = name.rsplit('/').next() {
        name = last.to_string();
    }

    // Match Python regex: ^[A-Za-z]+_(Base_|Skin\d+_)
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

fn make_trigger_emitter(trigger_name: &str, emitter_name_original: &str, count: usize) -> values::Struct {
    let is_single_hash = h("isSingleParticle");
    let child_set_hash = h("childParticleSetDefinition");
    let children_identifiers_hash = h("childrenIdentifiers");
    let effect_hash = h("effect");
    let bind_weight_hash = h("bindWeight");
    let particle_is_local_hash = h("particleIsLocalOrientation");
    let rate_hash = h("rate");
    let emitter_name_hash = h("emitterName");

    let effect_link_hash = h(trigger_name);

    let mut child_identifier_props = IndexMap::new();
    child_identifier_props.insert(
        effect_hash,
        make_prop(
            effect_hash,
            PVE::ObjectLink(values::ObjectLink::new(effect_link_hash)),
        ),
    );
    let child_identifier = values::Embedded(values::Struct {
        class_hash: h("VfxChildIdentifier"),
        properties: child_identifier_props,
        meta: Default::default(),
    });

    let children_identifiers = PVE::Container(values::Container::Embedded {
        items: vec![child_identifier],
        meta: Default::default(),
    });

    let mut child_particle_set_props = IndexMap::new();
    child_particle_set_props.insert(
        children_identifiers_hash,
        make_prop(children_identifiers_hash, children_identifiers),
    );
    let child_particle_set = PVE::Struct(values::Struct {
        class_hash: h("VfxChildParticleSetDefinitionData"),
        properties: child_particle_set_props,
        meta: Default::default(),
    });

    let mut props = IndexMap::new();
    props.insert(
        is_single_hash,
        make_prop(is_single_hash, PVE::Bool(values::Bool::new(true))),
    );
    props.insert(child_set_hash, make_prop(child_set_hash, child_particle_set));
    props.insert(bind_weight_hash, make_prop(bind_weight_hash, make_value_float(1.0)));
    props.insert(
        particle_is_local_hash,
        make_prop(
            particle_is_local_hash,
            PVE::Bool(values::Bool::new(true)),
        ),
    );
    props.insert(rate_hash, make_prop(rate_hash, make_value_float(1.0)));
    props.insert(
        emitter_name_hash,
        make_prop(
            emitter_name_hash,
            PVE::String(values::String::from(format!(
                "Trigger_{}_{}",
                count, emitter_name_original
            ))),
        ),
    );

    values::Struct {
        class_hash: h("VfxEmitterDefinitionData"),
        properties: props,
        meta: Default::default(),
    }
}

fn make_wrapper_system(trigger_name: &str, original_emitter: values::Struct) -> (u32, BinObject) {
    let complex_emitter_hash = h("complexEmitterDefinitionData");
    let particle_name_hash = h("particleName");
    let particle_path_hash = h("particlePath");
    let vfx_type_hash = h("VfxSystemDefinitionData");
    let path_hash = h(trigger_name);

    let emitter_list = PVE::Container(values::Container::Struct {
        items: vec![original_emitter],
        meta: Default::default(),
    });

    let mut props = IndexMap::new();
    props.insert(
        complex_emitter_hash,
        make_prop(complex_emitter_hash, emitter_list),
    );
    props.insert(
        particle_name_hash,
        make_prop(
            particle_name_hash,
            PVE::String(values::String::from(trigger_name.to_string())),
        ),
    );
    props.insert(
        particle_path_hash,
        make_prop(
            particle_path_hash,
            PVE::String(values::String::from(trigger_name.to_string())),
        ),
    );

    (
        path_hash,
        BinObject {
            path_hash,
            class_hash: vfx_type_hash,
            properties: props,
        },
    )
}

pub fn run(bin_path: &Path) -> Result<(), String> {
    eprintln!("============================================================");
    eprintln!("{:^60}", "!!! WARNING !!!");
    eprintln!("============================================================");
    eprintln!();
    eprintln!("Are you sure what you are doing?");
    eprintln!("This script is meant to make VFX separated to watch them");
    eprintln!("in replay with League Director.");
    eprintln!();
    eprintln!("CRITICAL: Once you close the replay and start actually");
    eprintln!("working on the skin, RESTORE THE BACKUP.");
    eprintln!("------------------------------------------------------------");
    eprintln!();
    eprintln!("Type 'yes' (exactly) to proceed:");

    let mut confirm = String::new();
    io::stdin()
        .read_line(&mut confirm)
        .map_err(|e| format!("Failed reading confirmation: {}", e))?;
    let answer = confirm.trim().to_lowercase();
    if answer != "yes" {
        return Err("Aborted by user (did not type 'yes')".to_string());
    }

    let temp_backup = std::env::temp_dir().join(format!(
        "{}_quartz_temp_{}.bin",
        bin_path.file_stem().unwrap_or_default().to_string_lossy(),
        std::process::id()
    ));
    fs::copy(bin_path, &temp_backup)
        .map_err(|e| format!("Failed creating temp backup {}: {}", temp_backup.display(), e))?;

    let local_backup = bin_path
        .parent()
        .ok_or_else(|| "Target bin has no parent directory".to_string())?
        .join(format!(
            "{}_backup.bin",
            bin_path.file_stem().unwrap_or_default().to_string_lossy()
        ));
    fs::copy(bin_path, &local_backup)
        .map_err(|e| format!("Failed creating local backup {}: {}", local_backup.display(), e))?;

    let mut bin = read_bin(bin_path)?;
    let vfx_type_hash = h("VfxSystemDefinitionData");
    let complex_emitter_hash = h("complexEmitterDefinitionData");

    let keys: Vec<u32> = bin
        .objects
        .iter()
        .filter_map(|(&k, obj)| (obj.class_hash == vfx_type_hash).then_some(k))
        .collect();

    if keys.is_empty() {
        return Err("No VFX systems found in this BIN".to_string());
    }

    let mut new_entries: Vec<(u32, BinObject)> = Vec::new();
    let mut total_emitters = 0usize;

    for key in keys {
        let Some(system) = bin.objects.get_mut(&key) else { continue };
        let short_name = get_system_short_name(system);

        let Some(prop) = system.properties.get_mut(&complex_emitter_hash) else { continue };
        let PVE::Container(values::Container::Struct { items, .. }) = &mut prop.value else {
            continue;
        };
        if items.is_empty() {
            continue;
        }

        let original_emitters = items.clone();
        let mut triggers = Vec::with_capacity(original_emitters.len());

        for (idx, emitter) in original_emitters.iter().enumerate() {
            let emitter_name = get_emitter_name(emitter).unwrap_or_else(|| format!("Emitter_{}", idx + 1));
            let trigger_name = format!("REC_{}_{}", short_name, emitter_name);

            triggers.push(make_trigger_emitter(&trigger_name, &emitter_name, idx + 1));
            new_entries.push(make_wrapper_system(&trigger_name, emitter.clone()));
            total_emitters += 1;
        }

        *items = triggers;
    }

    for (k, obj) in new_entries.iter().cloned() {
        bin.objects.insert(k, obj);
    }

    write_bin(bin_path, &bin)?;
    eprintln!(
        "SUCCESS: emitters split {}, new wrapper entries {}",
        total_emitters,
        new_entries.len()
    );
    eprintln!("Backups: {}, {}", temp_backup.display(), local_backup.display());
    Ok(())
}
