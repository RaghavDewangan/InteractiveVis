import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// function to load data from CSV file and convert values to numeric
async function loadData(path) {
    const data = await d3.csv(path, row => {
        const parsed = {};
        for (const key in row) {
            parsed[key] = +row[key]; // Convert strings to numbers
        }
        return parsed;
    });
    return data;
}

// function to render the temperature plot
export async function renderTemperaturePlot(path) {
    const width = 1000;
    const height = 500;
    const margin = { top: 20, right: 30, bottom: 40, left: 40 };
    const subject = "f1";

    // usable area for plotting
    const usableArea = {
        top: margin.top,
        right: width - margin.right,
        bottom: height - margin.bottom,
        left: margin.left,
        width: width - margin.left - margin.right,
        height: height - margin.top - margin.bottom,
    };

    // creating svg container
    const svg = d3.select("#chart")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .style("overflow", "visible");

    const raw = await loadData(path);

    // defining scales
    const xScale = d3.scaleLinear()
        .domain([0, raw.length - 1])
        .range([usableArea.left, usableArea.right]);

    const yExtent = d3.extent(raw, d => d[subject]);
    const yScale = d3.scaleLinear()
        .domain([yExtent[0] - 0.2, yExtent[1] + 0.2])
        .range([usableArea.bottom, usableArea.top]);

    // axes
    const xAxis = d3.axisBottom(xScale)
        .ticks(14)
        .tickFormat(d => `Day ${Math.floor(d / 1440) + 1}`);

    const yAxis = d3.axisLeft(yScale);

    // adding axes to SVG
    svg.append("g")
        .attr("transform", `translate(0,${usableArea.bottom})`)
        .call(xAxis);

    svg.append("g")
        .attr("transform", `translate(${usableArea.left},0)`)
        .call(yAxis);

    // generating line
    const line = d3.line()
        .x((d, i) => xScale(i))
        .y(d => yScale(d[subject]));

    // add line path to SVG
    svg.append("path")
        .datum(raw)
        .attr("fill", "none")
        .attr("stroke", "steelblue")
        .attr("stroke-width", 2)
        .attr("d", line);

    // brush function for selection of portions of data
    const brush = d3.brushX()
        .extent([[usableArea.left, usableArea.top], [usableArea.right, usableArea.bottom]])
        .on("end", brushEnd);

    // add brush to SVG
    svg.append("g")
        .attr("class", "brush")
        .call(brush);

    // function to handle brush selection and calculate statistics
    function brushEnd({ selection }) {
        if (!selection) return;
        const [x0, x1] = selection.map(xScale.invert);
        const selectedData = raw.slice(Math.floor(x0), Math.ceil(x1));

        // mean, max, min for selected data
        const mean = d3.mean(selectedData, d => d[subject]);
        const max = d3.max(selectedData, d => d[subject]);
        const min = d3.min(selectedData, d => d[subject]);

        // display stats
        d3.select("#stats").html(`Mean: ${mean.toFixed(2)}, Max: ${max.toFixed(2)}, Min: ${min.toFixed(2)}`);
    }

    // hover interaction
    svg.selectAll("circle")
        .data(raw.filter((_, i) => i % 100 === 0)) // Show every 100th point for clarity
        .enter()
        .append("circle")
        .attr("cx", (d, i) => xScale(i * 100))
        .attr("cy", d => yScale(d[subject]))
        .attr("r", 4)
        .attr("fill", "red")
        .on("mouseover", (event, d) => {
            d3.select("#hover-info").text(`Value: ${d[subject]}`);
        })
        .on("mouseout", () => {
            d3.select("#hover-info").text("No point selected");
        });
}
