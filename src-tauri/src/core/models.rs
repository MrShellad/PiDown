use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbTask {
    pub id: String,
    pub engine_id: Option<String>,
    pub name: String,
    pub url: String,
    pub protocol: String,
    pub save_path: String,
    pub total_size: u64,
    pub completed_size: u64,
    pub status: String,
    pub category_id: Option<i64>,
    pub created_at: i64,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MatchRules {
    pub domains: Vec<String>,
    pub extensions: Vec<String>,
    pub name_keywords: Vec<String>,
    pub min_size_bytes: Option<u64>,
    pub max_size_bytes: Option<u64>,
}

impl MatchRules {
    pub fn is_empty(&self) -> bool {
        self.domains.is_empty()
            && self.extensions.is_empty()
            && self.name_keywords.is_empty()
            && self.min_size_bytes.is_none()
            && self.max_size_bytes.is_none()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbCategory {
    pub id: i64,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub sort_order: i32,
    pub rules: MatchRules,
    pub save_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryInput {
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub sort_order: i32,
    #[serde(default)]
    pub rules: MatchRules,
    pub save_path: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbTagGroup {
    pub id: i64,
    pub name: String,
    pub icon: Option<String>,
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbTag {
    pub id: i64,
    pub category_id: Option<i64>,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub rules: MatchRules,
    pub save_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagInput {
    pub category_id: Option<i64>,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    #[serde(default)]
    pub rules: MatchRules,
    pub save_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TaskOverview {
    pub gid: String,
    pub url: String,
    pub name: String,
    pub status: String,
    pub speed: String,
    pub progress: f64,
    pub eta: String,
    pub speed_bps: u64,
    pub eta_seconds: Option<u64>,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub created_at: i64,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub upload_speed: String,
    pub error_message: Option<String>,
    pub save_path: String,
    pub category_id: Option<i64>,
    pub tags: Vec<DbTag>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TaskClassificationPreview {
    pub category: Option<DbCategory>,
    pub tags: Vec<DbTag>,
    pub save_path: String,
}
