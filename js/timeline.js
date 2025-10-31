let noDateData = [];
let withLocation = [], withoutLocation = [];
let xScale, g, startDate, endDate;
let axisY = 4, rectHeight = 0.6, verticalPadding = 0.2;
let aboveOffsetPadding = 3, belowOffsetPadding = 8;

// Video width constant (shared globally)
window.videoWidth = 200;
const videoWidth = window.videoWidth; // Also available as const for this file

// Sensitivity control - uses a curve to reduce sensitivity while maintaining full range
// Lower value = less sensitive (small movements produce smaller date changes)
// Value between 0.3 and 1.0 - 0.5 is a good starting point
const DATE_SENSITIVITY_CURVE = 0.5; // 0.5 = moderately less sensitive, 0.3 = very insensitive, 1.0 = linear (full sensitivity)
// Expose to window so oceanGenerative.js can use the same curve
window.DATE_SENSITIVITY_CURVE = DATE_SENSITIVITY_CURVE;

// Global variables to share data count information with ocean generative
window.currentDataCount1 = 0; // Person data count
window.minDataCount = 1;
window.maxDataCount = 1;

// Category color mapping
const categoryColors = {
  'Lifestyle': '#223D32',
  'Arts': '#422852',
  'Sports': '#38369A',
  'Social': '#0055BC',
  'Religion': '#3EC8FF',
  'Education': '#96DFD5',
  'Business': '#C6EBBE'
};

// Additional colors for other categories
const additionalColors = [
  '#662D3A', '#9F53BC', '#EB7683', '#E4B7F2', '#39A992', '#656C44',
  '#C98945', '#EBD162', '#E48F7E', '#E764AE', '#B94B53', '#5157CE'
];

// Function to get color for a category
function getCategoryColor(category) {
  if (categoryColors[category]) {
    return categoryColors[category];
  }

  // Assign a color from additionalColors based on category name
  // Use a hash of the category name to consistently assign the same color
  if (!category) return '#FFFFFF'; // Default white for undefined

  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % additionalColors.length;
  return additionalColors[index];
}

// Function to brighten a hex color
function brightenColor(hex, percent) {
  // Remove # if present
  hex = hex.replace('#', '');

  // Convert to RGB
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);

  // Brighten by moving towards 255
  r = Math.min(255, Math.floor(r + (255 - r) * (percent / 100)));
  g = Math.min(255, Math.floor(g + (255 - g) * (percent / 100)));
  b = Math.min(255, Math.floor(b + (255 - b) * (percent / 100)));

  // Convert back to hex
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

const snowCanvas = document.createElement("canvas");
const snowCtx = snowCanvas.getContext("2d");
snowCanvas.width = 200;
snowCanvas.height = 60;

function updateSnowNoise() {
  const w = snowCanvas.width;
  const h = snowCanvas.height;
  const imageData = snowCtx.createImageData(w, h);

  const blockSize = 6;
  const now = Date.now() * 0.001;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const blockX = Math.floor(x / blockSize);
      const blockY = Math.floor(y / blockSize);

      const graySeed = Math.sin(blockX * 12.9898 + blockY * 78.233 + now) * 43758.5453;
      const gray = Math.floor((graySeed - Math.floor(graySeed)) * 255);

      const noise = gray + Math.random() * 20 - 10;

      const i = (y * w + x) * 4;
      imageData.data[i] = noise;
      imageData.data[i + 1] = noise;
      imageData.data[i + 2] = noise;
      imageData.data[i + 3] = 120;
    }
  }

  // bold line (per 2 line)
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      imageData.data[i] *= 0.3;
      imageData.data[i + 1] *= 0.3;
      imageData.data[i + 2] *= 0.3;
    }
  }

  // thin line
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const fade = 0.98 + 0.02 * Math.sin(y * 0.5); // add vibrant
      imageData.data[i] *= fade;
      imageData.data[i + 1] *= fade;
      imageData.data[i + 2] *= fade;
    }
  }

  snowCtx.putImageData(imageData, 0, 0);
  const dataURL = snowCanvas.toDataURL("image/png");
  d3.select("#snownoise-image").attr("xlink:href", dataURL);
}



setInterval(updateSnowNoise, 100); // dynamic noise



function mirrorTimelineToGrid() {
  const src = document.getElementById('timeline');
  if (!src) return;
  const html = src.innerHTML; // includes defs, axis, bars, etc.
  const s1 = document.getElementById('grid-svg-1');
  const s2 = document.getElementById('grid-svg-2');
  const s3 = document.getElementById('grid-svg-3');
  const apply = (el, offset) => {
    if (!el) return;
    el.setAttribute('width', '1920');
    el.setAttribute('height', '1080');
    el.setAttribute('viewBox', `${offset} 0 1920 1080`);
    el.setAttribute('preserveAspectRatio', 'xMinYMin meet');
    el.innerHTML = html; // no extra transforms; viewBox crops correctly
  };
  apply(s1, 0);
  apply(s2, 1920);
  apply(s3, 3840);
}
// Expose for external calls (e.g., grid toggle)
window.mirrorTimelineToGrid = mirrorTimelineToGrid;

let mirrorScheduled = false;
let mirrorUntil = 0;
function scheduleMirrorTimelineToGrid() {
  if (!document.body.classList.contains('grid-mode')) return;
  if (mirrorScheduled) return;
  mirrorScheduled = true;
  requestAnimationFrame(() => {
    mirrorScheduled = false;
    mirrorTimelineToGrid();
  });
}

function pulseMirrorTimeline(ms = 1200) {
  if (!document.body.classList.contains('grid-mode')) return;
  const now = performance.now();
  mirrorUntil = Math.max(mirrorUntil, now + ms);
  const loop = () => {
    if (!document.body.classList.contains('grid-mode')) return;
    const t = performance.now();
    mirrorTimelineToGrid();
    if (t < mirrorUntil) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

let timelineObserver = null;
function observeTimelineForMirrors() {
  const src = document.getElementById('timeline');
  if (!src) return;
  if (timelineObserver) { timelineObserver.disconnect(); timelineObserver = null; }
  timelineObserver = new MutationObserver(() => {
    scheduleMirrorTimelineToGrid();
  });
  timelineObserver.observe(src, { childList: true, subtree: true, attributes: true, attributeFilter: ['transform', 'style', 'opacity', 'x', 'y', 'width', 'height'] });
}

// Startup
fetch("data.json")
  .then(res => {
    return res.json();
  })
  .then(data => {
    const parseDate = d3.timeParse("%d/%m/%Y");

    const withDate = [];
    const withoutDate = [];

    data.forEach(d => {
      if (d.date && typeof d.date === 'string') {
        const cleanedDateStr = d.date.replace(/\\\//g, "/");
        const parsedDate = parseDate(cleanedDateStr);

        if (parsedDate) {
          const monthObj = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1);
          withDate.push({ ...d, dateObj: parsedDate, monthObj, hasDate: true });
        } else {
          withoutDate.push({ ...d, hasDate: false });
        }
      } else {
        withoutDate.push({ ...d, hasDate: false });
      }
    });

    withLocation = withDate.filter(d => d.is_alive === true);
    withoutLocation = withDate.filter(d => d.is_alive !== true);
    noDateData = withoutDate;

    if (withDate.length === 0 && withoutDate.length === 0) {
      console.error("No valid data found");
      return;
    }


    const minDate = withDate.length > 0 ? d3.min(withDate, d => d.monthObj) : new Date();
    const maxDate = withDate.length > 0 ? d3.max(withDate, d => d.monthObj) : new Date();

    startDate = d3.timeMonth.offset(minDate, -1);
    endDate = d3.timeMonth.offset(maxDate, 1);

    const totalMonths = d3.timeMonth.count(startDate, endDate);
    const pixelsPerMonth = 25; // Increased from daily to monthly scale
    const svgWidth = 5760;

    const svg = d3.select("#timeline").attr("width", svgWidth).attr("height", 1080);
    const defs = svg.append("defs");

    // dynamic noise pattern
    const pattern = defs.append("pattern")
      .attr("id", "snownoise-pattern")
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 200)
      .attr("height", 60);

    pattern.append("image")
      .attr("id", "snownoise-image")
      .attr("width", 200)
      .attr("height", 60)
      .attr("x", 0)
      .attr("y", 0);

    const margin = { top: 40, right: 20, bottom: 40, left: 50 };
    const width = svgWidth - margin.left - margin.right;

    xScale = d3.scaleTime().domain([startDate, endDate]).range([0, width]);
    const xAxis = d3.axisBottom(xScale).ticks(d3.timeMonth.every(1)).tickFormat(d3.timeFormat("%b %Y"));


    // Group data by month for counting
    const withLocationByMonth = d3.rollup(withLocation, v => v.length, d => +d.monthObj);
    const withoutLocationByMonth = d3.rollup(withoutLocation, v => v.length, d => +d.monthObj);

    // Expose monthly counts globally for ripple sizing
    window.withoutLocationByMonthCounts = Object.fromEntries(Array.from(withoutLocationByMonth.entries()));

    const maxAbove = d3.max(withLocationByMonth.values());
    const maxBelow = d3.max(withoutLocationByMonth.values());

    // Calculate min and max data counts across all months for ripple scaling
    // Use ONLY top bar data (withoutLocation / is_alive === false)
    window.minDataCount = d3.min(withoutLocationByMonth.values()) || 1;
    window.maxDataCount = d3.max(withoutLocationByMonth.values()) || 1;

    const topSpace = maxAbove * (rectHeight + verticalPadding);
    const bottomSpace = maxBelow * (rectHeight + verticalPadding);
    const separationPadding = 100;
    const axisHeightPadding = 60;
    axisY = separationPadding + topSpace + axisHeightPadding;
    const dynamicHeight = axisY + bottomSpace + separationPadding;

    // Height already set to 1080px above
    // Position timeline higher up in the 1080px height
    const svgHeight = 1080;
    const centerY = svgHeight * 1.6 / 3; // Move to upper third instead of center

    // Adjust axisY to be positioned higher up
    axisY = centerY;

    // Create g element positioned for centered timeline
    g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const noDateLineY = axisY + 100;

    const xAxisGroup = g.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${axisY})`)
      .call(xAxis)
      .style("font-size", "16px");

    // After initial render, mirror to grid svgs and pulse during initial animations
    scheduleMirrorTimelineToGrid();
    observeTimelineForMirrors();
    pulseMirrorTimeline(1500);

    // Render initial axis properly to avoid squishing
    // Call updateVisibleData with null to just render the axis properly
    setTimeout(() => {
      if (xScale && g && startDate && endDate) {
        // Render with null to show full timeline axis without bars
        // This ensures proper sizing and prevents squishing
        updateVisibleData(null, 1);
        console.log('Timeline initialized with proper axis rendering');
      }
    }, 100);

  });

// Store all the current Animations
let activeAnimations = [];
let labelTimers = [];

function clearActiveAnimations() {
  // stop all the Animations
  activeAnimations.forEach(anim => {
    anim.selection().interrupt();
  });
  activeAnimations = [];

  labelTimers.forEach(timer => clearTimeout(timer));
  labelTimers = [];
}

function clearPersonAnimations(personId) {
  // Clear all label timers
  labelTimers.forEach(timer => clearTimeout(timer));
  labelTimers = [];

  // Clear all animations
  activeAnimations.forEach(anim => {
    anim.selection().interrupt();
  });
  activeAnimations = [];
}

function goFullScreen() {
  const elem = document.documentElement;
  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  } else if (elem.webkitRequestFullscreen) {
    elem.webkitRequestFullscreen();
  } else if (elem.msRequestFullscreen) {
    elem.msRequestFullscreen();
  }
}


function drawClusterRects(dataArray, yFunc, useSnowPattern = false, opacity = 1.0, personId = 1) {
  const typeGroups = new Map();

  // Don't update currentDataCount here - it should be based on specific date position
  // dataArray contains all visible items across the time window, not a specific date

  // group by type and month
  const groupedData = d3.rollup(
    dataArray,
    v => v,
    d => d.type1_cluster || "undefined",
    d => +d.monthObj
  );

  const typeBoxInfoList = [];
  // draw all rect and bounding box，collect label
  groupedData.forEach((monthMap, type) => {
    const typePositions = [];
    const typeRects = []; // Store rect references for this type

    monthMap.forEach((items, monthTime) => {
      const monthDate = new Date(monthTime);
      const x = xScale(monthDate);

      items.forEach((d, i) => {

        const y = yFunc(d);

        // Get color based on category
        const category = d.type1_cluster || "undefined";
        const fillColor = useSnowPattern ? "url(#snownoise-pattern)" : getCategoryColor(category);

        // Draw rect with specified opacity and person-specific class
        const rect = g.append("rect")
          .attr("x", x)
          .attr("y", y)
          .attr("width", 20)
          .attr("height", rectHeight)
          .attr("fill", fillColor)
          .attr("opacity", opacity)
          .attr("class", `type-rect type-${type.replace(/\s+/g, '-')} person-${personId}`);

        // Store rect reference before adding title
        typeRects.push(rect);

        // Add title tooltip
        rect.append("title")
          .text(`${d.title} (${d.date})`);

        typePositions.push({ x, y });
      });
    });

    if (typePositions.length > 0) {
      const xs = typePositions.map(p => p.x);
      const ys = typePositions.map(p => p.y);

      const padding = 0.5;
      const minX = d3.min(xs) - padding;
      const maxX = d3.max(xs) + 20 + padding;
      const minY = d3.min(ys) - padding;
      const maxY = d3.max(ys) + rectHeight + padding;

      // Get the color for this category's bounding box
      let boxColor = useSnowPattern ? "#FFFC00" : getCategoryColor(type);

      // Optionally brighten the color for better visibility as an outline
      // if (!useSnowPattern) {
      //   boxColor = brightenColor(boxColor, 25);
      // }

      // Draw animated bounding box with person-specific class
      const box = g.append("rect")
        .attr("x", minX)
        .attr("y", minY)
        .attr("width", maxX - minX)
        .attr("height", maxY - minY)
        .attr("stroke", boxColor)
        .attr("stroke-width", 1.2)
        .attr("fill", "none")
        .attr("class", `type-bound person-${personId}`);

      const length = 2 * ((maxX - minX) + (maxY - minY));
      const DRAW_DURATION = 1000;

      const anim = box
        .attr("stroke-dasharray", length)
        .attr("stroke-dashoffset", length)
        .transition()
        .duration(DRAW_DURATION)
        .ease(d3.easeLinear)
        .attr("stroke-dashoffset", 0);

      // Push to animation array
      activeAnimations.push(anim);

      // Fade rectangles to lower opacity as outline draws
      typeRects.forEach(rectSelection => {
        const rectAnim = rectSelection
          .transition()
          .duration(DRAW_DURATION)
          .attr("opacity", opacity === .4 ? .25 : 1);
        // Push to animation array
        activeAnimations.push(rectAnim);
      });

      //collect label info - only for categories with enough records
      const recordCount = typePositions.length;
      const minRecordsForLabel = 12; // Minimum records to show label

      if (recordCount >= minRecordsForLabel) {
        typeBoxInfoList.push({
          type,
          anchorX: maxX, // Use maxX (end) for right alignment
          anchorY: minY, // Use minY (top) for top alignment
          recordCount,
          typePositions, // Pass the actual rectangle positions
          animEndTime: Date.now()
        });
      }
    }
  });

  // draw labels with colored indicators
  const MIN_LABEL_SPACING = 8; // Reduced spacing
  const occupiedLabelYs = [];
  const labelHeight = 12; // Approximate text height

  typeBoxInfoList
    .sort((a, b) => a.anchorY - b.anchorY)
    .forEach(({ type, anchorX, anchorY, recordCount, typePositions, animEndTime }, index) => {
      const timer = setTimeout(() => {
        // Find the actual top position of this category's rectangles
        const categoryRects = typePositions.map(pos => pos.y);
        const actualTopY = d3.min(categoryRects);
        let labelY = actualTopY; // Position at the actual top of the category's rectangles

        // No collision detection - labels positioned exactly at their category tops

        const targetX = anchorX; // Square touches the bar edge (no gap)

        // Get category color
        const categoryColor = useSnowPattern ? "#FFFC00" : getCategoryColor(type);

        // Draw colored square indicator - touching bar with person-specific class
        g.append("rect")
          .attr("x", targetX)
          .attr("y", labelY)
          .attr("width", 4)
          .attr("height", 4)
          .attr("fill", categoryColor)
          .attr("class", `person-${personId}`)
          .style("opacity", 0)
          .transition()
          .delay(1000)
          .duration(400)
          .style("opacity", opacity);

        // Add label text - vertically centered on the square with person-specific class
        g.append("text")
          .attr("x", targetX + 5)
          .attr("y", labelY + 2)
          .attr("fill", "white")
          .attr("font-size", "14px")
          .attr("text-anchor", "start")
          .attr("dominant-baseline", "central")
          .attr("class", `person-${personId}`)
          .style("opacity", 0)
          .text(`${type} (${recordCount})`)
          .transition()
          .delay(1200)
          .duration(600)
          .style("opacity", 0.9);
      }, Math.max(0, animEndTime - Date.now()) + index * 100);
      // Push to timer array
      labelTimers.push(timer);
    });
}

// Throttle updates to prevent excessive updates
let lastUpdateTime = 0;
const UPDATE_THROTTLE_MS = 50; // Minimum time between updates

function updateVisibleData(noseX, personId = 1) {
  // Throttle to prevent excessive updates
  const now = Date.now();

  if (now - lastUpdateTime < UPDATE_THROTTLE_MS) {
    // Skip if too soon - prevents rapid-fire updates
    return;
  }

  lastUpdateTime = now;

  console.log(`[updateVisibleData] Called with noseX:`, noseX);
  if (!xScale || !g || !startDate || !endDate) {
    console.error(`[updateVisibleData] Missing dependencies: xScale=${!!xScale}, g=${!!g}, startDate=${!!startDate}, endDate=${!!endDate}`);
    return;
  }

  // Clear animations and elements
  clearPersonAnimations(personId);

  // Remove bars
  g.selectAll(".person-1").remove();

  // Calculate time window based on the specific person's position
  let from = startDate, to = endDate;
  let centerTimeRaw = null;

  // If noseX is null/undefined, show all dates (for initial axis setup)
  // Otherwise, calculate the time window based on position
  if (noseX !== null && noseX !== undefined && !isNaN(noseX)) {
    // Map noseX to percentage of video width (0 to 1)
    const rawPercent = Math.min(Math.max(noseX / videoWidth, 0), 1);

    // Apply power curve to reduce sensitivity: smaller movements = smaller changes
    // Using a power < 1.0 makes the curve less steep (less sensitive)
    // This still maps 0->0 and 1->1, so full range is maintained
    const curvedPercent = Math.pow(rawPercent, DATE_SENSITIVITY_CURVE);

    // Invert (left = end of timeline, right = start)
    const percent = 1 - curvedPercent;

    // Always use 1 month window - never show wider window
    const windowMonths = 1;
    const fullRange = endDate - startDate;
    centerTimeRaw = new Date(+startDate + percent * fullRange);

    from = d3.timeMonth.offset(centerTimeRaw, -windowMonths / 2);
    to = d3.timeMonth.offset(centerTimeRaw, windowMonths / 2);

    if (from < startDate) {
      from = startDate;
      to = d3.timeMonth.offset(from, windowMonths);
    }
    if (to > endDate) {
      to = endDate;
      from = d3.timeMonth.offset(to, -windowMonths);
    }
  }

  // Always remove and redraw x-axis to ensure clean state
  g.selectAll(".x-axis").remove();

  const xAxis = d3.axisBottom(xScale)
    .ticks(d3.timeMonth.every(1))
    .tickFormat(d3.timeFormat("%b %Y"));

  const xAxisG = g.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${axisY})`)
    .call(xAxis);

  // Style all axis text first
  xAxisG.selectAll(".tick text")
    .style("font-size", "16px")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end")
    .style("fill", "rgba(255,255,255,0.5)"); // Default faded color

  // Highlight ticks in the visible range
  xAxisG.selectAll(".tick text")
    .filter(function (d) {
      return d >= from && d <= to;
    })
    .style("fill", "#FFF")
    .style("font-weight", "700");


  // Filter data based on this person's specific time window
  // Only show bars if we have actual position data (noseX is valid)
  const shouldShowBars = noseX !== null && noseX !== undefined && !isNaN(noseX);

  console.log(`[updateVisibleData] shouldShowBars=${shouldShowBars}, from=${from ? new Date(from).toISOString().substring(0,7) : 'null'}, to=${to ? new Date(to).toISOString().substring(0,7) : 'null'}`);

  const visibleWith = shouldShowBars ? withLocation
    .filter(d => d.monthObj >= from && d.monthObj <= to)
    .sort((a, b) => a.monthObj - b.monthObj || (a.type1_cluster || "").localeCompare(b.type1_cluster || "")) : [];

  const visibleWithout = shouldShowBars ? withoutLocation
    .filter(d => d.monthObj >= from && d.monthObj <= to)
    .sort((a, b) => a.monthObj - b.monthObj || (a.type1_cluster || "").localeCompare(b.type1_cluster || "")) : [];

  console.log(`[updateVisibleData] Found ${visibleWith.length} visibleWith and ${visibleWithout.length} visibleWithout items`);

  // Calculate data count for the specific center date (where ripple will be created)
  // Use ONLY top bar data (withoutLocation / is_alive === false)
  if (centerTimeRaw) {
    const centerMonth = new Date(centerTimeRaw.getFullYear(), centerTimeRaw.getMonth(), 1);
    const centerMonthTime = +centerMonth;

    // Count ONLY withoutLocation items at the center month (top bar only)
    const itemsAtCenter = (window.withoutLocationByMonthCounts && window.withoutLocationByMonthCounts[centerMonthTime]) ? window.withoutLocationByMonthCounts[centerMonthTime] : 0;

    // Store data count
    window.currentDataCount1 = itemsAtCenter;
  } else {
    const totalCount = visibleWithout.length;
    window.currentDataCount1 = totalCount;
  }


  const ABOVE_PADDING = 30;
  const BELOW_PADDING = 80;

  // Create fresh offset maps to avoid interference
  // Reset offset maps on each movement to prevent stacking issues
  let aboveOffsetMap = {};
  let belowOffsetMap = {};

  function getOffset(monthObj, map) {
    const key = +monthObj;
    map[key] = (map[key] || 0) + 1;
    return map[key] - 1;
  }


  // Draw bars for this specific person with person-specific classes

  drawClusterRects(
    visibleWith,
    d => axisY - 5 - ABOVE_PADDING - (getOffset(d.monthObj, aboveOffsetMap) + 1) * (rectHeight + verticalPadding),
    false,  // Use category colors
    1.0,    // Full opacity for top bar
    personId
  );

  drawClusterRects(
    visibleWithout,
    d => axisY + 5 + BELOW_PADDING + getOffset(d.monthObj, belowOffsetMap) * (rectHeight + verticalPadding),
    false,  // Use category colors like upper bar
    .4,     // Semi-transparent for bottom bar
    personId
  );

  // At the end of updates, if grid is visible, refresh mirrors
  if (document.body && document.body.classList && document.body.classList.contains('grid-mode')) {
    scheduleMirrorTimelineToGrid();
    // Pulse mirrors while animations/labels draw
    pulseMirrorTimeline(1500);
  }
}

