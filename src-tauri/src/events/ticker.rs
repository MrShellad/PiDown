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
    pub active_tasks_count: usize,
    pub tasks: Vec<TaskProgressPayload>,
}

/// Format bytes per second into human-readable speed
fn format_speed(bytes_per_sec: u64) -> String {
    if bytes_per_sec == 0 {
        return "0 B/s".to_string();
    }
    let units = ["B/s", "KB/s", "MB/s", "GB/s"];
    let mut speed = bytes_per_sec as f64;
    let mut unit_idx = 0;
    while speed >= 1024.0 && unit_idx < units.len() - 1 {
        speed /= 1024.0;
        unit_idx += 1;
    }
    format!("{:.1} {}", speed, units[unit_idx])
}

/// Format seconds remaining into human-readable ETA
fn format_eta(seconds: Option<u64>) -> String {
    match seconds {
        Some(s) if s < 86400 * 365 => {
            let hours = s / 3600;
            let minutes = (s % 3600) / 60;
            let secs = s % 60;
            format!("{:02}:{:02}:{:02}", hours, minutes, secs)
        }
        _ => "--:--:--".to_string(),
    }
}

pub fn start_global_event_ticker(app_handle: AppHandle, state: Arc<AppState>) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(100));

        loop {
            interval.tick().await;

            let active_downloads = state.engine.active();
            let active_count = active_downloads.len();

            let mut tasks = Vec::new();
            let mut total_speed = 0;

            for download in active_downloads {
                let gid = download.gid();
                let speed_val = download.progress.download_speed;
                total_speed += speed_val;

                tasks.push(TaskProgressPayload {
                    gid,
                    speed: format_speed(speed_val),
                    progress: download.progress.percentage(),
                    eta: format_eta(download.progress.eta_seconds),
                    downloaded_bytes: download.progress.completed_size,
                    total_bytes: download.progress.total_size.unwrap_or(0),
                });
            }

            let payload = DownloadSpeedPayload {
                global_speed: format_speed(total_speed),
                active_tasks_count: active_count,
                tasks,
            };

            let _ = app_handle.emit("download-cluster-status", payload);
        }
    });
}
