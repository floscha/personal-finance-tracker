// Set up dimensions (with padding for visibility)
const margin = {top: 10, right: 60, bottom: 35, left: 60};
const width = 1340 - margin.left - margin.right;
const height = 100 - margin.top - margin.bottom;

// Create SVG
const svg = d3.select("#chart")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

// Set up scales
const x0 = d3.scaleBand()
    .domain(data.map(d => d.month))
    .range([0, width])
    .padding(0.3);

// Create a scale for brush snapping (pixel positions between each month)
// These represent the edges between months, not the centers
const monthPositions = data.map((d, i) => ({
    month: d.month,
    x: x0(d.month) + x0.bandwidth() / 2,
    index: i
}));

// Create edge positions between months for brush snapping
const edgePositions = [];
for (let i = 0; i <= data.length; i++) {
    if (i === 0) {
        // Left edge: before first month (left side of first bar)
        edgePositions.push({
            x: x0(data[0].month),
            index: -1, // Before first month
            leftMonth: -1,
            rightMonth: 0
        });
    } else if (i === data.length) {
        // Right edge: after last month (right side of last bar)
        edgePositions.push({
            x: x0(data[data.length - 1].month) + x0.bandwidth(),
            index: data.length - 1, // After last month
            leftMonth: data.length - 1,
            rightMonth: data.length
        });
    } else {
        // Edge between month i-1 and month i (between two bars)
        const prevBarRight = x0(data[i - 1].month) + x0.bandwidth();
        const currBarLeft = x0(data[i].month);
        edgePositions.push({
            x: (prevBarRight + currBarLeft) / 2, // Center of gap
            index: i - 1, // For compatibility
            leftMonth: i - 1,
            rightMonth: i
        });
    }
}

// Calculate global max across income and absolute expenses for consistent scale
const maxIncome = d3.max(data, d => d.income);
const maxExpense = d3.max(data, d => Math.abs(d.expenses)); // Use absolute values

// Use the same scale for both series (starting from 0)
const globalMax = Math.max(maxIncome, maxExpense);

const yScale = d3.scaleLinear()
    .domain([0, globalMax * 1.1])
    .range([height, 0]);

// Format function for thousands
const formatThousands = (value) => {
    return (value / 1000).toFixed(0) + 'k';
};

// Add grid (3 dynamic ticks fitting the data)
// Compute a small set of "nice" tick positions that fit the current y domain
const yMax = yScale.domain()[1];
const yTicks = d3.ticks(0, yMax, 3);
svg.append("g")
    .attr("class", "grid")
    .call(d3.axisLeft(yScale)
        .tickValues(yTicks)
        .tickSize(-width)
        .tickFormat("")
    );

// Add bars for expenses first (as positive values, grow upward)
// Only the non-overlapping part
const expenseBars = svg.selectAll(".bar-expenses")
    .data(data)
    .enter().append("rect")
    .attr("class", "bar-expenses")
    .attr("x", d => x0(d.month))
    .attr("y", d => {
        const absExpenses = Math.abs(d.expenses);
        const overlap = Math.min(d.income, absExpenses);
        return yScale(absExpenses);
    })
    .attr("width", x0.bandwidth())
    .attr("height", d => {
        const absExpenses = Math.abs(d.expenses);
        const overlap = Math.min(d.income, absExpenses);
        const nonOverlap = absExpenses - overlap;
        return height - yScale(nonOverlap);
    })
    .attr("fill", "#f44336")
    .attr("opacity", 0.7);

// Add bars for income on top (positive values, grow upward)
// Only the non-overlapping part
const incomeBars = svg.selectAll(".bar-income")
    .data(data)
    .enter().append("rect")
    .attr("class", "bar-income")
    .attr("x", d => x0(d.month))
    .attr("y", d => yScale(d.income))
    .attr("width", x0.bandwidth())
    .attr("height", d => {
        const absExpenses = Math.abs(d.expenses);
        const overlap = Math.min(d.income, absExpenses);
        const nonOverlap = d.income - overlap;
        return height - yScale(nonOverlap);
    })
    .attr("fill", "#4caf50")
    .attr("opacity", 0.7);

// Add light grey overlap bars
const overlapBars = svg.selectAll(".bar-overlap")
    .data(data)
    .enter().append("rect")
    .attr("class", "bar-overlap")
    .attr("x", d => x0(d.month))
    .attr("y", d => {
        const overlap = Math.min(d.income, Math.abs(d.expenses));
        return yScale(overlap);
    })
    .attr("width", x0.bandwidth())
    .attr("height", d => {
        const overlap = Math.min(d.income, Math.abs(d.expenses));
        return height - yScale(overlap);
    })
    .attr("fill", "#b8b8b8")
    .attr("opacity", 0.7);

// Add invisible overlay bars that cover the full height for mouse interactions
svg.selectAll(".bar-overlay")
    .data(data)
    .enter().append("rect")
    .attr("class", "bar-overlay")
    .attr("x", d => x0(d.month))
    .attr("y", d => yScale(Math.max(d.income, Math.abs(d.expenses))))
    .attr("width", x0.bandwidth())
    .attr("height", d => height - yScale(Math.max(d.income, Math.abs(d.expenses))))
    .attr("fill", "transparent")
    .style("cursor", "pointer")
    .on("mouseover", function(event, d) {
        d3.select(".tooltip")
            .style("opacity", 1)
            .html(`<strong>${d.month}</strong><br/>Income: ${d.income.toFixed(2)} €<br/>Expenses: ${Math.abs(d.expenses).toFixed(2)} €<br/>Net: ${(d.income + d.expenses).toFixed(2)} €<br/><em>Click to see details</em>`)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px");
        // Highlight all bars for this month
        incomeBars.filter(dd => dd.month === d.month).attr("opacity", 0.9);
        expenseBars.filter(dd => dd.month === d.month).attr("opacity", 0.9);
        overlapBars.filter(dd => dd.month === d.month).attr("opacity", 0.9);
    })
    .on("mouseout", function(event, d) {
        d3.select(".tooltip").style("opacity", 0);
        // Reset all bars
        incomeBars.filter(dd => dd.month === d.month).attr("opacity", 0.7);
        expenseBars.filter(dd => dd.month === d.month).attr("opacity", 0.7);
        overlapBars.filter(dd => dd.month === d.month).attr("opacity", 0.7);
    })
    .on("click", function(event, d) {
        // Prevent the click from bubbling (avoid interfering with brush internals)
        event.stopPropagation();
        event.preventDefault();
        // Select the clicked month (will move the brush handles to the edges of this month)
        selectMonth(d.month);
    });

// Add brush for time selection
let selectedRange = null; // Will store [startMonth, endMonth]
let isInitializing = false; // Flag to prevent infinite recursion during initialization

// Helper function to snap to nearest edge position between months
function snapToEdge(xPos) {
    let closestEdge = edgePositions[0];
    let minDist = Math.abs(xPos - closestEdge.x);
    
    for (let i = 1; i < edgePositions.length; i++) {
        const dist = Math.abs(xPos - edgePositions[i].x);
        if (dist < minDist) {
            minDist = dist;
            closestEdge = edgePositions[i];
        }
    }
    return closestEdge;
}

// Create brush that stops above the zero line (so bottom isn't on/under the zero grid line)
const zeroY = yScale(0); // pixel position of the zero line
// Leave a small gap (2px) above the zero line to ensure selection bottom is above it
const brushTop = 0; // start at top of chart
const brushHeight = Math.max(0, zeroY - 2 - brushTop);
const brush = d3.brushX()
    .extent([[0, brushTop], [width, brushTop + brushHeight]])
    // Only allow the brush to start when dragging a handle (prevent dragging the selection area)
    .filter(function(event) {
        // If no DOM event (programmatic move), allow it
        if (!event) return true;
        // Allow only pointer/keyboard events that originate from handle elements
        const target = event.target || event.srcElement;
        // If the click/drag started on an element with class 'handle', allow brush
        if (target && target.classList && target.classList.contains && target.classList.contains('handle')) {
            return true;
        }
        // Otherwise prevent the brush interaction (so clicking/dragging inside the chart won't create/resize selection)
        return false;
    })
    .on("brush", brushed)
    .on("end", brushEnd);

const brushGroup = svg.append("g")
    .attr("class", "brush")
    .call(brush);

// Style the brush
brushGroup.selectAll(".selection")
    .style("fill", "#667eea")
    .style("fill-opacity", 0.15)
    .style("stroke", "none");  // Remove the stroke around the selection

// Customize brush handles
brushGroup.selectAll(".handle")
    .style("fill", "#667eea")
    .style("stroke", "white")
    .style("stroke-width", 1)
    .style("width", 10);

// Add draggable visual cue (vertical slots) to handles
const handleSlots = brushGroup.append("g")
    .attr("class", "handle-slots")
    .style("pointer-events", "none");

// Small pixel shift to adjust visual alignment of brush handles (negative -> left)
const BRUSH_PIXEL_SHIFT = -2;

// Create two slot lines (one for each handle)
handleSlots.append("line")
    .attr("class", "handle-slot-w")
    .style("stroke", "white")
    .style("stroke-width", 1.5)
    .style("stroke-linecap", "round")
    .style("opacity", 0);

handleSlots.append("line")
    .attr("class", "handle-slot-e")
    .style("stroke", "white")
    .style("stroke-width", 1.5)
    .style("stroke-linecap", "round")
    .style("opacity", 0);

// Function to update handle slot positions
function updateHandleSlots(selection) {
    if (!selection) {
        handleSlots.selectAll("line").style("opacity", 0);
        return;
    }
    
    const [x0, x1] = selection;
    const slotHeight = brushHeight * 0.4;  // 40% of brush height (shorter slots)
    const centerY = brushTop + brushHeight / 2;
    
    handleSlots.select(".handle-slot-w")
        .attr("x1", x0)
        .attr("x2", x0)
        .attr("y1", centerY - slotHeight / 2)
        .attr("y2", centerY + slotHeight / 2)
        .style("opacity", 1);
    
    handleSlots.select(".handle-slot-e")
        .attr("x1", x1)
        .attr("x2", x1)
        .attr("y1", centerY - slotHeight / 2)
        .attr("y2", centerY + slotHeight / 2)
        .style("opacity", 1);

    // Try to align slots to actual handle visuals. If handles aren't ready, fallback to selection coords.
    const aligned = alignSlotsToHandles(selection);
    if (aligned) {
        // We already positioned slot lines to match actual handles; ensure opacity is set
        handleSlots.selectAll('line').style('opacity', 1)
            .attr('y1', centerY - slotHeight / 2)
            .attr('y2', centerY + slotHeight / 2);
        return;
    }

    // Debug fallback: print selection positions
    try {
        console.log('updateHandleSlots (fallback) - selection:', selection, 'slotHeight:', slotHeight);
    } catch (e) {
        console.log('updateHandleSlots debug error', e);
    }
}

// Helper to compute visual center x of a handle DOM element
function getHandleCenterX(handleElem) {
    try {
        const bbox = handleElem.getBBox();
        const transform = handleElem.getAttribute('transform');
        let tx = 0;
        if (transform) {
            const m = transform.match(/translate\(([^,\s]+)(?:[ ,]+([^\)]+))?\)/);
            if (m) {
                tx = parseFloat(m[1]) || 0;
            }
        }
        return bbox.x + bbox.width / 2 + tx;
    } catch (e) {
        return null;
    }
}

// Convert hex color (#rrggbb) to rgba(r,g,b,a)
function hexToRgba(hex, alpha) {
    if (!hex) return `rgba(0,0,0,${alpha})`;
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function(m, r, g, b) {
        return r + r + g + g + b + b;
    });
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ?
        `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})` :
        `rgba(0,0,0,${alpha})`;
}

// Try to align slot lines to actual handle centers (visual)
function alignSlotsToHandles(selection) {
    const handles = brushGroup.selectAll('.handle').nodes();
    if (handles && handles.length >= 2) {
        const leftHandle = handles[0];
        const rightHandle = handles[1];
        const leftCx = getHandleCenterX(leftHandle);
        const rightCx = getHandleCenterX(rightHandle);
        if (leftCx != null && rightCx != null) {
            handleSlots.select('.handle-slot-w')
                .attr('x1', leftCx)
                .attr('x2', leftCx);
            handleSlots.select('.handle-slot-e')
                .attr('x1', rightCx)
                .attr('x2', rightCx);
            return true;
        }
    }
    return false;
}

// Remove the overlay lines (top and bottom borders)
brushGroup.selectAll(".overlay")
    .style("stroke", "none");

function brushed(event) {
    if (!event.selection || isInitializing) return;
    
    const [x0Pos, x1Pos] = event.selection;
    
    // Snap to nearest edge positions
    const startEdge = snapToEdge(x0Pos);
    const endEdge = snapToEdge(x1Pos);
    
    // Determine which months are included based on edges
    // Months are included if they are between the left and right edges
    const leftEdge = startEdge.x < endEdge.x ? startEdge : endEdge;
    const rightEdge = startEdge.x < endEdge.x ? endEdge : startEdge;
    
    // Find the first and last month indices that fall within the brush
    let startIdx = leftEdge.rightMonth; // First month after left edge
    let endIdx = rightEdge.leftMonth; // Last month before right edge
    
    // Clamp to valid range
    startIdx = Math.max(0, Math.min(startIdx, data.length - 1));
    endIdx = Math.max(0, Math.min(endIdx, data.length - 1));
    
    // During brush movement, snap the selection
    if (event.sourceEvent && event.sourceEvent.type !== 'end') {
        const snappedSelection = [
            Math.min(startEdge.x, endEdge.x) + BRUSH_PIXEL_SHIFT,
            Math.max(startEdge.x, endEdge.x) + BRUSH_PIXEL_SHIFT
        ];
        
        // Update brush position to snapped position
        d3.select(this).call(brush.move, snappedSelection);
        
        // Update handle slots
        updateHandleSlots(snappedSelection);
    } else {
        // Update handle slots with current selection
        updateHandleSlots(event.selection.map(x => x + BRUSH_PIXEL_SHIFT));
    }
    
    // Update selected range
    selectedRange = [startIdx, endIdx];
}

function brushEnd(event) {
    if (isInitializing) return;
    
    if (!event.selection) {
        // Brush was cleared
        selectedRange = null;
        updateHandleSlots(null);
        updateSankeyAndTransactions();
        return;
    }
    
    const [x0Pos, x1Pos] = event.selection;
    
    // Snap to nearest edge positions
    const startEdge = snapToEdge(x0Pos);
    const endEdge = snapToEdge(x1Pos);
    
    // Determine which months are included
    const leftEdge = startEdge.x < endEdge.x ? startEdge : endEdge;
    const rightEdge = startEdge.x < endEdge.x ? endEdge : startEdge;
    
    let startIdx = leftEdge.rightMonth;
    let endIdx = rightEdge.leftMonth;
    
    // Clamp to valid range
    startIdx = Math.max(0, Math.min(startIdx, data.length - 1));
    endIdx = Math.max(0, Math.min(endIdx, data.length - 1));
    
    selectedRange = [startIdx, endIdx];
    
    // Snap the final brush position (and apply pixel shift)
    const snappedSelection = [
        Math.min(startEdge.x, endEdge.x) + BRUSH_PIXEL_SHIFT,
        Math.max(startEdge.x, endEdge.x) + BRUSH_PIXEL_SHIFT
    ];

    // Debug: log edges and snapped selection
    try {
        console.log('brushEnd - event.selection:', [x0Pos, x1Pos]);
        console.log('brushEnd - edgePositions:', edgePositions.map(e => ({x: e.x, leftMonth: e.leftMonth, rightMonth: e.rightMonth})));
        console.log('brushEnd - startEdge:', startEdge, 'endEdge:', endEdge);
        console.log('brushEnd - snappedSelection:', snappedSelection);
    } catch (e) {
        console.log('brushEnd debug error', e);
    }
    
    // Check if we need to snap (allow small tolerance for floating point)
    const needsSnap = Math.abs(x0Pos - snappedSelection[0]) > 0.5 || 
                      Math.abs(x1Pos - snappedSelection[1]) > 0.5;
    
    if (needsSnap) {
        d3.select(this).call(brush.move, snappedSelection);
    }
    
    // Update handle slots
    updateHandleSlots(snappedSelection);
    
    // Update Sankey and transactions
    updateSankeyAndTransactions();
}

function updateSankeyAndTransactions() {
    console.log('updateSankeyAndTransactions called');
    console.log('selectedRange:', selectedRange);
    
    if (!selectedRange) {
        console.log('No selected range');
        // No selection - show message
        document.getElementById('sankey-title').textContent = 'Cash Flow';
        document.getElementById('transactions-title').textContent = 'Transactions';
        
        const sankeyDiv = document.getElementById('sankey-chart');
        sankeyDiv.innerHTML = '<p style="text-align: center; color: #999; padding: 40px 0;">Select a timeframe in the overview to see cash flow</p>';
        
        const detailsDiv = document.getElementById('details-content');
        detailsDiv.innerHTML = '<p style="text-align: center; color: #999; padding: 40px 0;">Select a timeframe in the overview to see transactions</p>';
        return;
    }
    
    const [startIdx, endIdx] = selectedRange;
    const selectedMonths = data.slice(startIdx, endIdx + 1).map(d => d.month);
    
    console.log('Selected months:', selectedMonths);
    
    // Update titles (format: Cash Flow (YYYY-MM - YYYY-MM))
    const startMonth = data[startIdx].month;
    const endMonth = data[endIdx].month;
    const rangeLabel = startMonth === endMonth ? `(${startMonth})` : `(${startMonth} - ${endMonth})`;

    console.log('Timeframe range label:', rangeLabel);

    document.getElementById('sankey-title').textContent = `Cash Flow ${rangeLabel}`;
    document.getElementById('transactions-title').textContent = `Transactions ${rangeLabel}`;
    
    // Render Sankey for selected range
    console.log('Calling renderRangeSankey...');
    renderRangeSankey(selectedMonths);
    
    // Render transactions for selected range
    console.log('Calling showRangeTransactions...');
    showRangeTransactions(selectedMonths);
}

// Initialize with the latest month selected
function initializeDefaultSelection() {
    console.log('Initializing default selection...');
    console.log('Data length:', data.length);
    console.log('Transaction details keys:', Object.keys(transactionDetails));
    
    if (data.length === 0) {
        console.log('No data available');
        return;
    }
    
    // Set flag to prevent brush events from triggering during initialization
    isInitializing = true;
    
    // Select the last month (most recent)
    const lastIdx = data.length - 1;
    
    console.log('Last month index:', lastIdx);
    console.log('Last month name:', data[lastIdx].month);
    
    // Find the edges around the last month
    // We want the edge before the last month and the edge after the last month
    const startEdge = edgePositions.find(e => e.rightMonth === lastIdx);
    const endEdge = edgePositions.find(e => e.leftMonth === lastIdx);
    
    console.log('Start edge:', startEdge);
    console.log('End edge:', endEdge);
    
    // Set the brush to cover only the last month (from edge to edge)
    const defaultSelection = [startEdge.x + BRUSH_PIXEL_SHIFT, endEdge.x + BRUSH_PIXEL_SHIFT];
    
    console.log('Default selection:', defaultSelection);
    
    // Set the selected range
    selectedRange = [lastIdx, lastIdx];
    
    console.log('Selected range:', selectedRange);
    
    // Apply the selection visually (without triggering events because of isInitializing flag)
    brushGroup.call(brush.move, defaultSelection);
    
    // Update handle slots for initial selection
    updateHandleSlots(defaultSelection);
    
    // Clear the initialization flag
    isInitializing = false;
    
    // Manually trigger the update
    console.log('Calling updateSankeyAndTransactions...');
    updateSankeyAndTransactions();
}

// Select a single month (accepts month name like '2023-01' or an index)
function selectMonth(monthOrIndex) {
    let idx = typeof monthOrIndex === 'number' ? monthOrIndex : data.findIndex(d => d.month === monthOrIndex);
    if (idx < 0 || idx >= data.length) return;

    // Try to find the exact edges around the requested month
    let startEdge = edgePositions.find(e => e.rightMonth === idx);
    let endEdge = edgePositions.find(e => e.leftMonth === idx);

    // Fallback: compute edges from band positions if not found for any reason
    if (!startEdge) {
        startEdge = {
            x: x0(data[idx].month),
            rightMonth: idx,
            leftMonth: idx - 1
        };
    }
    if (!endEdge) {
        endEdge = {
            x: x0(data[idx].month) + x0.bandwidth(),
            leftMonth: idx,
            rightMonth: idx + 1
        };
    }

    // Build snapped selection (apply pixel shift)
    let selLeft = Math.min(startEdge.x, endEdge.x) + BRUSH_PIXEL_SHIFT;
    let selRight = Math.max(startEdge.x, endEdge.x) + BRUSH_PIXEL_SHIFT;

    // Clamp selection to brush extent [0, width]
    selLeft = Math.max(0, Math.min(selLeft, width));
    selRight = Math.max(0, Math.min(selRight, width));

    const snappedSelection = [selLeft, selRight];

    // Update the global selectedRange
    selectedRange = [idx, idx];

    // Move the brush to the snapped selection (this triggers brush/brush end handlers)
    brushGroup.call(brush.move, snappedSelection);

    // Ensure handle slots update immediately
    updateHandleSlots(snappedSelection);
}

// Call initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initializeDefaultSelection, 100);
    });
} else {
    // DOM already loaded
    setTimeout(initializeDefaultSelection, 100);
}

// Add X axis
const xAxisGroup = svg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x0));

// Replace text labels with custom tspan formatting
xAxisGroup.selectAll("text").each(function(d, i) {
    const text = d3.select(this);
    const parts = d.split('-');
    const year = parts[0];
    const month = parseInt(parts[1]); // Remove leading zero
    
    text.text(''); // Clear existing text
    
    if (month === 1 || i === 0) {
        // Add month on first line
        text.append("tspan")
            .attr("x", 0)
            .attr("dy", "0.71em")
            .text(month);
        // Add year on second line
        text.append("tspan")
            .attr("x", 0)
            .attr("dy", "1.2em")
            .text(year);
    } else {
        // Show only month number
        text.append("tspan")
            .attr("x", 0)
            .attr("dy", "0.71em")
            .text(month);
    }
});

// Add left Y axis
// Left Y axis with the same dynamic ticks
const yAxisTicks = d3.ticks(0, yScale.domain()[1], 3);
svg.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(yScale)
        .tickValues(yAxisTicks)
        .tickFormat(formatThousands));

// Functions to show/hide transaction details
const incomeCategories = ['Salary', 'Inheritance', 'Returns'];
const expenseCategories = ['Housing', 'Kids', 'Food', 'Groceries', 'Shopping', 'Services', 'Transportation', 'Savings', 'Cash Withdrawal'];

// Category colors
const incomeColors = {
    'Salary': '#6BCF9E',
    'Inheritance': '#8DD4B3',
    'Returns': '#A3DCC0',
    'Uncategorized': '#9AA0A6'
};

const expenseColors = {
    'Housing': '#E06C63',
    'Kids': '#E88B83',
    'Food': '#F4A261',
    'Groceries': '#F9C74F',
    'Shopping': '#F7B885',
    'Services': '#4D96FF',
    'Transportation': '#7BB0FF',
    'Savings': '#7B61FF',
    'Cash Withdrawal': '#9B59B6',
    'Uncategorized': '#9AA0A6'
};

// Emoji map used both in the transactions table and the Sankey nodes
const emojiMap = {
    'Salary': '💼',
    'Inheritance': '🪙',
    'Returns': '📈',
    'Housing': '🏠',
    'Kids': '🧒',
    'Food': '🍽️',
    'Groceries': '🛒',
    'Shopping': '🛍️',
    'Services': '🛠️',
    'Transportation': '🚗',
    'Savings': '💰',
    'Cash Withdrawal': '💵',
    'Uncategorized': '❓'
};

function renderMonthlySankey(month) {
    renderRangeSankey([month]);
}

function renderRangeSankey(months) {
    console.log('renderRangeSankey called with months:', months);
    
    // Build Sankey data for the selected month(s)
    const nodes = [];
    const links = [];
    const nodeIndex = {};
    
    // Group transactions by category across all selected months
    const incomeByCategory = {};
    const expenseByCategory = {};
    
    months.forEach(month => {
        console.log('Processing month:', month);
        const details = transactionDetails[month];
        console.log('Details for month:', details);
        if (!details) {
            console.log('No details found for month:', month);
            return;
        }
        
        details.income.forEach(t => {
            const cat = t.category || 'Uncategorized';
            incomeByCategory[cat] = (incomeByCategory[cat] || 0) + t.amount;
        });
        
        details.expenses.forEach(t => {
            const cat = t.category || 'Uncategorized';
            expenseByCategory[cat] = (expenseByCategory[cat] || 0) + Math.abs(t.amount);
        });
    });
    
    console.log('Income by category:', incomeByCategory);
    console.log('Expense by category:', expenseByCategory);
    
    // Check if we have any data to display
    const totalIncome = Object.values(incomeByCategory).reduce((a, b) => a + b, 0);
    const totalExpenses = Object.values(expenseByCategory).reduce((a, b) => a + b, 0);
    
    console.log('Total income:', totalIncome, 'Total expenses:', totalExpenses);
    
    if (totalIncome === 0 && totalExpenses === 0) {
        const chartDiv = document.getElementById('sankey-chart');
        chartDiv.innerHTML = '<p style="text-align: center; color: #666;">No transactions for this timeframe</p>';
        return;
    }
    
    // Sort categories by amount (highest to lowest)
    const sortedIncome = Object.entries(incomeByCategory).sort((a, b) => b[1] - a[1]);
    const sortedExpenses = Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1]);
    
    // Add income nodes (sorted)
    sortedIncome.forEach(([category, amount]) => {
        nodeIndex[category] = nodes.length;
        nodes.push({
            name: category,
            color: incomeColors[category] || '#9AA0A6',
            type: 'income',
            emoji: emojiMap[category] || ''
        });
    });
    
    // Add Cash Flow node
    const cashflowIndex = nodes.length;
    nodes.push({name: 'Cash Flow', color: '#3BA66B', type: 'middle'});
    
    // Add expense nodes (sorted)
    sortedExpenses.forEach(([category, amount]) => {
        const key = `expense_${category}`;
        nodeIndex[key] = nodes.length;
        nodes.push({
            name: category,
            color: expenseColors[category] || '#9AA0A6',
            type: 'expense',
            emoji: emojiMap[category] || ''
        });
    });
    
    // Calculate surplus (reuse totalIncome and totalExpenses from earlier)
    const surplus = totalIncome - totalExpenses;
    
    // Add Surplus node if there is one
    let surplusIndex = nodes.length;
    if (surplus > 0) {
        nodes.push({name: 'Surplus', color: '#3BA66B', type: 'expense'});
    }
    
    // Add Deficit node if expenses exceed income
    let deficitIndex = nodes.length;
    if (surplus < 0) {
        nodes.push({name: 'Deficit', color: '#E53935', type: 'income'});
    }
    
    // Add income -> Cash Flow links (sorted)
    sortedIncome.forEach(([category, amount]) => {
        links.push({
            source: nodeIndex[category],
            target: cashflowIndex,
            value: amount
        });
    });
    
    // Add Deficit -> Cash Flow link (if there's a deficit)
    if (surplus < 0) {
        links.push({
            source: deficitIndex,
            target: cashflowIndex,
            value: Math.abs(surplus)
        });
    }
    
    // Add Cash Flow -> expenses links (sorted)
    sortedExpenses.forEach(([category, amount]) => {
        const key = `expense_${category}`;
        links.push({
            source: cashflowIndex,
            target: nodeIndex[key],
            value: amount
        });
    });
    
    // Add Cash Flow -> Surplus link
    if (surplus > 0) {
        links.push({
            source: cashflowIndex,
            target: surplusIndex,
            value: surplus
        });
    }
    
    // Clear previous chart
    const chartDiv = document.getElementById('sankey-chart');
    chartDiv.innerHTML = '';
    
    if (nodes.length === 0 || links.length === 0) {
        chartDiv.innerHTML = '<p style="text-align: center; color: #666;">No categorized transactions for this month</p>';
        return;
    }
    
    // Create SVG - use a fallback width if clientWidth is too small
    const containerWidth = chartDiv.clientWidth;
    const width = containerWidth > 100 ? containerWidth : 1000; // Fallback to 1000px if too narrow
    const height = 400;
    
    const svg = d3.select('#sankey-chart')
        .append('svg')
        .attr('width', width)
        .attr('height', height);
    
    // Add defs for gradients
    const defs = svg.append('defs');
    
    const sankey = d3.sankey()
        .nodeWidth(15)
        .nodePadding(15)
        .extent([[20, 20], [width - 20, height - 20]]);
    
    const graph = sankey({
        nodes: nodes.map(d => Object.assign({}, d)),
        links: links.map(d => Object.assign({}, d))
    });
    
    // Create gradients for each link
    graph.links.forEach((link, i) => {
        const gradientId = `gradient-${i}`;
        const gradient = defs.append('linearGradient')
            .attr('id', gradientId)
            .attr('gradientUnits', 'userSpaceOnUse')
            .attr('x1', link.source.x1)
            .attr('x2', link.target.x0);
        
        gradient.append('stop')
            .attr('offset', '0%')
            .attr('stop-color', link.source.color);
        
        gradient.append('stop')
            .attr('offset', '100%')
            .attr('stop-color', link.target.color);
        
        link.gradientId = gradientId;
    });
    
    // Create clip paths for rounded corners
    graph.nodes.forEach((node, i) => {
        if (node.type === 'income') {
            // Left-side rounded corners for income nodes
            const clipPath = defs.append('clipPath')
                .attr('id', `clip-income-${i}`);
            clipPath.append('rect')
                .attr('x', node.x0)
                .attr('y', node.y0)
                .attr('width', node.x1 - node.x0)
                .attr('height', node.y1 - node.y0)
                .attr('rx', 6)
                .attr('ry', 6);
            // Add a rect to cover the right side to make it square
            clipPath.append('rect')
                .attr('x', node.x0 + (node.x1 - node.x0) / 2)
                .attr('y', node.y0)
                .attr('width', (node.x1 - node.x0) / 2)
                .attr('height', node.y1 - node.y0);
            node.clipPathId = `clip-income-${i}`;
        } else if (node.type === 'expense') {
            // Right-side rounded corners for expense nodes
            const clipPath = defs.append('clipPath')
                .attr('id', `clip-expense-${i}`);
            clipPath.append('rect')
                .attr('x', node.x0)
                .attr('y', node.y0)
                .attr('width', node.x1 - node.x0)
                .attr('height', node.y1 - node.y0)
                .attr('rx', 6)
                .attr('ry', 6);
            // Add a rect to cover the left side to make it square
            clipPath.append('rect')
                .attr('x', node.x0)
                .attr('y', node.y0)
                .attr('width', (node.x1 - node.x0) / 2)
                .attr('height', node.y1 - node.y0);
            node.clipPathId = `clip-expense-${i}`;
        }
    });
    
    // Links
    const linkElements = svg.append('g')
        .selectAll('path')
        .data(graph.links)
        .join('path')
        .attr('class', 'sankey-link')
        .attr('d', d3.sankeyLinkHorizontal())
        .attr('stroke', d => `url(#${d.gradientId})`)
        .attr('stroke-width', d => Math.max(1, d.width))
        .style('cursor', d => {
            const targetName = d.target.name;
            const sourceName = d.source.name;
            return (targetName !== 'Cash Flow' && targetName !== 'Surplus' && targetName !== 'Deficit' &&
                    sourceName !== 'Cash Flow' && sourceName !== 'Surplus' && sourceName !== 'Deficit') ? 'pointer' : 'default';
        })
        .on('click', function(event, d) {
            const targetName = d.target.name;
            const sourceName = d.source.name;
            // Filter by the category (not Cash Flow or Surplus or Deficit)
            if (targetName !== 'Cash Flow' && targetName !== 'Surplus' && targetName !== 'Deficit') {
                currentCategoryFilter = targetName;
                // Toggle selection for all links with this target
                linkElements.classed('selected', link => link.target.name === targetName);
                renderTransactionsTable();
                updateCategoryFilterIndicator();
            } else if (sourceName !== 'Cash Flow' && sourceName !== 'Surplus' && sourceName !== 'Deficit') {
                currentCategoryFilter = sourceName;
                // Toggle selection for all links with this source
                linkElements.classed('selected', link => link.source.name === sourceName);
                renderTransactionsTable();
                updateCategoryFilterIndicator();
            }
        })
        .append('title')
        .text(d => `${d.source.name} → ${d.target.name}\n${d.value.toFixed(2)} €\nClick to filter`);
    
    // Nodes
    const node = svg.append('g')
        .selectAll('.sankey-node')
        .data(graph.nodes)
        .join('g')
        .attr('class', 'sankey-node')
        .style('cursor', d => (d.name !== 'Cash Flow' && d.name !== 'Surplus' && d.name !== 'Deficit') ? 'pointer' : 'default');
    
    node.append('rect')
        .attr('x', d => d.x0)
        .attr('y', d => d.y0)
        .attr('height', d => d.y1 - d.y0)
        .attr('width', d => d.x1 - d.x0)
        .attr('fill', d => d.color)
        .attr('clip-path', d => d.clipPathId ? `url(#${d.clipPathId})` : null)
        .on('click', function(event, d) {
            if (d.name !== 'Cash Flow' && d.name !== 'Surplus' && d.name !== 'Deficit') {
                currentCategoryFilter = d.name;
                // Highlight links connected to this node
                linkElements.classed('selected', link => {
                    return link.target.name === d.name || link.source.name === d.name;
                });
                renderTransactionsTable();
                updateCategoryFilterIndicator();
            }
        })
        .append('title')
        .text(d => `${d.name}\n${d.value.toFixed(2)} €\nClick to filter`);
    
    // Labels
    node.append('text')
        .attr('x', d => d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6)
        .attr('y', d => (d.y0 + d.y1) / 2)
        .attr('text-anchor', d => d.x0 < width / 2 ? 'start' : 'end')
        .text(d => {
            const emoji = d.emoji ? (d.emoji + ' ') : '';
            return `${emoji}${d.name} (${d.value.toFixed(0)} €)`;
        });
}

let currentMonths = []; // Array of months in the selected range
let showIncome = true;
let showExpense = true;
let currentCategoryFilter = null;

function showTransactionDetails(month, type) {
    showRangeTransactions([month], type);
}

function showRangeTransactions(months, type = 'all') {
    console.log('showRangeTransactions called with months:', months, 'type:', type);
    
    currentMonths = months;
    // Interpret optional type hint: 'income' -> only income, 'expense' or 'expenses' -> only expenses, otherwise both
    if (type === 'income') {
        showIncome = true;
        showExpense = false;
    } else if (type === 'expense' || type === 'expenses') {
        showIncome = false;
        showExpense = true;
    } else {
        showIncome = true;
        showExpense = true;
    }
    currentCategoryFilter = null; // Reset category filter when switching months
    
    // Check if any month has details
    const hasDetails = months.some(month => {
        const details = transactionDetails[month];
        console.log('Checking month:', month, 'has details:', !!details);
        return !!details;
    });
    
    console.log('Has details:', hasDetails);
    
    if (!hasDetails) {
        console.log('No details found for any selected month');
        return;
    }
    
    // Update panel titles (format: Title (YYYY-MM - YYYY-MM))
    const timeframeLabel = months.length === 1 ? `(${months[0]})` : `(${months[0]} - ${months[months.length - 1]})`;
    document.getElementById('sankey-title').textContent = `Cash Flow ${timeframeLabel}`;
    document.getElementById('transactions-title').textContent = `Transactions ${timeframeLabel}`;
    
    // Create filter controls
    const contentDiv = document.getElementById('details-content');
    contentDiv.innerHTML = '';
    
    const filterDiv = document.createElement('div');
    filterDiv.className = 'filter-controls';
    // left / center / right layout; search input will be placed absolutely centered inside the panel
    filterDiv.innerHTML = `
        <div class="filter-left" style="display:inline-flex; align-items:center; gap:12px;">
            <label style="display:inline-flex; align-items:center; gap:8px;">
                <input type="checkbox" id="show-income-checkbox" ${showIncome ? 'checked' : ''} onchange="toggleShow('income', this.checked)" style="accent-color: #87C787;">
                <span style="color:#4caf50; font-weight:600;">Show Income</span>
            </label>
            <label style="display:inline-flex; align-items:center; gap:8px;">
                <input type="checkbox" id="show-expense-checkbox" ${showExpense ? 'checked' : ''} onchange="toggleShow('expense', this.checked)" style="accent-color: #FA7F75;">
                <span style="color:#f44336; font-weight:600;">Show Expense</span>
            </label>
        </div>
        <div class="filter-center" style="flex:1; display:flex; justify-content:flex-start; align-items:center;">
            <!-- intentionally empty: search will be absolutely centered in the panel -->
        </div>
        <div class="filter-right" style="display:inline-flex; align-items:center;">
            <span id="category-filter-indicator" style="color: #667eea; font-weight: 500;"></span>
        </div>
    `;

    contentDiv.appendChild(filterDiv);

    // Insert centered search input into the transactions panel (absolutely centered)
    (function placeCenteredSearch() {
        const panel = document.getElementById('transactions-panel');
        if (!panel) return;
        // ensure panel is a positioned container
        if (getComputedStyle(panel).position === 'static') {
            panel.style.position = 'relative';
        }

        // remove any previous wrapper
        const existing = document.getElementById('transactions-search-wrapper');
        if (existing && existing.parentElement) existing.parentElement.removeChild(existing);

        const wrapper = document.createElement('div');
        wrapper.id = 'transactions-search-wrapper';
        // absolute centering horizontally; top will be computed to align with filter controls
        wrapper.style.position = 'absolute';
        wrapper.style.left = '50%';
        wrapper.style.transform = 'translateX(-50%)';
        wrapper.style.pointerEvents = 'auto';

        // create the input
        const searchInput = document.createElement('input');
        searchInput.id = 'transactions-search';
        searchInput.type = 'search';
        searchInput.placeholder = 'Search party or purpose…';
        searchInput.setAttribute('aria-label', 'Search transactions');
        // basic inline sizing; styles.css will refine appearance
        searchInput.style.width = '360px';
        searchInput.style.maxWidth = '60%';
        searchInput.style.height = '36px';
        searchInput.style.boxSizing = 'border-box';

        wrapper.appendChild(searchInput);
        panel.appendChild(wrapper);

        // compute top to vertically center relative to filter controls
        setTimeout(() => {
            try {
                const filterRect = filterDiv.getBoundingClientRect();
                const panelRect = panel.getBoundingClientRect();
                const top = filterRect.top - panelRect.top + (filterRect.height - wrapper.offsetHeight) / 2;
                wrapper.style.top = `${Math.max(8, Math.round(top))}px`;
            } catch (e) {
                // fallback
                wrapper.style.top = '12px';
            }
        }, 0);
    })();

    // Attach search handler: re-render table on input
    (function attachSearchHandler() {
        const listen = () => {
            const search = document.getElementById('transactions-search');
            if (!search) return;
            // avoid attaching multiple listeners
            if (!search._searchHandlerAttached) {
                search.addEventListener('input', () => renderTransactionsTable());
                search._searchHandlerAttached = true;
            }
        };
        // try immediately and again shortly after DOM mutations (wrapper is inserted async)
        listen();
        setTimeout(listen, 50);
    })();

    // Render transactions table
    renderTransactionsTable();
    
    // Update category filter indicator after table is rendered
    updateCategoryFilterIndicator();
    
    // Render Sankey chart after the container is visible
    setTimeout(() => renderRangeSankey(months), 0);
    
    // Do not auto-scroll when selecting a timeframe to avoid disrupting the user's view
}

// Toggle visibility of income/expense rows via the checkbox controls
function toggleShow(type, checked) {
    if (type === 'income') {
        showIncome = !!checked;
    } else if (type === 'expense') {
        showExpense = !!checked;
    }
    currentCategoryFilter = null; // Reset category filter when changing type filter
    renderTransactionsTable();
    updateCategoryFilterIndicator();
}

function updateCategoryFilterIndicator() {
    const indicator = document.getElementById('category-filter-indicator');
    if (!indicator) return;

    // Remove any previous wrapper appended to the transactions panel
    const existingWrapper = document.getElementById('category-filter-wrapper');
    if (existingWrapper && existingWrapper.parentElement) existingWrapper.parentElement.removeChild(existingWrapper);

    // Clear the indicator placeholder
    indicator.innerHTML = '';

    if (currentCategoryFilter) {
        // Create a wrapper that will contain the "Filtered by" label and the badge
        const wrapper = document.createElement('div');
        wrapper.id = 'category-filter-wrapper';
        wrapper.className = 'filter-badge-wrapper';

        // Create label
        const filterLabel = document.createElement('span');
        filterLabel.className = 'filter-badge-text';
        filterLabel.textContent = 'Filtered by';
        // add a little space to the right of the label before the badge
        filterLabel.style.marginRight = '8px';
        wrapper.appendChild(filterLabel);

        // Create a badge element with the filtered value and a clear (X) button
        const badge = document.createElement('div');
        badge.id = 'category-filter-badge';
        badge.className = 'filter-badge';

        // Determine if the category is income or expense to color the badge
        let badgeType = 'neutral';
        try {
            if (incomeCategories && incomeCategories.includes && incomeCategories.includes(currentCategoryFilter)) {
                badgeType = 'income';
            } else if (expenseCategories && expenseCategories.includes && expenseCategories.includes(currentCategoryFilter)) {
                badgeType = 'expense';
            } else if ((incomeColors && incomeColors[currentCategoryFilter]) && !(expenseColors && expenseColors[currentCategoryFilter])) {
                badgeType = 'income';
            } else if ((expenseColors && expenseColors[currentCategoryFilter]) && !(incomeColors && incomeColors[currentCategoryFilter])) {
                badgeType = 'expense';
            }
        } catch (e) {
            badgeType = 'neutral';
        }
        if (badgeType !== 'neutral') badge.classList.add(badgeType);

        // Try to find a sankey color for this category from incomeColors/expenseColors
        let nodeColor = null;
        if (incomeColors && incomeColors[currentCategoryFilter]) nodeColor = incomeColors[currentCategoryFilter];
        if (!nodeColor && expenseColors && expenseColors[currentCategoryFilter]) nodeColor = expenseColors[currentCategoryFilter];

        if (nodeColor) {
            const bg = hexToRgba(nodeColor, 0.12);
            const border = hexToRgba(nodeColor, 0.28);
            badge.style.background = bg;
            badge.style.borderColor = border;
            // use black text for contrast
            badge.style.color = '#000';
            badge.style.borderRadius = '8px';
        } else {
            badge.style.borderRadius = '8px';
        }

        const label = document.createElement('span');
        label.className = 'filter-badge-label';
        // Prepend emoji (with a trailing non-breaking space) to the filter badge label
        const filterEmoji = document.createElement('span');
        filterEmoji.className = 'badge-emoji';
        // use a non-breaking space to ensure the gap is always preserved
        filterEmoji.textContent = (emojiMap[currentCategoryFilter] || '🔖') + '\u00A0';
        badge.appendChild(filterEmoji);
        label.textContent = currentCategoryFilter;
        badge.appendChild(label);

        const clearBtn = document.createElement('button');
        clearBtn.className = 'filter-badge-clear';
        clearBtn.setAttribute('aria-label', 'Clear category filter');
        clearBtn.innerHTML = '&times;';
        clearBtn.onclick = () => {
            clearCategoryFilter();
        };
        badge.appendChild(clearBtn);

        wrapper.appendChild(badge);

        // Append the wrapper into the transactions panel and absolutely position it
        const panel = document.getElementById('transactions-panel');
        if (panel) {
            // Ensure panel is a positioned container
            if (getComputedStyle(panel).position === 'static') {
                panel.style.position = 'relative';
            }

            // Append wrapper to panel
            panel.appendChild(wrapper);

            // Position wrapper to the outer right and vertically center with the filter controls
            const filterDiv = document.querySelector('#transactions-panel .filter-controls');
            if (filterDiv) {
                const panelRect = panel.getBoundingClientRect();
                const filterRect = filterDiv.getBoundingClientRect();
                const top = filterRect.top - panelRect.top + (filterRect.height - wrapper.offsetHeight) / 2;
                wrapper.style.position = 'absolute';
                wrapper.style.right = '12px';
                wrapper.style.top = `${Math.max(8, Math.round(top))}px`;
            } else {
                // Fallback: top padding
                wrapper.style.position = 'absolute';
                wrapper.style.right = '12px';
                wrapper.style.top = '12px';
            }
        } else {
            // fallback append to the indicator placeholder
            indicator.appendChild(wrapper);
        }
    }
}

function clearCategoryFilter() {
    currentCategoryFilter = null;
    // Clear all link selections
    d3.selectAll('.sankey-link').classed('selected', false);
    renderTransactionsTable();
    updateCategoryFilterIndicator();
}

// Make functions globally accessible
window.toggleShow = toggleShow;
window.clearCategoryFilter = clearCategoryFilter;

function renderTransactionsTable() {
    // Combine all transactions from all selected months
    let allTransactions = [];
    
    currentMonths.forEach(month => {
        const details = transactionDetails[month];
        if (!details) return;
        
        if (showIncome) {
            details.income.forEach(t => {
                allTransactions.push({
                    ...t,
                    type: 'income',
                    party: t.payer || '-',
                    month: month,
                    fullDate: `${month}-${t.date}` // For sorting
                });
            });
        }
        
        if (showExpense) {
            details.expenses.forEach(t => {
                allTransactions.push({
                    ...t,
                    type: 'expense',
                    party: t.payee || '-',
                    month: month,
                    fullDate: `${month}-${t.date}` // For sorting
                });
            });
        }
    });
    
    // Filter by search term (party or purpose)
    const searchInput = document.getElementById('transactions-search');
    const searchTerm = searchInput && searchInput.value ? searchInput.value.trim().toLowerCase() : '';
    if (searchTerm) {
        allTransactions = allTransactions.filter(t => {
            const party = (t.party || '').toString().toLowerCase();
            const purpose = (t.purpose || '').toString().toLowerCase();
            return party.includes(searchTerm) || purpose.includes(searchTerm);
        });
    }

    // Filter by category if one is selected
    if (currentCategoryFilter) {
        allTransactions = allTransactions.filter(t => {
            const txCategory = t.category || 'Uncategorized';
            return txCategory === currentCategoryFilter;
        });
    }
    
    // Sort by full date (year-month-day)
    allTransactions.sort((a, b) => a.fullDate.localeCompare(b.fullDate));
    
    // Create table
    const table = document.createElement('table');
    
    // Create header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    // Column order: Date, Payer/Payee, Purpose, Category, Comment, Amount
    ['Date', 'Payer/Payee', 'Purpose', 'Category', 'Comment', 'Amount (€)'].forEach((text, i) => {
        const th = document.createElement('th');
        th.textContent = text;
        if (i === 0) th.style.width = '100px'; // Date
        if (i === 3) th.style.width = '300px'; // Category
        if (i === 4) th.style.width = '120px'; // Comment (narrower)
        if (i === 5) {
            // Amount column (shrink-to-fit)
            th.className = 'amount-cell';
            th.style.width = '1%';
            th.style.textAlign = 'right';
        }
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Create body
    const tbody = document.createElement('tbody');
    allTransactions.forEach((t, index) => {
        const row = document.createElement('tr');
        
    // Date - show full date if multiple months selected
    const dateCell = document.createElement('td');
    dateCell.textContent = currentMonths.length > 1 ? t.fullDate : t.date;
    row.appendChild(dateCell);

    // (Amount column will be appended at the end)
        
    // Party (payer/payee) - truncate with tooltip
    const partyCell = document.createElement('td');
    partyCell.className = 'party-cell';
    const partyInner = document.createElement('div');
    partyInner.className = 'truncate-inner';
    partyInner.textContent = t.party;
    partyInner.title = t.party || '';
    partyCell.appendChild(partyInner);
    row.appendChild(partyCell);
        
    // Purpose - truncate with tooltip
    const purposeCell = document.createElement('td');
    purposeCell.className = 'purpose-cell';
    const purposeInner = document.createElement('div');
    purposeInner.className = 'truncate-inner';
    purposeInner.textContent = t.purpose || '-';
    purposeInner.title = t.purpose || '';
    purposeCell.appendChild(purposeInner);
    row.appendChild(purposeCell);
        
        // Category emoji picker
        const categoryCell = document.createElement('td');
        categoryCell.className = 'category-select-cell';

        const categories = t.type === 'income' ? incomeCategories : expenseCategories;

        // Mapping categories to emoji (fallbacks used when no perfect match)
        const emojiMap = {
            'Salary': '💼',
            'Inheritance': '🪙',
            'Returns': '📈',
            'Housing': '🏠',
            'Kids': '🧒',
            'Food': '🍽️',
            'Groceries': '🛒',
            'Shopping': '🛍️',
            'Services': '🛠️',
            'Transportation': '🚗',
            'Savings': '💰',
            'Cash Withdrawal': '💵',
            'Uncategorized': '❓'
        };

        // --- Changed: if transaction already has a category show a single badge (emoji + name + X) ---
        if (t.category) {
            const badge = document.createElement('div');
            badge.className = 'filter-badge category-badge';

            // determine badge type for coloring
            let badgeType = 'neutral';
            try {
                if (incomeCategories && incomeCategories.includes && incomeCategories.includes(t.category)) {
                    badgeType = 'income';
                } else if (expenseCategories && expenseCategories.includes && expenseCategories.includes(t.category)) {
                    badgeType = 'expense';
                }
            } catch (e) {
                badgeType = 'neutral';
            }
            if (badgeType !== 'neutral') badge.classList.add(badgeType);

            // Emoji part
            const emojiSpan = document.createElement('span');
            emojiSpan.className = 'badge-emoji';
            // Add a space after the emoji so the label is separated visually
            emojiSpan.textContent = (emojiMap[t.category] || '🔖') + ' ';
            badge.appendChild(emojiSpan);

            // Label
            const labelSpan = document.createElement('span');
            labelSpan.className = 'badge-label';
            labelSpan.textContent = t.category;
            badge.appendChild(labelSpan);

            // Clear button (X)
            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'filter-badge-clear category-badge-clear';
            clearBtn.setAttribute('aria-label', 'Remove category');
            clearBtn.innerHTML = '&times;';
            clearBtn.onclick = () => assignCategoryInOverview(t.hash, '', badge, index, t.type);
            clearBtn.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    clearBtn.click();
                }
            });
            badge.appendChild(clearBtn);

            // Try to color the badge using sankey colors if available
            const nodeColor = (incomeColors && incomeColors[t.category]) || (expenseColors && expenseColors[t.category]);
            if (nodeColor) {
                const bg = hexToRgba(nodeColor, 0.12);
                const border = hexToRgba(nodeColor, 0.28);
                badge.style.background = bg;
                badge.style.borderColor = border;
                badge.style.color = '#000';
            }

            categoryCell.appendChild(badge);
        } else {
            // --- No category: render inline clickable emoji spans to assign category ---
            categories.forEach(category => {
                const el = document.createElement('span');
                el.className = 'category-emoji-btn';
                el.setAttribute('role', 'button');
                el.setAttribute('tabindex', '0');
                el.title = category;
                el.textContent = emojiMap[category] || '🔖';
                if (t.category === category) el.classList.add('selected');

                // Click handler (same signature as before)
                el.onclick = () => assignCategoryInOverview(t.hash, category, el, index, t.type);

                // Keyboard support: Enter/Space activates the click
                el.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        el.click();
                    }
                });

                // If selected, try to set a darker background derived from sankey color
                if (t.category === category) {
                    const nodeColor = (incomeColors && incomeColors[category]) || (expenseColors && expenseColors[category]);
                    if (nodeColor) {
                        el.style.background = nodeColor;
                        el.style.borderColor = nodeColor;
                    }
                }

                categoryCell.appendChild(el);
            });
        }

        row.appendChild(categoryCell);

    // Comment field: show comment text and an Edit button; show input only when editing
    const commentCell = document.createElement('td');
    commentCell.className = 'comment-cell';

    const renderCommentView = () => {
        commentCell.innerHTML = '';
        const commentText = document.createElement('div');
        commentText.className = 'comment-text';
        commentText.style.whiteSpace = 'nowrap';
        commentText.style.overflow = 'hidden';
        commentText.style.textOverflow = 'ellipsis';
        commentText.style.maxWidth = '320px';
        commentText.textContent = t.comment || '';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'comment-edit-btn';
        // Use an inline SVG pencil icon instead of text, keep accessible labels
        const isEdit = Boolean(t.comment);
        editBtn.title = isEdit ? 'Edit comment' : 'Add comment';
        editBtn.setAttribute('aria-label', isEdit ? 'Edit comment' : 'Add comment');
        editBtn.style.marginLeft = '8px';
        editBtn.onclick = () => renderCommentEditor();

        // Inline SVG pencil icon (simple, small, monochrome)
        editBtn.innerHTML = `\
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">\
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" fill="currentColor"/>\
                <path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/>\
            </svg>`;

        commentCell.appendChild(commentText);
        commentCell.appendChild(editBtn);
    };

    const renderCommentEditor = () => {
        commentCell.innerHTML = '';
        const input = document.createElement('input');
        input.type = 'text';
        input.value = t.comment || '';
        input.placeholder = 'Add comment...';
        input.style.width = '100%';
        input.style.boxSizing = 'border-box';
        input.style.padding = '4px';
        input.style.border = '1px solid #ddd';
        input.style.borderRadius = '4px';

        const save = async () => {
            const comment = input.value.trim();
            try {
                const response = await fetch('/api/comment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hash: t.hash, comment: comment })
                });
                if (!response.ok) throw new Error('Failed to save comment');

                // Update in-memory
                if (t.type === 'income') {
                    const incomeIndex = transactionDetails[t.month].income.findIndex(tx => tx.hash === t.hash);
                    if (incomeIndex !== -1) transactionDetails[t.month].income[incomeIndex].comment = comment;
                } else {
                    const expenseIndex = transactionDetails[t.month].expenses.findIndex(tx => tx.hash === t.hash);
                    if (expenseIndex !== -1) transactionDetails[t.month].expenses[expenseIndex].comment = comment;
                }
                t.comment = comment; // update local
            } catch (err) {
                console.error('Error saving comment:', err);
                alert('Failed to save comment');
            } finally {
                renderCommentView();
            }
        };

        input.addEventListener('blur', save);
        input.addEventListener('keypress', (e) => { if (e.key === 'Enter') input.blur(); });

        commentCell.appendChild(input);
        // focus the input after attaching to DOM
        setTimeout(() => input.focus(), 0);
    };

    // Initial render
    renderCommentView();
    row.appendChild(commentCell);

    // Amount (right-most column)
    const amountCell = document.createElement('td');
    amountCell.className = t.type === 'income' ? 'amount-cell amount-positive' : 'amount-cell amount-negative';
    amountCell.textContent = t.amount.toFixed(2);
    amountCell.style.textAlign = 'right';
    row.appendChild(amountCell);
        
        tbody.appendChild(row);
    });
    
    // Add total row
    const total = allTransactions.reduce((sum, t) => sum + t.amount, 0);
    const totalRow = document.createElement('tr');
    totalRow.style.fontWeight = 'bold';
    totalRow.style.borderTop = '2px solid #333';
    
    // Now columns are: Date, Payer/Payee, Purpose, Category, Comment, Amount => 6 columns
    const totalLabelCell = document.createElement('td');
    totalLabelCell.colSpan = 5; // cover all except the Amount column
    totalLabelCell.textContent = 'Total';
    totalRow.appendChild(totalLabelCell);

    const totalAmountCell = document.createElement('td');
    totalAmountCell.textContent = total.toFixed(2);
    totalAmountCell.className = total >= 0 ? 'amount-cell amount-positive' : 'amount-cell amount-negative';
    totalAmountCell.style.textAlign = 'right';
    totalRow.appendChild(totalAmountCell);
    
    tbody.appendChild(totalRow);
    table.appendChild(tbody);
    
    // Find and replace/append table
    const contentDiv = document.getElementById('details-content');
    const existingTable = contentDiv.querySelector('table');
    if (existingTable) {
        existingTable.remove();
    }
    contentDiv.appendChild(table);
}

async function assignCategoryInOverview(hash, category, button, index, type) {
    // UI: if control is a select, optimistically update its dataset.prev; if an emoji/badge element, toggle selected class
    const control = button;
    let wasSelect = false;
    if (control && control.tagName && control.tagName.toLowerCase() === 'select') {
        wasSelect = true;
        control.dataset.prev = category; // optimistic
    } else if (control && control.classList) {
        // Toggle selection for emoji UI (support both '.category-emoji-btn' and legacy '.category-btn')
        const allButtons = control.parentElement ? control.parentElement.querySelectorAll('.category-emoji-btn, .category-btn') : [];
        allButtons.forEach(btn => btn.classList.remove('selected'));
        // If the control is a badge (clear action), there are no emoji buttons to mark; keep badge UI as-is until re-render
        if (control.classList.contains('category-emoji-btn') || control.classList.contains('category-btn')) {
            control.classList.add('selected');
        }
    }

    // Save to backend
    try {
        const response = await fetch('/api/category', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                hash: hash,
                category: category
            })
        });

        if (!response.ok) {
            throw new Error('Failed to save category');
        }

    console.log(`Category saved: ${category} for transaction ${hash.substring(0, 8)}...`);

        // Update the transaction in memory across all months
        currentMonths.forEach(month => {
            const details = transactionDetails[month];
            if (details) {
                // Find and update in income
                const incomeTransaction = details.income.find(t => t.hash === hash);
                if (incomeTransaction) {
                    incomeTransaction.category = category;
                }
                // Find and update in expenses
                const expenseTransaction = details.expenses.find(t => t.hash === hash);
                if (expenseTransaction) {
                    expenseTransaction.category = category;
                }
            }
        });

        // Re-render Sankey chart with updated categories
        renderRangeSankey(currentMonths);

        // Also re-render the transactions table so badges / emoji controls update immediately
        renderTransactionsTable();
    } catch (error) {
        console.error('Error saving category:', error);
        alert('Failed to save category. Please try again.');
        // Revert UI state
        if (wasSelect && control) {
            // rollback selection to previous value
            control.value = control.dataset.prev || '';
        } else if (control && control.parentElement) {
            const allButtons = control.parentElement.querySelectorAll('.category-emoji-btn, .category-btn');
            allButtons.forEach(btn => btn.classList.remove('selected'));
        }
    }
}

// Ensure only two interaction types:
// 1) dragging the handles (brush.filter already enforces this)
// 2) clicking anywhere in the chart -> focus handles on clicked month
svg.on('click', function(event) {
    try {
        // Ignore clicks that originate from brush handles, handle slots, axes or other interactive elements
        const ignoreSelectors = ['.handle', '.handle-slots', '.axis', '.sankey-node', '.sankey-link', '.category-emoji-btn', 'input', 'button', 'select', 'textarea'];
        for (const sel of ignoreSelectors) {
            if (event.target.closest && event.target.closest(sel)) return;
        }

        // Compute mouse x relative to this svg group
        const [mx] = d3.pointer(event, this);

        // Find nearest month center
        let nearest = monthPositions[0];
        let minDist = Math.abs(monthPositions[0].x - mx);
        for (let i = 1; i < monthPositions.length; i++) {
            const dist = Math.abs(monthPositions[i].x - mx);
            if (dist < minDist) {
                minDist = dist;
                nearest = monthPositions[i];
            }
        }

        if (nearest && typeof nearest.index === 'number') {
            selectMonth(nearest.index);
        }
    } catch (e) {
        console.error('svg click handler error', e);
    }
});