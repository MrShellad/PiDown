mod commands;
mod core;
mod download;
mod events;

use core::app_paths::default_download_dir;
use core::native_bridge::{remove_bridge_state, start_native_bridge_server};
use core::state::AppState;
use core::window_state::setup_main_window_state;
use tauri::Manager;

pub fn run_native_host() -> Result<(), String> {
    let app_data_dir = core::app_paths::app_data_dir()?;
    core::native_bridge::run_native_host(&app_data_dir)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            // Initialize logging in debug mode
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let app_handle = app.handle().clone();
            let app_data_dir = app_handle
                .path()
                .app_data_dir()
                .expect("Failed to resolve app data directory");
            let default_save_dir = default_download_dir(&app_data_dir);

            let state =
                tauri::async_runtime::block_on(AppState::new(&app_data_dir, &default_save_dir))
                    .map_err(std::io::Error::other)?;

            setup_main_window_state(&app_handle, &app_data_dir).map_err(std::io::Error::other)?;
            if let Err(error) = start_native_bridge_server(app_data_dir.clone(), app_handle.clone())
            {
                log::warn!("PiDownloader native bridge is unavailable: {error}");
            }

            app.manage(state.clone());
            events::start_global_event_ticker(app_handle.clone(), state.clone());
            events::start_event_reporter(app_handle, state);
            log::info!("PiDownloader backend initialized successfully");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_task,
            commands::check_file_conflict,
            commands::inspect_download_metadata,
            commands::preview_task_classification,
            commands::read_clipboard_text,
            commands::write_clipboard_text,
            commands::pick_download_directory,
            commands::pause_task,
            commands::resume_task,
            commands::cancel_task,
            commands::clear_completed_tasks,
            commands::open_task_file,
            commands::open_task_folder,
            commands::restart_task,
            commands::switch_to_float,
            commands::switch_to_main,
            commands::close_main_window,
            commands::get_active_tasks,
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
            commands::list_system_fonts,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    let app_data_dir = app
        .handle()
        .path()
        .app_data_dir()
        .expect("Failed to resolve app data directory");
    app.run(move |_app_handle, event| {
        if matches!(
            event,
            tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
        ) {
            let _ = remove_bridge_state(&app_data_dir);
        }
    });
}
