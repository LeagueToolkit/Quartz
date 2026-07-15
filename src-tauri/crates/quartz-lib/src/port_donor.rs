//! "Load donor from game" pipeline — ported from Quartz's
//! `main/ipc/channels/portDonor.js` (`port:prepareDonorFromSkin`).
//!
//! Locates a champion's skin BIN inside the live WAD, walks the linked-BIN
//! graph, extracts the selected BINs and their referenced assets to a per-skin
//! temp cache, combines the linked BINs into the main BIN, repaths the VFX
//! assets under a single porting prefix, and converts the combined BIN to
//! ritobin text so the Port panel can load it as a donor.
//!
//! Heavy WAD IO reuses `crate::wad`; BIN parsing/printing reuses
//! `crate::bin::ritoshark_bridge`; asset path rewriting reuses `crate::bumpath`.

use crate::bin::converter::bin_to_text;
use crate::bin::ritoshark_bridge::read_bin;
use crate::error::{Error, Result};
use crate::wad;
use ritoshark::bin::{Bin, BinValue};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// Result of preparing a donor from a live skin.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DonorResult {
    /// Combined donor BIN converted to ritobin text — what the Port panel loads.
    pub donor_py_content: String,
    /// Root of the per-skin temp cache, returned so the caller can clean it up.
    pub temp_root: String,
    /// Absolute path of the combined main BIN.
    pub combined_bin_path: String,
    /// Best matching extracted champion model for the Asset Extractor preview.
    pub model_path: Option<String>,
    /// Best matching diffuse texture for `model_path`, when one was extracted.
    pub model_texture_path: Option<String>,
    /// Resolved champion WAD basename (e.g. `aatrox`, `monkeyking`).
    pub champion_file_name: String,
    /// Normalized skin id actually located.
    pub skin_id: u32,
    /// Number of BINs in the extracted graph.
    pub selected_bin_count: usize,
    /// Number of referenced asset files extracted.
    pub extracted_asset_count: usize,
    /// True when the cached combined BIN was reused without re-extracting.
    pub cache_hit: bool,
}

fn normalize_rel(value: &str) -> String {
    value
        .replace('\\', "/")
        .trim_start_matches('/')
        .to_lowercase()
}

/// Normalize a skin selection id: ids >= 1000 are chroma ids encoded as
/// `skinId * 1000 + chromaIndex`, so the base skin is `id % 1000`.
fn normalize_skin_id(value: u32) -> u32 {
    if value >= 1000 {
        value % 1000
    } else {
        value
    }
}

/// A link string can be a real rel path or a bare 16-hex path hash. Return the
/// normalized rel-path candidates worth trying against the TOC.
pub(crate) fn link_candidates(link: &str) -> Vec<String> {
    let raw = normalize_rel(link);
    if raw.is_empty() {
        return Vec::new();
    }
    let mut out = vec![raw.clone()];
    if !raw.ends_with(".bin") {
        out.push(format!("{raw}.bin"));
    }
    out
}

/// Pull the linked-BIN references out of a parsed BIN (the `linked` table).
pub(crate) fn linked_bins(bin: &Bin) -> Vec<String> {
    bin.linked.clone()
}

/// Recursively collect every asset/data string referenced in a BIN value.
pub(crate) fn collect_assets(value: &BinValue, out: &mut HashSet<String>) {
    match value {
        BinValue::String(s) => {
            let lower = s.to_lowercase();
            if (lower.contains("assets/") || lower.contains("data/")) && !lower.ends_with(".bin") {
                out.insert(s.clone());
            }
        }
        BinValue::List { items, .. } => items.iter().for_each(|v| collect_assets(v, out)),
        BinValue::Option {
            value: Some(inner), ..
        } => collect_assets(inner, out),
        BinValue::Map { entries, .. } => {
            for (k, v) in entries {
                collect_assets(k, out);
                collect_assets(v, out);
            }
        }
        BinValue::Pointer { fields, .. } | BinValue::Embed { fields, .. } => {
            for (_k, v) in fields {
                collect_assets(v, out);
            }
        }
        _ => {}
    }
}

/// Bump when the pipeline output format changes so stale caches from an older
/// build are never reused.
const PIPELINE_VERSION: u32 = 5;

/// Per-skin cache root: `%TEMP%/Quartz/port-donor-cache/<champ>_skin<N>_v<V>_<tag>`.
fn cache_root(champ: &str, skin: u32, wad_path: &Path) -> PathBuf {
    let tag = std::fs::metadata(wad_path)
        .ok()
        .map(|m| {
            let size = m.len();
            let mtime = m
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            format!("w{size}_m{mtime}")
        })
        .unwrap_or_else(|| "w0_m0".to_string());

    std::env::temp_dir()
        .join("Quartz")
        .join("port-donor-cache")
        .join(format!("{champ}_skin{skin}_v{PIPELINE_VERSION}_{tag}"))
}

/// Read a BIN file off disk, tolerating missing/unparseable files.
pub(crate) fn try_read_bin(path: &Path) -> Option<Bin> {
    let data = std::fs::read(path).ok()?;
    read_bin(&data).ok()
}

/// Sanitize a user-supplied porting prefix to `[a-z0-9_]`.
fn sanitize_prefix(raw: &str) -> String {
    raw.trim()
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_')
        .collect()
}

/// Prepare a donor from a live skin WAD by extracting the skin's full BIN graph
/// to disk (the Asset Extractor's proven "skin files only" pipeline) and
/// handing back the extracted main skin BIN. The Port panel opens that BIN and
/// resolves its linked BINs from the extraction, so every VFX system loads.
pub fn prepare_donor_from_skin(
    league_path: &Path,
    champion: &str,
    skin_id: u32,
    prefix: &str,
) -> Result<DonorResult> {
    let champ_file = wad::normalize_champion(champion);
    let skin = normalize_skin_id(skin_id);
    let clean_prefix = sanitize_prefix(prefix);

    let temp_root = cache_root(&champ_file, skin, &league_path.join(&champ_file));
    let extract_root = temp_root.join("extracted");

    // Extract the skin exactly like the Asset Extractor's "skin files only" mode:
    // seed from skin<N>.bin, follow the linked-BIN graph by hash, and write every
    // reachable BIN + referenced asset to disk preserving paths. This is the
    // proven pipeline — all of the champion's VFX systems come through because
    // each linked BIN is written as its own file (nothing is merged/dropped).
    let _ = std::fs::remove_dir_all(&temp_root);
    std::fs::create_dir_all(&extract_root).map_err(|e| Error::io_with_path(e, &extract_root))?;

    let summary = crate::extractor::extract_skin(
        crate::extractor::ExtractOptions {
            league_root: league_path,
            champion,
            skin_id: skin,
            output_dir: &extract_root,
            include_vo: false,
            clean: true,
            chroma_id: None,
            preserve_hud_icons2d: false,
            skip_sfx: true,
        },
        |_p| {},
    )?;

    // Locate the extracted main skin BIN (extract_skin nests everything in an
    // auto-named wrapper folder). Its mod root — the folder holding `data/` —
    // is what finalize operates on.
    let main_bin = find_extracted_skin_bin(&extract_root, &champ_file, skin).ok_or_else(|| {
        Error::InvalidInput(format!(
            "Extracted skin BIN not found for {champion} skin {skin} under {}",
            extract_root.display()
        ))
    })?;
    let content_dir = crate::vfx_session::resolve::project_root_for(&main_bin)
        .unwrap_or_else(|| extract_root.clone());

    // Finalize like old Quartz's donor pipeline: COMBINE each character's linked
    // BINs into its skin BIN, prune the base `<champ>.bin`, then CONSOLIDATE all
    // VFX assets into a single `ASSETS/<prefix>/skin<N>_<champ>_particles/`
    // folder and rewrite the emitter strings to point there. This gives the
    // clean, collision-free per-skin asset layout donors are expected to have.
    let fin = crate::extractor::finalize_extracted(crate::extractor::FinalizeOptions {
        content_dir: &content_dir,
        champion: &champ_file,
        skin_id: skin,
        split_vfx: false,
        split_anm: false,
        consolidate_assets: true,
        consolidate_prefix: &clean_prefix,
        wad_folder_override: None,
    })?;

    // Re-locate the main BIN after finalize (combine may have consolidated
    // characters, but the champion's skin<N>.bin remains the entry point).
    let main_bin = find_extracted_skin_bin(&content_dir, &champ_file, skin).unwrap_or(main_bin);
    let (model_path, model_texture_path) =
        find_extracted_model_assets(&content_dir, &champ_file, skin);

    // Donor py text (informational — the Port panel loads the .bin directly,
    // which resolves the on-disk linked BINs beside it).
    let text = try_read_bin(&main_bin)
        .and_then(|b| bin_to_text(&b).ok())
        .unwrap_or_default();

    tracing::info!(
        "[port donor] {champ_file} skin{skin}: {} file(s) extracted, {} bin(s) combined, {} char(s), main bin = {}",
        summary.files,
        fin.bins_combined,
        fin.characters_combined,
        main_bin.display()
    );

    Ok(DonorResult {
        donor_py_content: text,
        temp_root: temp_root.to_string_lossy().into_owned(),
        combined_bin_path: main_bin.to_string_lossy().into_owned(),
        model_path: model_path.map(|path| path.to_string_lossy().into_owned()),
        model_texture_path: model_texture_path.map(|path| path.to_string_lossy().into_owned()),
        champion_file_name: champ_file,
        skin_id: skin,
        selected_bin_count: 0,
        extracted_asset_count: summary.files as usize,
        cache_hit: false,
    })
}

fn is_skin_path(path: &Path, skin: u32) -> bool {
    let normalized = path.to_string_lossy().replace('\\', "/").to_lowercase();
    let markers = [
        format!("/skins/skin{skin}/"),
        format!("/skins/skin{skin:02}/"),
        if skin == 0 {
            "/skins/base/".to_string()
        } else {
            String::new()
        },
    ];
    markers
        .iter()
        .any(|marker| !marker.is_empty() && normalized.contains(marker))
}

/// Locate a useful mesh/texture pair in the already skin-scoped donor output.
/// Champion meshes are normally SKNs below `skins/skinNN`; SCB/SCO remain valid
/// fallbacks for skins whose main visible geometry is static.
fn find_extracted_model_assets(
    root: &Path,
    champion: &str,
    skin: u32,
) -> (Option<PathBuf>, Option<PathBuf>) {
    const MODEL_EXTENSIONS: &[&str] = &["skn", "scb", "sco"];
    const TEXTURE_EXTENSIONS: &[&str] = &["dds", "tex", "png", "jpg", "jpeg", "webp"];

    let mut models = Vec::new();
    let mut textures = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            let extension = path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase();
            if MODEL_EXTENSIONS.contains(&extension.as_str()) {
                models.push(path);
            } else if TEXTURE_EXTENSIONS.contains(&extension.as_str()) {
                textures.push(path);
            }
        }
    }

    let champion = champion.to_ascii_lowercase();
    models.sort_by(|left, right| {
        let score = |path: &Path| {
            let extension = path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or_default();
            let stem = path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase();
            let mut value = if extension.eq_ignore_ascii_case("skn") {
                1_000
            } else {
                500
            };
            if is_skin_path(path, skin) {
                value += 500;
            }
            if stem.contains(&champion) {
                value += 120;
            }
            if stem.contains("lod") {
                value -= 80;
            }
            value
        };
        score(right).cmp(&score(left)).then_with(|| left.cmp(right))
    });

    let Some(model) = models.into_iter().next() else {
        return (None, None);
    };
    let model_parent = model.parent().map(Path::to_path_buf);
    let model_stem = model
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let texture_score = |path: &Path| {
        let stem = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        let mut value = 0_i32;
        if model_parent.as_deref() == path.parent() {
            value += 500;
        }
        if is_skin_path(path, skin) {
            value += 300;
        }
        if stem == model_stem {
            value += 1_000;
        } else if stem.contains(&model_stem) || model_stem.contains(&stem) {
            value += 350;
        }
        if stem.contains("tx_cm") || stem.contains("diffuse") || stem.ends_with("_d") {
            value += 240;
        }
        if stem.contains("normal") || stem.contains("mask") || stem.contains("spec") {
            value -= 220;
        }
        value
    };
    textures.sort_by(|left, right| {
        texture_score(right)
            .cmp(&texture_score(left))
            .then_with(|| left.cmp(right))
    });

    // Avoid applying an arbitrary VFX texture when no credible relationship
    // with the selected mesh was found. The untextured mesh is still useful.
    let texture = textures.into_iter().find(|path| texture_score(path) >= 500);
    (Some(model), texture)
}

/// Find the extracted `skin<N>.bin` for `champ` anywhere under `root`.
/// extract_skin nests everything in an auto-named wrapper dir, and the skin BIN
/// can live under either a `data/` or `assets/` root with `skinN` or `skin0N`
/// spelling — so we walk the tree and match by shape rather than a fixed path.
fn find_extracted_skin_bin(root: &Path, _champ: &str, skin: u32) -> Option<PathBuf> {
    let want_files = [format!("skin{skin}.bin"), format!("skin{skin:02}.bin")];

    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(read) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in read.flatten() {
            let p = entry.path();
            if p.is_dir() {
                stack.push(p);
                continue;
            }
            let name = p
                .file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.to_lowercase())
                .unwrap_or_default();
            if !want_files.contains(&name) {
                continue;
            }
            // Must be a champion skins/ bin (the extraction is champion-scoped,
            // so we don't need to re-check the champ name — just the shape).
            let norm = p.to_string_lossy().replace('\\', "/").to_lowercase();
            if norm.contains("/characters/") && norm.contains("/skins/") {
                return Some(p);
            }
        }
    }
    None
}

/// Delete a previously created donor temp cache root.
pub fn cleanup_temp(temp_root: &Path) {
    let _ = std::fs::remove_dir_all(temp_root);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_skin_id_handles_chroma() {
        assert_eq!(normalize_skin_id(0), 0);
        assert_eq!(normalize_skin_id(14), 14);
        assert_eq!(normalize_skin_id(14001), 1);
    }
}
