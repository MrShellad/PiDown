use tauri::Manager;
use sha2::{Sha256, Digest};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde::{Serialize, Deserialize};
use opendal::{services::Webdav, Operator};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbWebDavDevice {
    pub id: String,
    pub display_name: String,
    pub server_url: String,
    pub username: String,
    pub password_encrypted: String,
    pub remote_path: String,
    pub created_at: i64,
}

fn get_or_create_salt(app_data_dir: &std::path::Path) -> Result<Vec<u8>, String> {
    let salt_path = app_data_dir.join("webdav_salt.bin");
    if salt_path.exists() {
        std::fs::read(&salt_path).map_err(|e| format!("读取Salt文件失败: {e}"))
    } else {
        // Generate 32 bytes of salt using UUIDs
        let mut salt = Vec::with_capacity(32);
        for _ in 0..2 {
            let u = uuid::Uuid::new_v4();
            salt.extend_from_slice(u.as_bytes());
        }
        salt.truncate(32);

        if let Some(parent) = salt_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }

        std::fs::write(&salt_path, &salt).map_err(|e| format!("写入Salt文件失败: {e}"))?;
        Ok(salt)
    }
}

/// Derive a 256-bit key from local salt file, machine name, user name, and home directory
pub fn derive_key(app_handle: &tauri::AppHandle) -> Result<[u8; 32], String> {
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("无法解析应用数据目录: {e}"))?;
    let local_salt = get_or_create_salt(&app_data_dir)?;

    let computer_name = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "UNKNOWN_COMP".to_string());
    let user_name = std::env::var("USERNAME").unwrap_or_else(|_| "UNKNOWN_USER".to_string());
    let home_dir = dirs::home_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| "UNKNOWN_HOME".to_string());

    let pepper = b"pidown_webdav_sec_pepper_2026";

    let mut hasher = Sha256::new();
    hasher.update(&local_salt);
    hasher.update(computer_name.as_bytes());
    hasher.update(user_name.as_bytes());
    hasher.update(home_dir.as_bytes());
    hasher.update(pepper);

    let digest = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&digest);
    Ok(key)
}

/// Encrypt a password using SHA-256 in Counter Mode (CTR)
pub fn encrypt_password(plaintext: &str, key: &[u8; 32]) -> Result<String, String> {
    let plain_bytes = plaintext.as_bytes();

    // Use a random 12-byte nonce from UUID v4
    let u = uuid::Uuid::new_v4();
    let nonce = &u.as_bytes()[0..12];

    let mut ciphertext = Vec::with_capacity(plain_bytes.len());
    let mut block_idx = 0u32;

    for chunk in plain_bytes.chunks(32) {
        let mut hasher = Sha256::new();
        hasher.update(key);
        hasher.update(nonce);
        hasher.update(&block_idx.to_be_bytes());
        let keystream_block = hasher.finalize();

        for (p_byte, k_byte) in chunk.iter().zip(keystream_block.iter()) {
            ciphertext.push(p_byte ^ k_byte);
        }
        block_idx += 1;
    }

    let mut result = Vec::with_capacity(12 + ciphertext.len());
    result.extend_from_slice(nonce);
    result.extend_from_slice(&ciphertext);

    Ok(STANDARD.encode(result))
}

/// Decrypt a password using SHA-256 in Counter Mode (CTR)
pub fn decrypt_password(ciphertext_base64: &str, key: &[u8; 32]) -> Result<String, String> {
    let encrypted_bytes = STANDARD.decode(ciphertext_base64)
        .map_err(|e| format!("解码Base64失败: {e}"))?;

    if encrypted_bytes.len() < 12 {
        return Err("密文长度不足".to_string());
    }

    let (nonce, ciphertext) = encrypted_bytes.split_at(12);

    let mut plaintext = Vec::with_capacity(ciphertext.len());
    let mut block_idx = 0u32;

    for chunk in ciphertext.chunks(32) {
        let mut hasher = Sha256::new();
        hasher.update(key);
        hasher.update(nonce);
        hasher.update(&block_idx.to_be_bytes());
        let keystream_block = hasher.finalize();

        for (c_byte, k_byte) in chunk.iter().zip(keystream_block.iter()) {
            plaintext.push(c_byte ^ k_byte);
        }
        block_idx += 1;
    }

    String::from_utf8(plaintext).map_err(|e| format!("解密结果不是有效的UTF-8: {e}"))
}

pub fn create_operator(url: &str, username: &str, password_decrypted: &str) -> Result<Operator, String> {
    let builder = Webdav::default()
        .endpoint(url)
        .username(username)
        .password(password_decrypted);
    
    let op = Operator::new(builder)
        .map_err(|e| format!("初始化 WebDAV 驱动失败: {e}"))?
        .finish();
        
    Ok(op)
}

/// Format byte count into human-readable string (auto-selects KB/MB/GB/TB)
fn format_bytes(bytes: u64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    const GB: f64 = MB * 1024.0;
    const TB: f64 = GB * 1024.0;

    let b = bytes as f64;
    if b >= TB {
        format!("{:.2} TB", b / TB)
    } else if b >= GB {
        format!("{:.2} GB", b / GB)
    } else if b >= MB {
        format!("{:.2} MB", b / MB)
    } else if b >= KB {
        format!("{:.2} KB", b / KB)
    } else {
        format!("{} B", bytes)
    }
}

/// Extract the text content between a DAV: property tag, handling various namespace prefixes.
/// Matches patterns like <D:quota-used-bytes>123</D:quota-used-bytes>,
/// <d:quota-used-bytes>123</d:quota-used-bytes>, <quota-used-bytes>123</quota-used-bytes>, etc.
fn extract_dav_property(xml: &str, prop_name: &str) -> Option<u64> {
    // Try common prefix patterns: "D:", "d:", "DAV:", no prefix
    let prefixes = ["D:", "d:", "DAV:", ""];
    for prefix in prefixes {
        let open_tag = format!("<{prefix}{prop_name}>");
        let close_tag = format!("</{prefix}{prop_name}>");
        if let Some(start) = xml.find(&open_tag) {
            let value_start = start + open_tag.len();
            if let Some(end) = xml[value_start..].find(&close_tag) {
                let value_str = xml[value_start..value_start + end].trim();
                if let Ok(val) = value_str.parse::<u64>() {
                    return Some(val);
                }
            }
        }
    }
    None
}

/// Send a PROPFIND request to the WebDAV server root to query quota properties.
/// Returns (quota_used_bytes, quota_available_bytes) if the server supports it.
async fn query_webdav_quota(
    url: &str,
    username: &str,
    password: &str,
) -> Option<(u64, u64)> {
    let propfind_body = r#"<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:quota-available-bytes/>
    <D:quota-used-bytes/>
  </D:prop>
</D:propfind>"#;

    // Build the PROPFIND target URL (use the server root, not subpath)
    let parsed = reqwest::Url::parse(url).ok()?;
    // Use the endpoint URL directly — it should point to the DAV root or relevant collection
    let target_url = parsed.as_str().trim_end_matches('/').to_string() + "/";

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .ok()?;

    let resp = client
        .request(reqwest::Method::from_bytes(b"PROPFIND").ok()?, &target_url)
        .header("Depth", "0")
        .header("Content-Type", "application/xml; charset=utf-8")
        .basic_auth(username, Some(password))
        .body(propfind_body)
        .send()
        .await
        .ok()?;

    if !resp.status().is_success() && resp.status().as_u16() != 207 {
        return None;
    }

    let body = resp.text().await.ok()?;

    let used = extract_dav_property(&body, "quota-used-bytes")?;
    let available = extract_dav_property(&body, "quota-available-bytes")?;

    Some((used, available))
}

/// Check WebDAV server connection and return storage quota
pub async fn check_webdav_status(
    url: &str,
    username: &str,
    password_decrypted: &str,
) -> (String, String, String, Option<f64>) {
    let op = match create_operator(url, username, password_decrypted) {
        Ok(op) => op,
        Err(e) => return ("disconnected".to_string(), e, "——".to_string(), None),
    };

    match op.check().await {
        Ok(_) => {
            // Connection OK — now query quota via PROPFIND
            match query_webdav_quota(url, username, password_decrypted).await {
                Some((used, available)) => {
                    let total = used + available;
                    let progress = if total > 0 {
                        Some((used as f64 / total as f64) * 100.0)
                    } else {
                        None
                    };
                    let capacity = format!(
                        "已用 {} / 共 {}",
                        format_bytes(used),
                        format_bytes(total)
                    );
                    ("connected".to_string(), "已连接".to_string(), capacity, progress)
                }
                None => {
                    ("connected".to_string(), "已连接".to_string(), "配额信息不可用".to_string(), None)
                }
            }
        }
        Err(e) => {
            let err_msg = e.to_string();
            let short_err = if err_msg.contains("timeout") {
                "连接超时"
            } else if err_msg.contains("dns") || err_msg.contains("resolve") {
                "域名解析失败"
            } else if err_msg.contains("401") || err_msg.contains("Unauthorized") {
                "用户名或密码错误"
            } else {
                "无法访问服务器"
            };
            ("disconnected".to_string(), short_err.to_string(), "——".to_string(), None)
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebDavFile {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub last_modified: String,
}

pub fn to_relative_path(endpoint_url: &str, absolute_path: &str) -> String {
    let endpoint_path = match reqwest::Url::parse(endpoint_url) {
        Ok(parsed_url) => parsed_url.path().trim_end_matches('/').to_string(),
        Err(_) => String::new(),
    };

    let mut rel_path = absolute_path.to_string();
    if !endpoint_path.is_empty() && rel_path.starts_with(&endpoint_path) {
        rel_path = rel_path[endpoint_path.len()..].to_string();
    }
    rel_path.trim_start_matches('/').to_string()
}

pub async fn list_webdav_directory(
    url: &str,
    username: &str,
    password_decrypted: &str,
    path: &str,
) -> Result<Vec<WebDavFile>, String> {
    let op = create_operator(url, username, password_decrypted)?;

    let endpoint_path = match reqwest::Url::parse(url) {
        Ok(parsed_url) => parsed_url.path().trim_end_matches('/').to_string(),
        Err(_) => String::new(),
    };

    let mut rel_path = to_relative_path(url, path);
    if !rel_path.is_empty() && !rel_path.ends_with('/') {
        rel_path.push('/');
    }

    let entries = op.list(&rel_path).await
        .map_err(|e| format!("列目录失败: {e}"))?;

    let mut filtered_files = Vec::new();
    for entry in entries {
        let name = entry.name().trim_end_matches('/').to_string();
        if name.is_empty() {
            continue;
        }

        let is_dir = entry.metadata().is_dir();
        let size = entry.metadata().content_length();
        let last_modified = entry.metadata().last_modified()
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_else(|| "——".to_string());

        let entry_path = entry.path().trim_start_matches('/');
        let full_path = if endpoint_path.is_empty() {
            format!("/{entry_path}")
        } else {
            format!("{endpoint_path}/{entry_path}")
        };

        filtered_files.push(WebDavFile {
            name,
            path: full_path,
            is_dir,
            size,
            last_modified,
        });
    }

    // Sort folders first, then files alphabetically
    filtered_files.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(filtered_files)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_to_relative_path() {
        // Case 1: Endpoint has /dav/ path, absolute path matches
        assert_eq!(
            to_relative_path("http://localhost:5244/dav/", "/dav/folder/file.txt"),
            "folder/file.txt"
        );

        // Case 2: Endpoint has /dav path without trailing slash, absolute path matches
        assert_eq!(
            to_relative_path("http://localhost:5244/dav", "/dav/file.txt"),
            "file.txt"
        );

        // Case 3: Endpoint has root path /, absolute path matches
        assert_eq!(
            to_relative_path("http://localhost:5244/", "/folder/sub/file.txt"),
            "folder/sub/file.txt"
        );

        // Case 4: Endpoint has no path, absolute path matches
        assert_eq!(
            to_relative_path("http://localhost:5244", "/file.txt"),
            "file.txt"
        );

        // Case 5: Fallback when absolute path doesn't match endpoint path prefix
        assert_eq!(
            to_relative_path("http://localhost:5244/dav/", "/other/file.txt"),
            "other/file.txt"
        );
    }
}
