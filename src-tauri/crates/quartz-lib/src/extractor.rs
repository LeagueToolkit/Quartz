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
use std::collections::{HashMap, HashSet};
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

/// Inputs to [`extract_skin`]. In whole-WAD mode `skin_id` is informational
/// (the whole champion archive is written) and only drives folder naming; in
/// `clean` mode it seeds the skin-graph walk.
pub struct ExtractOptions<'a> {
    /// League install root (`...\League of Legends`).
    pub league_root: &'a Path,
    /// Champion display name or internal id (resolved to the WAD stem).
    pub champion: &'a str,
    pub skin_id: u32,
    /// Destination directory (created if missing).
    pub output_dir: &'a Path,
    pub include_vo: bool,
    /// Skin-files-only extraction: follow the skin BIN graph + its referenced
    /// assets instead of writing the whole archive.
    pub clean: bool,
    /// Chroma id (e.g. `14001`). When set, the effective skin extracted is
    /// `id % 1000` (if `>= 1000`), and the wrapper folder is tagged
    /// `_chroma_<chroma_id>` with the literal id.
    pub chroma_id: Option<u32>,
    /// In clean mode, also carry every `hud/icons2d/` asset for the champion.
    pub preserve_hud_icons2d: bool,
    /// Skip exporting SFX audio banks (`sounds/wwise2016/sfx/*.{bnk,wpk,wem}`)
    /// in clean mode — they're rarely modded and bloat the dump. Default on.
    pub skip_sfx: bool,
}

impl ExtractOptions<'_> {
    /// The skin id actually extracted: chroma ids `>= 1000` are
    /// `skinId * 1000 + chromaIndex`, so the base skin is `id % 1000`.
    fn effective_skin_id(&self) -> u32 {
        match self.chroma_id {
            Some(c) => {
                if c >= 1000 {
                    c % 1000
                } else {
                    c
                }
            }
            None => self.skin_id,
        }
    }
}

/// Build the wrapper folder base name for a skin extraction:
/// `<stem>_skin<effective>_extracted` (+ `_chroma_<id>` when chroma set,
/// + `_clean` in clean mode).
fn skin_folder_name(stem: &str, effective_skin_id: u32, chroma_id: Option<u32>, clean: bool) -> String {
    let mut name = format!("{}_skin{}_extracted", stem, effective_skin_id);
    if let Some(chroma) = chroma_id {
        name.push_str(&format!("_chroma_{}", chroma));
    }
    if clean {
        name.push_str("_clean");
    }
    name
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

    let effective_skin_id = opts.effective_skin_id();

    // Each extraction gets its own wrapper folder inside the chosen output dir
    // (e.g. `<output>/ahri_skin0_extracted/`), so the WAD's internal `data/` +
    // `assets/` trees land inside it instead of scattering loose across the
    // output root. Auto-versioned so re-extracting never overwrites.
    let extract_root = unique_dir(
        opts.output_dir,
        &skin_folder_name(&stem, effective_skin_id, opts.chroma_id, opts.clean),
    );
    std::fs::create_dir_all(&extract_root)
        .map_err(|e| Error::io_with_path(e, &extract_root))?;

    progress(ExtractProgress {
        phase: "preparing".into(),
        current: 0,
        total: 0,
        message: format!("Reading {}", file_label(&main_wad)),
    });

    let mut files = 0u32;
    let mut skipped = 0u32;
    let mut errors = 0u32;

    // Main archive: whole-WAD (empty selection) or the pruned skin-only graph.
    let main = if opts.clean {
        extract_skin_clean(&main_wad, &stem, effective_skin_id, opts.preserve_hud_icons2d, opts.skip_sfx, None, &extract_root, &progress)?
    } else {
        extract_archive(&main_wad, &extract_root, "extracting", &progress)?
    };
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
            match extract_archive(&vo, &extract_root, "voiceover", &progress) {
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

    // Old Quartz writes `hashed_files.json` at the extraction root mapping every
    // hex-named (unresolved) file to its known path, so combine/repath can still
    // resolve links to hex-named BINs. We mirror it: value is the resolved WAD
    // path when the hashtable knows it, else the bare hash.
    write_hashed_files_json(&extract_root, &main_wad);

    let elapsed_ms = started.elapsed().as_millis() as u64;
    progress(ExtractProgress {
        phase: "complete".into(),
        current: (files + skipped + errors) as u64,
        total: (files + skipped + errors) as u64,
        message: "Extraction complete".into(),
    });

    Ok(ExtractSummary {
        ok: errors == 0,
        output_dir: extract_root.to_string_lossy().into_owned(),
        files,
        skipped,
        errors,
        elapsed_ms,
    })
}

/// Write `hashed_files.json` at `extract_root` (old Quartz parity). Walks the
/// output for hex-named files (16 hex chars, optional extension) and maps each
/// to its resolved WAD path when the hashtable knows it, else the bare hash.
/// No file is written when nothing was hex-named.
fn write_hashed_files_json(extract_root: &Path, main_wad: &Path) {
    let by_hex = resolve_toc(main_wad).map(|(_, h, _)| h).unwrap_or_default();

    let is_hex_name = |name: &str| -> Option<String> {
        let stem = name.split('.').next().unwrap_or(name);
        (stem.len() == 16 && stem.bytes().all(|b| b.is_ascii_hexdigit()))
            .then(|| stem.to_lowercase())
    };

    let mut map: std::collections::BTreeMap<String, String> = std::collections::BTreeMap::new();
    let mut stack = vec![extract_root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                stack.push(p);
                continue;
            }
            let Some(name) = p.file_name().and_then(|n| n.to_str()) else { continue };
            if name.eq_ignore_ascii_case("hashed_files.json") {
                continue;
            }
            if let Some(hex) = is_hex_name(name) {
                let value = by_hex.get(&hex).cloned().unwrap_or_else(|| hex.clone());
                map.insert(name.to_string(), value);
            }
        }
    }

    if map.is_empty() {
        return;
    }
    let path = extract_root.join("hashed_files.json");
    match serde_json::to_string_pretty(&map) {
        Ok(json) => {
            if let Err(e) = std::fs::write(&path, json) {
                tracing::warn!("Failed to write hashed_files.json: {}", e);
            } else {
                tracing::info!("Wrote hashed_files.json ({} entries)", map.len());
            }
        }
        Err(e) => tracing::warn!("Failed to serialize hashed_files.json: {}", e),
    }
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

// ── Clean (skin-files-only) extraction ─────────────────────────────────────

/// Normalize a WAD-internal rel path: backslashes → `/`, strip leading `/`,
/// lowercase. Mirrors `port_donor::normalize_rel`.
fn normalize_rel(value: &str) -> String {
    value.replace('\\', "/").trim_start_matches('/').to_lowercase()
}

/// Resolve a WAD's TOC into lookup tables:
/// - `by_path`: normalized rel path → path_hash (resolved entries only).
/// - `by_hex`:  16-char lowercase hex of the hash → its rel path.
/// - `all_hashes`: EVERY chunk's path_hash, resolved or not.
///
/// The `all_hashes` set is what lets link-following find BINs whose names the
/// hashtable can't resolve (mod-internal combined BINs like
/// `Evelynn_Multi_Skins_...bin`): the linked path's own `xxh64` is looked up
/// directly against the archive, independent of the hashtable.
fn resolve_toc(
    wad_path: &Path,
) -> Result<(HashMap<String, u64>, HashMap<String, String>, HashSet<u64>)> {
    let toc = crate::wad::read_wad_toc(wad_path)?;
    let mut by_path: HashMap<String, u64> = HashMap::new();
    let mut by_hex: HashMap<String, String> = HashMap::new();
    let mut all_hashes: HashSet<u64> = HashSet::new();
    for entry in &toc {
        all_hashes.insert(entry.path_hash);
        if let Some(resolved) = &entry.resolved_path {
            let rel = normalize_rel(resolved);
            by_path.entry(rel.clone()).or_insert(entry.path_hash);
            by_hex.entry(format!("{:016x}", entry.path_hash)).or_insert(rel);
        }
    }
    Ok((by_path, by_hex, all_hashes))
}

/// True when `rel` is a skin BIN for skin `n` under `assets|data/characters/<champ>/skins/`.
/// Accepts `skin0*N` (arbitrary leading zeros). When `champ` is `Some`, the
/// character folder must match; otherwise any champion folder is accepted.
/// Returns the captured character folder on match.
fn skin_bin_match<'a>(rel: &'a str, n: u32) -> Option<&'a str> {
    // rel is already normalized (lowercase, `/`-separated).
    let after_root = rel
        .strip_prefix("assets/characters/")
        .or_else(|| rel.strip_prefix("data/characters/"))?;
    let (champ, rest) = after_root.split_once('/')?;
    if champ.is_empty() {
        return None;
    }
    let file = rest.strip_prefix("skins/")?;
    // No further slashes: the skin bin sits directly in skins/.
    if file.contains('/') {
        return None;
    }
    let digits = file.strip_prefix("skin")?.strip_suffix(".bin")?;
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    if digits.parse::<u32>().ok()? != n {
        return None;
    }
    Some(champ)
}

/// True for a WAD-relative SFX audio bank (`sounds/wwise2016/sfx/*.{bnk,wpk,wem}`).
/// `rel` is already normalized (lowercase, `/`-separated).
fn is_sfx_audio_rel(rel: &str) -> bool {
    let in_sfx = rel.contains("/sounds/wwise2016/sfx/") || rel.starts_with("sounds/wwise2016/sfx/");
    in_sfx && (rel.ends_with(".bnk") || rel.ends_with(".wpk") || rel.ends_with(".wem"))
}

/// Skin-files-only ("clean") extraction: seed from `skin<N>.bin`, follow the
/// linked-BIN graph, gather referenced assets, and write only those chunks.
/// This is the native reimplementation of the old Electron `fastSkinOnly`.
#[allow(clippy::too_many_arguments)]
fn extract_skin_clean<F>(
    wad_path: &Path,
    stem: &str,
    skin_id: u32,
    preserve_hud_icons2d: bool,
    skip_sfx: bool,
    // When set, only seed from this character folder — used for TFT, where the
    // Companions WAD holds ~80 pets and `skin<N>.bin` matches many of them.
    champ_filter: Option<&str>,
    out_dir: &Path,
    progress: &F,
) -> Result<wad_explorer::ExtractResult>
where
    F: Fn(ExtractProgress) + Send + Sync,
{
    let (by_path, _by_hex, all_hashes) = resolve_toc(wad_path)?;
    let wad_str = wad_path.to_string_lossy();

    // Resolve a WAD-internal rel path to its chunk hash: the linked-list names
    // (incl. mod-internal combined BINs the hashtable can't resolve) map to a
    // TOC chunk purely by `xxh64(rel)`. Try the raw rel and a `.bin`-appended
    // variant; accept only hashes actually present in this archive.
    let hash_for_rel = |rel: &str| -> Option<u64> {
        for cand in crate::port_donor::link_candidates(rel) {
            let h = crate::wad::path_hash(&cand);
            if all_hashes.contains(&h) {
                return Some(h);
            }
        }
        let h = crate::wad::path_hash(&normalize_rel(rel));
        all_hashes.contains(&h).then_some(h)
    };

    // Seed: every skin<N>.bin rel present in the resolved TOC. When a
    // `champ_filter` is given (TFT), restrict to that character folder so the
    // Companions WAD's other ~80 pets aren't pulled in.
    let champ_filter = champ_filter.map(|c| c.to_lowercase());
    let seed_rels: Vec<String> = by_path
        .keys()
        .filter(|rel| match skin_bin_match(rel, skin_id) {
            Some(folder) => champ_filter.as_deref().map(|f| folder == f).unwrap_or(true),
            None => false,
        })
        .cloned()
        .collect();
    if seed_rels.is_empty() {
        return Err(Error::InvalidInput(format!(
            "No skin{}.bin found in {}",
            skin_id,
            file_label(wad_path)
        )));
    }

    // Follow the linked-BIN graph by HASH. Each reachable BIN's chunk is read,
    // scanned for asset refs, and its `linked:` list resolved by hash so
    // combined/hash-named linked BINs are found and pulled in.
    let mut reachable_hashes: HashSet<u64> = HashSet::new();
    let mut referenced: HashSet<String> = HashSet::new();
    let mut queue: Vec<u64> = Vec::new();
    for rel in &seed_rels {
        if let Some(&h) = by_path.get(rel) {
            if reachable_hashes.insert(h) {
                queue.push(h);
            }
        }
    }

    while let Some(hash) = queue.pop() {
        let Ok(bytes) = wad_explorer::read_chunk(&wad_str, hash) else { continue };
        let Ok(bin) = crate::bin::read_bin(&bytes) else { continue };

        for entry in &bin.entries {
            for (_k, v) in &entry.fields {
                crate::port_donor::collect_assets(v, &mut referenced);
            }
        }
        for patch in &bin.patches {
            crate::port_donor::collect_assets(&patch.value, &mut referenced);
        }

        for link in crate::port_donor::linked_bins(&bin) {
            if !link.to_lowercase().ends_with(".bin") {
                continue;
            }
            if let Some(h) = hash_for_rel(&link) {
                if reachable_hashes.insert(h) {
                    queue.push(h);
                }
            }
        }
    }

    // Selection = reachable BIN hashes ∪ referenced (non-BIN) assets in TOC.
    let mut selection: HashSet<u64> = reachable_hashes.clone();
    for asset in &referenced {
        let rel = normalize_rel(asset);
        if rel.ends_with(".bin") {
            continue;
        }
        // Skip exporting SFX audio banks when requested (they're rarely modded
        // and bloat the dump). VFX/meshes never reference these, so dropping
        // them from the selection can't orphan a needed asset.
        if skip_sfx && is_sfx_audio_rel(&rel) {
            continue;
        }
        if let Some(&hash) = by_path.get(&rel) {
            selection.insert(hash);
        }
    }

    if preserve_hud_icons2d {
        let prefix = format!("assets/characters/{}/hud/icons2d/", stem);
        for (rel, &hash) in &by_path {
            if rel.starts_with(&prefix) {
                selection.insert(hash);
            }
        }
    }

    let out_str = out_dir.to_string_lossy();
    let cb = move |done: u64, total: u64| {
        progress(ExtractProgress {
            phase: "extracting".to_string(),
            current: done,
            total,
            message: String::new(),
        });
    };
    let selection: Vec<u64> = selection.into_iter().collect();
    wad_explorer::extract_selected(&wad_str, &selection, &out_str, Some(&cb))
}

// ── TFT companion extraction ────────────────────────────────────────────────

/// True when `rel` sits under `assets|data/characters/<pet_alias>/`.
fn pet_folder_match(rel: &str, pet_alias: &str) -> bool {
    let prefix_assets = format!("assets/characters/{}/", pet_alias);
    let prefix_data = format!("data/characters/{}/", pet_alias);
    rel.starts_with(&prefix_assets) || rel.starts_with(&prefix_data)
}

/// Options for [`extract_tft`].
pub struct TftExtractOptions<'a> {
    pub league_root: &'a Path,
    /// WAD folder name for the pet (e.g. `petbunny`), NOT the display name.
    pub pet_alias: &'a str,
    /// Skin index inside the pet folder (`skin<N>.bin`) — derived from `itemId % 1000`.
    pub skin_id: u32,
    pub output_dir: &'a Path,
    /// Skin-files-only: seed the pet's `skin<N>.bin` graph instead of the whole
    /// pet folder. Enables the same combine/repath/finalize pipeline as champions.
    pub clean: bool,
    /// Carry `hud/icons2d/` for the pet (clean mode only).
    pub preserve_hud_icons2d: bool,
    /// Skip exporting SFX audio banks (clean mode only).
    pub skip_sfx: bool,
}

/// Extract a TFT companion from `Companions.wad.client`. In clean mode this is
/// the SAME skin-graph extraction as champions (seeded from the pet's
/// `skin<N>.bin`, filtered to the pet folder), so it can then go through
/// [`repath_extracted`] / [`finalize_extracted`] exactly like a champion. In
/// non-clean mode it dumps the whole `characters/<pet_alias>/` subtree.
pub fn extract_tft<F>(opts: TftExtractOptions<'_>, progress: F) -> Result<ExtractSummary>
where
    F: Fn(ExtractProgress) + Send + Sync,
{
    let started = std::time::Instant::now();
    let companions_dir = champions_dir(opts.league_root)
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| Error::InvalidInput("Could not locate DATA/FINAL directory".into()))?;
    let wad = companions_dir.join("Companions.wad.client");
    if !wad.exists() {
        return Err(Error::InvalidInput(format!(
            "Companions WAD not found: {}",
            wad.display()
        )));
    }

    let pet_alias = opts.pet_alias.to_lowercase();
    let suffix = if opts.clean { "_extracted_clean" } else { "_extracted" };
    let extract_root = unique_dir(opts.output_dir, &format!("{}_tier{}{}", pet_alias, opts.skin_id, suffix));
    std::fs::create_dir_all(&extract_root).map_err(|e| Error::io_with_path(e, &extract_root))?;

    progress(ExtractProgress {
        phase: "preparing".into(),
        current: 0,
        total: 0,
        message: format!("Reading {}", file_label(&wad)),
    });

    let res = if opts.clean {
        // Same skin-graph clean extract as champions, filtered to this pet.
        extract_skin_clean(
            &wad,
            &pet_alias,
            opts.skin_id,
            opts.preserve_hud_icons2d,
            opts.skip_sfx,
            Some(&pet_alias),
            &extract_root,
            &progress,
        )?
    } else {
        // Whole-pet-folder dump (legacy behavior).
        let (by_path, _by_hex, _all_hashes) = resolve_toc(&wad)?;
        let selection: Vec<u64> = by_path
            .iter()
            .filter(|(rel, _)| pet_folder_match(rel, &pet_alias))
            .map(|(_, &hash)| hash)
            .collect();
        if selection.is_empty() {
            return Err(Error::InvalidInput(format!(
                "No assets found for TFT companion '{}' in {}",
                pet_alias,
                file_label(&wad)
            )));
        }
        let wad_str = wad.to_string_lossy();
        let out_str = extract_root.to_string_lossy();
        let cb = |done: u64, total: u64| {
            progress(ExtractProgress {
                phase: "extracting".to_string(),
                current: done,
                total,
                message: String::new(),
            });
        };
        wad_explorer::extract_selected(&wad_str, &selection, &out_str, Some(&cb))?
    };

    // hashed_files.json parity (mirrors champion extraction).
    write_hashed_files_json(&extract_root, &wad);

    let elapsed_ms = started.elapsed().as_millis() as u64;
    progress(ExtractProgress {
        phase: "complete".into(),
        current: (res.written + res.skipped + res.errors) as u64,
        total: (res.written + res.skipped + res.errors) as u64,
        message: "Extraction complete".into(),
    });

    Ok(ExtractSummary {
        ok: res.errors == 0,
        output_dir: extract_root.to_string_lossy().into_owned(),
        files: res.written as u32,
        skipped: res.skipped as u32,
        errors: res.errors as u32,
        elapsed_ms,
    })
}

/// Result of repathing an already-extracted skin folder.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepathSummary {
    pub ok: bool,
    /// The extracted folder that was repathed in place.
    pub output_dir: String,
    /// Linked BINs merged into the main skin BIN (0 if concat off / none).
    pub bins_combined: usize,
    pub paths_modified: usize,
    pub files_relocated: usize,
    pub files_removed: usize,
    pub missing: usize,
    /// Independent character roots that were concatenated (main champ + subcharacters like Tibbers).
    pub characters_combined: usize,
    pub elapsed_ms: u64,
}

/// Options for [`repath_extracted`].
pub struct RepathOptions<'a> {
    /// The already-extracted content dir (e.g. `<stem>_skin<N>_extracted`).
    pub content_dir: &'a Path,
    /// Champion internal stem (e.g. `ahri`, `monkeyking`). For TFT, the pet alias.
    pub champion: &'a str,
    pub skin_id: u32,
    /// Repath prefix pieces — final prefix is `ASSETS/<creator>/<project>`.
    pub creator_name: &'a str,
    pub project_name: &'a str,
    /// Merge linked BINs into the main skin BIN before repathing.
    pub combine_linked: bool,
    /// Remove unreferenced files after repath.
    pub cleanup_unused: bool,
    /// Leave SFX audio banks untouched (don't prefix/relocate them).
    pub skip_sfx: bool,
    /// Leave VO audio banks untouched (don't prefix/relocate them).
    pub skip_vo: bool,
    /// Split `VfxSystemDefinitionData` out of each skin BIN into a sibling
    /// `<champ>_vfx_<stem>.bin` (old Quartz toggle, default off).
    pub split_vfx: bool,
    /// Split `AnimationGraphData` out into `<champ>_anm_<stem>.bin` (default off).
    pub split_anm: bool,
    /// Move VFX-referenced assets into a per-skin particles folder and rewrite
    /// the VFX strings (old Quartz toggle, default on).
    pub consolidate_assets: bool,
    /// WAD-folder-name override (e.g. `Companions.wad.client` for TFT); when
    /// None the organizer derives `<champion>.wad.client`.
    pub wad_folder_override: Option<String>,
}

/// Repath an already-extracted skin folder in place via the Flint-ported
/// engine: optionally combine linked BINs, then rewrite every asset/data path
/// under `ASSETS/<creator>/<project>/...` and relocate the files. This is what
/// turns a raw extraction into an installable, conflict-free mod.
pub fn repath_extracted(opts: RepathOptions<'_>) -> Result<RepathSummary> {
    use crate::flint_repath::organizer::{organize_project, OrganizerConfig};

    let started = std::time::Instant::now();
    if !opts.content_dir.is_dir() {
        return Err(Error::InvalidInput(format!(
            "Extracted folder not found: {}",
            opts.content_dir.display()
        )));
    }

    let config = OrganizerConfig {
        enable_concat: opts.combine_linked,
        enable_repath: true,
        creator_name: opts.creator_name.to_string(),
        project_name: opts.project_name.to_string(),
        champion: opts.champion.to_string(),
        target_skin_id: opts.skin_id,
        cleanup_unused: opts.cleanup_unused,
        skip_sfx: opts.skip_sfx,
        skip_vo: opts.skip_vo,
        wad_folder_override: opts.wad_folder_override.clone(),
    };

    // Files are already extracted with their real paths, so no hash→path map
    // is needed (the organizer only uses it for hash-named linked BINs).
    let result = organize_project(opts.content_dir, &config, &HashMap::new())?;

    let bins_combined: usize = result.concat_results.iter().map(|c| c.source_count).sum();
    let characters_combined = result.concat_results.len();
    let (paths_modified, files_relocated, files_removed, missing) = result
        .repath_result
        .as_ref()
        .map(|r| (r.paths_modified, r.files_relocated, r.files_removed, r.missing_paths.len()))
        .unwrap_or((0, 0, 0, 0));

    // Post-repath, per old Quartz FrogChanger: split (if enabled) THEN
    // consolidate (if enabled), over EVERY seed skin BIN (all characters).
    let repath_prefix = if opts.project_name.is_empty() {
        opts.creator_name.replace(' ', "-")
    } else {
        format!("{}/{}", opts.creator_name.replace(' ', "-"), opts.project_name.replace(' ', "-"))
    };
    run_split_and_consolidate(
        opts.content_dir, opts.skin_id, opts.split_vfx, opts.split_anm, opts.consolidate_assets, &repath_prefix,
    );

    Ok(RepathSummary {
        ok: result.repath_result.is_some(),
        output_dir: opts.content_dir.to_string_lossy().into_owned(),
        bins_combined,
        paths_modified,
        files_relocated,
        files_removed,
        missing,
        characters_combined,
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

/// Result of [`finalize_extracted`].
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinalizeSummary {
    pub ok: bool,
    pub output_dir: String,
    /// Linked BINs merged into skin BINs across all characters.
    pub bins_combined: usize,
    /// Independent character roots combined (main + subcharacters).
    pub characters_combined: usize,
    /// Base `<char>.bin` roots pruned.
    pub base_bins_pruned: usize,
    pub elapsed_ms: u64,
}

/// Options for [`finalize_extracted`].
pub struct FinalizeOptions<'a> {
    pub content_dir: &'a Path,
    pub champion: &'a str,
    pub skin_id: u32,
    /// Split VFX / ANM out of skin BINs into siblings (old Quartz toggles, off).
    pub split_vfx: bool,
    pub split_anm: bool,
    /// Consolidate VFX assets into `ASSETS/[<prefix>/]skin<N>_<champ>_particles/`
    /// (default on).
    pub consolidate_assets: bool,
    /// Prefix segment for the consolidated folder (`ASSETS/<prefix>/skin…`).
    /// Empty = no prefix segment (the plain skin-dump layout).
    pub consolidate_prefix: &'a str,
    pub wad_folder_override: Option<String>,
}

/// Finalize a "Skin Files Only" extraction, 1:1 with old Quartz's fast-skin
/// path: COMBINE each character's linked BINs into its own skin BIN (NO repath
/// prefix), prune every base `<char>.bin`, then optionally split VFX/ANM and
/// consolidate VFX assets. Produces a clean, self-contained skin dump without
/// the `ASSETS/<prefix>/` repathing that the installable-mod flow applies.
pub fn finalize_extracted(opts: FinalizeOptions<'_>) -> Result<FinalizeSummary> {
    use crate::flint_repath::organizer::{organize_project, OrganizerConfig};

    let started = std::time::Instant::now();
    if !opts.content_dir.is_dir() {
        return Err(Error::InvalidInput(format!(
            "Extracted folder not found: {}",
            opts.content_dir.display()
        )));
    }

    // Combine only — no repath prefix (old Quartz `bum.process(.., null, ..)`).
    let config = OrganizerConfig {
        enable_concat: true,
        enable_repath: false,
        creator_name: String::new(),
        project_name: String::new(),
        champion: opts.champion.to_string(),
        target_skin_id: opts.skin_id,
        cleanup_unused: false,
        skip_sfx: false,
        skip_vo: false,
        wad_folder_override: opts.wad_folder_override.clone(),
    };
    let result = organize_project(opts.content_dir, &config, &HashMap::new())?;
    let bins_combined: usize = result.concat_results.iter().map(|c| c.source_count).sum();
    let characters_combined = result.concat_results.len();

    // Prune every base `<char>.bin` (always deleted after combine, old Quartz).
    let base_bins_pruned = prune_base_character_bins(opts.content_dir);

    // Split (if on) THEN consolidate → `ASSETS/[<prefix>/]skin<N>_<champ>_particles/`.
    run_split_and_consolidate(
        opts.content_dir, opts.skin_id, opts.split_vfx, opts.split_anm, opts.consolidate_assets, opts.consolidate_prefix,
    );

    Ok(FinalizeSummary {
        ok: true,
        output_dir: opts.content_dir.to_string_lossy().into_owned(),
        bins_combined,
        characters_combined,
        base_bins_pruned,
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

/// Delete every base character root BIN (`data/characters/<char>/<char>.bin`)
/// under `content_dir` — redundant after combine. Returns the count removed.
fn prune_base_character_bins(content_dir: &Path) -> usize {
    let mut removed = 0;
    let mut stack = vec![content_dir.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                stack.push(p);
                continue;
            }
            let s = p.to_string_lossy().to_lowercase().replace('\\', "/");
            let name = p.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
            let folder = p.parent().and_then(|d| d.file_name()).map(|n| n.to_string_lossy().to_lowercase());
            let is_base_root = s.contains("/characters/")
                && !s.contains("/skins/")
                && !s.contains("/animations/")
                && folder.as_deref().map(|f| name == format!("{}.bin", f)).unwrap_or(false);
            if is_base_root && std::fs::remove_file(&p).is_ok() {
                removed += 1;
                tracing::debug!("Pruned base character BIN: {}", s);
            }
        }
    }
    removed
}

/// Split + consolidate, 1:1 with old Quartz FrogChanger: for every seed skin
/// BIN in the output (all characters), split VFX/ANM into sibling BINs (if
/// enabled) THEN consolidate VFX assets (if enabled). `prefix` is the consolidate
/// folder prefix — the repath prefix in repath mode, or "" in skin-files-only
/// mode (target then `ASSETS/skin<N>_<champ>_particles/`). Fail-open.
fn run_split_and_consolidate(
    content_dir: &Path,
    skin_id: u32,
    split_vfx: bool,
    split_anm: bool,
    consolidate: bool,
    prefix: &str,
) {
    if !split_vfx && !split_anm && !consolidate {
        return;
    }

    let skin_bins = find_skin_bins(content_dir);
    if skin_bins.is_empty() {
        return;
    }

    if split_vfx || split_anm {
        for bin in &skin_bins {
            if split_vfx {
                if let Err(e) = crate::bin::bin_editor::split_one_kind(bin, "vfx") {
                    tracing::warn!("VFX split failed for {}: {}", bin.display(), e);
                }
            }
            if split_anm {
                if let Err(e) = crate::bin::bin_editor::split_one_kind(bin, "anm") {
                    tracing::warn!("ANM split failed for {}: {}", bin.display(), e);
                }
            }
        }
    }

    if consolidate {
        for (champ, skin_num, targets) in consolidate_targets(&skin_bins, content_dir, skin_id) {
            for target in targets {
                match crate::bin::bin_editor::consolidate_assets_repath(
                    &target, content_dir, prefix, &champ, skin_num,
                ) {
                    Ok(r) => tracing::info!(
                        "Consolidated {} VFX assets (of {} referenced) for '{}'",
                        r.moved, r.referenced, champ
                    ),
                    Err(e) => tracing::warn!("Consolidate failed for {}: {}", target.display(), e),
                }
            }
        }
    }
}

/// Every `data/characters/*/skins/skin*.bin` under `root` (old Quartz `findSkinBins`).
fn find_skin_bins(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                stack.push(p);
                continue;
            }
            let s = p.to_string_lossy().to_lowercase().replace('\\', "/");
            let name = p.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
            let is_skin = name.starts_with("skin")
                && name.ends_with(".bin")
                && name["skin".len()..name.len() - 4].chars().all(|c| c.is_ascii_digit())
                && !name["skin".len()..name.len() - 4].is_empty();
            if is_skin && s.contains("/characters/") && s.contains("/skins/") {
                out.push(p);
            }
        }
    }
    out
}

/// For each character, the BIN(s) consolidate should scan for this skin id:
/// the skin BIN and its `<champ>_vfx_skin<N>.bin` sibling (old Quartz's
/// `candidateBins`). Returns `(champ, skin_num, existing_bins)` per character.
fn consolidate_targets(
    skin_bins: &[PathBuf],
    content_dir: &Path,
    skin_id: u32,
) -> Vec<(String, u32, Vec<PathBuf>)> {
    let mut out = Vec::new();
    for sb in skin_bins {
        let s = sb.to_string_lossy().replace('\\', "/").to_lowercase();
        let Some(i) = s.find("/characters/") else { continue };
        let after = &s[i + "/characters/".len()..];
        let Some(slash) = after.find('/') else { continue };
        let champ = after[..slash].to_string();
        let vfx_sibling = content_dir
            .join("data")
            .join(format!("{}_vfx_skin{}.bin", champ, skin_id));
        let mut bins = vec![sb.clone()];
        if vfx_sibling.is_file() {
            bins.push(vfx_sibling);
        }
        out.push((champ, skin_id, bins));
    }
    out
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

/// A collision-free child directory of `parent`: tries `<name>`, then
/// `<name>_2`, `<name>_3`, ... until one doesn't exist. Mirrors the old
/// Electron `getUniqueOutputDir` so re-extracting the same skin never
/// overwrites a previous dump.
fn unique_dir(parent: &Path, name: &str) -> PathBuf {
    let first = parent.join(name);
    if !first.exists() {
        return first;
    }
    for n in 2..=999 {
        let candidate = parent.join(format!("{}_{}", name, n));
        if !candidate.exists() {
            return candidate;
        }
    }
    first
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

    fn opts_with<'a>(skin_id: u32, chroma_id: Option<u32>) -> ExtractOptions<'a> {
        ExtractOptions {
            league_root: Path::new("."),
            champion: "ahri",
            skin_id,
            output_dir: Path::new("."),
            include_vo: false,
            clean: false,
            chroma_id,
            preserve_hud_icons2d: false,
            skip_sfx: true,
        }
    }

    #[test]
    fn effective_skin_id_chroma_math() {
        // No chroma → plain skin id.
        assert_eq!(opts_with(14, None).effective_skin_id(), 14);
        // Chroma >= 1000 → id % 1000.
        assert_eq!(opts_with(14, Some(14001)).effective_skin_id(), 1);
        assert_eq!(opts_with(0, Some(103005)).effective_skin_id(), 5);
        // Chroma < 1000 → used verbatim (rare, but per spec).
        assert_eq!(opts_with(0, Some(7)).effective_skin_id(), 7);
    }

    #[test]
    fn folder_name_construction() {
        assert_eq!(skin_folder_name("ahri", 14, None, false), "ahri_skin14_extracted");
        assert_eq!(skin_folder_name("ahri", 14, None, true), "ahri_skin14_extracted_clean");
        assert_eq!(
            skin_folder_name("ahri", 1, Some(14001), false),
            "ahri_skin1_extracted_chroma_14001"
        );
        assert_eq!(
            skin_folder_name("ahri", 1, Some(14001), true),
            "ahri_skin1_extracted_chroma_14001_clean"
        );
    }

    #[test]
    fn skin_bin_matcher() {
        // Both roots, exact N, no leading zero.
        assert_eq!(skin_bin_match("data/characters/ahri/skins/skin14.bin", 14), Some("ahri"));
        assert_eq!(skin_bin_match("assets/characters/ahri/skins/skin14.bin", 14), Some("ahri"));
        // Leading zeros: skin0*N.
        assert_eq!(skin_bin_match("data/characters/ahri/skins/skin014.bin", 14), Some("ahri"));
        assert_eq!(skin_bin_match("data/characters/ahri/skins/skin0.bin", 0), Some("ahri"));
        assert_eq!(skin_bin_match("data/characters/ahri/skins/skin00.bin", 0), Some("ahri"));
        // Wrong N.
        assert_eq!(skin_bin_match("data/characters/ahri/skins/skin7.bin", 14), None);
        // Not a skins/*.bin directly (nested).
        assert_eq!(skin_bin_match("data/characters/ahri/skins/sub/skin14.bin", 14), None);
        // Wrong extension / not a skin file.
        assert_eq!(skin_bin_match("data/characters/ahri/skins/skin14.txt", 14), None);
        assert_eq!(skin_bin_match("data/characters/ahri/skins/root.bin", 0), None);
        // Wrong root.
        assert_eq!(skin_bin_match("misc/characters/ahri/skins/skin0.bin", 0), None);
    }

    #[test]
    fn pet_folder_filter() {
        assert!(pet_folder_match("assets/characters/pettftavatar/skins/skin1.bin", "pettftavatar"));
        assert!(pet_folder_match("data/characters/pettftavatar/hud/foo.dds", "pettftavatar"));
        assert!(!pet_folder_match("assets/characters/ahri/skins/skin1.bin", "pettftavatar"));
        // Guard against a prefix collision (pettft vs pettftavatar).
        assert!(!pet_folder_match("assets/characters/pettftavatarx/skins/skin1.bin", "pettftavatar"));
    }
}
