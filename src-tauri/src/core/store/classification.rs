use super::rules::{decode_rules, encode_rules};
use crate::core::categories::default_categories;
use crate::core::models::{CategoryInput, DbCategory, DbTag, TagInput};
use rusqlite::params;
use std::path::Path;

const DEFAULT_CATEGORY_CONFIG_VERSION_KEY: &str = "default_category_config_version";
const DEFAULT_CATEGORY_CONFIG_VERSION: &str = "1";

fn normalize_path_text(value: &str) -> String {
    let normalized = value
        .trim()
        .trim_end_matches(&['\\', '/'][..])
        .replace('\\', "/");

    if cfg!(windows) {
        normalized.to_lowercase()
    } else {
        normalized
    }
}

fn should_use_default_save_path(
    current_path: Option<&str>,
    previous_default_path: Option<&str>,
    should_fill_empty_path: bool,
) -> bool {
    let Some(current_path) = current_path
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return should_fill_empty_path;
    };

    previous_default_path
        .map(|previous| normalize_path_text(current_path) == normalize_path_text(previous))
        .unwrap_or(false)
}

fn legacy_default_sort_order(name: &str) -> Option<i32> {
    default_categories()
        .iter()
        .filter(|category| category.name != crate::core::categories::CATEGORY_DOCUMENT)
        .position(|category| category.name == name)
        .map(|index| index as i32 + 1)
}

#[allow(dead_code)]
impl super::DbStore {
    pub fn get_categories(&self) -> Result<Vec<DbCategory>, rusqlite::Error> {
        let conn = self.get_read_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, name, icon, color, sort_order, rules_json, save_path FROM categories ORDER BY sort_order ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(DbCategory {
                id: row.get(0)?,
                name: row.get(1)?,
                icon: row.get(2)?,
                color: row.get(3)?,
                sort_order: row.get(4)?,
                rules: decode_rules(row.get(5)?),
                save_path: row.get(6)?,
            })
        })?;

        let mut categories = Vec::new();
        for cat_res in rows {
            categories.push(cat_res?);
        }
        Ok(categories)
    }

    pub fn insert_category(&self, input: &CategoryInput) -> Result<i64, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO categories (name, icon, color, sort_order, rules_json, save_path) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                input.name.trim(),
                input.icon.as_deref(),
                input.color.as_deref(),
                input.sort_order,
                encode_rules(&input.rules),
                input.save_path.as_deref()
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn update_category(&self, id: i64, input: &CategoryInput) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE categories
             SET name = ?1, icon = ?2, color = ?3, sort_order = ?4, rules_json = ?5, save_path = ?6
             WHERE id = ?7",
            params![
                input.name.trim(),
                input.icon.as_deref(),
                input.color.as_deref(),
                input.sort_order,
                encode_rules(&input.rules),
                input.save_path.as_deref(),
                id
            ],
        )?;
        Ok(())
    }

    pub fn delete_category(&self, id: i64) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM categories WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn ensure_default_category_configs(
        &self,
        default_save_dir: &Path,
        previous_default_save_dir: Option<&Path>,
    ) -> Result<(), rusqlite::Error> {
        let categories = self.get_categories()?;
        let should_fill_default_rules = self
            .get_setting(DEFAULT_CATEGORY_CONFIG_VERSION_KEY)?
            .as_deref()
            != Some(DEFAULT_CATEGORY_CONFIG_VERSION);

        for default_category in default_categories() {
            let default_rules = default_category.rules();
            let default_save_path = default_category.save_path(default_save_dir);
            let previous_default_path =
                previous_default_save_dir.map(|base_dir| default_category.save_path(base_dir));

            let Some(existing) = categories
                .iter()
                .find(|category| category.name == default_category.name)
            else {
                if should_fill_default_rules {
                    self.insert_category(&default_category.input(default_save_dir))?;
                }
                continue;
            };

            let should_fill_rules =
                should_fill_default_rules && existing.rules.is_empty() && !default_rules.is_empty();
            let next_rules = if should_fill_rules {
                default_rules
            } else {
                existing.rules.clone()
            };
            let next_save_path = if should_use_default_save_path(
                existing.save_path.as_deref(),
                previous_default_path.as_deref(),
                should_fill_default_rules,
            ) {
                Some(default_save_path)
            } else {
                existing.save_path.clone()
            };
            let next_icon = if should_fill_default_rules {
                existing
                    .icon
                    .clone()
                    .or_else(|| Some(default_category.icon.to_string()))
            } else {
                existing.icon.clone()
            };
            let next_sort_order = if should_fill_default_rules
                && legacy_default_sort_order(default_category.name) == Some(existing.sort_order)
            {
                default_category.sort_order
            } else {
                existing.sort_order
            };

            let should_update = should_fill_rules
                || existing.save_path != next_save_path
                || existing.icon != next_icon
                || existing.sort_order != next_sort_order;

            if should_update {
                self.update_category(
                    existing.id,
                    &CategoryInput {
                        name: existing.name.clone(),
                        icon: next_icon,
                        color: existing.color.clone(),
                        sort_order: next_sort_order,
                        rules: next_rules,
                        save_path: next_save_path,
                    },
                )?;
            }
        }

        self.set_setting(
            DEFAULT_CATEGORY_CONFIG_VERSION_KEY,
            DEFAULT_CATEGORY_CONFIG_VERSION,
        )?;

        Ok(())
    }

    pub fn get_tags(&self) -> Result<Vec<DbTag>, rusqlite::Error> {
        let conn = self.get_read_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, category_id, name, icon, color, rules_json, save_path FROM tags ORDER BY id ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(DbTag {
                id: row.get(0)?,
                category_id: row.get(1)?,
                name: row.get(2)?,
                icon: row.get(3)?,
                color: row.get(4)?,
                rules: decode_rules(row.get(5)?),
                save_path: row.get(6)?,
            })
        })?;

        let mut tags = Vec::new();
        for tag_res in rows {
            tags.push(tag_res?);
        }
        Ok(tags)
    }

    pub fn insert_tag(&self, input: &TagInput) -> Result<i64, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO tags (name, color, category_id, group_id, icon, rules_json, save_path)
             VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6)",
            params![
                input.name.trim(),
                input.color.as_deref(),
                input.category_id,
                input.icon.as_deref(),
                encode_rules(&input.rules),
                input.save_path.as_deref()
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn update_tag(&self, id: i64, input: &TagInput) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tags
             SET name = ?1, color = ?2, category_id = ?3, group_id = NULL, icon = ?4, rules_json = ?5, save_path = ?6
             WHERE id = ?7",
            params![
                input.name.trim(),
                input.color.as_deref(),
                input.category_id,
                input.icon.as_deref(),
                encode_rules(&input.rules),
                input.save_path.as_deref(),
                id
            ],
        )?;
        Ok(())
    }

    pub fn delete_tag(&self, id: i64) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM tags WHERE id = ?1", params![id])?;
        Ok(())
    }
}
