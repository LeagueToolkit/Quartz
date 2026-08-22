//! Repro: PBE Seraphine skin0 clean-extract drops mesh textures.
//!
//! Riot moved `SkinMeshDataProperties.texture` (and the material overrides) from
//! `string =` to `file =` on PBE. This runs the real clean extraction against a
//! local PBE install and reports which of the three mesh textures land on disk.
//!
//! Ignored by default: needs a PBE install.

use std::path::{Path, PathBuf};

use quartz_lib::extractor::{extract_skin, ExtractOptions};

const PBE_ROOT: &str = r"C:\Riot Games\League of Legends (PBE)";

const WANTED: &[&str] = &[
    "assets/characters/seraphine/skins/base/seraphine_base_body_tx_cm.tex",
    "assets/characters/seraphine/skins/base/seraphine_base_hair_tx_cm.tex",
    "assets/characters/seraphine/skins/base/seraphine_base_ultspeaker_tx_cm.tex",
];

#[test]
#[ignore = "requires a local PBE install"]
fn pbe_seraphine_skin0_clean_keeps_mesh_textures() {
    let root = Path::new(PBE_ROOT);
    if !root.exists() {
        eprintln!("SKIP: no PBE install at {PBE_ROOT}");
        return;
    }

    let out = std::env::temp_dir().join("quartz_pbe_seraphine_test");
    let _ = std::fs::remove_dir_all(&out);
    std::fs::create_dir_all(&out).unwrap();

    let summary = extract_skin(
        ExtractOptions {
            league_root: root,
            champion: "Seraphine",
            skin_id: 0,
            output_dir: &out,
            include_vo: false,
            clean: true,
            chroma_id: None,
            preserve_hud_icons2d: false,
            skip_sfx: true,
            folder_name: Some("pbe_test"),
        },
        |_| {},
    )
    .expect("extraction should succeed");

    eprintln!(
        "extracted files={} skipped={} errors={} out={}",
        summary.files,
        summary.skipped,
        summary.errors,
        summary.output_dir
    );

    let root_dir: PathBuf = out.join("pbe_test");
    let mut missing = Vec::new();
    for rel in WANTED {
        let disk = root_dir.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
        let ok = disk.exists();
        eprintln!("  on_disk={ok:<5} {rel}");
        if !ok {
            missing.push(*rel);
        }
    }

    assert!(
        missing.is_empty(),
        "clean extraction dropped mesh textures: {missing:#?}"
    );

    // Now the step that actually broke: finalize runs consolidate, which moves
    // VFX-exclusive assets into `skin<N>_<champ>_particles/`. Mesh textures must
    // stay where the mesh expects them even though they are `file =` refs.
    quartz_lib::extractor::finalize_extracted(quartz_lib::extractor::FinalizeOptions {
        content_dir: &root_dir,
        champion: "Seraphine",
        skin_id: 0,
        split_vfx: false,
        split_anm: false,
        consolidate_assets: true,
        consolidate_prefix: "",
        wad_folder_override: None,
    })
    .expect("finalize should succeed");

    let mut moved = Vec::new();
    for rel in WANTED {
        let disk = root_dir.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
        let ok = disk.exists();
        eprintln!("  after_consolidate on_disk={ok:<5} {rel}");
        if !ok {
            moved.push(*rel);
        }
    }

    assert!(
        moved.is_empty(),
        "consolidate moved mesh textures out of the mesh folder: {moved:#?}"
    );
}
