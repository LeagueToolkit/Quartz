// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod core;
mod error;
mod state;

use core::hash::get_ritoshark_hash_dir;
use core::frontend_log::{FrontendLogLayer, set_app_handle};
use state::HashtableState;
use tauri::Manager;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

fn main() {
    // Initialize tracing/logging with frontend layer
    // Set RUST_LOG environment variable to control log level (e.g., RUST_LOG=debug)
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));
    
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(FrontendLogLayer)
        .with(filter)
        .init();

    tracing::info!("Starting Flint");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(HashtableState::new())
        .setup(|app| {
            // Set app handle for frontend logging
            set_app_handle(app.handle().clone());
            
            // Use RitoShark directory for hash files (shared with other RitoShark tools)
            let hash_dir = get_ritoshark_hash_dir().unwrap_or_else(|e| {
                tracing::warn!("Failed to get RitoShark hash directory: {}", e);
                // Fallback to Tauri app data directory if RitoShark path not available
                app.path().app_data_dir()
                    .unwrap_or_else(|_| std::path::PathBuf::from("./hashes"))
                    .join("hashes")
            });
            
            tracing::info!("Hash directory: {}", hash_dir.display());
            
            // Set the hash directory for lazy loading (hashtable will load on first use)
            let hashtable_state = app.state::<HashtableState>().inner().clone();
            hashtable_state.set_hash_dir(hash_dir.clone());
            
            // Spawn background task to download hashes (but NOT load them - lazy loading handles that)
            tauri::async_runtime::spawn(async move {
                tracing::info!("Checking for hash updates...");
                match core::hash::download_hashes(&hash_dir, false).await {
                    Ok(stats) => {
                        if stats.downloaded > 0 {
                            tracing::info!(
                                "Hash update: {} downloaded, {} up-to-date",
                                stats.downloaded, stats.skipped
                            );
                        } else {
                            tracing::debug!("Hashes up-to-date ({} files)", stats.skipped);
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Failed to update hashes (will use existing): {}", e);
                    }
                }
                // NOTE: Hashtable is NOT loaded here anymore - lazy loading on first use
            });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::hash::download_hashes,
            commands::hash::get_hash_status,
            commands::hash::reload_hashes,
            commands::wad::read_wad,
            commands::wad::get_wad_chunks,
            commands::wad::load_all_wad_chunks,
            commands::wad::extract_wad,
            commands::wad::read_wad_chunk_data,
            commands::wad::scan_game_wads,
            commands::bin::convert_bin_to_text,
            commands::bin::convert_bin_to_json,
            commands::bin::convert_text_to_bin,
            commands::bin::convert_json_to_bin,
            commands::bin::read_bin_info,
            commands::bin::convert_bin_bytes_to_text,
            commands::bin::convert_bin_bytes_to_json,
            commands::bin::parse_bin_file_to_text,
            commands::bin::read_or_convert_bin,
            commands::bin::save_ritobin_to_bin,
            // League detection commands

            commands::league::detect_league,
            commands::league::validate_league,
            // Project management commands
            commands::project::create_project,
            commands::project::open_project,
            commands::project::save_project,
            commands::project::list_project_files,
            commands::project::preconvert_project_bins,
            // Champion discovery commands
            commands::champion::discover_champions,
            commands::champion::get_champion_skins,
            commands::champion::search_champions,
            // Validation commands
            commands::validation::extract_asset_references,
            commands::validation::validate_assets,
            // File commands (preview system)
            commands::file::read_file_bytes,
            commands::file::read_file_info,
            commands::file::decode_dds_to_png,
            commands::file::decode_bytes_to_png,
            commands::file::read_text_file,
            commands::file::recolor_image,
            commands::file::recolor_folder,
            commands::file::colorize_image,
            commands::file::colorize_folder,
            // Export commands
            commands::export::repath_project_cmd,
            commands::export::export_fantome,
            commands::export::export_modpkg,
            commands::export::get_fantome_filename,
            commands::export::get_export_preview,
            // Mesh commands (3D preview)
            commands::mesh::read_skn_mesh,
            commands::mesh::read_scb_mesh,
            commands::mesh::read_skl_skeleton,
            commands::mesh::read_animation_list,
            commands::mesh::read_animation,
            commands::mesh::evaluate_animation,
            commands::mesh::resolve_asset_path,
            // Auto-update commands
            commands::updater::get_current_version,
            commands::updater::check_for_updates,
            commands::updater::download_and_install_update,
            // Checkpoint commands
            commands::checkpoint::create_checkpoint,
            commands::checkpoint::list_checkpoints,
            commands::checkpoint::restore_checkpoint,
            commands::checkpoint::compare_checkpoints,
            commands::checkpoint::delete_checkpoint,
            commands::checkpoint::read_checkpoint_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
