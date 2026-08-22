//! Consolidate must not move a mesh texture that is referenced as `file =`.
//!
//! Riot's PBE string->hash migration moved `SkinMeshDataProperties.texture` (and
//! its material overrides) from `string =` to `file =`. Consolidate decides what
//! is "VFX-exclusive" by collecting asset STRINGS from non-VFX entries, so a mesh
//! texture referenced only as `file =` never entered the protected set and got
//! moved into `<prefix>/skin<N>_<champ>_particles/`, breaking the mesh.
//!
//! Seraphine skin0 is the reported case:
//!   body       - 1 `file =` (mesh) + 1 `string =` (VFX)  -> was moved
//!   ultspeaker - 1 `file =` (mesh) + 5 `string =` (VFX)  -> was moved
//!   hair       - 3 `file =` (mesh) + 0 `string =`        -> never a VFX ref
//!
//! Ignored by default: needs a PBE install.

use std::path::Path;

use quartz_lib::bin::bin_editor::{collect_protected_assets, ProtectedAssets};

const PBE_SERAPHINE_WAD: &str =
    r"C:\Riot Games\League of Legends (PBE)\Game\DATA\FINAL\Champions\Seraphine.wad.client";

/// The mesh textures of Seraphine skin0, all referenced via `file =`.
const MESH_TEXTURES: &[&str] = &[
    "assets/characters/seraphine/skins/base/seraphine_base_body_tx_cm.tex",
    "assets/characters/seraphine/skins/base/seraphine_base_hair_tx_cm.tex",
    "assets/characters/seraphine/skins/base/seraphine_base_ultspeaker_tx_cm.tex",
];

#[test]
#[ignore = "requires a local PBE install"]
fn file_referenced_mesh_textures_are_protected_from_consolidate() {
    if !Path::new(PBE_SERAPHINE_WAD).exists() {
        eprintln!("SKIP: no PBE Seraphine WAD");
        return;
    }

    // Pull the real skin0.bin out of the PBE WAD.
    let bin_bytes = read_chunk_by_path(
        PBE_SERAPHINE_WAD,
        "data/characters/seraphine/skins/skin0.bin",
    )
    .expect("skin0.bin should be in the PBE Seraphine WAD");

    let tmp = std::env::temp_dir().join("quartz_consolidate_protect_test");
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp).unwrap();
    let bin_path = tmp.join("skin0.bin");
    std::fs::write(&bin_path, &bin_bytes).unwrap();

    let mut protected: ProtectedAssets = Default::default();
    collect_protected_assets(&bin_path, &mut protected);

    let missing: Vec<&str> = MESH_TEXTURES
        .iter()
        .copied()
        .filter(|t| !protected.contains(*t))
        .collect();

    for t in MESH_TEXTURES {
        eprintln!("  protected={:<5} {t}", protected.contains(*t));
    }

    assert!(
        missing.is_empty(),
        "mesh textures referenced as `file =` are not protected from consolidate \
         (they get moved into the particles folder): {missing:#?}"
    );
}

/// Read one chunk out of a WAD by its path, decompressing as needed.
fn read_chunk_by_path(wad: &str, rel: &str) -> Option<Vec<u8>> {
    let toc = quartz_lib::wad::read_wad_toc(Path::new(wad)).ok()?;
    let want = quartz_lib::wad::path_hash(rel);
    let _ = toc.iter().find(|e| e.path_hash == want)?;
    quartz_lib::wad_explorer::read_chunk(wad, want).ok()
}
