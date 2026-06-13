//! VFX projection — walk a `Bin` tree into the systems/emitters/colors/materials
//! view the Paint UI renders. Each editable node (color, blend mode, material
//! param) carries a [`NodePath`] back into the live tree so [`super::recolor`]
//! and the blend-mode/material commands can mutate it in place.

use super::fnv1a_lower;
use ritoshark::bin::{Bin, BinValue};
use serde::Serialize;
use std::collections::HashMap;

/// One step from a parent field-map (embed/pointer) or list down to a child.
#[derive(Debug, Clone)]
pub enum Step {
    /// Into a field of an embed/pointer by its hash key.
    Field(u32),
    /// Into a list element by index.
    Index(usize),
}

/// A relocatable path to a live node: which top-level entry, then the steps down
/// to the value. Resolved against the resident tree at edit time so we never
/// hold a borrow across IPC.
#[derive(Debug, Clone)]
pub struct NodePath {
    pub entry: usize,
    pub steps: Vec<Step>,
}

impl NodePath {
    fn child(&self, step: Step) -> NodePath {
        let mut steps = self.steps.clone();
        steps.push(step);
        NodePath { entry: self.entry, steps }
    }

    /// Resolve to a mutable reference into `bin`, or `None` if the path no longer
    /// points at a value (tree shape changed).
    pub fn resolve_mut<'a>(&self, bin: &'a mut Bin) -> Option<&'a mut BinValue> {
        let entry = bin.entries.get_mut(self.entry)?;
        let mut steps = self.steps.iter();
        // First step must descend from the entry's field map.
        let first = steps.next()?;
        let mut cur: &mut BinValue = match first {
            Step::Field(h) => entry.fields.get_mut(h)?,
            Step::Index(_) => return None,
        };
        for step in steps {
            cur = match (step, cur) {
                (Step::Field(h), BinValue::Embed { fields, .. })
                | (Step::Field(h), BinValue::Pointer { fields, .. }) => fields.get_mut(h)?,
                (Step::Index(i), BinValue::List { items, .. }) => items.get_mut(*i)?,
                _ => return None,
            };
        }
        Some(cur)
    }
}

// ── Serialized view shapes (camelCase to the frontend) ──────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColorKeyframe {
    pub rgba: [f32; 4],
    pub time: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColorData {
    pub keyframes: Vec<ColorKeyframe>,
    /// True when this is a single constant value (vs. an animated list).
    pub is_constant: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmitterTexture {
    pub label: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmitterColors {
    pub color: Option<ColorData>,
    pub birth_color: Option<ColorData>,
    pub fresnel_color: Option<ColorData>,
    pub linger_color: Option<ColorData>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VfxEmitter {
    pub key: String,
    pub name: String,
    pub system_key: String,
    pub blend_mode: u8,
    pub textures: Vec<EmitterTexture>,
    pub colors: EmitterColors,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VfxSystem {
    pub key: String,
    pub name: String,
    pub particle_name: Option<String>,
    pub emitter_keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialParam {
    pub name: String,
    pub values: [f32; 4],
    pub is_color: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VfxMaterial {
    pub key: String,
    pub name: String,
    pub color_params: Vec<MaterialParam>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VfxStats {
    pub system_count: usize,
    pub emitter_count: usize,
    pub material_count: usize,
    pub color_param_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VfxModel {
    pub systems: Vec<VfxSystem>,
    pub system_order: Vec<String>,
    pub emitters: Vec<VfxEmitter>,
    pub materials: Vec<VfxMaterial>,
    pub material_order: Vec<String>,
    pub stats: VfxStats,
}

// ── Edit-target index (Rust-side only; not serialized) ──────────────────────

/// Which of the four emitter colors a path targets.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ColorSlot {
    Color,
    BirthColor,
    FresnelColor,
    LingerColor,
}

/// Live locations for every editable node, keyed by the same string keys the
/// serialized model exposes. Built alongside [`VfxModel`] and held in the
/// session so edits can relocate nodes without re-walking the whole tree.
#[derive(Debug, Default)]
pub struct EditIndex {
    /// `emitterKey` → (slot → path to the ValueColor embed or simple vec4).
    pub emitter_colors: HashMap<String, HashMap<ColorSlot, ColorTarget>>,
    /// `emitterKey` → path to the `blendMode: u8` node.
    pub blend_modes: HashMap<String, NodePath>,
    /// `"mat::<materialKey>::<paramName>"` → path to the param `value: vec4`.
    pub material_params: HashMap<String, NodePath>,
}

/// Where a color's editable vec4 nodes live.
#[derive(Debug, Clone)]
pub struct ColorTarget {
    /// Path to the constant vec4 node, if present (`constantValue` or a simple vec4).
    pub constant: Option<NodePath>,
    /// Paths to each keyframe vec4 in the `values` list, in order.
    pub keyframes: Vec<NodePath>,
}

// ── Projection ──────────────────────────────────────────────────────────────

struct Hashes {
    vfx_system: u32,
    complex_emitter: u32,
    simple_emitter: u32,
    emitter_name: u32,
    particle_name: u32,
    blend_mode: u32,
    constant_value: u32,
    values: u32,
    color_slots: Vec<(ColorSlot, Vec<u32>)>,
    textures: Vec<(u32, &'static str)>,
    static_material: u32,
    sampler_values: u32,
    static_material_def: u32,
    param_name: u32,
    param_value: u32,
}

impl Hashes {
    fn new() -> Self {
        Hashes {
            vfx_system: fnv1a_lower("VfxSystemDefinitionData"),
            complex_emitter: fnv1a_lower("ComplexEmitterDefinitionData"),
            simple_emitter: fnv1a_lower("SimpleEmitterDefinitionData"),
            emitter_name: fnv1a_lower("emitterName"),
            particle_name: fnv1a_lower("particleName"),
            blend_mode: fnv1a_lower("blendMode"),
            constant_value: fnv1a_lower("constantValue"),
            values: fnv1a_lower("values"),
            // Field names that carry each color, in priority order.
            color_slots: vec![
                (ColorSlot::Color, vec![fnv1a_lower("color")]),
                (ColorSlot::BirthColor, vec![fnv1a_lower("birthColor")]),
                (
                    ColorSlot::FresnelColor,
                    vec![fnv1a_lower("fresnelColor"), fnv1a_lower("outlineColor")],
                ),
                (
                    ColorSlot::LingerColor,
                    vec![fnv1a_lower("lingerColor"), fnv1a_lower("SeparateLingerColor")],
                ),
            ],
            textures: vec![
                (fnv1a_lower("texture"), "Main Texture"),
                (fnv1a_lower("particleColorTexture"), "Color Texture"),
                (fnv1a_lower("erosionMapName"), "Erosion Map"),
                (fnv1a_lower("textureMult"), "Mult Texture"),
                (fnv1a_lower("paletteTexture"), "Palette"),
                (fnv1a_lower("normalMap"), "Normal Map"),
                (fnv1a_lower("normalMapTexture"), "Normal Map"),
            ],
            static_material: fnv1a_lower("StaticMaterialDef"),
            static_material_def: fnv1a_lower("StaticMaterialShaderParamDef"),
            sampler_values: fnv1a_lower("paramValues"),
            param_name: fnv1a_lower("name"),
            param_value: fnv1a_lower("value"),
        }
    }
}

/// Project a parsed bin into the VFX view plus the edit index.
pub fn project(bin: &Bin) -> (VfxModel, EditIndex) {
    let h = Hashes::new();
    let mut model = VfxModel {
        systems: Vec::new(),
        system_order: Vec::new(),
        emitters: Vec::new(),
        materials: Vec::new(),
        material_order: Vec::new(),
        stats: VfxStats::default(),
    };
    let mut index = EditIndex::default();

    for (entry_idx, entry) in bin.entries.iter().enumerate() {
        if entry.class_hash == h.vfx_system {
            project_system(bin, entry_idx, &h, &mut model, &mut index);
        } else if entry.class_hash == h.static_material {
            project_material(bin, entry_idx, &h, &mut model, &mut index);
        }
    }

    model.stats.system_count = model.systems.len();
    model.stats.emitter_count = model.emitters.len();
    model.stats.material_count = model.materials.len();
    (model, index)
}

fn entry_key(bin: &Bin, entry_idx: usize) -> String {
    // The entry's path hash gives a stable per-entry key; hex form matches the
    // hashed-name convention the rest of the app uses for unresolved names.
    format!("{:08x}", bin.entries[entry_idx].path_hash)
}

fn project_system(
    bin: &Bin,
    entry_idx: usize,
    h: &Hashes,
    model: &mut VfxModel,
    index: &mut EditIndex,
) {
    let entry = &bin.entries[entry_idx];
    let system_key = entry_key(bin, entry_idx);
    let base = NodePath { entry: entry_idx, steps: Vec::new() };

    let particle_name = entry
        .fields
        .get(&h.particle_name)
        .and_then(string_of);
    let display_name = particle_name.clone().unwrap_or_else(|| short_name(&system_key));

    let mut system = VfxSystem {
        key: system_key.clone(),
        name: display_name,
        particle_name,
        emitter_keys: Vec::new(),
    };

    // Emitters live under ComplexEmitterDefinitionData / SimpleEmitterDefinitionData
    // list fields (a list of embed/pointer emitters).
    for (field_hash, field_val) in entry.fields.iter() {
        if *field_hash != h.complex_emitter && *field_hash != h.simple_emitter {
            continue;
        }
        let list_path = base.child(Step::Field(*field_hash));
        if let BinValue::List { items, .. } = field_val {
            for (i, item) in items.iter().enumerate() {
                let emitter_path = list_path.child(Step::Index(i));
                if let Some(emitter) =
                    project_emitter(item, &emitter_path, &system_key, system.emitter_keys.len(), h, index)
                {
                    system.emitter_keys.push(emitter.key.clone());
                    model.emitters.push(emitter);
                }
            }
        }
    }

    if !system.emitter_keys.is_empty() || entry.class_hash == h.vfx_system {
        model.system_order.push(system_key.clone());
        model.systems.push(system);
    }
}

fn project_emitter(
    item: &BinValue,
    path: &NodePath,
    system_key: &str,
    index_in_system: usize,
    h: &Hashes,
    index: &mut EditIndex,
) -> Option<VfxEmitter> {
    let fields = match item {
        BinValue::Embed { fields, .. } | BinValue::Pointer { fields, .. } => fields,
        _ => return None,
    };

    let key = format!("{}__emitter_{}", system_key, index_in_system);
    let name = fields
        .get(&h.emitter_name)
        .and_then(string_of)
        .unwrap_or_else(|| "Unnamed".to_string());

    let blend_mode = match fields.get(&h.blend_mode) {
        Some(BinValue::U8(v)) => *v,
        _ => 0,
    };
    if fields.contains_key(&h.blend_mode) {
        index.blend_modes.insert(key.clone(), path.child(Step::Field(h.blend_mode)));
    }

    let mut textures = Vec::new();
    for (tex_hash, label) in &h.textures {
        if let Some(p) = fields.get(tex_hash).and_then(string_of) {
            if !textures.iter().any(|t: &EmitterTexture| t.path == p && t.label == *label) {
                textures.push(EmitterTexture { label: label.to_string(), path: p });
            }
        }
    }

    let mut targets: HashMap<ColorSlot, ColorTarget> = HashMap::new();
    let mut colors = EmitterColors {
        color: None,
        birth_color: None,
        fresnel_color: None,
        linger_color: None,
    };
    for (slot, names) in &h.color_slots {
        for name_hash in names {
            if let Some(field) = fields.get(name_hash) {
                let field_path = path.child(Step::Field(*name_hash));
                if let Some((data, target)) = project_color(field, &field_path, h) {
                    match slot {
                        ColorSlot::Color => colors.color = Some(data),
                        ColorSlot::BirthColor => colors.birth_color = Some(data),
                        ColorSlot::FresnelColor => colors.fresnel_color = Some(data),
                        ColorSlot::LingerColor => colors.linger_color = Some(data),
                    }
                    targets.insert(*slot, target);
                    break;
                }
            }
        }
    }
    if !targets.is_empty() {
        index.emitter_colors.insert(key.clone(), targets);
    }

    Some(VfxEmitter {
        key,
        name,
        system_key: system_key.to_string(),
        blend_mode,
        textures,
        colors,
    })
}

/// Parse a color field, which is either a `ValueColor` embed (constantValue +
/// values/times) or a bare vec4. Returns the view data and the edit target.
fn project_color(field: &BinValue, path: &NodePath, h: &Hashes) -> Option<(ColorData, ColorTarget)> {
    match field {
        // Simple vec4 color (fresnelColor/outlineColor/lingerColor: vec4 = {...}).
        BinValue::Vec4(v) => Some((
            ColorData { keyframes: vec![ColorKeyframe { rgba: *v, time: 0.0 }], is_constant: true },
            ColorTarget { constant: Some(path.clone()), keyframes: Vec::new() },
        )),
        // ValueColor embed/pointer.
        BinValue::Embed { fields, .. } | BinValue::Pointer { fields, .. } => {
            let mut keyframes = Vec::new();
            let mut target = ColorTarget { constant: None, keyframes: Vec::new() };

            if let Some(BinValue::Vec4(v)) = fields.get(&h.constant_value) {
                keyframes.push(ColorKeyframe { rgba: *v, time: 0.0 });
                target.constant = Some(path.child(Step::Field(h.constant_value)));
            }

            if let Some(BinValue::List { items, .. }) = fields.get(&h.values) {
                let values_path = path.child(Step::Field(h.values));
                let count = items.len();
                for (i, item) in items.iter().enumerate() {
                    if let BinValue::Vec4(v) = item {
                        let time = if count <= 1 { 0.0 } else { i as f32 / (count - 1) as f32 };
                        keyframes.push(ColorKeyframe { rgba: *v, time });
                        target.keyframes.push(values_path.child(Step::Index(i)));
                    }
                }
            }

            if keyframes.is_empty() {
                return None;
            }
            let is_constant = target.keyframes.is_empty();
            Some((ColorData { keyframes, is_constant }, target))
        }
        _ => None,
    }
}

fn project_material(
    bin: &Bin,
    entry_idx: usize,
    h: &Hashes,
    model: &mut VfxModel,
    index: &mut EditIndex,
) {
    let entry = &bin.entries[entry_idx];
    let material_key = entry_key(bin, entry_idx);
    let base = NodePath { entry: entry_idx, steps: Vec::new() };

    let mut color_params = Vec::new();

    // Static-material color params live in a list of StaticMaterialShaderParamDef
    // embeds under `paramValues`, each { name: string, value: vec4 }.
    if let Some(BinValue::List { items, .. }) = entry.fields.get(&h.sampler_values) {
        let list_path = base.child(Step::Field(h.sampler_values));
        for (i, item) in items.iter().enumerate() {
            let pf = match item {
                BinValue::Embed { fields, .. } | BinValue::Pointer { fields, .. } => fields,
                _ => continue,
            };
            let name = match pf.get(&h.param_name).and_then(string_of) {
                Some(n) => n,
                None => continue,
            };
            if let Some(BinValue::Vec4(v)) = pf.get(&h.param_value) {
                let selection_key = format!("mat::{}::{}", material_key, name);
                let value_path = list_path
                    .child(Step::Index(i))
                    .child(Step::Field(h.param_value));
                index.material_params.insert(selection_key, value_path);
                color_params.push(MaterialParam { name, values: *v, is_color: true });
                model.stats.color_param_count += 1;
            }
        }
    }

    let _ = h.static_material_def; // reserved: some bins nest params differently
    if color_params.is_empty() {
        return;
    }

    model.material_order.push(material_key.clone());
    model.materials.push(VfxMaterial {
        key: material_key.clone(),
        name: short_name(&material_key),
        color_params,
    });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn string_of(v: &BinValue) -> Option<String> {
    match v {
        BinValue::String(s) => Some(s.clone()),
        _ => None,
    }
}

/// Trim a slash-delimited path to its last segment, capped at 40 chars.
fn short_name(full: &str) -> String {
    if full.is_empty() {
        return "Unknown".to_string();
    }
    let last = full.rsplit('/').next().unwrap_or(full);
    if last.len() > 40 {
        format!("{}...", &last[..37])
    } else {
        last.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use indexmap::IndexMap;
    use ritoshark::bin::{Bin, BinEntry, BinType};

    /// Build a one-system, one-emitter bin with a constant base color and two
    /// birthColor keyframes, then assert the projection + edit index.
    #[test]
    fn projects_system_emitter_colors() {
        let h_emitter_name = fnv1a_lower("emitterName");
        let h_blend = fnv1a_lower("blendMode");
        let h_color = fnv1a_lower("color");
        let h_birth = fnv1a_lower("birthColor");
        let h_constant = fnv1a_lower("constantValue");
        let h_values = fnv1a_lower("values");
        let h_complex = fnv1a_lower("ComplexEmitterDefinitionData");

        // color: ValueColor { constantValue: vec4 }
        let mut color_fields = IndexMap::new();
        color_fields.insert(h_constant, BinValue::Vec4([0.5, 0.2, 0.1, 1.0]));
        // birthColor: ValueColor { values: list[vec4]{ a, b } }
        let mut birth_fields = IndexMap::new();
        birth_fields.insert(
            h_values,
            BinValue::List {
                is_list2: false,
                item: BinType::Vec4,
                items: vec![
                    BinValue::Vec4([1.0, 0.0, 0.0, 1.0]),
                    BinValue::Vec4([0.0, 0.0, 1.0, 1.0]),
                ],
            },
        );

        let mut emitter_fields = IndexMap::new();
        emitter_fields.insert(h_emitter_name, BinValue::String("Sparkles".into()));
        emitter_fields.insert(h_blend, BinValue::U8(3));
        emitter_fields.insert(h_color, BinValue::Embed { class: 0xAABB, fields: color_fields });
        emitter_fields.insert(h_birth, BinValue::Embed { class: 0xAABB, fields: birth_fields });

        let mut system_fields = IndexMap::new();
        system_fields.insert(
            h_complex,
            BinValue::List {
                is_list2: false,
                item: BinType::Embed,
                items: vec![BinValue::Embed { class: 0xCCDD, fields: emitter_fields }],
            },
        );

        let bin = Bin {
            entries: vec![BinEntry {
                path_hash: 0x1234_5678,
                class_hash: fnv1a_lower("VfxSystemDefinitionData"),
                fields: system_fields,
            }],
            ..Bin::new()
        };

        let (model, index) = project(&bin);
        assert_eq!(model.systems.len(), 1);
        assert_eq!(model.emitters.len(), 1);

        let emitter = &model.emitters[0];
        assert_eq!(emitter.name, "Sparkles");
        assert_eq!(emitter.blend_mode, 3);

        let color = emitter.colors.color.as_ref().expect("base color");
        assert!(color.is_constant);
        assert_eq!(color.keyframes.len(), 1);
        assert_eq!(color.keyframes[0].rgba, [0.5, 0.2, 0.1, 1.0]);

        let birth = emitter.colors.birth_color.as_ref().expect("birth color");
        assert!(!birth.is_constant);
        assert_eq!(birth.keyframes.len(), 2);

        // Edit index has both colors + the blend mode for this emitter.
        let slots = index.emitter_colors.get(&emitter.key).expect("color targets");
        assert!(slots.contains_key(&ColorSlot::Color));
        assert!(slots.contains_key(&ColorSlot::BirthColor));
        assert!(index.blend_modes.contains_key(&emitter.key));

        // The base-color target's constant path resolves back to the live vec4.
        let mut bin_mut = bin.clone();
        let target = &slots[&ColorSlot::Color];
        let node = target.constant.as_ref().unwrap().resolve_mut(&mut bin_mut);
        assert!(matches!(node, Some(BinValue::Vec4(_))));
    }
}
