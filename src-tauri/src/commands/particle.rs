/* ParticleRandomizer asset-copy command. Ported from Quartz's
copyAssetsToFolders in ParticleRandomizer.js: resolves the project root by
walking up from the source BIN to the `data` folder, then copies each
detected asset into projectRoot/ASSETS/<folder>/ (including a _backup folder
of originals), trying the same candidate source paths the JS did. */

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// A single detected asset for one variant folder.
#[derive(Deserialize)]
pub struct AssetEntry {
    /// The original `ASSETS/...` path as referenced in the BIN.
    pub original: String,
    /// The bare file name (last path segment) used as the destination name.
    pub filename: String,
}

/// Per-folder asset lists keyed by folder name (variant folders + `_backup`).
#[derive(Deserialize)]
pub struct CopyParticleAssetsArgs {
    pub source_file_path: String,
    pub assets_by_folder: HashMap<String, Vec<AssetEntry>>,
}

/// A single asset that could not be copied, with the reason.
#[derive(Serialize)]
pub struct CopyFailure {
    pub folder: String,
    pub asset: String,
    pub reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyParticleAssetsResult {
    pub success: bool,
    pub total_copied: usize,
    pub total_failed: usize,
    pub total_skipped: usize,
    pub folders_created: usize,
    pub failures: Vec<CopyFailure>,
}

/// Walk up from the BIN's directory to the nearest `data` folder; the project
/// root is that folder's parent. Falls back to the BIN directory itself.
fn resolve_project_root(bin_dir: &Path) -> PathBuf {
    let mut current = Some(bin_dir);
    while let Some(dir) = current {
        let is_data = dir
            .file_name()
            .map(|n| n.to_string_lossy().to_lowercase() == "data")
            .unwrap_or(false);
        if is_data {
            if let Some(parent) = dir.parent() {
                return parent.to_path_buf();
            }
        }
        current = dir.parent();
    }
    bin_dir.to_path_buf()
}

/// Strip a leading `ASSETS/` (case-insensitive) and normalize separators to the
/// host OS, matching the JS candidate construction.
fn rel_without_assets(original: &str) -> String {
    let native = original.replace('/', std::path::MAIN_SEPARATOR_STR);
    let lower = native.to_lowercase();
    let prefix_slash = format!("assets{}", std::path::MAIN_SEPARATOR);
    if lower.starts_with(&prefix_slash) {
        native[prefix_slash.len()..].to_string()
    } else {
        native
    }
}

fn run(args: CopyParticleAssetsArgs) -> CopyParticleAssetsResult {
    let source = PathBuf::from(&args.source_file_path);
    let bin_dir = source
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));
    let project_root = resolve_project_root(&bin_dir);

    let mut total_copied = 0;
    let mut total_failed = 0;
    let mut total_skipped = 0;
    let mut folders_created = 0;
    let mut failures: Vec<CopyFailure> = Vec::new();

    for (folder_name, assets) in &args.assets_by_folder {
        let dest_dir = project_root.join("ASSETS").join(folder_name);
        if !dest_dir.exists() {
            if std::fs::create_dir_all(&dest_dir).is_ok() {
                folders_created += 1;
            }
        }

        for asset in assets {
            let dest_path = dest_dir.join(&asset.filename);
            if dest_path.exists() {
                total_skipped += 1;
                continue;
            }

            let original_native = asset.original.replace('/', std::path::MAIN_SEPARATOR_STR);
            let rel_no_assets = rel_without_assets(&asset.original);

            let candidates = [
                project_root.join(&original_native),
                project_root.join("ASSETS").join(&rel_no_assets),
                project_root.join("assets").join(&rel_no_assets),
                bin_dir.join(&original_native),
                bin_dir.join(&asset.filename),
            ];

            let source_path = candidates.iter().find(|c| c.exists());

            match source_path {
                Some(src) => match std::fs::copy(src, &dest_path) {
                    Ok(_) => total_copied += 1,
                    Err(e) => {
                        failures.push(CopyFailure {
                            folder: folder_name.clone(),
                            asset: asset.original.clone(),
                            reason: e.to_string(),
                        });
                        total_failed += 1;
                    }
                },
                None => {
                    failures.push(CopyFailure {
                        folder: folder_name.clone(),
                        asset: asset.original.clone(),
                        reason: "Source not found".into(),
                    });
                    total_failed += 1;
                }
            }
        }
    }

    CopyParticleAssetsResult {
        success: total_failed == 0,
        total_copied,
        total_failed,
        total_skipped,
        folders_created,
        failures,
    }
}

/// Copy each variant's detected particle assets into its own
/// `ASSETS/<folder>/` subfolder next to the source BIN's project root.
#[tauri::command]
pub async fn copy_particle_assets(
    source_file_path: String,
    assets_by_folder: HashMap<String, Vec<AssetEntry>>,
) -> Result<CopyParticleAssetsResult, String> {
    let args = CopyParticleAssetsArgs {
        source_file_path,
        assets_by_folder,
    };
    tokio::task::spawn_blocking(move || run(args))
        .await
        .map_err(|e| format!("copy_particle_assets task panicked: {}", e))
}
