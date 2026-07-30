/* Skeleton auto-detection and mask/joint pairing for the animation mask editor.
 *
 * A mask's weights are stored in the bin as a bare `list[f32]` — 162 floats for
 * Yone skin74 — with NO joint names anywhere in the file. The grid needs a label
 * per row, and the ONLY source of those labels is the `.skl` skeleton. The bin
 * tells us which one:
 *
 *   SkinCharacterDataProperties entry
 *     |- skinMeshProperties: embed SkinMeshDataProperties {
 *     |      skeleton:   "ASSETS/Characters/Yone/Skins/Skin74/Yone_Skin74.skl"
 *     |      simpleSkin: "ASSETS/Characters/Yone/Skins/Skin74/Yone_Skin74.skn"
 *     |  }
 *     `- skinAnimationProperties: embed { animationGraphData: link -> graph }
 *
 * WHY WE PAIR THROUGH THE SCDP, and not by "find a skeleton in this bin":
 * a champion's combined data bin holds one SCDP per skin, each with its OWN
 * `.skl`. Grabbing the first skeleton string you happen to find gives base's
 * skeleton while editing skin74's masks — silently wrong joint names on a
 * different joint count. Both embeds hang off the SAME SCDP entry, so walking
 * graph-hash -> owning SCDP -> skinMeshProperties.skeleton is what guarantees
 * the skeleton is the one those masks actually apply to. Do not "simplify" this
 * into a file-wide scan.
 *
 * The bin reference is uppercase `ASSETS/...`; the on-disk path is lowercase.
 * Resolution goes through `skin_preview::resolve_asset_path`, which is already
 * case-insensitive against the project root.
 *
 * PAIRING CONTRACT (`pair_weights`): purely POSITIONAL. Row `i` is
 * `joints[i].name` with `weights[i]`. No name lookup, no hash lookup — the
 * engine indexes mask weights by joint id and `joints[i].id == i`. When the
 * lengths disagree we still emit a row per joint (missing weights read 0.0) but
 * ALSO return a warning: LtMAO silently shows 0.0 and truncates on save, which
 * corrupts the mask. We surface the mismatch instead of eating it.
 */

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use ritoshark::bin::{Bin, BinEntry, BinValue};
use ritoshark::hash::fnv1a;
use serde::Serialize;

use crate::skeleton::JointInfo;
use crate::skin_preview::resolve_asset_path;

/// The `.skl` (and companion `.skn`) a set of masks applies to, discovered from
/// the SkinCharacterDataProperties that owns the animation graph.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkeletonLink {
    /// The raw `ASSETS/...` string exactly as authored in the bin.
    pub skl_ref: String,
    /// Resolved on-disk path, `None` when the project doesn't ship the file.
    pub skl_path: Option<PathBuf>,
    pub skn_ref: Option<String>,
}

/// One row of the mask grid: a joint and this mask's weight for it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaskRow {
    pub index: usize,
    pub joint_name: String,
    pub weight: f32,
}

fn fields(value: &BinValue) -> Option<&indexmap::IndexMap<u32, BinValue>> {
    match value {
        BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => Some(fields),
        _ => None,
    }
}

fn as_string(value: Option<&BinValue>) -> Option<String> {
    match value {
        Some(BinValue::String(s)) if !s.is_empty() => Some(s.clone()),
        _ => None,
    }
}

/// Mirrors `anim_graph::link_hash`: a link may be stored as a link/hash tag or
/// as the still-unhashed path string.
fn link_hash(value: Option<&BinValue>) -> Option<u32> {
    match value? {
        BinValue::Link(h) | BinValue::Hash(h) => Some(*h),
        BinValue::String(s) => Some(fnv1a(s)),
        _ => None,
    }
}

/// The graph this SCDP links, if any.
fn graph_of(entry: &BinEntry) -> Option<u32> {
    let sap = entry.fields.get(&fnv1a("skinAnimationProperties"))?;
    link_hash(fields(sap)?.get(&fnv1a("animationGraphData")))
}

/// The skeleton + simple-skin refs on this SCDP's `skinMeshProperties`.
fn mesh_refs(entry: &BinEntry) -> Option<(String, Option<String>)> {
    let mesh = fields(entry.fields.get(&fnv1a("skinMeshProperties"))?)?;
    let skl = as_string(mesh.get(&fnv1a("skeleton")))?;
    let skn = as_string(mesh.get(&fnv1a("simpleSkin")));
    Some((skl, skn))
}

/* Find the `.skl` referenced by the SCDP that owns `graph_path_hash`'s animation
graph. This is the INVERSE of `anim_graph::find_graph_entry_for`: that walks
SCDP -> graph, we walk graph -> SCDP -> skeleton.

`project_root` anchors the `ASSETS/...` ref onto disk; when the file isn't there
`skl_path` is `None` and `skl_ref` is still reported so the UI can say WHICH
skeleton it wanted. Returns `None` only when no SCDP links that graph or the
owning SCDP carries no skeleton string. */
pub fn skeleton_for_graph(
    bins: &[Bin],
    project_root: &Path,
    graph_path_hash: u32,
) -> Option<SkeletonLink> {
    let scdp_class = fnv1a("SkinCharacterDataProperties");
    // Merge by path-hash, first wins — same convention as `resolve_clip_graph`.
    let mut merged: HashMap<u32, &BinEntry> = HashMap::new();
    for bin in bins {
        for entry in &bin.entries {
            merged.entry(entry.path_hash).or_insert(entry);
        }
    }

    let owner = merged.values().find(|entry| {
        entry.class_hash == scdp_class && graph_of(entry) == Some(graph_path_hash)
    })?;
    let (skl_ref, skn_ref) = mesh_refs(owner)?;

    let candidate = resolve_asset_path(project_root, &skl_ref);
    let skl_path = candidate.is_file().then_some(candidate);

    Some(SkeletonLink {
        skl_ref,
        skl_path,
        skn_ref,
    })
}

/* Pair a mask's weight list against a skeleton POSITIONALLY.

Always yields exactly `joints.len()` rows, so the grid never depends on the
weight list being well-formed. A short list pads with 0.0, a long list drops the
tail — and either way the returned `Some(warning)` describes the mismatch so the
caller can refuse to save rather than silently corrupt the mask. Never panics on
a short, long, or empty list. */
pub fn pair_weights(joints: &[JointInfo], weights: &[f32]) -> (Vec<MaskRow>, Option<String>) {
    let rows = joints
        .iter()
        .enumerate()
        .map(|(index, joint)| MaskRow {
            index,
            joint_name: joint.name.clone(),
            weight: weights.get(index).copied().unwrap_or(0.0),
        })
        .collect();

    let warning = (weights.len() != joints.len()).then(|| {
        format!(
            "Mask has {} weight{} but the skeleton has {} joint{}. \
             {} — saving without fixing this would corrupt the mask.",
            weights.len(),
            if weights.len() == 1 { "" } else { "s" },
            joints.len(),
            if joints.len() == 1 { "" } else { "s" },
            if weights.len() < joints.len() {
                format!(
                    "Joints {}..{} show 0.0 because the mask has no weight for them",
                    weights.len(),
                    joints.len().saturating_sub(1)
                )
            } else {
                format!(
                    "{} trailing weight(s) have no joint and are not shown",
                    weights.len() - joints.len()
                )
            }
        )
    });

    (rows, warning)
}

#[cfg(test)]
mod tests {
    use super::*;
    use indexmap::IndexMap;

    fn joint(id: i16, name: &str) -> JointInfo {
        JointInfo {
            id,
            name: name.to_string(),
            parent_id: -1,
            hash: fnv1a(name),
            local_translation: [0.0; 3],
            local_scale: [1.0; 3],
            local_rotation: [0.0, 0.0, 0.0, 1.0],
            inverse_bind_translation: [0.0; 3],
            inverse_bind_scale: [1.0; 3],
            inverse_bind_rotation: [0.0, 0.0, 0.0, 1.0],
        }
    }

    fn three_joints() -> Vec<JointInfo> {
        vec![joint(0, "Root"), joint(1, "Spine"), joint(2, "Head")]
    }

    fn embed(class: &str, pairs: Vec<(&str, BinValue)>) -> BinValue {
        let mut fields = IndexMap::new();
        for (key, value) in pairs {
            fields.insert(fnv1a(key), value);
        }
        BinValue::Embed {
            class: fnv1a(class),
            fields,
        }
    }

    /// A SCDP carrying BOTH embeds, exactly as the yone_skin74 bin does.
    fn scdp_bin(skl: &str, graph: &str) -> Bin {
        let mut fields = IndexMap::new();
        fields.insert(
            fnv1a("skinMeshProperties"),
            embed(
                "SkinMeshDataProperties",
                vec![
                    ("skeleton", BinValue::String(skl.to_string())),
                    (
                        "simpleSkin",
                        BinValue::String(skl.replace(".skl", ".skn")),
                    ),
                ],
            ),
        );
        fields.insert(
            fnv1a("skinAnimationProperties"),
            embed(
                "SkinAnimationProperties",
                vec![("animationGraphData", BinValue::Link(fnv1a(graph)))],
            ),
        );
        let mut bin = Bin::new();
        bin.entries.push(BinEntry {
            path_hash: fnv1a("Characters/Yone/Skins/Skin74"),
            class_hash: fnv1a("SkinCharacterDataProperties"),
            fields,
        });
        bin
    }

    #[test]
    fn finds_skeleton_ref_from_scdp() {
        let skl = "ASSETS/Characters/Yone/Skins/Skin74/Yone_Skin74.skl";
        let graph = "Characters/Yone/Animations/Skin74";
        let bins = vec![scdp_bin(skl, graph)];

        let link = skeleton_for_graph(&bins, Path::new("C:/nope"), fnv1a(graph))
            .expect("graph link should resolve back to its owning SCDP");
        assert_eq!(link.skl_ref, skl);
        assert_eq!(
            link.skn_ref.as_deref(),
            Some("ASSETS/Characters/Yone/Skins/Skin74/Yone_Skin74.skn")
        );

        // A different graph must NOT pick up this skin's skeleton.
        assert!(skeleton_for_graph(&bins, Path::new("C:/nope"), fnv1a("Characters/Yone/Animations/Skin1")).is_none());
    }

    #[test]
    fn pairs_weights_positionally() {
        let (rows, warning) = pair_weights(&three_joints(), &[1.0, 0.5, 0.0]);
        assert!(warning.is_none());
        assert_eq!(
            rows,
            vec![
                MaskRow { index: 0, joint_name: "Root".into(), weight: 1.0 },
                MaskRow { index: 1, joint_name: "Spine".into(), weight: 0.5 },
                MaskRow { index: 2, joint_name: "Head".into(), weight: 0.0 },
            ]
        );
    }

    #[test]
    fn short_weight_list_pads_and_warns() {
        let (rows, warning) = pair_weights(&three_joints(), &[1.0, 0.25]);
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[2].joint_name, "Head");
        assert_eq!(rows[2].weight, 0.0);
        let warning = warning.expect("a short weight list must warn, not silently pad");
        assert!(warning.contains('2') && warning.contains('3'), "{warning}");
    }

    #[test]
    fn long_weight_list_warns() {
        let (rows, warning) = pair_weights(&three_joints(), &[1.0, 1.0, 1.0, 1.0, 1.0]);
        assert_eq!(rows.len(), 3);
        let warning = warning.expect("a long weight list must warn before it gets truncated");
        assert!(warning.contains('5'), "{warning}");
    }

    #[test]
    fn empty_weight_list_is_all_zero_with_warning() {
        let (rows, warning) = pair_weights(&three_joints(), &[]);
        assert_eq!(rows.len(), 3);
        assert!(rows.iter().all(|r| r.weight == 0.0));
        assert!(warning.is_some());

        // And the fully degenerate case: no joints, no weights, no panic.
        let (rows, warning) = pair_weights(&[], &[]);
        assert!(rows.is_empty());
        assert!(warning.is_none());
    }

    #[test]
    fn missing_skl_on_disk_yields_none_path() {
        let skl = "ASSETS/Characters/Yone/Skins/Skin74/Yone_Skin74.skl";
        let graph = "Characters/Yone/Animations/Skin74";
        let bins = vec![scdp_bin(skl, graph)];
        let root = std::env::temp_dir().join(format!("quartz_skl_link_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();

        let link = skeleton_for_graph(&bins, &root, fnv1a(graph)).unwrap();
        assert_eq!(link.skl_ref, skl);
        assert!(link.skl_path.is_none(), "nothing on disk -> no path");

        let _ = std::fs::remove_dir_all(&root);
    }
}
