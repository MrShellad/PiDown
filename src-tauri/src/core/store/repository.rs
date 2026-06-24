use crate::core::models::{DbTask, DbCategory, DbTag, CategoryInput, TagInput};
use crate::core::webdav::DbWebDavDevice;
use crate::core::store::backgrounds::DbBackground;

#[allow(dead_code)]
pub trait TaskRepository: Send + Sync {
    // Settings
    fn get_setting(&self, key: &str) -> Result<Option<String>, String>;
    fn set_setting(&self, key: &str, value: &str) -> Result<(), String>;

    // Tasks
    fn insert_task(&self, task: &DbTask) -> Result<(), String>;
    fn update_task_progress(&self, id: &str, completed_size: u64, total_size: u64) -> Result<(), String>;
    fn update_task_status(&self, id: &str, status: &str, completed_at: Option<i64>) -> Result<(), String>;
    fn update_task_category(&self, id: &str, category_id: Option<i64>) -> Result<(), String>;
    fn update_task_engine_id(&self, id: &str, engine_id: Option<&str>) -> Result<(), String>;
    fn delete_task(&self, id: &str) -> Result<(), String>;
    fn delete_completed_tasks(&self) -> Result<usize, String>;
    fn get_task(&self, id: &str) -> Result<Option<DbTask>, String>;
    fn get_task_by_engine_id(&self, engine_id: &str) -> Result<Option<DbTask>, String>;
    fn get_all_tasks(&self) -> Result<Vec<DbTask>, String>;
    fn save_tasks_checkpoint(&self, tasks: &[DbTask]) -> Result<(), String>;
    fn update_task_error(&self, id: &str, error_message: Option<&str>) -> Result<(), String>;
    fn update_task_url(&self, id: &str, url: &str) -> Result<(), String>;
    fn update_task_name(&self, id: &str, name: &str) -> Result<(), String>;

    // Categories
    fn get_categories(&self) -> Result<Vec<DbCategory>, String>;
    fn insert_category(&self, input: &CategoryInput) -> Result<i64, String>;
    fn update_category(&self, id: i64, input: &CategoryInput) -> Result<(), String>;
    fn delete_category(&self, id: i64) -> Result<(), String>;
    fn ensure_default_category_configs(&self, default_save_dir: &std::path::Path, previous_default_save_dir: Option<&std::path::Path>) -> Result<(), String>;

    // Tags
    fn get_tags(&self) -> Result<Vec<DbTag>, String>;
    fn insert_tag(&self, input: &TagInput) -> Result<i64, String>;
    fn update_tag(&self, id: i64, input: &TagInput) -> Result<(), String>;
    fn delete_tag(&self, id: i64) -> Result<(), String>;

    // Task-Tags
    fn add_task_tag(&self, task_id: &str, tag_id: i64) -> Result<(), String>;
    fn remove_task_tag(&self, task_id: &str, tag_id: i64) -> Result<(), String>;
    fn get_task_tags(&self, task_id: &str) -> Result<Vec<DbTag>, String>;
    fn get_all_task_tags_mappings(&self) -> Result<Vec<(String, i64)>, String>;

    // WebDAV
    fn get_webdav_devices(&self) -> Result<Vec<DbWebDavDevice>, String>;
    fn get_webdav_device(&self, id: &str) -> Result<Option<DbWebDavDevice>, String>;
    fn save_webdav_device(&self, device: &DbWebDavDevice) -> Result<(), String>;
    fn delete_webdav_device(&self, id: &str) -> Result<(), String>;

    // Backgrounds
    fn get_backgrounds(&self) -> Result<Vec<DbBackground>, String>;
    fn get_background(&self, id: i64) -> Result<Option<DbBackground>, String>;
    fn add_background(&self, path: &str, r#type: &str, is_online: bool, thumbnail: Option<&str>) -> Result<DbBackground, String>;
    fn delete_background(&self, id: i64) -> Result<(), String>;
}
