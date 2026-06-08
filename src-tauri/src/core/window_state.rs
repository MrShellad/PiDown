use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{mpsc, OnceLock};
use std::time::Duration;
use tauri::{LogicalSize, Manager, Size, WebviewWindow, WindowEvent};

pub const WINDOW_STATE_FILE_NAME: &str = "window-state.json";
const MAIN_WINDOW_LABEL: &str = "main";
const DEFAULT_MAIN_WIDTH: u32 = 950;
const DEFAULT_MAIN_HEIGHT: u32 = 680;
const MIN_MAIN_WIDTH: u32 = 860;
const MIN_MAIN_HEIGHT: u32 = 620;
const MAX_MAIN_WIDTH: u32 = 3840;
const MAX_MAIN_HEIGHT: u32 = 2160;
const SAVE_DEBOUNCE_MS: u64 = 350;

static WINDOW_STATE_SENDER: OnceLock<mpsc::Sender<WindowState>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WindowState {
    pub width: u32,
    pub height: u32,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            width: DEFAULT_MAIN_WIDTH,
            height: DEFAULT_MAIN_HEIGHT,
        }
    }
}

impl WindowState {
    fn normalized(self) -> Self {
        Self {
            width: self.width.clamp(MIN_MAIN_WIDTH, MAX_MAIN_WIDTH),
            height: self.height.clamp(MIN_MAIN_HEIGHT, MAX_MAIN_HEIGHT),
        }
    }
}

pub fn setup_main_window_state(
    app_handle: &tauri::AppHandle,
    app_data_dir: &Path,
) -> Result<(), String> {
    let Some(main_window) = app_handle.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Ok(());
    };

    let state_file = app_data_dir.join(WINDOW_STATE_FILE_NAME);
    let state = load_window_state(&state_file);

    apply_main_window_state(&main_window, &state)?;
    start_window_state_writer(state_file);
    attach_main_window_state_listener(main_window);

    Ok(())
}

pub fn save_main_window_state_now(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let Some(main_window) = app_handle.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Ok(());
    };

    if main_window.is_minimized().unwrap_or(false) || main_window.is_maximized().unwrap_or(false) {
        return Ok(());
    }

    let size = main_window.inner_size().map_err(|e| e.to_string())?;
    let state = WindowState {
        width: size.width,
        height: size.height,
    }
    .normalized();
    let state_file = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(WINDOW_STATE_FILE_NAME);

    write_window_state(&state_file, &state)?;
    enqueue_window_state(state);

    Ok(())
}

fn load_window_state(state_file: &Path) -> WindowState {
    std::fs::read_to_string(state_file)
        .ok()
        .and_then(|raw| serde_json::from_str::<WindowState>(&raw).ok())
        .unwrap_or_default()
        .normalized()
}

fn apply_main_window_state(main_window: &WebviewWindow, state: &WindowState) -> Result<(), String> {
    main_window
        .set_size(Size::Logical(LogicalSize::new(
            state.width as f64,
            state.height as f64,
        )))
        .map_err(|e| e.to_string())?;
    main_window.center().map_err(|e| e.to_string())
}

fn start_window_state_writer(state_file: PathBuf) {
    let (sender, receiver) = mpsc::channel::<WindowState>();
    if WINDOW_STATE_SENDER.set(sender).is_err() {
        return;
    }

    std::thread::spawn(move || {
        let mut pending = None;
        loop {
            match receiver.recv_timeout(Duration::from_millis(SAVE_DEBOUNCE_MS)) {
                Ok(state) => pending = Some(state.normalized()),
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    if let Some(state) = pending.take() {
                        let _ = write_window_state(&state_file, &state);
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    if let Some(state) = pending.take() {
                        let _ = write_window_state(&state_file, &state);
                    }
                    break;
                }
            }
        }
    });
}

fn write_window_state(state_file: &Path, state: &WindowState) -> Result<(), String> {
    if let Some(parent) = state_file.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let encoded = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    std::fs::write(state_file, encoded).map_err(|e| e.to_string())
}

fn attach_main_window_state_listener(main_window: WebviewWindow) {
    main_window.on_window_event(|event| {
        if let WindowEvent::Resized(size) = event {
            enqueue_window_state(WindowState {
                width: size.width,
                height: size.height,
            });
        }
    });
}

fn enqueue_window_state(state: WindowState) {
    if let Some(sender) = WINDOW_STATE_SENDER.get() {
        let _ = sender.send(state);
    }
}

#[cfg(test)]
mod tests {
    use super::{
        WindowState, DEFAULT_MAIN_HEIGHT, DEFAULT_MAIN_WIDTH, MAX_MAIN_HEIGHT, MAX_MAIN_WIDTH,
        MIN_MAIN_HEIGHT, MIN_MAIN_WIDTH,
    };

    #[test]
    fn default_window_state_uses_configured_main_size() {
        assert_eq!(
            WindowState::default(),
            WindowState {
                width: DEFAULT_MAIN_WIDTH,
                height: DEFAULT_MAIN_HEIGHT,
            }
        );
    }

    #[test]
    fn window_state_normalize_clamps_invalid_sizes() {
        assert_eq!(
            WindowState {
                width: 1,
                height: 1,
            }
            .normalized(),
            WindowState {
                width: MIN_MAIN_WIDTH,
                height: MIN_MAIN_HEIGHT,
            }
        );
        assert_eq!(
            WindowState {
                width: u32::MAX,
                height: u32::MAX,
            }
            .normalized(),
            WindowState {
                width: MAX_MAIN_WIDTH,
                height: MAX_MAIN_HEIGHT,
            }
        );
    }
}
