use crate::core::store::DbStore;
use serde::{Deserialize, Serialize};
use rusqlite::params;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbBackground {
    pub id: i64,
    pub path: String,
    pub r#type: String,
    pub is_online: bool,
    pub created_at: i64,
    pub thumbnail: Option<String>,
}


impl DbStore {
    pub fn get_backgrounds(&self) -> Result<Vec<DbBackground>, rusqlite::Error> {
        let conn = self.get_read_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, path, type, is_online, created_at, thumbnail FROM backgrounds ORDER BY created_at DESC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(DbBackground {
                id: row.get(0)?,
                path: row.get(1)?,
                r#type: row.get(2)?,
                is_online: row.get::<_, i32>(3)? != 0,
                created_at: row.get(4)?,
                thumbnail: row.get(5)?,
            })
        })?;


        let mut backgrounds = Vec::new();
        for row in rows {
            backgrounds.push(row?);
        }
        Ok(backgrounds)
    }

    #[allow(dead_code)]
    pub fn get_background(&self, id: i64) -> Result<Option<DbBackground>, rusqlite::Error> {
        let conn = self.get_read_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, path, type, is_online, created_at, thumbnail FROM backgrounds WHERE id = ?1"
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(DbBackground {
                id: row.get(0)?,
                path: row.get(1)?,
                r#type: row.get(2)?,
                is_online: row.get::<_, i32>(3)? != 0,
                created_at: row.get(4)?,
                thumbnail: row.get(5)?,
            })
        })?;


        if let Some(row) = rows.next() {
            Ok(Some(row?))
        } else {
            Ok(None)
        }
    }

    pub fn add_background(
        &self,
        path: &str,
        r#type: &str,
        is_online: bool,
        thumbnail: Option<&str>,
    ) -> Result<DbBackground, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let created_at = chrono::Utc::now().timestamp();
        let is_online_val = if is_online { 1 } else { 0 };
        
        conn.execute(
            "INSERT INTO backgrounds (path, type, is_online, created_at, thumbnail) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![path, r#type, is_online_val, created_at, thumbnail],
        )?;
        
        let id = conn.last_insert_rowid();
        Ok(DbBackground {
            id,
            path: path.to_string(),
            r#type: r#type.to_string(),
            is_online,
            created_at,
            thumbnail: thumbnail.map(|s| s.to_string()),
        })
    }


    pub fn delete_background(&self, id: i64) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM backgrounds WHERE id = ?1", params![id])?;
        Ok(())
    }
}
