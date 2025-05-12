import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

async function loadData(path) {
    const data = await d3.csv(path, row => {
      const parsed = {};
      for (const key in row) {
        parsed[key] = +row[key]; // Convert string to number
      }
      return parsed;
    });
    //console.log(data);
    return data;
}

export async function renderTemperaturePlot(path) {
    const width = 1000;
    const height = 500;
    const margin = { top: 20, right: 30, bottom: 40, left: 40 };
    const subject = "f1"; // from x to end (subject is the slice of column we want)

    const usableArea = {
        top: margin.top,
        right: width - margin.right,
        bottom: height - margin.bottom,
        left: margin.left,
        width: width - margin.left - margin.right,
        height: height - margin.top - margin.bottom,
    };

    const svg = d3
    .select("#chart")
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("overflow", "visible");

    const raw = await loadData(path);

    const xScale = d3.scaleLinear()
    .domain([0, raw.length - 1])
    .range([usableArea.left, usableArea.right]);

    const yExtent = d3.extent(raw, d => d[subject]);
    
    const yScale = d3.scaleLinear()
    .domain([yExtent[0] - 0.2, yExtent[1] + 0.2])
    .range([usableArea.bottom, usableArea.top]);

    const xAxis = d3.axisBottom(xScale)
    .ticks(14)
    .tickFormat(d => `Day ${Math.floor(d / 1440) + 1}`);
    const yAxis = d3.axisLeft(yScale); // default tick for every day

    svg.append("g")
    .attr("transform", `translate(0,${usableArea.bottom})`)
    .call(xAxis);

    svg.append("g")
    .attr("transform", `translate(${usableArea.left},0)`)
    .call(yAxis);

    const line = d3.line()
    .x((d, i) => xScale(i))
    .y(d => yScale(d[subject]));

    svg.append("path")
    .datum(raw)
    .attr("fill", "none")
    .attr("stroke", "steelblue")
    .attr("stroke-width", 2)
    .attr("d", line);

    svg.append("text")
        .attr("x", usableArea.left)
        .attr("y", margin.top - 5)
        .attr("font-weight", "bold")
        .text(`Temperature Plot: ${subject.toUpperCase()}`);
}
