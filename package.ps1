param(
    [switch]$Clean,
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-Command {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Tool {
    param(
        [string]$Command,
        [string[]]$Arguments
    )

    Write-Host "> $Command $($Arguments -join ' ')" -ForegroundColor DarkGray
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: $Command $($Arguments -join ' ')"
    }
}

$PackageManager = $null
if (Test-Path "pnpm-lock.yaml") {
    $PackageManager = "pnpm"
} elseif (Test-Path "package-lock.json") {
    $PackageManager = "npm"
} elseif (Test-Path "yarn.lock") {
    $PackageManager = "yarn"
} elseif (Test-Path "package.json") {
    $PackageManager = "npm"
}

if ($Clean) {
    Write-Step "Cleaning build output"
    foreach ($Path in @("dist", "build", ".output", "src-tauri\target\release\bundle")) {
        if (Test-Path $Path) {
            Remove-Item -LiteralPath $Path -Recurse -Force
        }
    }
}

if ($PackageManager) {
    if (-not (Test-Command $PackageManager)) {
        throw "Missing package manager: $PackageManager"
    }

    if (-not $SkipInstall) {
        Write-Step "Installing dependencies"
        switch ($PackageManager) {
            "pnpm" { Invoke-Tool "pnpm" @("install", "--frozen-lockfile") }
            "npm" { Invoke-Tool "npm" @("ci") }
            "yarn" { Invoke-Tool "yarn" @("install", "--frozen-lockfile") }
        }
    }

    Write-Step "Building frontend"
    switch ($PackageManager) {
        "pnpm" { Invoke-Tool "pnpm" @("run", "build") }
        "npm" { Invoke-Tool "npm" @("run", "build") }
        "yarn" { Invoke-Tool "yarn" @("build") }
    }
}

if (Test-Path "src-tauri\tauri.conf.json") {
    Write-Step "Packaging Tauri application"
    if ($PackageManager -eq "pnpm" -and (Test-Command "pnpm")) {
        Invoke-Tool "pnpm" @("tauri", "build")
    } elseif ($PackageManager -eq "npm" -and (Test-Command "npm")) {
        Invoke-Tool "npm" @("run", "tauri", "build")
    } elseif (Test-Command "cargo") {
        Invoke-Tool "cargo" @("tauri", "build")
    } else {
        throw "No available Tauri build command found."
    }
} elseif (Test-Path "Cargo.toml") {
    Write-Step "Building Rust release"
    if (-not (Test-Command "cargo")) {
        throw "Missing Rust toolchain: cargo"
    }
    Invoke-Tool "cargo" @("build", "--release")
} elseif (-not $PackageManager) {
    throw "No supported project entry found. Expected package.json, Cargo.toml, or src-tauri\tauri.conf.json."
}

Write-Step "Package complete"
