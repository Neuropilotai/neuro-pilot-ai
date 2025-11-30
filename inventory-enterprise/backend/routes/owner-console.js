/**
 * @deprecated DEPRECATED IN V21.1 - SQLite-only, not mounted in production
 *
 * This module uses SQLite (sqlite3) which is not available in the
 * Railway PostgreSQL production environment. Use /api/owner routes instead.
 *
 * Original description:
 * Owner Command Center (OCC) Routes
 * End-to-end console for inventory operations, PDF management, AI control
 *
 * @version 3.1.0 (DEPRECATED)
 * @author NeuroInnovate AI Team
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth');
const { requireOwner } = require('../middleware/requireOwner');
const { auditLog, securityLog, logger } = require('../config/logger');

const router = express.Router();
const DB_PATH = path.join(__dirname, '../data/enterprise_inventory.db');
const PDF_STORAGE = path.join(__dirname, '../data/pdfs');

// Prometheus metrics helper
const recordMetric = (name, labels = {}) => {
  if (global.metricsExporter && global.metricsExporter[name]) {
    global.metricsExporter[name](labels);
  }
};

const recordLatency = (name, startTime, labels = {}) => {
  if (global.metricsExporter && global.metricsExporter[name]) {
    const duration = (Date.now() - startTime) / 1000;
    global.metricsExporter[name](duration, labels);
  }
};

// ====================
// SESSION & HEALTH
// ====================

/**
 * GET /api/owner/console/session
 * Returns session health: token expiry, WS status, last activity
 */
router.get('/session', authenticateToken, requireOwner, (req, res) => {
  const startTime = Date.now();

  try {
    const db = new sqlite3.Database(DB_PATH);

    // Check if session table exists
    db.get(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='owner_sessions'
    `, (err, table) => {
      if (err || !table) {
        db.close();
        // Table doesn't exist yet, return basic info
        const tokenExp = req.user.exp ? req.user.exp * 1000 : Date.now() + 900000;
        const ttl = Math.max(0, Math.floor((tokenExp - Date.now()) / 1000));

        return res.json({
          tokenExp,
          ttl,
          warningThreshold: 120,
          ws: { connected: false, lastReconnect: null },
          lastActivity: new Date().toISOString(),
          deviceFingerprint: req.get('X-Device-Fingerprint') || null
        });
      }

      // Query session data
      db.get(`
        SELECT * FROM owner_sessions
        WHERE owner_id = ?
        ORDER BY last_activity DESC
        LIMIT 1
      `, [req.user.id], (err, session) => {
        db.close();

        if (err) {
          logger.error('Session query error:', err);
          return res.status(500).json({ error: 'Session check failed' });
        }

        const tokenExp = req.user.exp ? req.user.exp * 1000 : Date.now() + 900000;
        const ttl = Math.max(0, Math.floor((tokenExp - Date.now()) / 1000));

        res.json({
          tokenExp,
          ttl,
          warningThreshold: 120,
          ws: {
            connected: session ? Boolean(session.ws_connected) : false,
            lastReconnect: session ? session.ws_last_reconnect : null
          },
          lastActivity: session ? session.last_activity : new Date().toISOString(),
          deviceFingerprint: req.get('X-Device-Fingerprint') || null
        });

        recordLatency('recordOCCRouteLatency', startTime, { route: 'session' });
      });
    });
  } catch (error) {
    logger.error('Session endpoint error:', error);
    recordMetric('recordOCCRouteError', { route: 'session' });
    res.status(500).json({ error: 'Session check failed' });
  }
});

// ====================
// LOCATIONS
// ====================

/**
 * GET /api/owner/console/locations
 * List all locations with sequence ordering
 */
router.get('/locations', authenticateToken, requireOwner, (req, res) => {
  const startTime = Date.now();

  try {
    // Use the correct database path
    const dbPath = path.join(__dirname, '../data/enterprise_inventory.db');
    const db = new sqlite3.Database(dbPath);

    db.all(`
      SELECT
        id,
        name,
        type,
        sequence,
        is_active as active,
        created_at,
        updated_at
      FROM storage_locations
      WHERE is_active = 1
      ORDER BY sequence ASC, name ASC
    `, [], (err, rows) => {
      db.close();

      if (err) {
        logger.error('Locations query error:', err);
        recordMetric('recordOCCRouteError', { route: 'locations_list' });
        return res.status(500).json({ error: 'Failed to fetch locations' });
      }

      res.json({
        locations: rows || [],
        total: (rows || []).length
      });

      recordLatency('recordOCCRouteLatency', startTime, { route: 'locations_list' });
    });
  } catch (error) {
    logger.error('Locations endpoint error:', error);
    recordMetric('recordOCCRouteError', { route: 'locations_list' });
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

/**
 * PATCH /api/owner/console/locations/:id
 * Update location (name, type, sequence, active)
 */
router.patch('/locations/:id', authenticateToken, requireOwner, (req, res) => {
  const startTime = Date.now();
  const { id } = req.params;
  const { location_name, location_type, sequence, active } = req.body;

  try {
    const db = new sqlite3.Database(DB_PATH);

    // Build dynamic update query
    const updates = [];
    const params = [];

    if (location_name !== undefined) {
      updates.push('location_name = ?');
      params.push(location_name);
    }
    if (location_type !== undefined) {
      updates.push('location_type = ?');
      params.push(location_type);
    }
    if (sequence !== undefined) {
      updates.push('sequence = ?');
      params.push(sequence);
    }
    if (active !== undefined) {
      updates.push('active = ?');
      params.push(active ? 1 : 0);
    }

    if (updates.length === 0) {
      db.close();
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    db.run(`
      UPDATE storage_locations
      SET ${updates.join(', ')}
      WHERE location_id = ?
    `, params, function(err) {
      db.close();

      if (err) {
        logger.error('Location update error:', err);
        recordMetric('recordOCCRouteError', { route: 'locations_update' });
        return res.status(500).json({ error: 'Failed to update location' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Location not found' });
      }

      auditLog('location_updated', {
        userId: req.user.id,
        locationId: id,
        changes: req.body
      }, req);

      res.json({
        message: 'Location updated',
        locationId: id,
        changes: this.changes
      });

      recordLatency('recordOCCRouteLatency', startTime, { route: 'locations_update' });
    });
  } catch (error) {
    logger.error('Location update endpoint error:', error);
    recordMetric('recordOCCRouteError', { route: 'locations_update' });
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// ====================
// INVENTORY COUNTS
// ====================

/**
 * POST /api/owner/console/counts/start
 * Start a new inventory count session
 */
router.post('/counts/start', authenticateToken, requireOwner, (req, res) => {
  const startTime = Date.now();
  const { startingLocationId, notes } = req.body;

  try {
    const countId = `count_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const db = new sqlite3.Database(DB_PATH);

    db.run(`
      INSERT INTO inventory_counts (
        count_id, tenant_id, owner_id, status, starting_location_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [countId, 'default', req.user.id, 'in_progress', startingLocationId || null, notes || null], function(err) {
      if (err) {
        db.close();
        logger.error('Count start error:', err);
        recordMetric('recordOCCRouteError', { route: 'counts_start' });
        return res.status(500).json({ error: 'Failed to start count' });
      }

      // Log audit
      db.run(`
        INSERT INTO count_audit (count_id, action, user_id, user_email, details, ip_address)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        countId,
        'started',
        req.user.id,
        req.user.email,
        JSON.stringify({ startingLocationId, notes }),
        req.ip
      ], (auditErr) => {
        db.close();

        if (auditErr) {
          logger.warn('Count audit error:', auditErr);
        }

        auditLog('count_started', {
          userId: req.user.id,
          countId,
          startingLocationId
        }, req);

        recordMetric('recordOCCCountsStarted');

        res.json({
          countId,
          status: 'in_progress',
          startedAt: new Date().toISOString()
        });

        recordLatency('recordOCCCountStepLatency', startTime, { step: 'start' });
      });
    });
  } catch (error) {
    logger.error('Count start endpoint error:', error);
    recordMetric('recordOCCRouteError', { route: 'counts_start' });
    res.status(500).json({ error: 'Failed to start count' });
  }
});

/**
 * POST /api/owner/console/counts/:countId/add-item
 * Add/update item in count
 */
router.post('/counts/:countId/add-item', authenticateToken, requireOwner, (req, res) => {
  const startTime = Date.now();
  const { countId } = req.params;
  const { itemCode, itemId, quantity, locationId, barcode, notes } = req.body;

  if (!quantity || quantity < 0) {
    return res.status(400).json({ error: 'Valid quantity required' });
  }

  try {
    const db = new sqlite3.Database(DB_PATH);

    // Find item by code or ID
    const itemQuery = itemId
      ? 'SELECT * FROM inventory_items WHERE item_id = ?'
      : 'SELECT * FROM inventory_items WHERE item_code = ? OR barcode = ?';

    const itemParams = itemId ? [itemId] : [itemCode, itemCode];

    db.get(itemQuery, itemParams, (err, item) => {
      if (err || !item) {
        db.close();
        logger.error('Item not found:', { itemCode, itemId, err });
        return res.status(404).json({ error: 'Item not found' });
      }

      // Get next sequence
      db.get(`
        SELECT MAX(sequence) as max_seq FROM count_items WHERE count_id = ?
      `, [countId], (err, seqRow) => {
        const nextSeq = (seqRow && seqRow.max_seq) ? seqRow.max_seq + 1 : 1;

        // Insert count item
        db.run(`
          INSERT INTO count_items (
            count_id, item_id, location_id, quantity, unit_cost, barcode, notes, sequence
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          countId,
          item.item_id,
          locationId || null,
          quantity,
          item.unit_cost || null,
          barcode || item.barcode || null,
          notes || null,
          nextSeq
        ], function(insertErr) {
          if (insertErr) {
            db.close();
            logger.error('Count item insert error:', insertErr);
            recordMetric('recordOCCRouteError', { route: 'counts_add_item' });
            return res.status(500).json({ error: 'Failed to add item' });
          }

          const countItemId = this.lastID;

          // Update count totals
          db.run(`
            UPDATE inventory_counts
            SET
              total_lines = (SELECT COUNT(*) FROM count_items WHERE count_id = ?),
              locations_touched = (SELECT COUNT(DISTINCT location_id) FROM count_items WHERE count_id = ?),
              updated_at = CURRENT_TIMESTAMP
            WHERE count_id = ?
          `, [countId, countId, countId], (updateErr) => {
            // Log audit
            db.run(`
              INSERT INTO count_audit (count_id, action, user_id, user_email, details, ip_address)
              VALUES (?, ?, ?, ?, ?, ?)
            `, [
              countId,
              'item_added',
              req.user.id,
              req.user.email,
              JSON.stringify({ itemId: item.item_id, quantity, locationId }),
              req.ip
            ], (auditErr) => {
              db.close();

              res.json({
                countItemId,
                itemId: item.item_id,
                itemCode: item.item_code,
                itemName: item.item_name,
                quantity,
                sequence: nextSeq
              });

              recordLatency('recordOCCCountStepLatency', startTime, { step: 'add_item' });
            });
          });
        });
      });
    });
  } catch (error) {
    logger.error('Add item endpoint error:', error);
    recordMetric('recordOCCRouteError', { route: 'counts_add_item' });
    res.status(500).json({ error: 'Failed to add item' });
  }
});

/**
 * POST /api/owner/console/counts/:countId/attach-pdf
 * Attach PDF to count
 */
router.post('/counts/:countId/attach-pdf', authenticateToken, requireOwner, (req, res) => {
  const startTime = Date.now();
  const { countId } = req.params;
  const { invoiceNumber, pdfId, documentId, notes } = req.body;

  try {
    const db = new sqlite3.Database(DB_PATH);

    // Find document
    const docQuery = documentId || pdfId
      ? 'SELECT * FROM documents WHERE id = ?'
      : 'SELECT * FROM documents WHERE filename LIKE ?';

    const docParam = documentId || pdfId || `%${invoiceNumber}%`;

    db.get(docQuery, [docParam], (err, doc) => {
      if (err || !doc) {
        db.close();
        logger.error('Document not found:', { invoiceNumber, pdfId, err });
        return res.status(404).json({ error: 'PDF not found' });
      }

      // Attach to count
      db.run(`
        INSERT INTO count_pdfs (count_id, document_id, invoice_number, attached_by, notes)
        VALUES (?, ?, ?, ?, ?)
      `, [countId, doc.id, invoiceNumber || null, req.user.id, notes || null], function(insertErr) {
        if (insertErr) {
          db.close();

          if (insertErr.code === 'SQLITE_CONSTRAINT') {
            return res.status(409).json({ error: 'PDF already attached to this count' });
          }

          logger.error('PDF attach error:', insertErr);
          recordMetric('recordOCCRouteError', { route: 'counts_attach_pdf' });
          return res.status(500).json({ error: 'Failed to attach PDF' });
        }

        // Log audit
        db.run(`
          INSERT INTO count_audit (count_id, action, user_id, user_email, details, ip_address)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          countId,
          'pdf_attached',
          req.user.id,
          req.user.email,
          JSON.stringify({ documentId: doc.id, invoiceNumber }),
          req.ip
        ], (auditErr) => {
          db.close();

          recordMetric('recordOCCPDFsAttached');

          res.json({
            countPdfId: this.lastID,
            documentId: doc.id,
            filename: doc.filename,
            invoiceNumber
          });

          recordLatency('recordOCCCountStepLatency', startTime, { step: 'attach_pdf' });
        });
      });
    });
  } catch (error) {
    logger.error('Attach PDF endpoint error:', error);
    recordMetric('recordOCCRouteError', { route: 'counts_attach_pdf' });
    res.status(500).json({ error: 'Failed to attach PDF' });
  }
});

/**
 * GET /api/owner/console/counts/:countId
 * Get count details with items and PDFs
 */
router.get('/counts/:countId', authenticateToken, requireOwner, (req, res) => {
  const startTime = Date.now();
  const { countId } = req.params;

  try {
    const db = new sqlite3.Database(DB_PATH);

    // Get count
    db.get(`
      SELECT
        c.*,
        l.location_name as starting_location_name
      FROM inventory_counts c
      LEFT JOIN storage_locations l ON c.starting_location_id = l.location_id
      WHERE c.count_id = ?
    `, [countId], (err, count) => {
      if (err || !count) {
        db.close();
        return res.status(404).json({ error: 'Count not found' });
      }

      // Get items
      db.all(`
        SELECT
          ci.*,
          im.item_code,
          im.item_name,
          im.barcode as item_barcode,
          sl.location_name
        FROM count_items ci
        JOIN inventory_items im ON ci.item_id = im.item_id
        LEFT JOIN storage_locations sl ON ci.location_id = sl.location_id
        WHERE ci.count_id = ?
        ORDER BY ci.sequence ASC
      `, [countId], (itemsErr, items) => {
        // Get PDFs
        db.all(`
          SELECT
            cp.*,
            d.filename,
            d.path,
            d.size_bytes,
            d.mime_type
          FROM count_pdfs cp
          JOIN documents d ON cp.document_id = d.id
          WHERE cp.count_id = ?
          ORDER BY cp.attached_at DESC
        `, [countId], (pdfsErr, pdfs) => {
          // Get audit trail
          db.all(`
            SELECT * FROM count_audit
            WHERE count_id = ?
            ORDER BY timestamp DESC
            LIMIT 50
          `, [countId], (auditErr, audit) => {
            db.close();

            res.json({
              count,
              items: items || [],
              pdfs: pdfs || [],
              audit: audit || [],
              summary: {
                totalLines: count.total_lines || 0,
                locationsTouched: count.locations_touched || 0,
                pdfsAttached: (pdfs || []).length
              }
            });

            recordLatency('recordOCCRouteLatency', startTime, { route: 'counts_get' });
          });
        });
      });
    });
  } catch (error) {
    logger.error('Get count endpoint error:', error);
    recordMetric('recordOCCRouteError', { route: 'counts_get' });
    res.status(500).json({ error: 'Failed to fetch count' });
  }
});

/**
 * POST /api/owner/console/counts/:countId/close
 * Finalize and close count
 */
router.post('/counts/:countId/close', authenticateToken, requireOwner, (req, res) => {
  const startTime = Date.now();
  const { countId } = req.params;
  const { notes } = req.body;

  try {
    const db = new sqlite3.Database(DB_PATH);

    // Get full count data for snapshot
    db.get(`SELECT * FROM inventory_counts WHERE count_id = ?`, [countId], (err, count) => {
      if (err || !count) {
        db.close();
        return res.status(404).json({ error: 'Count not found' });
      }

      if (count.status === 'closed') {
        db.close();
        return res.status(400).json({ error: 'Count already closed' });
      }

      // Get items for snapshot
      db.all(`
        SELECT ci.*, im.item_code, im.item_name
        FROM count_items ci
        JOIN inventory_items im ON ci.item_id = im.item_id
        WHERE ci.count_id = ?
      `, [countId], (itemsErr, items) => {
        const snapshot = {
          count_id: countId,
          closed_by: req.user.email,
          closed_at: new Date().toISOString(),
          total_lines: items.length,
          items: items || [],
          notes: notes || count.notes
        };

        // Close count
        db.run(`
          UPDATE inventory_counts
          SET
            status = 'closed',
            closed_at = CURRENT_TIMESTAMP,
            snapshot_data = ?,
            notes = COALESCE(?, notes),
            updated_at = CURRENT_TIMESTAMP
          WHERE count_id = ?
        `, [JSON.stringify(snapshot), notes, countId], function(updateErr) {
          if (updateErr) {
            db.close();
            logger.error('Count close error:', updateErr);
            recordMetric('recordOCCRouteError', { route: 'counts_close' });
            return res.status(500).json({ error: 'Failed to close count' });
          }

          // Log audit
          db.run(`
            INSERT INTO count_audit (count_id, action, user_id, user_email, details, ip_address)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [
            countId,
            'closed',
            req.user.id,
            req.user.email,
            JSON.stringify({ total_lines: items.length, notes }),
            req.ip
          ], (auditErr) => {
            db.close();

            auditLog('count_closed', {
              userId: req.user.id,
              countId,
              totalLines: items.length
            }, req);

            res.json({
              countId,
              status: 'closed',
              closedAt: new Date().toISOString(),
              snapshot
            });

            recordLatency('recordOCCCountStepLatency', startTime, { step: 'close' });
          });
        });
      });
    });
  } catch (error) {
    logger.error('Close count endpoint error:', error);
    recordMetric('recordOCCRouteError', { route: 'counts_close' });
    res.status(500).json({ error: 'Failed to close count' });
  }
});

// ====================
// PDF MANAGEMENT
// ====================

/**
 * GET /api/owner/console/pdfs/search
 * Search PDFs by invoice number, filename, or SHA
 */
router.get('/pdfs/search', authenticateToken, requireOwner, (req, res) => {
  const startTime = Date.now();
  const { q, limit = 20, offset = 0 } = req.query;

  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Search query too short (min 2 chars)' });
  }

  try {
    const db = new sqlite3.Database(DB_PATH);
    const searchPattern = `%${q}%`;

    db.all(`
      SELECT
        d.*,
        pi.invoice_number,
        pi.supplier,
        pi.invoice_date,
        pi.total_amount
      FROM documents d
      LEFT JOIN processed_invoices pi ON d.metadata LIKE '%' || pi.invoice_number || '%'
      WHERE
        d.filename LIKE ? OR
        d.sha256 LIKE ? OR
        d.metadata LIKE ? OR
        pi.invoice_number LIKE ?
      ORDER BY d.created_at DESC
      LIMIT ? OFFSET ?
    `, [searchPattern, searchPattern, searchPattern, searchPattern, parseInt(limit), parseInt(offset)], (err, rows) => {
      db.close();

      if (err) {
        logger.error('PDF search error:', err);
        recordMetric('recordOCCRouteError', { route: 'pdfs_search' });
        return res.status(500).json({ error: 'PDF search failed' });
      }

      res.json({
        results: rows || [],
        query: q,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      recordLatency('recordOCCRouteLatency', startTime, { route: 'pdfs_search' });
    });
  } catch (error) {
    logger.error('PDF search endpoint error:', error);
    recordMetric('recordOCCRouteError', { route: 'pdfs_search' });
    res.status(500).json({ error: 'PDF search failed' });
  }
});

/**
 * GET /api/owner/console/pdfs/:id/stream
 * Stream PDF with range support
 */
router.get('/pdfs/:id/stream', authenticateToken, requireOwner, (req, res) => {
  const startTime = Date.now();
  const { id } = req.params;

  try {
    const db = new sqlite3.Database(DB_PATH);

    db.get('SELECT * FROM documents WHERE id = ?', [id], (err, doc) => {
      db.close();

      if (err || !doc) {
        return res.status(404).json({ error: 'PDF not found' });
      }

      const filePath = path.join(PDF_STORAGE, doc.path);

      if (!fs.existsSync(filePath)) {
        logger.error('PDF file not found on disk:', filePath);
        return res.status(404).json({ error: 'PDF file not found' });
      }

      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = (end - start) + 1;

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': 'application/pdf'
        });

        const stream = fs.createReadStream(filePath, { start, end });
        stream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${doc.filename}"`
        });

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
      }

      recordLatency('recordOCCRouteLatency', startTime, { route: 'pdfs_stream' });
    });
  } catch (error) {
    logger.error('PDF stream endpoint error:', error);
    recordMetric('recordOCCRouteError', { route: 'pdfs_stream' });
    res.status(500).json({ error: 'PDF stream failed' });
  }
});

// ====================
// AI STATUS
// ====================

/**
 * GET /api/owner/console/ai/status
 * Summarized Phase 3 AI status for OCC
 */
router.get('/ai/status', authenticateToken, requireOwner, (req, res) => {
  const startTime = Date.now();

  try {
    const db = new sqlite3.Database(DB_PATH);

    // Check if AI tables exist
    db.get(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='ai_tuner_proposals'
    `, (err, table) => {
      if (err || !table) {
        db.close();
        // AI tables don't exist, return minimal status
        return res.json({
          health: { risk: 0, status: 'unknown' },
          proposals: { pending: 0, total: 0 },
          anomalies: { high: 0, total: 0 },
          security: { findings: 0, lastScan: null },
          governance: { lastReport: null }
        });
      }

      // Get proposals count
      db.get(`SELECT COUNT(*) as pending FROM ai_tuner_proposals WHERE status = 'pending'`, (err1, proposals) => {
        // Get anomalies
        db.get(`SELECT COUNT(*) as high FROM ai_anomalies WHERE severity = 'high' AND resolved = 0`, (err2, anomalies) => {
          // Get health
          db.get(`SELECT risk_score FROM ai_health_predictions ORDER BY predicted_at DESC LIMIT 1`, (err3, health) => {
            db.close();

            res.json({
              health: {
                risk: health ? health.risk_score : 0,
                status: health ? (health.risk_score > 70 ? 'critical' : health.risk_score > 40 ? 'warning' : 'healthy') : 'unknown'
              },
              proposals: {
                pending: proposals ? proposals.pending : 0,
                total: proposals ? proposals.pending : 0
              },
              anomalies: {
                high: anomalies ? anomalies.high : 0,
                total: anomalies ? anomalies.high : 0
              },
              security: {
                findings: 0,
                lastScan: null
              },
              governance: {
                lastReport: null
              },
              lastUpdated: new Date().toISOString()
            });

            recordLatency('recordOCCRouteLatency', startTime, { route: 'ai_status' });
          });
        });
      });
    });
  } catch (error) {
    logger.error('AI status endpoint error:', error);
    recordMetric('recordOCCRouteError', { route: 'ai_status' });
    res.status(500).json({ error: 'AI status check failed' });
  }
});

module.exports = router;
