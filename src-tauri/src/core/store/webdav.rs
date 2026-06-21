use crate::core::store::DbStore;
use crate::core::webdav::DbWebDavDevice;
use rusqlite::params;

impl DbStore {
    pub fn get_webdav_devices(&self) -> Result<Vec<DbWebDavDevice>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, display_name, server_url, username, password_encrypted, remote_path, created_at FROM webdav_devices ORDER BY created_at DESC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(DbWebDavDevice {
                id: row.get(0)?,
                display_name: row.get(1)?,
                server_url: row.get(2)?,
                username: row.get(3)?,
                password_encrypted: row.get(4)?,
                remote_path: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?;

        let mut devices = Vec::new();
        for row in rows {
            devices.push(row?);
        }
        Ok(devices)
    }

    pub fn get_webdav_device(&self, id: &str) -> Result<Option<DbWebDavDevice>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, display_name, server_url, username, password_encrypted, remote_path, created_at FROM webdav_devices WHERE id = ?1"
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(DbWebDavDevice {
                id: row.get(0)?,
                display_name: row.get(1)?,
                server_url: row.get(2)?,
                username: row.get(3)?,
                password_encrypted: row.get(4)?,
                remote_path: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?;

        if let Some(row) = rows.next() {
            Ok(Some(row?))
        } else {
            Ok(None)
        }
    }

    pub fn save_webdav_device(&self, device: &DbWebDavDevice) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO webdav_devices (id, display_name, server_url, username, password_encrypted, remote_path, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                device.id,
                device.display_name,
                device.server_url,
                device.username,
                device.password_encrypted,
                device.remote_path,
                device.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_webdav_device(&self, id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM webdav_devices WHERE id = ?1", params![id])?;
        Ok(())
    }
}
