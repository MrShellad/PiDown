use crate::core::state::task_format::{format_eta, format_speed};
use crate::core::state::AppState;
use gosh_dl::DownloadState;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const SPEED_SAMPLE_INTERVAL: Duration = Duration::from_millis(500);

#[derive(Clone, Copy)]
struct SpeedSample {
    completed_bytes: u64,
    sampled_at: Instant,
    speed_bytes_per_sec: u64,
}

#[derive(Clone, Serialize)]
pub struct TaskProgressPayload {
    pub gid: String,
    pub speed: String,
    pub progress: f64,
    pub eta: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub connections: u32,
    pub speed_bps: u64,
    pub eta_seconds: Option<u64>,
    pub upload_speed: String,
    pub status: String,
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
        let mut interval = tokio::time::interval(Duration::from_millis(500));
        let mut ticks_since_reconcile = 0u32;
        let mut speed_samples: HashMap<String, SpeedSample> = HashMap::new();

        loop {
            interval.tick().await;
            ticks_since_reconcile = ticks_since_reconcile.saturating_add(1);
            let now = Instant::now();

            if ticks_since_reconcile >= 10 {
                ticks_since_reconcile = 0;
                state.reconcile_download_tasks();
            }

            let active_downloads = state.engine.active();
            let active_count = active_downloads.len();
            let speed_display_unit = state.get_settings().transfer.speed_display_unit;

            let mut tasks = Vec::new();
            let mut total_download_speed = 0;
            let mut total_upload_speed = 0;
            let mut active_gids = HashSet::new();

            for download in active_downloads {
                let gid = download.gid();
                active_gids.insert(gid.clone());

                let completed_size = download.progress.completed_size;
                let download_speed = match speed_samples.get(&gid).copied() {
                    Some(sample) if completed_size < sample.completed_bytes => {
                        speed_samples.insert(
                            gid.clone(),
                            SpeedSample {
                                completed_bytes: completed_size,
                                sampled_at: now,
                                speed_bytes_per_sec: 0,
                            },
                        );
                        0
                    }
                    Some(sample)
                        if now.duration_since(sample.sampled_at) >= SPEED_SAMPLE_INTERVAL =>
                    {
                        let elapsed = now.duration_since(sample.sampled_at).as_secs_f64();
                        let delta = completed_size.saturating_sub(sample.completed_bytes);
                        let speed = if elapsed > 0.0 {
                            (delta as f64 / elapsed) as u64
                        } else {
                            0
                        };
                        speed_samples.insert(
                            gid.clone(),
                            SpeedSample {
                                completed_bytes: completed_size,
                                sampled_at: now,
                                speed_bytes_per_sec: speed,
                            },
                        );
                        speed
                    }
                    Some(sample) => sample.speed_bytes_per_sec,
                    None => {
                        speed_samples.insert(
                            gid.clone(),
                            SpeedSample {
                                completed_bytes: completed_size,
                                sampled_at: now,
                                speed_bytes_per_sec: 0,
                            },
                        );
                        0
                    }
                };
                let upload_speed = download.progress.upload_speed;
                total_download_speed += download_speed;
                total_upload_speed += upload_speed;
                let total_size = download.progress.total_size.unwrap_or(0);
                let eta_seconds = if download_speed > 0 && total_size > completed_size {
                    Some((total_size - completed_size) / download_speed)
                } else {
                    None
                };

                tasks.push(TaskProgressPayload {
                    gid,
                    speed: format_speed(download_speed, &speed_display_unit),
                    progress: download.progress.percentage(),
                    eta: format_eta(eta_seconds),
                    downloaded_bytes: completed_size,
                    total_bytes: total_size,
                    connections: download.progress.connections,
                    speed_bps: download_speed,
                    eta_seconds,
                    upload_speed: format_speed(upload_speed, &speed_display_unit),
                    status: match &download.state {
                        DownloadState::Queued => "Pending".to_string(),
                        DownloadState::Connecting | DownloadState::Downloading => "Downloading".to_string(),
                        DownloadState::Seeding => "Seeding".to_string(),
                        DownloadState::Paused => "Paused".to_string(),
                        DownloadState::Completed => "Completed".to_string(),
                        DownloadState::Error { .. } => "Failed".to_string(),
                    },
                });
            }
            speed_samples.retain(|gid, _| active_gids.contains(gid));

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
