use std::collections::BTreeSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

static FONT_CACHE: OnceLock<Result<Vec<String>, String>> = OnceLock::new();

#[tauri::command]
pub async fn list_system_fonts() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        FONT_CACHE.get_or_init(|| {
            let mut names = BTreeSet::new();
            let mut files = Vec::new();

            for dir in system_font_dirs() {
                collect_font_files(&dir, &mut files);
            }

            for path in files {
                if let Ok(data) = fs::read(&path) {
                    for name in parse_font_family_names(&data) {
                        names.insert(name);
                    }
                }
            }

            Ok(names.into_iter().collect())
        }).clone()
    })
    .await
    .map_err(|e| format!("Failed to run font listing thread: {e}"))?
}

fn system_font_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    #[cfg(target_os = "windows")]
    {
        if let Some(windir) = env::var_os("WINDIR") {
            dirs.push(PathBuf::from(windir).join("Fonts"));
        }
        if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
            dirs.push(
                PathBuf::from(local_app_data)
                    .join("Microsoft")
                    .join("Windows")
                    .join("Fonts"),
            );
        }
    }

    #[cfg(target_os = "macos")]
    {
        dirs.push(PathBuf::from("/System/Library/Fonts"));
        dirs.push(PathBuf::from("/Library/Fonts"));
        if let Some(home) = env::var_os("HOME") {
            dirs.push(PathBuf::from(home).join("Library").join("Fonts"));
        }
    }

    #[cfg(target_os = "linux")]
    {
        dirs.push(PathBuf::from("/usr/share/fonts"));
        dirs.push(PathBuf::from("/usr/local/share/fonts"));
        if let Some(home) = env::var_os("HOME") {
            dirs.push(PathBuf::from(&home).join(".fonts"));
            dirs.push(
                PathBuf::from(home)
                    .join(".local")
                    .join("share")
                    .join("fonts"),
            );
        }
    }

    dirs.sort();
    dirs.dedup();
    dirs
}

fn collect_font_files(dir: &Path, files: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_font_files(&path, files);
        } else if is_font_file(&path) {
            files.push(path);
        }
    }
}

fn is_font_file(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .as_deref(),
        Some("ttf" | "otf" | "ttc" | "otc")
    )
}

fn parse_font_family_names(data: &[u8]) -> Vec<String> {
    if data.get(0..4) == Some(b"ttcf") {
        return parse_font_collection_names(data);
    }

    parse_sfnt_names(data, 0)
}

fn parse_font_collection_names(data: &[u8]) -> Vec<String> {
    let Some(num_fonts) = read_u32(data, 8).map(|value| value.min(1024)) else {
        return Vec::new();
    };

    let mut names = Vec::new();
    for index in 0..num_fonts as usize {
        let Some(offset) = read_u32(data, 12 + index * 4).map(|value| value as usize) else {
            continue;
        };
        names.extend(parse_sfnt_names(data, offset));
    }

    names
}

fn parse_sfnt_names(data: &[u8], base: usize) -> Vec<String> {
    let Some(num_tables) = read_u16(data, base + 4).map(|value| value as usize) else {
        return Vec::new();
    };

    for index in 0..num_tables {
        let Some(record_offset) = base
            .checked_add(12)
            .and_then(|value| value.checked_add(index * 16))
        else {
            continue;
        };
        let Some(tag) = data.get(record_offset..record_offset + 4) else {
            continue;
        };
        if tag != b"name" {
            continue;
        }

        let Some(table_offset) = read_u32(data, record_offset + 8)
            .map(|value| value as usize)
            .and_then(|value| base.checked_add(value))
        else {
            return Vec::new();
        };
        let Some(table_length) = read_u32(data, record_offset + 12).map(|value| value as usize)
        else {
            return Vec::new();
        };

        return parse_name_table(data, table_offset, table_length);
    }

    Vec::new()
}

fn parse_name_table(data: &[u8], table_offset: usize, table_length: usize) -> Vec<String> {
    let Some(table_end) = table_offset
        .checked_add(table_length)
        .map(|end| end.min(data.len()))
    else {
        return Vec::new();
    };
    let Some(count) = read_u16(data, table_offset + 2).map(|value| value as usize) else {
        return Vec::new();
    };
    let Some(string_offset) = read_u16(data, table_offset + 4).map(|value| value as usize) else {
        return Vec::new();
    };
    let Some(string_base) = table_offset.checked_add(string_offset) else {
        return Vec::new();
    };

    let mut preferred = BTreeSet::new();
    let mut family = BTreeSet::new();
    let mut full = BTreeSet::new();

    for index in 0..count {
        let Some(record_offset) = table_offset
            .checked_add(6)
            .and_then(|value| value.checked_add(index * 12))
        else {
            continue;
        };
        if record_offset + 12 > table_end {
            continue;
        }

        let platform_id = read_u16(data, record_offset).unwrap_or_default();
        let encoding_id = read_u16(data, record_offset + 2).unwrap_or_default();
        let name_id = read_u16(data, record_offset + 6).unwrap_or_default();
        let length = read_u16(data, record_offset + 8).unwrap_or_default() as usize;
        let offset = read_u16(data, record_offset + 10).unwrap_or_default() as usize;

        if !matches!(name_id, 1 | 4 | 16) {
            continue;
        }

        let Some(start) = string_base.checked_add(offset) else {
            continue;
        };
        let Some(end) = start.checked_add(length) else {
            continue;
        };
        if end > table_end {
            continue;
        }

        let Some(name) = decode_name_string(&data[start..end], platform_id, encoding_id)
            .and_then(sanitize_font_name)
        else {
            continue;
        };

        match name_id {
            16 => {
                preferred.insert(name);
            }
            1 => {
                family.insert(name);
            }
            4 => {
                full.insert(name);
            }
            _ => {}
        }
    }

    if !preferred.is_empty() {
        preferred.into_iter().collect()
    } else if !family.is_empty() {
        family.into_iter().collect()
    } else {
        full.into_iter().collect()
    }
}

fn decode_name_string(data: &[u8], platform_id: u16, encoding_id: u16) -> Option<String> {
    if platform_id == 0 || platform_id == 3 || (platform_id == 2 && encoding_id == 1) {
        if data.len() % 2 != 0 {
            return None;
        }
        let units = data
            .chunks_exact(2)
            .map(|chunk| u16::from_be_bytes([chunk[0], chunk[1]]))
            .collect::<Vec<_>>();
        return String::from_utf16(&units).ok();
    }

    if platform_id == 1 {
        return Some(
            data.iter()
                .map(|byte| if byte.is_ascii() { *byte as char } else { ' ' })
                .collect(),
        );
    }

    String::from_utf8(data.to_vec()).ok()
}

fn sanitize_font_name(name: String) -> Option<String> {
    let collapsed = name
        .replace('\0', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let trimmed = collapsed.trim().trim_start_matches('@').trim().to_string();

    if trimmed.len() < 2 {
        None
    } else {
        Some(trimmed)
    }
}

fn read_u16(data: &[u8], offset: usize) -> Option<u16> {
    let bytes = data.get(offset..offset + 2)?;
    Some(u16::from_be_bytes([bytes[0], bytes[1]]))
}

fn read_u32(data: &[u8], offset: usize) -> Option<u32> {
    let bytes = data.get(offset..offset + 4)?;
    Some(u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
}

#[tauri::command]
pub async fn save_theme_font(
    app_handle: tauri::AppHandle,
    theme_id: String,
    font_filename: String,
    font_data_base64: String,
) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    use tauri::Manager;

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;

    let theme_dir = app_data_dir.join("theme").join(&theme_id);
    fs::create_dir_all(&theme_dir)
        .map_err(|e| format!("Failed to create theme directory: {e}"))?;

    let decoded = STANDARD
        .decode(&font_data_base64)
        .map_err(|e| format!("Failed to decode base64 font: {e}"))?;

    let file_path = theme_dir.join(&font_filename);
    fs::write(&file_path, &decoded)
        .map_err(|e| format!("Failed to write font file: {e}"))?;

    Ok(file_path.to_string_lossy().to_string())
}
