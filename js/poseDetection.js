// WebSocket connection for OSC data
let ws = null;

// Store last OSC message for display
let lastOSCMessage = null;

// Debug display updates
function updateDebugDisplay() {
  if (typeof document === 'undefined') return;

  const debugPanel = document.getElementById('debug-panel');
  if (!debugPanel) return;

  const personsDiv = document.getElementById('debug-persons');
  if (!personsDiv) return;

  // Clear previous person data
  personsDiv.innerHTML = '';

  // Show all detected people (raw OSC IDs)
  if (allPeopleData.size > 0) {
    const allPeopleDiv = document.createElement('div');
    allPeopleDiv.style.marginTop = '10px';
    allPeopleDiv.style.borderTop = '1px solid rgba(255,255,255,0.1)';
    allPeopleDiv.style.paddingTop = '8px';
    allPeopleDiv.innerHTML = `<div style="color: rgba(255,255,255,0.7); font-size: 11px; margin-bottom: 5px;">All Detected People:</div>`;
    personsDiv.appendChild(allPeopleDiv);

    Array.from(allPeopleData.entries())
      .sort((a, b) => b[1].confidence - a[1].confidence)
      .forEach(([originalId, rawData]) => {
        const isActive1 = originalId === activePerson1Id;
        const activeLabel = isActive1 ? ' (Active)' : '';
        const activeColor = isActive1 ? '#00ff00' : 'rgba(255,255,255,0.5)';

        const personDiv = document.createElement('div');
        personDiv.className = 'debug-row';
        personDiv.style.marginLeft = '10px';
        personDiv.style.marginBottom = '5px';
        personDiv.innerHTML = `
          <div style="color: ${activeColor};">
            <span class="debug-label">ID ${originalId}${activeLabel}:</span>
            <span class="debug-value">conf=${rawData.confidence.toFixed(2)}</span>
          </div>
        `;
        personsDiv.appendChild(personDiv);
      });
  }

  // Show active display person
  if (personData.size > 0) {
    const activeDiv = document.createElement('div');
    activeDiv.style.marginTop = '10px';
    activeDiv.style.borderTop = '1px solid rgba(255,255,255,0.1)';
    activeDiv.style.paddingTop = '8px';
    activeDiv.innerHTML = `<div style="color: rgba(100,200,255,1); font-size: 11px; margin-bottom: 5px;">Active Person:</div>`;
    personsDiv.appendChild(activeDiv);

    personData.forEach((data, displayPersonId) => {
      const personDiv = document.createElement('div');
      personDiv.className = 'debug-row';
      personDiv.innerHTML = `
        <div style="margin-top: 5px; margin-left: 10px;">
          <div><span class="debug-label">Person ${displayPersonId}:</span></div>
          <div style="margin-left: 10px;">
            <div><span class="debug-label">Center X:</span> <span class="debug-value">${data.centerX !== null ? data.centerX.toFixed(2) : 'null'}</span></div>
            <div><span class="debug-label">Normalized:</span> <span class="debug-value">${data.lastProcessedCenterX !== null ? data.lastProcessedCenterX.toFixed(2) : 'null'}</span></div>
            <div><span class="debug-label">History Size:</span> <span class="debug-value">${data.centerXHistory.length}</span></div>
          </div>
        </div>
      `;
      personsDiv.appendChild(personDiv);
    });
  }

  // Update last update time
  const lastUpdateEl = document.getElementById('debug-last-update');
  if (lastUpdateEl) {
    lastUpdateEl.textContent = new Date().toLocaleTimeString();
  }

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
    messageDiv.style.whiteSpace = 'pre-wrap';
    messageDiv.style.wordBreak = 'break-all';
    messageDiv.textContent = JSON.stringify(lastOSCMessage, null, 2);

    oscDiv.appendChild(messageDiv);
    personsDiv.appendChild(oscDiv);
  }
}

// Update debug display periodically
if (typeof window !== 'undefined') {
  setInterval(updateDebugDisplay, 500); // Update every 500ms
}

// Person tracking data structures
// Store all detected people by their original OSC ID
const allPeopleData = new Map(); // key: original OSC personId, value: { centerX, confidence, lastUpdate, etc. }

// Map top person to display person ID (only 1 person)
let activePerson1Id = null; // Original OSC ID mapped to display person 1

// Processed data for the active display person
const personData = new Map(); // key: 1 (display person ID), value: tracking data

// Global variables for ocean ripple system (compatibility with oceanGenerative.js)
window.noseX = null;  // Person position
window.noseY = null;  // Person Y (not used but needed for compatibility)

// Random date selection when no person is tracked
let randomDateInterval = null;
const RANDOM_DATE_INTERVAL_MS = 10000; // 10 seconds

// Expose randomDateInterval to window so oceanGenerative.js can check if random mode is active
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'randomDateInterval', {
    get: () => randomDateInterval,
    set: (value) => { randomDateInterval = value; }
  });
}

const SMOOTHING_WINDOW = 10;
// videoWidth is defined in timeline.js - use window reference to avoid duplicate declaration
// Don't declare videoWidth here - just reference window.videoWidth when needed
// For convenience, create a local reference function
function getVideoWidth() {
  return (typeof window !== 'undefined' && window.videoWidth) ? window.videoWidth : 200;
}
const videoHeight = 150;
const NOSE_MOVE_THRESHOLD = 1; // Movement threshold for updates
const MAX_MISSING_FRAMES = 5;
const MIN_CONFIDENCE = 0.5; // Minimum confidence threshold

// Fish-eye distortion correction
// Adjust this value to correct for lens distortion (0 = no correction, higher = more correction)
// Typical values: 0.2-0.6 for moderate fish-eye, 0.6-1.0 for strong fish-eye
// Expose to window for easy calibration adjustment
window.FISHEYE_CORRECTION = 0.6; // Start with moderate correction, adjust based on testing
const FISHEYE_CORRECTION = () => (typeof window !== 'undefined' && window.FISHEYE_CORRECTION !== undefined)
  ? window.FISHEYE_CORRECTION : 0.6;

/**
 * Corrects for fish-eye lens distortion
 * Symptoms: center is too sensitive (small movements = large bar changes)
 *           edges are less sensitive (large movements = small bar changes)
 * Solution: compress center movements (reduce sensitivity), expand edge movements (increase sensitivity)
 * @param {number} normalizedX - Normalized position (0-1) from camera
 * @returns {number} - Corrected normalized position (0-1)
 */
function correctFisheyeDistortion(normalizedX) {
  // Center the coordinate around 0.5 (center of image)
  const centered = normalizedX - 0.5;
  const correctionFactor = FISHEYE_CORRECTION();

  // Apply a correction that:
  // - Makes center LESS sensitive (compresses center movements)
  // - Makes edges MORE sensitive (expands edge movements)
  const absCentered = Math.abs(centered);
  const sign = centered >= 0 ? 1 : -1;

  // Use inverse power curve: invert the distance from center, then apply power
  // When absCentered is small (center): use power > 1 to compress (inverse of small = large, then power > 1 compresses large)
  // When absCentered is large (edges): use power < 1 to expand (inverse of large = small, then power < 1 expands small)
  // Actually, simpler: use the inverse of the distance, then apply varying power
  // Or even simpler: apply a scaling factor that varies with distance
  // Small absCentered -> smaller scale factor (compresses)
  // Large absCentered -> larger scale factor (expands)
  const normalizedDistance = absCentered * 2; // 0 to 1
  // Scale factor: 0 at center -> 1 - correctionFactor (compresses), 1 at edge -> 1 + correctionFactor (expands)
  const scaleFactor = 1 + correctionFactor * (2 * normalizedDistance - 1);

  // Apply scaling: multiply centered value by scale factor
  // At center (normalizedDistance = 0): scaleFactor < 1 (compresses)
  // At edge (normalizedDistance = 1): scaleFactor > 1 (expands)
  const corrected = centered * scaleFactor;

  // Clamp to valid range
  const clamped = Math.max(-0.5, Math.min(0.5, corrected));

  // Return to 0-1 range
  return 0.5 + clamped;
}

// Initialize tracking data for a person
function initPersonData(personId) {
  if (!personData.has(personId)) {
    personData.set(personId, {
      centerX: null,
      centerXHistory: [],
      lastProcessedCenterX: null,
      framesWithoutDetection: 0
    });
  }
  return personData.get(personId);
}

// Update which people are active (closest to camera by area) and process them
function updateActivePeople() {
  const now = Date.now();
  const STALE_TIMEOUT = 2000; // Remove people not seen for 2 seconds

  // Remove stale people (haven't been seen recently)
  for (const [id, data] of allPeopleData.entries()) {
    if (now - data.lastUpdate > STALE_TIMEOUT) {
      allPeopleData.delete(id);
      // If this was the active person, clear them
      if (id === activePerson1Id) {
        activePerson1Id = null;
        clearDisplayPerson(1);
      }
    }
  }

  // Sort all people by distance to camera (area = width * height, larger = closer)
  // Still filter by minimum confidence to ensure valid detections
  // Note: confidence might be 0-100 scale or 0-1 scale, check both

  const sortedPeople = Array.from(allPeopleData.entries())
    .filter(([id, data]) => {
      // Handle both 0-100 scale and 0-1 scale confidence
      const conf = data.confidence;
      // Accept if confidence is >= 0.5 (normalized) OR >= 50 (0-100 scale)
      const passes = conf >= MIN_CONFIDENCE || (conf >= 50 && conf <= 100);
      return passes;
    })
    .map(([id, data]) => {
      // Calculate area (proxy for distance - larger area = closer to camera)
      const area = data.width * data.height;
      return { id, data, area };
    })
    .sort((a, b) => b.area - a.area); // Sort by area descending (largest = closest)

  // Select closest person (largest area = closest to camera)
  let newPerson1Id = sortedPeople.length > 0 ? sortedPeople[0].id : null;

  // If person changed, clear old person
  if (activePerson1Id !== null && activePerson1Id !== newPerson1Id) {
    clearDisplayPerson(1);
  }

  // Update active person assignment
  activePerson1Id = newPerson1Id;

  // Process the active person
  if (activePerson1Id !== null) {
    const data = allPeopleData.get(activePerson1Id);
    const centerX = data.centerX;
    const confidence = data.confidence;
    const width = data.width;
    const height = data.height;

    processPersonData(1, centerX, confidence, width, height);
  } else {
    // Only clear display if not in random date mode (random date mode handles its own visualization)
    if (randomDateInterval === null) {
      clearDisplayPerson(1);
    }
  }
}

// Clear display for a person (when they're no longer active)
function clearDisplayPerson(displayPersonId) {
  // Clear timeline bars
  if (typeof g !== 'undefined' && g) {
    g.selectAll(".person-1").remove();
  }
  window.noseX = null;
  window.noseY = null;
  // Clear person data
  personData.delete(1);

  // Clear ripples and stop pulsing
  if (typeof window !== 'undefined') {
    if (typeof window.removePersonRipples === 'function') {
      window.removePersonRipples(1);
    }
  }
  // Stop pulsing to clean up pulse intervals
  if (typeof window !== 'undefined' && typeof window.stopPulsing === 'function') {
    window.stopPulsing(1);
  }

  // Start random date selection when no person is tracked (if not already active)
  if (randomDateInterval === null) {
    startRandomDateSelection();
  }
}

// Process OSC data for the person
function processPersonData(displayPersonId, centerX, confidence, width, height) {
  const data = initPersonData(displayPersonId);

  // Handle confidence - might be 0-1 scale or 0-100 scale
  // Convert to normalized (0-1) for comparison
  const normalizedConfidence = confidence > 1 ? confidence / 100 : confidence;

  // Only process if confidence is above threshold
  if (normalizedConfidence < MIN_CONFIDENCE) {
    data.framesWithoutDetection++;
    if (data.framesWithoutDetection < MAX_MISSING_FRAMES) {
      // Use last known position
      if (data.lastProcessedCenterX !== null) {
        updateVisibleData(data.lastProcessedCenterX, 1);
        // Keep global variables set for ocean ripple system
        window.noseX = data.lastProcessedCenterX;
        window.noseY = 75;
      }
    } else {
      data.centerX = null;
      // Clear global variables when person is lost
      window.noseX = null;
      window.noseY = null;
    }
    return;
  }

  // Reset missing frames counter
  data.framesWithoutDetection = 0;

  // Convert center_x to match expected videoWidth range (0-200)
  // Python is sending normalized coordinates (0-1) where:
  // - centerX: normalized position (0-1)
  // - width: normalized bounding box width (0-1)
  // - height: normalized bounding box height (0-1)

  const vWidth = getVideoWidth(); // Get video width from timeline.js
  let normalizedCenterX;

  // Detect if values are normalized (0-1) or pixel values
  // If width is less than 1, assume normalized coordinates
  if (width < 1 && centerX <= 1) {
    // Camera gives values 0-1, but lower values (near 0) are inaccurate and insensitive
    // Right side (near 1) is accurate and aligned
    // Make camera range configurable for calibration
    // Expose to window for easy calibration adjustment
    if (typeof window !== 'undefined' && window.CAMERA_MIN === undefined) {
      window.CAMERA_MIN = 0; // Start higher to exclude inaccurate low range - adjust based on testing
    }
    if (typeof window !== 'undefined' && window.CAMERA_MAX === undefined) {
      window.CAMERA_MAX = 1.0;
    }
    const CAMERA_MIN = (typeof window !== 'undefined' && window.CAMERA_MIN !== undefined)
      ? window.CAMERA_MIN : 0;
    const CAMERA_MAX = (typeof window !== 'undefined' && window.CAMERA_MAX !== undefined)
      ? window.CAMERA_MAX : 1.0;

    // Clamp to valid camera range
    let clampedCenterX = Math.max(CAMERA_MIN, Math.min(CAMERA_MAX, centerX));

    // Apply fish-eye distortion correction before mapping
    // Skip correction for very small values (near 0) to preserve precision
    // Only apply correction if value is significant enough
    if (clampedCenterX > 0.05) {
      clampedCenterX = correctFisheyeDistortion(clampedCenterX);
    }
    // For very small values, keep them as-is to preserve resolution

    // Re-clamp after distortion correction (correction might push values slightly outside bounds)
    clampedCenterX = Math.max(CAMERA_MIN, Math.min(CAMERA_MAX, clampedCenterX));

    // Calculate the center of the camera range after distortion correction
    const CAMERA_CENTER = (CAMERA_MIN + CAMERA_MAX) / 2;

    // Map camera range [CAMERA_MIN, CAMERA_MAX] to normalized timeline range [0, 1]
    // For very small values (near 0), expand the mapping to preserve resolution
    // This prevents small movements from collapsing to the same timeline position
    const cameraRange = CAMERA_MAX - CAMERA_MIN;
    let normalizedPercent;

    if (clampedCenterX < 0.1) {
      // Expand small values: map 0-0.1 camera range to 0-0.2 normalized range (2x expansion)
      // This gives more resolution for small movements
      normalizedPercent = (clampedCenterX / 0.1) * 0.2;
    } else {
      // Normal mapping for larger values
      normalizedPercent = (clampedCenterX - CAMERA_MIN) / cameraRange;
    }

    // Clamp to ensure we stay within [0, 1] range
    const clampedPercent = Math.max(0, Math.min(1, normalizedPercent));

    // Convert normalized value (0-1) to pixel range for timeline
    // This will be further processed by timeline.js with curve and inversion
    // clampedPercent of 0.0 means start of timeline (0px), 1.0 means end (200px)
    normalizedCenterX = clampedPercent * vWidth;
  } else if (width > 0 && width > 1) {
    // Values are in pixels, normalize using width
    normalizedCenterX = (centerX / width) * vWidth;
  } else {
    // Assume centerX is already in pixel range (0-200) or use as-is
    normalizedCenterX = centerX;
  }

  // Clamp to valid range
  normalizedCenterX = Math.max(0, Math.min(vWidth, normalizedCenterX));

  // Add to smoothing history
  data.centerXHistory.push(normalizedCenterX);
  if (data.centerXHistory.length > SMOOTHING_WINDOW) {
    data.centerXHistory.shift();
  }

  // Calculate smoothed value (or use raw value if history is too short)
  let smoothedCenterX;
  if (data.centerXHistory.length > 0) {
    smoothedCenterX = data.centerXHistory.reduce((a, b) => a + b, 0) / data.centerXHistory.length;
  } else {
    smoothedCenterX = normalizedCenterX; // Use raw value if no history yet
  }

  // Always update if this is first detection, otherwise check if movement is significant enough
  const shouldUpdate = data.lastProcessedCenterX === null ||
    data.centerXHistory.length === 1 || // Always update on first frame with data
    Math.abs(smoothedCenterX - data.lastProcessedCenterX) > NOSE_MOVE_THRESHOLD;

  if (shouldUpdate) {
    data.centerX = smoothedCenterX;
    data.lastProcessedCenterX = smoothedCenterX;

    // Update global variables for ocean ripple system
    window.noseX = smoothedCenterX;
    window.noseY = 75; // Default Y position

    // Stop random date selection since person is now tracked
    const wasInRandomMode = stopRandomDateSelection();

    // Stop any random date pulsing ONLY when switching from random mode to user tracking
    if (wasInRandomMode) {
      if (typeof window !== 'undefined' && typeof window.stopPulsing === 'function') {
        window.stopPulsing(1);
      }
    }

    if (typeof updateVisibleData === 'function') {
      updateVisibleData(data.centerX, 1);
    }
  } else {
    data.centerX = data.lastProcessedCenterX;
    // Still update global variables even if movement is below threshold
    window.noseX = data.lastProcessedCenterX;
    window.noseY = 75;
    // Ensure random selection is stopped since person is tracked
    stopRandomDateSelection();

    // Don't stop pulsing here - let checkForTimelineChanges handle settle timer
  }
}

// Start random date selection when no person is tracked
function startRandomDateSelection() {
  // Don't start if already running or if a person is tracked
  if (randomDateInterval !== null) {
    return;
  }
  if (window.noseX !== null) {
    return; // Person is tracked, don't start random selection
  }


  // Immediately select a random date
  selectRandomDate();

  // Then set up interval to select new random dates every 10 seconds
  randomDateInterval = setInterval(() => {
    // Check if person is now tracked - if so, stop random selection
    if (window.noseX !== null) {
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
  // Only select if no person is tracked
  if (window.noseX !== null && personData.has(1)) {
    // If person data exists, a real person is tracked, don't override
    return;
  }

  // Generate random position between 0 and videoWidth (0-200)
  const currentVideoWidth = getVideoWidth();
  const randomNoseX = Math.random() * currentVideoWidth;

  // Update global variable for visualization
  window.noseX = randomNoseX;
  window.noseY = 75;

  // Update visualization with random position
  if (typeof updateVisibleData === 'function') {
    updateVisibleData(randomNoseX, 1);
  }

  // Trigger ripple creation immediately for random dates (don't wait for settle delay)
  // Reset lastTimelinePosition so checkForTimelineChanges will detect the change
  if (typeof window !== 'undefined') {
    window.lastTimelinePosition = null;
  }

  // Directly create ripple for random date (it's already "settled" since it's a random selection)
  // Wait a bit to ensure timeline is updated first, then create ripples
  setTimeout(() => {
    if (typeof window !== 'undefined') {
      // Stop any existing pulsing first (from previous random date)
      if (typeof window.stopPulsing === 'function') {
        window.stopPulsing(1);
      }

      // Reset lastTimelinePosition to trigger ripple creation
      window.lastTimelinePosition = null;

      // Create ripple immediately for random date
      if (typeof window.createRippleAtCurrentPosition === 'function') {
        window.createRippleAtCurrentPosition(1);
      }

      // Start pulsing for random dates (will create ripples periodically)
      if (typeof window.startPulsing === 'function') {
        window.startPulsing(1);
      }
    }
  }, 200); // Small delay to ensure timeline update completes
}

// Connect to WebSocket server
function connectWebSocket() {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost = window.location.hostname || 'localhost';
  const wsPort = 8080;
  const wsUrl = `${wsProtocol}//${wsHost}:${wsPort}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    // Update debug display
    const statusEl = document.getElementById('debug-status');
    const connectionEl = document.getElementById('debug-connection');
    if (statusEl) {
      statusEl.className = 'debug-status connected';
    }
    if (connectionEl) {
      connectionEl.textContent = 'Connected';
      connectionEl.style.color = '#00ff00';
    }
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);

      // Store last message for display
      lastOSCMessage = message;

      // Parse OSC address pattern: /person/{id}
      const match = message.address.match(/^\/person\/(\d+)$/);
      if (!match) {
        return;
      }

      const originalPersonId = parseInt(match[1], 10);
      const args = message.args;

      // Expected format: [center_x, y2, confidence, width, height]
      if (args.length >= 5) {
        const centerX = args[0];
        const y2 = args[1];
        const confidence = args[2];
        const width = args[3];
        const height = args[4];

        // Store raw data for this person
        allPeopleData.set(originalPersonId, {
          centerX,
          y2,
          confidence,
          width,
          height,
          lastUpdate: Date.now()
        });

        // Update active people selection (top person by confidence)
        updateActivePeople();
      }
    } catch (error) {
      // Silently handle errors
    }
  };

  ws.onerror = (error) => {
    // Silently handle errors
  };

  ws.onclose = (event) => {
    // Update debug display
    const statusEl = document.getElementById('debug-status');
    const connectionEl = document.getElementById('debug-connection');
    if (statusEl) {
      statusEl.className = 'debug-status disconnected';
    }
    if (connectionEl) {
      connectionEl.textContent = 'Disconnected';
      connectionEl.style.color = '#ff0000';
    }
    // Reconnect after 3 seconds
    setTimeout(connectWebSocket, 3000);
  };
}

// Periodic cleanup of stale people (in case messages stop coming)
if (typeof window !== 'undefined') {
  setInterval(() => {
    updateActivePeople(); // This will remove stale people
  }, 1000); // Check every second
}

// Initialize WebSocket connection when page loads
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      connectWebSocket();
      // Start random date selection if no person is initially tracked
      // Wait a bit for timeline to initialize first
      setTimeout(() => {
        if (window.noseX === null) {
          startRandomDateSelection();
        }
      }, 2000); // Wait 2 seconds for initial setup
    });
  } else {
    connectWebSocket();
    // Start random date selection if no person is initially tracked
    setTimeout(() => {
      if (window.noseX === null) {
        startRandomDateSelection();
      }
    }, 2000); // Wait 2 seconds for initial setup
  }
}

// function draw() {
//   background(255);
//   image(video, 0, 0, videoWidth, videoHeight);


//   if (noseX !== null && noseY !== null) {
//     fill(255, 0, 0);
//     noStroke();
//     ellipse(noseX, noseY, 5, 5);
//   }
// }
