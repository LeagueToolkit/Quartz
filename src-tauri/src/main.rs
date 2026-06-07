// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod core;
mod state;

use commands::settings::{get_quartz_home, initialize_app_home};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

fn main() {
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|_app| {
            if let Err(e) = initialize_app_home() {
                tracing::error!("Failed to initialize app home: {}", e);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system::get_app_info,
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
            commands::extractor::discover_champions,
            commands::extractor::extract_champion_assets,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Quartz");
}
