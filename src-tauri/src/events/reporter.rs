use crate::core::state::AppState;
use chrono::Utc;
use gosh_dl::DownloadEvent;
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;

#[derive(Clone, Serialize)]
struct TaskUpdatedPayload {
    gid: String,
}

fn emit_task_updated(app_handle: &AppHandle, gid: impl Into<String>) {
    let _ = app_handle.emit(
        "download-task-updated",
        TaskUpdatedPayload { gid: gid.into() },
    );
}

pub fn start_event_reporter(app_handle: AppHandle, state: Arc<AppState>) {
    let mut rx = state.engine.subscribe();

    tauri::async_runtime::spawn(async move {
        loop {
            let event = match rx.recv().await {
                Ok(event) => event,
                Err(broadcast::error::RecvError::Lagged(skipped)) => {
                    log::warn!("Download event reporter lagged, skipped {skipped} events");
                    state.reconcile_download_tasks().await;
                    continue;
                }
                Err(broadcast::error::RecvError::Closed) => break,
            };

            match event {
                DownloadEvent::Progress { id, progress } => {
                    state.sync_download_progress(id, progress.completed_size, progress.total_size);
                }
                DownloadEvent::StateChanged { id, .. } | DownloadEvent::Started { id } => {
                    if let Some(gid) = state.sync_download_event_status(id, None) {
                        emit_task_updated(&app_handle, gid);
                    }
                }
                DownloadEvent::Completed { id } => {
                    let synced_gid =
                        state.sync_download_event_status(id, Some(Utc::now().timestamp()));
                    let gid = synced_gid
                        .clone()
                        .unwrap_or_else(|| state.gid_for_download_id(id));
                    log::info!("Download completed: {}", gid);

                    if let Some(gid) = synced_gid {
                        match state.validate_completed_task_file(&gid) {
                            Ok(()) => {
                                emit_task_updated(&app_handle, gid);
                                let _ = app_handle.emit("play-sound", "success");
                            }
                            Err(err) => {
                                log::warn!(
                                    "Download completed but file validation failed for {}: {}",
                                    gid,
                                    err
                                );
                                emit_task_updated(&app_handle, gid);
                                let _ = app_handle.emit("play-sound", "warning");
                            }
                        }
                    } else {
                        log::warn!(
                            "Download completed but task status could not be synced: {}",
                            gid
                        );
                        state.reconcile_download_tasks().await;
                        emit_task_updated(&app_handle, gid);
                    }
                }
                DownloadEvent::Failed { id, error, .. } => {
                    let synced_gid =
                        state.sync_download_event_status(id, Some(Utc::now().timestamp()));
                    let gid = synced_gid
                        .clone()
                        .unwrap_or_else(|| state.gid_for_download_id(id));
                    log::error!("Download failed: {}, error: {}", gid, error);

                    if let Some(gid) = synced_gid {
                        emit_task_updated(&app_handle, gid);
                    } else {
                        state.reconcile_download_tasks().await;
                        emit_task_updated(&app_handle, gid);
                    }
                    let _ = app_handle.emit("play-sound", "warning");
                }
                DownloadEvent::Paused { id } => {
                    let gid = state
                        .sync_download_event_status(id, None)
                        .unwrap_or_else(|| state.gid_for_download_id(id));
                    log::info!("Download paused: {}", gid);
                    emit_task_updated(&app_handle, gid);
                }
                DownloadEvent::Resumed { id } => {
                    let gid = state
                        .sync_download_event_status(id, None)
                        .unwrap_or_else(|| state.gid_for_download_id(id));
                    log::info!("Download resumed: {}", gid);
                    emit_task_updated(&app_handle, gid);
                }
                DownloadEvent::Removed { id } => {
                    let gid = state.gid_for_download_id(id);
                    log::info!("Download removed: {}", gid);
                    emit_task_updated(&app_handle, gid);
                }
                _ => {}
            }
        }
    });
}
