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
        const isActive2 = originalId === activePerson2Id;
        const activeLabel = isActive1 ? ' (Person 1)' : isActive2 ? ' (Person 2)' : '';
        const activeColor = (isActive1 || isActive2) ? '#00ff00' : 'rgba(255,255,255,0.5)';

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

  // Show active display people (1 and 2)
  if (personData.size > 0) {
    const activeDiv = document.createElement('div');
    activeDiv.style.marginTop = '10px';
    activeDiv.style.borderTop = '1px solid rgba(255,255,255,0.1)';
    activeDiv.style.paddingTop = '8px';
    activeDiv.innerHTML = `<div style="color: rgba(100,200,255,1); font-size: 11px; margin-bottom: 5px;">Active Display People:</div>`;
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

// Map top 2 people to display person IDs (1 and 2)
let activePerson1Id = null; // Original OSC ID mapped to display person 1
let activePerson2Id = null; // Original OSC ID mapped to display person 2

// Processed data for the active display people (person 1 and 2)
const personData = new Map(); // key: 1 or 2 (display person ID), value: tracking data

// Global variables for ocean ripple system (compatibility with oceanGenerative.js)
window.noseX = null;  // Person 1 position
window.noseX2 = null; // Person 2 position
window.noseY = null;  // Person 1 Y (not used but needed for compatibility)
window.noseY2 = null; // Person 2 Y (not used but needed for compatibility)

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

// Update which people are active (top 2 by confidence) and process them
function updateActivePeople() {
  const now = Date.now();
  const STALE_TIMEOUT = 2000; // Remove people not seen for 2 seconds

  // Remove stale people (haven't been seen recently)
  for (const [id, data] of allPeopleData.entries()) {
    if (now - data.lastUpdate > STALE_TIMEOUT) {
      allPeopleData.delete(id);
      // If this was an active person, clear them
      if (id === activePerson1Id) {
        activePerson1Id = null;
        clearDisplayPerson(1);
      }
      if (id === activePerson2Id) {
        activePerson2Id = null;
        clearDisplayPerson(2);
      }
    }
  }

  // Sort all people by confidence (highest first)
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
      } else {
        console.log(`[updateActivePeople] Person ${id} passed filter: confidence=${conf}`);
      }
      return passes;
    })
    .sort((a, b) => b[1].confidence - a[1].confidence);

  console.log(`[updateActivePeople] Found ${sortedPeople.length} valid people out of ${allPeopleData.size} total`);

  // Select top 2 people
  const topTwo = sortedPeople.slice(0, 2);

  // Determine new active person assignments
  let newPerson1Id = topTwo.length > 0 ? topTwo[0][0] : null;
  let newPerson2Id = topTwo.length > 1 ? topTwo[1][0] : null;

  console.log(`[updateActivePeople] Top 2: Person 1 = OSC ID ${newPerson1Id}, Person 2 = OSC ID ${newPerson2Id}`);

  // If person 1 changed, clear old person 1
  if (activePerson1Id !== null && activePerson1Id !== newPerson1Id) {
    if (activePerson1Id !== newPerson2Id) {
      // Old person 1 is not becoming person 2, so clear them
      clearDisplayPerson(1);
    }
  }

  // If person 2 changed, clear old person 2
  if (activePerson2Id !== null && activePerson2Id !== newPerson2Id) {
    if (activePerson2Id !== newPerson1Id) {
      // Old person 2 is not becoming person 1, so clear them
      clearDisplayPerson(2);
    }
  }

  // Update active person assignments
  activePerson1Id = newPerson1Id;
  activePerson2Id = newPerson2Id;

  // Process the active people
  if (activePerson1Id !== null) {
    const data = allPeopleData.get(activePerson1Id);
    console.log(`[updateActivePeople] Processing Person 1 (OSC ID ${activePerson1Id}) with centerX=${data.centerX}, confidence=${data.confidence}`);
    processPersonData(1, data.centerX, data.confidence, data.width, data.height);
  } else {
    console.log(`[updateActivePeople] No Person 1, clearing display`);
    clearDisplayPerson(1);
  }

  if (activePerson2Id !== null) {
    const data = allPeopleData.get(activePerson2Id);
    console.log(`[updateActivePeople] Processing Person 2 (OSC ID ${activePerson2Id}) with centerX=${data.centerX}, confidence=${data.confidence}`);
    processPersonData(2, data.centerX, data.confidence, data.width, data.height);
  } else {
    console.log(`[updateActivePeople] No Person 2, clearing display`);
    clearDisplayPerson(2);
  }
}

// Clear display for a person (when they're no longer active)
function clearDisplayPerson(displayPersonId) {
  // Clear timeline bars
  if (displayPersonId === 1) {
    if (typeof g !== 'undefined' && g) {
      g.selectAll(".person-1").remove();
    }
    window.noseX = null;
    window.noseY = null;
    // Clear person data
    personData.delete(1);
  } else if (displayPersonId === 2) {
    if (typeof g !== 'undefined' && g) {
      g.selectAll(".person-2").remove();
    }
    window.noseX2 = null;
    window.noseY2 = null;
    // Clear person data
    personData.delete(2);
  }
}

// Process OSC data for a display person (1 or 2)
function processPersonData(displayPersonId, centerX, confidence, width, height) {
  console.log(`[processPersonData] Person ${displayPersonId}: centerX=${centerX}, confidence=${confidence}, width=${width}, height=${height}`);
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
        updateVisibleData(data.lastProcessedCenterX, displayPersonId);
        // Keep global variables set for ocean ripple system
        if (displayPersonId === 1) {
          window.noseX = data.lastProcessedCenterX;
          window.noseY = 75;
        } else if (displayPersonId === 2) {
          window.noseX2 = data.lastProcessedCenterX;
          window.noseY2 = 75;
        }
      }
    } else {
      data.centerX = null;
      // Clear global variables when person is lost
      if (displayPersonId === 1) {
        window.noseX = null;
        window.noseY = null;
      } else if (displayPersonId === 2) {
        window.noseX2 = null;
        window.noseY2 = null;
      }
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
    if (displayPersonId === 1) {
      window.noseX = smoothedCenterX;
      window.noseY = 75; // Default Y position (middle of videoHeight/2)
    } else if (displayPersonId === 2) {
      window.noseX2 = smoothedCenterX;
      window.noseY2 = 75; // Default Y position
    }

    console.log(`[Person ${displayPersonId}] Updating visualization with centerX: ${data.centerX.toFixed(2)} (history size: ${data.centerXHistory.length})`);
    if (typeof updateVisibleData === 'function') {
      updateVisibleData(data.centerX, displayPersonId);
    } else {
      console.error('updateVisibleData function not available!');
    }
  } else {
    data.centerX = data.lastProcessedCenterX;
    // Still update global variables even if movement is below threshold
    if (displayPersonId === 1) {
      window.noseX = data.lastProcessedCenterX;
      window.noseY = 75;
    } else if (displayPersonId === 2) {
      window.noseX2 = data.lastProcessedCenterX;
      window.noseY2 = 75;
    }
  }
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

        // Update active people selection (top 2 by confidence)
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
    });
  } else {
    console.log('[poseDetection] DOM already loaded, connecting WebSocket immediately...');
    connectWebSocket();
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
