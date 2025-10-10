#!/usr/bin/env node

/**
 * Export Inventory Count Sheet
 * Creates CSV file for physical inventory counting
 */

const fs = require('fs');
const path = require('path');
const EnterpriseInventoryManager = require('./enterprise_inventory_manager');

console.log('');
console.log('📄 EXPORT INVENTORY COUNT SHEET');
console.log('='.repeat(80));
console.log('');

async function main() {
  const manager = new EnterpriseInventoryManager();

  try {
    // Initialize the database connection
    await manager.initialize();

    // Check if cut-off date is configured
    let cutoffConfig = null;
    const configPath = path.join(__dirname, 'data', 'inventory_counts', 'current_count_config.json');

    if (fs.existsSync(configPath)) {
      cutoffConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log(`📅 Cut-off Date: ${cutoffConfig.cutoffDate}`);
      console.log(`   Including orders up to and including this date`);
      console.log(`   Excluding ${cutoffConfig.excludedOrders} orders after this date`);
      console.log('');
    }

    const items = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT
          ii.item_code,
          ii.description,
          im.category_id,
          ii.unit,
          SUM(ii.quantity) as expected_cases,
          SUM(ii.line_total) as expected_value,
          COUNT(DISTINCT ii.invoice_number) as order_count,
          MAX(ii.invoice_date) as last_order_date
        FROM invoice_items ii
        LEFT JOIN item_master im ON ii.item_code = im.item_code
        WHERE ii.status IN ('PLACED', 'READY_TO_COUNT')
          AND (ii.status != 'LOCKED' OR ii.status IS NULL)
        GROUP BY ii.item_code, ii.description, im.category_id, ii.unit
        ORDER BY im.category_id, ii.description
      `, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    console.log(`Found ${items.length} items to count`);
    if (cutoffConfig) {
      console.log(`Expected value (up to ${cutoffConfig.cutoffDate}): $${cutoffConfig.includedValue.toFixed(2)}`);
    }
    console.log('');

    // Create CSV content
    const csvLines = [];

    // Header
    csvLines.push('GL_Code,Item_Code,Description,Unit,Expected_Cases,Expected_Value,Counted_Cases,Notes');

    // Data rows
    for (const item of items) {
      const glCode = item.category_id || 'UNCATEGORIZED';
      const itemCode = item.item_code;
      const description = `"${item.description.replace(/"/g, '""')}"`;
      const unit = item.unit || 'CS';
      const expectedCases = item.expected_cases;
      const expectedValue = item.expected_value.toFixed(2);

      csvLines.push(`${glCode},${itemCode},${description},${unit},${expectedCases},${expectedValue},,`);
    }

    // Save to file
    const outputDir = path.join(__dirname, 'data', 'inventory_counts');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `inventory_count_sheet_${timestamp}.csv`;
    const filepath = path.join(outputDir, filename);

    fs.writeFileSync(filepath, csvLines.join('\n'));

    console.log('✅ Count sheet exported successfully');
    console.log('-'.repeat(80));
    console.log(`File: ${filepath}`);
    console.log(`Items: ${items.length}`);
    console.log('');

    // Also create a summary by category
    const byCategory = {};
    for (const item of items) {
      const cat = item.category_id || 'UNCATEGORIZED';
      if (!byCategory[cat]) {
        byCategory[cat] = {
          items: 0,
          expectedValue: 0
        };
      }
      byCategory[cat].items++;
      byCategory[cat].expectedValue += item.expected_value;
    }

    console.log('📊 Count Sheet Summary');
    console.log('-'.repeat(80));
    console.log('Category     | Items | Expected Value');
    console.log('-'.repeat(80));

    for (const [cat, data] of Object.entries(byCategory).sort()) {
      console.log(`${cat.padEnd(12)} | ${String(data.items).padStart(5)} | $${data.expectedValue.toFixed(2)}`);
    }

    console.log('');
    console.log('📝 Instructions:');
    console.log('-'.repeat(80));
    console.log('1. Open the CSV file in Excel or Google Sheets');
    console.log('2. Print the count sheet');
    console.log('3. During physical count, fill in the "Counted_Cases" column');
    console.log('4. Add any notes in the "Notes" column');
    console.log('5. Save the file with counts');
    console.log('6. Import using: node import_inventory_count.js [filename]');
    console.log('');

    manager.close();

  } catch (err) {
    console.error('❌ Error:', err.message);
    manager.close();
    process.exit(1);
  }
}

main();
