mod classification;
pub(crate) mod file_actions;
mod settings_state;
pub(crate) mod task_format;
mod task_service;

pub use task_service::TaskCreateOptions;

use crate::core::models::DbTask;
use crate::core::settings::{
    AppSettings, AppSettingsDocument, APP_SETTINGS_FILE_NAME, LEGACY_APP_SETTINGS_KEY,
};
use crate::core::store::DbStore;
use crate::download::{EngineHttpConfig, EngineWrapper};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Instant;
use gosh_dl::DownloadId;

pub struct AppState {
    pub engine: Arc<EngineWrapper>,
    pub db: Arc<dyn crate::core::store::repository::TaskRepository>,
    settings: RwLock<AppSettings>,
    settings_file: PathBuf,
    settings_created_at: RwLock<i64>,
    pub(crate) gid_cache: Mutex<HashMap<DownloadId, String>>,
    pub(crate) progress_throttle: Mutex<HashMap<String, (u64, Instant)>>,
    pub(crate) task_cache: RwLock<HashMap<String, DbTask>>,
    pub(crate) config_mutex: tokio::sync::Mutex<()>,
    pub(crate) hls_cancel_tokens: Mutex<HashMap<String, tokio::sync::watch::Sender<bool>>>,
    pub(crate) hls_speeds: Mutex<HashMap<String, u64>>,
    pub(crate) app_handle: Mutex<Option<tauri::AppHandle>>,
    pub(crate) webdav_status_cache: Mutex<HashMap<String, (String, String, String, Option<f64>)>>,
    pub(crate) webdav_decrypt_cache: Mutex<HashMap<String, (String, [u8; 32])>>,
    pub(crate) video_cache: Mutex<Option<VideoCache>>,
    pub(crate) http_client: reqwest::Client,
    pub(crate) providers: HashMap<String, Arc<dyn crate::download::provider::DownloadProvider>>,
    pub aria2_engine: Arc<crate::download::aria2_engine::Aria2Engine>,
    pub ffmpeg_engine: Arc<crate::download::ffmpeg_engine::FfmpegEngine>,
    pub(crate) pending_pairings: Mutex<HashMap<String, tokio::sync::oneshot::Sender<bool>>>,
}

impl AppState {
    pub async fn new(app_data_dir: &Path, default_save_dir: &Path) -> Result<Arc<Self>, String> {
        let db_path = app_data_dir.join("pidown.db");
        let db_concrete = DbStore::new(&db_path).map_err(|e| format!("Database error: {e}"))?;
        let settings_file = app_data_dir.join(APP_SETTINGS_FILE_NAME);

        let mut settings_doc = match std::fs::read_to_string(&settings_file) {
            Ok(raw) => serde_json::from_str::<AppSettingsDocument>(&raw)
                .unwrap_or_else(|_| AppSettingsDocument::new(load_legacy_settings(&db_concrete))),
            Err(_) => AppSettingsDocument::new(load_legacy_settings(&db_concrete)),
        };
        settings_doc.normalize(default_save_dir);
        let settings = settings_doc.settings.clone();
        let engine_http_config = EngineHttpConfig {
            max_connections_per_download: settings.transfer.task_thread_count as usize,
            max_retries: settings.transfer.max_download_retries as usize,
            accept_invalid_certs: settings.transfer.ignore_ssl_certificate,
            proxy_url: settings.transfer.proxy_url.clone(),
            user_agent: settings.download.global_user_agent.clone(),
        };
        let engine = Arc::new(EngineWrapper::new(Some(app_data_dir), Some(engine_http_config)).await?);
        let http_client = reqwest::Client::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

        // Load tasks from database into cache
        let db_tasks = db_concrete.get_all_tasks().map_err(|e| e.to_string())?;
        let mut cache = HashMap::new();
        for task in db_tasks {
            cache.insert(task.id.clone(), task);
        }

        let settings_created_at = settings_doc.created_at;
        let db = Arc::new(db_concrete) as Arc<dyn crate::core::store::repository::TaskRepository>;

        let aria2_engine = Arc::new(crate::download::aria2_engine::Aria2Engine::new(app_data_dir));
        let ffmpeg_engine = Arc::new(crate::download::ffmpeg_engine::FfmpegEngine::new(app_data_dir));

        let state = Arc::new_cyclic(|me| {
            let gosh_provider = Arc::new(crate::download::gosh_provider::GoshDownloadProvider::new(engine.clone()))
                as Arc<dyn crate::download::provider::DownloadProvider>;
            let hls_provider = Arc::new(crate::download::hls_provider::HlsDownloadProvider::new(me.clone()))
                as Arc<dyn crate::download::provider::DownloadProvider>;
            let aria2_provider = Arc::new(crate::download::aria2_provider::Aria2DownloadProvider::new(me.clone()))
                as Arc<dyn crate::download::provider::DownloadProvider>;

            let mut providers = HashMap::new();
            providers.insert("gosh".to_string(), gosh_provider);
            providers.insert("hls".to_string(), hls_provider);
            providers.insert("aria2".to_string(), aria2_provider);

            Self {
                engine,
                db,
                settings: RwLock::new(settings),
                settings_file: settings_file.to_path_buf(),
                settings_created_at: RwLock::new(settings_created_at),
                gid_cache: Mutex::new(HashMap::new()),
                progress_throttle: Mutex::new(HashMap::new()),
                task_cache: RwLock::new(cache),
                config_mutex: tokio::sync::Mutex::new(()),
                hls_cancel_tokens: Mutex::new(HashMap::new()),
                hls_speeds: Mutex::new(HashMap::new()),
                app_handle: Mutex::new(None),
                webdav_status_cache: Mutex::new(HashMap::new()),
                webdav_decrypt_cache: Mutex::new(HashMap::new()),
                video_cache: Mutex::new(None),
                http_client,
                providers,
                aria2_engine,
                ffmpeg_engine,
                pending_pairings: Mutex::new(HashMap::new()),
            }
        });

        state.persist_settings()?;
        state.apply_transfer_settings()?;
        state.ensure_default_save_dir()?;
        state.ensure_default_category_configs(None)?;
        state.sync_on_startup();

        // Start aria2c daemon if selected as backend (auto-download if missing)
        {
            let current_settings = state.get_settings();
            if current_settings.download.backend == crate::core::settings::DownloadBackend::Aria2 {
                let rpc_port = current_settings.download.aria2_port;
                let rpc_secret = current_settings.download.aria2_rpc_secret.clone();
                let aria2_engine_clone = state.aria2_engine.clone();
                let auto_update = current_settings.download.aria2_auto_update;

                tauri::async_runtime::spawn(async move {
                    if aria2_engine_clone.check_install() {
                        if let Err(e) = aria2_engine_clone.start(rpc_port, &rpc_secret).await {
                            log::error!("Failed to auto-start aria2 daemon: {}", e);
                        }
                    } else if auto_update {
                        log::info!("Aria2 binary not found, auto-downloading engine...");
                        if let Ok(_) = aria2_engine_clone.download_and_install().await {
                            let _ = aria2_engine_clone.start(rpc_port, &rpc_secret).await;
                        }
                    } else {
                        log::warn!("Aria2 engine is selected as backend but not installed.");
                    }
                });
            }
        }

        // Spawn periodic DB checkpoint task
        let state_clone = Arc::clone(&state);
        tauri::async_runtime::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
            loop {
                interval.tick().await;
                let tasks: Vec<DbTask> = {
                    let mut cache = state_clone.task_cache.write().unwrap();
                    let mut dirty_tasks = Vec::new();
                    for task in cache.values_mut() {
                        if task.dirty {
                            task.dirty = false;
                            dirty_tasks.push(task.clone());
                        }
                    }
                    dirty_tasks
                };

                if !tasks.is_empty() {
                    let state_inner = Arc::clone(&state_clone);
                    let res = tokio::task::spawn_blocking(move || {
                        state_inner.db.save_tasks_checkpoint(&tasks)
                    })
                    .await;
                    if let Err(e) = res {
                        log::error!("Database checkpoint task panicked: {:?}", e);
                    } else if let Ok(Err(e)) = res {
                        log::error!("Database checkpoint failed: {:?}", e);
                    }
                }
            }
        });

        Ok(state)
    }

    pub fn app_data_dir(&self) -> PathBuf {
        self.settings_file.parent().unwrap().to_path_buf()
    }
}

fn load_legacy_settings(db: &dyn crate::core::store::repository::TaskRepository) -> AppSettings {
    match db.get_setting(LEGACY_APP_SETTINGS_KEY) {
        Ok(Some(raw)) => serde_json::from_str::<AppSettings>(&raw).unwrap_or_default(),
        Ok(None) | Err(_) => AppSettings::default(),
    }
}

pub struct VideoCacheBlock {
    pub start: u64,
    pub data: Vec<u8>,
}

pub struct VideoCache {
    pub device_id: String,
    pub path: String,
    pub blocks: Vec<VideoCacheBlock>,
    pub total_bytes: usize,
    pub total_size: Option<u64>,
    pub content_type: Option<String>,
    pub duration: Option<f64>,
}

impl VideoCache {
    pub fn get_range(&self, start: u64, end: u64) -> Option<Vec<u8>> {
        for block in &self.blocks {
            let block_end = block.start + block.data.len() as u64;
            if start >= block.start && end <= block_end {
                let offset = (start - block.start) as usize;
                let length = (end - start + 1) as usize;
                return Some(block.data[offset..offset + length].to_vec());
            }
        }
        None
    }

    pub fn insert_block(&mut self, start: u64, data: Vec<u8>, max_bytes: usize) {
        if let Some(pos) = self.blocks.iter().position(|b| b.start == start) {
            self.total_bytes -= self.blocks[pos].data.len();
            self.blocks.remove(pos);
        }

        let len = data.len();
        self.blocks.push(VideoCacheBlock { start, data });
        self.total_bytes += len;

        while self.total_bytes > max_bytes && !self.blocks.is_empty() {
            let removed = self.blocks.remove(0);
            self.total_bytes -= removed.data.len();
        }
    }
}

impl Drop for AppState {
    fn drop(&mut self) {
        let aria2_engine = self.aria2_engine.clone();
        tauri::async_runtime::block_on(async move {
            aria2_engine.stop().await;
        });
    }
}
