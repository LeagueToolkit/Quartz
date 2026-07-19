/* Bumpath repath command — repaths a mod folder by inserting a user prefix
into every asset/data reference, copying assets, and optionally combining
linked BINs. Ported from Quartz's bumpath:repath IPC + bumpathCore.js. */

use quartz_lib::bumpath::{
    enumerate_source_bins, repath_many, scan_entries, RepathOptions, RepathResult,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
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
    #[serde(default)]
    pub selected_bin_paths: Vec<String>,
    #[serde(default)]
    pub entry_prefixes: HashMap<String, String>,
    #[serde(default = "default_true")]
    pub ignore_missing: bool,
    #[serde(default = "default_true")]
    pub combine_linked: bool,
    #[serde(default = "default_true")]
    pub split_vfx: bool,
    #[serde(default = "default_true")]
    pub consolidate_assets: bool,
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
    pub vfx_split: usize,
    pub assets_consolidated: usize,
}

impl From<RepathResult> for BumpathResult {
    fn from(r: RepathResult) -> Self {
        BumpathResult {
            output_dir: r.output_dir,
            bins_processed: r.bins_processed,
            assets_copied: r.assets_copied,
            missing: r.missing,
            combined: r.combined,
            vfx_split: r.vfx_split,
            assets_consolidated: r.assets_consolidated,
        }
    }
}

/// Repath all source `folders` into `options.outputPath`, applying `options`.
#[tauri::command]
pub async fn bumpath_repath(
    folders: Vec<String>,
    options: BumpathOptions,
) -> Result<BumpathResult, String> {
    let _ = &options.hashes_path; // resolved via the shared LMDB, kept for parity
    let output_dir = options.output_path.clone();
    let entry_prefixes = options
        .entry_prefixes
        .into_iter()
        .filter_map(|(hash, prefix)| {
            u32::from_str_radix(hash.trim_start_matches("0x"), 16)
                .ok()
                .map(|value| (value, prefix))
        })
        .collect();
    let opts = RepathOptions {
        custom_prefix: options.prefix,
        selected_skin_ids: options.selected_skin_ids,
        selected_bin_paths: options
            .selected_bin_paths
            .into_iter()
            .map(PathBuf::from)
            .collect(),
        entry_prefixes,
        ignore_missing: options.ignore_missing,
        combine_linked: options.combine_linked,
        split_vfx: options.split_vfx,
        consolidate_assets: options.consolidate_assets,
    };

    // Repath is CPU/IO-bound; keep the async runtime responsive.
    tokio::task::spawn_blocking(move || {
        let source_dirs: Vec<PathBuf> = folders.into_iter().map(PathBuf::from).collect();
        repath_many(&source_dirs, &PathBuf::from(&output_dir), &opts)
            .map(BumpathResult::from)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("repath task panicked: {}", e))?
}

/// A discovered source BIN, keyed in `source_bins` by its absolute path.
#[derive(Serialize)]
pub struct SourceBinInfo {
    pub path: String,
    pub rel_path: String,
    pub selected: bool,
}

/// Result of `bumpath_enumerate_sources` — mirrors the Electron addSourceDirs
/// shape (`source_files` is unused under Tauri but kept for frontend parity).
#[derive(Serialize)]
pub struct EnumerateSourcesResult {
    pub source_files: HashMap<String, ()>,
    pub source_bins: HashMap<String, SourceBinInfo>,
}

/// List every `.bin` under the given source `folders`, keyed by absolute path.
#[tauri::command]
pub async fn bumpath_enumerate_sources(
    folders: Vec<String>,
) -> Result<EnumerateSourcesResult, String> {
    tokio::task::spawn_blocking(move || {
        let paths: Vec<PathBuf> = folders.into_iter().map(PathBuf::from).collect();
        let bins = enumerate_source_bins(&paths);

        let mut source_bins = HashMap::new();
        for bin in bins {
            let key = bin.path.to_string_lossy().into_owned();
            source_bins.insert(
                key.clone(),
                SourceBinInfo {
                    path: key,
                    rel_path: bin.rel_path,
                    selected: false,
                },
            );
        }

        EnumerateSourcesResult {
            source_files: HashMap::new(),
            source_bins,
        }
    })
    .await
    .map_err(|e| format!("enumerate task panicked: {}", e))
}

#[derive(Serialize)]
pub struct ScannedReferenceDto {
    pub path: String,
    pub exists: bool,
    pub unify_file: String,
}

#[derive(Serialize)]
pub struct ScannedEntryDto {
    pub name: String,
    pub type_name: Option<String>,
    pub prefix: String,
    pub referenced_files: Vec<ScannedReferenceDto>,
}

/// Result of `bumpath_scan_entries` — `entries` keyed by entry hash.
#[derive(Serialize)]
pub struct ScanEntriesResult {
    pub entries: HashMap<String, ScannedEntryDto>,
    pub all_bins: HashMap<String, ()>,
}

/// Open the selected BINs, returning their entries + referenced asset paths
/// (with `exists` flags) so the panel can preview what repathing will touch.
#[tauri::command]
pub async fn bumpath_scan_entries(
    folders: Vec<String>,
    bin_paths: Vec<String>,
    hashes_path: Option<String>,
) -> Result<ScanEntriesResult, String> {
    let _ = hashes_path; // resolved via the shared LMDB, kept for parity

    tokio::task::spawn_blocking(move || {
        let folder_paths: Vec<PathBuf> = folders.into_iter().map(PathBuf::from).collect();
        let bins: Vec<PathBuf> = bin_paths.into_iter().map(PathBuf::from).collect();

        let scan = scan_entries(&folder_paths, &bins).map_err(|e| e.to_string())?;

        let mut entries = HashMap::new();
        for entry in scan.entries {
            entries.insert(
                entry.hash,
                ScannedEntryDto {
                    name: entry.name,
                    type_name: entry.type_name,
                    // The repath prefix is applied at process time; surface the
                    // default so the panel renders an editable prefix.
                    prefix: "bum".to_string(),
                    referenced_files: entry
                        .referenced_files
                        .into_iter()
                        .map(|r| ScannedReferenceDto {
                            path: r.path,
                            exists: r.exists,
                            unify_file: r.unify_file,
                        })
                        .collect(),
                },
            );
        }

        Ok(ScanEntriesResult {
            entries,
            all_bins: HashMap::new(),
        })
    })
    .await
    .map_err(|e| format!("scan task panicked: {}", e))?
}
