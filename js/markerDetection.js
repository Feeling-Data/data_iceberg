// Simple marker position tracking via WebSocket/OSC
// Receives marker x position from Python marker tracking script
// NOTE: Perspective correction is done in Python (markertrack.py) before sending

let ws = null;
let lastOSCMessage = null;

// Global marker position (0-1 normalized, then scaled to videoWidth)
window.markerX = null;

// Video width for timeline mapping (defined in timeline.js)
function getVideoWidth() {
  return (typeof window !== 'undefined' && window.videoWidth) ? window.videoWidth : 200;
}

// Enhanced exponential moving average smoothing for more responsive feel
const EMA_ALPHA = 0.3; // Smoothing factor (0-1): lower = smoother, higher = more responsive
let smoothedMarkerX = null;
const MARKER_MOVE_THRESHOLD = 0.3; // Reduced threshold for more responsive updates (in videoWidth units)

// Velocity tracking for intelligent throttling
let lastMarkerX = null;
let lastMarkerUpdateTimeInternal = 0;

// Random date selection when no marker is detected
let randomDateInterval = null;
const RANDOM_DATE_INTERVAL_MS = 10000; // 10 seconds
let lastMarkerUpdateTime = 0;
const MARKER_TIMEOUT_MS = 2000; // Consider marker lost after 2 seconds

// Expose randomDateInterval to window for oceanGenerative.js
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'randomDateInterval', {
    get: () => randomDateInterval,
    set: (value) => { randomDateInterval = value; }
  });
}

// Debug display update
function updateDebugDisplay() {
  if (typeof document === 'undefined') return;
  
  const debugPanel = document.getElementById('debug-panel');
  if (!debugPanel) return;
  
  const personsDiv = document.getElementById('debug-persons');
  if (!personsDiv) return;
  
  personsDiv.innerHTML = '';
  
  // Show marker status
  const markerDiv = document.createElement('div');
  markerDiv.style.marginTop = '10px';
  markerDiv.style.borderTop = '1px solid rgba(255,255,255,0.1)';
  markerDiv.style.paddingTop = '8px';
  markerDiv.innerHTML = `<div style="color: rgba(100,200,255,1); font-size: 11px; margin-bottom: 5px;">Marker Position:</div>`;
  personsDiv.appendChild(markerDiv);
  
  const statusDiv = document.createElement('div');
  statusDiv.className = 'debug-row';
  statusDiv.style.marginLeft = '10px';
  
  if (window.markerX !== null) {
    const vWidth = getVideoWidth();
    const normalized = window.markerX / vWidth;
    statusDiv.innerHTML = `
      <div><span class="debug-label">Position X:</span> <span class="debug-value">${window.markerX.toFixed(2)}</span></div>
      <div><span class="debug-label">Normalized:</span> <span class="debug-value">${normalized.toFixed(3)}</span></div>
      <div><span class="debug-label">Status:</span> <span class="debug-value" style="color: #00ff00;">Active</span></div>
      <div style="font-size: 9px; color: rgba(255,255,255,0.5); margin-top: 3px;">Calibration in markertrack.py</div>
    `;
  } else {
    statusDiv.innerHTML = `
      <div><span class="debug-label">Status:</span> <span class="debug-value" style="color: #ff9900;">No marker detected</span></div>
      <div><span class="debug-label">Mode:</span> <span class="debug-value">Random dates</span></div>
    `;
  }
  personsDiv.appendChild(statusDiv);
  
  // Show last OSC message
  if (lastOSCMessage) {
    const oscDiv = document.createElement('div');
    oscDiv.style.marginTop = '10px';
    oscDiv.style.borderTop = '1px solid rgba(255,255,255,0.1)';
    oscDiv.style.paddingTop = '8px';
    oscDiv.innerHTML = `<div style="color: rgba(255,255,255,0.7); font-size: 11px; margin-bottom: 5px;">Last OSC Message:</div>`;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'debug-row';
    messageDiv.style.marginLeft = '10px';
    messageDiv.style.color = 'rgba(200,255,200,0.9)';
    messageDiv.style.fontSize = '10px';
    messageDiv.style.fontFamily = 'monospace';
    messageDiv.textContent = JSON.stringify(lastOSCMessage, null, 2);
    
    oscDiv.appendChild(messageDiv);
    personsDiv.appendChild(oscDiv);
  }
  
  // Update last update time
  const lastUpdateEl = document.getElementById('debug-last-update');
  if (lastUpdateEl) {
    lastUpdateEl.textContent = new Date().toLocaleTimeString();
  }
}

// Update debug display periodically
if (typeof window !== 'undefined') {
  setInterval(updateDebugDisplay, 500);
}

// Process marker position from OSC
function processMarkerPosition(normalizedX) {
  const now = Date.now();
  lastMarkerUpdateTime = now;
  
  // Stop random date selection since marker is detected
  const wasInRandomMode = stopRandomDateSelection();
  
  // Convert normalized (0-1) to videoWidth range (0-200)
  const vWidth = getVideoWidth();
  const markerXInVideoSpace = normalizedX * vWidth;
  
  // Apply exponential moving average for smooth, responsive tracking
  if (smoothedMarkerX === null) {
    smoothedMarkerX = markerXInVideoSpace; // Initialize on first value
  } else {
    smoothedMarkerX = EMA_ALPHA * markerXInVideoSpace + (1 - EMA_ALPHA) * smoothedMarkerX;
  }
  
  // Calculate velocity for intelligent throttling
  const velocity = lastMarkerX !== null ? Math.abs(smoothedMarkerX - lastMarkerX) : 0;
  const timeSinceLastUpdate = now - lastMarkerUpdateTimeInternal;
  
  // Velocity-based throttling: fast movement = less frequent updates (smoother)
  // Slow movement = more frequent updates (responsive)
  let throttleMs = 50; // Base throttle
  if (velocity > 5) {
    throttleMs = 150; // Fast movement: update less often
  } else if (velocity > 2) {
    throttleMs = 100; // Medium movement
  } else {
    throttleMs = 50; // Slow/fine movement: update more often
  }
  
  // Check if enough time has passed based on velocity
  const shouldUpdate = window.markerX === null || 
                       (Math.abs(smoothedMarkerX - window.markerX) > MARKER_MOVE_THRESHOLD &&
                        timeSinceLastUpdate >= throttleMs);
  
  if (shouldUpdate) {
    lastMarkerX = window.markerX;
    window.markerX = smoothedMarkerX;
    lastMarkerUpdateTimeInternal = now;
    
    // Stop pulsing when switching from random mode to marker tracking
    if (wasInRandomMode && typeof window.stopPulsing === 'function') {
      window.stopPulsing(1);
    }
    
    // Update visualization
    if (typeof updateVisibleData === 'function') {
      updateVisibleData(window.markerX, 1);
    }
  }
}

// Check if marker has been lost (no updates for MARKER_TIMEOUT_MS)
function checkMarkerTimeout() {
  if (window.markerX !== null) {
    const now = Date.now();
    if (now - lastMarkerUpdateTime > MARKER_TIMEOUT_MS) {
      // Marker lost
      window.markerX = null;
      smoothedMarkerX = null;
      lastMarkerX = null;
      
      // Clear visualization
      if (typeof window.removePersonRipples === 'function') {
        window.removePersonRipples(1);
      }
      if (typeof window.stopPulsing === 'function') {
        window.stopPulsing(1);
      }
      
      // Start random date selection
      if (randomDateInterval === null) {
        startRandomDateSelection();
      }
    }
  }
}

// Start random date selection when no marker is detected
function startRandomDateSelection() {
  if (randomDateInterval !== null) return;
  if (window.markerX !== null) return;
  
  // Immediately select a random date
  selectRandomDate();
  
  // Set up interval for periodic random dates
  randomDateInterval = setInterval(() => {
    if (window.markerX !== null) {
      stopRandomDateSelection();
      return;
    }
    selectRandomDate();
  }, RANDOM_DATE_INTERVAL_MS);
}

// Stop random date selection
function stopRandomDateSelection() {
  const wasActive = randomDateInterval !== null;
  if (randomDateInterval !== null) {
    clearInterval(randomDateInterval);
    randomDateInterval = null;
  }
  return wasActive;
}

// Select a random date position
function selectRandomDate() {
  if (window.markerX !== null) return;
  
  const currentVideoWidth = getVideoWidth();
  const randomX = Math.random() * currentVideoWidth;
  
  window.markerX = randomX;
  
  // Update visualization
  if (typeof updateVisibleData === 'function') {
    updateVisibleData(randomX, 1);
  }
  
  // Create ripple and start pulsing after timeline updates
  setTimeout(() => {
    if (typeof window !== 'undefined') {
      if (typeof window.stopPulsing === 'function') {
        window.stopPulsing(1);
      }
      
      window.lastTimelinePosition = null;
      
      if (typeof window.createRippleAtCurrentPosition === 'function') {
        window.createRippleAtCurrentPosition(1);
      }
      
      if (typeof window.startPulsing === 'function') {
        window.startPulsing(1);
      }
    }
  }, 200);
}

// Connect to WebSocket server
function connectWebSocket() {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost = window.location.hostname || 'localhost';
  const wsPort = 8080;
  const wsUrl = `${wsProtocol}//${wsHost}:${wsPort}`;
  
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    const statusEl = document.getElementById('debug-status');
    const connectionEl = document.getElementById('debug-connection');
    if (statusEl) statusEl.className = 'debug-status connected';
    if (connectionEl) {
      connectionEl.textContent = 'Connected';
      connectionEl.style.color = '#00ff00';
    }
  };
  
  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      lastOSCMessage = message;
      
      // Parse OSC address pattern: /marker/x
      if (message.address === '/marker/x' && message.args && message.args.length > 0) {
        const normalizedX = message.args[0]; // Already normalized 0-1
        processMarkerPosition(normalizedX);
      }
    } catch (error) {
      // Silently handle errors
    }
  };
  
  ws.onerror = (error) => {
    // Silently handle errors
  };
  
  ws.onclose = (event) => {
    const statusEl = document.getElementById('debug-status');
    const connectionEl = document.getElementById('debug-connection');
    if (statusEl) statusEl.className = 'debug-status disconnected';
    if (connectionEl) {
      connectionEl.textContent = 'Disconnected';
      connectionEl.style.color = '#ff0000';
    }
    // Reconnect after 3 seconds
    setTimeout(connectWebSocket, 3000);
  };
}

// Periodic marker timeout check
if (typeof window !== 'undefined') {
  setInterval(checkMarkerTimeout, 1000);
}

// Initialize WebSocket connection when page loads
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      connectWebSocket();
      // Start random date selection after initialization
      setTimeout(() => {
        if (window.markerX === null) {
          startRandomDateSelection();
        }
      }, 2000);
    });
  } else {
    connectWebSocket();
    setTimeout(() => {
      if (window.markerX === null) {
        startRandomDateSelection();
      }
    }, 2000);
  }
}
