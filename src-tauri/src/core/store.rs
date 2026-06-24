mod classification;
mod rules;
mod schema;
mod settings_store;
mod task_tags;
mod tasks;
pub mod backgrounds;
mod webdav;
pub mod repository;
mod impl_repository;

#[cfg(test)]
mod tests;

use rusqlite::Connection;
use std::path::Path;
use std::sync::Mutex;

pub struct PooledReadConnection<'a> {
    conn: Option<Connection>,
    store: &'a DbStore,
}

impl<'a> std::ops::Deref for PooledReadConnection<'a> {
    type Target = Connection;
    fn deref(&self) -> &Self::Target {
        self.conn.as_ref().unwrap()
    }
}

impl<'a> Drop for PooledReadConnection<'a> {
    fn drop(&mut self) {
        if let Some(conn) = self.conn.take() {
            let mut pool = self.store.read_pool.lock().unwrap();
            if pool.len() < 10 {
                pool.push(conn);
            }
        }
    }
}

pub struct DbStore {
    conn: Mutex<Connection>,
    db_path: String,
    read_pool: Mutex<Vec<Connection>>,
}

#[allow(dead_code)]
impl DbStore {
    pub fn new<P: AsRef<Path>>(db_path: P) -> Result<Self, rusqlite::Error> {
        if let Some(parent) = db_path.as_ref().parent() {
            std::fs::create_dir_all(parent).ok();
        }

        let db_path_str = db_path.as_ref().to_string_lossy().into_owned();
        let actual_path = if db_path_str == ":memory:" {
            format!("file:memdb_{}?mode=memory&cache=shared", uuid::Uuid::new_v4())
        } else {
            db_path_str
        };

        let conn = Connection::open_with_flags(
            &actual_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE
                | rusqlite::OpenFlags::SQLITE_OPEN_CREATE
                | rusqlite::OpenFlags::SQLITE_OPEN_URI,
        )?;
        
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;",
        )?;
        let store = Self {
            conn: Mutex::new(conn),
            db_path: actual_path,
            read_pool: Mutex::new(Vec::new()),
        };
        store.init_tables()?;
        store.seed_categories()?;
        Ok(store)
    }

    pub fn get_read_conn(&self) -> Result<PooledReadConnection<'_>, rusqlite::Error> {
        let mut pool = self.read_pool.lock().unwrap();
        let conn = if let Some(c) = pool.pop() {
            c
        } else {
            let conn = Connection::open_with_flags(
                &self.db_path,
                rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE
                    | rusqlite::OpenFlags::SQLITE_OPEN_CREATE
                    | rusqlite::OpenFlags::SQLITE_OPEN_URI,
            )?;
            conn.execute_batch(
                "PRAGMA journal_mode = WAL;
                 PRAGMA synchronous = NORMAL;
                 PRAGMA foreign_keys = ON;",
            )?;
            conn
        };
        Ok(PooledReadConnection {
            conn: Some(conn),
            store: self,
        })
    }
}

