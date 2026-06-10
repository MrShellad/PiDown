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
    if let Some(float_win) = app.get_webview_window("float") {
        let _ = set_window_shadow(&float_win, disable_shadow);
    }

    Ok(result)
}
