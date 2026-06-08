use super::rules::{decode_rules, encode_rules};
use crate::core::models::{CategoryInput, DbCategory, DbTag, TagInput};
use rusqlite::params;

#[allow(dead_code)]
impl super::DbStore {
    pub fn get_categories(&self) -> Result<Vec<DbCategory>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
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

    pub fn get_tags(&self) -> Result<Vec<DbTag>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
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
