mod commands;
mod core;
mod download;
mod events;

use core::app_paths::default_download_dir;
use core::native_bridge::start_native_bridge_server;
use core::state::AppState;
use tauri::Manager;


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let app_data_dir = app_handle
                .path()
                .app_data_dir()
                .expect("Failed to resolve app data directory");

            // Initialize logging to data_dir/logs
            let logs_dir = app_data_dir.join("logs");
            std::fs::create_dir_all(&logs_dir).ok();

            let log_plugin = tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Folder {
                        path: logs_dir,
                        file_name: Some("pidownloader.log".to_string()),
                    }),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                ])
                .build();
            app.handle().plugin(log_plugin)?;

            let default_save_dir = default_download_dir(&app_data_dir);

            let state =
                tauri::async_runtime::block_on(AppState::new(&app_data_dir, &default_save_dir))
                    .map_err(std::io::Error::other)?;

            *state.app_handle.lock().unwrap() = Some(app_handle.clone());

            app.manage(state.clone());
            if let Err(error) = start_native_bridge_server(app_data_dir.clone(), app_handle.clone())
            {
                log::warn!("PiDownloader native bridge is unavailable: {error}");
            }
            events::start_global_event_ticker(app_handle.clone(), state.clone());
            events::start_file_status_tracker(app_handle.clone(), state.clone());
            events::start_event_reporter(app_handle, state.clone());

            let settings = state.get_settings();

            // Sync system auto-start configuration on startup
            use tauri_plugin_autostart::ManagerExt;
            let autostart_manager = app.autolaunch();
            if settings.interface.auto_start_on_boot {
                let _ = autostart_manager.enable();
            } else {
                let _ = autostart_manager.disable();
            }

            let disable_shadow = settings.interface.disable_window_shadow;
            if let Some(main_win) = app.get_webview_window("main") {
                let _ = commands::window::set_window_shadow(&main_win, disable_shadow);
            }

            // Set up System Tray
            use tauri::menu::{Menu, MenuItem};
            use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};

            let tray_menu = Menu::with_items(app, &[
                &MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?,
                &MenuItem::with_id(app, "exit", "退出应用", true, None::<&str>)?,
            ])?;

            let tray_icon = app.default_window_icon().cloned();
            if let Some(icon) = tray_icon {
                let _tray = TrayIconBuilder::new()
                    .icon(icon)
                    .menu(&tray_menu)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(main_win) = app.get_webview_window("main") {
                                let _ = main_win.show();
                                let _ = main_win.unminimize();
                                let _ = main_win.set_focus();
                            }
                        }
                        "exit" => {
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(main_win) = app.get_webview_window("main") {
                                let _ = main_win.show();
                                let _ = main_win.unminimize();
                                let _ = main_win.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            } else {
                log::warn!("Default window icon not found; system tray is disabled.");
            }

            log::info!("PiDownloader backend initialized successfully");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_task,
            commands::check_file_conflict,
            commands::get_disk_space,
            commands::inspect_download_metadata,
            commands::preview_task_classification,
            commands::read_clipboard_text,
            commands::write_clipboard_text,
            commands::pick_download_directory,
            commands::pick_torrent_file,
            commands::calculate_task_file_checksum,
            commands::pause_task,
            commands::resume_task,
            commands::cancel_task,
            commands::clear_completed_tasks,
            commands::open_task_file,
            commands::open_task_folder,
            commands::open_directory,
            commands::open_url,
            commands::restart_task,
            commands::switch_to_float,
            commands::switch_to_main,
            commands::close_main_window,
            commands::get_active_tasks,
            commands::get_bt_task_details,
            commands::update_task_trackers,
            commands::get_categories,
            commands::create_category,
            commands::update_category,
            commands::delete_category,
            commands::get_tags,
            commands::update_task_category,
            commands::add_task_tag,
            commands::remove_task_tag,
            commands::create_tag,
            commands::update_tag,
            commands::delete_tag,
            commands::get_app_settings,
            commands::update_app_settings,
            commands::update_trackers_from_subscription,
            commands::list_system_fonts,
            commands::save_theme_font,
            commands::get_backgrounds,
            commands::pick_background_file,
            commands::import_background_file,
            commands::import_background_url,
            commands::delete_background,
            commands::exit_app,
            commands::get_cursor_screen_pos,
            commands::get_webdav_devices,
            commands::refresh_webdav_device_status,
            commands::save_webdav_device,
            commands::delete_webdav_device,
            commands::test_webdav_connection,
            commands::list_webdav_files,
            commands::set_video_player_duration,
            commands::download_webdav_file,
            commands::get_webdav_download_url,
            commands::rename_webdav_item,
            commands::delete_webdav_items,
            commands::copy_webdav_item,
            commands::move_webdav_item,
            commands::open_extension_directory,
            commands::get_extension_directory_path,
            commands::respond_pairing,
            commands::save_extension_zip,
        ]);

    let builder = crate::download::protocols::webdav_stream::register_webdav_protocol(builder);

    let app = builder
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let app_handle = window.app_handle().clone();
                    let state = window.state::<std::sync::Arc<AppState>>().inner().clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(error) = commands::handle_close_action(&app_handle, &state).await {
                            log::error!("Error handling close event: {error}");
                            app_handle.exit(1);
                        }
                    });
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, _event| {});
}
