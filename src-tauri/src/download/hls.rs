use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::path::{Path, PathBuf};
use reqwest::header::{HeaderMap, HeaderValue, COOKIE, USER_AGENT, REFERER};
use reqwest::Url;
use m3u8_rs::Playlist;

#[derive(Debug, Clone)]
pub struct HlsDownloadConfig {
    pub ignore_ssl_certificate: bool,
    pub proxy_url: Option<String>,
    pub task_thread_count: usize,
    pub app_data_dir: Option<PathBuf>,
}

#[derive(Debug, Clone)]
pub enum HlsDownloadEvent {
    Progress {
        completed_bytes: u64,
        estimated_total_bytes: u64,
        speed: u64,
    },
    NameUpdated {
        filename: String,
    },
    Completed {
        final_bytes: u64,
        warning: Option<String>,
    },
    Failed {
        error_message: String,
    },
}

pub async fn download_hls_task(
    gid: String,
    url: String,
    save_path: String,
    filename: String,
    user_agent: Option<String>,
    referer: Option<String>,
    cookies: Vec<String>,
    cancel_rx: tokio::sync::watch::Receiver<bool>,
    config: HlsDownloadConfig,
    event_tx: tokio::sync::mpsc::UnboundedSender<HlsDownloadEvent>,
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

    let mut client_builder = reqwest::Client::builder()
        .default_headers(headers)
        .danger_accept_invalid_certs(config.ignore_ssl_certificate);

    if let Some(proxy_str) = config.proxy_url.as_ref().filter(|s| !s.trim().is_empty()) {
        if let Ok(proxy) = reqwest::Proxy::all(proxy_str) {
            client_builder = client_builder.proxy(proxy);
        }
    }

    let client = match client_builder.build() {
        Ok(c) => c,
        Err(e) => {
            let _ = event_tx.send(HlsDownloadEvent::Failed {
                error_message: format!("Failed to build HTTP client: {e}"),
            });
            return;
        }
    };

    let mut current_url = match Url::parse(&url) {
        Ok(u) => u,
        Err(e) => {
            let _ = event_tx.send(HlsDownloadEvent::Failed {
                error_message: format!("Invalid URL: {e}"),
            });
            return;
        }
    };

    let res = match crate::download::apply_basic_auth_if_present(client.get(current_url.as_str()), current_url.as_str()).send().await {
        Ok(r) => r,
        Err(e) => {
            let _ = event_tx.send(HlsDownloadEvent::Failed {
                error_message: format!("Failed to fetch playlist: {e}"),
            });
            return;
        }
    };

    let mut playlist_bytes = match res.bytes().await {
        Ok(b) => b,
        Err(e) => {
            let _ = event_tx.send(HlsDownloadEvent::Failed {
                error_message: format!("Failed to read playlist bytes: {e}"),
            });
            return;
        }
    };

    let mut playlist = match m3u8_rs::parse_playlist(&playlist_bytes) {
        Ok((_, p)) => p,
        Err(e) => {
            let _ = event_tx.send(HlsDownloadEvent::Failed {
                error_message: format!("Failed to parse playlist: {e}"),
            });
            return;
        }
    };

    // Speculatively check if the parsed playlist is a MediaPlaylist but has a MasterPlaylist sibling/parent
    if let Playlist::MediaPlaylist(_) = playlist {
        if let Some(master_url) = try_find_master_playlist_url(&current_url) {
            log::info!("Speculatively attempting to fetch Master Playlist from candidate URL: {}", master_url);
            if let Ok(res) = crate::download::apply_basic_auth_if_present(client.get(master_url.as_str()), master_url.as_str()).send().await {
                if res.status().is_success() {
                    if let Ok(bytes) = res.bytes().await {
                        if let Ok((_, Playlist::MasterPlaylist(master))) = m3u8_rs::parse_playlist(&bytes) {
                            log::info!("Successfully speculatively resolved Master Playlist from Media Playlist!");
                            playlist = Playlist::MasterPlaylist(master);
                            playlist_bytes = bytes;
                            current_url = master_url;
                        }
                    }
                }
            }
        }
    }

    let mut audio_playlist_url = None;
    let media_url = match playlist {
        Playlist::MasterPlaylist(ref master) => {
            let best_variant = master.variants.iter().max_by_key(|v| v.bandwidth);
            match best_variant {
                Some(variant) => {
                    // Check if variant has associated audio group
                    if let Some(ref audio_group_id) = variant.audio {
                        // Find the alternative media that is type Audio and matches the group id
                        if let Some(audio_media) = master.alternatives.iter().find(|media| {
                            media.media_type == m3u8_rs::AlternativeMediaType::Audio
                                && media.group_id == *audio_group_id
                        }) {
                            if let Some(audio_uri) = audio_media.uri.as_ref() {
                                match current_url.join(audio_uri) {
                                    Ok(u) => {
                                        audio_playlist_url = Some(u);
                                    }
                                    Err(e) => {
                                        log::warn!("Failed to resolve audio variant URL: {}", e);
                                    }
                                }
                            }
                        }
                    }

                    match current_url.join(&variant.uri) {
                        Ok(u) => u,
                        Err(e) => {
                            let _ = event_tx.send(HlsDownloadEvent::Failed {
                                error_message: format!("Failed to resolve variant URL: {e}"),
                            });
                            return;
                        }
                    }
                }
                None => {
                    let _ = event_tx.send(HlsDownloadEvent::Failed {
                        error_message: "Master playlist contains no variants".to_string(),
                    });
                    return;
                }
            }
        }
        Playlist::MediaPlaylist(_) => current_url.clone(),
    };

    let media_playlist_bytes = if media_url != current_url {
        let res = match crate::download::apply_basic_auth_if_present(client.get(media_url.as_str()), media_url.as_str()).send().await {
            Ok(r) => r,
            Err(e) => {
                let _ = event_tx.send(HlsDownloadEvent::Failed {
                    error_message: format!("Failed to fetch media playlist: {e}"),
                });
                return;
            }
        };
        match res.bytes().await {
            Ok(b) => b,
            Err(e) => {
                let _ = event_tx.send(HlsDownloadEvent::Failed {
                    error_message: format!("Failed to read media playlist: {e}"),
                });
                return;
            }
        }
    } else {
        playlist_bytes.clone()
    };

    let media_playlist = match m3u8_rs::parse_playlist(&media_playlist_bytes) {
        Ok((_, Playlist::MediaPlaylist(media))) => media,
        Ok((_, Playlist::MasterPlaylist(_))) => {
            let _ = event_tx.send(HlsDownloadEvent::Failed {
                error_message: "Expected media playlist but got master playlist".to_string(),
            });
            return;
        }
        Err(e) => {
            let _ = event_tx.send(HlsDownloadEvent::Failed {
                error_message: format!("Failed to parse media playlist: {e}"),
            });
            return;
        }
    };

    // If audio playlist URL is present, fetch it as well
    let mut audio_playlist = None;
    if let Some(ref audio_url) = audio_playlist_url {
        let res = match crate::download::apply_basic_auth_if_present(client.get(audio_url.as_str()), audio_url.as_str()).send().await {
            Ok(r) => r,
            Err(e) => {
                let _ = event_tx.send(HlsDownloadEvent::Failed {
                    error_message: format!("Failed to fetch audio playlist: {e}"),
                });
                return;
            }
        };
        let audio_playlist_bytes = match res.bytes().await {
            Ok(b) => b,
            Err(e) => {
                let _ = event_tx.send(HlsDownloadEvent::Failed {
                    error_message: format!("Failed to read audio playlist bytes: {e}"),
                });
                return;
            }
        };
        match m3u8_rs::parse_playlist(&audio_playlist_bytes) {
            Ok((_, Playlist::MediaPlaylist(media))) => {
                audio_playlist = Some(media);
            }
            _ => {
                log::warn!("Expected media playlist for audio but failed to parse or got master playlist");
            }
        }
    }

    let video_init_section = media_playlist.segments.iter().find_map(|seg| seg.map.as_ref());
    let mut actual_filename = filename.clone();
    let mut video_init_url = None;

    if let Some(map) = video_init_section {
        match media_url.join(&map.uri) {
            Ok(u) => {
                video_init_url = Some(u);
                if actual_filename.ends_with(".ts") {
                    actual_filename = actual_filename.strip_suffix(".ts").unwrap().to_string() + ".mp4";
                } else if !actual_filename.ends_with(".mp4") {
                    actual_filename.push_str(".mp4");
                }

                // Notify outer system of the filename update
                let _ = event_tx.send(HlsDownloadEvent::NameUpdated {
                    filename: actual_filename.clone(),
                });
            }
            Err(e) => {
                let _ = event_tx.send(HlsDownloadEvent::Failed {
                    error_message: format!("Failed to resolve video init section URL: {e}"),
                });
                return;
            }
        }
    }

    let mut audio_init_url = None;
    if let Some(ref audio_url) = audio_playlist_url {
        if let Some(ref audio_pl) = audio_playlist {
            if let Some(map) = audio_pl.segments.iter().find_map(|seg| seg.map.as_ref()) {
                match audio_url.join(&map.uri) {
                    Ok(u) => {
                        audio_init_url = Some(u);
                    }
                    Err(e) => {
                        log::warn!("Failed to resolve audio init section URL: {}", e);
                    }
                }
            }
        }
    }

    #[derive(Debug, Clone)]
    struct DownloadSegment {
        index: usize,
        url: Url,
        is_video: bool,
    }

    let mut download_segments = Vec::new();
    for (i, seg) in media_playlist.segments.iter().enumerate() {
        match media_url.join(&seg.uri) {
            Ok(u) => download_segments.push(DownloadSegment {
                index: i,
                url: u,
                is_video: true,
            }),
            Err(e) => {
                let _ = event_tx.send(HlsDownloadEvent::Failed {
                    error_message: format!("Failed to resolve video segment URL: {e}"),
                });
                return;
            }
        }
    }

    let video_segments_count = download_segments.len();

    if let Some(ref audio_url) = audio_playlist_url {
        if let Some(ref audio_pl) = audio_playlist {
            for (i, seg) in audio_pl.segments.iter().enumerate() {
                match audio_url.join(&seg.uri) {
                    Ok(u) => download_segments.push(DownloadSegment {
                        index: i,
                        url: u,
                        is_video: false,
                    }),
                    Err(e) => {
                        let _ = event_tx.send(HlsDownloadEvent::Failed {
                            error_message: format!("Failed to resolve audio segment URL: {e}"),
                        });
                        return;
                    }
                }
            }
        }
    }

    if download_segments.is_empty() {
        let _ = event_tx.send(HlsDownloadEvent::Failed {
            error_message: "No download segments found in playlist".to_string(),
        });
        return;
    }

    let total_segments = download_segments.len();
    let original_final_file_path = Path::new(&save_path).join(&filename);
    let temp_dir = PathBuf::from(format!("{}.pidown_tmp", original_final_file_path.to_string_lossy()));

    if let Err(e) = std::fs::create_dir_all(&temp_dir) {
        let _ = event_tx.send(HlsDownloadEvent::Failed {
            error_message: format!("Failed to create temporary directory: {e}"),
        });
        return;
    }

    let completed_bytes = Arc::new(AtomicU64::new(0));
    let mut initial_completed_bytes = 0;

    let video_init_path = temp_dir.join("video_init");
    if let Some(u) = video_init_url {
        if !video_init_path.exists() {
            let res = match crate::download::apply_basic_auth_if_present(client.get(u.as_str()), u.as_str()).send().await {
                Ok(r) => r,
                Err(e) => {
                    let _ = event_tx.send(HlsDownloadEvent::Failed {
                        error_message: format!("Failed to fetch video init section: {e}"),
                    });
                    return;
                }
            };
            let init_bytes = match res.bytes().await {
                Ok(b) => b,
                Err(e) => {
                    let _ = event_tx.send(HlsDownloadEvent::Failed {
                        error_message: format!("Failed to read video init section bytes: {e}"),
                    });
                    return;
                }
            };
            if let Err(e) = std::fs::write(&video_init_path, &init_bytes) {
                let _ = event_tx.send(HlsDownloadEvent::Failed {
                    error_message: format!("Failed to write video init section: {e}"),
                });
                return;
            }
        }
        if let Ok(meta) = std::fs::metadata(&video_init_path) {
            initial_completed_bytes += meta.len();
        }
    }

    let audio_init_path = temp_dir.join("audio_init");
    if let Some(u) = audio_init_url {
        if !audio_init_path.exists() {
            if let Ok(res) = crate::download::apply_basic_auth_if_present(client.get(u.as_str()), u.as_str()).send().await {
                if let Ok(init_bytes) = res.bytes().await {
                    let _ = std::fs::write(&audio_init_path, &init_bytes);
                }
            } else {
                log::warn!("Failed to fetch audio init section");
            }
        }
        if let Ok(meta) = std::fs::metadata(&audio_init_path) {
            initial_completed_bytes += meta.len();
        }
    }

    let mut downloaded_segments = vec![false; total_segments];
    let mut completed_segments_count = 0;

    for i in 0..total_segments {
        let seg = &download_segments[i];
        let prefix = if seg.is_video { "video" } else { "audio" };
        let seg_path = temp_dir.join(format!("{}_{}.ts", prefix, seg.index));
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

    // Emit initial progress
    let _ = event_tx.send(HlsDownloadEvent::Progress {
        completed_bytes: initial_completed_bytes,
        estimated_total_bytes,
        speed: 0,
    });

    let completed_segments_counter = Arc::new(std::sync::atomic::AtomicUsize::new(completed_segments_count));
    let last_emit_time = Arc::new(Mutex::new(std::time::Instant::now() - std::time::Duration::from_secs(10)));

    let completed_bytes_clone = Arc::clone(&completed_bytes);
    let event_tx_clone = event_tx.clone();
    let completed_segments_counter_clone = Arc::clone(&completed_segments_counter);
    let monitor_handle = tokio::spawn(async move {
        let mut last_bytes = completed_bytes_clone.load(Ordering::Relaxed);
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(1));
        loop {
            interval.tick().await;
            let current_bytes = completed_bytes_clone.load(Ordering::Relaxed);
            let speed = current_bytes.saturating_sub(last_bytes);
            last_bytes = current_bytes;
            
            // Periodically emit progress and speed
            let done = completed_segments_counter_clone.load(Ordering::Relaxed);
            let total = total_segments;
            let est = if done > 0 {
                (current_bytes as f64 / done as f64 * total as f64) as u64
            } else {
                total as u64 * 1_000_000
            };
            let _ = event_tx_clone.send(HlsDownloadEvent::Progress {
                completed_bytes: current_bytes,
                estimated_total_bytes: est,
                speed,
            });
        }
    });

    struct MonitorGuard {
        handle: tokio::task::JoinHandle<()>,
    }
    impl Drop for MonitorGuard {
        fn drop(&mut self) {
            self.handle.abort();
        }
    }
    let _monitor_guard = MonitorGuard { handle: monitor_handle };

    let max_connections = config.task_thread_count.clamp(1, 16);
    let semaphore = Arc::new(tokio::sync::Semaphore::new(max_connections));
    let download_error = Arc::new(Mutex::new(None));
    let mut join_set = tokio::task::JoinSet::new();

    for i in 0..total_segments {
        if downloaded_segments[i] {
            continue;
        }

        let sem = Arc::clone(&semaphore);
        let client = client.clone();
        let download_seg = download_segments[i].clone();
        let temp_dir = temp_dir.clone();
        let cancel_rx = cancel_rx.clone();
        let completed_bytes = Arc::clone(&completed_bytes);
        let download_error = Arc::clone(&download_error);
        let event_tx = event_tx.clone();
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

            let prefix = if download_seg.is_video { "video" } else { "audio" };
            let seg_path = temp_dir.join(format!("{}_{}.ts", prefix, download_seg.index));
            let seg_path_tmp = temp_dir.join(format!("{}_{}.ts.tmp", prefix, download_seg.index));

            let request = crate::download::apply_basic_auth_if_present(client.get(download_seg.url.as_str()), download_seg.url.as_str());
            let mut response = match request.send().await {
                Ok(resp) => resp,
                Err(e) => {
                    let mut err = download_error.lock().unwrap();
                    if err.is_none() {
                        *err = Some(format!("Failed to download {} segment {}: {}", prefix, download_seg.index, e));
                    }
                    return;
                }
            };

            if !response.status().is_success() {
                let mut err = download_error.lock().unwrap();
                if err.is_none() {
                    *err = Some(format!("Failed to download {} segment {}: HTTP {}", prefix, download_seg.index, response.status()));
                }
                return;
            }

            let mut file = match std::fs::File::create(&seg_path_tmp) {
                Ok(f) => f,
                Err(e) => {
                    let mut err = download_error.lock().unwrap();
                    if err.is_none() {
                        *err = Some(format!("Failed to create temp file for {} segment {}: {}", prefix, download_seg.index, e));
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
                        *err = Some(format!("Failed to write {} segment {} chunk: {}", prefix, download_seg.index, e));
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
                    *err = Some(format!("Failed to sync temp file for {} segment {}: {}", prefix, download_seg.index, e));
                }
                let _ = std::fs::remove_file(&seg_path_tmp);
                return;
            }

            if let Err(e) = std::fs::rename(&seg_path_tmp, &seg_path) {
                let mut err = download_error.lock().unwrap();
                if err.is_none() {
                    *err = Some(format!("Failed to rename {} segment {}: {}", prefix, download_seg.index, e));
                }
                let _ = std::fs::remove_file(&seg_path_tmp);
                return;
            }

            let done_count = completed_segments_counter.fetch_add(1, Ordering::Relaxed) + 1;
            let cur_bytes = completed_bytes.load(Ordering::Relaxed);
            let estimated_total = (cur_bytes as f64 / done_count as f64 * total_segments as f64) as u64;

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
                let _ = event_tx.send(HlsDownloadEvent::Progress {
                    completed_bytes: cur_bytes,
                    estimated_total_bytes: estimated_total,
                    speed: 0,
                });
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
        let _ = event_tx.send(HlsDownloadEvent::Failed {
            error_message: err_msg,
        });
        return;
    }

    // Merge segments sequentially in a blocking task to prevent locking Tokio workers
    let save_path_clone = save_path.clone();
    let actual_filename_clone = actual_filename.clone();
    let video_init_path_clone = video_init_path.clone();
    let audio_init_path_clone = audio_init_path.clone();
    let temp_dir_clone = temp_dir.clone();
    let has_audio = audio_playlist_url.is_some();

    let app_data_dir_clone = config.app_data_dir.clone();
    let merge_res = tokio::task::spawn_blocking(move || -> Result<Option<String>, String> {
        let video_merged_path = temp_dir_clone.join("video_merged.tmp");
        let audio_merged_path = temp_dir_clone.join("audio_merged.tmp");
        let final_file_path = Path::new(&save_path_clone).join(&actual_filename_clone);

        let mut buf = vec![0u8; 128 * 1024];

        // 1. Merge video segments
        {
            let mut video_file = std::fs::File::create(&video_merged_path)
                .map_err(|e| format!("Failed to create temporary video file: {e}"))?;

            if video_init_path_clone.exists() {
                let mut init_file = std::fs::File::open(&video_init_path_clone)
                    .map_err(|e| format!("Failed to open video init section: {e}"))?;
                use std::io::Read;
                loop {
                    let n = init_file.read(&mut buf)
                        .map_err(|e| format!("Failed to read video init section: {e}"))?;
                    if n == 0 { break; }
                    use std::io::Write;
                    video_file.write_all(&buf[..n])
                        .map_err(|e| format!("Failed to write video init section: {e}"))?;
                }
            }

            for i in 0..video_segments_count {
                let seg_path = temp_dir_clone.join(format!("video_{}.ts", i));
                let mut seg_file = std::fs::File::open(&seg_path)
                    .map_err(|e| format!("Failed to open video segment {i}: {e}"))?;
                use std::io::Read;
                loop {
                    let n = seg_file.read(&mut buf)
                        .map_err(|e| format!("Failed to read video segment {i}: {e}"))?;
                    if n == 0 { break; }
                    use std::io::Write;
                    video_file.write_all(&buf[..n])
                        .map_err(|e| format!("Failed to write video segment {i}: {e}"))?;
                }
            }
            video_file.sync_all()
                .map_err(|e| format!("Failed to sync temporary video file: {e}"))?;
        }

        // 2. Merge audio segments (if present)
        if has_audio {
            let mut audio_file = std::fs::File::create(&audio_merged_path)
                .map_err(|e| format!("Failed to create temporary audio file: {e}"))?;

            if audio_init_path_clone.exists() {
                let mut init_file = std::fs::File::open(&audio_init_path_clone)
                    .map_err(|e| format!("Failed to open audio init section: {e}"))?;
                use std::io::Read;
                loop {
                    let n = init_file.read(&mut buf)
                        .map_err(|e| format!("Failed to read audio init section: {e}"))?;
                    if n == 0 { break; }
                    use std::io::Write;
                    audio_file.write_all(&buf[..n])
                        .map_err(|e| format!("Failed to write audio init section: {e}"))?;
                }
            }

            let audio_segments_count = total_segments - video_segments_count;
            for i in 0..audio_segments_count {
                let seg_path = temp_dir_clone.join(format!("audio_{}.ts", i));
                let mut seg_file = std::fs::File::open(&seg_path)
                    .map_err(|e| format!("Failed to open audio segment {i}: {e}"))?;
                use std::io::Read;
                loop {
                    let n = seg_file.read(&mut buf)
                        .map_err(|e| format!("Failed to read audio segment {i}: {e}"))?;
                    if n == 0 { break; }
                    use std::io::Write;
                    audio_file.write_all(&buf[..n])
                        .map_err(|e| format!("Failed to write audio segment {i}: {e}"))?;
                }
            }
            audio_file.sync_all()
                .map_err(|e| format!("Failed to sync temporary audio file: {e}"))?;
        }

        // 3. Combine/remux using FFmpeg if available, otherwise fallback to direct copy/rename
        let app_data_dir_ref = app_data_dir_clone.as_deref();
        let ffmpeg_available = check_ffmpeg_available(app_data_dir_ref);
        let mut warning = None;

        if has_audio && audio_merged_path.exists() {
            if ffmpeg_available {
                match run_ffmpeg_merge(app_data_dir_ref, &video_merged_path, &audio_merged_path, &final_file_path) {
                    Ok(()) => return Ok(None),
                    Err(e) => {
                        log::warn!("FFmpeg merge failed: {}. Falling back to video-only stream.", e);
                        warning = Some(format!("FFmpeg 混流失败 ({})，已降级输出无声视频。", e));
                    }
                }
            } else {
                log::warn!("FFmpeg is not available in PATH. Cannot merge audio and video. Falling back to video-only stream.");
                warning = Some("系统未检测到 FFmpeg，无法合并音频与视频轨，已降级输出无声视频。请安装 FFmpeg 并加入系统 PATH。".to_string());
            }

            std::fs::rename(&video_merged_path, &final_file_path)
                .map_err(|e| format!("Failed to save fallback video-only file: {e}"))?;
        } else {
            // Even if it's a single stream, remux to MP4 container if ffmpeg is available
            let remux_success = if ffmpeg_available {
                let mut cmd = get_ffmpeg_command(app_data_dir_ref).unwrap();
                cmd.args(&[
                    "-y",
                    "-i", &video_merged_path.to_string_lossy(),
                    "-c", "copy",
                    &final_file_path.to_string_lossy()
                ]);
                match run_ffmpeg_command(cmd, "single-stream remux") {
                    Ok(()) => true,
                    Err(e) => {
                        log::warn!("Single stream remux failed: {}", e);
                        false
                    }
                }
            } else {
                false
            };

            if !remux_success {
                if !ffmpeg_available {
                    warning = Some("系统未检测到 FFmpeg，视频以原始 TS 格式保存（在部分播放器中可能无声音）。建议安装 FFmpeg 以便自动转码为标准 MP4 格式。".to_string());
                }
                std::fs::rename(&video_merged_path, &final_file_path)
                    .map_err(|e| format!("Failed to save video file: {e}"))?;
            }
        }

        Ok(warning)
    }).await;

    match merge_res {
        Ok(Ok(warning)) => {
            let _ = std::fs::remove_dir_all(&temp_dir);
            let final_bytes = completed_bytes.load(Ordering::Relaxed);
            let _ = event_tx.send(HlsDownloadEvent::Completed { final_bytes, warning });
        }
        Ok(Err(e)) => {
            let _ = event_tx.send(HlsDownloadEvent::Failed {
                error_message: e,
            });
        }
        Err(e) => {
            let _ = event_tx.send(HlsDownloadEvent::Failed {
                error_message: format!("Merge thread panicked: {e}"),
            });
        }
    }
}

fn get_ffmpeg_command(app_data_dir: Option<&Path>) -> Option<std::process::Command> {
    if let Some(dir) = app_data_dir {
        let local_bin = if cfg!(windows) {
            dir.join("bin").join("ffmpeg.exe")
        } else {
            dir.join("bin").join("ffmpeg")
        };
        if local_bin.exists() {
            return Some(std::process::Command::new(local_bin));
        }
    }

    let mut cmd = std::process::Command::new("ffmpeg");
    cmd.arg("-version");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    if let Ok(output) = cmd.output() {
        if output.status.success() {
            return Some(std::process::Command::new("ffmpeg"));
        }
    }

    None
}

fn check_ffmpeg_available(app_data_dir: Option<&Path>) -> bool {
    get_ffmpeg_command(app_data_dir).is_some()
}

fn run_ffmpeg_command(mut cmd: std::process::Command, label: &str) -> Result<(), String> {
    log::info!("Running FFmpeg command for {}: {:?}", label, cmd);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    match cmd.output() {
        Ok(output) => {
            let stdout_str = String::from_utf8_lossy(&output.stdout);
            let stderr_str = String::from_utf8_lossy(&output.stderr);
            if !stdout_str.trim().is_empty() {
                log::info!("FFmpeg [{}] stdout: {}", label, stdout_str);
            }
            if !stderr_str.trim().is_empty() {
                log::info!("FFmpeg [{}] stderr: {}", label, stderr_str);
            }
            if output.status.success() {
                log::info!("FFmpeg [{}] completed successfully.", label);
                Ok(())
            } else {
                log::error!("FFmpeg [{}] failed with exit code: {:?}.", label, output.status.code());
                Err(format!(
                    "FFmpeg [{}] failed with exit code: {:?}. Stderr: {}",
                    label,
                    output.status.code(),
                    stderr_str
                ))
            }
        }
        Err(e) => {
            log::error!("Failed to spawn FFmpeg [{}] process: {}", label, e);
            Err(format!("Failed to execute FFmpeg command: {e}"))
        }
    }
}

fn run_ffmpeg_merge(app_data_dir: Option<&Path>, video_path: &Path, audio_path: &Path, output_path: &Path) -> Result<(), String> {
    let mut cmd = get_ffmpeg_command(app_data_dir)
        .ok_or_else(|| "FFmpeg executable not found".to_string())?;
    cmd.args(&[
        "-y",
        "-i", &video_path.to_string_lossy(),
        "-i", &audio_path.to_string_lossy(),
        "-c", "copy",
        &output_path.to_string_lossy()
    ]);
    run_ffmpeg_command(cmd, "dual-stream merge")
}

fn try_find_master_playlist_url(current_url: &Url) -> Option<Url> {
    let path_segments: Vec<&str> = current_url.path_segments()?.collect();
    if path_segments.len() >= 2 {
        let second_to_last = path_segments[path_segments.len() - 2];
        let is_resolution_dir = second_to_last.contains('x') 
            || second_to_last.chars().all(|c| c.is_ascii_digit())
            || second_to_last.ends_with('p')
            || second_to_last.ends_with('k');

        if is_resolution_dir {
            let mut new_url = current_url.clone();
            let success = {
                if let Ok(mut segments) = new_url.path_segments_mut() {
                    segments.clear();
                    for (i, seg) in path_segments.iter().enumerate() {
                        if i != path_segments.len() - 2 {
                            segments.push(seg);
                        }
                    }
                    true
                } else {
                    false
                }
            };
            if success {
                return Some(new_url);
            }
        }
    }
    None
}
