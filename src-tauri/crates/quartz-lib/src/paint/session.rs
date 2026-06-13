//! Resident bin-session registry. A session holds the parsed `Bin` tree, its
//! VFX edit index, the source format (so save round-trips correctly), and a
//! bounded undo stack of tree snapshots. Mirrors the WAD mount registry pattern.

use super::model::{self, EditIndex, VfxModel};
use super::recolor::{self, ColorTargetSel, PaletteStop, RecolorOptions};
use crate::bin::{read_bin_ltk, text_to_tree, tree_to_text_cached, write_bin_ltk};
use crate::error::{Error, Result};
use parking_lot::RwLock;
use ritoshark::bin::Bin;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;

pub type SessionId = u64;

const UNDO_CAP: usize = 50;

/// How the file was loaded, so save writes it back the same way.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceFormat {
    /// Binary `.bin` — serialize the tree to bytes.
    Bin,
    /// `.py` / `.ritobin` text — serialize the tree to ritobin text.
    Text,
}

fn format_for_path(path: &Path) -> SourceFormat {
    match path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()) {
        Some(ext) if ext == "py" || ext == "ritobin" || ext == "txt" => SourceFormat::Text,
        _ => SourceFormat::Bin,
    }
}

pub struct BinSession {
    pub id: SessionId,
    pub source_path: PathBuf,
    pub source_format: SourceFormat,
    pub tree: Bin,
    pub index: EditIndex,
    undo: Vec<Bin>,
}

impl BinSession {
    /// Reproject the edit index + view model from the current tree. Called after
    /// any structural change (open, undo). Edits that only change vec4/u8 values
    /// keep the index valid, so they don't need a reproject.
    fn reproject(&mut self) -> VfxModel {
        let (model, index) = model::project(&self.tree);
        self.index = index;
        model
    }

    /// Push the current tree onto the undo stack before a mutating edit.
    fn snapshot(&mut self) {
        if self.undo.len() >= UNDO_CAP {
            self.undo.remove(0);
        }
        self.undo.push(self.tree.clone());
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

/// Open a `.bin`/`.py`/`.ritobin`, parse it into a resident tree, and register
/// the session. Binary files load straight into the tree (no text conversion).
pub fn open(path: impl AsRef<Path>) -> Result<OpenResult> {
    let path = path.as_ref().to_path_buf();
    let format = format_for_path(&path);

    let tree = match format {
        SourceFormat::Bin => {
            let data = std::fs::read(&path).map_err(|e| Error::io_with_path(e, &path))?;
            read_bin_ltk(&data).map_err(|e| Error::InvalidInput(e.to_string()))?
        }
        SourceFormat::Text => {
            let text = std::fs::read_to_string(&path).map_err(|e| Error::io_with_path(e, &path))?;
            text_to_tree(&text).map_err(|e| Error::InvalidInput(e.to_string()))?
        }
    };

    let (model, index) = model::project(&tree);
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    registry().write().insert(
        id,
        BinSession { id, source_path: path, source_format: format, tree, index, undo: Vec::new() },
    );
    Ok(OpenResult { session_id: id, model })
}

/// Drop a session and free its tree. Returns false if the id was unknown.
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
        s.snapshot();
        let n = recolor::recolor_emitters(&mut s.tree, &s.index, emitter_keys, targets, palette, opts);
        if n == 0 {
            // Nothing changed — drop the snapshot we just took.
            s.undo.pop();
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
        s.snapshot();
        let changed = recolor::recolor_material_param(&mut s.tree, &path, new_color, preserve_alpha, false);
        if !changed {
            s.undo.pop();
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
        s.snapshot();
        let changed = match path.resolve_mut(&mut s.tree) {
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
        if !changed {
            s.undo.pop();
        }
        changed
    })
}

/// Undo the last mutating edit. Returns the refreshed model, or `None` if the
/// undo stack was empty.
pub fn undo(id: SessionId) -> Result<Option<VfxModel>> {
    with_session(id, |s| {
        match s.undo.pop() {
            Some(prev) => {
                s.tree = prev;
                Some(s.reproject())
            }
            None => None,
        }
    })
}

/// Re-fetch the full VFX model (after edits, to refresh views).
pub fn model_of(id: SessionId) -> Result<VfxModel> {
    with_session(id, |s| {
        let (model, _) = model::project(&s.tree);
        model
    })
}

/// Serialize the resident tree to disk in its original format. `out_path`
/// overrides the source path (e.g. Save As); otherwise saves in place.
pub fn save(id: SessionId, out_path: Option<PathBuf>) -> Result<PathBuf> {
    with_session(id, |s| -> Result<PathBuf> {
        let dest = out_path.unwrap_or_else(|| s.source_path.clone());
        // Honor the destination's own extension (Save As to a different format),
        // falling back to the source format when the dest has no extension.
        let format = match dest.extension() {
            Some(_) => format_for_path(&dest),
            None => s.source_format,
        };
        match format {
            SourceFormat::Bin => {
                let bytes = write_bin_ltk(&s.tree).map_err(|e| Error::InvalidInput(e.to_string()))?;
                std::fs::write(&dest, bytes).map_err(|e| Error::io_with_path(e, &dest))?;
            }
            SourceFormat::Text => {
                let text = tree_to_text_cached(&s.tree).map_err(|e| Error::InvalidInput(e.to_string()))?;
                std::fs::write(&dest, text).map_err(|e| Error::io_with_path(e, &dest))?;
            }
        }
        Ok(dest)
    })?
}
