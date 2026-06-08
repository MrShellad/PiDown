@echo off
setlocal

set "EXIT_CODE=0"

cd /d "%~dp0"
title PiDownloader Dev

echo.
echo ========================================
echo   PiDownloader - Dev Preview
echo ========================================
echo.

echo [1/4] Checking Rust toolchain...
where cargo >nul 2>&1
if errorlevel 1 (
    echo   [ERROR] cargo not found. Please install Rust: https://rustup.rs
    set "EXIT_CODE=1"
    goto :finish
)
echo       OK

echo [2/4] Checking Node.js and npm...
where node >nul 2>&1
if errorlevel 1 (
    echo   [ERROR] node not found. Please install Node.js: https://nodejs.org
    set "EXIT_CODE=1"
    goto :finish
)
where npm >nul 2>&1
if errorlevel 1 (
    echo   [ERROR] npm not found. Please reinstall Node.js: https://nodejs.org
    set "EXIT_CODE=1"
    goto :finish
)
echo       OK

echo [3/4] Checking Tauri CLI...
call cargo tauri --version >nul 2>&1
if errorlevel 1 (
    echo       Not found. Installing tauri-cli...
    call cargo install tauri-cli
    if errorlevel 1 (
        echo   [ERROR] Failed to install tauri-cli.
        set "EXIT_CODE=1"
        goto :finish
    )
)
echo       OK

echo [4/4] Checking frontend dependencies...
if not exist "frontend\node_modules" (
    echo       Installing npm packages...
    pushd "frontend"
    call npm install
    if errorlevel 1 (
        popd
        echo   [ERROR] npm install failed.
        set "EXIT_CODE=1"
        goto :finish
    )
    popd
) else (
    echo       OK
)

echo.
echo ========================================
echo   Starting Tauri dev server...
echo   Frontend: http://localhost:5173
echo   Press Ctrl+C to stop.
echo ========================================
echo.

call cargo tauri dev
set "EXIT_CODE=%errorlevel%"

:finish
echo.
if "%EXIT_CODE%"=="0" (
    echo Script finished. Press any key to close this window.
) else (
    echo Script exited with error code %EXIT_CODE%. Press any key to close this window.
)
pause >nul
exit /b %EXIT_CODE%
