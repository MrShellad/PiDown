use crate::core::state::AppState;
use std::sync::Arc;
use std::path::PathBuf;
use tauri::{State, Manager};

fn get_extension_dir(app_handle: &tauri::AppHandle) -> Option<PathBuf> {
    // 1. Check in development (relative to project root)
    if let Ok(dir) = std::env::current_dir() {
        let ext_dir = dir.join("chrome-extension");
        if ext_dir.exists() {
            return Some(ext_dir);
        }
    }
    // 2. Check relative to resource dir
    if let Ok(res_dir) = app_handle.path().resource_dir() {
        let ext_dir = res_dir.join("chrome-extension");
        if ext_dir.exists() {
            return Some(ext_dir);
        }
    }
    None
}

#[tauri::command]
pub async fn open_extension_directory(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(dir) = get_extension_dir(&app_handle) {
        #[cfg(target_os = "windows")]
        {
            let _ = std::process::Command::new("explorer").arg(dir).spawn();
        }
        #[cfg(target_os = "macos")]
        {
            let _ = std::process::Command::new("open").arg(dir).spawn();
        }
        #[cfg(target_os = "linux")]
        {
            let _ = std::process::Command::new("xdg-open").arg(dir).spawn();
        }
        Ok(())
    } else {
        Err("未找到浏览器插件目录".to_string())
    }
}

#[tauri::command]
pub async fn get_extension_directory_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    if let Some(dir) = get_extension_dir(&app_handle) {
        Ok(dir.to_string_lossy().to_string())
    } else {
        Err("未找到浏览器插件目录".to_string())
    }
}

#[tauri::command]
pub async fn respond_pairing(
    state: State<'_, Arc<AppState>>,
    pairing_id: String,
    approved: bool,
) -> Result<(), String> {
    let mut pairings = state.pending_pairings.lock().unwrap();
    if let Some(tx) = pairings.remove(&pairing_id) {
        let _ = tx.send(approved);
    }
    Ok(())
}

#[tauri::command]
pub async fn save_extension_zip(
    file_bytes: Vec<u8>,
) -> Result<Option<String>, String> {
    let file_path = rfd::AsyncFileDialog::new()
        .set_file_name("chrome-extension.zip")
        .add_filter("Zip Archive", &["zip"])
        .save_file()
        .await;

    if let Some(file_handle) = file_path {
        let path = file_handle.path().to_path_buf();
        std::fs::write(&path, file_bytes)
            .map_err(|e| format!("保存文件失败: {}", e))?;
        Ok(Some(path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}
