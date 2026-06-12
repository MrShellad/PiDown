use crate::core::models::{DbTag, TagInput};
use crate::core::state::AppState;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn get_tags(state: State<'_, Arc<AppState>>) -> Result<Vec<DbTag>, String> {
    state.get_tags()
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
