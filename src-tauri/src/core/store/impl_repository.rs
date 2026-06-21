use crate::core::store::DbStore;
use crate::core::models::{DbTask, DbCategory, DbTag, CategoryInput, TagInput};
use crate::core::webdav::DbWebDavDevice;
use crate::core::store::backgrounds::DbBackground;
use crate::core::store::repository::TaskRepository;

impl TaskRepository for DbStore {
    // Settings
    fn get_setting(&self, key: &str) -> Result<Option<String>, String> {
        self.get_setting(key).map_err(|e| e.to_string())
    }

    fn set_setting(&self, key: &str, value: &str) -> Result<(), String> {
        self.set_setting(key, value).map_err(|e| e.to_string())
    }

    // Tasks
    fn insert_task(&self, task: &DbTask) -> Result<(), String> {
        self.insert_task(task).map_err(|e| e.to_string())
    }

    fn update_task_progress(&self, id: &str, completed_size: u64, total_size: u64) -> Result<(), String> {
        self.update_task_progress(id, completed_size, total_size).map_err(|e| e.to_string())
    }

    fn update_task_status(&self, id: &str, status: &str, completed_at: Option<i64>) -> Result<(), String> {
        self.update_task_status(id, status, completed_at).map_err(|e| e.to_string())
    }

    fn update_task_category(&self, id: &str, category_id: Option<i64>) -> Result<(), String> {
        self.update_task_category(id, category_id).map_err(|e| e.to_string())
    }

    fn update_task_engine_id(&self, id: &str, engine_id: Option<&str>) -> Result<(), String> {
        self.update_task_engine_id(id, engine_id).map_err(|e| e.to_string())
    }

    fn delete_task(&self, id: &str) -> Result<(), String> {
        self.delete_task(id).map_err(|e| e.to_string())
    }

    fn delete_completed_tasks(&self) -> Result<usize, String> {
        self.delete_completed_tasks().map_err(|e| e.to_string())
    }

    fn get_task(&self, id: &str) -> Result<Option<DbTask>, String> {
        self.get_task(id).map_err(|e| e.to_string())
    }

    fn get_task_by_engine_id(&self, engine_id: &str) -> Result<Option<DbTask>, String> {
        self.get_task_by_engine_id(engine_id).map_err(|e| e.to_string())
    }

    fn get_all_tasks(&self) -> Result<Vec<DbTask>, String> {
        self.get_all_tasks().map_err(|e| e.to_string())
    }

    fn save_tasks_checkpoint(&self, tasks: &[DbTask]) -> Result<(), String> {
        self.save_tasks_checkpoint(tasks).map_err(|e| e.to_string())
    }

    fn update_task_error(&self, id: &str, error_message: Option<&str>) -> Result<(), String> {
        self.update_task_error(id, error_message).map_err(|e| e.to_string())
    }

    fn update_task_url(&self, id: &str, url: &str) -> Result<(), String> {
        self.update_task_url(id, url).map_err(|e| e.to_string())
    }

    fn update_task_name(&self, id: &str, name: &str) -> Result<(), String> {
        self.update_task_name(id, name).map_err(|e| e.to_string())
    }

    // Categories
    fn get_categories(&self) -> Result<Vec<DbCategory>, String> {
        self.get_categories().map_err(|e| e.to_string())
    }

    fn insert_category(&self, input: &CategoryInput) -> Result<i64, String> {
        self.insert_category(input).map_err(|e| e.to_string())
    }

    fn update_category(&self, id: i64, input: &CategoryInput) -> Result<(), String> {
        self.update_category(id, input).map_err(|e| e.to_string())
    }

    fn delete_category(&self, id: i64) -> Result<(), String> {
        self.delete_category(id).map_err(|e| e.to_string())
    }

    fn ensure_default_category_configs(&self, default_save_dir: &std::path::Path, previous_default_save_dir: Option<&std::path::Path>) -> Result<(), String> {
        self.ensure_default_category_configs(default_save_dir, previous_default_save_dir).map_err(|e| e.to_string())
    }

    // Tags
    fn get_tags(&self) -> Result<Vec<DbTag>, String> {
        self.get_tags().map_err(|e| e.to_string())
    }

    fn insert_tag(&self, input: &TagInput) -> Result<i64, String> {
        self.insert_tag(input).map_err(|e| e.to_string())
    }

    fn update_tag(&self, id: i64, input: &TagInput) -> Result<(), String> {
        self.update_tag(id, input).map_err(|e| e.to_string())
    }

    fn delete_tag(&self, id: i64) -> Result<(), String> {
        self.delete_tag(id).map_err(|e| e.to_string())
    }

    // Task-Tags
    fn add_task_tag(&self, task_id: &str, tag_id: i64) -> Result<(), String> {
        self.add_task_tag(task_id, tag_id).map_err(|e| e.to_string())
    }

    fn remove_task_tag(&self, task_id: &str, tag_id: i64) -> Result<(), String> {
        self.remove_task_tag(task_id, tag_id).map_err(|e| e.to_string())
    }

    fn get_task_tags(&self, task_id: &str) -> Result<Vec<DbTag>, String> {
        self.get_task_tags(task_id).map_err(|e| e.to_string())
    }

    fn get_all_task_tags_mappings(&self) -> Result<Vec<(String, i64)>, String> {
        self.get_all_task_tags_mappings().map_err(|e| e.to_string())
    }

    // WebDAV
    fn get_webdav_devices(&self) -> Result<Vec<DbWebDavDevice>, String> {
        self.get_webdav_devices().map_err(|e| e.to_string())
    }

    fn get_webdav_device(&self, id: &str) -> Result<Option<DbWebDavDevice>, String> {
        self.get_webdav_device(id).map_err(|e| e.to_string())
    }

    fn save_webdav_device(&self, device: &DbWebDavDevice) -> Result<(), String> {
        self.save_webdav_device(device).map_err(|e| e.to_string())
    }

    fn delete_webdav_device(&self, id: &str) -> Result<(), String> {
        self.delete_webdav_device(id).map_err(|e| e.to_string())
    }

    // Backgrounds
    fn get_backgrounds(&self) -> Result<Vec<DbBackground>, String> {
        self.get_backgrounds().map_err(|e| e.to_string())
    }

    fn get_background(&self, id: i64) -> Result<Option<DbBackground>, String> {
        self.get_background(id).map_err(|e| e.to_string())
    }

    fn add_background(&self, path: &str, r#type: &str, is_online: bool, thumbnail: Option<&str>) -> Result<DbBackground, String> {
        self.add_background(path, r#type, is_online, thumbnail).map_err(|e| e.to_string())
    }

    fn delete_background(&self, id: i64) -> Result<(), String> {
        self.delete_background(id).map_err(|e| e.to_string())
    }
}
