/* AniPort commands — backing the mask viewer. The Electron build read the target
skeleton through a league-toolkit reader behind a Flask backend; here we parse
the .skl directly with quartz-lib and hand the joint list to the React UI. */

use quartz_lib::skeleton::{self, SkeletonInfo};
use serde::Serialize;

/// Result of locating + parsing a skeleton: the resolved disk path plus joints.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedSkeleton {
    pub skl_path: String,
    pub total_joints: usize,
    #[serde(flatten)]
    pub skeleton: SkeletonInfo,
}

/// Resolve the real .skl path for a skins/animation bin.
///
/// `skeleton_ref` is the game-relative skeleton path read from the skins bin;
/// `skl_path` is an optional explicit override.
#[tauri::command]
pub fn aniport_autodetect_skl(
    bin_path: String,
    skeleton_ref: Option<String>,
    skl_path: Option<String>,
) -> Result<String, String> {
    skeleton::autodetect_skl(&bin_path, skeleton_ref.as_deref(), skl_path.as_deref())
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

/// Parse a skeleton file into its joint list + hierarchy.
#[tauri::command]
pub fn aniport_load_skeleton(skl_path: String) -> Result<LoadedSkeleton, String> {
    let info = skeleton::read_skeleton_file(&skl_path).map_err(|e| e.to_string())?;
    Ok(LoadedSkeleton {
        skl_path,
        total_joints: info.joints.len(),
        skeleton: info,
    })
}
