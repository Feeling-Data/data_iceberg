// Ocean-inspired generative piece with static-y pixelated gradients
window.pixelSize = 12; // Larger pixels for better performance - globally accessible
let time = 0;
let waveOffset = 0;
let oceanCanvas;
let ctx;
let gridCtx1 = null, gridCtx2 = null, gridCtx3 = null;

// EXPERIMENTAL: Ocean morphing controls - adjust these to see different effects!
window.morphSpeed = 3; // How fast patterns shift (try 0.5 to 3.0)
window.morphScale = 0.008; // Size of morphing patterns (try 0.005 to 0.02)
window.bandIntensity = 4; // Strength of color bands - SUBTLE (try 5 to 15)
window.bandSpeed = 1.5; // Speed of band movement (try 0.2 to 1.0)
window.staticShiftAmount = 0.25; // How much static varies - SUBTLE (try 0.05 to 0.15)

// RIPPLE CONTROLS - Customize how ripples appear and behave
window.rippleRingCount = 10; // Number of concentric rings (try 5 to 20)
window.rippleRingSpacing = 55; // Distance between rings in pixels (try 40 to 150)
window.rippleRingThickness = 20; // How thick each ring band is (try 20 to 80)
window.rippleWaveIntensity = 25; // How much ripples distort pixels (try 15 to 60)
window.rippleWaveFrequency = 0.25; // How wavy the rings are (try 0.05 to 0.3)
window.rippleExpansionSpeed = 8; // How fast ripples expand (try 3 to 15)
window.rippleStrengthFalloff = 0.08; // How quickly rings fade with distance (try 0.03 to 0.15)

// Ripple effect variables - separate tracking for each person
let ripples = [];
let lastNoseX = null;
let lastNoseY = null;
let lastNoseX2 = null;
let lastNoseY2 = null;
let lastTimelinePosition1 = null;
let lastTimelinePosition2 = null;

// Pulsing ripple when settled - separate for each person
let settledTimeout1 = null;
let settledTimeout2 = null;
let pulseInterval1 = null;
let pulseInterval2 = null;
let isSettled1 = false;
let isSettled2 = false;
let lastRippleX1 = null;
let lastRippleY1 = null;
let lastRippleX2 = null;
let lastRippleY2 = null;
let currentPulseInterval1 = 3000; // Dynamic pulse interval based on ripple size
let currentPulseInterval2 = 3000; // Dynamic pulse interval based on ripple size
const SETTLE_DELAY = 400; // Wait 400ms before considering "settled"

// Performance optimization
let lastFrameTime = 0;
const targetFPS = 30; // smoother animation
const frameInterval = 1000 / targetFPS;

class Ripple {
  constructor(x, y, delay = 0, dataCount = 1, personId = 1) {
    this.x = x;
    this.y = y;
    this.radius = 0;
    this.personId = personId;

    // Scale maxRadius based on data count relative to min/max in dataset
    const minDataCount = window.minDataCount || 1;
    const maxDataCount = window.maxDataCount || 1;

    // Base radius should depend on canvas HEIGHT (so it doesn't explode with 5760 width)
    const baseCanvasHeight = (typeof oceanCanvas !== 'undefined' && oceanCanvas && oceanCanvas.height) ? oceanCanvas.height : 1080;
    const baseMaxRadius = baseCanvasHeight * 0.45; // tuned for 1080 height
    const minScale = .5; // Minimum 50% of base
    const maxScale = 5;  // Up to 500% of base for very large months

    // Normalize data count safely
    let normalizedCount;
    const range = maxDataCount - minDataCount;
    if (range > 0) {
      normalizedCount = (dataCount - minDataCount) / range;
    } else {
      normalizedCount = maxDataCount > 1 ? (dataCount / maxDataCount) : 0; // fallback
    }
    normalizedCount = Math.max(0, Math.min(1, normalizedCount));

    // Preserve stronger differences at the top end
    normalizedCount = Math.pow(normalizedCount, 2.0);

    const radiusScale = minScale + (normalizedCount * (maxScale - minScale));
    this.maxRadius = baseMaxRadius * radiusScale;

    this.speed = window.rippleExpansionSpeed; // Expansion speed (controllable)
    this.strength = 1;
    this.life = 1.0; // Life starts at 1.0

    // Calculate how many frames it will take to reach maxRadius
    const framesToReachMax = this.maxRadius / this.speed;

    // Scale fadeSpeed so ripple lives long enough to reach its maxRadius
    const lifeBuffer = 1.3 + (1 - normalizedCount) * 0.5; // More buffer for low data
    this.fadeSpeed = this.life / (framesToReachMax * lifeBuffer);

    this.dissipationRate = 0.001; // How much strength decreases over time

    // this.delay, this.active, this.age
    this.delay = delay;
    this.active = false;
    this.age = 0;
  }

  update() {
    this.age++;

    // Handle delay before ripple becomes active
    if (this.age < this.delay) {
      return; // Don't update until delay is over
    }

    if (!this.active) {
      this.active = true;
    }

    this.radius += this.speed;

    // Decrease life over time
    this.life -= this.fadeSpeed;

    // Decrease strength over time for natural dissipation
    this.strength *= (1 - this.dissipationRate);

    // Combine radius-based and time-based strength reduction
    const radiusStrength = 1 - (this.radius / this.maxRadius);
    this.totalStrength = this.strength * radiusStrength * this.life;
  }

  isActive() {
    return this.radius < this.maxRadius && this.life > 0 && this.strength > 0.01;
  }

  getEffect(px, py) {
    // Create expanding circular rings that span the canvas
    const dist = Math.sqrt((px - this.x) ** 2 + (py - this.y) ** 2);

    if (this.totalStrength > 0) {
      // Use controllable ring count
      for (let ringIndex = 0; ringIndex < window.rippleRingCount; ringIndex++) {
        // Use controllable ring spacing
        const ringRadius = this.radius - (ringIndex * window.rippleRingSpacing);
        const distFromRing = Math.abs(dist - ringRadius);

        // Use controllable ring thickness
        if (distFromRing < window.rippleRingThickness && ringRadius > 0 && ringRadius < this.radius + 200) {
          // Ring strength decreases with distance from center (controllable falloff)
          const ringStrength = this.totalStrength * (1 - ringIndex * window.rippleStrengthFalloff) * (1 - dist / (this.maxRadius * 0.95));
          const localStrength = (1 - distFromRing / window.rippleRingThickness) * ringStrength;

          // Create ring wave pattern with controllable frequency
          const waveFreq = window.rippleWaveFrequency + (ringIndex * 0.05);
          const ringWave = Math.sin(distFromRing * waveFreq + ringIndex * 0.6) * localStrength;
          // Apply controllable wave intensity
          return ringWave * window.rippleWaveIntensity;
        }
      }
    }
    return 0;
  }
}

// Use vanilla JavaScript and HTML5 Canvas instead of p5.js
function initOceanGenerative() {
  // Initializing ocean generative...

  const container = document.getElementById('generative-container');
  if (!container) {
    console.error("Container not found!");
    return;
  }

  // Cache grid canvases (if present)
  const g1 = document.getElementById('grid-canvas-1');
  const g2 = document.getElementById('grid-canvas-2');
  const g3 = document.getElementById('grid-canvas-3');
  gridCtx1 = g1 ? g1.getContext('2d', { alpha: true }) : null;
  gridCtx2 = g2 ? g2.getContext('2d', { alpha: true }) : null;
  gridCtx3 = g3 ? g3.getContext('2d', { alpha: true }) : null;
  if (gridCtx1) gridCtx1.imageSmoothingEnabled = false;
  if (gridCtx2) gridCtx2.imageSmoothingEnabled = false;
  if (gridCtx3) gridCtx3.imageSmoothingEnabled = false;

  // Create a FIXED virtual render buffer (5760x1080)
  oceanCanvas = document.createElement('canvas');
  oceanCanvas.width = 5760;
  oceanCanvas.height = 1080;
  oceanCanvas.id = 'ocean-canvas';
  oceanCanvas.style.display = 'block';
  oceanCanvas.style.position = 'absolute';
  oceanCanvas.style.top = '0';
  oceanCanvas.style.left = '0';
  oceanCanvas.style.zIndex = '1';
  oceanCanvas.style.imageRendering = 'pixelated'; // Maintain crisp pixels
  oceanCanvas.style.width = '5760px'; // Prevent CSS stretching
  oceanCanvas.style.height = '1080px';

  // Add to container
  container.appendChild(oceanCanvas);

  // Get context
  ctx = oceanCanvas.getContext('2d', { alpha: true });
  ctx.imageSmoothingEnabled = false;

  // Canvas created with FIXED resolution

  // Add scroll listener to ensure wave updates on scroll
  window.addEventListener('scroll', () => {
    // Force immediate update by triggering a small change
    // The animate loop will pick up the new position
  });

  // Start animation
  animate();
}

function createRippleAtCurrentPosition(personId = 1) {
  // Create ripple at the x-axis position for specific person
  const xAxisY = getXAxisPosition();
  const currentTimelinePosition = personId === 1 ? noseX : noseX2;

  if (currentTimelinePosition === null) return; // No position data for this person

  // Map nose position to VIRTUAL CANVAS coordinates along the full 5760px width
  // Use the same curve calculation as timeline.js to ensure ripples match bar positions
  const rawPercent = Math.min(Math.max(currentTimelinePosition / videoWidth, 0), 1);

  // Apply same power curve as timeline (if DATE_SENSITIVITY_CURVE is available)
  // Default to 0.5 if not defined (matches timeline default)
  const sensitivityCurve = (typeof window !== 'undefined' && window.DATE_SENSITIVITY_CURVE !== undefined)
    ? window.DATE_SENSITIVITY_CURVE : 0.5;
  const curvedPercent = Math.pow(rawPercent, sensitivityCurve);

  // Invert to match timeline logic (left = end, right = start)
  const invertedPercent = 1 - curvedPercent;
  const rippleX = invertedPercent * oceanCanvas.width; // 0..5760 space
  const rippleY = xAxisY; // At the x-axis level

  // Position ripple at the top of the wave (fixed Y position)
  const waveTopY = xAxisY + 50; // Fixed distance above x-axis

  // Store position for pulsing based on person
  if (personId === 1) {
    lastRippleX1 = rippleX;
    lastRippleY1 = waveTopY;
  } else {
    lastRippleX2 = rippleX;
    lastRippleY2 = waveTopY;
  }

  // Clear old ripples to prevent buildup (keep some from each person)
  if (ripples.length > 8) {
    ripples = ripples.slice(-4);
  }

  // Get data count from timeline if available
  const dataCount = personId === 1 ?
    (typeof window.currentDataCount1 !== 'undefined' ? window.currentDataCount1 : 1) :
    (typeof window.currentDataCount2 !== 'undefined' ? window.currentDataCount2 : 1);

  // Create single ripple at the top of the wave with data count and person ID
  ripples.push(new Ripple(rippleX, waveTopY, 0, dataCount, personId));

  // console.log(`Timeline ripple created for Person ${personId} at:`, rippleX, waveTopY, "with dataCount:", dataCount);
}

function calculatePulseInterval(dataCount) {
  // Calculate ripple lifetime based on same logic as Ripple constructor
  const minDataCount = window.minDataCount || 1;
  const maxDataCount = window.maxDataCount || 1;

  const baseCanvasHeight = (typeof oceanCanvas !== 'undefined' && oceanCanvas && oceanCanvas.height) ? oceanCanvas.height : 1080;
  const baseMaxRadius = baseCanvasHeight * 0.45;
  const minScale = .5;
  const maxScale = 5;

  // Normalize and apply exponential curve (same as Ripple constructor)
  let normalizedCount;
  const range = maxDataCount - minDataCount;
  if (range > 0) {
    normalizedCount = (dataCount - minDataCount) / range;
  } else {
    normalizedCount = maxDataCount > 1 ? (dataCount / maxDataCount) : 0;
  }
  normalizedCount = Math.max(0, Math.min(1, Math.pow(normalizedCount, 2.0)));

  const radiusScale = minScale + (normalizedCount * (maxScale - minScale));
  const maxRadius = baseMaxRadius * radiusScale;

  // Calculate lifetime
  const speed = window.rippleExpansionSpeed;
  const framesToReachMax = maxRadius / speed;
  const lifeBuffer = 1.3 + (1 - normalizedCount) * 0.5;

  // Total frames in ripple lifetime
  const totalFrames = framesToReachMax * lifeBuffer;

  // Convert to milliseconds at 20fps (maintaining old assumption)
  const fps = 20;
  const rippleLifetimeMs = (totalFrames / fps) * 1000;

  // Add 20% buffer so new ripple starts slightly after previous one fades
  const pulseInterval = rippleLifetimeMs * 1.2;

  return pulseInterval;
}

function startPulsing(personId = 1) {
  const pulseInterval = personId === 1 ? pulseInterval1 : pulseInterval2;
  if (pulseInterval) return; // Already pulsing for this person

  if (personId === 1) {
    isSettled1 = true;
  } else {
    isSettled2 = true;
  }

  // Calculate dynamic pulse interval based on current data count
  const dataCount = personId === 1 ?
    (typeof window.currentDataCount1 !== 'undefined' ? window.currentDataCount1 : 1) :
    (typeof window.currentDataCount2 !== 'undefined' ? window.currentDataCount2 : 1);

  const currentPulseInterval = calculatePulseInterval(dataCount);

  if (personId === 1) {
    currentPulseInterval1 = currentPulseInterval;
  } else {
    currentPulseInterval2 = currentPulseInterval;
  }

  // console.log(`Person ${personId} settled - starting ripple pulse every ${currentPulseInterval.toFixed(0)}ms`);

  // Create ripple on dynamic interval
  const interval = setInterval(() => {
    const lastRippleX = personId === 1 ? lastRippleX1 : lastRippleX2;
    const lastRippleY = personId === 1 ? lastRippleY1 : lastRippleY2;

    if (lastRippleX !== null && lastRippleY !== null) {
      const dataCount = personId === 1 ?
        (typeof window.currentDataCount1 !== 'undefined' ? window.currentDataCount1 : 1) :
        (typeof window.currentDataCount2 !== 'undefined' ? window.currentDataCount2 : 1);
      ripples.push(new Ripple(lastRippleX, lastRippleY, 0, dataCount, personId));
      // console.log(`Pulse ripple created for Person ${personId}`);
    }
  }, currentPulseInterval);

  if (personId === 1) {
    pulseInterval1 = interval;
  } else {
    pulseInterval2 = interval;
  }
}

function stopPulsing(personId = 1) {
  if (personId === 1) {
    if (pulseInterval1) {
      clearInterval(pulseInterval1);
      pulseInterval1 = null;
      isSettled1 = false;
      // console.log("Person 1 moved - stopping ripple pulse");
    }
    if (settledTimeout1) {
      clearTimeout(settledTimeout1);
      settledTimeout1 = null;
    }
  } else {
    if (pulseInterval2) {
      clearInterval(pulseInterval2);
      pulseInterval2 = null;
      isSettled2 = false;
      // console.log("Person 2 moved - stopping ripple pulse");
    }
    if (settledTimeout2) {
      clearTimeout(settledTimeout2);
      settledTimeout2 = null;
    }
  }
}

function checkForTimelineChanges() {
  // Check Person 1 timeline position changes
  if (typeof noseX !== 'undefined' && noseX !== null) {
    const currentTimelinePosition1 = noseX;

    // More sensitive detection for better synchronization
    if (lastTimelinePosition1 === null ||
      Math.abs(currentTimelinePosition1 - lastTimelinePosition1) > 1) {

      // Person 1 moved - stop pulsing and reset settle timer
      stopPulsing(1);

      // Create immediate ripple
      createRippleAtCurrentPosition(1);

      lastTimelinePosition1 = currentTimelinePosition1;

      // Start settle timer
      settledTimeout1 = setTimeout(() => {
        startPulsing(1);
      }, SETTLE_DELAY);
    }
  }

  // Check Person 2 timeline position changes
  if (typeof noseX2 !== 'undefined' && noseX2 !== null) {
    const currentTimelinePosition2 = noseX2;

    // More sensitive detection for better synchronization
    if (lastTimelinePosition2 === null ||
      Math.abs(currentTimelinePosition2 - lastTimelinePosition2) > 1) {

      // Person 2 moved - stop pulsing and reset settle timer
      stopPulsing(2);

      // Create immediate ripple
      createRippleAtCurrentPosition(2);

      lastTimelinePosition2 = currentTimelinePosition2;

      // Start settle timer
      settledTimeout2 = setTimeout(() => {
        startPulsing(2);
      }, SETTLE_DELAY);
    }
  }
}

function checkForNoseMovement() {
  // Check Person 1 nose movement
  if (typeof noseX !== 'undefined' && noseX !== null && noseY !== null) {
    // If nose position changed significantly, create a new ripple
    if (lastNoseX === null ||
      Math.abs(noseX - lastNoseX) > 5 ||
      Math.abs(noseY - lastNoseY) > 5) {

      // Clear old ripples if position changed dramatically
      const distance = lastNoseX !== null ?
        Math.sqrt((noseX - lastNoseX) ** 2 + (noseY - lastNoseY) ** 2) : 0;

      if (distance > 20) {
        // Clear most existing ripples for dramatic position changes
        ripples = ripples.filter(ripple => ripple.strength > 0.5);
        // console.log("Cleared weak ripples due to large position change");
      }

      // Map nose position from video coordinates to canvas coordinates
      const rippleX = (noseX / videoWidth) * oceanCanvas.width;
      const rippleY = (noseY / videoHeight) * oceanCanvas.height;

      ripples.push(new Ripple(rippleX, rippleY, 0, 1, 1)); // Person 1
      lastNoseX = noseX;
      lastNoseY = noseY;

      // console.log("Person 1 nose ripple created at:", rippleX, rippleY);
    }
  }

  // Check Person 2 nose movement
  if (typeof noseX2 !== 'undefined' && noseX2 !== null && noseY2 !== null) {
    // If nose position changed significantly, create a new ripple
    if (lastNoseX2 === null ||
      Math.abs(noseX2 - lastNoseX2) > 5 ||
      Math.abs(noseY2 - lastNoseY2) > 5) {

      // Clear old ripples if position changed dramatically
      const distance = lastNoseX2 !== null ?
        Math.sqrt((noseX2 - lastNoseX2) ** 2 + (noseY2 - lastNoseY2) ** 2) : 0;

      if (distance > 20) {
        // Clear most existing ripples for dramatic position changes
        ripples = ripples.filter(ripple => ripple.strength > 0.5);
        // console.log("Cleared weak ripples due to large position change");
      }

      // Map nose position from video coordinates to canvas coordinates
      const rippleX = (noseX2 / videoWidth) * oceanCanvas.width;
      const rippleY = (noseY2 / videoHeight) * oceanCanvas.height;

      ripples.push(new Ripple(rippleX, rippleY, 0, 1, 2)); // Person 2
      lastNoseX2 = noseX2;
      lastNoseY2 = noseY2;

      // console.log("Person 2 nose ripple created at:", rippleX, rippleY);
    }
  }

  // If no nose detected for either person, gradually clear all ripples
  if ((typeof noseX === 'undefined' || noseX === null) &&
    (typeof noseX2 === 'undefined' || noseX2 === null)) {
    if (ripples.length > 0) {
      ripples.forEach(ripple => {
        ripple.life -= 0.05; // Faster fade when no nose detected
      });
    }
  }
}

function animate(currentTime) {
  // Frame rate limiting for better performance
  if (currentTime - lastFrameTime < frameInterval) {
    requestAnimationFrame(animate);
    return;
  }
  lastFrameTime = currentTime;

  // Clear canvas with ocean background
  ctx.fillStyle = 'rgb(5, 15, 35)'; // Deep blue ocean background
  ctx.fillRect(0, 0, oceanCanvas.width, oceanCanvas.height);

  // Check for timeline changes and create ripples
  checkForTimelineChanges();

  // Disable nose movement ripples to avoid double ripples
  // checkForNoseMovement();

  // Update ripples
  ripples = ripples.filter(ripple => {
    ripple.update();
    return ripple.isActive();
  });

  // Draw smooth sky area above the wave
  drawSkyArea();

  // Draw gradient background under the wave to hide sky gradient
  drawOceanBackground();

  // Draw pixelated noise texture (only below wave)
  drawPixelatedNoise();

  // If grid mode, mirror thirds into the three grid canvases
  if (document.body.classList.contains('grid-mode') && gridCtx1 && gridCtx2 && gridCtx3) {
    const sw = 1920; // each third
    const sh = oceanCanvas.height;
    // Left third -> canvas 1
    gridCtx1.clearRect(0, 0, 1920, 1080);
    gridCtx1.drawImage(oceanCanvas, 0, 0, sw, sh, 0, 0, 1920, 1080);
    // Middle third -> canvas 2
    gridCtx2.clearRect(0, 0, 1920, 1080);
    gridCtx2.drawImage(oceanCanvas, sw, 0, sw, sh, 0, 0, 1920, 1080);
    // Right third -> canvas 3
    gridCtx3.clearRect(0, 0, 1920, 1080);
    gridCtx3.drawImage(oceanCanvas, sw * 2, 0, sw, sh, 0, 0, 1920, 1080);
  }

  time += 0.01;
  waveOffset += 0.02;
  requestAnimationFrame(animate);
}

function getXAxisPosition() {
  // Use a fixed proportion of the fixed-height canvas (5760x1080)
  if (!oceanCanvas) return 648; // fallback ~60% of 1080
  const desired = oceanCanvas.height * 0.6; // place wave near upper area
  const maxY = oceanCanvas.height - 100;
  const minY = oceanCanvas.height * 0.2;
  return Math.max(minY, Math.min(maxY, desired));
}

function getJaggedWaveY(x) {
  // Get x-axis position in viewport
  const xAxisY = getXAxisPosition();

  // Calculate the maximum possible jaggedness to position wave correctly
  const maxJaggedness = 5 + 3 + 2; // Sum of all jaggedness amplitudes (reduced for shorter waves)
  const waveAmplitude = 8; // Main wave amplitude (reduced)

  // Position the wave higher - make it reach well above x-axis
  let baseY = xAxisY - maxJaggedness - waveAmplitude; // Much taller wave

  // Add the main wave oscillation (reduced amplitude)
  baseY += Math.sin(x * 0.01 + waveOffset) * 8;

  // Smooth wave with only low-frequency components (reduced amplitudes)
  let smoothWave = 0;
  smoothWave += Math.sin(x * 0.03 + waveOffset * 2) * 5; // Gentle medium frequency
  smoothWave += Math.sin(x * 0.015 + waveOffset * 1.5) * 3; // Low frequency
  smoothWave += Math.sin(x * 0.06 + waveOffset * 2.3) * 2; // Subtle detail

  // Very minimal random variation for subtle texture
  smoothWave += (Math.random() - 0.5) * 0.3; // Barely noticeable

  return baseY + smoothWave;
}

function drawSkyArea() {
  // Use gradient with specified colors (reversed)
  const xAxisY = getXAxisPosition();
  const gradient = ctx.createLinearGradient(0, 0, 0, xAxisY);

  // Apply the custom gradient colors in reverse order
  // #152346 at top (darkest) -> rgb(21, 35, 70)
  gradient.addColorStop(0, 'rgb(21, 35, 70)');
  // #314488 at 12.85% -> rgb(49, 68, 136)
  gradient.addColorStop(0.1285, 'rgb(49, 68, 136)');
  // #5E6FBA at 54.91% -> rgb(94, 111, 186)
  gradient.addColorStop(0.5491, 'rgb(94, 111, 186)');
  // #768EC9 at 84.74% -> rgb(118, 142, 201)
  gradient.addColorStop(0.8474, 'rgb(118, 142, 201)');
  // Extend to bottom (lightest)
  gradient.addColorStop(1, 'rgb(118, 142, 201)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, oceanCanvas.width, xAxisY);
}

function drawOceanBackground() {
  // Draw gradient background under the wave to hide the light sky gradient
  const xAxisY = getXAxisPosition();
  const backgroundStartY = xAxisY - 30; // Start higher to better cover the wave area
  const backgroundHeight = oceanCanvas.height - backgroundStartY; // Extend to full canvas height

  // Save the current context state
  ctx.save();

  // Apply blur filter to the ocean background
  ctx.filter = 'blur(10px)'; // Adjust blur amount as needed (1-10px)

  // Create the specified gradient - make it solid, not transparent
  const gradient = ctx.createLinearGradient(0, backgroundStartY, 0, backgroundStartY + backgroundHeight);
  gradient.addColorStop(0, '#121FDA'); // Start with bright blue
  gradient.addColorStop(0.5, '#09003E'); // Middle dark purple
  gradient.addColorStop(1, '#09003E'); // End with dark purple (solid, not transparent)

  ctx.fillStyle = gradient;
  ctx.fillRect(0, backgroundStartY, oceanCanvas.width, backgroundHeight);

  // Restore the context state to remove the blur filter
  ctx.restore();
}

function drawPixelatedNoise() {
  // Draw pixelated noise with smooth wave boundary
  const xAxisY = getXAxisPosition();
  const waveEndY = Math.min(oceanCanvas.height, xAxisY + 425); // Taller ocean - 250px below

  // Use smaller step size for smoother wave edge
  const step = window.pixelSize / 2; // Half-size steps for smoother rendering

  for (let x = 0; x < oceanCanvas.width; x += window.pixelSize) {
    let waveY = getJaggedWaveY(x);

    // Extended anti-aliasing zone for smoother transition
    const antiAliasHeight = window.pixelSize * 4;
    const smoothStart = waveY - antiAliasHeight;

    // Draw from above the wave edge with smooth transition
    for (let y = smoothStart; y < waveEndY; y += step) {
      // Calculate alpha for smooth edge transition
      let alpha = 1.0;
      if (y < waveY) {
        // Smooth fade-in at the wave edge with cubic easing for even smoother transition
        const distFromEdge = waveY - y;
        const normalizedDist = distFromEdge / antiAliasHeight;
        alpha = 1 - Math.pow(normalizedDist, 0.7); // Smoother curve
        alpha = Math.max(0, Math.min(1, alpha));
      }

      // Only draw if alpha is meaningful
      if (alpha > 0.05) {
        drawOceanPixel(x, y, waveY, xAxisY, waveEndY, alpha);
      }
    }
  }
}

function drawOceanPixel(x, y, waveY, xAxisY, waveEndY, alpha) {
  // Calculate ripple effect on this pixel (optimized)
  let rippleOffset = 0;
  if (ripples.length > 0) {
    for (let ripple of ripples) {
      // Skip distant ripples for performance - use squared distance to avoid sqrt
      const dx = x - ripple.x;
      const dy = y - ripple.y;
      const distSquared = dx * dx + dy * dy;
      const maxDistSquared = (ripple.radius + 100) ** 2;

      if (distSquared < maxDistSquared) {
        rippleOffset += ripple.getEffect(x, y);
      }
    }
  }

  // Check if this pixel is affected by ripples
  const hasRippleEffect = Math.abs(rippleOffset) > 0.5;

  // Apply ripple displacement to pixel position
  let displayX = x + Math.cos(rippleOffset * 0.1) * rippleOffset * 0.5;
  let displayY = y + Math.sin(rippleOffset * 0.1) * rippleOffset * 0.5;

  // Dynamic pixel size with subtle variation - cache calculations for performance
  let dynamicPixelSize = window.pixelSize;

  // Cache common trigonometric calculations
  const xTime1 = x * 0.03 + time * 2;
  const yTime1 = y * 0.02 + time * 1.5;
  const combinedTime1 = time * 4 + x * 0.01;

  if (hasRippleEffect) {
    // More dramatic size variation when ripples are present
    let sizeVariation = Math.sin(xTime1) * 2 +
      Math.cos(yTime1) * 1.5 +
      Math.sin(combinedTime1) * 1;

    // Add ripple effect to size variation
    sizeVariation += Math.abs(rippleOffset) * 0.2;
    dynamicPixelSize += sizeVariation;
  } else {
    // Subtle variation for calm ocean
    let sizeVariation1 = Math.sin(x * 0.015 + time * 0.4) * 0.3;
    let sizeVariation2 = Math.cos(y * 0.012 + time * 0.3) * 0.2;
    dynamicPixelSize += sizeVariation1 + sizeVariation2;
  }

  dynamicPixelSize = Math.max(4, Math.min(12, dynamicPixelSize));

  // ACTIVE MORPHING PATTERNS - Large scale shifting across the ocean (cached for performance)
  const morphX = x * window.morphScale + time * window.morphSpeed;
  const morphY = y * window.morphScale * 0.8 + time * window.morphSpeed * 0.7;
  const morphXY = (x + y) * window.morphScale * 0.5 + time * window.morphSpeed * 0.5;
  const morphXYDiff = (x - y) * window.morphScale * 0.6 + time * window.morphSpeed * 0.8;

  let morphPattern1 = Math.sin(morphX) * Math.cos(morphY);
  let morphPattern2 = Math.sin(morphXY) * Math.cos(morphXYDiff);

  // Combine patterns for complex movement
  let morphValue = (morphPattern1 + morphPattern2) / 2;

  // Static noise that shifts with the morphing patterns - SUBTLE range
  let baseStaticIntensity = hasRippleEffect ? 0.3 : 0.04; // Lower base for calm
  let morphingStaticIntensity = baseStaticIntensity + (morphValue * window.staticShiftAmount);

  let staticNoise = hasRippleEffect ?
    (Math.random() * 0.4 + 0.8) :
    // Compress the range for subtle variation: instead of 0-1, use 0.92-1.04
    (Math.random() * morphingStaticIntensity * 0.6 + (1 - morphingStaticIntensity * 0.3));

  // Noise layers for additional texture
  let noiseVal1 = Math.sin(x * 0.02 + time * 0.5) * Math.cos(y * 0.015 + time * 0.4) * Math.sin(time * 0.8);
  let noiseVal2 = Math.sin(x * 0.01 + time * 0.3) * Math.cos(y * 0.012 + time * 0.6) * Math.sin(time * 0.5);

  let noiseVal = (noiseVal1 + noiseVal2 * 0.6) / 1.6;

  // Scale noise based on ripple presence
  if (!hasRippleEffect) {
    noiseVal *= 0.3; // Subtle when calm
  }

  // Ocean depth affects color (only below wave)
  let depthFactor = (y - waveY) / (oceanCanvas.height - waveY);

  // SHIFTING COLOR BANDS - Diagonal bands that move across the ocean
  let bandAngle = time * window.bandSpeed; // Rotating angle
  let bandX = Math.cos(bandAngle);
  let bandY = Math.sin(bandAngle);
  let bandPosition = (x / oceanCanvas.width) * bandX + ((y - waveY) / oceanCanvas.height) * bandY;
  let bandPattern = Math.sin(bandPosition * Math.PI * 4 + time * window.bandSpeed * 2);

  // Create visible color shifts from the bands
  let colorBandEffect = bandPattern * window.bandIntensity;

  // Add morphing pattern to create flowing effect
  let flowingColor = morphValue * window.bandIntensity * 0.8;

  // Below water - deeper blues with more variation near the jagged edge
  let edgeProximity = Math.max(0, 1 - (y - waveY) / 20); // How close to the jagged edge
  let edgeVariation = edgeProximity * (hasRippleEffect ? 15 : 5); // Less variation when calm

  // Keep colors in blue range - eliminate black pixels in calm areas
  let randomVariation = hasRippleEffect ?
    (Math.random() - 0.5) * (10 + edgeVariation) : // Normal variation with ripples
    0; // No random variation in calm areas to prevent black pixels

  // Base colors with band and morphing effects applied
  let r = 5 + depthFactor * 15 + noiseVal * 10 + randomVariation + colorBandEffect * 0.3 + flowingColor;
  let g = 15 + depthFactor * 25 + noiseVal * 15 + randomVariation * 1.2 + colorBandEffect * 0.6 + flowingColor * 1.2;
  let b = 35 + depthFactor * 50 + noiseVal * 20 + randomVariation * 1.5 + colorBandEffect + flowingColor * 0.8;

  // Ensure minimum blue values in calm areas to prevent black pixels
  if (!hasRippleEffect) {
    r = Math.max(5, r);   // Minimum red to prevent pure black
    g = Math.max(15, g);  // Minimum green to prevent pure black
    b = Math.max(35, b);  // Minimum blue to maintain ocean color
  }

  // Apply static noise
  r *= staticNoise;
  g *= staticNoise;
  b *= staticNoise;

  // Constrain colors to blue range - ensure no black pixels
  if (hasRippleEffect) {
    r = Math.max(0, Math.min(60, r));  // Keep red low
    g = Math.max(0, Math.min(80, g));  // Keep green moderate
    b = Math.max(20, Math.min(150, b)); // Keep blue dominant
  } else {
    // In calm areas, ensure higher minimum values to prevent black pixels
    r = Math.max(8, Math.min(40, r));   // Higher minimum red
    g = Math.max(20, Math.min(60, g));  // Higher minimum green
    b = Math.max(45, Math.min(120, b)); // Higher minimum blue
  }

  // Add brightness variation from ripple
  if (Math.abs(rippleOffset) > 0.5) {
    const rippleBrightness = 1 + (Math.abs(rippleOffset) / 20) * 0.3;
    r *= rippleBrightness;
    g *= rippleBrightness;
    b *= rippleBrightness;

    // Re-constrain after brightness adjustment
    r = Math.max(0, Math.min(80, r));
    g = Math.max(0, Math.min(100, g));
    b = Math.max(20, Math.min(180, b));
  }

  // Draw pixelated square with dynamic size at displaced position
  // Apply alpha for smooth wave edge
  ctx.fillStyle = `rgba(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)}, ${alpha})`;
  ctx.fillRect(displayX, displayY, dynamicPixelSize, dynamicPixelSize);
}


// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOceanGenerative);
} else {
  initOceanGenerative();
}
