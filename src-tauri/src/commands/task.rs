use crate::core::models::{
    CategoryInput, DbCategory, DbTag, TagInput, TaskClassificationPreview, TaskOverview,
};
use crate::core::state::task_format::sanitize_filename;
use crate::core::state::{AppState, TaskCreateOptions};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct DownloadMetadata {
    pub filename: Option<String>,
    pub total_size: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct FileConflictCheck {
    pub exists: bool,
    pub target_path: String,
    pub filename: String,
    pub suggested_filename: String,
    pub suggested_path: String,
}

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
    max_connections: Option<u32>,
    user_agent: Option<String>,
    referer: Option<String>,
    cookies: Option<Vec<String>>,
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
                user_agent,
                referer,
                cookies: cookies.unwrap_or_default(),
            },
        )
        .await
}

#[tauri::command]
pub async fn check_file_conflict(
    path: String,
    filename: String,
) -> Result<FileConflictCheck, String> {
    let save_dir = normalize_existing_path(&path)?;
    let filename = sanitize_filename(filename.trim());
    let target_path = save_dir.join(&filename);
    let partial_path = partial_path_for(&target_path);
    let suggested_filename = unique_filename(&save_dir, &filename);
    let suggested_path = save_dir.join(&suggested_filename);

    Ok(FileConflictCheck {
        exists: target_path.exists() || partial_path.exists(),
        target_path: target_path.to_string_lossy().to_string(),
        filename,
        suggested_filename,
        suggested_path: suggested_path.to_string_lossy().to_string(),
    })
}

fn normalize_existing_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Download path is required".to_string());
    }

    Ok(PathBuf::from(trimmed))
}

fn partial_path_for(target_path: &Path) -> PathBuf {
    target_path.with_extension(
        target_path
            .extension()
            .map(|extension| format!("{}.part", extension.to_string_lossy()))
            .unwrap_or_else(|| "part".to_string()),
    )
}

fn remove_existing_download_file(path: Option<&str>, filename: Option<&str>) -> Result<(), String> {
    let Some(filename) = normalize_filename_input(filename) else {
        return Ok(());
    };

    let save_dir = normalize_existing_path(path.unwrap_or_default())?;
    let target_path = save_dir.join(filename);
    let partial_path = partial_path_for(&target_path);

    remove_file_if_exists(&target_path)?;
    remove_file_if_exists(&partial_path)?;
    Ok(())
}

fn ensure_target_file_available(path: Option<&str>, filename: Option<&str>) -> Result<(), String> {
    let Some(filename) = normalize_filename_input(filename) else {
        return Ok(());
    };

    let save_dir = normalize_existing_path(path.unwrap_or_default())?;
    let target_path = save_dir.join(filename);
    let partial_path = partial_path_for(&target_path);

    if target_path.exists() || partial_path.exists() {
        Err("Target file already exists".to_string())
    } else {
        Ok(())
    }
}

fn normalize_filename_input(filename: Option<&str>) -> Option<String> {
    filename
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(sanitize_filename)
}

fn remove_file_if_exists(path: &Path) -> Result<(), String> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Failed to remove existing file: {error}")),
    }
}

fn unique_filename(save_dir: &Path, filename: &str) -> String {
    let target_path = save_dir.join(filename);
    if !target_path.exists() && !partial_path_for(&target_path).exists() {
        return filename.to_string();
    }

    let path = Path::new(filename);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("download");
    let extension = path.extension().and_then(|value| value.to_str());

    for index in 1..10_000 {
        let candidate = match extension {
            Some(extension) if !extension.is_empty() => format!("{stem} ({index}).{extension}"),
            _ => format!("{stem} ({index})"),
        };

        let candidate_path = save_dir.join(&candidate);
        if !candidate_path.exists() && !partial_path_for(&candidate_path).exists() {
            return candidate;
        }
    }

    format!("{stem} ({})", chrono::Utc::now().timestamp())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unique_filename_adds_numeric_suffix_for_existing_file() {
        let temp_dir = test_temp_dir("existing-file");
        std::fs::create_dir_all(&temp_dir).unwrap();
        std::fs::write(temp_dir.join("file.zip"), b"existing").unwrap();

        assert_eq!(unique_filename(&temp_dir, "file.zip"), "file (1).zip");
        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn unique_filename_avoids_partial_download_files() {
        let temp_dir = test_temp_dir("partial-file");
        std::fs::create_dir_all(&temp_dir).unwrap();
        std::fs::write(temp_dir.join("file.zip.part"), b"partial").unwrap();

        assert_eq!(unique_filename(&temp_dir, "file.zip"), "file (1).zip");
        let _ = std::fs::remove_dir_all(temp_dir);
    }

    fn test_temp_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("pidownloader-{name}-{}", uuid::Uuid::new_v4()))
    }
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
