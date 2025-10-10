#!/usr/bin/env node

/**
 * Assign Order Dates to Invoices
 * Manually assign dates to invoices that couldn't be extracted from PDFs
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

console.log('');
console.log('📅 ASSIGN ORDER DATES TO INVOICES');
console.log('='.repeat(80));
console.log('');

const ordersDir = './data/gfs_orders';

// Find invoices without dates
const files = fs.readdirSync(ordersDir).filter(f => f.endsWith('.json'));
const noDates = [];

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(ordersDir, file), 'utf8'));
  if (!data.orderDate && data.financials && data.financials.total && data.items && data.items.length > 0) {
    noDates.push({
      invoice: data.invoiceNumber,
      total: data.financials.total,
      file: file,
      data: data
    });
  }
}

console.log(`Found ${noDates.length} invoices needing dates\n`);

// Manual date assignments (you provide these)
const manualDates = {
  // Format: 'INVOICE_NUMBER': 'YYYY-MM-DD'
  // Example: '9026031906': '2025-08-23'
};

async function assignDatesInteractively() {
  console.log('Enter dates for each invoice (format: MM/DD/YYYY or YYYY-MM-DD)');
  console.log('Press Enter to skip, type "q" to quit\n');

  for (let i = 0; i < noDates.length; i++) {
    const inv = noDates[i];
    console.log(`[${i + 1}/${noDates.length}] Invoice ${inv.invoice} - $${inv.total.toFixed(2)}`);

    const dateStr = await question('  Enter date (MM/DD/YYYY): ');

    if (dateStr.toLowerCase() === 'q') {
      console.log('\n❌ Cancelled by user');
      break;
    }

    if (!dateStr) {
      console.log('  ⏭️  Skipped\n');
      continue;
    }

    // Parse date
    let orderDate;
    if (dateStr.includes('/')) {
      // MM/DD/YYYY format
      const [month, day, year] = dateStr.split('/');
      orderDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    } else {
      // Assume YYYY-MM-DD
      orderDate = dateStr;
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) {
      console.log('  ❌ Invalid date format. Skipped\n');
      continue;
    }

    manualDates[inv.invoice] = orderDate;
    console.log(`  ✅ Assigned: ${orderDate}\n`);
  }

  rl.close();
}

async function assignDatesFromFile(datesFile) {
  console.log(`📋 Loading dates from ${datesFile}\n`);

  if (!fs.existsSync(datesFile)) {
    console.log('❌ Dates file not found');
    process.exit(1);
  }

  const content = fs.readFileSync(datesFile, 'utf8');
  const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));

  for (const line of lines) {
    const [invoice, dateStr] = line.split(',').map(s => s.trim());
    if (!invoice || !dateStr) continue;

    // Parse date
    let orderDate;
    if (dateStr.includes('/')) {
      const [month, day, year] = dateStr.split('/');
      orderDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    } else {
      orderDate = dateStr;
    }

    manualDates[invoice] = orderDate;
  }

  console.log(`✅ Loaded ${Object.keys(manualDates).length} dates\n`);
}

async function applyDates() {
  let updated = 0;

  for (const inv of noDates) {
    if (manualDates[inv.invoice]) {
      const orderDate = manualDates[inv.invoice];
      const filePath = path.join(ordersDir, inv.file);

      // Update the JSON file
      inv.data.orderDate = orderDate;
      fs.writeFileSync(filePath, JSON.stringify(inv.data, null, 2));

      console.log(`✅ ${inv.invoice}: ${orderDate}`);
      updated++;
    }
  }

  console.log('');
  console.log('📊 SUMMARY');
  console.log('-'.repeat(80));
  console.log(`Invoices updated: ${updated}`);
  console.log(`Invoices remaining: ${noDates.length - updated}`);
  console.log('');

  if (updated > 0) {
    console.log('🔄 Next Steps:');
    console.log('   1. Re-import data: node clean_import_real_data.js');
    console.log('   2. Check coverage: node analyze_invoice_coverage.js');
    console.log('   3. Verify totals: node verify_system_accuracy.js');
    console.log('');
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length > 0 && args[0] === '--file') {
    if (!args[1]) {
      console.log('❌ Please provide a dates file: --file dates.csv');
      process.exit(1);
    }
    await assignDatesFromFile(args[1]);
  } else if (args.length > 0 && args[0] === '--help') {
    console.log('Usage:');
    console.log('');
    console.log('  Interactive mode:');
    console.log('    node assign_invoice_dates.js');
    console.log('');
    console.log('  From file:');
    console.log('    node assign_invoice_dates.js --file dates.csv');
    console.log('');
    console.log('  File format (CSV):');
    console.log('    INVOICE_NUMBER,MM/DD/YYYY');
    console.log('    9026031906,08/23/2025');
    console.log('    9023349211,06/15/2025');
    console.log('');
    console.log('  Quick assign:');
    console.log('    node assign_invoice_dates.js --quick');
    console.log('    (Uses invoice_dates.csv if exists)');
    console.log('');
    rl.close();
    return;
  } else if (args.length > 0 && args[0] === '--quick') {
    if (fs.existsSync('invoice_dates.csv')) {
      await assignDatesFromFile('invoice_dates.csv');
    } else {
      console.log('❌ invoice_dates.csv not found');
      console.log('');
      console.log('Create a file named invoice_dates.csv with format:');
      console.log('INVOICE_NUMBER,MM/DD/YYYY');
      console.log('');
      rl.close();
      return;
    }
  } else {
    await assignDatesInteractively();
  }

  await applyDates();
}

main();
