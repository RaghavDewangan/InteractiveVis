const svg = d3.select("#chart");
const margin = { top: 30, right: 30, bottom: 60, left: 60 };
const width = +svg.attr("width") - margin.left - margin.right;
const height = +svg.attr("height") - margin.top - margin.bottom;
const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

const parseTime = d3.timeParse("%H:%M");
const formatTime = d3.timeFormat("%H:%M");

const x = d3.scaleLinear().range([0, width]);
const y = d3.scaleLinear().range([height, 0]);
const color = d3.scaleOrdinal(d3.schemeCategory10);

let currentData = {};
let currentType = "temp"; // "temp" or "act"
let dataReady = {};

// Load all 4 datasets
Promise.all([
  d3.csv("data/male_temp.csv", d3.autoType),
  d3.csv("data/fem_temp.csv", d3.autoType),
  d3.csv("data/male_act.csv", d3.autoType),
  d3.csv("data/fem_act.csv", d3.autoType)
]).then(([maleTemp, femTemp, maleAct, femAct]) => {
  dataReady = {
    temp: {
      male: transformData(maleTemp),
      female: transformData(femTemp),
    },
    act: {
      male: transformData(maleAct),
      female: transformData(femAct),
    },
  };
  updateChart();
});

function transformData(data) {
  const mice = Object.keys(data[0]);
  return mice.map(mouseID => ({
    id: mouseID,
    values: data.map((row, i) => ({ time: i, value: row[mouseID] }))
  }));
}

function updateChart() {
  g.selectAll("*").remove();

  const maleChecked = document.getElementById("toggleMale").checked;
  const femaleChecked = document.getElementById("toggleFemale").checked;
  const highlight = document.getElementById("highlightMouse").value.trim();
  const tickMode = document.getElementById("tickMode").value;

  let data = [];
  if (maleChecked) data = data.concat(dataReady[currentType].male.map(d => ({ ...d, gender: "male" })));
  if (femaleChecked) data = data.concat(dataReady[currentType].female.map(d => ({ ...d, gender: "female" })));

  // Flatten to get y domain
  const allValues = data.flatMap(d => d.values.map(p => p.value));
  y.domain([d3.min(allValues), d3.max(allValues)]);
  x.domain([0, data[0]?.values.length || 0]);

  const line = d3.line()
    .x(d => x(d.time))
    .y(d => y(d.value))
    .defined(d => d.value !== null && !isNaN(d.value));

  // Axes
  const xAxis = d3.axisBottom(x).ticks(24).tickFormat(d => {
    if (tickMode === "lightDark") {
      return `${d % 24}:00 ${d < 12 ? "L" : "D"}`;
    }
    return `${d}:00`;
  });
  g.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(xAxis);

  g.append("g").call(d3.axisLeft(y));

  // Draw lines
  const mouseLine = g.selectAll(".mouse-line")
    .data(data)
    .join("path")
    .attr("class", "mouse-line")
    .attr("fill", "none")
    .attr("stroke", d => highlight === d.id ? "red" : color(d.id))
    .attr("stroke-width", d => highlight === d.id ? 3 : 1.5)
    .attr("opacity", d => highlight && d.id !== highlight ? 0.2 : 1)
    .attr("d", d => line(d.values))
    .on("mouseover", function (event, d) {
      d3.select(this).attr("stroke-width", 3).attr("stroke", "orange");
      tooltip.style("opacity", 1).html(`Mouse: ${d.id}`);
    })
    .on("mouseout", function (event, d) {
      d3.select(this).attr("stroke-width", d.id === highlight ? 3 : 1.5)
        .attr("stroke", d.id === highlight ? "red" : color(d.id));
      tooltip.style("opacity", 0);
    });

  // Tooltip
  const tooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0)
    .style("position", "absolute")
    .style("background", "lightgray")
    .style("padding", "4px")
    .style("border-radius", "4px");

  svg.on("mousemove", function (event) {
    tooltip.style("left", (event.pageX + 10) + "px")
      .style("top", (event.pageY - 20) + "px");
  });

  // Zoom
  const zoom = d3.zoom()
    .scaleExtent([1, 10])
    .translateExtent([[0, 0], [width, height]])
    .on("zoom", zoomed);

  svg.call(zoom);

  function zoomed(event) {
    const newX = event.transform.rescaleX(x);
    const newXAxis = d3.axisBottom(newX).ticks(24).tickFormat(d => {
      if (tickMode === "lightDark") {
        return `${d % 24}:00 ${d < 12 ? "L" : "D"}`;
      }
      return `${d}:00`;
    });
    g.select("g").call(newXAxis);

    mouseLine.attr("d", d => {
      const zoomedLine = d3.line()
        .x(p => newX(p.time))
        .y(p => y(p.value))
        .defined(p => p.value !== null && !isNaN(p.value));
      return zoomedLine(d.values);
    });
  }
}

// Event listeners
document.getElementById("toggleMale").addEventListener("change", updateChart);
document.getElementById("toggleFemale").addEventListener("change", updateChart);
document.getElementById("dataType").addEventListener("change", function () {
  currentType = this.value;
  updateChart();
});
document.getElementById("highlightMouse").addEventListener("input", updateChart);
document.getElementById("tickMode").addEventListener("change", updateChart);
