use crate::core::models::DbTask;
use std::path::{Path, PathBuf};
use std::process::Command;

pub fn task_file_path(task: &DbTask) -> PathBuf {
    Path::new(&task.save_path).join(&task.name)
}

fn partial_path_for(save_path: &Path) -> PathBuf {
    save_path.with_extension(
        save_path
            .extension()
            .map(|extension| format!("{}.part", extension.to_string_lossy()))
            .unwrap_or_else(|| "part".to_string()),
    )
}

pub fn cleanup_task_files(task: &DbTask) {
    let file_path = task_file_path(task);
    let _ = std::fs::remove_file(&file_path);
    let _ = std::fs::remove_file(partial_path_for(&file_path));
}

fn open_path(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let result = Command::new("explorer").arg(path).spawn();

    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(path).spawn();

    #[cfg(all(unix, not(target_os = "macos")))]
    let result = Command::new("xdg-open").arg(path).spawn();

    result
        .map(|_| ())
        .map_err(|e| format!("Failed to open path: {e}"))
}

impl super::AppState {
    pub fn task_file_checksum_target(&self, gid: &str) -> Result<(String, PathBuf), String> {
        let task = self
            .db
            .get_task(gid)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Task not found".to_string())?;
        let file_path = task_file_path(&task);

        if !file_path.exists() {
            return Err("File does not exist yet".to_string());
        }
        if !file_path.is_file() {
            return Err("Task path is not a file".to_string());
        }

        Ok((task.name, file_path))
    }

    pub fn open_task_file(&self, gid: &str) -> Result<(), String> {
        let task = self
            .db
            .get_task(gid)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Task not found".to_string())?;
        let file_path = task_file_path(&task);

        if !file_path.exists() {
            return Err("File does not exist yet".to_string());
        }

        open_path(&file_path)
    }

    pub fn open_task_folder(&self, gid: &str) -> Result<(), String> {
        let task = self
            .db
            .get_task(gid)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Task not found".to_string())?;
        let file_path = task_file_path(&task);
        let folder_path = Path::new(&task.save_path);

        if !folder_path.exists() {
            return Err("Download folder does not exist".to_string());
        }

        #[cfg(target_os = "windows")]
        {
            if file_path.exists() {
                let result = Command::new("explorer")
                    .arg(format!("/select,{}", file_path.to_string_lossy()))
                    .spawn();
                return result
                    .map(|_| ())
                    .map_err(|e| format!("Failed to locate file: {e}"));
            }
        }

        #[cfg(target_os = "macos")]
        {
            if file_path.exists() {
                let result = Command::new("open")
                    .arg("-R")
                    .arg(&file_path)
                    .spawn();
                return result
                    .map(|_| ())
                    .map_err(|e| format!("Failed to locate file: {e}"));
            }
        }

        open_path(folder_path)
    }
}
