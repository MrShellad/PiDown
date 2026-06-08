mod classification;
mod file_actions;
mod settings_state;
mod task_format;
mod task_service;

use crate::core::settings::{AppSettings, APP_SETTINGS_KEY};
use crate::core::store::DbStore;
use crate::download::EngineWrapper;
use std::path::Path;
use std::sync::{Arc, RwLock};

pub struct AppState {
    pub engine: EngineWrapper,
    pub db: DbStore,
    settings: RwLock<AppSettings>,
}

impl AppState {
    pub async fn new(app_data_dir: &Path, default_save_dir: &Path) -> Result<Arc<Self>, String> {
        let db_path = app_data_dir.join("pidown.db");
        let db = DbStore::new(&db_path).map_err(|e| format!("Database error: {e}"))?;
        let engine = EngineWrapper::new(Some(app_data_dir)).await?;

        let mut settings = match db.get_setting(APP_SETTINGS_KEY) {
            Ok(Some(raw)) => serde_json::from_str::<AppSettings>(&raw).unwrap_or_default(),
            Ok(None) | Err(_) => AppSettings::default(),
        };
        settings.normalize(default_save_dir);

        let state = Arc::new(Self {
            engine,
            db,
            settings: RwLock::new(settings),
        });

        state.persist_settings()?;
        state.apply_transfer_settings()?;
        state.ensure_default_save_dir()?;
        state.sync_on_startup();

        Ok(state)
    }
}
