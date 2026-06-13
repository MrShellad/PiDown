use crate::core::state::AppState;
use serde::Serialize;
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct DownloadMetadata {
    pub filename: Option<String>,
    pub total_size: Option<u64>,
    pub is_torrent: bool,
    pub files: Option<Vec<crate::download::TorrentFileInspection>>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct BtTaskDetails {
    pub magnet_uri: Option<String>,
    pub trackers: Vec<String>,
    pub peers: Vec<gosh_dl::PeerInfo>,
    pub files: Vec<gosh_dl::TorrentFile>,
}

#[tauri::command]
pub async fn inspect_download_metadata(
    state: State<'_, Arc<AppState>>,
    url: String,
    user_agent: Option<String>,
    referer: Option<String>,
    cookies: Option<Vec<String>>,
) -> Result<DownloadMetadata, String> {
    let inspection = state.inspect_download(&url, user_agent, referer, cookies).await?;
    Ok(DownloadMetadata {
        filename: inspection.filename,
        total_size: inspection.total_size,
        is_torrent: inspection.is_torrent,
        files: inspection.files,
    })
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
            t.dirty = true;
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
                    t.dirty = true;
                }
            }

            if !state_was_active {
                let _ = state.engine.pause(new_id).await;
            }
        }
    }

    Ok(())
}
