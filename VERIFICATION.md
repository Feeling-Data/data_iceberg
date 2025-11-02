# Setup Verification

## ✅ Verified Configuration

### Python Tracking Script (`python/bodytrack.py`)
- ✅ OSC client configured on `127.0.0.1:6448` (matches server port)
- ✅ Sends messages to address pattern `/person/{id}` (matches expected format)
- ✅ Message format: `[center_x, y2, confidence*100, width, height]`
  - This matches frontend expectations: `[center_x, y2, confidence, width, height]`
  - Note: Python sends confidence*100 (0-100 scale), frontend handles both 0-1 and 0-100 scales

### Node.js Bridge Server (`server.js`)
- ✅ Listens for OSC on UDP port `6448`
- ✅ Serves WebSocket on port `8080`
- ✅ Serves HTTP on port `3000`
- ✅ All dependencies installed (osc, ws, open, concurrently)

### Frontend (`js/poseDetection.js`)
- ✅ Connects to WebSocket at `localhost:8080`
- ✅ Processes messages with address pattern `/person/{id}`
- ✅ Expects 5 arguments: `[center_x, y2, confidence, width, height]`

## 🧪 Testing Steps

1. **Start everything:**
   ```bash
   npm run start:all
   ```

2. **Verify Python is running:**
   - You should see the tracking window open
   - Check terminal for "Resolution: WxH" message

3. **Verify Node.js server is running:**
   - Terminal should show:
     - "OSC server listening on UDP port 6448"
     - "WebSocket server listening on port 8080"
     - "HTTP server listening on http://localhost:3000"
   - Browser should auto-open to `http://localhost:3000`

4. **Verify connection:**
   - Open browser DevTools → Console
   - When a person is detected, you should see OSC messages in server terminal
   - Timeline bars and ripples should appear

## 🔧 Troubleshooting

- **Python script fails to start:**
  - Ensure virtual environment is created: `cd python && python -m venv .venv`
  - Activate and install: `source .venv/bin/activate && pip install -r requirements.txt`

- **OSC messages not received:**
  - Check Python script is sending to port 6448
  - Verify firewall isn't blocking UDP port 6448

- **WebSocket connection fails:**
  - Ensure Node.js server is running on port 8080
  - Check browser console for connection errors

- **No bars/ripples appear:**
  - Check that person tracking is working (YOLO detection)
  - Verify confidence threshold in `js/poseDetection.js` (MIN_CONFIDENCE = 0.5)

