//! VFX bin tooling — faithful ports of the Electron Quartz `bin:fixVfxShape`
//! and `bin:copyColors` handlers (themselves ports of ltmao's FixVfxShape and
//! hapibin color copy).
//!
//! `fix_vfx_shape` rewrites legacy `Shape` pointers under VfxEmitterDefinition
//! emitters into the new SpawnShape forms and lifts BirthTranslation onto a
//! sibling field. `copy_bin_colors` copies RGBA fields plus whitelisted VEC4
//! color fields from a donor bin into a structurally identical target bin,
//! matching entries by path hash.
//!
//! Everything operates on `ritoshark::bin::Bin` trees from the `ltk_bridge`
//! reader/writer.

use ritoshark::bin::{Bin, BinType, BinValue};
use indexmap::IndexMap;

/// FNV-1a 32-bit over the lowercased input — the BIN field/class hash rule.
fn fnv1a_lower(s: &str) -> u32 {
    let mut h: u32 = 0x811c_9dc5;
    for b in s.to_lowercase().bytes() {
        h ^= b as u32;
        h = h.wrapping_mul(0x0100_0193);
    }
    h
}

// ===========================================================================
// 1. Fix VFX Shape (port of fixVfxShape.js / ltmao FixVfxShape)
// ===========================================================================

// Struct-type hashes hardcoded by the original ltmao script.
const HASH_TYPE_RADIUS_SHAPE: u32 = 0x3dbe_415d; // VfxShapeSphere
const HASH_TYPE_VEC3_SHAPE: u32 = 0xee39_916f; // single vec3 EmitOffset shape
const HASH_TYPE_EMPTY_SHAPE: u32 = 0x4f4e_2ed7; // VfxShapeLegacy (fallback)
const HASH_TYPE_BIRTH_TRANSLATION: u32 = 0x68dc_32b6;

/// Counters returned by [`fix_vfx_shape`].
#[derive(Debug, Clone, Default)]
pub struct FixShapeStats {
    pub shapes_rewritten_radius: usize,
    pub shapes_rewritten_vec3: usize,
    pub shapes_rewritten_empty: usize,
    pub birth_translations_lifted: usize,
}

impl FixShapeStats {
    /// Total number of shapes rewritten across all three forms.
    pub fn total_shapes(&self) -> usize {
        self.shapes_rewritten_radius + self.shapes_rewritten_vec3 + self.shapes_rewritten_empty
    }

    /// Whether anything at all changed (shapes or lifted translations).
    pub fn any_change(&self) -> bool {
        self.total_shapes() > 0 || self.birth_translations_lifted > 0
    }
}

/// Walk a parsed BIN and rewrite every `Shape` attribute under
/// `VfxEmitterDefinitionData` (the Complex/Simple emitter lists of a
/// `VfxSystemDefinitionData` entry). Mutates `bin` in place and returns stats.
pub fn fix_vfx_shape(bin: &mut Bin) -> FixShapeStats {
    let vfx_system = fnv1a_lower("VfxSystemDefinitionData");
    let complex_emitter = fnv1a_lower("ComplexEmitterDefinitionData");
    let simple_emitter = fnv1a_lower("SimpleEmitterDefinitionData");
    let f_shape = fnv1a_lower("Shape");

    let mut stats = FixShapeStats::default();

    for entry in bin.entries.iter_mut() {
        if entry.class_hash != vfx_system {
            continue;
        }
        for (&field_hash, value) in entry.fields.iter_mut() {
            if field_hash != complex_emitter && field_hash != simple_emitter {
                continue;
            }
            let items = match value {
                BinValue::List { items, .. } => items,
                _ => continue,
            };
            for emitter in items.iter_mut() {
                let fields = match emitter {
                    BinValue::Embed { fields, .. } | BinValue::Pointer { fields, .. } => fields,
                    _ => continue,
                };
                if fields.contains_key(&f_shape) {
                    fix_shape_attribute(fields, f_shape, &mut stats);
                }
            }
        }
    }

    stats
}

/// Facts gathered while scanning the legacy Shape subtree, mirroring the
/// Python decision inputs.
#[derive(Default)]
struct ShapeFacts {
    emit_rotation_angles_key_values: bool,
    emit_rotation_axes_shit: bool,
    flags: bool,
    keep_it_as_legacy: bool,
    radius: Option<f32>,
    height: Option<f32>,
}

/// Rewrite the single `Shape` field of an emitter `fields` map. The Shape's
/// own subtree is inspected to decide the new form; BirthTranslation is lifted
/// to a sibling field on the emitter.
fn fix_shape_attribute(
    emitter_fields: &mut IndexMap<u32, BinValue>,
    f_shape: u32,
    stats: &mut FixShapeStats,
) {
    let f_birth_translation = fnv1a_lower("BirthTranslation");
    let f_constant_value = fnv1a_lower("ConstantValue");
    let f_emit_offset = fnv1a_lower("EmitOffset");
    let f_dynamics = fnv1a_lower("Dynamics");
    let f_probability_tables = fnv1a_lower("ProbabilityTables");
    let f_key_values = fnv1a_lower("KeyValues");
    let f_emit_rotation_angles = fnv1a_lower("EmitRotationAngles");
    let f_emit_rotation_axes = fnv1a_lower("EmitRotationAxes");
    let f_spawn_shape = fnv1a_lower("SpawnShape");
    let f_radius = fnv1a_lower("Radius");
    let f_height = fnv1a_lower("Height");
    let f_flags = fnv1a_lower("Flags");

    // The Shape subtree's fields. Bail if it isn't a struct.
    let shape_fields = match emitter_fields.get(&f_shape) {
        Some(BinValue::Pointer { fields, .. }) | Some(BinValue::Embed { fields, .. }) => fields,
        _ => return,
    };
    if shape_fields.is_empty() {
        // Empty Shape: still rewrite to SpawnShape legacy fallback below.
    }

    let mut facts = ShapeFacts::default();
    let mut birth_translation: Option<BinValue> = None;
    // The sole sub-field detection for the vec3 branch: Shape has exactly one
    // sub-field which is EmitOffset whose ConstantValue is a vec3.
    let mut emit_offset_constant_vec3: Option<[f32; 3]> = None;
    let shape_len = shape_fields.len();

    for (&sub_hash, sub_val) in shape_fields.iter() {
        // BirthTranslation: lift the first ConstantValue vec3 onto the emitter.
        if sub_hash == f_birth_translation {
            if let BinValue::Embed { fields: bf, .. } | BinValue::Pointer { fields: bf, .. } =
                sub_val
            {
                if let Some(cv @ BinValue::Vec3(_)) = bf.get(&f_constant_value) {
                    birth_translation = Some(cv.clone());
                }
            }
            continue;
        }

        // EmitOffset: Radius = ConstantValue.x, Height = ConstantValue.y; scan
        // Dynamics → ProbabilityTables → KeyValues for the Flags / legacy flags.
        if sub_hash == f_emit_offset {
            if let BinValue::Embed { fields: ef, .. } | BinValue::Pointer { fields: ef, .. } =
                sub_val
            {
                if let Some(BinValue::Vec3(v)) = ef.get(&f_constant_value) {
                    facts.radius = Some(v[0]);
                    facts.height = Some(v[1]);
                    emit_offset_constant_vec3 = Some(*v);
                }
                if let Some(dynamics) = ef.get(&f_dynamics) {
                    scan_key_values(
                        dynamics,
                        f_probability_tables,
                        f_key_values,
                        |a, b| {
                            if a == 0.0 && b >= 1.0 {
                                facts.flags = true;
                            } else if a == -1.0 && b == 1.0 {
                                facts.keep_it_as_legacy = true;
                            }
                        },
                    );
                }
            }
            continue;
        }

        // EmitRotationAngles: ValueFloat[] → Dynamics → ProbabilityTables → KeyValues
        if sub_hash == f_emit_rotation_angles {
            if let BinValue::List { items, .. } = sub_val {
                for value_float in items.iter() {
                    if let BinValue::Embed { fields: vf, .. }
                    | BinValue::Pointer { fields: vf, .. } = value_float
                    {
                        if let Some(dynamics) = vf.get(&f_dynamics) {
                            scan_key_values(
                                dynamics,
                                f_probability_tables,
                                f_key_values,
                                |a, b| {
                                    if a == 0.0 && b > 1.0 {
                                        facts.emit_rotation_angles_key_values = true;
                                    }
                                },
                            );
                        }
                    }
                }
            }
            continue;
        }

        // EmitRotationAxes: list of exactly two vec3 axes; canonical Y/Z pair.
        if sub_hash == f_emit_rotation_axes {
            if let BinValue::List { items, .. } = sub_val {
                if items.len() == 2 {
                    if let (BinValue::Vec3(a), BinValue::Vec3(b)) = (&items[0], &items[1]) {
                        if a[1].trunc() == 1.0 && b[2].trunc() == 1.0 {
                            facts.emit_rotation_axes_shit = true;
                        }
                    }
                }
            }
            continue;
        }
    }

    // Promote BirthTranslation onto the emitter as a sibling embed.
    if let Some(cv) = birth_translation {
        let mut bt_fields: IndexMap<u32, BinValue> = IndexMap::new();
        bt_fields.insert(f_constant_value, cv);
        emitter_fields.insert(
            f_birth_translation,
            BinValue::Embed {
                class: HASH_TYPE_BIRTH_TRANSLATION,
                fields: bt_fields,
            },
        );
        stats.birth_translations_lifted += 1;
    }

    // ---- Decision matrix (mirrors the original script) ----

    // Branch A: radius/sphere shape.
    if !facts.keep_it_as_legacy
        && facts.emit_rotation_angles_key_values
        && facts.emit_rotation_axes_shit
    {
        let mut nf: IndexMap<u32, BinValue> = IndexMap::new();
        nf.insert(f_radius, BinValue::F32(facts.radius.unwrap_or(0.0)));
        // Bugfix vs Python (which appended radius twice): use the real height.
        if let Some(h) = facts.height {
            if h != 0.0 {
                nf.insert(f_height, BinValue::F32(h));
            }
        }
        if facts.flags {
            nf.insert(f_flags, BinValue::U8(1));
        }
        replace_shape(emitter_fields, f_shape, f_spawn_shape, HASH_TYPE_RADIUS_SHAPE, nf);
        stats.shapes_rewritten_radius += 1;
        return;
    }

    // Branch B: single EmitOffset vec3 shape.
    if shape_len == 1 {
        if let Some(v) = emit_offset_constant_vec3 {
            let mut nf: IndexMap<u32, BinValue> = IndexMap::new();
            nf.insert(f_emit_offset, BinValue::Vec3(v));
            replace_shape(emitter_fields, f_shape, f_spawn_shape, HASH_TYPE_VEC3_SHAPE, nf);
            stats.shapes_rewritten_vec3 += 1;
            return;
        }
    }

    // Fallback: legacy empty shape.
    replace_shape(
        emitter_fields,
        f_shape,
        f_spawn_shape,
        HASH_TYPE_EMPTY_SHAPE,
        IndexMap::new(),
    );
    stats.shapes_rewritten_empty += 1;
}

/// Remove the `Shape` field and insert a `SpawnShape` pointer of the given
/// class with `fields`.
fn replace_shape(
    emitter_fields: &mut IndexMap<u32, BinValue>,
    f_shape: u32,
    f_spawn_shape: u32,
    class: u32,
    fields: IndexMap<u32, BinValue>,
) {
    emitter_fields.shift_remove(&f_shape);
    emitter_fields.insert(f_spawn_shape, BinValue::Pointer { class, fields });
}

/// Descend a `Dynamics` value into its `ProbabilityTables` → tables → KeyValues
/// pairs and invoke `cb(key0, key1)` for every KeyValues list of length >= 2,
/// reading the first two numeric components.
fn scan_key_values<F: FnMut(f32, f32)>(
    dynamics: &BinValue,
    f_probability_tables: u32,
    f_key_values: u32,
    mut cb: F,
) {
    let dyn_fields = match dynamics {
        BinValue::Embed { fields, .. } | BinValue::Pointer { fields, .. } => fields,
        _ => return,
    };
    let tables = match dyn_fields.get(&f_probability_tables) {
        Some(BinValue::List { items, .. }) => items,
        _ => return,
    };
    for tbl in tables.iter() {
        let tbl_fields = match tbl {
            BinValue::Embed { fields, .. } | BinValue::Pointer { fields, .. } => fields,
            _ => continue,
        };
        if let Some(kv) = tbl_fields.get(&f_key_values) {
            if let Some((a, b)) = first_two_numbers(kv) {
                cb(a, b);
            }
        }
    }
}

/// Read the first two numeric components of a KeyValues value. KeyValues is
/// stored as a list of floats (or a vec); we coerce whatever numeric form it
/// takes to `(f32, f32)`.
fn first_two_numbers(value: &BinValue) -> Option<(f32, f32)> {
    match value {
        BinValue::List { items, .. } if items.len() >= 2 => {
            Some((as_f32(&items[0])?, as_f32(&items[1])?))
        }
        BinValue::Vec2(v) => Some((v[0], v[1])),
        BinValue::Vec3(v) => Some((v[0], v[1])),
        BinValue::Vec4(v) => Some((v[0], v[1])),
        _ => None,
    }
}

fn as_f32(value: &BinValue) -> Option<f32> {
    match value {
        BinValue::F32(f) => Some(*f),
        BinValue::I32(i) => Some(*i as f32),
        BinValue::U32(u) => Some(*u as f32),
        BinValue::I16(i) => Some(*i as f32),
        BinValue::U16(u) => Some(*u as f32),
        BinValue::I8(i) => Some(*i as f32),
        BinValue::U8(u) => Some(*u as f32),
        _ => None,
    }
}

// ===========================================================================
// 2. Copy BIN Colors (port of binTools.js copyBinColors / hapibin)
// ===========================================================================

/// LoL VFX color field names. RGBA fields are always copied; VEC4 fields only
/// copy when their field-name hash is whitelisted (VEC4 also carries positions
/// and scales).
const VFX_COLOR_BASE: &[&str] = &[
    // Lifecycle colors
    "color", "startColor", "endColor", "peakColor", "lingerColor",
    "birthColor", "deathColor",
    // Indexed slots
    "color0", "color1", "color2", "color3", "color4", "color5", "color6", "color7",
    // Animation curves
    "colorOverTime", "colorOverLifetime",
    "colorStart", "colorMid", "colorEnd",
    // Particle/tint
    "particleColor", "tintColor", "colorTint",
    // Material
    "reflectionColor", "reflectionFresnelColor",
    "emissiveColor", "diffuseColor", "baseColor",
    "edgeColor", "fresnelColor", "rimColor",
    // Bounds
    "colorMin", "colorMax",
];

/// Counters returned by [`copy_bin_colors`].
#[derive(Debug, Clone, Default)]
pub struct CopyColorStats {
    pub entries_matched: usize,
    pub entries_skipped: usize,
    pub fields_copied: usize,
    pub mismatches: usize,
}

/// Riot mirrors most VFX bin fields with an `m`-prefixed (member) variant; accept
/// both forms without duplicating the source list.
fn color_hash_set() -> std::collections::HashSet<u32> {
    let mut set = std::collections::HashSet::new();
    for name in VFX_COLOR_BASE {
        set.insert(fnv1a_lower(name));
        let mut prefixed = String::with_capacity(name.len() + 1);
        prefixed.push('m');
        let mut chars = name.chars();
        if let Some(first) = chars.next() {
            prefixed.extend(first.to_uppercase());
            prefixed.push_str(chars.as_str());
        }
        set.insert(fnv1a_lower(&prefixed));
    }
    set
}

/// Copy whitelisted color values from `src` into `dst`, matching top-level
/// entries by path hash. Mutates `dst` in place and returns stats.
pub fn copy_bin_colors(src: &Bin, dst: &mut Bin) -> CopyColorStats {
    let color_hashes = color_hash_set();
    let mut stats = CopyColorStats::default();

    // Index source entries by path hash.
    let mut src_by_hash: std::collections::HashMap<u32, &ritoshark::bin::BinEntry> =
        std::collections::HashMap::new();
    for e in src.entries.iter() {
        src_by_hash.insert(e.path_hash, e);
    }

    // Walk each destination entry against its source twin. Clone the matched
    // source struct so we can mutate the destination without aliasing.
    for dst_entry in dst.entries.iter_mut() {
        let src_entry = match src_by_hash.get(&dst_entry.path_hash) {
            Some(e) => *e,
            None => {
                stats.entries_skipped += 1;
                continue;
            }
        };
        if src_entry.class_hash != dst_entry.class_hash {
            stats.entries_skipped += 1;
            continue;
        }
        stats.entries_matched += 1;
        copy_container(&src_entry.fields, &mut dst_entry.fields, &color_hashes, false, &mut stats);
    }

    stats
}

/// Copy color values between two paired field maps (entries, struct bodies).
fn copy_container(
    src_fields: &IndexMap<u32, BinValue>,
    dst_fields: &mut IndexMap<u32, BinValue>,
    color_hashes: &std::collections::HashSet<u32>,
    in_color_context: bool,
    stats: &mut CopyColorStats,
) {
    // Snapshot source values so we can look them up by field hash while holding
    // a mutable borrow of the destination map.
    let src_pairs: Vec<(u32, BinValue)> =
        src_fields.iter().map(|(&h, v)| (h, v.clone())).collect();
    let src_map: std::collections::HashMap<u32, &BinValue> =
        src_pairs.iter().map(|(h, v)| (*h, v)).collect();

    for (&field_hash, dst_val) in dst_fields.iter_mut() {
        if let Some(src_val) = src_map.get(&field_hash) {
            copy_field(
                src_val,
                dst_val,
                color_hashes,
                Some(field_hash),
                in_color_context,
                stats,
            );
        }
    }
}

/// Recursively copy a single paired field. `container_hash` is the parent
/// field's hash so VEC4 children of a whitelisted parent inherit color context;
/// `in_color_context` flags a subtree already known to be a color wrapper.
fn copy_field(
    src: &BinValue,
    dst: &mut BinValue,
    color_hashes: &std::collections::HashSet<u32>,
    container_hash: Option<u32>,
    in_color_context: bool,
    stats: &mut CopyColorStats,
) {
    if src.ty() != dst.ty() {
        stats.mismatches += 1;
        return;
    }

    let whitelist_hit = container_hash
        .map(|h| color_hashes.contains(&h))
        .unwrap_or(false);
    let color_ctx = in_color_context || whitelist_hit;

    match (src, dst) {
        (BinValue::Rgba(s), BinValue::Rgba(d)) => {
            *d = *s;
            stats.fields_copied += 1;
        }
        (BinValue::Vec4(s), BinValue::Vec4(d)) => {
            if color_ctx {
                *d = *s;
                stats.fields_copied += 1;
            }
        }
        (
            BinValue::List { item: si, items: sa, .. },
            BinValue::List { item: di, items: da, .. },
        ) => {
            if si != di {
                stats.mismatches += 1;
                return;
            }
            let len = sa.len().min(da.len());
            match *si {
                BinType::Rgba => {
                    for i in 0..len {
                        if let (BinValue::Rgba(s), BinValue::Rgba(d)) = (&sa[i], &mut da[i]) {
                            *d = *s;
                            stats.fields_copied += 1;
                        }
                    }
                }
                BinType::Vec4 => {
                    if color_ctx {
                        for i in 0..len {
                            if let (BinValue::Vec4(s), BinValue::Vec4(d)) = (&sa[i], &mut da[i]) {
                                *d = *s;
                                stats.fields_copied += 1;
                            }
                        }
                    }
                }
                BinType::Pointer | BinType::Embed => {
                    for i in 0..len {
                        copy_struct_value(&sa[i], &mut da[i], color_hashes, color_ctx, stats);
                    }
                }
                _ => {}
            }
        }
        (
            BinValue::Map { value: svt, entries: se, .. },
            BinValue::Map { entries: de, .. },
        ) => {
            // Match map values by key. Snapshot source keyed by its serialized key.
            for (dk, dv) in de.iter_mut() {
                if let Some((_, sv)) = se.iter().find(|(sk, _)| sk == dk) {
                    match *svt {
                        BinType::Rgba => {
                            if let (BinValue::Rgba(s), BinValue::Rgba(d)) = (sv, dv) {
                                *d = *s;
                                stats.fields_copied += 1;
                            }
                        }
                        BinType::Pointer | BinType::Embed => {
                            copy_struct_value(sv, dv, color_hashes, color_ctx, stats);
                        }
                        _ => {}
                    }
                }
            }
        }
        (
            BinValue::Option { item: svt, value: Some(sv) },
            BinValue::Option { value: Some(dv), .. },
        ) => match *svt {
            BinType::Rgba => {
                if let (BinValue::Rgba(s), BinValue::Rgba(d)) = (sv.as_ref(), dv.as_mut()) {
                    *d = *s;
                    stats.fields_copied += 1;
                }
            }
            BinType::Vec4 => {
                if color_ctx {
                    if let (BinValue::Vec4(s), BinValue::Vec4(d)) = (sv.as_ref(), dv.as_mut()) {
                        *d = *s;
                        stats.fields_copied += 1;
                    }
                }
            }
            BinType::Pointer | BinType::Embed => {
                copy_struct_value(sv.as_ref(), dv.as_mut(), color_hashes, color_ctx, stats);
            }
            _ => {}
        },
        (src @ (BinValue::Pointer { .. } | BinValue::Embed { .. }), dst) => {
            copy_struct_value(src, dst, color_hashes, color_ctx, stats);
        }
        _ => {}
    }
}

/// Copy between two struct values (Pointer/Embed), descending into their fields.
fn copy_struct_value(
    src: &BinValue,
    dst: &mut BinValue,
    color_hashes: &std::collections::HashSet<u32>,
    in_color_context: bool,
    stats: &mut CopyColorStats,
) {
    let src_fields = match src {
        BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => fields,
        _ => return,
    };
    let dst_fields = match dst {
        BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => fields,
        _ => return,
    };
    copy_container(src_fields, dst_fields, color_hashes, in_color_context, stats);
}
