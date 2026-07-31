//! Port-page projection — walk EVERY resident bin of a [`VfxSession`] into the
//! model the Port UI renders: systems + emitters wherever they live, plus the
//! resolver / idle / persistent views from the first SkinCharacterDataProperties
//! and ResourceResolver found (main bin searched first since it is index 0).
//! Hash-typed values display through the cached LMDB hash dictionary, then
//! through the strings present in the loaded bins themselves (so a freshly
//! created "test" system reads `"test" = "test"`), and fall back to `0x<hex8>`.

use super::construct::{self, H_M_VALUE_A, H_M_VALUE_B, H_SPELL_SLOT};
use super::path::{Step, VfxPath};
use super::schema::Hashes;
use super::session::{BinRole, LoadedBin, VfxSession};
use indexmap::IndexMap;
use ritoshark::bin::{BinEntry, BinValue};
use ritoshark::hash::{fnv1a, HashMapper};
use serde::Serialize;
use std::collections::{BTreeSet, HashMap, HashSet};

// Names the projection reads that sit outside the shared schema vocabulary.
const H_VALUES: u32 = fnv1a("values");
const H_SUBMESH: u32 = fnv1a("submesh");

/// Hash display source: LMDB names first, then FNV1a hashes of every string
/// found in the resident bins (plus derived resolver short keys), then hex.
pub(crate) struct NameLookup<'a> {
    mapper: &'a HashMapper,
    local: HashMap<u32, String>,
}

impl<'a> NameLookup<'a> {
    pub(crate) fn new(mapper: &'a HashMapper, bins: &[LoadedBin]) -> Self {
        let h = Hashes::new();
        let mut local = HashMap::new();
        for lb in bins {
            for entry in &lb.tree.entries {
                for (_k, v) in &entry.fields {
                    collect_string_hashes(v, &mut local);
                }
                if entry.class_hash == h.vfx_system_definition_data {
                    if let Some(BinValue::String(p)) = entry.fields.get(&h.particle_path) {
                        let name = match entry.fields.get(&h.particle_name) {
                            Some(BinValue::String(n)) => n.clone(),
                            _ => p.clone(),
                        };
                        let short = construct::derive_short_key(p, &name);
                        local.entry(fnv1a(&short)).or_insert(short);
                    }
                }
            }
        }
        NameLookup { mapper, local }
    }

    fn get(&self, h: u32) -> Option<String> {
        self.mapper
            .get(h as u64)
            .map(str::to_string)
            .or_else(|| self.local.get(&h).cloned())
    }
}

fn collect_string_hashes(value: &BinValue, out: &mut HashMap<u32, String>) {
    match value {
        BinValue::String(s) => {
            out.entry(fnv1a(s)).or_insert_with(|| s.clone());
        }
        BinValue::List { items, .. } => {
            items.iter().for_each(|v| collect_string_hashes(v, out));
        }
        BinValue::Option {
            value: Some(inner), ..
        } => collect_string_hashes(inner, out),
        BinValue::Map { entries, .. } => {
            for (k, v) in entries {
                collect_string_hashes(k, out);
                collect_string_hashes(v, out);
            }
        }
        BinValue::Embed { fields, .. } | BinValue::Pointer { fields, .. } => {
            for (_k, v) in fields {
                collect_string_hashes(v, out);
            }
        }
        _ => {}
    }
}

// ── Serialized view shapes (camelCase to the frontend) ──────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BinInfo {
    pub path: String,
    pub file_name: String,
    /// "main" or "linked".
    pub role: String,
    pub dirty: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChildView {
    pub effect_key: String,
    pub rate: f32,
    pub lifetime: f32,
    pub bind_weight: f32,
    pub translation: [f32; 3],
    pub is_single_particle: bool,
    pub time_before_first_emission: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortEmitter {
    pub key: String,
    pub name: String,
    /// True when the emitter lives in complexEmitterDefinitionData.
    pub complex: bool,
    /// Name ends `_cbdl` or the emitter carries a childParticleSetDefinition.
    pub is_child: bool,
    pub textures: Vec<String>,
    /// SCB/SCO/SKN paths found anywhere in the emitter subtree.
    pub meshes: Vec<String>,
    /// Display swatches: color/birthColor constants plus up to 6 keyframes.
    pub colors: Vec<[f32; 4]>,
    pub path: VfxPath,
    pub child_data: Option<ChildView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortSystem {
    pub key: String,
    pub name: String,
    pub particle_name: Option<String>,
    pub particle_path: Option<String>,
    pub bin_index: usize,
    pub path: VfxPath,
    pub transform: Option<[f32; 16]>,
    pub emitters: Vec<PortEmitter>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolverEntryView {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolverView {
    pub bin_index: usize,
    pub entry_index: usize,
    pub entries: Vec<ResolverEntryView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdleView {
    pub effect_key: String,
    pub bones: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistentPresetView {
    pub r#type: String,
    pub animation_name: Option<String>,
    pub script_name: Option<String>,
    pub spell_hash: Option<String>,
    pub slot: Option<u32>,
    pub operator: Option<u32>,
    pub value: Option<f32>,
    pub delay_on: f32,
    pub delay_off: f32,
    /// True when the OwnerCondition driver is unrecognized and will be
    /// preserved verbatim on upsert.
    pub raw: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistentVfxView {
    pub key: String,
    pub bone_name: Option<String>,
    pub scale: Option<f32>,
    pub owner_only: Option<bool>,
    pub attach_to_camera: Option<bool>,
    pub force_render: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistentView {
    pub index: usize,
    pub label: String,
    pub preset: PersistentPresetView,
    pub vfx: Vec<PersistentVfxView>,
    pub submeshes_show: Vec<String>,
    pub submeshes_hide: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectKeyOption {
    pub key: String,
    pub label: String,
    pub particle_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VfxPortModel {
    /// Identity of the session tree these paths index into. Cross-session ops
    /// require the caller to echo it back so paths from a swapped or reloaded
    /// donor are rejected rather than silently resolving against the new tree.
    pub generation: u64,
    pub bins: Vec<BinInfo>,
    pub systems: Vec<PortSystem>,
    pub resolver: Option<ResolverView>,
    pub idle: Vec<IdleView>,
    pub persistent: Vec<PersistentView>,
    pub effect_keys: Vec<EffectKeyOption>,
    pub submeshes: Vec<String>,
    /// True when the MAIN bin has a SkinCharacterDataProperties entry — the
    /// precondition for the idle / persistent ops.
    pub has_skin_character_data: bool,
}

// ── Projection ──────────────────────────────────────────────────────────────

/// Project a session's resident bins into the Port UI model.
pub fn project(session: &VfxSession) -> VfxPortModel {
    let guard = crate::bin::get_cached_bin_hashes().read();
    let mapper = NameLookup::new(&guard, &session.bins);
    let mut model = project_bins(&session.bins, &mapper);
    // Stamp the tree identity so cross-session ops can reject stale paths.
    model.generation = session.generation;
    model
}

fn project_bins(bins: &[LoadedBin], mapper: &NameLookup) -> VfxPortModel {
    let h = Hashes::new();

    let bin_infos: Vec<BinInfo> = bins
        .iter()
        .map(|lb| BinInfo {
            path: lb.path.display().to_string(),
            file_name: lb
                .path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default(),
            role: match lb.role {
                BinRole::Main => "main".to_string(),
                BinRole::Linked => "linked".to_string(),
            },
            dirty: lb.dirty,
        })
        .collect();

    // Systems across every bin; key collisions across bins get an "@bin" tag.
    let mut systems = Vec::new();
    let mut seen_keys: HashSet<String> = HashSet::new();
    let mut system_meta: Vec<(u32, Option<String>)> = Vec::new();
    for (bin_idx, lb) in bins.iter().enumerate() {
        for (entry_idx, entry) in lb.tree.entries.iter().enumerate() {
            if entry.class_hash != h.vfx_system_definition_data {
                continue;
            }
            let mut key = format!("{:08x}", entry.path_hash);
            if !seen_keys.insert(key.clone()) {
                key = format!("{}@{}", key, bin_idx);
                seen_keys.insert(key.clone());
            }
            let particle_name = string_field(&entry.fields, h.particle_name);
            let particle_path = string_field(&entry.fields, h.particle_path);
            let name = particle_name.clone().unwrap_or_else(|| short_name(&key));
            let transform = match entry.fields.get(&h.transform) {
                Some(BinValue::Mtx44(m)) => Some(*m),
                _ => None,
            };

            let mut emitters = Vec::new();
            for (complex, fh) in [
                (true, h.complex_emitter_definition_data),
                (false, h.simple_emitter_definition_data),
            ] {
                if let Some(BinValue::List { items, .. }) = entry.fields.get(&fh) {
                    for (i, item) in items.iter().enumerate() {
                        let path = VfxPath {
                            bin: bin_idx,
                            entry: entry_idx,
                            steps: vec![Step::Field { field: fh }, Step::Index { index: i }],
                        };
                        if let Some(e) =
                            project_emitter(item, path, &key, emitters.len(), complex, &h, mapper)
                        {
                            emitters.push(e);
                        }
                    }
                }
            }

            system_meta.push((entry.path_hash, particle_name.clone()));
            systems.push(PortSystem {
                key,
                name,
                particle_name,
                particle_path,
                bin_index: bin_idx,
                path: VfxPath::root(bin_idx, entry_idx),
                transform,
                emitters,
            });
        }
    }

    // First ResourceResolver anywhere (main bin first); also index the raw
    // Link hash -> key display for effect-key labels.
    let mut resolver = None;
    let mut link_to_key: HashMap<u32, String> = HashMap::new();
    'resolver: for (bin_idx, lb) in bins.iter().enumerate() {
        for (entry_idx, entry) in lb.tree.entries.iter().enumerate() {
            if entry.class_hash != h.resource_resolver {
                continue;
            }
            let mut entries_view = Vec::new();
            if let Some(BinValue::Map { entries, .. }) = entry.fields.get(&h.resource_map) {
                for (k, v) in entries {
                    let Some(key_disp) = hashish_display(k, mapper) else {
                        continue;
                    };
                    let Some(value_disp) = hashish_display(v, mapper) else {
                        continue;
                    };
                    if let BinValue::Link(vh) | BinValue::Hash(vh) = v {
                        link_to_key.entry(*vh).or_insert_with(|| key_disp.clone());
                    }
                    entries_view.push(ResolverEntryView {
                        key: key_disp,
                        value: value_disp,
                    });
                }
            }
            resolver = Some(ResolverView {
                bin_index: bin_idx,
                entry_index: entry_idx,
                entries: entries_view,
            });
            break 'resolver;
        }
    }

    // First SkinCharacterDataProperties anywhere carries idle + persistent.
    let skin_entry = bins
        .iter()
        .flat_map(|lb| lb.tree.entries.iter())
        .find(|e| e.class_hash == h.skin_character_data_properties);
    let idle = skin_entry
        .map(|e| project_idle(e, &h, mapper))
        .unwrap_or_default();
    let persistent = skin_entry
        .map(|e| project_persistent(e, &h, mapper))
        .unwrap_or_default();

    // Effect-key options: one per system, preferring its resolver short key
    // (mirrors scanEffectKeys in persistentEffectsManager.ts).
    let mut effect_keys = Vec::new();
    let mut seen_effect_keys: HashSet<String> = HashSet::new();
    for (path_hash, particle_name) in &system_meta {
        let final_key = link_to_key
            .get(path_hash)
            .cloned()
            .unwrap_or_else(|| display32(*path_hash, mapper));
        if !seen_effect_keys.insert(final_key.clone()) {
            continue;
        }
        let label = match particle_name {
            Some(pn) if final_key.starts_with("0x") => format!("{} ({})", pn, final_key),
            Some(pn) => pn.clone(),
            None if final_key.starts_with("0x") => final_key.clone(),
            None => final_key
                .rsplit('/')
                .next()
                .unwrap_or(&final_key)
                .to_string(),
        };
        effect_keys.push(EffectKeyOption {
            key: final_key,
            label,
            particle_name: particle_name.clone(),
        });
    }

    // Submeshes: every `submesh: string` anywhere plus the skin mesh's
    // initialSubmeshToHide split (mirrors extractSubmeshes).
    let mut submeshes: BTreeSet<String> = BTreeSet::new();
    for lb in bins {
        for entry in &lb.tree.entries {
            for (_k, v) in &entry.fields {
                collect_submeshes(v, &mut submeshes);
            }
        }
    }
    if let Some(entry) = skin_entry {
        if let Some(BinValue::Embed { fields, .. } | BinValue::Pointer { fields, .. }) =
            entry.fields.get(&h.skin_mesh_properties)
        {
            if let Some(BinValue::String(s)) = fields.get(&h.initial_submesh_to_hide) {
                for part in s.split([',', ' ']).map(str::trim).filter(|p| !p.is_empty()) {
                    submeshes.insert(part.to_string());
                }
            }
        }
    }

    let has_skin_character_data = bins.first().is_some_and(|b| {
        b.tree
            .entries
            .iter()
            .any(|e| e.class_hash == h.skin_character_data_properties)
    });

    VfxPortModel {
        // Overwritten by `project()` with the owning session's generation;
        // 0 means "not from a live session" and matches nothing.
        generation: 0,
        bins: bin_infos,
        systems,
        resolver,
        idle,
        persistent,
        effect_keys,
        submeshes: submeshes.into_iter().collect(),
        has_skin_character_data,
    }
}

#[allow(clippy::too_many_arguments)]
fn project_emitter(
    item: &BinValue,
    path: VfxPath,
    system_key: &str,
    index_in_system: usize,
    complex: bool,
    h: &Hashes,
    mapper: &NameLookup,
) -> Option<PortEmitter> {
    let fields = match item {
        BinValue::Embed { fields, .. } | BinValue::Pointer { fields, .. } => fields,
        _ => return None,
    };

    let key = format!("{}__emitter_{}", system_key, index_in_system);
    let name = string_field(fields, h.emitter_name).unwrap_or_else(|| "Unnamed".to_string());
    let has_child_def = fields.contains_key(&h.child_particle_set_definition);
    let is_child = name.ends_with("_cbdl") || has_child_def;

    // Every texture string anywhere in the emitter subtree, not a fixed field
    // list - erosion/mult/palette/normal/emissive and friends all surface.
    let mut textures = Vec::new();
    collect_texture_strings(item, &mut textures);
    let mut meshes = Vec::new();
    collect_mesh_strings(item, &mut meshes);

    let colors = emitter_colors(fields, h);
    let child_data = is_child.then(|| child_view(fields, h, mapper));

    Some(PortEmitter {
        key,
        name,
        complex,
        is_child,
        textures,
        meshes,
        colors,
        path,
        child_data,
    })
}

/// Every model-path string in the emitter subtree, deduped in walk order.
fn collect_mesh_strings(value: &BinValue, out: &mut Vec<String>) {
    match value {
        BinValue::String(s) => {
            let lower = s.to_ascii_lowercase();
            let is_mesh =
                lower.ends_with(".scb") || lower.ends_with(".sco") || lower.ends_with(".skn");
            if is_mesh && !out.iter().any(|entry| entry.eq_ignore_ascii_case(s)) {
                out.push(s.clone());
            }
        }
        BinValue::List { items, .. } => {
            items
                .iter()
                .for_each(|item| collect_mesh_strings(item, out));
        }
        BinValue::Option {
            value: Some(inner), ..
        } => collect_mesh_strings(inner, out),
        BinValue::Map { entries, .. } => {
            for (key, value) in entries {
                collect_mesh_strings(key, out);
                collect_mesh_strings(value, out);
            }
        }
        BinValue::Embed { fields, .. } | BinValue::Pointer { fields, .. } => {
            for value in fields.values() {
                collect_mesh_strings(value, out);
            }
        }
        _ => {}
    }
}

/// Every texture-path string in the emitter subtree, deduped in walk order.
fn collect_texture_strings(value: &BinValue, out: &mut Vec<String>) {
    match value {
        BinValue::String(s) => {
            let l = s.to_lowercase();
            let is_texture = l.ends_with(".dds")
                || l.ends_with(".tex")
                || l.ends_with(".png")
                || l.ends_with(".jpg");
            if is_texture && !out.iter().any(|e| e.eq_ignore_ascii_case(s)) {
                out.push(s.clone());
            }
        }
        BinValue::List { items, .. } => {
            items.iter().for_each(|v| collect_texture_strings(v, out));
        }
        BinValue::Option {
            value: Some(inner), ..
        } => collect_texture_strings(inner, out),
        BinValue::Map { entries, .. } => {
            for (k, v) in entries {
                collect_texture_strings(k, out);
                collect_texture_strings(v, out);
            }
        }
        BinValue::Embed { fields, .. } | BinValue::Pointer { fields, .. } => {
            for (_k, v) in fields {
                collect_texture_strings(v, out);
            }
        }
        _ => {}
    }
}

/// Color swatches: color/birthColor constants always, plus at most 6 animated
/// keyframes across both fields (display intent of extractColorsFromEmitterContent).
fn emitter_colors(fields: &IndexMap<u32, BinValue>, h: &Hashes) -> Vec<[f32; 4]> {
    let mut out = Vec::new();
    let mut keyframes = 0usize;
    for fh in [h.color, h.birth_color] {
        match fields.get(&fh) {
            Some(BinValue::Vec4(v)) => out.push(*v),
            Some(BinValue::Embed { fields: cf, .. } | BinValue::Pointer { fields: cf, .. }) => {
                if let Some(BinValue::Vec4(v)) = cf.get(&h.constant_value) {
                    out.push(*v);
                }
                if let Some(BinValue::List { items, .. }) = cf.get(&H_VALUES) {
                    for it in items {
                        if keyframes >= 6 {
                            break;
                        }
                        if let BinValue::Vec4(v) = it {
                            out.push(*v);
                            keyframes += 1;
                        }
                    }
                }
            }
            _ => {}
        }
    }
    out
}

fn child_view(fields: &IndexMap<u32, BinValue>, h: &Hashes, mapper: &NameLookup) -> ChildView {
    let embed_float = |fh: u32, default: f32| -> f32 {
        match fields.get(&fh) {
            Some(BinValue::Embed { fields: ef, .. } | BinValue::Pointer { fields: ef, .. }) => {
                match ef.get(&h.constant_value) {
                    Some(BinValue::F32(v)) => *v,
                    _ => default,
                }
            }
            Some(BinValue::F32(v)) => *v,
            _ => default,
        }
    };

    let mut effect_key = String::new();
    if let Some(BinValue::Pointer { fields: cf, .. } | BinValue::Embed { fields: cf, .. }) =
        fields.get(&h.child_particle_set_definition)
    {
        if let Some(BinValue::List { items, .. }) = cf.get(&h.children_identifiers) {
            if let Some(
                BinValue::Embed { fields: idf, .. } | BinValue::Pointer { fields: idf, .. },
            ) = items.first()
            {
                match idf.get(&h.effect_key) {
                    Some(BinValue::Hash(k)) => effect_key = display32(*k, mapper),
                    Some(BinValue::String(s)) => effect_key = s.clone(),
                    _ => {}
                }
            }
        }
    }

    let translation = match fields.get(&h.translation_override) {
        Some(BinValue::Vec3(v)) => *v,
        _ => [0.0; 3],
    };
    let is_single_particle = match fields.get(&h.is_single_particle) {
        Some(BinValue::Flag(b)) | Some(BinValue::Bool(b)) => *b,
        _ => true,
    };

    let time_before_first_emission = match fields.get(&h.time_before_first_emission) {
        Some(BinValue::F32(v)) => *v,
        _ => 0.0,
    };

    ChildView {
        effect_key,
        rate: embed_float(h.rate, 1.0),
        lifetime: embed_float(h.particle_lifetime, 9999.0),
        bind_weight: embed_float(h.bind_weight, 1.0),
        translation,
        is_single_particle,
        time_before_first_emission,
    }
}

fn project_idle(entry: &BinEntry, h: &Hashes, mapper: &NameLookup) -> Vec<IdleView> {
    let Some(BinValue::List { items, .. }) = entry.fields.get(&h.idle_particles_effects) else {
        return Vec::new();
    };
    let mut order: Vec<String> = Vec::new();
    let mut groups: HashMap<String, Vec<String>> = HashMap::new();
    for item in items {
        let (BinValue::Embed { fields, .. } | BinValue::Pointer { fields, .. }) = item else {
            continue;
        };
        let key = match fields.get(&h.effect_key) {
            Some(BinValue::Hash(k)) => display32(*k, mapper),
            Some(BinValue::String(s)) => s.clone(),
            _ => continue,
        };
        if !groups.contains_key(&key) {
            order.push(key.clone());
        }
        let bones = groups.entry(key).or_default();
        if let Some(BinValue::String(b)) = fields.get(&h.bone_name) {
            bones.push(b.clone());
        }
    }
    order
        .into_iter()
        .map(|k| {
            let bones = groups.remove(&k).unwrap_or_default();
            IdleView {
                effect_key: k,
                bones,
            }
        })
        .collect()
}

fn project_persistent(entry: &BinEntry, h: &Hashes, mapper: &NameLookup) -> Vec<PersistentView> {
    let Some(BinValue::List { items, .. }) = entry.fields.get(&h.persistent_effect_conditions)
    else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for (index, item) in items.iter().enumerate() {
        let fields = match item {
            BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => fields,
            _ => continue,
        };
        let preset = project_preset(fields.get(&h.owner_condition), h, mapper);

        let mut vfx = Vec::new();
        if let Some(BinValue::List { items: vs, .. }) = fields.get(&h.persistent_vfxs) {
            for v in vs {
                if let Some(view) = project_persistent_vfx(v, h, mapper) {
                    vfx.push(view);
                }
            }
        }
        let submeshes_show = hash_list_display(fields.get(&h.submeshes_to_show), mapper);
        let submeshes_hide = hash_list_display(fields.get(&h.submeshes_to_hide), mapper);

        // Mirror the TS label: "Condition N: <type> (<first identifier>)".
        let type_label = if preset.raw {
            "Custom"
        } else {
            preset.r#type.as_str()
        };
        let mut label = format!("Condition {}: {}", index + 1, type_label);
        if let Some(tag) = preset
            .animation_name
            .as_ref()
            .or(preset.script_name.as_ref())
            .or(preset.spell_hash.as_ref())
        {
            label.push_str(&format!(" ({})", tag));
        }

        out.push(PersistentView {
            index,
            label,
            preset,
            vfx,
            submeshes_show,
            submeshes_hide,
        });
    }
    out
}

/// Classify an OwnerCondition driver into the preset view the modal edits.
/// A DelayedBoolMaterialDriver wrapper contributes the delays and classification
/// continues on its inner driver. Unrecognized classes flag `raw` so the
/// upsert path preserves the subtree verbatim.
fn project_preset(
    owner: Option<&BinValue>,
    h: &Hashes,
    mapper: &NameLookup,
) -> PersistentPresetView {
    let mut p = PersistentPresetView {
        r#type: "IsAnimationPlaying".to_string(),
        animation_name: None,
        script_name: None,
        spell_hash: None,
        slot: None,
        operator: None,
        value: None,
        delay_on: 0.0,
        delay_off: 0.0,
        raw: false,
    };
    let Some(mut cur) = owner else { return p };

    if let BinValue::Pointer { class, fields } | BinValue::Embed { class, fields } = cur {
        if *class == h.delayed_bool_material_driver {
            p.delay_on = f32_field(fields, h.m_delay_on).unwrap_or(0.0);
            p.delay_off = f32_field(fields, h.m_delay_off).unwrap_or(0.0);
            match fields.get(&h.m_bool_driver) {
                Some(inner) => cur = inner,
                None => {
                    p.r#type = "raw".to_string();
                    p.raw = true;
                    return p;
                }
            }
        }
    }

    let (class, fields) = match cur {
        BinValue::Pointer { class, fields } | BinValue::Embed { class, fields } => (*class, fields),
        _ => {
            p.r#type = "raw".to_string();
            p.raw = true;
            return p;
        }
    };

    if class == h.is_animation_playing_dynamic_material_bool_driver {
        p.r#type = "IsAnimationPlaying".to_string();
        if let Some(BinValue::List { items, .. }) = fields.get(&h.m_animation_names) {
            p.animation_name = items.first().and_then(|v| match v {
                BinValue::Hash(k) => Some(display32(*k, mapper)),
                BinValue::String(s) => Some(s.clone()),
                _ => None,
            });
        }
    } else if class == h.has_buff_dynamic_material_bool_driver {
        p.r#type = "HasBuffScript".to_string();
        p.spell_hash = hash_field_display(fields, h.spell, mapper);
        p.script_name = string_field(fields, h.m_script_name);
    } else if class == h.learned_spell_dynamic_material_bool_driver {
        p.r#type = "LearnedSpell".to_string();
        p.slot = u32_field(fields, h.m_slot);
    } else if class == h.has_gear_dynamic_material_bool_driver {
        p.r#type = "HasGear".to_string();
        p.slot = u32_field(fields, h.m_gear_index);
    } else if class == h.float_comparison_material_driver {
        p.operator = u32_field(fields, h.m_operator);
        if let Some(BinValue::Pointer { fields: bf, .. } | BinValue::Embed { fields: bf, .. }) =
            fields.get(&H_M_VALUE_B)
        {
            p.value = f32_field(bf, h.m_value);
        }
        match fields.get(&H_M_VALUE_A) {
            Some(
                BinValue::Pointer {
                    class: ac,
                    fields: af,
                }
                | BinValue::Embed {
                    class: ac,
                    fields: af,
                },
            ) if *ac == h.buff_counter_dynamic_material_float_driver => {
                p.r#type = "BuffCounterFloatComparison".to_string();
                p.spell_hash = hash_field_display(af, h.spell, mapper);
            }
            Some(BinValue::Pointer { fields: af, .. } | BinValue::Embed { fields: af, .. }) => {
                p.r#type = "FloatComparison".to_string();
                p.slot = u32_field(af, H_SPELL_SLOT);
            }
            _ => p.r#type = "FloatComparison".to_string(),
        }
    } else if class == h.buff_counter_dynamic_material_float_driver {
        p.r#type = "BuffCounterFloatComparison".to_string();
        p.spell_hash = hash_field_display(fields, h.spell, mapper);
    } else {
        p.r#type = "raw".to_string();
        p.raw = true;
    }
    p
}

fn project_persistent_vfx(
    item: &BinValue,
    h: &Hashes,
    mapper: &NameLookup,
) -> Option<PersistentVfxView> {
    let fields = match item {
        BinValue::Embed { fields, .. } | BinValue::Pointer { fields, .. } => fields,
        _ => return None,
    };
    let key = match fields.get(&h.effect_key) {
        Some(BinValue::Hash(k)) => display32(*k, mapper),
        Some(BinValue::String(s)) => s.clone(),
        _ => String::new(),
    };
    Some(PersistentVfxView {
        key,
        bone_name: string_field(fields, h.bone_name),
        scale: f32_field(fields, h.scale),
        owner_only: bool_field(fields, h.show_to_owner_only),
        attach_to_camera: bool_field(fields, h.attach_to_camera),
        force_render: bool_field(fields, h.force_render_vfx),
    })
}

fn hash_list_display(list: Option<&BinValue>, mapper: &NameLookup) -> Vec<String> {
    let Some(BinValue::List { items, .. }) = list else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|v| match v {
            BinValue::Hash(k) | BinValue::Link(k) => Some(display32(*k, mapper)),
            BinValue::String(s) => Some(s.clone()),
            _ => None,
        })
        .collect()
}

/// Recursively collect every `submesh: string` field value.
fn collect_submeshes(v: &BinValue, out: &mut BTreeSet<String>) {
    match v {
        BinValue::Embed { fields, .. } | BinValue::Pointer { fields, .. } => {
            for (k, c) in fields {
                if *k == H_SUBMESH {
                    if let BinValue::String(s) = c {
                        out.insert(s.clone());
                    }
                }
                collect_submeshes(c, out);
            }
        }
        BinValue::List { items, .. } => items.iter().for_each(|c| collect_submeshes(c, out)),
        BinValue::Option {
            value: Some(inner), ..
        } => collect_submeshes(inner, out),
        BinValue::Map { entries, .. } => {
            for (k, c) in entries {
                collect_submeshes(k, out);
                collect_submeshes(c, out);
            }
        }
        _ => {}
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn display32(h: u32, mapper: &NameLookup) -> String {
    mapper.get(h).unwrap_or_else(|| format!("0x{:08x}", h))
}

/// Display for a resolver map cell (hash/link resolve, strings pass through).
fn hashish_display(v: &BinValue, mapper: &NameLookup) -> Option<String> {
    match v {
        BinValue::Hash(x) | BinValue::Link(x) => Some(display32(*x, mapper)),
        BinValue::String(s) => Some(s.clone()),
        _ => None,
    }
}

fn string_field(fields: &IndexMap<u32, BinValue>, key: u32) -> Option<String> {
    match fields.get(&key) {
        Some(BinValue::String(s)) => Some(s.clone()),
        _ => None,
    }
}

fn hash_field_display(
    fields: &IndexMap<u32, BinValue>,
    key: u32,
    mapper: &NameLookup,
) -> Option<String> {
    match fields.get(&key) {
        Some(BinValue::Hash(k)) => Some(display32(*k, mapper)),
        Some(BinValue::String(s)) => Some(s.clone()),
        _ => None,
    }
}

fn f32_field(fields: &IndexMap<u32, BinValue>, key: u32) -> Option<f32> {
    match fields.get(&key) {
        Some(BinValue::F32(v)) => Some(*v),
        _ => None,
    }
}

fn u32_field(fields: &IndexMap<u32, BinValue>, key: u32) -> Option<u32> {
    match fields.get(&key) {
        Some(BinValue::U8(v)) => Some(*v as u32),
        Some(BinValue::U16(v)) => Some(*v as u32),
        Some(BinValue::U32(v)) => Some(*v),
        Some(BinValue::I32(v)) if *v >= 0 => Some(*v as u32),
        _ => None,
    }
}

fn bool_field(fields: &IndexMap<u32, BinValue>, key: u32) -> Option<bool> {
    match fields.get(&key) {
        Some(BinValue::Bool(b)) | Some(BinValue::Flag(b)) => Some(*b),
        _ => None,
    }
}

/// Trim a slash-delimited path to its last segment, capped at 40 chars
/// (mirrors paint's short_name).
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
    use crate::vfx_session::construct::{
        self, ChildParams, PersistentPayload, PersistentPresetPayload, PersistentVfxPayload,
    };
    use ritoshark::bin::Bin;

    #[test]
    fn mesh_projection_collects_supported_paths_in_order() {
        let value = BinValue::List {
            is_list2: false,
            item: ritoshark::bin::BinType::String,
            items: vec![
                BinValue::String("assets/fx/screen.scb".into()),
                BinValue::String("assets/champion/model.skn".into()),
                BinValue::String("assets/fx/screen.scb".into()),
                BinValue::String("assets/fx/diffuse.dds".into()),
            ],
        };
        let mut paths = Vec::new();
        collect_mesh_strings(&value, &mut paths);
        assert_eq!(
            paths,
            vec!["assets/fx/screen.scb", "assets/champion/model.skn"]
        );
    }

    fn loaded(bin: Bin, role: BinRole) -> LoadedBin {
        LoadedBin {
            path: Default::default(),
            role,
            source_format: crate::linked_bins::SourceFormat::Bin,
            tree: bin,
            dirty: false,
            link_str: None,
            mtime: None,
        }
    }

    /// Main bin: skin props (idle + persistent + skin mesh) + resolver + one
    /// system with a child emitter. Linked bin: one more system. Projection
    /// must surface all of it with correct bin tagging and hex display (empty
    /// mapper).
    #[test]
    fn projects_multi_bin_model() {
        let h = Hashes::new();
        let sys_path = "Characters/Eve/Skins/Skin0/Particles/Eve_Base_R_mis";
        let short_key = construct::derive_short_key(sys_path, "Eve_Base_R_mis");
        assert_eq!(short_key, "Eve_R_mis");

        // System with one child emitter in the complex list.
        let mut system = construct::new_vfx_system("Eve_Base_R_mis", sys_path);
        let child = construct::new_child_emitter(&ChildParams {
            effect_key: short_key.clone(),
            rate: 2.0,
            lifetime: 5.0,
            bind_weight: 0.5,
            translation: [1.0, 2.0, 3.0],
            is_single_particle: false,
            emitter_name: None,
            time_before_first_emission: 0.25,
        });
        if let Some(BinValue::List { items, .. }) =
            system.fields.get_mut(&h.complex_emitter_definition_data)
        {
            items.push(child);
        }

        // Resolver mapping short key -> system path.
        let mut map = BinValue::Map {
            key: ritoshark::bin::BinType::Hash,
            value: ritoshark::bin::BinType::Link,
            entries: Vec::new(),
        };
        construct::resolver_upsert(&mut map, &short_key, sys_path).unwrap();
        let mut resolver_fields = IndexMap::new();
        resolver_fields.insert(h.resource_map, map);
        let resolver_entry = BinEntry {
            path_hash: 0x100,
            class_hash: h.resource_resolver,
            fields: resolver_fields,
        };

        // Skin props: idle (one key, two bones), one persistent condition,
        // and a skin mesh with submeshes.
        let mut skin_fields = IndexMap::new();
        skin_fields.insert(
            h.idle_particles_effects,
            BinValue::List {
                is_list2: false,
                item: ritoshark::bin::BinType::Embed,
                items: vec![
                    construct::new_idle_effect(&short_key, "head"),
                    construct::new_idle_effect(&short_key, "root"),
                ],
            },
        );
        let cond = construct::new_persistent_condition(&PersistentPayload {
            preset: PersistentPresetPayload {
                r#type: "LearnedSpell".to_string(),
                animation_name: None,
                script_name: None,
                spell_hash: None,
                slot: Some(2),
                operator: None,
                value: None,
                delay_on: 1.5,
                delay_off: 0.5,
            },
            vfx: vec![PersistentVfxPayload {
                key: short_key.clone(),
                bone_name: Some("head".to_string()),
                scale: Some(1.25),
                owner_only: Some(true),
                attach_to_camera: None,
                force_render: None,
            }],
            submeshes_show: vec!["Wings".to_string()],
            submeshes_hide: Vec::new(),
        })
        .unwrap();
        skin_fields.insert(
            h.persistent_effect_conditions,
            BinValue::List {
                is_list2: true,
                item: ritoshark::bin::BinType::Pointer,
                items: vec![cond],
            },
        );
        let mut mesh_override = IndexMap::new();
        mesh_override.insert(H_SUBMESH, BinValue::String("Body".to_string()));
        let mut mesh_fields = IndexMap::new();
        mesh_fields.insert(
            h.initial_submesh_to_hide,
            BinValue::String("Wings Cloak".to_string()),
        );
        mesh_fields.insert(
            fnv1a("materialOverride"),
            BinValue::List {
                is_list2: false,
                item: ritoshark::bin::BinType::Embed,
                items: vec![BinValue::Embed {
                    class: 0xAB,
                    fields: mesh_override,
                }],
            },
        );
        skin_fields.insert(
            h.skin_mesh_properties,
            BinValue::Embed {
                class: h.skin_mesh_data_properties,
                fields: mesh_fields,
            },
        );
        let skin_entry = BinEntry {
            path_hash: 0x200,
            class_hash: h.skin_character_data_properties,
            fields: skin_fields,
        };

        let main = Bin {
            entries: vec![skin_entry, resolver_entry, system],
            ..Bin::new()
        };
        let linked_sys = construct::new_vfx_system("Other_Fx", "Other_Fx");
        let linked = Bin {
            entries: vec![linked_sys],
            ..Bin::new()
        };

        let bins = vec![loaded(main, BinRole::Main), loaded(linked, BinRole::Linked)];
        let empty = HashMapper::new();
        let lk = NameLookup::new(&empty, &bins);
        let model = project_bins(&bins, &lk);

        assert_eq!(model.bins.len(), 2);
        assert_eq!(model.bins[0].role, "main");
        assert_eq!(model.bins[1].role, "linked");

        // Systems from both bins, tagged with their owning bin.
        assert_eq!(model.systems.len(), 2);
        assert_eq!(model.systems[0].bin_index, 0);
        assert_eq!(model.systems[0].particle_path.as_deref(), Some(sys_path));
        assert_eq!(model.systems[1].bin_index, 1);
        assert_eq!(model.systems[1].path.bin, 1);

        // The child emitter projects with is_child + child data.
        let em = &model.systems[0].emitters[0];
        assert!(em.complex && em.is_child);
        assert!(em.name.ends_with("_cbdl"));
        let cd = em.child_data.as_ref().expect("child data");
        assert_eq!(cd.rate, 2.0);
        assert_eq!(cd.lifetime, 5.0);
        assert_eq!(cd.bind_weight, 0.5);
        assert_eq!(cd.translation, [1.0, 2.0, 3.0]);
        assert!(!cd.is_single_particle);
        assert_eq!(cd.time_before_first_emission, 0.25);
        // Self-hashing resolves the derived short key without the LMDB.
        assert_eq!(cd.effect_key, short_key);

        // Resolver key/value resolve through the bins' own strings.
        let resolver = model.resolver.as_ref().expect("resolver view");
        assert_eq!((resolver.bin_index, resolver.entry_index), (0, 1));
        assert_eq!(resolver.entries.len(), 1);
        assert_eq!(resolver.entries[0].key, short_key);
        assert_eq!(resolver.entries[0].value, sys_path);

        // Idle grouped under one key with both bones in order.
        assert_eq!(model.idle.len(), 1);
        assert_eq!(
            model.idle[0].bones,
            vec!["head".to_string(), "root".to_string()]
        );

        // Persistent classified with delays unwrapped from the wrapper.
        assert_eq!(model.persistent.len(), 1);
        let pv = &model.persistent[0];
        assert_eq!(pv.preset.r#type, "LearnedSpell");
        assert_eq!(pv.preset.slot, Some(2));
        assert_eq!(pv.preset.delay_on, 1.5);
        assert_eq!(pv.preset.delay_off, 0.5);
        assert!(!pv.preset.raw);
        assert_eq!(pv.vfx.len(), 1);
        assert_eq!(pv.vfx[0].bone_name.as_deref(), Some("head"));
        assert_eq!(pv.vfx[0].scale, Some(1.25));
        assert_eq!(pv.vfx[0].owner_only, Some(true));
        assert_eq!(pv.vfx[0].attach_to_camera, None);
        assert_eq!(pv.submeshes_show.len(), 1);

        // Effect keys: resolver short key wins for the mapped system.
        assert!(model
            .effect_keys
            .iter()
            .any(|k| k.particle_name.as_deref() == Some("Eve_Base_R_mis") && k.key == short_key));

        // Submeshes: the `submesh` field plus the initialSubmeshToHide split.
        assert_eq!(
            model.submeshes,
            vec!["Body".to_string(), "Cloak".to_string(), "Wings".to_string()]
        );
    }
}
