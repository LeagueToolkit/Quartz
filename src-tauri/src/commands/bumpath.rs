/* Bumpath repath command — repaths a mod folder by inserting a user prefix
   into every asset/data reference, copying assets, and optionally combining
   linked BINs. Ported from Quartz's bumpath:repath IPC + bumpathCore.js. */

use quartz_lib::bumpath::{repath, RepathOptions, RepathResult};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BumpathOptions {
    /// Prefix segment to insert (frontend key `prefix`).
    pub prefix: String,
    /// Destination directory (frontend nests it inside options).
    pub output_path: String,
    #[serde(default)]
    pub selected_skin_ids: Vec<u32>,
    #[serde(default = "default_true")]
    pub ignore_missing: bool,
    #[serde(default = "default_true")]
    pub combine_linked: bool,
    /// Accepted for frontend parity; hashes are resolved via the shared LMDB.
    #[serde(default)]
    pub hashes_path: Option<String>,
}

fn default_true() -> bool {
    true
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BumpathResult {
    pub output_dir: String,
    pub bins_processed: usize,
    pub assets_copied: usize,
    pub missing: usize,
    pub combined: usize,
}

impl From<RepathResult> for BumpathResult {
    fn from(r: RepathResult) -> Self {
        BumpathResult {
            output_dir: r.output_dir,
            bins_processed: r.bins_processed,
            assets_copied: r.assets_copied,
            missing: r.missing,
            combined: r.combined,
        }
    }
}

/// Repath `folder` into `options.outputPath`, applying `options`.
#[tauri::command]
pub async fn bumpath_repath(
    folder: String,
    options: BumpathOptions,
) -> Result<BumpathResult, String> {
    let _ = &options.hashes_path; // resolved via the shared LMDB, kept for parity
    let output_dir = options.output_path.clone();
    let opts = RepathOptions {
        custom_prefix: options.prefix,
        selected_skin_ids: options.selected_skin_ids,
        ignore_missing: options.ignore_missing,
        combine_linked: options.combine_linked,
    };

    // Repath is CPU/IO-bound; keep the async runtime responsive.
    tokio::task::spawn_blocking(move || {
        repath(&PathBuf::from(&folder), &PathBuf::from(&output_dir), &opts)
            .map(BumpathResult::from)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("repath task panicked: {}", e))?
}
