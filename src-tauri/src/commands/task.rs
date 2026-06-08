use crate::core::models::{CategoryInput, DbCategory, DbTag, TagInput, TaskOverview};
use crate::core::state::AppState;
use serde::Serialize;
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct DownloadMetadata {
    pub filename: Option<String>,
    pub total_size: Option<u64>,
}

#[tauri::command]
pub async fn create_task(
    state: State<'_, Arc<AppState>>,
    url: String,
    path: Option<String>,
    filename: Option<String>,
    category_id: Option<i64>,
) -> Result<String, String> {
    state
        .add_task(&url, path.as_deref(), filename.as_deref(), category_id)
        .await
}

#[tauri::command]
pub async fn inspect_download_metadata(
    state: State<'_, Arc<AppState>>,
    url: String,
) -> Result<DownloadMetadata, String> {
    let inspection = state.inspect_download(&url).await?;
    Ok(DownloadMetadata {
        filename: inspection.filename,
        total_size: inspection.total_size,
    })
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
    state.list_tasks()
}

#[tauri::command]
pub async fn get_categories(state: State<'_, Arc<AppState>>) -> Result<Vec<DbCategory>, String> {
    state.get_categories()
}

#[tauri::command]
pub async fn create_category(
    state: State<'_, Arc<AppState>>,
    input: CategoryInput,
) -> Result<i64, String> {
    state.create_category(input)
}

#[tauri::command]
pub async fn update_category(
    state: State<'_, Arc<AppState>>,
    category_id: i64,
    input: CategoryInput,
) -> Result<(), String> {
    state.update_category(category_id, input)
}

#[tauri::command]
pub async fn delete_category(
    state: State<'_, Arc<AppState>>,
    category_id: i64,
) -> Result<(), String> {
    state.delete_category(category_id)
}

#[tauri::command]
pub async fn get_tags(state: State<'_, Arc<AppState>>) -> Result<Vec<DbTag>, String> {
    state.get_tags()
}

#[tauri::command]
pub async fn update_task_category(
    state: State<'_, Arc<AppState>>,
    gid: String,
    category_id: Option<i64>,
) -> Result<(), String> {
    state.update_task_category(&gid, category_id)
}

#[tauri::command]
pub async fn add_task_tag(
    state: State<'_, Arc<AppState>>,
    gid: String,
    tag_id: i64,
) -> Result<(), String> {
    state.add_task_tag(&gid, tag_id)
}

#[tauri::command]
pub async fn remove_task_tag(
    state: State<'_, Arc<AppState>>,
    gid: String,
    tag_id: i64,
) -> Result<(), String> {
    state.remove_task_tag(&gid, tag_id)
}

#[tauri::command]
pub async fn create_tag(state: State<'_, Arc<AppState>>, input: TagInput) -> Result<i64, String> {
    state.create_tag(input)
}

#[tauri::command]
pub async fn update_tag(
    state: State<'_, Arc<AppState>>,
    tag_id: i64,
    input: TagInput,
) -> Result<(), String> {
    state.update_tag(tag_id, input)
}

#[tauri::command]
pub async fn delete_tag(state: State<'_, Arc<AppState>>, tag_id: i64) -> Result<(), String> {
    state.delete_tag(tag_id)
}
