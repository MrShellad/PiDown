use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FfmpegEngineStatusType {
    NotInstalled,
    Downloading,
    Extracting,
    Ready,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FfmpegEngineStatus {
    pub status: FfmpegEngineStatusType,
    pub version: Option<String>,
    pub progress: f64, // 0.0 to 100.0
    pub error_message: Option<String>,
}

pub struct FfmpegEngine {
    binary_dir: PathBuf,
    status: Arc<RwLock<FfmpegEngineStatus>>,
    http_client: reqwest::Client,
}

impl FfmpegEngine {
    pub fn new(app_data_dir: &Path) -> Self {
        let binary_dir = app_data_dir.join("bin");
        let status = Arc::new(RwLock::new(FfmpegEngineStatus {
            status: FfmpegEngineStatusType::NotInstalled,
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
            status,
            http_client,
        };

        engine.check_install();
        engine
    }

    pub fn binary_path(&self) -> PathBuf {
        if cfg!(windows) {
            self.binary_dir.join("ffmpeg.exe")
        } else {
            self.binary_dir.join("ffmpeg")
        }
    }

    pub fn check_install(&self) -> bool {
        // First check if installed locally
        let local_path = self.binary_path();
        if local_path.exists() {
            let mut status = self.status.write().unwrap();
            status.status = FfmpegEngineStatusType::Ready;
            status.progress = 100.0;
            status.error_message = None;
            if status.version.is_none() {
                status.version = Some("6.1".to_string());
            }
            return true;
        }

        // Second check if available globally in PATH
        let mut cmd = std::process::Command::new("ffmpeg");
        cmd.arg("-version");
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        let system_available = match cmd.output() {
            Ok(output) => output.status.success(),
            Err(_) => false,
        };

        let mut status = self.status.write().unwrap();
        if system_available {
            status.status = FfmpegEngineStatusType::Ready;
            status.progress = 100.0;
            status.version = Some("System PATH".to_string());
            status.error_message = None;
            true
        } else {
            status.status = FfmpegEngineStatusType::NotInstalled;
            status.progress = 0.0;
            false
        }
    }

    pub fn get_status(&self) -> FfmpegEngineStatus {
        self.check_install();
        self.status.read().unwrap().clone()
    }

    pub async fn download_and_install(&self) -> Result<(), String> {
        let candidates = get_download_candidates()?;
        
        {
            let mut status = self.status.write().unwrap();
            status.status = FfmpegEngineStatusType::Downloading;
            status.progress = 0.0;
            status.error_message = None;
        }

        if let Err(e) = std::fs::create_dir_all(&self.binary_dir) {
            let mut status = self.status.write().unwrap();
            status.status = FfmpegEngineStatusType::Error;
            status.error_message = Some(format!("创建本地 bin 目录失败: {}", e));
            return Err(e.to_string());
        }

        let mut download_success = false;
        let mut last_error = String::new();
        let mut temp_archive_path = PathBuf::new();
        let mut target_filename = "";

        for (url, filename) in &candidates {
            temp_archive_path = self.binary_dir.join(filename);
            target_filename = filename;
            log::info!("Attempting to download FFmpeg from {}...", url);

            match self.download_file_with_progress(url, &temp_archive_path).await {
                Ok(_) => {
                    download_success = true;
                    log::info!("Successfully downloaded FFmpeg archive from {}", url);
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
            status.status = FfmpegEngineStatusType::Error;
            status.error_message = Some(format!("下载依赖失败 (网络错误): {}", last_error));
            return Err(format!("Download failed on all candidates: {}", last_error));
        }

        {
            let mut status = self.status.write().unwrap();
            status.status = FfmpegEngineStatusType::Extracting;
            status.progress = 0.0;
        }

        log::info!("Extracting FFmpeg archive...");
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
                log::info!("FFmpeg successfully installed to {:?}", exe_path);
                let mut status = self.status.write().unwrap();
                status.status = FfmpegEngineStatusType::Ready;
                status.version = Some("6.1".to_string());
                status.progress = 100.0;
                Ok(())
            }
            Err(e) => {
                let mut status = self.status.write().unwrap();
                status.status = FfmpegEngineStatusType::Error;
                status.error_message = Some(format!("解压失败: {}", e));
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
                "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/ffmpeg-6.1-win-64.zip",
                "ffmpeg_win.zip",
            ),
            (
                "https://ghfast.top/https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/ffmpeg-6.1-win-64.zip",
                "ffmpeg_win.zip",
            ),
            (
                "https://mirror.ghproxy.com/https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/ffmpeg-6.1-win-64.zip",
                "ffmpeg_win.zip",
            ),
        ])
    } else if cfg!(target_os = "macos") {
        Ok(vec![
            (
                "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/ffmpeg-6.1-osx-64.zip",
                "ffmpeg_mac.zip",
            ),
            (
                "https://ghfast.top/https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/ffmpeg-6.1-osx-64.zip",
                "ffmpeg_mac.zip",
            ),
        ])
    } else if cfg!(target_os = "linux") {
        Ok(vec![
            (
                "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/ffmpeg-6.1-linux-64.zip",
                "ffmpeg_linux.zip",
            ),
            (
                "https://ghfast.top/https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/ffmpeg-6.1-linux-64.zip",
                "ffmpeg_linux.zip",
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

        let filename = Path::new(name).file_name().and_then(|n| n.to_str()).unwrap_or("");
        if filename == "ffmpeg.exe" || filename == "ffmpeg" {
            let target_name = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
            let outpath = dest_dir.join(target_name);
            let mut outfile = std::fs::File::create(&outpath).map_err(|e| format!("Failed to create executable: {}", e))?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| format!("Failed to copy bytes: {}", e))?;

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
    exe_path.ok_or_else(|| "ffmpeg not found in zip archive".to_string())
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

        if name == "ffmpeg" {
            let outpath = dest_dir.join("ffmpeg");
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
    exe_path.ok_or_else(|| "ffmpeg not found in tar.gz archive".to_string())
}
