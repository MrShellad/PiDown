use crate::core::state::task_format::sanitize_filename;
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
pub struct FileConflictCheck {
    pub exists: bool,
    pub target_path: String,
    pub filename: String,
    pub suggested_filename: String,
    pub suggested_path: String,
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

pub fn normalize_existing_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Download path is required".to_string());
    }

    Ok(PathBuf::from(trimmed))
}

pub fn partial_path_for(target_path: &Path) -> PathBuf {
    target_path.with_extension(
        target_path
            .extension()
            .map(|extension| format!("{}.part", extension.to_string_lossy()))
            .unwrap_or_else(|| "part".to_string()),
    )
}

pub fn remove_existing_download_file(path: Option<&str>, filename: Option<&str>) -> Result<(), String> {
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

pub fn ensure_target_file_available(path: Option<&str>, filename: Option<&str>) -> Result<(), String> {
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

pub fn normalize_filename_input(filename: Option<&str>) -> Option<String> {
    filename
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(sanitize_filename)
}

pub fn remove_file_if_exists(path: &Path) -> Result<(), String> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Failed to remove existing file: {error}")),
    }
}

pub fn unique_filename(save_dir: &Path, filename: &str) -> String {
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

#[cfg(windows)]
pub fn get_disk_space_impl(path: &str) -> Result<(u64, u64), String> {
    use std::os::windows::ffi::OsStrExt;

    let mut ancestor = Path::new(path);
    while !ancestor.exists() {
        if let Some(parent) = ancestor.parent() {
            ancestor = parent;
        } else {
            break;
        }
    }

    let wide_path: Vec<u16> = ancestor
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut free_bytes_to_caller = 0u64;
    let mut total_bytes = 0u64;
    let mut total_free_bytes = 0u64;

    #[link(name = "kernel32")]
    extern "system" {
        fn GetDiskFreeSpaceExW(
            lpDirectoryName: *const u16,
            lpFreeBytesAvailableToCaller: *mut u64,
            lpTotalNumberOfBytes: *mut u64,
            lpTotalNumberOfFreeBytes: *mut u64,
        ) -> i32;
    }

    let res = unsafe {
        GetDiskFreeSpaceExW(
            wide_path.as_ptr(),
            &mut free_bytes_to_caller,
            &mut total_bytes,
            &mut total_free_bytes,
        )
    };

    if res == 0 {
        Err("Failed to query disk space".to_string())
    } else {
        Ok((free_bytes_to_caller, total_bytes))
    }
}

#[cfg(not(windows))]
pub fn get_disk_space_impl(path: &str) -> Result<(u64, u64), String> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;

    let mut ancestor = Path::new(path);
    while !ancestor.exists() {
        if let Some(parent) = ancestor.parent() {
            ancestor = parent;
        } else {
            break;
        }
    }

    let c_path = CString::new(ancestor.as_os_str().as_bytes())
        .map_err(|e| e.to_string())?;

    unsafe {
        let mut stats: libc::statvfs = std::mem::zeroed();
        if libc::statvfs(c_path.as_ptr(), &mut stats) == 0 {
            let free_space = stats.f_frsize as u64 * stats.f_bavail as u64;
            let total_space = stats.f_frsize as u64 * stats.f_blocks as u64;
            Ok((free_space, total_space))
        } else {
            Err("Failed to query disk space".to_string())
        }
    }
}

#[tauri::command]
pub fn get_disk_space(path: String) -> Result<(u64, u64), String> {
    get_disk_space_impl(&path)
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
