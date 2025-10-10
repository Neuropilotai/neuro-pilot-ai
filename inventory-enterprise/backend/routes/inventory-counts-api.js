/**
 * Inventory Counts API Routes
 * Draft/submit/approve workflow with offline queue support
 * @version 3.0.0
 */

const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/auth');
const db = require('../config/database');
// const logger = require('../utils/logger'); // Logger not available

// Metrics
let metricsExporter;
try {
  metricsExporter = require('../utils/metricsExporter');
} catch (err) {
  console.warn('metricsExporter not available');
}

/**
 * GET /api/inventory/locations
 * Get all locations for count entry
 */
router.get('/locations', requirePermission('inventory:read'), async (req, res) => {
  try {
    const locations = await db.all(
      `SELECT id, name, type, is_active
       FROM storage_locations
       WHERE tenant_id = ? AND is_active = 1
       ORDER BY name`,
      [req.tenantId]
    );

    res.json({ locations });
  } catch (error) {
    console.error('Get locations failed:', error);
    res.status(500).json({ error: 'Failed to load locations' });
  }
});

/**
 * GET /api/inventory/search
 * Search items by code or name (for count entry)
 */
router.get('/search', requirePermission('inventory:read'), async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({ items: [] });
    }

    const query = `%${q.trim()}%`;
    const items = await db.all(
      `SELECT
        item_code as code,
        item_name as name,
        quantity,
        unit,
        location
       FROM inventory_items
       WHERE tenant_id = ?
         AND (item_code LIKE ? OR item_name LIKE ? OR barcode LIKE ?)
       ORDER BY item_name
       LIMIT 20`,
      [req.tenantId, query, query, query]
    );

    res.json({ items });
  } catch (error) {
    console.error('Search items failed:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * POST /api/inventory/counts/draft
 * Save count as draft (can be edited later)
 */
router.post('/counts/draft', requirePermission('inventory:count'), async (req, res) => {
  const { locationId, rows, notes } = req.body;

  if (!locationId || !rows || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'Invalid request data' });
  }

  try {
    const countId = `CNT-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const userId = req.user?.id || req.user?.email;

    // Insert count header
    await db.run(
      `INSERT INTO inventory_counts (
        id, tenant_id, location_id, status,
        created_by, created_at, notes
      ) VALUES (?, ?, ?, ?, ?, datetime('now'), ?)`,
      [countId, req.tenantId, locationId, 'draft', userId, notes || null]
    );

    // Insert count rows
    for (const row of rows) {
      await db.run(
        `INSERT INTO inventory_count_rows (
          count_id, item_code, expected_qty,
          counted_qty, variance, notes
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          countId,
          row.itemCode,
          row.expectedQty || 0,
          row.countedQty || 0,
          (row.countedQty || 0) - (row.expectedQty || 0),
          row.notes || null
        ]
      );
    }

    // Metrics
    if (metricsExporter) {
      metricsExporter.recordInventoryCountSubmission('draft', req.tenantId);
    }

    res.json({
      success: true,
      countId,
      message: 'Draft saved successfully'
    });

  } catch (error) {
    console.error('Save draft failed:', error);
    res.status(500).json({ error: 'Failed to save draft' });
  }
});

/**
 * POST /api/inventory/counts/submit
 * Submit count for approval
 */
router.post('/counts/submit', requirePermission('inventory:count'), async (req, res) => {
  const { locationId, rows, notes } = req.body;

  if (!locationId || !rows || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'Invalid request data' });
  }

  try {
    const countId = `CNT-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const userId = req.user?.id || req.user?.email;

    // Insert count header
    await db.run(
      `INSERT INTO inventory_counts (
        id, tenant_id, location_id, status,
        created_by, created_at, notes
      ) VALUES (?, ?, ?, ?, ?, datetime('now'), ?)`,
      [countId, req.tenantId, locationId, 'pending_approval', userId, notes || null]
    );

    // Insert count rows
    let totalVariance = 0;
    for (const row of rows) {
      const variance = (row.countedQty || 0) - (row.expectedQty || 0);
      totalVariance += Math.abs(variance);

      await db.run(
        `INSERT INTO inventory_count_rows (
          count_id, item_code, expected_qty,
          counted_qty, variance, notes
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          countId,
          row.itemCode,
          row.expectedQty || 0,
          row.countedQty || 0,
          variance,
          row.notes || null
        ]
      );
    }

    // Metrics
    if (metricsExporter) {
      metricsExporter.recordInventoryCountSubmission('pending_approval', req.tenantId);
      metricsExporter.recordInventoryCountVariance(totalVariance, req.tenantId);
    }

    res.json({
      success: true,
      countId,
      totalVariance,
      message: 'Count submitted for approval'
    });

  } catch (error) {
    console.error('Submit count failed:', error);
    res.status(500).json({ error: 'Failed to submit count' });
  }
});

/**
 * GET /api/inventory/counts/pending
 * Get all counts pending approval (for approvers)
 */
router.get('/counts/pending', requirePermission('inventory:approve'), async (req, res) => {
  try {
    const counts = await db.all(
      `SELECT
        c.id,
        c.location_id,
        sl.name as location_name,
        c.status,
        c.created_by,
        c.created_at,
        c.notes,
        COUNT(r.id) as item_count,
        SUM(ABS(r.variance)) as total_variance
       FROM inventory_counts c
       LEFT JOIN storage_locations sl ON c.location_id = sl.id
       LEFT JOIN inventory_count_rows r ON c.id = r.count_id
       WHERE c.tenant_id = ? AND c.status = 'pending_approval'
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [req.tenantId]
    );

    res.json({ counts });
  } catch (error) {
    console.error('Get pending counts failed:', error);
    res.status(500).json({ error: 'Failed to load pending counts' });
  }
});

/**
 * POST /api/inventory/counts/approve
 * Approve or reject a count
 */
router.post('/counts/approve', requirePermission('inventory:approve'), async (req, res) => {
  const { countId, approved, notes } = req.body;

  if (!countId || typeof approved !== 'boolean') {
    return res.status(400).json({ error: 'Invalid request data' });
  }

  try {
    const userId = req.user?.id || req.user?.email;
    const newStatus = approved ? 'approved' : 'rejected';

    // Update count status
    await db.run(
      `UPDATE inventory_counts
       SET status = ?,
           approved_by = ?,
           approved_at = datetime('now'),
           approval_notes = ?
       WHERE id = ? AND tenant_id = ? AND status = 'pending_approval'`,
      [newStatus, userId, notes || null, countId, req.tenantId]
    );

    // If approved, update actual inventory quantities
    if (approved) {
      const rows = await db.all(
        `SELECT item_code, counted_qty
         FROM inventory_count_rows
         WHERE count_id = ?`,
        [countId]
      );

      for (const row of rows) {
        await db.run(
          `UPDATE inventory_items
           SET quantity = ?,
               last_count_date = datetime('now')
           WHERE item_code = ? AND tenant_id = ?`,
          [row.counted_qty, row.item_code, req.tenantId]
        );
      }
    }

    // Metrics
    if (metricsExporter) {
      metricsExporter.recordOwnerAction(approved ? 'approve_count' : 'reject_count');
    }

    res.json({
      success: true,
      message: approved ? 'Count approved and inventory updated' : 'Count rejected'
    });

  } catch (error) {
    console.error('Approve count failed:', error);
    res.status(500).json({ error: 'Failed to process approval' });
  }
});

/**
 * GET /api/inventory/counts/history
 * Get count history
 */
router.get('/counts/history', requirePermission('inventory:read'), async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const counts = await db.all(
      `SELECT
        c.id,
        c.location_id,
        sl.name as location_name,
        c.status,
        c.created_by,
        c.created_at,
        c.approved_by,
        c.approved_at,
        COUNT(r.id) as item_count,
        SUM(ABS(r.variance)) as total_variance
       FROM inventory_counts c
       LEFT JOIN storage_locations sl ON c.location_id = sl.id
       LEFT JOIN inventory_count_rows r ON c.id = r.count_id
       WHERE c.tenant_id = ?
       GROUP BY c.id
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.tenantId, limit, offset]
    );

    res.json({ counts });
  } catch (error) {
    console.error('Get count history failed:', error);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

module.exports = router;
