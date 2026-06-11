/*! Champion / skin discovery and skin-asset extraction.

This is the real backend behind Quartz's "frogchanger" flow, ported from the
Electron app's `wad:scanAll` / `wad:extractBundle` IPC handlers. It is
self-contained: WAD parsing, decompression, hash resolution and the actual
chunk-writing are reused from [`crate::wad_explorer`] (which wraps
`ritoshark::wad` + the shared `hashes-wad.lmdb`); this module adds the
champion/skin layer on top — League install detection by common path,
enumerating champion archives, reading their skin lists, and orchestrating a
full skin bundle extraction (main archive + optional voiceover archives).

Layout on disk (modern League):
- Champion archives: `Game/DATA/FINAL/Champions/<ChampFile>.wad.client`
- Voiceover archives: `Game/DATA/FINAL/Champions/<ChampFile>.<lang>.wad.client`
- Inside an archive a skin's tree is seeded by
  `data/characters/<champ>/skins/skin<N>.bin` (and the `assets/...` mirror).

Extraction writes the *whole* champion archive (every chunk, resolved to its
real path where the hashtable knows it, hex-named otherwise) plus, optionally,
the matching voiceover archives. This mirrors the proven non-"fast" path of the
old Electron extractor — selective skin-graph pruning was a separate opt-in
there and isn't required to produce a correct, usable dump.
*/

use crate::error::{Error, Result};
use crate::hash::{get_hash_dir, get_wad_env, resolve_hashes_lmdb_bulk};
use crate::wad_explorer;
use ritoshark::wad::Wad;
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

// ── Public data shapes (serialized to the frontend) ────────────────────────────

/// A discovered skin within a champion archive.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkinEntry {
    /// Skin id within the champion (0 = base).
    pub id: u32,
    /// Display name. Resolved when known, else `"Base"` / `"Skin N"`.
    pub name: String,
}

/// A discovered champion plus its skin list.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Champion {
    /// Internal/file id, lowercased (e.g. `"ahri"`, `"monkeyking"`).
    pub id: String,
    /// Display name (e.g. `"Ahri"`, `"Wukong"`).
    pub name: String,
    /// Absolute path to the champion's main `.wad.client`.
    pub wad_path: String,
    /// Skins found in the archive, sorted by id.
    pub skins: Vec<SkinEntry>,
    pub skin_count: u32,
}

/// Per-chunk progress emitted during extraction.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractProgress {
    /// `"preparing" | "extracting" | "voiceover" | "complete"`.
    pub phase: String,
    pub current: u64,
    pub total: u64,
    pub message: String,
}

/// Result returned to the frontend on completion.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractSummary {
    pub ok: bool,
    pub output_dir: String,
    /// Files successfully written (main + voiceover).
    pub files: u32,
    pub skipped: u32,
    pub errors: u32,
    pub elapsed_ms: u64,
}

// ── League detection (path-based; registry lives in the command layer) ─────────

const REQUIRED_DIR: &str = "Game";
const REQUIRED_FILE: &str = "LeagueClient.exe";

/// Common League install roots to probe when nothing else is configured.
pub fn common_league_paths() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    for drive in ['C', 'D', 'E', 'F', 'G'] {
        let base = format!("{}:\\", drive);
        roots.push(PathBuf::from(&base).join("Riot Games").join("League of Legends"));
        roots.push(
            PathBuf::from(&base)
                .join("Program Files")
                .join("Riot Games")
                .join("League of Legends"),
        );
        roots.push(
            PathBuf::from(&base)
                .join("Program Files (x86)")
                .join("Riot Games")
                .join("League of Legends"),
        );
    }
    roots
}

/// True when `path` looks like a League install root (has `Game/` and either
/// the client exe or the champion archives).
pub fn is_valid_league_root(path: &Path) -> bool {
    if !path.is_dir() {
        return false;
    }
    if !path.join(REQUIRED_DIR).is_dir() {
        return false;
    }
    path.join(REQUIRED_FILE).exists() || champions_dir(path).is_dir()
}

/// Scan the common install locations and return the first valid root.
pub fn detect_league_path_by_common_paths() -> Option<PathBuf> {
    common_league_paths().into_iter().find(|p| is_valid_league_root(p))
}

/// `<root>/Game/DATA/FINAL/Champions`.
fn champions_dir(league_root: &Path) -> PathBuf {
    league_root
        .join("Game")
        .join("DATA")
        .join("FINAL")
        .join("Champions")
}

// ── Champion / skin discovery ───────────────────────────────────────────────

/// Language-code suffixes that mark an archive as a voiceover WAD.
const LANG_CODES: &[&str] = &[
    "en_us", "en_gb", "de_de", "es_es", "fr_fr", "it_it", "pt_br", "ro_ro", "el_gr", "hu_hu",
    "cs_cz", "pl_pl", "ru_ru", "tr_tr", "zh_tw", "zh_cn", "ko_kr", "ja_jp", "ar_ae", "en_au",
    "es_mx", "vi_vn", "id_id", "th_th", "ms_my", "en_sg",
];

/// True when `stem` (a `.wad.client` name with the extension stripped) ends in
/// a known language code — i.e. it's a voiceover archive. Lang codes are
/// `ll_cc` (e.g. `ko_kr`), so the champion separates them with either `.`
/// (`aatrox.ko_kr`) or `_` (`aatrox_ko_kr`); in the latter case the code's own
/// underscore means we must test the trailing `<lang>_<country>` pair.
fn is_voiceover_stem(stem: &str) -> bool {
    let lower = stem.to_lowercase();
    if let Some(after_dot) = lower.rsplit('.').next() {
        if LANG_CODES.contains(&after_dot) {
            return true;
        }
    }
    // Trailing two underscore-separated segments, e.g. "...ko_kr".
    let mut segs = lower.rsplitn(3, '_');
    let last = segs.next();
    let prev = segs.next();
    if let (Some(country), Some(lang)) = (last, prev) {
        if LANG_CODES.contains(&format!("{}_{}", lang, country).as_str()) {
            return true;
        }
    }
    false
}

/// Enumerate champions from the Champions WAD directory. Each non-voiceover
/// `.wad.client` is one champion; skins are read from its TOC.
pub fn discover_champions(league_root: &Path) -> Result<Vec<Champion>> {
    let dir = champions_dir(league_root);
    if !dir.is_dir() {
        return Err(Error::InvalidInput(format!(
            "Champions directory not found: {}",
            dir.display()
        )));
    }

    let mut champions: Vec<Champion> = Vec::new();

    for entry in std::fs::read_dir(&dir).map_err(|e| Error::io_with_path(e, &dir))? {
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(file_name) = path.file_name().and_then(|n| n.to_str()) else { continue };
        let lower = file_name.to_lowercase();
        if !lower.ends_with(".wad.client") {
            continue;
        }
        let stem = &lower[..lower.len() - ".wad.client".len()];
        // The main champion archive's stem has no dots (e.g. `ahri`). Voiceover
        // and other auxiliary archives carry a `.lang`/`_lang` suffix.
        if stem.contains('.') || is_voiceover_stem(stem) {
            continue;
        }

        let id = stem.to_string();
        let skins = read_skins_from_wad(&path).unwrap_or_else(|e| {
            tracing::warn!("Failed to read skins for {}: {}", id, e);
            vec![SkinEntry { id: 0, name: "Base".to_string() }]
        });
        champions.push(Champion {
            name: display_name_for_id(&id),
            wad_path: path.to_string_lossy().into_owned(),
            skin_count: skins.len() as u32,
            skins,
            id,
        });
    }

    champions.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    tracing::info!("Discovered {} champions in {}", champions.len(), dir.display());
    Ok(champions)
}

/// Parse a champion WAD's TOC, resolve its path hashes, and collect every skin
/// id present (from `.../skins/skin<N>.bin`). Always includes skin 0.
pub fn read_skins_from_wad(wad_path: &Path) -> Result<Vec<SkinEntry>> {
    let wad = open_wad(wad_path)?;
    let hashes: Vec<u64> = wad.chunks.iter().map(|c| c.path_hash).collect();
    let resolved = resolve_wad_paths(&hashes);

    let mut ids: HashSet<u32> = HashSet::new();
    ids.insert(0);
    for (_, path) in resolved.iter() {
        if let Some(id) = skin_id_from_path(path) {
            ids.insert(id);
        }
    }

    let mut skins: Vec<SkinEntry> = ids
        .into_iter()
        .map(|id| SkinEntry { id, name: skin_display_name(id) })
        .collect();
    skins.sort_by_key(|s| s.id);
    Ok(skins)
}

/// Extract the `<N>` from a path like `data/characters/ahri/skins/skin14.bin`.
fn skin_id_from_path(path: &str) -> Option<u32> {
    let lower = path.to_lowercase();
    let idx = lower.find("/skins/skin")?;
    let rest = &lower[idx + "/skins/skin".len()..];
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return None;
    }
    if &rest[digits.len()..] != ".bin" {
        return None;
    }
    digits.parse().ok()
}

fn skin_display_name(id: u32) -> String {
    if id == 0 {
        "Base".to_string()
    } else {
        format!("Skin {}", id)
    }
}

// ── Name mapping (internal id ↔ display) ────────────────────────────────────

/// Special champions whose WAD file name differs from the obvious lowercase of
/// the display name. Mirrors the Electron app's `CHAMPION_SPECIAL_CASES`.
fn display_name_for_id(id: &str) -> String {
    match id {
        "monkeyking" => "Wukong".to_string(),
        "nunu" => "Nunu & Willump".to_string(),
        "renata" => "Renata Glasc".to_string(),
        other => title_case(other),
    }
}

/// Map a user-facing champion name (or internal id) to its WAD file stem.
pub fn wad_stem_for_name(name: &str) -> String {
    let lower = name.to_lowercase();
    match lower.as_str() {
        "wukong" => "monkeyking".to_string(),
        "nunu & willump" | "nunu" => "nunu".to_string(),
        "renata glasc" | "renata" => "renata".to_string(),
        _ => lower.chars().filter(|c| !matches!(c, '\'' | '"' | ' ')).collect(),
    }
}

fn title_case(id: &str) -> String {
    let mut out = String::with_capacity(id.len());
    let mut start = true;
    for c in id.chars() {
        if start {
            out.extend(c.to_uppercase());
            start = false;
        } else {
            out.push(c);
        }
    }
    out
}

// ── Extraction ──────────────────────────────────────────────────────────────

/// Inputs to [`extract_skin`]. `skin_id` is informational here (the whole
/// champion archive is written); the caller uses it for output-folder naming.
pub struct ExtractOptions<'a> {
    /// League install root (`...\League of Legends`).
    pub league_root: &'a Path,
    /// Champion display name or internal id (resolved to the WAD stem).
    pub champion: &'a str,
    pub skin_id: u32,
    /// Destination directory (created if missing).
    pub output_dir: &'a Path,
    pub include_vo: bool,
}

/// Open + extract a champion's archive (and optional voiceover archives) into
/// `output_dir`. `progress` is called periodically with extraction state.
///
/// Chunk-level work (parse / resolve / decompress / write) is delegated to
/// [`crate::wad_explorer::extract_selected`] with an empty selection (= every
/// chunk), once per archive.
pub fn extract_skin<F>(opts: ExtractOptions<'_>, progress: F) -> Result<ExtractSummary>
where
    F: Fn(ExtractProgress) + Send + Sync,
{
    let started = std::time::Instant::now();
    let dir = champions_dir(opts.league_root);
    let stem = wad_stem_for_name(opts.champion);
    let main_wad = dir.join(format!("{}.wad.client", stem));

    if !main_wad.exists() {
        return Err(Error::InvalidInput(format!(
            "Champion WAD not found: {}",
            main_wad.display()
        )));
    }

    std::fs::create_dir_all(opts.output_dir)
        .map_err(|e| Error::io_with_path(e, opts.output_dir))?;

    progress(ExtractProgress {
        phase: "preparing".into(),
        current: 0,
        total: 0,
        message: format!("Reading {}", file_label(&main_wad)),
    });

    let mut files = 0u32;
    let mut skipped = 0u32;
    let mut errors = 0u32;

    // Main archive.
    let main = extract_archive(&main_wad, opts.output_dir, "extracting", &progress)?;
    files += main.written as u32;
    skipped += main.skipped as u32;
    errors += main.errors as u32;

    // Voiceover archives.
    if opts.include_vo {
        for vo in find_voiceover_wads(&dir, &stem) {
            progress(ExtractProgress {
                phase: "voiceover".into(),
                current: 0,
                total: 0,
                message: format!("Voiceover: {}", file_label(&vo)),
            });
            match extract_archive(&vo, opts.output_dir, "voiceover", &progress) {
                Ok(res) => {
                    files += res.written as u32;
                    skipped += res.skipped as u32;
                    errors += res.errors as u32;
                }
                Err(e) => {
                    tracing::warn!("Voiceover extraction failed for {}: {}", vo.display(), e);
                    errors += 1;
                }
            }
        }
    }

    let elapsed_ms = started.elapsed().as_millis() as u64;
    progress(ExtractProgress {
        phase: "complete".into(),
        current: (files + skipped + errors) as u64,
        total: (files + skipped + errors) as u64,
        message: "Extraction complete".into(),
    });

    Ok(ExtractSummary {
        ok: errors == 0,
        output_dir: opts.output_dir.to_string_lossy().into_owned(),
        files,
        skipped,
        errors,
        elapsed_ms,
    })
}

/// Extract every chunk of one archive, forwarding wad_explorer's `(done, total)`
/// progress into our richer [`ExtractProgress`] events under `phase`.
fn extract_archive<F>(
    wad_path: &Path,
    output_dir: &Path,
    phase: &str,
    progress: &F,
) -> Result<wad_explorer::ExtractResult>
where
    F: Fn(ExtractProgress) + Send + Sync,
{
    let wad_str = wad_path.to_string_lossy();
    let out_str = output_dir.to_string_lossy();
    let cb = move |done: u64, total: u64| {
        progress(ExtractProgress {
            phase: phase.to_string(),
            current: done,
            total,
            message: String::new(),
        });
    };
    // Empty hash slice => extract all chunks.
    wad_explorer::extract_selected(&wad_str, &[], &out_str, Some(&cb))
}

/// Find `<stem>.<lang>.wad.client` voiceover archives next to the main WAD.
fn find_voiceover_wads(champions_dir: &Path, stem: &str) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(champions_dir) else { return out };
    let main_name = format!("{}.wad.client", stem).to_lowercase();
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else { continue };
        let lower = name.to_lowercase();
        if !lower.ends_with(".wad.client") || lower == main_name {
            continue;
        }
        let prefix_ok = lower
            .strip_prefix(stem)
            .map(|rest| rest.starts_with('.') || rest.starts_with('_'))
            .unwrap_or(false);
        if prefix_ok {
            let inner = &lower[..lower.len() - ".wad.client".len()];
            if is_voiceover_stem(inner) {
                out.push(path);
            }
        }
    }
    out
}

// ── WAD / hash helpers ─────────────────────────────────────────────────────

fn open_wad(path: &Path) -> Result<Wad> {
    let file = std::fs::File::open(path).map_err(|e| Error::io_with_path(e, path))?;
    let mut reader = std::io::BufReader::new(file);
    Wad::from_reader(&mut reader)
        .map_err(|e| Error::wad_with_path(format!("parse failed: {}", e), path))
}

/// Bulk-resolve path hashes via the shared WAD LMDB. Empty when absent.
fn resolve_wad_paths(hashes: &[u64]) -> crate::hash::ResolvedHashes {
    let Ok(hash_dir) = get_hash_dir() else {
        return crate::hash::ResolvedHashes::default();
    };
    match get_wad_env(&hash_dir.to_string_lossy()) {
        Some(env) => resolve_hashes_lmdb_bulk(hashes, &env),
        None => {
            tracing::warn!("WAD LMDB not present — skin paths stay hex");
            crate::hash::ResolvedHashes::default()
        }
    }
}

fn file_label(p: &Path) -> String {
    p.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| p.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skin_id_parsing() {
        assert_eq!(skin_id_from_path("data/characters/ahri/skins/skin0.bin"), Some(0));
        assert_eq!(skin_id_from_path("data/characters/ahri/skins/skin14.bin"), Some(14));
        assert_eq!(skin_id_from_path("ASSETS/Characters/Ahri/Skins/Skin7.bin"), Some(7));
        assert_eq!(skin_id_from_path("data/characters/ahri/skins/root.bin"), None);
        assert_eq!(skin_id_from_path("data/characters/ahri/animations/skin0.bin"), None);
        assert_eq!(skin_id_from_path("data/characters/ahri/skins/skin1.txt"), None);
    }

    #[test]
    fn voiceover_detection() {
        assert!(is_voiceover_stem("ahri.en_us"));
        assert!(is_voiceover_stem("aatrox_ko_kr"));
        assert!(!is_voiceover_stem("ahri"));
        assert!(!is_voiceover_stem("monkeyking"));
    }

    #[test]
    fn name_mapping() {
        assert_eq!(display_name_for_id("monkeyking"), "Wukong");
        assert_eq!(wad_stem_for_name("Wukong"), "monkeyking");
        assert_eq!(wad_stem_for_name("Kai'Sa"), "kaisa");
        assert_eq!(wad_stem_for_name("Ahri"), "ahri");
        assert_eq!(display_name_for_id("ahri"), "Ahri");
    }
}
