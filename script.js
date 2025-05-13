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

Promise.all([
  d3.csv("data/MaleTemp.csv", d3.autoType),
  d3.csv("data/FemTemp.csv", d3.autoType),
  d3.csv("data/MaleAct.csv", d3.autoType),
  d3.csv("data/FemAct.csv", d3.autoType)
]).then(([maleTemp, femTemp, maleAct, femAct]) => {
  dataReady = {
    temp: {
      male: transformData(maleTemp),
      female: transformData(femTemp)
    },
    act: {
      male: transformData(maleAct),
      female: transformData(femAct)
    }
  };
  updateChart();
});

function transformData(data) {
  const keys = Object.keys(data[0]);
  return keys.map(id => ({
    id: id,
    values: data.map((row, i) => ({ time: i, value: row[id] }))
  }));
}

function updateChart() {
  g.selectAll("*").remove();
  svg.select("defs")?.remove();

  const maleChecked = document.getElementById("toggleMale").checked;
  const femaleChecked = document.getElementById("toggleFemale").checked;
  const highlight = document.getElementById("highlightMouse").value.trim();
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

  const filteredData = data.map(mouse => ({
    ...mouse,
    values: mouse.values.filter(v => v.time >= timeStart && v.time <= timeEnd)
  }));

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

  const yTicks = currentType === "act"
    ? d3.range(Math.floor(yMin), Math.ceil(yMax) + 10, 10)
    : d3.range(Math.floor(yMin), Math.ceil(yMax) + 1, 1);
  g.append("g").call(d3.axisLeft(y).tickValues(yTicks));

  const line = d3.line()
    .x(d => x(d.time))
    .y(d => y(d.value))
    .defined(d => d.value !== null && !isNaN(d.value));

  const bothSelected = maleChecked && femaleChecked;

  const mouseLine = lineGroup.selectAll(".mouse-line")
    .data(filteredData)
    .join("path")
    .attr("class", "mouse-line")
    .attr("fill", "none")
    .attr("stroke", d => {
      if (highlight === d.id) return "red";
      if (bothSelected) {
        return d.gender === "male" ? "#1f77b4" : "#e377c2";
      }
      return color(d.id);
    })
    .attr("stroke-width", d => highlight === d.id ? 3 : 1.5)
    .attr("opacity", d => highlight && d.id !== highlight ? 0.2 : 1)
    .attr("d", d => line(d.values))
    .on("mouseover", function (event, d) {
      d3.select(this).attr("stroke-width", 3).attr("stroke", "orange");
      tooltip.style("opacity", 1).html(`Mouse: ${d.id}`);
    })
    .on("mouseout", function (event, d) {
      d3.select(this)
        .attr("stroke-width", d.id === highlight ? 3 : 1.5)
        .attr("stroke", d => {
          if (highlight === d.id) return "red";
          if (bothSelected) return d.gender === "male" ? "#1f77b4" : "#e377c2";
          return color(d.id);
        });
      tooltip.style("opacity", 0);
    });

  const tooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

  svg.on("mousemove", function (event) {
    tooltip.style("left", (event.pageX + 10) + "px")
      .style("top", (event.pageY - 20) + "px");
  });

  const formatTicks = d => {
    if (timeMode === "day") return `Day ${Math.floor(d / 1440) + 1}`;
    if (tickMode === "lightDark") return `${d % 24}:00 ${d % 24 < 12 ? "L" : "D"}`;
    return `${d}`;
  };

  const bottomXAxis = g.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(14).tickFormat(formatTicks))
    .attr("class", "x-axis-bottom");

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

document.getElementById("toggleMale").addEventListener("change", updateChart);
document.getElementById("toggleFemale").addEventListener("change", updateChart);
document.getElementById("dataType").addEventListener("change", function () {
  currentType = this.value;
  updateChart();
});
document.getElementById("highlightMouse").addEventListener("input", updateChart);
document.getElementById("tickMode").addEventListener("change", updateChart);
document.getElementById("timeRange").addEventListener("input", updateChart);
document.getElementById("timeMode").addEventListener("change", updateChart);

/*const svg = d3.select("#chart");
const margin = { top: 30, right: 30, bottom: 60, left: 60 };
const width = 1200 - margin.left - margin.right;
const height = 500 - margin.top - margin.bottom;

const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

const x = d3.scaleLinear().range([0, width]);
const y = d3.scaleLinear().range([height, 0]);

const color = d3.scaleOrdinal(d3.schemeCategory10);

let currentType = "temp";
let dataReady = {};

Promise.all([
  d3.csv("data/MaleTemp.csv", d3.autoType),
  d3.csv("data/FemTemp.csv", d3.autoType),
  d3.csv("data/MaleAct.csv", d3.autoType),
  d3.csv("data/FemAct.csv", d3.autoType)
]).then(([maleTemp, femTemp, maleAct, femAct]) => {
  dataReady = {
    temp: {
      male: transformData(maleTemp),
      female: transformData(femTemp)
    },
    act: {
      male: transformData(maleAct),
      female: transformData(femAct)
    }
  };
  updateChart();
});

function transformData(data) {
  const keys = Object.keys(data[0]);
  return keys.map(id => ({
    id: id,
    values: data.map((row, i) => ({ time: i, value: row[id] }))
  }));
}

function updateChart() {
  g.selectAll("*").remove();
  svg.select("defs")?.remove();

  const maleChecked = document.getElementById("toggleMale").checked;
  const femaleChecked = document.getElementById("toggleFemale").checked;
  const highlight = document.getElementById("highlightMouse").value.trim();
  const tickMode = document.getElementById("tickMode").value;
  const timeRange = document.getElementById("timeRange").value.trim();
  const timeMode = document.getElementById("timeMode").value; // Get time mode (day or sec)

  let data = [];
  if (maleChecked) data = data.concat(dataReady[currentType].male.map(d => ({ ...d, gender: "male" })));
  if (femaleChecked) data = data.concat(dataReady[currentType].female.map(d => ({ ...d, gender: "female" })));

  let timeStart = 0;
  let timeEnd = data[0]?.values.length || 0;

  if (timeRange && timeRange.includes("-")) {
    const [start, end] = timeRange.split("-").map(d => parseInt(d));
    if (!isNaN(start) && !isNaN(end)) {
      timeStart = start;
      timeEnd = end;
    }
  }

  const filteredData = data.map(mouse => ({
    ...mouse,
    values: mouse.values.filter(v => v.time >= timeStart && v.time <= timeEnd)
  }));

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

  const yTicks = currentType === "act"
    ? d3.range(Math.floor(yMin), Math.ceil(yMax) + 10, 10)
    : d3.range(Math.floor(yMin), Math.ceil(yMax) + 1, 1);
  g.append("g").call(d3.axisLeft(y).tickValues(yTicks));

  const line = d3.line()
    .x(d => x(d.time))
    .y(d => y(d.value))
    .defined(d => d.value !== null && !isNaN(d.value));

  const bothSelected = maleChecked && femaleChecked;

  const mouseLine = lineGroup.selectAll(".mouse-line")
    .data(filteredData)
    .join("path")
    .attr("class", "mouse-line")
    .attr("fill", "none")
    .attr("stroke", d => {
      if (highlight === d.id) return "red";
      if (bothSelected) {
        return d.gender === "male" ? "#1f77b4" : "#e377c2";
      }
      return color(d.id);
    })
    .attr("stroke-width", d => highlight === d.id ? 3 : 1.5)
    .attr("opacity", d => highlight && d.id !== highlight ? 0.2 : 1)
    .attr("d", d => line(d.values))
    .on("mouseover", function (event, d) {
      d3.select(this).attr("stroke-width", 3).attr("stroke", "orange");
      tooltip.style("opacity", 1).html(`Mouse: ${d.id}`);
    })
    .on("mouseout", function (event, d) {
      d3.select(this)
        .attr("stroke-width", d.id === highlight ? 3 : 1.5)
        .attr("stroke", d => {
          if (highlight === d.id) return "red";
          if (bothSelected) return d.gender === "male" ? "#1f77b4" : "#e377c2";
          return color(d.id);
        });
      tooltip.style("opacity", 0);
    });

  const tooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

  svg.on("mousemove", function (event) {
    tooltip.style("left", (event.pageX + 10) + "px")
      .style("top", (event.pageY - 20) + "px");
  });

  const xAxis = d3.axisBottom(x).ticks(14).tickFormat(d => {
    if (timeMode === "day") {
      return `Day ${Math.floor(d / 1440) + 1}`; // Show Day 1, Day 2, ...
    }
    if (tickMode === "lightDark") {
      return `${d % 24}:00 ${d % 24 < 12 ? "L" : "D"}`;
    }
    return `${d}:00`;
  });

  // Remove the top X-axis
  g.selectAll(".x-axis-top").remove();

  // Bottom X-axis with zoom functionality
  const bottomXAxis = g.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(xAxis)
    .attr("class", "x-axis-bottom");

  const zoom = d3.zoom()
    .scaleExtent([1, 10])
    .translateExtent([[0, 0], [width, height]])
    .on("zoom", function (event) {
      const newX = event.transform.rescaleX(x);
      bottomXAxis.call(d3.axisBottom(newX).ticks(14).tickFormat(d => {
        if (timeMode === "day") {
          return `Day ${Math.floor(d / 1440) + 1}`;
        }
        if (tickMode === "lightDark") {
          return `${d % 24}:00 ${d % 24 < 12 ? "L" : "D"}`;
        }
        return `${d}:00`;
      }));

      mouseLine.attr("d", d => {
        const zoomedLine = d3.line()
          .x(p => newX(p.time))
          .y(p => y(p.value))
          .defined(p => p.value !== null && !isNaN(p.value));
        return zoomedLine(d.values);
      });
    });

  svg.call(zoom);

  // Adjust the time scale based on selected mode (Day vs. Seconds)
  if (timeMode === "day") {
    const daysInMinutes = 1440;
    x.domain([0, 14 * daysInMinutes]); // 14 days with 1440 minutes per day
  } else if (timeMode === "sec") {
    const secondsPerMinute = 60;
    const daysInMinutes = 1440;
    x.domain([0, 14 * daysInMinutes * secondsPerMinute]); // 14 days with 60 seconds per minute
  }
}

document.getElementById("toggleMale").addEventListener("change", updateChart);
document.getElementById("toggleFemale").addEventListener("change", updateChart);
document.getElementById("dataType").addEventListener("change", function () {
  currentType = this.value;
  updateChart();
});
document.getElementById("highlightMouse").addEventListener("input", updateChart);
document.getElementById("tickMode").addEventListener("change", updateChart);
document.getElementById("timeRange").addEventListener("input", updateChart);
document.getElementById("timeMode").addEventListener("change", updateChart);
*/
/*const svg = d3.select("#chart");
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
  d3.csv("data/FemAct.csv", d3.autoType),
  d3.csv("data/FemTemp.csv", d3.autoType),
  d3.csv("data/MaleAct.csv", d3.autoType),
  d3.csv("data/FemAct.csv", d3.autoType)
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
document.getElementById("tickMode").addEventListener("change", updateChart);*/

// V2
/*
const svg = d3.select("#chart");
const margin = { top: 30, right: 30, bottom: 60, left: 60 };
const width = +svg.attr("width") - margin.left - margin.right;
const height = +svg.attr("height") - margin.top - margin.bottom;
const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

const x = d3.scaleLinear().range([0, width]);
const y = d3.scaleLinear().range([height, 0]);
const color = d3.scaleOrdinal(d3.schemeCategory10);

let currentData = {};
let currentType = "temp"; // "temp" or "act"
let dataReady = {};

Promise.all([
  d3.csv("data/MaleTemp.csv", d3.autoType),
  d3.csv("data/FemTemp.csv", d3.autoType),
  d3.csv("data/MaleAct.csv", d3.autoType),
  d3.csv("data/FemAct.csv", d3.autoType),
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
  const maxLinesPerGender = 5;

  function limit(dataGroup) {
    if (highlight) return dataGroup;
    return dataGroup.slice(0, maxLinesPerGender);
  }

  if (maleChecked) {
    data = data.concat(limit(dataReady[currentType].male.map(d => ({ ...d, gender: "male" }))));
  }
  if (femaleChecked) {
    data = data.concat(limit(dataReady[currentType].female.map(d => ({ ...d, gender: "female" }))));
  }

  if (data.length === 0) return;

  const allValues = data.flatMap(d => d.values.map(p => p.value));
  y.domain([d3.min(allValues), d3.max(allValues)]);
  x.domain([0, data[0].values.length]);

  // Light/Dark background shading
  if (tickMode === "lightDark") {
    for (let hour = 0; hour < 48; hour += 12) {
      g.append("rect")
        .attr("x", x(hour))
        .attr("y", 0)
        .attr("width", x(hour + 12) - x(hour))
        .attr("height", height)
        .attr("fill", hour % 24 < 12 ? "#f5f5f5" : "#e0e0e0")
        .lower();
    }
  }

  const line = d3.line()
    .x(d => x(d.time))
    .y(d => y(d.value))
    .defined(d => d.value !== null && !isNaN(d.value));

  // Axes
  const xAxis = d3.axisBottom(x).ticks(24).tickFormat(d => {
    if (tickMode === "lightDark") {
      return `${d % 24}:00 ${d % 24 < 12 ? "L" : "D"}`;
    }
    return `${d}:00`;
  });

  g.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${height})`)
    .call(xAxis);

  g.append("g").call(d3.axisLeft(y));

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
      d3.select(this)
        .attr("stroke-width", d.id === highlight ? 3 : 1.5)
        .attr("stroke", d.id === highlight ? "red" : color(d.id));
      tooltip.style("opacity", 0);
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
        return `${d % 24}:00 ${d % 24 < 12 ? "L" : "D"}`;
      }
      return `${d}:00`;
    });
    g.select(".x-axis").call(newXAxis);

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
document.getElementById("tickMode").addEventListener("change", updateChart);*/

//V3
/*
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

Promise.all([
  d3.csv("data/MaleTemp.csv", d3.autoType),
  d3.csv("data/FemTemp.csv", d3.autoType),
  d3.csv("data/MaleAct.csv", d3.autoType),
  d3.csv("data/FemAct.csv", d3.autoType)
]).then(([maleTemp, femTemp, maleAct, femAct]) => {
  dataReady = {
    temp: {
      male: transformData(maleTemp),
      female: transformData(femTemp)
    },
    act: {
      male: transformData(maleAct),
      female: transformData(femAct)
    }
  };
  updateChart();
});

function transformData(data) {
  const keys = Object.keys(data[0]);
  return keys.map(id => ({
    id: id,
    values: data.map((row, i) => ({ time: i, value: row[id] }))
  }));
}

function updateChart() {
  g.selectAll("*").remove();
  svg.select("defs")?.remove();

  const maleChecked = document.getElementById("toggleMale").checked;
  const femaleChecked = document.getElementById("toggleFemale").checked;
  const highlight = document.getElementById("highlightMouse").value.trim();
  const tickMode = document.getElementById("tickMode").value;
  const timeRange = document.getElementById("timeRange").value.trim();

  let data = [];
  if (maleChecked) data = data.concat(dataReady[currentType].male.map(d => ({ ...d, gender: "male" })));
  if (femaleChecked) data = data.concat(dataReady[currentType].female.map(d => ({ ...d, gender: "female" })));

  let timeStart = 0;
  let timeEnd = data[0]?.values.length || 0;

  if (timeRange && timeRange.includes("-")) {
    const [start, end] = timeRange.split("-").map(d => parseInt(d));
    if (!isNaN(start) && !isNaN(end)) {
      timeStart = start;
      timeEnd = end;
    }
  }

  const filteredData = data.map(mouse => ({
    ...mouse,
    values: mouse.values.filter(v => v.time >= timeStart && v.time <= timeEnd)
  }));

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

  const yTicks = currentType === "act"
    ? d3.range(Math.floor(yMin), Math.ceil(yMax) + 10, 10)
    : d3.range(Math.floor(yMin), Math.ceil(yMax) + 1, 1);
  g.append("g").call(d3.axisLeft(y).tickValues(yTicks));

  const line = d3.line()
    .x(d => x(d.time))
    .y(d => y(d.value))
    .defined(d => d.value !== null && !isNaN(d.value));

  const bothSelected = maleChecked && femaleChecked;

  const mouseLine = lineGroup.selectAll(".mouse-line")
    .data(filteredData)
    .join("path")
    .attr("class", "mouse-line")
    .attr("fill", "none")
    .attr("stroke", d => {
      if (highlight === d.id) return "red";
      if (bothSelected) {
        return d.gender === "male" ? "#1f77b4" : "#e377c2";
      }
      return color(d.id);
    })
    .attr("stroke-width", d => highlight === d.id ? 3 : 1.5)
    .attr("opacity", d => highlight && d.id !== highlight ? 0.2 : 1)
    .attr("d", d => line(d.values))
    .on("mouseover", function (event, d) {
      d3.select(this).attr("stroke-width", 3).attr("stroke", "orange");
      tooltip.style("opacity", 1).html(`Mouse: ${d.id}`);
    })
    .on("mouseout", function (event, d) {
      d3.select(this)
        .attr("stroke-width", d.id === highlight ? 3 : 1.5)
        .attr("stroke", d => {
          if (highlight === d.id) return "red";
          if (bothSelected) return d.gender === "male" ? "#1f77b4" : "#e377c2";
          return color(d.id);
        });
      tooltip.style("opacity", 0);
    });

  const tooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

  svg.on("mousemove", function (event) {
    tooltip.style("left", (event.pageX + 10) + "px")
      .style("top", (event.pageY - 20) + "px");
  });

  const xAxis = d3.axisBottom(x).ticks(24).tickFormat(d => {
    if (tickMode === "lightDark") {
      return `${d % 24}:00 ${d % 24 < 12 ? "L" : "D"}`;
    }
    return `${d}:00`;
  });

  g.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(xAxis);

  const zoom = d3.zoom()
    .scaleExtent([1, 10])
    .translateExtent([[0, 0], [width, height]])
    .on("zoom", function (event) {
      const newX = event.transform.rescaleX(x);
      g.select("g").call(d3.axisBottom(newX).ticks(24).tickFormat(d => {
        if (tickMode === "lightDark") {
          return `${d % 24}:00 ${d % 24 < 12 ? "L" : "D"}`;
        }
        return `${d}:00`;
      }));

      mouseLine.attr("d", d => {
        const zoomedLine = d3.line()
          .x(p => newX(p.time))
          .y(p => y(p.value))
          .defined(p => p.value !== null && !isNaN(p.value));
        return zoomedLine(d.values);
      });
    });

  svg.call(zoom);
}

document.getElementById("toggleMale").addEventListener("change", updateChart);
document.getElementById("toggleFemale").addEventListener("change", updateChart);
document.getElementById("dataType").addEventListener("change", function () {
  currentType = this.value;
  updateChart();
});
document.getElementById("highlightMouse").addEventListener("input", updateChart);
document.getElementById("tickMode").addEventListener("change", updateChart);
document.getElementById("timeRange").addEventListener("input", updateChart);*/

/*const svg = d3.select("#chart");
const margin = { top: 30, right: 30, bottom: 60, left: 60 };
const width = 1200 - margin.left - margin.right;
const height = 500 - margin.top - margin.bottom;

const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

const x = d3.scaleLinear().range([0, width]);
const y = d3.scaleLinear().range([height, 0]);

const color = d3.scaleOrdinal(d3.schemeCategory10);

let currentType = "temp";
let dataReady = {};
let timeUnit = "seconds";  // new variable to track time unit (day or second)

Promise.all([
  d3.csv("data/MaleTemp.csv", d3.autoType),
  d3.csv("data/FemTemp.csv", d3.autoType),
  d3.csv("data/MaleAct.csv", d3.autoType),
  d3.csv("data/FemAct.csv", d3.autoType)
]).then(([maleTemp, femTemp, maleAct, femAct]) => {
  dataReady = {
    temp: {
      male: transformData(maleTemp),
      female: transformData(femTemp)
    },
    act: {
      male: transformData(maleAct),
      female: transformData(femAct)
    }
  };
  updateChart();
});

function transformData(data) {
  const keys = Object.keys(data[0]);
  return keys.map(id => ({
    id: id,
    values: data.map((row, i) => ({ time: i, value: row[id] }))
  }));
}

function updateChart() {
  g.selectAll("*").remove();
  svg.select("defs")?.remove();

  const maleChecked = document.getElementById("toggleMale").checked;
  const femaleChecked = document.getElementById("toggleFemale").checked;
  const highlight = document.getElementById("highlightMouse").value.trim();
  const tickMode = document.getElementById("tickMode").value;
  const timeRange = document.getElementById("timeRange").value.trim();

  let data = [];
  if (maleChecked) data = data.concat(dataReady[currentType].male.map(d => ({ ...d, gender: "male" })));
  if (femaleChecked) data = data.concat(dataReady[currentType].female.map(d => ({ ...d, gender: "female" })));

  let timeStart = 0;
  let timeEnd = data[0]?.values.length || 0;

  if (timeRange && timeRange.includes("-")) {
    const [start, end] = timeRange.split("-").map(d => parseInt(d));
    if (!isNaN(start) && !isNaN(end)) {
      timeStart = start;
      timeEnd = end;
    }
  }

  const filteredData = data.map(mouse => ({
    ...mouse,
    values: mouse.values.filter(v => v.time >= timeStart && v.time <= timeEnd)
  }));

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

  const yTicks = currentType === "act"
    ? d3.range(Math.floor(yMin), Math.ceil(yMax) + 10, 10)
    : d3.range(Math.floor(yMin), Math.ceil(yMax) + 1, 1);
  g.append("g").call(d3.axisLeft(y).tickValues(yTicks));

  const line = d3.line()
    .x(d => x(d.time))
    .y(d => y(d.value))
    .defined(d => d.value !== null && !isNaN(d.value));

  const bothSelected = maleChecked && femaleChecked;

  const mouseLine = lineGroup.selectAll(".mouse-line")
    .data(filteredData)
    .join("path")
    .attr("class", "mouse-line")
    .attr("fill", "none")
    .attr("stroke", d => {
      if (highlight === d.id) return "red";
      if (bothSelected) {
        return d.gender === "male" ? "#1f77b4" : "#e377c2";
      }
      return color(d.id);
    })
    .attr("stroke-width", d => highlight === d.id ? 3 : 1.5)
    .attr("opacity", d => highlight && d.id !== highlight ? 0.2 : 1)
    .attr("d", d => line(d.values))
    .on("mouseover", function (event, d) {
      d3.select(this).attr("stroke-width", 3).attr("stroke", "orange");
      tooltip.style("opacity", 1).html(`Mouse: ${d.id}`);
    })
    .on("mouseout", function (event, d) {
      d3.select(this)
        .attr("stroke-width", d.id === highlight ? 3 : 1.5)
        .attr("stroke", d => {
          if (highlight === d.id) return "red";
          if (bothSelected) return d.gender === "male" ? "#1f77b4" : "#e377c2";
          return color(d.id);
        });
      tooltip.style("opacity", 0);
    });

  const tooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

  svg.on("mousemove", function (event) {
    tooltip.style("left", (event.pageX + 10) + "px")
      .style("top", (event.pageY - 20) + "px");
  });

  // Update the x-axis based on time unit
  const xAxis = d3.axisBottom(x).ticks(timeUnit === "seconds" ? 24 : (timeEnd - timeStart) / 24)
    .tickFormat(d => {
      if (tickMode === "lightDark") {
        return `${d % 24}:00 ${d % 24 < 12 ? "L" : "D"}`;
      }
      return timeUnit === "seconds" ? `${d}:00` : `${Math.floor(d / 24)} Day ${d % 24}:00`;
    });

  g.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(xAxis);

  const zoom = d3.zoom()
    .scaleExtent([1, 10])
    .translateExtent([[0, 0], [width, height]])
    .on("zoom", function (event) {
      const newX = event.transform.rescaleX(x);
      g.select("g").call(d3.axisBottom(newX).ticks(24).tickFormat(d => {
        if (tickMode === "lightDark") {
          return `${d % 24}:00 ${d % 24 < 12 ? "L" : "D"}`;
        }
        return timeUnit === "seconds" ? `${d}:00` : `${Math.floor(d / 24)} Day ${d % 24}:00`;
      }));

      mouseLine.attr("d", d => {
        const zoomedLine = d3.line()
          .x(p => newX(p.time))
          .y(p => y(p.value))
          .defined(p => p.value !== null && !isNaN(p.value));
        return zoomedLine(d.values);
      });
    });

  svg.call(zoom);
}

document.getElementById("toggleMale").addEventListener("change", updateChart);
document.getElementById("toggleFemale").addEventListener("change", updateChart);
document.getElementById("dataType").addEventListener("change", function () {
  currentType = this.value;
  updateChart();
});
document.getElementById("highlightMouse").addEventListener("input", updateChart);
document.getElementById("tickMode").addEventListener("change", updateChart);
document.getElementById("timeRange").addEventListener("input", updateChart);

// New event listener to handle time unit changes (day or second)
document.getElementById("timeUnit").addEventListener("change", function () {
  timeUnit = this.value;
  updateChart();
});*/







