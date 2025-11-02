# Data Iceberg - Interactive Timeline Visualization

An interactive data visualization that uses body tracking to navigate through a timeline of events. The visualization displays bars for different data categories and creates ripples in an ocean-like generative background.

## Architecture

The project consists of three main components:

1. **Python Body Tracking** (`python/`) - Tracks people using a camera and sends OSC messages
2. **Node.js Bridge Server** (`server.js`) - Receives OSC messages and forwards them via WebSocket
3. **Frontend Visualization** (`index.html`, `js/`) - Receives tracking data and renders the timeline

## Setup

### Prerequisites

- Node.js (v14 or higher)
- Python 3.7 or higher
- Camera (GoPro or webcam) for body tracking

### Installation

1. **Install Node.js dependencies:**
```bash
npm install
```

2. **Install Python dependencies:**
```bash
cd python
python3 -m venv .venv
source .venv/bin/activate
pip3 install -r requirements.txt
cd ..
```

   **Note:** On macOS, use `python3` and `pip3` instead of `python` and `pip`. If `pip3` is not available, use `python3 -m pip install -r requirements.txt`.

### Running the Application

#### Option 1: Run Everything Together (Recommended)
```bash
npm run start:all
```
This will start both the Node.js server and Python tracking script simultaneously.

#### Option 2: Run Separately

**Terminal 1 - Start the Node.js server:**
```bash
npm start
# or
npm run start:server
```

**Terminal 2 - Start Python tracking:**
```bash
npm run start:python
# or manually:
cd python && python bodytrack.py
```

The browser should automatically open to `http://localhost:3000`. If not, navigate there manually.

## Project Structure

```
data_iceberg/
├── python/              # Python body tracking scripts
│   ├── bodytrack.py    # Main tracking script (add your files here)
│   └── requirements.txt # Python dependencies
├── js/                  # Frontend JavaScript
│   ├── poseDetection.js # WebSocket client & tracking logic
│   ├── timeline.js      # D3.js timeline visualization
│   └── oceanGenerative.js # Generative ocean background
├── server.js           # Node.js OSC-to-WebSocket bridge
├── index.html          # Main HTML file
├── data.json           # Timeline data
└── package.json        # Node.js dependencies
```

## How It Works

1. **Python Script** (`python/bodytrack.py`):
   - Captures video from camera
   - Detects and tracks people
   - Sends OSC messages to `localhost:6448` with format:
     - Address: `/person/{id}`
     - Arguments: `[center_x, y2, confidence, width, height]`

2. **Bridge Server** (`server.js`):
   - Listens for UDP OSC messages on port `6448`
   - Runs WebSocket server on port `8080`
   - Runs HTTP server on port `3000` (serves frontend)
   - Forwards OSC messages as JSON over WebSocket

3. **Frontend** (`index.html` + `js/`):
   - Connects to WebSocket server
   - Receives person tracking data
   - Maps person position to timeline dates
   - Renders bars for data categories
   - Creates ripples in generative ocean background

## Features

- **Single Person Tracking**: Tracks the closest person (by bounding box area)
- **Random Date Selection**: When no person is detected, randomly selects dates every 10 seconds
- **Interactive Timeline**: Navigate through timeline by moving left/right
- **Category Visualization**: Bars show different data categories with colors
- **Generative Ocean**: Ripple effects that respond to date selection
- **Performance Optimized**: No console logging in production code

## Configuration

- **OSC Port**: `6448` (configured in `server.js`)
- **WebSocket Port**: `8080` (configured in `server.js`)
- **HTTP Port**: `3000` (configured in `server.js`)
- **Video Width**: `200` pixels (normalized coordinate space)

## Troubleshooting

- **No bars/ripples appearing**: Check that Python script is running and sending OSC messages
- **WebSocket connection failed**: Ensure Node.js server is running (`npm start`)
- **Port already in use**: Change ports in `server.js` or kill existing processes
- **Python dependencies missing**: Run `pip install -r python/requirements.txt`

## Development

- Remove console.logs for production (already done)
- Throttling is set to optimize performance
- Random date selection works when no person is detected
- Timeline sensitivity can be adjusted in `js/timeline.js` via `DATE_SENSITIVITY_CURVE`

