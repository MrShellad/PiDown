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
    pub is_torrent: bool,
    pub files: Option<Vec<crate::download::TorrentFileInspection>>,
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
    max_upload_speed_kib: Option<u64>,
    max_connections: Option<u32>,
    user_agent: Option<String>,
    referer: Option<String>,
    cookies: Option<Vec<String>>,
    selected_files: Option<Vec<usize>>,
    sequential: Option<bool>,
    auto_verify: Option<bool>,
    disable_dht_pex_lpd: Option<bool>,
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
        is_torrent: inspection.is_torrent,
        files: inspection.files,
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

#[tauri::command]
pub fn open_directory(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err("Directory does not exist".to_string());
    }

    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("explorer").arg(p).spawn();

    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(p).spawn();

    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(p).spawn();

    result
        .map(|_| ())
        .map_err(|e| format!("Failed to open folder: {e}"))
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct BtTaskDetails {
    pub magnet_uri: Option<String>,
    pub trackers: Vec<String>,
    pub peers: Vec<gosh_dl::PeerInfo>,
    pub files: Vec<gosh_dl::TorrentFile>,
}

#[tauri::command]
pub async fn get_bt_task_details(
    state: State<'_, Arc<AppState>>,
    gid: String,
) -> Result<BtTaskDetails, String> {
    let task = state
        .db
        .get_task(&gid)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Task not found".to_string())?;

    let mut magnet_uri = None;
    if task.protocol == "magnet" {
        magnet_uri = Some(task.url.clone());
    }

    let mut peers = Vec::new();
    let mut files = Vec::new();

    let engine_status = {
        let cache_tasks = state.task_cache.read().unwrap();
        let db_task = cache_tasks.get(&gid).cloned().unwrap_or(task.clone());
        let engine_list = state.engine.list();
        let mut engine_status = None;
        for status in engine_list {
            let engine_id = db_task.engine_id.as_ref().unwrap_or(&db_task.id);
            if status.id.matches_gid(&db_task.id) || status.id.as_uuid().to_string() == *engine_id {
                engine_status = Some(status);
                break;
            }
        }
        engine_status
    };

    if let Some(status) = engine_status {
        if let Some(ref torrent_info) = status.torrent_info {
            files = torrent_info.files.clone();
            if task.protocol == "torrent" {
                if let Some(ref info_hash) = status.metadata.info_hash {
                    let dn = urlencoding::encode(&status.metadata.name);
                    magnet_uri = Some(format!("magnet:?xt=urn:btih:{}&dn={}", info_hash, dn));
                }
            }
        }
        if let Some(ref peer_list) = status.peers {
            peers = peer_list.clone();
        }
        if magnet_uri.is_none() {
            magnet_uri = status.metadata.magnet_uri.clone();
        }
    }

    let trackers = if task.protocol == "magnet" {
        if let Ok(magnet) = gosh_dl::torrent::MagnetUri::parse(&task.url) {
            magnet.trackers
        } else {
            Vec::new()
        }
    } else if task.protocol == "torrent" {
        let torrent_path = if task.url.starts_with("file:///") {
            if let Ok(parsed) = reqwest::Url::parse(&task.url) {
                parsed.to_file_path().unwrap_or_else(|_| std::path::PathBuf::from(&task.url))
            } else {
                std::path::PathBuf::from(&task.url)
            }
        } else {
            std::path::PathBuf::from(&task.url)
        };

        if let Ok(bytes) = std::fs::read(&torrent_path) {
            if let Ok(metainfo) = gosh_dl::torrent::Metainfo::parse(&bytes) {
                metainfo.all_trackers()
            } else {
                Vec::new()
            }
        } else {
            Vec::new()
        }
    } else {
        Vec::new()
    };

    Ok(BtTaskDetails {
        magnet_uri,
        trackers,
        peers,
        files,
    })
}

#[tauri::command]
pub async fn update_task_trackers(
    state: State<'_, Arc<AppState>>,
    gid: String,
    trackers: Vec<String>,
) -> Result<(), String> {
    let task = state
        .db
        .get_task(&gid)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Task not found".to_string())?;

    if task.protocol != "magnet" && task.protocol != "torrent" {
        return Err("Only BT/Magnet tasks support updating trackers".to_string());
    }

    let mut new_url = task.url.clone();
    let torrent_path = if task.protocol == "torrent" {
        let path = if task.url.starts_with("file:///") {
            if let Ok(parsed) = reqwest::Url::parse(&task.url) {
                parsed.to_file_path().unwrap_or_else(|_| std::path::PathBuf::from(&task.url))
            } else {
                std::path::PathBuf::from(&task.url)
            }
        } else {
            std::path::PathBuf::from(&task.url)
        };
        Some(path)
    } else {
        None
    };

    if task.protocol == "magnet" {
        let mut magnet = gosh_dl::torrent::MagnetUri::parse(&task.url)
            .map_err(|e| format!("Invalid magnet link: {}", e))?;
        magnet.trackers = trackers.clone();
        new_url = magnet.to_uri();
    } else if task.protocol == "torrent" {
        if let Some(ref path) = torrent_path {
            let bytes = std::fs::read(path)
                .map_err(|e| format!("Failed to read torrent file: {}", e))?;

            let modified_bytes = crate::download::bt::append_trackers_to_torrent(&bytes, &trackers)?;
            std::fs::write(path, &modified_bytes)
                .map_err(|e| format!("Failed to write modified torrent file: {}", e))?;
        }
    }

    state.db.update_task_url(&gid, &new_url).map_err(|e| e.to_string())?;
    {
        let mut cache = state.task_cache.write().unwrap();
        if let Some(t) = cache.get_mut(&gid) {
            t.url = new_url.clone();
        }
    }

    let engine_id = {
        let cache_tasks = state.task_cache.read().unwrap();
        cache_tasks.get(&gid).and_then(|t| t.engine_id.clone())
    };

    if let Some(ref old_id_str) = engine_id {
        if let Some(old_id) = gosh_dl::DownloadId::from_gid(old_id_str)
            .or_else(|| uuid::Uuid::parse_str(old_id_str).ok().map(gosh_dl::DownloadId::from_uuid))
        {
            let mut state_was_active = false;
            let mut save_dir = std::path::PathBuf::from(&task.save_path);

            if let Some(status) = state.engine.status(old_id) {
                state_was_active = status.state.is_active();
                save_dir = status.metadata.save_dir.clone();
            }

            let _ = state.engine.cancel(old_id, false).await;

            let max_download_speed = task.max_download_speed_kib
                .and_then(|v| (v > 0).then(|| v.saturating_mul(1024)));
            let max_upload_speed = task.max_upload_speed_kib
                .and_then(|v| (v > 0).then(|| v.saturating_mul(1024)));

            let new_id = if task.protocol == "magnet" {
                state.engine.add_magnet(&new_url, &save_dir, None, None, max_download_speed, max_upload_speed).await?
            } else {
                let bytes = std::fs::read(torrent_path.as_ref().unwrap()).map_err(|e| e.to_string())?;
                state.engine.add_torrent(&bytes, &save_dir, None, None, max_download_speed, max_upload_speed).await?
            };

            let new_engine_id = new_id.as_uuid().to_string();
            let _ = state.db.update_task_engine_id(&gid, Some(&new_engine_id));
            {
                let mut cache = state.task_cache.write().unwrap();
                if let Some(t) = cache.get_mut(&gid) {
                    t.engine_id = Some(new_engine_id);
                }
            }

            if !state_was_active {
                let _ = state.engine.pause(new_id).await;
            }
        }
    }

    Ok(())
}

