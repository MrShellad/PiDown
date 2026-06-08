#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DownloadProtocol {
    Http,
    Https,
    Magnet,
    Torrent,
    Unknown,
}

impl DownloadProtocol {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Http => "http",
            Self::Https => "https",
            Self::Magnet => "magnet",
            Self::Torrent => "torrent",
            Self::Unknown => "unknown",
        }
    }
}

pub fn detect_protocol(url: &str) -> DownloadProtocol {
    let url_lower = url.to_lowercase();
    if url_lower.starts_with("magnet:") {
        DownloadProtocol::Magnet
    } else if url_lower.starts_with("http://") {
        DownloadProtocol::Http
    } else if url_lower.starts_with("https://") {
        DownloadProtocol::Https
    } else if url_lower.ends_with(".torrent") || url_lower.starts_with("torrent:") {
        DownloadProtocol::Torrent
    } else {
        DownloadProtocol::Unknown
    }
}
