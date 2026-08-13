//! Consolidation across MULTIPLE bins that share a VFX asset.
//!
//! Reproduces the Locke bug: `Locke` and its subcharacter `LockeTotem` both
//! reference `ASSETS/Characters/Locke/Skins/Base/Particles/Gradient_3.tex`.
//! Consolidation runs once per bin, so the first bin moved the file into its own
//! particles folder and the second, finding the source gone, refused to rewrite
//! its strings (the "don't dangle a reference" guard). The result was the exact
//! failure the guard exists to prevent: the file living in one folder while the
//! other bin's references still pointed at a path that no longer existed.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use quartz_lib::bin::bin_editor::{
    collect_protected_assets, consolidate_assets_repath, consolidate_assets_repath_shared,
    ConsolidatedAssets, ProtectedAssets,
};
use quartz_lib::bin::{read_bin, write_bin};

use ritoshark::bin::{Bin, BinEntry, BinValue};
use ritoshark::hash::fnv1a;

const SHARED_TEX: &str = "ASSETS/Characters/Locke/Skins/Base/Particles/Gradient_3.tex";

/// A BIN holding one `VfxSystemDefinitionData` entry that names `asset`.
fn vfx_bin(asset: &str) -> Bin {
    let mut bin = Bin::new();
    let mut fields = indexmap::IndexMap::new();
    fields.insert(fnv1a("particleName"), BinValue::String(asset.to_string()));
    bin.entries.push(BinEntry {
        path_hash: fnv1a("TestVfxSystem"),
        class_hash: fnv1a("VfxSystemDefinitionData"),
        fields,
    });
    bin
}

fn write_bin_to(path: &Path, bin: &Bin) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, write_bin(bin).unwrap()).unwrap();
}

/// Every asset string in a saved BIN's VFX entries.
fn asset_strings(path: &Path) -> Vec<String> {
    let bin = read_bin(&std::fs::read(path).unwrap()).unwrap();
    let mut out = Vec::new();
    for entry in &bin.entries {
        for (_, value) in entry.fields.iter() {
            if let BinValue::String(s) = value {
                out.push(s.clone());
            }
        }
    }
    out
}

/// Build a project where two characters' bins reference ONE shared texture.
/// Returns (project_dir, locke_bin, totem_bin, the texture's on-disk path).
fn shared_asset_project(tag: &str) -> (PathBuf, PathBuf, PathBuf, PathBuf) {
    let root = std::env::temp_dir().join(format!(
        "quartz-consolidate-{}-{}",
        tag,
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&root);

    let tex = root.join("assets/characters/locke/skins/base/particles/Gradient_3.tex");
    std::fs::create_dir_all(tex.parent().unwrap()).unwrap();
    std::fs::write(&tex, b"TEX\0fake").unwrap();

    let locke = root.join("data/characters/locke/skins/skin0.bin");
    let totem = root.join("data/characters/locketotem/skins/skin0.bin");
    write_bin_to(&locke, &vfx_bin(SHARED_TEX));
    write_bin_to(&totem, &vfx_bin(SHARED_TEX));

    (root, locke, totem, tex)
}

/// THE BUG: consolidating both bins must leave every reference resolvable.
///
/// Whichever folder the shared texture ends up in, BOTH bins have to point at a
/// file that exists. Before the fix the second bin kept the original string while
/// the first had already moved the file out from under it.
#[test]
fn shared_asset_across_bins_stays_resolvable() {
    let (root, locke, totem, original) = shared_asset_project("shared");

    // Same order the repath loop uses: one call per bin, each with its own champ.
    // ONE ledger for the whole run, exactly as the repath loop does it.
    let mut shared = ConsolidatedAssets::default();
    consolidate_assets_repath_shared(&locke, &root, "", "locke", 0, Some(&mut shared), None).unwrap();
    consolidate_assets_repath_shared(&totem, &root, "", "locketotem", 0, Some(&mut shared), None).unwrap();

    assert!(
        !original.exists(),
        "the texture should have been moved out of its original location"
    );

    // Every reference in BOTH bins must resolve to a file that exists.
    let mut checked = 0;
    for (label, bin_path) in [("locke", &locke), ("locketotem", &totem)] {
        for s in asset_strings(bin_path) {
            let rel = s.replace('\\', "/");
            let rel = rel.trim_start_matches('/');
            // `ASSETS/x/y.tex` -> `<root>/assets/x/y.tex`
            let on_disk = root.join(rel.to_lowercase());
            assert!(
                on_disk.exists(),
                "{label}: reference {s:?} points at {} which does not exist - \
                 the other bin moved the file and this one was never rewritten",
                on_disk.display()
            );
            checked += 1;
        }
    }
    assert!(checked >= 2, "expected a reference from each bin, saw {checked}");

    let _ = std::fs::remove_dir_all(&root);
}

/// The shared file must be consolidated ONCE, not duplicated per bin.
#[test]
fn shared_asset_is_not_duplicated() {
    let (root, locke, totem, _) = shared_asset_project("dedup");

    // ONE ledger for the whole run, exactly as the repath loop does it.
    let mut shared = ConsolidatedAssets::default();
    consolidate_assets_repath_shared(&locke, &root, "", "locke", 0, Some(&mut shared), None).unwrap();
    consolidate_assets_repath_shared(&totem, &root, "", "locketotem", 0, Some(&mut shared), None).unwrap();

    let mut copies = Vec::new();
    fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
        let Ok(entries) = std::fs::read_dir(dir) else { return };
        for e in entries.flatten() {
            let p = e.path();
            if p.is_dir() {
                walk(&p, out);
            } else if p.file_name().is_some_and(|n| {
                n.to_string_lossy().eq_ignore_ascii_case("Gradient_3.tex")
            }) {
                out.push(p);
            }
        }
    }
    walk(&root, &mut copies);

    assert_eq!(
        copies.len(),
        1,
        "the shared texture should exist exactly once, found: {copies:#?}"
    );

    let _ = std::fs::remove_dir_all(&root);
}

/// A file referenced by only ONE bin still consolidates normally - the fix must
/// not regress the ordinary single-bin case.
#[test]
fn unshared_asset_still_consolidates() {
    let root = std::env::temp_dir().join(format!("quartz-consolidate-solo-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);

    let asset = "ASSETS/Characters/Annie/Skins/Base/Particles/Spark.tex";
    let tex = root.join("assets/characters/annie/skins/base/particles/Spark.tex");
    std::fs::create_dir_all(tex.parent().unwrap()).unwrap();
    std::fs::write(&tex, b"TEX\0fake").unwrap();

    let bin_path = root.join("data/characters/annie/skins/skin0.bin");
    write_bin_to(&bin_path, &vfx_bin(asset));

    let res = consolidate_assets_repath(&bin_path, &root, "", "annie", 0).unwrap();
    assert_eq!(res.moved, 1, "the asset should have been moved");

    let strings = asset_strings(&bin_path);
    assert!(
        strings.iter().any(|s| s.to_lowercase().contains("skin0_annie_particles")),
        "the reference should have been rewritten into the particles folder, got {strings:?}"
    );
    assert!(!tex.exists(), "the original file should have been moved");

    let _ = std::fs::remove_dir_all(&root);
}

/// An asset that is VFX-only in one bin but a MESH texture in another must not
/// be consolidated at all.
///
/// `LockeTotem_Base_TX_CM.tex` is named by Locke's VFX entries and by the totem's
/// `SkinCharacterDataProperties`. Judging "VFX-exclusive" per bin moved it into a
/// particles folder on Locke's say-so and broke the totem's mesh reference, so the
/// protected set has to be built across every bin first.
#[test]
fn asset_used_as_mesh_texture_elsewhere_is_not_consolidated() {
    let root = std::env::temp_dir().join(format!("quartz-consolidate-mesh-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);

    let shared_tex = "ASSETS/Characters/LockeTotem/Skins/Base/LockeTotem_Base_TX_CM.tex";
    let tex = root.join("assets/characters/locketotem/skins/base/LockeTotem_Base_TX_CM.tex");
    std::fs::create_dir_all(tex.parent().unwrap()).unwrap();
    std::fs::write(&tex, b"TEX\0fake").unwrap();

    // Locke: references it from VFX. Totem: from a character (mesh) entry.
    let locke = root.join("data/characters/locke/skins/skin0.bin");
    write_bin_to(&locke, &vfx_bin(shared_tex));

    let totem = root.join("data/characters/locketotem/skins/skin0.bin");
    let mut mesh_bin = Bin::new();
    let mut fields = indexmap::IndexMap::new();
    fields.insert(fnv1a("skinMeshProperties"), BinValue::String(shared_tex.to_string()));
    mesh_bin.entries.push(BinEntry {
        path_hash: fnv1a("TotemCharacter"),
        class_hash: fnv1a("SkinCharacterDataProperties"),
        fields,
    });
    write_bin_to(&totem, &mesh_bin);

    // Global protected set, exactly as the repath pipeline builds it.
    let mut protected = ProtectedAssets::default();
    for b in [&locke, &totem] {
        collect_protected_assets(b, &mut protected);
    }
    let mut shared = ConsolidatedAssets::default();
    consolidate_assets_repath_shared(&locke, &root, "", "locke", 0, Some(&mut shared), Some(&protected)).unwrap();

    assert!(
        tex.exists(),
        "a texture used as a MESH texture in another bin must stay where the mesh expects it"
    );
    let strings = asset_strings(&locke);
    assert!(
        strings.iter().all(|s| !s.to_lowercase().contains("_particles/")),
        "the VFX reference should NOT have been rewritten into a particles folder, got {strings:?}"
    );

    let _ = std::fs::remove_dir_all(&root);
}

/// Keep the map type used by the fix honest: two bins consolidating the same file
/// must agree on ONE destination.
#[test]
fn shared_asset_lands_in_one_destination() {
    let (root, locke, totem, _) = shared_asset_project("onedest");

    // ONE ledger for the whole run, exactly as the repath loop does it.
    let mut shared = ConsolidatedAssets::default();
    consolidate_assets_repath_shared(&locke, &root, "", "locke", 0, Some(&mut shared), None).unwrap();
    consolidate_assets_repath_shared(&totem, &root, "", "locketotem", 0, Some(&mut shared), None).unwrap();

    let mut seen: HashMap<String, usize> = HashMap::new();
    for bin_path in [&locke, &totem] {
        for s in asset_strings(bin_path) {
            *seen.entry(s.to_lowercase()).or_default() += 1;
        }
    }
    assert_eq!(
        seen.len(),
        1,
        "both bins should reference the same consolidated path, saw {seen:#?}"
    );

    let _ = std::fs::remove_dir_all(&root);
}
