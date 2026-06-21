mod commands;
mod core;
mod download;
mod events;

use core::app_paths::default_download_dir;
use core::native_bridge::start_native_bridge_server;
use core::state::AppState;
use tauri::Manager;
use tauri::Emitter;


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
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
        ])
        .register_asynchronous_uri_scheme_protocol("webdav", move |ctx, request, responder| {
            let app_handle = ctx.app_handle().clone();
            let state = match app_handle.try_state::<std::sync::Arc<AppState>>() {
                Some(s) => s.inner().clone(),
                None => {
                    responder.respond(
                        tauri::http::Response::builder()
                            .status(500)
                            .body(b"AppState not found".to_vec())
                            .unwrap()
                    );
                    return;
                }
            };

            tauri::async_runtime::spawn(async move {
                if request.method() == tauri::http::Method::OPTIONS {
                    let response = tauri::http::Response::builder()
                        .status(204)
                        .header("Access-Control-Allow-Origin", "*")
                        .header("Access-Control-Allow-Methods", "GET, OPTIONS")
                        .header("Access-Control-Allow-Headers", "*")
                        .body(Vec::new())
                        .unwrap();
                    responder.respond(response);
                    return;
                }

                let uri_str = request.uri().to_string();
                let http_uri_str = uri_str.replace("webdav://localhost", "http://localhost");
                let parsed_url = match reqwest::Url::parse(&http_uri_str) {
                    Ok(u) => u,
                    Err(e) => {
                        responder.respond(
                            tauri::http::Response::builder()
                                .status(400)
                                .body(format!("Parse URI error: {e}").into_bytes())
                                .unwrap()
                        );
                        return;
                    }
                };

                let mut device_id = None;
                let mut path = None;
                for (key, val) in parsed_url.query_pairs() {
                    if key == "device_id" {
                        device_id = Some(val.into_owned());
                    } else if key == "path" {
                        path = Some(val.into_owned());
                    }
                }

                let (device_id, path) = match (device_id, path) {
                    (Some(d), Some(p)) => (d, p),
                    _ => {
                        responder.respond(
                            tauri::http::Response::builder()
                                .status(400)
                                .body(b"Missing device_id or path query parameters".to_vec())
                                .unwrap()
                        );
                        return;
                    }
                };

                let mut range_start = 0;
                let mut range_end = None;
                if let Some(range_val) = request.headers().get(tauri::http::header::RANGE) {
                    if let Ok(range_str) = range_val.to_str() {
                        if let Some((start, end)) = parse_range(range_str) {
                            range_start = start;
                            range_end = end;
                        }
                    }
                }

                // Check cache
                let cached_data = {
                    let cache_guard = state.video_cache.lock().unwrap();
                    if let Some(ref cache) = *cache_guard {
                        if cache.device_id == device_id && cache.path == path {
                            let target_end = range_end.unwrap_or(range_start + 2 * 1024 * 1024 - 1);
                            cache.get_range(range_start, target_end).map(|data| {
                                (data, cache.total_size, cache.content_type.clone())
                            })
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                };

                if let Some((data, total_size, content_type)) = cached_data {
                    if let Some(total) = total_size {
                        let target_end = range_start + data.len() as u64 - 1;
                        let ct = content_type.unwrap_or_else(|| "video/mp4".to_string());
                        
                        let response = tauri::http::Response::builder()
                            .status(206)
                            .header("Content-Type", ct)
                            .header("Content-Length", data.len().to_string())
                            .header("Content-Range", format!("bytes {}-{}/{}", range_start, target_end, total))
                            .header("Accept-Ranges", "bytes")
                            .header("Access-Control-Allow-Origin", "*")
                            .header("Access-Control-Allow-Methods", "GET, OPTIONS")
                            .header("Access-Control-Allow-Headers", "*")
                            .body(data)
                            .unwrap();

                        log::info!("WebDAV Cache HIT: bytes {}-{}/{}", range_start, target_end, total);
                        responder.respond(response);
                        return;
                    }
                }

                let db = &state.db;
                let dev = match db.get_webdav_device(&device_id) {
                    Ok(Some(d)) => d,
                    _ => {
                        responder.respond(
                            tauri::http::Response::builder()
                                .status(404)
                                .body(b"WebDAV device not found".to_vec())
                                .unwrap()
                        );
                        return;
                    }
                };

                let key = match crate::core::webdav::derive_key(&app_handle) {
                    Ok(k) => k,
                    Err(e) => {
                        responder.respond(
                            tauri::http::Response::builder()
                                .status(500)
                                .body(format!("Derive key error: {e}").into_bytes())
                                .unwrap()
                        );
                        return;
                    }
                };

                let decrypted_pass = match crate::core::webdav::decrypt_password(&dev.password_encrypted, &key) {
                    Ok(p) => p,
                    Err(e) => {
                        responder.respond(
                            tauri::http::Response::builder()
                                .status(500)
                                .body(format!("Decrypt password error: {e}").into_bytes())
                                .unwrap()
                        );
                        return;
                    }
                };

                let client = match reqwest::Client::builder()
                    .danger_accept_invalid_certs(true)
                    .build() {
                        Ok(c) => c,
                        Err(e) => {
                            responder.respond(
                                tauri::http::Response::builder()
                                    .status(500)
                                    .body(format!("Client build error: {e}").into_bytes())
                                    .unwrap()
                            );
                            return;
                        }
                    };

                let parsed_server = match reqwest::Url::parse(&dev.server_url) {
                    Ok(u) => u,
                    Err(e) => {
                        responder.respond(
                            tauri::http::Response::builder()
                                .status(400)
                                .body(format!("Invalid server URL: {e}").into_bytes())
                                .unwrap()
                        );
                        return;
                    }
                };
                let origin = parsed_server.origin().ascii_serialization();
                let server_path = parsed_server.path().trim_end_matches('/');

                let absolute_path = if !server_path.is_empty() && path.starts_with(server_path) {
                    path.to_string()
                } else {
                    format!("{}/{}", server_path, path.trim_start_matches('/'))
                };

                let encoded_path: String = absolute_path
                    .split('/')
                    .map(|segment| urlencoding::encode(segment).into_owned())
                    .collect::<Vec<String>>()
                    .join("/");

                let target_url = format!("{}{}", origin, encoded_path);

                log::info!("WebDAV Custom Protocol request: URI={}, Range={:?}", request.uri(), request.headers().get(tauri::http::header::RANGE));

                let mut req = client.get(&target_url)
                    .basic_auth(&dev.username, Some(&decrypted_pass));

                if let Some(range_val) = request.headers().get(tauri::http::header::RANGE) {
                    if let Ok(range_str) = range_val.to_str() {
                        let max_chunk_size = 2 * 1024 * 1024; // 2MB
                        if let Some(limited_range) = limit_range_header(range_str, max_chunk_size) {
                            log::info!("Limiting Range header from {:?} to {:?}", range_str, limited_range);
                            req = req.header(tauri::http::header::RANGE, limited_range);
                        } else {
                            req = req.header(tauri::http::header::RANGE, range_val);
                        }
                    } else {
                        req = req.header(tauri::http::header::RANGE, range_val);
                    }
                }

                match req.send().await {
                    Ok(res) => {
                        let status = res.status().as_u16();
                        log::info!("WebDAV server response: status={}, content-range={:?}, content-length={:?}", status, res.headers().get("content-range"), res.headers().get("content-length"));
                        
                        // Initialize or update metadata in VideoCache
                        {
                            let mut cache_guard = state.video_cache.lock().unwrap();
                            let is_same = if let Some(ref c) = *cache_guard {
                                c.device_id == device_id && c.path == path
                            } else {
                                false
                            };

                            if !is_same {
                                *cache_guard = Some(crate::core::state::VideoCache {
                                    device_id: device_id.clone(),
                                    path: path.clone(),
                                    blocks: Vec::new(),
                                    total_bytes: 0,
                                    total_size: None,
                                    content_type: None,
                                    duration: None,
                                });
                            }

                            if let Some(ref mut cache) = *cache_guard {
                                if cache.content_type.is_none() {
                                    if let Some(ct_val) = res.headers().get("content-type") {
                                        if let Ok(ct_str) = ct_val.to_str() {
                                            cache.content_type = Some(ct_str.to_string());
                                        }
                                    }
                                }
                                if cache.total_size.is_none() {
                                    if let Some(cr_val) = res.headers().get("content-range") {
                                        if let Ok(cr_str) = cr_val.to_str() {
                                            if let Some(slash_idx) = cr_str.rfind('/') {
                                                if let Ok(total) = cr_str[slash_idx + 1..].parse::<u64>() {
                                                    cache.total_size = Some(total);
                                                }
                                            }
                                        }
                                    } else if let Some(cl_val) = res.headers().get("content-length") {
                                        if let Ok(cl_str) = cl_val.to_str() {
                                            if let Ok(len) = cl_str.parse::<u64>() {
                                                if status == 200 {
                                                    cache.total_size = Some(len);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        let mut builder = tauri::http::Response::builder().status(status);

                        for (key, val) in res.headers() {
                            let key_str = key.as_str();
                            if key_str.eq_ignore_ascii_case("content-type")
                                || key_str.eq_ignore_ascii_case("content-length")
                                || key_str.eq_ignore_ascii_case("content-range")
                                || key_str.eq_ignore_ascii_case("accept-ranges") {
                                builder = builder.header(key_str, val);
                            }
                        }

                        builder = builder
                            .header("Accept-Ranges", "bytes")
                            .header("Access-Control-Allow-Origin", "*")
                            .header("Access-Control-Allow-Methods", "GET, OPTIONS")
                            .header("Access-Control-Allow-Headers", "*");

                        let start_time = std::time::Instant::now();
                        match res.bytes().await {
                            Ok(body_bytes) => {
                                let elapsed = start_time.elapsed();
                                let bytes_len = body_bytes.len();
                                let speed_bps = if elapsed.as_secs_f64() > 0.0 {
                                    bytes_len as f64 / elapsed.as_secs_f64()
                                } else {
                                    0.0
                                };

                                let _ = app_handle.emit("webdav-stream-speed", serde_json::json!({
                                    "speed_bps": speed_bps as u64
                                }));

                                // Insert block into cache
                                {
                                    let settings = state.get_settings();
                                    let buffer_time_s = settings.player.buffer_time_s;

                                    let mut cache_guard = state.video_cache.lock().unwrap();
                                    if let Some(ref mut cache) = *cache_guard {
                                        if cache.device_id == device_id && cache.path == path {
                                            // Calculate dynamic max cache bytes based on duration and buffer time
                                            let max_cache_bytes = match (cache.total_size, cache.duration) {
                                                (Some(total_size), Some(duration)) if duration > 0.0 => {
                                                    let bitrate = total_size as f64 / duration;
                                                    let bytes = (bitrate * buffer_time_s as f64) as usize;
                                                    // Enforce a minimum of 20MB cache size
                                                    bytes.max(20 * 1024 * 1024)
                                                }
                                                _ => {
                                                    // Fallback to 200MB if duration/size not yet known
                                                    200 * 1024 * 1024
                                                }
                                            };
                                            cache.insert_block(range_start, body_bytes.to_vec(), max_cache_bytes);
                                            log::info!(
                                                "WebDAV Cache Inserted: bytes {} (len={}), total cache size={}, max_bytes={}",
                                                range_start,
                                                bytes_len,
                                                cache.total_bytes,
                                                max_cache_bytes
                                            );
                                        }
                                    }
                                }

                                let response = builder.body(body_bytes.to_vec()).unwrap();
                                responder.respond(response);
                            }
                            Err(e) => {
                                log::error!("Read WebDAV body error: {e}");
                                responder.respond(
                                    tauri::http::Response::builder()
                                        .status(502)
                                        .body(format!("Read body error: {e}").into_bytes())
                                        .unwrap()
                                );
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("WebDAV request send error: {e}");
                        responder.respond(
                            tauri::http::Response::builder()
                                .status(502)
                                .body(format!("Request error: {e}").into_bytes())
                                .unwrap()
                        );
                    }
                }
            });
        })
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

fn limit_range_header(range_value: &str, max_chunk_size: u64) -> Option<String> {
    if !range_value.starts_with("bytes=") {
        return None;
    }
    let parts: Vec<&str> = range_value["bytes=".len()..].split('-').collect();
    if parts.is_empty() {
        return None;
    }
    let start: u64 = parts[0].parse().ok()?;
    let end = if parts.len() > 1 && !parts[1].is_empty() {
        let parsed_end: u64 = parts[1].parse().ok()?;
        Some(parsed_end)
    } else {
        None
    };

    match end {
        Some(e) => {
            if e >= start && (e - start + 1) > max_chunk_size {
                Some(format!("bytes={}-{}", start, start + max_chunk_size - 1))
            } else {
                None
            }
        }
        None => {
            Some(format!("bytes={}-{}", start, start + max_chunk_size - 1))
        }
    }
}

fn parse_range(range_str: &str) -> Option<(u64, Option<u64>)> {
    if !range_str.starts_with("bytes=") {
        return None;
    }
    let parts: Vec<&str> = range_str["bytes=".len()..].split('-').collect();
    if parts.is_empty() {
        return None;
    }
    let start: u64 = parts[0].parse().ok()?;
    let end = if parts.len() > 1 && !parts[1].is_empty() {
        parts[1].parse().ok()
    } else {
        None
    };
    Some((start, end))
}
