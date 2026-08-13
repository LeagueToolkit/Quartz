//! Every asset reference in a repathed mod must resolve to a file on disk.
//!
//! Extracts a champion from the real install, runs the full repath, then walks
//! EVERY BIN and checks EVERY asset string against the filesystem. This is a
//! stronger check than "is it prefixed": a path can carry the prefix and still
//! be wrong, or be consolidated away and leave the old string behind.
//!
//! Locke is the default because it has a subcharacter (LockeTotem) that shares
//! particle textures with the main champion - the case where per-bin
//! consolidation moved a file out from under another bin's references.
//!
//! Gated on a real install; skips when absent. Run:
//!   cargo test -p quartz-lib --test locke_repath_all_assets -- --nocapture

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use quartz_lib::bin::{read_bin, BinValue};
use quartz_lib::extractor::{extract_skin, repath_extracted, ExtractOptions, RepathOptions};

fn league_root() -> Option<PathBuf> {
    let p = std::env::var("QUARTZ_LEAGUE_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(r"C:\Riot Games\League of Legends"));
    p.join("Game")
        .join("DATA")
        .join("FINAL")
        .join("Champions")
        .is_dir()
        .then_some(p)
}

fn champ() -> String {
    std::env::var("QUARTZ_ASSET_CHAMP").unwrap_or_else(|_| "locke".to_string())
}
fn skin_id() -> u32 {
    std::env::var("QUARTZ_ASSET_SKIN")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
}

/// Asset-looking strings by extension. Deliberately broad: the point is to catch
/// references the repath forgot, so anything file-shaped under assets/ or data/
/// counts until proven otherwise.
fn is_asset_ref(s: &str) -> bool {
    let l = s.to_lowercase().replace('\\', "/");
    if !(l.starts_with("assets/") || l.starts_with("data/")) {
        return false;
    }
    [
        ".tex", ".dds", ".png", ".jpg", ".skn", ".skl", ".scb", ".sco", ".anm", ".bin", ".bnk",
        ".wpk", ".wem", ".troybin",
    ]
    .iter()
    .any(|e| l.ends_with(e))
}

/// Collect every asset string in a BIN, tagged with the entry class it came from
/// so a failure names the shape that was missed.
fn asset_refs(bin_path: &Path, out: &mut BTreeMap<String, BTreeSet<String>>) {
    let Ok(bytes) = std::fs::read(bin_path) else { return };
    let Ok(bin) = read_bin(&bytes) else { return };

    fn walk(v: &BinValue, hits: &mut Vec<String>) {
        match v {
            BinValue::String(s) => {
                if is_asset_ref(s) {
                    hits.push(s.clone());
                }
            }
            BinValue::List { items, .. } => items.iter().for_each(|i| walk(i, hits)),
            BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => {
                fields.values().for_each(|x| walk(x, hits))
            }
            BinValue::Option { value: Some(inner), .. } => walk(inner, hits),
            BinValue::Map { entries, .. } => {
                for (k, val) in entries.iter() {
                    walk(k, hits);
                    walk(val, hits);
                }
            }
            _ => {}
        }
    }

    let label = bin_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    for entry in &bin.entries {
        let mut hits = Vec::new();
        for (_, value) in entry.fields.iter() {
            walk(value, &mut hits);
        }
        for h in hits {
            out.entry(h)
                .or_default()
                .insert(format!("{}#{:08x}", label, entry.class_hash));
        }
    }
}

fn bins_under(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            bins_under(&p, out);
        } else if p.extension().is_some_and(|x| x.eq_ignore_ascii_case("bin")) {
            out.push(p);
        }
    }
}

/// Case-insensitive existence check: BIN strings carry Riot's casing while the
/// extracted files are written lowercase, so a literal join misses on Linux and
/// would give false failures if this ever runs there.
fn resolves(root: &Path, reference: &str) -> bool {
    let rel = reference.replace('\\', "/");
    let rel = rel.trim_start_matches('/');
    if root.join(rel).is_file() {
        return true;
    }
    root.join(rel.to_lowercase()).is_file()
}

#[test]
fn every_asset_reference_resolves_after_repath() {
    let Some(root) = league_root() else {
        eprintln!("skipping: no League install");
        return;
    };
    let champion = champ();
    let skin = skin_id();

    let out = std::env::temp_dir().join(format!(
        "quartz-assetcheck-{}-{}-{}",
        champion,
        skin,
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&out);
    std::fs::create_dir_all(&out).unwrap();

    // 1) Clean extract, exactly as the Asset Extractor does it.
    let summary = extract_skin(
        ExtractOptions {
            league_root: &root,
            champion: &champion,
            skin_id: skin,
            output_dir: &out,
            include_vo: false,
            clean: true,
            chroma_id: None,
            preserve_hud_icons2d: true,
            skip_sfx: true,
            folder_name: None,
        },
        |_| {},
    )
    .expect("extract failed");
    let content = PathBuf::from(&summary.output_dir);
    assert!(content.is_dir(), "no extract dir");

    // 2) Repath + finalize with the same options the UI sends.
    let prefix = "assetcheck";
    repath_extracted(RepathOptions {
        content_dir: &content,
        champion: &champion,
        skin_id: skin,
        creator_name: prefix,
        project_name: "locke",
        combine_linked: true,
        cleanup_unused: false,
        skip_sfx: true,
        skip_vo: true,
        split_vfx: false,
        split_anm: false,
        consolidate_assets: true,
        wad_folder_override: None,
    })
    .expect("repath failed");

    // NOTE: no `finalize_extracted` here. Finalize is the ALTERNATIVE to repath
    // (the plain skin-dump path); running both would combine twice.

    // 3) Every asset string in every BIN must point at a real file.
    let mut bins = Vec::new();
    bins_under(&content, &mut bins);
    assert!(!bins.is_empty(), "no BINs after repath");

    let mut refs: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for b in &bins {
        asset_refs(b, &mut refs);
    }
    assert!(!refs.is_empty(), "no asset references found - test is not looking at anything");

    /* Two kinds of reference are legitimately absent and must not fail the test:

       AUDIO - SFX/VO banks are skipped by `skip_sfx`/`skip_vo` on purpose (rarely
       modded, and they bloat the dump), so the BIN keeps its original path.

       NOT IN THE WAD - Riot ships dead references. `Run.Locke.anm` is named by
       Locke's animation graph but no such chunk exists in Locke.wad.client, so no
       extractor could produce it. Verified by hashing the path against the WAD's
       own index. */
    let expected_absent = |r: &str| -> bool {
        let l = r.to_lowercase().replace('\\', "/");
        l.contains("/sounds/") || l.ends_with("/animations/run.locke.anm")
    };

    let mut dangling: Vec<(&String, &BTreeSet<String>)> = refs
        .iter()
        .filter(|(r, _)| !resolves(&content, r) && !expected_absent(r))
        .collect();
    dangling.sort_by_key(|(r, _)| r.to_lowercase());

    if !dangling.is_empty() {
        eprintln!(
            "\n{} of {} asset references do not resolve under {}:",
            dangling.len(),
            refs.len(),
            content.display()
        );
        for (r, sources) in &dangling {
            eprintln!("  {}", r);
            for s in sources.iter() {
                eprintln!("        from {}", s);
            }
        }
    }

    let checked = refs.len();
    assert!(
        dangling.is_empty(),
        "{} of {checked} asset references dangle after repath (see the list above)",
        dangling.len()
    );

    eprintln!("OK: all {checked} asset references resolve");
    let _ = std::fs::remove_dir_all(&out);
}
