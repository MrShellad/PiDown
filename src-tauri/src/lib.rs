mod commands;
mod core;
mod download;
mod events;

use core::state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            let default_save_dir = app_handle
                .path()
                .download_dir()
                .unwrap_or_else(|_| app_data_dir.join("downloads"));

            let state =
                tauri::async_runtime::block_on(AppState::new(&app_data_dir, &default_save_dir))
                    .map_err(std::io::Error::other)?;

            app.manage(state.clone());
            events::start_global_event_ticker(app_handle.clone(), state.clone());
            events::start_event_reporter(app_handle, state);
            log::info!("PiDownloader backend initialized successfully");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_task,
            commands::inspect_download_metadata,
            commands::pause_task,
            commands::resume_task,
            commands::cancel_task,
            commands::open_task_file,
            commands::open_task_folder,
            commands::restart_task,
            commands::switch_to_float,
            commands::switch_to_main,
            commands::open_settings_window,
            commands::close_settings_window,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
