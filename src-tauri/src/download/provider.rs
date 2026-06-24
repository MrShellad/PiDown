use crate::core::models::DbTask;
use crate::core::state::TaskCreateOptions;

#[derive(Debug, Clone)]
pub struct DownloadProgressInfo {
    pub completed_size: u64,
    pub total_size: u64,
    pub download_speed: u64,
    pub upload_speed: u64,
    pub connections: u32,
    pub status: String, // "Pending", "Downloading", "Seeding", "Paused", "Completed", "Failed"
}

#[async_trait::async_trait]
#[allow(dead_code)]
pub trait DownloadProvider: Send + Sync {
    fn protocol(&self) -> &'static str;
    async fn create_task(&self, task: &DbTask, options: TaskCreateOptions, settings: &crate::core::settings::AppSettings) -> Result<String, String>;
    async fn pause_task(&self, gid: &str) -> Result<(), String>;
    async fn resume_task(&self, gid: &str) -> Result<(), String>;
    async fn cancel_task(&self, gid: &str, delete_files: bool) -> Result<(), String>;
    async fn query_status(&self, gid: &str) -> Result<Option<DownloadProgressInfo>, String>;
}
