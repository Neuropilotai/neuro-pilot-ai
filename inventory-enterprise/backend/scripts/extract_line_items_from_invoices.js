/**
 * Extract Line Items from GFS Invoices
 * Builds complete inventory catalog from 183 invoices (Jan-Sep 2025)
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
 * Parse GFS invoice line items from extracted text
 */
function parseGFSLineItems(extractedText, invoiceNumber, invoiceDate) {
  const lineItems = [];

  // GFS format: Lines are concatenated like:
  // 15018746BEEF RIB SHORT CHUCK LONG CAB FZN F2FMT21.653,165.01CS64x2x2.6CAB
  // Pattern: 8-digit code + DESCRIPTION + category + prices + unit + qty + pack size + brand

  const lines = extractedText.split('\n');
  let inLineItemSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Start of line items section - look for "Pack SizeBrand" which is the last header line
    if (line.includes('Pack Size') && line.includes('Brand')) {
      inLineItemSection = true;
      continue;
    }

    // End of line items section
    if (line.includes('Page Total') || line.includes('Group Summary') || line.includes('CATEGORY RECAP')) {
      inLineItemSection = false;
      continue;
    }

    // Skip category prefix lines like "BD- 00663"
    if (line.match(/^[A-Z]{2}-\s+\d+$/)) {
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
      // Try to parse line item - starts with 8-digit code
      // Format: 15018746BEEF RIB SHORT CHUCK LONG CAB FZN F2FMT21.653,165.01CS64x2x2.6CAB
      const match = line.match(/^(\d{8})(.+)$/);

      if (match) {
        const itemCode = match[1];
        const rest = match[2];

        // Try to extract components from the concatenated string
        // Look for price patterns (numbers with optional comma and decimal)
        // Then CS or EA, then pack size pattern, then brand at end

        // Pattern: DESCRIPTION + optional_category + PRICE + PRICE + UNIT + QTY + PACKSIZE + BRAND
        // Example: BEEF RIB SHORT CHUCK LONG CAB FZN F2FMT21.653,165.01CS64x2x2.6CAB

        const pricePattern = /(\d+[.,]\d+)/g;
        const prices = rest.match(pricePattern);

        if (prices && prices.length >= 2) {
          // Find where prices start
          const firstPriceIndex = rest.indexOf(prices[0]);
          const description = rest.substring(0, firstPriceIndex).trim();

          // Find unit (CS or EA) after the second price
          const secondPriceIndex = rest.indexOf(prices[1]);
          const afterSecondPrice = rest.substring(secondPriceIndex + prices[1].length);

          const unitMatch = afterSecondPrice.match(/^(CS|EA)/);
          if (unitMatch) {
            const unit = unitMatch[1];
            const afterUnit = afterSecondPrice.substring(unit.length);

            // Try to extract quantity (1-3 digits), pack size (pattern like 1x4 KG), and brand
            const packSizeMatch = afterUnit.match(/(\d+)([x\/]\d+(?:[x\/]\d+)?(?:\s*(?:KG|LB|GM|OZ|ML|L))?)/i);

            let quantity = 1;
            let packSize = null;
            let brand = null;

            if (packSizeMatch) {
              quantity = parseInt(packSizeMatch[1]) || 1;
              packSize = packSizeMatch[2].trim();

              // Brand is everything after pack size
              const packSizeEnd = afterUnit.indexOf(packSizeMatch[2]) + packSizeMatch[2].length;
              brand = afterUnit.substring(packSizeEnd).trim();
              if (brand.length === 0) brand = null;
            } else {
              // Try simpler pattern: just qty + brand
              const simpleMatch = afterUnit.match(/^(\d+)(.*)$/);
              if (simpleMatch) {
                quantity = parseInt(simpleMatch[1]) || 1;
                brand = simpleMatch[2].trim();
                if (brand.length === 0) brand = null;
              }
            }

            // Clean up description (remove category codes like F2FMT, GR, etc at end)
            let cleanDescription = description.replace(/\s+[A-Z]{2,5}$/, '').trim();

            lineItems.push({
              invoice_number: invoiceNumber,
              invoice_date: invoiceDate,
              product_code: itemCode,
              description: cleanDescription,
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

  return lineItems;
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting Line Item Extraction from 183 GFS Invoices...\n');

  try {
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
    const uniqueProducts = new Map(); // product_code -> product info

    // Parse each invoice
    console.log('🔍 Parsing line items from invoices...\n');
    for (const invoice of invoices) {
      const lineItems = parseGFSLineItems(
        invoice.extracted_text,
        invoice.invoice_number,
        invoice.invoice_date
      );

      if (lineItems.length > 0) {
        console.log(`  Invoice ${invoice.invoice_number} (${invoice.invoice_date}): ${lineItems.length} items`);
        totalLineItems += lineItems.length;

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
              invoice_count: 1
            });
          } else {
            uniqueProducts.get(item.product_code).invoice_count++;
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
      }
    }

    console.log(`\n✅ Parsed ${totalLineItems} total line items`);
    console.log(`✅ Found ${uniqueProducts.size} unique products\n`);

    // Insert unique products into inventory_items
    console.log('📦 Creating inventory items from unique products...\n');
    let created = 0;
    let skipped = 0;

    for (const [productCode, product] of uniqueProducts) {
      // Check if already exists
      const existing = await dbGet(`
        SELECT item_code FROM inventory_items WHERE item_code = ?
      `, [productCode]);

      if (!existing) {
        // Determine category from description
        let category = 'General';
        const desc = product.description.toUpperCase();
        if (desc.includes('CHICKEN') || desc.includes('BEEF') || desc.includes('PORK') || desc.includes('MEAT')) {
          category = 'Protein';
        } else if (desc.includes('MILK') || desc.includes('CHEESE') || desc.includes('CREAM') || desc.includes('BUTTER')) {
          category = 'Dairy';
        } else if (desc.includes('BREAD') || desc.includes('FLOUR') || desc.includes('PASTA')) {
          category = 'Bakery/Grains';
        } else if (desc.includes('VEGETABLE') || desc.includes('FRUIT') || desc.includes('LETTUCE') || desc.includes('TOMATO')) {
          category = 'Produce';
        } else if (desc.includes('FROZEN') || desc.includes('FZN')) {
          category = 'Frozen';
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
          `Extracted from ${product.invoice_count} invoices. First seen: ${product.first_seen_date}`
        ]);

        created++;

        if (created % 50 === 0) {
          console.log(`  Created ${created} items...`);
        }
      } else {
        skipped++;
      }
    }

    console.log(`\n✅ Created ${created} new inventory items`);
    console.log(`⏭️  Skipped ${skipped} existing items\n`);

    // Summary
    console.log('📊 SUMMARY:');
    console.log(`   Invoices Processed: ${invoices.length}`);
    console.log(`   Total Line Items: ${totalLineItems}`);
    console.log(`   Unique Products: ${uniqueProducts.size}`);
    console.log(`   New Items Created: ${created}`);
    console.log(`   Existing Items: ${skipped}`);

    const totalItems = await dbGet(`
      SELECT COUNT(*) as count FROM inventory_items WHERE is_active = 1
    `);
    console.log(`   \n🎯 Total Active Items in Catalog: ${totalItems.count}`);
    console.log('\n✅ Line item extraction complete! You can now perform your first physical count.\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    db.close();
  }
}

main();
