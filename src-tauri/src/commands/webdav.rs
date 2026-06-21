use crate::core::state::AppState;
use crate::core::webdav::{
    derive_key, encrypt_password, decrypt_password, check_webdav_status, DbWebDavDevice,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebDavDeviceResp {
    pub id: String,
    pub name: String,
    pub type_name: String,
    pub status: String,
    pub status_text: String,
    pub capacity: String,
    pub progress: Option<f64>,
    pub server_url: String,
    pub username: String,
    pub remote_path: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SaveWebDavDeviceInput {
    pub id: Option<String>,
    pub display_name: String,
    pub server_url: String,
    pub username: String,
    pub password: Option<String>,
    pub remote_path: String,
}

#[tauri::command]
pub async fn get_webdav_devices(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<WebDavDeviceResp>, String> {
    let db_devices = state.db.get_webdav_devices().map_err(|e| e.to_string())?;

    let mut resp = Vec::new();
    let cache = state.webdav_status_cache.lock().unwrap();

    for dev in db_devices {
        let (status, status_text, capacity, progress) = cache
            .get(&dev.id)
            .cloned()
            .unwrap_or_else(|| {
                (
                    "unknown".to_string(),
                    "等待获取状态...".to_string(),
                    "——".to_string(),
                    None,
                )
            });

        resp.push(WebDavDeviceResp {
            id: dev.id,
            name: dev.display_name,
            type_name: "WebDAV 存储驱动".to_string(),
            status,
            status_text,
            capacity,
            progress,
            server_url: dev.server_url,
            username: dev.username,
            remote_path: dev.remote_path,
        });
    }

    Ok(resp)
}

#[tauri::command]
pub async fn refresh_webdav_device_status(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<WebDavDeviceResp, String> {
    let dev = state.db.get_webdav_device(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "未找到指定的 WebDAV 设备".to_string())?;
    
    let key = derive_key(&app)?;
    let decrypted_pass = decrypt_password(&dev.password_encrypted, &key)?;

    let (status, status_text, capacity, progress) =
        check_webdav_status(&dev.server_url, &dev.username, &decrypted_pass).await;

    // Update memory cache
    {
        let mut cache = state.webdav_status_cache.lock().unwrap();
        cache.insert(dev.id.clone(), (status.clone(), status_text.clone(), capacity.clone(), progress.clone()));
    }

    Ok(WebDavDeviceResp {
        id: dev.id,
        name: dev.display_name,
        type_name: "WebDAV 存储驱动".to_string(),
        status,
        status_text,
        capacity,
        progress,
        server_url: dev.server_url,
        username: dev.username,
        remote_path: dev.remote_path,
    })
}

#[tauri::command]
pub async fn save_webdav_device(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
    input: SaveWebDavDeviceInput,
) -> Result<(), String> {
    let key = derive_key(&app)?;

    let id = input.id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let password_encrypted = if let Some(pass) = &input.password {
        if pass.trim().is_empty() {
            if let Some(existing_id) = &input.id {
                if let Some(existing) = state.db.get_webdav_device(existing_id).map_err(|e| e.to_string())? {
                    existing.password_encrypted
                } else {
                    return Err("未找到要编辑的设备".to_string());
                }
            } else {
                return Err("密码不能为空".to_string());
            }
        } else {
            encrypt_password(pass, &key)?
        }
    } else {
        if let Some(existing_id) = &input.id {
            if let Some(existing) = state.db.get_webdav_device(existing_id).map_err(|e| e.to_string())? {
                existing.password_encrypted
            } else {
                return Err("未找到要编辑的设备".to_string());
            }
        } else {
            return Err("保存 WebDAV 设备需要密码".to_string());
        }
    };

    let db_device = DbWebDavDevice {
        id,
        display_name: input.display_name,
        server_url: input.server_url,
        username: input.username,
        password_encrypted,
        remote_path: input.remote_path,
        created_at: chrono::Utc::now().timestamp(),
    };

    state.db.save_webdav_device(&db_device).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_webdav_device(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), String> {
    state.db.delete_webdav_device(&id).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn test_webdav_connection(
    url: String,
    username: String,
    password: Option<String>,
) -> Result<String, String> {
    let password = password.unwrap_or_default();
    let (status, status_text, _capacity, _progress) =
        check_webdav_status(&url, &username, &password).await;
    if status == "connected" {
        Ok("连接成功！服务器响应正常".to_string())
    } else {
        Err(format!("连接失败：{}", status_text))
    }
}

#[tauri::command]
pub async fn list_webdav_files(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
    device_id: String,
    path: String,
) -> Result<Vec<crate::core::webdav::WebDavFile>, String> {
    use crate::core::webdav::list_webdav_directory;
    let key = derive_key(&app)?;
    let device = state.db.get_webdav_device(&device_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "未找到指定的 WebDAV 设备".to_string())?;
    let decrypted_pass = decrypt_password(&device.password_encrypted, &key)?;
    let files = list_webdav_directory(&device.server_url, &device.username, &decrypted_pass, &path).await?;
    Ok(files)
}

#[tauri::command]
pub async fn set_video_player_duration(
    state: State<'_, Arc<AppState>>,
    device_id: String,
    path: String,
    duration: f64,
) -> Result<(), String> {
    let mut cache_guard = state.video_cache.lock().unwrap();
    if let Some(ref mut cache) = *cache_guard {
        if cache.device_id == device_id && cache.path == path {
            cache.duration = Some(duration);
            log::info!("Updated video duration: {}s for {}/{}", duration, device_id, path);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn download_webdav_file(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
    device_id: String,
    path: String,
    filename: String,
) -> Result<String, String> {
    let key = derive_key(&app)?;
    let dev = state.db.get_webdav_device(&device_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "未找到指定的 WebDAV 设备".to_string())?;
    let decrypted_pass = decrypt_password(&dev.password_encrypted, &key)?;

    let parsed_server = reqwest::Url::parse(&dev.server_url)
        .map_err(|e| format!("Invalid server URL: {e}"))?;
    let origin = parsed_server.origin().ascii_serialization();
    let server_path = parsed_server.path().trim_end_matches('/');

    let absolute_path = if !server_path.is_empty() && path.starts_with(server_path) {
        path.to_string()
    } else {
        format!("{}/{}", server_path, path.trim_start_matches('/'))
    };

    let encoded_path: String = absolute_path
        .split('/')
        .map(|segment| urlencoding::encode(segment).into_owned())
        .collect::<Vec<String>>()
        .join("/");

    let target_url = format!("{}{}", origin, encoded_path);
    let mut parsed_url = reqwest::Url::parse(&target_url)
        .map_err(|e| format!("Invalid target URL: {e}"))?;
    
    parsed_url.set_username(&dev.username)
        .map_err(|_| "Failed to set username".to_string())?;
    parsed_url.set_password(Some(&decrypted_pass))
        .map_err(|_| "Failed to set password".to_string())?;

    let download_url = parsed_url.to_string();

    let save_dir = {
        let settings = state.get_settings();
        settings.download.default_save_dir.clone()
    };

    let gid = state.add_task(
        &download_url,
        Some(&save_dir),
        Some(&filename),
        None,
        false,
        None,
        crate::core::state::TaskCreateOptions::default()
    )
    .await?;

    Ok(gid)
}

#[tauri::command]
pub async fn get_webdav_download_url(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
    device_id: String,
    path: String,
) -> Result<String, String> {
    let key = derive_key(&app)?;
    let dev = state.db.get_webdav_device(&device_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "未找到指定的 WebDAV 设备".to_string())?;
    let decrypted_pass = decrypt_password(&dev.password_encrypted, &key)?;

    let parsed_server = reqwest::Url::parse(&dev.server_url)
        .map_err(|e| format!("Invalid server URL: {e}"))?;
    let origin = parsed_server.origin().ascii_serialization();
    let server_path = parsed_server.path().trim_end_matches('/');

    let absolute_path = if !server_path.is_empty() && path.starts_with(server_path) {
        path.to_string()
    } else {
        format!("{}/{}", server_path, path.trim_start_matches('/'))
    };

    let encoded_path: String = absolute_path
        .split('/')
        .map(|segment| urlencoding::encode(segment).into_owned())
        .collect::<Vec<String>>()
        .join("/");

    let target_url = format!("{}{}", origin, encoded_path);
    let mut parsed_url = reqwest::Url::parse(&target_url)
        .map_err(|e| format!("Invalid target URL: {e}"))?;
    
    parsed_url.set_username(&dev.username)
        .map_err(|_| "Failed to set username".to_string())?;
    parsed_url.set_password(Some(&decrypted_pass))
        .map_err(|_| "Failed to set password".to_string())?;

    Ok(parsed_url.to_string())
}
