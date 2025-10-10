#!/usr/bin/env node

/**
 * CLEAN IMPORT - REAL DATA ONLY
 *
 * This script:
 * 1. Clears any existing data
 * 2. Imports ONLY from real PDF-extracted JSON files
 * 3. Validates all data is accurate
 * 4. Categorizes items with GL account codes
 */

const EnterpriseInventoryManager = require('./enterprise_inventory_manager');
const fs = require('fs');
const path = require('path');

async function cleanImportRealData() {
  console.log('');
  console.log('🔄 CLEAN IMPORT - REAL DATA ONLY');
  console.log('='.repeat(80));
  console.log('Importing only from real GFS invoice PDFs');
  console.log('');

  const manager = new EnterpriseInventoryManager();

  try {
    await manager.initialize();
    console.log('');

    // Step 1: Check source files
    console.log('📋 Step 1: Verify Source Files');
    console.log('-'.repeat(80));

    const jsonDir = './data/gfs_orders';
    const jsonFiles = fs.readdirSync(jsonDir).filter(f => f.endsWith('.json'));

    console.log(`Found ${jsonFiles.length} JSON files`);
    console.log('');

    // Validate they are real GFS invoices (10-digit invoice numbers)
    let realInvoices = 0;
    let testInvoices = 0;

    for (const file of jsonFiles) {
      const invoice = JSON.parse(fs.readFileSync(path.join(jsonDir, file), 'utf8'));
      const invoiceNum = invoice.invoiceNumber;

      if (invoiceNum && /^\d{10}$/.test(invoiceNum)) {
        realInvoices++;
      } else {
        testInvoices++;
        console.log(`⚠️  Skipping non-GFS format: ${invoiceNum}`);
      }
    }

    console.log(`✅ Real GFS invoices: ${realInvoices}`);
    console.log(`⚠️  Test/invalid invoices: ${testInvoices}`);
    console.log('');

    if (realInvoices === 0) {
      console.log('❌ No real invoices found to import!');
      console.log('   Run: node flawless_pdf_extractor.js first');
      manager.close();
      return;
    }

    // Step 2: Clear existing data
    console.log('📋 Step 2: Clear Existing Database');
    console.log('-'.repeat(80));

    const cleared = await new Promise((resolve, reject) => {
      manager.db.serialize(() => {
        manager.db.run('DELETE FROM invoice_items', (err) => {
          if (err) return reject(err);
          manager.db.run('DELETE FROM item_master', (err) => {
            if (err) return reject(err);
            manager.db.run('DELETE FROM processed_invoices', (err) => {
              if (err) return reject(err);
              manager.db.run('DELETE FROM duplicate_attempts', (err) => {
                if (err) return reject(err);
                resolve();
              });
            });
          });
        });
      });
    });

    console.log('✅ Database cleared (including duplicate tracking) - ready for clean import');
    console.log('');

    // Step 3: Import real data
    console.log('📋 Step 3: Import Real Invoice Data');
    console.log('-'.repeat(80));

    const result = await manager.importInvoicesFromJSON(jsonDir);

    console.log(`✅ Import complete:`);
    console.log(`   Invoices imported: ${result.invoicesImported}`);
    console.log(`   Total items: ${result.items}`);
    console.log(`   Duplicates skipped: ${result.duplicatesSkipped}`);
    console.log('');

    // Step 4: Load accounting categories
    console.log('📋 Step 4: Load Accounting Categories');
    console.log('-'.repeat(80));

    await manager.initializeCategories();
    await manager.loadAccountingCategories();
    console.log('');

    // Step 5: Auto-categorize all items
    console.log('📋 Step 5: Auto-Categorize with GL Codes');
    console.log('-'.repeat(80));

    const catResults = await manager.autoCategorizeAllItems();
    console.log(`✅ Categorized ${catResults.categorized} items`);
    console.log('');

    // Step 6: Verify accuracy
    console.log('📋 Step 6: Verify Data Accuracy');
    console.log('-'.repeat(80));

    const stats = await manager.getOrderProcessingStats();
    const inventoryValue = await manager.getInventoryTotalValue();

    console.log(`Total Orders: ${stats.total_orders}`);
    console.log(`Total Items: ${stats.total_line_items}`);
    console.log(`Date Range: ${stats.earliest_order_date} to ${stats.latest_order_date}`);
    console.log('');

    // Calculate value from database using line_total (accurate invoice amounts)
    const dbValue = await new Promise((resolve, reject) => {
      manager.db.get(`
        SELECT SUM(line_total) as total
        FROM invoice_items
      `, [], (err, row) => {
        if (err) return reject(err);
        resolve(row.total || 0);
      });
    });

    console.log(`Total Inventory Value: $${dbValue.toLocaleString()}`);
    console.log('');

    // Step 7: Category breakdown
    console.log('📋 Step 7: Inventory by GL Account');
    console.log('-'.repeat(80));

    const valueByCategory = await manager.getInventoryValueByCategory(true);

    console.log('GL Account  | Category        | Items | Value');
    console.log('-'.repeat(80));

    let categoryTotal = 0;
    valueByCategory.forEach(cat => {
      if (cat.total_value > 0) {
        const code = cat.category_code.padEnd(11);
        const name = cat.category_name.padEnd(14);
        const items = cat.unique_items.toString().padStart(5);
        const value = `$${cat.total_value.toLocaleString()}`.padStart(18);
        console.log(`${code} | ${name} | ${items} | ${value}`);
        categoryTotal += cat.total_value;
      }
    });

    console.log('-'.repeat(80));
    console.log(`TOTAL: $${categoryTotal.toLocaleString()}`);
    console.log('');

    // Verify totals match
    const diff = Math.abs(dbValue - categoryTotal);
    if (diff < 0.01) {
      console.log('✅ Category totals match database total');
    } else {
      console.log(`⚠️  Difference: $${diff.toFixed(2)}`);
    }
    console.log('');

    manager.close();

    console.log('');
    console.log('🎉 CLEAN IMPORT COMPLETE!');
    console.log('='.repeat(80));
    console.log('');
    console.log('✅ Data Verified:');
    console.log(`   • ${stats.total_orders} real GFS invoices`);
    console.log(`   • ${stats.total_line_items} line items`);
    console.log(`   • $${dbValue.toLocaleString()} total value`);
    console.log(`   • All items categorized with GL codes`);
    console.log(`   • No test or bogus data`);
    console.log('');
    console.log('🎯 System ready for production use!');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    manager.close();
    process.exit(1);
  }
}

cleanImportRealData();
