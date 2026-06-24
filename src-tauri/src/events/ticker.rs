use crate::core::state::task_format::{format_eta, format_speed};
use crate::core::state::AppState;
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

            let active_tasks: Vec<crate::core::models::DbTask> = state
                .task_cache
                .read()
                .unwrap()
                .values()
                .filter(|t| matches!(t.status.as_str(), "Downloading" | "Pending" | "Seeding"))
                .cloned()
                .collect();

            let speed_display_unit = state.get_settings().transfer.speed_display_unit;

            let mut tasks = Vec::new();
            let mut total_download_speed = 0;
            let mut total_upload_speed = 0;
            let mut active_gids = HashSet::new();
            let mut active_count = 0;

            for db_task in active_tasks {
                let gid = db_task.id.clone();
                let provider_name = if db_task.protocol == "hls" { "hls" } else { "gosh" };
                let provider = match state.providers.get(provider_name) {
                    Some(p) => p,
                    None => continue,
                };
                let ref_id = db_task.engine_id.as_deref().unwrap_or(&gid);

                let info = match provider.query_status(ref_id).await {
                    Ok(Some(info)) => info,
                    _ => continue,
                };

                active_count += 1;
                active_gids.insert(gid.clone());

                let completed_size = info.completed_size;
                let total_size = info.total_size;

                let download_speed = if info.download_speed > 0 {
                    info.download_speed
                } else {
                    match speed_samples.get(&gid).copied() {
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
                    }
                };

                let upload_speed = info.upload_speed;
                total_download_speed += download_speed;
                total_upload_speed += upload_speed;
                let eta_seconds = if download_speed > 0 && total_size > completed_size {
                    Some((total_size - completed_size) / download_speed)
                } else {
                    None
                };

                let progress = if total_size > 0 {
                    (completed_size as f64 / total_size as f64) * 100.0
                } else {
                    0.0
                };

                tasks.push(TaskProgressPayload {
                    gid,
                    speed: format_speed(download_speed, &speed_display_unit),
                    progress,
                    eta: format_eta(eta_seconds),
                    downloaded_bytes: completed_size,
                    total_bytes: total_size,
                    connections: info.connections,
                    speed_bps: download_speed,
                    eta_seconds,
                    upload_speed: format_speed(upload_speed, &speed_display_unit),
                    status: info.status,
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

pub fn start_file_status_tracker(_app_handle: AppHandle, state: Arc<AppState>) {
    tauri::async_runtime::spawn(async move {
        // Run check loop every 10 seconds
        let mut interval = tokio::time::interval(Duration::from_secs(10));
        loop {
            interval.tick().await;

            let enabled = state.get_settings().download.auto_remove_on_file_deleted;
            if !enabled {
                continue;
            }

            let completed_tasks: Vec<crate::core::models::DbTask> = {
                let cache = state.task_cache.read().unwrap();
                cache
                    .values()
                    .filter(|task| task.status == "Completed")
                    .cloned()
                    .collect()
            };

            for task in completed_tasks {
                // If setting was disabled mid-loop, stop checking
                if !state.get_settings().download.auto_remove_on_file_deleted {
                    break;
                }

                let file_path = crate::core::state::file_actions::task_file_path(&task);

                // Run the disk I/O exists check in tokio blocking thread pool to avoid blocking the main thread
                let file_exists = {
                    let path = file_path.clone();
                    tokio::task::spawn_blocking(move || path.exists())
                        .await
                        .unwrap_or(true)
                };

                if !file_exists {
                    log::info!(
                        "Local file for task '{}' ({}) is deleted or moved. Automatically removing task.",
                        task.name,
                        task.id
                    );

                    let state_clone = state.clone();
                    let gid = task.id.clone();
                    // Call cancel_task async but don't delete files (as the file is already gone)
                    tauri::async_runtime::spawn(async move {
                        if let Err(err) = state_clone.cancel_task(&gid, false).await {
                            log::error!("Failed to auto-remove task '{}': {}", gid, err);
                        }
                    });
                }

                // Throttle checking: pause for 50ms between task file checks to prevent I/O spikes
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
        }
    });
}

