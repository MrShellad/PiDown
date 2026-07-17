use crate::core::models::DbTask;
use crate::core::state::{AppState, TaskCreateOptions};
use crate::download::provider::{DownloadProvider, DownloadProgressInfo};
use crate::download::detect_protocol;
use std::sync::Weak;
use serde::Deserialize;
use serde_json::{json, Value};

pub struct Aria2DownloadProvider {
    state: Weak<AppState>,
}

impl Aria2DownloadProvider {
    pub fn new(state: Weak<AppState>) -> Self {
        Self { state }
    }

    async fn call_rpc<T>(&self, method: &str, params: Value) -> Result<T, String>
    where
        for<'de> T: Deserialize<'de>,
    {
        let state = self.state.upgrade().ok_or_else(|| "AppState dropped".to_string())?;
        
        let (rpc_url, secret) = {
            let settings = state.get_settings();
            (settings.download.aria2_rpc_url.clone(), settings.download.aria2_rpc_secret.clone())
        };



        // Add token parameter to params array if secret is present
        let mut final_params = vec![json!(format!("token:{}", secret))];
        if let Some(params_arr) = params.as_array() {
            final_params.extend(params_arr.clone());
        } else if !params.is_null() {
            final_params.push(params);
        }

        let payload = json!({
            "jsonrpc": "2.0",
            "id": "pidown",
            "method": method,
            "params": final_params
        });

        let response = match state.http_client
            .post(&rpc_url)
            .json(&payload)
            .send()
            .await {
                Ok(resp) => resp,
                Err(_) => {
                    // Try to start aria2 engine once if installed
                    if state.aria2_engine.check_install() {
                        let settings = state.get_settings();
                        let _ = state.aria2_engine.start(settings.download.aria2_port, &settings.download.aria2_rpc_secret).await;
                        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                    }
                    
                    // Retry HTTP RPC request
                    state.http_client
                        .post(&rpc_url)
                        .json(&payload)
                        .send()
                        .await
                        .map_err(|e| format!("无法连接本地 Aria2 服务 ({})。请在设置中检查/安装 Aria2 引擎，或暂切至备份引擎。错误: {}", rpc_url, e))?
                }
            };

        if !response.status().is_success() {
            return Err(format!("RPC server returned HTTP error: {}", response.status()));
        }

        let resp_json: Value = response.json().await.map_err(|e| format!("Failed to parse RPC response: {}", e))?;

        if let Some(error) = resp_json.get("error") {
            let message = error.get("message").and_then(|m| m.as_str()).unwrap_or("Unknown RPC error");
            return Err(message.to_string());
        }

        let result = resp_json.get("result").ok_or_else(|| "Missing result in RPC response".to_string())?;
        serde_json::from_value(result.clone()).map_err(|e| format!("Failed to deserialize RPC result: {}", e))
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct Aria2File {
    path: String,
    length: String,
    completed_length: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct Aria2TaskStatus {
    gid: String,
    status: String,
    total_length: String,
    completed_length: String,
    download_speed: String,
    upload_speed: String,
    connections: String,
    error_code: Option<String>,
    error_message: Option<String>,
    files: Option<Vec<Aria2File>>,
}

#[async_trait::async_trait]
impl DownloadProvider for Aria2DownloadProvider {
    fn protocol(&self) -> &'static str {
        "aria2"
    }

    async fn create_task(
        &self,
        task: &DbTask,
        options: TaskCreateOptions,
        settings: &crate::core::settings::AppSettings,
    ) -> Result<String, String> {
        let mut aria2_opts = json!({
            "dir": task.save_path,
        });

        // Set filename/out name if present
        if !task.name.is_empty() {
            aria2_opts.as_object_mut().unwrap().insert("out".to_string(), json!(task.name));
        }

        // Map max connection per server / split options
        if let Some(max_conn) = options.max_connections {
            let split_val = max_conn.clamp(1, 16);
            aria2_opts.as_object_mut().unwrap().insert("split".to_string(), json!(split_val.to_string()));
            aria2_opts.as_object_mut().unwrap().insert("max-connection-per-server".to_string(), json!(split_val.to_string()));
        } else {
            let split_val = settings.transfer.task_thread_count.clamp(1, 16);
            aria2_opts.as_object_mut().unwrap().insert("split".to_string(), json!(split_val.to_string()));
            aria2_opts.as_object_mut().unwrap().insert("max-connection-per-server".to_string(), json!(split_val.to_string()));
        }

        // Map referer
        if let Some(ref ref_val) = options.referer {
            if !ref_val.trim().is_empty() {
                aria2_opts.as_object_mut().unwrap().insert("referer".to_string(), json!(ref_val.trim()));
            }
        }

        // Map user agent
        let ua = options.user_agent.clone()
            .unwrap_or_else(|| settings.download.global_user_agent.clone());
        if !ua.trim().is_empty() {
            aria2_opts.as_object_mut().unwrap().insert("user-agent".to_string(), json!(ua.trim()));
        }

        // Map cookies
        if !options.cookies.is_empty() {
            let cookies_str = options.cookies.join("; ");
            aria2_opts.as_object_mut().unwrap().insert("header".to_string(), json!(vec![format!("Cookie: {}", cookies_str)]));
        }

        // Map speed limits
        if let Some(max_dl) = options.max_download_speed_kib {
            if max_dl > 0 {
                aria2_opts.as_object_mut().unwrap().insert("max-download-limit".to_string(), json!(format!("{}K", max_dl)));
            }
        }
        if let Some(max_ul) = options.max_upload_speed_kib {
            if max_ul > 0 {
                aria2_opts.as_object_mut().unwrap().insert("max-upload-limit".to_string(), json!(format!("{}K", max_ul)));
            }
        }

        // Pause task initially if auto_start is false
        if !settings.download.auto_start_downloads {
            aria2_opts.as_object_mut().unwrap().insert("pause".to_string(), json!("true"));
        }

        let protocol = detect_protocol(&task.url);
        let gid: String = match protocol {
            crate::download::DownloadProtocol::Http | crate::download::DownloadProtocol::Https => {
                let uris = vec![task.url.clone()];
                self.call_rpc("aria2.addUri", json!([uris, aria2_opts])).await?
            }
            crate::download::DownloadProtocol::Magnet => {
                let uris = vec![task.url.clone()];
                self.call_rpc("aria2.addUri", json!([uris, aria2_opts])).await?
            }
            crate::download::DownloadProtocol::Torrent => {
                let ignore_ssl = settings.transfer.ignore_ssl_certificate;
                let ua_opt = Some(ua.clone()).filter(|s| !s.trim().is_empty());
                let referer_opt = options.referer.clone().filter(|s| !s.trim().is_empty());
                let cookies_opt = if options.cookies.is_empty() { vec![] } else { options.cookies.clone() };
                let max_retries = settings.transfer.max_download_retries as usize;

                let torrent_bytes = crate::download::bt::fetch_torrent_bytes(
                    &task.url,
                    ignore_ssl,
                    ua_opt,
                    referer_opt,
                    cookies_opt,
                    max_retries,
                ).await?;

                let torrent_base64 = base64::Engine::encode(&base64::prelude::BASE64_STANDARD, &torrent_bytes);
                self.call_rpc("aria2.addTorrent", json!([torrent_base64, Value::Array(vec![]), aria2_opts])).await?
            }
            _ => return Err("Unsupported protocol by aria2 engine".to_string()),
        };

        Ok(gid)
    }

    async fn pause_task(&self, gid: &str) -> Result<(), String> {
        let _: String = self.call_rpc("aria2.pause", json!([gid])).await?;
        Ok(())
    }

    async fn resume_task(&self, gid: &str) -> Result<(), String> {
        let _: String = self.call_rpc("aria2.unpause", json!([gid])).await?;
        Ok(())
    }

    async fn cancel_task(&self, gid: &str, _delete_files: bool) -> Result<(), String> {
        // We use aria2.remove to stop/remove the download task.
        // Files cleanup is done by the caller in task_service.rs (via cleanup_task_files).
        let _: String = self.call_rpc("aria2.remove", json!([gid])).await?;
        Ok(())
    }

    async fn query_status(&self, gid: &str) -> Result<Option<DownloadProgressInfo>, String> {
        let status: Aria2TaskStatus = match self.call_rpc("aria2.tellStatus", json!([gid])).await {
            Ok(s) => s,
            Err(e) => {
                if e.contains("not found") {
                    return Ok(None);
                }
                return Err(e);
            }
        };

        let completed_size = status.completed_length.parse::<u64>().unwrap_or(0);
        let total_size = status.total_length.parse::<u64>().unwrap_or(0);
        let download_speed = status.download_speed.parse::<u64>().unwrap_or(0);
        let upload_speed = status.upload_speed.parse::<u64>().unwrap_or(0);
        let connections = status.connections.parse::<u32>().unwrap_or(0);

        let state_str = match status.status.as_str() {
            "active" => "Downloading",
            "waiting" => "Pending",
            "paused" => "Paused",
            "complete" => "Completed",
            "error" => "Failed",
            _ => "Pending",
        };

        Ok(Some(DownloadProgressInfo {
            completed_size,
            total_size,
            download_speed,
            upload_speed,
            connections,
            status: state_str.to_string(),
        }))
    }
}
