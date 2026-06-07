use super::types::*;
use super::hash_manager::HashManager;

/// Resolve numeric hashes to their string names using the hash manager.
pub fn unhash(bin: &mut Bin, hashes: &HashManager) {
    for value in bin.sections.values_mut() {
        unhash_value(value, hashes);
    }
}

fn unhash_fnv1a(h: &mut FNV1a, hashes: &HashManager) {
    if h.string.is_none() && h.hash != 0 {
        if let Some(name) = hashes.get_fnv1a(h.hash) {
            h.string = Some(name.to_string());
        }
    }
}

fn unhash_xxh64(h: &mut XXH64, hashes: &HashManager) {
    if h.string.is_none() && h.hash != 0 {
        if let Some(name) = hashes.get_xxh64(h.hash) {
            h.string = Some(name.to_string());
        }
    }
}

fn unhash_value(value: &mut BinValue, hashes: &HashManager) {
    match value {
        BinValue::Hash(h) => unhash_fnv1a(h, hashes),
        BinValue::Link(h) => unhash_fnv1a(h, hashes),
        BinValue::File(f) => unhash_xxh64(f, hashes),

        BinValue::Pointer { name, fields } => {
            unhash_fnv1a(name, hashes);
            for field in fields {
                unhash_fnv1a(&mut field.key, hashes);
                unhash_value(&mut field.value, hashes);
            }
        }
        BinValue::Embed { name, fields } => {
            unhash_fnv1a(name, hashes);
            for field in fields {
                unhash_fnv1a(&mut field.key, hashes);
                unhash_value(&mut field.value, hashes);
            }
        }

        BinValue::List { items, .. }
        | BinValue::List2 { items, .. }
        | BinValue::Option { items, .. } => {
            for item in items {
                unhash_value(item, hashes);
            }
        }

        BinValue::Map { items, .. } => {
            for (k, v) in items {
                unhash_value(k, hashes);
                unhash_value(v, hashes);
            }
        }

        // Primitives — no hashes to resolve
        _ => {}
    }
}
