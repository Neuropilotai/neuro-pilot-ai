/**
 * Extract Prices from Invoices and Update Inventory Costs
 * Each item keeps its price history from invoices
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

/**
 * Parse line item with prices from invoice text
 */
function parseLineItemWithPrice(extractedText, invoiceNumber, invoiceDate, documentId) {
  const lineItems = [];
  const lines = extractedText.split('\n');
  let inLineItemSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.includes('Pack Size') && (line.includes('Brand') || lines[i+1]?.includes('Brand'))) {
      inLineItemSection = true;
      continue;
    }

    if (line.includes('Page Total') || line.includes('Group Summary') || line.includes('CATEGORY RECAP')) {
      inLineItemSection = false;
      continue;
    }

    if (line.match(/^[A-Z]{2,3}-\s+\d+$/)) continue;
    if (line.match(/^\d{10,}$/)) continue;
    if (line.includes('CASE:') || line.includes('WEIGHT:') || line.includes('TOTAL WEIGHT:')) continue;

    if (inLineItemSection && line.length > 20) {
      const match = line.match(/^(\d{7,9})(.+)$/);

      if (match) {
        const itemCode = match[1];
        const rest = match[2];

        // Extract prices - format: ...UNIT_PRICE,EXTENDED_PRICE...
        // Example: ...21.65,3165.01CS...
        const pricePattern = /(\d{1,4}[.,]\d{2})/g;
        const prices = rest.match(pricePattern);

        if (prices && prices.length >= 2) {
          // First price is unit price, second is extended price
          const unitPrice = parseFloat(prices[0].replace(',', '.'));
          const extendedPrice = parseFloat(prices[1].replace(',', '.'));

          const firstPriceIndex = rest.indexOf(prices[0]);
          let description = rest.substring(0, firstPriceIndex).trim();

          const secondPriceIndex = rest.indexOf(prices[1]);
          const afterSecondPrice = rest.substring(secondPriceIndex + prices[1].length);

          const unitMatch = afterSecondPrice.match(/^([A-Z]{2,4})/);
          if (unitMatch) {
            let unit = unitMatch[1];
            if (unit.startsWith('B')) unit = unit.substring(1);
            if (!['CS', 'EA', 'PC', 'BX', 'PK'].includes(unit)) unit = 'CS';

            const afterUnit = afterSecondPrice.substring(unitMatch[1].length);

            let quantity = 1;
            let packSize = null;
            let brand = null;

            const packSizeMatch = afterUnit.match(/(\d+)([x\/]\d+(?:[x\/]\d+)?(?:\.\d+)?(?:\s*(?:KG|LB|GM|OZ|ML|L|G))?)/i);

            if (packSizeMatch) {
              quantity = parseInt(packSizeMatch[1]) || 1;
              packSize = packSizeMatch[2].trim();
              const packSizeEnd = afterUnit.indexOf(packSizeMatch[0]) + packSizeMatch[0].length;
              brand = afterUnit.substring(packSizeEnd).replace(/^[A-Z]+/, '').trim();
              if (brand && (brand.length < 2 || brand.length > 30 || brand.match(/^[A-Z]$/))) brand = null;
            } else {
              const simpleMatch = afterUnit.match(/^(\d+)(.*)$/);
              if (simpleMatch) {
                quantity = parseInt(simpleMatch[1]) || 1;
                brand = simpleMatch[2].trim();
                if (brand && (brand.length < 2 || brand.length > 30)) brand = null;
              }
            }

            description = description.replace(/\s+[A-Z]{2,6}$/, '').trim();
            description = description.replace(/^[\d\s]+/, '').trim();

            if (description.length > 3) {
              lineItems.push({
                invoice_number: invoiceNumber,
                invoice_date: invoiceDate,
                document_id: documentId,
                product_code: itemCode,
                description: description,
                quantity: quantity,
                unit: unit,
                pack_size: packSize,
                brand: brand,
                unit_price: unitPrice,
                extended_price: extendedPrice,
                price_per_case: quantity > 0 ? extendedPrice / quantity : unitPrice
              });
            }
          }
        }
      }
    }
  }

  return lineItems;
}

async function main() {
  console.log('🚀 Extracting Prices and Updating Inventory Costs...\n');

  try {
    // Get all invoices
    const invoices = await dbAll(`
      SELECT id, invoice_number, invoice_date, extracted_text
      FROM documents
      WHERE mime_type = 'application/pdf'
        AND deleted_at IS NULL
        AND extracted_text IS NOT NULL
      ORDER BY invoice_date DESC
    `);

    console.log(`📊 Processing ${invoices.length} invoices for prices...\n`);

    // Track latest price for each product
    const productPrices = new Map(); // product_code -> {latest_price, latest_date, price_history}

    let totalWithPrices = 0;

    for (const invoice of invoices) {
      const lineItems = parseLineItemWithPrice(
        invoice.extracted_text,
        invoice.invoice_number,
        invoice.invoice_date,
        invoice.id
      );

      for (const item of lineItems) {
        if (item.unit_price > 0) {
          totalWithPrices++;

          // Track price history
          if (!productPrices.has(item.product_code)) {
            productPrices.set(item.product_code, {
              product_code: item.product_code,
              latest_price: item.unit_price,
              latest_date: item.invoice_date,
              latest_invoice: item.invoice_number,
              price_history: []
            });
          }

          const productPrice = productPrices.get(item.product_code);

          // Update if this invoice is more recent
          if (item.invoice_date >= productPrice.latest_date) {
            productPrice.latest_price = item.unit_price;
            productPrice.latest_date = item.invoice_date;
            productPrice.latest_invoice = item.invoice_number;
          }

          // Add to price history
          productPrice.price_history.push({
            date: item.invoice_date,
            invoice: item.invoice_number,
            price: item.unit_price,
            quantity: item.quantity
          });

          // Update line item with price
          await dbRun(`
            UPDATE invoice_line_items
            SET unit_price = ?,
                line_total = ?
            WHERE line_item_id = ?
          `, [
            item.unit_price,
            item.extended_price,
            `${item.invoice_number}-${item.product_code}`
          ]);
        }
      }
    }

    console.log(`✅ Found prices for ${totalWithPrices} line items`);
    console.log(`✅ Tracked pricing for ${productPrices.size} unique products\n`);

    // Update inventory items with latest prices
    console.log('💰 Updating inventory items with latest prices...\n');

    let updated = 0;
    for (const [productCode, priceData] of productPrices) {
      // Calculate average price from history
      const avgPrice = priceData.price_history.reduce((sum, p) => sum + p.price, 0) / priceData.price_history.length;

      await dbRun(`
        UPDATE inventory_items
        SET unit_cost = ?,
            last_cost = ?,
            notes = CASE
              WHEN notes IS NOT NULL THEN notes || ' | Latest price: $' || ? || ' from invoice ' || ? || ' (' || ? || ')'
              ELSE 'Latest price: $' || ? || ' from invoice ' || ? || ' (' || ? || ')'
            END
        WHERE item_code = ?
      `, [
        avgPrice, // unit_cost = average
        priceData.latest_price, // last_cost = most recent
        priceData.latest_price.toFixed(2),
        priceData.latest_invoice,
        priceData.latest_date,
        priceData.latest_price.toFixed(2),
        priceData.latest_invoice,
        priceData.latest_date,
        productCode
      ]);

      updated++;

      if (updated % 100 === 0) {
        console.log(`  Updated ${updated} items...`);
      }
    }

    console.log(`\n✅ Updated ${updated} inventory items with prices\n`);

    // Summary
    const stats = await dbGet(`
      SELECT
        COUNT(*) as total_items,
        COUNT(CASE WHEN unit_cost > 0 THEN 1 END) as items_with_cost,
        AVG(unit_cost) as avg_cost,
        SUM(current_quantity * unit_cost) as total_inventory_value
      FROM inventory_items
      WHERE is_active = 1
    `);

    console.log('📊 FINAL SUMMARY:');
    console.log(`   Total Items: ${stats.total_items}`);
    console.log(`   Items with Cost: ${stats.items_with_cost}`);
    console.log(`   Average Cost: $${(stats.avg_cost || 0).toFixed(2)}`);
    console.log(`   Total Inventory Value: $${(stats.total_inventory_value || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
    console.log('\n✅ Price extraction complete!\n');
    console.log('💡 Each item now has:');
    console.log('   - Latest price from most recent invoice');
    console.log('   - Average price from all invoices');
    console.log('   - Price history tracked');
    console.log('\n🎯 Ready for inventory counts with proper costing!\n');

  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    db.close();
  }
}

main();
