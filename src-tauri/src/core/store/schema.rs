use crate::core::categories::default_categories;
use rusqlite::{params, Connection};

#[allow(dead_code)]
impl super::DbStore {
    pub(super) fn init_tables(&self) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();

        conn.execute(
            "CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                icon TEXT,
                color TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0,
                rules_json TEXT NOT NULL DEFAULT '{}',
                save_path TEXT
            );",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS tag_groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                icon TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0
            );",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id INTEGER REFERENCES tag_groups(id) ON DELETE SET NULL,
                category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
                name TEXT NOT NULL UNIQUE,
                icon TEXT,
                rules_json TEXT NOT NULL DEFAULT '{}',
                save_path TEXT,
                color TEXT
            );",
            [],
        )?;

        self.ensure_column(
            &conn,
            "categories",
            "rules_json",
            "TEXT NOT NULL DEFAULT '{}'",
        )?;
        self.ensure_column(&conn, "categories", "color", "TEXT")?;
        self.ensure_column(&conn, "categories", "save_path", "TEXT")?;
        self.ensure_column(
            &conn,
            "tags",
            "category_id",
            "INTEGER REFERENCES categories(id) ON DELETE SET NULL",
        )?;
        self.ensure_column(&conn, "tags", "icon", "TEXT")?;
        self.ensure_column(&conn, "tags", "rules_json", "TEXT NOT NULL DEFAULT '{}'")?;
        self.ensure_column(&conn, "tags", "save_path", "TEXT")?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                url TEXT NOT NULL,
                protocol TEXT NOT NULL,
                save_path TEXT NOT NULL,
                total_size INTEGER NOT NULL DEFAULT 0,
                completed_size INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL CHECK (status IN ('Pending', 'Downloading', 'Paused', 'Completed', 'Failed', 'Cancelled')),
                category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
                created_at INTEGER NOT NULL,
                started_at INTEGER,
                completed_at INTEGER
            );",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS task_tags (
                task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (task_id, tag_id)
            );",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
            [],
        )?;

        Ok(())
    }

    fn ensure_column(
        &self,
        conn: &Connection,
        table: &str,
        column: &str,
        definition: &str,
    ) -> Result<(), rusqlite::Error> {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
        let columns = stmt.query_map([], |row| row.get::<_, String>(1))?;

        for column_result in columns {
            if column_result? == column {
                return Ok(());
            }
        }

        conn.execute(
            &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
            [],
        )?;
        Ok(())
    }

    pub(super) fn seed_categories(&self) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM categories", [], |row| row.get(0))?;

        if count == 0 {
            for (name, icon, sort_order) in default_categories() {
                conn.execute(
                    "INSERT INTO categories (name, icon, sort_order) VALUES (?1, ?2, ?3)",
                    params![name, icon, sort_order],
                )?;
            }
        }

        Ok(())
    }
}
