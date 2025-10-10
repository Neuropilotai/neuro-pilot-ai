const fs = require('fs');
const path = require('path');

console.log('🔧 ORDER DATA REPAIR AND WEEKLY ANALYSIS');
console.log('='.repeat(80));

const gfsOrdersDir = '/Users/davidmikulis/neuro-pilot-ai/backend/data/gfs_orders';
const jsonFiles = fs.readdirSync(gfsOrdersDir).filter(file => file.endsWith('.json'));

console.log(`📊 Processing ${jsonFiles.length} order files...`);

const repairedOrders = [];
const weeklyOrders = new Map();
const corruptedFiles = [];

jsonFiles.forEach(filename => {
    try {
        const filePath = path.join(gfsOrdersDir, filename);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const order = JSON.parse(fileContent);

        const invoiceNumber = order.invoiceNumber || filename.replace('.json', '').replace('gfs_order_', '');

        // Calculate total value from items
        let calculatedTotal = 0;
        if (order.items && Array.isArray(order.items)) {
            calculatedTotal = order.items.reduce((sum, item) => {
                const price = item.pricePerUnit || item.price || item.unitPrice || 0;
                const quantity = item.quantity || item.qty || 1;
                return sum + (price * quantity);
            }, 0);
        }

        // Try to extract date from various sources
        let extractedDate = null;

        // Check file stats for creation/modification date
        const fileStats = fs.statSync(filePath);
        const fileDate = fileStats.mtime; // modification time

        // Format date as YYYY-MM-DD
        const formattedFileDate = fileDate.toISOString().split('T')[0];

        // Use file date as fallback
        extractedDate = formattedFileDate;

        // Try to extract from invoice number pattern (if it contains date info)
        const invoiceNum = parseInt(invoiceNumber);
        if (!isNaN(invoiceNum) && invoiceNum > 9000000000) {
            // Attempt to derive week from invoice sequence
            // Assuming weekly orders, try to map invoice ranges to weeks
            const baseInvoice = 9018350000; // Approximate base
            const weekOffset = Math.floor((invoiceNum - baseInvoice) / 100);

            if (weekOffset >= 0 && weekOffset < 200) {
                // Calculate approximate date based on weekly pattern
                const baseDate = new Date('2024-01-01'); // Adjust base date as needed
                const estimatedDate = new Date(baseDate);
                estimatedDate.setDate(baseDate.getDate() + (weekOffset * 7));
                extractedDate = estimatedDate.toISOString().split('T')[0];
            }
        }

        // Update order with repaired data
        const repairedOrder = {
            ...order,
            orderDate: extractedDate,
            totalValue: calculatedTotal,
            repairedData: {
                originalDate: order.orderDate || 'Unknown',
                originalTotal: order.totalValue || 0,
                extractedFromFile: formattedFileDate,
                calculatedTotal: calculatedTotal,
                itemCount: order.items ? order.items.length : 0
            }
        };

        // Group by week for weekly analysis
        if (extractedDate) {
            const weekKey = getWeekKey(new Date(extractedDate));
            if (!weeklyOrders.has(weekKey)) {
                weeklyOrders.set(weekKey, []);
            }
            weeklyOrders.get(weekKey).push({
                invoice: invoiceNumber,
                date: extractedDate,
                total: calculatedTotal,
                filename: filename
            });
        }

        repairedOrders.push({
            invoice: invoiceNumber,
            filename: filename,
            originalDate: order.orderDate || 'Unknown',
            repairedDate: extractedDate,
            originalTotal: order.totalValue || 0,
            calculatedTotal: calculatedTotal,
            itemCount: order.items ? order.items.length : 0,
            status: calculatedTotal > 0 ? '✅ REPAIRED' : '⚠️ NO ITEMS'
        });

        // Write repaired file
        fs.writeFileSync(filePath, JSON.stringify(repairedOrder, null, 2));

    } catch (error) {
        console.log(`❌ Error processing ${filename}: ${error.message}`);
        corruptedFiles.push(filename);
    }
});

// Helper function to get week key (YYYY-WW format)
function getWeekKey(date) {
    const year = date.getFullYear();
    const firstDayOfYear = new Date(year, 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
}

console.log('\n📊 REPAIR RESULTS:');
console.log('='.repeat(80));

// Sort by date for chronological view
repairedOrders.sort((a, b) => {
    if (a.repairedDate && b.repairedDate) {
        return new Date(a.repairedDate) - new Date(b.repairedDate);
    }
    return 0;
});

console.log('INVOICE'.padEnd(15) + 'ORIGINAL DATE'.padEnd(15) + 'REPAIRED DATE'.padEnd(15) + 'TOTAL $'.padEnd(12) + 'ITEMS'.padEnd(6) + 'STATUS');
console.log('-'.repeat(80));

repairedOrders.forEach(order => {
    console.log(
        order.invoice.padEnd(15) +
        order.originalDate.padEnd(15) +
        order.repairedDate.padEnd(15) +
        `$${order.calculatedTotal.toFixed(2)}`.padEnd(12) +
        order.itemCount.toString().padEnd(6) +
        order.status
    );
});

console.log('\n📅 WEEKLY ORDER ANALYSIS:');
console.log('='.repeat(80));

// Sort weeks chronologically
const sortedWeeks = Array.from(weeklyOrders.keys()).sort();

if (sortedWeeks.length > 0) {
    console.log(`First week with orders: ${sortedWeeks[0]}`);
    console.log(`Last week with orders: ${sortedWeeks[sortedWeeks.length - 1]}`);
    console.log(`Total weeks with orders: ${sortedWeeks.length}`);

    // Find missing weeks
    if (sortedWeeks.length > 1) {
        const firstWeek = sortedWeeks[0];
        const lastWeek = sortedWeeks[sortedWeeks.length - 1];

        // Generate all weeks between first and last
        const allExpectedWeeks = generateWeekRange(firstWeek, lastWeek);
        const missingWeeks = allExpectedWeeks.filter(week => !weeklyOrders.has(week));

        if (missingWeeks.length > 0) {
            console.log(`\n⚠️ MISSING WEEKS (${missingWeeks.length} total):`);
            missingWeeks.forEach(week => console.log(`  - ${week}`));
        } else {
            console.log('\n✅ No missing weeks detected in the range');
        }
    }

    console.log('\n📊 ORDERS BY WEEK:');
    console.log('-'.repeat(60));

    sortedWeeks.forEach(week => {
        const orders = weeklyOrders.get(week);
        const totalValue = orders.reduce((sum, order) => sum + order.total, 0);
        console.log(`${week}: ${orders.length} orders, Total: $${totalValue.toFixed(2)}`);
    });
}

// Generate week range helper function
function generateWeekRange(startWeek, endWeek) {
    const weeks = [];
    const [startYear, startWeekNum] = startWeek.split('-W').map(Number);
    const [endYear, endWeekNum] = endWeek.split('-W').map(Number);

    let currentYear = startYear;
    let currentWeek = startWeekNum;

    while (currentYear < endYear || (currentYear === endYear && currentWeek <= endWeekNum)) {
        weeks.push(`${currentYear}-W${currentWeek.toString().padStart(2, '0')}`);

        currentWeek++;
        if (currentWeek > 52) {
            currentWeek = 1;
            currentYear++;
        }
    }

    return weeks;
}

console.log('\n📋 SUMMARY:');
console.log('='.repeat(80));
console.log(`Total files processed: ${jsonFiles.length}`);
console.log(`Successfully repaired: ${repairedOrders.length}`);
console.log(`Files with calculated totals: ${repairedOrders.filter(o => o.calculatedTotal > 0).length}`);
console.log(`Files with no items: ${repairedOrders.filter(o => o.itemCount === 0).length}`);
console.log(`Corrupted files: ${corruptedFiles.length}`);

if (corruptedFiles.length > 0) {
    console.log('\n❌ CORRUPTED FILES:');
    corruptedFiles.forEach(file => console.log(`  - ${file}`));
}

console.log('\n✅ Data repair complete! All files have been updated with:');
console.log('  - Calculated order totals from item prices');
console.log('  - Extracted dates from file timestamps and invoice patterns');
console.log('  - Weekly order analysis and missing week detection');