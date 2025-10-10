const fs = require('fs');
const path = require('path');

console.log('📄 ANALYZING MISSING PDF ORDER FILES');
console.log('='.repeat(80));

// Check for PDF files in data directory
const dataDir = '/Users/davidmikulis/neuro-pilot-ai/backend/data';
const gfsOrdersDir = '/Users/davidmikulis/neuro-pilot-ai/backend/data/gfs_orders';

console.log('🔍 CHECKING PDF FILES...');
console.log('-'.repeat(40));

// Look for PDF files
let pdfFiles = [];
try {
    const files = fs.readdirSync(dataDir);
    pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));
    console.log(`📄 PDF files found in data directory: ${pdfFiles.length}`);

    if (pdfFiles.length > 0) {
        pdfFiles.forEach((file, index) => {
            const filePath = path.join(dataDir, file);
            const stats = fs.statSync(filePath);
            console.log(`  ${index + 1}. ${file} (${(stats.size / 1024).toFixed(1)} KB) - ${stats.mtime.toDateString()}`);
        });
    } else {
        console.log('  ❌ No PDF files found in data directory');
    }
} catch (error) {
    console.log(`  ❌ Error reading data directory: ${error.message}`);
}

console.log('\n🗂️ CHECKING JSON ORDER FILES...');
console.log('-'.repeat(40));

// Analyze JSON files to understand order pattern
let jsonFiles = [];
const ordersByWeek = new Map();
const invoiceNumbers = [];

try {
    jsonFiles = fs.readdirSync(gfsOrdersDir).filter(file => file.endsWith('.json'));
    console.log(`📊 JSON order files found: ${jsonFiles.length}`);

    jsonFiles.forEach(filename => {
        try {
            const filePath = path.join(gfsOrdersDir, filename);
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const order = JSON.parse(fileContent);

            const invoiceNumber = order.invoiceNumber || filename.replace('.json', '').replace('gfs_order_', '');
            const orderDate = order.orderDate || 'Unknown';

            if (invoiceNumber && !isNaN(parseInt(invoiceNumber))) {
                invoiceNumbers.push(parseInt(invoiceNumber));
            }

            // Group by week if we have a date
            if (orderDate && orderDate !== 'Unknown') {
                const date = new Date(orderDate);
                const weekKey = getWeekKey(date);

                if (!ordersByWeek.has(weekKey)) {
                    ordersByWeek.set(weekKey, []);
                }
                ordersByWeek.get(weekKey).push({
                    invoice: invoiceNumber,
                    filename: filename,
                    date: orderDate
                });
            }
        } catch (error) {
            console.log(`  ⚠️ Error reading ${filename}: ${error.message}`);
        }
    });
} catch (error) {
    console.log(`  ❌ Error reading GFS orders directory: ${error.message}`);
}

// Helper function to get week key
function getWeekKey(date) {
    const year = date.getFullYear();
    const firstDayOfYear = new Date(year, 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
}

// Analyze invoice number gaps
console.log('\n📈 INVOICE NUMBER ANALYSIS:');
console.log('-'.repeat(40));

if (invoiceNumbers.length > 0) {
    invoiceNumbers.sort((a, b) => a - b);

    console.log(`First invoice: ${invoiceNumbers[0]}`);
    console.log(`Last invoice: ${invoiceNumbers[invoiceNumbers.length - 1]}`);
    console.log(`Total invoices: ${invoiceNumbers.length}`);

    // Find gaps in invoice sequence
    const gaps = [];
    for (let i = 1; i < invoiceNumbers.length; i++) {
        const current = invoiceNumbers[i];
        const previous = invoiceNumbers[i - 1];
        const gap = current - previous;

        if (gap > 1) {
            // Calculate how many numbers are missing
            const missingCount = gap - 1;
            const missingStart = previous + 1;
            const missingEnd = current - 1;

            gaps.push({
                after: previous,
                before: current,
                missingStart: missingStart,
                missingEnd: missingEnd,
                missingCount: missingCount
            });
        }
    }

    if (gaps.length > 0) {
        console.log(`\n🔍 MISSING INVOICE NUMBERS (${gaps.length} gaps found):`);
        gaps.forEach((gap, index) => {
            console.log(`\n  Gap ${index + 1}:`);
            console.log(`    After invoice: ${gap.after}`);
            console.log(`    Before invoice: ${gap.before}`);
            console.log(`    Missing range: ${gap.missingStart} - ${gap.missingEnd}`);
            console.log(`    Missing count: ${gap.missingCount} invoices`);

            // List individual missing numbers for smaller gaps
            if (gap.missingCount <= 10) {
                const missingList = [];
                for (let num = gap.missingStart; num <= gap.missingEnd; num++) {
                    missingList.push(num);
                }
                console.log(`    Missing invoices: ${missingList.join(', ')}`);
            }
        });
    } else {
        console.log('✅ No gaps in invoice sequence');
    }
}

// Analyze weekly pattern
console.log('\n📅 WEEKLY ORDER PATTERN:');
console.log('-'.repeat(40));

if (ordersByWeek.size > 0) {
    const sortedWeeks = Array.from(ordersByWeek.keys()).sort();

    console.log(`Weeks with orders: ${sortedWeeks.length}`);
    console.log(`First week: ${sortedWeeks[0]}`);
    console.log(`Last week: ${sortedWeeks[sortedWeeks.length - 1]}`);

    // Generate expected weeks between first and last
    if (sortedWeeks.length > 1) {
        const expectedWeeks = generateWeekRange(sortedWeeks[0], sortedWeeks[sortedWeeks.length - 1]);
        const missingWeeks = expectedWeeks.filter(week => !ordersByWeek.has(week));

        if (missingWeeks.length > 0) {
            console.log(`\n⚠️ MISSING WEEKS (${missingWeeks.length} total):`);
            missingWeeks.forEach((week, index) => {
                const weekDate = getWeekDate(week);
                console.log(`  ${index + 1}. ${week} (week of ${weekDate})`);
            });
        }
    }

    console.log(`\n📊 ORDERS BY WEEK:`);
    sortedWeeks.forEach(week => {
        const orders = ordersByWeek.get(week);
        console.log(`  ${week}: ${orders.length} orders`);
    });
}

// Helper functions
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

function getWeekDate(weekString) {
    const [year, weekNum] = weekString.split('-W').map(Number);
    const firstDayOfYear = new Date(year, 0, 1);
    const daysToAdd = (weekNum - 1) * 7;
    const weekDate = new Date(firstDayOfYear.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
    return weekDate.toDateString();
}

console.log('\n' + '='.repeat(80));
console.log('🎯 SUMMARY:');
console.log('='.repeat(80));
console.log(`PDF files available: ${pdfFiles.length}`);
console.log(`JSON order files: ${jsonFiles.length}`);
console.log(`Processed invoices: ${invoiceNumbers.length}`);
console.log(`Weeks with orders: ${ordersByWeek.size}`);

if (pdfFiles.length === 0) {
    console.log('\n❌ NO PDF FILES FOUND!');
    console.log('This explains why you have JSON files but may be missing some orders.');
    console.log('PDF files are likely in a different location or need to be re-downloaded.');
}

console.log('\n💡 RECOMMENDATIONS:');
console.log('1. Check if PDF files are stored in a different directory');
console.log('2. Verify your OneDrive sync is working for PDF files');
console.log('3. Look for missing invoice numbers in the gaps identified above');
console.log('4. Contact your supplier about missing weekly deliveries');