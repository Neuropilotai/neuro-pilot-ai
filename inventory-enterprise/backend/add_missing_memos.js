#!/usr/bin/env node

/**
 * Add missing credit/debit memos to database
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { randomUUID } = require('crypto');

const dbPath = path.join(__dirname, 'data/enterprise_inventory.db');

async function addMissingMemos() {
  const db = new sqlite3.Database(dbPath);

  console.log('🔧 Adding missing credit/debit memos to database...\n');

  // Credit Memo 2002254859
  const creditMemo = {
    id: `PDF-${Date.now()}-${randomUUID().substring(0, 8)}`,
    filename: 'd0d8e8a0c098395268e8cb5c2bf9eabaaff98a909bd1b2cbfd55998e6412d0af.pdf',
    invoice_number: '2002254859',
    invoice_date: '2025-04-01',
    mime_type: 'application/pdf',
    vendor: 'GFS',
    document_type: 'CREDIT_MEMO',
    uploaded_at: new Date().toISOString()
  };

  // Check if credit memo exists
  db.get(
    'SELECT * FROM documents WHERE filename = ?',
    [creditMemo.filename],
    (err, row) => {
      if (err) {
        console.error('Error checking credit memo:', err);
        return;
      }

      if (row) {
        console.log('✅ Credit Memo 2002254859 already exists');
      } else {
        db.run(
          `INSERT INTO documents (
            id, filename, mime_type, vendor, invoice_number, invoice_date,
            document_type, uploaded_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            creditMemo.id,
            creditMemo.filename,
            creditMemo.mime_type,
            creditMemo.vendor,
            creditMemo.invoice_number,
            creditMemo.invoice_date,
            creditMemo.document_type,
            creditMemo.uploaded_at
          ],
          (err) => {
            if (err) {
              console.error('❌ Error adding credit memo:', err.message);
            } else {
              console.log('✅ Added Credit Memo 2002254859 (Date: 2025-04-01)');
            }
          }
        );
      }
    }
  );

  // Update Debit Memo 2002373141 date
  setTimeout(() => {
    db.run(
      'UPDATE documents SET invoice_date = ? WHERE invoice_number = ?',
      ['2025-05-08', '2002373141'],
      function(err) {
        if (err) {
          console.error('❌ Error updating debit memo:', err.message);
        } else if (this.changes > 0) {
          console.log('✅ Updated Debit Memo 2002373141 date: 2025-07-23 → 2025-05-08');
        } else {
          console.log('⚠️  Debit Memo 2002373141 not found');
        }

        // Final summary
        setTimeout(() => {
          db.all(
            'SELECT COUNT(*) as count FROM documents WHERE mime_type = ?',
            ['application/pdf'],
            (err, rows) => {
              if (!err && rows) {
                console.log(`\n📊 Total invoices in database: ${rows[0].count}`);
              }
              db.close();
              console.log('\n✅ Database update complete!');
            }
          );
        }, 100);
      }
    );
  }, 100);
}

addMissingMemos();
