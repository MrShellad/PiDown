use tauri::Manager;
use sha2::{Sha256, Digest};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde::{Serialize, Deserialize};

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

/// Check WebDAV server connection and return storage quota
pub async fn check_webdav_status(
    url: &str,
    username: &str,
    password_decrypted: &str,
) -> (String, String, String, Option<f64>) {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .danger_accept_invalid_certs(true) // Accept self-signed certificates
        .build();

    let client = match client {
        Ok(c) => c,
        Err(_) => return ("disconnected".to_string(), "客户端初始化失败".to_string(), "——".to_string(), None),
    };

    // Construct a PROPFIND request to DAV namespace
    let res = client
        .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), url)
        .basic_auth(username, Some(password_decrypted))
        .header("Depth", "0")
        .header("Content-Type", "application/xml; charset=utf-8")
        .body(r#"<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:quota-available-bytes/>
    <d:quota-used-bytes/>
  </d:prop>
</d:propfind>"#)
        .send()
        .await;

    match res {
        Ok(response) => {
            if response.status().is_success() {
                let xml = response.text().await.unwrap_or_default();
                if let Some((available, used)) = parse_quota(&xml) {
                    let total = used + available;
                    let progress = if total > 0 {
                        Some((used as f64 / total as f64) * 100.0)
                    } else {
                        Some(0.0)
                    };
                    return (
                        "connected".to_string(),
                        "已连接".to_string(),
                        format!("{} / {}", format_size(used), format_size(total)),
                        progress,
                    );
                }

                // If quota is not returned, just indicate success
                ("connected".to_string(), "已连接".to_string(), "未知".to_string(), None)
            } else {
                ("disconnected".to_string(), format!("HTTP 错误: {}", response.status().as_u16()), "——".to_string(), None)
            }
        }
        Err(e) => {
            let err_msg = e.to_string();
            let short_err = if err_msg.contains("timeout") {
                "连接超时"
            } else if err_msg.contains("dns") || err_msg.contains("resolve") {
                "域名解析失败"
            } else {
                "无法访问服务器"
            };
            ("disconnected".to_string(), short_err.to_string(), "——".to_string(), None)
        }
    }
}

fn parse_quota(xml: &str) -> Option<(u64, u64)> {
    let available = extract_tag_value(xml, "quota-available-bytes")?;
    let used = extract_tag_value(xml, "quota-used-bytes")?;
    Some((available, used))
}

fn extract_tag_value(xml: &str, tag_name: &str) -> Option<u64> {
    let tag_name_lower = tag_name.to_lowercase();
    let xml_lower = xml.to_lowercase();
    
    let tag_pos = xml_lower.find(&tag_name_lower)?;
    
    let start_search = &xml_lower[..tag_pos];
    let open_bracket_idx = start_search.rfind('<')?;
    
    let tag_open_content = &xml[open_bracket_idx..];
    let close_bracket_relative = tag_open_content.find('>')?;
    let val_start_idx = open_bracket_idx + close_bracket_relative + 1;
    
    let val_content = &xml[val_start_idx..];
    let next_open_bracket = val_content.find('<')?;
    
    let val_str = val_content[..next_open_bracket].trim();
    val_str.parse::<u64>().ok()
}

fn format_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;
    const TB: u64 = GB * 1024;

    if bytes >= TB {
        format!("{:.1} TB", bytes as f64 / TB as f64)
    } else if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
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

pub async fn list_webdav_directory(
    url: &str,
    username: &str,
    password_decrypted: &str,
    path: &str,
) -> Result<Vec<WebDavFile>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| format!("初始化网络客户端失败: {}", e))?;

    let parsed_url = reqwest::Url::parse(url).map_err(|e| format!("解析 URL 失败: {}", e))?;
    let url_path = parsed_url.path().trim_end_matches('/');
    let origin = parsed_url.origin().ascii_serialization();

    let absolute_path = if !url_path.is_empty() && path.starts_with(url_path) {
        path.to_string()
    } else {
        format!("{}/{}", url_path, path.trim_start_matches('/'))
    };

    let encoded_path: String = absolute_path
        .split('/')
        .map(|segment| urlencoding::encode(segment).into_owned())
        .collect::<Vec<String>>()
        .join("/");

    let mut request_url = format!("{}{}", origin, encoded_path);
    if !request_url.ends_with('/') && (path.ends_with('/') || path == "/") {
        request_url.push('/');
    }

    let res = client
        .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &request_url)
        .basic_auth(username, Some(password_decrypted))
        .header("Depth", "1")
        .header("Content-Type", "application/xml; charset=utf-8")
        .body(r#"<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
    <d:getcontentlength/>
    <d:getlastmodified/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>"#)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("服务器返回错误状态码: {}", res.status().as_u16()));
    }

    let xml = res.text().await.map_err(|e| format!("读取响应内容失败: {}", e))?;
    let files = parse_propfind_response(&xml);

    let req_path_decoded = if let Ok(parsed_url) = reqwest::Url::parse(&request_url) {
        let p = parsed_url.path();
        urlencoding::decode(p).ok().map(|s| s.into_owned()).unwrap_or_else(|| p.to_string())
    } else {
        String::new()
    };
    
    let clean_req_path = req_path_decoded.trim_end_matches('/');

    let mut filtered_files = Vec::new();
    for file in files {
        let clean_file_path = file.path.trim_end_matches('/');
        
        // Skip current directory itself
        if clean_file_path == clean_req_path {
            continue;
        }
        
        filtered_files.push(file);
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

pub fn parse_propfind_response(xml: &str) -> Vec<WebDavFile> {
    let mut files = Vec::new();
    let mut search_idx = 0;
    while let Some(start_response) = find_response_start(xml, search_idx) {
        let end_response = match find_response_end(xml, start_response) {
            Some(idx) => idx,
            None => break,
        };
        let block = &xml[start_response..end_response];
        search_idx = end_response;
        if let Some(file) = parse_single_response(block) {
            files.push(file);
        }
    }
    files
}

fn find_response_start(xml: &str, start_from: usize) -> Option<usize> {
    let patterns = ["<response", "<d:response", "<D:response"];
    let mut min_idx = None;
    for pat in patterns {
        if let Some(idx) = xml[start_from..].find(pat) {
            let abs_idx = start_from + idx;
            match min_idx {
                None => min_idx = Some(abs_idx),
                Some(current_min) => {
                    if abs_idx < current_min {
                        min_idx = Some(abs_idx);
                    }
                }
            }
        }
    }
    min_idx
}

fn find_response_end(xml: &str, start_from: usize) -> Option<usize> {
    let patterns = ["</response>", "</d:response>", "</D:response>"];
    for pat in patterns {
        if let Some(idx) = xml[start_from..].find(pat) {
            return Some(start_from + idx + pat.len());
        }
    }
    None
}

fn parse_single_response(block: &str) -> Option<WebDavFile> {
    let href = extract_string_value(block, "href")?;
    let decoded_href = urlencoding::decode(&href).ok()?.into_owned();

    let is_dir = block.contains("<collection")
        || block.contains("<d:collection")
        || block.contains("<D:collection")
        || decoded_href.ends_with('/');

    let name = if let Some(disp) = extract_string_value(block, "displayname") {
        disp
    } else {
        let cleaned_href = decoded_href.trim_end_matches('/');
        if let Some(last_seg) = cleaned_href.split('/').last() {
            last_seg.to_string()
        } else {
            "未命名".to_string()
        }
    };

    let size = if is_dir {
        0
    } else {
        extract_string_value(block, "getcontentlength")
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0)
    };

    let last_modified = extract_string_value(block, "getlastmodified")
        .unwrap_or_else(|| "——".to_string());

    Some(WebDavFile {
        name,
        path: decoded_href,
        is_dir,
        size,
        last_modified,
    })
}

fn extract_string_value(block: &str, tag_name: &str) -> Option<String> {
    let start_patterns = [
        format!("<{}>", tag_name),
        format!("<d:{}>", tag_name),
        format!("<D:{}>", tag_name),
    ];
    let end_patterns = [
        format!("</{}>", tag_name),
        format!("</d:{}>", tag_name),
        format!("</D:{}>", tag_name),
    ];

    for (start, end) in start_patterns.iter().zip(end_patterns.iter()) {
        if let Some(start_idx) = block.find(start) {
            if let Some(end_idx) = block.find(end) {
                return Some(block[start_idx + start.len()..end_idx].trim().to_string());
            }
        }
    }
    None
}
