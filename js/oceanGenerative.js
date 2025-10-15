// Ocean-inspired generative piece with static-y pixelated gradients
let pixelSize = 12; // Larger pixels for better performance
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
const targetFPS = 20; // Reduce to 20fps for better performance
const frameInterval = 1000 / targetFPS;

class Ripple {
  constructor(x, y, delay = 0) {
    this.x = x;
    this.y = y;
    this.radius = 0;
    this.maxRadius = window.innerWidth * 4; // Much larger for true ocean coverage
    this.speed = 8; // Much faster expansion
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
    // Create massive expanding circular rings that span the whole ocean
    const dist = Math.sqrt((px - this.x) ** 2 + (py - this.y) ** 2);

    if (this.totalStrength > 0) {
      // Create very large rings that expand across the entire ocean
      for (let ringIndex = 0; ringIndex < 10; ringIndex++) {
        const ringRadius = this.radius - (ringIndex * 80); // 80px gaps between rings
        const distFromRing = Math.abs(dist - ringRadius);

        if (distFromRing < 40 && ringRadius > 0 && ringRadius < this.radius + 200) {
          // Ring strength decreases with distance from center
          const ringStrength = this.totalStrength * (1 - ringIndex * 0.08) * (1 - dist / (this.maxRadius * 0.95));
          const localStrength = (1 - distFromRing / 40) * ringStrength;

          // Create ring wave pattern with multiple frequencies
          const waveFreq = 0.15 + (ringIndex * 0.05);
          const ringWave = Math.sin(distFromRing * waveFreq + ringIndex * 0.6) * localStrength;
          return ringWave * 35;
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

      // Position ripple at the top of the wave (fixed Y position)
      const waveTopY = xAxisY - 150; // Fixed distance above x-axis

      // Clear old ripples to prevent buildup
      if (ripples.length > 4) {
        ripples = ripples.slice(-2);
      }

      // Create single ripple at the top of the wave
      ripples.push(new Ripple(rippleX, waveTopY));

      lastTimelinePosition = currentTimelinePosition;

      console.log("Timeline ripple created at:", rippleX, waveTopY, "noseX:", currentTimelinePosition);
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
  const maxJaggedness = 12 + 6 + 8; // Sum of all jaggedness amplitudes (much smoother)
  const waveAmplitude = 20; // Main wave amplitude

  // Position the wave higher - make it reach well above x-axis
  let baseY = xAxisY - maxJaggedness - waveAmplitude - 180; // Much taller wave

  // Add the main wave oscillation
  baseY += Math.sin(x * 0.01 + waveOffset) * 20;

  // Smooth wave with only low-frequency components
  let smoothWave = 0;
  smoothWave += Math.sin(x * 0.03 + waveOffset * 2) * 12; // Gentle medium frequency
  smoothWave += Math.sin(x * 0.015 + waveOffset * 1.5) * 8; // Low frequency
  smoothWave += Math.sin(x * 0.06 + waveOffset * 2.3) * 6; // Subtle detail

  // Very minimal random variation for subtle texture
  smoothWave += (Math.random() - 0.5) * 0.5; // Barely noticeable

  return baseY + smoothWave;
}

function drawSkyArea() {
  // Use simple gradient for performance
  const xAxisY = getXAxisPosition();
  const gradient = ctx.createLinearGradient(0, 0, 0, xAxisY);
  gradient.addColorStop(0, 'rgb(10, 20, 40)');
  gradient.addColorStop(1, 'rgb(20, 35, 60)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, oceanCanvas.width, xAxisY);
}

function drawPixelatedNoise() {
  // Draw pixelated noise with smooth wave boundary
  const xAxisY = getXAxisPosition();
  const waveEndY = Math.min(oceanCanvas.height, xAxisY + 250); // Taller ocean - 250px below

  // Use smaller step size for smoother wave edge
  const step = pixelSize / 2; // Half-size steps for smoother rendering

  for (let x = 0; x < oceanCanvas.width; x += pixelSize) {
    let waveY = getJaggedWaveY(x);

    // Extended anti-aliasing zone for smoother transition
    const antiAliasHeight = pixelSize * 4;
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
    // Subtle variation for calm ocean
    let sizeVariation1 = Math.sin(x * 0.015 + time * 0.4) * 0.3;
    let sizeVariation2 = Math.cos(y * 0.012 + time * 0.3) * 0.2;
    dynamicPixelSize += sizeVariation1 + sizeVariation2;
  }

  dynamicPixelSize = Math.max(4, Math.min(12, dynamicPixelSize));

  // Subtle static for calm ocean background
  let staticNoise = hasRippleEffect ?
    (Math.random() * 0.4 + 0.8) : // 0.8 to 1.2 when ripples present
    (Math.random() * 0.1 + 0.95); // 0.95 to 1.05 when calm - minimal variation

  // Subtle noise layers for gentle morphing
  let noiseVal1 = Math.sin(x * 0.02 + time * 0.5) * Math.cos(y * 0.015 + time * 0.4) * Math.sin(time * 0.8);
  let noiseVal2 = Math.sin(x * 0.01 + time * 0.3) * Math.cos(y * 0.012 + time * 0.6) * Math.sin(time * 0.5);

  let noiseVal = (noiseVal1 + noiseVal2 * 0.6) / 1.6;

  // Minimal noise intensity to keep ripples prominent
  if (!hasRippleEffect) {
    noiseVal *= 0.2; // Very subtle noise variation
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
