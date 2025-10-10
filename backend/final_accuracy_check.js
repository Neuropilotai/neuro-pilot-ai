#!/usr/bin/env node

/**
 * FINAL ACCURACY CHECK
 *
 * Check the ACTUAL production database to ensure:
 * 1. All data is real (no test data)
 * 2. All calculations are accurate
 * 3. Ready for launch
 */

const sqlite3 = require('sqlite3').verbose();

async function finalAccuracyCheck() {
  console.log('');
  console.log('🎯 FINAL ACCURACY CHECK - PRODUCTION READY?');
  console.log('='.repeat(80));
  console.log('');

  const db = new sqlite3.Database('./data/enterprise_inventory.db');

  try {
    // Check 1: What's in the database?
    console.log('📊 Database Status');
    console.log('-'.repeat(80));

    const summary = await new Promise((resolve, reject) => {
      db.get(`
        SELECT
          COUNT(DISTINCT invoice_number) as total_invoices,
          COUNT(*) as total_items,
          MIN(invoice_date) as earliest,
          MAX(invoice_date) as latest,
          SUM(quantity * unit_price) as total_value,
          SUM(CASE WHEN status = 'PENDING_PLACEMENT' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'PLACED' THEN 1 ELSE 0 END) as placed,
          SUM(CASE WHEN status = 'COUNTED' THEN 1 ELSE 0 END) as counted
        FROM invoice_items
      `, [], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (summary.total_invoices === 0) {
      console.log('❌ DATABASE IS EMPTY!');
      console.log('');
      console.log('To populate with REAL data:');
      console.log('   1. Ensure PDFs are in: data/invoices/');
      console.log('   2. Run: node flawless_pdf_extractor.js');
      console.log('   3. Run: node clean_import_real_data.js');
      console.log('');
      db.close();
      return;
    }

    console.log(`Total Invoices: ${summary.total_invoices}`);
    console.log(`Total Line Items: ${summary.total_items}`);
    console.log(`Date Range: ${summary.earliest} to ${summary.latest}`);
    console.log(`Total Value: $${(summary.total_value || 0).toLocaleString()}`);
    console.log('');
    console.log(`Status Breakdown:`);
    console.log(`  Pending Placement: ${summary.pending}`);
    console.log(`  Placed: ${summary.placed}`);
    console.log(`  Counted: ${summary.counted}`);
    console.log('');

    // Check 2: Look for test data
    console.log('📊 Test Data Check');
    console.log('-'.repeat(80));

    const testData = await new Promise((resolve, reject) => {
      db.all(`
        SELECT DISTINCT invoice_number
        FROM invoice_items
        WHERE invoice_number LIKE 'TEST%'
           OR invoice_number LIKE '%SAMPLE%'
           OR invoice_number LIKE '%DEMO%'
           OR invoice_number LIKE '%BOGUS%'
        LIMIT 10
      `, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });

    if (testData.length > 0) {
      console.log(`❌ TEST DATA FOUND:`);
      testData.forEach(t => console.log(`   - ${t.invoice_number}`));
      console.log('');
    } else {
      console.log('✅ No obvious test data patterns detected');
      console.log('');
    }

    // Check 3: Value accuracy
    console.log('📊 Value Calculation Accuracy');
    console.log('-'.repeat(80));

    const calculations = await new Promise((resolve, reject) => {
      db.all(`
        SELECT
          invoice_number,
          item_code,
          description,
          quantity,
          unit_price,
          line_total,
          (quantity * unit_price) as calculated,
          ABS(line_total - (quantity * unit_price)) as diff
        FROM invoice_items
        WHERE ABS(line_total - (quantity * unit_price)) > 0.02
        LIMIT 5
      `, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });

    if (calculations.length > 0) {
      console.log(`⚠️  Found calculation discrepancies:`);
      calculations.forEach(c => {
        console.log(`   ${c.invoice_number} - ${c.item_code}: ${c.description}`);
        console.log(`   Stored: $${c.line_total} | Calculated: $${c.calculated.toFixed(2)} | Diff: $${c.diff.toFixed(2)}`);
      });
      console.log('');
    } else {
      console.log('✅ All line totals match calculations (qty × price)');
      console.log('');
    }

    // Check 4: Recent invoices
    console.log('📊 Recent Invoices (Last 10)');
    console.log('-'.repeat(80));

    const recent = await new Promise((resolve, reject) => {
      db.all(`
        SELECT DISTINCT
          invoice_number,
          invoice_date,
          COUNT(*) as items,
          SUM(line_total) as total
        FROM invoice_items
        GROUP BY invoice_number, invoice_date
        ORDER BY invoice_date DESC
        LIMIT 10
      `, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });

    console.log('Invoice #    | Date       | Items | Total');
    console.log('-'.repeat(80));
    recent.forEach(r => {
      const inv = r.invoice_number.padEnd(12);
      const date = (r.invoice_date || 'N/A').padEnd(10);
      const items = r.items.toString().padStart(5);
      const total = `$${(r.total || 0).toLocaleString()}`.padStart(12);
      console.log(`${inv} | ${date} | ${items} | ${total}`);
    });
    console.log('');

    // Check for bogus dates
    const futureDates = recent.filter(r => r.invoice_date > '2025-12-31');
    if (futureDates.length > 0) {
      console.log('⚠️  WARNING: Found invoices with future dates!');
      console.log('   This suggests incorrect data or test invoices.');
      console.log('');
    }

    // Final recommendation
    console.log('');
    console.log('🎯 ACCURACY STATUS');
    console.log('='.repeat(80));
    console.log('');

    const issues = [];

    if (testData.length > 0) {
      issues.push('Test data patterns detected');
    }

    if (calculations.length > 0) {
      issues.push('Value calculation discrepancies found');
    }

    if (futureDates.length > 0) {
      issues.push('Future-dated invoices (likely bogus)');
    }

    if (summary.total_value === 0) {
      issues.push('Total inventory value is $0');
    }

    if (issues.length > 0) {
      console.log('❌ SYSTEM NOT READY FOR PRODUCTION');
      console.log('');
      console.log('Issues found:');
      issues.forEach((issue, i) => {
        console.log(`   ${i + 1}. ${issue}`);
      });
      console.log('');
      console.log('📋 Recommendation:');
      console.log('   Run: node clean_import_real_data.js');
      console.log('   This will clear and reimport from source PDFs only.');
      console.log('');
    } else {
      console.log('✅ SYSTEM READY FOR PRODUCTION!');
      console.log('');
      console.log('Summary:');
      console.log(`   • ${summary.total_invoices} real invoices`);
      console.log(`   • ${summary.total_items} line items`);
      console.log(`   • $${(summary.total_value || 0).toLocaleString()} total value`);
      console.log(`   • Dates: ${summary.earliest} to ${summary.latest}`);
      console.log(`   • All calculations accurate`);
      console.log(`   • No test or bogus data`);
      console.log('');
      console.log('🚀 Ready to launch!');
      console.log('');
    }

    db.close();

  } catch (error) {
    console.error('❌ Error:', error);
    db.close();
    process.exit(1);
  }
}

finalAccuracyCheck();
