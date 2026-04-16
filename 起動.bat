@echo off
title Boatrace App

cd /d "%~dp0"

echo.
echo ========================================
echo  Boatrace App Launcher
echo ========================================
echo.

:: Check Python
python --version > nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Please install Python and add to PATH.
    pause
    exit /b 1
)

:: Check npm
where npm > nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm not found. Please install Node.js.
    pause
    exit /b 1
)

:: --- Step 1: Fetch latest data ---
echo [1/2] Fetching latest race data...
echo.

python fetch_from_openapi.py

if %errorlevel% neq 0 (
    echo.
    echo [WARNING] Data fetch failed. Starting app anyway...
    echo Press any key to continue...
    pause > nul
)

echo.
echo [1/2] Data fetch done!
echo.

:: --- Step 2: Start Nuxt app ---
echo [2/2] Starting Nuxt dev server...
echo       Open: http://localhost:3000
echo.

cd nuxt-app

start /b cmd /c "timeout /t 5 /nobreak > nul && start http://localhost:3000"

call npm run dev

pause
