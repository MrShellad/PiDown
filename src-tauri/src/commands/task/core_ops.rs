use crate::core::models::TaskOverview;
use crate::core::state::{AppState, TaskCreateOptions};
use std::sync::Arc;
use tauri::State;
use super::file_utils::{ensure_target_file_available, remove_existing_download_file};

#[tauri::command]
pub async fn create_task(
    state: State<'_, Arc<AppState>>,
    url: String,
    path: Option<String>,
    filename: Option<String>,
    category_id: Option<i64>,
    category_override: Option<bool>,
    total_size: Option<u64>,
    overwrite: Option<bool>,
    max_download_speed_kib: Option<u64>,
    max_upload_speed_kib: Option<u64>,
    max_connections: Option<u32>,
    user_agent: Option<String>,
    referer: Option<String>,
    cookies: Option<Vec<String>>,
    selected_files: Option<Vec<usize>>,
    sequential: Option<bool>,
    auto_verify: Option<bool>,
    disable_dht_pex_lpd: Option<bool>,
    file_allocation: Option<String>,
) -> Result<String, String> {
    let should_overwrite = overwrite.unwrap_or(false);
    if !should_overwrite {
        ensure_target_file_available(path.as_deref(), filename.as_deref())?;
    }

    if should_overwrite {
        remove_existing_download_file(path.as_deref(), filename.as_deref())?;
    }

    state
        .add_task(
            &url,
            path.as_deref(),
            filename.as_deref(),
            category_id,
            category_override.unwrap_or(false),
            total_size,
            TaskCreateOptions {
                max_connections,
                max_download_speed_kib,
                max_upload_speed_kib,
                user_agent,
                referer,
                cookies: cookies.unwrap_or_default(),
                selected_files,
                sequential,
                auto_verify,
                disable_dht_pex_lpd,
                file_allocation,
            },
        )
        .await
}

#[tauri::command]
pub async fn pause_task(state: State<'_, Arc<AppState>>, gid: String) -> Result<(), String> {
    state.pause_task(&gid).await
}

#[tauri::command]
pub async fn resume_task(state: State<'_, Arc<AppState>>, gid: String) -> Result<(), String> {
    state.resume_task(&gid).await
}

#[tauri::command]
pub async fn cancel_task(
    state: State<'_, Arc<AppState>>,
    gid: String,
    delete_files: Option<bool>,
) -> Result<(), String> {
    state.cancel_task(&gid, delete_files.unwrap_or(false)).await
}

#[tauri::command]
pub async fn clear_completed_tasks(
    state: State<'_, Arc<AppState>>,
    delete_files: Option<bool>,
) -> Result<usize, String> {
    state
        .clear_completed_tasks(delete_files.unwrap_or(false))
        .await
}

#[tauri::command]
pub async fn open_task_file(state: State<'_, Arc<AppState>>, gid: String) -> Result<(), String> {
    state.open_task_file(&gid)
}

#[tauri::command]
pub async fn open_task_folder(state: State<'_, Arc<AppState>>, gid: String) -> Result<(), String> {
    state.open_task_folder(&gid)
}

#[tauri::command]
pub async fn restart_task(state: State<'_, Arc<AppState>>, gid: String) -> Result<String, String> {
    state.restart_task(&gid).await
}

#[tauri::command]
pub async fn get_active_tasks(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<TaskOverview>, String> {
    let state = state.inner().clone();
    tokio::task::spawn_blocking(move || state.list_tasks())
        .await
        .map_err(|e| format!("Spawn blocking failed: {e}"))?
}
