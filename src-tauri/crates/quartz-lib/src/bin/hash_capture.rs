/* Capturing the names a `.bin` is about to reduce to hashes.
Sits beside `bin_trailer`, which stores what this module finds. See
`docs/CUSTOM-PATH-PRESERVATION.md` for the whole scheme and why it exists. */

use ritoshark::bin::Bin;

/// Every `hash -> name` pair this `.py` is the only record of, ready to travel
/// inside the bin.
///
/// CANDIDATE MATCHING, not line parsing. Ported from Flint (`flint-bin`'s
/// `capture_trailer`), whose approach is structurally immune to a whole class of
/// bug this code used to have.
///
/// The old version read the text line by line looking for `file = "…"`. That
/// finds the flat form and nothing else — a value inside a container sits on its
/// own line with the type declared above it:
///
/// ```text
/// iconCircle: option[file] = {
///     "assets/mymod/characters/alistar/hud/alistar_circle.tex"
/// }
/// ```
///
/// so those paths were silently dropped, and every new container shape needed
/// another special case.
///
/// Instead: pull EVERY quoted string out of the text, collect every hash the
/// parsed tree actually contains, and keep the strings whose hash is one of
/// them. Syntax never enters into it, so containers, nesting, object names and
/// map keys are all covered by construction.
///
/// Only pairs the shared dictionary cannot already resolve are kept — those are
/// the repathed / mod-invented names that exist in no hashtable anywhere and are
/// unrecoverable once the bin holds only the hash. Returns `{ hex hash -> name }`,
/// 8-hex for fnv1a32 and 16-hex for xxh64.
pub fn capture_unresolvable_paths(text: &str, tree: &Bin) -> std::collections::HashMap<String, String> {
    use crate::hash::{fnv1a, xxh64};

    let hashes = tree_hashes(tree);
    let mapper = super::ritoshark_bridge::get_cached_bin_hashes().read();
    let mut map = std::collections::HashMap::new();

    for name in text_name_candidates(text) {
        // fnv1a32: object/entry names, `hash =` and `link =` values.
        let h32 = fnv1a(&name);
        if hashes.names.contains(&h32) && mapper.get(h32 as u64).is_none() {
            map.entry(format!("{h32:08x}")).or_insert_with(|| name.clone());
        }
        // xxh64: `file =` asset paths.
        if !hashes.files.is_empty() {
            let h64 = xxh64(&name);
            if hashes.files.contains(&h64) && mapper.get(h64).is_none() {
                map.entry(format!("{h64:016x}")).or_insert_with(|| name.clone());
            }
        }
    }
    map
}

/// The hashes a parsed bin actually holds, split by keyspace.
#[derive(Default)]
struct TreeHashes {
    /// fnv1a32: field, class, entry and object names, plus `hash`/`link` values.
    names: std::collections::HashSet<u32>,
    /// xxh64: `file =` values.
    files: std::collections::HashSet<u64>,
}

fn tree_hashes(tree: &Bin) -> TreeHashes {
    let mut out = TreeHashes::default();
    for entry in &tree.entries {
        out.names.insert(entry.path_hash);
        out.names.insert(entry.class_hash);
        collect_field_hashes(&entry.fields, &mut out);
    }
    // A patch names the field it overrides and carries the same hashed value
    // types a field does.
    for patch in &tree.patches {
        out.names.insert(patch.key_hash);
        collect_value_hashes(&patch.value, patch.key_hash, &mut out);
    }
    out
}

fn collect_field_hashes(
    fields: &indexmap::IndexMap<u32, ritoshark::bin::BinValue>,
    out: &mut TreeHashes,
) {
    for (field, value) in fields {
        out.names.insert(*field);
        collect_value_hashes(value, *field, out);
    }
}

fn collect_value_hashes(value: &ritoshark::bin::BinValue, field: u32, out: &mut TreeHashes) {
    use ritoshark::bin::BinValue;
    match value {
        BinValue::Hash(hash) | BinValue::Link(hash) if *hash != 0 => {
            out.names.insert(*hash);
        }
        BinValue::File(hash) if *hash != 0 => {
            out.files.insert(*hash);
        }
        // A blend-transition key packs two clip-name hashes into one u64.
        BinValue::U64(value) if ritoshark::bin::is_blend_key_field(field) => {
            out.names.insert((value >> 32) as u32);
            out.names.insert(*value as u32);
        }
        BinValue::Pointer { class, fields } | BinValue::Embed { class, fields } => {
            out.names.insert(*class);
            collect_field_hashes(fields, out);
        }
        BinValue::List { items, .. } => {
            for item in items {
                collect_value_hashes(item, field, out);
            }
        }
        BinValue::Map { entries, .. } => {
            for (key, value) in entries {
                collect_value_hashes(key, field, out);
                collect_value_hashes(value, field, out);
            }
        }
        BinValue::Option { value: Some(value), .. } => collect_value_hashes(value, field, out),
        _ => {}
    }
}

/// Every quoted string in the text, comments skipped.
///
/// Deliberately ignorant of syntax: it does not care whether a string is a
/// value, a key, an object name or something in a container. Whether it matters
/// is decided by the caller, by asking if its hash is in the tree.
fn text_name_candidates(text: &str) -> Vec<String> {
    let bytes = text.as_bytes();
    let mut names = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        // `#` and `//` comments: a path mentioned in one is not a real reference.
        if bytes[i] == b'#' || (bytes[i] == b'/' && bytes.get(i + 1) == Some(&b'/')) {
            i = text[i..].find('\n').map(|off| i + off + 1).unwrap_or(bytes.len());
            continue;
        }
        if bytes[i] == b'"' {
            i += 1;
            let mut value = String::new();
            while i < bytes.len() {
                if bytes[i] == b'"' {
                    i += 1;
                    break;
                }
                if bytes[i] == b'\\' && i + 1 < bytes.len() {
                    // Keep the escape's target so the string matches what was hashed.
                    let next = bytes[i + 1];
                    value.push(match next {
                        b'n' => '\n',
                        b't' => '\t',
                        b'r' => '\r',
                        other => other as char,
                    });
                    i += 2;
                    continue;
                }
                let len = utf8_len(bytes[i]);
                if let Ok(chunk) = std::str::from_utf8(&bytes[i..(i + len).min(bytes.len())]) {
                    value.push_str(chunk);
                }
                i += len;
            }
            if !value.is_empty() {
                names.push(value);
            }
            continue;
        }
        i += utf8_len(bytes[i]);
    }
    names
}

/// Byte length of the UTF-8 sequence starting with `b`.
fn utf8_len(b: u8) -> usize {
    match b {
        0x00..=0x7F => 1,
        0xC0..=0xDF => 2,
        0xE0..=0xEF => 3,
        0xF0..=0xF7 => 4,
        _ => 1,
    }
}
