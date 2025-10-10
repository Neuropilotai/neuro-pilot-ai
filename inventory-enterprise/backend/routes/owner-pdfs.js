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
 * List all PDF documents with filtering options
 *
 * Query params:
 * - status: 'all' | 'processed' | 'unprocessed' (default: 'all')
 * - cutoff: ISO8601 date string (filters unprocessed PDFs by created_at <= cutoff)
 *
 * Response:
 * {
 *   success: true,
 *   data: [{ id, filename, created_at, isProcessed, linkedCountId, sha256, ... }],
 *   summary: { total, processed, unprocessed, cutoff_applied }
 * }
 */
router.get('/pdfs', authenticateToken, requireOwner, async (req, res) => {
  const timer = pdfRouteLatency.startTimer({ route: '/pdfs', method: 'GET' });

  try {
    const { status = 'all', cutoff } = req.query;
    const hasCutoff = !!cutoff;

    pdfListCounter.inc({ status_filter: status, has_cutoff: hasCutoff.toString() });

    // Base query: get all PDF documents with processing status
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
        pi.invoice_id as processed_invoice_id,
        pi.invoice_number as processed_invoice_number,
        pi.invoice_date,
        pi.total_amount,
        pi.created_at as processed_at,
        cp.count_id as linked_count_id,
        cp.attached_at as linked_at
      FROM documents d
      LEFT JOIN count_pdfs cp ON d.id = cp.document_id
      LEFT JOIN processed_invoices pi ON cp.invoice_number = pi.invoice_number
      WHERE d.mime_type = 'application/pdf'
        AND d.deleted_at IS NULL
    `;

    const params = [];

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

    query += ' ORDER BY d.created_at DESC';

    const documents = await db.all(query, params);

    // Enrich with derived fields
    const enriched = documents.map(doc => {
      const invoiceNumber = parseInvoiceNumber(doc.filename) || doc.processed_invoice_number;

      return {
        id: doc.id,
        filename: doc.filename,
        invoiceNumber: invoiceNumber,
        createdAt: doc.created_at,
        isProcessed: !!doc.linked_count_id,
        linkedCountId: doc.linked_count_id,
        linkedAt: doc.linked_at,
        processedInvoiceId: doc.processed_invoice_id,
        processedAt: doc.processed_at,
        invoiceDate: doc.invoice_date,
        totalAmount: doc.total_amount,
        sha256: doc.sha256,
        sha256Truncated: doc.sha256 ? doc.sha256.substring(0, 16) + '...' : null,
        sizeMB: doc.size_bytes ? (doc.size_bytes / 1024 / 1024).toFixed(2) : null,
        sizeBytes: doc.size_bytes,
        path: doc.path,
        previewUrl: `/api/owner/pdfs/${doc.id}/preview`,
        tenantId: doc.tenant_id,
        createdBy: doc.created_by
      };
    });

    timer();

    res.json({
      success: true,
      data: enriched,
      summary: {
        total: enriched.length,
        processed: enriched.filter(d => d.isProcessed).length,
        unprocessed: enriched.filter(d => !d.isProcessed).length,
        cutoffApplied: hasCutoff ? cutoff : null,
        filterApplied: status
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
router.post('/pdfs/mark-processed', authenticateToken, requireOwner, async (req, res) => {
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
          'SELECT count_pdf_id FROM count_pdfs WHERE count_id = ? AND document_id = ?',
          [countId, documentId]
        );

        if (existingLink) {
          console.log(`Document ${documentId} already linked to count ${countId}, skipping`);
          skippedCount++;
          continue;
        }

        // Insert into count_pdfs (linking document to count)
        const insertCountPdfSql = `
          INSERT INTO count_pdfs (
            count_id,
            document_id,
            invoice_number,
            attached_at,
            attached_by,
            notes
          ) VALUES (?, ?, ?, ?, ?, ?)
        `;

        await db.run(insertCountPdfSql, [
          countId,
          documentId,
          invoiceNumber,
          processedTimestamp,
          userEmail,
          `Bulk processed by owner ${userEmail}`
        ]);

        linkedCount++;

        // If invoice number exists, ensure it's in processed_invoices
        if (invoiceNumber) {
          const existingInvoice = await db.get(
            'SELECT invoice_id FROM processed_invoices WHERE invoice_number = ?',
            [invoiceNumber]
          );

          if (!existingInvoice) {
            // Create processed_invoice entry
            const insertInvoiceSql = `
              INSERT INTO processed_invoices (
                invoice_number,
                invoice_date,
                total_amount,
                status,
                pdf_path,
                processed_by,
                notes,
                created_at,
                updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const result = await db.run(insertInvoiceSql, [
              invoiceNumber,
              processedTimestamp,
              0.0,
              'processed',
              doc.path,
              userId,
              `Processed via owner PDF manager`,
              processedTimestamp,
              processedTimestamp
            ]);

            processedInvoices.push({
              invoiceId: result.lastID,
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
 *
 * Response: PDF file stream (Content-Type: application/pdf)
 */
router.get('/pdfs/:documentId/preview', authenticateToken, requireOwner, async (req, res) => {
  const timer = pdfRouteLatency.startTimer({ route: '/preview', method: 'GET' });

  try {
    const { documentId } = req.params;

    // Get document from database
    const document = await db.get(`
      SELECT id, filename, path, mime_type, size_bytes
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

    // Resolve file path
    const filePath = path.isAbsolute(document.path)
      ? document.path
      : path.join(__dirname, '..', document.path);

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

module.exports = router;
