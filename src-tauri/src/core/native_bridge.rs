use crate::core::state::AppState;
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const MAX_HTTP_BODY_BYTES: usize = 1024 * 1024;
const HEADER_LIMIT_BYTES: usize = 16 * 1024;

#[derive(Debug, Deserialize)]
struct BridgeHttpRequest {
    token: Option<String>,
    #[serde(flatten)]
    message: NativeRequest,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum NativeRequest {
    #[serde(rename = "ping")]
    Ping {},
    #[serde(rename = "create_task")]
    CreateTask { download: NativeDownload },
    #[serde(rename = "request_pairing")]
    RequestPairing {
        #[serde(rename = "deviceName")]
        device_name: Option<String>,
    },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeDownload {
    url: Option<String>,
    filename: Option<String>,
    #[serde(alias = "totalSize")]
    total_size: Option<u64>,
    #[serde(alias = "userAgent")]
    user_agent: Option<String>,
    referer: Option<String>,
    cookies: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct NativeResponse {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    gid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

impl NativeResponse {
    fn ok() -> Self {
        Self {
            ok: true,
            gid: None,
            token: None,
            error: None,
        }
    }

    fn error(error: impl Into<String>) -> Self {
        Self {
            ok: false,
            gid: None,
            token: None,
            error: Some(error.into()),
        }
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExternalDownloadRequestPayload {
    url: String,
    filename: Option<String>,
    user_agent: Option<String>,
    referer: Option<String>,
    cookies: Vec<String>,
    total_size: Option<u64>,
}

pub fn start_native_bridge_server(
    _app_data_dir: PathBuf,
    app_handle: AppHandle,
) -> Result<(), String> {
    let state = app_handle
        .try_state::<Arc<AppState>>()
        .ok_or_else(|| "PiDownloader AppState is unavailable".to_string())?;

    let settings = state.get_settings();
    let port = settings.download.browser_extension_port;

    let listener = TcpListener::bind(("127.0.0.1", port))
        .map_err(|e| format!("Failed to bind native bridge HTTP server on port {port}: {e}"))?;

    std::thread::Builder::new()
        .name("pidownloader-native-bridge".to_string())
        .spawn(move || {
            for stream in listener.incoming() {
                match stream {
                    Ok(stream) => {
                        let app_handle_clone = app_handle.clone();
                        tauri::async_runtime::spawn_blocking(move || {
                            handle_bridge_stream(stream, app_handle_clone);
                        });
                    }
                    Err(error) => log::warn!("Native bridge connection failed: {error}"),
                }
            }
        })
        .map_err(|e| format!("Failed to start native bridge thread: {e}"))?;

    Ok(())
}

fn handle_bridge_stream(mut stream: TcpStream, app_handle: AppHandle) {
    match read_http_request(&mut stream) {
        Ok(request) => match request {
            ParsedHttpRequest::Options => {
                let _ = write_options_response(&mut stream);
            }
            ParsedHttpRequest::PostBridge(body) => {
                let response = handle_bridge_body(&app_handle, body);
                let _ = write_http_response(&mut stream, &response);
            }
            ParsedHttpRequest::Unsupported => {
                let response = NativeResponse::error("Unsupported request");
                let _ = write_http_response(&mut stream, &response);
            }
        },
        Err(error) => {
            let response = NativeResponse::error(error);
            let _ = write_http_response(&mut stream, &response);
        }
    }
}

fn handle_bridge_body(
    app_handle: &AppHandle,
    body: Vec<u8>,
) -> NativeResponse {
    let request = match serde_json::from_slice::<BridgeHttpRequest>(&body) {
        Ok(request) => request,
        Err(error) => return NativeResponse::error(format!("Invalid bridge request: {error}")),
    };

    let Some(state) = app_handle.try_state::<Arc<AppState>>() else {
        return NativeResponse::error("PiDownloader state is unavailable");
    };

    let is_pairing_request = matches!(request.message, NativeRequest::RequestPairing { .. });

    if !is_pairing_request {
        let expected_token = state.get_settings().download.browser_extension_token.clone();
        let request_token = request.token.unwrap_or_default();
        if request_token != expected_token {
            return NativeResponse::error("Native bridge token mismatch");
        }
    }

    handle_native_request(app_handle, request.message)
}

fn handle_native_request(app_handle: &AppHandle, request: NativeRequest) -> NativeResponse {
    match request {
        NativeRequest::Ping {} => NativeResponse::ok(),
        NativeRequest::CreateTask { download } => {
            let Some(state) = app_handle.try_state::<Arc<AppState>>() else {
                return NativeResponse::error("PiDownloader state is unavailable");
            };

            if !state.get_settings().download.browser_extension_integration_enabled {
                return NativeResponse::error("Browser extension integration is disabled");
            }

            let url = download.url.unwrap_or_default();
            let url = url.trim().to_string();
            if !is_supported_url(&url) {
                return NativeResponse::error("Unsupported or missing download URL");
            }

            let payload = ExternalDownloadRequestPayload {
                url,
                filename: download.filename,
                user_agent: download.user_agent,
                referer: download.referer,
                cookies: download.cookies.unwrap_or_default(),
                total_size: download.total_size,
            };

            match app_handle.emit("external-download-request", payload) {
                Ok(_) => {
                    if let Some(float_win) = app_handle.get_webview_window("float") {
                        let _ = float_win.show();
                        let _ = float_win.unminimize();
                        let _ = float_win.set_focus();
                    }
                    NativeResponse::ok()
                }
                Err(error) => {
                    log::error!("Failed to emit external-download-request: {}", error);
                    NativeResponse::error(format!("Failed to emit download request event: {error}"))
                }
            }
        }
        NativeRequest::RequestPairing { device_name } => {
            let Some(state) = app_handle.try_state::<Arc<AppState>>() else {
                return NativeResponse::error("PiDownloader state is unavailable");
            };

            if !state.get_settings().download.browser_extension_integration_enabled {
                return NativeResponse::error("Browser extension integration is disabled");
            }

            let device = device_name.unwrap_or_else(|| "浏览器扩展".to_string());
            let title = "PiDownloader 浏览器扩展配对";
            let description = format!(
                "检测到本地设备正在尝试连接桌面客户端：\n设备名称：{}\n\n是否允许该设备获取连接 Token 并管理下载任务？",
                device
            );

            // Pop up OS native confirmation dialog
            let result = rfd::MessageDialog::new()
                .set_title(title)
                .set_description(description)
                .set_buttons(rfd::MessageButtons::YesNo)
                .set_level(rfd::MessageLevel::Info)
                .show();

            if result == rfd::MessageDialogResult::Yes {
                let token = state.get_settings().download.browser_extension_token.clone();
                NativeResponse {
                    ok: true,
                    gid: None,
                    token: Some(token),
                    error: None,
                }
            } else {
                NativeResponse::error("用户拒绝了配对请求")
            }
        }
    }
}

enum ParsedHttpRequest {
    Options,
    PostBridge(Vec<u8>),
    Unsupported,
}

fn read_http_request(stream: &mut TcpStream) -> Result<ParsedHttpRequest, String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(6)))
        .map_err(|e| e.to_string())?;

    let mut buffer = Vec::new();
    let mut temp = [0u8; 1024];
    let header_end;
    loop {
        let read = stream.read(&mut temp).map_err(|e| e.to_string())?;
        if read == 0 {
            return Err("Incomplete bridge request".to_string());
        }
        buffer.extend_from_slice(&temp[..read]);
        if buffer.len() > HEADER_LIMIT_BYTES {
            return Err("Bridge request headers are too large".to_string());
        }
        if let Some(index) = find_header_end(&buffer) {
            header_end = index;
            break;
        }
    }

    let headers = std::str::from_utf8(&buffer[..header_end])
        .map_err(|_| "Bridge request headers must be UTF-8".to_string())?;
    let mut lines = headers.lines();
    let request_line = lines.next().unwrap_or_default();
    
    if request_line.starts_with("OPTIONS /native-bridge HTTP/1.1") {
        return Ok(ParsedHttpRequest::Options);
    }
    if request_line != "POST /native-bridge HTTP/1.1" {
        return Ok(ParsedHttpRequest::Unsupported);
    }

    let content_length = parse_content_length(headers)?;
    if content_length > MAX_HTTP_BODY_BYTES {
        return Err("Bridge request body is too large".to_string());
    }

    let body_start = header_end + 4;
    while buffer.len().saturating_sub(body_start) < content_length {
        let read = stream.read(&mut temp).map_err(|e| e.to_string())?;
        if read == 0 {
            return Err("Incomplete bridge request body".to_string());
        }
        buffer.extend_from_slice(&temp[..read]);
    }

    Ok(ParsedHttpRequest::PostBridge(
        buffer[body_start..body_start + content_length].to_vec(),
    ))
}

fn write_options_response(stream: &mut TcpStream) -> Result<(), String> {
    let response = "HTTP/1.1 204 No Content\r\n\
                    Access-Control-Allow-Origin: *\r\n\
                    Access-Control-Allow-Methods: POST, OPTIONS\r\n\
                    Access-Control-Allow-Headers: Content-Type, Authorization, X-PiDownloader-Token\r\n\
                    Connection: close\r\n\
                    \r\n";
    stream.write_all(response.as_bytes()).map_err(|e| e.to_string())
}

fn write_http_response(stream: &mut TcpStream, response: &NativeResponse) -> Result<(), String> {
    let body = serde_json::to_vec(response).map_err(|e| e.to_string())?;
    let header = format!(
        "HTTP/1.1 200 OK\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Connection: close\r\n\r\n",
        body.len()
    );
    stream
        .write_all(header.as_bytes())
        .and_then(|_| stream.write_all(&body))
        .map_err(|e| e.to_string())
}

fn parse_content_length(headers: &str) -> Result<usize, String> {
    headers
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            if name.eq_ignore_ascii_case("content-length") {
                value.trim().parse::<usize>().ok()
            } else {
                None
            }
        })
        .ok_or_else(|| "Missing Content-Length header".to_string())
}

fn find_header_end(buffer: &[u8]) -> Option<usize> {
    buffer.windows(4).position(|window| window == b"\r\n\r\n")
}

fn is_supported_url(url: &str) -> bool {
    let lower = url.trim().to_ascii_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unsupported_urls_are_rejected() {
        assert!(is_supported_url("https://example.com/file.zip"));
        assert!(is_supported_url("http://example.com/file.zip"));
        assert!(!is_supported_url("file:///tmp/file.zip"));
        assert!(!is_supported_url("chrome-extension://id/file.zip"));
    }
}
