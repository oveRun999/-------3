@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "LZH_DIR=%SCRIPT_DIR%downloaded_lzh"
set "OUT_DIR=%SCRIPT_DIR%extracted_txt"
set "SEVENZIP=C:\Program Files\7-Zip\7z.exe"

if not exist "%SEVENZIP%" (
  echo 7-Zip not found: %SEVENZIP%
  pause
  exit /b 1
)

if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"

echo === Extracting LZH files ===
for %%F in ("%LZH_DIR%\k*.lzh") do (
  call :extract_one "%%F" "%%~nF"
)

echo.
echo === Importing to DB ===
cd /d "%SCRIPT_DIR%"
node import_kresult.js "%OUT_DIR%"

echo.
pause
exit /b 0


:extract_one
set "LZH_FILE=%~1"
set "BASE=%~2"
set "SUFFIX=%BASE:~1%"
set "TXT_PATH=%OUT_DIR%\K%SUFFIX%.TXT"

if exist "%TXT_PATH%" (
  echo [SKIP] %BASE%
  goto :eof
)

"%SEVENZIP%" e "%LZH_FILE%" -o"%OUT_DIR%" -aoa -y > nul 2>&1
if %errorlevel%==0 (
  echo [OK] %BASE%
) else (
  echo [FAIL] %BASE%
)
goto :eof
