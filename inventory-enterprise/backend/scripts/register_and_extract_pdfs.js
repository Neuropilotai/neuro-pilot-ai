#!/usr/bin/env node

/**
 * NeuroPilot v10.1 - PDF Registration & Text Extraction
 *
 * This script:
 * 1. Scans data/pdfs directory for all PDF files
 * 2. Registers PDFs in the documents table
 * 3. Extracts full text from each PDF
 * 4. Stores extracted text for Order Intelligence processing
 *
 * Usage: node scripts/register_and_extract_pdfs.js
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const pdf = require('pdf-parse');
const db = require('../config/database');

// Configuration
const PDF_BASE_DIR = path.join(__dirname, '../data/pdfs');
const TENANT_ID = 'default'; // Default tenant for system PDFs
const CREATED_BY = 'SYSTEM_PDF_IMPORTER';

// Statistics
const stats = {
  total: 0,
  registered: 0,
  alreadyRegistered: 0,
  extracted: 0,
  extractionFailed: 0,
  errors: []
};

/**
 * Calculate SHA256 hash of file
 */
function calculateFileHash(filePath) {
  const fileBuffer = fsSync.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * Get file stats
 */
async function getFileStats(filePath) {
  const stat = await fs.stat(filePath);
  return {
    sizeBytes: stat.size,
    createdAt: stat.birthtime.toISOString()
  };
}

/**
 * Extract text from PDF
 */
async function extractPdfText(filePath) {
  try {
    const dataBuffer = fsSync.readFileSync(filePath);
    const pdfData = await pdf(dataBuffer, {
      max: 0, // Extract all pages
      version: 'default'
    });

    return {
      text: pdfData.text,
      numPages: pdfData.numpages,
      info: pdfData.info,
      quality: determineExtractionQuality(pdfData.text)
    };
  } catch (error) {
    throw new Error(`PDF extraction failed: ${error.message}`);
  }
}

/**
 * Determine extraction quality based on text content
 */
function determineExtractionQuality(text) {
  if (!text || text.trim().length === 0) {
    return 'FAILED';
  }

  const length = text.length;
  const hasInvoiceNumber = /invoice\s*\d{10}/i.test(text);
  const hasDate = /\d{2}\/\d{2}\/\d{4}/.test(text);
  const hasTotal = /total|amount/i.test(text);

  let score = 0;
  if (length > 1000) score += 25;
  if (length > 5000) score += 25;
  if (hasInvoiceNumber) score += 25;
  if (hasDate) score += 15;
  if (hasTotal) score += 10;

  if (score >= 90) return 'PERFECT';
  if (score >= 70) return 'GOOD';
  if (score >= 50) return 'ACCEPTABLE';
  return 'POOR';
}

/**
 * Parse order intelligence signals from text
 */
function parseOrderSignals(text) {
  const signals = {
    week_tags: [],
    delivery_eta: null,
    credit_notes: [],
    lead_time_days: null,
    constraints: []
  };

  // Extract week tags (e.g., "week 1 & 2", "W1-W2", "BEN WEEK 2-3")
  const weekPattern = /(?:week|w[k]?)\s*(\d)(?:\s*[&+\-]\s*(\d))?/gi;
  let weekMatch;
  while ((weekMatch = weekPattern.exec(text)) !== null) {
    const week1 = parseInt(weekMatch[1]);
    const week2 = weekMatch[2] ? parseInt(weekMatch[2]) : null;

    if (week1 >= 1 && week1 <= 4 && !signals.week_tags.includes(`week ${week1}`)) {
      signals.week_tags.push(`week ${week1}`);
    }
    if (week2 && week2 >= 1 && week2 <= 4 && !signals.week_tags.includes(`week ${week2}`)) {
      signals.week_tags.push(`week ${week2}`);
    }
  }

  // Extract delivery ETA (e.g., "delivery Thu/Fri", "ETA 10 days", "ships Friday")
  const etaPattern = /(?:delivery|arrive|eta|ship)(?:s|ed)?[:\s]+([A-Za-z]+(?:\/[A-Za-z]+)?|\d+\s*days?)/gi;
  const etaMatch = etaPattern.exec(text);
  if (etaMatch) {
    signals.delivery_eta = etaMatch[1];
  }

  // Extract credit notes (e.g., "credit note", "CN# 12345", "credit memo")
  const creditPattern = /(?:credit|CN#\s*(\d+)|credit\s*memo)/gi;
  let creditMatch;
  while ((creditMatch = creditPattern.exec(text)) !== null) {
    const creditNote = creditMatch[1] || 'CREDIT_DETECTED';
    if (!signals.credit_notes.includes(creditNote)) {
      signals.credit_notes.push(creditNote);
    }
  }

  // Extract supplier constraints
  const constraintPattern = /backorder|limited\s+supply|substituted|discontinued|out\s+of\s+stock/gi;
  let constraintMatch;
  while ((constraintMatch = constraintPattern.exec(text)) !== null) {
    const constraint = constraintMatch[0].toLowerCase();
    if (!signals.constraints.includes(constraint)) {
      signals.constraints.push(constraint);
    }
  }

  return signals;
}

/**
 * Parse invoice metadata from text
 */
function parseInvoiceMetadata(text) {
  const metadata = {
    invoice_number: null,
    invoice_date: null,
    due_date: null,
    total_amount: null,
    customer_name: null
  };

  // Extract invoice number
  const invoiceMatch = text.match(/invoice\s*(\d{10})/i);
  if (invoiceMatch) {
    metadata.invoice_number = invoiceMatch[1];
  }

  // Extract invoice date (MM/DD/YYYY format)
  const dateMatch = text.match(/invoice\s*date[:\s]*(\d{2}\/\d{2}\/\d{4})/i);
  if (dateMatch) {
    const [month, day, year] = dateMatch[1].split('/');
    metadata.invoice_date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Extract due date
  const dueMatch = text.match(/due\s*date[:\s]*(\d{2}\/\d{2}\/\d{4})/i);
  if (dueMatch) {
    const [month, day, year] = dueMatch[1].split('/');
    metadata.due_date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Extract total amount
  const totalMatch = text.match(/(?:invoice\s*total|pay\s*this\s*amount)[:\s]*-?\$?([\d,]+\.\d{2})/i);
  if (totalMatch) {
    metadata.total_amount = parseFloat(totalMatch[1].replace(/,/g, ''));
  }

  // Extract customer name
  const customerMatch = text.match(/customer[:\s]*\d+\s+([A-Z0-9\s\-]+)/i);
  if (customerMatch) {
    metadata.customer_name = customerMatch[1].trim();
  }

  return metadata;
}

/**
 * Find all PDF files recursively
 */
async function findAllPdfs(baseDir) {
  const pdfs = [];

  async function scan(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        pdfs.push(fullPath);
      }
    }
  }

  await scan(baseDir);
  return pdfs;
}

/**
 * Register a single PDF in the database
 */
async function registerPdf(filePath) {
  const fileName = path.basename(filePath);
  const relativePath = path.relative(path.join(__dirname, '../data'), filePath);

  // Calculate file hash
  const sha256 = calculateFileHash(filePath);

  // Check if already registered
  const existing = await db.get(
    'SELECT id FROM documents WHERE sha256 = ? AND deleted_at IS NULL',
    [sha256]
  );

  if (existing) {
    stats.alreadyRegistered++;
    return existing.id;
  }

  // Get file stats
  const fileStats = await getFileStats(filePath);

  // Generate document ID
  const documentId = `PDF-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  // Insert into database
  await db.run(`
    INSERT INTO documents (
      id,
      tenant_id,
      path,
      filename,
      mime_type,
      size_bytes,
      sha256,
      created_by,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    documentId,
    TENANT_ID,
    relativePath,
    fileName,
    'application/pdf',
    fileStats.sizeBytes,
    sha256,
    CREATED_BY,
    fileStats.createdAt
  ]);

  stats.registered++;
  return documentId;
}

/**
 * Extract text and update document record
 */
async function extractAndUpdatePdf(documentId, filePath) {
  try {
    // Extract text
    const extraction = await extractPdfText(filePath);

    // Parse order signals and metadata
    const orderSignals = parseOrderSignals(extraction.text);
    const invoiceMetadata = parseInvoiceMetadata(extraction.text);

    // Update document record
    await db.run(`
      UPDATE documents
      SET
        extracted_text = ?,
        extraction_date = ?,
        extraction_quality = ?,
        order_signals = ?,
        invoice_metadata = ?
      WHERE id = ?
    `, [
      extraction.text,
      new Date().toISOString(),
      extraction.quality,
      JSON.stringify(orderSignals),
      JSON.stringify(invoiceMetadata),
      documentId
    ]);

    stats.extracted++;

    return {
      success: true,
      quality: extraction.quality,
      textLength: extraction.text.length,
      orderSignals,
      invoiceMetadata
    };

  } catch (error) {
    stats.extractionFailed++;

    // Mark as failed
    await db.run(`
      UPDATE documents
      SET
        extraction_date = ?,
        extraction_quality = 'FAILED'
      WHERE id = ?
    `, [
      new Date().toISOString(),
      documentId
    ]);

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Main processing function
 */
async function processAllPdfs() {
  console.log('🚀 NeuroPilot v10.1 - PDF Registration & Text Extraction');
  console.log('=' .repeat(80));
  console.log('');

  // Find all PDFs
  console.log('📁 Scanning for PDF files...');
  const pdfFiles = await findAllPdfs(PDF_BASE_DIR);
  stats.total = pdfFiles.length;

  console.log(`✅ Found ${pdfFiles.length} PDF files`);
  console.log('');

  if (pdfFiles.length === 0) {
    console.log('⚠️  No PDF files found. Exiting.');
    return;
  }

  console.log('📝 Registering and extracting PDFs...');
  console.log('');

  // Process each PDF
  for (let i = 0; i < pdfFiles.length; i++) {
    const filePath = pdfFiles[i];
    const fileName = path.basename(filePath);

    try {
      // Show progress
      process.stdout.write(`\r[${i + 1}/${pdfFiles.length}] Processing ${fileName.substring(0, 40)}...`);

      // Register PDF (or get existing ID)
      const documentId = await registerPdf(filePath);

      // Extract text
      const result = await extractAndUpdatePdf(documentId, filePath);

      if (result.success) {
        // Log interesting findings
        if (result.orderSignals.week_tags.length > 0) {
          console.log(`\n   📌 ${fileName}: Week tags detected: ${result.orderSignals.week_tags.join(', ')}`);
        }
        if (result.orderSignals.credit_notes.length > 0) {
          console.log(`\n   💳 ${fileName}: Credit note detected`);
        }
        if (result.invoiceMetadata.invoice_number) {
          console.log(`\n   📄 ${fileName}: Invoice #${result.invoiceMetadata.invoice_number} (${result.quality})`);
        }
      }

    } catch (error) {
      stats.errors.push({
        file: fileName,
        error: error.message
      });
      console.log(`\n   ❌ ${fileName}: ${error.message}`);
    }
  }

  console.log('\n');
}

/**
 * Generate final report
 */
function generateReport() {
  console.log('');
  console.log('📊 PROCESSING REPORT');
  console.log('=' .repeat(80));
  console.log(`📦 Total PDFs found: ${stats.total}`);
  console.log(`✅ Newly registered: ${stats.registered}`);
  console.log(`🔄 Already registered: ${stats.alreadyRegistered}`);
  console.log(`📝 Text extracted: ${stats.extracted}`);
  console.log(`❌ Extraction failed: ${stats.extractionFailed}`);
  console.log('');

  const successRate = stats.total > 0 ? ((stats.extracted / stats.total) * 100).toFixed(1) : 0;
  console.log(`🎯 Success Rate: ${successRate}%`);
  console.log('');

  if (stats.errors.length > 0) {
    console.log('⚠️  ERRORS:');
    stats.errors.slice(0, 10).forEach(err => {
      console.log(`   • ${err.file}: ${err.error}`);
    });
    if (stats.errors.length > 10) {
      console.log(`   ... and ${stats.errors.length - 10} more errors`);
    }
    console.log('');
  }

  if (successRate >= 95) {
    console.log('🎉 EXCELLENT! Text extraction successful for nearly all PDFs');
  } else if (successRate >= 80) {
    console.log('✅ GOOD! Most PDFs extracted successfully');
  } else {
    console.log('⚠️  Review errors above - some PDFs may need manual inspection');
  }
  console.log('');

  console.log('🧠 ORDER INTELLIGENCE STATUS:');
  console.log('   ✅ PDF text extraction complete');
  console.log('   ✅ Order signals parsed and stored');
  console.log('   ✅ Invoice metadata extracted');
  console.log('   📊 Ready for forecast integration');
  console.log('');
  console.log('Next step: Integrate order signals with forecast confidence adjustments');
}

// Main execution
(async () => {
  try {
    await processAllPdfs();
    generateReport();
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
})();
