use crate::core::settings::AppSettings;
use crate::core::state::AppState;
use std::sync::Arc;
use tauri::State;
use super::window::set_window_shadow;

#[tauri::command]
pub async fn get_app_settings(state: State<'_, Arc<AppState>>) -> Result<AppSettings, String> {
    Ok(state.get_settings())
}

#[tauri::command]
pub async fn update_app_settings(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    let disable_shadow = settings.interface.disable_window_shadow;
    
    // Sync system auto-start configuration
    use tauri_plugin_autostart::ManagerExt;
    let autostart_manager = app.autolaunch();
    if settings.interface.auto_start_on_boot {
        let _ = autostart_manager.enable();
    } else {
        let _ = autostart_manager.disable();
    }

    let result = state.update_settings(settings)?;

    use tauri::Manager;
    if let Some(main_win) = app.get_webview_window("main") {
        let _ = set_window_shadow(&main_win, disable_shadow);
    }

    Ok(result)
}

#[tauri::command]
pub async fn update_trackers_from_subscription(
    state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    let settings = state.get_settings();
    let url = settings.bt.tracker_subscribe_url.trim();
    if url.is_empty() {
        return Err("Tracker subscription URL is empty".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .danger_accept_invalid_certs(settings.transfer.ignore_ssl_certificate)
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let response = client.get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch tracker list: {}", e))?;

    let text = response.text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    let trackers: Vec<String> = text
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .collect();

    if trackers.is_empty() {
        return Err("No valid trackers found in the subscription content".to_string());
    }

    let tracker_list_str = trackers.join("\n");

    let mut updated_settings = settings;
    updated_settings.bt.tracker_list = tracker_list_str.clone();
    state.update_settings(updated_settings)?;

    Ok(format!("Successfully updated {} trackers", trackers.len()))
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct Aria2EngineStatusPayload {
    status: String,
    version: Option<String>,
    progress: f64,
    error_message: Option<String>,
}

#[tauri::command]
pub async fn get_aria2_engine_status(
    state: State<'_, Arc<AppState>>,
) -> Result<Aria2EngineStatusPayload, String> {
    let status = state.aria2_engine.get_status();
    let status_str = match status.status {
        crate::download::aria2_engine::Aria2EngineStatusType::NotInstalled => "not_installed",
        crate::download::aria2_engine::Aria2EngineStatusType::Downloading => "downloading",
        crate::download::aria2_engine::Aria2EngineStatusType::Extracting => "extracting",
        crate::download::aria2_engine::Aria2EngineStatusType::Ready => "ready",
        crate::download::aria2_engine::Aria2EngineStatusType::Running => "running",
        crate::download::aria2_engine::Aria2EngineStatusType::Error => "error",
    };
    Ok(Aria2EngineStatusPayload {
        status: status_str.to_string(),
        version: status.version,
        progress: status.progress,
        error_message: status.error_message,
    })
}

#[tauri::command]
pub async fn update_aria2_engine(
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let aria2_engine = state.aria2_engine.clone();
    let state_clone = state.inner().clone();
    
    // Stop if currently running
    aria2_engine.stop().await;
    
    tauri::async_runtime::spawn(async move {
        if let Ok(_) = aria2_engine.download_and_install().await {
            let current_settings = state_clone.get_settings();
            if current_settings.download.backend == crate::core::settings::DownloadBackend::Aria2 {
                let rpc_port = current_settings.download.aria2_port;
                let rpc_secret = current_settings.download.aria2_rpc_secret.clone();
                let _ = aria2_engine.start(rpc_port, &rpc_secret).await;
            }
        }
    });

    Ok(())
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct FfmpegEngineStatusPayload {
    status: String,
    version: Option<String>,
    progress: f64,
    error_message: Option<String>,
}

#[tauri::command]
pub async fn get_ffmpeg_engine_status(
    state: State<'_, Arc<AppState>>,
) -> Result<FfmpegEngineStatusPayload, String> {
    let status = state.ffmpeg_engine.get_status();
    let status_str = match status.status {
        crate::download::ffmpeg_engine::FfmpegEngineStatusType::NotInstalled => "not_installed",
        crate::download::ffmpeg_engine::FfmpegEngineStatusType::Downloading => "downloading",
        crate::download::ffmpeg_engine::FfmpegEngineStatusType::Extracting => "extracting",
        crate::download::ffmpeg_engine::FfmpegEngineStatusType::Ready => "ready",
        crate::download::ffmpeg_engine::FfmpegEngineStatusType::Error => "error",
    };
    Ok(FfmpegEngineStatusPayload {
        status: status_str.to_string(),
        version: status.version,
        progress: status.progress,
        error_message: status.error_message,
    })
}

#[tauri::command]
pub async fn update_ffmpeg_engine(
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let ffmpeg_engine = state.ffmpeg_engine.clone();
    
    tauri::async_runtime::spawn(async move {
        let _ = ffmpeg_engine.download_and_install().await;
    });

    Ok(())
}

