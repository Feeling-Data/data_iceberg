@echo off
REM Unified startup script for the Data Iceberg project (Windows)
REM This script:
REM 1. Kills any existing processes on required ports
REM 2. Starts the Python body tracking script
REM 3. Starts the Node.js server
REM 4. Opens the browser in fullscreen mode

cd /d "%~dp0"

echo.
echo 🚀 Starting Data Iceberg Project...
echo.

REM Step 1: Kill existing processes on ports 8080, 3000, and 6448
echo 1️⃣  Cleaning up existing processes...
for %%p in (8080 3000 6448) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%%p ^| findstr LISTENING') do (
        echo Killing process %%a on port %%p
        taskkill /F /PID %%a >nul 2>&1
    )
)
echo.

REM Step 2: Start Python body tracking script
echo 2️⃣  Starting Python body tracking script...
cd python
if exist ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
    start /B python bodytrack.py
) else (
    REM Try python3 first, then python
    where python3 >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        start /B python3 bodytrack.py
    ) else (
        start /B python bodytrack.py
    )
)
cd ..
echo    Python script started
echo.

REM Step 3: Wait a moment for Python to initialize
timeout /t 2 /nobreak >nul

REM Step 4: Start Node.js server (which auto-opens browser)
echo 3️⃣  Starting Node.js server...
set FULLSCREEN=true
start /B node server.js
echo    Server started
echo.

REM Step 5: Wait for server to be ready and browser to open
echo 4️⃣  Waiting for server to start and browser to open...
timeout /t 5 /nobreak >nul

REM Step 6: Fullscreen the browser (Windows will handle this via server.js kiosk mode)
echo 5️⃣  Browser should open in fullscreen/kiosk mode...
echo.

echo.
echo ✅ All services started!
echo.
echo 🌐 Application should be running at: http://localhost:3000
echo.
echo Press Ctrl+C to stop all services...
echo.

REM Keep script running and wait for Ctrl+C
pause

