# Marker Tracking Implementation

## Overview
The system has been simplified to track a single ArUco marker instead of multiple people using YOLO pose detection.

## Changes Made

### Python Backend

#### New File: `python/markertrack.py`
- Detects ArUco markers (DICT_ARUCO_ORIGINAL dictionary)
- Sends normalized x-position (0-1) via OSC to `/marker/x`
- Simpler than bodytrack.py - no person tracking, no ID pool management
- Only broadcasts horizontal position of the first detected marker

**To Run:**
```bash
cd python
python markertrack.py
```

### JavaScript Frontend

#### New File: `js/markerDetection.js`
Replaces the complex `poseDetection.js` with a much simpler implementation:

**Removed Complexity:**
- ❌ Multiple person tracking
- ❌ Confidence-based selection
- ❌ Fish-eye distortion correction
- ❌ Complex ID mapping (display ID vs OSC ID)
- ❌ Area-based distance calculation

**Kept Essential Features:**
- ✅ WebSocket connection to OSC server
- ✅ Simple smoothing (5-frame window)
- ✅ Random date selection when no marker detected
- ✅ Debug display
- ✅ Marker timeout detection (2 seconds)

**Key Variables:**
- `window.markerX` - Current marker position (replaces `window.noseX`)
- `randomDateInterval` - Controls random date mode when no marker

#### Modified File: `js/oceanGenerative.js`
- Changed all references from `window.noseX` to `window.markerX`
- Removed `checkForNoseMovement()` function (no longer needed)
- Removed unused variables (`lastNoseX`, `lastNoseY`)
- Added comment explaining marker position is now used

#### Modified File: `index.html`
- Changed script reference from `poseDetection.js` to `markerDetection.js`

## How It Works

1. **Marker Detection** (`markertrack.py`):
   - Camera captures frames
   - Detects ArUco markers
   - Calculates center position
   - Sends normalized x-coordinate (0-1) via OSC

2. **Position Reception** (`markerDetection.js`):
   - Listens for `/marker/x` OSC messages via WebSocket
   - Converts normalized position to video width space (0-200)
   - Applies simple smoothing
   - Updates `window.markerX`

3. **Visualization** (existing code):
   - Timeline visualization uses `window.markerX`
   - Ocean ripples triggered by position changes
   - Random dates shown when no marker detected

## Marker Requirements

**Important:** Only ArUco markers from the **DICT_ARUCO_ORIGINAL** dictionary will work.

**To generate a marker:**
1. Visit: https://chev.me/arucogen/
2. Select "Original ArUco" dictionary
3. Choose any marker ID (0, 1, 2, etc.)
4. Print or display on screen

**Alternative dictionaries** (change `MARKER_DICT` in markertrack.py):
- `aruco.DICT_4X4_50`
- `aruco.DICT_5X5_100`
- `aruco.DICT_6X6_250`
- `aruco.DICT_APRILTAG_36h11`

## Testing

1. **Start the marker tracking:**
   ```bash
   cd python
   python markertrack.py
   ```

2. **Open the web interface:**
   - Open `index.html` in a browser
   - Check debug panel for marker status

3. **Hold an ArUco marker in front of the camera:**
   - Move it horizontally to control timeline position
   - Debug panel should show "Active" status
   - Marker position should update in real-time

4. **Remove marker:**
   - System should automatically switch to random date mode after 2 seconds
   - Debug panel shows "No marker detected" / "Random dates"

## Debugging

**Check these if marker isn't detected:**
- Marker is from correct dictionary (DICT_ARUCO_ORIGINAL)
- Marker is clearly visible and not distorted
- Camera has good lighting
- OSC server is running (check terminal output)
- WebSocket connection is active (check debug panel)

**Debug panel shows:**
- Marker position (raw and normalized)
- Active/Inactive status
- Last OSC message received
- WebSocket connection status
