use std::path::PathBuf;

pub fn default_download_dir(app_data_dir: &std::path::Path) -> PathBuf {
    dirs::download_dir().unwrap_or_else(|| app_data_dir.join("downloads"))
}
