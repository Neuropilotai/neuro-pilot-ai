const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const oneDriveDir = '/Users/davidmikulis/OneDrive/GFS Order PDF';
const dbPath = path.join(__dirname, 'data/enterprise_inventory.db');

function calculateSHA256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function importRealInvoices() {
  const db = new sqlite3.Database(dbPath);

  // Get all PDF files from OneDrive
  const files = fs.readdirSync(oneDriveDir).filter(f => f.endsWith('.pdf'));
  console.log(`Found ${files.length} PDF files in OneDrive folder`);

  let matched = 0;
  let notMatched = 0;

  for (const file of files) {
    const filePath = path.join(oneDriveDir, file);
    const invoiceNumber = file.replace('.pdf', '');

    // Get file stats for date
    const stats = fs.statSync(filePath);
    const invoiceDate = stats.mtime.toISOString().split('T')[0];

    // Calculate SHA256 hash
    console.log(`Processing ${invoiceNumber}...`);
    const hash = await calculateSHA256(filePath);
    const dbFilename = `${hash}.pdf`;

    // Check if this hash exists in database
    const result = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id, filename FROM documents WHERE filename = ?',
        [dbFilename],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (result) {
      // Update the record with real invoice data
      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE documents
           SET invoice_number = ?,
               invoice_date = ?,
               vendor = 'GFS'
           WHERE filename = ?`,
          [invoiceNumber, invoiceDate, dbFilename],
          function(err) {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      console.log(`✓ Matched: ${invoiceNumber} -> ${dbFilename.substring(0, 16)}... (date: ${invoiceDate})`);
      matched++;
    } else {
      console.log(`✗ Not found in DB: ${invoiceNumber} (hash: ${hash.substring(0, 16)}...)`);
      notMatched++;
    }
  }

  db.close();

  console.log('\n=== Import Summary ===');
  console.log(`Total files processed: ${files.length}`);
  console.log(`Matched and updated: ${matched}`);
  console.log(`Not matched: ${notMatched}`);
}

importRealInvoices().catch(console.error);
