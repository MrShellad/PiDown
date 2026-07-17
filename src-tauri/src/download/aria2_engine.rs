use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use tokio::sync::Mutex as TokioMutex;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Aria2EngineStatusType {
    NotInstalled,
    Downloading,
    Extracting,
    Ready,
    Running,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Aria2EngineStatus {
    pub status: Aria2EngineStatusType,
    pub version: Option<String>,
    pub progress: f64, // 0.0 to 100.0
    pub error_message: Option<String>,
}

pub struct Aria2Engine {
    binary_dir: PathBuf,
    child_process: Arc<TokioMutex<Option<tokio::process::Child>>>,
    status: Arc<RwLock<Aria2EngineStatus>>,
    http_client: reqwest::Client,
}

impl Aria2Engine {
    pub fn new(app_data_dir: &Path) -> Self {
        let binary_dir = app_data_dir.join("bin");
        let status = Arc::new(RwLock::new(Aria2EngineStatus {
            status: Aria2EngineStatusType::NotInstalled,
            version: None,
            progress: 0.0,
            error_message: None,
        }));

        let http_client = reqwest::Client::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .unwrap_or_default();

        let engine = Self {
            binary_dir,
            child_process: Arc::new(TokioMutex::new(None)),
            status,
            http_client,
        };

        engine.check_install();
        engine
    }

    pub fn binary_path(&self) -> PathBuf {
        if cfg!(windows) {
            self.binary_dir.join("aria2c.exe")
        } else {
            self.binary_dir.join("aria2c")
        }
    }

    pub fn check_install(&self) -> bool {
        let path = self.binary_path();
        let exists = path.exists();
        let mut status = self.status.write().unwrap();
        if exists {
            if status.status == Aria2EngineStatusType::NotInstalled || status.status == Aria2EngineStatusType::Error {
                status.status = Aria2EngineStatusType::Ready;
                status.progress = 100.0;
                status.error_message = None;
            }
            true
        } else {
            status.status = Aria2EngineStatusType::NotInstalled;
            status.progress = 0.0;
            false
        }
    }

    pub fn get_status(&self) -> Aria2EngineStatus {
        self.status.read().unwrap().clone()
    }

    pub async fn get_version(&self) -> Option<String> {
        let binary_path = self.binary_path();
        if !binary_path.exists() {
            return None;
        }
        let output = tokio::process::Command::new(binary_path)
            .arg("--version")
            .output()
            .await
            .ok()?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if line.contains("aria2 version") {
                return Some(line.replace("aria2 version", "").trim().to_string());
            }
        }
        None
    }

    pub async fn start(&self, port: u16, secret: &str) -> Result<(), String> {
        let binary_path = self.binary_path();
        if !binary_path.exists() {
            return Err("aria2c executable not found. Please install it first.".to_string());
        }

        let mut child_guard = self.child_process.lock().await;
        if child_guard.is_some() {
            // Check if process is still alive
            if let Ok(None) = child_guard.as_mut().unwrap().try_wait() {
                // Already running
                let mut status = self.status.write().unwrap();
                status.status = Aria2EngineStatusType::Running;
                return Ok(());
            }
            // Otherwise, it exited, so clean it up
            *child_guard = None;
        }

        log::info!("Starting aria2c daemon on port {}...", port);

        let mut cmd = tokio::process::Command::new(&binary_path);
        cmd.arg("--enable-rpc")
            .arg(format!("--rpc-listen-port={}", port))
            .arg(format!("--rpc-secret={}", secret))
            .arg("--rpc-listen-all=false") // Binds only to 127.0.0.1 for security
            .arg("--daemon=false")         // Keep in foreground so we can monitor/kill it
            .arg("--max-connection-per-server=16")
            .arg("--split=16")
            .arg("--min-split-size=1M")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());

        #[cfg(windows)]
        {
            // Prevent cmd window from popping up on Windows
            #[allow(unused_imports)]
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let child = cmd.spawn().map_err(|e| format!("Failed to spawn aria2c: {}", e))?;
        *child_guard = Some(child);

        let needs_version = {
            let mut status = self.status.write().unwrap();
            status.status = Aria2EngineStatusType::Running;
            status.error_message = None;
            status.version.is_none()
        };

        // Try to read version dynamically to populate status info
        if needs_version {
            let version = self.get_version().await;
            let mut status = self.status.write().unwrap();
            status.version = version;
        }

        Ok(())
    }

    pub async fn stop(&self) {
        let mut child_guard = self.child_process.lock().await;
        if let Some(mut child) = child_guard.take() {
            log::info!("Stopping aria2c daemon...");
            let _ = child.kill().await;
            let _ = child.wait().await;
        }
        let mut status = self.status.write().unwrap();
        if status.status == Aria2EngineStatusType::Running {
            status.status = Aria2EngineStatusType::Ready;
        }
    }

    pub async fn download_and_install(&self) -> Result<(), String> {
        let candidates = get_download_candidates()?;
        
        {
            let mut status = self.status.write().unwrap();
            status.status = Aria2EngineStatusType::Downloading;
            status.progress = 0.0;
            status.error_message = None;
        }

        std::fs::create_dir_all(&self.binary_dir).map_err(|e| format!("Failed to create bin dir: {}", e))?;

        let mut last_error = "No mirror candidates succeeded".to_string();
        let mut download_success = false;
        let mut temp_archive_path = PathBuf::new();
        let mut target_filename = "";

        for (url, filename) in &candidates {
            temp_archive_path = self.binary_dir.join(filename);
            target_filename = filename;
            log::info!("Attempting to download aria2 from {}...", url);

            match self.download_file_with_progress(url, &temp_archive_path).await {
                Ok(_) => {
                    download_success = true;
                    log::info!("Successfully downloaded aria2 archive from {}", url);
                    break;
                }
                Err(e) => {
                    log::warn!("Download candidate {} failed: {}", url, e);
                    last_error = e;
                    let _ = std::fs::remove_file(&temp_archive_path);
                }
            }
        }

        if !download_success {
            let mut status = self.status.write().unwrap();
            status.status = Aria2EngineStatusType::Error;
            status.error_message = Some(format!("下载内核依赖失败 (404/网络错误): {}", last_error));
            return Err(format!("Download failed on all candidates: {}", last_error));
        }

        {
            let mut status = self.status.write().unwrap();
            status.status = Aria2EngineStatusType::Extracting;
            status.progress = 0.0;
        }

        log::info!("Extracting aria2 archive...");
        let extract_res = if target_filename.ends_with(".zip") {
            extract_zip(&temp_archive_path, &self.binary_dir)
        } else if target_filename.ends_with(".tar.gz") || target_filename.ends_with(".tgz") {
            extract_tar_gz(&temp_archive_path, &self.binary_dir)
        } else {
            Err("Unsupported archive format".to_string())
        };

        // Clean up temp archive
        let _ = std::fs::remove_file(&temp_archive_path);

        match extract_res {
            Ok(exe_path) => {
                log::info!("Aria2 successfully installed to {:?}", exe_path);
                let version = self.get_version().await;
                let mut status = self.status.write().unwrap();
                status.status = Aria2EngineStatusType::Ready;
                status.version = version;
                status.progress = 100.0;
                Ok(())
            }
            Err(e) => {
                let mut status = self.status.write().unwrap();
                status.status = Aria2EngineStatusType::Error;
                status.error_message = Some(format!("Extraction failed: {}", e));
                Err(e)
            }
        }
    }

    async fn download_file_with_progress(&self, url: &str, dest: &Path) -> Result<(), String> {
        let mut response = self.http_client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("Network request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Server returned error code: {}", response.status()));
        }

        let total_size = response.content_length().unwrap_or(0);
        let mut file = std::fs::File::create(dest)
            .map_err(|e| format!("Failed to create destination file: {}", e))?;

        let mut downloaded: u64 = 0;
        while let Some(chunk) = response.chunk().await.map_err(|e| format!("Error downloading chunk: {}", e))? {
            file.write_all(&chunk)
                .map_err(|e| format!("Failed to write chunk to file: {}", e))?;
            downloaded += chunk.len() as u64;

            if total_size > 0 {
                let pct = (downloaded as f64 / total_size as f64) * 100.0;
                let mut status = self.status.write().unwrap();
                status.progress = pct;
            }
        }

        file.flush().map_err(|e| format!("Failed to flush file: {}", e))?;
        Ok(())
    }
}

fn get_download_candidates() -> Result<Vec<(&'static str, &'static str)>, String> {
    if cfg!(target_os = "windows") {
        Ok(vec![
            (
                "https://github.com/aria2/aria2/releases/download/release-1.37.0/aria2-1.37.0-win-64bit-build1.zip",
                "aria2_win.zip",
            ),
            (
                "https://ghfast.top/https://github.com/aria2/aria2/releases/download/release-1.37.0/aria2-1.37.0-win-64bit-build1.zip",
                "aria2_win.zip",
            ),
            (
                "https://mirror.ghproxy.com/https://github.com/aria2/aria2/releases/download/release-1.37.0/aria2-1.37.0-win-64bit-build1.zip",
                "aria2_win.zip",
            ),
        ])
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            Ok(vec![
                (
                    "https://github.com/P3TERX/aria2-builder/releases/download/1.37.0/aria2-1.37.0-static-darwin-arm64.tar.gz",
                    "aria2_mac_arm64.tar.gz",
                ),
                (
                    "https://ghfast.top/https://github.com/P3TERX/aria2-builder/releases/download/1.37.0/aria2-1.37.0-static-darwin-arm64.tar.gz",
                    "aria2_mac_arm64.tar.gz",
                ),
            ])
        } else {
            Ok(vec![
                (
                    "https://github.com/P3TERX/aria2-builder/releases/download/1.37.0/aria2-1.37.0-static-darwin-amd64.tar.gz",
                    "aria2_mac_x64.tar.gz",
                ),
                (
                    "https://ghfast.top/https://github.com/P3TERX/aria2-builder/releases/download/1.37.0/aria2-1.37.0-static-darwin-amd64.tar.gz",
                    "aria2_mac_x64.tar.gz",
                ),
            ])
        }
    } else if cfg!(target_os = "linux") {
        Ok(vec![
            (
                "https://github.com/P3TERX/aria2-builder/releases/download/1.37.0/aria2-1.37.0-static-linux-amd64.tar.gz",
                "aria2_linux_x64.tar.gz",
            ),
            (
                "https://ghfast.top/https://github.com/P3TERX/aria2-builder/releases/download/1.37.0/aria2-1.37.0-static-linux-amd64.tar.gz",
                "aria2_linux_x64.tar.gz",
            ),
        ])
    } else {
        Err(format!(
            "Unsupported target operating system: {}-{}",
            std::env::consts::OS,
            std::env::consts::ARCH
        ))
    }
}

fn extract_zip(archive_path: &Path, dest_dir: &Path) -> Result<PathBuf, String> {
    let file = std::fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip archive: {}", e))?;
    
    let mut exe_path = None;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name();

        if name.ends_with("aria2c.exe") {
            let outpath = dest_dir.join("aria2c.exe");
            let mut outfile = std::fs::File::create(&outpath).map_err(|e| format!("Failed to create executable: {}", e))?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| format!("Failed to copy bytes: {}", e))?;
            exe_path = Some(outpath);
            break;
        }
    }
    exe_path.ok_or_else(|| "aria2c.exe not found in zip archive".to_string())
}

fn extract_tar_gz(archive_path: &Path, dest_dir: &Path) -> Result<PathBuf, String> {
    let tar_gz = std::fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let tar = flate2::read::GzDecoder::new(tar_gz);
    let mut archive = tar::Archive::new(tar);

    let mut exe_path = None;
    for entry in archive.entries().map_err(|e| format!("Invalid tar.gz: {}", e))? {
        let mut entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path().map_err(|e| e.to_string())?;
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

        if name == "aria2c" {
            let outpath = dest_dir.join("aria2c");
            let mut outfile = std::fs::File::create(&outpath).map_err(|e| format!("Failed to create executable: {}", e))?;
            std::io::copy(&mut entry, &mut outfile).map_err(|e| format!("Failed to copy bytes: {}", e))?;
            
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mut perms = std::fs::metadata(&outpath).map_err(|e| e.to_string())?.permissions();
                perms.set_mode(0o755);
                std::fs::set_permissions(&outpath, perms).map_err(|e| e.to_string())?;
            }
            
            exe_path = Some(outpath);
            break;
        }
    }
    exe_path.ok_or_else(|| "aria2c not found in tar.gz archive".to_string())
}
