use crate::core::state::AppState;
use crate::core::window_state::save_main_window_state_now;
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

    save_main_window_state_now(&app)?;
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
    let float_win = app
        .get_webview_window("float")
        .ok_or("Float window not found")?;

    float_win.hide().map_err(|e| e.to_string())?;
    main_win.show().map_err(|e| e.to_string())?;
    main_win.set_focus().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn open_settings_window(app: AppHandle) -> Result<(), String> {
    use tauri::Manager;

    let settings_win = app
        .get_webview_window("settings")
        .ok_or("Settings window not found")?;

    settings_win
        .eval("window.location.replace('/settings')")
        .map_err(|e| e.to_string())?;
    settings_win.center().map_err(|e| e.to_string())?;
    settings_win.show().map_err(|e| e.to_string())?;
    settings_win.set_focus().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn close_settings_window(app: AppHandle) -> Result<(), String> {
    use tauri::Manager;

    let settings_win = app
        .get_webview_window("settings")
        .ok_or("Settings window not found")?;

    settings_win.hide().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn close_main_window(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    if state.should_minimize_on_close_with_tasks() && state.has_incomplete_download_tasks()? {
        use tauri::Manager;

        let main_win = app
            .get_webview_window("main")
            .ok_or("Main window not found")?;

        save_main_window_state_now(&app)?;
        main_win.minimize().map_err(|e| e.to_string())?;
        return Ok(());
    }

    if state.should_close_to_float() {
        switch_to_float(app).await
    } else {
        save_main_window_state_now(&app)?;
        app.exit(0);
        Ok(())
    }
}
