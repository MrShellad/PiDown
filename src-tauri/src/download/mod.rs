pub mod bt;
pub mod engine;
pub mod manager;
pub mod protocol;
pub mod hls;
pub mod provider;
pub mod gosh_provider;
pub mod hls_provider;
pub mod protocols;
pub mod aria2_engine;
pub mod aria2_provider;
pub mod ffmpeg_engine;

pub use engine::{DownloadInspection, EngineHttpConfig, EngineWrapper, HttpTaskOptions, TorrentFileInspection};
#[allow(unused_imports)]
pub use manager::DownloadManager;
pub use protocol::{detect_protocol, DownloadProtocol};

pub fn apply_basic_auth_if_present(builder: reqwest::RequestBuilder, url: &str) -> reqwest::RequestBuilder {
    if let Ok(parsed_url) = reqwest::Url::parse(url) {
        if !parsed_url.username().is_empty() {
            let password = parsed_url.password().unwrap_or("");
            let decoded_user = urlencoding::decode(parsed_url.username())
                .map(|cow| cow.into_owned())
                .unwrap_or_else(|_| parsed_url.username().to_string());
            let decoded_pass = urlencoding::decode(password)
                .map(|cow| cow.into_owned())
                .unwrap_or_else(|_| password.to_string());
            return builder.basic_auth(decoded_user, Some(decoded_pass));
        }
    }
    builder
}

#[cfg(test)]
mod engine_tests;

#[cfg(test)]
mod aria2_tests;

