#!/usr/bin/env node

/**
 * Find duplicate invoice files
 */

const fs = require('fs');
const path = require('path');

const jsonDir = './data/gfs_orders';
const files = fs.readdirSync(jsonDir).filter(f => f.endsWith('.json'));

// Group files by invoice number
const invoiceMap = {};

for (const file of files) {
  // Extract invoice number from filename
  let invoiceNumber;

  if (file.startsWith('gfs_order_')) {
    invoiceNumber = file.replace('gfs_order_', '').replace('.json', '');
  } else {
    invoiceNumber = file.replace('.json', '');
  }

  if (!invoiceMap[invoiceNumber]) {
    invoiceMap[invoiceNumber] = [];
  }

  invoiceMap[invoiceNumber].push(file);
}

// Find duplicates
const duplicates = [];

for (const [invoiceNumber, fileList] of Object.entries(invoiceMap)) {
  if (fileList.length > 1) {
    duplicates.push({
      invoiceNumber,
      files: fileList
    });
  }
}

console.log('');
console.log('🔍 DUPLICATE FILES FOUND');
console.log('='.repeat(80));
console.log('');

if (duplicates.length === 0) {
  console.log('✅ No duplicates found!');
  console.log('');
} else {
  console.log(`Found ${duplicates.length} invoices with duplicate files:`);
  console.log('');

  duplicates.sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber));

  for (const dup of duplicates) {
    console.log(`Invoice ${dup.invoiceNumber}:`);

    // Recommend which file to keep (prefer the one without gfs_order_ prefix)
    const fileToKeep = dup.files.find(f => !f.startsWith('gfs_order_')) || dup.files[0];
    const filesToRemove = dup.files.filter(f => f !== fileToKeep);

    console.log(`  ✅ KEEP:   ${fileToKeep}`);
    filesToRemove.forEach(f => {
      console.log(`  ❌ REMOVE: ${f}`);
    });
    console.log('');
  }

  console.log('='.repeat(80));
  console.log('');
  console.log('📋 REMOVAL COMMANDS:');
  console.log('');
  console.log('Run these commands to remove duplicate files:');
  console.log('');

  for (const dup of duplicates) {
    const fileToKeep = dup.files.find(f => !f.startsWith('gfs_order_')) || dup.files[0];
    const filesToRemove = dup.files.filter(f => f !== fileToKeep);

    filesToRemove.forEach(f => {
      console.log(`rm "./data/gfs_orders/${f}"`);
    });
  }

  console.log('');
  console.log(`Total files to remove: ${duplicates.reduce((sum, d) => sum + (d.files.length - 1), 0)}`);
  console.log('');
}
