let noDateData = [];
let withLocation = [], withoutLocation = [];
let xScale, g, startDate, endDate;
let axisY = 4, rectHeight = 0.6, verticalPadding = 0.2;
let aboveOffsetPadding = 3, belowOffsetPadding = 8;

// Global variables to share data count information with ocean generative
window.currentDataCount1 = 0; // Person 1 data count
window.currentDataCount2 = 0; // Person 2 data count
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



fetch("data.json")
  .then(res => res.json())
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
    const svgWidth = totalMonths * pixelsPerMonth;

    const svg = d3.select("#timeline").attr("width", svgWidth);
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
    // g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const scaleFactor = 0.7;
    g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top}) scale(${scaleFactor})`);

    xScale = d3.scaleTime().domain([startDate, endDate]).range([0, width]);
    const xAxis = d3.axisBottom(xScale).ticks(d3.timeMonth.every(1)).tickFormat(d3.timeFormat("%b %Y"));


    // Group data by month for counting
    const withLocationByMonth = d3.rollup(withLocation, v => v.length, d => +d.monthObj);
    const withoutLocationByMonth = d3.rollup(withoutLocation, v => v.length, d => +d.monthObj);

    const maxAbove = d3.max(withLocationByMonth.values());
    const maxBelow = d3.max(withoutLocationByMonth.values());

    // Calculate min and max data counts across all months for ripple scaling
    // Use ONLY top bar data (withoutLocation / is_alive === false)
    window.minDataCount = d3.min(withoutLocationByMonth.values()) || 1;
    window.maxDataCount = d3.max(withoutLocationByMonth.values()) || 1;

    console.log(`Data count range across ALL months (top bar only): min=${window.minDataCount}, max=${window.maxDataCount}`);
    console.log(`Total months with top bar data: ${withoutLocationByMonth.size}`);
    console.log(`Top bar month counts:`, Array.from(withoutLocationByMonth.entries()).map(([month, count]) => ({
      date: new Date(month).toISOString().slice(0, 7),
      count
    })));

    const topSpace = maxAbove * (rectHeight + verticalPadding);
    const bottomSpace = maxBelow * (rectHeight + verticalPadding);
    const separationPadding = 100;
    const axisHeightPadding = 60;
    axisY = separationPadding + topSpace + axisHeightPadding;
    const dynamicHeight = axisY + bottomSpace + separationPadding;


    const noDateLineY = axisY + 100;

    svg.attr("height", dynamicHeight + margin.top + margin.bottom);

    g.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${axisY})`)
      .call(xAxis)
      .style("font-size", "10px");

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
  // Clear all label timers to prevent orphaned labels
  labelTimers.forEach(timer => clearTimeout(timer));
  labelTimers = [];

  // Clear all animations to prevent orphaned animations
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
  console.log("dataArray length:", dataArray);

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
          .attr("width", 15)
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
      const maxX = d3.max(xs) + 15 + padding;
      const minY = d3.min(ys) - padding;
      const maxY = d3.max(ys) + rectHeight + padding;

      // Get the color for this category's bounding box
      let boxColor = useSnowPattern ? "#FFFC00" : getCategoryColor(type);

      console.log("Type:", type, "Box color:", boxColor);

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

      activeAnimations.push(anim);

      // Fade rectangles to lower opacity as outline draws
      typeRects.forEach(rectSelection => {
        const rectAnim = rectSelection
          .transition()
          .duration(DRAW_DURATION)
          .attr("opacity", opacity === .4 ? .25 : 1);
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
          .attr("font-size", "9px")
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
      labelTimers.push(timer);
    });
}

function updateVisibleData(noseX, personId = 1) {
  if (!xScale || !g || !startDate || !endDate) return;

  // Clear animations and elements for the specific person
  clearPersonAnimations(personId);

  if (personId === 1) {
    g.selectAll(".person-1").remove();
  } else if (personId === 2) {
    g.selectAll(".person-2").remove();
  }


  // Calculate time window based on the specific person's position
  let from = startDate, to = endDate;
  let centerTimeRaw = null;
  if (noseX !== null && noseX !== undefined) {
    const percent = 1 - Math.min(Math.max(noseX / videoWidth, 0), 1);
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

  // Only draw x-axis once (for person 1) to avoid duplication
  if (personId === 1) {
    // Always remove and redraw x-axis to ensure clean state
    g.selectAll(".x-axis").remove();

    const xAxis = d3.axisBottom(xScale)
      .ticks(d3.timeMonth.every(1))
      .tickFormat(d3.timeFormat("%b %Y"));

    const xAxisG = g.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${axisY})`)
      .call(xAxis);

    xAxisG.selectAll(".tick text")
      .style("font-size", "11px")
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end")
      .style("fill", "#FFF")
      .filter(function (d) {
        return d >= from && d <= to;
      })
      .style("fill", "#FFF")
      .style("font-weight", "700")
      .style("font-size", "12px");
  }


  // Filter data based on this person's specific time window
  const visibleWith = withLocation
    .filter(d => d.monthObj >= from && d.monthObj <= to)
    .sort((a, b) => a.monthObj - b.monthObj || (a.type1_cluster || "").localeCompare(b.type1_cluster || ""));

  const visibleWithout = withoutLocation
    .filter(d => d.monthObj >= from && d.monthObj <= to)
    .sort((a, b) => a.monthObj - b.monthObj || (a.type1_cluster || "").localeCompare(b.type1_cluster || ""));

  // Calculate data count for the specific center date (where ripple will be created)
  // Use ONLY top bar data (withoutLocation / is_alive === false)
  if (centerTimeRaw) {
    const centerMonth = new Date(centerTimeRaw.getFullYear(), centerTimeRaw.getMonth(), 1);
    const centerMonthTime = +centerMonth;

    // Count ONLY withoutLocation items at the center month (top bar only)
    const itemsAtCenter = withoutLocation.filter(d => +d.monthObj === centerMonthTime).length;

    // Store data count per person
    if (personId === 1) {
      window.currentDataCount1 = itemsAtCenter;
    } else if (personId === 2) {
      window.currentDataCount2 = itemsAtCenter;
    }

    console.log(`Person ${personId} - Center date data count (top bar only): ${itemsAtCenter} at month ${centerMonth.toISOString()}`);
  } else {
    // If no specific position, use total count in visible range (top bar only)
    const totalCount = visibleWithout.length;
    if (personId === 1) {
      window.currentDataCount1 = totalCount;
    } else if (personId === 2) {
      window.currentDataCount2 = totalCount;
    }
    console.log(`Person ${personId} - Full range data count (top bar only): ${totalCount}`);
  }


  const ABOVE_PADDING = 30;
  const BELOW_PADDING = 50;

  // Create fresh offset maps for each person to avoid interference
  // Reset offset maps on each movement to prevent stacking issues
  let aboveOffsetMap, belowOffsetMap;
  if (personId === 1) {
    // Person 1 uses fresh offset maps each time
    aboveOffsetMap = {};
    belowOffsetMap = {};
  } else {
    // Person 2 uses fresh offset maps each time
    aboveOffsetMap = {};
    belowOffsetMap = {};
  }

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
}

