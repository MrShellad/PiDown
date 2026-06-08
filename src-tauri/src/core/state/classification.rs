use crate::core::models::{CategoryInput, DbCategory, DbTag, TagInput};

impl super::AppState {
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
            .map_err(|e| e.to_string())
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
