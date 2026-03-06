use std::fs;
use std::path::Path;

use ltk_meta::property::{values, BinProperty, PropertyValueEnum};
use ltk_meta::Bin;
use rayon::prelude::*;
use crate::utils::{fnv1a_32, read_bin, write_bin};

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

fn replace_object_key(bin: &mut Bin, old_key: u32, new_key: u32) -> Result<(), String> {
    if old_key == new_key {
        return Ok(());
    }
    let mut obj = match bin.objects.shift_remove(&old_key) {
        Some(v) => v,
        None => return Err(format!("Object {:08x} not found while rekeying", old_key)),
    };
    obj.path_hash = new_key;
    bin.objects.insert(new_key, obj);
    Ok(())
}

pub fn run(source_bin_path: &Path) -> Result<(), String> {
    if !source_bin_path.exists() {
        return Err(format!("Source BIN not found: {}", source_bin_path.display()));
    }

    let source_size = fs::metadata(source_bin_path)
        .map_err(|e| format!("Failed to stat source bin {}: {}", source_bin_path.display(), e))?
        .len();
    let source_bin = read_bin(source_bin_path)?;

    let scdp_type = fnv1a_32("SkinCharacterDataProperties");
    let rr_type = fnv1a_32("ResourceResolver");
    let mrr_field = fnv1a_32("mResourceResolver");

    let base_scdp_hash = source_bin
        .objects
        .iter()
        .find_map(|(&k, obj)| (obj.class_hash == scdp_type).then_some(k))
        .ok_or_else(|| "SkinCharacterDataProperties not found in source BIN".to_string())?;

    let base_rr_hash = source_bin
        .objects
        .iter()
        .find_map(|(&k, obj)| (obj.class_hash == rr_type).then_some(k));

    let (champ, source_skin_idx) = parse_skin_info(source_bin_path);
    let out_dir = source_bin_path
        .parent()
        .ok_or_else(|| "Source bin has no parent directory".to_string())?;

    eprintln!(
        "Running NoSkinLite for {} (Skin {})",
        champ,
        source_skin_idx
    );

    let targets: Vec<u32> = (0u32..100u32)
        .filter(|&target_idx| target_idx != source_skin_idx)
        .filter_map(|target_idx| {
            let out_path = out_dir.join(format!("skin{}.bin", target_idx));
            if out_path.exists() {
                match out_path.metadata() {
                    Ok(meta) if meta.len() != source_size => None,
                    Ok(_) => Some(target_idx),
                    Err(_) => None,
                }
            } else {
                Some(target_idx)
            }
        })
        .collect();

    targets
        .par_iter()
        .try_for_each(|&target_idx| -> Result<(), String> {
            let out_path = out_dir.join(format!("skin{}.bin", target_idx));
            let mut bin = source_bin.clone();

            let new_scdp_path = format!("characters/{}/skins/skin{}", champ, target_idx);
            let new_scdp_hash = fnv1a_32(&new_scdp_path);
            replace_object_key(&mut bin, base_scdp_hash, new_scdp_hash)?;

            let mut new_rr_hash = None;
            if let Some(rr_old_hash) = base_rr_hash {
                let new_rr_link = format!("Characters/{}/Skins/Skin{}/Resources", champ, target_idx);
                let rr_hash = fnv1a_32(&new_rr_link.to_lowercase());
                replace_object_key(&mut bin, rr_old_hash, rr_hash)?;
                new_rr_hash = Some(rr_hash);
            }

            if let Some(scdp_obj) = bin.objects.get_mut(&new_scdp_hash) {
                if let Some(prop) = scdp_obj.properties.get_mut(&mrr_field) {
                    if let Some(rr_hash) = new_rr_hash {
                        prop.value = match prop.value {
                            PropertyValueEnum::String(_) => {
                                let rr_link = format!("Characters/{}/Skins/Skin{}/Resources", champ, target_idx);
                                PropertyValueEnum::String(values::String::from(rr_link))
                            }
                            _ => PropertyValueEnum::ObjectLink(values::ObjectLink::new(rr_hash)),
                        };
                    }
                } else if let Some(rr_hash) = new_rr_hash {
                    scdp_obj.properties.insert(
                        mrr_field,
                        BinProperty {
                            name_hash: mrr_field,
                            value: PropertyValueEnum::ObjectLink(values::ObjectLink::new(rr_hash)),
                        },
                    );
                }
            }

            write_bin(&out_path, &bin)?;
            Ok(())
        })?;

    eprintln!("NoSkinLite complete: wrote {} skin bins", targets.len());
    Ok(())
}
