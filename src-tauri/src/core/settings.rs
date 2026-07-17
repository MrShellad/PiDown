use serde::{Deserialize, Serialize};
use std::path::Path;

pub const APP_SETTINGS_FILE_NAME: &str = "settings.json";
pub const APP_SETTINGS_VERSION: u32 = 1;
pub const LEGACY_APP_SETTINGS_KEY: &str = "app_settings_v1";
pub const DEFAULT_TASK_THREAD_COUNT: u32 = 16;
pub const MAX_TASK_THREAD_COUNT: u32 = 16;
pub const DEFAULT_MAX_DOWNLOAD_RETRIES: u32 = 10;
pub const MAX_DOWNLOAD_RETRIES: u32 = 50;

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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DownloadBackend {
    Gosh,
    Aria2,
}

impl Default for DownloadBackend {
    fn default() -> Self {
        Self::Aria2
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
    pub play_sound_on_complete: bool,
    pub sound_effect_id: String,
    pub auto_remove_on_file_deleted: bool,
    pub backend: DownloadBackend,
    pub auto_focus_window_on_download: bool,
    pub aria2_rpc_url: String,
    pub aria2_rpc_secret: String,
    pub aria2_port: u16,
    pub aria2_auto_update: bool,
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
            play_sound_on_complete: true,
            sound_effect_id: "success".to_string(),
            auto_remove_on_file_deleted: false,
            backend: DownloadBackend::Aria2,
            auto_focus_window_on_download: true,
            aria2_rpc_url: "http://localhost:6800/jsonrpc".to_string(),
            aria2_rpc_secret: uuid::Uuid::new_v4().to_string(),
            aria2_port: 6800,
            aria2_auto_update: true,
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
    pub proxy_url: Option<String>,
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
            proxy_url: None,
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

        self.proxy_url = self.proxy_url
            .as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct InterfaceSettings {
    pub close_action: CloseAction,
    pub close_action_prompted: bool,
    pub minimize_on_close_with_tasks: bool,
    pub float_display_mode: FloatDisplayMode,
    pub background_id: Option<i64>,
    pub background_blur: u32,
    pub background_mask_color: String,
    pub background_mask_opacity: u32,
    pub background_opacity: u32,
    pub hide_border_and_bg: bool,
    pub disable_window_shadow: bool,
    pub theme: String,
    pub color_mode: String,
    pub font_id: String,
    pub enable_notifications: bool,
    pub language: String,
    pub datetime_format: String,
    pub auto_start_on_boot: bool,
    pub show_extension_guide: bool,
    #[serde(default)]
    pub task_table: Option<String>,
}

impl Default for InterfaceSettings {
    fn default() -> Self {
        Self {
            close_action: CloseAction::Minimize,
            close_action_prompted: false,
            minimize_on_close_with_tasks: false,
            float_display_mode: FloatDisplayMode::Always,
            background_id: None,
            background_blur: 0,
            background_mask_color: "#000000".to_string(),
            background_mask_opacity: 0,
            background_opacity: 100,
            hide_border_and_bg: false,
            disable_window_shadow: false,
            theme: "modern".to_string(),
            color_mode: "dark".to_string(),
            font_id: "builtin:geist".to_string(),
            enable_notifications: true,
            language: "auto".to_string(),
            datetime_format: "YYYY-MM-DD HH:mm:ss".to_string(),
            auto_start_on_boot: false,
            show_extension_guide: true,
            task_table: None,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct PlayerSettings {
    pub buffer_time_s: u64,
    pub auto_play: bool,
    pub muted: bool,
    pub default_volume: f64,
}

impl Default for PlayerSettings {
    fn default() -> Self {
        Self {
            buffer_time_s: 60,
            auto_play: true,
            muted: false,
            default_volume: 1.0,
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
    pub player: PlayerSettings,
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

        if self.download.aria2_rpc_url.trim().is_empty() {
            self.download.aria2_rpc_url = "http://localhost:6800/jsonrpc".to_string();
        }
        if self.download.aria2_rpc_secret.trim().is_empty() {
            self.download.aria2_rpc_secret = uuid::Uuid::new_v4().to_string();
        }
        if self.download.aria2_port == 0 {
            self.download.aria2_port = 6800;
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

        // Normalize PlayerSettings
        if self.player.default_volume < 0.0 {
            self.player.default_volume = 0.0;
        } else if self.player.default_volume > 1.0 {
            self.player.default_volume = 1.0;
        }
        if self.player.buffer_time_s < 5 {
            self.player.buffer_time_s = 5;
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
        assert_eq!(document.settings.download.auto_remove_on_file_deleted, false);
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
