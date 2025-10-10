#!/usr/bin/env node

/**
 * Prepare First Inventory Count
 * Sets up the system for the first physical inventory count
 */

const EnterpriseInventoryManager = require('./enterprise_inventory_manager');

console.log('');
console.log('📦 PREPARE FIRST INVENTORY COUNT');
console.log('='.repeat(80));
console.log('');

async function main() {
  const manager = new EnterpriseInventoryManager();

  try {
    // Initialize the database connection
    await manager.initialize();

    // Get current inventory status
    const totals = await manager.getInventoryTotalValue();

    console.log('📊 Current System Status');
    console.log('-'.repeat(80));
    console.log(`Total Line Items: ${totals.total_line_items}`);
    console.log(`Unique Items: ${totals.unique_items}`);
    console.log(`Total Quantity (cases): ${totals.total_quantity}`);
    console.log(`Gross Value: $${totals.invoice_total.toFixed(2)}`);
    console.log(`Credits: $${totals.credit_total.toFixed(2)}`);
    console.log(`Net Value: $${totals.total_value.toFixed(2)}`);
    console.log('');

    // Get items that need to be counted
    console.log('📋 Preparing Count Sheet...');
    console.log('');

    const itemsToCount = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT
          ii.item_code,
          ii.description,
          im.category_id,
          SUM(ii.quantity) as total_ordered_cases,
          SUM(ii.line_total) as total_value,
          COUNT(DISTINCT ii.invoice_number) as order_count,
          MAX(ii.invoice_date) as last_order_date,
          ii.unit
        FROM invoice_items ii
        LEFT JOIN item_master im ON ii.item_code = im.item_code
        WHERE ii.status IN ('PENDING_PLACEMENT', 'PLACED')
        GROUP BY ii.item_code, ii.description, im.category_id, ii.unit
        ORDER BY im.category_id, ii.description
      `, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    console.log('✅ Count Sheet Ready');
    console.log('-'.repeat(80));
    console.log(`Total Items to Count: ${itemsToCount.length}`);
    console.log('');

    // Group by category
    const byCategory = {};
    for (const item of itemsToCount) {
      const cat = item.category_id || 'UNCATEGORIZED';
      if (!byCategory[cat]) {
        byCategory[cat] = {
          count: 0,
          value: 0
        };
      }
      byCategory[cat].count++;
      byCategory[cat].value += item.total_value;
    }

    console.log('📊 Items by Category');
    console.log('-'.repeat(80));
    console.log('Category     | Items | Expected Value');
    console.log('-'.repeat(80));

    for (const [cat, data] of Object.entries(byCategory)) {
      const catName = cat === 'UNCATEGORIZED' ? 'UNCATEGORIZED' : cat;
      console.log(`${catName.padEnd(12)} | ${String(data.count).padStart(5)} | $${data.value.toFixed(2)}`);
    }
    console.log('');

    // Mark all current items as placed (ready for counting)
    console.log('🔄 Marking items as PLACED (ready for first count)...');

    await new Promise((resolve, reject) => {
      manager.db.run(`
        UPDATE invoice_items
        SET status = 'PLACED',
            assigned_by = 'SYSTEM'
        WHERE status = 'PENDING_PLACEMENT'
      `, [], function(err) {
        if (err) return reject(err);
        console.log(`✅ ${this.changes} items marked as PLACED`);
        resolve();
      });
    });

    console.log('');
    console.log('📝 Next Steps:');
    console.log('-'.repeat(80));
    console.log('1. Export count sheet: node export_count_sheet.js');
    console.log('2. Print count sheet for physical counting');
    console.log('3. Perform physical count');
    console.log('4. Input counts: node input_inventory_count.js');
    console.log('5. Review variances: node inventory_variance_report.js');
    console.log('');
    console.log('🎯 System is ready for first inventory count!');
    console.log('');

    manager.close();

  } catch (err) {
    console.error('❌ Error:', err.message);
    manager.close();
    process.exit(1);
  }
}

main();
