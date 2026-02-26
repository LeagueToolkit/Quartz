mod bin_commands;
mod app_commands;
mod hash_commands;
mod extra_commands;
mod core;
mod error;

use tauri::Manager;
use tauri::Emitter;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // When a second instance is launched (e.g. double-clicking a .bin file),
            // focus the existing window and emit the file path to the frontend
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            // Find any file path argument (skip the exe path at index 0)
            let file_path = args.iter().skip(1).find(|a| {
                let lower = a.to_lowercase();
                lower.ends_with(".bin") || (!a.starts_with('-') && std::path::Path::new(a.as_str()).exists())
            });
            if let Some(path) = file_path {
                let _ = app.emit("open-file", path.clone());
                println!("[SingleInstance] Emitting open-file: {}", path);
            }
        }))
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Migrate preferences from old location if needed
            if let Err(e) = app_commands::migrate_preferences_if_needed(&app_handle) {
                eprintln!("[Setup] Failed to migrate preferences: {}", e);
            }

            // Restore window state immediately
            if let Some(window) = app.get_webview_window("main") {
                tauri::async_runtime::block_on(async {
                    match app_commands::get_window_state(app_handle.clone()).await {
                        Ok(Some(state)) => {
                            println!("[Setup] Restoring window state: {:?}", state);

                            const MIN_WIDTH: f64 = 800.0;
                            const MIN_HEIGHT: f64 = 600.0;

                            let width = if state.width < MIN_WIDTH { MIN_WIDTH } else { state.width };
                            let height = if state.height < MIN_HEIGHT { MIN_HEIGHT } else { state.height };

                            let position_valid = state.x > -10000 && state.y > -10000 && state.x < 10000 && state.y < 10000;

                            let _ = window.set_size(tauri::LogicalSize::new(width, height));

                            if position_valid {
                                let _ = window.set_position(tauri::PhysicalPosition::new(state.x, state.y));
                            } else {
                                let _ = window.center();
                            }

                            if state.fullscreen {
                                let _ = window.set_fullscreen(true);
                            } else if state.maximized {
                                let _ = window.maximize();
                            }
                        }
                        Ok(None) => {
                            let _ = window.center();
                        }
                        Err(e) => {
                            eprintln!("[Setup] Failed to restore window state: {}", e);
                            let _ = window.center();
                        }
                    }
                });
            }

            // Load and apply custom icon on startup if one was saved
            let app_handle2 = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(100));
                tauri::async_runtime::block_on(async {
                    if let Ok(Some(icon_path)) = app_commands::get_custom_icon_path(app_handle2.clone()).await {
                        for i in 0..10 {
                            match apply_saved_icon(&app_handle2, &icon_path) {
                                Ok(_) => {
                                    println!("[Icon] Successfully applied saved icon: {}", icon_path);
                                    break;
                                }
                                Err(_e) if i < 9 => {
                                    std::thread::sleep(std::time::Duration::from_millis(50));
                                }
                                Err(e) => {
                                    eprintln!("[Icon] Failed to apply saved icon: {}", e);
                                }
                            }
                        }
                    }
                });
            });

            // Handle file path from command line args (e.g. double-click .bin file)
            let args: Vec<String> = std::env::args().collect();
            let file_arg = args.iter().skip(1).find(|a| {
                let lower = a.to_lowercase();
                lower.ends_with(".bin") || (!a.starts_with('-') && std::path::Path::new(a.as_str()).exists())
            }).cloned();
            if let Some(path) = file_arg {
                let app_handle3 = app.handle().clone();
                // Delay slightly to let the frontend initialize
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(800));
                    let _ = app_handle3.emit("open-file", path.clone());
                    println!("[Setup] Emitting open-file from args: {}", path);
                });
            }

            // Set up system tray
            setup_tray(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Check if minimize-to-tray is enabled
                let app = window.app_handle();
                let minimize_to_tray = tauri::async_runtime::block_on(async {
                    app_commands::get_preference(
                        app.clone(),
                        "MinimizeToTray".to_string(),
                        "False".to_string(),
                    ).await.unwrap_or_else(|_| "False".to_string())
                });

                if minimize_to_tray == "True" {
                    api.prevent_close();
                    let _ = window.hide();
                    println!("[Tray] Window hidden to tray");
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            bin_commands::convert_bin_to_text,
            bin_commands::convert_text_to_bin,
            bin_commands::batch_convert_bins,
            bin_commands::find_linked_bin_file,
            app_commands::get_app_version,
            app_commands::get_custom_icon_path,
            app_commands::get_custom_icon_data,
            app_commands::set_custom_icon,
            app_commands::open_url,
            app_commands::save_window_state,
            app_commands::get_window_state,
            app_commands::get_preference,
            app_commands::set_preference,
            app_commands::get_recent_files,
            app_commands::add_recent_file,
            app_commands::get_preferences_path,
            app_commands::open_preferences_folder,
            app_commands::get_all_preferences,
            hash_commands::check_hashes,
            hash_commands::download_hashes,
            hash_commands::open_hashes_folder,
            hash_commands::preload_hashes,
            hash_commands::get_preload_status,
            hash_commands::unload_hashes,
            hash_commands::convert_hashes_to_binary,
            // New commands
            extra_commands::register_bin_association,
            extra_commands::unregister_bin_association,
            extra_commands::get_bin_association_status,
            extra_commands::toggle_autostart,
            extra_commands::get_autostart_status,
            extra_commands::check_for_update,
            extra_commands::start_update_download,
            extra_commands::run_installer,
            // Texture preview
            app_commands::get_file_mtime,
            app_commands::read_file_base64,
            app_commands::resolve_asset_path,
            app_commands::detect_image_editors,
            app_commands::open_tex_for_edit,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Set up system tray icon with menu
fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};
    use tauri::menu::{MenuBuilder, MenuItemBuilder};

    let show_item = MenuItemBuilder::with_id("show", "Show Jade").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show_item)
        .separator()
        .item(&quit_item)
        .build()?;

    // Load tray icon from app's default window icon
    let icon = app.default_window_icon()
        .cloned()
        .ok_or("No default window icon found")?;

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("Jade - League Bin Editor")
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            // Double-click to show window
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

/// Apply a saved icon to the window on startup
fn apply_saved_icon(app: &tauri::AppHandle, icon_path: &str) -> Result<(), String> {
    if !std::path::Path::new(icon_path).exists() {
        return Err("Icon file no longer exists".to_string());
    }

    let img = image::open(icon_path)
        .map_err(|e| format!("Failed to load icon image: {}", e))?;

    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    let rgba_data = rgba.into_raw();

    let icon = tauri::image::Image::new_owned(rgba_data, width, height);

    if let Some(window) = app.get_webview_window("main") {
        window.set_icon(icon)
            .map_err(|e| format!("Failed to set window icon: {}", e))?;
    }

    Ok(())
}
