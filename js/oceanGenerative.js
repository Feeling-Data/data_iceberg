// Ocean-inspired generative piece with static-y pixelated gradients
let pixelSize = 8;
let time = 0;
let waveOffset = 0;
let oceanCanvas;
let ctx;

// Ripple effect variables
let ripples = [];
let lastNoseX = null;
let lastNoseY = null;
let lastTimelinePosition = null;

// Performance optimization
let lastFrameTime = 0;
const targetFPS = 30; // Reduce from 60fps to 30fps for better performance
const frameInterval = 1000 / targetFPS;

class Ripple {
  constructor(x, y, delay = 0) {
    this.x = x;
    this.y = y;
    this.radius = 0;
    this.maxRadius = 800;
    this.speed = 3;
    this.strength = 1;
    this.life = 1.0; // Life starts at 1.0
    this.maxLife = 300; // Maximum frames to live (5 seconds at 60fps)
    this.fadeSpeed = 0.02; // How fast it fades per frame
    this.dissipationRate = 0.001; // How much strength decreases over time
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
    const dist = Math.sqrt((px - this.x) ** 2 + (py - this.y) ** 2);
    const distFromRipple = Math.abs(dist - this.radius);

    if (distFromRipple < 50 && this.totalStrength > 0) {
      const rippleStrength = (1 - distFromRipple / 50) * this.totalStrength;
      return Math.sin(distFromRipple * 0.3) * rippleStrength * 20;
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

function checkForTimelineChanges() {
  // Check if timeline position has changed (due to nose movement)
  if (typeof noseX !== 'undefined' && noseX !== null) {
    const currentTimelinePosition = noseX;

    // More sensitive detection for better synchronization
    if (lastTimelinePosition === null ||
      Math.abs(currentTimelinePosition - lastTimelinePosition) > 1) {

      // Create ripple at the x-axis position
      const xAxisY = getXAxisPosition();

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
          const scrollLeft = scrollContainer ? scrollContainer.scrollLeft : 0;

          // The timeline uses xScale to map dates to positions
          // nosePercent represents position in the full timeline
          // We need to map this to the actual screen position

          // Calculate the position within the full timeline width
          const invertedNosePercent = 1 - nosePercent;
          const positionInTimeline = invertedNosePercent * gRect.width;

          // Add the left offset of the <g> element and account for scroll
          rippleX = gRect.left + positionInTimeline;

          // Debug: log the positions to see if they match
          console.log("Ripple X:", rippleX);
          console.log("nosePercent:", nosePercent, "inverted:", invertedNosePercent);
          console.log("Position in timeline:", positionInTimeline);
          console.log("Timeline <g> rect:", gRect.left, gRect.width);
          console.log("Scroll left:", scrollLeft);
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

      // Ensure ripple appears exactly at x-axis level, not deep in ocean
      rippleY = xAxisY;

      // Create multiple ripples along the same x position spanning the wave height
      const waveHeight = oceanCanvas.height - xAxisY; // Height from x-axis to bottom
      const rippleCount = 8; // Number of ripples to create

      for (let i = 0; i < rippleCount; i++) {
        // Distribute ripples evenly along the wave height
        const rippleSpacing = waveHeight / (rippleCount - 1);
        const currentRippleY = xAxisY + (i * rippleSpacing);

        // No horizontal offset - keep ripples aligned
        const horizontalOffset = 0;

        // Add cascading delay - each ripple starts later than the one above
        const cascadeDelay = i * 5; // 5 frames delay between each ripple

        ripples.push(new Ripple(rippleX + horizontalOffset, currentRippleY, cascadeDelay));
      }

      lastTimelinePosition = currentTimelinePosition;

      console.log("Timeline ripple created at:", rippleX, rippleY, "noseX:", currentTimelinePosition);
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
  const maxJaggedness = 15 + 8 + 12 + 10 + 5; // Sum of all jaggedness amplitudes
  const waveAmplitude = 20; // Main wave amplitude

  // Position the wave higher but not too tall - optimize for performance
  let baseY = xAxisY - maxJaggedness - waveAmplitude - 40; // Reduced height for better performance

  // Add the main wave oscillation
  baseY += Math.sin(x * 0.01 + waveOffset) * 20;

  // Add jaggedness with multiple frequency components
  let jaggedness = 0;
  jaggedness += Math.sin(x * 0.05 + waveOffset * 2) * 15; // Medium frequency
  jaggedness += Math.sin(x * 0.1 + waveOffset * 3) * 8;   // High frequency
  jaggedness += Math.sin(x * 0.02 + waveOffset * 1.5) * 12; // Low frequency

  // Add random pixel-level choppiness
  jaggedness += (Math.random() - 0.5) * 10;

  // Add time-based shifting
  jaggedness += Math.sin(time * 3 + x * 0.03) * 5;

  return baseY + jaggedness;
}

function drawSkyArea() {
  // Create smooth gradient sky above the jagged wave line
  for (let x = 0; x < oceanCanvas.width; x++) {
    let waveY = getJaggedWaveY(x);

    // Create gradient from dark blue at top to slightly lighter at wave line
    for (let y = 0; y < waveY; y++) {
      let gradientFactor = y / waveY;
      let r = 10 + gradientFactor * 10;
      let g = 20 + gradientFactor * 15;
      let b = 40 + gradientFactor * 20;

      ctx.fillStyle = `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function drawPixelatedNoise() {
  // Draw pixelated noise with jagged wave boundary and dynamic pixel sizes
  // Optimize: only draw pixels in the wave area, not the entire screen
  const waveStartY = Math.max(0, getXAxisPosition() - 150); // Only draw 150px above x-axis
  const waveEndY = oceanCanvas.height;

  for (let x = 0; x < oceanCanvas.width; x += pixelSize) {
    let waveY = getJaggedWaveY(x);

    for (let y = Math.max(waveY, waveStartY); y < waveEndY; y += pixelSize) {
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

      // Dynamic pixel size variation - calmer when no ripples
      let dynamicPixelSize = pixelSize;

      if (hasRippleEffect) {
        // More dramatic size variation when ripples are present
        let sizeVariation = Math.sin(x * 0.03 + time * 2) * 2 +
          Math.cos(y * 0.02 + time * 1.5) * 1.5 +
          Math.sin(time * 4 + x * 0.01) * 1;

        // Add ripple effect to size variation
        sizeVariation += Math.abs(rippleOffset) * 0.2;
        dynamicPixelSize += sizeVariation;
      } else {
        // Calmer, more subtle variation when no ripples
        let sizeVariation = Math.sin(x * 0.02 + time * 1) * 0.5 +
          Math.cos(y * 0.015 + time * 0.8) * 0.3;
        dynamicPixelSize += sizeVariation;
      }

      dynamicPixelSize = Math.max(4, Math.min(12, dynamicPixelSize)); // Keep within reasonable bounds

      // Skip pixels more randomly when ripples are present, less when calm
      const skipChance = hasRippleEffect ? 0.15 : 0.03;
      if (Math.random() < skipChance) continue;

      // Create static noise - less intense when no ripples
      let staticNoise = hasRippleEffect ?
        (Math.random() * 0.4 + 0.8) : // 0.8 to 1.2 when ripples present
        (Math.random() * 0.2 + 0.9);  // 0.9 to 1.1 when calm

      let noiseVal = Math.sin(x * 0.02) * Math.cos(y * 0.02) * Math.sin(time * 2);

      // Reduce noise intensity when no ripples
      if (!hasRippleEffect) {
        noiseVal *= 0.3; // Much less noise variation
      }

      // Ocean depth affects color (only below wave)
      let depthFactor = (y - waveY) / (oceanCanvas.height - waveY);

      // Below water - deeper blues with more variation near the jagged edge
      let edgeProximity = Math.max(0, 1 - (y - waveY) / 20); // How close to the jagged edge
      let edgeVariation = edgeProximity * (hasRippleEffect ? 15 : 5); // Less variation when calm

      // Keep colors in blue range - eliminate black pixels in calm areas
      let randomVariation = hasRippleEffect ?
        (Math.random() - 0.5) * (10 + edgeVariation) : // Normal variation with ripples
        0; // No random variation in calm areas to prevent black pixels

      let r = 5 + depthFactor * 15 + noiseVal * 10 + randomVariation;
      let g = 15 + depthFactor * 25 + noiseVal * 15 + randomVariation * 1.2;
      let b = 35 + depthFactor * 50 + noiseVal * 20 + randomVariation * 1.5;

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
      ctx.fillStyle = `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`;
      ctx.fillRect(displayX, displayY, dynamicPixelSize, dynamicPixelSize);
    }
  }
}


// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOceanGenerative);
} else {
  initOceanGenerative();
}