use crate::core::models::{CategoryInput, DbCategory, TaskClassificationPreview};
use crate::core::state::AppState;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn preview_task_classification(
    state: State<'_, Arc<AppState>>,
    url: String,
    filename: String,
    total_size: Option<u64>,
    category_id: Option<i64>,
    category_override: Option<bool>,
) -> Result<TaskClassificationPreview, String> {
    state.preview_task_classification(
        &url,
        &filename,
        total_size,
        category_id,
        category_override.unwrap_or(false),
    )
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
pub async fn update_task_category(
    state: State<'_, Arc<AppState>>,
    gid: String,
    category_id: Option<i64>,
) -> Result<(), String> {
    state.update_task_category(&gid, category_id)
}
