// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cli_convert;
mod commands;
mod core;
mod startup;
mod state;

use commands::settings::{get_quartz_home, initialize_app_home};
use tauri::{Emitter, Manager};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

fn main() {
    // Right-click "Convert" verbs run headlessly and exit before Tauri starts.
    if let Some(code) = cli_convert::try_run() {
        std::process::exit(code);
    }

    let log_dir = get_quartz_home()
        .map(|h| h.join("logs"))
        .unwrap_or_else(|_| std::path::PathBuf::from("./logs"));
    std::fs::create_dir_all(&log_dir).ok();

    let file_appender = tracing_appender::rolling::daily(&log_dir, "quartz.log");
    let (file_writer, _guard) = tracing_appender::non_blocking(file_appender);

    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        EnvFilter::new("info")
            .add_directive("tauri=warn".parse().unwrap())
            .add_directive("tao=error".parse().unwrap())
    });

    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(fmt::layer().with_ansi(false).with_writer(file_writer))
        .with(filter)
        .init();

    tracing::info!("Quartz starting...");

    tauri::Builder::default()
        // Must be first: a second Windows shell launch forwards its model path
        // into the existing process, focuses it, then exits.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let startup_pending = app
                .try_state::<startup::StartupGate>()
                .map(|gate| !gate.is_resolved())
                .unwrap_or(false);
            if startup_pending {
                if let Some(window) = app.get_webview_window("updater") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            } else if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            if let Some(path) = commands::system::model_path_from_args(&args) {
                let _ = app.emit("model-inspect-launch", path);
            }
            if let Some(path) = commands::system::paint_bin_from_args(&args) {
                let _ = app.emit("paint-bin-launch", path);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(startup::StartupGate::default())
        .manage(commands::upscale::UpscaleState::default())
        .setup(|app| {
            if let Err(e) = initialize_app_home() {
                tracing::error!("Failed to initialize app home: {}", e);
            }
            if let Err(e) = commands::context_menu::context_menu_refresh_if_enabled() {
                tracing::warn!("Failed to refresh Explorer context menu: {}", e);
            }
            // Audio encoding is in-process now; drop the toolchain older
            // versions downloaded into %APPDATA% and never cleaned up.
            std::thread::spawn(commands::audio::remove_legacy_audio_tools);
            // Seed bundled wallpapers/cursors so themed presets have their images.
            if let Ok(resource_dir) = app.path().resource_dir() {
                commands::assets::seed_bundled_assets(&resource_dir);
            }

            if let Some(updater) = app.get_webview_window("updater") {
                let handle = app.handle().clone();
                updater.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        let resolved = handle
                            .try_state::<startup::StartupGate>()
                            .map(|gate| gate.is_resolved())
                            .unwrap_or(false);
                        if !resolved {
                            api.prevent_close();
                            handle.exit(0);
                        }
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            startup::startup_window_ready,
            startup::startup_main_ready,
            startup::startup_continue,
            startup::startup_install_update,
            commands::system::get_app_info,
            commands::system::get_startup_model_path,
            commands::system::get_startup_paint_bin,
            commands::jade::jade_open,
            commands::settings::get_app_home,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::logging::log_message,
            commands::themes::list_custom_themes,
            commands::themes::save_custom_theme,
            commands::themes::delete_custom_theme,
            commands::hashes::get_hash_status,
            commands::hashes::download_hashes,
            commands::hashes::reload_hashes,
            commands::hashes::force_rebuild_hashes,
            commands::bins::read_bin,
            commands::bins::write_bin,
            commands::bins::text_to_bin_bytes,
            commands::assets::read_file_base64,
            commands::assets::get_fonts_dir,
            commands::assets::list_fonts,
            commands::assets::get_wallpapers_dir,
            commands::assets::list_wallpapers,
            commands::assets::import_wallpaper,
            commands::assets::delete_wallpaper,
            commands::context_menu::context_menu_is_enabled,
            commands::context_menu::context_menu_enable,
            commands::context_menu::context_menu_disable,
            commands::league::get_league_path,
            commands::extractor::discover_champions,
            commands::extractor::extract_champion_assets,
            commands::extractor::extract_tft_companion,
            commands::extractor::extractor_repath,
            commands::extractor::extractor_finalize_skin_only,
            commands::vfx_tools::tools_fix_vfx_shape,
            commands::vfx_tools::tools_bin_copy_colors,
            commands::particle::copy_particle_assets,
            commands::wad::wad_find_champion,
            commands::wad::wad_list_voiceovers,
            commands::wad::wad_read_toc,
            commands::wad::wad_read_chunk,
            commands::wad::wad_extract_chunks,
            commands::wad::wad_explorer_scan,
            commands::wad::wad_explorer_index,
            commands::wad::wad_explorer_index_many,
            commands::wad::wad_explorer_search,
            commands::wad::wad_explorer_entries,
            commands::wad::wad_explorer_unmount,
            commands::wad::wad_explorer_unmount_all,
            commands::wad::wad_explorer_texture,
            commands::wad::wad_explorer_text,
            commands::wad::wad_explorer_extract,
            commands::wad::wad_explorer_extract_hashes,
            commands::wad::wad_explorer_prepare_model,
            commands::fakegear::fakegear_copy_togglescreen_assets,
            commands::fakegear::fakegear_copy_variant_assets,
            commands::fakegear::fakegear_backup_bin,
            commands::fakegear::fakegear_process_minimal_mesh,
            commands::fakegear::fakegear_validate_anm,
            commands::fakegear::fakegear_write_variant_bins,
            commands::port_donor::port_prepare_donor_from_skin,
            commands::port_donor::port_cleanup_donor_temp,
            commands::port_donor::port_copy_assets_to_target,
            commands::port_donor::port_resolve_asset_path,
            commands::backups::backup_create,
            commands::backups::backup_list,
            commands::backups::backup_restore,
            commands::paint::paint_open,
            commands::paint::paint_close,
            commands::paint::paint_reload_if_changed,
            commands::paint::paint_recolor,
            commands::paint::paint_set_blend_mode,
            commands::paint::paint_set_material_param,
            commands::paint::paint_set_texture,
            commands::paint::paint_set_color_alpha,
            commands::paint::paint_undo,
            commands::paint::paint_redo,
            commands::paint::paint_save,
            commands::bineditor::bin_editor_open,
            commands::bineditor::bin_editor_close,
            commands::bineditor::bin_editor_model,
            commands::bineditor::bin_editor_reload_if_changed,
            commands::bineditor::bin_editor_create_system,
            commands::bineditor::bin_editor_add_emitter,
            commands::bineditor::bin_editor_add_child,
            commands::bineditor::bin_editor_apply,
            commands::bineditor::bin_editor_insert,
            commands::bineditor::bin_editor_structural,
            commands::bineditor::bin_editor_remove,
            commands::bineditor::bin_editor_move,
            commands::bineditor::bin_editor_undo,
            commands::bineditor::bin_editor_redo,
            commands::bineditor::bin_editor_restore,
            commands::bineditor::bin_editor_save,
            commands::vfx_session::vfx_open,
            commands::vfx_session::vfx_model,
            commands::vfx_session::vfx_anm_model,
            commands::vfx_session::vfx_reload_if_changed,
            commands::vfx_session::vfx_save,
            commands::vfx_session::vfx_close,
            commands::vfx_session::vfx_undo,
            commands::vfx_session::vfx_redo,
            commands::vfx_session::vfx_create_system,
            commands::vfx_session::vfx_port_emitters,
            commands::vfx_session::vfx_port_system,
            commands::vfx_session::vfx_delete_emitter,
            commands::vfx_session::vfx_delete_emitters,
            commands::vfx_session::vfx_delete_system,
            commands::vfx_session::vfx_set_matrix,
            commands::vfx_session::vfx_idle_add,
            commands::vfx_session::vfx_idle_remove,
            commands::vfx_session::vfx_child_add,
            commands::vfx_session::vfx_child_update,
            commands::vfx_session::vfx_persistent_upsert,
            commands::vfx_session::vfx_persistent_remove,
            commands::vfx_session::vfx_resolver_upsert,
            commands::vfx_session::vfx_rename_emitter,
            commands::vfx_session::vfx_set_texture,
            commands::vfx_session::vfx_rename_system,
            commands::vfx_anm::vfx_anm_set_clip_field,
            commands::vfx_anm::vfx_anm_set_event_field,
            commands::vfx_anm::vfx_anm_rename_clip,
            commands::vfx_anm::vfx_anm_rename_event,
            commands::vfx_anm::vfx_anm_delete_events,
            commands::vfx_anm::vfx_anm_delete_clips,
            commands::vfx_anm::vfx_anm_create_event,
            commands::vfx_anm::vfx_anm_create_clip,
            commands::vfx_anm::vfx_anm_move_event,
            commands::vfx_anm::vfx_anm_reorder_event,
            commands::vfx_anm::vfx_anm_reorder_clip,
            commands::vfx_anm::vfx_anm_port_clip,
            commands::vfx_anm::vfx_anm_port_event,
            commands::vfx_anm::vfx_anm_raw_node,
            commands::vfx_anm::vfx_anm_set_raw_node,
            commands::vfx_anm::vfx_anm_add_raw_field,
            commands::vfx_anm::vfx_anm_remove_raw_field,
            commands::bumpath::bumpath_repath,
            commands::bumpath::bumpath_enumerate_sources,
            commands::bumpath::bumpath_scan_entries,
            commands::file_ops::file_randomize,
            commands::file_ops::file_rename,
            commands::file_ops::paths_exist,
            commands::file_ops::paths_mtimes,
            commands::file_ops::tools_execute,
            commands::imgrecolor::imgrecolor_decode_texture,
            commands::imgrecolor::imgrecolor_save_texture,
            commands::imgrecolor::imgrecolor_scan_dir,
            commands::audio::bnk_load_banks,
            commands::audio::bnk_wem_to_ogg,
            commands::audio::bnk_wem_to_wav,
            commands::audio::bnk_wem_to_mp3,
            commands::audio::bnk_extract_nodes,
            commands::audio::bnk_save_bank,
            commands::audio::audio_convert_to_wem,
            commands::audio::audio_convert_wavs_to_wem,
            commands::audio::audio_decode_to_wav,
            commands::audio::audio_amplify_wem,
            commands::audio::bnk_scan_mod_folder,
            commands::audio::bnk_extract_banks_from_game,
            commands::audio::audio_write_file,
            commands::bnk_session::bnk_session_save,
            commands::bnk_session::bnk_session_load,
            commands::bnk_session::bnk_session_delete,
            commands::bnk_session::bnk_session_list,
            commands::upscale::prefs_get,
            commands::upscale::prefs_set,
            commands::upscale::upscale_check_status,
            commands::upscale::upscale_download_all,
            commands::upscale::realesrgan_ensure,
            commands::upscale::upscayl_stream,
            commands::upscale::upscayl_batch_process,
            commands::upscale::upscayl_cancel,
            commands::port_hub::port_stage_hub_donor,
            commands::port_hub::port_prepare_hub_upload,
            commands::explorer::explorer_list_dir,
            commands::explorer::explorer_quick_links,
            commands::explorer::explorer_resolve_path,
            commands::explorer::explorer_filter_existing,
            commands::explorer::explorer_rename,
            commands::explorer::explorer_delete,
            commands::explorer::explorer_copy,
            commands::explorer::explorer_new_folder,
            commands::explorer::explorer_reveal,
            commands::explorer::explorer_thumbnail,
            commands::model_inspect::model_inspect_load,
            commands::model_inspect::model_inspect_scene_assets,
            commands::model_inspect::model_inspect_skeleton,
            commands::model_inspect::model_inspect_animation,
            commands::model_inspect::model_inspect_disk_animations,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Quartz");
}
