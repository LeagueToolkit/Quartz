/* FakeGearSkin backend file ops. The .py content transforms run in the frontend
(fakeGearSkinUtils.ts); these commands cover the pieces that need the disk:
copying the bundled togglescreen assets into the mod, editing the .skn to add a
MinimalMesh, validating .anm references, and writing the variant .bin files. */

use std::path::{Path, PathBuf};

use quartz_lib::bin::{text_to_tree, write_bin};
use quartz_lib::mesh::{self, MinimalMeshResult};
use quartz_lib::skeleton;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/* Walk up from the bin's directory until a folder containing a case-insensitive
`assets` dir is found — that is the mod root the .py paths are relative to. */
fn find_project_root(bin_path: &str) -> PathBuf {
    let bin = PathBuf::from(bin_path);
    let start = bin.parent().unwrap_or_else(|| Path::new(".")).to_path_buf();

    for dir in start.ancestors() {
        if let Ok(entries) = std::fs::read_dir(dir) {
            let has_assets = entries.flatten().any(|e| {
                e.file_name()
                    .to_string_lossy()
                    .eq_ignore_ascii_case("assets")
            });
            if has_assets {
                return dir.to_path_buf();
            }
        }
    }
    start
}

/* Resolve a game-relative asset path (e.g. "ASSETS/Characters/...") onto disk under
the project root, matching each path segment case-insensitively. */
fn resolve_asset_path(asset_path: &str, project_root: &Path) -> Option<PathBuf> {
    let mut current = project_root.to_path_buf();

    for part in asset_path.split(['/', '\\']) {
        if part.is_empty() {
            continue;
        }
        let entries = std::fs::read_dir(&current).ok()?;
        let matched = entries.flatten().find_map(|e| {
            let name = e.file_name();
            if name.to_string_lossy().eq_ignore_ascii_case(part) {
                Some(name)
            } else {
                None
            }
        })?;
        current = current.join(matched);
    }

    if current.exists() {
        Some(current)
    } else {
        None
    }
}

fn capture_first<'a>(content: &'a str, prop: &str) -> Option<&'a str> {
    // Find `prop: string = "<value>"` and return the value.
    let needle = format!("{prop}: string = \"");
    let lower = content.to_lowercase();
    let idx = lower.find(&needle.to_lowercase())?;
    let after = &content[idx + needle.len()..];
    let end = after.find('"')?;
    Some(&after[..end])
}

// ── Togglescreen asset copy ──────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyAssetsResult {
    pub copied: Vec<String>,
    pub skipped: Vec<String>,
    pub target_folder: String,
    pub texture_path: String,
    pub mesh_path: String,
}

/* Find a bundled resource file, trying the declared `resources/textures` layout and
the flattened fallback (same pattern as commands::assets::seed_bundled_assets). */
fn bundled_resource(app: &AppHandle, name: &str) -> Option<PathBuf> {
    let resource_dir = app.path().resource_dir().ok()?;
    let candidates = [
        resource_dir.join("resources").join("textures").join(name),
        resource_dir.join("textures").join(name),
        resource_dir.join("resources").join(name),
        resource_dir.join(name),
    ];
    candidates.into_iter().find(|p| p.is_file())
}

// ── Variant asset copy ──────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VariantAssetMapping {
    pub original: String,
    pub filename: String,
}

#[derive(Deserialize, Default)]
pub struct VariantAssetMappings {
    #[serde(default)]
    pub variant1: Vec<VariantAssetMapping>,
    #[serde(default)]
    pub variant2: Vec<VariantAssetMapping>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopiedVariantAsset {
    pub source: String,
    pub dest: String,
    pub filename: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyVariantAssetsResult {
    pub success: bool,
    pub copied_files: Vec<CopiedVariantAsset>,
    pub skipped_files: Vec<String>,
    pub failed_files: Vec<String>,
    pub variant1_path: String,
    pub variant2_path: String,
    pub message: String,
}

fn has_named_child(dir: &Path, wanted: &str) -> bool {
    std::fs::read_dir(dir)
        .ok()
        .into_iter()
        .flatten()
        .flatten()
        .any(|entry| {
            entry
                .file_name()
                .to_string_lossy()
                .eq_ignore_ascii_case(wanted)
        })
}

fn find_variant_project_root(bin_path: &str) -> PathBuf {
    let bin = PathBuf::from(bin_path);
    let start = bin.parent().unwrap_or_else(|| Path::new("."));
    start
        .ancestors()
        .find(|dir| has_named_child(dir, "data") || has_named_child(dir, "assets"))
        .unwrap_or(start)
        .to_path_buf()
}

fn without_assets_prefix(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    normalized
        .strip_prefix("assets/")
        .or_else(|| normalized.strip_prefix("ASSETS/"))
        .unwrap_or(&normalized)
        .to_string()
}

fn source_for_variant_asset(
    original: &str,
    project_root: &Path,
    bin_dir: &Path,
) -> Option<PathBuf> {
    let relative = PathBuf::from(original.replace(['/', '\\'], std::path::MAIN_SEPARATOR_STR));
    let without_assets = PathBuf::from(
        without_assets_prefix(original).replace(['/', '\\'], std::path::MAIN_SEPARATOR_STR),
    );
    [
        project_root.join(&relative),
        project_root.join("assets").join(&without_assets),
        project_root.join("ASSETS").join(&without_assets),
        bin_dir.join(&relative),
    ]
    .into_iter()
    .find(|candidate| candidate.is_file())
}

fn copy_variant_list(
    mappings: &[VariantAssetMapping],
    target_folder: &str,
    project_root: &Path,
    bin_dir: &Path,
    copied: &mut Vec<CopiedVariantAsset>,
    skipped: &mut Vec<String>,
    failed: &mut Vec<String>,
) {
    let target = project_root.join(target_folder);
    for asset in mappings {
        if Path::new(&asset.filename)
            .file_name()
            .map(|name| name != std::ffi::OsStr::new(&asset.filename))
            .unwrap_or(true)
        {
            failed.push(asset.original.clone());
            continue;
        }
        let Some(source) = source_for_variant_asset(&asset.original, project_root, bin_dir) else {
            failed.push(asset.original.clone());
            continue;
        };
        let dest = target.join(&asset.filename);
        if dest.exists() {
            skipped.push(asset.filename.clone());
            continue;
        }
        let Some(parent) = dest.parent() else {
            failed.push(asset.original.clone());
            continue;
        };
        if std::fs::create_dir_all(parent).is_err() || std::fs::copy(&source, &dest).is_err() {
            failed.push(asset.original.clone());
            continue;
        }
        copied.push(CopiedVariantAsset {
            source: source.to_string_lossy().into_owned(),
            dest: dest.to_string_lossy().into_owned(),
            filename: asset.filename.clone(),
        });
    }
}

/// Copy the source assets repathed by FakeGear into assets/variant1 and
/// assets/variant2, retaining the old Quartz skip-if-present behavior.
#[tauri::command]
pub fn fakegear_copy_variant_assets(
    bin_path: String,
    asset_mappings: VariantAssetMappings,
    variant1_folder: String,
    variant2_folder: String,
) -> Result<CopyVariantAssetsResult, String> {
    let safe_folder = |folder: &str| {
        !folder.trim().is_empty()
            && Path::new(folder)
                .components()
                .all(|part| matches!(part, std::path::Component::Normal(_)))
    };
    if !safe_folder(&variant1_folder) || !safe_folder(&variant2_folder) {
        return Err("Variant folders must be safe relative paths".into());
    }

    let bin = PathBuf::from(&bin_path);
    let bin_dir = bin.parent().unwrap_or_else(|| Path::new("."));
    let project_root = find_variant_project_root(&bin_path);
    let mut copied = Vec::new();
    let mut skipped = Vec::new();
    let mut failed = Vec::new();

    copy_variant_list(
        &asset_mappings.variant1,
        &variant1_folder,
        &project_root,
        bin_dir,
        &mut copied,
        &mut skipped,
        &mut failed,
    );
    copy_variant_list(
        &asset_mappings.variant2,
        &variant2_folder,
        &project_root,
        bin_dir,
        &mut copied,
        &mut skipped,
        &mut failed,
    );

    let message = format!(
        "Copied {} files, skipped {}, failed {}",
        copied.len(),
        skipped.len(),
        failed.len()
    );
    Ok(CopyVariantAssetsResult {
        success: failed.is_empty(),
        copied_files: copied,
        skipped_files: skipped,
        failed_files: failed,
        variant1_path: project_root
            .join(&variant1_folder)
            .to_string_lossy()
            .into_owned(),
        variant2_path: project_root
            .join(&variant2_folder)
            .to_string_lossy()
            .into_owned(),
        message,
    })
}

/// Preserve FakeGear's original save workflow: copy the current BIN to an
/// adjacent `.bak_YYYYMMDD_HHMMSS` file before overwriting it.
#[tauri::command]
pub fn fakegear_backup_bin(bin_path: String) -> Result<String, String> {
    let source = PathBuf::from(&bin_path);
    if !source.is_file() {
        return Err(format!("BIN does not exist: {}", source.display()));
    }
    let stamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let backup = PathBuf::from(format!("{}.bak_{}", source.to_string_lossy(), stamp));
    std::fs::copy(&source, &backup)
        .map_err(|error| format!("Failed to create {}: {error}", backup.display()))?;
    Ok(backup.to_string_lossy().into_owned())
}

/// Copy the bundled screen.dds / screen.scb into <project>/assets/togglescreen.
/// Existing files are left in place.
#[tauri::command]
pub fn fakegear_copy_togglescreen_assets(
    app: AppHandle,
    bin_path: String,
) -> Result<CopyAssetsResult, String> {
    let project_root = find_project_root(&bin_path);
    let target = project_root.join("assets").join("togglescreen");
    std::fs::create_dir_all(&target)
        .map_err(|e| format!("Could not create {}: {}", target.display(), e))?;

    let mut copied = Vec::new();
    let mut skipped = Vec::new();

    for name in ["screen.dds", "screen.scb"] {
        let dest = target.join(name);
        if dest.exists() {
            skipped.push(name.to_string());
            continue;
        }
        let src = bundled_resource(&app, name)
            .ok_or_else(|| format!("Bundled asset not found: {name}"))?;
        std::fs::copy(&src, &dest).map_err(|e| format!("Failed to copy {name}: {e}"))?;
        copied.push(name.to_string());
    }

    Ok(CopyAssetsResult {
        copied,
        skipped,
        target_folder: target.to_string_lossy().into_owned(),
        texture_path: "assets/togglescreen/screen.dds".into(),
        mesh_path: "assets/togglescreen/screen.scb".into(),
    })
}

// ── Minimal mesh (SKN/SKL) ───────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MinimalMeshResultDto {
    /// "success", "skip", or "error".
    pub status: String,
    pub message: String,
    /// Joint count read from the SKL, used to size the animation mask. 0 if unknown.
    pub bone_count: usize,
}

/// Add a MinimalMesh submesh to the mod's .skn and report the SKL bone count.
///
/// Reads the skeleton/simpleSkin paths from the .py, resolves them under the mod
/// root, binds the new submesh to the first vertex's bone (falling back to the SKL
/// root), and returns the true bone count for the toggle mask.
#[tauri::command]
pub fn fakegear_process_minimal_mesh(
    py_content: String,
    bin_path: String,
) -> Result<MinimalMeshResultDto, String> {
    let skeleton_ref = capture_first(&py_content, "skeleton");
    let simple_skin = capture_first(&py_content, "simpleSkin");

    let (Some(skeleton_ref), Some(simple_skin)) = (skeleton_ref, simple_skin) else {
        return Ok(MinimalMeshResultDto {
            status: "skip".into(),
            message: "No skeleton/simpleSkin paths found".into(),
            bone_count: 0,
        });
    };

    let project_root = find_project_root(&bin_path);

    let skn_path = resolve_asset_path(simple_skin, &project_root);
    let skl_path = resolve_asset_path(skeleton_ref, &project_root);

    let Some(skn_path) = skn_path else {
        return Ok(MinimalMeshResultDto {
            status: "error".into(),
            message: format!("Could not find SKN on disk: {simple_skin}"),
            bone_count: 0,
        });
    };

    // Bone count from the SKL drives the mask weight list. Optional — fall back to 0.
    let skl_info = skl_path
        .as_ref()
        .and_then(|p| skeleton::read_skeleton_file(p).ok());
    let bone_count = skl_info.as_ref().map(|s| s.joints.len()).unwrap_or(0);

    // Bind to the bone the first vertex already uses; if the mesh is empty, fall
    // back to the SKL root joint, else bone 0.
    let bone_index = match mesh::first_vertex_bone(&skn_path).map_err(|e| e.to_string())? {
        Some(idx) => idx,
        None => skl_info
            .as_ref()
            .and_then(|s| s.joints.iter().position(|j| j.parent_id == -1))
            .map(|i| i as u8)
            .unwrap_or(0),
    };

    match mesh::add_minimal_mesh(&skn_path, bone_index, 0.001).map_err(|e| e.to_string())? {
        MinimalMeshResult::AlreadyPresent => Ok(MinimalMeshResultDto {
            status: "skip".into(),
            message: "MinimalMesh already exists".into(),
            bone_count,
        }),
        MinimalMeshResult::Added { bone_index } => {
            let bone_name = skl_info
                .as_ref()
                .and_then(|s| s.joints.get(bone_index as usize))
                .map(|j| j.name.clone())
                .unwrap_or_else(|| format!("Index {bone_index}"));
            Ok(MinimalMeshResultDto {
                status: "success".into(),
                message: format!("Added MinimalMesh bound to '{bone_name}'"),
                bone_count,
            })
        }
    }
}

// ── ANM validation ───────────────────────────────────────────────────────────

/// Resolve the first .anm reference that exists on disk under the mod root, falling
/// back to the first reference if none resolve. Returns null when the .py has none.
#[tauri::command]
pub fn fakegear_validate_anm(
    py_content: String,
    bin_path: String,
) -> Result<Option<String>, String> {
    let mut refs = Vec::new();
    let lower = py_content.to_lowercase();
    let needle = "manimationfilepath: string = \"";
    let mut search = 0;
    while let Some(rel) = lower[search..].find(needle) {
        let start = search + rel + needle.len();
        if let Some(end_rel) = py_content[start..].find('"') {
            let value = &py_content[start..start + end_rel];
            if value.to_lowercase().ends_with(".anm") {
                refs.push(value.to_string());
            }
            search = start + end_rel + 1;
        } else {
            break;
        }
    }

    if refs.is_empty() {
        return Ok(None);
    }

    let project_root = find_project_root(&bin_path);
    for anm in &refs {
        if resolve_asset_path(anm, &project_root).is_some() {
            return Ok(Some(anm.clone()));
        }
    }

    // None resolved — hand back the first so the user can fix the path.
    Ok(Some(refs[0].clone()))
}

// ── Variant bin writing ──────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteVariantBinsResult {
    pub variant1_path: String,
    pub variant2_path: String,
    pub variant1_system_count: usize,
    pub variant2_system_count: usize,
}

const VARIANT_PY_HEADER: &str = "#PROP_text\ntype: string = \"PROP\"\nversion: u32 = 3\nlinked: list[string] = {}\nentries: map[hash,embed] = {\n";

fn build_variant_py(systems: &[String]) -> String {
    format!("{VARIANT_PY_HEADER}{}\n}}\n", systems.join("\n"))
}

/* Locate the mod's data folder (case-insensitive) by walking up from the main bin;
variant bins live directly inside it. Falls back to the bin's own directory. */
fn data_folder(main_bin_path: &str) -> PathBuf {
    let bin = PathBuf::from(main_bin_path);
    let bin_dir = bin.parent().unwrap_or_else(|| Path::new(".")).to_path_buf();

    for dir in bin_dir.ancestors() {
        if dir
            .file_name()
            .map(|n| n.to_string_lossy().eq_ignore_ascii_case("data"))
            .unwrap_or(false)
        {
            return dir.to_path_buf();
        }
        let candidate = dir.join("data");
        if candidate.is_dir() {
            return candidate;
        }
    }
    bin_dir
}

/// Write variant1.bin / variant2.bin next to the mod's data folder, merging with any
/// systems already present in an existing variant bin (deduped by system key).
#[tauri::command]
pub fn fakegear_write_variant_bins(
    main_bin_path: String,
    variant1_systems: Vec<String>,
    variant2_systems: Vec<String>,
) -> Result<WriteVariantBinsResult, String> {
    let folder = data_folder(&main_bin_path);
    std::fs::create_dir_all(&folder)
        .map_err(|e| format!("Could not create {}: {}", folder.display(), e))?;

    let v1 = write_one(&folder, "variant1", &variant1_systems)?;
    let v2 = write_one(&folder, "variant2", &variant2_systems)?;

    Ok(WriteVariantBinsResult {
        variant1_path: v1.0,
        variant2_path: v2.0,
        variant1_system_count: v1.1,
        variant2_system_count: v2.1,
    })
}

fn write_one(folder: &Path, name: &str, new_systems: &[String]) -> Result<(String, usize), String> {
    let bin_path = folder.join(format!("{name}.bin"));

    let mut merged: Vec<String> = Vec::new();
    let mut seen_keys: std::collections::HashSet<String> = std::collections::HashSet::new();

    // Pull existing systems out of a prior variant bin so re-runs don't drop them.
    if bin_path.exists() {
        if let Ok(existing) = read_variant_systems(&bin_path) {
            for sys in existing {
                if let Some(key) = system_key(&sys) {
                    seen_keys.insert(key);
                }
                merged.push(sys);
            }
        }
    }

    for sys in new_systems {
        match system_key(sys) {
            Some(key) if seen_keys.contains(&key) => continue,
            Some(key) => {
                seen_keys.insert(key);
            }
            None => {}
        }
        merged.push(sys.clone());
    }

    let py = build_variant_py(&merged);
    let tree = text_to_tree(&py).map_err(|e| e.to_string())?;
    let bytes = write_bin(&tree).map_err(|e| e.to_string())?;
    std::fs::write(&bin_path, bytes)
        .map_err(|e| format!("Failed to write {}: {}", bin_path.display(), e))?;

    Ok((bin_path.to_string_lossy().into_owned(), merged.len()))
}

/* Read VfxSystemDefinitionData blocks out of an existing variant bin by converting it
back to text and slicing on bracket depth. */
fn read_variant_systems(bin_path: &Path) -> Result<Vec<String>, String> {
    use quartz_lib::bin::{read_bin, tree_to_text_cached};
    let data = std::fs::read(bin_path).map_err(|e| e.to_string())?;
    let tree = read_bin(&data).map_err(|e| e.to_string())?;
    let text = tree_to_text_cached(&tree).map_err(|e| e.to_string())?;
    Ok(extract_systems(&text))
}

fn system_key(system: &str) -> Option<String> {
    let idx = system.find("= VfxSystemDefinitionData")?;
    let before = &system[..idx];
    let q_end = before.rfind('"')?;
    let q_start = before[..q_end].rfind('"')?;
    Some(before[q_start + 1..q_end].to_string())
}

/* Slice each top-level `"key" = VfxSystemDefinitionData { ... }` block from .py text. */
fn extract_systems(text: &str) -> Vec<String> {
    let lines: Vec<&str> = text.split('\n').collect();
    let mut systems = Vec::new();
    let mut i = 0;

    while i < lines.len() {
        if lines[i].contains("= VfxSystemDefinitionData {") {
            let start = i;
            let mut depth = 0i32;
            let mut found = false;
            let mut end = i;
            for (j, line) in lines.iter().enumerate().skip(i) {
                depth += line.matches('{').count() as i32 - line.matches('}').count() as i32;
                if line.contains('{') {
                    found = true;
                }
                if found && depth == 0 {
                    end = j;
                    break;
                }
            }
            systems.push(lines[start..=end].join("\n"));
            i = end + 1;
        } else {
            i += 1;
        }
    }

    systems
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "quartz_fakegear_{name}_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn variant_copy_matches_legacy_folder_flow() {
        let root = scratch("assets");
        let bin_dir = root.join("data/characters/test");
        let source = root.join("assets/source/example.dds");
        std::fs::create_dir_all(&bin_dir).unwrap();
        std::fs::create_dir_all(source.parent().unwrap()).unwrap();
        std::fs::write(&source, b"dds-data").unwrap();
        let bin = bin_dir.join("skin.bin");
        std::fs::write(&bin, b"bin").unwrap();

        let result = fakegear_copy_variant_assets(
            bin.to_string_lossy().into_owned(),
            VariantAssetMappings {
                variant1: vec![VariantAssetMapping {
                    original: "assets/source/example.dds".into(),
                    filename: "example.dds".into(),
                }],
                variant2: vec![VariantAssetMapping {
                    original: "assets/source/example.dds".into(),
                    filename: "example.dds".into(),
                }],
            },
            "assets/variant1".into(),
            "assets/variant2".into(),
        )
        .unwrap();

        assert!(result.success);
        assert_eq!(result.copied_files.len(), 2);
        assert_eq!(
            std::fs::read(root.join("assets/variant1/example.dds")).unwrap(),
            b"dds-data"
        );
        assert_eq!(
            std::fs::read(root.join("assets/variant2/example.dds")).unwrap(),
            b"dds-data"
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn fakegear_backup_is_adjacent_and_byte_identical() {
        let root = scratch("backup");
        std::fs::create_dir_all(&root).unwrap();
        let bin = root.join("skin.bin");
        std::fs::write(&bin, b"original-bin").unwrap();

        let backup = fakegear_backup_bin(bin.to_string_lossy().into_owned()).unwrap();
        assert!(backup.starts_with(&format!("{}.bak_", bin.to_string_lossy())));
        assert_eq!(std::fs::read(&backup).unwrap(), b"original-bin");
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn togglescreen_assets_are_declared_bundle_resources() {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let config = std::fs::read_to_string(manifest.join("tauri.conf.json")).unwrap();
        assert!(config.contains("resources/textures/*"));

        let texture_dir = manifest.join("resources/textures");
        let dds = std::fs::read(texture_dir.join("screen.dds")).unwrap();
        let scb = std::fs::read(texture_dir.join("screen.scb")).unwrap();
        assert_eq!(&dds[..4], b"DDS ");
        assert!(dds.len() > 128);
        assert!(scb.len() > 32);
    }
}
