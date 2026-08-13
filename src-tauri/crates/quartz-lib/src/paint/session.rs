//! Resident bin-session registry. A session holds the main skin bin plus every
//! resolved linked bin (via [`crate::linked_bins`]) as resident trees, one
//! merged VFX edit index whose keys are bin-prefixed and whose paths carry a
//! bin, the per-bin source formats, and a bounded undo stack of per-bin
//! entry-granular COW frames (see [`crate::undo`]). An edit clones only the
//! top-level entries it touches and marks only that bin dirty. Save writes ONLY
//! dirty bins, each back to its own file. Mirrors `crate::vfx_session`.

use super::model::{self, EditIndex, VfxModel};
use super::recolor::{self, ColorTargetSel, PaletteStop, RecolorOptions};
use crate::error::{Error, Result};
use crate::linked_bins::{self, LoadedBin};
use crate::undo::UndoFrame;
use parking_lot::RwLock;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;

pub type SessionId = u64;

const UNDO_CAP: usize = 50;

/// One reversible edit across the session: per-bin entry frames, so a single
/// undo reverses the last logical edit regardless of which bins it touched.
struct MultiUndoFrame {
    parts: Vec<(usize, UndoFrame)>,
}

impl MultiUndoFrame {
    fn swap_with(&mut self, bins: &mut [LoadedBin]) {
        for (bin_idx, frame) in self.parts.iter_mut() {
            if let Some(lb) = bins.get_mut(*bin_idx) {
                frame.swap_with(&mut lb.tree);
                lb.dirty = true;
            }
        }
    }
}

pub struct BinSession {
    pub id: SessionId,
    /// Index 0 is always the main bin; linked bins follow in `linked` order.
    pub bins: Vec<LoadedBin>,
    pub index: EditIndex,
    undo: Vec<MultiUndoFrame>,
    redo: Vec<MultiUndoFrame>,
}

impl BinSession {
    /// Reproject the edit index + view model from all resident bins. Called
    /// after any structural change (open, undo). Edits that only change
    /// vec4/u8 values keep the index valid, so they don't need a reproject.
    fn reproject(&mut self) -> VfxModel {
        let (model, index) = model::project_all(&self.bins);
        self.index = index;
        model
    }

    /// Commit a completed edit's frame to the undo stack. A fresh edit
    /// invalidates the redo history.
    fn push_undo(&mut self, frame: MultiUndoFrame) {
        if self.undo.len() >= UNDO_CAP {
            self.undo.remove(0);
        }
        self.undo.push(frame);
        self.redo.clear();
    }

    /// Capture one undo frame across the bins for the given `(bin, entry)`
    /// touch set, grouping entries per bin.
    fn capture(&self, touched: impl IntoIterator<Item = (usize, usize)>) -> MultiUndoFrame {
        let mut by_bin: std::collections::BTreeMap<usize, Vec<usize>> = Default::default();
        for (b, e) in touched {
            by_bin.entry(b).or_default().push(e);
        }
        let parts = by_bin
            .into_iter()
            .filter_map(|(b, entries)| {
                self.bins
                    .get(b)
                    .map(|lb| (b, UndoFrame::capture(&lb.tree, entries)))
            })
            .collect();
        MultiUndoFrame { parts }
    }

    /// Mark every bin in the touch set dirty.
    fn dirty_bins(&mut self, bins_touched: impl IntoIterator<Item = usize>) {
        for b in bins_touched {
            if let Some(lb) = self.bins.get_mut(b) {
                lb.dirty = true;
            }
        }
    }
}

static REGISTRY: OnceLock<RwLock<HashMap<SessionId, BinSession>>> = OnceLock::new();
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

fn registry() -> &'static RwLock<HashMap<SessionId, BinSession>> {
    REGISTRY.get_or_init(|| RwLock::new(HashMap::new()))
}

/// Result of opening a file: the session id plus the initial VFX view.
pub struct OpenResult {
    pub session_id: SessionId,
    pub model: VfxModel,
}

/// Open a `.bin` (plus its resolvable linked bins) into a resident session and
/// register it. The main bin is index 0; linked bins follow. A `.py`/`.ritobin`
/// main opens as a single bin with no link resolution.
pub fn open(path: impl AsRef<Path>) -> Result<OpenResult> {
    let path = path.as_ref().to_path_buf();
    let bins = linked_bins::open_with_linked(&path)?;
    let (model, index) = model::project_all(&bins);
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    registry().write().insert(
        id,
        BinSession {
            id,
            bins,
            index,
            undo: Vec::new(),
            redo: Vec::new(),
        },
    );
    Ok(OpenResult {
        session_id: id,
        model,
    })
}

/// Drop a session and free its trees. Returns false if the id was unknown.
pub fn close(id: SessionId) -> bool {
    registry().write().remove(&id).is_some()
}

fn with_session<R>(id: SessionId, f: impl FnOnce(&mut BinSession) -> R) -> Result<R> {
    let mut reg = registry().write();
    let session = reg
        .get_mut(&id)
        .ok_or_else(|| Error::InvalidInput(format!("No paint session with id {}", id)))?;
    Ok(f(session))
}

/// Reparse this session when one of its source BINs changed externally.
/// External disk state is authoritative, so local history is reset.
pub fn reload_if_changed(id: SessionId) -> Result<Option<VfxModel>> {
    with_session(id, |session| -> Result<Option<VfxModel>> {
        let Some(bins) = linked_bins::reload_if_changed(&session.bins)? else {
            return Ok(None);
        };
        session.bins = bins;
        session.undo.clear();
        session.redo.clear();
        Ok(Some(session.reproject()))
    })?
}

/// Recolor selected emitters. Snapshots for undo, mutates the tree, returns the
/// count modified. The caller fetches refreshed colors via [`model_of`] /
/// [`emitter_colors`] as needed.
#[allow(clippy::too_many_arguments)]
pub fn recolor_emitters(
    id: SessionId,
    emitter_keys: &[String],
    targets: &[ColorTargetSel],
    palette: &[PaletteStop],
    opts: &RecolorOptions,
) -> Result<usize> {
    with_session(id, |s| {
        // Every path a recolor can write lives under the selected emitters'
        // color targets — snapshot just those (bin, entry) pairs.
        let touched: Vec<(usize, usize)> = emitter_keys
            .iter()
            .filter_map(|k| s.index.emitter_colors.get(k))
            .flat_map(|slots| slots.values())
            .flat_map(|t| t.constant.iter().chain(t.keyframes.iter()))
            .map(|p| (p.bin, p.entry))
            .collect();
        let bins_touched: Vec<usize> = touched.iter().map(|(b, _)| *b).collect();
        let frame = s.capture(touched);
        let n =
            recolor::recolor_emitters(&mut s.bins, &s.index, emitter_keys, targets, palette, opts);
        if n > 0 {
            s.dirty_bins(bins_touched);
            s.push_undo(frame);
        }
        n
    })
}

/// Recolor a single material color param.
pub fn set_material_param(
    id: SessionId,
    selection_key: &str,
    new_color: [f32; 4],
    preserve_alpha: bool,
) -> Result<bool> {
    with_session(id, |s| {
        let Some(path) = s.index.material_params.get(selection_key).cloned() else {
            return false;
        };
        let frame = s.capture([(path.bin, path.entry)]);
        let changed =
            recolor::recolor_material_param(&mut s.bins, &path, new_color, preserve_alpha, false);
        if changed {
            s.dirty_bins([path.bin]);
            s.push_undo(frame);
        }
        changed
    })
}

/// Set an emitter's blend mode (the `blendMode: u8` node).
pub fn set_blend_mode(id: SessionId, emitter_key: &str, mode: u8) -> Result<bool> {
    with_session(id, |s| {
        let Some(path) = s.index.blend_modes.get(emitter_key).cloned() else {
            return false;
        };
        let frame = s.capture([(path.bin, path.entry)]);
        let changed = match path.resolve_mut(&mut s.bins) {
            Some(ritoshark::bin::BinValue::U8(v)) => {
                if *v != mode {
                    *v = mode;
                    true
                } else {
                    false
                }
            }
            _ => false,
        };
        if changed {
            s.dirty_bins([path.bin]);
            s.push_undo(frame);
        }
        changed
    })
}

/// Set the blend mode on many emitters at once, returning how many changed.
///
/// One undo frame covers the whole batch, so a bulk change is reversed by a single
/// undo rather than one per emitter. Emitters that are already on `mode`, or whose
/// blendMode node cannot be found, are skipped.
pub fn set_blend_mode_bulk(id: SessionId, emitter_keys: &[String], mode: u8) -> Result<usize> {
    with_session(id, |s| {
        let paths: Vec<_> = emitter_keys
            .iter()
            .filter_map(|key| s.index.blend_modes.get(key).cloned())
            .collect();
        if paths.is_empty() {
            return 0;
        }

        let frame = s.capture(paths.iter().map(|p| (p.bin, p.entry)));
        let mut changed = 0usize;
        let mut touched_bins = Vec::new();
        for path in &paths {
            if let Some(ritoshark::bin::BinValue::U8(v)) = path.resolve_mut(&mut s.bins) {
                if *v != mode {
                    *v = mode;
                    changed += 1;
                    touched_bins.push(path.bin);
                }
            }
        }
        if changed > 0 {
            s.dirty_bins(touched_bins);
            s.push_undo(frame);
        }
        changed
    })
}

/// Rewrite an emitter's texture path (the `string` node whose current value is
/// `old_path`). Returns the refreshed model so the edit index picks up the new
/// path value; `None` if the node could not be located or the value was
/// unchanged.
pub fn set_texture(
    id: SessionId,
    emitter_key: &str,
    old_path: &str,
    new_path: &str,
) -> Result<Option<VfxModel>> {
    with_session(id, |s| {
        let Some(path) = s
            .index
            .emitter_textures
            .get(emitter_key)
            .and_then(|m| m.get(old_path))
            .cloned()
        else {
            return None;
        };
        let frame = s.capture([(path.bin, path.entry)]);
        let changed = match path.resolve_mut(&mut s.bins) {
            Some(ritoshark::bin::BinValue::String(v)) => {
                if v != new_path {
                    *v = new_path.to_string();
                    true
                } else {
                    false
                }
            }
            _ => false,
        };
        if !changed {
            return None;
        }
        s.dirty_bins([path.bin]);
        s.push_undo(frame);
        // The texture string is an index key, so relocate everything.
        Some(s.reproject())
    })
}

/// Set the alpha channel of an emitter color slot, per keyframe, preserving
/// RGB. `slot` is one of "color" | "birthColor" | "fresnelColor" |
/// "lingerColor". `alphas` are applied in the model's keyframe order: the
/// constant (if any) first, then the `values` list in order; extra/missing
/// entries are ignored. Returns the refreshed model, or `None` if nothing
/// changed / the slot wasn't found.
pub fn set_color_alpha(
    id: SessionId,
    emitter_key: &str,
    slot: &str,
    alphas: &[f32],
) -> Result<Option<VfxModel>> {
    let slot = match slot {
        "color" => model::ColorSlot::Color,
        "birthColor" => model::ColorSlot::BirthColor,
        "fresnelColor" => model::ColorSlot::FresnelColor,
        "lingerColor" => model::ColorSlot::LingerColor,
        _ => return Ok(None),
    };
    with_session(id, |s| {
        let Some(target) = s
            .index
            .emitter_colors
            .get(emitter_key)
            .and_then(|slots| slots.get(&slot))
            .cloned()
        else {
            return None;
        };
        // All nodes live in the same emitter entry; capture one frame.
        let entry = target
            .constant
            .as_ref()
            .or_else(|| target.keyframes.first())
            .map(|p| (p.bin, p.entry));
        let Some(entry) = entry else { return None };
        let frame = s.capture([entry]);

        // Node order mirrors color_data_from_target: constant first, then list.
        let mut nodes: Vec<&model::NodePath> = Vec::new();
        if let Some(c) = target.constant.as_ref() {
            nodes.push(c);
        }
        nodes.extend(target.keyframes.iter());

        let mut changed = false;
        for (node, &a) in nodes.iter().zip(alphas.iter()) {
            let a = a.clamp(0.0, 1.0);
            if let Some(ritoshark::bin::BinValue::Vec4(v)) = node.resolve_mut(&mut s.bins) {
                if (v[3] - a).abs() > f32::EPSILON {
                    v[3] = a;
                    changed = true;
                }
            }
        }
        if !changed {
            return None;
        }
        s.dirty_bins([entry.0]);
        s.push_undo(frame);
        Some(s.reproject())
    })
}

/// Undo the last mutating edit. Returns the refreshed model, or `None` if the
/// undo stack was empty.
pub fn undo(id: SessionId) -> Result<Option<VfxModel>> {
    with_session(id, |s| {
        match s.undo.pop() {
            Some(mut frame) => {
                // Swap the stored entries back in; the frame now holds the
                // undone state and parks on the redo stack.
                frame.swap_with(&mut s.bins);
                s.redo.push(frame);
                Some(s.reproject())
            }
            None => None,
        }
    })
}

/// Redo the last undone edit. Returns the refreshed model, or null if there's
/// nothing to redo.
pub fn redo(id: SessionId) -> Result<Option<VfxModel>> {
    with_session(id, |s| match s.redo.pop() {
        Some(mut frame) => {
            frame.swap_with(&mut s.bins);
            if s.undo.len() >= UNDO_CAP {
                s.undo.remove(0);
            }
            s.undo.push(frame);
            Some(s.reproject())
        }
        None => None,
    })
}

/// Re-fetch the full VFX model (after edits, to refresh views).
pub fn model_of(id: SessionId) -> Result<VfxModel> {
    with_session(id, |s| {
        let (model, _) = model::project_all(&s.bins);
        model
    })
}

/// Refreshed color views for just `emitter_keys`, read from the live tree —
/// the partial payload a recolor returns instead of a whole-model
/// reprojection (O(selected emitters), not O(file)).
pub fn emitter_colors_of(
    id: SessionId,
    emitter_keys: &[String],
) -> Result<HashMap<String, model::EmitterColors>> {
    with_session(id, |s| {
        let mut out = HashMap::new();
        let BinSession { bins, index, .. } = s;
        for key in emitter_keys {
            if let Some(slots) = index.emitter_colors.get(key) {
                out.insert(key.clone(), model::emitter_colors_from_targets(bins, slots));
            }
        }
        out
    })
}

/// Save the session. With `out_path = None`, writes ONLY the dirty bins, each
/// back to its own file in its own format (via [`crate::linked_bins::save_dirty`]),
/// and returns the paths written. With `out_path = Some(dest)`, this is a
/// Save-As of the MAIN bin (index 0) to `dest`; linked bins are not written.
pub fn save(id: SessionId, out_path: Option<PathBuf>, force: bool) -> Result<Vec<PathBuf>> {
    with_session(id, |s| -> Result<Vec<PathBuf>> {
        match out_path {
            None => linked_bins::save_dirty_checked(&mut s.bins, force),
            Some(dest) => {
                let main = s
                    .bins
                    .get_mut(0)
                    .ok_or_else(|| Error::InvalidInput("Session has no bins".to_string()))?;
                let bytes = crate::bin::write_bin(&main.tree)
                    .map_err(|e| Error::InvalidInput(e.to_string()))?;
                std::fs::write(&dest, bytes).map_err(|e| Error::io_with_path(e, &dest))?;
                main.dirty = false;
                Ok(vec![dest])
            }
        }
    })?
}

/* Self-contained edit tests.
 *
 * These build their own bins on disk rather than needing a real skin, so they
 * always run. They cover the shapes a VFX colour actually takes - a bare vec4,
 * a `constantValue`, an animated `values` list, and the `dynamics`-nested form -
 * and assert that an edit reaches the BYTES, survives a save/reopen round-trip,
 * and replays byte-exact through undo/redo. */
#[cfg(test)]
mod edit_tests {
    use super::*;
    use crate::bin::write_bin;
    use crate::paint::fnv1a_lower as fh;
    use crate::paint::recolor::{ColorTargetSel, PaletteStop, RecolorMode, RecolorOptions};
    use indexmap::IndexMap;
    use ritoshark::bin::{Bin, BinEntry, BinType, BinValue};

    /// Colour field shapes a VfxEmitter can carry.
    enum ColorShape {
        /// `color: vec4 = {...}`
        BareVec4([f32; 4]),
        /// `color: embed = ValueColor { constantValue: vec4 }`
        Constant([f32; 4]),
        /// `ValueColor { values: list[vec4] }`
        Values(Vec<[f32; 4]>),
        /// `ValueColor { dynamics: pointer { values: list[vec4], times: list[f32] } }`
        Dynamics(Vec<[f32; 4]>),
        /// `ValueColor { constantValue: vec4, dynamics: { values, times } }` -
        /// both a constant AND keyframes, the case the editor lists together.
        ConstantPlusDynamics([f32; 4], Vec<[f32; 4]>),
    }

    fn vec4_list(items: &[[f32; 4]]) -> BinValue {
        BinValue::List {
            is_list2: false,
            item: BinType::Vec4,
            items: items.iter().map(|v| BinValue::Vec4(*v)).collect(),
        }
    }

    fn f32_list(n: usize) -> BinValue {
        BinValue::List {
            is_list2: false,
            item: BinType::F32,
            items: (0..n)
                .map(|i| {
                    BinValue::F32(if n <= 1 {
                        0.0
                    } else {
                        i as f32 / (n - 1) as f32
                    })
                })
                .collect(),
        }
    }

    fn color_field(shape: &ColorShape) -> BinValue {
        match shape {
            ColorShape::BareVec4(v) => BinValue::Vec4(*v),
            ColorShape::Constant(v) => {
                let mut f = IndexMap::new();
                f.insert(fh("constantValue"), BinValue::Vec4(*v));
                BinValue::Embed {
                    class: fh("ValueColor"),
                    fields: f,
                }
            }
            ColorShape::Values(vs) => {
                let mut f = IndexMap::new();
                f.insert(fh("values"), vec4_list(vs));
                f.insert(fh("times"), f32_list(vs.len()));
                BinValue::Embed {
                    class: fh("ValueColor"),
                    fields: f,
                }
            }
            ColorShape::Dynamics(vs) => {
                let mut inner = IndexMap::new();
                inner.insert(fh("values"), vec4_list(vs));
                inner.insert(fh("times"), f32_list(vs.len()));
                let mut f = IndexMap::new();
                f.insert(
                    fh("dynamics"),
                    BinValue::Pointer {
                        class: fh("VfxAnimatedColorVariableData"),
                        fields: inner,
                    },
                );
                BinValue::Embed {
                    class: fh("ValueColor"),
                    fields: f,
                }
            }
            ColorShape::ConstantPlusDynamics(c, vs) => {
                let mut inner = IndexMap::new();
                inner.insert(fh("values"), vec4_list(vs));
                inner.insert(fh("times"), f32_list(vs.len()));
                let mut f = IndexMap::new();
                f.insert(fh("constantValue"), BinValue::Vec4(*c));
                f.insert(
                    fh("dynamics"),
                    BinValue::Pointer {
                        class: fh("VfxAnimatedColorVariableData"),
                        fields: inner,
                    },
                );
                BinValue::Embed {
                    class: fh("ValueColor"),
                    fields: f,
                }
            }
        }
    }

    /// One system, one complex emitter, with `color` set to `shape`.
    fn bin_with_color(shape: ColorShape) -> Bin {
        let mut emitter = IndexMap::new();
        emitter.insert(fh("emitterName"), BinValue::String("Test".into()));
        emitter.insert(fh("blendMode"), BinValue::U8(1));
        emitter.insert(fh("color"), color_field(&shape));

        let mut sys = IndexMap::new();
        sys.insert(fh("particleName"), BinValue::String("TestSystem".into()));
        sys.insert(
            fh("complexEmitterDefinitionData"),
            BinValue::List {
                is_list2: false,
                item: BinType::Embed,
                items: vec![BinValue::Embed {
                    class: fh("VfxEmitterDefinitionData"),
                    fields: emitter,
                }],
            },
        );

        let mut bin = Bin::new();
        bin.version = 3;
        bin.entries.push(BinEntry {
            path_hash: 0x1234_5678,
            class_hash: fh("VfxSystemDefinitionData"),
            fields: sys,
        });
        bin
    }

    fn write_temp(bin: &Bin, name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join("quartz-paint-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{}-{}.bin", name, std::process::id()));
        std::fs::write(&path, write_bin(bin).unwrap()).unwrap();
        path
    }

    fn only_emitter_key(id: SessionId) -> String {
        with_session(id, |s| {
            s.index
                .emitter_colors
                .keys()
                .next()
                .cloned()
                .expect("emitter should have a colour target")
        })
        .unwrap()
    }

    /// Every alpha the model currently reports for the `color` slot, in the
    /// same order the editor lists (and the writer zips) them.
    fn alphas_of(id: SessionId, key: &str) -> Vec<f32> {
        with_session(id, |s| {
            let m = s.reproject();
            let e = m
                .emitters
                .iter()
                .find(|e| e.key == key)
                .expect("emitter in model");
            e.colors
                .color
                .as_ref()
                .map(|c| c.keyframes.iter().map(|k| k.rgba[3]).collect())
                .unwrap_or_default()
        })
        .unwrap()
    }

    fn session_bytes(id: SessionId) -> Vec<u8> {
        with_session(id, |s| {
            let mut out = Vec::new();
            for lb in &s.bins {
                out.extend(write_bin(&lb.tree).unwrap());
            }
            out
        })
        .unwrap()
    }

    /* ── alpha ─────────────────────────────────────────────────────────────── */

    /// Setting alpha must reach every keyframe, for EVERY colour shape - the
    /// bug being guarded here is a writer that only understands one of them and
    /// silently no-ops on the rest.
    #[test]
    fn set_alpha_writes_every_color_shape() {
        let cases: Vec<(&str, ColorShape, usize)> = vec![
            ("bare_vec4", ColorShape::BareVec4([1.0, 0.0, 0.0, 1.0]), 1),
            ("constant", ColorShape::Constant([1.0, 0.0, 0.0, 1.0]), 1),
            (
                "values",
                ColorShape::Values(vec![[1.0, 0.0, 0.0, 1.0], [0.0, 1.0, 0.0, 1.0]]),
                2,
            ),
            (
                "dynamics",
                ColorShape::Dynamics(vec![
                    [1.0, 0.0, 0.0, 1.0],
                    [0.0, 1.0, 0.0, 1.0],
                    [0.0, 0.0, 1.0, 1.0],
                ]),
                3,
            ),
            (
                "constant_plus_dynamics",
                ColorShape::ConstantPlusDynamics(
                    [1.0, 1.0, 1.0, 1.0],
                    vec![[1.0, 0.0, 0.0, 1.0], [0.0, 1.0, 0.0, 1.0]],
                ),
                3,
            ),
        ];

        for (name, shape, expected_kfs) in cases {
            let path = write_temp(&bin_with_color(shape), name);
            let id = open(&path).unwrap().session_id;
            let key = only_emitter_key(id);

            let before = alphas_of(id, &key);
            assert_eq!(
                before.len(),
                expected_kfs,
                "{name}: editor should list {expected_kfs} keyframe(s)"
            );

            // Drive every keyframe to a distinct value so a mis-zip is visible.
            let wanted: Vec<f32> = (0..before.len())
                .map(|i| 0.1 + 0.15 * i as f32)
                .collect();
            let out = set_color_alpha(id, &key, "color", &wanted).unwrap();
            assert!(out.is_some(), "{name}: alpha edit reported no change");

            let after = alphas_of(id, &key);
            for (i, (got, want)) in after.iter().zip(wanted.iter()).enumerate() {
                assert!(
                    (got - want).abs() < 1e-6,
                    "{name}: keyframe {i} alphaは {got}, expected {want}"
                );
            }
            close(id);
            let _ = std::fs::remove_file(&path);
        }
    }

    /// The edit must survive save + reopen. This is the "it didn't save" report:
    /// an in-memory change that never reaches the file looks fine until reload.
    #[test]
    fn set_alpha_survives_save_and_reopen() {
        let path = write_temp(
            &bin_with_color(ColorShape::Dynamics(vec![
                [1.0, 0.0, 0.0, 1.0],
                [0.0, 1.0, 0.0, 1.0],
            ])),
            "alpha_roundtrip",
        );

        let id = open(&path).unwrap().session_id;
        let key = only_emitter_key(id);
        set_color_alpha(id, &key, "color", &[0.25, 0.75]).unwrap();
        let written = save(id, None, true).unwrap();
        assert_eq!(written.len(), 1, "the dirty main bin should be written");
        close(id);

        let id2 = open(&path).unwrap().session_id;
        let key2 = only_emitter_key(id2);
        let reloaded = alphas_of(id2, &key2);
        assert_eq!(reloaded.len(), 2);
        assert!((reloaded[0] - 0.25).abs() < 1e-6, "got {reloaded:?}");
        assert!((reloaded[1] - 0.75).abs() < 1e-6, "got {reloaded:?}");
        close(id2);
        let _ = std::fs::remove_file(&path);
    }

    /// Alpha edits must not disturb RGB.
    #[test]
    fn set_alpha_preserves_rgb() {
        let rgb = [0.2, 0.4, 0.6, 1.0];
        let path = write_temp(&bin_with_color(ColorShape::Constant(rgb)), "alpha_rgb");
        let id = open(&path).unwrap().session_id;
        let key = only_emitter_key(id);

        set_color_alpha(id, &key, "color", &[0.33]).unwrap();

        let got = with_session(id, |s| {
            let m = s.reproject();
            m.emitters
                .iter()
                .find(|e| e.key == key)
                .and_then(|e| e.colors.color.as_ref())
                .map(|c| c.keyframes[0].rgba)
                .unwrap()
        })
        .unwrap();
        assert!((got[0] - rgb[0]).abs() < 1e-6, "r changed: {got:?}");
        assert!((got[1] - rgb[1]).abs() < 1e-6, "g changed: {got:?}");
        assert!((got[2] - rgb[2]).abs() < 1e-6, "b changed: {got:?}");
        assert!((got[3] - 0.33).abs() < 1e-6, "a not applied: {got:?}");
        close(id);
        let _ = std::fs::remove_file(&path);
    }

    /// Out-of-range input clamps instead of writing a nonsense alpha.
    #[test]
    fn set_alpha_clamps_out_of_range() {
        let path = write_temp(
            &bin_with_color(ColorShape::Values(vec![
                [1.0, 0.0, 0.0, 1.0],
                [0.0, 1.0, 0.0, 1.0],
            ])),
            "alpha_clamp",
        );
        let id = open(&path).unwrap().session_id;
        let key = only_emitter_key(id);

        set_color_alpha(id, &key, "color", &[-5.0, 9.0]).unwrap();

        let after = alphas_of(id, &key);
        assert!((after[0] - 0.0).abs() < 1e-6, "got {after:?}");
        assert!((after[1] - 1.0).abs() < 1e-6, "got {after:?}");
        close(id);
        let _ = std::fs::remove_file(&path);
    }

    /// A no-op edit must report "nothing changed" rather than dirtying the bin
    /// and pushing an empty undo step.
    #[test]
    fn set_alpha_same_value_is_a_noop() {
        let path = write_temp(
            &bin_with_color(ColorShape::Constant([1.0, 0.0, 0.0, 0.5])),
            "alpha_noop",
        );
        let id = open(&path).unwrap().session_id;
        let key = only_emitter_key(id);

        let before = session_bytes(id);
        let out = set_color_alpha(id, &key, "color", &[0.5]).unwrap();
        assert!(out.is_none(), "re-applying the same alpha reported a change");
        assert_eq!(before, session_bytes(id), "no-op still mutated the bytes");
        assert!(undo(id).unwrap().is_none(), "no-op pushed an undo frame");
        close(id);
        let _ = std::fs::remove_file(&path);
    }

    /// Fewer alphas than keyframes edits only the leading ones (zip semantics),
    /// and extra alphas are ignored rather than panicking.
    #[test]
    fn set_alpha_handles_length_mismatch() {
        let path = write_temp(
            &bin_with_color(ColorShape::Values(vec![
                [1.0, 0.0, 0.0, 1.0],
                [0.0, 1.0, 0.0, 1.0],
                [0.0, 0.0, 1.0, 1.0],
            ])),
            "alpha_mismatch",
        );
        let id = open(&path).unwrap().session_id;
        let key = only_emitter_key(id);

        // Short input: only the first keyframe moves.
        set_color_alpha(id, &key, "color", &[0.2]).unwrap();
        let a = alphas_of(id, &key);
        assert!((a[0] - 0.2).abs() < 1e-6, "got {a:?}");
        assert!((a[1] - 1.0).abs() < 1e-6, "trailing keyframe changed: {a:?}");

        // Long input: extras are dropped, no panic.
        set_color_alpha(id, &key, "color", &[0.9, 0.9, 0.9, 0.9, 0.9]).unwrap();
        let b = alphas_of(id, &key);
        assert_eq!(b.len(), 3);
        assert!(b.iter().all(|v| (v - 0.9).abs() < 1e-6), "got {b:?}");
        close(id);
        let _ = std::fs::remove_file(&path);
    }

    /// An unknown slot name must be rejected, not silently applied elsewhere.
    #[test]
    fn set_alpha_unknown_slot_is_rejected() {
        let path = write_temp(
            &bin_with_color(ColorShape::Constant([1.0, 0.0, 0.0, 1.0])),
            "alpha_slot",
        );
        let id = open(&path).unwrap().session_id;
        let key = only_emitter_key(id);

        assert!(set_color_alpha(id, &key, "notAColor", &[0.5])
            .unwrap()
            .is_none());
        assert!(set_color_alpha(id, "no-such-emitter", "color", &[0.5])
            .unwrap()
            .is_none());
        close(id);
        let _ = std::fs::remove_file(&path);
    }

    /* ── undo / redo ───────────────────────────────────────────────────────── */

    /// Alpha edits must replay byte-exact both directions.
    #[test]
    fn alpha_undo_redo_is_byte_exact() {
        let path = write_temp(
            &bin_with_color(ColorShape::ConstantPlusDynamics(
                [1.0, 1.0, 1.0, 1.0],
                vec![[1.0, 0.0, 0.0, 1.0], [0.0, 1.0, 0.0, 1.0]],
            )),
            "alpha_undo",
        );
        let id = open(&path).unwrap().session_id;
        let key = only_emitter_key(id);

        let s0 = session_bytes(id);
        set_color_alpha(id, &key, "color", &[0.1, 0.2, 0.3]).unwrap();
        let s1 = session_bytes(id);
        assert_ne!(s0, s1, "edit did not change the bytes");

        set_color_alpha(id, &key, "color", &[0.6, 0.7, 0.8]).unwrap();
        let s2 = session_bytes(id);
        assert_ne!(s1, s2);

        undo(id).unwrap().unwrap();
        assert_eq!(session_bytes(id), s1, "undo #1 did not restore state 1");
        undo(id).unwrap().unwrap();
        assert_eq!(session_bytes(id), s0, "undo #2 did not restore the original");
        redo(id).unwrap().unwrap();
        assert_eq!(session_bytes(id), s1, "redo #1 mismatch");
        redo(id).unwrap().unwrap();
        assert_eq!(session_bytes(id), s2, "redo #2 mismatch");
        close(id);
        let _ = std::fs::remove_file(&path);
    }

    /* ── recolor ───────────────────────────────────────────────────────────── */

    fn recolor_opts(preserve_alpha: bool) -> RecolorOptions {
        RecolorOptions {
            mode: RecolorMode::Linear,
            ignore_black_white: false,
            preserve_alpha,
            hsl_shift: (0.0, 0.0, 0.0),
            hue_target: None,
            seed: 7,
        }
    }

    fn two_stop_palette() -> Vec<PaletteStop> {
        vec![
            PaletteStop {
                vec4: [1.0, 0.0, 0.0, 1.0],
                time: 0.0,
            },
            PaletteStop {
                vec4: [0.0, 0.0, 1.0, 1.0],
                time: 1.0,
            },
        ]
    }

    /// Recolor must reach the bytes and survive save + reopen.
    #[test]
    fn recolor_survives_save_and_reopen() {
        let path = write_temp(
            &bin_with_color(ColorShape::Dynamics(vec![
                [1.0, 1.0, 1.0, 1.0],
                [0.5, 0.5, 0.5, 1.0],
            ])),
            "recolor_roundtrip",
        );
        let id = open(&path).unwrap().session_id;
        let key = only_emitter_key(id);

        let before = with_session(id, |s| {
            let m = s.reproject();
            m.emitters
                .iter()
                .find(|e| e.key == key)
                .and_then(|e| e.colors.color.as_ref())
                .map(|c| c.keyframes.iter().map(|k| k.rgba).collect::<Vec<_>>())
                .unwrap()
        })
        .unwrap();

        let n = recolor_emitters(
            id,
            &[key.clone()],
            &[ColorTargetSel::All],
            &two_stop_palette(),
            &recolor_opts(true),
        )
        .unwrap();
        assert!(n > 0, "recolor changed nothing");
        save(id, None, true).unwrap();
        close(id);

        let id2 = open(&path).unwrap().session_id;
        let key2 = only_emitter_key(id2);
        let after = with_session(id2, |s| {
            let m = s.reproject();
            m.emitters
                .iter()
                .find(|e| e.key == key2)
                .and_then(|e| e.colors.color.as_ref())
                .map(|c| c.keyframes.iter().map(|k| k.rgba).collect::<Vec<_>>())
                .unwrap()
        })
        .unwrap();
        assert_ne!(before, after, "recolor did not persist to disk");
        close(id2);
        let _ = std::fs::remove_file(&path);
    }

    /// `preserve_alpha` must leave a non-1.0 alpha untouched while RGB changes.
    #[test]
    fn recolor_preserve_alpha_keeps_alpha() {
        let path = write_temp(
            &bin_with_color(ColorShape::Values(vec![
                [1.0, 1.0, 1.0, 0.25],
                [0.5, 0.5, 0.5, 0.75],
            ])),
            "recolor_alpha",
        );
        let id = open(&path).unwrap().session_id;
        let key = only_emitter_key(id);

        recolor_emitters(
            id,
            &[key.clone()],
            &[ColorTargetSel::All],
            &two_stop_palette(),
            &recolor_opts(true),
        )
        .unwrap();

        let a = alphas_of(id, &key);
        assert!((a[0] - 0.25).abs() < 1e-6, "alpha 0 not preserved: {a:?}");
        assert!((a[1] - 0.75).abs() < 1e-6, "alpha 1 not preserved: {a:?}");
        close(id);
        let _ = std::fs::remove_file(&path);
    }

    /// Recolor undo/redo replays byte-exact.
    #[test]
    fn recolor_undo_redo_is_byte_exact_synthetic() {
        let path = write_temp(
            &bin_with_color(ColorShape::Dynamics(vec![
                [1.0, 1.0, 1.0, 1.0],
                [0.2, 0.4, 0.6, 1.0],
            ])),
            "recolor_undo",
        );
        let id = open(&path).unwrap().session_id;
        let key = only_emitter_key(id);

        let s0 = session_bytes(id);
        recolor_emitters(
            id,
            &[key.clone()],
            &[ColorTargetSel::All],
            &two_stop_palette(),
            &recolor_opts(true),
        )
        .unwrap();
        let s1 = session_bytes(id);
        assert_ne!(s0, s1);

        undo(id).unwrap().unwrap();
        assert_eq!(session_bytes(id), s0, "recolor undo was not byte-exact");
        redo(id).unwrap().unwrap();
        assert_eq!(session_bytes(id), s1, "recolor redo was not byte-exact");
        close(id);
        let _ = std::fs::remove_file(&path);
    }

    /// An alpha edit followed by a recolor must both persist - interleaving two
    /// different edit kinds is where entry-granular undo frames can collide.
    #[test]
    fn alpha_then_recolor_both_persist() {
        let path = write_temp(
            &bin_with_color(ColorShape::Dynamics(vec![
                [1.0, 1.0, 1.0, 1.0],
                [0.2, 0.4, 0.6, 1.0],
            ])),
            "alpha_then_recolor",
        );
        let id = open(&path).unwrap().session_id;
        let key = only_emitter_key(id);

        set_color_alpha(id, &key, "color", &[0.3, 0.4]).unwrap();
        let after_alpha = session_bytes(id);

        recolor_emitters(
            id,
            &[key.clone()],
            &[ColorTargetSel::All],
            &two_stop_palette(),
            &recolor_opts(true),
        )
        .unwrap();

        // Alpha must have survived the recolor (preserve_alpha = true).
        let a = alphas_of(id, &key);
        assert!((a[0] - 0.3).abs() < 1e-6, "recolor clobbered alpha: {a:?}");
        assert!((a[1] - 0.4).abs() < 1e-6, "recolor clobbered alpha: {a:?}");

        undo(id).unwrap().unwrap();
        assert_eq!(
            session_bytes(id),
            after_alpha,
            "undo of recolor did not return to the post-alpha state"
        );
        close(id);
        let _ = std::fs::remove_file(&path);
    }

    /// Saving with nothing dirty must not rewrite files.
    #[test]
    fn save_with_no_changes_writes_nothing() {
        let path = write_temp(
            &bin_with_color(ColorShape::Constant([1.0, 0.0, 0.0, 1.0])),
            "save_clean",
        );
        let id = open(&path).unwrap().session_id;
        let written = save(id, None, true).unwrap();
        assert!(
            written.is_empty(),
            "clean session wrote files: {written:?}"
        );
        close(id);
        let _ = std::fs::remove_file(&path);
    }

    /// Undo must clear the dirty flag's effect: after undoing back to the
    /// original state the saved file must match the original bytes.
    #[test]
    fn undo_then_save_restores_original_bytes() {
        let bin = bin_with_color(ColorShape::Values(vec![
            [1.0, 0.0, 0.0, 1.0],
            [0.0, 1.0, 0.0, 1.0],
        ]));
        let original = write_bin(&bin).unwrap();
        let path = write_temp(&bin, "undo_save");

        let id = open(&path).unwrap().session_id;
        let key = only_emitter_key(id);
        set_color_alpha(id, &key, "color", &[0.1, 0.2]).unwrap();
        undo(id).unwrap().unwrap();
        save(id, None, true).unwrap();
        close(id);

        let on_disk = std::fs::read(&path).unwrap();
        assert_eq!(
            on_disk, original,
            "undo + save did not restore the original file bytes"
        );
        let _ = std::fs::remove_file(&path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bin::write_bin;
    use crate::paint::recolor::RecolorMode;
    use std::time::Instant;

    fn real_bin_path() -> Option<PathBuf> {
        let p = std::env::var("QUARTZ_TEST_BIN")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                PathBuf::from(r"D:\updated skins\Frozen Locke\data\locke_vfx_skin0.bin")
            });
        p.is_file().then_some(p)
    }

    /// Byte fingerprint of the whole session (all resident bins concatenated),
    /// so undo/redo replay is verified across linked bins too.
    fn bytes_of(id: SessionId) -> Vec<u8> {
        with_session(id, |s| {
            let mut out = Vec::new();
            for lb in &s.bins {
                out.extend(write_bin(&lb.tree).unwrap());
            }
            out
        })
        .unwrap()
    }

    fn opts(seed: u64) -> RecolorOptions {
        RecolorOptions {
            mode: RecolorMode::Linear,
            ignore_black_white: false,
            preserve_alpha: true,
            hsl_shift: (0.0, 0.0, 0.0),
            hue_target: None,
            seed,
        }
    }

    fn palette(a: [f32; 4], b: [f32; 4]) -> Vec<PaletteStop> {
        vec![
            PaletteStop { vec4: a, time: 0.0 },
            PaletteStop { vec4: b, time: 1.0 },
        ]
    }

    fn some_emitter_keys(id: SessionId, n: usize) -> Vec<String> {
        with_session(id, |s| {
            let mut keys: Vec<String> = s.index.emitter_colors.keys().cloned().collect();
            keys.sort();
            keys.truncate(n);
            keys
        })
        .unwrap()
    }

    /// Recolor twice with different palettes, then undo/redo must replay every
    /// state byte-exact — the corruption check for entry-granular undo.
    #[test]
    fn recolor_undo_redo_replays_byte_exact() {
        let Some(path) = real_bin_path() else {
            eprintln!("skipping: real test bin not found (set QUARTZ_TEST_BIN)");
            return;
        };
        let opened = open(&path).unwrap();
        let id = opened.session_id;
        let keys = some_emitter_keys(id, 6);
        if keys.is_empty() {
            eprintln!("skipping: no emitters with color targets");
            close(id);
            return;
        }

        let s0 = bytes_of(id);
        let n1 = recolor_emitters(
            id,
            &keys,
            &[ColorTargetSel::All],
            &palette([1.0, 0.0, 0.0, 1.0], [0.0, 0.0, 1.0, 1.0]),
            &opts(1),
        )
        .unwrap();
        assert!(n1 > 0, "first recolor changed nothing");
        let s1 = bytes_of(id);
        assert_ne!(s0, s1);

        let n2 = recolor_emitters(
            id,
            &keys,
            &[ColorTargetSel::All],
            &palette([0.0, 1.0, 0.2, 1.0], [0.6, 0.0, 0.8, 1.0]),
            &opts(2),
        )
        .unwrap();
        assert!(n2 > 0, "second recolor changed nothing");
        let s2 = bytes_of(id);
        assert_ne!(s1, s2);

        undo(id).unwrap().expect("undo #1");
        assert_eq!(bytes_of(id), s1, "undo #1 diverged");
        undo(id).unwrap().expect("undo #2");
        assert_eq!(bytes_of(id), s0, "undo #2 diverged from pristine");
        assert!(undo(id).unwrap().is_none());

        redo(id).unwrap().expect("redo #1");
        assert_eq!(bytes_of(id), s1, "redo #1 diverged");
        redo(id).unwrap().expect("redo #2");
        assert_eq!(bytes_of(id), s2, "redo #2 diverged");
        assert!(redo(id).unwrap().is_none());
        close(id);
    }

    /// Perf report: old per-click cost (whole-tree clone) vs entry-granular
    /// recolor. Run with:
    /// `cargo test -p quartz-lib --release bench_recolor -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn bench_recolor_vs_whole_tree_clone() {
        let Some(path) = real_bin_path() else {
            eprintln!("skipping: real test bin not found (set QUARTZ_TEST_BIN)");
            return;
        };
        let opened = open(&path).unwrap();
        let id = opened.session_id;
        let keys = some_emitter_keys(id, 6);
        if keys.is_empty() {
            eprintln!("skipping: no emitters with color targets");
            close(id);
            return;
        }

        let (n_entries, clone_avg) = with_session(id, |s| {
            let iters = 10u32;
            let t0 = Instant::now();
            for _ in 0..iters {
                std::hint::black_box(s.bins[0].tree.clone());
            }
            (s.bins[0].tree.entries.len(), t0.elapsed() / iters)
        })
        .unwrap();

        let pals = [
            palette([1.0, 0.0, 0.0, 1.0], [0.0, 0.0, 1.0, 1.0]),
            palette([0.0, 1.0, 0.2, 1.0], [0.6, 0.0, 0.8, 1.0]),
        ];
        let iters = 20u32;
        let t0 = Instant::now();
        for i in 0..iters {
            let n = recolor_emitters(
                id,
                &keys,
                &[ColorTargetSel::All],
                &pals[(i % 2) as usize],
                &opts(i as u64),
            )
            .unwrap();
            assert!(n > 0);
        }
        let recolor_avg = t0.elapsed() / iters;

        let t0 = Instant::now();
        let pairs = 10u32;
        for _ in 0..pairs {
            undo(id).unwrap().unwrap();
            redo(id).unwrap().unwrap();
        }
        let pair_avg = t0.elapsed() / pairs;

        println!(
            "paint bench: {} entries, {} emitters selected | whole-tree clone (old per-click cost) {:?} | \
             recolor click {:?} | undo+redo pair (incl. reprojection) {:?}",
            n_entries,
            keys.len(),
            clone_avg,
            recolor_avg,
            pair_avg
        );
        close(id);
    }
}
