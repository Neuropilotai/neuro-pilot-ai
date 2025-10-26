#!/usr/bin/env node

/**
 * Import Invoices from JSON Files
 *
 * Imports GFS invoice data from JSON files extracted from PDFs into the database.
 * Handles FY26-P01 (September 2025) initially, then can be extended to other periods.
 *
 * @version 15.7.0
 * @author NeuroPilot Financial Systems Team
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Configuration
const JSON_DIR = '/Users/davidmikulis/neuro-pilot-ai/backend/data/gfs_orders';
const DB_PATH = path.join(__dirname, '../db/inventory_enterprise.db');

// Finance code mapping based on category keywords
const FINANCE_CODE_MAP = {
  'BAKE': ['BREAD', 'BAGEL', 'BUN', 'ROLL', 'PASTRY', 'CAKE', 'MUFFIN', 'CROISSANT', 'DONUT'],
  'BEV+ECO': ['BEVERAGE', 'DRINK', 'JUICE', 'WATER', 'SODA', 'COFFEE', 'TEA', 'ECO'],
  'MILK': ['MILK', 'CREAM', 'CHEESE', 'YOGURT', 'BUTTER', 'DAIRY'],
  'GROC+MISC': ['SAUCE', 'SPICE', 'OIL', 'VINEGAR', 'FLOUR', 'SUGAR', 'SALT', 'PEPPER', 'CONDIMENT', 'PASTA', 'RICE', 'BEAN', 'CAN'],
  'MEAT': ['BEEF', 'PORK', 'CHICKEN', 'TURKEY', 'HAM', 'BACON', 'SAUSAGE', 'LAMB', 'VEAL', 'MEAT', 'STEAK', 'RIBS', 'BOLOGNA', 'SALAMI', 'PEPPERONI'],
  'PROD': ['APPLE', 'BANANA', 'ORANGE', 'LETTUCE', 'TOMATO', 'POTATO', 'ONION', 'CARROT', 'PEPPER', 'FRUIT', 'VEGETABLE', 'PRODUCE', 'SALAD', 'CELERY', 'CUCUMBER', 'MUSHROOM'],
  'CLEAN': ['CLEANER', 'DETERGENT', 'SOAP', 'SANITIZER', 'DISINFECT', 'CLEAN'],
  'PAPER': ['PAPER', 'NAPKIN', 'TOWEL', 'TISSUE', 'PLATE', 'CUP', 'CONTAINER', 'BAG', 'WRAP', 'FOIL', 'GLOVE'],
  'FREIGHT': ['FREIGHT', 'SHIPPING', 'DELIVERY'],
  'LINEN': ['LINEN', 'TOWEL', 'CLOTH', 'APRON'],
  'PROPANE': ['PROPANE', 'GAS', 'FUEL'],
  'OTHER': []
};

// Promise-based database wrapper
class Database {
  constructor(dbPath) {
    this.db = new sqlite3.Database(dbPath);
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  exec(sql) {
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

/**
 * Map item description to finance code
 */
function mapFinanceCode(description) {
  if (!description) return 'OTHER';

  const upperDesc = description.toUpperCase();

  for (const [code, keywords] of Object.entries(FINANCE_CODE_MAP)) {
    if (code === 'OTHER') continue;

    for (const keyword of keywords) {
      if (upperDesc.includes(keyword)) {
        return code;
      }
    }
  }

  return 'OTHER';
}

/**
 * Parse fiscal period from date (e.g., "2025-09-15" -> "FY26-P01")
 */
function getFiscalPeriod(dateStr) {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1; // 1-12
  const year = date.getFullYear();

  // Fiscal year starts in April (P01 = Apr, P02 = May, ..., P12 = Mar)
  // September = P06... wait, let me check the user's mapping
  // FY26-P01 = September 2025
  // So P01 = Sept, P02 = Oct, ..., P12 = Aug
  // This means fiscal year starts in September

  let fiscalYear, period;

  if (month >= 9) {
    // Sept-Dec: FY starts current year + 1
    fiscalYear = year + 1;
    period = month - 8; // Sept=1, Oct=2, Nov=3, Dec=4
  } else {
    // Jan-Aug: FY is current year
    fiscalYear = year;
    period = month + 4; // Jan=5, Feb=6, ..., Aug=12
  }

  return `FY${fiscalYear.toString().slice(-2)}-P${period.toString().padStart(2, '0')}`;
}

/**
 * Import a single invoice from JSON
 */
async function importInvoice(db, jsonPath) {
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const {
    invoiceNumber,
    orderDate,
    items = [],
    financials = {}
  } = data;

  if (!invoiceNumber || !orderDate) {
    console.warn(`⚠️  Skipping ${path.basename(jsonPath)}: Missing invoice number or date`);
    return { success: false, reason: 'Missing required fields' };
  }

  const fiscalPeriod = getFiscalPeriod(orderDate);

  // Check if already imported
  const existing = await db.get(
    'SELECT invoice_id FROM processed_invoices WHERE invoice_number = ?',
    [invoiceNumber]
  );

  if (existing) {
    return { success: false, reason: 'Already imported', invoiceNumber };
  }

  // Extract financials
  const {
    subtotal = 0,
    gst = 0,
    qst = 0,
    total = 0
  } = financials;

  const taxAmount = gst + qst;

  // Insert invoice
  const invoiceResult = await db.run(`
    INSERT INTO processed_invoices (
      invoice_number,
      supplier,
      invoice_date,
      total_amount,
      tax_amount,
      subtotal,
      gst,
      qst,
      status,
      pdf_path,
      notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    invoiceNumber,
    'GFS',
    orderDate,
    total,
    taxAmount,
    subtotal,
    gst,
    qst,
    'processed',
    null,
    `Imported from JSON | Fiscal Period: ${fiscalPeriod} | GST: $${gst.toFixed(2)} | QST: $${qst.toFixed(2)}`
  ]);

  const invoiceId = invoiceResult.lastID;

  // Insert line items
  let lineNumber = 1;
  let itemsImported = 0;

  for (const item of items) {
    const {
      itemCode,
      description = '',
      quantity = 0,
      unitPrice = 0,
      lineTotal = 0
    } = item;

    if (!itemCode) continue;

    const financeCode = mapFinanceCode(description);

    await db.run(`
      INSERT INTO invoice_items (
        invoice_id,
        item_code,
        item_name,
        quantity,
        unit_price,
        total_price,
        line_number,
        finance_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      invoiceId,
      itemCode,
      description,
      quantity,
      unitPrice,
      lineTotal,
      lineNumber,
      financeCode
    ]);

    itemsImported++;
    lineNumber++;
  }

  return {
    success: true,
    invoiceNumber,
    invoiceId,
    fiscalPeriod,
    total,
    itemCount: itemsImported
  };
}

/**
 * Main import function
 */
async function main() {
  const fiscalPeriodFilter = process.argv[2] || 'FY26-P01';
  const dryRun = process.argv.includes('--dry-run');

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  JSON Invoice Import v15.7.0');
  console.log('  NeuroPilot Enterprise Financial Accuracy');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Target Fiscal Period: ${fiscalPeriodFilter}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE IMPORT'}`);
  console.log('');

  const db = new Database(DB_PATH);

  try {
    // Add finance_code column if it doesn't exist
    console.log('Checking schema...');
    try {
      await db.exec(`
        ALTER TABLE invoice_items ADD COLUMN finance_code TEXT;
      `);
      console.log('✓ Added finance_code column to invoice_items');
    } catch (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('✓ finance_code column already exists');
      } else {
        throw err;
      }
    }

    // Add GST and QST columns to processed_invoices if they don't exist
    try {
      await db.exec(`
        ALTER TABLE processed_invoices ADD COLUMN gst REAL DEFAULT 0;
      `);
      console.log('✓ Added gst column to processed_invoices');
    } catch (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('✓ gst column already exists');
      } else {
        throw err;
      }
    }

    try {
      await db.exec(`
        ALTER TABLE processed_invoices ADD COLUMN qst REAL DEFAULT 0;
      `);
      console.log('✓ Added qst column to processed_invoices');
    } catch (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('✓ qst column already exists');
      } else {
        throw err;
      }
    }

    console.log('');

    // Get all JSON files
    const files = fs.readdirSync(JSON_DIR).filter(f => f.endsWith('.json'));
    console.log(`Found ${files.length} JSON files in ${JSON_DIR}`);
    console.log('');

    // Import invoices
    const results = {
      total: 0,
      imported: 0,
      skipped: 0,
      errors: 0,
      byPeriod: {}
    };

    if (dryRun) {
      await db.run('BEGIN TRANSACTION');
    }

    for (const file of files) {
      const jsonPath = path.join(JSON_DIR, file);

      try {
        const result = await importInvoice(db, jsonPath);
        results.total++;

        if (result.success) {
          const { invoiceNumber, fiscalPeriod, total, itemCount } = result;

          // Filter by fiscal period if specified
          if (fiscalPeriodFilter !== '--all' && fiscalPeriod !== fiscalPeriodFilter) {
            results.skipped++;
            continue;
          }

          if (!results.byPeriod[fiscalPeriod]) {
            results.byPeriod[fiscalPeriod] = {
              invoices: 0,
              totalAmount: 0
            };
          }

          results.byPeriod[fiscalPeriod].invoices++;
          results.byPeriod[fiscalPeriod].totalAmount += total;

          results.imported++;
          console.log(`✓ ${invoiceNumber} -> ${fiscalPeriod} | $${total.toFixed(2)} | ${itemCount} items`);
        } else {
          results.skipped++;
          if (result.reason !== 'Already imported') {
            console.log(`⚠️  ${file}: ${result.reason}`);
          }
        }
      } catch (err) {
        results.errors++;
        console.error(`✗ Error importing ${file}: ${err.message}`);
      }
    }

    if (dryRun) {
      await db.run('ROLLBACK');
      console.log('');
      console.log('DRY RUN - All changes rolled back');
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  Import Summary');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Total files processed: ${results.total}`);
    console.log(`Successfully imported: ${results.imported}`);
    console.log(`Skipped: ${results.skipped}`);
    console.log(`Errors: ${results.errors}`);
    console.log('');

    if (Object.keys(results.byPeriod).length > 0) {
      console.log('By Fiscal Period:');
      for (const [period, data] of Object.entries(results.byPeriod)) {
        console.log(`  ${period}: ${data.invoices} invoices, $${data.totalAmount.toFixed(2)} total`);
      }
      console.log('');
    }

    if (!dryRun && results.imported > 0) {
      console.log('Next step: Run financial validation');
      console.log(`  ./scripts/verify_financial_accuracy_v2.sh ${fiscalPeriodFilter}`);
      console.log('');
    }

  } catch (err) {
    console.error('Import failed:', err);
    throw err;
  } finally {
    await db.close();
  }
}

// Run
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
