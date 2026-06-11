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
    #[serde(alias = "float")]
    Minimize,
    Tray,
    Exit,
}

impl Default for CloseAction {
    fn default() -> Self {
        Self::Minimize
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FloatDisplayMode {
    Always,
    OnlyDownloading,
    Hidden,
}

impl Default for FloatDisplayMode {
    fn default() -> Self {
        Self::Always
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
    pub global_user_agent: String,
    pub browser_extension_integration_enabled: bool,
    pub browser_extension_port: u16,
    pub browser_extension_token: String,
}

impl Default for DownloadSettings {
    fn default() -> Self {
        Self {
            default_save_dir: String::new(),
            auto_start_downloads: true,
            auto_categorize: true,
            global_user_agent: String::new(),
            browser_extension_integration_enabled: true,
            browser_extension_port: 18388,
            browser_extension_token: uuid::Uuid::new_v4().to_string(),
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
    pub minimize_on_close_with_tasks: bool,
    pub float_display_mode: FloatDisplayMode,
    pub background_id: Option<i64>,
    pub background_blur: u32,
    pub background_mask_color: String,
    pub background_mask_opacity: u32,
    pub background_opacity: u32,
    pub hide_border_and_bg: bool,
    pub disable_window_shadow: bool,
}

impl Default for InterfaceSettings {
    fn default() -> Self {
        Self {
            close_action: CloseAction::Minimize,
            minimize_on_close_with_tasks: false,
            float_display_mode: FloatDisplayMode::Always,
            background_id: None,
            background_blur: 0,
            background_mask_color: "#000000".to_string(),
            background_mask_opacity: 0,
            background_opacity: 100,
            hide_border_and_bg: false,
            disable_window_shadow: false,
        }
    }
}




#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct BtSettings {
    pub enable_dht: bool,
    pub enable_pex: bool,
    pub enable_lpd: bool,
    pub listen_port_start: u16,
    pub listen_port_end: u16,
    pub encryption_policy: String, // preferred, allowed, required, disabled
    pub allocation_mode: String,   // none, sparse, full
    pub seed_ratio_threshold: f64,
    pub peer_loop_interval_ms: u64,
    pub tracker_subscribe_url: String,
    pub tracker_list: String,
}

impl Default for BtSettings {
    fn default() -> Self {
        Self {
            enable_dht: true,
            enable_pex: true,
            enable_lpd: true,
            listen_port_start: 6881,
            listen_port_end: 6889,
            encryption_policy: "preferred".to_string(),
            allocation_mode: "none".to_string(),
            seed_ratio_threshold: 1.0,
            peer_loop_interval_ms: 100,
            tracker_subscribe_url: "".to_string(),
            tracker_list: "".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct AppSettings {
    pub download: DownloadSettings,
    pub transfer: TransferSettings,
    pub interface: InterfaceSettings,
    pub bt: BtSettings,
}

impl AppSettings {
    pub fn normalize(&mut self, fallback_save_dir: &Path) {
        if self.download.default_save_dir.trim().is_empty() {
            self.download.default_save_dir = fallback_save_dir.to_string_lossy().to_string();
        }

        self.download.global_user_agent = self.download.global_user_agent.trim().to_string();
        
        if self.download.browser_extension_port == 0 {
            self.download.browser_extension_port = 18388;
        }
        if self.download.browser_extension_token.trim().is_empty() {
            self.download.browser_extension_token = uuid::Uuid::new_v4().to_string();
        }

        self.transfer.normalize();

        if self.bt.listen_port_start == 0 {
            self.bt.listen_port_start = 6881;
        }
        if self.bt.listen_port_end == 0 {
            self.bt.listen_port_end = 6889;
        }
        if self.bt.listen_port_end < self.bt.listen_port_start {
            std::mem::swap(&mut self.bt.listen_port_start, &mut self.bt.listen_port_end);
        }
        if self.bt.seed_ratio_threshold < 0.0 {
            self.bt.seed_ratio_threshold = 0.0;
        }
        if self.bt.peer_loop_interval_ms == 0 {
            self.bt.peer_loop_interval_ms = 100;
        }
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
                download: DownloadSettings {
                    global_user_agent: "  Mozilla/5.0  ".to_string(),
                    ..DownloadSettings::default()
                },
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
        assert_eq!(
            document.settings.download.global_user_agent,
            "Mozilla/5.0".to_string()
        );
    }
}
