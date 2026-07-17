use super::file_actions::{cleanup_task_files, task_file_path};
use super::task_format::{format_eta, format_speed, sanitize_filename};
use crate::core::categories::{infer_category, infer_tags};
use crate::core::models::{DbTask, TaskClassificationPreview, TaskOverview};
use crate::download::{detect_protocol, DownloadInspection, DownloadProtocol};
use chrono::Utc;
use gosh_dl::{DownloadId, DownloadState, DownloadStatus};
use std::sync::Arc;
use tauri::Emitter;
use uuid::Uuid;

#[derive(Debug, Clone, Default)]
#[allow(dead_code)]
pub struct TaskCreateOptions {
    pub max_connections: Option<u32>,
    pub max_download_speed_kib: Option<u64>,
    pub max_upload_speed_kib: Option<u64>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    pub cookies: Vec<String>,
    pub selected_files: Option<Vec<usize>>,
    pub sequential: Option<bool>,
    pub auto_verify: Option<bool>,
    pub disable_dht_pex_lpd: Option<bool>,
    pub file_allocation: Option<String>,
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

#[allow(dead_code)]
fn speed_limit_kib_to_bps(value: Option<u64>) -> Option<u64> {
    value.and_then(|value| (value > 0).then(|| value.saturating_mul(1024)))
}

impl super::AppState {
    pub fn sync_task_from_progress_info(&self, gid: &str, info: &crate::download::provider::DownloadProgressInfo) {
        if let Some(task) = self.task_cache.write().unwrap().get_mut(gid) {
            task.status = info.status.clone();
            task.completed_size = info.completed_size;
            task.total_size = info.total_size;
            if info.status == "Downloading" {
                if task.started_at.is_none() {
                    task.started_at = Some(Utc::now().timestamp());
                }
            } else if info.status == "Completed" || info.status == "Failed" {
                if task.completed_at.is_none() {
                    task.completed_at = Some(Utc::now().timestamp());
                }
            }
            task.dirty = true;
        }
        let completed_at = if info.status == "Completed" || info.status == "Failed" {
            Some(Utc::now().timestamp())
        } else {
            None
        };
        let _ = self.db.update_task_status(gid, &info.status, completed_at);
    }

    pub async fn reconcile_download_tasks(&self) {
        let cache_tasks: Vec<DbTask> = self.task_cache.read().unwrap().values().cloned().collect();
        let backend = self.settings.read().unwrap().download.backend;

        for db_task in cache_tasks {
            let provider_name = if db_task.protocol == "hls" {
                "hls"
            } else {
                match backend {
                    crate::core::settings::DownloadBackend::Gosh => "gosh",
                    crate::core::settings::DownloadBackend::Aria2 => "aria2",
                }
            };

            if let Some(provider) = self.providers.get(provider_name) {
                let ref_id = db_task.engine_id.as_deref().unwrap_or(&db_task.id);
                if let Ok(Some(info)) = provider.query_status(ref_id).await {
                    self.sync_task_from_progress_info(&db_task.id, &info);
                } else if db_task.status == "Downloading" || db_task.status == "Pending" {
                    if let Some(task) = self.task_cache.write().unwrap().get_mut(&db_task.id) {
                        task.status = "Paused".to_string();
                        task.dirty = true;
                    }
                    let _ = self.db.update_task_status(&db_task.id, "Paused", None);
                }
            }
        }
    }

    pub(super) fn sync_on_startup(self: &Arc<Self>) {
        let self_clone = self.clone();
        tauri::async_runtime::spawn(async move {
            self_clone.reconcile_download_tasks().await;
        });
    }

    fn parse_engine_id(engine_id: &str) -> Option<DownloadId> {
        Uuid::parse_str(engine_id).ok().map(DownloadId::from_uuid)
    }

    #[allow(dead_code)]
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

    #[allow(dead_code)]
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
        if let Some(gid) = self.gid_cache.lock().unwrap().get(&id).cloned() {
            return gid;
        }

        let engine_id = id.as_uuid().to_string();
        if let Ok(Some(task)) = self.db.get_task_by_engine_id(&engine_id) {
            self.gid_cache.lock().unwrap().insert(id, task.id.clone());
            return task.id;
        }

        let gid = id.to_gid();
        if let Ok(Some(task)) = self.db.get_task(&gid) {
            if task.engine_id.as_deref() != Some(engine_id.as_str()) {
                let _ = self.db.update_task_engine_id(&task.id, Some(&engine_id));
            }
            self.gid_cache.lock().unwrap().insert(id, task.id.clone());
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
        let total_size = total_size.unwrap_or(0);

        let should_update = {
            let mut throttle = self.progress_throttle.lock().unwrap();
            if let Some((last_size, last_time)) = throttle.get(&gid).copied() {
                let now = std::time::Instant::now();
                let size_delta = completed_size.saturating_sub(last_size);
                let time_delta = now.duration_since(last_time);
                let is_completed = total_size > 0 && completed_size >= total_size;

                if size_delta >= 1024 * 1024 || time_delta >= std::time::Duration::from_secs(2) || is_completed {
                    throttle.insert(gid.clone(), (completed_size, now));
                    true
                } else {
                    false
                }
            } else {
                throttle.insert(gid.clone(), (completed_size, std::time::Instant::now()));
                true
            }
        };

        if should_update {
            if let Some(task) = self.task_cache.write().unwrap().get_mut(&gid) {
                task.completed_size = completed_size;
                task.total_size = total_size;
                task.dirty = true;
            }
        }
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

        let error_msg = match &engine_status.state {
            DownloadState::Error { message, .. } => Some(message.clone()),
            _ => None,
        };

        if let Some(task) = self.task_cache.write().unwrap().get_mut(gid) {
            task.status = mapped_status.to_string();
            task.completed_size = engine_status.progress.completed_size;
            task.total_size = engine_status.progress.total_size.unwrap_or(0);
            
            // For BT/magnet tasks, update display name if engine has loaded the actual metadata name
            if (task.protocol == "magnet" || task.protocol == "torrent") && !engine_status.metadata.name.is_empty() {
                task.name = engine_status.metadata.name.clone();
            }
            
            if mapped_status == "Downloading" {
                if task.started_at.is_none() {
                    task.started_at = Some(Utc::now().timestamp());
                }
            } else if final_completed_at.is_some() {
                task.completed_at = final_completed_at;
            }
            if error_msg.is_some() {
                task.error_message = error_msg.clone();
            }
            task.dirty = true;
        }

        let _ = self.db.update_task_status(gid, mapped_status, final_completed_at);
        if let Some(msg) = error_msg.as_deref() {
            let _ = self.db.update_task_error(gid, Some(msg));
        }

        self.progress_throttle.lock().unwrap().insert(
            gid.to_string(),
            (
                engine_status.progress.completed_size,
                std::time::Instant::now(),
            ),
        );
    }

    pub async fn add_task(
        self: &Arc<Self>,
        url: &str,
        path: Option<&str>,
        filename: Option<&str>,
        category_id_override: Option<i64>,
        category_override: bool,
        total_size: Option<u64>,
        task_options: TaskCreateOptions,
    ) -> Result<String, String> {
        let _config_lock = self.config_mutex.lock().await;

        let mut original_mode = None;
        if let Some(ref alloc_mode) = task_options.file_allocation {
            if alloc_mode != "default" {
                let mut config = self.engine.inner().get_config();
                original_mode = Some(config.torrent.allocation_mode);
                config.torrent.allocation_mode = match alloc_mode.as_str() {
                    "sparse" => gosh_dl::config::AllocationMode::Sparse,
                    "full" => gosh_dl::config::AllocationMode::Full,
                    _ => gosh_dl::config::AllocationMode::None,
                };
                self.engine
                    .inner()
                    .set_config(config)
                    .map_err(|e| e.to_string())?;
            }
        }

        struct AllocationModeGuard<'a> {
            engine: &'a gosh_dl::DownloadEngine,
            original_mode: Option<gosh_dl::config::AllocationMode>,
        }

        impl<'a> Drop for AllocationModeGuard<'a> {
            fn drop(&mut self) {
                if let Some(mode) = self.original_mode {
                    let mut config = self.engine.get_config();
                    config.torrent.allocation_mode = mode;
                    let _ = self.engine.set_config(config);
                }
            }
        }

        let _guard = AllocationModeGuard {
            engine: &**self.engine.inner(),
            original_mode,
        };

        let mut final_url = url.to_string();
        let mut task_options = task_options;
        task_options.cookies = normalize_cookies(task_options.cookies);
        let settings = self.settings.read().unwrap().clone();
        let user_agent = resolve_user_agent(
            task_options.user_agent.clone(),
            &settings.download.global_user_agent,
        );

        if parse_google_drive_file_id(&final_url).is_some() {
            if let Ok((resolved_url, resolved_cookies)) = resolve_google_drive_link(&final_url, user_agent.as_deref(), &task_options.cookies).await {
                final_url = resolved_url;
                task_options.cookies = resolved_cookies;
            }
        }

        let protocol = detect_protocol(&final_url);

        let is_hls = {
            let url_lower = final_url.to_lowercase();
            if let Some(path_part) = url_lower.split('?').next() {
                path_part.ends_with(".m3u8")
            } else {
                false
            }
        };

        let backend = self.settings.read().unwrap().download.backend;
        let provider_name = if is_hls {
            "hls"
        } else {
            match backend {
                crate::core::settings::DownloadBackend::Gosh => "gosh",
                crate::core::settings::DownloadBackend::Aria2 => "aria2",
            }
        };
        let provider = self.providers.get(provider_name)
            .ok_or_else(|| format!("No provider registered for {}", provider_name))?;

        let inferred_name = final_url
            .split('/')
            .last()
            .unwrap_or("download")
            .split('?')
            .next()
            .unwrap_or("download");
        let mut name = filename
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(sanitize_filename)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| sanitize_filename(inferred_name));

        if is_hls {
            if name.ends_with(".m3u8") {
                name = name.strip_suffix(".m3u8").unwrap().to_string() + ".ts";
            } else if !name.ends_with(".ts") {
                name.push_str(".ts");
            }
        }

        let preview = self.preview_task_classification(
            &final_url,
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

        let gid = uuid::Uuid::new_v4().to_string();
        let initial_status = if settings.download.auto_start_downloads {
            "Downloading"
        } else {
            "Paused"
        };
        let db_protocol = if is_hls { "hls".to_string() } else { protocol.as_str().to_string() };

        let mut db_task = DbTask {
            id: gid.clone(),
            engine_id: None,
            name,
            url: final_url.clone(),
            protocol: db_protocol,
            save_path: save_dir.clone(),
            total_size: total_size.unwrap_or(0),
            completed_size: 0,
            status: initial_status.to_string(),
            category_id: preview.category.as_ref().map(|category| category.id),
            created_at: Utc::now().timestamp(),
            started_at: if initial_status == "Downloading" {
                Some(Utc::now().timestamp())
            } else {
                None
            },
            completed_at: None,
            error_message: None,
            max_download_speed_kib: task_options.max_download_speed_kib,
            max_upload_speed_kib: task_options.max_upload_speed_kib,
            dirty: true,
        };

        let engine_id = provider.create_task(&db_task, task_options.clone(), &settings).await?;
        db_task.engine_id = Some(engine_id.clone());

        if provider_name == "gosh" {
            if let Ok(uuid) = uuid::Uuid::parse_str(&engine_id) {
                let download_id = DownloadId::from_uuid(uuid);
                self.gid_cache.lock().unwrap().insert(download_id, gid.clone());
            }
        }

        self.db.insert_task(&db_task).map_err(|e| e.to_string())?;
        self.task_cache.write().unwrap().insert(gid.clone(), db_task.clone());
        for tag in preview.tags {
            let _ = self.db.add_task_tag(&gid, tag.id);
        }

        if provider_name == "gosh" && initial_status == "Downloading" {
            if let Ok(uuid) = uuid::Uuid::parse_str(&engine_id) {
                let download_id = DownloadId::from_uuid(uuid);
                if let Some(engine_status) = self.engine.status(download_id) {
                    self.sync_task_from_engine_status(&gid, &engine_status, None);
                }
            }
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

    pub async fn inspect_download(
        &self,
        url: &str,
        user_agent: Option<String>,
        referer: Option<String>,
        cookies: Option<Vec<String>>,
    ) -> Result<DownloadInspection, String> {
        let settings = self.settings.read().unwrap().clone();
        match detect_protocol(url) {
            DownloadProtocol::Http | DownloadProtocol::Https => {
                let ua = resolve_user_agent(user_agent, &settings.download.global_user_agent);
                let cookies_norm = cookies.map(normalize_cookies).unwrap_or_default();
                let referer_norm = normalize_optional_header_value(referer);
                self.engine
                    .inspect_http(
                        url,
                        ua.as_deref(),
                        referer_norm.as_deref(),
                        (!cookies_norm.is_empty()).then_some(cookies_norm.as_slice()),
                    )
                    .await
            }
            DownloadProtocol::Magnet => crate::download::bt::inspect_magnet(url),
            DownloadProtocol::Torrent => {
                let ignore_ssl = settings.transfer.ignore_ssl_certificate;
                let ua = resolve_user_agent(user_agent, &settings.download.global_user_agent);
                let cookies_norm = cookies.map(normalize_cookies).unwrap_or_default();
                let referer_norm = normalize_optional_header_value(referer);
                let max_retries = settings.transfer.max_download_retries as usize;
                
                crate::download::bt::inspect_torrent(
                    url,
                    ignore_ssl,
                    ua,
                    referer_norm,
                    cookies_norm,
                    max_retries,
                ).await
            }
            _ => Err("Unsupported protocol for metadata inspection".to_string()),
        }
    }

    pub async fn pause_task(self: &Arc<Self>, gid: &str) -> Result<(), String> {
        let (protocol, engine_id) = {
            let cache = self.task_cache.read().unwrap();
            let task = cache.get(gid).ok_or_else(|| "Task not found".to_string())?;
            (task.protocol.clone(), task.engine_id.clone())
        };

        let backend = self.settings.read().unwrap().download.backend;
        let provider_name = if protocol == "hls" {
            "hls"
        } else {
            match backend {
                crate::core::settings::DownloadBackend::Gosh => "gosh",
                crate::core::settings::DownloadBackend::Aria2 => "aria2",
            }
        };
        let provider = self.providers.get(provider_name)
            .ok_or_else(|| format!("No provider registered for {}", provider_name))?;

        let ref_id = engine_id.as_deref().unwrap_or(gid);
        provider.pause_task(ref_id).await?;
        Ok(())
    }

    pub async fn resume_task(self: &Arc<Self>, gid: &str) -> Result<(), String> {
        let (protocol, engine_id) = {
            let cache = self.task_cache.read().unwrap();
            let task = cache.get(gid).ok_or_else(|| "Task not found".to_string())?;
            (task.protocol.clone(), task.engine_id.clone())
        };

        let backend = self.settings.read().unwrap().download.backend;
        let provider_name = if protocol == "hls" {
            "hls"
        } else {
            match backend {
                crate::core::settings::DownloadBackend::Gosh => "gosh",
                crate::core::settings::DownloadBackend::Aria2 => "aria2",
            }
        };
        let provider = self.providers.get(provider_name)
            .ok_or_else(|| format!("No provider registered for {}", provider_name))?;

        let ref_id = engine_id.as_deref().unwrap_or(gid);
        provider.resume_task(ref_id).await?;
        Ok(())
    }

    pub async fn cancel_task(self: &Arc<Self>, gid: &str, delete_files: bool) -> Result<(), String> {
        let (protocol, engine_id) = {
            let cache = self.task_cache.read().unwrap();
            let task = cache.get(gid).ok_or_else(|| "Task not found".to_string())?;
            (task.protocol.clone(), task.engine_id.clone())
        };

        let backend = self.settings.read().unwrap().download.backend;
        let provider_name = if protocol == "hls" {
            "hls"
        } else {
            match backend {
                crate::core::settings::DownloadBackend::Gosh => "gosh",
                crate::core::settings::DownloadBackend::Aria2 => "aria2",
            }
        };
        let provider = self.providers.get(provider_name)
            .ok_or_else(|| format!("No provider registered for {}", provider_name))?;

        let ref_id = engine_id.as_deref().unwrap_or(gid);
        let _ = provider.cancel_task(ref_id, delete_files).await;

        self.task_cache.write().unwrap().remove(gid);
        self.progress_throttle.lock().unwrap().remove(gid);

        if delete_files {
            let task = self.db.get_task(gid).map_err(|e| e.to_string())?;
            if let Some(t) = task {
                cleanup_task_files(&t);
            }
        }

        self.db.delete_task(gid).map_err(|e| e.to_string())?;

        if provider_name == "gosh" {
            if let Some(ref_id_str) = &engine_id {
                if let Ok(uuid) = uuid::Uuid::parse_str(ref_id_str) {
                    let download_id = DownloadId::from_uuid(uuid);
                    self.gid_cache.lock().unwrap().remove(&download_id);
                }
            }
        }

        if let Some(ref app_handle) = *self.app_handle.lock().unwrap() {
            let _ = app_handle.emit("download-task-updated", serde_json::json!({ "gid": gid }));
        }

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

        self.task_cache.write().unwrap().retain(|_, task| task.status != "Completed");
        self.db.delete_completed_tasks().map_err(|e| e.to_string())
    }

    pub fn has_incomplete_download_tasks(&self) -> Result<bool, String> {
        Ok(self
            .task_cache
            .read()
            .unwrap()
            .values()
            .any(|task| {
                matches!(
                    task.status.as_str(),
                    "Pending" | "Downloading" | "Paused" | "Failed"
                )
            }))
    }

    pub async fn restart_task(self: &Arc<Self>, gid: &str) -> Result<String, String> {
        let task = self
            .db
            .get_task(gid)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Task not found".to_string())?;

        let _ = self.cancel_task(gid, true).await;

        let new_gid = self
            .add_task(
                &task.url,
                Some(&task.save_path),
                Some(&task.name),
                task.category_id,
                task.category_id.is_some(),
                (task.total_size > 0).then_some(task.total_size),
                TaskCreateOptions {
                    max_download_speed_kib: task.max_download_speed_kib,
                    max_upload_speed_kib: task.max_upload_speed_kib,
                    ..Default::default()
                },
            )
            .await?;

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
            let err_msg = format!(
                "Completed file size mismatch: actual {} bytes, expected {} bytes",
                actual_size, task.total_size
            );
            if let Some(t) = self.task_cache.write().unwrap().get_mut(gid) {
                t.completed_size = actual_size;
                t.total_size = task.total_size;
                t.status = "Failed".to_string();
                t.completed_at = Some(Utc::now().timestamp());
                t.error_message = Some(err_msg.clone());
                t.dirty = true;
            }
            let _ = self
                .db
                .update_task_progress(gid, actual_size, task.total_size);
            let _ = self
                .db
                .update_task_status(gid, "Failed", Some(Utc::now().timestamp()));
            let _ = self.db.update_task_error(gid, Some(&err_msg));
            return Err(err_msg);
        }

        if let Some(t) = self.task_cache.write().unwrap().get_mut(gid) {
            t.completed_size = task.total_size;
            t.total_size = task.total_size;
            t.dirty = true;
        }
        let _ = self
            .db
            .update_task_progress(gid, task.total_size, task.total_size);
        Ok(())
    }

    pub fn list_tasks(&self) -> Result<Vec<TaskOverview>, String> {
        let cache_tasks: Vec<DbTask> = self.task_cache.read().unwrap().values().cloned().collect();
        let engine_list = self.engine.list();
        use std::collections::HashMap;

        // Fetch all task-tag relationships and tags in bulk
        let all_mappings = self.db.get_all_task_tags_mappings().unwrap_or_default();
        let all_tags = self.db.get_tags().unwrap_or_default();
        let tags_map: HashMap<i64, crate::core::models::DbTag> = all_tags.into_iter().map(|tag| (tag.id, tag)).collect();
        let mut task_tags_map: HashMap<String, Vec<crate::core::models::DbTag>> = HashMap::new();
        for (task_id, tag_id) in all_mappings {
            if let Some(tag) = tags_map.get(&tag_id) {
                task_tags_map.entry(task_id).or_default().push(tag.clone());
            }
        }

        let mut engine_tasks = HashMap::with_capacity(engine_list.len() * 2);
        for status in engine_list {
            let uuid_str = status.id.as_uuid().to_string();
            let gid_str = status.id.to_gid();
            engine_tasks.insert(uuid_str, status.clone());
            engine_tasks.insert(gid_str, status);
        }

        let mut tasks = Vec::with_capacity(cache_tasks.len());

        for db_task in cache_tasks {
            let gid = db_task.id.clone();
            let mut status = db_task.status.clone();
            let mut speed = "0 B/s".to_string();
            let mut eta = "--:--:--".to_string();
            let mut progress = 0.0;
            let mut downloaded_bytes = db_task.completed_size;
            let mut total_bytes = db_task.total_size;
            let mut speed_bps = 0u64;
            let mut eta_seconds = None;

            let mut upload_speed = "0 B/s".to_string();

            let speed_display_unit = self
                .settings
                .read()
                .unwrap()
                .transfer
                .speed_display_unit
                .clone();

            let engine_status = db_task.engine_id.as_ref()
                .and_then(|engine_id| engine_tasks.get(engine_id))
                .or_else(|| engine_tasks.get(&db_task.id));

            if let Some(engine_status) = engine_status {
                downloaded_bytes = engine_status.progress.completed_size;
                total_bytes = engine_status.progress.total_size.unwrap_or(0);
                progress = engine_status.progress.percentage();
                speed = format_speed(engine_status.progress.download_speed, &speed_display_unit);
                eta = format_eta(engine_status.progress.eta_seconds);
                speed_bps = engine_status.progress.download_speed;
                eta_seconds = engine_status.progress.eta_seconds;
                upload_speed = format_speed(engine_status.progress.upload_speed, &speed_display_unit);
                if matches!(engine_status.state, DownloadState::Seeding) {
                    status = "Seeding".to_string();
                }
            } else if total_bytes > 0 {
                progress = (downloaded_bytes as f64 / total_bytes as f64) * 100.0;
            } else if db_task.status == "Completed" {
                progress = 100.0;
            }

            let tags = task_tags_map.remove(&gid).unwrap_or_default();

            tasks.push(TaskOverview {
                gid,
                url: db_task.url,
                name: db_task.name,
                status,
                speed,
                progress,
                eta,
                speed_bps,
                eta_seconds,
                downloaded_bytes,
                total_bytes,
                created_at: db_task.created_at,
                started_at: db_task.started_at,
                completed_at: db_task.completed_at,
                upload_speed,
                error_message: db_task.error_message,
                save_path: db_task.save_path,
                category_id: db_task.category_id,
                tags,
                protocol: db_task.protocol.clone(),
                max_download_speed_kib: db_task.max_download_speed_kib,
                max_upload_speed_kib: db_task.max_upload_speed_kib,
            });
        }

        tasks.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        Ok(tasks)
    }
}

fn parse_google_drive_file_id(url: &str) -> Option<String> {
    if !url.contains("drive.google.com") {
        return None;
    }
    // Handle /file/d/FILE_ID/...
    if let Some(pos) = url.find("/file/d/") {
        let start = pos + 8;
        let sub = &url[start..];
        let end = sub.find('/').unwrap_or(sub.find('?').unwrap_or(sub.len()));
        let id = &sub[..end];
        if !id.is_empty() {
            return Some(id.to_string());
        }
    }
    // Handle id=FILE_ID
    if let Some(pos) = url.find("id=") {
        let start = pos + 3;
        let sub = &url[start..];
        let end = sub.find('&').unwrap_or(sub.len());
        let id = &sub[..end];
        if !id.is_empty() {
            return Some(id.to_string());
        }
    }
    None
}

fn extract_confirm_token_from_cookies(cookies: &[String]) -> Option<String> {
    for cookie in cookies {
        if cookie.contains("download_warning") {
            if let Some(pos) = cookie.find('=') {
                let token = cookie[pos + 1..].trim();
                if !token.is_empty() {
                    return Some(token.to_string());
                }
            }
        }
    }
    None
}

fn extract_confirm_token_from_html(html: &str) -> Option<String> {
    if let Some(pos) = html.find("confirm=") {
        let sub = &html[pos + 8..];
        let end = sub.chars().position(|c| c == '&' || c == '"' || c == '\'' || c.is_whitespace()).unwrap_or(sub.len());
        let token = &sub[..end];
        if !token.is_empty() {
            return Some(token.to_string());
        }
    }
    None
}

async fn resolve_google_drive_link(
    url: &str,
    user_agent: Option<&str>,
    initial_cookies: &[String],
) -> Result<(String, Vec<String>), String> {
    let Some(file_id) = parse_google_drive_file_id(url) else {
        return Ok((url.to_string(), initial_cookies.to_vec()));
    };

    let client = reqwest::Client::builder()
        .user_agent(user_agent.unwrap_or("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"))
        .build()
        .map_err(|e| format!("Failed to build reqwest client: {}", e))?;

    let mut cookies = initial_cookies.to_vec();
    let initial_url = format!("https://drive.google.com/uc?export=download&id={}", file_id);

    // Request 1: Try to get the page or the direct file download
    let mut req1 = client.get(&initial_url);
    if !cookies.is_empty() {
        req1 = req1.header(reqwest::header::COOKIE, cookies.join("; "));
    }
    let res1 = req1.send().await.map_err(|e| format!("Request 1 failed: {}", e))?;

    // Capture cookies set by Google Drive
    for set_cookie in res1.headers().get_all(reqwest::header::SET_COOKIE) {
        if let Ok(cookie_str) = set_cookie.to_str() {
            if let Some(pos) = cookie_str.find(';') {
                cookies.push(cookie_str[..pos].to_string());
            } else {
                cookies.push(cookie_str.to_string());
            }
        }
    }

    let final_url = res1.url().as_str().to_string();

    // If we've been redirected to a direct link on googleusercontent.com, we are done!
    if final_url.contains("googleusercontent.com") {
        return Ok((final_url, cookies));
    }

    // Otherwise, check if we received the warning page HTML
    let html = res1.text().await.map_err(|e| format!("Failed to read response 1 body: {}", e))?;

    // Try to extract confirm token
    let confirm_token = if let Some(token) = extract_confirm_token_from_cookies(&cookies) {
        Some(token)
    } else {
        extract_confirm_token_from_html(&html)
    };

    let Some(token) = confirm_token else {
        // If we can't find a token, we fallback to the original URL or final_url
        return Ok((final_url, cookies));
    };

    // Request 2: Follow the confirm link to get the final redirected direct URL
    let confirm_url = format!(
        "https://drive.google.com/uc?export=download&confirm={}&id={}",
        token, file_id
    );

    let mut req2 = client.get(&confirm_url);
    if !cookies.is_empty() {
        req2 = req2.header(reqwest::header::COOKIE, cookies.join("; "));
    }
    let res2 = req2.send().await.map_err(|e| format!("Request 2 failed: {}", e))?;

    // Capture cookies set by Request 2
    for set_cookie in res2.headers().get_all(reqwest::header::SET_COOKIE) {
        if let Ok(cookie_str) = set_cookie.to_str() {
            if let Some(pos) = cookie_str.find(';') {
                cookies.push(cookie_str[..pos].to_string());
            } else {
                cookies.push(cookie_str.to_string());
            }
        }
    }

    let direct_url = res2.url().as_str().to_string();
    Ok((direct_url, cookies))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_google_drive_file_id() {
        assert_eq!(
            parse_google_drive_file_id("https://drive.google.com/file/d/1aBcDeFgHiJk/view?usp=sharing"),
            Some("1aBcDeFgHiJk".to_string())
        );
        assert_eq!(
            parse_google_drive_file_id("https://drive.google.com/uc?export=download&id=2xYz-123_abc"),
            Some("2xYz-123_abc".to_string())
        );
        assert_eq!(
            parse_google_drive_file_id("http://drive.google.com/open?id=test_id"),
            Some("test_id".to_string())
        );
        assert_eq!(
            parse_google_drive_file_id("https://example.com/file.zip"),
            None
        );
    }

    #[test]
    fn test_extract_confirm_token_from_cookies() {
        let cookies = vec![
            "session=abc".to_string(),
            "download_warning_123=TOKEN_VAL".to_string(),
        ];
        assert_eq!(
            extract_confirm_token_from_cookies(&cookies),
            Some("TOKEN_VAL".to_string())
        );

        let no_warn = vec!["session=abc".to_string()];
        assert_eq!(extract_confirm_token_from_cookies(&no_warn), None);
    }

    #[test]
    fn test_extract_confirm_token_from_html() {
        let html = r#"<a href="/uc?export=download&amp;confirm=TOKEN_FROM_HTML&amp;id=123">Download anyway</a>"#;
        assert_eq!(
            extract_confirm_token_from_html(html),
            Some("TOKEN_FROM_HTML".to_string())
        );

        let no_token = "<html><body>No token here</body></html>";
        assert_eq!(extract_confirm_token_from_html(no_token), None);
    }
}
