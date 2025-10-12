/**
 * Load July 4, 2025 Inventory Baseline from Gordon Food Service PDF
 *
 * This script imports the inventory snapshot from the GFS order PDF
 * Total expected value: $243,339.79
 */

const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const sqlite3 = require('sqlite3').verbose();

const PDF_PATH = '/Users/davidmikulis/Desktop/inventory july 4 2025 $243,339.79 .pdf';
const DB_PATH = path.join(__dirname, '..', 'data', 'enterprise_inventory.db');

// Initialize database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Database connection error:', err);
    process.exit(1);
  }
  console.log('✅ Connected to database:', DB_PATH);
});

// Promisify database operations
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

/**
 * Parse PDF and extract line items
 */
async function parsePDF(pdfPath) {
  console.log('\n📄 Reading PDF:', pdfPath);

  const dataBuffer = fs.readFileSync(pdfPath);
  const pdfData = await pdf(dataBuffer);

  console.log('📝 PDF Pages:', pdfData.numpages);
  console.log('📝 Extracting line items...\n');

  const text = pdfData.text;
  const lines = text.split('\n');

  const items = [];
  let totalValue = 0;
  let totalQuantity = 0;

  // Pattern to match line items:
  // Line N: Description (French)
  // Line N+1: #PRODUCTCODE | Brand | Size info
  // Line N+2: Boîte/Unité [unitPrice]$ [qty] [total]$
  // Example:
  //   Pâtés impériaux aux légumes, amu...
  //   #1001042 | Wong Wing | 1.13 kilos...
  //   Boîte83,88 $6503,28 $

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Look for lines starting with # (product code)
    if (line.startsWith('#')) {
      // Extract product code
      const codeMatch = line.match(/^#(\d+)/);
      if (!codeMatch) continue;

      const productCode = codeMatch[1];

      // Get description from previous line
      const description = i > 0 ? lines[i - 1].trim() : '';
      if (!description) continue;

      // Get price line (next line)
      if (i + 1 >= lines.length) continue;
      const priceLine = lines[i + 1].trim();

      // Parse price line: "Boîte83,88 $6503,28 $"
      // or "Boîte50,83 $251 270,75 $"
      // Format: [UnitType][UnitPrice]$[Qty][Total]$

      // Extract all numbers and dollar amounts
      const priceMatch = priceLine.match(/(Boîte|Unité)([\d\s,]+)\$([\d\s]+)([\d\s,]+)\$/);
      if (!priceMatch) continue;

      const unitType = priceMatch[1];
      const unitPriceStr = priceMatch[2].replace(/\s/g, '').replace(',', '.');
      const quantityStr = priceMatch[3].replace(/\s/g, '');
      const totalStr = priceMatch[4].replace(/\s/g, '').replace(',', '.');

      const unitPrice = parseFloat(unitPriceStr);
      const quantity = parseFloat(quantityStr);
      const total = parseFloat(totalStr);

      // Skip if we couldn't parse numbers
      if (isNaN(total) || isNaN(unitPrice) || isNaN(quantity)) {
        continue;
      }

      // Skip lines with just dashes (no quantity)
      if (total === 0 || quantity === 0) continue;

      items.push({
        productCode: productCode,
        description: description,
        quantity: quantity,
        unitPrice: unitPrice,
        total: total,
        unitType: unitType
      });

      totalValue += total;
      totalQuantity += quantity;
    }
  }

  console.log(`✅ Parsed ${items.length} line items`);
  console.log(`📦 Total quantity: ${totalQuantity}`);
  console.log(`💰 Total value: $${totalValue.toFixed(2)}`);
  console.log(`🎯 Expected: $243,339.79`);
  console.log(`📊 Difference: $${Math.abs(totalValue - 243339.79).toFixed(2)}\n`);

  return { items, totalValue, totalQuantity };
}

/**
 * Import items into inventory_items table
 */
async function importItems(items) {
  console.log('📥 Importing items into database...\n');

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    try {
      // Check if item exists
      const existing = await dbGet(
        'SELECT id, item_code FROM inventory_items WHERE item_code = ?',
        [item.productCode]
      );

      if (existing) {
        // Update existing item
        await dbRun(`
          UPDATE inventory_items
          SET
            item_name = ?,
            current_quantity = ?,
            unit_cost = ?,
            updated_at = datetime('now')
          WHERE item_code = ?
        `, [
          item.description,
          item.quantity,
          item.unitPrice,
          item.productCode
        ]);
        updated++;
      } else {
        // Insert new item
        await dbRun(`
          INSERT INTO inventory_items (
            item_code,
            item_name,
            current_quantity,
            unit_cost,
            unit,
            category,
            reorder_point,
            par_level,
            is_active,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `, [
          item.productCode,
          item.description,
          item.quantity,
          item.unitPrice,
          'CS', // Default to cases
          'Food', // Default category
          0, // No reorder point set
          0, // No par level set
          1 // Active
        ]);
        imported++;
      }

      if ((imported + updated) % 50 === 0) {
        console.log(`  Progress: ${imported + updated} items processed...`);
      }

    } catch (error) {
      console.error(`❌ Error processing ${item.productCode}:`, error.message);
      skipped++;
    }
  }

  console.log('\n✅ Import complete!');
  console.log(`  📦 New items: ${imported}`);
  console.log(`  🔄 Updated items: ${updated}`);
  console.log(`  ⚠️  Skipped items: ${skipped}`);

  return { imported, updated, skipped };
}

/**
 * Verify the inventory value
 */
async function verifyInventory() {
  console.log('\n🔍 Verifying inventory value...\n');

  const result = await dbGet(`
    SELECT
      COUNT(*) as total_items,
      SUM(current_quantity) as total_quantity,
      SUM(current_quantity * unit_cost) as total_value
    FROM inventory_items
    WHERE is_active = 1 AND unit_cost > 0
  `);

  console.log(`📊 Inventory Summary:`);
  console.log(`  Items: ${result.total_items}`);
  console.log(`  Total Quantity: ${result.total_quantity}`);
  console.log(`  Total Value: $${(result.total_value || 0).toFixed(2)}`);
  console.log(`  Expected: $243,339.79`);
  console.log(`  Difference: $${Math.abs((result.total_value || 0) - 243339.79).toFixed(2)}`);

  return result;
}

/**
 * Main execution
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('📦 JULY 4, 2025 INVENTORY BASELINE IMPORT');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Parse PDF
    const { items, totalValue } = await parsePDF(PDF_PATH);

    if (items.length === 0) {
      console.error('❌ No items found in PDF');
      process.exit(1);
    }

    // Import items
    await importItems(items);

    // Verify
    await verifyInventory();

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✅ IMPORT COMPLETE');
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run
main();
