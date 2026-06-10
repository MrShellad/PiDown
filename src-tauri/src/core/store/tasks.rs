use crate::core::models::DbTask;
use chrono::Utc;
use rusqlite::params;

#[allow(dead_code)]
impl super::DbStore {
    pub fn insert_task(&self, task: &DbTask) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO tasks (
                id, engine_id, name, url, protocol, save_path, total_size, completed_size, status, category_id, created_at, started_at, completed_at, error_message
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                task.id,
                task.engine_id,
                task.name,
                task.url,
                task.protocol,
                task.save_path,
                task.total_size as i64,
                task.completed_size as i64,
                task.status,
                task.category_id,
                task.created_at,
                task.started_at,
                task.completed_at,
                task.error_message
            ],
        )?;
        Ok(())
    }

    pub fn update_task_progress(
        &self,
        id: &str,
        completed_size: u64,
        total_size: u64,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tasks SET completed_size = ?1, total_size = ?2 WHERE id = ?3",
            params![completed_size as i64, total_size as i64, id],
        )?;
        Ok(())
    }

    pub fn update_task_status(
        &self,
        id: &str,
        status: &str,
        completed_at: Option<i64>,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();

        match (status, completed_at) {
            ("Downloading", _) => {
                conn.execute(
                    "UPDATE tasks SET status = ?1, started_at = COALESCE(started_at, ?2) WHERE id = ?3",
                    params![status, Utc::now().timestamp(), id],
                )?;
            }
            (_, Some(completed_at)) => {
                conn.execute(
                    "UPDATE tasks SET status = ?1, completed_at = ?2 WHERE id = ?3",
                    params![status, completed_at, id],
                )?;
            }
            _ => {
                conn.execute(
                    "UPDATE tasks SET status = ?1 WHERE id = ?2",
                    params![status, id],
                )?;
            }
        }

        Ok(())
    }

    pub fn update_task_category(
        &self,
        id: &str,
        category_id: Option<i64>,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tasks SET category_id = ?1 WHERE id = ?2",
            params![category_id, id],
        )?;
        Ok(())
    }

    pub fn update_task_engine_id(
        &self,
        id: &str,
        engine_id: Option<&str>,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tasks SET engine_id = ?1 WHERE id = ?2",
            params![engine_id, id],
        )?;
        Ok(())
    }

    pub fn delete_task(&self, id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn delete_completed_tasks(&self) -> Result<usize, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM tasks WHERE status = 'Completed'", [])
    }

    pub fn get_task(&self, id: &str) -> Result<Option<DbTask>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, engine_id, name, url, protocol, save_path, total_size, completed_size, status, category_id, created_at, started_at, completed_at, error_message
             FROM tasks
             WHERE id = ?1",
        )?;
        let mut rows = stmt.query(params![id])?;

        if let Some(row) = rows.next()? {
            Ok(Some(DbTask {
                id: row.get(0)?,
                engine_id: row.get(1)?,
                name: row.get(2)?,
                url: row.get(3)?,
                protocol: row.get(4)?,
                save_path: row.get(5)?,
                total_size: row.get::<_, i64>(6)? as u64,
                completed_size: row.get::<_, i64>(7)? as u64,
                status: row.get(8)?,
                category_id: row.get(9)?,
                created_at: row.get(10)?,
                started_at: row.get(11)?,
                completed_at: row.get(12)?,
                error_message: row.get(13)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn get_task_by_engine_id(
        &self,
        engine_id: &str,
    ) -> Result<Option<DbTask>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, engine_id, name, url, protocol, save_path, total_size, completed_size, status, category_id, created_at, started_at, completed_at, error_message
             FROM tasks
             WHERE engine_id = ?1",
        )?;
        let mut rows = stmt.query(params![engine_id])?;

        if let Some(row) = rows.next()? {
            Ok(Some(DbTask {
                id: row.get(0)?,
                engine_id: row.get(1)?,
                name: row.get(2)?,
                url: row.get(3)?,
                protocol: row.get(4)?,
                save_path: row.get(5)?,
                total_size: row.get::<_, i64>(6)? as u64,
                completed_size: row.get::<_, i64>(7)? as u64,
                status: row.get(8)?,
                category_id: row.get(9)?,
                created_at: row.get(10)?,
                started_at: row.get(11)?,
                completed_at: row.get(12)?,
                error_message: row.get(13)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn get_all_tasks(&self) -> Result<Vec<DbTask>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, engine_id, name, url, protocol, save_path, total_size, completed_size, status, category_id, created_at, started_at, completed_at, error_message
             FROM tasks
             ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(DbTask {
                id: row.get(0)?,
                engine_id: row.get(1)?,
                name: row.get(2)?,
                url: row.get(3)?,
                protocol: row.get(4)?,
                save_path: row.get(5)?,
                total_size: row.get::<_, i64>(6)? as u64,
                completed_size: row.get::<_, i64>(7)? as u64,
                status: row.get(8)?,
                category_id: row.get(9)?,
                created_at: row.get(10)?,
                started_at: row.get(11)?,
                completed_at: row.get(12)?,
                error_message: row.get(13)?,
            })
        })?;

        let mut tasks = Vec::new();
        for task_res in rows {
            tasks.push(task_res?);
        }
        Ok(tasks)
    }

    pub fn save_tasks_checkpoint(&self, tasks: &[DbTask]) -> Result<(), rusqlite::Error> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare(
                "UPDATE tasks SET 
                    completed_size = ?1, 
                    total_size = ?2, 
                    status = ?3, 
                    engine_id = ?4,
                    started_at = ?5,
                    completed_at = ?6,
                    error_message = ?7
                 WHERE id = ?8"
            )?;
            for task in tasks {
                stmt.execute(params![
                    task.completed_size as i64,
                    task.total_size as i64,
                    task.status,
                    task.engine_id,
                    task.started_at,
                    task.completed_at,
                    task.error_message,
                    task.id
                ])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn update_task_error(
        &self,
        id: &str,
        error_message: Option<&str>,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tasks SET error_message = ?1 WHERE id = ?2",
            params![error_message, id],
        )?;
        Ok(())
    }
}
