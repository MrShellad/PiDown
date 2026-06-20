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
    pub engine: EngineWrapper,
    pub db: DbStore,
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
}

impl AppState {
    pub async fn new(app_data_dir: &Path, default_save_dir: &Path) -> Result<Arc<Self>, String> {
        let db_path = app_data_dir.join("pidown.db");
        let db = DbStore::new(&db_path).map_err(|e| format!("Database error: {e}"))?;
        let settings_file = app_data_dir.join(APP_SETTINGS_FILE_NAME);

        let mut settings_doc = match std::fs::read_to_string(&settings_file) {
            Ok(raw) => serde_json::from_str::<AppSettingsDocument>(&raw)
                .unwrap_or_else(|_| AppSettingsDocument::new(load_legacy_settings(&db))),
            Err(_) => AppSettingsDocument::new(load_legacy_settings(&db)),
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
        let engine = EngineWrapper::new(Some(app_data_dir), Some(engine_http_config)).await?;

        // Load tasks from database into cache
        let db_tasks = db.get_all_tasks().map_err(|e| e.to_string())?;
        let mut cache = HashMap::new();
        for task in db_tasks {
            cache.insert(task.id.clone(), task);
        }

        let settings_created_at = settings_doc.created_at;

        let state = Arc::new(Self {
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
        });

        state.persist_settings()?;
        state.apply_transfer_settings()?;
        state.ensure_default_save_dir()?;
        state.ensure_default_category_configs(None)?;
        state.sync_on_startup();

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
}

fn load_legacy_settings(db: &DbStore) -> AppSettings {
    match db.get_setting(LEGACY_APP_SETTINGS_KEY) {
        Ok(Some(raw)) => serde_json::from_str::<AppSettings>(&raw).unwrap_or_default(),
        Ok(None) | Err(_) => AppSettings::default(),
    }
}
