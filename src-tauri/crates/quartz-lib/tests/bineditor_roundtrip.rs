//! Manual integration test for the Bin Editor V2 session against a real bin.
//!
//! Run with:
//!   QUARTZ_TEST_BIN="D:\path\to\skin0.bin" \
//!   cargo test -p quartz-lib --test bineditor_roundtrip -- --ignored --nocapture
//!
//! Verifies: parse/serialize idempotence, leaf edit + projection, undo/redo/
//! restore byte-exactness, insert/remove structural round-trip, and that every
//! saved artifact re-parses (no corruption).

use quartz_lib::bin::{read_bin, write_bin};
use quartz_lib::bineditor::project::{NodeKind, NodeValue};
use quartz_lib::bineditor::{session, EditOp, EditorModel, EditorNode, JsonBinValue, NodePath};

fn first_f32_leaf(nodes: &[EditorNode]) -> Option<(&EditorNode, f32)> {
    for n in nodes {
        if matches!(n.kind, NodeKind::Primitive) && n.num_type == Some("f32") {
            if let Some(NodeValue::F32(v)) = n.value {
                return Some((n, v));
            }
        }
        if let Some(children) = &n.children {
            if let Some(hit) = first_f32_leaf(children) {
                return Some(hit);
            }
        }
    }
    None
}

fn locate_first_f32(model: &EditorModel) -> Option<(NodePath, f32, String)> {
    for sys in &model.systems {
        for em in &sys.emitters {
            if let Some((node, v)) = first_f32_leaf(&em.fields) {
                return Some((node.path.clone(), v, em.key.clone()));
            }
        }
    }
    None
}

fn value_at<'a>(nodes: &'a [EditorNode], path_json: &str) -> Option<&'a EditorNode> {
    for n in nodes {
        if serde_json::to_string(&n.path).unwrap() == path_json {
            return Some(n);
        }
        if let Some(children) = &n.children {
            if let Some(hit) = value_at(children, path_json) {
                return Some(hit);
            }
        }
    }
    None
}

fn find_node<'a>(model: &'a EditorModel, path: &NodePath) -> Option<&'a EditorNode> {
    let pj = serde_json::to_string(path).unwrap();
    model
        .systems
        .iter()
        .flat_map(|s| &s.emitters)
        .find_map(|e| value_at(&e.fields, &pj))
}

#[test]
#[ignore = "manual; set QUARTZ_TEST_BIN to a real skin bin"]
fn bineditor_roundtrip() {
    let Ok(bin_path) = std::env::var("QUARTZ_TEST_BIN") else {
        eprintln!("[be2] QUARTZ_TEST_BIN not set; skipping");
        return;
    };

    let tmp = std::env::temp_dir().join("quartz_be2_roundtrip");
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp).unwrap();
    let t = |name: &str| tmp.join(name);

    // 1) Parse + serialize idempotence.
    let original = std::fs::read(&bin_path).expect("read source bin");
    let tree = read_bin(&original).expect("parse source bin");
    let w1 = write_bin(&tree).expect("serialize");
    let tree2 = read_bin(&w1).expect("re-parse serialized bytes");
    let w2 = write_bin(&tree2).expect("re-serialize");
    assert_eq!(w1, w2, "serialize->parse->serialize must be byte-stable");
    eprintln!(
        "[be2] idempotence OK ({} bytes; byte-identical to original: {})",
        w1.len(),
        w1 == original
    );

    // 2) Session open + baseline save.
    let opened = session::open(&bin_path).expect("session open");
    let id = opened.session_id;
    let n_systems = opened.model.systems.len();
    let n_emitters: usize = opened.model.systems.iter().map(|s| s.emitters.len()).sum();
    eprintln!("[be2] opened: {n_systems} systems, {n_emitters} emitters");
    assert!(
        n_systems > 0 && n_emitters > 0,
        "expected VFX content in the test bin"
    );

    session::save(id, Some(t("base.bin")), true).expect("save baseline");
    let b0 = std::fs::read(t("base.bin")).unwrap();
    read_bin(&b0).expect("baseline save re-parses");

    // 3) Leaf edit.
    let (path, old_v, em_key) = locate_first_f32(&opened.model).expect("an f32 leaf to edit");
    eprintln!("[be2] editing f32 leaf in {em_key}: {old_v} -> 1234.5");
    let changed = session::apply(
        id,
        &[EditOp {
            path: path.clone(),
            value: JsonBinValue::F32 { v: 1234.5 },
        }],
    )
    .expect("apply");
    assert_eq!(changed, 1);

    let m = session::model_of(id).expect("model_of");
    let node = find_node(&m, &path).expect("edited node still projectable");
    assert!(matches!(node.value, Some(NodeValue::F32(v)) if (v - 1234.5).abs() < 1e-3));

    session::save(id, Some(t("mut.bin")), true).expect("save mutated");
    let b1 = std::fs::read(t("mut.bin")).unwrap();
    read_bin(&b1).expect("mutated save re-parses");
    assert_ne!(b0, b1, "mutation must change the serialized bytes");

    // 4) Undo restores byte-exact baseline. Leaf edits come back as partial
    //    outcomes carrying only the touched systems.
    let outcome = session::undo(id).expect("undo").expect("undo had a frame");
    match &outcome {
        session::UndoOutcome::Partial { entries, systems } => {
            assert!(
                !entries.is_empty() && !systems.is_empty(),
                "partial undo should carry the touched system"
            );
        }
        session::UndoOutcome::Full(_) => panic!("leaf-edit undo should be partial"),
    }
    let m = session::model_of(id).expect("model after undo");
    let node = find_node(&m, &path).expect("node after undo");
    assert!(matches!(node.value, Some(NodeValue::F32(v)) if (v - old_v).abs() < 1e-3));
    session::save(id, Some(t("undo.bin")), true).unwrap();
    assert_eq!(
        std::fs::read(t("undo.bin")).unwrap(),
        b0,
        "undo must be byte-exact"
    );

    // 5) Redo re-applies byte-exact.
    session::redo(id).expect("redo").expect("redo had a frame");
    let m = session::model_of(id).expect("model after redo");
    let node = find_node(&m, &path).expect("node after redo");
    assert!(matches!(node.value, Some(NodeValue::F32(v)) if (v - 1234.5).abs() < 1e-3));
    session::save(id, Some(t("redo.bin")), true).unwrap();
    assert_eq!(
        std::fs::read(t("redo.bin")).unwrap(),
        b1,
        "redo must be byte-exact"
    );

    // 6) Restore returns to the initially-loaded tree.
    session::restore(id).expect("restore");
    session::save(id, Some(t("restore.bin")), true).unwrap();
    assert_eq!(
        std::fs::read(t("restore.bin")).unwrap(),
        b0,
        "restore must be byte-exact"
    );

    // 7) Insert a new f32 field on the first emitter, then remove it.
    let em = &session::model_of(id).unwrap().systems[0].emitters[0];
    let before: Vec<Option<String>> = em.fields.iter().map(|f| f.key.clone()).collect();
    let parent = em.path.clone();
    let m = session::insert(
        id,
        &parent,
        Some("quartzV2TestField"),
        None,
        &JsonBinValue::F32 { v: 42.0 },
    )
    .expect("insert field");
    let em2 = &m.systems[0].emitters[0];
    assert_eq!(
        em2.fields.len(),
        before.len() + 1,
        "insert must add exactly one field"
    );
    let new_node = em2
        .fields
        .iter()
        .find(|f| !before.contains(&f.key))
        .expect("new field present in projection");
    assert!(matches!(new_node.value, Some(NodeValue::F32(v)) if (v - 42.0).abs() < 1e-3));
    session::save(id, Some(t("insert.bin")), true).unwrap();
    read_bin(&std::fs::read(t("insert.bin")).unwrap()).expect("insert save re-parses");

    let m = session::remove(id, &new_node.path.clone()).expect("remove field");
    assert_eq!(m.systems[0].emitters[0].fields.len(), before.len());
    session::save(id, Some(t("removed.bin")), true).unwrap();
    assert_eq!(
        std::fs::read(t("removed.bin")).unwrap(),
        b0,
        "insert+remove must round-trip byte-exact"
    );

    assert!(session::close(id));
    eprintln!(
        "[be2] ALL CHECKS PASSED — no corruption across edit/undo/redo/restore/insert/remove"
    );
}
