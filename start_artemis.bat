@echo off
title ArtemisForge - NASA Space Apps 2026 Launcher
cd /d "%~dp0"

echo ==================================================================
echo   ARTEMISFORGE - NASA SPACE APPS 2026 TACTICAL LAUNCHER (WINDOWS)
echo ==================================================================
echo.

:: 1. Verificar e instalar dependencias de Node.js si faltan
if not exist "node_modules\" (
    echo [1/3] Instalando dependencias con npm...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Fallo npm install. Verifica que Node.js este instalado.
        pause
        exit /b 1
    )
) else (
    echo [1/3] Dependencias listas.
)

:: 2. Generar dataset lunar de la NASA si no existe
if not exist "public\data\shackleton_pds_grid.json" (
    echo [2/3] Generando datos lunares NASA PDS...
    where python >nul 2>nul
    if %errorlevel% equ 0 (
        python scripts\generate_lunar_data.py
    ) else (
        py scripts\generate_lunar_data.py
    )
) else (
    echo [2/3] Dataset lunar NASA PDS verificado.
)

:: 3. Abrir el navegador predeterminado automaticamente y lanzar Vite
echo [3/3] Abriendo http://localhost:5173/ en el navegador...
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:5173/"

echo.
echo Servidor en ejecucion. Presiona Ctrl+C en esta ventana para detenerlo.
echo ==================================================================
call npm run dev
pause
