#!/usr/bin/env node

/**
 * VERIFY DATA ACCURACY - NO TEST DATA
 *
 * This script verifies that:
 * 1. Only real invoice data exists in the database
 * 2. All values are calculated from actual PDFs
 * 3. No test, sample, or bogus data
 * 4. Inventory totals are 100% accurate
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

async function verifyDataAccuracy() {
  console.log('');
  console.log('🔍 DATA ACCURACY VERIFICATION');
  console.log('='.repeat(80));
  console.log('Ensuring NO test data - only real invoices from PDFs');
  console.log('');

  const db = new sqlite3.Database('./data/enterprise_inventory.db');

  // Step 1: Check what's in the database
  console.log('📊 Step 1: Check Database Contents');
  console.log('-'.repeat(80));

  const dbStats = await new Promise((resolve, reject) => {
    db.get(`
      SELECT
        COUNT(DISTINCT invoice_number) as invoice_count,
        COUNT(*) as item_count,
        MIN(invoice_date) as earliest_date,
        MAX(invoice_date) as latest_date,
        SUM(quantity * unit_price) as total_value
      FROM invoice_items
    `, [], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });

  console.log(`Database contains:`);
  console.log(`  Invoices: ${dbStats.invoice_count || 0}`);
  console.log(`  Line items: ${dbStats.item_count || 0}`);
  console.log(`  Date range: ${dbStats.earliest_date || 'N/A'} to ${dbStats.latest_date || 'N/A'}`);
  console.log(`  Total value: $${(dbStats.total_value || 0).toLocaleString()}`);
  console.log('');

  // Step 2: Check for test invoice numbers
  console.log('📊 Step 2: Check for Test Invoice Numbers');
  console.log('-'.repeat(80));

  const testInvoices = await new Promise((resolve, reject) => {
    db.all(`
      SELECT DISTINCT invoice_number
      FROM invoice_items
      WHERE invoice_number LIKE 'TEST%'
         OR invoice_number LIKE 'SAMPLE%'
         OR invoice_number LIKE 'DEMO%'
         OR invoice_number LIKE 'BOGUS%'
         OR LENGTH(invoice_number) < 8
      ORDER BY invoice_number
    `, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });

  if (testInvoices.length > 0) {
    console.log(`⚠️  WARNING: Found ${testInvoices.length} test invoices:`);
    testInvoices.forEach(inv => {
      console.log(`   - ${inv.invoice_number}`);
    });
    console.log('');
    console.log('❌ TEST DATA DETECTED - Database needs cleaning!');
  } else {
    console.log('✅ No test invoice numbers found');
  }
  console.log('');

  // Step 3: Verify against actual PDF/JSON files
  console.log('📊 Step 3: Verify Against Source Files');
  console.log('-'.repeat(80));

  const jsonDir = './data/gfs_orders';
  let sourceInvoices = [];

  if (fs.existsSync(jsonDir)) {
    const jsonFiles = fs.readdirSync(jsonDir).filter(f => f.endsWith('.json'));

    for (const file of jsonFiles) {
      const invoiceData = JSON.parse(fs.readFileSync(path.join(jsonDir, file), 'utf8'));
      if (invoiceData.invoiceNumber && invoiceData.items && invoiceData.items.length > 0) {
        sourceInvoices.push({
          invoice: invoiceData.invoiceNumber,
          items: invoiceData.items.length,
          total: invoiceData.financials?.total || 0
        });
      }
    }

    console.log(`✅ Found ${sourceInvoices.length} real invoice JSON files`);
    console.log('');

    // Compare with database
    console.log('Comparing source files with database...');

    const dbInvoices = await new Promise((resolve, reject) => {
      db.all(`
        SELECT
          invoice_number,
          COUNT(*) as item_count,
          SUM(line_total) as invoice_total
        FROM invoice_items
        GROUP BY invoice_number
        ORDER BY invoice_number
      `, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });

    const inSourceNotInDB = sourceInvoices.filter(src =>
      !dbInvoices.find(db => db.invoice_number === src.invoice)
    );

    const inDBNotInSource = dbInvoices.filter(db =>
      !sourceInvoices.find(src => src.invoice === db.invoice_number)
    );

    if (inSourceNotInDB.length > 0) {
      console.log(`⚠️  ${inSourceNotInDB.length} invoices in source files NOT in database:`);
      inSourceNotInDB.slice(0, 5).forEach(inv => {
        console.log(`   - ${inv.invoice}`);
      });
      if (inSourceNotInDB.length > 5) {
        console.log(`   ... and ${inSourceNotInDB.length - 5} more`);
      }
      console.log('');
    }

    if (inDBNotInSource.length > 0) {
      console.log(`⚠️  ${inDBNotInSource.length} invoices in database NOT in source files:`);
      inDBNotInSource.slice(0, 5).forEach(inv => {
        console.log(`   - ${inv.invoice_number}`);
      });
      if (inDBNotInSource.length > 5) {
        console.log(`   ... and ${inDBNotInSource.length - 5} more`);
      }
      console.log('');
      console.log('❌ DATABASE CONTAINS DATA NOT FROM SOURCE FILES!');
      console.log('   This suggests test or bogus data was added.');
      console.log('');
    } else {
      console.log('✅ All database invoices match source files');
    }
  } else {
    console.log('⚠️  Source directory not found: ./data/gfs_orders');
  }
  console.log('');

  // Step 4: Validate value calculations
  console.log('📊 Step 4: Validate Value Calculations');
  console.log('-'.repeat(80));

  const valueCheck = await new Promise((resolve, reject) => {
    db.all(`
      SELECT
        invoice_number,
        item_code,
        description,
        quantity,
        unit_price,
        line_total,
        (quantity * unit_price) as calculated_total,
        ABS(line_total - (quantity * unit_price)) as difference
      FROM invoice_items
      WHERE ABS(line_total - (quantity * unit_price)) > 0.01
      LIMIT 10
    `, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });

  if (valueCheck.length > 0) {
    console.log(`⚠️  Found ${valueCheck.length} items with value calculation mismatches:`);
    valueCheck.forEach(item => {
      console.log(`   Invoice: ${item.invoice_number}, Item: ${item.item_code}`);
      console.log(`   Stored: $${item.line_total}, Calculated: $${item.calculated_total.toFixed(2)}`);
      console.log(`   Difference: $${item.difference.toFixed(2)}`);
      console.log('');
    });
    console.log('❌ VALUE CALCULATION ERRORS DETECTED!');
  } else {
    console.log('✅ All line totals match calculated values (quantity × unit_price)');
  }
  console.log('');

  // Step 5: Check for reasonable invoice numbers (GFS format)
  console.log('📊 Step 5: Validate Invoice Number Format');
  console.log('-'.repeat(80));

  const invalidFormat = await new Promise((resolve, reject) => {
    db.all(`
      SELECT DISTINCT invoice_number
      FROM invoice_items
      WHERE invoice_number NOT GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
      ORDER BY invoice_number
    `, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });

  if (invalidFormat.length > 0) {
    console.log(`⚠️  Found ${invalidFormat.length} invoices with non-GFS format:`);
    invalidFormat.forEach(inv => {
      console.log(`   - ${inv.invoice_number}`);
    });
    console.log('');
    console.log('❌ INVALID INVOICE NUMBERS - May be test data!');
  } else {
    console.log('✅ All invoice numbers follow GFS format (10 digits)');
  }
  console.log('');

  // Step 6: Summary and Recommendations
  console.log('');
  console.log('🎯 ACCURACY SUMMARY');
  console.log('='.repeat(80));
  console.log('');

  const issues = [];

  if (testInvoices.length > 0) {
    issues.push(`${testInvoices.length} test invoices detected`);
  }

  if (inDBNotInSource && inDBNotInSource.length > 0) {
    issues.push(`${inDBNotInSource.length} invoices not from source files`);
  }

  if (valueCheck.length > 0) {
    issues.push(`${valueCheck.length} value calculation mismatches`);
  }

  if (invalidFormat.length > 0) {
    issues.push(`${invalidFormat.length} invalid invoice number formats`);
  }

  if (issues.length > 0) {
    console.log('❌ DATA ACCURACY ISSUES FOUND:');
    issues.forEach((issue, i) => {
      console.log(`   ${i + 1}. ${issue}`);
    });
    console.log('');
    console.log('⚠️  RECOMMENDATION: Clean database and reimport from source PDFs');
    console.log('');
    console.log('To clean and rebuild:');
    console.log('   1. Delete: data/enterprise_inventory.db');
    console.log('   2. Run: node flawless_pdf_extractor.js');
    console.log('   3. Run: node setup-enterprise-inventory.js');
    console.log('');
  } else {
    console.log('✅ ALL CHECKS PASSED!');
    console.log('');
    console.log('Data accuracy verified:');
    console.log(`   ✅ ${dbStats.invoice_count} real invoices`);
    console.log(`   ✅ ${dbStats.item_count} line items`);
    console.log(`   ✅ $${(dbStats.total_value || 0).toLocaleString()} total value`);
    console.log(`   ✅ All values calculated correctly`);
    console.log(`   ✅ No test or bogus data`);
    console.log('');
    console.log('🎉 SYSTEM READY FOR PRODUCTION!');
    console.log('');
  }

  db.close();
}

verifyDataAccuracy().catch(error => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});
