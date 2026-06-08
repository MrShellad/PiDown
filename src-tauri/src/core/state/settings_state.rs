use crate::core::settings::{AppSettings, AppSettingsDocument, CloseAction, APP_SETTINGS_VERSION};
use crate::download::DownloadManager;
use std::path::PathBuf;

impl super::AppState {
    pub(super) fn persist_settings(&self) -> Result<(), String> {
        let settings = self.settings.read().unwrap().clone();
        let created_at = *self.settings_created_at.read().unwrap();
        let document = AppSettingsDocument {
            version: APP_SETTINGS_VERSION,
            created_at,
            settings,
        };
        let encoded = serde_json::to_string_pretty(&document).map_err(|e| e.to_string())?;

        if let Some(parent) = self.settings_file.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        std::fs::write(&self.settings_file, encoded).map_err(|e| e.to_string())
    }

    pub(super) fn ensure_default_save_dir(&self) -> Result<(), String> {
        let settings = self.settings.read().unwrap();
        std::fs::create_dir_all(&settings.download.default_save_dir).map_err(|e| e.to_string())
    }

    pub(super) fn apply_transfer_settings(&self) -> Result<(), String> {
        let settings = self.settings.read().unwrap().clone();
        let manager = DownloadManager::new(self.engine.inner().clone());

        manager.set_concurrency_limit(settings.transfer.max_concurrent_downloads as usize)?;
        manager.set_http_options(
            settings.transfer.task_thread_count as usize,
            settings.transfer.max_download_retries as usize,
            settings.transfer.ignore_ssl_certificate,
        )?;
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
        let previous_default_save_dir = PathBuf::from(&current.download.default_save_dir);

        settings.download.default_save_dir = if settings.download.default_save_dir.trim().is_empty()
        {
            current.download.default_save_dir
        } else {
            settings.download.default_save_dir.trim().to_string()
        };

        settings.transfer.normalize();

        std::fs::create_dir_all(&settings.download.default_save_dir).map_err(|e| e.to_string())?;

        {
            let mut guard = self.settings.write().unwrap();
            *guard = settings.clone();
        }

        self.persist_settings()?;
        self.apply_transfer_settings()?;
        self.ensure_default_category_configs(Some(&previous_default_save_dir))?;

        Ok(settings)
    }

    pub fn should_close_to_float(&self) -> bool {
        matches!(
            self.settings.read().unwrap().interface.close_action,
            CloseAction::Float
        )
    }
}
