import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// function to load data from CSV file and convert values to numeric
// async function loadData(path) {
//     const data = await d3.csv(path, row => {
//         const parsed = {};
//         for (const key in row) {
//             parsed[key] = +row[key]; // Convert strings to numbers
//         }
//         return parsed;
//     });
//     return data;
// }

async function loadAverageData(path) {
    const data = await d3.csv(path, row => {
        const parsed = {};
        for (const key in row) {
            parsed[key] = +row[key]; // Convert strings to numbers
        }
        return parsed;
    });

    if (data.length === 0) return []; // Handle empty dataset

    // Calculate average for each row
    const rowAverages = data.map(row => {
        const numericValues = Object.values(row).filter(val => !isNaN(val));
        if (numericValues.length === 0) return NaN; // Skip rows with no numbers
        
        const sum = numericValues.reduce((acc, val) => acc + val, 0);
        return sum / numericValues.length;
    });

    return rowAverages.filter(avg => !isNaN(avg)); // Remove NaN results (optional)
}

// function to render the temperature plot
export async function renderTemperaturePlot(path) {
    const width = 1000;
    const height = 500;
    const margin = { top: 20, right: 50, bottom: 40, left: 60 };
    // data of temperatures for 1 female mouse
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

    // const raw = await loadData(path);
    const raw = await loadAverageData(path);
    // console.log(raw);

    // defining scales
    const xScale = d3.scaleLinear()
        .domain([0, raw.length - 1])
        .range([usableArea.left, usableArea.right]);

    // const yExtent = d3.extent(raw, d => d[subject]);
    const yExtent = d3.extent(raw);
    // console.log(yExtent);
    const yScale = d3.scaleLinear()
        .domain([yExtent[0] - 0.2, yExtent[1] + 0.2])
        .range([usableArea.bottom, usableArea.top]);

    // axes
    // const xAxis = d3.axisBottom(xScale)
    //     .ticks(14)
    //     .tickFormat(d => `Day ${Math.floor(d / 1440) + 1}`);
    // t=0 is dark, so day 1 starts at t=720 
    const xAxis = d3.axisBottom(xScale)
    .tickValues(d3.range(720, xScale.domain()[1] + 720, 1440)) // Start at 720, increment by 1440
    .tickFormat(d => `Day ${Math.floor(d / 1440) + 1}`);

    const yAxis = d3.axisLeft(yScale);

    // adding axes to SVG
    svg.append("g")
        .attr("transform", `translate(0,${usableArea.bottom})`)
        .call(xAxis);

    svg.append("g")
        .attr("transform", `translate(${usableArea.left},0)`)
        .call(yAxis);

    //gridlines 
    const gridlines = svg
        .append('g')
        .attr('class', 'gridlines')
        .attr('transform', `translate(${usableArea.left}, 0)`);

    // Create gridlines as an axis with no labels and full-width ticks
    gridlines.call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));

    // style the gridlines
    gridlines.selectAll('line')
        .attr('stroke', '#ccc')
        .attr('stroke-width', 1)
        .attr('opacity', 0.5);

    // adding axis labels
    svg.append("text")
        .attr("transform", `translate(${width / 2},${height})`)
        .style("text-anchor", "middle")
        .text("Time (Days)");
    svg.append("text")
        .attr("transform", `translate(${margin.left / 4},${height / 2}) rotate(-90)`)
        .style("text-anchor", "middle")
        .text("Body Temperature (°C)");


    // generating line
    const line = d3.line()
        .x((d, i) => xScale(i))
        // .y(d => yScale(d[subject]));
        .y(d => yScale(d));

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
    const brushGroup = svg.append("g")
        .attr("class", "brush")
        .call(brush);

    // preselected brushing segments
    const preselectedSegments = [
        { start: 2160, end: 2880 , label: "Light (Estrus)"}, // light (day 2, estrus)
        { start: 2880, end: 3600 , label: "Dark (Estrus)"}, // dark (estrus)
        { start: 2160, end: 3600 , label: "Full-Day (Estrus)"}, // full day (day 2, estrus)
        { start: 5040, end: 5760 , label: "Light (Non-Estrus)"}, // light (day 4, non-estrus)
        { start: 5760, end: 6480 , label: "Dark (Non-Estrus)"}, // dark (non-estrus)
        { start: 5040, end: 6480 , label: "Full-Day (Non-Estrus)"}, // full day (day 4, non-estrus)
    ];

    // 1. Create dropdown menu
    const dropdown = d3.select("#controls") // Add a div with id="controls" to your HTML
    .append("select")
    .attr("id", "preset-brush")
    .on("change", function() {
    const selectedIndex = this.selectedIndex;
    if (selectedIndex > 0) { // Skip the first "Select a period" option
        const segment = preselectedSegments[selectedIndex - 1];
        brushGroup.call(brush.move, [segment.start, segment.end].map(xScale));
        updateStats(segment.start, segment.end);
    }
    });

    // Add default option
    dropdown.append("option")
        .text("Select a period")
        .attr("value", "");

    // Add segment options
    preselectedSegments.forEach((segment, i) => {
        const day = Math.floor(segment.start / 1440) + 1;
        const period = segment.label;
    dropdown.append("option")
        .text(`Day ${day} - ${period}`)
        .attr("value", i);
    });

    // 2. Refactor stats calculation into reusable function
    function updateStats(start, end) {
    const selectedData = raw.slice(Math.floor(start), Math.ceil(end));

    const mean = d3.mean(selectedData);
    const max = d3.max(selectedData);
    const min = d3.min(selectedData);

    d3.select("#stats").html(`Mean: ${mean.toFixed(2)}, Max: ${max.toFixed(2)}, Min: ${min.toFixed(2)}`);
    }

    // 3. Modify your existing brushEnd function to use the updateStats function
    function brushEnd({ selection }) {
    if (!selection) return;
    const [x0, x1] = selection.map(xScale.invert);
    updateStats(x0, x1);

    // Reset dropdown to default when manually brushing
    d3.select("#preset-brush").node().selectedIndex = 0;
    }

    // 4. Optional: Style the dropdown
    d3.select("style").text(`
    #preset-brush {
    margin: 10px;
    padding: 5px;
    font-family: sans-serif;
    }
    `);

    // hover interaction
    svg.selectAll("circle")
        .data(raw.filter((_, i) => i % 100 === 0)) // Show every 100th point for clarity
        .enter()
        .append("circle")
        .attr("cx", (d, i) => xScale(i * 100))
        // .attr("cy", d => yScale(d[subject]))
        .attr("cy", d => yScale(d))
        .attr("r", 4)
        .attr("fill", "red")
        .attr("opacity", 0.7)
        .on("mouseover", (event, d) => {
            d3.select("#hover-info").text(`Value: ${d[subject]}`);
            d3.select(event.currentTarget)
                .transition()
                .duration(200)
                .attr("r", 5)
                .attr("opacity", 1)
                .attr("fill", "red");
        })
        .on("mouseout", (event) => {
            d3.select("#hover-info").text("No point selected");
            d3.select(event.currentTarget)
                .transition()
                .duration(200)
                .attr('r', 4)
                .attr("opacity", 0.7)
                .attr("fill", "red");
        });

    // TODO: add a button that highlights all estrus days
    // TODO: style everything to look pretty 
    // TODO: stronger title
    // TODO: add descriptiona bout data collection ~ t=0 is dark, light/dark flips every 1440 min = 12 hrs 
    
}
