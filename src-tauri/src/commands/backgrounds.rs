use crate::core::state::AppState;
use crate::core::store::backgrounds::DbBackground;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{Manager, State};

fn determine_media_type(filename: &str) -> String {
    let lower = filename.to_lowercase();
    if lower.ends_with(".mp4")
        || lower.ends_with(".webm")
        || lower.ends_with(".mkv")
        || lower.ends_with(".mov")
        || lower.ends_with(".avi")
        || lower.ends_with(".flv")
        || lower.ends_with(".wmv")
    {
        "video".to_string()
    } else {
        "image".to_string()
    }
}

fn generate_image_thumbnail(
    app_data_dir: &Path,
    src_path: &Path,
) -> Option<String> {
    let cache_dir = app_data_dir.join("cache").join("user");
    if let Err(_) = fs::create_dir_all(&cache_dir) {
        return None;
    }

    let uuid = uuid::Uuid::new_v4().to_string();
    let dest_filename = format!("{}_thumb.png", uuid);
    let dest_path = cache_dir.join(&dest_filename);

    if let Ok(img) = image::open(src_path) {
        let thumb = img.thumbnail(320, 180);
        if let Ok(_) = thumb.save_with_format(&dest_path, image::ImageFormat::Png) {
            return Some(format!("cache/user/{}", dest_filename));
        }
    }

    None
}

#[tauri::command]
pub async fn get_backgrounds(
    app_handle: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<DbBackground>, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;

    let mut bgs = state
        .db
        .get_backgrounds()
        .map_err(|e| format!("Database error: {e}"))?;

    for bg in &mut bgs {
        if bg.path.starts_with("backgrounds/") {
            let abs_path = app_data_dir.join(&bg.path);
            bg.path = abs_path.to_string_lossy().to_string();
        }
        if let Some(ref thumb_path) = bg.thumbnail {
            if thumb_path.starts_with("cache/user/") {
                let abs_thumb = app_data_dir.join(thumb_path);
                bg.thumbnail = Some(abs_thumb.to_string_lossy().to_string());
            }
        }
    }

    Ok(bgs)
}

#[tauri::command]
pub async fn pick_background_file() -> Result<Option<String>, String> {
    let dialog = rfd::FileDialog::new().add_filter(
        "Images & Videos",
        &["jpg", "jpeg", "png", "webp", "gif", "mp4", "webm", "mkv", "mov"],
    );

    Ok(dialog
        .pick_file()
        .map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn import_background_file(
    app_handle: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
    file_path: String,
) -> Result<DbBackground, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;

    let bg_dir = app_data_dir.join("backgrounds");
    fs::create_dir_all(&bg_dir)
        .map_err(|e| format!("Failed to create backgrounds directory: {e}"))?;

    let src_path = PathBuf::from(&file_path);
    if !src_path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    let ext = src_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("dat");

    let uuid = uuid::Uuid::new_v4().to_string();
    let dest_filename = format!("{}.{}", uuid, ext);
    let dest_path = bg_dir.join(&dest_filename);

    fs::copy(&src_path, &dest_path)
        .map_err(|e| format!("Failed to copy file to cache: {e}"))?;

    let relative_path = format!("backgrounds/{}", dest_filename);
    let media_type = determine_media_type(&dest_filename);

    let thumbnail_rel = if media_type == "image" {
        generate_image_thumbnail(&app_data_dir, &dest_path)
    } else {
        None
    };

    let db_bg = state
        .db
        .add_background(
            &relative_path,
            &media_type,
            false,
            thumbnail_rel.as_deref(),
        )
        .map_err(|e| format!("Database error: {e}"))?;

    let mut resolved_bg = db_bg;
    let abs_path = app_data_dir.join(&resolved_bg.path);
    resolved_bg.path = abs_path.to_string_lossy().to_string();

    if let Some(ref thumb_path) = resolved_bg.thumbnail {
        let abs_thumb = app_data_dir.join(thumb_path);
        resolved_bg.thumbnail = Some(abs_thumb.to_string_lossy().to_string());
    }

    Ok(resolved_bg)
}

#[tauri::command]
pub async fn import_background_url(
    app_handle: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
    url: String,
) -> Result<DbBackground, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;

    let bg_dir = app_data_dir.join("backgrounds");
    fs::create_dir_all(&bg_dir)
        .map_err(|e| format!("Failed to create backgrounds directory: {e}"))?;

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch background from URL: status {}",
            response.status()
        ));
    }

    let mut ext = "dat";
    if let Some(content_type) = response.headers().get(reqwest::header::CONTENT_TYPE) {
        if let Ok(ct_str) = content_type.to_str() {
            let ct_lower = ct_str.to_lowercase();
            if ct_lower.contains("image/png") {
                ext = "png";
            } else if ct_lower.contains("image/jpeg") || ct_lower.contains("image/jpg") {
                ext = "jpg";
            } else if ct_lower.contains("image/webp") {
                ext = "webp";
            } else if ct_lower.contains("image/gif") {
                ext = "gif";
            } else if ct_lower.contains("video/mp4") {
                ext = "mp4";
            } else if ct_lower.contains("video/webm") {
                ext = "webm";
            } else if ct_lower.contains("video/quicktime") {
                ext = "mov";
            }
        }
    }

    let mut ext_str = ext.to_string();
    if ext == "dat" {
        if let Ok(parsed_url) = reqwest::Url::parse(&url) {
            if let Some(segments) = parsed_url.path_segments() {
                if let Some(last_segment) = segments.last() {
                    if let Some(pos) = last_segment.rfind('.') {
                        let url_ext = &last_segment[pos + 1..];
                        if !url_ext.is_empty()
                            && url_ext.len() <= 5
                            && url_ext.chars().all(|c| c.is_alphanumeric())
                        {
                            ext_str = url_ext.to_string();
                        }
                    }
                }
            }
        }
    }

    let uuid = uuid::Uuid::new_v4().to_string();
    let dest_filename = format!("{}.{}", uuid, ext_str);
    let dest_path = bg_dir.join(&dest_filename);

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response bytes: {e}"))?;

    fs::write(&dest_path, &bytes)
        .map_err(|e| format!("Failed to write file to cache: {e}"))?;

    let relative_path = format!("backgrounds/{}", dest_filename);
    let media_type = determine_media_type(&dest_filename);

    let thumbnail_rel = if media_type == "image" {
        generate_image_thumbnail(&app_data_dir, &dest_path)
    } else {
        None
    };

    let db_bg = state
        .db
        .add_background(
            &relative_path,
            &media_type,
            true,
            thumbnail_rel.as_deref(),
        )
        .map_err(|e| format!("Database error: {e}"))?;

    let mut resolved_bg = db_bg;
    let abs_path = app_data_dir.join(&resolved_bg.path);
    resolved_bg.path = abs_path.to_string_lossy().to_string();

    if let Some(ref thumb_path) = resolved_bg.thumbnail {
        let abs_thumb = app_data_dir.join(thumb_path);
        resolved_bg.thumbnail = Some(abs_thumb.to_string_lossy().to_string());
    }

    Ok(resolved_bg)
}

#[tauri::command]
pub async fn delete_background(state: State<'_, Arc<AppState>>, id: i64) -> Result<(), String> {
    state
        .db
        .delete_background(id)
        .map_err(|e| format!("Database error: {e}"))?;
    Ok(())
}
