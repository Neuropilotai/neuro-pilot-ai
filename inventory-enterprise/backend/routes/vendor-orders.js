/**
 * Vendor Orders API Routes
 * NeuroPilot AI Enterprise V22.2
 *
 * Handles vendor purchase orders with Google Drive PDF integration.
 * Supports deduplication by pdf_file_id OR (vendor_id + order_number + order_date).
 *
 * Endpoints:
 * - GET    /api/vendor-orders           - List orders (paginated, filtered)
 * - GET    /api/vendor-orders/:id       - Get single order with lines
 * - POST   /api/vendor-orders           - Create order (with dedup check)
 * - PATCH  /api/vendor-orders/:id       - Update order
 * - DELETE /api/vendor-orders/:id       - Soft delete order
 * - POST   /api/vendor-orders/:id/parse - Trigger PDF parsing
 * - GET    /api/vendor-orders/:id/ai-insights - Get AI insights for order
 *
 * @version 22.2
 * @author NeuroPilot AI Team
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { pool } = require('../db');
const ordersStorage = require('../config/ordersStorage');

// Multer configuration for GFS PDF uploads
const uploadDir = process.env.GFS_UPLOAD_DIR || '/tmp/gfs-uploads';
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `gfs-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Import parser service (optional - may not be available in all environments)
let parserService = null;
try {
  parserService = require('../services/VendorOrderParserService');
} catch (err) {
  console.warn('[VendorOrders] Parser service not available:', err.message);
}

// Import FIFO layer service (optional - may not be available in all environments)
let fifoLayerService = null;
try {
  fifoLayerService = require('../services/FifoLayerService');
} catch (err) {
  console.warn('[VendorOrders] FIFO layer service not available:', err.message);
}

// ============================================
// HELPERS
// ============================================

/**
 * Get org_id from request (tenant isolation)
 */
function getOrgId(req) {
  return req.user?.org_id || req.tenant?.orgId || 1;
}

/**
 * Get user ID from request
 */
function getUserId(req) {
  return req.user?.email || req.user?.user_id || 'system';
}

/**
 * Convert cents to dollars for response
 */
function centsToDollars(cents) {
  return cents ? (cents / 100).toFixed(2) : '0.00';
}

/**
 * Convert dollars to cents for storage
 */
function dollarsToCents(dollars) {
  if (!dollars) return 0;
  return Math.round(parseFloat(dollars) * 100);
}

/**
 * Validate order input data
 */
function validateOrderInput(data) {
  const errors = [];

  // Required: at least one identifier
  if (!data.pdf_file_id && !data.order_number) {
    errors.push('Either pdf_file_id or order_number is required');
  }

  // Validate pdf_file_id format if provided
  if (data.pdf_file_id && !ordersStorage.isValidFileId(data.pdf_file_id)) {
    errors.push('Invalid pdf_file_id format');
  }

  // Validate source_system if provided
  if (data.source_system && !ordersStorage.isValidSourceSystem(data.source_system)) {
    errors.push(`Invalid source_system: ${data.source_system}. Must be one of: ${ordersStorage.getSupportedSourceSystems().join(', ')}`);
  }

  // Validate order_date format if provided
  if (data.order_date && isNaN(Date.parse(data.order_date))) {
    errors.push('Invalid order_date format. Use YYYY-MM-DD');
  }

  // Validate status if provided
  const validStatuses = ['new', 'parsed', 'validated', 'archived', 'error', 'fifo_complete'];
  if (data.status && !validStatuses.includes(data.status)) {
    errors.push(`Invalid status: ${data.status}. Must be one of: ${validStatuses.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================
// GET /api/vendor-orders - List Orders
// ============================================

router.get('/', async (req, res) => {
  try {
    const orgId = getOrgId(req);

    // Query parameters
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    // Filters
    const vendorId = req.query.vendorId ? parseInt(req.query.vendorId) : null;
    const status = req.query.status || null;
    const sourceSystem = req.query.sourceSystem || null;
    const dateFrom = req.query.dateFrom || null;
    const dateTo = req.query.dateTo || null;
    const search = req.query.search || null;

    // Build query
    let whereConditions = ['vo.org_id = $1', 'vo.deleted_at IS NULL'];
    let params = [orgId];
    let paramIndex = 2;

    if (vendorId) {
      whereConditions.push(`vo.vendor_id = $${paramIndex++}`);
      params.push(vendorId);
    }

    if (status) {
      whereConditions.push(`vo.status = $${paramIndex++}`);
      params.push(status);
    }

    if (sourceSystem) {
      whereConditions.push(`vo.source_system = $${paramIndex++}`);
      params.push(sourceSystem.toLowerCase());
    }

    if (dateFrom) {
      whereConditions.push(`vo.order_date >= $${paramIndex++}`);
      params.push(dateFrom);
    }

    if (dateTo) {
      whereConditions.push(`vo.order_date <= $${paramIndex++}`);
      params.push(dateTo);
    }

    if (search) {
      whereConditions.push(`(
        vo.order_number ILIKE $${paramIndex} OR
        vo.vendor_name ILIKE $${paramIndex} OR
        vo.pdf_file_name ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Count query
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM vendor_orders vo WHERE ${whereClause}`,
      params
    );
    const totalCount = parseInt(countResult.rows[0].count);

    // Data query
    const dataResult = await pool.query(`
      SELECT
        vo.id,
        vo.vendor_id,
        vo.vendor_name,
        v.name AS vendor_name_ref,
        vo.order_number,
        vo.order_date,
        vo.delivery_date,
        vo.total_lines,
        vo.subtotal_cents,
        vo.tax_cents,
        vo.total_cents,
        vo.currency,
        vo.pdf_file_id,
        vo.pdf_file_name,
        vo.pdf_preview_url,
        vo.status,
        vo.source_system,
        vo.ocr_confidence,
        vo.parsed_at,
        vo.error_message,
        vo.created_at,
        vo.created_by
      FROM vendor_orders vo
      LEFT JOIN vendors v ON vo.vendor_id = v.id
      WHERE ${whereClause}
      ORDER BY vo.order_date DESC, vo.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, pageSize, offset]);

    // Format response
    const orders = dataResult.rows.map(row => ({
      id: row.id,
      vendorId: row.vendor_id,
      vendorName: row.vendor_name || row.vendor_name_ref,
      orderNumber: row.order_number,
      orderDate: row.order_date,
      deliveryDate: row.delivery_date,
      totalLines: row.total_lines,
      subtotal: centsToDollars(row.subtotal_cents),
      tax: centsToDollars(row.tax_cents),
      total: centsToDollars(row.total_cents),
      currency: row.currency,
      pdfFileId: row.pdf_file_id,
      pdfFileName: row.pdf_file_name,
      pdfPreviewUrl: row.pdf_preview_url,
      status: row.status,
      sourceSystem: row.source_system,
      ocrConfidence: row.ocr_confidence ? parseFloat(row.ocr_confidence) : null,
      parsedAt: row.parsed_at,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      createdBy: row.created_by
    }));

    res.json({
      success: true,
      orders,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize)
      }
    });

  } catch (error) {
    console.error('[VendorOrders] List error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch vendor orders',
      code: 'LIST_ERROR'
    });
  }
});

// ============================================
// GET /api/vendor-orders/:id - Get Single Order
// ============================================

router.get('/:id', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const orderId = req.params.id;

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID format',
        code: 'INVALID_ID'
      });
    }

    // Get order header
    const orderResult = await pool.query(`
      SELECT
        vo.*,
        v.name AS vendor_name_ref,
        v.code AS vendor_code
      FROM vendor_orders vo
      LEFT JOIN vendors v ON vo.vendor_id = v.id
      WHERE vo.id = $1 AND vo.org_id = $2 AND vo.deleted_at IS NULL
    `, [orderId, orgId]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        code: 'NOT_FOUND'
      });
    }

    const order = orderResult.rows[0];

    // Get order lines
    const linesResult = await pool.query(`
      SELECT
        vol.*,
        ii.item_name AS inventory_item_name,
        ii.item_code AS inventory_item_code
      FROM vendor_order_lines vol
      LEFT JOIN inventory_items ii ON vol.inventory_item_id = ii.id
      WHERE vol.order_id = $1
      ORDER BY vol.line_number
    `, [orderId]);

    // Format response
    res.json({
      success: true,
      order: {
        id: order.id,
        vendorId: order.vendor_id,
        vendorName: order.vendor_name || order.vendor_name_ref,
        vendorCode: order.vendor_code,
        orderNumber: order.order_number,
        orderDate: order.order_date,
        deliveryDate: order.delivery_date,
        totalLines: order.total_lines,
        subtotal: centsToDollars(order.subtotal_cents),
        tax: centsToDollars(order.tax_cents),
        total: centsToDollars(order.total_cents),
        currency: order.currency,
        pdfFileId: order.pdf_file_id,
        pdfFileName: order.pdf_file_name,
        pdfFolderId: order.pdf_folder_id,
        pdfPreviewUrl: order.pdf_preview_url,
        status: order.status,
        sourceSystem: order.source_system,
        ocrConfidence: order.ocr_confidence ? parseFloat(order.ocr_confidence) : null,
        ocrEngine: order.ocr_engine,
        parseDurationMs: order.parse_duration_ms,
        parsedAt: order.parsed_at,
        parsedBy: order.parsed_by,
        errorMessage: order.error_message,
        metadata: order.metadata,
        createdAt: order.created_at,
        createdBy: order.created_by,
        updatedAt: order.updated_at,
        updatedBy: order.updated_by
      },
      lines: linesResult.rows.map(line => ({
        id: line.id,
        lineNumber: line.line_number,
        vendorSku: line.vendor_sku,
        syscoCode: line.sysco_code,
        gfsCode: line.gfs_code,
        upcBarcode: line.upc_barcode,
        description: line.description,
        brand: line.brand,
        packSize: line.pack_size,
        orderedQty: parseFloat(line.ordered_qty),
        receivedQty: line.received_qty ? parseFloat(line.received_qty) : null,
        unit: line.unit,
        unitPrice: centsToDollars(line.unit_price_cents),
        extendedPrice: centsToDollars(line.extended_price_cents),
        inventoryItemId: line.inventory_item_id,
        inventoryItemName: line.inventory_item_name,
        inventoryItemCode: line.inventory_item_code,
        mappingConfidence: line.mapping_confidence ? parseFloat(line.mapping_confidence) : null,
        mappingStatus: line.mapping_status,
        categoryCode: line.category_code,
        rawText: line.raw_text
      }))
    });

  } catch (error) {
    console.error('[VendorOrders] Get error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch vendor order',
      code: 'GET_ERROR'
    });
  }
});

// ============================================
// POST /api/vendor-orders - Create Order
// WITH DEDUPLICATION CHECK
// ============================================

router.post('/', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const data = req.body;

    // Validate input
    const validation = validateOrderInput(data);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: validation.errors
      });
    }

    // Extract file ID from URL if provided
    let pdfFileId = data.pdf_file_id;
    if (pdfFileId) {
      pdfFileId = ordersStorage.extractFileId(pdfFileId);
    }

    // ==========================================
    // DEDUPLICATION CHECK - THE KEY REQUIREMENT
    // ==========================================
    const existingResult = await pool.query(
      'SELECT * FROM check_vendor_order_exists($1, $2, $3, $4, $5)',
      [
        orgId,
        pdfFileId || null,
        data.vendor_id ? parseInt(data.vendor_id) : null,
        data.order_number || null,
        data.order_date || null
      ]
    );

    const existingOrderId = existingResult.rows[0]?.check_vendor_order_exists;

    if (existingOrderId) {
      // Order already exists - fetch it and return
      const existingOrder = await pool.query(
        'SELECT * FROM vendor_orders WHERE id = $1',
        [existingOrderId]
      );

      if (existingOrder.rows.length > 0) {
        const order = existingOrder.rows[0];

        // Optionally update if fields are missing
        const updates = [];
        const updateParams = [];
        let updateIndex = 1;

        // Update pdf_file_id if it was null and we have one now
        if (!order.pdf_file_id && pdfFileId) {
          updates.push(`pdf_file_id = $${updateIndex++}`);
          updateParams.push(pdfFileId);
          updates.push(`pdf_preview_url = $${updateIndex++}`);
          updateParams.push(ordersStorage.buildPreviewUrl(pdfFileId));
        }

        // Update total if it was 0 and we have a value now
        if (!order.total_cents && data.total_amount) {
          updates.push(`total_cents = $${updateIndex++}`);
          updateParams.push(dollarsToCents(data.total_amount));
        }

        // Update status if provided and different
        if (data.status && data.status !== order.status) {
          updates.push(`status = $${updateIndex++}`);
          updateParams.push(data.status);
        }

        // Perform update if needed
        if (updates.length > 0) {
          updates.push(`updated_at = CURRENT_TIMESTAMP`);
          updates.push(`updated_by = $${updateIndex++}`);
          updateParams.push(userId);
          updateParams.push(existingOrderId);

          await pool.query(
            `UPDATE vendor_orders SET ${updates.join(', ')} WHERE id = $${updateIndex}`,
            updateParams
          );
        }

        // Return the existing order
        return res.status(200).json({
          success: true,
          alreadyExists: true,
          message: 'Order already exists. Returning existing record.',
          order: {
            id: existingOrderId,
            vendorName: order.vendor_name,
            orderNumber: order.order_number,
            orderDate: order.order_date,
            status: data.status || order.status,
            pdfFileId: pdfFileId || order.pdf_file_id,
            pdfPreviewUrl: ordersStorage.buildPreviewUrl(pdfFileId || order.pdf_file_id),
            updated: updates.length > 0
          }
        });
      }
    }

    // ==========================================
    // CREATE NEW ORDER
    // ==========================================

    // Build preview URL
    const pdfPreviewUrl = pdfFileId ? ordersStorage.buildPreviewUrl(pdfFileId) : null;

    // Get vendor name if vendor_id provided
    let vendorName = data.vendor_name;
    if (data.vendor_id && !vendorName) {
      const vendorResult = await pool.query(
        'SELECT name FROM vendors WHERE id = $1',
        [data.vendor_id]
      );
      vendorName = vendorResult.rows[0]?.name;
    }

    // Insert new order
    const insertResult = await pool.query(`
      INSERT INTO vendor_orders (
        org_id,
        vendor_id,
        vendor_name,
        order_number,
        order_date,
        delivery_date,
        total_lines,
        subtotal_cents,
        tax_cents,
        total_cents,
        currency,
        pdf_file_id,
        pdf_file_name,
        pdf_folder_id,
        pdf_preview_url,
        status,
        source_system,
        created_by,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `, [
      orgId,
      data.vendor_id ? parseInt(data.vendor_id) : null,
      vendorName || null,
      data.order_number || null,
      data.order_date || null,
      data.delivery_date || null,
      data.total_lines ? parseInt(data.total_lines) : 0,
      dollarsToCents(data.subtotal),
      dollarsToCents(data.tax),
      dollarsToCents(data.total_amount),
      data.currency || 'CAD',
      pdfFileId,
      data.pdf_file_name || null,
      data.pdf_folder_id || ordersStorage.getOrdersRootFolderId(),
      pdfPreviewUrl,
      data.status || 'new',
      data.source_system ? data.source_system.toLowerCase() : null,
      userId,
      data.metadata ? JSON.stringify(data.metadata) : '{}'
    ]);

    const newOrder = insertResult.rows[0];

    // Insert line items if provided
    if (data.lines && Array.isArray(data.lines) && data.lines.length > 0) {
      for (let i = 0; i < data.lines.length; i++) {
        const line = data.lines[i];
        await pool.query(`
          INSERT INTO vendor_order_lines (
            order_id,
            org_id,
            line_number,
            vendor_sku,
            sysco_code,
            gfs_code,
            upc_barcode,
            description,
            brand,
            pack_size,
            ordered_qty,
            received_qty,
            unit,
            unit_price_cents,
            extended_price_cents,
            category_code,
            raw_text
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        `, [
          newOrder.id,
          orgId,
          line.line_number || (i + 1),
          line.vendor_sku || null,
          line.sysco_code || null,
          line.gfs_code || null,
          line.upc_barcode || null,
          line.description || 'Unknown Item',
          line.brand || null,
          line.pack_size || null,
          line.ordered_qty || 0,
          line.received_qty || null,
          line.unit || 'EACH',
          dollarsToCents(line.unit_price),
          dollarsToCents(line.extended_price),
          line.category_code || null,
          line.raw_text || null
        ]);
      }

      // Update line count
      await pool.query(
        'UPDATE vendor_orders SET total_lines = $1 WHERE id = $2',
        [data.lines.length, newOrder.id]
      );
    }

    res.status(201).json({
      success: true,
      alreadyExists: false,
      message: 'Order created successfully',
      order: {
        id: newOrder.id,
        vendorName: newOrder.vendor_name,
        orderNumber: newOrder.order_number,
        orderDate: newOrder.order_date,
        status: newOrder.status,
        pdfFileId: newOrder.pdf_file_id,
        pdfPreviewUrl: newOrder.pdf_preview_url,
        totalLines: data.lines?.length || 0
      }
    });

  } catch (error) {
    console.error('[VendorOrders] Create error:', error);

    // Handle unique constraint violations
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Order already exists (duplicate detected)',
        code: 'DUPLICATE_ORDER',
        hint: 'An order with this PDF file ID or vendor/order/date combination already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create vendor order',
      code: 'CREATE_ERROR'
    });
  }
});

// ============================================
// PATCH /api/vendor-orders/:id - Update Order
// ============================================

router.patch('/:id', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const orderId = req.params.id;
    const data = req.body;

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID format',
        code: 'INVALID_ID'
      });
    }

    // Check order exists
    const existingResult = await pool.query(
      'SELECT * FROM vendor_orders WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL',
      [orderId, orgId]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        code: 'NOT_FOUND'
      });
    }

    // Build update query
    const updates = [];
    const params = [];
    let paramIndex = 1;

    // Allowed update fields
    const allowedFields = [
      'status', 'delivery_date', 'total_lines',
      'subtotal', 'tax', 'total_amount', 'error_message'
    ];

    // Validate status if provided
    if (data.status) {
      const validStatuses = ['new', 'parsed', 'validated', 'archived', 'error', 'fifo_complete'];
      if (!validStatuses.includes(data.status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status: ${data.status}`,
          code: 'INVALID_STATUS'
        });
      }
      updates.push(`status = $${paramIndex++}`);
      params.push(data.status);
    }

    if (data.delivery_date) {
      updates.push(`delivery_date = $${paramIndex++}`);
      params.push(data.delivery_date);
    }

    if (data.total_lines !== undefined) {
      updates.push(`total_lines = $${paramIndex++}`);
      params.push(parseInt(data.total_lines));
    }

    if (data.subtotal !== undefined) {
      updates.push(`subtotal_cents = $${paramIndex++}`);
      params.push(dollarsToCents(data.subtotal));
    }

    if (data.tax !== undefined) {
      updates.push(`tax_cents = $${paramIndex++}`);
      params.push(dollarsToCents(data.tax));
    }

    if (data.total_amount !== undefined) {
      updates.push(`total_cents = $${paramIndex++}`);
      params.push(dollarsToCents(data.total_amount));
    }

    if (data.error_message !== undefined) {
      updates.push(`error_message = $${paramIndex++}`);
      params.push(data.error_message);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid update fields provided',
        code: 'NO_UPDATES'
      });
    }

    // Add audit fields
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    updates.push(`updated_by = $${paramIndex++}`);
    params.push(userId);

    // Add where clause params
    params.push(orderId);
    params.push(orgId);

    // Execute update
    await pool.query(
      `UPDATE vendor_orders SET ${updates.join(', ')} WHERE id = $${paramIndex++} AND org_id = $${paramIndex}`,
      params
    );

    res.json({
      success: true,
      message: 'Order updated successfully'
    });

  } catch (error) {
    console.error('[VendorOrders] Update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update vendor order',
      code: 'UPDATE_ERROR'
    });
  }
});

// ============================================
// DELETE /api/vendor-orders/:id - Soft Delete
// ============================================

router.delete('/:id', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const orderId = req.params.id;

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID format',
        code: 'INVALID_ID'
      });
    }

    // Soft delete
    const result = await pool.query(`
      UPDATE vendor_orders
      SET deleted_at = CURRENT_TIMESTAMP, updated_by = $3
      WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
      RETURNING id
    `, [orderId, orgId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        code: 'NOT_FOUND'
      });
    }

    res.json({
      success: true,
      message: 'Order deleted successfully'
    });

  } catch (error) {
    console.error('[VendorOrders] Delete error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete vendor order',
      code: 'DELETE_ERROR'
    });
  }
});

// ============================================
// POST /api/vendor-orders/:id/parse - Trigger Parsing from Google Drive
// ============================================

router.post('/:id/parse', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const orderId = req.params.id;

    // Get order
    const orderResult = await pool.query(
      'SELECT * FROM vendor_orders WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL',
      [orderId, orgId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        code: 'NOT_FOUND'
      });
    }

    const order = orderResult.rows[0];

    if (!order.pdf_file_id) {
      return res.status(400).json({
        success: false,
        error: 'Order has no PDF file ID to parse',
        code: 'NO_PDF'
      });
    }

    // Check if parser service is available
    if (!parserService) {
      return res.status(503).json({
        success: false,
        error: 'Parser service not available',
        code: 'PARSER_UNAVAILABLE',
        hint: 'Use /api/vendor-orders/:id/parse-local with a local file path'
      });
    }

    // Parse from Google Drive
    const parseResult = await parserService.parseOrderFromGoogleDrive(
      orderId,
      order.pdf_file_id,
      { userId }
    );

    // Update parsed_by
    await pool.query(`
      UPDATE vendor_orders SET parsed_by = $2, updated_by = $2 WHERE id = $1
    `, [orderId, userId]);

    res.json({
      success: parseResult.success,
      message: parseResult.success
        ? 'Parsing completed successfully'
        : 'Parsing initiated with warnings',
      result: {
        orderId: parseResult.orderId,
        linesFound: parseResult.linesFound,
        ocrConfidence: parseResult.ocrConfidence,
        ocrEngine: parseResult.ocrEngine,
        parseDurationMs: parseResult.parseDurationMs
      },
      warnings: parseResult.warnings,
      errors: parseResult.errors
    });

  } catch (error) {
    console.error('[VendorOrders] Parse error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate parsing',
      code: 'PARSE_ERROR'
    });
  }
});

// ============================================
// POST /api/vendor-orders/:id/parse-local - Parse from Local File
// ============================================

router.post('/:id/parse-local', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const orderId = req.params.id;
    const { filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'filePath is required in request body',
        code: 'MISSING_FILE_PATH'
      });
    }

    // Get order
    const orderResult = await pool.query(
      'SELECT * FROM vendor_orders WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL',
      [orderId, orgId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        code: 'NOT_FOUND'
      });
    }

    // Check if parser service is available
    if (!parserService) {
      return res.status(503).json({
        success: false,
        error: 'Parser service not available',
        code: 'PARSER_UNAVAILABLE'
      });
    }

    // Parse from local file
    const parseResult = await parserService.parseOrderFromFile(
      orderId,
      filePath,
      { userId }
    );

    // Update parsed_by
    await pool.query(`
      UPDATE vendor_orders SET parsed_by = $2, updated_by = $2 WHERE id = $1
    `, [orderId, userId]);

    res.json({
      success: parseResult.success,
      message: parseResult.success
        ? 'Parsing completed successfully'
        : 'Parsing completed with errors',
      result: {
        orderId: parseResult.orderId,
        linesFound: parseResult.linesFound,
        ocrConfidence: parseResult.ocrConfidence,
        ocrEngine: parseResult.ocrEngine,
        parseDurationMs: parseResult.parseDurationMs,
        header: parseResult.header
      },
      warnings: parseResult.warnings,
      errors: parseResult.errors
    });

  } catch (error) {
    console.error('[VendorOrders] Parse local error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to parse file',
      code: 'PARSE_ERROR',
      details: error.message
    });
  }
});

// ============================================
// POST /api/vendor-orders/:id/populate-fifo - Populate FIFO Layers
// ============================================

router.post('/:id/populate-fifo', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const orderId = req.params.id;
    const { force = false, skipCases = false } = req.body;

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID format',
        code: 'INVALID_ID'
      });
    }

    // Check if FIFO layer service is available
    if (!fifoLayerService) {
      return res.status(503).json({
        success: false,
        error: 'FIFO layer service not available',
        code: 'FIFO_SERVICE_UNAVAILABLE'
      });
    }

    // Verify order exists and belongs to org
    const orderResult = await pool.query(
      'SELECT id, status, order_number FROM vendor_orders WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL',
      [orderId, orgId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        code: 'NOT_FOUND'
      });
    }

    // Call FIFO layer service
    const result = await fifoLayerService.populateFromVendorOrder(orderId, {
      force,
      skipCases,
      userId
    });

    // Handle different result codes
    if (!result.success) {
      const statusCode = result.code === 'ORDER_NOT_FOUND' ? 404
        : result.code === 'ALREADY_POPULATED' ? 409
        : result.code === 'NO_LINE_ITEMS' ? 400
        : 500;

      return res.status(statusCode).json({
        success: false,
        error: result.error,
        code: result.code,
        hint: result.hint || null,
        orderStatus: result.orderStatus || null
      });
    }

    res.json({
      success: true,
      message: 'FIFO layers populated successfully',
      result: {
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        status: result.status,
        layersCreated: result.layersCreated,
        layersUpdated: result.layersUpdated,
        casesExtracted: result.casesExtracted,
        totalQuantity: result.totalQuantity,
        totalValueCents: result.totalValueCents,
        populatedAt: result.populatedAt
      }
    });

  } catch (error) {
    console.error('[VendorOrders] Populate FIFO error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to populate FIFO layers',
      code: 'FIFO_ERROR',
      details: error.message
    });
  }
});

// ============================================
// GET /api/vendor-orders/:id/ai-insights
// ============================================

router.get('/:id/ai-insights', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const orderId = req.params.id;

    // Get order with lines
    const orderResult = await pool.query(
      'SELECT * FROM vendor_orders WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL',
      [orderId, orgId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        code: 'NOT_FOUND'
      });
    }

    const order = orderResult.rows[0];

    // Get lines with inventory mapping info
    const linesResult = await pool.query(`
      SELECT
        vol.*,
        ii.item_name,
        ii.item_code,
        ii.category
      FROM vendor_order_lines vol
      LEFT JOIN inventory_items ii ON vol.inventory_item_id = ii.id
      WHERE vol.order_id = $1
    `, [orderId]);

    // Calculate insights
    const mappedLines = linesResult.rows.filter(l => l.inventory_item_id);
    const unmappedLines = linesResult.rows.filter(l => !l.inventory_item_id);
    const avgConfidence = mappedLines.length > 0
      ? mappedLines.reduce((sum, l) => sum + parseFloat(l.mapping_confidence || 0), 0) / mappedLines.length
      : 0;

    // Category distribution
    const categories = {};
    linesResult.rows.forEach(line => {
      const cat = line.category_code || line.category || 'Uncategorized';
      categories[cat] = (categories[cat] || 0) + 1;
    });

    res.json({
      success: true,
      orderId,
      insights: {
        totalLines: linesResult.rows.length,
        mappedLines: mappedLines.length,
        unmappedLines: unmappedLines.length,
        mappingRate: linesResult.rows.length > 0
          ? ((mappedLines.length / linesResult.rows.length) * 100).toFixed(1) + '%'
          : '0%',
        averageMappingConfidence: (avgConfidence * 100).toFixed(1) + '%',
        categoryDistribution: categories,
        sourceSystem: order.source_system,
        ocrConfidence: order.ocr_confidence
          ? (parseFloat(order.ocr_confidence) * 100).toFixed(1) + '%'
          : 'N/A',
        pdfLinked: !!order.pdf_file_id,
        pdfPreviewUrl: order.pdf_preview_url
      },
      unmappedItems: unmappedLines.map(l => ({
        lineNumber: l.line_number,
        description: l.description,
        vendorSku: l.vendor_sku
      }))
    });

  } catch (error) {
    console.error('[VendorOrders] AI insights error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch AI insights',
      code: 'INSIGHTS_ERROR'
    });
  }
});

// ============================================
// GET /api/vendor-orders/stats - Statistics
// ============================================

router.get('/stats/summary', async (req, res) => {
  try {
    const orgId = getOrgId(req);

    const statsResult = await pool.query(`
      SELECT
        COUNT(DISTINCT vo.id) AS total_orders,
        COUNT(DISTINCT vol.id) AS total_lines,
        COALESCE(SUM(vo.total_cents), 0) AS total_value_cents,
        COUNT(CASE WHEN vo.status = 'new' THEN 1 END) AS new_count,
        COUNT(CASE WHEN vo.status = 'parsed' THEN 1 END) AS parsed_count,
        COUNT(CASE WHEN vo.status = 'validated' THEN 1 END) AS validated_count,
        COUNT(CASE WHEN vo.status = 'fifo_complete' THEN 1 END) AS fifo_complete_count,
        COUNT(CASE WHEN vo.status = 'error' THEN 1 END) AS error_count,
        COUNT(DISTINCT vo.vendor_id) AS vendor_count
      FROM vendor_orders vo
      LEFT JOIN vendor_order_lines vol ON vol.order_id = vo.id
      WHERE vo.org_id = $1 AND vo.deleted_at IS NULL
    `, [orgId]);

    const stats = statsResult.rows[0];

    res.json({
      success: true,
      stats: {
        totalOrders: parseInt(stats.total_orders),
        totalLines: parseInt(stats.total_lines),
        totalValue: centsToDollars(stats.total_value_cents),
        statusCounts: {
          new: parseInt(stats.new_count),
          parsed: parseInt(stats.parsed_count),
          validated: parseInt(stats.validated_count),
          fifo_complete: parseInt(stats.fifo_complete_count),
          error: parseInt(stats.error_count)
        },
        vendorCount: parseInt(stats.vendor_count)
      }
    });

  } catch (error) {
    console.error('[VendorOrders] Stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
      code: 'STATS_ERROR'
    });
  }
});

// ============================================
// POST /api/vendor-orders/upload-gfs-pdf - Batch Upload GFS PDFs
// V22.3: Manual upload from Owner Console
// ============================================

router.post('/upload-gfs-pdf', upload.array('pdfs', 10), async (req, res) => {
  const startTime = Date.now();

  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const files = req.files;

    // Validate files uploaded
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No PDF files uploaded',
        code: 'NO_FILES',
        hint: 'Upload one or more PDF files using multipart/form-data with field name "pdfs"'
      });
    }

    // Check services availability
    if (!parserService) {
      return res.status(503).json({
        success: false,
        error: 'Parser service not available',
        code: 'PARSER_UNAVAILABLE'
      });
    }

    if (!fifoLayerService) {
      return res.status(503).json({
        success: false,
        error: 'FIFO layer service not available',
        code: 'FIFO_SERVICE_UNAVAILABLE'
      });
    }

    const results = [];

    // Process each uploaded PDF
    for (const file of files) {
      const fileResult = {
        fileName: file.originalname,
        success: false,
        orderId: null,
        status: null,
        linesFound: 0,
        fifoLayers: 0,
        casesExtracted: 0,
        error: null
      };

      try {
        // Create vendor_order record
        const insertResult = await pool.query(`
          INSERT INTO vendor_orders (
            org_id, vendor_name, pdf_file_name,
            status, source_system, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `, [
          orgId,
          'Gordon Food Service',
          file.originalname,
          'new',
          'gfs',
          userId
        ]);

        const orderId = insertResult.rows[0].id;
        fileResult.orderId = orderId;

        // Parse the PDF
        const parseResult = await parserService.parseOrderFromFile(
          orderId,
          file.path,
          { userId }
        );

        fileResult.linesFound = parseResult.linesFound || 0;

        if (!parseResult.success) {
          fileResult.error = parseResult.errors?.join('; ') || 'Parse failed';
          fileResult.status = 'error';

          await pool.query(
            `UPDATE vendor_orders SET status = 'error', error_message = $1 WHERE id = $2`,
            [fileResult.error, orderId]
          );
        } else {
          // Populate FIFO layers
          const fifoResult = await fifoLayerService.populateFromVendorOrder(orderId, {
            force: false,
            skipCases: false,
            userId
          });

          fileResult.status = fifoResult.status || 'parsed';
          fileResult.fifoLayers = (fifoResult.layersCreated || 0) + (fifoResult.layersUpdated || 0);
          fileResult.casesExtracted = fifoResult.casesExtracted || 0;
          fileResult.success = true;
        }

      } catch (fileError) {
        console.error(`[VendorOrders] Error processing ${file.originalname}:`, fileError);
        fileResult.error = fileError.message;
        fileResult.status = 'error';

        // Update order status if created
        if (fileResult.orderId) {
          await pool.query(
            `UPDATE vendor_orders SET status = 'error', error_message = $1 WHERE id = $2`,
            [fileError.message, fileResult.orderId]
          ).catch(() => {}); // Ignore update errors
        }
      } finally {
        // Cleanup temp file
        try {
          await fs.unlink(file.path);
        } catch (cleanupErr) {
          console.warn(`[VendorOrders] Failed to cleanup ${file.path}:`, cleanupErr.message);
        }
      }

      results.push(fileResult);
    }

    // Calculate summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const totalLines = results.reduce((sum, r) => sum + r.linesFound, 0);
    const totalLayers = results.reduce((sum, r) => sum + r.fifoLayers, 0);
    const totalCases = results.reduce((sum, r) => sum + r.casesExtracted, 0);

    // Log breadcrumb
    try {
      await pool.query(`
        INSERT INTO ai_ops_breadcrumbs (event_type, event_data, created_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
      `, ['gfs_batch_upload', JSON.stringify({
        userId,
        filesUploaded: files.length,
        successful,
        failed,
        totalLines,
        totalLayers,
        totalCases,
        durationMs: Date.now() - startTime
      })]);
    } catch (logErr) {
      console.warn('[VendorOrders] Failed to log breadcrumb:', logErr.message);
    }

    res.json({
      success: failed === 0,
      message: `Processed ${files.length} files: ${successful} successful, ${failed} failed`,
      summary: {
        filesProcessed: files.length,
        successful,
        failed,
        totalLinesFound: totalLines,
        totalFifoLayers: totalLayers,
        totalCasesExtracted: totalCases,
        durationMs: Date.now() - startTime
      },
      results
    });

  } catch (error) {
    console.error('[VendorOrders] Upload GFS PDF error:', error);

    // Cleanup any uploaded files on error
    if (req.files) {
      for (const file of req.files) {
        try {
          await fs.unlink(file.path);
        } catch (cleanupErr) {
          // Ignore
        }
      }
    }

    res.status(500).json({
      success: false,
      error: 'Failed to process uploaded PDFs',
      code: 'UPLOAD_ERROR',
      details: error.message
    });
  }
});

// ============================================
// POST /api/vendor-orders/scan-inbox - Trigger Manual Inbox Scan
// V22.3: Manually trigger GFS watcher cycle
// ============================================

router.post('/scan-inbox', async (req, res) => {
  try {
    const userId = getUserId(req);

    // Try to import gfs-order-watcher
    let gfsWatcher = null;
    try {
      gfsWatcher = require('../workers/gfs-order-watcher');
    } catch (err) {
      console.warn('[VendorOrders] GFS watcher not available:', err.message);
    }

    if (!gfsWatcher) {
      return res.status(503).json({
        success: false,
        error: 'GFS order watcher not available',
        code: 'WATCHER_UNAVAILABLE',
        hint: 'The GFS order watcher worker is not configured or available'
      });
    }

    // Get current status before running
    const statusBefore = gfsWatcher.getStatus();

    // Run the cycle
    console.log(`[VendorOrders] Manual scan-inbox triggered by ${userId}`);
    await gfsWatcher.runCycle();

    // Get status after running
    const statusAfter = gfsWatcher.getStatus();

    // Calculate what changed in this run
    const ordersProcessedThisRun = statusAfter.stats.ordersProcessed - statusBefore.stats.ordersProcessed;
    const ordersSkippedThisRun = statusAfter.stats.ordersSkipped - statusBefore.stats.ordersSkipped;
    const errorsThisRun = statusAfter.stats.errors - statusBefore.stats.errors;

    // Log breadcrumb
    try {
      await pool.query(`
        INSERT INTO ai_ops_breadcrumbs (event_type, event_data, created_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
      `, ['gfs_manual_scan', JSON.stringify({
        triggeredBy: userId,
        ordersProcessed: ordersProcessedThisRun,
        ordersSkipped: ordersSkippedThisRun,
        errors: errorsThisRun
      })]);
    } catch (logErr) {
      console.warn('[VendorOrders] Failed to log breadcrumb:', logErr.message);
    }

    res.json({
      success: true,
      message: `Inbox scan complete: ${ordersProcessedThisRun} processed, ${ordersSkippedThisRun} skipped`,
      result: {
        ordersProcessed: ordersProcessedThisRun,
        ordersSkipped: ordersSkippedThisRun,
        errors: errorsThisRun,
        lastRunAt: statusAfter.lastRunAt
      },
      watcherStatus: {
        isRunning: statusAfter.isRunning,
        schedule: statusAfter.schedule,
        totalRuns: statusAfter.stats.totalRuns,
        config: statusAfter.config
      }
    });

  } catch (error) {
    console.error('[VendorOrders] Scan inbox error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to scan inbox',
      code: 'SCAN_ERROR',
      details: error.message
    });
  }
});

// ============================================
// GET /api/vendor-orders/gfs-watcher-status - Get Watcher Status
// ============================================

router.get('/gfs-watcher-status', async (req, res) => {
  try {
    // Try to import gfs-order-watcher
    let gfsWatcher = null;
    try {
      gfsWatcher = require('../workers/gfs-order-watcher');
    } catch (err) {
      return res.json({
        success: true,
        available: false,
        message: 'GFS watcher not configured'
      });
    }

    const status = gfsWatcher.getStatus();

    res.json({
      success: true,
      available: true,
      status
    });

  } catch (error) {
    console.error('[VendorOrders] Get watcher status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get watcher status',
      code: 'STATUS_ERROR'
    });
  }
});

module.exports = router;
