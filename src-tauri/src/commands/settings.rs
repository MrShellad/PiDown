use crate::core::settings::AppSettings;
use crate::core::state::AppState;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn get_app_settings(state: State<'_, Arc<AppState>>) -> Result<AppSettings, String> {
    Ok(state.get_settings())
}

#[tauri::command]
pub async fn update_app_settings(
    state: State<'_, Arc<AppState>>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    state.update_settings(settings)
}
