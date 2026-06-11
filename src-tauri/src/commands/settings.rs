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

