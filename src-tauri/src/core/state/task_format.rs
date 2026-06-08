use crate::core::settings::SpeedDisplayUnit;

pub fn format_speed(bytes_per_sec: u64, display_unit: &SpeedDisplayUnit) -> String {
    if bytes_per_sec == 0 {
        return match display_unit {
            SpeedDisplayUnit::Auto => "0 B/s".to_string(),
            SpeedDisplayUnit::Kib => "0 KiB/s".to_string(),
            SpeedDisplayUnit::Mib => "0 MiB/s".to_string(),
            SpeedDisplayUnit::Mb => "0 MB/s".to_string(),
        };
    }

    match display_unit {
        SpeedDisplayUnit::Auto => {
            let units = ["B/s", "KiB/s", "MiB/s", "GiB/s"];
            let mut speed = bytes_per_sec as f64;
            let mut unit_idx = 0;

            while speed >= 1024.0 && unit_idx < units.len() - 1 {
                speed /= 1024.0;
                unit_idx += 1;
            }

            format!("{speed:.1} {}", units[unit_idx])
        }
        SpeedDisplayUnit::Kib => format!("{:.1} KiB/s", bytes_per_sec as f64 / 1024.0),
        SpeedDisplayUnit::Mib => format!("{:.2} MiB/s", bytes_per_sec as f64 / 1024.0 / 1024.0),
        SpeedDisplayUnit::Mb => format!("{:.2} MB/s", bytes_per_sec as f64 / 1_000_000.0),
    }
}

pub fn format_eta(seconds: Option<u64>) -> String {
    match seconds {
        Some(s) if s < 86400 * 365 => {
            let hours = s / 3600;
            let minutes = (s % 3600) / 60;
            let secs = s % 60;
            format!("{hours:02}:{minutes:02}:{secs:02}")
        }
        _ => "--:--:--".to_string(),
    }
}

pub fn sanitize_filename(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            ch if ch.is_control() => '_',
            ch => ch,
        })
        .collect::<String>()
        .trim()
        .trim_matches('.')
        .to_string();

    if sanitized.is_empty() {
        "download".to_string()
    } else {
        sanitized
    }
}
