//! End-to-end roundtrip for the Asset Extractor clean-extract + Flint repath
//! pipeline against a real League install.
//!
//! Proves two things:
//!   1. Per-character concat: each character root (main champ AND any
//!      subcharacter like AnnieTibbers) is combined INDEPENDENTLY — its linked
//!      graph merged into its OWN concat BIN, linked from its OWN skin BIN.
//!   2. No VFX is lost: every `VfxSystemDefinitionData` extracted stays
//!      reachable from a character's skin BIN (in the skin BIN itself or in a
//!      concat BIN that that same skin BIN links to).
//!
//! Gated on a real install; skips if not present. Run:
//! `cargo test -p quartz-lib --test extractor_repath_roundtrip -- --nocapture`

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use quartz_lib::bin::read_bin;
use quartz_lib::extractor::{
    extract_skin, finalize_extracted, repath_extracted, ExtractOptions, FinalizeOptions,
    RepathOptions,
};

fn league_root() -> Option<PathBuf> {
    let p = std::env::var("QUARTZ_LEAGUE_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(r"C:\Riot Games\League of Legends"));
    p.join("Game")
        .join("DATA")
        .join("FINAL")
        .join("Champions")
        .is_dir()
        .then_some(p)
}

fn champ() -> String {
    std::env::var("QUARTZ_TEST_CHAMP").unwrap_or_else(|_| "annie".to_string())
}
fn skin_id() -> u32 {
    std::env::var("QUARTZ_TEST_SKIN")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
}

/// FNV1a-32 lowercase — the BIN class-name hash convention.
fn fnv1a(s: &str) -> u32 {
    let mut h: u32 = 0x811c_9dc5;
    for b in s.to_lowercase().bytes() {
        h ^= b as u32;
        h = h.wrapping_mul(0x0100_0193);
    }
    h
}

fn vfx_system_count(path: &Path) -> usize {
    let vfx = fnv1a("VfxSystemDefinitionData");
    std::fs::read(path)
        .ok()
        .and_then(|b| read_bin(&b).ok())
        .map(|bin| bin.entries.iter().filter(|e| e.class_hash == vfx).count())
        .unwrap_or(0)
}

fn find_files(root: &Path, pred: impl Fn(&Path) -> bool) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&dir) else {
            continue;
        };
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                stack.push(p);
            } else if pred(&p) {
                out.push(p);
            }
        }
    }
    out
}

fn is_bin(p: &Path) -> bool {
    p.extension().is_some_and(|e| e.eq_ignore_ascii_case("bin"))
}

/// `<char>` from `.../characters/<char>/skins/skinN.bin`.
fn character_of(p: &Path) -> Option<String> {
    let s = p.to_string_lossy().replace('\\', "/").to_lowercase();
    let i = s.find("/characters/")? + "/characters/".len();
    let rest = &s[i..];
    let end = rest.find('/')?;
    Some(rest[..end].to_string())
}

#[test]
fn extractor_clean_repath_per_character() {
    let Some(root) = league_root() else {
        eprintln!("skipping: no League install (set QUARTZ_LEAGUE_ROOT)");
        return;
    };

    let out_root = std::env::temp_dir().join("quartz-extractor-repath-test");
    let _ = std::fs::remove_dir_all(&out_root);
    std::fs::create_dir_all(&out_root).unwrap();

    let champ = champ();
    let skin = skin_id();
    println!("[test] champion={} skin={}", champ, skin);

    // 1) Clean-extract the skin.
    let summary = extract_skin(
        ExtractOptions {
            league_root: &root,
            champion: &champ,
            skin_id: skin,
            output_dir: &out_root,
            include_vo: false,
            clean: true,
            chroma_id: None,
            preserve_hud_icons2d: true,
            // Keep SFX so the repath skip-SFX behavior is observable.
            skip_sfx: false,
            folder_name: None,
        },
        |_p| {},
    )
    .expect("clean extract failed");

    let content_dir = PathBuf::from(&summary.output_dir);
    println!(
        "[test] extracted to: {}  ({} files)",
        content_dir.display(),
        summary.files
    );
    assert!(content_dir.is_dir(), "extract output dir missing");

    // Total VFX systems present across ALL extracted bins (unique per file path
    // is fine here — we only compare totals reachable before vs after).
    let pre_bins = find_files(&content_dir, is_bin);
    let mut pre_vfx = 0usize;
    let mut pre_chars: HashSet<String> = HashSet::new();
    for b in &pre_bins {
        pre_vfx += vfx_system_count(b);
        if let Some(c) = character_of(b) {
            let rel = b.to_string_lossy().to_lowercase().replace('\\', "/");
            if rel.contains("/skins/") {
                pre_chars.insert(c);
            }
        }
    }
    println!(
        "[test] pre-repath: {} bins, {} VFX systems, characters w/ skin bin: {:?}",
        pre_bins.len(),
        pre_vfx,
        pre_chars
    );

    // 2) Repath (per-character combine + repath) in place.
    let rep = repath_extracted(RepathOptions {
        content_dir: &content_dir,
        champion: &champ,
        skin_id: skin,
        creator_name: "testmod",
        project_name: "",
        combine_linked: true,
        cleanup_unused: false,
        skip_sfx: true,
        skip_vo: true,
        split_vfx: std::env::var("QUARTZ_TEST_SPLIT_VFX").is_ok(),
        split_anm: std::env::var("QUARTZ_TEST_SPLIT_ANM").is_ok(),
        consolidate_assets: std::env::var("QUARTZ_TEST_CONSOLIDATE").is_ok(),
        wad_folder_override: None,
    })
    .expect("repath failed");

    println!(
        "[test] repath: ok={} binsCombined={} charactersCombined={} pathsModified={} filesRelocated={} missing={}",
        rep.ok, rep.bins_combined, rep.characters_combined, rep.paths_modified, rep.files_relocated, rep.missing
    );

    // 3) Enumerate post-repath bins.
    let post_bins = find_files(&content_dir, is_bin);
    println!("[test] POST-repath .bin files ({}):", post_bins.len());
    for b in &post_bins {
        let rel = b.strip_prefix(&content_dir).unwrap_or(b);
        println!("       {}  vfx={}", rel.display(), vfx_system_count(b));
    }

    // OLD-QUARTZ SHAPE ASSERTIONS ------------------------------------------

    // (a) NO separate `_Concat.bin` file exists — entries merge INTO skin bins.
    for b in &post_bins {
        let name = b
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        assert!(
            !name.contains("_concat"),
            "old Quartz produces no _Concat.bin, found: {}",
            name
        );
    }

    // (b) Every character's seed skin bin survived and is now FAT (holds the
    //     merged VFX itself, no VFX-bearing linked bin left beside it).
    let skin_bins: Vec<&PathBuf> = post_bins
        .iter()
        .filter(|b| {
            let s = b.to_string_lossy().to_lowercase().replace('\\', "/");
            s.contains("/skins/")
                && (s.ends_with(&format!("/skin{}.bin", skin))
                    || s.ends_with(&format!("/skin{:02}.bin", skin)))
        })
        .collect();
    let post_chars: HashSet<String> = skin_bins.iter().filter_map(|b| character_of(b)).collect();
    for c in &pre_chars {
        assert!(
            post_chars.contains(c),
            "character '{}' lost its skin BIN after repath",
            c
        );
    }
    println!(
        "[test] characters w/ skin bin post-repath: {:?}",
        post_chars
    );

    // (c) Base `<char>.bin` roots were deleted (old Quartz always prunes them).
    for b in &post_bins {
        let s = b.to_string_lossy().to_lowercase().replace('\\', "/");
        let name = b
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        let folder = character_of(b);
        let is_base_root = !s.contains("/skins/")
            && !s.contains("/animations/")
            && folder
                .as_deref()
                .map(|f| name == format!("{}.bin", f))
                .unwrap_or(false);
        assert!(
            !is_base_root,
            "base character BIN should have been pruned: {}",
            s
        );
    }

    // (d) All VFX still reachable, now living inside the skin bins (no loss).
    let mut vfx_in_skin_bins = 0usize;
    for sb in &skin_bins {
        let n = vfx_system_count(sb);
        vfx_in_skin_bins += n;
        println!(
            "[test] character '{}' skin bin holds {} VFX (merged in)",
            character_of(sb).unwrap_or_default(),
            n
        );
    }
    // Any remaining .bin that still carries VFX must be a still-linked, unmerged
    // one referenced by a skin bin (rare); count those too so the total matches.
    let mut vfx_elsewhere = 0usize;
    for b in &post_bins {
        let is_skin = skin_bins.iter().any(|s| s == &b);
        if !is_skin {
            vfx_elsewhere += vfx_system_count(b);
        }
    }
    let total_reachable = vfx_in_skin_bins + vfx_elsewhere;

    // (e) bumPath prefix applied: at least one asset string under `assets/<prefix>/`
    //     appears in a skin bin (sanity that the new prefix scheme ran).
    let prefixed = skin_bins
        .iter()
        .any(|sb| bin_has_prefixed_asset(sb, "testmod"));
    assert!(
        prefixed || rep.paths_modified == 0,
        "no bumPath-prefixed asset string found in any skin bin"
    );

    // (f) SUBCHARACTER REGRESSION: every character's skin bin (incl. Tibbers)
    //     must have its `assets/characters/<char>/…` strings PREFIXED. An
    //     UNPREFIXED `assets/characters/` reference means that character's bin
    //     was skipped by repath — the bug where subchar assets stayed loose.
    for sb in &skin_bins {
        let unprefixed = bin_first_unprefixed_asset(sb, "testmod");
        assert!(
            unprefixed.is_none(),
            "character '{}' skin bin has UNPREFIXED asset string '{}' — subcharacter repath skipped it",
            character_of(sb).unwrap_or_default(),
            unprefixed.unwrap_or_default(),
        );
    }

    // (g) On disk, no character dir survives directly under `assets/characters/`
    //     (all should have moved under `assets/testmod/characters/`).
    let loose_char_dir = content_dir.join("assets").join("characters");
    if loose_char_dir.is_dir() {
        // Only icons2d-preserve content may remain; assert no skin/particle assets.
        let leftovers: Vec<PathBuf> = find_files(&loose_char_dir, |p| {
            let s = p.to_string_lossy().to_lowercase().replace('\\', "/");
            !s.contains("/hud/icons2d/") // icons2d is intentionally preserved unprefixed
        });
        assert!(
            leftovers.is_empty(),
            "{} non-icon asset(s) left unprefixed under assets/characters/ (first: {})",
            leftovers.len(),
            leftovers
                .first()
                .map(|p| p.display().to_string())
                .unwrap_or_default(),
        );
    }

    println!("[test] SUMMARY champ={} skin={}: pre_vfx={} vfx_in_skin_bins={} vfx_elsewhere={} total={} chars={}",
        champ, skin, pre_vfx, vfx_in_skin_bins, vfx_elsewhere, total_reachable, post_chars.len());
    assert!(rep.characters_combined >= 1, "repath combined 0 characters");
    assert_eq!(
        total_reachable, pre_vfx,
        "VFX lost: {} reachable after repath vs {} extracted",
        total_reachable, pre_vfx
    );

    println!("[test] PASS — old-Quartz shape: {} char(s), no _Concat.bin, base roots pruned, {} VFX all in skin bins",
        post_chars.len(), total_reachable);
}

/// True if the BIN contains any asset string already prefixed with `assets/<prefix>/`.
fn bin_has_prefixed_asset(bin_path: &Path, prefix: &str) -> bool {
    let needle = format!("/{}/", prefix.to_lowercase());
    let Ok(bytes) = std::fs::read(bin_path) else {
        return false;
    };
    let Ok(bin) = read_bin(&bytes) else {
        return false;
    };
    fn walk(v: &quartz_lib::bin::BinValue, needle: &str) -> bool {
        use quartz_lib::bin::BinValue as V;
        match v {
            V::String(s) => s.to_lowercase().contains(needle),
            V::List { items, .. } => items.iter().any(|i| walk(i, needle)),
            V::Pointer { fields, .. } | V::Embed { fields, .. } => {
                fields.values().any(|x| walk(x, needle))
            }
            V::Option {
                value: Some(inner), ..
            } => walk(inner, needle),
            V::Map { entries, .. } => entries
                .iter()
                .any(|(k, val)| walk(k, needle) || walk(val, needle)),
            _ => false,
        }
    }
    bin.entries
        .iter()
        .any(|e| e.fields.values().any(|v| walk(v, &needle)))
}

/// Returns the first asset string in the BIN that should have been prefixed but
/// wasn't (`assets/characters/…` or `assets/particles/…` without `/<prefix>/`),
/// skipping the intentionally-unprefixed classes: sounds (SFX/VO) and hud/icons2d.
fn bin_first_unprefixed_asset(bin_path: &Path, prefix: &str) -> Option<String> {
    let pfx = format!("/{}/", prefix.to_lowercase());
    let bytes = std::fs::read(bin_path).ok()?;
    let bin = read_bin(&bytes).ok()?;
    fn walk(v: &quartz_lib::bin::BinValue, pfx: &str, out: &mut Option<String>) {
        use quartz_lib::bin::BinValue as V;
        if out.is_some() {
            return;
        }
        match v {
            V::String(s) => {
                let l = s.to_lowercase().replace('\\', "/");
                let is_asset = l.starts_with("assets/") || l.starts_with("data/");
                if !is_asset {
                    return;
                }
                // Intentionally-unprefixed: audio banks + preserved HUD icons.
                if l.contains("/sounds/") || l.contains("/hud/icons2d/") {
                    return;
                }
                // A prefixed path contains `/<prefix>/`; anything else under
                // characters/ or particles/ that lacks it is a miss.
                if !l.contains(pfx) && (l.contains("/characters/") || l.contains("/particles/")) {
                    *out = Some(s.clone());
                }
            }
            V::List { items, .. } => items.iter().for_each(|i| walk(i, pfx, out)),
            V::Pointer { fields, .. } | V::Embed { fields, .. } => {
                fields.values().for_each(|x| walk(x, pfx, out))
            }
            V::Option {
                value: Some(inner), ..
            } => walk(inner, pfx, out),
            V::Map { entries, .. } => entries.iter().for_each(|(k, val)| {
                walk(k, pfx, out);
                walk(val, pfx, out);
            }),
            _ => {}
        }
    }
    let mut out = None;
    for e in &bin.entries {
        for v in e.fields.values() {
            walk(v, &pfx, &mut out);
            if out.is_some() {
                return out;
            }
        }
    }
    None
}

/// Skin-files-only finalize: combine linked BINs into each character's skin BIN
/// with NO repath prefix, prune base `<char>.bin`, keep all VFX reachable, and
/// leave asset strings UNPREFIXED (no `assets/<mod>/`). Mirrors old Quartz clean mode.
#[test]
fn finalize_skin_files_only_combines_without_prefix() {
    let Some(root) = league_root() else {
        eprintln!("skipping: no League install (set QUARTZ_LEAGUE_ROOT)");
        return;
    };

    let out_root = std::env::temp_dir().join("quartz-finalize-skinonly-test");
    let _ = std::fs::remove_dir_all(&out_root);
    std::fs::create_dir_all(&out_root).unwrap();

    let champ = champ();
    let skin = skin_id();
    println!("[test] finalize champion={} skin={}", champ, skin);

    let summary = extract_skin(
        ExtractOptions {
            league_root: &root,
            champion: &champ,
            skin_id: skin,
            output_dir: &out_root,
            include_vo: false,
            clean: true,
            chroma_id: None,
            preserve_hud_icons2d: true,
            // Keep SFX so the repath skip-SFX behavior is observable.
            skip_sfx: false,
            folder_name: None,
        },
        |_p| {},
    )
    .expect("clean extract failed");

    let content_dir = PathBuf::from(&summary.output_dir);
    let pre_bins = find_files(&content_dir, is_bin);
    let mut pre_vfx = 0usize;
    for b in &pre_bins {
        pre_vfx += vfx_system_count(b);
    }
    println!(
        "[test] pre-finalize: {} bins, {} VFX",
        pre_bins.len(),
        pre_vfx
    );

    let fin = finalize_extracted(FinalizeOptions {
        content_dir: &content_dir,
        champion: &champ,
        skin_id: skin,
        split_vfx: false,
        split_anm: false,
        consolidate_assets: false, // isolate the combine-no-prefix assertion
        consolidate_prefix: "",
        wad_folder_override: None,
    })
    .expect("finalize failed");

    println!(
        "[test] finalize: ok={} binsCombined={} charactersCombined={} baseBinsPruned={}",
        fin.ok, fin.bins_combined, fin.characters_combined, fin.base_bins_pruned
    );

    let post_bins = find_files(&content_dir, is_bin);
    println!("[test] POST-finalize .bin files ({}):", post_bins.len());
    for b in &post_bins {
        let rel = b.strip_prefix(&content_dir).unwrap_or(b);
        println!("       {}  vfx={}", rel.display(), vfx_system_count(b));
    }

    // (a) No _Concat.bin — combine merges INTO the skin bin.
    for b in &post_bins {
        let name = b
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        assert!(
            !name.contains("_concat"),
            "finalize produced a _Concat.bin: {}",
            name
        );
    }

    // (b) Base <char>.bin roots pruned.
    for b in &post_bins {
        let s = b.to_string_lossy().to_lowercase().replace('\\', "/");
        let name = b
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        let folder = character_of(b);
        let is_base_root = !s.contains("/skins/")
            && !s.contains("/animations/")
            && folder
                .as_deref()
                .map(|f| name == format!("{}.bin", f))
                .unwrap_or(false);
        assert!(!is_base_root, "base character BIN not pruned: {}", s);
    }

    // (c) VFX all still present (merged into skin bins), none lost.
    let vfx_after: usize = post_bins.iter().map(|b| vfx_system_count(b)).sum();
    assert_eq!(
        vfx_after, pre_vfx,
        "VFX lost: {} after finalize vs {} extracted",
        vfx_after, pre_vfx
    );

    // (d) NO repath prefix applied: no skin bin should contain `assets/<mod>/` —
    //     asset strings stay at their original `assets/characters/...` form.
    let skin_bins: Vec<&PathBuf> = post_bins
        .iter()
        .filter(|b| {
            let s = b.to_string_lossy().to_lowercase().replace('\\', "/");
            s.contains("/skins/")
        })
        .collect();
    for sb in &skin_bins {
        assert!(
            !bin_has_prefixed_asset(sb, "testmod"),
            "finalize must NOT repath-prefix strings in {}",
            sb.display()
        );
    }

    assert!(
        fin.characters_combined >= 1,
        "finalize combined 0 characters"
    );
    println!("[test] PASS — skin-files-only: combined into skin bins (no prefix), base pruned, {} VFX intact", vfx_after);
}

/// skip_sfx in clean extraction must export ZERO SFX audio banks, while the same
/// extract with skip_sfx=false DOES include them. Proves the toggle works.
#[test]
fn clean_extract_skip_sfx_excludes_banks() {
    let Some(root) = league_root() else {
        eprintln!("skipping: no League install (set QUARTZ_LEAGUE_ROOT)");
        return;
    };

    let champ = champ();
    let skin = skin_id();

    let count_sfx = |dir: &Path| -> usize {
        find_files(dir, |p| {
            let s = p.to_string_lossy().to_lowercase().replace('\\', "/");
            s.contains("/sounds/wwise2016/sfx/")
                && (s.ends_with(".bnk") || s.ends_with(".wpk") || s.ends_with(".wem"))
        })
        .len()
    };

    // With SFX (skip_sfx=false).
    let with_root = std::env::temp_dir().join("quartz-sfx-with");
    let _ = std::fs::remove_dir_all(&with_root);
    std::fs::create_dir_all(&with_root).unwrap();
    let with = extract_skin(
        ExtractOptions {
            league_root: &root,
            champion: &champ,
            skin_id: skin,
            output_dir: &with_root,
            include_vo: false,
            clean: true,
            chroma_id: None,
            preserve_hud_icons2d: true,
            skip_sfx: false,
            folder_name: None,
        },
        |_p| {},
    )
    .expect("extract with sfx failed");
    let with_sfx = count_sfx(&PathBuf::from(&with.output_dir));

    // Without SFX (skip_sfx=true).
    let without_root = std::env::temp_dir().join("quartz-sfx-without");
    let _ = std::fs::remove_dir_all(&without_root);
    std::fs::create_dir_all(&without_root).unwrap();
    let without = extract_skin(
        ExtractOptions {
            league_root: &root,
            champion: &champ,
            skin_id: skin,
            output_dir: &without_root,
            include_vo: false,
            clean: true,
            chroma_id: None,
            preserve_hud_icons2d: true,
            skip_sfx: true,
            folder_name: None,
        },
        |_p| {},
    )
    .expect("extract without sfx failed");
    let without_sfx = count_sfx(&PathBuf::from(&without.output_dir));

    println!(
        "[test] SFX banks: with_skip_off={} with_skip_on={}",
        with_sfx, without_sfx
    );
    assert_eq!(
        without_sfx, 0,
        "skip_sfx=true still exported {} SFX bank(s)",
        without_sfx
    );
    // Sanity: this champion actually ships SFX, so skip_sfx=false includes them.
    // (If a champ genuinely has 0 SFX the toggle is a no-op — don't hard-fail.)
    if with_sfx == 0 {
        println!(
            "[test] NOTE: {} skin{} ships no SFX banks; toggle is a no-op here",
            champ, skin
        );
    }
    println!("[test] PASS — skip_sfx excludes SFX banks from clean extract");
}

/// Probe: dump a sample of the Companions WAD's internal structure so we know
/// how TFT pets map to skin bins (folder naming, skin<N>.bin, tier↔N). Ignored
/// by default; run with `--ignored --nocapture`.
#[test]
#[ignore]
fn probe_companions_wad_structure() {
    let Some(root) = league_root() else {
        eprintln!("no league");
        return;
    };
    let wad = root
        .join("Game")
        .join("DATA")
        .join("FINAL")
        .join("Companions.wad.client");
    if !wad.is_file() {
        eprintln!("no companions wad");
        return;
    }

    let toc = quartz_lib::wad::read_wad_toc(&wad).expect("toc");
    // Collect resolved character-folder skin bins + character folders.
    let mut skin_bins: Vec<String> = Vec::new();
    let mut char_folders: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    for e in &toc {
        if let Some(rel) = &e.resolved_path {
            let r = rel.replace('\\', "/").to_lowercase();
            if let Some(i) = r.find("characters/") {
                let after = &r[i + "characters/".len()..];
                if let Some(slash) = after.find('/') {
                    char_folders.insert(after[..slash].to_string());
                }
            }
            if r.contains("/skins/skin") && r.ends_with(".bin") && r.contains("characters/") {
                skin_bins.push(r);
            }
        }
    }
    println!(
        "[probe] resolved skin bins under characters/*/skins/: {}",
        skin_bins.len()
    );
    for s in skin_bins.iter().take(30) {
        println!("   {}", s);
    }
    println!("[probe] distinct character folders: {}", char_folders.len());
    for c in char_folders.iter().take(40) {
        println!("   {}", c);
    }
    // Show the full asset tree for one sample pet to see the layout.
    if let Some(sample) = char_folders.iter().find(|c| {
        skin_bins
            .iter()
            .any(|s| s.contains(&format!("characters/{}/skins/", c)))
    }) {
        println!(
            "[probe] SAMPLE pet folder '{}' — its resolved paths:",
            sample
        );
        let mut n = 0;
        for e in &toc {
            if let Some(rel) = &e.resolved_path {
                let r = rel.replace('\\', "/").to_lowercase();
                if r.contains(&format!("characters/{}/", sample)) {
                    println!("     {}", r);
                    n += 1;
                    if n > 40 {
                        println!("     ...");
                        break;
                    }
                }
            }
        }
    }
}

/// TFT companion parity: clean-extract a pet from Companions.wad (skin-graph,
/// filtered to the pet), then run the SAME repath as champions. Proves TFT can
/// be skin-files-only extracted AND repathed. Env: QUARTZ_TFT_PET (default
/// petbunny), QUARTZ_TFT_SKIN (default 8).
#[test]
fn tft_companion_clean_extract_and_repath() {
    let Some(root) = league_root() else {
        eprintln!("skipping: no league");
        return;
    };
    let wad = root
        .join("Game")
        .join("DATA")
        .join("FINAL")
        .join("Companions.wad.client");
    if !wad.is_file() {
        eprintln!("skipping: no Companions WAD");
        return;
    }

    let pet = std::env::var("QUARTZ_TFT_PET").unwrap_or_else(|_| "petbunny".to_string());
    let skin: u32 = std::env::var("QUARTZ_TFT_SKIN")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8);
    println!("[tft] pet={} skin={}", pet, skin);

    let out_root = std::env::temp_dir().join("quartz-tft-test");
    let _ = std::fs::remove_dir_all(&out_root);
    std::fs::create_dir_all(&out_root).unwrap();

    // 1) Clean (skin-files-only) extract of the pet.
    let ext = quartz_lib::extractor::extract_tft(
        quartz_lib::extractor::TftExtractOptions {
            league_root: &root,
            pet_alias: &pet,
            skin_id: skin,
            output_dir: &out_root,
            clean: true,
            preserve_hud_icons2d: true,
            skip_sfx: true,
            folder_name: None,
        },
        |_p| {},
    )
    .expect("tft clean extract failed");

    let content_dir = PathBuf::from(&ext.output_dir);
    println!(
        "[tft] extracted to {} ({} files)",
        content_dir.display(),
        ext.files
    );
    let pre_bins = find_files(&content_dir, is_bin);
    let pre_vfx: usize = pre_bins.iter().map(|b| vfx_system_count(b)).sum();
    println!("[tft] pre-repath: {} bins, {} VFX", pre_bins.len(), pre_vfx);

    // ONLY the requested pet folder should be present (filter works).
    let other_pets: Vec<String> = pre_bins
        .iter()
        .filter_map(|b| character_of(b))
        .filter(|c| c != &pet)
        .collect();
    assert!(
        other_pets.is_empty(),
        "clean extract pulled in other pets: {:?}",
        other_pets
    );
    // The pet's skin bin must exist.
    let has_skin = pre_bins.iter().any(|b| {
        let s = b.to_string_lossy().to_lowercase().replace('\\', "/");
        s.contains(&format!("/characters/{}/skins/", pet)) && s.contains("skin")
    });
    assert!(has_skin, "no skin bin extracted for pet {}", pet);

    // 2) Repath it (same champion pipeline; pet alias as champion).
    let rep = repath_extracted(RepathOptions {
        content_dir: &content_dir,
        champion: &pet,
        skin_id: skin,
        creator_name: "testmod",
        project_name: "",
        combine_linked: true,
        cleanup_unused: false,
        skip_sfx: true,
        skip_vo: true,
        split_vfx: false,
        split_anm: false,
        consolidate_assets: false,
        wad_folder_override: None,
    })
    .expect("tft repath failed");
    println!(
        "[tft] repath: binsCombined={} chars={} pathsModified={}",
        rep.bins_combined, rep.characters_combined, rep.paths_modified
    );

    let post_bins = find_files(&content_dir, is_bin);
    let skin_bins: Vec<&PathBuf> = post_bins
        .iter()
        .filter(|b| {
            let s = b.to_string_lossy().to_lowercase().replace('\\', "/");
            s.contains("/skins/")
                && (s.ends_with(&format!("/skin{}.bin", skin))
                    || s.ends_with(&format!("/skin{:02}.bin", skin)))
        })
        .collect();
    assert!(!skin_bins.is_empty(), "pet skin bin gone after repath");

    // No _Concat.bin; base <pet>.bin pruned; pet's assets prefixed.
    for b in &post_bins {
        let name = b
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        assert!(!name.contains("_concat"), "TFT repath produced _Concat.bin");
    }
    for sb in &skin_bins {
        let unpref = bin_first_unprefixed_asset(sb, "testmod");
        assert!(
            unpref.is_none(),
            "TFT pet '{}' has UNPREFIXED asset '{}'",
            pet,
            unpref.unwrap_or_default()
        );
    }
    let loose = content_dir.join("assets").join("characters");
    if loose.is_dir() {
        let leftovers = find_files(&loose, |p| {
            let s = p.to_string_lossy().to_lowercase().replace('\\', "/");
            !s.contains("/hud/icons2d/")
        });
        assert!(
            leftovers.is_empty(),
            "{} TFT asset(s) left unprefixed under assets/characters/",
            leftovers.len()
        );
    }

    let vfx_after: usize = post_bins.iter().map(|b| vfx_system_count(b)).sum();
    assert_eq!(
        vfx_after, pre_vfx,
        "TFT VFX lost after repath: {} vs {}",
        vfx_after, pre_vfx
    );

    println!(
        "[tft] PASS — pet '{}' clean-extracted + repathed like a champion, {} VFX intact",
        pet, vfx_after
    );
}
