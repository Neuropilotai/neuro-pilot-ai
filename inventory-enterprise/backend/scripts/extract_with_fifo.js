/**
 * Extract Line Items AND Cases with Full FIFO Tracking
 * Complete extraction: products, quantities, individual cases, and FIFO queue
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
 * Extract cases from invoice text for a given line item
 */
function extractCases(text, lineIndex, lines) {
  const cases = [];

  // Look at next lines for CASE entries
  for (let i = lineIndex + 1; i < Math.min(lineIndex + 20, lines.length); i++) {
    const line = lines[i].trim();

    // Stop if we hit another product or section end
    if (line.match(/^\d{7,9}/) || line.includes('Page Total') || line.includes('TOTAL WEIGHT:')) {
      break;
    }

    // Match case pattern: CASE: 410143069783 WEIGHT: 25.70
    const caseMatch = line.match(/CASE:\s*(\d+)\s+WEIGHT:\s*([\d.]+)/);
    if (caseMatch) {
      cases.push({
        caseNumber: caseMatch[1],
        weight: parseFloat(caseMatch[2])
      });
    }
  }

  return cases;
}

/**
 * Parse GFS invoice with case tracking
 */
function parseGFSWithCases(extractedText, invoiceNumber, invoiceDate, documentId) {
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

        const pricePattern = /(\d{1,4}[.,]\d{2})/g;
        const prices = rest.match(pricePattern);

        if (prices && prices.length >= 2) {
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
              if (brand.length < 2 || brand.length > 30) brand = null;
              if (brand && brand.match(/^[A-Z]$/)) brand = null;
            } else {
              const simpleMatch = afterUnit.match(/^(\d+)(.*)$/);
              if (simpleMatch) {
                quantity = parseInt(simpleMatch[1]) || 1;
                brand = simpleMatch[2].trim();
                if (brand.length < 2 || brand.length > 30) brand = null;
              }
            }

            description = description.replace(/\s+[A-Z]{2,6}$/, '').trim();
            description = description.replace(/^[\d\s]+/, '').trim();

            if (description.length > 3) {
              // Extract cases for this line item
              const cases = extractCases(extractedText, i, lines);

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
                cases: cases // Individual cases with weights
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
  console.log('🚀 Full Extraction: Line Items + Cases + FIFO Queue\n');

  try {
    // Clear tables
    console.log('🧹 Clearing existing data...');
    await dbRun('DELETE FROM inventory_fifo_queue');
    await dbRun('DELETE FROM invoice_line_item_cases');
    console.log('✅ Cleared FIFO tables\n');

    // Get all invoices
    const invoices = await dbAll(`
      SELECT id, invoice_number, invoice_date, extracted_text
      FROM documents
      WHERE mime_type = 'application/pdf'
        AND deleted_at IS NULL
        AND extracted_text IS NOT NULL
      ORDER BY invoice_date ASC
    `);

    console.log(`📊 Processing ${invoices.length} invoices...\n`);

    let totalCases = 0;
    let totalProducts = new Set();

    for (const invoice of invoices) {
      const lineItems = parseGFSWithCases(
        invoice.extracted_text,
        invoice.invoice_number,
        invoice.invoice_date,
        invoice.id
      );

      for (const item of lineItems) {
        const lineItemId = `${item.invoice_number}-${item.product_code}`;
        totalProducts.add(item.product_code);

        // Insert cases for this line item
        if (item.cases.length > 0) {
          console.log(`  ✓ ${item.description.substring(0, 40)}: ${item.cases.length} cases`);

          for (let j = 0; j < item.cases.length; j++) {
            const caseData = item.cases[j];
            const caseId = `CASE-${item.invoice_number}-${item.product_code}-${j+1}`;

            // Insert into invoice_line_item_cases
            await dbRun(`
              INSERT OR IGNORE INTO invoice_line_item_cases (
                case_id, line_item_id, case_number, weight, weight_unit,
                sequence_number, status, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `, [
              caseId,
              lineItemId,
              caseData.caseNumber,
              caseData.weight,
              'KG',
              j + 1,
              'IN_STOCK'
            ]);

            // Calculate priority score (days since epoch)
            const dateParts = item.invoice_date.split('-');
            const priorityScore = new Date(dateParts[0], dateParts[1]-1, dateParts[2]).getTime() / (1000*60*60*24);

            // Insert into FIFO queue
            await dbRun(`
              INSERT INTO inventory_fifo_queue (
                queue_id, product_code, case_id, invoice_number, invoice_date,
                case_number, weight, priority_score, status,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `, [
              `Q-${caseId}`,
              item.product_code,
              caseId,
              item.invoice_number,
              item.invoice_date,
              caseData.caseNumber,
              caseData.weight,
              Math.floor(priorityScore),
              'AVAILABLE'
            ]);

            totalCases++;
          }
        }
      }
    }

    console.log(`\n✅ FIFO Setup Complete:`);
    console.log(`   Total Cases Tracked: ${totalCases}`);
    console.log(`   Unique Products: ${totalProducts.size}`);
    console.log('\n🎯 FIFO queue is now populated and ready!\n');

  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    db.close();
  }
}

main();
