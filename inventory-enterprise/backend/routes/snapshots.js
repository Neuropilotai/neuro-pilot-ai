/**
 * Inventory Snapshots Routes
 * NeuroPilot P1 Hardening - BRANCH 3
 *
 * Endpoints:
 *   GET /api/inventory/snapshots - List snapshots (paginated)
 *   GET /api/inventory/snapshots/:id - Get snapshot details
 */

const express = require('express');
const { param, query, validationResult } = require('express-validator');
const { pool } = require('../db');
const { logger } = require('../config/logger');
const { requirePermission } = require('../middleware/tenantContext');

const router = express.Router();

/**
 * GET /api/inventory/snapshots
 * List inventory snapshots with pagination
 *
 * Query params:
 *   - page: Page number (default: 1)
 *   - pageSize: Items per page (default: 50, max: 100)
 *   - sortBy: Sort field (default: snapshot_date)
 *   - sortOrder: asc or desc (default: desc)
 */
router.get(
  '/snapshots',
  requirePermission('inventory:read'),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('sortBy').optional().isIn(['snapshot_date', 'total_items', 'created_at']),
    query('sortOrder').optional().isIn(['asc', 'desc'])
  ],
  async (req, res) => {
    try {
      // Validation
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Get org_id from tenant context
      const orgId = req.org_id || req.tenant?.tenantId;
      if (!orgId) {
        return res.status(400).json({
          error: 'Organization ID required',
          code: 'ORG_ID_REQUIRED'
        });
      }

      // Pagination params
      const page = parseInt(req.query.page) || 1;
      const pageSize = parseInt(req.query.pageSize) || 50;
      const offset = (page - 1) * pageSize;

      // Sorting params
      const sortBy = req.query.sortBy || 'snapshot_date';
      const sortOrder = req.query.sortOrder || 'desc';

      // Query snapshots
      const query = `
        SELECT
          id,
          org_id,
          site_id,
          snapshot_date,
          total_items,
          total_value_cents,
          snapshot_type,
          created_by,
          created_at,
          notes
        FROM inventory_snapshots
        WHERE org_id = $1
        ORDER BY ${sortBy} ${sortOrder.toUpperCase()}
        LIMIT $2 OFFSET $3
      `;

      const result = await pool.query(query, [orgId, pageSize, offset]);

      // Get total count for pagination
      const countResult = await pool.query(
        'SELECT COUNT(*) as total FROM inventory_snapshots WHERE org_id = $1',
        [orgId]
      );

      const totalCount = parseInt(countResult.rows[0]?.total || 0);
      const totalPages = Math.ceil(totalCount / pageSize);

      // Format response
      const snapshots = result.rows.map(row => ({
        id: row.id,
        orgId: row.org_id,
        siteId: row.site_id,
        snapshotDate: row.snapshot_date,
        totalItems: row.total_items,
        totalValueCents: row.total_value_cents,
        totalValueDollars: row.total_value_cents ? (row.total_value_cents / 100).toFixed(2) : null,
        snapshotType: row.snapshot_type,
        createdBy: row.created_by,
        createdAt: row.created_at,
        notes: row.notes
      }));

      res.json({
        success: true,
        data: snapshots,
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1
        },
        sort: {
          sortBy,
          sortOrder
        }
      });

    } catch (error) {
      logger.error('[Snapshots] Error listing snapshots:', error);

      // Handle table not found (migration not run)
      if (error.code === '42P01') {
        return res.status(503).json({
          error: 'Snapshots feature not available',
          code: 'TABLE_NOT_FOUND',
          hint: 'Run database migrations to enable snapshots'
        });
      }

      res.status(500).json({
        error: 'Failed to fetch snapshots',
        code: 'SNAPSHOTS_FETCH_ERROR'
      });
    }
  }
);

/**
 * GET /api/inventory/snapshots/:id
 * Get detailed snapshot information including line items
 *
 * Returns:
 *   - Snapshot header (date, totals, metadata)
 *   - Line items (optional, if snapshot_items table exists)
 */
router.get(
  '/snapshots/:id',
  requirePermission('inventory:read'),
  [
    param('id').isInt().toInt()
  ],
  async (req, res) => {
    try {
      // Validation
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Get org_id from tenant context
      const orgId = req.org_id || req.tenant?.tenantId;
      if (!orgId) {
        return res.status(400).json({
          error: 'Organization ID required',
          code: 'ORG_ID_REQUIRED'
        });
      }

      const snapshotId = req.params.id;

      // Query snapshot header
      const headerResult = await pool.query(`
        SELECT
          id,
          org_id,
          site_id,
          snapshot_date,
          total_items,
          total_value_cents,
          snapshot_type,
          created_by,
          created_at,
          updated_at,
          notes,
          metadata
        FROM inventory_snapshots
        WHERE id = $1 AND org_id = $2
      `, [snapshotId, orgId]);

      if (headerResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Snapshot not found',
          code: 'SNAPSHOT_NOT_FOUND'
        });
      }

      const snapshot = headerResult.rows[0];

      // Try to get line items (may not exist if table doesn't exist)
      let lineItems = [];
      try {
        const itemsResult = await pool.query(`
          SELECT
            item_code,
            item_name,
            quantity,
            unit,
            unit_cost_cents,
            total_cost_cents,
            location_code
          FROM inventory_snapshot_items
          WHERE snapshot_id = $1
          ORDER BY item_code
        `, [snapshotId]);

        lineItems = itemsResult.rows.map(row => ({
          itemCode: row.item_code,
          itemName: row.item_name,
          quantity: parseFloat(row.quantity),
          unit: row.unit,
          unitCostCents: row.unit_cost_cents,
          unitCostDollars: row.unit_cost_cents ? (row.unit_cost_cents / 100).toFixed(2) : null,
          totalCostCents: row.total_cost_cents,
          totalCostDollars: row.total_cost_cents ? (row.total_cost_cents / 100).toFixed(2) : null,
          locationCode: row.location_code
        }));
      } catch (itemsError) {
        // Table may not exist - that's OK, just return header
        if (itemsError.code !== '42P01') {
          logger.warn('[Snapshots] Could not fetch line items:', itemsError.message);
        }
      }

      // Format response
      const response = {
        success: true,
        data: {
          id: snapshot.id,
          orgId: snapshot.org_id,
          siteId: snapshot.site_id,
          snapshotDate: snapshot.snapshot_date,
          totalItems: snapshot.total_items,
          totalValueCents: snapshot.total_value_cents,
          totalValueDollars: snapshot.total_value_cents ? (snapshot.total_value_cents / 100).toFixed(2) : null,
          snapshotType: snapshot.snapshot_type,
          createdBy: snapshot.created_by,
          createdAt: snapshot.created_at,
          updatedAt: snapshot.updated_at,
          notes: snapshot.notes,
          metadata: typeof snapshot.metadata === 'string' ? JSON.parse(snapshot.metadata) : snapshot.metadata,
          lineItems: lineItems,
          lineItemCount: lineItems.length
        }
      };

      res.json(response);

    } catch (error) {
      logger.error('[Snapshots] Error fetching snapshot:', error);

      // Handle table not found
      if (error.code === '42P01') {
        return res.status(503).json({
          error: 'Snapshots feature not available',
          code: 'TABLE_NOT_FOUND',
          hint: 'Run database migrations to enable snapshots'
        });
      }

      res.status(500).json({
        error: 'Failed to fetch snapshot',
        code: 'SNAPSHOT_FETCH_ERROR'
      });
    }
  }
);

/**
 * GET /api/inventory/snapshots/latest
 * Get the most recent snapshot for the organization
 */
router.get(
  '/snapshots/latest',
  requirePermission('inventory:read'),
  async (req, res) => {
    try {
      const orgId = req.org_id || req.tenant?.tenantId;
      if (!orgId) {
        return res.status(400).json({
          error: 'Organization ID required',
          code: 'ORG_ID_REQUIRED'
        });
      }

      const result = await pool.query(`
        SELECT
          id,
          org_id,
          site_id,
          snapshot_date,
          total_items,
          total_value_cents,
          snapshot_type,
          created_by,
          created_at,
          notes
        FROM inventory_snapshots
        WHERE org_id = $1
        ORDER BY snapshot_date DESC, created_at DESC
        LIMIT 1
      `, [orgId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'No snapshots found',
          code: 'NO_SNAPSHOTS'
        });
      }

      const snapshot = result.rows[0];

      res.json({
        success: true,
        data: {
          id: snapshot.id,
          orgId: snapshot.org_id,
          siteId: snapshot.site_id,
          snapshotDate: snapshot.snapshot_date,
          totalItems: snapshot.total_items,
          totalValueCents: snapshot.total_value_cents,
          totalValueDollars: snapshot.total_value_cents ? (snapshot.total_value_cents / 100).toFixed(2) : null,
          snapshotType: snapshot.snapshot_type,
          createdBy: snapshot.created_by,
          createdAt: snapshot.created_at,
          notes: snapshot.notes
        }
      });

    } catch (error) {
      logger.error('[Snapshots] Error fetching latest snapshot:', error);

      if (error.code === '42P01') {
        return res.status(503).json({
          error: 'Snapshots feature not available',
          code: 'TABLE_NOT_FOUND'
        });
      }

      res.status(500).json({
        error: 'Failed to fetch latest snapshot',
        code: 'SNAPSHOT_FETCH_ERROR'
      });
    }
  }
);

module.exports = router;
