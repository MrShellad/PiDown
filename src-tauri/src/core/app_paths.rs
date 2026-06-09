use std::path::PathBuf;

pub const APP_IDENTIFIER: &str = "com.mrshell.PiDownloader";
pub const APP_DATA_DIR_ENV: &str = "PIDOWNLOADER_APP_DATA_DIR";

pub fn app_data_dir() -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os(APP_DATA_DIR_ENV) {
        let path = PathBuf::from(path);
        if !path.as_os_str().is_empty() {
            return Ok(path);
        }
    }

    dirs::data_dir()
        .map(|dir| dir.join(APP_IDENTIFIER))
        .ok_or_else(|| "Failed to resolve app data directory".to_string())
}

pub fn default_download_dir(app_data_dir: &std::path::Path) -> PathBuf {
    dirs::download_dir().unwrap_or_else(|| app_data_dir.join("downloads"))
}
