use crate::core::categories::default_categories;
use crate::core::models::{CategoryInput, DbCategory, DbTag, TagInput};
use std::path::Path;

impl super::AppState {
    pub(super) fn ensure_default_category_configs(
        &self,
        previous_default_save_dir: Option<&Path>,
    ) -> Result<(), String> {
        let settings = self.settings.read().unwrap().clone();
        let default_save_dir = Path::new(&settings.download.default_save_dir);

        self.db
            .ensure_default_category_configs(default_save_dir, previous_default_save_dir)
            .map_err(|e| e.to_string())?;

        for category in default_categories() {
            std::fs::create_dir_all(category.save_path(default_save_dir))
                .map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    pub fn get_categories(&self) -> Result<Vec<DbCategory>, String> {
        self.db.get_categories().map_err(|e| e.to_string())
    }

    pub fn get_tags(&self) -> Result<Vec<DbTag>, String> {
        self.db.get_tags().map_err(|e| e.to_string())
    }

    pub fn create_category(&self, input: CategoryInput) -> Result<i64, String> {
        self.db.insert_category(&input).map_err(|e| e.to_string())
    }

    pub fn update_category(&self, category_id: i64, input: CategoryInput) -> Result<(), String> {
        self.db
            .update_category(category_id, &input)
            .map_err(|e| e.to_string())
    }

    pub fn delete_category(&self, category_id: i64) -> Result<(), String> {
        self.db
            .delete_category(category_id)
            .map_err(|e| e.to_string())
    }

    pub fn update_task_category(&self, gid: &str, category_id: Option<i64>) -> Result<(), String> {
        self.db
            .update_task_category(gid, category_id)
            .map_err(|e| e.to_string())?;

        if let Some(task) = self.task_cache.write().unwrap().get_mut(gid) {
            task.category_id = category_id;
            task.dirty = true;
        }

        Ok(())
    }

    pub fn add_task_tag(&self, gid: &str, tag_id: i64) -> Result<(), String> {
        self.db.add_task_tag(gid, tag_id).map_err(|e| e.to_string())
    }

    pub fn remove_task_tag(&self, gid: &str, tag_id: i64) -> Result<(), String> {
        self.db
            .remove_task_tag(gid, tag_id)
            .map_err(|e| e.to_string())
    }

    pub fn create_tag(&self, input: TagInput) -> Result<i64, String> {
        self.db.insert_tag(&input).map_err(|e| e.to_string())
    }

    pub fn update_tag(&self, tag_id: i64, input: TagInput) -> Result<(), String> {
        self.db
            .update_tag(tag_id, &input)
            .map_err(|e| e.to_string())
    }

    pub fn delete_tag(&self, tag_id: i64) -> Result<(), String> {
        self.db.delete_tag(tag_id).map_err(|e| e.to_string())
    }
}
