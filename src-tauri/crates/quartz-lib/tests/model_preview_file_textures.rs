//! Model viewer must resolve textures that Riot migrated to `file =`.
//!
//! On PBE every texture reference in a skin bin is now a hashed `file =` value:
//!   - `SkinMeshDataProperties.texture` (base body)
//!   - `SkinMeshDataProperties_MaterialOverride.texture` (per-submesh)
//!   - `StaticMaterialDef.samplerValues[].texturePath` (via a `Material` link)
//!
//! The preview resolver read all of these with a String-only accessor, so each
//! came back `None` and the viewer fell back to a flat palette colour instead of
//! the real texture.
//!
//! Ignored by default: needs a PBE install.

use std::path::Path;

use quartz_lib::skin_preview::{resolve_skin_preview_for, SkinPreviewDefinition};

const PBE_CHAMPIONS: &str =
    r"C:\Riot Games\League of Legends (PBE)\Game\DATA\FINAL\Champions";

fn preview_for(champ: &str) -> Option<SkinPreviewDefinition> {
    let wad = format!("{PBE_CHAMPIONS}\\{champ}.wad.client");
    if !Path::new(&wad).exists() {
        return None;
    }
    let lower = champ.to_ascii_lowercase();
    let rel = format!("data/characters/{lower}/skins/skin0.bin");
    let want = quartz_lib::wad::path_hash(&rel);
    let bytes = quartz_lib::wad_explorer::read_chunk(&wad, want).ok()?;
    let bin = quartz_lib::bin::read_bin(&bytes).ok()?;
    resolve_skin_preview_for(&[bin], &format!("characters/{lower}/skins/skin0"))
}

#[test]
#[ignore = "requires a local PBE install"]
fn pbe_base_texture_resolves_for_ahri_and_aatrox() {
    for champ in ["Ahri", "Aatrox"] {
        let Some(def) = preview_for(champ) else {
            eprintln!("SKIP {champ}: no PBE WAD / no SCDP");
            continue;
        };
        eprintln!(
            "{champ}: skn={:?} base_texture={:?} overrides={}",
            def.simple_skin, def.base_texture, def.texture_overrides.len()
        );
        assert!(
            def.base_texture.is_some(),
            "{champ}: base texture is `file =` on PBE and did not resolve — \
             the viewer falls back to a flat colour"
        );
    }
}

#[test]
#[ignore = "requires a local PBE install"]
fn pbe_material_override_texture_resolves_for_ahri() {
    // Ahri's `Tail_Large` override is authored as a direct `texture: file =`,
    // and `Tails` / `Body` resolve through a `Material: link` to a
    // StaticMaterialDef whose `texturePath` is also `file =`.
    let Some(def) = preview_for("Ahri") else {
        eprintln!("SKIP: no PBE Ahri WAD");
        return;
    };
    for (submesh, texture) in &def.texture_overrides {
        eprintln!("  override {submesh} -> {texture}");
    }
    assert!(
        def.texture_overrides
            .keys()
            .any(|k| k.eq_ignore_ascii_case("Tail_Large")),
        "Ahri: `Tail_Large` override texture (`file =`) did not resolve; got {:?}",
        def.texture_overrides.keys().collect::<Vec<_>>()
    );
}
