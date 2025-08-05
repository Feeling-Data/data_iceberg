let isAnimating = false;
let noDateData = [];

let withLocation = [], withoutLocation = [];
let xScale, g, startDate, endDate;
let axisY = 4, rectHeight = 2, verticalPadding = 1;
let aboveOffsetPadding = 10, belowOffsetPadding = 20;

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


    withLocation = withDate.filter(d => d.Extracted_Locations);
    withoutLocation = withDate.filter(d => !d.Extracted_Locations);
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
    const pixelsPerMonth = 50; // Increased from daily to monthly scale
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
    g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    xScale = d3.scaleTime().domain([startDate, endDate]).range([0, width]);
    const xAxis = d3.axisBottom(xScale).ticks(d3.timeMonth.every(1)).tickFormat(d3.timeFormat("%b %Y"));

    // Group data by month for counting
    const withLocationByMonth = d3.rollup(withLocation, v => v.length, d => +d.monthObj);
    const withoutLocationByMonth = d3.rollup(withoutLocation, v => v.length, d => +d.monthObj);

    const maxAbove = d3.max(withLocationByMonth.values());
    const maxBelow = d3.max(withoutLocationByMonth.values());

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
      .call(xAxis);

  });


function drawClusterRects(dataArray, yFunc, fillStyle) {
  const typeGroups = new Map();

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

    monthMap.forEach((items, monthTime) => {
      const monthDate = new Date(monthTime);
      const x = xScale(monthDate);

      items.forEach((d, i) => {
        const y = yFunc(d);

        // Draw rect
        g.append("rect")
          .attr("x", x)
          .attr("y", y)
          .attr("width", 15)
          .attr("height", rectHeight)
          .attr("fill", fillStyle)
          .attr("opacity", 0.8)
          .append("title")
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

      // Draw animated bounding box
      const box = g.append("rect")
        .attr("x", minX)
        .attr("y", minY)
        .attr("width", maxX - minX)
        .attr("height", maxY - minY)
        .attr("stroke", "white")
        .attr("stroke-width", 0.5)
        .attr("fill", "none")
        .attr("class", "type-bound");

      const length = 2 * ((maxX - minX) + (maxY - minY));
      const DRAW_DURATION = 3000;

      box
        .attr("stroke-dasharray", length)
        .attr("stroke-dashoffset", length)
        .transition()
        .duration(DRAW_DURATION)
        .ease(d3.easeLinear)
        .attr("stroke-dashoffset", 0);

      //collect label, do not draw directly
      typeBoxInfoList.push({
        type,
        anchorX: maxX,
        anchorY: minY,
      });
    }
  });

  // stage 2：draw label，in order and avoid overlap 
  const MIN_LABEL_SPACING = 6;
  const occupiedLabelYs = [];

  typeBoxInfoList
    .sort((a, b) => a.anchorY - b.anchorY) // order label in rect Y 
    .forEach(({ type, anchorX, anchorY }) => {
      let labelY = anchorY - 6;

      if (occupiedLabelYs.length > 0) {
        const lastY = occupiedLabelYs[occupiedLabelYs.length - 1];
        if (labelY - lastY < MIN_LABEL_SPACING) {
          labelY = lastY + MIN_LABEL_SPACING;
        }
      }
      occupiedLabelYs.push(labelY);

      const targetX = anchorX + 30;

      // draw leader line
      g.append("line")
        .attr("x1", anchorX)
        .attr("y1", anchorY)
        .attr("x2", anchorX)
        .attr("y2", anchorY)
        .attr("stroke", "white")
        .attr("stroke-width", 0.4)
        .style("opacity", 0)
        .transition()
        .delay(3000)
        .duration(600)
        .style("opacity", 0.6)
        .attr("x2", targetX)
        .attr("y2", labelY);

      // add label
      g.append("text")
        .attr("x", targetX + 2)
        .attr("y", labelY + 3)
        .attr("fill", "white")
        .attr("font-size", "7px")
        .attr("text-anchor", "start")
        .style("opacity", 0)
        .text(type)
        .transition()
        .delay(3600)
        .duration(800)
        .style("opacity", 0.8);
    });
}




function updateVisibleData(noseX) {
  if (!xScale || !g || !startDate || !endDate) return;

  // Clear previous elements (including no-date group)
  g.selectAll("*").remove();

  // Re-add axis after clearing
  const xAxis = d3.axisBottom(xScale).ticks(d3.timeMonth.every(1)).tickFormat(d3.timeFormat("%b %Y"));
  g.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${axisY})`)
    .call(xAxis);

  // Calculate visible range based on nose position (if available)
  let from = startDate, to = endDate;
  if (noseX !== null && noseX !== undefined) {
    const percent = 1 - Math.min(Math.max(noseX / videoWidth, 0), 1);
    const windowMonths = 1; // Show 1 month at a time
    const fullRange = endDate - startDate;
    const centerTimeRaw = new Date(+startDate + percent * fullRange);

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

  // Filter and sort data with dates
  const visibleWith = withLocation
    .filter(d => d.monthObj >= from && d.monthObj <= to)
    .sort((a, b) => {
      if (a.monthObj - b.monthObj !== 0) return a.monthObj - b.monthObj;
      return (a.type1_cluster || "").localeCompare(b.type1_cluster || "");
    });

  const visibleWithout = withoutLocation
    .filter(d => d.monthObj >= from && d.monthObj <= to)
    .sort((a, b) => {
      if (a.monthObj - b.monthObj !== 0) return a.monthObj - b.monthObj;
      return (a.type1_cluster || "").localeCompare(b.type1_cluster || "");
    });

  // Offset tracking for positioned data
  const aboveOffsetMap = {};
  const belowOffsetMap = {};

  function getOffset(monthObj, map) {
    const key = +monthObj;
    if (!map[key]) map[key] = 0;
    return map[key]++;
  }

  // Draw grouped rects for data with dates
  drawClusterRects(
    visibleWith,
    d => axisY - 30 - (getOffset(d.monthObj, aboveOffsetMap) + 1) * (rectHeight + verticalPadding),
    "white"
  );

  drawClusterRects(
    visibleWithout,
    d => axisY + 30 + getOffset(d.monthObj, belowOffsetMap) * (rectHeight + verticalPadding),
    "url(#snownoise-pattern)"


  );



  // ===== Draw no-date data =====
  const noDateAreaY = axisY + 100;
  const noDateAreaHeight = 60;
  const MAX_NO_DATE_ITEMS = 50;
  const FLOAT_RANGE = 10;

  if (noDateData && noDateData.length > 0) {
    const noDateGroup = g.append("g").attr("class", "no-date-group");

    // 1. select the data
    const sampledData = noDateData.length > MAX_NO_DATE_ITEMS ?
      noDateData.filter((d, i) => i % Math.ceil(noDateData.length / MAX_NO_DATE_ITEMS) === 0) :
      [...noDateData];

    // 2. the space
    const itemSpacing = (xScale(endDate) - xScale(startDate)) / (sampledData.length + 1);

    // 3. add float
    sampledData.forEach((d, i) => {
      const x = xScale(startDate) + itemSpacing * (i + 1) - 7.5;
      const row = i % 6;
      const baseY = noDateAreaY + (row - 2.5) * 8;


      const rect = noDateGroup.append("rect")
        .attr("class", "no-date-rect")
        .attr("x", x)
        .attr("y", baseY)
        .attr("width", 15)
        .attr("height", rectHeight)
        .attr("fill", "url(#snownoise-pattern)");


      rect.node().style.setProperty('--float-range', `${FLOAT_RANGE}px`);
      rect.node().style.setProperty('--index', i % 10);
    });

    // 4. data selection note
    noDateGroup.append("text")
      .attr("x", xScale(startDate))
      .attr("y", noDateAreaY - 25)
      .attr("font-size", "9px")
      .attr("fill", "#aaa")
      .text(noDateData.length > MAX_NO_DATE_ITEMS ?
        `No Date (Showing ${MAX_NO_DATE_ITEMS} of ${noDateData.length})` :
        `No Date (${noDateData.length})`);
  }

}
