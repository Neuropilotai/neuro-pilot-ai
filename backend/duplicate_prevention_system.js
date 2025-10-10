#!/usr/bin/env node

/**
 * DUPLICATE INVOICE PREVENTION SYSTEM
 *
 * Prevents duplicate invoices from being added to inventory
 * Uses multiple detection methods:
 * 1. Invoice number uniqueness
 * 2. PDF file hash (detects identical files)
 * 3. Content fingerprint (detects re-scans)
 * 4. Date + amount matching
 */

const fs = require('fs');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class DuplicatePreventionSystem {
  constructor(dbPath = './data/enterprise_inventory.db') {
    this.dbPath = dbPath;
    this.db = null;
  }

  /**
   * Initialize database connection
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) return reject(err);

        // Create duplicate tracking tables
        this.createDuplicateTrackingTables().then(resolve).catch(reject);
      });
    });
  }

  /**
   * Create tables for duplicate tracking
   */
  async createDuplicateTrackingTables() {
    return new Promise((resolve, reject) => {
      const schema = `
        -- Track processed invoices
        CREATE TABLE IF NOT EXISTS processed_invoices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          invoice_number TEXT UNIQUE NOT NULL,
          invoice_date TEXT,
          total_amount REAL,
          item_count INTEGER,
          pdf_file_hash TEXT UNIQUE,
          content_fingerprint TEXT,
          pdf_file_path TEXT,
          processed_at TEXT DEFAULT CURRENT_TIMESTAMP,
          processed_by TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_processed_invoice_number
          ON processed_invoices(invoice_number);
        CREATE INDEX IF NOT EXISTS idx_processed_file_hash
          ON processed_invoices(pdf_file_hash);
        CREATE INDEX IF NOT EXISTS idx_processed_fingerprint
          ON processed_invoices(content_fingerprint);
        CREATE INDEX IF NOT EXISTS idx_processed_date_amount
          ON processed_invoices(invoice_date, total_amount);

        -- Track duplicate attempts
        CREATE TABLE IF NOT EXISTS duplicate_attempts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          invoice_number TEXT NOT NULL,
          pdf_file_path TEXT NOT NULL,
          pdf_file_hash TEXT,
          duplicate_type TEXT NOT NULL,  -- INVOICE_NUMBER, FILE_HASH, CONTENT, DATE_AMOUNT
          matched_invoice_id INTEGER,
          attempted_at TEXT DEFAULT CURRENT_TIMESTAMP,
          attempted_by TEXT,
          action_taken TEXT,  -- REJECTED, SKIPPED, MERGED
          notes TEXT,

          FOREIGN KEY (matched_invoice_id) REFERENCES processed_invoices(id)
        );

        CREATE INDEX IF NOT EXISTS idx_duplicate_invoice
          ON duplicate_attempts(invoice_number);
        CREATE INDEX IF NOT EXISTS idx_duplicate_date
          ON duplicate_attempts(attempted_at);
      `;

      this.db.exec(schema, (err) => {
        if (err) return reject(err);
        console.log('✅ Duplicate tracking tables initialized');
        resolve();
      });
    });
  }

  /**
   * Calculate SHA-256 hash of PDF file
   */
  calculateFileHash(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  /**
   * Create content fingerprint from invoice data
   * (date + items + amounts create unique signature)
   */
  createContentFingerprint(invoiceData) {
    const fingerprint = {
      invoice_number: invoiceData.invoiceNumber,
      date: invoiceData.orderDate,
      total: invoiceData.financials?.total || 0,
      item_count: invoiceData.items?.length || 0,
      first_items: (invoiceData.items || []).slice(0, 3).map(i => ({
        code: i.itemCode,
        qty: i.quantity,
        price: i.unitPrice
      }))
    };

    const fingerprintString = JSON.stringify(fingerprint);
    return crypto.createHash('md5').update(fingerprintString).digest('hex');
  }

  /**
   * Check if invoice already exists (comprehensive check)
   */
  async checkForDuplicate(invoiceNumber, pdfFilePath, invoiceData = null) {
    const results = {
      isDuplicate: false,
      duplicateType: null,
      matchedInvoice: null,
      reasons: []
    };

    // Check 1: Invoice number
    const byNumber = await this.checkByInvoiceNumber(invoiceNumber);
    if (byNumber) {
      results.isDuplicate = true;
      results.duplicateType = 'INVOICE_NUMBER';
      results.matchedInvoice = byNumber;
      results.reasons.push(`Invoice number ${invoiceNumber} already exists`);
      return results;
    }

    // Check 2: PDF file hash
    if (fs.existsSync(pdfFilePath)) {
      const fileHash = this.calculateFileHash(pdfFilePath);
      const byHash = await this.checkByFileHash(fileHash);
      if (byHash) {
        results.isDuplicate = true;
        results.duplicateType = 'FILE_HASH';
        results.matchedInvoice = byHash;
        results.reasons.push(`Identical PDF file already processed (invoice: ${byHash.invoice_number})`);
        return results;
      }
    }

    // Check 3: Content fingerprint (if invoice data provided)
    if (invoiceData) {
      const fingerprint = this.createContentFingerprint(invoiceData);
      const byFingerprint = await this.checkByFingerprint(fingerprint);
      if (byFingerprint) {
        results.isDuplicate = true;
        results.duplicateType = 'CONTENT_FINGERPRINT';
        results.matchedInvoice = byFingerprint;
        results.reasons.push(`Same content already processed (invoice: ${byFingerprint.invoice_number})`);
        return results;
      }

      // Check 4: Date + Amount match
      if (invoiceData.orderDate && invoiceData.financials?.total) {
        const byDateAmount = await this.checkByDateAndAmount(
          invoiceData.orderDate,
          invoiceData.financials.total
        );
        if (byDateAmount) {
          results.isDuplicate = true;
          results.duplicateType = 'DATE_AMOUNT';
          results.matchedInvoice = byDateAmount;
          results.reasons.push(
            `Invoice with same date (${invoiceData.orderDate}) and amount ($${invoiceData.financials.total}) already exists (invoice: ${byDateAmount.invoice_number})`
          );
          return results;
        }
      }
    }

    return results;
  }

  /**
   * Check by invoice number
   */
  async checkByInvoiceNumber(invoiceNumber) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM processed_invoices WHERE invoice_number = ?`;
      this.db.get(sql, [invoiceNumber], (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      });
    });
  }

  /**
   * Check by file hash
   */
  async checkByFileHash(fileHash) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM processed_invoices WHERE pdf_file_hash = ?`;
      this.db.get(sql, [fileHash], (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      });
    });
  }

  /**
   * Check by content fingerprint
   */
  async checkByFingerprint(fingerprint) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM processed_invoices WHERE content_fingerprint = ?`;
      this.db.get(sql, [fingerprint], (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      });
    });
  }

  /**
   * Check by date and amount (within $0.01 tolerance)
   */
  async checkByDateAndAmount(date, amount) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM processed_invoices
        WHERE invoice_date = ?
          AND ABS(total_amount - ?) < 0.01
      `;
      this.db.get(sql, [date, amount], (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      });
    });
  }

  /**
   * Mark invoice as processed
   */
  async markAsProcessed(invoiceNumber, pdfFilePath, invoiceData, processedBy = 'SYSTEM') {
    return new Promise((resolve, reject) => {
      const fileHash = fs.existsSync(pdfFilePath) ? this.calculateFileHash(pdfFilePath) : null;
      const fingerprint = invoiceData ? this.createContentFingerprint(invoiceData) : null;

      const sql = `
        INSERT INTO processed_invoices
        (invoice_number, invoice_date, total_amount, item_count,
         pdf_file_hash, content_fingerprint, pdf_file_path, processed_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      this.db.run(sql, [
        invoiceNumber,
        invoiceData?.orderDate || null,
        invoiceData?.financials?.total || null,
        invoiceData?.items?.length || 0,
        fileHash,
        fingerprint,
        pdfFilePath,
        processedBy
      ], function(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, invoiceNumber });
      });
    });
  }

  /**
   * Log duplicate attempt
   */
  async logDuplicateAttempt(invoiceNumber, pdfFilePath, duplicateType, matchedInvoiceId, attemptedBy = 'SYSTEM', notes = '') {
    return new Promise((resolve, reject) => {
      const fileHash = fs.existsSync(pdfFilePath) ? this.calculateFileHash(pdfFilePath) : null;

      const sql = `
        INSERT INTO duplicate_attempts
        (invoice_number, pdf_file_path, pdf_file_hash, duplicate_type,
         matched_invoice_id, attempted_by, action_taken, notes)
        VALUES (?, ?, ?, ?, ?, ?, 'REJECTED', ?)
      `;

      this.db.run(sql, [
        invoiceNumber,
        pdfFilePath,
        fileHash,
        duplicateType,
        matchedInvoiceId,
        attemptedBy,
        notes
      ], function(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID });
      });
    });
  }

  /**
   * Get duplicate statistics
   */
  async getDuplicateStats() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT
          COUNT(*) as total_attempts,
          COUNT(DISTINCT invoice_number) as unique_invoices,
          SUM(CASE WHEN duplicate_type = 'INVOICE_NUMBER' THEN 1 ELSE 0 END) as by_number,
          SUM(CASE WHEN duplicate_type = 'FILE_HASH' THEN 1 ELSE 0 END) as by_file_hash,
          SUM(CASE WHEN duplicate_type = 'CONTENT_FINGERPRINT' THEN 1 ELSE 0 END) as by_content,
          SUM(CASE WHEN duplicate_type = 'DATE_AMOUNT' THEN 1 ELSE 0 END) as by_date_amount,
          MAX(attempted_at) as last_attempt
        FROM duplicate_attempts
      `;

      this.db.get(sql, [], (err, row) => {
        if (err) return reject(err);
        resolve(row || {});
      });
    });
  }

  /**
   * Get list of processed invoices
   */
  async getProcessedInvoices(limit = 100) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT
          invoice_number,
          invoice_date,
          total_amount,
          item_count,
          processed_at
        FROM processed_invoices
        ORDER BY processed_at DESC
        LIMIT ?
      `;

      this.db.all(sql, [limit], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }

  /**
   * Scan directory for duplicate PDFs before processing
   */
  async scanDirectoryForDuplicates(pdfDir) {
    const files = fs.readdirSync(pdfDir).filter(f => f.endsWith('.pdf'));
    console.log(`🔍 Scanning ${files.length} PDF files for duplicates...`);

    const results = {
      total: files.length,
      new: 0,
      duplicates: 0,
      duplicateList: []
    };

    for (const file of files) {
      const pdfPath = path.join(pdfDir, file);
      const invoiceNumber = path.basename(file, '.pdf');

      const check = await this.checkForDuplicate(invoiceNumber, pdfPath);

      if (check.isDuplicate) {
        results.duplicates++;
        results.duplicateList.push({
          file,
          invoiceNumber,
          type: check.duplicateType,
          matchedInvoice: check.matchedInvoice?.invoice_number,
          reasons: check.reasons
        });
      } else {
        results.new++;
      }
    }

    return results;
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = DuplicatePreventionSystem;

// CLI usage
if (require.main === module) {
  const system = new DuplicatePreventionSystem();

  (async () => {
    try {
      await system.initialize();

      // Scan for duplicates
      const results = await system.scanDirectoryForDuplicates('./data/invoices');

      console.log('');
      console.log('📊 DUPLICATE SCAN RESULTS');
      console.log('=' .repeat(70));
      console.log(`Total PDFs: ${results.total}`);
      console.log(`New/Unique: ${results.new}`);
      console.log(`Duplicates: ${results.duplicates}`);
      console.log('');

      if (results.duplicates > 0) {
        console.log('⚠️  DUPLICATE FILES FOUND:');
        console.log('-'.repeat(70));
        results.duplicateList.forEach((dup, i) => {
          console.log(`${i + 1}. ${dup.file}`);
          console.log(`   Type: ${dup.type}`);
          console.log(`   Matches: ${dup.matchedInvoice}`);
          console.log(`   Reason: ${dup.reasons.join(', ')}`);
          console.log('');
        });
      }

      // Get stats
      const stats = await system.getDuplicateStats();
      console.log('📈 HISTORICAL DUPLICATE ATTEMPTS:');
      console.log('-'.repeat(70));
      console.log(`Total attempts blocked: ${stats.total_attempts || 0}`);
      console.log(`By invoice number: ${stats.by_number || 0}`);
      console.log(`By file hash: ${stats.by_file_hash || 0}`);
      console.log(`By content: ${stats.by_content || 0}`);
      console.log(`By date/amount: ${stats.by_date_amount || 0}`);
      console.log('');

      system.close();
    } catch (error) {
      console.error('❌ Error:', error);
      system.close();
      process.exit(1);
    }
  })();
}
