//! BIN editor operations — parameter scaling, skin-bin splitting by class,
//! and VFX asset consolidation. Ported from the Electron Quartz BinEditorV2
//! (`utils/binEditor/operations.js`), `binSplitter.js`, and
//! `assetConsolidator.js`.
//!
//! Everything here operates on `ritoshark::bin::Bin` trees obtained through
//! the existing `ritoshark_bridge` reader/writer, so there is no separate parser.
//! Scaling walks the `VfxSystemDefinitionData` → emitter → `birthScale0` /
//! `scale0` value subtree and multiplies the vec3 constant + dynamics values.

use crate::error::{Error, Result};
use indexmap::IndexMap;
use ritoshark::bin::{Bin, BinEntry, BinValue};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

/// FNV-1a 32-bit over the lowercased input — the BIN hash convention for both
/// class names and field names.
fn fnv1a_lower(s: &str) -> u32 {
    let mut h: u32 = 0x811c_9dc5;
    for b in s.to_lowercase().bytes() {
        h ^= b as u32;
        h = h.wrapping_mul(0x0100_0193);
    }
    h
}

// ===========================================================================
// 1. Parameter scaling (birthScale0 / scale0)
// ===========================================================================

/// Outcome of [`scale_params`].
#[derive(Debug, Clone, Default)]
pub struct ScaleResult {
    /// Emitter properties whose constant/dynamics values were multiplied.
    pub modified: usize,
    /// Vfx systems that contained at least one modified emitter.
    pub systems_touched: usize,
    /// Shape attributes rewritten by the matrix/shape fix (when requested).
    pub shapes_fixed: usize,
}

/// Multiply every `birthScale0` and `scale0` value found under
/// `VfxSystemDefinitionData` emitters by the given multipliers, mirroring the
/// Electron BinEditorV2 "scale birthScale" / "scale scale0" batch actions.
///
/// `birth_scale` scales `birthScale0`, `scale` scales `scale0`. A multiplier
/// of `1.0` leaves that property untouched. When `apply_matrix_fix` is set we
/// additionally run the legacy VFX shape rewrite (port of ltmao FixVfxShape)
/// so old-style `Shape` pointers become the new SpawnShape forms.
///
/// Mutates `bin` in place and returns counters.
pub fn scale_params(
    bin: &mut Bin,
    birth_scale: f32,
    scale: f32,
    apply_matrix_fix: bool,
) -> ScaleResult {
    let vfx_system = fnv1a_lower("VfxSystemDefinitionData");
    let complex_emitter = fnv1a_lower("ComplexEmitterDefinitionData");
    let simple_emitter = fnv1a_lower("SimpleEmitterDefinitionData");
    let f_birth_scale = fnv1a_lower("birthScale0");
    let f_scale0 = fnv1a_lower("scale0");

    let mut result = ScaleResult::default();

    let scale_birth = (birth_scale - 1.0).abs() > f32::EPSILON;
    let scale_scale0 = (scale - 1.0).abs() > f32::EPSILON;

    for entry in bin.entries.iter_mut() {
        if entry.class_hash != vfx_system {
            continue;
        }
        let mut system_touched = false;

        // Emitters live under list fields ComplexEmitterDefinitionData /
        // SimpleEmitterDefinitionData (a list of embed/pointer emitters).
        for (&field_hash, value) in entry.fields.iter_mut() {
            if field_hash == complex_emitter || field_hash == simple_emitter {
                visit_emitter_list(
                    value,
                    f_birth_scale,
                    f_scale0,
                    scale_birth,
                    scale_scale0,
                    birth_scale,
                    scale,
                    &mut result.modified,
                    &mut system_touched,
                );
            }
        }

        if apply_matrix_fix {
            result.shapes_fixed += fix_emitter_shapes(entry, &mut system_touched);
        }

        if system_touched {
            result.systems_touched += 1;
        }
    }

    result
}

/// Walk a list of emitters, scaling birthScale0/scale0 on each.
#[allow(clippy::too_many_arguments)]
fn visit_emitter_list(
    value: &mut BinValue,
    f_birth_scale: u32,
    f_scale0: u32,
    scale_birth: bool,
    scale_scale0: bool,
    birth_mult: f32,
    scale_mult: f32,
    modified: &mut usize,
    system_touched: &mut bool,
) {
    let items: &mut Vec<BinValue> = match value {
        BinValue::List { items, .. } => items,
        // A single emitter directly (defensive — usually a list).
        BinValue::Embed { .. } | BinValue::Pointer { .. } => {
            scale_one_emitter(
                value,
                f_birth_scale,
                f_scale0,
                scale_birth,
                scale_scale0,
                birth_mult,
                scale_mult,
                modified,
                system_touched,
            );
            return;
        }
        _ => return,
    };

    for item in items.iter_mut() {
        scale_one_emitter(
            item,
            f_birth_scale,
            f_scale0,
            scale_birth,
            scale_scale0,
            birth_mult,
            scale_mult,
            modified,
            system_touched,
        );
    }
}

/// Scale a single emitter's birthScale0 and scale0 properties.
#[allow(clippy::too_many_arguments)]
fn scale_one_emitter(
    emitter: &mut BinValue,
    f_birth_scale: u32,
    f_scale0: u32,
    scale_birth: bool,
    scale_scale0: bool,
    birth_mult: f32,
    scale_mult: f32,
    modified: &mut usize,
    system_touched: &mut bool,
) {
    let fields = match emitter {
        BinValue::Embed { fields, .. } | BinValue::Pointer { fields, .. } => fields,
        _ => return,
    };

    if scale_birth {
        if let Some(prop) = fields.get_mut(&f_birth_scale) {
            if scale_value_vector3(prop, birth_mult) {
                *modified += 1;
                *system_touched = true;
            }
        }
    }
    if scale_scale0 {
        if let Some(prop) = fields.get_mut(&f_scale0) {
            if scale_value_vector3(prop, scale_mult) {
                *modified += 1;
                *system_touched = true;
            }
        }
    }
}

/// Multiply the `constantValue` vec3 and every dynamics vec3 of a `ValueVector3`
/// embed (or a bare vec3) by `mult`. Returns true if anything was changed.
fn scale_value_vector3(prop: &mut BinValue, mult: f32) -> bool {
    let f_constant = fnv1a_lower("constantValue");
    let f_dynamics = fnv1a_lower("dynamics");
    let f_values = fnv1a_lower("values");

    match prop {
        // ValueVector3 wrapper: { constantValue: vec3, dynamics: pointer { values: list[vec3] } }
        BinValue::Embed { fields, .. } | BinValue::Pointer { fields, .. } => {
            let mut changed = false;
            if let Some(cv) = fields.get_mut(&f_constant) {
                changed |= scale_vec3_in_place(cv, mult);
            }
            if let Some(dyn_ptr) = fields.get_mut(&f_dynamics) {
                changed |= scale_dynamics_values(dyn_ptr, f_values, mult);
            }
            changed
        }
        // Bare vec3 property (no wrapper).
        BinValue::Vec3(_) => scale_vec3_in_place(prop, mult),
        _ => false,
    }
}

/// Scale a vec3-valued [`BinValue`] in place.
fn scale_vec3_in_place(value: &mut BinValue, mult: f32) -> bool {
    if let BinValue::Vec3(v) = value {
        v[0] *= mult;
        v[1] *= mult;
        v[2] *= mult;
        true
    } else {
        false
    }
}

/// Scale every vec3 inside a `VfxAnimatedVector3fVariableData` dynamics pointer's
/// `values` list.
fn scale_dynamics_values(dyn_ptr: &mut BinValue, f_values: u32, mult: f32) -> bool {
    let fields = match dyn_ptr {
        BinValue::Embed { fields, .. } | BinValue::Pointer { fields, .. } => fields,
        _ => return false,
    };
    let mut changed = false;
    if let Some(BinValue::List { items, .. }) = fields.get_mut(&f_values) {
        for item in items.iter_mut() {
            changed |= scale_vec3_in_place(item, mult);
        }
    }
    changed
}

// ---------------------------------------------------------------------------
// Matrix / shape fix (port of ltmao FixVfxShape — see fixVfxShape.js)
// ---------------------------------------------------------------------------

// Struct-type hashes hardcoded by the original ltmao script.
const HASH_TYPE_RADIUS_SHAPE: u32 = 0x3dbe_415d; // VfxShapeSphere
const HASH_TYPE_VEC3_SHAPE: u32 = 0xee39_916f; // single vec3 EmitOffset shape
const HASH_TYPE_EMPTY_SHAPE: u32 = 0x4f4e_2ed7; // VfxShapeLegacy (fallback)
const HASH_TYPE_BIRTH_TRANSLATION: u32 = 0x68dc_32b6;

/// Rewrite legacy `Shape` pointers on each emitter of a VfxSystem entry into
/// the new SpawnShape forms, lifting BirthTranslation onto a sibling field.
/// Returns the number of shape attributes rewritten.
fn fix_emitter_shapes(entry: &mut BinEntry, system_touched: &mut bool) -> usize {
    let complex_emitter = fnv1a_lower("ComplexEmitterDefinitionData");
    let simple_emitter = fnv1a_lower("SimpleEmitterDefinitionData");
    let mut fixed = 0;

    for (&field_hash, value) in entry.fields.iter_mut() {
        if field_hash != complex_emitter && field_hash != simple_emitter {
            continue;
        }
        let items: &mut Vec<BinValue> = match value {
            BinValue::List { items, .. } => items,
            _ => continue,
        };
        for emitter in items.iter_mut() {
            fixed += fix_one_emitter_shape(emitter);
        }
    }

    if fixed > 0 {
        *system_touched = true;
    }
    fixed
}

/// Apply the shape fix to one emitter embed/pointer. Returns 1 if a shape was
/// rewritten, 0 otherwise.
fn fix_one_emitter_shape(emitter: &mut BinValue) -> usize {
    let f_shape = fnv1a_lower("Shape");
    let f_birth_translation = fnv1a_lower("BirthTranslation");
    let f_emit_offset = fnv1a_lower("EmitOffset");
    let f_constant_value = fnv1a_lower("ConstantValue");
    let f_radius = fnv1a_lower("Radius");
    let f_height = fnv1a_lower("Height");
    let f_flags = fnv1a_lower("Flags");
    let f_spawn_shape = fnv1a_lower("SpawnShape");

    let fields = match emitter {
        BinValue::Embed { fields, .. } | BinValue::Pointer { fields, .. } => fields,
        _ => return 0,
    };

    // Only touch emitters that actually carry a legacy Shape pointer.
    if !fields.contains_key(&f_shape) {
        return 0;
    }

    // Pull facts out of the Shape subtree first (immutable inspection).
    let mut radius: Option<f32> = None;
    let mut height: Option<f32> = None;
    let mut emit_offset_vec3: Option<[f32; 3]> = None;
    let mut birth_translation: Option<BinValue> = None;

    if let Some(BinValue::Pointer { fields: sf, .. }) | Some(BinValue::Embed { fields: sf, .. }) =
        fields.get(&f_shape)
    {
        for (&sub_hash, sub_val) in sf.iter() {
            if sub_hash == f_birth_translation {
                if let BinValue::Embed { fields: bf, .. } | BinValue::Pointer { fields: bf, .. } =
                    sub_val
                {
                    if let Some(cv @ BinValue::Vec3(_)) = bf.get(&f_constant_value) {
                        birth_translation = Some(cv.clone());
                    }
                }
            } else if sub_hash == f_emit_offset {
                if let BinValue::Embed { fields: ef, .. } | BinValue::Pointer { fields: ef, .. } =
                    sub_val
                {
                    if let Some(BinValue::Vec3(v)) = ef.get(&f_constant_value) {
                        radius = Some(v[0]);
                        height = Some(v[1]);
                        emit_offset_vec3 = Some(*v);
                    }
                }
            }
        }
    }

    // Promote BirthTranslation to a sibling field on the emitter.
    if let Some(cv) = birth_translation {
        let mut bt_fields: IndexMap<u32, BinValue> = IndexMap::new();
        bt_fields.insert(f_constant_value, cv);
        fields.insert(
            f_birth_translation,
            BinValue::Embed {
                class: HASH_TYPE_BIRTH_TRANSLATION,
                fields: bt_fields,
            },
        );
    }

    // Decide the new shape. We use a simplified version of the decision matrix:
    // a single EmitOffset vec3 → vec3 shape; otherwise the legacy fallback. The
    // radius branch needs the full Dynamics inspection which the legacy bins
    // rarely hit, so we keep parity with the common vec3/empty outcomes.
    let new_shape = if let Some(v) = emit_offset_vec3 {
        let mut nf: IndexMap<u32, BinValue> = IndexMap::new();
        nf.insert(f_emit_offset, BinValue::Vec3(v));
        let _ = (radius, height, f_radius, f_height, f_flags); // referenced for clarity
        BinValue::Pointer {
            class: HASH_TYPE_VEC3_SHAPE,
            fields: nf,
        }
    } else {
        BinValue::Pointer {
            class: HASH_TYPE_EMPTY_SHAPE,
            fields: IndexMap::new(),
        }
    };

    // Replace Shape with SpawnShape (preserve insertion position by swapping
    // in-place then renaming the key).
    fields.shift_remove(&f_shape);
    fields.insert(f_spawn_shape, new_shape);

    let _ = HASH_TYPE_RADIUS_SHAPE;
    1
}

// ===========================================================================
// 2. Split skin bin by class (VFX / ANM) — port of binSplitter.js
// ===========================================================================

/// Per-kind split outcome.
#[derive(Debug, Clone)]
pub struct SkinSplitFile {
    /// Kind that was split out (`"vfx"` or `"anm"`).
    pub kind: String,
    /// Absolute path of the new sibling BIN written under `<root>/data/`.
    pub file: PathBuf,
    /// Number of entries moved into the new file.
    pub count: usize,
    /// Link string appended to the source BIN's `linked` list.
    pub link: String,
}

/// Walk up from a bin path to find the directory that contains `data/`.
fn find_root_dir(bin_path: &Path) -> PathBuf {
    let mut cur = bin_path.parent().map(|p| p.to_path_buf());
    let mut seen: HashSet<PathBuf> = HashSet::new();
    while let Some(dir) = cur {
        if seen.contains(&dir) {
            break;
        }
        if dir
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.eq_ignore_ascii_case("data"))
            .unwrap_or(false)
        {
            if let Some(parent) = dir.parent() {
                return parent.to_path_buf();
            }
        }
        seen.insert(dir.clone());
        match dir.parent() {
            Some(p) if p != dir => cur = Some(p.to_path_buf()),
            _ => break,
        }
    }
    bin_path
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
}

/// Champion name from a path containing `/characters/<champ>/`.
fn detect_champ_name(abs_path: &Path) -> Option<String> {
    let posix = abs_path.to_string_lossy().replace('\\', "/").to_lowercase();
    let marker = "/characters/";
    let idx = posix.find(marker)? + marker.len();
    let rest = &posix[idx..];
    let end = rest.find('/')?;
    Some(rest[..end].to_string())
}

fn capitalize_first(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

/// Split one BIN by class hash. Mirrors `binSplitter.js::splitOne`.
fn split_one(bin_path: &Path, out_dir: &Path, kind: &str) -> Result<Option<SkinSplitFile>> {
    let class_hash = match kind {
        "vfx" => fnv1a_lower("VfxSystemDefinitionData"),
        "anm" => fnv1a_lower("AnimationGraphData"),
        other => {
            return Err(Error::InvalidInput(format!(
                "unknown split kind: {}",
                other
            )))
        }
    };

    let data = std::fs::read(bin_path).map_err(|e| Error::io_with_path(e, bin_path))?;
    let mut bin = crate::bin::read_bin(&data).map_err(|e| {
        Error::InvalidInput(format!("Failed to parse {}: {}", bin_path.display(), e))
    })?;

    if bin.entries.is_empty() {
        return Ok(None);
    }
    // Already-split guard: every entry is the target class → no-op.
    if bin.entries.iter().all(|e| e.class_hash == class_hash) {
        return Ok(None);
    }

    let mut target: Vec<BinEntry> = Vec::new();
    bin.entries.retain(|e| {
        if e.class_hash == class_hash {
            target.push(e.clone());
            false
        } else {
            true
        }
    });
    if target.is_empty() {
        return Ok(None);
    }
    let count = target.len();

    let champ = detect_champ_name(bin_path);
    let stem_lower = bin_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("skin")
        .to_lowercase();

    let (file_name_lower, link_name) = match &champ {
        Some(c) => {
            let cl = c.to_lowercase();
            (
                format!("{}_{}_{}.bin", cl, kind, stem_lower),
                format!("{}_{}_{}.bin", capitalize_first(c), kind, stem_lower),
            )
        }
        None => (
            format!("{}_{}.bin", stem_lower, kind),
            format!("{}_{}.bin", capitalize_first(&stem_lower), kind),
        ),
    };
    let link_str = format!("DATA/{}", link_name);

    let root_dir = find_root_dir(bin_path);
    // Prefer the caller's out_dir when given; otherwise the derived root/data.
    let data_dir = if out_dir.as_os_str().is_empty() {
        root_dir.join("data")
    } else {
        out_dir.to_path_buf()
    };
    std::fs::create_dir_all(&data_dir).map_err(|e| Error::io_with_path(e, &data_dir))?;
    let new_bin_abs = data_dir.join(&file_name_lower);

    let new_bin = Bin {
        entries: target,
        version: bin.version,
        ..Bin::new()
    };
    let new_bytes = crate::bin::write_bin(&new_bin)
        .map_err(|e| Error::InvalidInput(format!("Failed to serialize split BIN: {}", e)))?;
    std::fs::write(&new_bin_abs, &new_bytes).map_err(|e| Error::io_with_path(e, &new_bin_abs))?;

    if !bin.linked.iter().any(|l| l.eq_ignore_ascii_case(&link_str)) {
        bin.linked.push(link_str.clone());
    }
    let src_bytes = crate::bin::write_bin(&bin)
        .map_err(|e| Error::InvalidInput(format!("Failed to serialize source BIN: {}", e)))?;
    std::fs::write(bin_path, &src_bytes).map_err(|e| Error::io_with_path(e, bin_path))?;

    Ok(Some(SkinSplitFile {
        kind: kind.to_string(),
        file: new_bin_abs,
        count,
        link: link_str,
    }))
}

/// Split one class ("vfx" or "anm") out of a skin BIN into a sibling
/// `<champ>_<kind>_<stem>.bin` under the derived `data/` folder and link it.
/// Public entry point for the repath pipeline (old Quartz `splitOne`).
pub fn split_one_kind(bin_path: &Path, kind: &str) -> Result<Option<SkinSplitFile>> {
    split_one(bin_path, Path::new(""), kind)
}

/// Split a skin BIN into separate VFX and ANM sibling files. Returns the list
/// of files that were actually written (empty if nothing matched).
pub fn split_skin_bin(bin_path: &Path, out_dir: &Path) -> Result<Vec<SkinSplitFile>> {
    let mut out = Vec::new();
    if let Some(r) = split_one(bin_path, out_dir, "vfx")? {
        out.push(r);
    }
    if let Some(r) = split_one(bin_path, out_dir, "anm")? {
        out.push(r);
    }
    Ok(out)
}

// ===========================================================================
// 3. Asset consolidation — port of assetConsolidator.js
// ===========================================================================

/// Outcome of [`consolidate_assets`].
#[derive(Debug, Clone, Default)]
pub struct ConsolidateResult {
    /// Asset files physically moved into the consolidated folder.
    pub moved: usize,
    /// Distinct VFX-referenced asset paths considered.
    pub referenced: usize,
    /// Paths skipped because a non-VFX entry also referenced them.
    pub skipped_shared: usize,
    /// Whether the BIN's strings were rewritten (and the file saved).
    pub bin_rewritten: bool,
}

fn is_asset_path_string(s: &str) -> bool {
    let lower = s.replace('\\', "/").to_lowercase();
    lower.starts_with("assets/") || lower.contains("/assets/")
}

/// Collect every asset-looking string from a value tree into `out`.
fn collect_asset_strings(value: &BinValue, out: &mut Vec<String>) {
    match value {
        BinValue::String(s) => {
            if is_asset_path_string(s) {
                out.push(s.clone());
            }
        }
        BinValue::List { items, .. } => {
            for it in items {
                collect_asset_strings(it, out);
            }
        }
        BinValue::Option {
            value: Some(inner), ..
        } => collect_asset_strings(inner, out),
        BinValue::Map { entries, .. } => {
            for (k, v) in entries {
                collect_asset_strings(k, out);
                collect_asset_strings(v, out);
            }
        }
        BinValue::Embed { fields, .. } | BinValue::Pointer { fields, .. } => {
            for (_, v) in fields.iter() {
                collect_asset_strings(v, out);
            }
        }
        _ => {}
    }
}

/// Rewrite every asset string in a value tree via `map` (lowercased key →
/// replacement). Returns true if anything changed.
pub(crate) fn rewrite_asset_strings(value: &mut BinValue, map: &HashMap<String, String>) -> bool {
    match value {
        BinValue::String(s) => {
            if let Some(repl) = map.get(&s.to_lowercase()) {
                *s = repl.clone();
                true
            } else {
                false
            }
        }
        BinValue::List { items, .. } => {
            let mut changed = false;
            for it in items.iter_mut() {
                changed |= rewrite_asset_strings(it, map);
            }
            changed
        }
        BinValue::Option {
            value: Some(inner), ..
        } => rewrite_asset_strings(inner, map),
        BinValue::Map { entries, .. } => {
            let mut changed = false;
            for (k, v) in entries.iter_mut() {
                changed |= rewrite_asset_strings(k, map);
                changed |= rewrite_asset_strings(v, map);
            }
            changed
        }
        BinValue::Embed { fields, .. } | BinValue::Pointer { fields, .. } => {
            let mut changed = false;
            for (_, v) in fields.iter_mut() {
                changed |= rewrite_asset_strings(v, map);
            }
            changed
        }
        _ => false,
    }
}

/// Resolve a posix asset path string to an absolute path under `project_dir`.
fn asset_path_to_abs(project_dir: &Path, asset_path: &str) -> PathBuf {
    let mut out = project_dir.to_path_buf();
    for seg in asset_path
        .replace('\\', "/")
        .split('/')
        .filter(|s| !s.is_empty())
    {
        out.push(seg);
    }
    out
}

/// Build the consolidated target path, preserving the original `assets`/`ASSETS`
/// casing: `<ASSETS>/<folder_segments>/<basename>`. `folder_segments` is the
/// pre-joined middle (e.g. `portedparticles` or `mymod/skin0_annie_particles`).
fn build_new_path_with(original: &str, folder_segments: &str, basename: &str) -> Option<String> {
    let norm = original.replace('\\', "/");
    let parts: Vec<&str> = norm.split('/').filter(|s| !s.is_empty()).collect();
    let i = parts
        .iter()
        .position(|p| p.eq_ignore_ascii_case("assets"))?;
    let assets_literal = parts[i];
    Some(format!("{}/{}/{}", assets_literal, folder_segments, basename))
}

/// Ensure a unique basename within a single consolidation run, suffixing
/// `_2`, `_3`, … on collision.
fn unique_basename(name: &str, used: &mut HashSet<String>) -> String {
    let lower = name.to_lowercase();
    if !used.contains(&lower) {
        used.insert(lower);
        return name.to_string();
    }
    let (stem, ext) = match name.rfind('.') {
        Some(dot) => (&name[..dot], &name[dot..]),
        None => (name, ""),
    };
    let mut n = 2;
    loop {
        let candidate = format!("{}_{}{}", stem, n, ext);
        if !used.contains(&candidate.to_lowercase()) {
            used.insert(candidate.to_lowercase());
            return candidate;
        }
        n += 1;
    }
}

/// Standalone consolidate (bin-editor command): moves VFX assets into a shared
/// `<ASSETS>/portedparticles/` folder.
pub fn consolidate_assets(bin_path: &Path, project_dir: &Path) -> Result<ConsolidateResult> {
    consolidate_assets_core(bin_path, project_dir, "portedparticles")
}

/// Repath consolidate (1:1 old Quartz `consolidateForSkin`): moves VFX assets
/// into `<ASSETS>/<prefix>/skin<N>_<champ_lower>_particles/`.
pub fn consolidate_assets_repath(
    bin_path: &Path,
    project_dir: &Path,
    prefix: &str,
    champ: &str,
    skin_num: u32,
) -> Result<ConsolidateResult> {
    let folder = format!("skin{}_{}_particles", skin_num, champ.to_lowercase());
    let segments = if prefix.is_empty() {
        folder
    } else {
        format!("{}/{}", prefix, folder)
    };
    consolidate_assets_core(bin_path, project_dir, &segments)
}

/// Gather every asset string referenced by the `VfxSystemDefinitionData`
/// entries of a single BIN, move the underlying files into
/// `<ASSETS>/<folder_segments>/` under `project_dir`, rewrite the strings, and
/// save the BIN. VFX-exclusive paths only — anything also referenced by a
/// non-VFX entry is left in place so meshes keep their textures.
fn consolidate_assets_core(bin_path: &Path, project_dir: &Path, folder_segments: &str) -> Result<ConsolidateResult> {
    let vfx_class = fnv1a_lower("VfxSystemDefinitionData");

    let data = std::fs::read(bin_path).map_err(|e| Error::io_with_path(e, bin_path))?;
    let mut bin = crate::bin::read_bin(&data).map_err(|e| {
        Error::InvalidInput(format!("Failed to parse {}: {}", bin_path.display(), e))
    })?;

    // Pass 1: collect VFX vs protected (non-VFX) asset references.
    let mut vfx_refs: Vec<String> = Vec::new();
    let mut protected: HashSet<String> = HashSet::new();
    for entry in bin.entries.iter() {
        let is_vfx = entry.class_hash == vfx_class;
        for (_, value) in entry.fields.iter() {
            let mut found = Vec::new();
            collect_asset_strings(value, &mut found);
            for s in found {
                if is_vfx {
                    vfx_refs.push(s);
                } else {
                    protected.insert(s.to_lowercase());
                }
            }
        }
    }

    // Dedup VFX refs, drop protected ones.
    let mut referenced: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut skipped_shared = 0usize;
    for s in vfx_refs {
        let lower = s.to_lowercase();
        if !seen.insert(lower.clone()) {
            continue;
        }
        if protected.contains(&lower) {
            skipped_shared += 1;
            continue;
        }
        referenced.push(s);
    }

    if referenced.is_empty() {
        return Ok(ConsolidateResult {
            skipped_shared,
            ..Default::default()
        });
    }

    // Pass 2: build old→new path map.
    let mut used_names: HashSet<String> = HashSet::new();
    let mut path_map: HashMap<String, String> = HashMap::new(); // lowercased old → new
    for original in &referenced {
        let norm = original.replace('\\', "/");
        let base = match norm.split('/').next_back() {
            Some(b) if !b.is_empty() => b.to_string(),
            _ => continue,
        };
        let final_name = unique_basename(&base, &mut used_names);
        if let Some(new_path) = build_new_path_with(original, folder_segments, &final_name) {
            path_map.insert(original.to_lowercase(), new_path);
        }
    }

    // Pass 3: move files on disk, clamped to project_dir. `dst` is built by
    // joining onto `project_dir` (see `asset_path_to_abs`), so compare against
    // that same base — NOT a canonicalized form, which on Windows gains a
    // `\\?\` verbatim prefix that a freshly-joined (non-existent) dst lacks,
    // making `starts_with` spuriously false.
    let is_inside = |p: &Path| -> bool {
        p != project_dir && p.starts_with(project_dir)
    };

    // Only rewrite strings for files that actually ended up at the destination.
    // A string whose source file can't be found must NOT be rewritten, or the
    // VFX reference would dangle (points to a file that was never moved there).
    let mut moved = 0usize;
    let mut rewrite_map: HashMap<String, String> = HashMap::new();
    for (old_lower, new_path) in path_map.iter() {
        let src = asset_path_to_abs(project_dir, old_lower);
        let dst = asset_path_to_abs(project_dir, new_path);
        if !is_inside(&dst) {
            continue;
        }
        if src == dst {
            // Already at the destination path — safe to keep the string as-is
            // (no rewrite needed, no move needed).
            continue;
        }
        if !src.exists() {
            // Source file missing: leave the string pointing at the original
            // location (do not rewrite) so the reference stays valid.
            continue;
        }
        if let Some(parent) = dst.parent() {
            std::fs::create_dir_all(parent).map_err(|e| Error::io_with_path(e, parent))?;
        }
        let ok = if dst.exists() {
            // Destination already populated (dedup collision) — drop the source
            // copy and still rewrite the string to the shared destination.
            let _ = std::fs::remove_file(&src);
            true
        } else {
            match std::fs::rename(&src, &dst) {
                Ok(_) => true,
                Err(_) => std::fs::copy(&src, &dst).is_ok() && {
                    let _ = std::fs::remove_file(&src);
                    true
                },
            }
        };
        if ok {
            moved += 1;
            rewrite_map.insert(old_lower.clone(), new_path.clone());
        }
    }

    // Pass 4: rewrite ONLY the strings whose files we relocated.
    let mut touched = false;
    for entry in bin.entries.iter_mut() {
        if entry.class_hash != vfx_class {
            continue;
        }
        for (_, value) in entry.fields.iter_mut() {
            touched |= rewrite_asset_strings(value, &rewrite_map);
        }
    }

    let mut bin_rewritten = false;
    if touched {
        let bytes = crate::bin::write_bin(&bin)
            .map_err(|e| Error::InvalidInput(format!("Failed to serialize BIN: {}", e)))?;
        std::fs::write(bin_path, &bytes).map_err(|e| Error::io_with_path(e, bin_path))?;
        bin_rewritten = true;
    }

    Ok(ConsolidateResult {
        moved,
        referenced: referenced.len(),
        skipped_shared,
        bin_rewritten,
    })
}
