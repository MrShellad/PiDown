use super::file_actions::{cleanup_task_files, task_file_path};
use super::task_format::{format_eta, format_speed, sanitize_filename};
use crate::core::categories::{infer_category, infer_tags};
use crate::core::models::{DbTask, TaskClassificationPreview, TaskOverview};
use crate::download::{detect_protocol, DownloadInspection, DownloadProtocol, HttpTaskOptions};
use chrono::Utc;
use gosh_dl::{DownloadId, DownloadState, DownloadStatus};
use std::path::Path;
use uuid::Uuid;

#[derive(Debug, Clone, Default)]
pub struct TaskCreateOptions {
    pub max_connections: Option<u32>,
    pub max_download_speed_kib: Option<u64>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    pub cookies: Vec<String>,
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

impl super::AppState {
    pub fn reconcile_download_tasks(&self) {
        let db_tasks = match self.db.get_all_tasks() {
            Ok(tasks) => tasks,
            Err(_) => return,
        };

        for db_task in db_tasks {
            if let Some(engine_status) = self.engine_status_for_task(&db_task) {
                self.sync_task_from_engine_status(&db_task.id, &engine_status, None);
            } else if db_task.status == "Downloading" || db_task.status == "Pending" {
                let _ = self.db.update_task_status(&db_task.id, "Paused", None);
            }
        }
    }

    pub(super) fn sync_on_startup(&self) {
        self.reconcile_download_tasks();
    }

    fn parse_engine_id(engine_id: &str) -> Option<DownloadId> {
        Uuid::parse_str(engine_id).ok().map(DownloadId::from_uuid)
    }

    fn engine_status_for_task(&self, task: &DbTask) -> Option<DownloadStatus> {
        if let Some(engine_id) = task.engine_id.as_deref().and_then(Self::parse_engine_id) {
            if let Some(status) = self.engine.status(engine_id) {
                return Some(status);
            }
        }

        let matched = self
            .engine
            .list()
            .into_iter()
            .find(|status| status.id.matches_gid(&task.id));

        if let Some(status) = matched.as_ref() {
            let engine_id = status.id.as_uuid().to_string();
            if task.engine_id.as_deref() != Some(engine_id.as_str()) {
                let _ = self.db.update_task_engine_id(&task.id, Some(&engine_id));
            }
        }

        matched
    }

    fn resolve_download_id(&self, gid: &str) -> Result<DownloadId, String> {
        if let Some(task) = self.db.get_task(gid).map_err(|e| e.to_string())? {
            if let Some(engine_id) = task.engine_id.as_deref().and_then(Self::parse_engine_id) {
                if self.engine.status(engine_id).is_some() {
                    return Ok(engine_id);
                }
            }
        }

        if let Some(status) = self
            .engine
            .list()
            .into_iter()
            .find(|status| status.id.matches_gid(gid))
        {
            let engine_id = status.id.as_uuid().to_string();
            let _ = self.db.update_task_engine_id(gid, Some(&engine_id));
            return Ok(status.id);
        }

        if let Some(id) = DownloadId::from_gid(gid) {
            if self.engine.status(id).is_some() {
                return Ok(id);
            }
        }

        Err("Task is not available in the download engine".to_string())
    }

    pub fn gid_for_download_id(&self, id: DownloadId) -> String {
        let engine_id = id.as_uuid().to_string();
        if let Ok(Some(task)) = self.db.get_task_by_engine_id(&engine_id) {
            return task.id;
        }

        let gid = id.to_gid();
        if let Ok(Some(task)) = self.db.get_task(&gid) {
            if task.engine_id.as_deref() != Some(engine_id.as_str()) {
                let _ = self.db.update_task_engine_id(&task.id, Some(&engine_id));
            }
            return task.id;
        }

        gid
    }

    pub fn sync_download_event_status(
        &self,
        id: DownloadId,
        completed_at: Option<i64>,
    ) -> Option<String> {
        let gid = self.gid_for_download_id(id);
        let status = self.engine.status(id)?;
        if !matches!(self.db.get_task(&gid), Ok(Some(_))) {
            return None;
        }
        self.sync_task_from_engine_status(&gid, &status, completed_at);
        Some(gid)
    }

    pub fn sync_download_progress(
        &self,
        id: DownloadId,
        completed_size: u64,
        total_size: Option<u64>,
    ) -> String {
        let gid = self.gid_for_download_id(id);
        let _ = self
            .db
            .update_task_progress(&gid, completed_size, total_size.unwrap_or(0));
        gid
    }

    fn sync_task_from_engine_status(
        &self,
        gid: &str,
        engine_status: &DownloadStatus,
        completed_at: Option<i64>,
    ) {
        let mapped_status = match &engine_status.state {
            DownloadState::Queued => "Pending",
            DownloadState::Connecting | DownloadState::Downloading | DownloadState::Seeding => {
                "Downloading"
            }
            DownloadState::Paused => "Paused",
            DownloadState::Completed => "Completed",
            DownloadState::Error { .. } => "Failed",
        };

        let final_completed_at = match &engine_status.state {
            DownloadState::Completed | DownloadState::Error { .. } => completed_at,
            _ => None,
        };

        let _ = self
            .db
            .update_task_status(gid, mapped_status, final_completed_at);
        let _ = self.db.update_task_progress(
            gid,
            engine_status.progress.completed_size,
            engine_status.progress.total_size.unwrap_or(0),
        );
    }

    pub async fn add_task(
        &self,
        url: &str,
        path: Option<&str>,
        filename: Option<&str>,
        category_id_override: Option<i64>,
        category_override: bool,
        total_size: Option<u64>,
        task_options: TaskCreateOptions,
    ) -> Result<String, String> {
        let protocol = detect_protocol(url);
        let settings = self.settings.read().unwrap().clone();

        let inferred_name = url
            .split('/')
            .last()
            .unwrap_or("download")
            .split('?')
            .next()
            .unwrap_or("download");
        let name = filename
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(sanitize_filename)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| sanitize_filename(inferred_name));

        let preview = self.preview_task_classification(
            url,
            &name,
            total_size,
            category_id_override,
            category_override,
        )?;

        let save_dir = match path {
            Some(p) if !p.is_empty() => p.to_string(),
            _ => preview.save_path.clone(),
        };

        std::fs::create_dir_all(&save_dir).map_err(|e| e.to_string())?;

        let id = match protocol {
            DownloadProtocol::Http | DownloadProtocol::Https => {
                let max_connections = task_options
                    .max_connections
                    .unwrap_or(settings.transfer.task_thread_count)
                    .clamp(1, crate::core::settings::MAX_TASK_THREAD_COUNT)
                    as usize;

                self.engine
                    .add_http(
                        url,
                        Path::new(&save_dir),
                        Some(name.clone()),
                        HttpTaskOptions {
                            max_connections,
                            max_download_speed: speed_limit_kib_to_bps(
                                task_options.max_download_speed_kib,
                            ),
                            user_agent: resolve_user_agent(
                                task_options.user_agent,
                                &settings.download.global_user_agent,
                            ),
                            referer: normalize_optional_header_value(task_options.referer),
                            cookies: normalize_cookies(task_options.cookies),
                        },
                    )
                    .await?
            }
            DownloadProtocol::Magnet => self.engine.add_magnet(url, Path::new(&save_dir)).await?,
            _ => return Err("Unsupported or invalid protocol".to_string()),
        };

        let gid = id.to_gid();
        let category_id = preview.category.as_ref().map(|category| category.id);

        let initial_status = if settings.download.auto_start_downloads {
            "Downloading"
        } else {
            self.engine.pause(id).await?;
            "Paused"
        };

        let db_task = DbTask {
            id: gid.clone(),
            engine_id: Some(id.as_uuid().to_string()),
            name,
            url: url.to_string(),
            protocol: protocol.as_str().to_string(),
            save_path: save_dir,
            total_size: total_size.unwrap_or(0),
            completed_size: 0,
            status: initial_status.to_string(),
            category_id,
            created_at: Utc::now().timestamp(),
            started_at: if initial_status == "Downloading" {
                Some(Utc::now().timestamp())
            } else {
                None
            },
            completed_at: None,
        };

        self.db.insert_task(&db_task).map_err(|e| e.to_string())?;
        for tag in preview.tags {
            let _ = self.db.add_task_tag(&gid, tag.id);
        }
        if let Some(engine_status) = self.engine.status(id) {
            self.sync_task_from_engine_status(&gid, &engine_status, None);
        }

        Ok(gid)
    }

    pub fn preview_task_classification(
        &self,
        url: &str,
        filename: &str,
        total_size: Option<u64>,
        category_id_override: Option<i64>,
        category_override: bool,
    ) -> Result<TaskClassificationPreview, String> {
        let settings = self.settings.read().unwrap().clone();
        let name = sanitize_filename(filename.trim());
        let categories = self.db.get_categories().map_err(|e| e.to_string())?;
        let tags = self.db.get_tags().map_err(|e| e.to_string())?;

        let matched_category = if category_override {
            category_id_override.and_then(|category_id| {
                categories
                    .iter()
                    .find(|category| category.id == category_id)
                    .cloned()
            })
        } else if settings.download.auto_categorize {
            infer_category(&categories, url, &name, total_size).cloned()
        } else {
            None
        };

        let matched_tags = if settings.download.auto_categorize {
            infer_tags(
                &tags,
                matched_category.as_ref().map(|category| category.id),
                url,
                &name,
                total_size,
            )
            .into_iter()
            .cloned()
            .collect::<Vec<_>>()
        } else {
            Vec::new()
        };

        let save_path = matched_tags
            .iter()
            .find_map(|tag| tag.save_path.as_deref())
            .or_else(|| {
                matched_category
                    .as_ref()
                    .and_then(|category| category.save_path.as_deref())
            })
            .filter(|value| !value.trim().is_empty())
            .unwrap_or(&settings.download.default_save_dir)
            .to_string();

        Ok(TaskClassificationPreview {
            category: matched_category,
            tags: matched_tags,
            save_path,
        })
    }

    pub async fn inspect_download(&self, url: &str) -> Result<DownloadInspection, String> {
        let settings = self.settings.read().unwrap().clone();
        match detect_protocol(url) {
            DownloadProtocol::Http | DownloadProtocol::Https => self
                .engine
                .inspect_http(url, Some(&settings.download.global_user_agent))
                .await,
            _ => Err("Only HTTP/HTTPS links support metadata inspection".to_string()),
        }
    }

    pub async fn pause_task(&self, gid: &str) -> Result<(), String> {
        let id = self.resolve_download_id(gid)?;
        self.engine.pause(id).await?;
        let _ = self.db.update_task_status(gid, "Paused", None);
        Ok(())
    }

    pub async fn resume_task(&self, gid: &str) -> Result<(), String> {
        let id = self.resolve_download_id(gid)?;
        self.engine.resume(id).await?;
        let _ = self.db.update_task_status(gid, "Downloading", None);
        Ok(())
    }

    pub async fn cancel_task(&self, gid: &str, delete_files: bool) -> Result<(), String> {
        let task = self.db.get_task(gid).map_err(|e| e.to_string())?;

        if let Ok(id) = self.resolve_download_id(gid) {
            let _ = self.engine.cancel(id, delete_files).await;
        }

        let Some(task) = task else {
            return Err("Task not found".to_string());
        };

        if delete_files {
            cleanup_task_files(&task);
        }
        self.db.delete_task(gid).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn clear_completed_tasks(&self, delete_files: bool) -> Result<usize, String> {
        if delete_files {
            for task in self
                .db
                .get_all_tasks()
                .map_err(|e| e.to_string())?
                .into_iter()
                .filter(|task| task.status == "Completed")
            {
                cleanup_task_files(&task);
            }
        }

        self.db.delete_completed_tasks().map_err(|e| e.to_string())
    }

    pub fn has_incomplete_download_tasks(&self) -> Result<bool, String> {
        Ok(self
            .db
            .get_all_tasks()
            .map_err(|e| e.to_string())?
            .into_iter()
            .any(|task| {
                matches!(
                    task.status.as_str(),
                    "Pending" | "Downloading" | "Paused" | "Failed"
                )
            }))
    }

    pub async fn restart_task(&self, gid: &str) -> Result<String, String> {
        let task = self
            .db
            .get_task(gid)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Task not found".to_string())?;

        if let Ok(id) = self.resolve_download_id(gid) {
            let _ = self.engine.cancel(id, true).await;
        }

        cleanup_task_files(&task);
        let new_gid = self
            .add_task(
                &task.url,
                Some(&task.save_path),
                Some(&task.name),
                task.category_id,
                task.category_id.is_some(),
                (task.total_size > 0).then_some(task.total_size),
                TaskCreateOptions::default(),
            )
            .await?;
        self.db.delete_task(gid).map_err(|e| e.to_string())?;

        Ok(new_gid)
    }

    pub fn validate_completed_task_file(&self, gid: &str) -> Result<(), String> {
        let task = self
            .db
            .get_task(gid)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Task not found".to_string())?;

        if task.protocol != "http" && task.protocol != "https" {
            return Ok(());
        }

        if task.total_size == 0 {
            return Ok(());
        }

        let file_path = task_file_path(&task);
        let actual_size = std::fs::metadata(&file_path)
            .map(|metadata| metadata.len())
            .map_err(|e| format!("Failed to inspect completed file: {e}"))?;

        if actual_size != task.total_size {
            let _ = self
                .db
                .update_task_progress(gid, actual_size, task.total_size);
            let _ = self
                .db
                .update_task_status(gid, "Failed", Some(Utc::now().timestamp()));
            return Err(format!(
                "Completed file size mismatch: actual {} bytes, expected {} bytes",
                actual_size, task.total_size
            ));
        }

        let _ = self
            .db
            .update_task_progress(gid, task.total_size, task.total_size);
        Ok(())
    }

    pub fn list_tasks(&self) -> Result<Vec<TaskOverview>, String> {
        let db_tasks = self.db.get_all_tasks().map_err(|e| e.to_string())?;
        let mut tasks = Vec::with_capacity(db_tasks.len());

        for db_task in db_tasks {
            let gid = db_task.id.clone();
            let mut speed = "0 B/s".to_string();
            let mut eta = "--:--:--".to_string();
            let mut progress = 0.0;
            let mut downloaded_bytes = db_task.completed_size;
            let mut total_bytes = db_task.total_size;

            let speed_display_unit = self
                .settings
                .read()
                .unwrap()
                .transfer
                .speed_display_unit
                .clone();

            if let Some(engine_status) = self.engine_status_for_task(&db_task) {
                downloaded_bytes = engine_status.progress.completed_size;
                total_bytes = engine_status.progress.total_size.unwrap_or(0);
                progress = engine_status.progress.percentage();
                speed = format_speed(engine_status.progress.download_speed, &speed_display_unit);
                eta = format_eta(engine_status.progress.eta_seconds);
            } else if total_bytes > 0 {
                progress = (downloaded_bytes as f64 / total_bytes as f64) * 100.0;
            } else if db_task.status == "Completed" {
                progress = 100.0;
            }

            let tags = self.db.get_task_tags(&gid).unwrap_or_default();

            tasks.push(TaskOverview {
                gid,
                url: db_task.url,
                name: db_task.name,
                status: db_task.status,
                speed,
                progress,
                eta,
                downloaded_bytes,
                total_bytes,
                created_at: db_task.created_at,
                save_path: db_task.save_path,
                category_id: db_task.category_id,
                tags,
            });
        }

        Ok(tasks)
    }
}
