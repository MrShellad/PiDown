use crate::core::state::AppState;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::path::{Path, PathBuf};
use reqwest::header::{HeaderMap, HeaderValue, COOKIE, USER_AGENT, REFERER};
use reqwest::Url;
use m3u8_rs::Playlist;
use tauri::Emitter;

fn update_task_error(state: &AppState, gid: &str, error_msg: &str) {
    log::error!("HLS download error for task {}: {}", gid, error_msg);
    if let Some(task) = state.task_cache.write().unwrap().get_mut(gid) {
        task.status = "Failed".to_string();
        task.error_message = Some(error_msg.to_string());
        task.completed_at = Some(chrono::Utc::now().timestamp());
        task.dirty = true;
    }
    let _ = state.db.update_task_status(gid, "Failed", Some(chrono::Utc::now().timestamp()));
    let _ = state.db.update_task_error(gid, Some(error_msg));

    state.hls_speeds.lock().unwrap().remove(gid);
    state.hls_cancel_tokens.lock().unwrap().remove(gid);

    if let Some(ref app_handle) = *state.app_handle.lock().unwrap() {
        let _ = app_handle.emit("download-task-updated", serde_json::json!({ "gid": gid }));
        let _ = app_handle.emit("play-sound", "warning");
    }
}

fn update_task_completed(state: &AppState, gid: &str) {
    log::info!("HLS download completed successfully for task {}", gid);
    if let Some(task) = state.task_cache.write().unwrap().get_mut(gid) {
        task.status = "Completed".to_string();
        task.completed_at = Some(chrono::Utc::now().timestamp());
        task.dirty = true;
    }
    let _ = state.db.update_task_status(gid, "Completed", Some(chrono::Utc::now().timestamp()));

    state.hls_speeds.lock().unwrap().remove(gid);
    state.hls_cancel_tokens.lock().unwrap().remove(gid);

    if let Some(ref app_handle) = *state.app_handle.lock().unwrap() {
        let _ = app_handle.emit("download-task-updated", serde_json::json!({ "gid": gid }));
        let _ = app_handle.emit("play-sound", "success");
    }
}

pub async fn download_hls_task(
    state: Arc<AppState>,
    gid: String,
    url: String,
    save_path: String,
    filename: String,
    user_agent: Option<String>,
    referer: Option<String>,
    cookies: Vec<String>,
    cancel_rx: tokio::sync::watch::Receiver<bool>,
) {
    let mut headers = HeaderMap::new();
    if let Some(ua) = user_agent {
        if let Ok(val) = HeaderValue::from_str(&ua) {
            headers.insert(USER_AGENT, val);
        }
    }
    if let Some(ref_val) = referer {
        if let Ok(val) = HeaderValue::from_str(&ref_val) {
            headers.insert(REFERER, val);
        }
    }
    if !cookies.is_empty() {
        let cookie_str = cookies.join("; ");
        if let Ok(val) = HeaderValue::from_str(&cookie_str) {
            headers.insert(COOKIE, val);
        }
    }

    let settings = state.get_settings();
    let mut client_builder = reqwest::Client::builder()
        .default_headers(headers)
        .danger_accept_invalid_certs(settings.transfer.ignore_ssl_certificate);

    if let Some(proxy_str) = settings.transfer.proxy_url.as_ref().filter(|s| !s.trim().is_empty()) {
        if let Ok(proxy) = reqwest::Proxy::all(proxy_str) {
            client_builder = client_builder.proxy(proxy);
        }
    }

    let client = match client_builder.build() {
        Ok(c) => c,
        Err(e) => {
            update_task_error(&state, &gid, &format!("Failed to build HTTP client: {e}"));
            return;
        }
    };

    let current_url = match Url::parse(&url) {
        Ok(u) => u,
        Err(e) => {
            update_task_error(&state, &gid, &format!("Invalid URL: {e}"));
            return;
        }
    };

    let res = match super::apply_basic_auth_if_present(client.get(current_url.as_str()), current_url.as_str()).send().await {
        Ok(r) => r,
        Err(e) => {
            update_task_error(&state, &gid, &format!("Failed to fetch playlist: {e}"));
            return;
        }
    };

    let playlist_bytes = match res.bytes().await {
        Ok(b) => b,
        Err(e) => {
            update_task_error(&state, &gid, &format!("Failed to read playlist bytes: {e}"));
            return;
        }
    };

    let playlist = match m3u8_rs::parse_playlist(&playlist_bytes) {
        Ok((_, p)) => p,
        Err(e) => {
            update_task_error(&state, &gid, &format!("Failed to parse playlist: {e}"));
            return;
        }
    };

    let media_url = match playlist {
        Playlist::MasterPlaylist(master) => {
            let best_variant = master.variants.iter().max_by_key(|v| v.bandwidth);
            match best_variant {
                Some(variant) => {
                    match current_url.join(&variant.uri) {
                        Ok(u) => u,
                        Err(e) => {
                            update_task_error(&state, &gid, &format!("Failed to resolve variant URL: {e}"));
                            return;
                        }
                    }
                }
                None => {
                    update_task_error(&state, &gid, "Master playlist contains no variants");
                    return;
                }
            }
        }
        Playlist::MediaPlaylist(_) => current_url.clone(),
    };

    let media_playlist_bytes = if media_url != current_url {
        let res = match super::apply_basic_auth_if_present(client.get(media_url.as_str()), media_url.as_str()).send().await {
            Ok(r) => r,
            Err(e) => {
                update_task_error(&state, &gid, &format!("Failed to fetch media playlist: {e}"));
                return;
            }
        };
        match res.bytes().await {
            Ok(b) => b,
            Err(e) => {
                update_task_error(&state, &gid, &format!("Failed to read media playlist: {e}"));
                return;
            }
        }
    } else {
        playlist_bytes.clone()
    };

    let media_playlist = match m3u8_rs::parse_playlist(&media_playlist_bytes) {
        Ok((_, Playlist::MediaPlaylist(media))) => media,
        Ok((_, Playlist::MasterPlaylist(_))) => {
            update_task_error(&state, &gid, "Expected media playlist but got master playlist");
            return;
        }
        Err(e) => {
            update_task_error(&state, &gid, &format!("Failed to parse media playlist: {e}"));
            return;
        }
    };

    let init_section = media_playlist.segments.iter().find_map(|seg| seg.map.as_ref());
    let mut actual_filename = filename.clone();
    let mut init_url = None;

    if let Some(map) = init_section {
        match media_url.join(&map.uri) {
            Ok(u) => {
                init_url = Some(u);
                if actual_filename.ends_with(".ts") {
                    actual_filename = actual_filename.strip_suffix(".ts").unwrap().to_string() + ".mp4";
                } else if !actual_filename.ends_with(".mp4") {
                    actual_filename.push_str(".mp4");
                }

                // Update name in cache
                if let Some(task) = state.task_cache.write().unwrap().get_mut(&gid) {
                    task.name = actual_filename.clone();
                }
                // Update name in DB
                let _ = state.db.update_task_name(&gid, &actual_filename);
            }
            Err(e) => {
                update_task_error(&state, &gid, &format!("Failed to resolve init section URL: {e}"));
                return;
            }
        }
    }

    let mut segments = Vec::new();
    for seg in media_playlist.segments {
        match media_url.join(&seg.uri) {
            Ok(u) => segments.push(u),
            Err(e) => {
                update_task_error(&state, &gid, &format!("Failed to resolve segment URL: {e}"));
                return;
            }
        }
    }

    if segments.is_empty() {
        update_task_error(&state, &gid, "No download segments found in playlist");
        return;
    }

    let total_segments = segments.len();
    let original_final_file_path = Path::new(&save_path).join(&filename);
    let temp_dir = PathBuf::from(format!("{}.pidown_tmp", original_final_file_path.to_string_lossy()));

    if let Err(e) = std::fs::create_dir_all(&temp_dir) {
        update_task_error(&state, &gid, &format!("Failed to create temporary directory: {e}"));
        return;
    }

    let completed_bytes = Arc::new(AtomicU64::new(0));
    let mut initial_completed_bytes = 0;

    let init_path = temp_dir.join("init");
    if let Some(u) = init_url {
        if !init_path.exists() {
            let res = match super::apply_basic_auth_if_present(client.get(u.as_str()), u.as_str()).send().await {
                Ok(r) => r,
                Err(e) => {
                    update_task_error(&state, &gid, &format!("Failed to fetch init section: {e}"));
                    return;
                }
            };
            let init_bytes = match res.bytes().await {
                Ok(b) => b,
                Err(e) => {
                    update_task_error(&state, &gid, &format!("Failed to read init section bytes: {e}"));
                    return;
                }
            };
            if let Err(e) = std::fs::write(&init_path, &init_bytes) {
                update_task_error(&state, &gid, &format!("Failed to write init section: {e}"));
                return;
            }
        }
        if let Ok(meta) = std::fs::metadata(&init_path) {
            initial_completed_bytes += meta.len();
        }
    }

    let mut downloaded_segments = vec![false; total_segments];
    let mut completed_segments_count = 0;

    for i in 0..total_segments {
        let seg_path = temp_dir.join(format!("{}.ts", i));
        if seg_path.exists() {
            if let Ok(meta) = std::fs::metadata(&seg_path) {
                let size = meta.len();
                if size > 0 {
                    downloaded_segments[i] = true;
                    initial_completed_bytes += size;
                    completed_segments_count += 1;
                }
            }
        }
    }
    completed_bytes.store(initial_completed_bytes, Ordering::Relaxed);

    let estimated_total_bytes = if completed_segments_count > 0 {
        (initial_completed_bytes as f64 / completed_segments_count as f64 * total_segments as f64) as u64
    } else {
        total_segments as u64 * 1_000_000
    };

    state.sync_hls_progress(&gid, initial_completed_bytes, estimated_total_bytes);

    let completed_segments_counter = Arc::new(std::sync::atomic::AtomicUsize::new(completed_segments_count));
    let last_emit_time = Arc::new(Mutex::new(std::time::Instant::now() - std::time::Duration::from_secs(10)));

    let completed_bytes_clone = Arc::clone(&completed_bytes);
    let state_clone = Arc::clone(&state);
    let gid_clone = gid.clone();
    let monitor_handle = tokio::spawn(async move {
        let mut last_bytes = completed_bytes_clone.load(Ordering::Relaxed);
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(1));
        loop {
            interval.tick().await;
            let current_bytes = completed_bytes_clone.load(Ordering::Relaxed);
            let speed = current_bytes.saturating_sub(last_bytes);
            last_bytes = current_bytes;
            state_clone.hls_speeds.lock().unwrap().insert(gid_clone.clone(), speed);
        }
    });

    struct CleanupGuard {
        state: Arc<AppState>,
        gid: String,
        monitor_handle: tokio::task::JoinHandle<()>,
    }
    impl Drop for CleanupGuard {
        fn drop(&mut self) {
            self.monitor_handle.abort();
            self.state.hls_speeds.lock().unwrap().remove(&self.gid);
            self.state.hls_cancel_tokens.lock().unwrap().remove(&self.gid);
        }
    }
    let _cleanup_guard = CleanupGuard {
        state: Arc::clone(&state),
        gid: gid.clone(),
        monitor_handle,
    };

    let max_connections = state.get_settings().transfer.task_thread_count.clamp(1, 16) as usize;
    let semaphore = Arc::new(tokio::sync::Semaphore::new(max_connections));
    let download_error = Arc::new(Mutex::new(None));
    let mut join_set = tokio::task::JoinSet::new();

    for i in 0..total_segments {
        if downloaded_segments[i] {
            continue;
        }

        let sem = Arc::clone(&semaphore);
        let client = client.clone();
        let seg_url = segments[i].clone();
        let temp_dir = temp_dir.clone();
        let cancel_rx = cancel_rx.clone();
        let completed_bytes = Arc::clone(&completed_bytes);
        let download_error = Arc::clone(&download_error);
        let state = Arc::clone(&state);
        let gid = gid.clone();
        let total_segments = total_segments;
        let completed_segments_counter = Arc::clone(&completed_segments_counter);
        let last_emit_time = Arc::clone(&last_emit_time);

        join_set.spawn(async move {
            if *cancel_rx.borrow() {
                return;
            }

            let _permit = match sem.acquire().await {
                Ok(p) => p,
                Err(_) => return,
            };

            if *cancel_rx.borrow() {
                return;
            }

            let seg_path = temp_dir.join(format!("{}.ts", i));
            let seg_path_tmp = temp_dir.join(format!("{}.ts.tmp", i));

            let request = super::apply_basic_auth_if_present(client.get(seg_url.as_str()), seg_url.as_str());
            let mut response = match request.send().await {
                Ok(resp) => resp,
                Err(e) => {
                    let mut err = download_error.lock().unwrap();
                    if err.is_none() {
                        *err = Some(format!("Failed to download segment {i}: {e}"));
                    }
                    return;
                }
            };

            if !response.status().is_success() {
                let mut err = download_error.lock().unwrap();
                if err.is_none() {
                    *err = Some(format!("Failed to download segment {i}: HTTP {}", response.status()));
                }
                return;
            }

            let mut file = match std::fs::File::create(&seg_path_tmp) {
                Ok(f) => f,
                Err(e) => {
                    let mut err = download_error.lock().unwrap();
                    if err.is_none() {
                        *err = Some(format!("Failed to create temp file for segment {i}: {e}"));
                    }
                    return;
                }
            };

            use std::io::Write;
            while let Ok(Some(chunk)) = response.chunk().await {
                if *cancel_rx.borrow() {
                    let _ = std::fs::remove_file(&seg_path_tmp);
                    return;
                }

                if let Err(e) = file.write_all(&chunk) {
                    let mut err = download_error.lock().unwrap();
                    if err.is_none() {
                        *err = Some(format!("Failed to write segment {i} chunk: {e}"));
                    }
                    let _ = std::fs::remove_file(&seg_path_tmp);
                    return;
                }

                let chunk_len = chunk.len() as u64;
                completed_bytes.fetch_add(chunk_len, Ordering::Relaxed);
            }

            if let Err(e) = file.sync_all() {
                let mut err = download_error.lock().unwrap();
                if err.is_none() {
                    *err = Some(format!("Failed to sync temp file for segment {i}: {e}"));
                }
                let _ = std::fs::remove_file(&seg_path_tmp);
                return;
            }

            if let Err(e) = std::fs::rename(&seg_path_tmp, &seg_path) {
                let mut err = download_error.lock().unwrap();
                if err.is_none() {
                    *err = Some(format!("Failed to rename segment {i}: {e}"));
                }
                let _ = std::fs::remove_file(&seg_path_tmp);
                return;
            }

            let done_count = completed_segments_counter.fetch_add(1, Ordering::Relaxed) + 1;
            let cur_bytes = completed_bytes.load(Ordering::Relaxed);
            let estimated_total = (cur_bytes as f64 / done_count as f64 * total_segments as f64) as u64;

            state.sync_hls_progress(&gid, cur_bytes, estimated_total);

            let should_emit = {
                let mut last = last_emit_time.lock().unwrap();
                let now = std::time::Instant::now();
                if now.duration_since(*last) >= std::time::Duration::from_millis(300) || done_count == total_segments {
                    *last = now;
                    true
                } else {
                    false
                }
            };

            if should_emit {
                if let Some(ref app_handle) = *state.app_handle.lock().unwrap() {
                    let _ = app_handle.emit("download-task-updated", serde_json::json!({ "gid": gid }));
                }
            }
        });
    }

    while let Some(res) = join_set.join_next().await {
        if let Err(e) = res {
            let mut err = download_error.lock().unwrap();
            if err.is_none() {
                *err = Some(format!("Segment download task panicked: {e}"));
            }
        }
    }

    if *cancel_rx.borrow() {
        log::info!("HLS download paused/cancelled for gid: {}", gid);
        return;
    }

    if let Some(err_msg) = download_error.lock().unwrap().clone() {
        update_task_error(&state, &gid, &err_msg);
        return;
    }

    // Merge segments sequentially in a blocking task to prevent locking Tokio workers
    let save_path_clone = save_path.clone();
    let actual_filename_clone = actual_filename.clone();
    let init_path_clone = init_path.clone();
    let temp_dir_clone = temp_dir.clone();

    let merge_res = tokio::task::spawn_blocking(move || -> Result<(), String> {
        let final_file_path = Path::new(&save_path_clone).join(&actual_filename_clone);
        let mut final_file = std::fs::File::create(&final_file_path)
            .map_err(|e| format!("Failed to create final output file: {e}"))?;

        let mut buf = vec![0u8; 128 * 1024];

        if init_path_clone.exists() {
            let mut init_file = std::fs::File::open(&init_path_clone)
                .map_err(|e| format!("Failed to open init section for merging: {e}"))?;

            use std::io::Read;
            loop {
                let n = init_file.read(&mut buf)
                    .map_err(|e| format!("Failed to read init section: {e}"))?;
                if n == 0 { break; }
                use std::io::Write;
                final_file.write_all(&buf[..n])
                    .map_err(|e| format!("Failed to write init section to final file: {e}"))?;
            }
        }

        for i in 0..total_segments {
            let seg_path = temp_dir_clone.join(format!("{}.ts", i));
            let mut seg_file = std::fs::File::open(&seg_path)
                .map_err(|e| format!("Failed to open segment {i} for merging: {e}"))?;

            use std::io::Read;
            loop {
                let n = seg_file.read(&mut buf)
                    .map_err(|e| format!("Failed to read segment {i}: {e}"))?;
                if n == 0 { break; }
                use std::io::Write;
                final_file.write_all(&buf[..n])
                    .map_err(|e| format!("Failed to write to final file: {e}"))?;
            }
        }

        final_file.sync_all()
            .map_err(|e| format!("Failed to sync final file: {e}"))?;

        Ok(())
    }).await;

    match merge_res {
        Ok(Ok(())) => {
            let _ = std::fs::remove_dir_all(&temp_dir);
            let final_bytes = completed_bytes.load(Ordering::Relaxed);
            state.sync_hls_progress(&gid, final_bytes, final_bytes);
            update_task_completed(&state, &gid);
        }
        Ok(Err(e)) => {
            update_task_error(&state, &gid, &e);
        }
        Err(e) => {
            update_task_error(&state, &gid, &format!("Merge thread panicked: {e}"));
        }
    }
}
