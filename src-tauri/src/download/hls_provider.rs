use crate::core::models::DbTask;
use crate::core::state::{AppState, TaskCreateOptions};
use crate::download::provider::{DownloadProvider, DownloadProgressInfo};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Weak};
use tauri::Emitter;

pub struct HlsDownloadProvider {
    state: Weak<AppState>,
}

impl HlsDownloadProvider {
    pub fn new(state: Weak<AppState>) -> Self {
        Self { state }
    }

    fn start_hls_download(
        &self,
        gid: &str,
        task: &DbTask,
        options: TaskCreateOptions,
        settings: &crate::core::settings::AppSettings,
    ) -> Result<(), String> {
        let state = self.state.upgrade().ok_or_else(|| "AppState dropped".to_string())?;

        // Create cancel channel
        let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
        state.hls_cancel_tokens.lock().unwrap().insert(gid.to_string(), cancel_tx);

        // Create event channel
        let (event_tx, mut event_rx) = tokio::sync::mpsc::unbounded_channel();

        let hls_config = crate::download::hls::HlsDownloadConfig {
            ignore_ssl_certificate: settings.transfer.ignore_ssl_certificate,
            proxy_url: settings.transfer.proxy_url.clone(),
            task_thread_count: settings.transfer.task_thread_count.clamp(1, 16) as usize,
            app_data_dir: Some(state.app_data_dir()),
        };

        let gid_clone = gid.to_string();
        let url = task.url.clone();
        let save_path = task.save_path.clone();
        let filename = task.name.clone();
        let user_agent = options.user_agent.or_else(|| Some(settings.download.global_user_agent.clone()));
        let referer = options.referer;
        let cookies = options.cookies;

        // Spawn downloader
        tauri::async_runtime::spawn(async move {
            crate::download::hls::download_hls_task(
                gid_clone,
                url,
                save_path,
                filename,
                user_agent,
                referer,
                cookies,
                cancel_rx,
                hls_config,
                event_tx,
            ).await;
        });

        // Spawn event listener
        let state_clone = Arc::clone(&state);
        let gid_clone = gid.to_string();
        tauri::async_runtime::spawn(async move {
            while let Some(event) = event_rx.recv().await {
                match event {
                    crate::download::hls::HlsDownloadEvent::Progress { completed_bytes, estimated_total_bytes, speed } => {
                        if let Some(task) = state_clone.task_cache.write().unwrap().get_mut(&gid_clone) {
                            task.completed_size = completed_bytes;
                            task.total_size = estimated_total_bytes;
                            task.dirty = true;
                        }
                        if speed > 0 {
                            state_clone.hls_speeds.lock().unwrap().insert(gid_clone.clone(), speed);
                        }
                        if let Some(ref app_handle) = *state_clone.app_handle.lock().unwrap() {
                            let _ = app_handle.emit("download-task-updated", serde_json::json!({ "gid": gid_clone }));
                        }
                    }
                    crate::download::hls::HlsDownloadEvent::NameUpdated { filename } => {
                        if let Some(task) = state_clone.task_cache.write().unwrap().get_mut(&gid_clone) {
                            task.name = filename.clone();
                            task.dirty = true;
                        }
                        let _ = state_clone.db.update_task_name(&gid_clone, &filename);
                        if let Some(ref app_handle) = *state_clone.app_handle.lock().unwrap() {
                            let _ = app_handle.emit("download-task-updated", serde_json::json!({ "gid": gid_clone }));
                        }
                    }
                    crate::download::hls::HlsDownloadEvent::Completed { final_bytes, warning } => {
                        if let Some(task) = state_clone.task_cache.write().unwrap().get_mut(&gid_clone) {
                            task.status = "Completed".to_string();
                            task.completed_size = final_bytes;
                            task.total_size = final_bytes;
                            task.completed_at = Some(chrono::Utc::now().timestamp());
                            task.error_message = warning.clone();
                            task.dirty = true;
                        }
                        let _ = state_clone.db.update_task_status(&gid_clone, "Completed", Some(chrono::Utc::now().timestamp()));
                        if let Some(ref warn_msg) = warning {
                            let _ = state_clone.db.update_task_error(&gid_clone, Some(warn_msg));
                        }
                        state_clone.hls_speeds.lock().unwrap().remove(&gid_clone);
                        state_clone.hls_cancel_tokens.lock().unwrap().remove(&gid_clone);

                        if let Some(ref app_handle) = *state_clone.app_handle.lock().unwrap() {
                            let _ = app_handle.emit("download-task-updated", serde_json::json!({ "gid": gid_clone }));
                            let _ = app_handle.emit("play-sound", "success");
                        }
                    }
                    crate::download::hls::HlsDownloadEvent::Failed { error_message } => {
                        if let Some(task) = state_clone.task_cache.write().unwrap().get_mut(&gid_clone) {
                            task.status = "Failed".to_string();
                            task.error_message = Some(error_message.clone());
                            task.completed_at = Some(chrono::Utc::now().timestamp());
                            task.dirty = true;
                        }
                        let _ = state_clone.db.update_task_status(&gid_clone, "Failed", Some(chrono::Utc::now().timestamp()));
                        let _ = state_clone.db.update_task_error(&gid_clone, Some(&error_message));
                        state_clone.hls_speeds.lock().unwrap().remove(&gid_clone);
                        state_clone.hls_cancel_tokens.lock().unwrap().remove(&gid_clone);

                        if let Some(ref app_handle) = *state_clone.app_handle.lock().unwrap() {
                            let _ = app_handle.emit("download-task-updated", serde_json::json!({ "gid": gid_clone }));
                            let _ = app_handle.emit("play-sound", "warning");
                        }
                    }
                }
            }
        });

        Ok(())
    }
}

#[async_trait::async_trait]
impl DownloadProvider for HlsDownloadProvider {
    fn protocol(&self) -> &'static str {
        "hls"
    }

    async fn create_task(
        &self,
        task: &DbTask,
        options: TaskCreateOptions,
        settings: &crate::core::settings::AppSettings,
    ) -> Result<String, String> {
        let gid = task.id.clone();
        if task.status == "Downloading" {
            self.start_hls_download(&gid, task, options, settings)?;
        }
        Ok(gid)
    }

    async fn pause_task(&self, gid: &str) -> Result<(), String> {
        let state = self.state.upgrade().ok_or_else(|| "AppState dropped".to_string())?;
        if let Some(cancel_tx) = state.hls_cancel_tokens.lock().unwrap().remove(gid) {
            let _ = cancel_tx.send(true);
        }
        state.hls_speeds.lock().unwrap().remove(gid);

        state.db.update_task_status(gid, "Paused", None)?;
        if let Some(cache_task) = state.task_cache.write().unwrap().get_mut(gid) {
            cache_task.status = "Paused".to_string();
            cache_task.dirty = true;
        }

        if let Some(ref app_handle) = *state.app_handle.lock().unwrap() {
            let _ = app_handle.emit("download-task-updated", serde_json::json!({ "gid": gid }));
        }

        Ok(())
    }

    async fn resume_task(&self, gid: &str) -> Result<(), String> {
        let state = self.state.upgrade().ok_or_else(|| "AppState dropped".to_string())?;
        let task = state.db.get_task(gid)?.ok_or_else(|| "Task not found".to_string())?;

        // Update database and cache status to Downloading
        state.db.update_task_status(gid, "Downloading", None)?;
        if let Some(cache_task) = state.task_cache.write().unwrap().get_mut(gid) {
            cache_task.status = "Downloading".to_string();
            cache_task.dirty = true;
        }

        if let Some(ref app_handle) = *state.app_handle.lock().unwrap() {
            let _ = app_handle.emit("download-task-updated", serde_json::json!({ "gid": gid }));
        }

        let settings = state.get_settings();
        let options = TaskCreateOptions::default();
        self.start_hls_download(gid, &task, options, &settings)?;

        Ok(())
    }

    async fn cancel_task(&self, gid: &str, delete_files: bool) -> Result<(), String> {
        let state = self.state.upgrade().ok_or_else(|| "AppState dropped".to_string())?;
        if let Some(cancel_tx) = state.hls_cancel_tokens.lock().unwrap().remove(gid) {
            let _ = cancel_tx.send(true);
        }
        state.hls_speeds.lock().unwrap().remove(gid);

        if delete_files {
            let task = state.db.get_task(gid)?;
            if let Some(t) = task {
                let final_file_path = Path::new(&t.save_path).join(&t.name);
                let temp_dir = PathBuf::from(format!("{}.pidown_tmp", final_file_path.to_string_lossy()));
                let _ = std::fs::remove_file(&final_file_path);
                let _ = std::fs::remove_dir_all(&temp_dir);
            }
        }

        Ok(())
    }

    async fn query_status(&self, gid: &str) -> Result<Option<DownloadProgressInfo>, String> {
        let state = self.state.upgrade().ok_or_else(|| "AppState dropped".to_string())?;
        let cache = state.task_cache.read().unwrap();
        if let Some(task) = cache.get(gid) {
            let speed = state.hls_speeds.lock().unwrap().get(gid).copied().unwrap_or(0);
            Ok(Some(DownloadProgressInfo {
                completed_size: task.completed_size,
                total_size: task.total_size,
                download_speed: speed,
                upload_speed: 0,
                connections: 5,
                status: task.status.clone(),
            }))
        } else {
            Ok(None)
        }
    }
}
