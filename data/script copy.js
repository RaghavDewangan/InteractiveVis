const svg = d3.select("#chart");
const margin = { top: 30, right: 30, bottom: 60, left: 60 };
const width = 1200 - margin.left - margin.right;
const height = 500 - margin.top - margin.bottom;

const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
const x = d3.scaleLinear().range([0, width]);
const y = d3.scaleLinear().range([height, 0]);
const color = d3.scaleOrdinal(d3.schemeCategory10);

let currentType = "temp";
let dataReady = {};

// Load and process the data
Promise.all([
  d3.csv("data/MaleTemp.csv", d3.autoType),
  d3.csv("data/FemTemp.csv", d3.autoType),
  d3.csv("data/MaleAct.csv", d3.autoType),
  d3.csv("data/FemAct.csv", d3.autoType)
]).then(([maleTemp, femTemp, maleAct, femAct]) => {
  // Calculate averages
  dataReady = {
    temp: {
      male: calculateAverage(maleTemp),
      female: calculateAverage(femTemp)
    },
    act: {
      male: calculateAverage(maleAct),
      female: calculateAverage(femAct)
    }
  };
  updateChart();
});

// Function to calculate average of all columns for each row
function calculateAverage(data) {
  if (data.length === 0) return [];
  
  // Calculate average for each row (timepoint)
  const averages = data.map((row, timeIndex) => {
    // Get all values from this row (excluding any non-numeric values)
    const values = Object.entries(row)
      .filter(([key, val]) => !isNaN(val) && key !== "time")
      .map(([key, val]) => val);
    
    if (values.length === 0) return { time: timeIndex, value: NaN };
    
    // Calculate average
    const sum = values.reduce((acc, val) => acc + val, 0);
    const avg = sum / values.length;
    
    return { time: timeIndex, value: avg };
  });
  
  // Return the averages in a format compatible with the visualization
  return [{ 
    id: "average", 
    values: averages.filter(d => !isNaN(d.value))
  }];
}

function updateChart() {
  g.selectAll("*").remove();
  svg.select("defs")?.remove();

  const maleChecked = document.getElementById("toggleMale").checked;
  const femaleChecked = document.getElementById("toggleFemale").checked;
  const tickMode = document.getElementById("tickMode").value;
  const timeRange = document.getElementById("timeRange").value.trim();
  const timeMode = document.getElementById("timeMode").value;

  let data = [];
  if (maleChecked) data = data.concat(dataReady[currentType].male.map(d => ({ ...d, gender: "male" })));
  if (femaleChecked) data = data.concat(dataReady[currentType].female.map(d => ({ ...d, gender: "female" })));

  // Set hard max time limits
  const maxDayTime = 14 * 1440;
  const maxSecTime = 20000;

  let timeStart = 0;
  let timeEnd = timeMode === "sec" ? maxSecTime : maxDayTime;

  if (timeRange && timeRange.includes("-")) {
    const [start, end] = timeRange.split("-").map(d => parseInt(d));
    if (!isNaN(start) && !isNaN(end)) {
      timeStart = Math.max(0, start);
      timeEnd = Math.min(end, timeMode === "sec" ? maxSecTime : maxDayTime);
    }
  }

  // Filter by time range
  const filteredData = data.map(series => ({
    ...series,
    values: series.values.filter(v => v.time >= timeStart && v.time <= timeEnd)
  }));

  // Get min/max for y-axis
  const allValues = filteredData.flatMap(d => d.values.map(p => p.value));
  const yMin = d3.min(allValues);
  const yMax = d3.max(allValues);

  y.domain([Math.floor(yMin), Math.ceil(yMax)]);
  x.domain([timeStart, timeEnd]);

  svg.append("defs").append("clipPath")
    .attr("id", "clip")
    .append("rect")
    .attr("width", width)
    .attr("height", height);

  const lineGroup = g.append("g").attr("clip-path", "url(#clip)");

  // Y-axis with appropriate ticks
  const yTicks = currentType === "act"
    ? d3.range(Math.floor(yMin), Math.ceil(yMax) + 10, 10)
    : d3.range(Math.floor(yMin), Math.ceil(yMax) + 1, 1);
  
  g.append("g")
    .call(d3.axisLeft(y).tickValues(yTicks));

  const line = d3.line()
    .x(d => x(d.time))
    .y(d => y(d.value))
    .defined(d => d.value !== null && !isNaN(d.value));

  // Draw lines
  const mouseLine = lineGroup.selectAll(".mouse-line")
    .data(filteredData)
    .join("path")
    .attr("class", "mouse-line")
    .attr("fill", "none")
    .attr("stroke", d => d.gender === "male" ? "#1f77b4" : "#e377c2")
    .attr("stroke-width", 2.5)
    .attr("opacity", 0.7)
    .attr("d", d => line(d.values));

  // Add tooltip
  const tooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

  // Line hover effects
  mouseLine
    .on("mouseover", function (event, d) {
      d3.select(this).attr("stroke-width", 4).attr("opacity", 1)
      tooltip.style("opacity", 1)
        .html(`${d.gender === "male" ? "Male" : "Female"} Average ${currentType === "temp" ? "Temperature" : "Activity"}`);
    })
    .on("mouseout", function (event, d) {
      d3.select(this)
        .attr("stroke-width", 2.5)
        .attr("stroke", d.gender === "male" ? "#1f77b4" : "#e377c2").attr("opacity", 0.7);
      tooltip.style("opacity", 0);
    });

  svg.on("mousemove", function (event) {
    tooltip.style("left", (event.pageX + 10) + "px")
      .style("top", (event.pageY - 20) + "px");
  });

  // Format X-axis ticks
  const formatTicks = d => {
    if (timeMode === "day") return `Day ${Math.floor(d / 1440) + 1}`;
    if (tickMode === "lightDark") return `${d % 24}:00 ${d % 24 < 12 ? "L" : "D"}`;
    return `${d}`;
  };

  // Add X-axis
  const bottomXAxis = g.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(14).tickFormat(formatTicks))
    .attr("class", "x-axis-bottom");

  // Add axis labels
  g.append("text")
    .attr("x", width / 2)
    .attr("y", height + 40)
    .attr("text-anchor", "middle")
    .text(timeMode === "day" ? "Time (Days)" : "Time (Hours)");

  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", -40)
    .attr("x", -height / 2)
    .attr("text-anchor", "middle")
    .text(currentType === "temp" ? "Average Temperature" : "Average Activity");

  // Add legend
  const legend = g.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${width - 100}, 20)`);

  if (maleChecked) {
    legend.append("line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", 20)
      .attr("y2", 0)
      .attr("stroke", "#1f77b4")
      .attr("stroke-width", 2.5);
    
    legend.append("text")
      .attr("x", 25)
      .attr("y", 4)
      .text("Male Avg");
  }

  if (femaleChecked) {
    legend.append("line")
      .attr("x1", 0)
      .attr("y1", 20)
      .attr("x2", 20)
      .attr("y2", 20)
      .attr("stroke", "#e377c2")
      .attr("stroke-width", 2.5);
    
    legend.append("text")
      .attr("x", 25)
      .attr("y", 24)
      .text("Female Avg");
  }

  // Zoom functionality
  const zoom = d3.zoom()
    .scaleExtent([1, 10])
    .translateExtent([[0, 0], [width, height]])
    .extent([[0, 0], [width, height]])
    .on("zoom", function (event) {
      const newX = event.transform.rescaleX(x);

      // Clamp the zoomed domain
      const [min, max] = newX.domain();
      const domainMax = timeMode === "sec" ? maxSecTime : maxDayTime;

      const clampedX = d3.scaleLinear()
        .domain([
          Math.max(0, min),
          Math.min(domainMax, max)
        ])
        .range(newX.range());

      bottomXAxis.call(d3.axisBottom(clampedX).ticks(14).tickFormat(formatTicks));

      mouseLine.attr("d", d => {
        const zoomedLine = d3.line()
          .x(p => clampedX(p.time))
          .y(p => y(p.value))
          .defined(p => p.value !== null && !isNaN(p.value));
        return zoomedLine(d.values);
      });
    });

  svg.call(zoom);
}

// Event listeners
document.getElementById("toggleMale").addEventListener("change", updateChart);
document.getElementById("toggleFemale").addEventListener("change", updateChart);
document.getElementById("dataType").addEventListener("change", function () {
  currentType = this.value;
  updateChart();
});
document.getElementById("tickMode").addEventListener("change", updateChart);
document.getElementById("timeRange").addEventListener("input", updateChart);
document.getElementById("timeMode").addEventListener("change", updateChart);