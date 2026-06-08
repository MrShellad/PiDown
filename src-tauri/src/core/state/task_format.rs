pub fn format_speed(bytes_per_sec: u64) -> String {
    if bytes_per_sec == 0 {
        return "0 B/s".to_string();
    }

    let units = ["B/s", "KB/s", "MB/s", "GB/s"];
    let mut speed = bytes_per_sec as f64;
    let mut unit_idx = 0;

    while speed >= 1024.0 && unit_idx < units.len() - 1 {
        speed /= 1024.0;
        unit_idx += 1;
    }

    format!("{speed:.1} {}", units[unit_idx])
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
