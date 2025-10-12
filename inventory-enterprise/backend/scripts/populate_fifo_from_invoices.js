/**
 * Populate FIFO Queue from Invoice Line Items
 * Creates initial FIFO layers for all products received
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
  console.log('🚀 Populating FIFO Queue from Invoice Line Items...\n');

  try {
    // Clear existing FIFO queue
    console.log('🧹 Clearing existing FIFO queue...');
    await dbRun('DELETE FROM inventory_fifo_queue');
    console.log('✅ Cleared\n');

    // Get all line items with their invoice dates
    console.log('📊 Loading line items from invoices...');
    const lineItems = await dbAll(`
      SELECT
        ili.product_code,
        ili.quantity,
        ili.invoice_number,
        ili.description,
        ili.unit,
        d.invoice_date,
        d.invoice_amount
      FROM invoice_line_items ili
      JOIN documents d ON ili.document_id = d.id
      WHERE d.invoice_date IS NOT NULL
      ORDER BY d.invoice_date ASC, ili.invoice_number ASC
    `);

    console.log(`✅ Found ${lineItems.length} line items to process\n`);

    let totalCases = 0;
    let productsTracked = new Set();

    // For each line item, create FIFO queue entries
    console.log('📦 Creating FIFO queue entries...\n');

    for (const item of lineItems) {
      // Estimate cost per unit (we don't have exact costs, so use invoice total / items as rough estimate)
      // In production, you'd get actual line item costs
      const estimatedCost = 10.00; // Placeholder - would come from invoice line item price

      // Insert into FIFO queue
      await dbRun(`
        INSERT INTO inventory_fifo_queue (
          product_code,
          quantity,
          unit_cost,
          received_date,
          invoice_number,
          lot_number,
          expiry_date,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, datetime('now'))
      `, [
        item.product_code,
        item.quantity,
        estimatedCost,
        item.invoice_date,
        item.invoice_number,
        `LOT-${item.invoice_number}-${item.product_code}` // Generate lot number
      ]);

      totalCases += item.quantity;
      productsTracked.add(item.product_code);

      if (totalCases % 500 === 0) {
        console.log(`  Processed ${totalCases} cases...`);
      }
    }

    console.log(`\n✅ Created ${totalCases} FIFO queue entries`);
    console.log(`✅ Tracking ${productsTracked.size} unique products\n`);

    // Update inventory current quantities based on FIFO queue
    console.log('📊 Updating inventory current quantities from FIFO...\n');

    for (const productCode of productsTracked) {
      const totalQty = await dbGet(`
        SELECT SUM(quantity) as total
        FROM inventory_fifo_queue
        WHERE product_code = ?
      `, [productCode]);

      await dbRun(`
        UPDATE inventory_items
        SET current_quantity = ?
        WHERE item_code = ?
      `, [totalQty.total || 0, productCode]);
    }

    console.log('✅ Updated inventory quantities\n');

    // Summary
    const fifoStats = await dbGet(`
      SELECT
        COUNT(*) as total_entries,
        COUNT(DISTINCT product_code) as unique_products,
        SUM(quantity) as total_cases
      FROM inventory_fifo_queue
    `);

    console.log('📊 FINAL FIFO SUMMARY:');
    console.log(`   Total FIFO Entries: ${fifoStats.total_entries}`);
    console.log(`   Unique Products Tracked: ${fifoStats.unique_products}`);
    console.log(`   Total Cases in FIFO: ${fifoStats.total_cases}`);
    console.log('\n✅ FIFO queue population complete!\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    db.close();
  }
}

main();
