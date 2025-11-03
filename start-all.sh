#!/bin/bash

# Unified startup script for the Data Iceberg project
# This script:
# 1. Kills any existing processes on required ports
# 2. Starts the Python body tracking script
# 3. Starts the Node.js server
# 4. Opens the browser in fullscreen mode

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 Starting Data Iceberg Project..."
echo ""

# Step 1: Kill existing processes
echo "1️⃣  Cleaning up existing processes..."
bash kill-ports.sh
echo ""

# Step 2: Start Python body tracking script
echo "2️⃣  Starting Python body tracking script..."
cd python
bash start.sh &
PYTHON_PID=$!
cd ..
echo "   Python script started (PID: $PYTHON_PID)"
echo ""

# Step 3: Wait a moment for Python to initialize
sleep 2

# Step 4: Start Node.js server (which auto-opens browser)
echo "3️⃣  Starting Node.js server..."
FULLSCREEN=true node server.js &
SERVER_PID=$!
echo "   Server started (PID: $SERVER_PID)"
echo ""

# Step 5: Wait for server to be ready and browser to open
echo "4️⃣  Waiting for server to start and browser to open..."
sleep 5

# Step 6: Fullscreen the browser using AppleScript (fallback if kiosk mode didn't work)
echo "5️⃣  Attempting to ensure browser is fullscreen..."
sleep 2  # Give browser more time to fully load

osascript <<EOF
tell application "System Events"
    -- Try to find and activate the browser
    set browserApps to {"Google Chrome", "Safari", "Firefox", "Microsoft Edge", "Brave Browser"}
    set foundBrowser to false

    repeat with browserApp in browserApps
        if (name of processes) contains browserApp then
            tell application browserApp to activate
            delay 0.5
            tell process browserApp
                -- Try fullscreen mode using Cmd+Ctrl+F
                try
                    keystroke "f" using {command down, control down}
                on error
                    -- Alternative: Try Cmd+Shift+F
                    try
                        keystroke "f" using {command down, shift down}
                    end try
                end try
                set foundBrowser to true
                exit repeat
            end tell
        end if
    end repeat

    if not foundBrowser then
        -- Fallback: try to fullscreen whatever is frontmost (except Terminal)
        set frontApp to name of first application process whose frontmost is true
        if frontApp is not "Terminal" and frontApp is not "iTerm2" then
            tell process frontApp
                try
                    keystroke "f" using {command down, control down}
                end try
            end tell
        end if
    end if
end tell
EOF

echo ""
echo "✅ All services started!"
echo ""
echo "📋 Process IDs:"
echo "   Python body tracking: PID $PYTHON_PID"
echo "   Node.js server: PID $SERVER_PID"
echo ""
echo "🌐 Application should be running at: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop all services..."
echo ""

# Wait for Ctrl+C
trap "echo ''; echo '🛑 Stopping all services...'; kill $PYTHON_PID $SERVER_PID 2>/dev/null; bash kill-ports.sh; exit" INT TERM

# Keep script running
wait

