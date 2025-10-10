#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Check invoices without dates
const ordersDir = './data/gfs_orders';
const files = fs.readdirSync(ordersDir).filter(f => f.endsWith('.json'));

const noDates = [];
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(ordersDir, file), 'utf8'));
  if (!data.orderDate && data.financials && data.financials.total) {
    noDates.push({
      invoice: data.invoiceNumber,
      total: data.financials.total,
      extractionDate: data.extractionDate ? data.extractionDate.split('T')[0] : null,
      hasItems: data.items && data.items.length > 0
    });
  }
}

console.log('');
console.log('📋 Invoices Missing Order Dates:');
console.log('');
console.log('Invoice      | Value        | Has Items | Extraction Date');
console.log('-'.repeat(75));
noDates.forEach(inv => {
  const hasItems = inv.hasItems ? 'Yes' : 'No';
  console.log(`${inv.invoice} | $${String(inv.total.toFixed(2)).padStart(10)} | ${hasItems.padEnd(9)} | ${inv.extractionDate || 'Unknown'}`);
});
console.log('');
console.log(`Total: ${noDates.length} invoices`);
console.log(`Missing value: $${noDates.reduce((a,b) => a + b.total, 0).toFixed(2)}`);
console.log('');
