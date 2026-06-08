use crate::core::state::AppState;
use chrono::Utc;
use gosh_dl::DownloadEvent;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

pub fn start_event_reporter(app_handle: AppHandle, state: Arc<AppState>) {
    let mut rx = state.engine.subscribe();

    tauri::async_runtime::spawn(async move {
        while let Ok(event) = rx.recv().await {
            match event {
                DownloadEvent::Completed { id } => {
                    let gid = id.to_gid();
                    log::info!("Download completed: {}", gid);

                    if let Some(status) = state.engine.status(id) {
                        let completed_size = status.progress.completed_size;
                        let total_size = status.progress.total_size.unwrap_or(completed_size);

                        let _ = state.db.update_task_status(
                            &gid,
                            "Completed",
                            Some(Utc::now().timestamp()),
                        );
                        let _ = state
                            .db
                            .update_task_progress(&gid, completed_size, total_size);
                    }

                    // Play success sound
                    let _ = app_handle.emit("play-sound", "success");
                }
                DownloadEvent::Failed { id, error, .. } => {
                    let gid = id.to_gid();
                    log::error!("Download failed: {}, error: {}", gid, error);

                    if let Some(status) = state.engine.status(id) {
                        let completed_size = status.progress.completed_size;
                        let total_size = status.progress.total_size.unwrap_or(completed_size);

                        let _ = state.db.update_task_status(
                            &gid,
                            "Failed",
                            Some(Utc::now().timestamp()),
                        );
                        let _ = state
                            .db
                            .update_task_progress(&gid, completed_size, total_size);
                    }

                    // Play warning sound
                    let _ = app_handle.emit("play-sound", "warning");
                }
                DownloadEvent::Paused { id } => {
                    let gid = id.to_gid();
                    log::info!("Download paused: {}", gid);

                    if let Some(status) = state.engine.status(id) {
                        let completed_size = status.progress.completed_size;
                        let total_size = status.progress.total_size.unwrap_or(completed_size);

                        let _ = state.db.update_task_status(&gid, "Paused", None);
                        let _ = state
                            .db
                            .update_task_progress(&gid, completed_size, total_size);
                    }
                }
                DownloadEvent::Resumed { id } => {
                    let gid = id.to_gid();
                    log::info!("Download resumed: {}", gid);

                    let _ = state.db.update_task_status(&gid, "Downloading", None);
                }
                _ => {}
            }
        }
    });
}
