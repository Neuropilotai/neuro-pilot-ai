/**
 * Bulk PDF Migration Script
 * Migrates PDFs from old system (../../backend/data/gfs_orders/*.pdf) to new system
 *
 * Features:
 * - Idempotent: Safe to run multiple times
 * - Dry-run mode: Preview changes before applying
 * - Automatic invoice number extraction from filename
 * - SHA-256 deduplication
 * - Tenant-aware (default tenant)
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OLD_PDF_DIR = path.join(__dirname, '../../../backend/data/gfs_orders');
const NEW_PDF_DIR = path.join(__dirname, '../data/pdfs');
const DB_PATH = path.join(__dirname, '../db/inventory_enterprise.db');
const DRY_RUN = process.argv.includes('--dry-run');

const db = new sqlite3.Database(DB_PATH);

// Utility: Calculate SHA-256 hash of file
function calculateFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

// Utility: Extract invoice number from filename (e.g., "9025025288.pdf" → "9025025288")
function extractInvoiceNumber(filename) {
  const match = filename.match(/^(\d{10})\.pdf$/i);
  return match ? match[1] : null;
}

// Utility: Get file size
function getFileSize(filePath) {
  const stats = fs.statSync(filePath);
  return stats.size;
}

// Check if PDF already exists by hash
async function pdfExistsByHash(hash) {
  return new Promise((resolve, reject) => {
    db.get('SELECT id FROM documents WHERE sha256 = ?', [hash], (err, row) => {
      if (err) reject(err);
      else resolve(!!row);
    });
  });
}

// Find invoice ID by invoice number
async function findInvoiceByNumber(invoiceNumber) {
  return new Promise((resolve, reject) => {
    db.get('SELECT invoice_id FROM processed_invoices WHERE invoice_number = ?', [invoiceNumber], (err, row) => {
      if (err) reject(err);
      else resolve(row?.invoice_id || null);
    });
  });
}

// Get default tenant ID (returns "default" string)
async function getDefaultTenantId() {
  return 'default'; // Tenant ID is the string "default"
}

// Insert PDF into documents table
async function insertPDF(pdfData) {
  return new Promise((resolve, reject) => {
    const metadata = pdfData.invoice_id ? JSON.stringify({
      invoice_id: pdfData.invoice_id,
      source_system: 'v1_migration',
      original_path: pdfData.original_path
    }) : JSON.stringify({ source_system: 'v1_migration', original_path: pdfData.original_path });

    db.run(`
      INSERT INTO documents (
        id, tenant_id, path, filename, mime_type, size_bytes, sha256,
        created_by, created_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      pdfData.sha256, // Use hash as ID for uniqueness
      pdfData.tenant_id,
      pdfData.path,
      pdfData.filename,
      'application/pdf',
      pdfData.size_bytes,
      pdfData.sha256,
      'system',
      new Date().toISOString(),
      metadata
    ], function(err) {
      if (err) reject(err);
      else resolve(pdfData.sha256);
    });
  });
}

// Copy file to new storage with year/month organization
function copyPDFToNewStorage(oldPath, hash) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');

  const targetDir = path.join(NEW_PDF_DIR, String(year), month);
  fs.mkdirSync(targetDir, { recursive: true });

  const targetPath = path.join(targetDir, `${hash}.pdf`);
  const relativePath = path.relative(NEW_PDF_DIR, targetPath);

  if (!DRY_RUN) {
    fs.copyFileSync(oldPath, targetPath);
  }

  return relativePath;
}

async function main() {
  console.log('🔄 PDF Migration: Old System → v3.0.0');
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '✏️  APPLY (will modify DB and files)'}\n`);

  try {
    // Check old PDF directory exists
    if (!fs.existsSync(OLD_PDF_DIR)) {
      throw new Error(`Old PDF directory not found: ${OLD_PDF_DIR}`);
    }

    // Get tenant ID
    const tenantId = await getDefaultTenantId();
    if (!tenantId) {
      throw new Error('Default tenant not found. Run migrations first.');
    }
    console.log(`✓ Default tenant ID: ${tenantId}\n`);

    // Scan old PDFs
    const oldPDFs = fs.readdirSync(OLD_PDF_DIR).filter(f => f.toLowerCase().endsWith('.pdf'));
    console.log(`📄 Found ${oldPDFs.length} PDFs in old system\n`);

    let imported = 0;
    let skipped = 0;
    let linked = 0;
    let errors = 0;

    for (const filename of oldPDFs) {
      const oldPath = path.join(OLD_PDF_DIR, filename);

      try {
        // Calculate hash
        const hash = calculateFileHash(oldPath);
        const size = getFileSize(oldPath);

        // Check if already exists
        const exists = await pdfExistsByHash(hash);
        if (exists) {
          console.log(`⏭️  SKIP: ${filename} (already imported, hash: ${hash.substring(0, 8)}...)`);
          skipped++;
          continue;
        }

        // Try to extract invoice number and link
        const invoiceNumber = extractInvoiceNumber(filename);
        let invoiceId = null;
        if (invoiceNumber) {
          invoiceId = await findInvoiceByNumber(invoiceNumber);
          if (invoiceId) {
            linked++;
          }
        }

        if (DRY_RUN) {
          console.log(`✅ DRY RUN: Would import ${filename}`);
          console.log(`   → Hash: ${hash.substring(0, 8)}...`);
          console.log(`   → Size: ${size} bytes`);
          console.log(`   → Invoice: ${invoiceNumber || 'N/A'} ${invoiceId ? `(linked to ID ${invoiceId})` : '(not linked)'}`);
          imported++;
        } else {
          // Copy file to new storage
          const relativePath = copyPDFToNewStorage(oldPath, hash);

          // Insert into database
          const docId = await insertPDF({
            tenant_id: tenantId,
            filename: filename,
            path: relativePath,
            size_bytes: size,
            sha256: hash,
            invoice_id: invoiceId,
            original_path: oldPath
          });

          console.log(`✅ IMPORTED: ${filename} → Document ID ${docId}`);
          console.log(`   → Path: ${relativePath}`);
          if (invoiceId) {
            console.log(`   → Linked to invoice ${invoiceNumber}`);
          }
          imported++;
        }
      } catch (error) {
        console.error(`❌ ERROR processing ${filename}:`, error.message);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary');
    console.log('='.repeat(60));
    console.log(`Total PDFs scanned:        ${oldPDFs.length}`);
    console.log(`Successfully imported:     ${imported} ${DRY_RUN ? '(dry run)' : ''}`);
    console.log(`Skipped (already present): ${skipped}`);
    console.log(`Linked to invoices:        ${linked}`);
    console.log(`Errors:                    ${errors}`);
    console.log('='.repeat(60));

    if (DRY_RUN) {
      console.log('\n💡 This was a dry run. Run without --dry-run to apply changes.');
    } else {
      console.log('\n✅ Migration complete!');
      console.log(`📁 PDFs stored in: ${NEW_PDF_DIR}`);
      console.log(`🗄️  Database updated: ${DB_PATH}`);
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run migration
main();
