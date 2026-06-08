use super::file_actions::cleanup_task_files;
use super::task_format::{format_eta, format_speed, sanitize_filename};
use crate::core::categories::{infer_category, infer_tags};
use crate::core::models::{DbTask, TaskOverview};
use crate::download::{detect_protocol, DownloadInspection, DownloadProtocol};
use chrono::Utc;
use gosh_dl::DownloadId;
use std::path::Path;

impl super::AppState {
    pub(super) fn sync_on_startup(&self) {
        let db_tasks = match self.db.get_all_tasks() {
            Ok(tasks) => tasks,
            Err(_) => return,
        };

        for db_task in db_tasks {
            if let Some(gid_id) = DownloadId::from_gid(&db_task.id) {
                if let Some(engine_status) = self.engine.status(gid_id) {
                    let new_status_str = engine_status.state.to_aria2_status();
                    let mapped_status = match new_status_str {
                        "active" => "Downloading",
                        "waiting" => "Pending",
                        "paused" => "Paused",
                        "complete" => "Completed",
                        "error" => "Failed",
                        _ => "Paused",
                    };

                    if db_task.status != mapped_status {
                        let _ = self.db.update_task_status(&db_task.id, mapped_status, None);
                    }

                    let _ = self.db.update_task_progress(
                        &db_task.id,
                        engine_status.progress.completed_size,
                        engine_status.progress.total_size.unwrap_or(0),
                    );
                } else if db_task.status == "Downloading" || db_task.status == "Pending" {
                    let _ = self.db.update_task_status(&db_task.id, "Paused", None);
                }
            }
        }
    }

    pub async fn add_task(
        &self,
        url: &str,
        path: Option<&str>,
        filename: Option<&str>,
        category_id_override: Option<i64>,
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

        let categories = self.db.get_categories().unwrap_or_default();
        let tags = self.db.get_tags().unwrap_or_default();
        let matched_category = if let Some(category_id) = category_id_override {
            categories
                .iter()
                .find(|category| category.id == category_id)
        } else if settings.download.auto_categorize {
            infer_category(&categories, url, &name, None)
        } else {
            None
        };
        let matched_tags = if settings.download.auto_categorize {
            infer_tags(
                &tags,
                matched_category.map(|category| category.id),
                url,
                &name,
                None,
            )
        } else {
            Vec::new()
        };

        let rule_save_dir = matched_tags
            .iter()
            .find_map(|tag| tag.save_path.as_deref())
            .or_else(|| matched_category.and_then(|category| category.save_path.as_deref()));

        let save_dir = match path {
            Some(p) if !p.is_empty() => p.to_string(),
            _ => rule_save_dir
                .filter(|value| !value.trim().is_empty())
                .unwrap_or(&settings.download.default_save_dir)
                .to_string(),
        };

        std::fs::create_dir_all(&save_dir).map_err(|e| e.to_string())?;

        let id = match protocol {
            DownloadProtocol::Http | DownloadProtocol::Https => {
                self.engine
                    .add_http(url, Path::new(&save_dir), Some(name.clone()))
                    .await?
            }
            DownloadProtocol::Magnet => self.engine.add_magnet(url, Path::new(&save_dir)).await?,
            _ => return Err("Unsupported or invalid protocol".to_string()),
        };

        let gid = id.to_gid();
        let category_id = matched_category.map(|category| category.id);

        let initial_status = if settings.download.auto_start_downloads {
            "Downloading"
        } else {
            self.engine.pause(id).await?;
            "Paused"
        };

        let db_task = DbTask {
            id: gid.clone(),
            name,
            url: url.to_string(),
            protocol: protocol.as_str().to_string(),
            save_path: save_dir,
            total_size: 0,
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
        for tag in matched_tags {
            let _ = self.db.add_task_tag(&gid, tag.id);
        }

        Ok(gid)
    }

    pub async fn inspect_download(&self, url: &str) -> Result<DownloadInspection, String> {
        match detect_protocol(url) {
            DownloadProtocol::Http | DownloadProtocol::Https => self.engine.inspect_http(url).await,
            _ => Err("Only HTTP/HTTPS links support metadata inspection".to_string()),
        }
    }

    pub async fn pause_task(&self, gid: &str) -> Result<(), String> {
        let id = DownloadId::from_gid(gid).ok_or_else(|| "Invalid task GID format".to_string())?;
        self.engine.pause(id).await?;
        let _ = self.db.update_task_status(gid, "Paused", None);
        Ok(())
    }

    pub async fn resume_task(&self, gid: &str) -> Result<(), String> {
        let id = DownloadId::from_gid(gid).ok_or_else(|| "Invalid task GID format".to_string())?;
        self.engine.resume(id).await?;
        let _ = self.db.update_task_status(gid, "Downloading", None);
        Ok(())
    }

    pub async fn cancel_task(&self, gid: &str, delete_files: bool) -> Result<(), String> {
        let id = DownloadId::from_gid(gid).ok_or_else(|| "Invalid task GID format".to_string())?;
        let task = if delete_files {
            self.db.get_task(gid).map_err(|e| e.to_string())?
        } else {
            None
        };

        let _ = self.engine.cancel(id, delete_files).await;
        if let Some(task) = task.as_ref() {
            cleanup_task_files(task);
        }

        self.db.delete_task(gid).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn restart_task(&self, gid: &str) -> Result<String, String> {
        let task = self
            .db
            .get_task(gid)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Task not found".to_string())?;

        if let Some(id) = DownloadId::from_gid(gid) {
            let _ = self.engine.cancel(id, true).await;
        }

        cleanup_task_files(&task);
        let new_gid = self
            .add_task(
                &task.url,
                Some(&task.save_path),
                Some(&task.name),
                task.category_id,
            )
            .await?;
        self.db.delete_task(gid).map_err(|e| e.to_string())?;

        Ok(new_gid)
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

            if let Some(gid_id) = DownloadId::from_gid(&gid) {
                if let Some(engine_status) = self.engine.status(gid_id) {
                    downloaded_bytes = engine_status.progress.completed_size;
                    total_bytes = engine_status.progress.total_size.unwrap_or(0);
                    progress = engine_status.progress.percentage();
                    speed = format_speed(engine_status.progress.download_speed);
                    eta = format_eta(engine_status.progress.eta_seconds);
                } else if total_bytes > 0 {
                    progress = (downloaded_bytes as f64 / total_bytes as f64) * 100.0;
                } else if db_task.status == "Completed" {
                    progress = 100.0;
                }
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
                category_id: db_task.category_id,
                tags,
            });
        }

        Ok(tasks)
    }
}
