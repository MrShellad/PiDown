use serde::{Deserialize, Serialize};
use std::path::Path;

pub const APP_SETTINGS_KEY: &str = "app_settings_v1";

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
    pub download_speed_limit_kib: Option<u64>,
    pub upload_speed_limit_kib: Option<u64>,
}

impl Default for TransferSettings {
    fn default() -> Self {
        Self {
            max_concurrent_downloads: 3,
            download_speed_limit_kib: None,
            upload_speed_limit_kib: None,
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

        if self.transfer.max_concurrent_downloads == 0 {
            self.transfer.max_concurrent_downloads = 1;
        }
    }
}
