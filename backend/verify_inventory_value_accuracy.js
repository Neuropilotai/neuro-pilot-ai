#!/usr/bin/env node

/**
 * VERIFY INVENTORY VALUE ACCURACY
 *
 * This script verifies that inventory total value is 100% accurate by:
 * 1. Calculating values directly from JSON files
 * 2. Comparing with database calculations
 * 3. Verifying line-by-line accuracy
 * 4. Checking for rounding errors
 */

const fs = require('fs');
const path = require('path');
const EnterpriseInventoryManager = require('./enterprise_inventory_manager');

async function verifyInventoryValueAccuracy() {
  console.log('');
  console.log('🔍 INVENTORY VALUE ACCURACY VERIFICATION');
  console.log('='.repeat(80));
  console.log('');

  // Step 1: Calculate from source JSON files
  console.log('📊 Step 1: Calculating from source JSON files');
  console.log('-'.repeat(80));

  const jsonDir = path.join(__dirname, 'data/gfs_orders');
  const jsonFiles = fs.readdirSync(jsonDir).filter(f => f.endsWith('.json'));

  let sourceCalculation = {
    totalInvoices: 0,
    totalItems: 0,
    totalValue: 0,
    byStatus: {
      all: { items: 0, value: 0 }
    }
  };

  for (const file of jsonFiles) {
    const invoice = JSON.parse(fs.readFileSync(path.join(jsonDir, file), 'utf8'));

    if (!invoice.items || invoice.items.length === 0) continue;

    sourceCalculation.totalInvoices++;

    for (const item of invoice.items) {
      sourceCalculation.totalItems++;

      const itemValue = (item.quantity || 0) * (item.unitPrice || 0);
      sourceCalculation.totalValue += itemValue;
      sourceCalculation.byStatus.all.items++;
      sourceCalculation.byStatus.all.value += itemValue;
    }
  }

  console.log(`✅ Source JSON files processed: ${sourceCalculation.totalInvoices} invoices`);
  console.log(`   Total items: ${sourceCalculation.totalItems}`);
  console.log(`   Total value: $${sourceCalculation.totalValue.toFixed(2)}`);
  console.log('');

  // Step 2: Calculate from database
  console.log('📊 Step 2: Calculating from database');
  console.log('-'.repeat(80));

  const manager = new EnterpriseInventoryManager();
  await manager.initialize();

  const dbValue = await manager.getInventoryTotalValue();
  const dbValueByStatus = await manager.getInventoryValueByStatus();
  const orderStats = await manager.getOrderProcessingStats();

  console.log(`✅ Database query completed`);
  console.log(`   Inventory value (PLACED + COUNTED): $${dbValue.total_value}`);
  console.log(`   Unique items: ${dbValue.unique_items}`);
  console.log(`   Total line items: ${dbValue.total_line_items}`);
  console.log(`   Total quantity: ${dbValue.total_quantity}`);
  console.log('');

  console.log('📋 Value by status:');
  let dbTotalValue = 0;
  dbValueByStatus.forEach(status => {
    console.log(`   ${status.status}: $${status.total_value.toFixed(2)} (${status.item_count} items)`);
    dbTotalValue += status.total_value;
  });
  console.log(`   TOTAL: $${dbTotalValue.toFixed(2)}`);
  console.log('');

  // Step 3: Verify calculation method
  console.log('📊 Step 3: Verifying calculation method');
  console.log('-'.repeat(80));

  const manualVerification = await new Promise((resolve, reject) => {
    manager.db.all(`
      SELECT
        invoice_number,
        item_code,
        quantity,
        unit_price,
        line_total,
        status,
        (quantity * unit_price) as calculated_value
      FROM invoice_items
      ORDER BY invoice_number, item_code
    `, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });

  let verificationTotal = 0;
  let discrepancies = [];

  for (const row of manualVerification) {
    const calculatedValue = row.quantity * row.unit_price;
    verificationTotal += calculatedValue;

    // Check if line_total matches calculated value
    if (row.line_total && Math.abs(row.line_total - calculatedValue) > 0.01) {
      discrepancies.push({
        invoice: row.invoice_number,
        item: row.item_code,
        lineTotal: row.line_total,
        calculated: calculatedValue,
        difference: row.line_total - calculatedValue
      });
    }
  }

  console.log(`✅ Manual verification completed`);
  console.log(`   Total rows checked: ${manualVerification.length}`);
  console.log(`   Calculated total: $${verificationTotal.toFixed(2)}`);
  console.log(`   Discrepancies found: ${discrepancies.length}`);

  if (discrepancies.length > 0) {
    console.log('');
    console.log('⚠️  LINE ITEM DISCREPANCIES:');
    discrepancies.slice(0, 10).forEach(d => {
      console.log(`   • Invoice ${d.invoice}, Item ${d.item}:`);
      console.log(`     Line Total: $${d.lineTotal.toFixed(2)}`);
      console.log(`     Calculated: $${d.calculated.toFixed(2)}`);
      console.log(`     Difference: $${d.difference.toFixed(2)}`);
    });
    if (discrepancies.length > 10) {
      console.log(`   ... and ${discrepancies.length - 10} more`);
    }
  }
  console.log('');

  // Step 4: Cross-verify with order stats
  console.log('📊 Step 4: Cross-verification with order stats');
  console.log('-'.repeat(80));

  console.log(`✅ Order processing statistics:`);
  console.log(`   Total orders: ${orderStats.total_orders}`);
  console.log(`   Processed orders: ${orderStats.processed_orders}`);
  console.log(`   Pending orders: ${orderStats.pending_orders}`);
  console.log(`   Total line items: ${orderStats.total_line_items}`);
  console.log(`   Processed items: ${orderStats.processed_items}`);
  console.log(`   Pending items: ${orderStats.pending_items}`);
  console.log('');

  // Step 5: Final accuracy report
  console.log('');
  console.log('🎯 ACCURACY REPORT');
  console.log('='.repeat(80));
  console.log('');

  const sourceTotal = parseFloat(sourceCalculation.totalValue.toFixed(2));
  const dbTotal = parseFloat(dbTotalValue.toFixed(2));
  const verificationTotalRounded = parseFloat(verificationTotal.toFixed(2));

  console.log('Value Comparison:');
  console.log(`   Source JSON files (all items):     $${sourceTotal.toLocaleString()}`);
  console.log(`   Database total (all statuses):     $${dbTotal.toLocaleString()}`);
  console.log(`   Manual verification (all items):   $${verificationTotalRounded.toLocaleString()}`);
  console.log(`   Database (PLACED + COUNTED only):  $${dbValue.total_value.toLocaleString()}`);
  console.log('');

  // Accuracy check
  const dbVsManual = Math.abs(dbTotal - verificationTotalRounded);
  const dbVsSource = Math.abs(dbTotal - sourceTotal);

  console.log('Accuracy Analysis:');
  console.log(`   DB vs Manual difference: $${dbVsManual.toFixed(2)}`);
  console.log(`   DB vs Source difference: $${dbVsSource.toFixed(2)}`);
  console.log('');

  if (dbVsManual < 0.01 && dbVsSource < 0.01) {
    console.log('✅ 100% ACCURACY VERIFIED!');
    console.log('   All calculation methods match exactly (within $0.01 tolerance)');
  } else if (dbVsManual < 1.00 && dbVsSource < 1.00) {
    console.log('✅ HIGH ACCURACY ACHIEVED');
    console.log('   Minor rounding differences detected (< $1.00)');
  } else {
    console.log('⚠️  ACCURACY ISSUES DETECTED');
    console.log('   Significant differences found - review required');
  }
  console.log('');

  // Calculation method explanation
  console.log('📝 Calculation Method:');
  console.log('   Inventory Value = SUM(quantity × unit_price) for all items');
  console.log('   Where status IN (\'PLACED\', \'COUNTED\')');
  console.log('');

  console.log('💡 Dashboard Display:');
  console.log('   Total Inventory Value: $' + dbValue.total_value.toLocaleString());
  console.log('   Breakdown by Status:');
  dbValueByStatus.forEach(status => {
    const percentage = dbTotalValue > 0 ? (status.total_value / dbTotalValue * 100).toFixed(1) : 0;
    console.log(`     ${status.status}: $${status.total_value.toLocaleString()} (${percentage}%)`);
  });
  console.log('');

  manager.close();

  console.log('✅ VERIFICATION COMPLETE');
  console.log('');
}

// Run verification
verifyInventoryValueAccuracy().catch(error => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});
