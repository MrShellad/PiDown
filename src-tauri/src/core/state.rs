mod classification;
mod file_actions;
mod settings_state;
pub(crate) mod task_format;
mod task_service;

use crate::core::settings::{
    AppSettings, AppSettingsDocument, APP_SETTINGS_FILE_NAME, LEGACY_APP_SETTINGS_KEY,
};
use crate::core::store::DbStore;
use crate::download::{EngineHttpConfig, EngineWrapper};
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

pub struct AppState {
    pub engine: EngineWrapper,
    pub db: DbStore,
    settings: RwLock<AppSettings>,
    settings_file: PathBuf,
    settings_created_at: RwLock<i64>,
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
        };
        let engine = EngineWrapper::new(Some(app_data_dir), Some(engine_http_config)).await?;

        let state = Arc::new(Self {
            engine,
            db,
            settings: RwLock::new(settings),
            settings_file,
            settings_created_at: RwLock::new(settings_doc.created_at),
        });

        state.persist_settings()?;
        state.apply_transfer_settings()?;
        state.ensure_default_save_dir()?;
        state.sync_on_startup();

        Ok(state)
    }
}

fn load_legacy_settings(db: &DbStore) -> AppSettings {
    match db.get_setting(LEGACY_APP_SETTINGS_KEY) {
        Ok(Some(raw)) => serde_json::from_str::<AppSettings>(&raw).unwrap_or_default(),
        Ok(None) | Err(_) => AppSettings::default(),
    }
}
