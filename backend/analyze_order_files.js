const fs = require('fs');
const path = require('path');

console.log('🔍 COMPREHENSIVE ORDER FILE ANALYSIS');
console.log('='.repeat(80));

// Check JSON files
const gfsOrdersDir = '/Users/davidmikulis/neuro-pilot-ai/backend/data/gfs_orders';
const jsonFiles = fs.readdirSync(gfsOrdersDir).filter(file => file.endsWith('.json'));

console.log(`📊 Found ${jsonFiles.length} JSON files`);
console.log('\n📅 ORDER FILES WITH DATES AND STATUS:');
console.log('-'.repeat(80));

const ordersByDate = [];
const corruptedFiles = [];
const missingDateFiles = [];
const missingValueFiles = [];

jsonFiles.forEach(filename => {
    try {
        const filePath = path.join(gfsOrdersDir, filename);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const order = JSON.parse(fileContent);

        const invoiceNumber = order.invoiceNumber || filename.replace('.json', '').replace('gfs_order_', '');
        const orderDate = order.orderDate || order.date || 'MISSING';
        const totalValue = order.totalValue || order.total || 0;
        const itemCount = order.items ? order.items.length : 0;

        let status = '✅ GOOD';
        if (orderDate === 'MISSING' || orderDate === 'Unknown') {
            status = '❌ NO DATE';
            missingDateFiles.push(filename);
        }
        if (totalValue === 0) {
            status += ' / ❌ NO VALUE';
            missingValueFiles.push(filename);
        }
        if (itemCount === 0) {
            status += ' / ❌ NO ITEMS';
        }

        console.log(`${invoiceNumber.padEnd(15)} | ${orderDate.padEnd(12)} | $${totalValue.toString().padEnd(8)} | ${itemCount.toString().padEnd(3)} items | ${status}`);

        ordersByDate.push({
            invoice: invoiceNumber,
            date: orderDate,
            value: totalValue,
            items: itemCount,
            filename: filename
        });

    } catch (error) {
        console.log(`${filename.padEnd(15)} | CORRUPTED    | ERROR    | ERR | ❌ CORRUPTED FILE`);
        corruptedFiles.push(filename);
    }
});

console.log('\n' + '='.repeat(80));
console.log('📊 SUMMARY STATISTICS:');
console.log('='.repeat(80));
console.log(`Total JSON files: ${jsonFiles.length}`);
console.log(`Files with missing dates: ${missingDateFiles.length}`);
console.log(`Files with no value: ${missingValueFiles.length}`);
console.log(`Corrupted files: ${corruptedFiles.length}`);

if (missingDateFiles.length > 0) {
    console.log('\n❌ FILES MISSING DATES:');
    missingDateFiles.forEach(file => console.log(`  - ${file}`));
}

if (corruptedFiles.length > 0) {
    console.log('\n❌ CORRUPTED FILES:');
    corruptedFiles.forEach(file => console.log(`  - ${file}`));
}

// Check for missing weeks based on invoice numbers
console.log('\n📅 WEEKLY ORDER PATTERN ANALYSIS:');
console.log('-'.repeat(80));

// Extract numeric invoice numbers and sort them
const invoiceNumbers = ordersByDate
    .map(order => parseInt(order.invoice))
    .filter(num => !isNaN(num))
    .sort((a, b) => a - b);

if (invoiceNumbers.length > 0) {
    console.log(`First invoice: ${invoiceNumbers[0]}`);
    console.log(`Last invoice: ${invoiceNumbers[invoiceNumbers.length - 1]}`);

    // Find gaps in sequence (assuming sequential weekly orders)
    const gaps = [];
    for (let i = 1; i < invoiceNumbers.length; i++) {
        const diff = invoiceNumbers[i] - invoiceNumbers[i-1];
        if (diff > 50000) { // Significant gap indicating missing weeks
            gaps.push({
                after: invoiceNumbers[i-1],
                before: invoiceNumbers[i],
                gap: diff
            });
        }
    }

    if (gaps.length > 0) {
        console.log('\n🔍 POTENTIAL MISSING WEEKS (Large gaps in invoice sequence):');
        gaps.forEach(gap => {
            console.log(`  Missing between ${gap.after} and ${gap.before} (gap: ${gap.gap})`);
        });
    } else {
        console.log('✅ No major gaps detected in invoice sequence');
    }
}

// Check PDF files
const pdfCount = fs.readdirSync('/Users/davidmikulis/neuro-pilot-ai/backend/data')
    .filter(file => file.endsWith('.pdf')).length;

console.log(`\n📄 PDF Files: ${pdfCount} found`);

console.log('\n' + '='.repeat(80));
console.log('🎯 RECOMMENDATIONS:');
console.log('='.repeat(80));

if (missingDateFiles.length > 0) {
    console.log(`1. Extract dates from ${missingDateFiles.length} files missing order dates`);
}
if (missingValueFiles.length > 0) {
    console.log(`2. Calculate totals for ${missingValueFiles.length} files missing values`);
}
if (corruptedFiles.length > 0) {
    console.log(`3. Repair or re-extract ${corruptedFiles.length} corrupted files`);
}

console.log('4. Consider implementing weekly order validation based on delivery schedule');