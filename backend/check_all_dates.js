#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const jsonDir = './data/gfs_orders';
const files = fs.readdirSync(jsonDir).filter(f => f.endsWith('.json'));

console.log('Invoice Number | Order Date   | Extraction Date | Has Items');
console.log('-'.repeat(80));

const invoicesWithDates = [];

files.forEach(file => {
  const invoice = JSON.parse(fs.readFileSync(path.join(jsonDir, file), 'utf8'));

  const invoiceNum = invoice.invoiceNumber;
  const orderDate = invoice.orderDate || 'NULL';
  const extractDate = invoice.extractionDate ? invoice.extractionDate.split('T')[0] : 'NULL';
  const hasItems = (invoice.items && invoice.items.length > 0) ? 'YES' : 'NO';

  console.log(`${invoiceNum} | ${orderDate} | ${extractDate} | ${hasItems}`);

  if (orderDate !== 'NULL' && orderDate !== null) {
    invoicesWithDates.push({
      number: invoiceNum,
      date: orderDate,
      file: file
    });
  }
});

console.log('');
console.log(`Total invoices with orderDate: ${invoicesWithDates.length}`);

// Show date range
if (invoicesWithDates.length > 0) {
  invoicesWithDates.sort((a, b) => new Date(a.date) - new Date(b.date));
  console.log(`Earliest: ${invoicesWithDates[0].date} (${invoicesWithDates[0].number})`);
  console.log(`Latest: ${invoicesWithDates[invoicesWithDates.length - 1].date} (${invoicesWithDates[invoicesWithDates.length - 1].number})`);
}
