pub mod engine;
pub mod manager;
pub mod protocol;

pub use engine::{DownloadInspection, EngineHttpConfig, EngineWrapper, HttpTaskOptions};
#[allow(unused_imports)]
pub use manager::DownloadManager;
pub use protocol::{detect_protocol, DownloadProtocol};
