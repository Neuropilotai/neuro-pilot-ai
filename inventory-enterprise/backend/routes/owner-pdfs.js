/**
 * Owner PDF Invoice Manager API v4.1.0
 * Owner-only routes for managing PDF invoices
 *
 * Features:
 * - List PDFs with processed/unprocessed filtering
 * - Cutoff date filtering for batch processing
 * - Bulk mark PDFs as processed and link to counts
 * - PDF preview/streaming
 * - Comprehensive audit logging
 * - Prometheus metrics
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const { requireOwner } = require('../middleware/requireOwner');
const db = require('../config/database');
const metricsExporter = require('../utils/metricsExporter');
const promClient = require('prom-client');

// ============================================================================
// PROMETHEUS METRICS
// ============================================================================

const pdfListCounter = new promClient.Counter({
  name: 'owner_pdf_list_requests_total',
  help: 'Total number of PDF list requests by owner',
  labelNames: ['status_filter', 'has_cutoff']
});

const pdfMarkProcessedCounter = new promClient.Counter({
  name: 'owner_pdf_mark_processed_total',
  help: 'Total number of PDFs marked as processed',
  labelNames: ['count_id', 'bulk_size_range']
});

const pdfPreviewCounter = new promClient.Counter({
  name: 'owner_pdf_preview_requests_total',
  help: 'Total number of PDF preview requests',
  labelNames: ['success']
});

const pdfRouteLatency = new promClient.Histogram({
  name: 'owner_pdf_route_latency_seconds',
  help: 'Latency of owner PDF routes in seconds',
  labelNames: ['route', 'method'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

// Register metrics
metricsExporter.register.registerMetric(pdfListCounter);
metricsExporter.register.registerMetric(pdfMarkProcessedCounter);
metricsExporter.register.registerMetric(pdfPreviewCounter);
metricsExporter.register.registerMetric(pdfRouteLatency);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse invoice number from filename
 * Extracts numeric invoice number from various filename patterns
 */
function parseInvoiceNumber(filename) {
  if (!filename) return null;

  // Try to extract invoice number from filename
  // Patterns: 2002362584.pdf, invoice_2002362584.pdf, etc.
  const match = filename.match(/(\d{10,})/);
  return match ? match[1] : null;
}

/**
 * Parse invoice date from filename (v13.1)
 * Handles patterns like:
 *   GFS_2025-05-14_9027091040.pdf → 2025-05-14
 *   9027091040_2025-05-14.pdf → 2025-05-14
 *   2025-05-14_invoice.pdf → 2025-05-14
 *   GFS_20250514_invoice.pdf → 2025-05-14
 */
function parseInvoiceDate(filename) {
  if (!filename) return null;

  // Try YYYY-MM-DD pattern first
  const dashDateMatch = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (dashDateMatch) {
    return `${dashDateMatch[1]}-${dashDateMatch[2]}-${dashDateMatch[3]}`;
  }

  // Try YYYYMMDD pattern (no separators)
  const compactDateMatch = filename.match(/(\d{4})(\d{2})(\d{2})/);
  if (compactDateMatch) {
    return `${compactDateMatch[1]}-${compactDateMatch[2]}-${compactDateMatch[3]}`;
  }

  return null;
}

/**
 * Parse vendor from filename (v13.1)
 * Defaults to GFS if not specified
 */
function parseVendor(filename) {
  if (!filename) return 'GFS';

  const upper = filename.toUpperCase();
  if (upper.includes('SYSCO')) return 'Sysco';
  if (upper.includes('USF')) return 'US Foods';
  if (upper.includes('GFS') || upper.includes('GORDON')) return 'GFS';

  // Default to GFS for unrecognized vendors
  return 'GFS';
}

/**
 * Persist invoice metadata to documents table (v13.1)
 * Updates invoice_date, invoice_number, vendor columns for quick queries
 */
async function persistInvoiceMetadata(documentId, { invoiceNumber, invoiceDate, vendor, amount }) {
  try {
    const updates = [];
    const params = [];

    if (invoiceNumber) {
      updates.push('invoice_number = ?');
      params.push(invoiceNumber);
    }
    if (invoiceDate) {
      updates.push('invoice_date = ?');
      params.push(invoiceDate);
    }
    if (vendor) {
      updates.push('vendor = ?');
      params.push(vendor);
    }
    if (amount) {
      updates.push('invoice_amount = ?');
      params.push(amount);
    }

    if (updates.length === 0) return;

    params.push(documentId);
    const sql = `UPDATE documents SET ${updates.join(', ')} WHERE id = ?`;
    await db.run(sql, params);
  } catch (err) {
    console.error(`Failed to persist invoice metadata for ${documentId}:`, err);
    // Don't throw - this is a best-effort optimization
  }
}

/**
 * Categorize bulk size for metrics
 */
function getBulkSizeRange(count) {
  if (count === 1) return '1';
  if (count <= 5) return '2-5';
  if (count <= 10) return '6-10';
  if (count <= 50) return '11-50';
  if (count <= 100) return '51-100';
  return '100+';
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/owner/pdfs
 * List all PDF documents with filtering options (v13.1 enhanced)
 *
 * Query params:
 * - status: 'all' | 'processed' | 'unprocessed' (default: 'all')
 * - cutoff: ISO8601 date string (filters unprocessed PDFs by created_at <= cutoff)
 * - from: YYYY-MM-DD (filters by invoice_date >= from)
 * - to: YYYY-MM-DD (filters by invoice_date <= to)
 * - vendor: vendor name filter (e.g., 'GFS', 'Sysco')
 * - limit: number of results (default: 500)
 *
 * Response:
 * {
 *   success: true,
 *   data: [{ id, filename, invoiceNumber, invoiceDate, vendor, amount, isProcessed, ... }],
 *   summary: { total, with_date, missing_date, included, not_included, period: {from, to} }
 * }
 */
router.get('/', authenticateToken, requireOwner, async (req, res) => {
  const timer = pdfRouteLatency.startTimer({ route: '/pdfs', method: 'GET' });

  try {
    const { status = 'all', cutoff, from, to, vendor, limit = 500 } = req.query;
    const hasCutoff = !!cutoff;

    pdfListCounter.inc({ status_filter: status, has_cutoff: hasCutoff.toString() });

    // v13.1: Base query with new invoice columns
    let query = `
      SELECT DISTINCT
        d.id,
        d.filename,
        d.path,
        d.size_bytes,
        d.mime_type,
        d.sha256,
        d.created_at,
        d.created_by,
        d.tenant_id,
        d.metadata as invoice_metadata,
        d.invoice_date,
        d.invoice_number,
        d.vendor,
        d.invoice_amount,
        pi.line_id as processed_invoice_id,
        pi.invoice_number as processed_invoice_number,
        pi.received_date,
        pi.extended_cost as total_amount,
        pi.created_at as processed_at,
        cp.count_id as linked_count_id,
        cp.attached_at as linked_at
      FROM documents d
      LEFT JOIN count_documents cp ON d.id = cp.document_id
      LEFT JOIN processed_invoices pi ON pi.document_id = d.id
      WHERE d.mime_type = 'application/pdf'
        AND d.deleted_at IS NULL
    `;

    const params = [];

    // v13.1: Apply vendor filter
    if (vendor) {
      query += ' AND d.vendor = ?';
      params.push(vendor);
    }

    // v13.1: Apply period filter (from/to dates)
    if (from) {
      query += ' AND d.invoice_date >= ?';
      params.push(from);
    }
    if (to) {
      query += ' AND d.invoice_date <= ?';
      params.push(to);
    }

    // Apply status filter
    if (status === 'unprocessed') {
      query += ' AND cp.document_id IS NULL';

      // Apply cutoff date filter for unprocessed only
      if (cutoff) {
        query += ' AND d.created_at <= ?';
        params.push(cutoff);
      }
    } else if (status === 'processed') {
      query += ' AND cp.document_id IS NOT NULL';
    }

    // v13.1: Order by invoice_date DESC (most recent first), fallback to created_at
    query += ' ORDER BY COALESCE(d.invoice_date, d.created_at) DESC';

    // Apply limit
    query += ' LIMIT ?';
    params.push(parseInt(limit, 10));

    const documents = await db.all(query, params);

    // v13.1: Enrich with derived fields and parse missing dates
    const enriched = [];
    const toPersist = []; // Track docs that need metadata persisted

    for (const doc of documents) {
      // Start with database columns (already normalized)
      let invoiceNumber = doc.invoice_number;
      let invoiceDate = doc.invoice_date;
      let vendorName = doc.vendor || 'GFS';
      let totalAmount = doc.invoice_amount;

      // If columns are null, try parsing from metadata JSON (legacy)
      if (doc.invoice_metadata) {
        try {
          const metadata = JSON.parse(doc.invoice_metadata);
          if (!invoiceNumber && metadata.invoice_number) {
            invoiceNumber = metadata.invoice_number;
          }
          if (!invoiceDate && metadata.invoice_date) {
            invoiceDate = metadata.invoice_date;
          }
          if (!vendorName && metadata.vendor) {
            vendorName = metadata.vendor;
          }
          if (!totalAmount && metadata.total_amount) {
            totalAmount = metadata.total_amount;
          }
        } catch (e) {
          // Invalid JSON, use fallback
        }
      }

      // If still missing, parse from filename
      let needsPersist = false;
      if (!invoiceNumber) {
        invoiceNumber = parseInvoiceNumber(doc.filename) || doc.processed_invoice_number;
        if (invoiceNumber) needsPersist = true;
      }

      if (!invoiceDate) {
        // Try parsing date from filename first
        invoiceDate = parseInvoiceDate(doc.filename);
        if (!invoiceDate) {
          // Fallback to received_date or processed_at
          invoiceDate = doc.received_date || doc.processed_at;
        }
        if (invoiceDate) needsPersist = true;
      }

      if (!vendorName || vendorName === 'GFS') {
        const parsed = parseVendor(doc.filename);
        if (parsed && parsed !== vendorName) {
          vendorName = parsed;
          needsPersist = true;
        }
      }

      // If we parsed new data, queue for persistence
      if (needsPersist) {
        toPersist.push({
          documentId: doc.id,
          invoiceNumber,
          invoiceDate,
          vendor: vendorName,
          amount: totalAmount
        });
      }

      enriched.push({
        id: doc.id,
        filename: doc.filename,
        invoiceNumber: invoiceNumber || 'N/A',
        invoiceDate: invoiceDate,
        vendor: vendorName,
        amount: totalAmount,
        createdAt: doc.created_at,
        isProcessed: !!doc.linked_count_id,
        includedInCount: !!doc.linked_count_id, // v13.1: explicit inclusion flag
        linkedCountId: doc.linked_count_id,
        linkedAt: doc.linked_at,
        processedInvoiceId: doc.processed_invoice_id,
        processedAt: doc.processed_at,
        receivedDate: doc.received_date,
        sha256: doc.sha256,
        sha256Truncated: doc.sha256 ? doc.sha256.substring(0, 16) + '...' : null,
        sizeMB: doc.size_bytes ? (doc.size_bytes / 1024 / 1024).toFixed(2) : null,
        sizeBytes: doc.size_bytes,
        path: doc.path,
        previewUrl: `/api/owner/pdfs/${doc.id}/preview`,
        tenantId: doc.tenant_id,
        createdBy: doc.created_by
      });
    }

    // v13.1: Persist parsed metadata asynchronously (don't block response)
    if (toPersist.length > 0) {
      setImmediate(async () => {
        for (const item of toPersist) {
          await persistInvoiceMetadata(item.documentId, item);
        }
        console.log(`📅 Persisted invoice metadata for ${toPersist.length} documents`);
      });
    }

    // v13.1: Calculate enhanced statistics
    const stats = {
      total: enriched.length,
      with_date: enriched.filter(d => d.invoiceDate).length,
      missing_date: enriched.filter(d => !d.invoiceDate).length,
      included_in_count: enriched.filter(d => d.includedInCount).length,
      not_included: enriched.filter(d => !d.includedInCount).length,
      processed: enriched.filter(d => d.isProcessed).length,
      unprocessed: enriched.filter(d => !d.isProcessed).length
    };

    timer();

    res.json({
      success: true,
      data: enriched,
      summary: {
        ...stats,
        cutoffApplied: hasCutoff ? cutoff : null,
        filterApplied: status,
        period: { from: from || null, to: to || null },
        vendor: vendor || null
      }
    });
  } catch (error) {
    console.error('Error listing PDFs:', error);
    timer();

    res.status(500).json({
      success: false,
      error: 'Failed to list PDF invoices',
      message: error.message
    });
  }
});

/**
 * POST /api/owner/pdfs/mark-processed
 * Bulk mark PDFs as processed and link to a count
 *
 * Body:
 * {
 *   invoiceIds: string[],  // array of document IDs
 *   countId: string,       // count ID to link to
 *   processedAt?: string   // optional ISO8601 timestamp
 * }
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     processedCount: number,
 *     linkedCount: number,
 *     countId: string,
 *     invoiceIds: string[]
 *   }
 * }
 */
router.post('/mark-processed', authenticateToken, requireOwner, async (req, res) => {
  const timer = pdfRouteLatency.startTimer({ route: '/mark-processed', method: 'POST' });

  try {
    const { invoiceIds, countId, processedAt } = req.body;

    // Validation
    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      timer();
      return res.status(400).json({
        success: false,
        error: 'invoiceIds array is required and must not be empty'
      });
    }

    if (!countId) {
      timer();
      return res.status(400).json({
        success: false,
        error: 'countId is required'
      });
    }

    const processedTimestamp = processedAt || new Date().toISOString();
    const userId = req.user?.id || 'unknown';
    const userEmail = req.user?.email || 'unknown';

    pdfMarkProcessedCounter.inc({
      count_id: countId,
      bulk_size_range: getBulkSizeRange(invoiceIds.length)
    });

    // Collect metadata for audit and results
    const sha256Hashes = [];
    const processedInvoices = [];
    let linkedCount = 0;
    let skippedCount = 0;

    // Process each document
    for (const documentId of invoiceIds) {
      try {
        // Get document details
        const doc = await db.get(
          'SELECT id, filename, sha256, path FROM documents WHERE id = ? AND mime_type = ? AND deleted_at IS NULL',
          [documentId, 'application/pdf']
        );

        if (!doc) {
          console.warn(`Document ${documentId} not found or not a PDF`);
          skippedCount++;
          continue;
        }

        sha256Hashes.push({
          documentId: doc.id,
          filename: doc.filename,
          sha256: doc.sha256.substring(0, 16)
        });

        // Parse invoice number from filename
        const invoiceNumber = parseInvoiceNumber(doc.filename);

        // Check if already linked to this count
        const existingLink = await db.get(
          'SELECT count_id FROM count_documents WHERE count_id = ? AND document_id = ?',
          [countId, documentId]
        );

        if (existingLink) {
          console.log(`Document ${documentId} already linked to count ${countId}, skipping`);
          skippedCount++;
          continue;
        }

        // Insert into count_documents (linking document to count)
        const insertCountDocSql = `
          INSERT INTO count_documents (
            count_id,
            document_id,
            attached_at,
            attached_by,
            notes
          ) VALUES (?, ?, ?, ?, ?)
        `;

        await db.run(insertCountDocSql, [
          countId,
          documentId,
          processedTimestamp,
          userEmail,
          `Bulk processed by owner ${userEmail}`
        ]);

        linkedCount++;

        // If invoice number exists, ensure it's in processed_invoices
        if (invoiceNumber) {
          const existingInvoice = await db.get(
            'SELECT line_id FROM processed_invoices WHERE invoice_number = ?',
            [invoiceNumber]
          );

          if (!existingInvoice) {
            // Create processed_invoice entry (line item format)
            const insertInvoiceSql = `
              INSERT INTO processed_invoices (
                document_id,
                invoice_number,
                item_description,
                quantity,
                unit,
                received_date,
                notes,
                created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const result = await db.run(insertInvoiceSql, [
              documentId,
              invoiceNumber,
              'Bulk invoice entry',
              1,
              'ea',
              processedTimestamp,
              'Processed via owner PDF manager',
              processedTimestamp
            ]);

            processedInvoices.push({
              lineId: result.lastID,
              invoiceNumber: invoiceNumber,
              documentId: documentId
            });
          }
        }

      } catch (invoiceError) {
        console.error(`Error processing document ${documentId}:`, invoiceError);
        skippedCount++;
        // Continue with other invoices
      }
    }

    // Audit logging
    try {
      const auditSql = `
        INSERT INTO owner_console_events (
          owner_id,
          event_type,
          event_data,
          ip_address,
          user_agent,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `;

      await db.run(auditSql, [
        userId,
        'PDF_MARK_PROCESSED',
        JSON.stringify({
          action: 'PDF_MARK_PROCESSED',
          countId: countId,
          invoiceIds: invoiceIds,
          sha256Hashes: sha256Hashes,
          processedInvoicesCreated: processedInvoices,
          linkedCount: linkedCount,
          skippedCount: skippedCount,
          user: userEmail,
          timestamp: processedTimestamp
        }),
        req.ip || req.connection?.remoteAddress || 'unknown',
        req.get('User-Agent') || 'unknown',
        new Date().toISOString()
      ]);
    } catch (auditError) {
      console.error('Audit log failed:', auditError);
      // Don't fail the request if audit fails
    }

    timer();

    res.json({
      success: true,
      data: {
        linkedCount: linkedCount,
        skippedCount: skippedCount,
        processedInvoicesCreated: processedInvoices.length,
        countId: countId,
        processedAt: processedTimestamp,
        invoiceIds: invoiceIds,
        details: {
          processed: processedInvoices,
          sha256Hashes: sha256Hashes
        }
      }
    });
  } catch (error) {
    console.error('Error marking PDFs as processed:', error);
    timer();

    res.status(500).json({
      success: false,
      error: 'Failed to mark PDFs as processed',
      message: error.message
    });
  }
});

/**
 * GET /api/owner/pdfs/:documentId/preview
 * Stream PDF file for preview
 *
 * Params:
 * - documentId: document ID from documents table
 * Query:
 * - token: JWT token (for iframe authentication)
 *
 * Response: PDF file stream (Content-Type: application/pdf)
 */
router.get('/:documentId/preview', async (req, res) => {
  // Support token from query param for iframe viewing
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).send(`
      <html><body style="font-family: sans-serif; padding: 40px; text-align: center;">
        <h1>🔒 Authentication Required</h1>
        <p>Access token is missing. Please refresh the page and try again.</p>
        <p style="color: #666; font-size: 14px;">Error Code: TOKEN_MISSING</p>
      </body></html>
    `);
  }

  // Verify JWT token directly (bypass middleware to avoid response conflicts)
  const jwt = require('jsonwebtoken');
  const { jwt: jwtConfig } = require('../config/security');
  const { users } = require('../middleware/auth');

  let user;
  try {
    const decoded = jwt.verify(token, jwtConfig.secret);
    user = Array.from(users.values()).find(u => u.id === decoded.id);

    if (!user || !user.isActive) {
      return res.status(403).send(`
        <html><body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>🔒 Access Denied</h1>
          <p>User account is inactive.</p>
          <p style="color: #666; font-size: 14px;">Error Code: USER_INACTIVE</p>
        </body></html>
      `);
    }

    if (user.role !== 'owner' && user.role !== 'admin') {
      return res.status(403).send(`
        <html><body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>🔒 Access Denied</h1>
          <p>Owner access required.</p>
          <p style="color: #666; font-size: 14px;">Error Code: INSUFFICIENT_PERMISSIONS</p>
        </body></html>
      `);
    }

    // Set user on request for audit logging
    req.user = user;
  } catch (jwtError) {
    return res.status(403).send(`
      <html><body style="font-family: sans-serif; padding: 40px; text-align: center;">
        <h1>🔒 Authentication Failed</h1>
        <p>Invalid or expired token. Please refresh the page and login again.</p>
        <p style="color: #666; font-size: 14px;">Error: ${jwtError.message}</p>
      </body></html>
    `);
  }

  const timer = pdfRouteLatency.startTimer({ route: '/preview', method: 'GET' });

  try {
    const { documentId } = req.params;

    // Get document from database
    const document = await db.get(`
      SELECT id, filename, path, mime_type, size_bytes, invoice_metadata
      FROM documents
      WHERE id = ? AND mime_type = 'application/pdf' AND deleted_at IS NULL
    `, [documentId]);

    if (!document) {
      timer();
      pdfPreviewCounter.inc({ success: 'false' });
      return res.status(404).json({
        success: false,
        error: 'PDF document not found'
      });
    }

    // Extract invoice number from metadata
    let invoiceNumber = null;
    if (document.invoice_metadata) {
      try {
        const metadata = JSON.parse(document.invoice_metadata);
        invoiceNumber = metadata.invoice_number;
      } catch (e) {
        // Invalid JSON, will try filename fallback
      }
    }

    // Resolve file path - PDFs stored in OneDrive "GFS Order PDF" folder
    let filePath;

    // If path is absolute, use it
    if (path.isAbsolute(document.path)) {
      filePath = document.path;
    } else {
      // Check OneDrive "GFS Order PDF" folder first
      // Try invoice number first (files are named like "9020806184.pdf")
      let oneDrivePath;
      if (invoiceNumber) {
        oneDrivePath = path.join(
          process.env.HOME || '/Users/davidmikulis',
          'OneDrive',
          'GFS Order PDF',
          `${invoiceNumber}.pdf`
        );
      } else {
        // Fallback to hash filename
        oneDrivePath = path.join(
          process.env.HOME || '/Users/davidmikulis',
          'OneDrive',
          'GFS Order PDF',
          document.filename
        );
      }

      // Try OneDrive location first
      try {
        await fs.access(oneDrivePath);
        filePath = oneDrivePath;
      } catch {
        // Fallback to original relative path
        filePath = path.join(__dirname, '..', document.path);
      }
    }

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      timer();
      pdfPreviewCounter.inc({ success: 'false' });
      return res.status(404).json({
        success: false,
        error: 'PDF file not found on disk',
        path: document.path
      });
    }

    // v13.1: Audit hook for PDF viewing
    try {
      const auditSql = `
        INSERT INTO owner_console_events (
          owner_id,
          event_type,
          event_data,
          ip_address,
          user_agent,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `;

      await db.run(auditSql, [
        req.user.id || 'unknown',
        'INVOICE_VIEWED',
        JSON.stringify({
          action: 'INVOICE_VIEWED',
          document_id: documentId,
          filename: document.filename,
          invoice_number: invoiceNumber,
          timestamp: new Date().toISOString()
        }),
        req.ip || req.connection?.remoteAddress || 'unknown',
        req.get('User-Agent') || 'unknown',
        new Date().toISOString()
      ]);
    } catch (auditError) {
      console.error('Audit log failed (non-fatal):', auditError);
      // Don't block PDF viewing if audit fails
    }

    // Stream PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${document.filename}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    if (document.size_bytes) {
      res.setHeader('Content-Length', document.size_bytes);
    }

    const fileStream = require('fs').createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on('end', () => {
      timer();
      pdfPreviewCounter.inc({ success: 'true' });
    });

    fileStream.on('error', (error) => {
      console.error('Error streaming PDF:', error);
      timer();
      pdfPreviewCounter.inc({ success: 'false' });
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Failed to stream PDF'
        });
      }
    });
  } catch (error) {
    console.error('Error previewing PDF:', error);
    timer();
    pdfPreviewCounter.inc({ success: 'false' });

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Failed to preview PDF',
        message: error.message
      });
    }
  }
});

/**
 * POST /api/owner/pdfs/upload
 * Upload a PDF invoice document
 *
 * Body (multipart/form-data):
 * - file: PDF file
 * - invoiceNumber: (optional) invoice number
 * - notes: (optional) notes
 *
 * Response:
 * {
 *   success: true,
 *   data: { documentId, filename, sha256, size }
 * }
 */
router.post('/upload', authenticateToken, requireOwner, async (req, res) => {
  const timer = pdfRouteLatency.startTimer({ route: '/upload', method: 'POST' });

  try {
    const multer = require('multer');
    const crypto = require('crypto');
    const { v4: uuidv4 } = require('uuid');

    // Configure multer for PDF uploads
    const storage = multer.diskStorage({
      destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'data', 'pdfs', new Date().getFullYear().toString());
        try {
          await fs.mkdir(uploadDir, { recursive: true });
        } catch (err) {
          return cb(err);
        }
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        const timestamp = Date.now();
        const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${timestamp}_${sanitized}`);
      }
    });

    const upload = multer({
      storage: storage,
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
      fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
          cb(null, true);
        } else {
          cb(new Error('Only PDF files are allowed'));
        }
      }
    }).single('file');

    // Handle upload
    upload(req, res, async (uploadErr) => {
      if (uploadErr) {
        timer();
        return res.status(400).json({
          success: false,
          error: 'Upload failed',
          message: uploadErr.message
        });
      }

      if (!req.file) {
        timer();
        return res.status(400).json({
          success: false,
          error: 'No file provided'
        });
      }

      try {
        // Calculate SHA256
        const fileBuffer = await fs.readFile(req.file.path);
        const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        // Check for duplicates
        const existingDoc = await db.get(
          'SELECT id FROM documents WHERE sha256 = ? AND deleted_at IS NULL',
          [sha256]
        );

        if (existingDoc) {
          // Delete uploaded file (it's a duplicate)
          await fs.unlink(req.file.path);
          timer();
          return res.status(409).json({
            success: false,
            error: 'Duplicate document',
            message: 'This PDF has already been uploaded',
            existingDocumentId: existingDoc.id
          });
        }

        // Get tenant_id from user
        const tenantId = req.user.tenant_id || 'default';
        const userId = req.user.id || 'unknown';

        // Insert into documents table
        const documentId = uuidv4();
        const relativePath = path.relative(
          path.join(__dirname, '..'),
          req.file.path
        );

        const insertSql = `
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
        `;

        await db.run(insertSql, [
          documentId,
          tenantId,
          relativePath,
          req.file.originalname,
          'application/pdf',
          req.file.size,
          sha256,
          userId,
          new Date().toISOString()
        ]);

        timer();

        res.status(201).json({
          success: true,
          message: 'PDF uploaded successfully',
          data: {
            documentId: documentId,
            filename: req.file.originalname,
            sha256: sha256,
            sha256Truncated: sha256.substring(0, 16) + '...',
            sizeMB: (req.file.size / 1024 / 1024).toFixed(2),
            sizeBytes: req.file.size,
            path: relativePath,
            invoiceNumber: parseInvoiceNumber(req.file.originalname)
          }
        });

      } catch (dbError) {
        console.error('Database error during upload:', dbError);
        timer();
        res.status(500).json({
          success: false,
          error: 'Failed to save document metadata',
          message: dbError.message
        });
      }
    });

  } catch (error) {
    console.error('Upload endpoint error:', error);
    timer();
    res.status(500).json({
      success: false,
      error: 'Upload failed',
      message: error.message
    });
  }
});

module.exports = router;
