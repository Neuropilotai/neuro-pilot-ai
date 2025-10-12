/**
 * Assign Fiscal Periods to Existing Invoices
 * Updates all invoices with fiscal_year_id and fiscal_period_id based on invoice_date
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/enterprise_inventory.db');
const db = new sqlite3.Database(dbPath);

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
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

async function main() {
  console.log('📅 Assigning Fiscal Periods to Invoices...\n');

  try {
    // Step 1: Get all invoices with dates
    const invoices = await dbAll(`
      SELECT id, invoice_number, invoice_date
      FROM documents
      WHERE mime_type = 'application/pdf'
        AND deleted_at IS NULL
        AND invoice_date IS NOT NULL
      ORDER BY invoice_date ASC
    `);

    console.log(`📊 Found ${invoices.length} invoices to process\n`);

    // Step 2: Update each invoice with fiscal period
    let updated = 0;
    let fy25Count = 0;
    let fy26Count = 0;
    let unmatchedCount = 0;

    for (const invoice of invoices) {
      // Find matching fiscal period
      const period = await dbAll(`
        SELECT fiscal_year, period, period_start_date, period_end_date, fiscal_year_id
        FROM fiscal_periods
        WHERE date(?) BETWEEN date(period_start_date) AND date(period_end_date)
        LIMIT 1
      `, [invoice.invoice_date]);

      if (period.length > 0) {
        const p = period[0];
        const periodId = `FY${p.fiscal_year % 100}-P${p.period.toString().padStart(2, '0')}`;
        const fiscalYearId = p.fiscal_year_id || `FY${p.fiscal_year % 100}`;

        await dbRun(`
          UPDATE documents
          SET fiscal_year_id = ?,
              fiscal_period_id = ?
          WHERE id = ?
        `, [fiscalYearId, periodId, invoice.id]);

        updated++;
        if (p.fiscal_year === 2025) fy25Count++;
        else if (p.fiscal_year === 2026) fy26Count++;

        if (updated % 20 === 0) {
          console.log(`  Processed ${updated}/${invoices.length} invoices...`);
        }
      } else {
        console.log(`  ⚠️  No fiscal period found for invoice ${invoice.invoice_number} (${invoice.invoice_date})`);
        unmatchedCount++;
      }
    }

    console.log(`\n✅ Assignment Complete:\n`);
    console.log(`   Total Invoices: ${invoices.length}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   FY25 Invoices: ${fy25Count}`);
    console.log(`   FY26 Invoices: ${fy26Count}`);
    console.log(`   Unmatched: ${unmatchedCount}\n`);

    // Step 3: Show sample assignments
    console.log('📋 Sample Assignments:');
    const samples = await dbAll(`
      SELECT invoice_number, invoice_date, fiscal_year_id, fiscal_period_id
      FROM documents
      WHERE fiscal_period_id IS NOT NULL
      ORDER BY invoice_date ASC
      LIMIT 10
    `);

    for (const s of samples) {
      console.log(`   ${s.invoice_number}: ${s.invoice_date} → ${s.fiscal_year_id} ${s.fiscal_period_id}`);
    }

    console.log('\n🎯 Fiscal period assignment complete!\n');

  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    db.close();
  }
}

main();
