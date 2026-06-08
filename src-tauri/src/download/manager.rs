use gosh_dl::{DownloadEngine, EngineConfig};
use std::sync::Arc;

#[allow(dead_code)]
pub struct DownloadManager {
    engine: Arc<DownloadEngine>,
}

#[allow(dead_code)]
impl DownloadManager {
    pub fn new(engine: Arc<DownloadEngine>) -> Self {
        Self { engine }
    }

    /// Set the maximum number of concurrent downloads
    pub fn set_concurrency_limit(&self, max: usize) -> Result<(), String> {
        let mut config = self.engine.get_config();
        config.max_concurrent_downloads = max;
        self.engine.set_config(config).map_err(|e| e.to_string())
    }

    /// Set global download and upload speed limits in bytes per second
    pub fn set_speed_limits(
        &self,
        download_bps: Option<u64>,
        upload_bps: Option<u64>,
    ) -> Result<(), String> {
        let mut config = self.engine.get_config();
        config.global_download_limit = download_bps;
        config.global_upload_limit = upload_bps;
        self.engine.set_config(config).map_err(|e| e.to_string())
    }

    /// Get the current engine configuration
    pub fn get_config(&self) -> EngineConfig {
        self.engine.get_config()
    }
}
