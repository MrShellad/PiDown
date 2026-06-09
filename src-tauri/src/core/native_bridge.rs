use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use crate::core::state::AppState;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

const BRIDGE_STATE_FILE_NAME: &str = "native-bridge.json";
const MAX_NATIVE_MESSAGE_BYTES: usize = 1024 * 1024;
const MAX_HTTP_BODY_BYTES: usize = 1024 * 1024;
const HEADER_LIMIT_BYTES: usize = 16 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BridgeStateFile {
    version: u32,
    host: String,
    port: u16,
    token: String,
    pid: u32,
    created_at: i64,
}

#[derive(Debug, Deserialize)]
struct BridgeHttpRequest {
    token: String,
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
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeDownload {
    url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExternalDownloadRequestPayload {
    url: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct NativeResponse {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    gid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

impl NativeResponse {
    fn ok() -> Self {
        Self {
            ok: true,
            gid: None,
            error: None,
        }
    }

    fn error(error: impl Into<String>) -> Self {
        Self {
            ok: false,
            gid: None,
            error: Some(error.into()),
        }
    }
}

pub fn start_native_bridge_server(
    app_data_dir: PathBuf,
    app_handle: AppHandle,
) -> Result<(), String> {
    remove_bridge_state(&app_data_dir)?;

    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|e| format!("Failed to bind native bridge: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to read native bridge address: {e}"))?
        .port();
    let token = Uuid::new_v4().to_string();

    write_bridge_state(
        &app_data_dir,
        &BridgeStateFile {
            version: 1,
            host: "127.0.0.1".to_string(),
            port,
            token: token.clone(),
            pid: std::process::id(),
            created_at: unix_timestamp(),
        },
    )?;

    std::thread::Builder::new()
        .name("pidownloader-native-bridge".to_string())
        .spawn(move || {
            for stream in listener.incoming() {
                match stream {
                    Ok(stream) => handle_bridge_stream(stream, app_handle.clone(), token.clone()),
                    Err(error) => log::warn!("Native bridge connection failed: {error}"),
                }
            }
        })
        .map_err(|e| format!("Failed to start native bridge thread: {e}"))?;

    Ok(())
}

pub fn remove_bridge_state(app_data_dir: &Path) -> Result<(), String> {
    let path = bridge_state_path(app_data_dir);
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

pub fn run_native_host(app_data_dir: &Path) -> Result<(), String> {
    let mut stdin = std::io::stdin().lock();
    let mut stdout = std::io::stdout().lock();

    loop {
        let Some(message) = read_native_message(&mut stdin)? else {
            return Ok(());
        };
        let response = forward_native_message(app_data_dir, message);
        write_native_message(&mut stdout, &response)?;
        stdout.flush().map_err(|e| e.to_string())?;
    }
}

fn handle_bridge_stream(mut stream: TcpStream, app_handle: AppHandle, token: String) {
    let response = match read_http_request(&mut stream) {
        Ok(request) => match request {
            ParsedHttpRequest::PostBridge(body) => handle_bridge_body(&app_handle, &token, body),
            ParsedHttpRequest::Unsupported => NativeResponse::error("Unsupported request"),
        },
        Err(error) => NativeResponse::error(error),
    };

    let _ = write_http_response(&mut stream, &response);
}

fn handle_bridge_body(
    app_handle: &AppHandle,
    expected_token: &str,
    body: Vec<u8>,
) -> NativeResponse {
    let request = match serde_json::from_slice::<BridgeHttpRequest>(&body) {
        Ok(request) => request,
        Err(error) => return NativeResponse::error(format!("Invalid bridge request: {error}")),
    };

    if request.token != expected_token {
        return NativeResponse::error("Native bridge token mismatch");
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

            let payload = ExternalDownloadRequestPayload { url };

            focus_main_window(app_handle);

            match app_handle.emit("external-download-request", payload) {
                Ok(()) => NativeResponse::ok(),
                Err(error) => NativeResponse::error(format!(
                    "Failed to open new download task dialog: {error}"
                )),
            }
        }
    }
}

fn focus_main_window(app_handle: &AppHandle) {
    let Some(window) = app_handle.get_webview_window("main") else {
        return;
    };

    if let Err(error) = window.show() {
        log::warn!("Failed to show main window for external download request: {error}");
    }
    if let Err(error) = window.set_focus() {
        log::warn!("Failed to focus main window for external download request: {error}");
    }
}

fn forward_native_message(app_data_dir: &Path, message: Value) -> NativeResponse {
    let bridge = match read_bridge_state(app_data_dir) {
        Ok(bridge) => bridge,
        Err(error) => {
            let _ = remove_bridge_state(app_data_dir);
            return NativeResponse::error(error);
        }
    };

    let mut payload = match message {
        Value::Object(map) => map,
        _ => return NativeResponse::error("Native message must be a JSON object"),
    };
    payload.insert("token".to_string(), Value::String(bridge.token));

    let body = match serde_json::to_vec(&Value::Object(payload)) {
        Ok(body) => body,
        Err(error) => return NativeResponse::error(format!("Failed to encode request: {error}")),
    };

    match post_bridge_request(&bridge.host, bridge.port, &body) {
        Ok(response) => response,
        Err(error) => {
            let _ = remove_bridge_state(app_data_dir);
            NativeResponse::error(error)
        }
    }
}

fn read_bridge_state(app_data_dir: &Path) -> Result<BridgeStateFile, String> {
    let path = bridge_state_path(app_data_dir);
    let raw = std::fs::read_to_string(&path)
        .map_err(|_| "PiDownloader is not running or native bridge is unavailable".to_string())?;
    serde_json::from_str(&raw).map_err(|e| format!("Invalid native bridge state: {e}"))
}

fn write_bridge_state(app_data_dir: &Path, state: &BridgeStateFile) -> Result<(), String> {
    std::fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
    let raw = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    std::fs::write(bridge_state_path(app_data_dir), raw).map_err(|e| e.to_string())
}

fn bridge_state_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(BRIDGE_STATE_FILE_NAME)
}

fn post_bridge_request(host: &str, port: u16, body: &[u8]) -> Result<NativeResponse, String> {
    let mut stream = TcpStream::connect((host, port)).map_err(|e| {
        format!(
            "PiDownloader native bridge is stale or unavailable at {host}:{port}: {e}. Please restart PiDownloader."
        )
    })?;
    stream
        .set_read_timeout(Some(Duration::from_secs(6)))
        .map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(6)))
        .map_err(|e| e.to_string())?;

    let request = format!(
        "POST /native-bridge HTTP/1.1\r\nHost: {host}:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream
        .write_all(request.as_bytes())
        .and_then(|_| stream.write_all(body))
        .map_err(|e| e.to_string())?;

    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .map_err(|e| e.to_string())?;
    parse_http_response(&response)
}

enum ParsedHttpRequest {
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

fn parse_http_response(response: &[u8]) -> Result<NativeResponse, String> {
    let header_end =
        find_header_end(response).ok_or_else(|| "Invalid bridge response".to_string())?;
    let header = std::str::from_utf8(&response[..header_end])
        .map_err(|_| "Bridge response headers must be UTF-8".to_string())?;
    if !header.starts_with("HTTP/1.1 200") {
        return Err("Native bridge rejected request".to_string());
    }
    let body = &response[header_end + 4..];
    serde_json::from_slice(body).map_err(|e| format!("Invalid bridge response body: {e}"))
}

fn write_http_response(stream: &mut TcpStream, response: &NativeResponse) -> Result<(), String> {
    let body = serde_json::to_vec(response).map_err(|e| e.to_string())?;
    let header = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
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

fn read_native_message<R: Read>(reader: &mut R) -> Result<Option<Value>, String> {
    let mut length_bytes = [0u8; 4];
    match reader.read_exact(&mut length_bytes) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(error) => return Err(error.to_string()),
    }

    let length = u32::from_le_bytes(length_bytes) as usize;
    if length > MAX_NATIVE_MESSAGE_BYTES {
        return Err("Native message is too large".to_string());
    }

    let mut body = vec![0u8; length];
    reader.read_exact(&mut body).map_err(|e| e.to_string())?;
    serde_json::from_slice(&body)
        .map(Some)
        .map_err(|e| format!("Invalid native message JSON: {e}"))
}

fn write_native_message<W: Write>(writer: &mut W, response: &NativeResponse) -> Result<(), String> {
    let body = serde_json::to_vec(response).map_err(|e| e.to_string())?;
    let length =
        u32::try_from(body.len()).map_err(|_| "Native response is too large".to_string())?;
    writer
        .write_all(&length.to_le_bytes())
        .and_then(|_| writer.write_all(&body))
        .map_err(|e| e.to_string())
}

fn is_supported_url(url: &str) -> bool {
    let lower = url.trim().to_ascii_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://")
}

fn unix_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_message_roundtrip_uses_chrome_length_prefix() {
        let response = NativeResponse::ok();
        let mut buffer = Vec::new();
        write_native_message(&mut buffer, &response).unwrap();

        let mut cursor = std::io::Cursor::new(buffer);
        let message = read_native_message(&mut cursor).unwrap().unwrap();

        assert_eq!(message["ok"], true);
        assert!(message.get("gid").is_none());
    }

    #[test]
    fn unsupported_urls_are_rejected() {
        assert!(is_supported_url("https://example.com/file.zip"));
        assert!(is_supported_url("http://example.com/file.zip"));
        assert!(!is_supported_url("file:///tmp/file.zip"));
        assert!(!is_supported_url("chrome-extension://id/file.zip"));
    }
}
