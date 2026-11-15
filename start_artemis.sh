#!/usr/bin/env bash
# ============================================================================
# NASA Space Apps Challenge 2026 — ArtemisForge 1-Click Launcher (Linux/macOS)
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT=5173
URL="http://localhost:${PORT}/"

echo "=================================================================="
echo "  🚀 ARTEMISFORGE — NASA SPACE APPS 2026 TACTICAL LAUNCHER"
echo "=================================================================="

# 1. Install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
  echo "[1/3] Instalando dependencias con npm..."
  npm install
else
  echo "[1/3] Dependencias listas."
fi

# 2. Generate NASA LRO LOLA / Diviner dataset if missing
if [ ! -f "public/data/shackleton_pds_grid.json" ]; then
  echo "[2/3] Generando datos lunares NASA PDS (Shackleton 89.9°S)..."
  python3 scripts/generate_lunar_data.py
else
  echo "[2/3] Dataset lunar NASA PDS verificado."
fi

# Helper to open browser cross-platform
open_browser() {
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 &
  elif command -v gnome-open >/dev/null 2>&1; then
    gnome-open "$URL" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1 &
  fi
}

# 3. Check if server is already running on port 5173
if curl -s -o /dev/null "http://localhost:${PORT}/"; then
  echo "[3/3] El servidor ya está activo en ${URL}"
  echo "      Abriendo navegador..."
  open_browser
  exit 0
fi

echo "[3/3] Iniciando servidor ArtemisForge en ${URL} ..."
(
  # Wait until server responds, then launch browser
  for _ in {1..30}; do
    if curl -s -o /dev/null "http://localhost:${PORT}/"; then
      open_browser
      break
    fi
    sleep 0.3
  done
) &

npm run dev
