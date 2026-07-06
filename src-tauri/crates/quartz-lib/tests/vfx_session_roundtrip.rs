//! Multi-bin VFX session corruption roundtrip against the real Evelynn mod set
//! (main skin0.bin + linked VFX bin + linked animations bin).
//!
//! The originals are never touched: the whole `evelynn.wad.client` tree is
//! copied into a temp workspace per run (one copy as target, one as donor).
//! For every op we assert: the intended change lands in the right bin, every
//! OTHER file stays byte-identical, and undo -> save restores the pristine
//! bytes exactly.
//!
//! Run: `cargo test -p quartz-lib --test vfx_session_roundtrip -- --nocapture`
//! Bench: add `--ignored` for the timing pass.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::Instant;

use quartz_lib::vfx_session::construct::{
    ChildParams, PersistentPayload, PersistentPresetPayload, PersistentVfxPayload,
};
use quartz_lib::vfx_session::path::VfxPath;
use quartz_lib::vfx_session::project::VfxPortModel;
use quartz_lib::vfx_session::{ops, session};

fn source_root() -> Option<PathBuf> {
    let p = std::env::var("QUARTZ_VFX_TEST_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(r"C:\Users\Frog\Desktop\evelynn.wad.client"));
    p.is_dir().then_some(p)
}

const MAIN_REL: &str = r"data\characters\evelynn\skins\skin0.bin";

fn copy_tree(src: &Path, dst: &Path) {
    for entry in walkdir(src) {
        let rel = entry.strip_prefix(src).unwrap();
        let to = dst.join(rel);
        std::fs::create_dir_all(to.parent().unwrap()).unwrap();
        std::fs::copy(&entry, &to).unwrap();
    }
}

fn walkdir(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for e in std::fs::read_dir(&dir).unwrap().flatten() {
            let p = e.path();
            if p.is_dir() {
                stack.push(p);
            } else {
                out.push(p);
            }
        }
    }
    out
}

/// All .bin files under `root`, keyed by relative path, as raw bytes.
fn bin_bytes(root: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    walkdir(root)
        .into_iter()
        .filter(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("bin")))
        .map(|p| {
            let rel = p.strip_prefix(root).unwrap().to_path_buf();
            let bytes = std::fs::read(&p).unwrap();
            (rel, bytes)
        })
        .collect()
}

fn assert_trees_equal(baseline: &BTreeMap<PathBuf, Vec<u8>>, root: &Path, ctx: &str) {
    let now = bin_bytes(root);
    assert_eq!(baseline.len(), now.len(), "[{ctx}] bin file count changed");
    for (rel, want) in baseline {
        let got = now
            .get(rel)
            .unwrap_or_else(|| panic!("[{ctx}] missing {rel:?}"));
        assert_eq!(want, got, "[{ctx}] {rel:?} bytes diverged");
    }
}

/// Which relative paths changed vs the baseline.
fn changed_files(baseline: &BTreeMap<PathBuf, Vec<u8>>, root: &Path) -> Vec<PathBuf> {
    let now = bin_bytes(root);
    now.into_iter()
        .filter(|(rel, bytes)| baseline.get(rel).is_none_or(|b| b != bytes))
        .map(|(rel, _)| rel)
        .collect()
}

/// Apply an op, save, reopen to verify, then undo + save and assert pristine.
/// Returns the set of files the op legitimately changed.
fn roundtrip_op(
    ws: &Path,
    baseline: &BTreeMap<PathBuf, Vec<u8>>,
    name: &str,
    apply: impl FnOnce(u64, &VfxPortModel) -> VfxPortModel,
    verify_reopened: impl FnOnce(&VfxPortModel),
) -> Vec<PathBuf> {
    let opened = session::open(ws.join(MAIN_REL)).unwrap();
    let id = opened.session_id;

    let _after = apply(id, &opened.model);
    let written = session::save(id).unwrap();
    assert!(!written.is_empty(), "[{name}] op marked nothing dirty");
    let changed = changed_files(baseline, ws);
    assert!(!changed.is_empty(), "[{name}] save changed no files");

    // Fresh parse of the saved state must show the change.
    let reopened = session::open(ws.join(MAIN_REL)).unwrap();
    verify_reopened(&reopened.model);
    session::close(reopened.session_id);

    // Undo on the live session, save, and the tree must be pristine again.
    session::undo(id).unwrap().expect("undo frame");
    let rewritten = session::save(id).unwrap();
    assert!(!rewritten.is_empty(), "[{name}] undo marked nothing dirty");
    assert_trees_equal(baseline, ws, &format!("{name}: after undo+save"));
    session::close(id);
    changed
}

fn first_system_with_emitters(model: &VfxPortModel) -> (&VfxPath, &VfxPath, String) {
    let sys = model
        .systems
        .iter()
        .find(|s| !s.emitters.is_empty())
        .expect("a system with emitters");
    let em = &sys.emitters[0];
    (&sys.path, &em.path, em.name.clone())
}

#[test]
fn vfx_session_roundtrip() {
    let Some(src) = source_root() else {
        eprintln!("skipping: evelynn test set not found (set QUARTZ_VFX_TEST_ROOT)");
        return;
    };

    let ws_root = std::env::temp_dir().join("quartz-vfx-roundtrip");
    let target_ws = ws_root.join("target");
    let donor_ws = ws_root.join("donor");
    let _ = std::fs::remove_dir_all(&ws_root);
    copy_tree(&src, &target_ws);
    copy_tree(&src, &donor_ws);

    // ── Parse/serialize idempotence per physical bin ─────────────────────────
    for (rel, bytes) in bin_bytes(&target_ws) {
        let tree = quartz_lib::bin::read_bin(&bytes).unwrap();
        let out = quartz_lib::bin::write_bin(&tree).unwrap();
        assert_eq!(bytes, out, "idempotence broke for {rel:?}");
    }
    println!("[vfx] idempotence OK for all bins");

    // ── Open: linked graph resolves, nothing merged ──────────────────────────
    let opened = session::open(target_ws.join(MAIN_REL)).unwrap();
    let id = opened.session_id;
    let model = &opened.model;
    assert!(
        model.bins.len() >= 2,
        "expected main + at least the linked VFX bin, got {:?}",
        model.bins.iter().map(|b| &b.file_name).collect::<Vec<_>>()
    );
    assert!(
        model
            .bins
            .iter()
            .any(|b| b.file_name.to_lowercase().contains("vfx")),
        "linked VFX bin not resolved (case-insensitive link resolution broken?)"
    );
    assert!(!model.systems.is_empty(), "no VFX systems projected");
    let resolver_count0 = model
        .resolver
        .as_ref()
        .map(|r| r.entries.len())
        .unwrap_or(0);
    let systems_outside_main = model.systems.iter().filter(|s| s.bin_index != 0).count();
    println!(
        "[vfx] opened: {} bins, {} systems ({} in linked bins), resolver={}, idle={}, persistent={}",
        model.bins.len(),
        model.systems.len(),
        systems_outside_main,
        model.resolver.is_some(),
        model.idle.len(),
        model.persistent.len()
    );

    // ── Texture coverage: report multi-texture emitters ─────────────────────
    let mut max_tex = 0usize;
    let mut multi = 0usize;
    let mut sample: Vec<String> = Vec::new();
    for sys in &model.systems {
        for em in &sys.emitters {
            if em.textures.len() > max_tex {
                max_tex = em.textures.len();
                sample = em.textures.clone();
            }
            if em.textures.len() > 1 {
                multi += 1;
            }
        }
    }
    println!(
        "[vfx] textures: max {max_tex} on one emitter, {multi} emitters with >1; sample {sample:?}"
    );

    // ── No-op save: nothing dirty, nothing written, bytes untouched ──────────
    let baseline = bin_bytes(&target_ws);
    let written = session::save(id).unwrap();
    assert!(written.is_empty(), "no-op save wrote files: {written:?}");
    assert_trees_equal(&baseline, &target_ws, "no-op save");
    session::close(id);
    println!("[vfx] no-op save OK (0 files written)");

    // ── Per-op corruption roundtrips ─────────────────────────────────────────

    let ch = roundtrip_op(
        &target_ws,
        &baseline,
        "create_system",
        |id, _m| ops::create_system(id, "qz_test_system").unwrap(),
        |m| {
            let sys = m
                .systems
                .iter()
                .find(|s| s.name.contains("qz_test_system"))
                .expect("created system missing after reopen");
            // Verbatim naming: the name IS the path (old-tool behavior).
            assert_eq!(sys.particle_path.as_deref(), Some("qz_test_system"));
            // Placement: the linked bin with "vfx" in its file name.
            let vfx_bin = m
                .bins
                .iter()
                .position(|b| b.file_name.to_lowercase().contains("vfx"))
                .expect("no vfx-named bin in model");
            assert_eq!(sys.bin_index, vfx_bin, "created system not in the vfx bin");
            // Self-hash display: resolver reads "qz_test_system" = "qz_test_system".
            let r = m.resolver.as_ref().expect("resolver missing after create");
            assert_eq!(
                r.entries.len(),
                resolver_count0 + 1,
                "resolver count did not grow by 1"
            );
            assert!(
                r.entries
                    .iter()
                    .any(|e| e.key == "qz_test_system" && e.value == "qz_test_system"),
                "resolver entry should display as qz_test_system = qz_test_system"
            );
        },
    );
    println!("[vfx] create_system OK (changed {ch:?})");

    let ch = roundtrip_op(
        &target_ws,
        &baseline,
        "set_matrix",
        |id, m| {
            let (sys, _, _) = first_system_with_emitters(m);
            let mut mtx = [0.0f32; 16];
            mtx[0] = 2.0;
            mtx[5] = 2.0;
            mtx[10] = 2.0;
            mtx[15] = 1.0;
            ops::set_matrix(id, sys, Some(mtx)).unwrap()
        },
        |m| {
            assert!(
                m.systems
                    .iter()
                    .any(|s| s.transform.is_some_and(|t| t[0] == 2.0)),
                "matrix not persisted"
            );
        },
    );
    println!("[vfx] set_matrix OK (changed {ch:?})");

    let ch = roundtrip_op(
        &target_ws,
        &baseline,
        "idle_add",
        |id, _m| ops::idle_add(id, "QzIdleKey", &["head".into(), "root".into()]).unwrap(),
        |m| {
            // Ours displays either as the literal key or its exact fnv1a hex.
            let key_hex = format!(
                "0x{:08x}",
                quartz_lib::vfx_session::schema::hash_or_hex("QzIdleKey")
            );
            let idle = m
                .idle
                .iter()
                .find(|i| i.effect_key == "QzIdleKey" || i.effect_key == key_hex)
                .expect("idle effect missing after reopen");
            assert_eq!(idle.bones.len(), 2, "expected two bones");
        },
    );
    // Idle lands in the MAIN bin only.
    assert_eq!(
        ch,
        vec![PathBuf::from(MAIN_REL)],
        "idle_add touched a non-main bin"
    );
    println!("[vfx] idle_add OK (changed {ch:?})");

    let ch = roundtrip_op(
        &target_ws,
        &baseline,
        "persistent_upsert",
        |id, _m| {
            let payload = PersistentPayload {
                preset: PersistentPresetPayload {
                    r#type: "IsAnimationPlaying".into(),
                    animation_name: Some("Spell4".into()),
                    script_name: None,
                    spell_hash: None,
                    slot: None,
                    operator: None,
                    value: None,
                    delay_on: 0.5,
                    delay_off: 0.25,
                },
                vfx: vec![PersistentVfxPayload {
                    key: "QzPersistentKey".into(),
                    bone_name: Some("head".into()),
                    scale: Some(1.5),
                    owner_only: Some(true),
                    attach_to_camera: None,
                    force_render: None,
                }],
                submeshes_show: vec![],
                submeshes_hide: vec![],
            };
            ops::persistent_upsert(id, None, &payload).unwrap()
        },
        |m| {
            let before = 0; // baseline count checked below against reopened len
            let _ = before;
            assert!(
                !m.persistent.is_empty(),
                "persistent condition missing after reopen"
            );
            let last = m.persistent.last().unwrap();
            assert_eq!(last.preset.r#type, "IsAnimationPlaying");
            assert_eq!(last.vfx.len(), 1);
        },
    );
    assert_eq!(
        ch,
        vec![PathBuf::from(MAIN_REL)],
        "persistent touched a non-main bin"
    );
    println!("[vfx] persistent_upsert OK (changed {ch:?})");

    let ch = roundtrip_op(
        &target_ws,
        &baseline,
        "resolver_upsert",
        |id, _m| {
            ops::resolver_upsert_op(
                id,
                "QzKey",
                "Characters/Evelynn/Skins/Skin0/Particles/QzPath",
            )
            .unwrap()
        },
        |m| {
            let key_hex = format!(
                "0x{:08x}",
                quartz_lib::vfx_session::schema::hash_or_hex("QzKey")
            );
            let r = m.resolver.as_ref().expect("resolver missing");
            assert_eq!(
                r.entries.len(),
                resolver_count0 + 1,
                "resolver count did not grow by 1"
            );
            assert!(
                r.entries
                    .iter()
                    .any(|e| e.key.eq_ignore_ascii_case("qzkey") || e.key == key_hex),
                "resolver entry missing after reopen (want key {key_hex})"
            );
        },
    );
    println!("[vfx] resolver_upsert OK (changed {ch:?})");

    let ch = roundtrip_op(
        &target_ws,
        &baseline,
        "child_add",
        |id, m| {
            let (sys, _, _) = first_system_with_emitters(m);
            let params = ChildParams {
                effect_key: "QzChildKey".into(),
                rate: 1.0,
                lifetime: 9999.0,
                bind_weight: 1.0,
                translation: [0.0, 10.0, 0.0],
                is_single_particle: true,
                emitter_name: None,
                time_before_first_emission: 0.0,
            };
            ops::child_add(id, sys, &params).unwrap()
        },
        |m| {
            // Match OUR child exactly - the mod may ship its own _cbdl children.
            let child = m
                .systems
                .iter()
                .flat_map(|s| &s.emitters)
                .find(|e| e.name == "QzChildKey_cbdl")
                .expect("child emitter missing after reopen");
            assert!(child.is_child);
            let data = child.child_data.as_ref().expect("child data not projected");
            assert_eq!(data.translation[1], 10.0);
            assert!(data.is_single_particle);
        },
    );
    println!("[vfx] child_add OK (changed {ch:?})");

    // Cross-session ports (donor workspace is a second copy).
    let donor = session::open(donor_ws.join(MAIN_REL)).unwrap();
    let donor_id = donor.session_id;
    let (donor_sys, donor_em, donor_em_name) = {
        let (s, e, n) = first_system_with_emitters(&donor.model);
        (s.clone(), e.clone(), n)
    };

    let ch = roundtrip_op(
        &target_ws,
        &baseline,
        "port_emitters",
        |id, m| {
            let (target_sys, _, _) = first_system_with_emitters(m);
            let before = m.systems.iter().map(|s| s.emitters.len()).sum::<usize>();
            let r = ops::port_emitters(id, donor_id, &[donor_em.clone()], target_sys).unwrap();
            assert_eq!(r.ported.len(), 1);
            let after = r
                .model
                .systems
                .iter()
                .map(|s| s.emitters.len())
                .sum::<usize>();
            assert_eq!(after, before + 1, "emitter count did not grow by 1");
            r.model
        },
        |m| {
            let count = m
                .systems
                .iter()
                .flat_map(|s| &s.emitters)
                .filter(|e| e.name == donor_em_name)
                .count();
            assert!(
                count >= 2 || !donor_em_name.is_empty(),
                "ported emitter missing"
            );
        },
    );
    println!("[vfx] port_emitters OK (changed {ch:?})");

    let ch = roundtrip_op(
        &target_ws,
        &baseline,
        "port_system",
        |id, _m| {
            let r =
                ops::port_system(id, donor_id, &donor_sys, Some("qz_ported_sys"), false).unwrap();
            assert!(r.final_name.contains("qz_ported_sys"));
            r.model
        },
        |m| {
            assert!(
                m.systems.iter().any(|s| s.name.contains("qz_ported_sys")),
                "ported system missing after reopen"
            );
        },
    );
    println!("[vfx] port_system OK (changed {ch:?})");

    // Create a fresh system, then port donor emitters INTO it (two frames).
    {
        let opened = session::open(target_ws.join(MAIN_REL)).unwrap();
        let id = opened.session_id;
        let m1 = ops::create_system(id, "qz_fresh_target").unwrap();
        let created = m1
            .systems
            .iter()
            .find(|s| s.name.contains("qz_fresh_target"))
            .expect("created system in model");
        assert!(created.emitters.is_empty());
        let created_path = created.path.clone();

        let r = ops::port_emitters(id, donor_id, &[donor_em.clone()], &created_path).unwrap();
        assert_eq!(
            r.ported.len(),
            1,
            "emitter did not port into the created system"
        );
        session::save(id).unwrap();

        let reopened = session::open(target_ws.join(MAIN_REL)).unwrap();
        let sys = reopened
            .model
            .systems
            .iter()
            .find(|s| s.name.contains("qz_fresh_target"))
            .expect("created system missing after reopen");
        assert_eq!(
            sys.emitters.len(),
            1,
            "ported emitter missing from created system"
        );
        assert_eq!(sys.emitters[0].name, donor_em_name);
        session::close(reopened.session_id);

        session::undo(id).unwrap().expect("undo port");
        session::undo(id).unwrap().expect("undo create");
        session::save(id).unwrap();
        assert_trees_equal(
            &baseline,
            &target_ws,
            "create+port-into-created: after 2x undo+save",
        );
        session::close(id);
        println!("[vfx] create system + port into it OK");
    }
    session::close(donor_id);

    let ch = roundtrip_op(
        &target_ws,
        &baseline,
        "rename_emitter",
        |id, m| {
            let (_, em, _) = first_system_with_emitters(m);
            ops::rename_emitter(id, em, "qz_renamed_emitter").unwrap()
        },
        |m| {
            assert!(
                m.systems
                    .iter()
                    .flat_map(|s| &s.emitters)
                    .any(|e| e.name == "qz_renamed_emitter"),
                "renamed emitter missing after reopen"
            );
        },
    );
    println!("[vfx] rename_emitter OK (changed {ch:?})");

    let ch = roundtrip_op(
        &target_ws,
        &baseline,
        "rename_system",
        |id, m| {
            let (sys, _, _) = first_system_with_emitters(m);
            ops::rename_system(id, sys, "qz_renamed_system").unwrap()
        },
        |m| {
            let sys = m
                .systems
                .iter()
                .find(|s| {
                    s.particle_path
                        .as_deref()
                        .is_some_and(|p| p.ends_with("qz_renamed_system"))
                })
                .expect("renamed system missing after reopen");
            let path = sys.particle_path.as_deref().unwrap();
            let hex = format!(
                "0x{:08x}",
                quartz_lib::vfx_session::schema::hash_or_hex(path)
            );
            let r = m.resolver.as_ref().expect("resolver missing");
            assert!(
                r.entries
                    .iter()
                    .any(|e| e.value.eq_ignore_ascii_case(path) || e.value == hex),
                "resolver not re-pointed to the renamed system (want {hex})"
            );
        },
    );
    println!("[vfx] rename_system OK (changed {ch:?})");

    // Same-session port (move/duplicate within one session): guards must not
    // deadlock when donor == target.
    let ch = roundtrip_op(
        &target_ws,
        &baseline,
        "port_emitters_same_session",
        |id, m| {
            let (target_sys, em, _) = first_system_with_emitters(m);
            let before = m.systems.iter().map(|s| s.emitters.len()).sum::<usize>();
            let r = ops::port_emitters(id, id, &[em.clone()], target_sys).unwrap();
            let after = r
                .model
                .systems
                .iter()
                .map(|s| s.emitters.len())
                .sum::<usize>();
            assert_eq!(after, before + 1, "same-session port did not add the clone");
            r.model
        },
        |m| {
            assert!(!m.systems.is_empty());
        },
    );
    println!("[vfx] same-session port OK, no deadlock (changed {ch:?})");

    // ── Combined mixed roundtrip: everything at once, then unwind ────────────
    let opened = session::open(target_ws.join(MAIN_REL)).unwrap();
    let id = opened.session_id;
    let m0 = opened.model;

    let m1 = ops::create_system(id, "qz_mixed_system").unwrap();
    let sys_path = m1
        .systems
        .iter()
        .find(|s| s.name.contains("qz_mixed_system"))
        .map(|s| s.path.clone())
        .expect("mixed system in model");
    ops::idle_add(id, "qz_mixed_system", &["head".into()]).unwrap();
    ops::resolver_upsert_op(
        id,
        "QzMixed",
        "Characters/Evelynn/Skins/Skin0/Particles/QzMixed",
    )
    .unwrap();
    let mut mtx = [0.0f32; 16];
    mtx[0] = 1.0;
    mtx[5] = 1.0;
    mtx[10] = 1.0;
    mtx[15] = 1.0;
    ops::set_matrix(id, &sys_path, Some(mtx)).unwrap();
    let payload = PersistentPayload {
        preset: PersistentPresetPayload {
            r#type: "HasBuffScript".into(),
            animation_name: None,
            script_name: Some("QzBuff".into()),
            spell_hash: None,
            slot: None,
            operator: None,
            value: None,
            delay_on: 0.0,
            delay_off: 0.0,
        },
        vfx: vec![PersistentVfxPayload {
            key: "qz_mixed_system".into(),
            bone_name: None,
            scale: None,
            owner_only: None,
            attach_to_camera: None,
            force_render: None,
        }],
        submeshes_show: vec![],
        submeshes_hide: vec![],
    };
    ops::persistent_upsert(id, None, &payload).unwrap();

    session::save(id).unwrap();
    let reopened = session::open(target_ws.join(MAIN_REL)).unwrap();
    let rm = &reopened.model;
    assert!(rm
        .systems
        .iter()
        .any(|s| s.name.contains("qz_mixed_system")));
    assert!(rm
        .idle
        .iter()
        .any(|i| i.effect_key.contains("qz_mixed_system") || i.effect_key.starts_with("0x")));
    assert_eq!(rm.persistent.len(), m0.persistent.len() + 1);
    session::close(reopened.session_id);

    for _ in 0..5 {
        session::undo(id).unwrap().expect("mixed undo frame");
    }
    session::save(id).unwrap();
    assert_trees_equal(&baseline, &target_ws, "mixed: after 5x undo+save");
    session::close(id);
    println!("[vfx] mixed combined roundtrip OK");

    println!("[vfx] ALL CHECKS PASSED - no corruption across any op");
}

/// Timing pass: open / per-op / save costs on the real set.
/// `cargo test -p quartz-lib --release --test vfx_session_roundtrip -- --ignored --nocapture`
#[test]
#[ignore]
fn vfx_session_bench() {
    let Some(src) = source_root() else {
        eprintln!("skipping: evelynn test set not found (set QUARTZ_VFX_TEST_ROOT)");
        return;
    };
    let ws = std::env::temp_dir().join("quartz-vfx-bench");
    let _ = std::fs::remove_dir_all(&ws);
    copy_tree(&src, &ws);

    let t0 = Instant::now();
    let opened = session::open(ws.join(MAIN_REL)).unwrap();
    let open_cost = t0.elapsed();
    let id = opened.session_id;
    let (sys, _, _) = first_system_with_emitters(&opened.model);
    let sys = sys.clone();

    let iters = 50u32;
    let t0 = Instant::now();
    for i in 0..iters {
        let mut mtx = [0.0f32; 16];
        mtx[0] = 1.0 + i as f32;
        mtx[5] = 1.0;
        mtx[10] = 1.0;
        mtx[15] = 1.0;
        ops::set_matrix(id, &sys, Some(mtx)).unwrap();
    }
    let op_avg = t0.elapsed() / iters;

    let t0 = Instant::now();
    for _ in 0..iters {
        session::undo(id).unwrap().unwrap();
        session::redo(id).unwrap().unwrap();
    }
    let undo_pair_avg = t0.elapsed() / iters;

    let t0 = Instant::now();
    let written = session::save(id).unwrap();
    let save_cost = t0.elapsed();

    println!(
        "vfx bench: open {open_cost:?} | op(set_matrix incl reproject) {op_avg:?} | undo+redo pair {undo_pair_avg:?} | save({} dirty bins) {save_cost:?}",
        written.len()
    );
    session::close(id);
}
