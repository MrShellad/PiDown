mod classification;
mod rules;
mod schema;
mod settings_store;
mod task_tags;
mod tasks;
pub mod backgrounds;
mod webdav;

#[cfg(test)]
mod tests;

use rusqlite::Connection;
use std::path::Path;
use std::sync::Mutex;

pub struct DbStore {
    conn: Mutex<Connection>,
}

#[allow(dead_code)]
impl DbStore {
    pub fn new<P: AsRef<Path>>(db_path: P) -> Result<Self, rusqlite::Error> {
        if let Some(parent) = db_path.as_ref().parent() {
            std::fs::create_dir_all(parent).ok();
        }

        let conn = Connection::open(db_path)?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;",
        )?;
        let store = Self {
            conn: Mutex::new(conn),
        };
        store.init_tables()?;
        store.seed_categories()?;
        Ok(store)
    }
}
