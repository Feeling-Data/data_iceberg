let noDateData = [];
let withLocation = [], withoutLocation = [];
let xScale, g, startDate, endDate;
let axisY = 4, rectHeight = 0.6, verticalPadding = 0.2;
let aboveOffsetPadding = 3, belowOffsetPadding = 8;

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
        .attr("stroke", "#FFFC00")
        .attr("stroke-width", 0.6)
        .attr("fill", "none")
        .attr("class", "type-bound");

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

      //collect label info
      typeBoxInfoList.push({
        type,
        anchorX: maxX,
        anchorY: minY,
        animEndTime: Date.now()
      });
    }
  });

  // draw label，in order and avoid overlap
  const MIN_LABEL_SPACING = 10;
  const occupiedLabelYs = [];

  typeBoxInfoList
    .sort((a, b) => a.anchorY - b.anchorY)
    .forEach(({ type, anchorX, anchorY, animEndTime }, index) => {
      const timer = setTimeout(() => {
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
          .delay(1000)
          .duration(600)
          .style("opacity", 0.6)
          .attr("x2", targetX)
          .attr("y2", labelY);

        // add label
        g.append("text")
          .attr("x", targetX + 2)
          .attr("y", labelY + 3)
          .attr("fill", "white")
          .attr("font-size", "10px")
          .attr("text-anchor", "start")
          .style("opacity", 0)
          .text(type)
          .transition()
          .delay(1500)
          .duration(800)
          .style("opacity", 0.8);
      }, Math.max(0, animEndTime - Date.now()) + index * 100);
      labelTimers.push(timer);
    });
}

function updateVisibleData(noseX) {
  if (!xScale || !g || !startDate || !endDate) return;

  clearActiveAnimations();
  g.selectAll("*").remove();


  let from = startDate, to = endDate;
  if (noseX !== null && noseX !== undefined) {
    const percent = 1 - Math.min(Math.max(noseX / videoWidth, 0), 1);
    const windowMonths = 1;
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


  const visibleWith = withLocation
    .filter(d => d.monthObj >= from && d.monthObj <= to)
    .sort((a, b) => a.monthObj - b.monthObj || (a.type1_cluster || "").localeCompare(b.type1_cluster || ""));

  const visibleWithout = withoutLocation
    .filter(d => d.monthObj >= from && d.monthObj <= to)
    .sort((a, b) => a.monthObj - b.monthObj || (a.type1_cluster || "").localeCompare(b.type1_cluster || ""));


  const ABOVE_PADDING = 30;
  const BELOW_PADDING = 30;
  const aboveOffsetMap = {};
  const belowOffsetMap = {};

  function getOffset(monthObj, map) {
    const key = +monthObj;
    map[key] = (map[key] || 0) + 1;
    return map[key] - 1;
  }


  drawClusterRects(
    visibleWith,
    d => axisY - 35 - ABOVE_PADDING - (getOffset(d.monthObj, aboveOffsetMap) + 1) * (rectHeight + verticalPadding),
    "white"
  );

  drawClusterRects(
    visibleWithout,
    d => axisY + 30 + BELOW_PADDING + getOffset(d.monthObj, belowOffsetMap) * (rectHeight + verticalPadding),
    "url(#snownoise-pattern)"
  );
}

