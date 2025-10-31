// WebSocket connection for OSC data
let ws = null;

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
const NOSE_MOVE_THRESHOLD = 1; // Lower threshold for more responsive updates
const MAX_MISSING_FRAMES = 5;
const MIN_CONFIDENCE = 0.5; // Minimum confidence threshold

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
  console.log(`[updateActivePeople] Processing ${allPeopleData.size} total people, MIN_CONFIDENCE=${MIN_CONFIDENCE}`);

  const sortedPeople = Array.from(allPeopleData.entries())
    .filter(([id, data]) => {
      // Handle both 0-100 scale and 0-1 scale confidence
      const conf = data.confidence;
      // Accept if confidence is >= 0.5 (normalized) OR >= 50 (0-100 scale)
      const passes = conf >= MIN_CONFIDENCE || (conf >= 50 && conf <= 100);
      if (!passes) {
        console.log(`[updateActivePeople] Person ${id} filtered out: confidence=${conf} (threshold: ${MIN_CONFIDENCE} or 50-100 scale)`);
      }
      return passes;
    })
    .map(([id, data]) => {
      // Calculate area (proxy for distance - larger area = closer to camera)
      const area = data.width * data.height;
      return { id, data, area };
    })
    .sort((a, b) => b.area - a.area); // Sort by area descending (largest = closest)

  console.log(`[updateActivePeople] Found ${sortedPeople.length} valid people out of ${allPeopleData.size} total`);

  // Select closest person (largest area = closest to camera)
  let newPerson1Id = sortedPeople.length > 0 ? sortedPeople[0].id : null;

  // Log if multiple people detected but only tracking closest one
  if (sortedPeople.length > 1) {
    console.log(`[updateActivePeople] ${sortedPeople.length} people detected - tracking closest person (OSC ID ${newPerson1Id}, area=${sortedPeople[0].area.toFixed(0)})`);
  }

  console.log(`[updateActivePeople] Active person: OSC ID ${newPerson1Id}`);

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
    console.log(`[updateActivePeople] Processing person (OSC ID ${activePerson1Id}) with centerX=${centerX}, confidence=${confidence}`);

    processPersonData(1, centerX, confidence, width, height);
  } else {
    // Only clear display if not in random date mode (random date mode handles its own visualization)
    if (randomDateInterval === null) {
      console.log(`[updateActivePeople] No person detected, clearing display`);
      clearDisplayPerson(1);
    } else {
      console.log(`[updateActivePeople] No person detected, but random date mode is active - keeping display`);
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
  if (typeof stopPulsing === 'function') {
    stopPulsing(1);
  }

  // Start random date selection when no person is tracked (if not already active)
  if (randomDateInterval === null) {
    startRandomDateSelection();
  }
}

// Process OSC data for the person
function processPersonData(displayPersonId, centerX, confidence, width, height) {
  console.log(`[processPersonData] centerX=${centerX}, confidence=${confidence}, width=${width}, height=${height}`);
  const data = initPersonData(displayPersonId);

  // Handle confidence - might be 0-1 scale or 0-100 scale
  // Convert to normalized (0-1) for comparison
  const normalizedConfidence = confidence > 1 ? confidence / 100 : confidence;
  console.log(`[processPersonData] Person ${displayPersonId}: normalizedConfidence=${normalizedConfidence}, MIN_CONFIDENCE=${MIN_CONFIDENCE}`);

  // Only process if confidence is above threshold
  if (normalizedConfidence < MIN_CONFIDENCE) {
    console.log(`[processPersonData] Person ${displayPersonId} REJECTED: confidence too low (${normalizedConfidence} < ${MIN_CONFIDENCE})`);
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
  console.log(`[processPersonData] Person ${displayPersonId} ACCEPTED: processing data`);

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
    // Values are normalized (0-1), convert to pixel range
    // centerX of 0.50 means 50% across the frame = 100px in a 200px wide video
    normalizedCenterX = centerX * vWidth;
  } else if (width > 0 && width > 1) {
    // Values are in pixels, normalize using width
    normalizedCenterX = (centerX / width) * vWidth;
  } else {
    // Assume centerX is already in pixel range (0-200) or use as-is
    normalizedCenterX = centerX;
  }

  // Clamp to valid range
  normalizedCenterX = Math.max(0, Math.min(vWidth, normalizedCenterX));

  console.log(`[Person ${displayPersonId}] Conversion: centerX=${centerX} (normalized=${centerX <= 1 && width < 1}) -> normalizedCenterX=${normalizedCenterX.toFixed(2)}`);

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
  // Lower threshold to be more responsive to movement
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
    stopRandomDateSelection();

    // Stop any random date pulsing
    if (typeof window !== 'undefined' && typeof window.stopPulsing === 'function') {
      window.stopPulsing(1);
    }

    console.log(`[Person] Updating visualization with centerX: ${data.centerX.toFixed(2)} (history size: ${data.centerXHistory.length})`);
    if (typeof updateVisibleData === 'function') {
      updateVisibleData(data.centerX, 1);
    } else {
      console.error('updateVisibleData function not available!');
    }
  } else {
    data.centerX = data.lastProcessedCenterX;
    // Still update global variables even if movement is below threshold
    window.noseX = data.lastProcessedCenterX;
    window.noseY = 75;
    // Ensure random selection is stopped since person is tracked
    stopRandomDateSelection();

    // Stop any random date pulsing
    if (typeof window !== 'undefined' && typeof window.stopPulsing === 'function') {
      window.stopPulsing(1);
    }
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

  console.log('[RandomDate] Starting random date selection (every 10s)');

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
  if (randomDateInterval !== null) {
    clearInterval(randomDateInterval);
    randomDateInterval = null;
    console.log('[RandomDate] Stopped random date selection (person tracked)');
  }
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

  console.log(`[RandomDate] Selected random date at position: ${randomNoseX.toFixed(2)}`);

  // Update visualization with random position
  if (typeof updateVisibleData === 'function') {
    updateVisibleData(randomNoseX, 1);
  } else {
    console.error('[RandomDate] updateVisibleData function not available!');
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

  console.log('Connecting to WebSocket:', wsUrl);
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('✅ WebSocket connected successfully');
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
      console.log(`[WebSocket] Received message:`, message);

      // Parse OSC address pattern: /person/{id}
      const match = message.address.match(/^\/person\/(\d+)$/);
      if (!match) {
        console.log(`[WebSocket] Unknown address pattern: ${message.address}, ignoring`);
        return;
      }

      const originalPersonId = parseInt(match[1], 10);
      const args = message.args;

      console.log(`[WebSocket] Processing Person ${originalPersonId} with args:`, args);

      // Expected format: [center_x, y2, confidence, width, height]
      if (args.length >= 5) {
        const centerX = args[0];
        const y2 = args[1];
        const confidence = args[2];
        const width = args[3];
        const height = args[4];

        console.log(`[WebSocket] Person ${originalPersonId}: centerX=${centerX}, confidence=${confidence}, width=${width}, height=${height}`);

        // Store raw data for this person
        allPeopleData.set(originalPersonId, {
          centerX,
          y2,
          confidence,
          width,
          height,
          lastUpdate: Date.now()
        });

        console.log(`[WebSocket] Stored data for Person ${originalPersonId}, total people tracked: ${allPeopleData.size}`);

        // Update active people selection (top person by confidence)
        updateActivePeople();
      } else {
        console.warn(`[WebSocket] Invalid argument count for /person/${originalPersonId}: expected 5, got ${args.length}`);
      }
    } catch (error) {
      console.error('[WebSocket] Error processing message:', error, event.data);
    }
  };

  ws.onerror = (error) => {
    console.error('❌ WebSocket error:', error);
  };

  ws.onclose = (event) => {
    console.log(`🔌 WebSocket disconnected (code: ${event.code}, reason: ${event.reason}), attempting to reconnect...`);
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
  console.log('[poseDetection] Initializing WebSocket connection...');
  if (document.readyState === 'loading') {
    console.log('[poseDetection] Waiting for DOM to load...');
    document.addEventListener('DOMContentLoaded', () => {
      console.log('[poseDetection] DOM loaded, connecting WebSocket...');
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
    console.log('[poseDetection] DOM already loaded, connecting WebSocket immediately...');
    connectWebSocket();
    // Start random date selection if no person is initially tracked
    setTimeout(() => {
      if (window.noseX === null) {
        startRandomDateSelection();
      }
    }, 2000); // Wait 2 seconds for initial setup
  }
} else {
  console.error('[poseDetection] window is undefined!');
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
