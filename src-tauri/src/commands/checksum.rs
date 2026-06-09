use crate::core::state::AppState;
use md5_digest::{Digest, Md5};
use serde::Serialize;
use sha1::Sha1;
use sha2::{Sha256, Sha512};
use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::sync::Arc;
use tauri::State;

const CHECKSUM_BUFFER_SIZE: usize = 1024 * 1024;

#[derive(Clone, Copy, Debug)]
enum FileChecksumAlgorithm {
    Md5,
    Sha1,
    Sha256,
    Sha512,
}

impl FileChecksumAlgorithm {
    fn parse(value: &str) -> Result<Self, String> {
        match value.trim().to_ascii_uppercase().as_str() {
            "MD5" => Ok(Self::Md5),
            "SHA-1" | "SHA1" => Ok(Self::Sha1),
            "SHA-256" | "SHA256" => Ok(Self::Sha256),
            "SHA-512" | "SHA512" => Ok(Self::Sha512),
            _ => Err("Unsupported checksum algorithm".to_string()),
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Md5 => "MD5",
            Self::Sha1 => "SHA-1",
            Self::Sha256 => "SHA-256",
            Self::Sha512 => "SHA-512",
        }
    }
}

#[derive(Debug, Serialize)]
pub struct TaskFileChecksum {
    pub name: String,
    pub algorithm: String,
    pub checksum: String,
    pub saved_checksum: Option<String>,
}

#[tauri::command]
pub async fn calculate_task_file_checksum(
    state: State<'_, Arc<AppState>>,
    gid: String,
    algorithm: String,
) -> Result<TaskFileChecksum, String> {
    let algorithm = FileChecksumAlgorithm::parse(&algorithm)?;
    let (name, file_path) = state.task_file_checksum_target(&gid)?;
    let checksum_algorithm = algorithm;
    let checksum = tauri::async_runtime::spawn_blocking(move || {
        calculate_file_checksum(&file_path, checksum_algorithm)
    })
    .await
    .map_err(|error| format!("Failed to calculate checksum: {error}"))??;

    Ok(TaskFileChecksum {
        name,
        algorithm: algorithm.label().to_string(),
        checksum,
        saved_checksum: None,
    })
}

fn calculate_file_checksum(
    path: &Path,
    algorithm: FileChecksumAlgorithm,
) -> Result<String, String> {
    match algorithm {
        FileChecksumAlgorithm::Md5 => digest_file::<Md5>(path),
        FileChecksumAlgorithm::Sha1 => digest_file::<Sha1>(path),
        FileChecksumAlgorithm::Sha256 => digest_file::<Sha256>(path),
        FileChecksumAlgorithm::Sha512 => digest_file::<Sha512>(path),
    }
}

fn digest_file<D>(path: &Path) -> Result<String, String>
where
    D: Digest,
{
    let mut file = File::open(path).map_err(|error| format!("Failed to open file: {error}"))?;
    let mut buffer = vec![0_u8; CHECKSUM_BUFFER_SIZE];
    let mut hasher = D::new();

    loop {
        let bytes_read = file
            .read(&mut buffer)
            .map_err(|error| format!("Failed to read file: {error}"))?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(bytes_to_lower_hex(&hasher.finalize()))
}

fn bytes_to_lower_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);

    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }

    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_supported_checksum_algorithms() {
        assert!(matches!(
            FileChecksumAlgorithm::parse("MD5").unwrap(),
            FileChecksumAlgorithm::Md5
        ));
        assert!(matches!(
            FileChecksumAlgorithm::parse("sha1").unwrap(),
            FileChecksumAlgorithm::Sha1
        ));
        assert!(matches!(
            FileChecksumAlgorithm::parse("SHA-256").unwrap(),
            FileChecksumAlgorithm::Sha256
        ));
        assert!(matches!(
            FileChecksumAlgorithm::parse("sha512").unwrap(),
            FileChecksumAlgorithm::Sha512
        ));
    }
}
