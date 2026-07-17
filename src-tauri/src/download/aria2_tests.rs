#[cfg(test)]
mod tests {
    use crate::core::state::AppState;
    use crate::core::settings::DownloadBackend;
    use crate::core::models::DbTask;
    use crate::core::state::TaskCreateOptions;

    // A lightweight mock JSON-RPC server using TcpListener
    async fn run_mock_rpc_server() -> (tokio::task::JoinHandle<()>, u16) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        let handle = tokio::spawn(async move {
            while let Ok((mut stream, _)) = listener.accept().await {
                tokio::spawn(async move {
                    use tokio::io::{AsyncReadExt, AsyncWriteExt};
                    let mut buf = [0; 4096];
                    if let Ok(n) = stream.read(&mut buf).await {
                        let request_str = String::from_utf8_lossy(&buf[..n]);
                        
                        let response_body = if request_str.contains("aria2.addUri") {
                            r#"{"jsonrpc":"2.0","id":"pidown","result":"mock_gid_123"}"#
                        } else if request_str.contains("aria2.tellStatus") {
                            r#"{"jsonrpc":"2.0","id":"pidown","result":{"gid":"mock_gid_123","status":"active","totalLength":"1000","completedLength":"500","downloadSpeed":"100","uploadSpeed":"20","connections":"5"}}"#
                        } else if request_str.contains("aria2.pause") || request_str.contains("aria2.unpause") || request_str.contains("aria2.remove") {
                            r#"{"jsonrpc":"2.0","id":"pidown","result":"mock_gid_123"}"#
                        } else {
                            r#"{"jsonrpc":"2.0","id":"pidown","error":{"code":-32601,"message":"Method not found"}}"#
                        };

                        let response = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                            response_body.len(),
                            response_body
                        );
                        let _ = stream.write_all(response.as_bytes()).await;
                    }
                });
            }
        });

        (handle, port)
    }

    #[tokio::test]
    async fn test_aria2_provider_operations() {
        let temp_dir = std::env::temp_dir().join(format!("pidown_test_aria2_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).unwrap();

        // 1. Start mock RPC server
        let (_server_handle, port) = run_mock_rpc_server().await;

        // 2. Initialize AppState
        let state = AppState::new(&temp_dir, &temp_dir).await.unwrap();

        // 3. Update settings to point to our mock RPC server
        let mut settings = state.get_settings();
        settings.download.backend = DownloadBackend::Aria2;
        settings.download.aria2_rpc_url = format!("http://127.0.0.1:{}/jsonrpc", port);
        settings.download.aria2_rpc_secret = "test_secret".to_string();
        settings.download.aria2_port = port;
        state.update_settings(settings).unwrap();

        // 4. Retrieve Aria2DownloadProvider
        let provider = state.providers.get("aria2").expect("Aria2 provider not registered");

        // 5. Test create_task
        let task = DbTask {
            id: "task_123".to_string(),
            engine_id: None,
            name: "test_file.bin".to_string(),
            url: "http://example.com/test_file.bin".to_string(),
            protocol: "http".to_string(),
            save_path: temp_dir.to_string_lossy().to_string(),
            total_size: 0,
            completed_size: 0,
            status: "Pending".to_string(),
            category_id: None,
            created_at: 0,
            started_at: None,
            completed_at: None,
            error_message: None,
            max_download_speed_kib: None,
            max_upload_speed_kib: None,
            dirty: false,
        };
        let options = TaskCreateOptions::default();
        let app_settings = state.get_settings();

        let gid = provider.create_task(&task, options, &app_settings).await.unwrap();
        assert_eq!(gid, "mock_gid_123");

        // 6. Test query_status
        let status_info = provider.query_status(&gid).await.unwrap().unwrap();
        assert_eq!(status_info.status, "Downloading");
        assert_eq!(status_info.total_size, 1000);
        assert_eq!(status_info.completed_size, 500);
        assert_eq!(status_info.download_speed, 100);
        assert_eq!(status_info.upload_speed, 20);
        assert_eq!(status_info.connections, 5);

        // 7. Test pause_task
        assert!(provider.pause_task(&gid).await.is_ok());

        // 8. Test resume_task
        assert!(provider.resume_task(&gid).await.is_ok());

        // 9. Test cancel_task
        assert!(provider.cancel_task(&gid, false).await.is_ok());

        // Cleanup
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
