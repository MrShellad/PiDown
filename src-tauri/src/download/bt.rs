use std::path::PathBuf;
use gosh_dl::torrent::{Metainfo, MagnetUri};
use super::DownloadInspection;

/// Fetch torrent file bytes from a local file path, file:/// URL, or remote HTTP/HTTPS link.
pub async fn fetch_torrent_bytes(
    url: &str,
    ignore_ssl: bool,
    user_agent: Option<String>,
    referer: Option<String>,
    cookies: Vec<String>,
    max_retries: usize,
) -> Result<Vec<u8>, String> {
    let mut target_url = url.trim().to_string();
    if target_url.to_lowercase().starts_with("torrent:") {
        target_url = target_url["torrent:".len()..].to_string();
    }

    if target_url.to_lowercase().starts_with("http://") || target_url.to_lowercase().starts_with("https://") {
        let mut client_builder = reqwest::Client::builder()
            .danger_accept_invalid_certs(ignore_ssl);
        if let Some(ua) = user_agent {
            client_builder = client_builder.user_agent(ua);
        }
        let client = client_builder.build()
            .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

        let mut last_err = None;
        for attempt in 0..=max_retries {
            if attempt > 0 {
                tokio::time::sleep(std::time::Duration::from_millis(500 * attempt as u64)).await;
            }

            let mut req_builder = super::apply_basic_auth_if_present(client.get(&target_url), &target_url);
            if let Some(ref ref_val) = referer {
                req_builder = req_builder.header(reqwest::header::REFERER, ref_val);
            }
            if !cookies.is_empty() {
                let cookie_str = cookies.join("; ");
                req_builder = req_builder.header(reqwest::header::COOKIE, cookie_str);
            }

            match req_builder.send().await {
                Ok(response) => {
                    if !response.status().is_success() {
                        last_err = Some(format!("HTTP status error: {}", response.status()));
                        continue;
                    }
                    match response.bytes().await {
                        Ok(bytes) => return Ok(bytes.to_vec()),
                        Err(e) => {
                            last_err = Some(format!("Failed to read response body: {}", e));
                        }
                    }
                }
                Err(e) => {
                    last_err = Some(format!("Failed to send request: {}", e));
                }
            }
        }
        Err(last_err.unwrap_or_else(|| "Failed to download torrent file after retries".to_string()))
    } else {
        // Local file path
        let path_buf = if target_url.to_lowercase().starts_with("file:///") {
            let parsed = reqwest::Url::parse(&target_url)
                .map_err(|e| format!("Invalid file URL: {}", e))?;
            parsed.to_file_path()
                .map_err(|_| "Invalid local file path".to_string())?
        } else {
            PathBuf::from(target_url)
        };

        std::fs::read(&path_buf)
            .map_err(|e| format!("Failed to read local torrent file {}: {}", path_buf.display(), e))
    }
}

/// Inspect magnet URI metadata.
pub fn inspect_magnet(url: &str) -> Result<DownloadInspection, String> {
    let magnet = MagnetUri::parse(url)
        .map_err(|e| format!("Invalid magnet link: {}", e))?;
    Ok(DownloadInspection {
        filename: Some(magnet.name()),
        total_size: magnet.exact_length,
        is_torrent: true,
        files: None,
        info_hash: Some(magnet.info_hash_hex()),
        is_private: Some(false), // A magnet URI doesn't contain the private flag until metadata is downloaded
    })
}

/// Inspect local or remote torrent file metadata.
pub async fn inspect_torrent(
    url: &str,
    ignore_ssl: bool,
    user_agent: Option<String>,
    referer: Option<String>,
    cookies: Vec<String>,
    max_retries: usize,
) -> Result<DownloadInspection, String> {
    let bytes = fetch_torrent_bytes(url, ignore_ssl, user_agent, referer, cookies, max_retries).await?;
    let metainfo = Metainfo::parse(&bytes)
        .map_err(|e| format!("Invalid torrent file: {}", e))?;
    let files = metainfo.info.files.iter().map(|file| {
        super::TorrentFileInspection {
            path: file.path.to_string_lossy().replace('\\', "/"),
            size: file.length,
        }
    }).collect();
    let info_hash = metainfo.info_hash.iter().map(|b| format!("{:02x}", b)).collect::<String>();
    Ok(DownloadInspection {
        filename: Some(metainfo.info.name),
        total_size: Some(metainfo.info.total_size),
        is_torrent: true,
        files: Some(files),
        info_hash: Some(info_hash),
        is_private: Some(metainfo.info.private),
    })
}

/// Append default trackers to a torrent bencode payload.
pub fn append_trackers_to_torrent(bytes: &[u8], extra_trackers: &[String]) -> Result<Vec<u8>, String> {
    if extra_trackers.is_empty() {
        return Ok(bytes.to_vec());
    }

    let mut value: serde_bencode::value::Value = serde_bencode::from_bytes(bytes)
        .map_err(|e| format!("Failed to parse torrent bencode: {}", e))?;

    if let serde_bencode::value::Value::Dict(ref mut dict) = value {
        let announce_list_key = b"announce-list".to_vec();
        
        let mut new_announce_list = if let Some(serde_bencode::value::Value::List(list)) = dict.get(&announce_list_key) {
            list.clone()
        } else {
            Vec::new()
        };

        let announce_key = b"announce".to_vec();
        if new_announce_list.is_empty() {
            if let Some(serde_bencode::value::Value::Bytes(ann)) = dict.get(&announce_key) {
                new_announce_list.push(serde_bencode::value::Value::List(vec![
                    serde_bencode::value::Value::Bytes(ann.clone())
                ]));
            }
        }

        for tr in extra_trackers {
            if !tr.trim().is_empty() {
                new_announce_list.push(serde_bencode::value::Value::List(vec![
                    serde_bencode::value::Value::Bytes(tr.trim().as_bytes().to_vec())
                ]));
            }
        }

        dict.insert(announce_list_key, serde_bencode::value::Value::List(new_announce_list));

        if !dict.contains_key(&announce_key) && !extra_trackers.is_empty() {
            dict.insert(
                announce_key,
                serde_bencode::value::Value::Bytes(extra_trackers[0].trim().as_bytes().to_vec())
            );
        }
    }

    serde_bencode::to_bytes(&value)
        .map_err(|e| format!("Failed to serialize modified torrent bencode: {}", e))
}

