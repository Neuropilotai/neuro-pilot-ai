#!/usr/bin/env node

/**
 * Inventory Variance Report
 * Shows discrepancies between expected and counted inventory
 */

const EnterpriseInventoryManager = require('./enterprise_inventory_manager');

console.log('');
console.log('📊 INVENTORY VARIANCE REPORT');
console.log('='.repeat(80));
console.log('');

async function main() {
  const manager = new EnterpriseInventoryManager();

  try {
    // Get latest count date
    const latestCount = await new Promise((resolve, reject) => {
      manager.db.get(`
        SELECT MAX(count_date) as latest_date
        FROM inventory_counts
      `, [], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (!latestCount || !latestCount.latest_date) {
      console.log('⚠️  No inventory counts found');
      console.log('');
      console.log('Run: node export_count_sheet.js to create a count sheet');
      console.log('');
      manager.close();
      return;
    }

    const countDate = latestCount.latest_date;
    console.log(`Count Date: ${countDate}`);
    console.log('');

    // Get all counts for this date
    const counts = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT
          ic.*,
          ii.description,
          im.category_id,
          ii.unit
        FROM inventory_counts ic
        LEFT JOIN invoice_items ii ON ic.item_code = ii.item_code
        LEFT JOIN item_master im ON ic.item_code = im.item_code
        WHERE ic.count_date = ?
        GROUP BY ic.item_code
        ORDER BY ABS(ic.variance_value) DESC
      `, [countDate], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    console.log(`Total Items Counted: ${counts.length}`);
    console.log('');

    // Summary statistics
    let totalVarianceValue = 0;
    let positiveVariances = 0;
    let negativeVariances = 0;
    let perfectCounts = 0;

    for (const count of counts) {
      totalVarianceValue += count.variance_value;
      if (count.variance > 0.01) positiveVariances++;
      else if (count.variance < -0.01) negativeVariances++;
      else perfectCounts++;
    }

    console.log('📈 Summary Statistics');
    console.log('-'.repeat(80));
    console.log(`Perfect Counts: ${perfectCounts} (${(perfectCounts/counts.length*100).toFixed(1)}%)`);
    console.log(`Over-counts: ${positiveVariances}`);
    console.log(`Under-counts: ${negativeVariances}`);
    console.log(`Total Variance Value: $${totalVarianceValue.toFixed(2)}`);
    console.log('');

    // Show significant variances
    const significantVariances = counts.filter(c => Math.abs(c.variance_value) > 10);

    if (significantVariances.length > 0) {
      console.log('⚠️  Significant Variances (>$10)');
      console.log('-'.repeat(80));
      console.log('Item Code | Description | Expected | Counted | Variance | Value');
      console.log('-'.repeat(80));

      for (const v of significantVariances.slice(0, 20)) {
        const desc = v.description ? v.description.substring(0, 30).padEnd(30) : 'Unknown'.padEnd(30);
        const expected = String(v.expected_quantity.toFixed(1)).padStart(8);
        const counted = String(v.counted_quantity.toFixed(1)).padStart(7);
        const variance = (v.variance > 0 ? '+' : '') + String(v.variance.toFixed(1)).padStart(7);
        const value = (v.variance_value > 0 ? '+' : '') + '$' + v.variance_value.toFixed(2);

        console.log(`${v.item_code} | ${desc} | ${expected} | ${counted} | ${variance} | ${value}`);
      }

      if (significantVariances.length > 20) {
        console.log(`... and ${significantVariances.length - 20} more`);
      }
      console.log('');
    }

    // Variance by category
    const byCategory = {};
    for (const count of counts) {
      const cat = count.category_id || 'UNCATEGORIZED';
      if (!byCategory[cat]) {
        byCategory[cat] = {
          items: 0,
          varianceValue: 0,
          variances: 0
        };
      }
      byCategory[cat].items++;
      byCategory[cat].varianceValue += count.variance_value;
      if (Math.abs(count.variance) > 0.01) {
        byCategory[cat].variances++;
      }
    }

    console.log('📊 Variance by Category');
    console.log('-'.repeat(80));
    console.log('Category     | Items | Variances | Total Variance');
    console.log('-'.repeat(80));

    for (const [cat, data] of Object.entries(byCategory).sort()) {
      const catName = cat.padEnd(12);
      const items = String(data.items).padStart(5);
      const variances = String(data.variances).padStart(9);
      const value = (data.varianceValue > 0 ? '+' : '') + '$' + data.varianceValue.toFixed(2);
      console.log(`${catName} | ${items} | ${variances} | ${value}`);
    }

    console.log('');
    console.log('✅ Variance report complete');
    console.log('');

    manager.close();

  } catch (err) {
    console.error('❌ Error:', err.message);
    manager.close();
    process.exit(1);
  }
}

main();
