//! FULL pipeline against a FRESH PBE Aatrox WAD: extract skin0 -> repath("ebay") ->
//! inspect until correct. Checks all three things that must line up:
//!   1. the `image: file =` hash in the bin == xxh64(ebay-prefixed loadscreen path)
//!   2. the PHYSICAL loadscreen .tex moved to the ebay-prefixed folder on disk
//!   3. the bin carries a CELMAP trailer mapping that hash -> the ebay path
//! This drives the exact code the extractor-repath UI runs.

use quartz_lib::bin::bin_trailer;
use quartz_lib::extractor::{extract_skin, repath_extracted, ExtractOptions, RepathOptions};
use std::path::Path;

const PBE: &str = r"C:\Riot Games\League of Legends (PBE)";

fn find_file(dir: &Path, name: &str, out: &mut Vec<std::path::PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() {
            find_file(&p, name, out);
        } else if p.file_name().map(|n| n.eq_ignore_ascii_case(name)).unwrap_or(false) {
            out.push(p);
        }
    }
}

/// Find the `image` File value (fnv1a32("image") = 0xb35135fa) recursively.
fn find_image_file(v: &ritoshark::bin::BinValue) -> std::option::Option<u64> {
    use ritoshark::bin::BinValue as B;
    match v {
        B::Embed { fields, .. } | B::Pointer { fields, .. } => {
            if let Some(B::File(h)) = fields.get(&0xb35135fau32) {
                return Some(*h);
            }
            for f in fields.values() {
                if let Some(h) = find_image_file(f) {
                    return Some(h);
                }
            }
            None
        }
        B::List { items, .. } => items.iter().find_map(find_image_file),
        B::Map { entries, .. } => entries
            .iter()
            .find_map(|(k, val)| find_image_file(k).or_else(|| find_image_file(val))),
        B::Option { value: Some(inner), .. } => find_image_file(inner),
        _ => None,
    }
}

#[test]
fn full_pipeline_aatrox_ebay() {
    if !Path::new(PBE).exists() {
        eprintln!("skip: no PBE install at {PBE}");
        return;
    }

    let root = std::path::PathBuf::from(r"C:\qz_full");
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).unwrap();

    // 1. EXTRACT Aatrox skin0 (clean) from the fresh PBE WAD.
    let ex = extract_skin(
        ExtractOptions {
            league_root: Path::new(PBE),
            champion: "aatrox",
            skin_id: 0,
            output_dir: &root,
            include_vo: false,
            clean: true,
            chroma_id: None,
            preserve_hud_icons2d: false,
            skip_sfx: true,
            folder_name: Some("aa"),
        },
        |_| {},
    )
    .expect("extract");
    eprintln!("extract: ok={} files={} dir={}", ex.ok, ex.files, ex.output_dir);
    let content = std::path::PathBuf::from(&ex.output_dir);

    // 2. REPATH with prefix ebay (creator=ebay, no project -> prefix = "ebay").
    let rp = repath_extracted(RepathOptions {
        content_dir: &content,
        champion: "aatrox",
        skin_id: 0,
        creator_name: "ebay",
        project_name: "",
        combine_linked: true,
        cleanup_unused: false,
        skip_sfx: true,
        skip_vo: true,
        split_vfx: true,
        split_anm: true,
        consolidate_assets: true,
        wad_folder_override: None,
    })
    .expect("repath");
    eprintln!("repath: ok={} paths_modified={} relocated={}", rp.ok, rp.paths_modified, rp.files_relocated);

    // ── INSPECT ──────────────────────────────────────────────────────────────
    // The expected ebay loadscreen path + its hash.
    let ebay_path = "assets/ebay/characters/aatrox/skins/base/aatroxloadscreen.tex";
    let ebay_hash = quartz_lib::hash::xxh64(ebay_path);
    eprintln!("EXPECT: image file hash == xxh64(\"{ebay_path}\") == {ebay_hash:016x}");

    // Locate the MAIN skins/skin0.bin (not animations/skin0.bin) — the one holding `image`.
    let mut bins = Vec::new();
    find_file(&content, "skin0.bin", &mut bins);
    assert!(!bins.is_empty(), "no skin0.bin in output");
    let binp = bins
        .iter()
        .find(|p| p.to_string_lossy().to_lowercase().replace('\\', "/").contains("/skins/skin0.bin"))
        .expect("no skins/skin0.bin");
    eprintln!("inspecting bin: {}", binp.display());
    let bytes = std::fs::read(binp).unwrap();

    // (3) trailer present?
    let trailer = bin_trailer::read_trailer(&bytes);
    let body = bin_trailer::strip_trailer(&bytes);
    let bin = quartz_lib::bin::read_bin(body).expect("parse bin");

    // (1) image file hash correct?
    let img = find_image_file_in_bin(&bin);
    eprintln!("ACTUAL: image file hash in bin = {:?}", img.map(|h| format!("{h:016x}")));
    eprintln!("TRAILER: {} entries", trailer.len());
    for (k, v) in trailer.iter().take(6) { eprintln!("   {k} -> {v}"); }

    // (2) physical file moved?
    let mut loads = Vec::new();
    find_file(&content, "aatroxloadscreen.tex", &mut loads);
    for l in &loads {
        eprintln!("PHYSICAL loadscreen at: {}", l.strip_prefix(&content).unwrap_or(l).display());
    }

    // ── ASSERTIONS (what the user wants) ─────────────────────────────────────
    assert_eq!(img, Some(ebay_hash), "image file= hash is NOT the ebay-prefixed path's hash");
    assert!(!trailer.is_empty(), "NO trailer written");
    assert_eq!(trailer.get(&format!("{ebay_hash:016x}")).map(String::as_str), Some(ebay_path),
        "trailer missing the ebay loadscreen mapping");
    let moved = loads.iter().any(|l| {
        let s = l.to_string_lossy().to_lowercase().replace('\\', "/");
        s.contains("/ebay/characters/aatrox/skins/base/aatroxloadscreen.tex")
    });
    assert!(moved, "PHYSICAL loadscreen .tex did NOT move to the ebay path");

    // (4) files.txt at the mod root lists the file= paths (one per line, no hash).
    let files_txt = content.join("files.txt");
    assert!(files_txt.exists(), "no files.txt at mod root");
    let listed = std::fs::read_to_string(&files_txt).unwrap();
    let lines: Vec<&str> = listed.lines().collect();
    eprintln!("files.txt: {} lines; contains loadscreen: {}", lines.len(),
        lines.iter().any(|l| l.contains("aatroxloadscreen")));
    assert!(lines.iter().any(|l| *l == ebay_path),
        "files.txt missing the ebay loadscreen path");
    // No hashes, just paths: no line should look like a bare 16-hex hash.
    assert!(!lines.iter().any(|l| l.len() == 16 && l.bytes().all(|b| b.is_ascii_hexdigit())),
        "files.txt should contain paths, not hashes");

    let _ = std::fs::remove_dir_all(&root);
}

fn find_image_file_in_bin(bin: &ritoshark::bin::Bin) -> Option<u64> {
    for e in &bin.entries {
        for f in e.fields.values() {
            if let Some(h) = find_image_file(f) {
                return Some(h);
            }
        }
    }
    None
}
