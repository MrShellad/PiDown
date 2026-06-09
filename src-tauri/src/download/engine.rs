use gosh_dl::http::probe_server;
use gosh_dl::{
    ConnectionPool, DownloadEngine, DownloadEvent, DownloadId, DownloadOptions, DownloadStatus,
    EngineConfig, GlobalStats,
};
use std::path::Path;
use std::sync::Arc;
use tokio::sync::broadcast;

#[derive(Debug, Clone)]
pub struct DownloadInspection {
    pub filename: Option<String>,
    pub total_size: Option<u64>,
}

pub struct EngineWrapper {
    inner: Arc<DownloadEngine>,
    probe_pool: ConnectionPool,
    user_agent: String,
}

#[derive(Debug, Clone)]
pub struct HttpTaskOptions {
    pub max_connections: usize,
    pub max_download_speed: Option<u64>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    pub cookies: Vec<String>,
}

#[derive(Debug, Clone, Copy)]
pub struct EngineHttpConfig {
    pub max_connections_per_download: usize,
    pub max_retries: usize,
    pub accept_invalid_certs: bool,
}

impl EngineWrapper {
    /// Initialize the wrapper. If `db_dir` is provided, use it for gosh-dl internal SQLite storage.
    pub async fn new(
        db_dir: Option<&Path>,
        http_config: Option<EngineHttpConfig>,
    ) -> Result<Self, String> {
        let mut config = EngineConfig::default();
        if let Some(dir) = db_dir {
            let gosh_db = dir.join("gosh_dl.db");
            config = config.database_path(gosh_db);
        }
        if let Some(http_config) = http_config {
            config.max_connections_per_download = http_config.max_connections_per_download;
            config.http.max_retries = http_config.max_retries;
            config.http.accept_invalid_certs = http_config.accept_invalid_certs;
        }
        let probe_pool = ConnectionPool::new(&config.http)
            .map_err(|e| format!("Failed to initialize gosh-dl HTTP probe: {}", e))?;
        let user_agent = config.user_agent.clone();
        let engine = DownloadEngine::new(config)
            .await
            .map_err(|e| format!("Failed to initialize gosh-dl: {}", e))?;
        Ok(Self {
            inner: engine,
            probe_pool,
            user_agent,
        })
    }

    /// Access the underlying engine
    #[allow(dead_code)]
    pub fn inner(&self) -> &Arc<DownloadEngine> {
        &self.inner
    }

    /// Inspect HTTP metadata through gosh-dl's existing server probe.
    pub async fn inspect_http(&self, url: &str) -> Result<DownloadInspection, String> {
        let capabilities = probe_server(self.probe_pool.client(), url, &self.user_agent)
            .await
            .map_err(|e| format!("Failed to inspect HTTP task: {}", e))?;

        Ok(DownloadInspection {
            filename: capabilities.suggested_filename,
            total_size: capabilities.content_length,
        })
    }

    /// Add an HTTP/HTTPS download task
    pub async fn add_http(
        &self,
        url: &str,
        save_dir: &Path,
        filename: Option<String>,
        task_options: HttpTaskOptions,
    ) -> Result<DownloadId, String> {
        let mut opts = DownloadOptions::default();
        opts.save_dir = Some(save_dir.to_path_buf());
        opts.filename = filename;
        opts.max_connections = Some(task_options.max_connections);
        opts.max_download_speed = task_options.max_download_speed;
        opts.user_agent = task_options.user_agent;
        opts.referer = task_options.referer;
        opts.cookies = (!task_options.cookies.is_empty()).then_some(task_options.cookies);

        self.inner
            .add_http(url, opts)
            .await
            .map_err(|e| format!("Failed to add HTTP task: {}", e))
    }

    /// Add a Magnet link download task (if BitTorrent is supported/compiled)
    pub async fn add_magnet(
        &self,
        magnet_uri: &str,
        save_dir: &Path,
    ) -> Result<DownloadId, String> {
        let mut opts = DownloadOptions::default();
        opts.save_dir = Some(save_dir.to_path_buf());

        // gosh-dl has add_magnet
        self.inner
            .add_magnet(magnet_uri, opts)
            .await
            .map_err(|e| format!("Failed to add magnet task: {}", e))
    }

    /// Pause an active task
    pub async fn pause(&self, id: DownloadId) -> Result<(), String> {
        self.inner
            .pause(id)
            .await
            .map_err(|e| format!("Failed to pause task: {}", e))
    }

    /// Resume a paused task
    pub async fn resume(&self, id: DownloadId) -> Result<(), String> {
        self.inner
            .resume(id)
            .await
            .map_err(|e| format!("Failed to resume task: {}", e))
    }

    /// Cancel a task and optionally delete downloaded files
    pub async fn cancel(&self, id: DownloadId, delete_files: bool) -> Result<(), String> {
        self.inner
            .cancel(id, delete_files)
            .await
            .map_err(|e| format!("Failed to cancel task: {}", e))
    }

    /// Get status of a single task
    pub fn status(&self, id: DownloadId) -> Option<DownloadStatus> {
        self.inner.status(id)
    }

    /// List all tasks currently in the engine
    #[allow(dead_code)]
    pub fn list(&self) -> Vec<DownloadStatus> {
        self.inner.list()
    }

    /// Get active tasks currently running
    pub fn active(&self) -> Vec<DownloadStatus> {
        self.inner.active()
    }

    /// Get global engine statistics (total speed, counts, etc.)
    #[allow(dead_code)]
    pub fn global_stats(&self) -> GlobalStats {
        self.inner.global_stats()
    }

    /// Subscribe to engine events (state changes, progress, etc.)
    pub fn subscribe(&self) -> broadcast::Receiver<DownloadEvent> {
        self.inner.subscribe()
    }
}
