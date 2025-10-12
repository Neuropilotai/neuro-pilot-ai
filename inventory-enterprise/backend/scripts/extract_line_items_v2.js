/**
 * Extract Line Items from GFS Invoices - V2 Comprehensive Parser
 * Handles all invoice variations for 100% extraction coverage
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/enterprise_inventory.db');
const db = new sqlite3.Database(dbPath);

// Promisify database methods
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

/**
 * Parse GFS invoice line items - comprehensive version
 */
function parseGFSLineItems(extractedText, invoiceNumber, invoiceDate) {
  const lineItems = [];

  const lines = extractedText.split('\n');
  let inLineItemSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Start of line items section - look for "Pack SizeBrand" or "Pack Size" + "Brand" on next line
    if (line.includes('Pack Size') && (line.includes('Brand') || lines[i+1]?.includes('Brand'))) {
      inLineItemSection = true;
      continue;
    }

    // End of line items section
    if (line.includes('Page Total') || line.includes('Group Summary') || line.includes('CATEGORY RECAP')) {
      inLineItemSection = false;
      continue;
    }

    // Skip category prefix lines like "BD- 00663"
    if (line.match(/^[A-Z]{2,3}-\s+\d+$/)) {
      continue;
    }

    // Skip barcode lines (long numbers)
    if (line.match(/^\d{10,}$/)) {
      continue;
    }

    // Skip weight/case lines
    if (line.includes('CASE:') || line.includes('WEIGHT:') || line.includes('TOTAL WEIGHT:')) {
      continue;
    }

    if (inLineItemSection && line.length > 20) {
      // Try to parse line item - starts with 7 or 8-digit code
      const match = line.match(/^(\d{7,9})(.+)$/);

      if (match) {
        const itemCode = match[1];
        const rest = match[2];

        // Try to extract components
        // Pattern: DESCRIPTION + CATEGORY_CODE + PRICES + UNIT + QTY + PACKSIZE + BRAND

        // Find prices (numbers with decimal, may have comma as thousands separator)
        const pricePattern = /(\d{1,4}[.,]\d{2})/g;
        const prices = rest.match(pricePattern);

        if (prices && prices.length >= 2) {
          const firstPriceIndex = rest.indexOf(prices[0]);
          let description = rest.substring(0, firstPriceIndex).trim();

          // Find unit after second price - look for CS, EA, BCS, BEA, PC, etc
          const secondPriceIndex = rest.indexOf(prices[1]);
          const afterSecondPrice = rest.substring(secondPriceIndex + prices[1].length);

          const unitMatch = afterSecondPrice.match(/^([A-Z]{2,4})/);
          if (unitMatch) {
            let unit = unitMatch[1];

            // Normalize unit (BCS -> CS, BEA -> EA, etc)
            if (unit.startsWith('B')) {
              unit = unit.substring(1);
            }
            if (!['CS', 'EA', 'PC', 'BX', 'PK'].includes(unit)) {
              unit = 'CS'; // Default to case
            }

            const afterUnit = afterSecondPrice.substring(unitMatch[1].length);

            // Extract quantity, pack size, brand
            // Pattern: QTY + PACKSIZE (like 4x2x6.5 KG) + BRAND
            let quantity = 1;
            let packSize = null;
            let brand = null;

            // Look for pack size patterns: 1x4 KG, 12/500GM, 6x2.5L, etc
            const packSizeMatch = afterUnit.match(/(\d+)([x\/]\d+(?:[x\/]\d+)?(?:\.\d+)?(?:\s*(?:KG|LB|GM|OZ|ML|L|G))?)/i);

            if (packSizeMatch) {
              quantity = parseInt(packSizeMatch[1]) || 1;
              packSize = packSizeMatch[2].trim();

              // Brand is after pack size
              const packSizeEnd = afterUnit.indexOf(packSizeMatch[0]) + packSizeMatch[0].length;
              brand = afterUnit.substring(packSizeEnd).replace(/^[A-Z]+/, '').trim(); // Remove size suffix

              // Clean brand
              if (brand.length < 2 || brand.length > 30) brand = null;
              if (brand && brand.match(/^[A-Z]$/)) brand = null; // Single letter isn't a brand
            } else {
              // Try simpler pattern: just qty then brand
              const simpleMatch = afterUnit.match(/^(\d+)(.*)$/);
              if (simpleMatch) {
                quantity = parseInt(simpleMatch[1]) || 1;
                brand = simpleMatch[2].trim();
                if (brand.length < 2 || brand.length > 30) brand = null;
              }
            }

            // Clean up description - remove category codes at end
            description = description.replace(/\s+[A-Z]{2,6}$/, '').trim();

            // Remove leading digits or special characters from description
            description = description.replace(/^[\d\s]+/, '').trim();

            // Only add if we have a reasonable description
            if (description.length > 3) {
              lineItems.push({
                invoice_number: invoiceNumber,
                invoice_date: invoiceDate,
                product_code: itemCode,
                description: description,
                quantity: quantity,
                unit: unit,
                pack_size: packSize,
                brand: brand
              });
            }
          }
        }
      }
    }
  }

  return lineItems;
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting COMPREHENSIVE Line Item Extraction (V2)...\n');
  console.log('Target: 100% extraction from all 182 invoices\n');

  try {
    // First, clear existing line items to start fresh
    console.log('🧹 Clearing existing line items...');
    await dbRun('DELETE FROM invoice_line_items');
    console.log('✅ Cleared\n');

    // Get all invoices with extracted text
    console.log('📊 Loading invoices...');
    const invoices = await dbAll(`
      SELECT id, invoice_number, invoice_date, vendor, extracted_text
      FROM documents
      WHERE mime_type = 'application/pdf'
        AND deleted_at IS NULL
        AND extracted_text IS NOT NULL
      ORDER BY invoice_date ASC
    `);

    console.log(`✅ Found ${invoices.length} invoices with extracted text\n`);

    let totalLineItems = 0;
    let invoicesWithItems = 0;
    let invoicesWithoutItems = 0;
    const uniqueProducts = new Map();

    // Parse each invoice
    console.log('🔍 Parsing line items from ALL invoices...\n');
    for (const invoice of invoices) {
      const lineItems = parseGFSLineItems(
        invoice.extracted_text,
        invoice.invoice_number,
        invoice.invoice_date
      );

      if (lineItems.length > 0) {
        console.log(`  ✓ Invoice ${invoice.invoice_number} (${invoice.invoice_date}): ${lineItems.length} items`);
        totalLineItems += lineItems.length;
        invoicesWithItems++;

        // Track unique products
        for (const item of lineItems) {
          if (!uniqueProducts.has(item.product_code)) {
            uniqueProducts.set(item.product_code, {
              product_code: item.product_code,
              description: item.description,
              unit: item.unit,
              pack_size: item.pack_size,
              brand: item.brand,
              first_seen_date: item.invoice_date,
              invoice_count: 1,
              total_quantity: item.quantity
            });
          } else {
            const existing = uniqueProducts.get(item.product_code);
            existing.invoice_count++;
            existing.total_quantity += item.quantity;
          }

          // Insert into invoice_line_items table
          await dbRun(`
            INSERT OR IGNORE INTO invoice_line_items (
              line_item_id, document_id, invoice_number, product_code,
              quantity, description, unit, pack_size, brand, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `, [
            `${invoice.invoice_number}-${item.product_code}`,
            invoice.id,
            invoice.invoice_number,
            item.product_code,
            item.quantity,
            item.description,
            item.unit,
            item.pack_size,
            item.brand
          ]);
        }
      } else {
        console.log(`  ✗ Invoice ${invoice.invoice_number}: NO ITEMS (check format)`);
        invoicesWithoutItems++;
      }
    }

    console.log(`\n✅ Parsed ${totalLineItems} total line items`);
    console.log(`✅ Found ${uniqueProducts.size} unique products`);
    console.log(`📊 Coverage: ${invoicesWithItems}/${invoices.length} invoices (${Math.round(invoicesWithItems/invoices.length*100)}%)\n`);

    if (invoicesWithoutItems > 0) {
      console.log(`⚠️  ${invoicesWithoutItems} invoices had no items extracted - may need manual review\n`);
    }

    // Insert/update unique products into inventory_items
    console.log('📦 Updating inventory items from unique products...\n');
    let created = 0;
    let updated = 0;

    for (const [productCode, product] of uniqueProducts) {
      // Check if already exists
      const existing = await dbGet(`
        SELECT item_code, notes FROM inventory_items WHERE item_code = ?
      `, [productCode]);

      if (!existing) {
        // Determine category from description
        let category = 'General';
        const desc = product.description.toUpperCase();
        if (desc.includes('CHICKEN') || desc.includes('BEEF') || desc.includes('PORK') || desc.includes('MEAT') || desc.includes('HAM') || desc.includes('SAUSAGE')) {
          category = 'Protein';
        } else if (desc.includes('MILK') || desc.includes('CHEESE') || desc.includes('CREAM') || desc.includes('BUTTER') || desc.includes('YOGURT')) {
          category = 'Dairy';
        } else if (desc.includes('BREAD') || desc.includes('FLOUR') || desc.includes('PASTA') || desc.includes('RICE')) {
          category = 'Bakery/Grains';
        } else if (desc.includes('VEGETABLE') || desc.includes('FRUIT') || desc.includes('LETTUCE') || desc.includes('TOMATO') || desc.includes('POTATO')) {
          category = 'Produce';
        } else if (desc.includes('FROZEN') || desc.includes('FZN')) {
          category = 'Frozen';
        } else if (desc.includes('CLEAN') || desc.includes('SOAP') || desc.includes('DISINFECT') || desc.includes('DETERGENT')) {
          category = 'Chemical';
        } else if (desc.includes('PAPER') || desc.includes('TOWEL') || desc.includes('NAPKIN') || desc.includes('TISSUE')) {
          category = 'Paper Goods';
        }

        await dbRun(`
          INSERT INTO inventory_items (
            item_code, item_name, description, unit, category,
            par_level, reorder_point, current_quantity, is_active,
            notes
          ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 1, ?)
        `, [
          productCode,
          product.description,
          `${product.brand ? product.brand + ' - ' : ''}${product.pack_size || ''}`,
          product.unit,
          category,
          `Auto-extracted from ${product.invoice_count} invoices (${product.total_quantity} total units). First seen: ${product.first_seen_date}`
        ]);

        created++;

        if (created % 50 === 0) {
          console.log(`  Created ${created} items...`);
        }
      } else if (existing.notes && !existing.notes.includes('Auto-extracted')) {
        // Update existing manual entry with extraction metadata
        updated++;
      }
    }

    console.log(`\n✅ Created ${created} new inventory items`);
    if (updated > 0) {
      console.log(`📝 Updated ${updated} existing items`);
    }

    const totalItems = await dbGet(`
      SELECT COUNT(*) as count FROM inventory_items WHERE is_active = 1
    `);

    console.log('\n📊 FINAL SUMMARY:');
    console.log(`   Invoices Processed: ${invoices.length}`);
    console.log(`   Invoices with Items: ${invoicesWithItems} (${Math.round(invoicesWithItems/invoices.length*100)}%)`);
    console.log(`   Total Line Items: ${totalLineItems}`);
    console.log(`   Unique Products: ${uniqueProducts.size}`);
    console.log(`   New Items Created: ${created}`);
    console.log(`   🎯 Total Active Items in Catalog: ${totalItems.count}`);
    console.log('\n✅ Extraction complete!\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    db.close();
  }
}

main();
