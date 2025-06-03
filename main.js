import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

async function loadAverageData(path) {
    const data = await d3.csv(path, row => {
        const parsed = {};
        for (const key in row) {
            parsed[key] = +row[key];
        }
        return parsed;
    });

    if (data.length === 0) return [];

    const rowAverages = data.map(row => {
        const numericValues = Object.values(row).filter(val => !isNaN(val));
        if (numericValues.length === 0) return NaN;
        const sum = numericValues.reduce((acc, val) => acc + val, 0);
        return sum / numericValues.length;
    });

    return rowAverages.filter(avg => !isNaN(avg));
}

export async function renderTemperaturePlot(path) {
    const width = 1000;
    const height = 500;
    const margin = { top: 20, right: 50, bottom: 40, left: 60 };
    const subject = "f1";

    const usableArea = {
        top: margin.top,
        right: width - margin.right,
        bottom: height - margin.bottom,
        left: margin.left,
        width: width - margin.left - margin.right,
        height: height - margin.top - margin.bottom,
    };

    const svg = d3.select("#chart")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .style("overflow", "visible");

    const raw = await loadAverageData(path);

    const xScale = d3.scaleLinear()
        .domain([0, raw.length - 1])
        .range([usableArea.left, usableArea.right]);

    const yExtent = d3.extent(raw);
    const yScale = d3.scaleLinear()
        .domain([yExtent[0] - 0.2, yExtent[1] + 0.2])
        .range([usableArea.bottom, usableArea.top]);

    const xAxis = d3.axisBottom(xScale)
        .tickValues(d3.range(720, xScale.domain()[1] + 720, 1440))
        .tickFormat(d => `Day ${Math.floor(d / 1440) + 1}`);

    const yAxis = d3.axisLeft(yScale);

    svg.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${usableArea.bottom})`)
        .call(xAxis);

    svg.append("g")
        .attr("transform", `translate(${usableArea.left},0)`)
        .call(yAxis);

    const gridlines = svg
        .append('g')
        .attr('class', 'gridlines')
        .attr('transform', `translate(${usableArea.left}, 0)`);

    gridlines.call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));
    gridlines.selectAll('line')
        .attr('stroke', '#ccc')
        .attr('stroke-width', 1)
        .attr('opacity', 0.5);

    svg.append("text")
        .attr("transform", `translate(${width / 2},${height})`)
        .style("text-anchor", "middle")
        .text("Time (Days)");

    svg.append("text")
        .attr("transform", `translate(${margin.left / 4},${height / 2}) rotate(-90)`)
        .style("text-anchor", "middle")
        .text("Body Temperature (°C)");

    const line = d3.line()
        .x((d, i) => xScale(i))
        .y(d => yScale(d));

    svg.append("path")
        .datum(raw)
        .attr("class", "temp-line")
        .attr("fill", "none")
        .attr("stroke", "steelblue")
        .attr("stroke-width", 2)
        .attr("d", line);

    const brush = d3.brushX()
        .extent([[usableArea.left, usableArea.top], [usableArea.right, usableArea.bottom]])
        .on("end", brushEnd);

    const brushGroup = svg.append("g")
        .attr("class", "brush")
        .call(brush);

    const preselectedSegments = [
        { start: 2160, end: 2880, label: "Light (Estrus)" },
        { start: 2880, end: 3600, label: "Dark (Estrus)" },
        { start: 2160, end: 3600, label: "Full-Day (Estrus)" },
        { start: 5040, end: 5760, label: "Light (Non-Estrus)" },
        { start: 5760, end: 6480, label: "Dark (Non-Estrus)" },
        { start: 5040, end: 6480, label: "Full-Day (Non-Estrus)" },
    ];

    const dropdown = d3.select("#controls")
        .append("select")
        .attr("id", "preset-brush")
        .on("change", function () {
            const selectedIndex = this.selectedIndex;
            if (selectedIndex > 0) {
                const segment = preselectedSegments[selectedIndex - 1];
                const [start, end] = [segment.start, segment.end];

                xScale.domain([start, end]);
                const slicedData = raw.slice(start, end);

                svg.select(".x-axis")
                    .transition().duration(500)
                    .call(xAxis.scale(xScale));

                svg.select(".temp-line")
                    .datum(slicedData)
                    .transition().duration(500)
                    .attr("d", line);

                svg.selectAll("circle").remove();
                svg.selectAll("circle")
                    .data(slicedData.map((d, i) => ({ val: d, idx: i + start })))
                    .enter()
                    .append("circle")
                    .attr("cx", d => xScale(d.idx))
                    .attr("cy", d => yScale(d.val))
                    .attr("r", 4)
                    .attr("fill", "red")
                    .attr("opacity", 0.7)
                    .on("mouseover", function (event, d) {
                        d3.select(this)
                            .transition().duration(200)
                            .attr("r", 6)
                            .attr("opacity", 1);
                        tooltip.transition().duration(200).style("opacity", 1);
                        tooltip.html(`Value: ${d.val.toFixed(2)}`);
                    })
                    .on("mousemove", function (event) {
                        tooltip.style("left", (event.pageX + 10) + "px")
                            .style("top", (event.pageY - 20) + "px");
                    })
                    .on("mouseout", function () {
                        d3.select(this).transition().duration(200)
                            .attr("r", 4).attr("opacity", 0.7);
                        tooltip.transition().duration(200).style("opacity", 0);
                    });

                updateStats(start, end);
            } else {
                resetZoom();
            }
        });

    dropdown.append("option").text("Select a period").attr("value", "");

    preselectedSegments.forEach((segment, i) => {
        const day = Math.floor(segment.start / 1440) + 1;
        const period = segment.label;
        dropdown.append("option")
            .text(`Day ${day} - ${period}`)
            .attr("value", i);
    });

    function updateStats(start, end) {
        const selectedData = raw.slice(Math.floor(start), Math.ceil(end));
        const mean = d3.mean(selectedData);
        const max = d3.max(selectedData);
        const min = d3.min(selectedData);
        d3.select("#stats").html(`Mean: ${mean.toFixed(2)}, Max: ${max.toFixed(2)}, Min: ${min.toFixed(2)}`);
    }

    function brushEnd({ selection }) {
        if (!selection) return;
        const [x0, x1] = selection.map(xScale.invert);
        updateStats(x0, x1);
        d3.select("#preset-brush").node().selectedIndex = 0;
    }

    function resetZoom() {
        xScale.domain([0, raw.length - 1]);

        svg.select(".x-axis")
            .transition().duration(500)
            .call(xAxis.scale(xScale));

        svg.select(".temp-line")
            .datum(raw)
            .transition().duration(500)
            .attr("d", line);

        svg.selectAll("circle").remove();
        svg.selectAll("circle")
            .data(raw.filter((_, i) => i % 100 === 0).map((d, i) => ({ val: d, idx: i * 100 })))
            .enter()
            .append("circle")
            .attr("cx", d => xScale(d.idx))
            .attr("cy", d => yScale(d.val))
            .attr("r", 4)
            .attr("fill", "red")
            .attr("opacity", 0.7)
            .on("mouseover", function (event, d) {
                d3.select(this).transition().duration(200).attr("r", 6).attr("opacity", 1);
                tooltip.transition().duration(200).style("opacity", 1);
                tooltip.html(`Value: ${d.val.toFixed(2)}`);
            })
            .on("mousemove", function (event) {
                tooltip.style("left", (event.pageX + 10) + "px").style("top", (event.pageY - 20) + "px");
            })
            .on("mouseout", function () {
                d3.select(this).transition().duration(200).attr("r", 4).attr("opacity", 0.7);
                tooltip.transition().duration(200).style("opacity", 0);
            });
    }

    d3.select("style").text(`
        #preset-brush {
            margin: 10px;
            padding: 5px;
            font-family: sans-serif;
        }
    `);

    const tooltip = d3.select("#tooltip");

    svg.selectAll("circle")
        .data(raw.filter((_, i) => i % 100 === 0).map((d, i) => ({ val: d, idx: i * 100 })))
        .enter()
        .append("circle")
        .attr("cx", d => xScale(d.idx))
        .attr("cy", d => yScale(d.val))
        .attr("r", 4)
        .attr("fill", "red")
        .attr("opacity", 0.7)
        .on("mouseover", function (event, d) {
            d3.select(this).transition().duration(200).attr("r", 6).attr("opacity", 1);
            tooltip.transition().duration(200).style("opacity", 1);
            tooltip.html(`Value: ${d.val.toFixed(2)}`);
        })
        .on("mousemove", function (event) {
            tooltip.style("left", (event.pageX + 10) + "px").style("top", (event.pageY - 20) + "px");
        })
        .on("mouseout", function () {
            d3.select(this).transition().duration(200).attr("r", 4).attr("opacity", 0.7);
            tooltip.transition().duration(200).style("opacity", 0);
        });
}
