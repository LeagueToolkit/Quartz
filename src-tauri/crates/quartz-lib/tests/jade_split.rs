//! Live-install integration tests for the legacy ("Jade") champion split.
//!
//! League ships the pre-rework 2012-era champions INSIDE the modern champion's
//! WAD under a `jade_`-prefixed character folder — `Annie.wad.client` carries
//! both `annie/` (~334 MB) and `jade_annie/` (~132 MB). These tests pin that an
//! extraction yields exactly one of the two sets.
//!
//! They need a real League install, so they are `#[ignore]` by default:
//!
//! ```text
//! cargo test -p quartz-lib --test jade_split -- --ignored --nocapture
//! ```
//!
//! Set `QUARTZ_LEAGUE_ROOT` to override the install path.

use quartz_lib::extractor::{self, ExtractOptions};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

fn league_root() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("QUARTZ_LEAGUE_ROOT") {
        let p = PathBuf::from(p);
        return extractor::is_valid_league_root(&p).then_some(p);
    }
    extractor::detect_league_path_by_common_paths()
}

/// Extract one skin into a temp dir and return every written path, lowercased
/// and `/`-separated, relative to the extraction root.
fn extract_rel_paths(root: &Path, champion: &str, skin_id: u32, out: &Path) -> Vec<String> {
    let summary = extractor::extract_skin(
        ExtractOptions {
            league_root: root,
            champion,
            skin_id,
            output_dir: out,
            include_vo: false,
            clean: true,
            chroma_id: None,
            preserve_hud_icons2d: true,
            skip_sfx: true,
        },
        |_| {},
    )
    .unwrap_or_else(|e| panic!("extract {champion} skin{skin_id} failed: {e}"));

    let extract_root = PathBuf::from(&summary.output_dir);
    WalkDir::new(&extract_root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| {
            e.path()
                .strip_prefix(&extract_root)
                .ok()
                .map(|r| r.to_string_lossy().replace('\\', "/").to_lowercase())
        })
        .collect()
}

/// Character folders touched by a set of extracted rel paths.
fn character_folders(paths: &[String]) -> std::collections::BTreeSet<String> {
    let mut out = std::collections::BTreeSet::new();
    for p in paths {
        let Some(rest) = p
            .strip_prefix("assets/characters/")
            .or_else(|| p.strip_prefix("data/characters/"))
        else {
            continue;
        };
        if let Some((folder, _)) = rest.split_once('/') {
            out.insert(folder.to_string());
        }
    }
    out
}

#[test]
#[ignore = "needs a real League install"]
fn modern_extraction_contains_no_legacy_assets() {
    let Some(root) = league_root() else {
        eprintln!("skipping: no League install found");
        return;
    };
    let tmp = tempfile::tempdir().expect("tempdir");
    let paths = extract_rel_paths(&root, "Annie", 1, tmp.path());

    assert!(!paths.is_empty(), "extraction wrote nothing");

    let leaked: Vec<&String> = paths.iter().filter(|p| p.contains("/jade_")).collect();
    assert!(
        leaked.is_empty(),
        "modern Annie extraction leaked {} legacy files, e.g. {:?}",
        leaked.len(),
        &leaked[..leaked.len().min(5)]
    );

    let folders = character_folders(&paths);
    assert!(
        folders.contains("annie"),
        "expected the modern annie folder, got {folders:?}"
    );
}

#[test]
#[ignore = "needs a real League install"]
fn legacy_extraction_contains_only_legacy_assets() {
    let Some(root) = league_root() else {
        eprintln!("skipping: no League install found");
        return;
    };
    let tmp = tempfile::tempdir().expect("tempdir");
    let paths = extract_rel_paths(&root, "Jade_Annie", 1, tmp.path());

    assert!(!paths.is_empty(), "legacy extraction wrote nothing");

    let folders = character_folders(&paths);
    assert!(
        folders.contains("jade_annie"),
        "expected the jade_annie folder, got {folders:?}"
    );
    let modern: Vec<&String> = folders
        .iter()
        .filter(|f| !f.starts_with("jade_"))
        .collect();
    assert!(
        modern.is_empty(),
        "legacy extraction leaked modern character folders: {modern:?}"
    );
}

/// Legacy Wukong is aliased `Jade_Wukong` but lives in `MonkeyKing.wad.client`,
/// so his is the one mapping the `jade_` strip alone does not cover.
#[test]
#[ignore = "needs a real League install"]
fn legacy_wukong_resolves_through_the_monkeyking_wad() {
    let Some(root) = league_root() else {
        eprintln!("skipping: no League install found");
        return;
    };
    let tmp = tempfile::tempdir().expect("tempdir");
    let paths = extract_rel_paths(&root, "Jade_Wukong", 0, tmp.path());

    let folders = character_folders(&paths);
    assert!(
        folders.contains("jade_wukong"),
        "expected jade_wukong, got {folders:?}"
    );
    assert!(
        !folders.iter().any(|f| f == "monkeyking"),
        "legacy Wukong extraction leaked the modern monkeyking folder: {folders:?}"
    );
}

/// Whole-WAD ("everything") mode is a separate code path from the clean skin
/// graph, and it must respect the split too — otherwise ~29% of every dump is
/// still the wrong champion.
#[test]
#[ignore = "needs a real League install"]
fn whole_wad_mode_respects_the_split() {
    let Some(root) = league_root() else {
        eprintln!("skipping: no League install found");
        return;
    };

    for (champion, want_prefix, reject) in [
        ("Annie", "annie", true),
        ("Jade_Annie", "jade_annie", false),
    ] {
        let tmp = tempfile::tempdir().expect("tempdir");
        let summary = extractor::extract_skin(
            ExtractOptions {
                league_root: &root,
                champion,
                skin_id: 1,
                output_dir: tmp.path(),
                include_vo: false,
                clean: false, // whole-WAD mode
                chroma_id: None,
                preserve_hud_icons2d: true,
                skip_sfx: false,
            },
            |_| {},
        )
        .unwrap_or_else(|e| panic!("whole-wad extract {champion} failed: {e}"));

        let extract_root = PathBuf::from(&summary.output_dir);
        let paths: Vec<String> = WalkDir::new(&extract_root)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .filter_map(|e| {
                e.path()
                    .strip_prefix(&extract_root)
                    .ok()
                    .map(|r| r.to_string_lossy().replace('\\', "/").to_lowercase())
            })
            .collect();

        let folders = character_folders(&paths);
        assert!(
            folders.contains(want_prefix),
            "{champion}: expected folder {want_prefix}, got {folders:?}"
        );
        if reject {
            let leaked: Vec<&String> =
                folders.iter().filter(|f| f.starts_with("jade_")).collect();
            assert!(
                leaked.is_empty(),
                "{champion}: whole-WAD mode leaked legacy folders {leaked:?}"
            );
        } else {
            let leaked: Vec<&String> = folders
                .iter()
                .filter(|f| !f.starts_with("jade_"))
                .collect();
            assert!(
                leaked.is_empty(),
                "{champion}: whole-WAD mode leaked modern folders {leaked:?}"
            );
        }
    }
}

/// The two sides must land in different output folders so re-extracting one
/// never overwrites the other.
#[test]
#[ignore = "needs a real League install"]
fn modern_and_legacy_write_to_distinct_folders() {
    let Some(root) = league_root() else {
        eprintln!("skipping: no League install found");
        return;
    };
    let tmp = tempfile::tempdir().expect("tempdir");

    for champ in ["Annie", "Jade_Annie"] {
        extractor::extract_skin(
            ExtractOptions {
                league_root: &root,
                champion: champ,
                skin_id: 1,
                output_dir: tmp.path(),
                include_vo: false,
                clean: true,
                chroma_id: None,
                preserve_hud_icons2d: true,
                skip_sfx: true,
            },
            |_| {},
        )
        .unwrap_or_else(|e| panic!("extract {champ} failed: {e}"));
    }

    let dirs: Vec<String> = std::fs::read_dir(tmp.path())
        .expect("read tmp")
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .map(|e| e.file_name().to_string_lossy().to_lowercase())
        .collect();

    assert!(
        dirs.iter().any(|d| d.starts_with("annie_skin1")),
        "missing modern output folder: {dirs:?}"
    );
    assert!(
        dirs.iter().any(|d| d.starts_with("jade_annie_skin1")),
        "missing legacy output folder: {dirs:?}"
    );
}

/// Full pipeline parity: a legacy extraction must survive the same
/// clean-mode finalize (combine linked BINs, prune base BINs, consolidate)
/// the UI runs after every "Skin Files Only" extract.
#[test]
#[ignore = "needs a real League install"]
fn legacy_extraction_finalizes_like_a_modern_one() {
    let Some(root) = league_root() else {
        eprintln!("skipping: no League install found");
        return;
    };
    let tmp = tempfile::tempdir().expect("tempdir");

    let summary = extractor::extract_skin(
        ExtractOptions {
            league_root: &root,
            champion: "Jade_Annie",
            skin_id: 1,
            output_dir: tmp.path(),
            include_vo: false,
            clean: true,
            chroma_id: None,
            preserve_hud_icons2d: true,
            skip_sfx: true,
        },
        |_| {},
    )
    .expect("legacy extract");

    let fin = extractor::finalize_extracted(extractor::FinalizeOptions {
        content_dir: Path::new(&summary.output_dir),
        champion: "jade_annie",
        skin_id: 1,
        split_vfx: false,
        split_anm: false,
        consolidate_assets: true,
        consolidate_prefix: "",
        wad_folder_override: None,
    })
    .expect("finalize legacy extraction");

    assert!(
        fin.bins_combined > 0,
        "finalize combined no BINs for the legacy skin: {fin:?}"
    );

    // And the finalized tree is still legacy-only.
    let paths: Vec<String> = WalkDir::new(&summary.output_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| {
            e.path()
                .strip_prefix(&summary.output_dir)
                .ok()
                .map(|r| r.to_string_lossy().replace('\\', "/").to_lowercase())
        })
        .collect();
    let modern: Vec<String> = character_folders(&paths)
        .into_iter()
        .filter(|f| !f.starts_with("jade_"))
        .collect();
    assert!(
        modern.is_empty(),
        "finalized legacy tree leaked modern character folders: {modern:?}"
    );
}

/// Every legacy champion CommunityDragon exposes must resolve to a real WAD and
/// extract cleanly. This is the sweep that catches alias mismatches like
/// `Jade_Wukong` -> MonkeyKing.wad.client.
///
/// The alias list is CDragon's `champion-summary.json` (ids 60000+), inlined so
/// the test needs no network.
#[test]
#[ignore = "needs a real League install"]
fn every_legacy_champion_extracts_cleanly() {
    const JADE_ALIASES: &[&str] = &[
        "Jade_Annie", "Jade_Olaf", "Jade_TwistedFate", "Jade_Fiddlesticks", "Jade_Kayle",
        "Jade_MasterYi", "Jade_Alistar", "Jade_Ryze", "Jade_Sion", "Jade_Sivir", "Jade_Soraka",
        "Jade_Teemo", "Jade_Tristana", "Jade_Warwick", "Jade_Nunu", "Jade_MissFortune",
        "Jade_Ashe", "Jade_Tryndamere", "Jade_Jax", "Jade_Morgana", "Jade_Zilean", "Jade_Singed",
        "Jade_Evelynn", "Jade_Twitch", "Jade_Karthus", "Jade_Chogath", "Jade_Amumu",
        "Jade_Rammus", "Jade_Anivia", "Jade_Shaco", "Jade_DrMundo", "Jade_Sona", "Jade_Kassadin",
        "Jade_Janna", "Jade_Gangplank", "Jade_Corki", "Jade_Taric", "Jade_Veigar",
        "Jade_Blitzcrank", "Jade_Malphite", "Jade_Katarina", "Jade_JarvanIV", "Jade_Wukong",
        "Jade_Brand", "Jade_LeeSin", "Jade_Vayne", "Jade_Skarner", "Jade_Heimerdinger",
        "Jade_Nasus", "Jade_Nidalee", "Jade_Gragas", "Jade_Pantheon", "Jade_Ezreal",
        "Jade_Garen", "Jade_Leona", "Jade_Malzahar", "Jade_KogMaw", "Jade_Lux", "Jade_Ahri",
        "Jade_Lulu",
    ];

    let Some(root) = league_root() else {
        eprintln!("skipping: no League install found");
        return;
    };

    let mut failures: Vec<String> = Vec::new();
    let mut ok = 0usize;

    for alias in JADE_ALIASES {
        let tmp = tempfile::tempdir().expect("tempdir");
        let summary = match extractor::extract_skin(
            ExtractOptions {
                league_root: &root,
                champion: alias,
                skin_id: 0,
                output_dir: tmp.path(),
                include_vo: false,
                clean: true,
                chroma_id: None,
                preserve_hud_icons2d: true,
                skip_sfx: true,
            },
            |_| {},
        ) {
            Ok(s) => s,
            Err(e) => {
                failures.push(format!("{alias}: extract failed: {e}"));
                continue;
            }
        };

        let extract_root = PathBuf::from(&summary.output_dir);
        let paths: Vec<String> = WalkDir::new(&extract_root)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .filter_map(|e| {
                e.path()
                    .strip_prefix(&extract_root)
                    .ok()
                    .map(|r| r.to_string_lossy().replace('\\', "/").to_lowercase())
            })
            .collect();

        if paths.is_empty() {
            failures.push(format!("{alias}: wrote no files"));
            continue;
        }

        let folders = character_folders(&paths);
        let modern: Vec<&String> = folders.iter().filter(|f| !f.starts_with("jade_")).collect();
        if !modern.is_empty() {
            failures.push(format!("{alias}: leaked modern folders {modern:?}"));
            continue;
        }
        let expected = alias.to_lowercase();
        if !folders.contains(&expected) {
            failures.push(format!("{alias}: missing own folder {expected}, got {folders:?}"));
            continue;
        }
        ok += 1;
    }

    println!("legacy champions extracted cleanly: {ok}/{}", JADE_ALIASES.len());
    assert!(failures.is_empty(), "failures:\n  {}", failures.join("\n  "));
}

/// The converse sweep: every modern champion that shares its WAD with a legacy
/// tree must now extract without a single `jade_*` file.
#[test]
#[ignore = "needs a real League install"]
fn no_modern_champion_leaks_legacy_assets() {
    let Some(root) = league_root() else {
        eprintln!("skipping: no League install found");
        return;
    };
    let dir = root.join("Game/DATA/FINAL/Champions");

    // Champion WADs that actually carry a legacy tree (the only ones at risk).
    let mut affected: Vec<String> = Vec::new();
    for entry in std::fs::read_dir(&dir).expect("read champions dir") {
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        let name = path.file_name().unwrap().to_string_lossy().to_lowercase();
        if !name.ends_with(".wad.client") { continue; }
        let stem = &name[..name.len() - ".wad.client".len()];
        if stem.contains('.') { continue; }
        let Ok(toc) = quartz_lib::wad::read_wad_toc(&path) else { continue };
        let has_jade = toc.iter().any(|e| {
            e.resolved_path.as_deref()
                .map(|p| p.to_lowercase().contains("/jade_"))
                .unwrap_or(false)
        });
        if has_jade { affected.push(stem.to_string()); }
    }
    affected.sort();
    assert!(!affected.is_empty(), "no affected WADs found — install layout changed?");

    let mut failures: Vec<String> = Vec::new();
    for stem in &affected {
        let tmp = tempfile::tempdir().expect("tempdir");
        let paths = match extractor::extract_skin(
            ExtractOptions {
                league_root: &root,
                champion: stem,
                skin_id: 0,
                output_dir: tmp.path(),
                include_vo: false,
                clean: true,
                chroma_id: None,
                preserve_hud_icons2d: true,
                skip_sfx: true,
            },
            |_| {},
        ) {
            Ok(s) => {
                let er = PathBuf::from(&s.output_dir);
                WalkDir::new(&er)
                    .into_iter()
                    .filter_map(|e| e.ok())
                    .filter(|e| e.file_type().is_file())
                    .filter_map(|e| {
                        e.path().strip_prefix(&er).ok()
                            .map(|r| r.to_string_lossy().replace('\\', "/").to_lowercase())
                    })
                    .collect::<Vec<String>>()
            }
            Err(e) => { failures.push(format!("{stem}: extract failed: {e}")); continue; }
        };
        let leaked = paths.iter().filter(|p| p.contains("/jade_")).count();
        if leaked > 0 {
            failures.push(format!("{stem}: leaked {leaked} legacy files"));
        }
    }

    println!("modern champions verified clean: {}/{}", affected.len() - failures.len(), affected.len());
    assert!(failures.is_empty(), "failures:\n  {}", failures.join("\n  "));
}
