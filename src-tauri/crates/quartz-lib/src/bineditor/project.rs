//! Projection — walk `VfxSystemDefinitionData` entries into the generic
//! `EditorModel` the Bin Editor V2 UI renders: systems → complex+simple
//! emitters → EVERY emitter field recursively as an [`EditorNode`] tree.
//! Every node carries a [`NodePath`] addressing it in the live tree. Field
//! names and class names resolve through the cached LMDB hash mapper;
//! unresolved hashes render as `0x<hex8>`.

use super::path::{NodePath, Step};
use super::value::{bintype_tag, name32, name64};
use ritoshark::bin::{Bin, BinEntry, BinValue};
use ritoshark::hash::{fnv1a, HashMapper};
use serde::Serialize;

const H_VFX_SYSTEM: u32 = fnv1a("VfxSystemDefinitionData");
const H_COMPLEX_EMITTER: u32 = fnv1a("ComplexEmitterDefinitionData");
const H_SIMPLE_EMITTER: u32 = fnv1a("SimpleEmitterDefinitionData");
const H_EMITTER_NAME: u32 = fnv1a("emitterName");
const H_PARTICLE_NAME: u32 = fnv1a("particleName");

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeKind {
    Primitive,
    Vector,
    Struct,
    List,
    Option,
    Unsupported,
}

/// A leaf's serialized value. `F32` is separate from `Num` so serde_json
/// prints the shortest f32 representation (0.1, not 0.10000000149...).
#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum NodeValue {
    Bool(bool),
    F32(f32),
    Num(f64),
    Str(String),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorNode {
    /// Field name / `"0x..."`; `None` (serialized `null`) for list elements.
    pub key: Option<String>,
    pub kind: NodeKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_type: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<NodeValue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub num_type: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vec_type: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub class_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item_type: Option<&'static str>,
    pub path: NodePath,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<EditorNode>>,
}

impl EditorNode {
    fn new(key: Option<String>, kind: NodeKind, path: NodePath) -> EditorNode {
        EditorNode {
            key,
            kind,
            value_type: None,
            value: None,
            num_type: None,
            vec_type: None,
            class_name: None,
            item_type: None,
            path,
            children: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorEmitter {
    /// `${systemKey}__emitter_${idx}` (paint convention).
    pub key: String,
    pub name: String,
    /// Path to the emitter's embed/pointer node itself.
    pub path: NodePath,
    pub fields: Vec<EditorNode>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorSystem {
    /// Hex path_hash, e.g. `"1a2b3c4d"`.
    pub key: String,
    pub name: String,
    /// Which resident bin this system lives in (main at 0, linked bins follow).
    pub bin: usize,
    pub emitters: Vec<EditorEmitter>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorModel {
    pub systems: Vec<EditorSystem>,
}

/// Project one loaded bin's systems, each tagged with `bin_idx`, using the
/// cached hash mapper.
pub fn project_with(bin_idx: usize, bin: &Bin, m: &HashMapper) -> Vec<EditorSystem> {
    let mut systems = Vec::new();
    for (entry_idx, entry) in bin.entries.iter().enumerate() {
        if entry.class_hash == H_VFX_SYSTEM {
            systems.push(project_system(bin_idx, entry_idx, entry, m));
        }
    }
    systems
}

/// Project every resident bin into one model (main first). Each system carries
/// its `bin` index and every node path addresses the bin it came from.
pub fn project_all(bins: &[crate::linked_bins::LoadedBin]) -> EditorModel {
    let hashes = crate::bin::get_cached_bin_hashes().read();
    let mut systems = Vec::new();
    for (bin_idx, lb) in bins.iter().enumerate() {
        systems.extend(project_with(bin_idx, &lb.tree, &hashes));
    }
    EditorModel { systems }
}

/// Partial refresh: reproject only the given `(bin, entry)` systems — what an
/// undo/redo returns instead of a whole-model reprojection. Non-system entries
/// (and out-of-range indices) yield nothing.
pub fn project_entries_multi(
    bins: &[crate::linked_bins::LoadedBin],
    targets: &[(usize, usize)],
) -> Vec<EditorSystem> {
    let hashes = crate::bin::get_cached_bin_hashes().read();
    let mut out = Vec::new();
    for &(bin_idx, entry_idx) in targets {
        if let Some(lb) = bins.get(bin_idx) {
            if let Some(entry) = lb.tree.entries.get(entry_idx) {
                if entry.class_hash == H_VFX_SYSTEM {
                    out.push(project_system(bin_idx, entry_idx, entry, &hashes));
                }
            }
        }
    }
    out
}

fn project_system(
    bin_idx: usize,
    entry_idx: usize,
    entry: &BinEntry,
    m: &HashMapper,
) -> EditorSystem {
    let key = format!("{:08x}", entry.path_hash);
    let particle_name = match entry.fields.get(&H_PARTICLE_NAME) {
        Some(BinValue::String(s)) => Some(s.clone()),
        _ => None,
    };
    let name = particle_name.unwrap_or_else(|| short_name(&key));
    let base = NodePath::root(bin_idx, entry_idx);

    let mut emitters = Vec::new();
    for (&field_hash, field_val) in entry.fields.iter() {
        if field_hash != H_COMPLEX_EMITTER && field_hash != H_SIMPLE_EMITTER {
            continue;
        }
        let BinValue::List { items, .. } = field_val else {
            continue;
        };
        let list_path = base.child(Step::Field { field: field_hash });
        for (i, item) in items.iter().enumerate() {
            let fields = match item {
                BinValue::Embed { fields, .. } | BinValue::Pointer { fields, .. } => fields,
                _ => continue,
            };
            let emitter_path = list_path.child(Step::Index { index: i });
            let emitter_key = format!("{}__emitter_{}", key, emitters.len());
            let emitter_name = match fields.get(&H_EMITTER_NAME) {
                Some(BinValue::String(s)) => s.clone(),
                _ => "Unnamed".to_string(),
            };
            let field_nodes = fields
                .iter()
                .map(|(&fh, fv)| {
                    project_node(
                        Some(name32(fh, m)),
                        fv,
                        emitter_path.child(Step::Field { field: fh }),
                        m,
                    )
                })
                .collect();
            emitters.push(EditorEmitter {
                key: emitter_key,
                name: emitter_name,
                path: emitter_path,
                fields: field_nodes,
            });
        }
    }

    EditorSystem {
        key,
        name,
        bin: bin_idx,
        emitters,
    }
}

fn primitive(
    key: Option<String>,
    path: NodePath,
    value_type: &'static str,
    num_type: &'static str,
    value: NodeValue,
) -> EditorNode {
    let mut n = EditorNode::new(key, NodeKind::Primitive, path);
    n.value_type = Some(value_type);
    n.num_type = Some(num_type);
    n.value = Some(value);
    n
}

/// Components of a vector aren't individually addressable (a NodePath stops at
/// the BinValue), so each component child carries the vector's own path and the
/// frontend commits whole-vector edits.
fn vector(
    key: Option<String>,
    path: NodePath,
    vec_type: &'static str,
    num_type: &'static str,
    comps: &[f64],
) -> EditorNode {
    const NAMES_XYZW: [&str; 4] = ["x", "y", "z", "w"];
    const NAMES_RGBA: [&str; 4] = ["r", "g", "b", "a"];
    let names = if vec_type == "rgba" {
        NAMES_RGBA
    } else {
        NAMES_XYZW
    };
    let children = comps
        .iter()
        .enumerate()
        .map(|(i, c)| {
            let v = if num_type == "f32" {
                NodeValue::F32(*c as f32)
            } else {
                NodeValue::Num(*c)
            };
            primitive(
                Some(names[i].to_string()),
                path.clone(),
                "number",
                num_type,
                v,
            )
        })
        .collect();
    let mut n = EditorNode::new(key, NodeKind::Vector, path);
    n.vec_type = Some(vec_type);
    n.children = Some(children);
    n
}

fn project_node(key: Option<String>, v: &BinValue, path: NodePath, m: &HashMapper) -> EditorNode {
    match v {
        BinValue::None => {
            let mut n = EditorNode::new(key, NodeKind::Primitive, path);
            n.num_type = Some("none");
            n
        }
        BinValue::Bool(b) => primitive(key, path, "bool", "bool", NodeValue::Bool(*b)),
        BinValue::Flag(b) => primitive(key, path, "bool", "flag", NodeValue::Bool(*b)),
        BinValue::I8(n) => primitive(key, path, "number", "i8", NodeValue::Num(*n as f64)),
        BinValue::U8(n) => primitive(key, path, "number", "u8", NodeValue::Num(*n as f64)),
        BinValue::I16(n) => primitive(key, path, "number", "i16", NodeValue::Num(*n as f64)),
        BinValue::U16(n) => primitive(key, path, "number", "u16", NodeValue::Num(*n as f64)),
        BinValue::I32(n) => primitive(key, path, "number", "i32", NodeValue::Num(*n as f64)),
        BinValue::U32(n) => primitive(key, path, "number", "u32", NodeValue::Num(*n as f64)),
        // i64/u64 travel as strings (matching JsonBinValue) to dodge JS
        // precision loss; numType tells the FE which tag to send back.
        BinValue::I64(n) => primitive(key, path, "number", "i64", NodeValue::Str(n.to_string())),
        BinValue::U64(n) => primitive(key, path, "number", "u64", NodeValue::Str(n.to_string())),
        BinValue::F32(n) => primitive(key, path, "number", "f32", NodeValue::F32(*n)),
        BinValue::String(s) => primitive(key, path, "string", "string", NodeValue::Str(s.clone())),
        BinValue::Hash(h) => primitive(key, path, "hash", "hash", NodeValue::Str(name32(*h, m))),
        BinValue::File(h) => primitive(key, path, "string", "file", NodeValue::Str(name64(*h, m))),
        BinValue::Vec2(a) => vector(key, path, "vec2", "f32", &[a[0] as f64, a[1] as f64]),
        BinValue::Vec3(a) => vector(
            key,
            path,
            "vec3",
            "f32",
            &[a[0] as f64, a[1] as f64, a[2] as f64],
        ),
        BinValue::Vec4(a) => vector(
            key,
            path,
            "vec4",
            "f32",
            &[a[0] as f64, a[1] as f64, a[2] as f64, a[3] as f64],
        ),
        BinValue::Rgba(a) => vector(
            key,
            path,
            "rgba",
            "u8",
            &[a[0] as f64, a[1] as f64, a[2] as f64, a[3] as f64],
        ),
        BinValue::Pointer { class, fields } | BinValue::Embed { class, fields } => {
            let children = fields
                .iter()
                .map(|(&fh, fv)| {
                    project_node(
                        Some(name32(fh, m)),
                        fv,
                        path.child(Step::Field { field: fh }),
                        m,
                    )
                })
                .collect();
            let mut n = EditorNode::new(key, NodeKind::Struct, path);
            n.class_name = Some(name32(*class, m));
            n.num_type = Some(if matches!(v, BinValue::Pointer { .. }) {
                "pointer"
            } else {
                "embed"
            });
            n.children = Some(children);
            n
        }
        BinValue::List { item, items, .. } => {
            let children = items
                .iter()
                .enumerate()
                .map(|(i, it)| project_node(None, it, path.child(Step::Index { index: i }), m))
                .collect();
            let mut n = EditorNode::new(key, NodeKind::List, path);
            n.item_type = Some(bintype_tag(*item));
            n.children = Some(children);
            n
        }
        BinValue::Option { item, value } => {
            // An Option's inner value has no Step of its own; the child carries
            // the option's path and edits commit the whole option value.
            let children = value
                .as_ref()
                .map(|b| vec![project_node(None, b, path.clone(), m)]);
            let mut n = EditorNode::new(key, NodeKind::Option, path);
            n.item_type = Some(bintype_tag(*item));
            n.children = children;
            n
        }
        BinValue::Map { .. } => unsupported(key, path, "map"),
        BinValue::Mtx44(_) => unsupported(key, path, "mtx44"),
        BinValue::Link(_) => unsupported(key, path, "link"),
    }
}

fn unsupported(key: Option<String>, path: NodePath, desc: &'static str) -> EditorNode {
    let mut n = EditorNode::new(key, NodeKind::Unsupported, path);
    n.value = Some(NodeValue::Str(desc.to_string()));
    n
}

/// Trim a slash-delimited path to its last segment, capped at 40 chars.
/// Mirrors paint's system-name derivation.
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
pub(crate) mod tests {
    use super::*;
    use crate::linked_bins::{BinRole, LoadedBin, SourceFormat};
    use indexmap::IndexMap;
    use ritoshark::bin::BinType;

    /// Wrap trees as resident bins for path resolution in tests.
    pub(crate) fn loaded_bins(trees: Vec<Bin>) -> Vec<LoadedBin> {
        trees
            .into_iter()
            .map(|tree| LoadedBin {
                path: Default::default(),
                role: BinRole::Main,
                source_format: SourceFormat::Bin,
                tree,
                dirty: false,
                link_str: None,
                mtime: None,
            })
            .collect()
    }

    pub(crate) fn sample_bin() -> Bin {
        let h_color = fnv1a("color");
        let h_rate = fnv1a("rate");
        let h_values = fnv1a("values");

        let mut color_fields = IndexMap::new();
        color_fields.insert(
            h_values,
            BinValue::List {
                is_list2: false,
                item: BinType::Vec4,
                items: vec![BinValue::Vec4([1.0, 0.0, 0.0, 1.0])],
            },
        );

        let mut emitter_fields = IndexMap::new();
        emitter_fields.insert(H_EMITTER_NAME, BinValue::String("Sparkles".into()));
        emitter_fields.insert(h_rate, BinValue::F32(4.0));
        emitter_fields.insert(
            h_color,
            BinValue::Embed {
                class: 0xAABB,
                fields: color_fields,
            },
        );

        let mut system_fields = IndexMap::new();
        system_fields.insert(H_PARTICLE_NAME, BinValue::String("Yasuo_Q".into()));
        system_fields.insert(
            H_COMPLEX_EMITTER,
            BinValue::List {
                is_list2: false,
                item: BinType::Embed,
                items: vec![BinValue::Embed {
                    class: 0xCCDD,
                    fields: emitter_fields,
                }],
            },
        );

        Bin {
            entries: vec![BinEntry {
                path_hash: 0x1234_5678,
                class_hash: H_VFX_SYSTEM,
                fields: system_fields,
            }],
            ..Bin::new()
        }
    }

    #[test]
    fn projects_every_emitter_field_with_paths() {
        let mut bins = loaded_bins(vec![sample_bin()]);
        let model = project_all(&bins);

        assert_eq!(model.systems.len(), 1);
        let system = &model.systems[0];
        assert_eq!(system.key, "12345678");
        assert_eq!(system.name, "Yasuo_Q");
        assert_eq!(system.bin, 0);
        assert_eq!(system.emitters.len(), 1);

        let emitter = &system.emitters[0];
        assert_eq!(emitter.key, "12345678__emitter_0");
        assert_eq!(emitter.name, "Sparkles");
        assert_eq!(emitter.fields.len(), 3);

        // The f32 leaf resolves back to the live node through its path.
        let rate = emitter
            .fields
            .iter()
            .find(|f| matches!(f.num_type, Some("f32")))
            .expect("rate field");
        assert_eq!(rate.path.bin, 0);
        assert!(matches!(
            rate.path.resolve_mut(&mut bins),
            Some(BinValue::F32(_))
        ));

        // The embed's nested list keyframe carries a full path too.
        let color = emitter
            .fields
            .iter()
            .find(|f| f.kind == NodeKind::Struct)
            .expect("color");
        let list = &color.children.as_ref().unwrap()[0];
        assert_eq!(list.kind, NodeKind::List);
        let kf = &list.children.as_ref().unwrap()[0];
        assert_eq!(kf.kind, NodeKind::Vector);
        assert!(matches!(
            kf.path.resolve_mut(&mut bins),
            Some(BinValue::Vec4(_))
        ));
    }

    #[test]
    fn project_all_stamps_bin_index_on_paths_and_systems() {
        let bins = loaded_bins(vec![sample_bin(), sample_bin()]);
        let model = project_all(&bins);

        // One system per bin, each tagged with its bin index.
        assert_eq!(model.systems.len(), 2);
        assert_eq!(model.systems[0].bin, 0);
        assert_eq!(model.systems[1].bin, 1);

        // A leaf path in the second system addresses bin 1 and resolves there.
        let sys1 = &model.systems[1];
        let rate = sys1.emitters[0]
            .fields
            .iter()
            .find(|f| matches!(f.num_type, Some("f32")))
            .expect("rate");
        assert_eq!(rate.path.bin, 1);
        let mut bins_mut = loaded_bins(vec![sample_bin(), sample_bin()]);
        assert!(matches!(
            rate.path.resolve_mut(&mut bins_mut),
            Some(BinValue::F32(_))
        ));
    }
}
