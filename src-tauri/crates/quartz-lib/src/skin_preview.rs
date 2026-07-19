//! BIN-driven SKN material resolution shared by every Quartz model preview.
//!
//! League skins do not reliably name their diffuse texture after the SKN.
//! `SkinMeshDataProperties.texture` is the legacy base, `Material` may link a
//! `StaticMaterialDef`, and `materialOverride` can replace either per submesh.
//! This mirrors Ruby's proven resolver and keeps heuristic filename matching as
//! a last fallback only.

use ritoshark::bin::{Bin, BinEntry, BinValue};
use ritoshark::hash::fnv1a;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkinPreviewDefinition {
    pub simple_skin: Option<String>,
    pub skeleton: Option<String>,
    pub base_texture: Option<String>,
    pub texture_overrides: HashMap<String, String>,
    pub hidden_submeshes: Vec<String>,
    pub skin_scale: f32,
    /// Every `.anm` asset reference authored anywhere in the skin bin (the
    /// AnimationGraphData clips). Deduped, in first-seen order.
    pub animations: Vec<String>,
}

fn fields(value: &BinValue) -> Option<&indexmap::IndexMap<u32, BinValue>> {
    match value {
        BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => Some(fields),
        _ => None,
    }
}

/// Recursively collect every `.anm` string reference in a bin value, in
/// first-seen order (deduped by the caller). Animation clip paths live deep in
/// AnimationGraphData structures, so we walk all container variants.
fn collect_anims(value: &BinValue, out: &mut Vec<String>) {
    match value {
        BinValue::String(s) => {
            if s.to_ascii_lowercase().ends_with(".anm") {
                out.push(s.clone());
            }
        }
        BinValue::List { items, .. } => {
            for item in items {
                collect_anims(item, out);
            }
        }
        BinValue::Map { entries, .. } => {
            for (k, v) in entries {
                collect_anims(k, out);
                collect_anims(v, out);
            }
        }
        BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => {
            for v in fields.values() {
                collect_anims(v, out);
            }
        }
        BinValue::Option { value: Some(inner), .. } => collect_anims(inner, out),
        _ => {}
    }
}

/// Every `.anm` reference authored across all entries of a parsed bin, deduped.
pub fn resolve_animations(bin: &Bin) -> Vec<String> {
    let mut found = Vec::new();
    for entry in &bin.entries {
        for value in entry.fields.values() {
            collect_anims(value, &mut found);
        }
    }
    let mut seen = std::collections::HashSet::new();
    found.retain(|p| seen.insert(p.to_ascii_lowercase()));
    found
}

fn string(value: Option<&BinValue>) -> Option<String> {
    match value {
        Some(BinValue::String(value)) if !value.is_empty() => Some(value.clone()),
        _ => None,
    }
}

fn material_entry<'a>(bin: &'a Bin, value: Option<&BinValue>) -> Option<&'a BinEntry> {
    let path_hash = match value? {
        BinValue::Link(hash) | BinValue::Hash(hash) => *hash,
        BinValue::String(path) => fnv1a(path),
        _ => return None,
    };
    bin.entries.iter().find(|entry| entry.path_hash == path_hash)
}

fn diffuse_from_material(bin: &Bin, value: Option<&BinValue>) -> Option<String> {
    let material = material_entry(bin, value)?;
    if material.class_hash != fnv1a("StaticMaterialDef") {
        return None;
    }
    let BinValue::List { items, .. } = material.fields.get(&fnv1a("samplerValues"))? else {
        return None;
    };
    let mut first = None;
    for item in items {
        let Some(sampler) = fields(item) else { continue };
        let path = string(sampler.get(&fnv1a("texturePath")));
        if first.is_none() {
            first = path.clone();
        }
        let name = string(sampler.get(&fnv1a("TextureName")))
            .unwrap_or_default()
            .to_ascii_lowercase();
        if matches!(name.as_str(), "diffuse_texture" | "diffuse" | "diffusetexture")
            && path.is_some()
        {
            return path;
        }
    }
    first
}

/// Resolve a skin preview from several parsed bins at once by merging their
/// entries. A skin's `StaticMaterialDef`s (that the base/override `Material`
/// links point to) frequently live in a DIFFERENT linked bin than the
/// `SkinCharacterDataProperties`. Resolving against a single bin then misses
/// those material defs and picks the wrong / no base texture. Merging every
/// candidate bin first gives the resolver the full entry set, matching what the
/// donor extraction (Asset Extractor) achieves by combining the bin graph.
pub fn resolve_skin_preview_combined(bins: &[Bin]) -> Option<SkinPreviewDefinition> {
    if bins.len() == 1 {
        return resolve_skin_preview(&bins[0]);
    }
    // Merge all entries; later bins do not overwrite earlier same-hash entries
    // (first definition wins, mirroring find_map's original preference order).
    let mut combined = Bin::default();
    let mut seen = std::collections::HashSet::new();
    for bin in bins {
        for entry in &bin.entries {
            if seen.insert(entry.path_hash) {
                combined.entries.push(entry.clone());
            }
        }
    }
    resolve_skin_preview(&combined)
}

/// Resolve a specific skin from combined bins, selecting the
/// `SkinCharacterDataProperties` entry for `skin_data_path` (e.g.
/// `characters/aatrox/skins/skin0`). Champion WADs ship one combined data bin
/// with EVERY skin's SCDP; picking the first one (as the untargeted resolver
/// does) binds the wrong skin's materials. Falls back to the first SCDP when the
/// exact one is not found.
pub fn resolve_skin_preview_for(bins: &[Bin], skin_data_path: &str) -> Option<SkinPreviewDefinition> {
    let mut combined = Bin::default();
    let mut seen = std::collections::HashSet::new();
    for bin in bins {
        for entry in &bin.entries {
            if seen.insert(entry.path_hash) {
                combined.entries.push(entry.clone());
            }
        }
    }
    let target = fnv1a(&skin_data_path.to_lowercase());
    let scdp_hash = fnv1a("SkinCharacterDataProperties");
    let scdp = combined
        .entries
        .iter()
        .find(|e| e.class_hash == scdp_hash && e.path_hash == target)
        .or_else(|| combined.entries.iter().find(|e| e.class_hash == scdp_hash))?;
    resolve_skin_preview_from(&combined, scdp)
}

/// Resolve the first authored `SkinMeshDataProperties` in a parsed skin BIN.
pub fn resolve_skin_preview(bin: &Bin) -> Option<SkinPreviewDefinition> {
    let scdp = bin
        .entries
        .iter()
        .find(|entry| entry.class_hash == fnv1a("SkinCharacterDataProperties"))?;
    resolve_skin_preview_from(bin, scdp)
}

/// Core resolution given a chosen SCDP entry and the bin holding the material
/// defs it links to.
fn resolve_skin_preview_from(bin: &Bin, scdp: &BinEntry) -> Option<SkinPreviewDefinition> {
    let mesh = fields(scdp.fields.get(&fnv1a("skinMeshProperties"))?)?;

    let mut texture_overrides = HashMap::new();
    if let Some(BinValue::List { items, .. }) = mesh.get(&fnv1a("materialOverride")) {
        for item in items {
            let Some(override_fields) = fields(item) else { continue };
            let Some(submesh) = string(override_fields.get(&fnv1a("submesh"))) else { continue };
            let texture = string(override_fields.get(&fnv1a("texture"))).or_else(|| {
                diffuse_from_material(bin, override_fields.get(&fnv1a("Material")))
            });
            if let Some(texture) = texture {
                texture_overrides.insert(submesh, texture);
            }
        }
    }

    let base_texture = string(mesh.get(&fnv1a("texture")))
        .or_else(|| diffuse_from_material(bin, mesh.get(&fnv1a("Material"))));
    let hidden_submeshes = string(mesh.get(&fnv1a("initialSubmeshToHide")))
        .map(|value| {
            value
                .split(|character: char| character.is_whitespace() || character == ',' || character == ';')
                .filter(|part| !part.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    let skin_scale = match mesh.get(&fnv1a("SkinScale")) {
        Some(BinValue::F32(value)) if *value > 0.0 => *value,
        _ => 1.0,
    };

    Some(SkinPreviewDefinition {
        simple_skin: string(mesh.get(&fnv1a("simpleSkin"))),
        skeleton: string(mesh.get(&fnv1a("skeleton"))),
        base_texture,
        texture_overrides,
        hidden_submeshes,
        skin_scale,
        animations: resolve_animations(bin),
    })
}

/// Safely map an authored `ASSETS/...` reference into an extracted project.
pub fn resolve_asset_path(root: &Path, asset_ref: &str) -> PathBuf {
    let normalized = asset_ref.replace('\\', "/");
    let mut output = root.to_path_buf();
    for component in Path::new(normalized.trim_start_matches('/')).components() {
        if let Component::Normal(segment) = component {
            output.push(segment);
        }
    }
    output
}

/// Resolve base + override references to existing disk paths. `*` is the base
/// material; other keys are authored submesh names.
pub fn resolve_disk_textures(
    definition: &SkinPreviewDefinition,
    root: &Path,
) -> HashMap<String, String> {
    let mut output = HashMap::new();
    let mut add = |key: String, asset: &str| {
        let path = resolve_asset_path(root, asset);
        if path.is_file() {
            output.insert(key, path.to_string_lossy().into_owned());
        }
    };
    if let Some(base) = definition.base_texture.as_deref() {
        add("*".to_string(), base);
    }
    for (submesh, texture) in &definition.texture_overrides {
        add(submesh.clone(), texture);
    }
    output
}

/// Ruby/Aventurine-compatible lookup for a manually opened SKN:
/// `assets/.../characters/X/skins/base/foo.skn` maps to
/// `data/characters/X/skins/skin0.bin` (`skinNN` maps to `skinN.bin`).
pub fn find_skin_bin(skn_path: &Path) -> Option<(PathBuf, PathBuf)> {
    let assets_dir = skn_path.ancestors().find(|path| {
        path.file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.eq_ignore_ascii_case("assets"))
    })?;
    let project_root = assets_dir.parent()?.to_path_buf();
    let relative = skn_path.strip_prefix(assets_dir).ok()?;
    let parts: Vec<String> = relative
        .components()
        .filter_map(|component| match component {
            Component::Normal(value) => Some(value.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect();
    let characters = parts.iter().position(|part| part.eq_ignore_ascii_case("characters"))?;
    if characters + 3 >= parts.len() || !parts[characters + 2].eq_ignore_ascii_case("skins") {
        return None;
    }
    let champion = &parts[characters + 1];
    let folder = &parts[characters + 3];
    let skin = if folder.eq_ignore_ascii_case("base") {
        0
    } else {
        folder
            .to_ascii_lowercase()
            .strip_prefix("skin")?
            .parse::<u32>()
            .ok()?
    };
    let skins_dir = project_root
        .join("data")
        .join("characters")
        .join(champion)
        .join("skins");
    let exact = skins_dir.join(format!("skin{skin}.bin"));
    if exact.is_file() {
        return Some((exact, project_root));
    }
    let fallback = std::fs::read_dir(&skins_dir)
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .find(|path| {
            path.is_file()
                && path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("bin"))
                && path.file_stem().is_some_and(|stem| stem.to_string_lossy().to_ascii_lowercase().starts_with("skin"))
        })?;
    Some((fallback, project_root))
}

pub fn resolve_skn_disk_preview(skn_path: &Path) -> Option<(SkinPreviewDefinition, HashMap<String, String>)> {
    let (bin_path, root) = find_skin_bin(skn_path)?;
    let bytes = std::fs::read(bin_path).ok()?;
    let bin = crate::bin::read_bin(&bytes).ok()?;
    let definition = resolve_skin_preview(&bin)?;
    let textures = resolve_disk_textures(&definition, &root);
    Some((definition, textures))
}

/// For a loose (on-disk) `.skn`, resolve the animation clips authored in its
/// skin bin to real files under the extracted project root. Returns absolute
/// paths of the `.anm` that exist on disk, in bin order.
pub fn resolve_skn_disk_animations(skn_path: &Path) -> Vec<String> {
    let Some((bin_path, root)) = find_skin_bin(skn_path) else {
        return Vec::new();
    };
    let Ok(bytes) = std::fs::read(&bin_path) else {
        return Vec::new();
    };
    let Ok(bin) = crate::bin::read_bin(&bytes) else {
        return Vec::new();
    };
    resolve_animations(&bin)
        .into_iter()
        .filter_map(|asset| {
            let path = resolve_asset_path(&root, &asset);
            path.is_file().then(|| path.to_string_lossy().into_owned())
        })
        .collect()
}
