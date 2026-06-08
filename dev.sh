#!/usr/bin/env bash
set -e

# ─── Colors ────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

echo ""
echo -e "${CYAN}${BOLD} ╔══════════════════════════════════════╗${RESET}"
echo -e "${CYAN}${BOLD} ║   PiDownloader - Dev Preview         ║${RESET}"
echo -e "${CYAN}${BOLD} ╚══════════════════════════════════════╝${RESET}"
echo ""

# ─── Resolve script directory ──────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ─── Check prerequisites ──────────────────────────
echo -e "[1/4] Checking Rust toolchain..."
if ! command -v cargo &>/dev/null; then
    echo -e "  ${RED}[ERROR]${RESET} cargo not found. Please install Rust: https://rustup.rs"
    exit 1
fi
echo -e "      ${GREEN}OK${RESET}"

echo -e "[2/4] Checking Node.js..."
if ! command -v node &>/dev/null; then
    echo -e "  ${RED}[ERROR]${RESET} node not found. Please install Node.js: https://nodejs.org"
    exit 1
fi
echo -e "      ${GREEN}OK${RESET}"

echo -e "[3/4] Checking Tauri CLI..."
if ! cargo tauri --version &>/dev/null; then
    echo -e "      Not found. Installing tauri-cli..."
    cargo install tauri-cli
fi
echo -e "      ${GREEN}OK${RESET}"

# ─── Install frontend dependencies ────────────────
echo -e "[4/4] Checking frontend dependencies..."
if [ ! -d "frontend/node_modules" ]; then
    echo "      Installing npm packages..."
    cd frontend
    npm install
    cd ..
else
    echo -e "      ${GREEN}OK${RESET}"
fi

echo ""
echo " ────────────────────────────────────────"
echo "  Starting Tauri dev server..."
echo "  Frontend: http://localhost:5173"
echo "  Press Ctrl+C to stop."
echo " ────────────────────────────────────────"
echo ""

cargo tauri dev
