// Ocean-inspired generative piece with static-y pixelated gradients
window.pixelSize = 5; // Larger pixels for better performance - globally accessible
let time = 0;
let waveOffset = 0;
let oceanCanvas;
let ctx;

// EXPERIMENTAL: Ocean morphing controls - adjust these to see different effects!
window.morphSpeed = 3; // How fast patterns shift (try 0.5 to 3.0)
window.morphScale = 0.008; // Size of morphing patterns (try 0.005 to 0.02)
window.bandIntensity = 4; // Strength of color bands - SUBTLE (try 5 to 15)
window.bandSpeed = 1.5; // Speed of band movement (try 0.2 to 1.0)
window.staticShiftAmount = 0.25; // How much static varies - SUBTLE (try 0.05 to 0.15)

// RIPPLE CONTROLS - Customize how ripples appear and behave
window.rippleRingCount = 10; // Number of concentric rings (try 5 to 20)
window.rippleRingSpacing = 80; // Distance between rings in pixels (try 40 to 150)
window.rippleRingThickness = 40; // How thick each ring band is (try 20 to 80)
window.rippleWaveIntensity = 15; // How much ripples distort pixels (try 15 to 60)
window.rippleWaveFrequency = 0.15; // How wavy the rings are (try 0.05 to 0.3)
window.rippleExpansionSpeed = 8; // How fast ripples expand (try 3 to 15)
window.rippleStrengthFalloff = 0.08; // How quickly rings fade with distance (try 0.03 to 0.15)

// Ripple effect variables
let ripples = [];
let lastNoseX = null;
let lastNoseY = null;
let lastTimelinePosition = null;

// Pulsing ripple when settled
let settledTimeout = null;
let pulseInterval = null;
let isSettled = false;
let lastRippleX = null;
let lastRippleY = null;
let currentPulseInterval = 3000; // Dynamic pulse interval based on ripple size
const SETTLE_DELAY = 400; // Wait 400ms before considering "settled"

// Performance optimization
let lastFrameTime = 0;
const targetFPS = 20; // Reduce to 20fps for better performance
const frameInterval = 1000 / targetFPS;

class Ripple {
  constructor(x, y, delay = 0, dataCount = 1) {
    this.x = x;
    this.y = y;
    this.radius = 0;

    // Scale maxRadius based on data count relative to min/max in dataset
    // Use the actual min and max from the data for dynamic scaling
    const minDataCount = window.minDataCount || 1;
    const maxDataCount = window.maxDataCount || 1000;

    // Make the base radius and scale range more balanced for bottom bar data only
    const baseMaxRadius = window.innerWidth * 0.3; // Medium base
    const minScale = .5; // Minimum 50% of base - visible ripples for small data
    const maxScale = 5; // Maximum 500% of base - large but not overwhelming ripples

    // Normalize data count to 0-1 range based on actual min/max
    let normalizedCount;
    if (maxDataCount === minDataCount) {
      normalizedCount = 0.5; // If all dates have same count, use middle scale
    } else {
      normalizedCount = (dataCount - minDataCount) / (maxDataCount - minDataCount);
    }

    // Apply strong exponential scaling for EXTREME differences at the low end
    // This makes small data BARELY visible and large data HUGE
    normalizedCount = Math.pow(normalizedCount, 2.0); // Stronger exponential curve

    const radiusScale = minScale + (normalizedCount * (maxScale - minScale));
    this.maxRadius = baseMaxRadius * radiusScale;

    this.speed = window.rippleExpansionSpeed; // Expansion speed (controllable)
    this.strength = 1;
    this.life = 1.0; // Life starts at 1.0

    // Calculate how many frames it will take to reach maxRadius
    const framesToReachMax = this.maxRadius / this.speed;

    // Scale fadeSpeed so ripple lives long enough to reach its maxRadius
    // Add more buffer for smaller ripples so they stay longer
    const lifeBuffer = 1.3 + (1 - normalizedCount) * 0.5; // More buffer for low data (up to 1.8x)
    this.fadeSpeed = this.life / (framesToReachMax * lifeBuffer);

    this.dissipationRate = 0.001; // How much strength decreases over time

    console.log(`🌊 RIPPLE CREATED:
      dataCount: ${dataCount}
      min/max range: [${minDataCount}, ${maxDataCount}]
      normalized: ${normalizedCount.toFixed(3)} (0=min, 1=max)
      maxRadius: ${this.maxRadius.toFixed(0)}px
      framesToReachMax: ${framesToReachMax.toFixed(0)}
      fadeSpeed: ${this.fadeSpeed.toFixed(4)} (faster = shorter life)`);
    this.delay = delay; // Delay before ripple becomes active
    this.active = false; // Whether ripple is active yet
    this.age = 0; // Age of the ripple
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
  console.log("Initializing ocean generative...");

  const container = document.getElementById('generative-container');
  if (!container) {
    console.error("Container not found!");
    return;
  }

  // Use high resolution for crisp pixels
  const containerWidth = window.innerWidth;
  const containerHeight = window.innerHeight;

  // Create canvas with high resolution
  oceanCanvas = document.createElement('canvas');
  oceanCanvas.width = containerWidth;
  oceanCanvas.height = containerHeight;
  oceanCanvas.id = 'ocean-canvas';
  oceanCanvas.style.display = 'block';
  oceanCanvas.style.width = '100%';
  oceanCanvas.style.height = '100%';
  oceanCanvas.style.position = 'absolute';
  oceanCanvas.style.top = '0';
  oceanCanvas.style.left = '0';
  oceanCanvas.style.zIndex = '1';
  oceanCanvas.style.imageRendering = 'pixelated'; // Maintain crisp pixels

  // Add to container
  container.appendChild(oceanCanvas);

  // Get context
  ctx = oceanCanvas.getContext('2d');

  console.log("Canvas created with high resolution:", oceanCanvas.width, oceanCanvas.height);

  // Add scroll listener to ensure wave updates on scroll
  window.addEventListener('scroll', () => {
    // Force immediate update by triggering a small change
    // The animate loop will pick up the new position
  });

  // Start animation
  animate();
}

function createRippleAtCurrentPosition() {
  // Create ripple at the x-axis position
  const xAxisY = getXAxisPosition();
  const currentTimelinePosition = noseX;

  // Map nose position to canvas coordinates to match timeline position exactly
  const nosePercent = currentTimelinePosition / videoWidth; // 0 to 1

  // Get the actual timeline element to calculate precise position
  const timeline = document.getElementById('timeline');
  const scrollContainer = document.getElementById('scroll-container');
  let rippleX, rippleY;

  if (timeline) {
    // Get the timeline <g> element which contains the actual data
    const timelineG = timeline.querySelector('g');

    if (timelineG) {
      // Get the bounding rect of the <g> element (the actual data container)
      const gRect = timelineG.getBoundingClientRect();

      // Calculate the position within the full timeline width
      const invertedNosePercent = 1 - nosePercent;
      const positionInTimeline = invertedNosePercent * gRect.width;

      // Add the left offset of the <g> element
      rippleX = gRect.left + positionInTimeline;
    } else {
      // Fallback to SVG center
      const timelineRect = timeline.getBoundingClientRect();
      rippleX = timelineRect.left + (timelineRect.width / 2);
    }

    rippleY = xAxisY; // At the x-axis level
  } else {
    // Fallback to canvas-based mapping
    rippleX = oceanCanvas.width / 2;
    rippleY = xAxisY;
  }

  // Position ripple at the top of the wave (fixed Y position)
  const waveTopY = xAxisY - 150; // Fixed distance above x-axis

  // Store position for pulsing
  lastRippleX = rippleX;
  lastRippleY = waveTopY;

  // Clear old ripples to prevent buildup
  if (ripples.length > 4) {
    ripples = ripples.slice(-2);
  }

  // Get data count from timeline if available
  const dataCount = typeof currentDataCount !== 'undefined' ? currentDataCount : 1;

  // Create single ripple at the top of the wave with data count
  ripples.push(new Ripple(rippleX, waveTopY, 0, dataCount));

  console.log("Timeline ripple created at:", rippleX, waveTopY, "with dataCount:", dataCount);
}

function calculatePulseInterval(dataCount) {
  // Calculate ripple lifetime based on same logic as Ripple constructor
  const minDataCount = window.minDataCount || 1;
  const maxDataCount = window.maxDataCount || 1000;

  const baseMaxRadius = window.innerWidth * 0.3;
  const minScale = .5;
  const maxScale = 5;

  // Normalize and apply exponential curve (same as Ripple constructor)
  let normalizedCount;
  if (maxDataCount === minDataCount) {
    normalizedCount = 0.5;
  } else {
    normalizedCount = (dataCount - minDataCount) / (maxDataCount - minDataCount);
  }
  normalizedCount = Math.pow(normalizedCount, 2.0);

  const radiusScale = minScale + (normalizedCount * (maxScale - minScale));
  const maxRadius = baseMaxRadius * radiusScale;

  // Calculate lifetime
  const speed = window.rippleExpansionSpeed;
  const framesToReachMax = maxRadius / speed;
  const lifeBuffer = 1.3 + (1 - normalizedCount) * 0.5;

  // Total frames in ripple lifetime
  const totalFrames = framesToReachMax * lifeBuffer;

  // Convert to milliseconds at 20fps
  const fps = 20;
  const rippleLifetimeMs = (totalFrames / fps) * 1000;

  // Add 20% buffer so new ripple starts slightly after previous one fades
  const pulseInterval = rippleLifetimeMs * 1.2;

  console.log(`Calculated pulse interval: ${pulseInterval.toFixed(0)}ms for dataCount ${dataCount} (ripple lifetime: ${rippleLifetimeMs.toFixed(0)}ms)`);

  return pulseInterval;
}

function startPulsing() {
  if (pulseInterval) return; // Already pulsing

  isSettled = true;

  // Calculate dynamic pulse interval based on current data count
  const dataCount = typeof currentDataCount !== 'undefined' ? currentDataCount : 1;
  currentPulseInterval = calculatePulseInterval(dataCount);

  console.log(`User settled - starting ripple pulse every ${currentPulseInterval.toFixed(0)}ms`);

  // Create ripple on dynamic interval
  pulseInterval = setInterval(() => {
    if (lastRippleX !== null && lastRippleY !== null) {
      const dataCount = typeof currentDataCount !== 'undefined' ? currentDataCount : 1;
      ripples.push(new Ripple(lastRippleX, lastRippleY, 0, dataCount));
      console.log("Pulse ripple created");
    }
  }, currentPulseInterval);
}

function stopPulsing() {
  if (pulseInterval) {
    clearInterval(pulseInterval);
    pulseInterval = null;
    isSettled = false;
    console.log("User moved - stopping ripple pulse");
  }
  if (settledTimeout) {
    clearTimeout(settledTimeout);
    settledTimeout = null;
  }
}

function checkForTimelineChanges() {
  // Check if timeline position has changed (due to nose movement)
  if (typeof noseX !== 'undefined' && noseX !== null) {
    const currentTimelinePosition = noseX;

    // More sensitive detection for better synchronization
    if (lastTimelinePosition === null ||
      Math.abs(currentTimelinePosition - lastTimelinePosition) > 1) {

      // User moved - stop pulsing and reset settle timer
      stopPulsing();

      // Create immediate ripple
      createRippleAtCurrentPosition();

      lastTimelinePosition = currentTimelinePosition;

      // Start settle timer
      settledTimeout = setTimeout(() => {
        startPulsing();
      }, SETTLE_DELAY);
    }
  }
}

function checkForNoseMovement() {
  // Check if noseX exists from poseDetection.js
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
        console.log("Cleared weak ripples due to large position change");
      }

      // Map nose position from video coordinates to canvas coordinates
      const rippleX = (noseX / videoWidth) * oceanCanvas.width;
      const rippleY = (noseY / videoHeight) * oceanCanvas.height;

      ripples.push(new Ripple(rippleX, rippleY));
      lastNoseX = noseX;
      lastNoseY = noseY;

      console.log("Nose ripple created at:", rippleX, rippleY);
    }
  } else {
    // If no nose detected, gradually clear all ripples
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

  time += 0.01;
  waveOffset += 0.02;
  requestAnimationFrame(animate);
}

function getXAxisPosition() {
  // Get the timeline element and calculate x-axis position
  const timeline = document.getElementById('timeline');
  if (!timeline) {
    // Fallback: position wave at a reasonable height before timeline loads
    return oceanCanvas.height * 0.4; // 40% down the viewport
  }

  const timelineRect = timeline.getBoundingClientRect();

  // Check if timeline is visible and has proper dimensions
  if (timelineRect.height === 0 || timelineRect.width === 0) {
    return oceanCanvas.height * 0.4; // Fallback if timeline not rendered
  }

  // Calculate x-axis position relative to the timeline
  const xAxisY = timelineRect.top + (timelineRect.height * 0.6); // Adjusted to be closer to actual x-axis

  // Ensure the wave doesn't go below the bottom of the viewport
  const maxY = oceanCanvas.height - 100; // Leave 100px buffer at bottom
  const minY = oceanCanvas.height * 0.2; // Don't go above 20% of viewport

  return Math.max(minY, Math.min(maxY, xAxisY));
}

function getJaggedWaveY(x) {
  // Get x-axis position in viewport
  const xAxisY = getXAxisPosition();

  // Calculate the maximum possible jaggedness to position wave correctly
  const maxJaggedness = 5 + 3 + 2; // Sum of all jaggedness amplitudes (reduced for shorter waves)
  const waveAmplitude = 8; // Main wave amplitude (reduced)

  // Position the wave higher - make it reach well above x-axis
  let baseY = xAxisY - maxJaggedness - waveAmplitude - 180; // Much taller wave

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
  const backgroundStartY = xAxisY - 190; // Start higher to better cover the wave area
  const backgroundHeight = oceanCanvas.height - backgroundStartY; // Extend to full canvas height

  // Create the specified gradient - make it solid, not transparent
  const gradient = ctx.createLinearGradient(0, backgroundStartY, 0, backgroundStartY + backgroundHeight);
  gradient.addColorStop(0, '#121FDA'); // Start with bright blue
  gradient.addColorStop(0.5, '#09003E'); // Middle dark purple
  gradient.addColorStop(1, '#09003E'); // End with dark purple (solid, not transparent)

  ctx.fillStyle = gradient;
  ctx.fillRect(0, backgroundStartY, oceanCanvas.width, backgroundHeight);
}

function drawPixelatedNoise() {
  // Draw pixelated noise with smooth wave boundary
  const xAxisY = getXAxisPosition();
  const waveEndY = Math.min(oceanCanvas.height, xAxisY + 250); // Taller ocean - 250px below

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
      // Skip distant ripples for performance
      const distToRipple = Math.sqrt((x - ripple.x) ** 2 + (y - ripple.y) ** 2);
      if (distToRipple < ripple.radius + 100) { // Only check nearby ripples
        rippleOffset += ripple.getEffect(x, y);
      }
    }
  }

  // Check if this pixel is affected by ripples
  const hasRippleEffect = Math.abs(rippleOffset) > 0.5;

  // Apply ripple displacement to pixel position
  let displayX = x + Math.cos(rippleOffset * 0.1) * rippleOffset * 0.5;
  let displayY = y + Math.sin(rippleOffset * 0.1) * rippleOffset * 0.5;

  // Dynamic pixel size with subtle variation
  let dynamicPixelSize = window.pixelSize;

  if (hasRippleEffect) {
    // More dramatic size variation when ripples are present
    let sizeVariation = Math.sin(x * 0.03 + time * 2) * 2 +
      Math.cos(y * 0.02 + time * 1.5) * 1.5 +
      Math.sin(time * 4 + x * 0.01) * 1;

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

  // ACTIVE MORPHING PATTERNS - Large scale shifting across the ocean
  let morphPattern1 = Math.sin(x * window.morphScale + time * window.morphSpeed) *
    Math.cos(y * window.morphScale * 0.8 + time * window.morphSpeed * 0.7);
  let morphPattern2 = Math.sin((x + y) * window.morphScale * 0.5 + time * window.morphSpeed * 0.5) *
    Math.cos((x - y) * window.morphScale * 0.6 + time * window.morphSpeed * 0.8);

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
