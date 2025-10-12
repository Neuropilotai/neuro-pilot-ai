/**
 * Update Inventory Quantities and Create Basic FIFO Tracking
 * Calculates current quantities from line items and creates FIFO entries
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/enterprise_inventory.db');
const db = new sqlite3.Database(dbPath);

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

async function main() {
  console.log('🚀 Updating Inventory Quantities and Creating FIFO Tracking...\n');

  try {
    // Step 1: Update current quantities from line items
    console.log('📊 Calculating quantities from line items...');

    const products = await dbAll(`
      SELECT
        product_code,
        SUM(quantity) as total_quantity
      FROM invoice_line_items
      GROUP BY product_code
    `);

    console.log(`✅ Found ${products.length} products with quantities\n`);

    console.log('📝 Updating inventory items...');
    let updated = 0;
    for (const product of products) {
      await dbRun(`
        UPDATE inventory_items
        SET current_quantity = ?
        WHERE item_code = ?
      `, [product.total_quantity, product.product_code]);
      updated++;

      if (updated % 100 === 0) {
        console.log(`  Updated ${updated} items...`);
      }
    }

    console.log(`✅ Updated ${updated} inventory items\n`);

    // Step 2: Create simplified FIFO entries (one per line item)
    console.log('📦 Creating FIFO queue entries from line items...');

    // Clear existing
    await dbRun('DELETE FROM inventory_fifo_queue');

    const lineItems = await dbAll(`
      SELECT
        ili.line_item_id,
        ili.product_code,
        ili.quantity,
        ili.invoice_number,
        ili.description,
        d.invoice_date
      FROM invoice_line_items ili
      JOIN documents d ON ili.invoice_number = d.invoice_number
      WHERE d.invoice_date IS NOT NULL
      ORDER BY d.invoice_date ASC
    `);

    console.log(`✅ Processing ${lineItems.length} line items...\n`);

    let fifoEntries = 0;
    for (const item of lineItems) {
      // For each quantity unit, create individual FIFO entries
      for (let i = 0; i < item.quantity; i++) {
        const caseId = `CASE-${item.invoice_number}-${item.product_code}-${i+1}`;
        const queueId = `Q-${caseId}`;

        // Create a case entry
        await dbRun(`
          INSERT OR IGNORE INTO invoice_line_item_cases (
            case_id, line_item_id, case_number, weight, weight_unit,
            sequence_number, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `, [
          caseId,
          item.line_item_id,
          `${item.invoice_number}-${i+1}`,
          0.0, // Unknown weight
          'KG',
          i + 1,
          'IN_STOCK'
        ]);

        // Calculate priority from date
        const dateParts = item.invoice_date.split('-');
        const priorityScore = Math.floor(new Date(dateParts[0], dateParts[1]-1, dateParts[2]).getTime() / (1000*60*60*24));

        // Create FIFO queue entry
        await dbRun(`
          INSERT INTO inventory_fifo_queue (
            queue_id, product_code, case_id, invoice_number, invoice_date,
            case_number, weight, priority_score, status,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `, [
          queueId,
          item.product_code,
          caseId,
          item.invoice_number,
          item.invoice_date,
          `${item.invoice_number}-${i+1}`,
          0.0,
          priorityScore,
          'AVAILABLE'
        ]);

        fifoEntries++;
      }

      if (fifoEntries % 500 === 0) {
        console.log(`  Created ${fifoEntries} FIFO entries...`);
      }
    }

    console.log(`\n✅ Created ${fifoEntries} FIFO queue entries\n`);

    // Step 3: Summary
    const stats = await dbGet(`
      SELECT
        COUNT(*) as total_items,
        SUM(current_quantity) as total_stock
      FROM inventory_items
      WHERE is_active = 1
    `);

    const fifoStats = await dbGet(`
      SELECT
        COUNT(*) as total_entries,
        COUNT(DISTINCT product_code) as unique_products
      FROM inventory_fifo_queue
      WHERE status = 'AVAILABLE'
    `);

    console.log('📊 FINAL SUMMARY:');
    console.log(`   Inventory Items: ${stats.total_items}`);
    console.log(`   Total Stock Units: ${stats.total_stock}`);
    console.log(`   FIFO Entries: ${fifoStats.total_entries}`);
    console.log(`   Products in FIFO: ${fifoStats.unique_products}`);
    console.log('\n✅ Complete! Your inventory is now 100% populated with FIFO tracking.\n');

  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    db.close();
  }
}

main();
