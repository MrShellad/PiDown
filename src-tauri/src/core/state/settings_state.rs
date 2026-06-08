use crate::core::settings::{AppSettings, CloseAction, APP_SETTINGS_KEY};
use crate::download::DownloadManager;

impl super::AppState {
    pub(super) fn persist_settings(&self) -> Result<(), String> {
        let settings = self.settings.read().unwrap().clone();
        let encoded = serde_json::to_string(&settings).map_err(|e| e.to_string())?;
        self.db
            .set_setting(APP_SETTINGS_KEY, &encoded)
            .map_err(|e| e.to_string())?;
        self.db
            .set_setting("default_save_dir", &settings.download.default_save_dir)
            .map_err(|e| e.to_string())
    }

    pub(super) fn ensure_default_save_dir(&self) -> Result<(), String> {
        let settings = self.settings.read().unwrap();
        std::fs::create_dir_all(&settings.download.default_save_dir).map_err(|e| e.to_string())
    }

    pub(super) fn apply_transfer_settings(&self) -> Result<(), String> {
        let settings = self.settings.read().unwrap().clone();
        let manager = DownloadManager::new(self.engine.inner().clone());

        manager.set_concurrency_limit(settings.transfer.max_concurrent_downloads as usize)?;
        manager.set_speed_limits(
            settings
                .transfer
                .download_speed_limit_kib
                .map(|value| value.saturating_mul(1024)),
            settings
                .transfer
                .upload_speed_limit_kib
                .map(|value| value.saturating_mul(1024)),
        )?;

        Ok(())
    }

    pub fn get_settings(&self) -> AppSettings {
        self.settings.read().unwrap().clone()
    }

    pub fn update_settings(&self, mut settings: AppSettings) -> Result<AppSettings, String> {
        let current = self.settings.read().unwrap().clone();

        settings.download.default_save_dir = if settings.download.default_save_dir.trim().is_empty()
        {
            current.download.default_save_dir
        } else {
            settings.download.default_save_dir.trim().to_string()
        };

        if settings.transfer.max_concurrent_downloads == 0 {
            settings.transfer.max_concurrent_downloads = 1;
        }

        std::fs::create_dir_all(&settings.download.default_save_dir).map_err(|e| e.to_string())?;

        {
            let mut guard = self.settings.write().unwrap();
            *guard = settings.clone();
        }

        self.persist_settings()?;
        self.apply_transfer_settings()?;

        Ok(settings)
    }

    pub fn should_close_to_float(&self) -> bool {
        matches!(
            self.settings.read().unwrap().interface.close_action,
            CloseAction::Float
        )
    }
}
