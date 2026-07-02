use crate::core::state::AppState;
use std::sync::Arc;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn switch_to_float(app: AppHandle) -> Result<(), String> {
    use tauri::Manager;

    let main_win = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;
    let float_win = app
        .get_webview_window("float")
        .ok_or("Float window not found")?;

    main_win.hide().map_err(|e| e.to_string())?;
    float_win
        .eval("window.location.replace('/float')")
        .map_err(|e| e.to_string())?;
    float_win.show().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn switch_to_main(app: AppHandle) -> Result<(), String> {
    use tauri::Manager;

    let main_win = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    main_win.show().map_err(|e| e.to_string())?;
    main_win.unminimize().map_err(|e| e.to_string())?;
    main_win.set_focus().map_err(|e| e.to_string())?;

    Ok(())
}

pub async fn handle_close_action(
    app: &AppHandle,
    state: &AppState,
) -> Result<(), String> {
    use tauri::{Manager, Emitter};

    let settings = state.get_settings();
    if !settings.interface.close_action_prompted {
        app.emit("request-close-action", ()).map_err(|e| e.to_string())?;
        return Ok(());
    }

    if state.should_minimize_on_close_with_tasks() && state.has_incomplete_download_tasks()? {
        let main_win = app
            .get_webview_window("main")
            .ok_or("Main window not found")?;

        main_win.minimize().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let close_action = settings.interface.close_action;
    let main_win = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    use crate::core::settings::CloseAction;
    match close_action {
        CloseAction::Minimize => {
            main_win.minimize().map_err(|e| e.to_string())?;
        }
        CloseAction::Tray => {
            main_win.hide().map_err(|e| e.to_string())?;
        }
        CloseAction::Exit => {
            app.exit(0);
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn close_main_window(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    handle_close_action(&app, &state).await
}

#[cfg(target_os = "windows")]
pub fn set_window_shadow(window: &tauri::WebviewWindow, disable: bool) -> Result<(), String> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};

    let handle = window.window_handle().map_err(|e| e.to_string())?;
    let hwnd = match handle.as_raw() {
        RawWindowHandle::Win32(h) => h.hwnd.get() as *mut std::ffi::c_void,
        _ => return Err("Not running on Windows".to_string()),
    };

    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmSetWindowAttribute(
            hwnd: *mut std::ffi::c_void,
            dwAttribute: u32,
            pvAttribute: *const std::ffi::c_void,
            cbAttribute: u32,
        ) -> i32;
    }

    let attribute = 2; // DWMWA_NCRENDERING_POLICY
    let policy: i32 = if disable { 1 } else { 2 }; // 1 = DWMNCRP_DISABLED, 2 = DWMNCRP_ENABLED

    unsafe {
        let hr = DwmSetWindowAttribute(
            hwnd,
            attribute,
            &policy as *const i32 as *const std::ffi::c_void,
            std::mem::size_of::<i32>() as u32,
        );
        if hr != 0 {
            return Err(format!("DwmSetWindowAttribute failed with HRESULT: 0x{:X}", hr));
        }
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn set_window_shadow(_window: &tauri::WebviewWindow, _disable: bool) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn exit_app(app: AppHandle) {
    app.exit(0);
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn get_cursor_screen_pos() -> Result<(i32, i32), String> {
    #[repr(C)]
    struct POINT {
        x: i32,
        y: i32,
    }

    #[link(name = "user32")]
    extern "system" {
        fn GetCursorPos(lp_point: *mut POINT) -> i32;
    }

    let mut point = POINT { x: 0, y: 0 };
    unsafe {
        if GetCursorPos(&mut point) == 0 {
            return Err("GetCursorPos failed".to_string());
        }
    }
    Ok((point.x, point.y))
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn get_cursor_screen_pos() -> Result<(i32, i32), String> {
    Err("Not supported on this platform".to_string())
}
