@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules\puppeteer\package.json" (
    echo Dependencies are not installed yet. Running "npm ci" once...
    call npm ci
    if errorlevel 1 (
        echo.
        echo "npm ci" failed. Install Node.js 22.12 or newer and run "npm ci" in this folder.
        pause
        exit /b 1
    )
)

node index.js
pause
