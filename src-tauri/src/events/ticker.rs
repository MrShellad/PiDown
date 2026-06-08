use crate::core::state::task_format::{format_eta, format_speed};
use crate::core::state::AppState;
use serde::Serialize;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
pub struct TaskProgressPayload {
    pub gid: String,
    pub speed: String,
    pub progress: f64,
    pub eta: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

#[derive(Clone, Serialize)]
pub struct DownloadSpeedPayload {
    pub global_speed: String,
    pub global_download_speed: String,
    pub global_upload_speed: String,
    pub global_transfer_speed: String,
    pub active_tasks_count: usize,
    pub tasks: Vec<TaskProgressPayload>,
}

pub fn start_global_event_ticker(app_handle: AppHandle, state: Arc<AppState>) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(100));
        let mut ticks_since_reconcile = 0u32;

        loop {
            interval.tick().await;
            ticks_since_reconcile = ticks_since_reconcile.saturating_add(1);

            if ticks_since_reconcile >= 50 {
                ticks_since_reconcile = 0;
                state.reconcile_download_tasks();
            }

            let active_downloads = state.engine.active();
            let active_count = active_downloads.len();
            let speed_display_unit = state.get_settings().transfer.speed_display_unit;

            let mut tasks = Vec::new();
            let mut total_download_speed = 0;
            let mut total_upload_speed = 0;

            for download in active_downloads {
                let gid = download.gid();
                let download_speed = download.progress.download_speed;
                let upload_speed = download.progress.upload_speed;
                total_download_speed += download_speed;
                total_upload_speed += upload_speed;

                tasks.push(TaskProgressPayload {
                    gid,
                    speed: format_speed(download_speed, &speed_display_unit),
                    progress: download.progress.percentage(),
                    eta: format_eta(download.progress.eta_seconds),
                    downloaded_bytes: download.progress.completed_size,
                    total_bytes: download.progress.total_size.unwrap_or(0),
                });
            }

            let payload = DownloadSpeedPayload {
                global_speed: format_speed(total_download_speed, &speed_display_unit),
                global_download_speed: format_speed(total_download_speed, &speed_display_unit),
                global_upload_speed: format_speed(total_upload_speed, &speed_display_unit),
                global_transfer_speed: format_speed(
                    total_download_speed + total_upload_speed,
                    &speed_display_unit,
                ),
                active_tasks_count: active_count,
                tasks,
            };

            let _ = app_handle.emit("download-cluster-status", payload);
        }
    });
}
