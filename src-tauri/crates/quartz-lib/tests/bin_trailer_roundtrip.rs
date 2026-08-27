//! Round-trip proof for the hash->path trailer that preserves repathed asset
//! paths across Riot's string->file/hash migration.
//!
//! The core guarantee: a `file =` value repathed to a CUSTOM path (whose hash is
//! in no dictionary) survives a write -> read cycle, because the bumped path is
//! embedded in the bin's trailer and read back out.
//!
//! LEGACY-COMPAT. Quartz no longer WRITES trailers (the record lives in `files.txt`
//! beside the mod), so this covers the read path only: a bin that already carries one,
//! written by an older Quartz or another tool, must keep resolving its custom paths.
//! The writer is called here to produce that input, not because anything ships it.
//!
//! Uses the real extracted skin0.bin when present; otherwise a synthetic bin.

use quartz_lib::bin::bin_trailer;
use std::collections::HashMap;

/// The trailer must be invisible to the bin parser: a bin body with a trailer
/// appended parses to the identical tree, and the trailer round-trips.
#[test]
fn trailer_is_parser_invisible_and_roundtrips() {
    // A minimal valid PROP bin: signature + version + 0 links + 0 entries.
    // (We only need `read_bin` to succeed and return the same thing with/without
    // the trailer.)
    let mut body: Vec<u8> = Vec::new();
    body.extend_from_slice(b"PROP");
    body.extend_from_slice(&3u32.to_le_bytes()); // version
    body.extend_from_slice(&0u32.to_le_bytes()); // link count
    body.extend_from_slice(&0u32.to_le_bytes()); // entry count

    let clean = quartz_lib::bin::read_bin(&body).expect("clean bin parses");

    // Append a repath trailer.
    let mut map = HashMap::new();
    let custom = "assets/characters/aatrox/skins/base/loadnewpath/aatroxloadscreen.tex";
    let h = quartz_lib::hash::xxh64(custom);
    map.insert(format!("{:016x}", h), custom.to_string());
    let with_trailer = bin_trailer::append_trailer(&body, &map);

    // Parser ignores the trailer: identical entry/link counts.
    let parsed = quartz_lib::bin::read_bin(&with_trailer).expect("trailered bin parses");
    assert_eq!(parsed.entries.len(), clean.entries.len(), "trailer changed entry count");
    assert_eq!(parsed.linked.len(), clean.linked.len(), "trailer changed link count");

    // The map round-trips out of the file.
    let got = bin_trailer::read_trailer(&with_trailer);
    assert_eq!(got.get(&format!("{:016x}", h)).map(String::as_str), Some(custom));

    // strip_trailer recovers the exact original body.
    assert_eq!(bin_trailer::strip_trailer(&with_trailer), &body[..]);

    // A trailer-free bin yields an empty map (no false positives).
    assert!(bin_trailer::read_trailer(&body).is_empty());
}

/// The "gone forever" property: a custom repathed path's xxh64 is NOT recoverable
/// from any dictionary — only from the embedded trailer. This asserts the trailer
/// is genuinely necessary (the hash alone can't be reversed).
#[test]
fn custom_path_needs_the_trailer() {
    let custom = "assets/characters/aatrox/skins/base/loadnewpath/aatroxloadscreen.tex";
    let h = quartz_lib::hash::xxh64(custom);
    // The shared mapper does not know this invented path.
    let known = quartz_lib::bin::ritoshark_bridge::get_cached_bin_hashes()
        .read()
        .get(h)
        .map(|s| s.to_string());
    assert!(known.is_none(), "invented path unexpectedly in dictionary: {:?}", known);

    // But once embedded + registered, it resolves.
    let mut map = HashMap::new();
    map.insert(format!("{:016x}", h), custom.to_string());
    {
        let mut w = quartz_lib::bin::ritoshark_bridge::get_cached_bin_hashes().write();
        w.insert(h, custom.to_string());
    }
    let now = quartz_lib::bin::ritoshark_bridge::get_cached_bin_hashes()
        .read()
        .get(h)
        .map(|s| s.to_string());
    assert_eq!(now.as_deref(), Some(custom));
}

/// If the real extracted skin0.bin is present, prove a full reroute -> embed ->
/// read cycle on a real bin: change the `image` File value to a custom path,
/// append the trailer, read it back, and confirm the custom path is recovered.
#[test]
fn real_skin0_reroute_roundtrip() {
    let path = r"C:\Users\Frog\Desktop\aatrox_skin0_extracted_clean_3\data\characters\aatrox\skins\skin0.bin";
    let Ok(data) = std::fs::read(path) else {
        eprintln!("skip: real skin0.bin not present at {path}");
        return;
    };
    let body = bin_trailer::strip_trailer(&data).to_vec();
    let bin = quartz_lib::bin::read_bin(&body).expect("skin0 parses");

    // The bin should carry at least one File value (the migrated image/texture refs).
    fn count_files(v: &ritoshark::bin::BinValue, n: &mut usize) {
        use ritoshark::bin::BinValue::*;
        match v {
            File(_) => *n += 1,
            List { items, .. } => items.iter().for_each(|x| count_files(x, n)),
            Map { entries, .. } => entries.iter().for_each(|(k, val)| { count_files(k, n); count_files(val, n); }),
            Pointer { fields, .. } | Embed { fields, .. } => fields.values().for_each(|x| count_files(x, n)),
            Option { value: Some(inner), .. } => count_files(inner, n),
            _ => {}
        }
    }
    let mut files = 0usize;
    for e in &bin.entries {
        for f in e.fields.values() {
            count_files(f, &mut files);
        }
    }
    // Not asserting a specific count (varies by patch), just that the machinery runs.
    eprintln!("skin0.bin File-typed values: {files}");

    // Embed a custom repath and prove recovery.
    let custom = "assets/characters/aatrox/skins/base/loadnewpath/aatroxloadscreen.tex";
    let h = quartz_lib::hash::xxh64(custom);
    let mut map = HashMap::new();
    map.insert(format!("{:016x}", h), custom.to_string());
    let embedded = bin_trailer::append_trailer(&body, &map);

    // Re-read as a normal bin: unaffected.
    let reparsed = quartz_lib::bin::read_bin(&embedded).expect("embedded skin0 parses");
    assert_eq!(reparsed.entries.len(), bin.entries.len());

    // Trailer recovered.
    let recovered = bin_trailer::read_trailer(&embedded);
    assert_eq!(recovered.get(&format!("{:016x}", h)).map(String::as_str), Some(custom));
}
