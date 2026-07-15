use quartz_lib::model_preview::{self, ModelPreview};

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
