use quartz_lib::anim_preview::{self, AnimPreview};
use quartz_lib::model_preview::{self, ModelPreview};
use quartz_lib::skeleton::{self, SkeletonInfo};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSceneAssets {
    ground_path: Option<String>,
    skybox_path: Option<String>,
}

fn bundled_texture(app: &AppHandle, file_name: &str) -> Option<String> {
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(
            resource_dir
                .join("resources")
                .join("textures")
                .join(file_name),
        );
        candidates.push(resource_dir.join("textures").join(file_name));
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("textures")
            .join(file_name),
    );

    candidates
        .into_iter()
        .find(|path| path.is_file())
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn model_inspect_scene_assets(app: AppHandle) -> ModelSceneAssets {
    ModelSceneAssets {
        ground_path: bundled_texture(&app, "ground_map.webp"),
        skybox_path: bundled_texture(&app, "riots_sru_skybox_cubemap.dds"),
    }
}

/// Parse an SCB/SCO/SKN on a blocking worker and return renderer-neutral
/// buffers.  WebGL stays in TypeScript; binary format handling stays native.
#[tauri::command]
pub async fn model_inspect_load(path: String) -> Result<ModelPreview, String> {
    tokio::task::spawn_blocking(move || {
        model_preview::load_model_preview(std::path::Path::new(&path)).map_err(String::from)
    })
    .await
    .map_err(|e| format!("model preview task failed: {e}"))?
}

/// Locate + parse the skeleton for a `.skn`. Tries the same-stem `<skn>.skl`
/// first, then the shared autodetect (a lone `.skl` beside it). Returns the
/// joint list with local + inverse-bind transforms for skinning.
#[tauri::command]
pub async fn model_inspect_skeleton(skn_path: String) -> Result<SkeletonInfo, String> {
    tokio::task::spawn_blocking(move || {
        let skn = Path::new(&skn_path);
        let same_stem = skn.with_extension("skl");
        let skl = if same_stem.is_file() {
            same_stem
        } else {
            skeleton::autodetect_skl(&skn_path, None, None).map_err(String::from)?
        };
        skeleton::read_skeleton_file(&skl).map_err(String::from)
    })
    .await
    .map_err(|e| format!("skeleton task failed: {e}"))?
}

/// Parse a `.anm` clip into per-joint keyframe tracks for playback.
#[tauri::command]
pub async fn model_inspect_animation(anm_path: String) -> Result<AnimPreview, String> {
    tokio::task::spawn_blocking(move || {
        anim_preview::load_anim_preview(&anm_path).map_err(String::from)
    })
    .await
    .map_err(|e| format!("animation task failed: {e}"))?
}

/// For a loose on-disk `.skn`, resolve the animation clips authored in its skin
/// bin to real `.anm` files on disk. Used when the model was opened directly
/// (file explorer) rather than through the WAD prep, which already returns them.
#[tauri::command]
pub async fn model_inspect_disk_animations(skn_path: String) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || {
        quartz_lib::skin_preview::resolve_skn_disk_animations(Path::new(&skn_path))
    })
    .await
    .map_err(|e| format!("disk animation task failed: {e}"))
}
