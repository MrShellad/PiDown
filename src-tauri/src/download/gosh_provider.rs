use crate::core::models::DbTask;
use crate::core::state::TaskCreateOptions;
use crate::download::provider::{DownloadProvider, DownloadProgressInfo};
use crate::download::{detect_protocol, DownloadProtocol, EngineWrapper, HttpTaskOptions};
use gosh_dl::{DownloadId, DownloadState};
use std::path::Path;
use std::sync::Arc;

pub struct GoshDownloadProvider {
    engine: Arc<EngineWrapper>,
}

impl GoshDownloadProvider {
    pub fn new(engine: Arc<EngineWrapper>) -> Self {
        Self { engine }
    }

    fn parse_id(&self, engine_id: &str) -> Result<DownloadId, String> {
        uuid::Uuid::parse_str(engine_id)
            .map(DownloadId::from_uuid)
            .map_err(|e| format!("Invalid engine ID: {}", e))
    }
}

fn normalize_optional_header_value(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn resolve_user_agent(task_user_agent: Option<String>, global_user_agent: &str) -> Option<String> {
    normalize_optional_header_value(task_user_agent)
        .or_else(|| normalize_optional_header_value(Some(global_user_agent.to_string())))
}

fn normalize_cookies(cookies: Vec<String>) -> Vec<String> {
    cookies
        .into_iter()
        .map(|cookie| cookie.trim().trim_end_matches(';').to_string())
        .filter(|cookie| !cookie.is_empty())
        .collect()
}

fn speed_limit_kib_to_bps(value: Option<u64>) -> Option<u64> {
    value.and_then(|value| (value > 0).then(|| value.saturating_mul(1024)))
}

#[async_trait::async_trait]
impl DownloadProvider for GoshDownloadProvider {
    fn protocol(&self) -> &'static str {
        "gosh"
    }

    async fn create_task(
        &self,
        task: &DbTask,
        options: TaskCreateOptions,
        settings: &crate::core::settings::AppSettings,
    ) -> Result<String, String> {
        let protocol = detect_protocol(&task.url);
        let id = match protocol {
            DownloadProtocol::Http | DownloadProtocol::Https => {
                let max_connections = options
                    .max_connections
                    .unwrap_or(settings.transfer.task_thread_count)
                    .clamp(1, crate::core::settings::MAX_TASK_THREAD_COUNT)
                    as usize;

                let user_agent = resolve_user_agent(options.user_agent.clone(), &settings.download.global_user_agent);
                let final_cookies = normalize_cookies(options.cookies.clone());

                self.engine
                    .add_http(
                        &task.url,
                        Path::new(&task.save_path),
                        Some(task.name.clone()),
                        HttpTaskOptions {
                            max_connections,
                            max_download_speed: speed_limit_kib_to_bps(options.max_download_speed_kib),
                            user_agent,
                            referer: normalize_optional_header_value(options.referer.clone()),
                            cookies: final_cookies,
                        },
                    )
                    .await?
            }
            DownloadProtocol::Magnet => {
                let mut magnet_url = task.url.to_string();
                let trackers: Vec<String> = settings.bt.tracker_list
                    .lines()
                    .map(|line| line.trim().to_string())
                    .filter(|line| !line.is_empty())
                    .collect();

                for tracker in trackers {
                    let encoded_tracker = urlencoding::encode(&tracker);
                    magnet_url.push_str(&format!("&tr={}", encoded_tracker));
                }

                self.engine
                    .add_magnet(
                        &magnet_url,
                        Path::new(&task.save_path),
                        options.selected_files.clone(),
                        options.sequential,
                        speed_limit_kib_to_bps(options.max_download_speed_kib),
                        speed_limit_kib_to_bps(options.max_upload_speed_kib),
                    )
                    .await?
            }
            DownloadProtocol::Torrent => {
                let ignore_ssl = settings.transfer.ignore_ssl_certificate;
                let ua = resolve_user_agent(options.user_agent.clone(), &settings.download.global_user_agent);
                let cookies_norm = normalize_cookies(options.cookies.clone());
                let referer_norm = normalize_optional_header_value(options.referer.clone());
                let max_retries = settings.transfer.max_download_retries as usize;

                let mut bytes = crate::download::bt::fetch_torrent_bytes(
                    &task.url,
                    ignore_ssl,
                    ua,
                    referer_norm,
                    cookies_norm,
                    max_retries,
                ).await?;

                let trackers: Vec<String> = settings.bt.tracker_list
                    .lines()
                    .map(|line| line.trim().to_string())
                    .filter(|line| !line.is_empty())
                    .collect();

                if !trackers.is_empty() {
                    match crate::download::bt::append_trackers_to_torrent(&bytes, &trackers) {
                        Ok(modified_bytes) => {
                            bytes = modified_bytes;
                        }
                        Err(e) => {
                            log::warn!("Failed to append default trackers to torrent: {}", e);
                        }
                    }
                }

                self.engine
                    .add_torrent(
                        &bytes,
                        Path::new(&task.save_path),
                        options.selected_files.clone(),
                        options.sequential,
                        speed_limit_kib_to_bps(options.max_download_speed_kib),
                        speed_limit_kib_to_bps(options.max_upload_speed_kib),
                    )
                    .await?
            }
            _ => return Err("Unsupported protocol by gosh engine".to_string()),
        };

        if !settings.download.auto_start_downloads {
            let _ = self.engine.pause(id).await;
        }

        Ok(id.as_uuid().to_string())
    }

    async fn pause_task(&self, engine_id: &str) -> Result<(), String> {
        let id = self.parse_id(engine_id)?;
        self.engine.pause(id).await.map_err(|e| e.to_string())
    }

    async fn resume_task(&self, engine_id: &str) -> Result<(), String> {
        let id = self.parse_id(engine_id)?;
        self.engine.resume(id).await.map_err(|e| e.to_string())
    }

    async fn cancel_task(&self, engine_id: &str, delete_files: bool) -> Result<(), String> {
        let id = self.parse_id(engine_id)?;
        self.engine.cancel(id, delete_files).await.map_err(|e| e.to_string())
    }

    async fn query_status(&self, engine_id: &str) -> Result<Option<DownloadProgressInfo>, String> {
        let id = self.parse_id(engine_id)?;
        if let Some(status) = self.engine.status(id) {
            let state_str = match &status.state {
                DownloadState::Queued => "Pending".to_string(),
                DownloadState::Connecting | DownloadState::Downloading => "Downloading".to_string(),
                DownloadState::Seeding => "Seeding".to_string(),
                DownloadState::Paused => "Paused".to_string(),
                DownloadState::Completed => "Completed".to_string(),
                DownloadState::Error { .. } => "Failed".to_string(),
            };

            Ok(Some(DownloadProgressInfo {
                completed_size: status.progress.completed_size,
                total_size: status.progress.total_size.unwrap_or(0),
                download_speed: 0, // computed by caller
                upload_speed: status.progress.upload_speed,
                connections: status.progress.connections,
                status: state_str,
            }))
        } else {
            Ok(None)
        }
    }
}
