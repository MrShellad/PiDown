use super::rules::decode_rules;
use crate::core::models::DbTag;
use rusqlite::params;

#[allow(dead_code)]
impl super::DbStore {
    pub fn add_task_tag(&self, task_id: &str, tag_id: i64) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
            params![task_id, tag_id],
        )?;
        Ok(())
    }

    pub fn remove_task_tag(&self, task_id: &str, tag_id: i64) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM task_tags WHERE task_id = ?1 AND tag_id = ?2",
            params![task_id, tag_id],
        )?;
        Ok(())
    }

    pub fn get_task_tags(&self, task_id: &str) -> Result<Vec<DbTag>, rusqlite::Error> {
        let conn = self.get_read_conn()?;
        let mut stmt = conn.prepare(
            "SELECT t.id, t.category_id, t.name, t.icon, t.color, t.rules_json, t.save_path
             FROM tags t
             JOIN task_tags tt ON t.id = tt.tag_id
             WHERE tt.task_id = ?1",
        )?;
        let rows = stmt.query_map(params![task_id], |row| {
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

    pub fn get_all_task_tags_mappings(&self) -> Result<Vec<(String, i64)>, rusqlite::Error> {
        let conn = self.get_read_conn()?;
        let mut stmt = conn.prepare("SELECT task_id, tag_id FROM task_tags")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?;

        let mut mappings = Vec::new();
        for mapping in rows {
            mappings.push(mapping?);
        }
        Ok(mappings)
    }
}
