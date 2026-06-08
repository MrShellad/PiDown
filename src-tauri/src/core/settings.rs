use serde::{Deserialize, Serialize};
use std::path::Path;

pub const APP_SETTINGS_FILE_NAME: &str = "settings.json";
pub const APP_SETTINGS_VERSION: u32 = 1;
pub const LEGACY_APP_SETTINGS_KEY: &str = "app_settings_v1";
pub const DEFAULT_TASK_THREAD_COUNT: u32 = 16;
pub const MAX_TASK_THREAD_COUNT: u32 = 16;
pub const DEFAULT_MAX_DOWNLOAD_RETRIES: u32 = 5;
pub const MAX_DOWNLOAD_RETRIES: u32 = 20;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CloseAction {
    Float,
    Exit,
}

impl Default for CloseAction {
    fn default() -> Self {
        Self::Float
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SpeedDisplayUnit {
    Auto,
    Kib,
    Mib,
    Mb,
}

impl Default for SpeedDisplayUnit {
    fn default() -> Self {
        Self::Auto
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct DownloadSettings {
    pub default_save_dir: String,
    pub auto_start_downloads: bool,
    pub auto_categorize: bool,
}

impl Default for DownloadSettings {
    fn default() -> Self {
        Self {
            default_save_dir: String::new(),
            auto_start_downloads: true,
            auto_categorize: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct TransferSettings {
    pub max_concurrent_downloads: u32,
    pub task_thread_count: u32,
    pub max_download_retries: u32,
    pub ignore_ssl_certificate: bool,
    pub download_speed_limit_kib: Option<u64>,
    pub upload_speed_limit_kib: Option<u64>,
    pub speed_display_unit: SpeedDisplayUnit,
    #[serde(skip_serializing)]
    pub speed_limit_unit: Option<SpeedDisplayUnit>,
}

impl Default for TransferSettings {
    fn default() -> Self {
        Self {
            max_concurrent_downloads: 3,
            task_thread_count: DEFAULT_TASK_THREAD_COUNT,
            max_download_retries: DEFAULT_MAX_DOWNLOAD_RETRIES,
            ignore_ssl_certificate: false,
            download_speed_limit_kib: None,
            upload_speed_limit_kib: None,
            speed_display_unit: SpeedDisplayUnit::Auto,
            speed_limit_unit: None,
        }
    }
}

impl TransferSettings {
    pub fn normalize(&mut self) {
        if self.max_concurrent_downloads == 0 {
            self.max_concurrent_downloads = 1;
        }

        self.task_thread_count = self.task_thread_count.clamp(1, MAX_TASK_THREAD_COUNT);
        self.max_download_retries = self.max_download_retries.min(MAX_DOWNLOAD_RETRIES);

        if let Some(legacy_unit) = self.speed_limit_unit.take() {
            self.speed_display_unit = legacy_unit;
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct InterfaceSettings {
    pub close_action: CloseAction,
}

impl Default for InterfaceSettings {
    fn default() -> Self {
        Self {
            close_action: CloseAction::Float,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct AppSettings {
    pub download: DownloadSettings,
    pub transfer: TransferSettings,
    pub interface: InterfaceSettings,
}

impl AppSettings {
    pub fn normalize(&mut self, fallback_save_dir: &Path) {
        if self.download.default_save_dir.trim().is_empty() {
            self.download.default_save_dir = fallback_save_dir.to_string_lossy().to_string();
        }

        self.transfer.normalize();
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppSettingsDocument {
    pub version: u32,
    pub created_at: i64,
    pub settings: AppSettings,
}

impl Default for AppSettingsDocument {
    fn default() -> Self {
        Self::new(AppSettings::default())
    }
}

impl AppSettingsDocument {
    pub fn new(settings: AppSettings) -> Self {
        Self {
            version: APP_SETTINGS_VERSION,
            created_at: chrono::Utc::now().timestamp(),
            settings,
        }
    }

    pub fn normalize(&mut self, fallback_save_dir: &Path) {
        if self.version == 0 {
            self.version = APP_SETTINGS_VERSION;
        }

        if self.created_at <= 0 {
            self.created_at = chrono::Utc::now().timestamp();
        }

        self.settings.normalize(fallback_save_dir);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn settings_document_contains_version_created_at_and_settings() {
        let mut settings = AppSettings::default();
        settings.download.default_save_dir = "D:\\Downloads".to_string();

        let document = AppSettingsDocument::new(settings.clone());

        assert_eq!(document.version, APP_SETTINGS_VERSION);
        assert!(document.created_at > 0);
        assert_eq!(
            document.settings.download.default_save_dir,
            settings.download.default_save_dir
        );
    }

    #[test]
    fn settings_document_normalize_repairs_metadata_and_transfer_bounds() {
        let mut document = AppSettingsDocument {
            version: 0,
            created_at: 0,
            settings: AppSettings {
                transfer: TransferSettings {
                    max_concurrent_downloads: 0,
                    task_thread_count: 999,
                    max_download_retries: 999,
                    ..TransferSettings::default()
                },
                ..AppSettings::default()
            },
        };

        document.normalize(&PathBuf::from("D:\\Fallback"));

        assert_eq!(document.version, APP_SETTINGS_VERSION);
        assert!(document.created_at > 0);
        assert_eq!(document.settings.transfer.max_concurrent_downloads, 1);
        assert_eq!(
            document.settings.transfer.task_thread_count,
            MAX_TASK_THREAD_COUNT
        );
        assert_eq!(
            document.settings.transfer.max_download_retries,
            MAX_DOWNLOAD_RETRIES
        );
        assert_eq!(
            document.settings.download.default_save_dir,
            "D:\\Fallback".to_string()
        );
    }
}
