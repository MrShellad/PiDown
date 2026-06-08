pub mod engine;
pub mod manager;
pub mod protocol;

pub use engine::{DownloadInspection, EngineWrapper};
#[allow(unused_imports)]
pub use manager::DownloadManager;
pub use protocol::{detect_protocol, DownloadProtocol};
