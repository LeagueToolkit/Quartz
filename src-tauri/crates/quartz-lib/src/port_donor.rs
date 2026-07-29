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
use std::collections::{HashMap, HashSet};
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
    /// BIN-authored per-submesh textures. `*` is the base material.
    pub model_texture_paths: HashMap<String, String>,
    /// Submeshes authored as hidden in `initialSubmeshToHide`.
    pub model_hidden_submeshes: Vec<String>,
    /// Authored SkinMeshDataProperties.SkinScale.
    pub model_scale: f32,
    /// Extracted `.anm` clip paths for the model (for the animation viewer).
    pub anm_paths: Vec<String>,
    /// Resolved clips (submesh-visibility events + sequencer queues) with anm refs
    /// remapped to the extracted disk files.
    pub anm_clips: Vec<crate::anim_graph::PreparedClip>,
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
fn cache_root(champ: &str, skin: u32, chroma_id: Option<u32>, wad_path: &Path) -> PathBuf {
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

    let selection = chroma_id
        .map(|chroma| format!("skin{skin}_chroma{chroma}"))
        .unwrap_or_else(|| format!("skin{skin}"));
    std::env::temp_dir()
        .join("Quartz")
        .join("port-donor-cache")
        .join(format!("{champ}_{selection}_v{PIPELINE_VERSION}_{tag}"))
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
    chroma_id: Option<u32>,
    prefix: &str,
) -> Result<DonorResult> {
    let champ_file = wad::normalize_champion(champion);
    let model_skin = normalize_skin_id(skin_id);
    let texture_skin = normalize_skin_id(chroma_id.unwrap_or(skin_id));
    let clean_prefix = sanitize_prefix(prefix);

    let temp_root = cache_root(&champ_file, model_skin, chroma_id, &league_path.join(&champ_file));
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
            skin_id: model_skin,
            output_dir: &extract_root,
            include_vo: false,
            clean: true,
            chroma_id,
            preserve_hud_icons2d: false,
            skip_sfx: true,
        },
        |_p| {},
    )?;

    // Locate the extracted main skin BIN (extract_skin nests everything in an
    // auto-named wrapper folder). Its mod root — the folder holding `data/` —
    // is what finalize operates on.
    let main_bin = find_extracted_skin_bin(&extract_root, &champ_file, texture_skin).ok_or_else(|| {
        Error::InvalidInput(format!(
            "Extracted skin BIN not found for {champion} skin {texture_skin} under {}",
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
        skin_id: texture_skin,
        split_vfx: false,
        split_anm: false,
        consolidate_assets: true,
        consolidate_prefix: &clean_prefix,
        wad_folder_override: None,
    })?;

    // Re-locate the main BIN after finalize (combine may have consolidated
    // characters, but the champion's skin<N>.bin remains the entry point).
    let main_bin = find_extracted_skin_bin(&content_dir, &champ_file, texture_skin).unwrap_or(main_bin);
    let preview_definition = try_read_bin(&main_bin)
        .and_then(|bin| crate::skin_preview::resolve_skin_preview(&bin));
    let authored_model = preview_definition
        .as_ref()
        .and_then(|definition| definition.simple_skin.as_deref())
        .map(|asset| crate::skin_preview::resolve_asset_path(&content_dir, asset))
        .filter(|path| path.is_file());
    let model_texture_paths = preview_definition
        .as_ref()
        .map(|definition| crate::skin_preview::resolve_disk_textures(definition, &content_dir))
        .unwrap_or_default();
    let model_hidden_submeshes = preview_definition
        .as_ref()
        .map(|definition| definition.hidden_submeshes.clone())
        .unwrap_or_default();
    let model_scale = preview_definition
        .as_ref()
        .map(|definition| definition.skin_scale)
        .unwrap_or(1.0);
    let (fallback_model, fallback_texture) =
        find_extracted_model_assets(&content_dir, &champ_file, model_skin);
    let model_path = authored_model.or(fallback_model);
    let model_texture_path = model_texture_paths
        .get("*")
        .map(PathBuf::from)
        .or(fallback_texture);

    // Resolve the clip graph (submesh-visibility events + sequencer queues) from
    // the extracted bins and remap each ASSETS anm ref to its on-disk file. The
    // graph may live in a linked animations bin, which the extraction pulled in;
    // gather every extracted .bin so resolve_clip_graph sees the whole graph.
    let anm_clips = resolve_clip_graph_on_disk(&content_dir, &champ_file, model_skin);

    // The dropdown list. Prefer the graph's resolved .anm paths: a non-base skin's
    // model sits under `.../skins/skinNN/` while its clips are base-shared under
    // `.../skins/base/animations/`, so a model-dir scan would miss them entirely.
    // Fall back to a whole-champion .anm scan only when the graph yields nothing.
    let mut anm_paths: Vec<String> = Vec::new();
    {
        let mut seen = std::collections::HashSet::new();
        for clip in &anm_clips {
            for anm in clip
                .anm_path
                .iter()
                .chain(clip.members.iter().map(|m| &m.anm_path))
            {
                if seen.insert(anm.to_ascii_lowercase()) {
                    anm_paths.push(anm.clone());
                }
            }
        }
        anm_paths.sort();
    }
    if anm_paths.is_empty() {
        // No graph clips resolved: scan the champion subtree so a base-shared
        // `animations/` folder is still found regardless of the model's location.
        let scan_root = content_dir.join("assets/characters").join(&champ_file);
        let mut out = Vec::new();
        collect_anm_files(&scan_root, &mut out);
        if out.is_empty() {
            collect_anm_files(&content_dir, &mut out);
        }
        out.sort();
        anm_paths = out
            .into_iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect();
    }

    // Donor py text (informational — the Port panel loads the .bin directly,
    // which resolves the on-disk linked BINs beside it).
    let text = try_read_bin(&main_bin)
        .and_then(|b| bin_to_text(&b).ok())
        .unwrap_or_default();

    tracing::info!(
        "[port donor] {champ_file} skin{model_skin} texture skin{texture_skin}: {} file(s) extracted, {} bin(s) combined, {} char(s), main bin = {}",
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
        model_texture_paths,
        model_hidden_submeshes,
        model_scale,
        anm_paths,
        anm_clips,
        champion_file_name: champ_file,
        skin_id: model_skin,
        selected_bin_count: 0,
        extracted_asset_count: summary.files as usize,
        cache_hit: false,
    })
}

/// Resolve the clip graph from the extracted bins and remap each ASSETS anm ref
/// to its on-disk file under `content_dir`. Parses every extracted `.bin` for the
/// champion so a linked animations bin is included. `_skin` is reserved for future
/// skin-specific scoping. Returns [] on any resolution miss (read-only).
fn resolve_clip_graph_on_disk(
    content_dir: &Path,
    _champ: &str,
    _skin: u32,
) -> Vec<crate::anim_graph::PreparedClip> {
    let mut bin_paths = Vec::new();
    collect_bin_files(content_dir, &mut bin_paths);
    let bins: Vec<Bin> = bin_paths
        .iter()
        .filter_map(|p| std::fs::read(p).ok().and_then(|b| read_bin(&b).ok()))
        .collect();
    if bins.is_empty() {
        return Vec::new();
    }
    let clips = crate::anim_graph::resolve_clip_graph(&bins);
    crate::anim_graph::prepare_clips(clips, |asset_ref| {
        let p = crate::skin_preview::resolve_asset_path(content_dir, asset_ref);
        p.is_file().then(|| p.to_string_lossy().into_owned())
    })
}

/// Recursively collect `.bin` files under `dir`.
fn collect_bin_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_bin_files(&path, out);
        } else if path.extension().is_some_and(|e| e.eq_ignore_ascii_case("bin")) {
            out.push(path);
        }
    }
}

/// Recursively collect `.anm` files under `dir` (the model's skin directory).
fn collect_anm_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_anm_files(&path, out);
        } else if path
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("anm"))
        {
            out.push(path);
        }
    }
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
fn find_extracted_skin_bin(root: &Path, champ: &str, skin: u32) -> Option<PathBuf> {
    let want_files = [format!("skin{skin}.bin"), format!("skin{skin:02}.bin")];
    // The extraction is NOT single-character: champions with a buddy/pet
    // (Milio+MilioMinion, Annie+Tibbers, Kindred+Wolf, ...) drop a `skin<N>.bin`
    // for EACH character. A blind first-match walk can return the near-empty
    // sub-character bin, opening an empty donor. So prefer the bin whose
    // `/characters/<folder>/` matches the requested champion; only fall back to
    // any shape-valid match when the champion's own bin isn't present.
    let want_champ = champ.to_lowercase();
    let champ_segment = format!("/characters/{want_champ}/");

    let mut any_match: Option<PathBuf> = None;

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
            let norm = p.to_string_lossy().replace('\\', "/").to_lowercase();
            if !(norm.contains("/characters/") && norm.contains("/skins/")) {
                continue;
            }
            // Exact champion folder wins immediately.
            if norm.contains(&champ_segment) {
                return Some(p);
            }
            // Otherwise remember the first shape-valid match as a fallback.
            if any_match.is_none() {
                any_match = Some(p);
            }
        }
    }
    any_match
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

    /// Build a throwaway tree under a unique temp dir and touch each given rel
    /// file (creating parents). Returns the tree root. No external test deps.
    fn scratch_tree(tag: &str, rels: &[&str]) -> PathBuf {
        // Unique-per-test dir name from the tag + a compile-time counter so
        // parallel test runs don't collide (no Date/rand available here).
        let root = std::env::temp_dir().join(format!("quartz_donor_test_{tag}"));
        let _ = std::fs::remove_dir_all(&root);
        for rel in rels {
            let p = root.join(rel);
            if let Some(parent) = p.parent() {
                std::fs::create_dir_all(parent).unwrap();
            }
            std::fs::write(&p, b"bin").unwrap();
        }
        root
    }

    /// The wrapper folder the extractor nests output in, e.g.
    /// `milio_skin0_extracted/data/characters/milio/skins/skin0.bin`.
    /// A NON-base skin under this exact layout must be found.
    #[test]
    fn find_extracted_skin_bin_finds_nonbase() {
        let root = scratch_tree(
            "nonbase",
            &["milio_skin1_extracted/data/characters/milio/skins/skin1.bin"],
        );
        let found = find_extracted_skin_bin(&root, "milio", 1);
        assert!(found.is_some(), "skin1 should resolve under skins/");
        let _ = std::fs::remove_dir_all(&root);
    }

    /// REPRO: base Milio. The Asset Extractor pipeline succeeds because
    /// `skin_bin_match` parses digits and accepts `skin0.bin`. This asserts the
    /// donor finder ALSO resolves the base skin from the same on-disk layout.
    #[test]
    fn find_extracted_skin_bin_finds_base_milio() {
        let root = scratch_tree(
            "base_skins",
            &["milio_skin0_extracted/data/characters/milio/skins/skin0.bin"],
        );
        let found = find_extracted_skin_bin(&root, "milio", 0);
        assert!(
            found.is_some(),
            "base Milio (skin0) must resolve from data/characters/milio/skins/skin0.bin"
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    /// THE base-Milio "opens empty" bug. Champions with a buddy/pet extract a
    /// `skin0.bin` for BOTH characters. The finder must return the CHAMPION's
    /// bin (`milio`), never the near-empty sub-character bin (`miliominion`) —
    /// which is what the live log showed being opened as the donor's main bin.
    #[test]
    fn find_extracted_skin_bin_prefers_champion_over_buddy() {
        // `miliominion` deliberately listed first so a naive first-match walk
        // would pick it. Order of touch mimics readdir returning the buddy.
        let root = scratch_tree(
            "buddy_skins",
            &[
                "milio_skin0_extracted/data/characters/miliominion/skins/skin0.bin",
                "milio_skin0_extracted/data/characters/milio/skins/skin0.bin",
            ],
        );
        let found = find_extracted_skin_bin(&root, "milio", 0)
            .expect("a skin0.bin must resolve");
        let norm = found.to_string_lossy().replace('\\', "/").to_lowercase();
        assert!(
            norm.contains("/characters/milio/skins/"),
            "must open milio's bin, not the buddy's — got {norm}"
        );
        assert!(
            !norm.contains("/miliominion/"),
            "must NOT open miliominion's near-empty bin — got {norm}"
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    /// The buddy-only case: if somehow only the sub-character bin exists, fall
    /// back to it rather than failing outright (better a partial donor than
    /// none).
    #[test]
    fn find_extracted_skin_bin_falls_back_when_champ_absent() {
        let root = scratch_tree(
            "buddy_only",
            &["milio_skin0_extracted/data/characters/miliominion/skins/skin0.bin"],
        );
        let found = find_extracted_skin_bin(&root, "milio", 0);
        assert!(
            found.is_some(),
            "fall back to any shape-valid skin bin when the champ's own is missing"
        );
        let _ = std::fs::remove_dir_all(&root);
    }
}
