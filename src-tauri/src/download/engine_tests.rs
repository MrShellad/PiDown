use super::{EngineWrapper, HttpTaskOptions};
use gosh_dl::DownloadState;
use std::time::Duration;

async fn wait_for_state(
    wrapper: &EngineWrapper,
    id: gosh_dl::DownloadId,
    target_state: DownloadState,
    timeout: Duration,
) -> bool {
    let start = std::time::Instant::now();
    while start.elapsed() < timeout {
        if let Some(status) = wrapper.status(id) {
            if status.state == target_state {
                return true;
            }
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    false
}

#[tokio::test]
async fn test_individual_ops_regression() {
    let temp_dir = std::env::temp_dir().join(format!("pidown_test_indiv_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&temp_dir).unwrap();

    let wrapper = EngineWrapper::new(Some(&temp_dir), None).await.unwrap();

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let server_url = format!("http://127.0.0.1:{}/test.bin", port);

    tokio::spawn(async move {
        while let Ok((mut stream, _)) = listener.accept().await {
            tokio::spawn(async move {
                use tokio::io::{AsyncReadExt, AsyncWriteExt};
                let mut buf = [0; 1024];
                let _ = stream.read(&mut buf).await;
                tokio::time::sleep(Duration::from_secs(5)).await;
                let body = "Hello, World!";
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nAccept-Ranges: bytes\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(response.as_bytes()).await;
            });
        }
    });

    let task_options = HttpTaskOptions {
        max_connections: 1,
        max_download_speed: None,
        user_agent: None,
        referer: None,
        cookies: vec![],
    };

    let id = wrapper.add_http(&server_url, &temp_dir, Some("indiv.bin".to_string()), task_options.clone()).await.unwrap();

    assert!(wait_for_state(&wrapper, id, DownloadState::Downloading, Duration::from_secs(5)).await);

    wrapper.pause(id).await.unwrap();
    assert!(wait_for_state(&wrapper, id, DownloadState::Paused, Duration::from_secs(5)).await);

    wrapper.resume(id).await.unwrap();
    assert!(wait_for_state(&wrapper, id, DownloadState::Downloading, Duration::from_secs(5)).await);

    wrapper.cancel(id, true).await.unwrap();
    assert!(wrapper.status(id).is_none());

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[tokio::test]
async fn test_batch_ops() {
    let temp_dir = std::env::temp_dir().join(format!("pidown_test_batch_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&temp_dir).unwrap();

    let wrapper = EngineWrapper::new(Some(&temp_dir), None).await.unwrap();

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let server_url = format!("http://127.0.0.1:{}/test.bin", port);

    tokio::spawn(async move {
        while let Ok((mut stream, _)) = listener.accept().await {
            tokio::spawn(async move {
                use tokio::io::{AsyncReadExt, AsyncWriteExt};
                let mut buf = [0; 1024];
                let _ = stream.read(&mut buf).await;
                tokio::time::sleep(Duration::from_secs(5)).await;
                let body = "Hello, World!";
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nAccept-Ranges: bytes\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(response.as_bytes()).await;
            });
        }
    });

    let task_options = HttpTaskOptions {
        max_connections: 1,
        max_download_speed: None,
        user_agent: None,
        referer: None,
        cookies: vec![],
    };

    let id1 = wrapper.add_http(&server_url, &temp_dir, Some("batch1.bin".to_string()), task_options.clone()).await.unwrap();
    let id2 = wrapper.add_http(&server_url, &temp_dir, Some("batch2.bin".to_string()), task_options.clone()).await.unwrap();

    assert!(wait_for_state(&wrapper, id1, DownloadState::Downloading, Duration::from_secs(5)).await);
    assert!(wait_for_state(&wrapper, id2, DownloadState::Downloading, Duration::from_secs(5)).await);

    let pause_res = wrapper.pause_all().await;
    assert!(pause_res.succeeded.contains(&id1));
    assert!(pause_res.succeeded.contains(&id2));
    assert!(wait_for_state(&wrapper, id1, DownloadState::Paused, Duration::from_secs(5)).await);
    assert!(wait_for_state(&wrapper, id2, DownloadState::Paused, Duration::from_secs(5)).await);

    let resume_res = wrapper.resume_all().await;
    assert!(resume_res.succeeded.contains(&id1));
    assert!(resume_res.succeeded.contains(&id2));
    assert!(wait_for_state(&wrapper, id1, DownloadState::Downloading, Duration::from_secs(5)).await);
    assert!(wait_for_state(&wrapper, id2, DownloadState::Downloading, Duration::from_secs(5)).await);

    let cancel_res = wrapper.cancel_all(true).await;
    assert!(cancel_res.succeeded.contains(&id1));
    assert!(cancel_res.succeeded.contains(&id2));

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[tokio::test]
async fn test_queued_boundary() {
    let temp_dir = std::env::temp_dir().join(format!("pidown_test_queued_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&temp_dir).unwrap();

    let wrapper = EngineWrapper::new(Some(&temp_dir), None).await.unwrap();

    // Set maximum concurrent downloads to 1
    let mut config = wrapper.inner().get_config();
    config.max_concurrent_downloads = 1;
    wrapper.inner().set_config(config).unwrap();

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let server_url = format!("http://127.0.0.1:{}/test.bin", port);

    tokio::spawn(async move {
        while let Ok((mut stream, _)) = listener.accept().await {
            tokio::spawn(async move {
                use tokio::io::{AsyncReadExt, AsyncWriteExt};
                let mut buf = [0; 1024];
                let _ = stream.read(&mut buf).await;
                tokio::time::sleep(Duration::from_secs(5)).await;
                let body = "Hello, World!";
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nAccept-Ranges: bytes\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(response.as_bytes()).await;
            });
        }
    });

    let task_options = HttpTaskOptions {
        max_connections: 1,
        max_download_speed: None,
        user_agent: None,
        referer: None,
        cookies: vec![],
    };

    let id1 = wrapper.add_http(&server_url, &temp_dir, Some("task1.bin".to_string()), task_options.clone()).await.unwrap();
    let id2 = wrapper.add_http(&server_url, &temp_dir, Some("task2.bin".to_string()), task_options.clone()).await.unwrap();

    assert!(wait_for_state(&wrapper, id1, DownloadState::Downloading, Duration::from_secs(5)).await);
    assert!(wait_for_state(&wrapper, id2, DownloadState::Queued, Duration::from_secs(5)).await);

    // Pause the queued task
    wrapper.pause(id2).await.unwrap();
    assert!(wait_for_state(&wrapper, id2, DownloadState::Paused, Duration::from_secs(5)).await);

    // Pause the running task
    wrapper.pause(id1).await.unwrap();
    assert!(wait_for_state(&wrapper, id1, DownloadState::Paused, Duration::from_secs(5)).await);

    let _ = wrapper.cancel(id1, true).await;
    let _ = wrapper.cancel(id2, true).await;
    let _ = std::fs::remove_dir_all(&temp_dir);
}
