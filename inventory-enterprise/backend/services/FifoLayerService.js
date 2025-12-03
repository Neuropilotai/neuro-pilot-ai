/**
 * FIFO Layer Service
 * NeuroPilot AI Enterprise v23.3
 *
 * Populates fifo_cost_layers from parsed vendor orders.
 * Supports GFS case-level tracking for meat products.
 * Provides FIFO consumption methods for cost calculation.
 *
 * v23.3: Item Bank Integration
 * - FIFO layers now reference master_item_id and supplier_item_id from Item Bank
 * - Vendor order cases also reference Item Bank entries
 * - Enables full traceability from invoice -> Item Bank -> FIFO -> counts
 *
 * @version 23.3
 * @author NeuroPilot AI Team
 */

const { pool } = require('../db');
const GfsCaseExtractor = require('./GfsCaseExtractor');

/**
 * FifoLayerService Class
 * Manages FIFO cost layer operations
 */
class FifoLayerService {
  constructor() {
    this.caseExtractor = new GfsCaseExtractor();
  }

  /**
   * v23.3: Look up Item Bank references for an item code
   * Finds supplier_item_id and master_item_id from Item Bank
   *
   * @param {Object} client - DB client
   * @param {string} itemCode - Product/item code (vendor_sku, gfs_code, etc.)
   * @param {number} vendorId - Vendor ID (optional, for more precise matching)
   * @returns {Promise<Object>} { supplierItemId, masterItemId }
   */
  async lookupItemBankRefs(client, itemCode, vendorId = null) {
    const refs = { supplierItemId: null, masterItemId: null };

    if (!itemCode) return refs;

    try {
      // First try to find by supplier_item_code with optional vendor filter
      let result;
      if (vendorId) {
        result = await client.query(`
          SELECT si.id AS supplier_item_id, si.master_item_id
          FROM supplier_items si
          WHERE si.supplier_item_code = $1
            AND si.vendor_id = $2
            AND si.is_active = TRUE
          LIMIT 1
        `, [itemCode, vendorId]);
      }

      // If not found with vendor, try without vendor filter
      if (!result || result.rows.length === 0) {
        result = await client.query(`
          SELECT si.id AS supplier_item_id, si.master_item_id
          FROM supplier_items si
          WHERE si.supplier_item_code = $1
            AND si.is_active = TRUE
          LIMIT 1
        `, [itemCode]);
      }

      if (result.rows.length > 0) {
        refs.supplierItemId = result.rows[0].supplier_item_id;
        refs.masterItemId = result.rows[0].master_item_id;
      }

      return refs;
    } catch (error) {
      console.warn('[FifoLayerService] Item Bank lookup warning:', error.message);
      return refs;
    }
  }

  /**
   * Populate FIFO cost layers from a parsed vendor order
   * Idempotent: Uses INSERT ... ON CONFLICT DO UPDATE
   *
   * @param {string} orderId - UUID of the vendor_order
   * @param {Object} options - Options { force, skipCases, userId }
   * @returns {Promise<Object>} PopulateFifoResult
   */
  async populateFromVendorOrder(orderId, options = {}) {
    const { force = false, skipCases = false, userId = 'system' } = options;

    const result = {
      success: false,
      orderId,
      orderNumber: null,
      status: null,
      layersCreated: 0,
      layersUpdated: 0,
      casesExtracted: 0,
      totalQuantity: 0,
      totalValueCents: 0,
      populatedAt: null,
      code: null,
      error: null
    };

    const client = await pool.connect();

    try {
      // 1. Fetch vendor_order by id
      const orderResult = await client.query(
        `SELECT * FROM vendor_orders WHERE id = $1 AND deleted_at IS NULL`,
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        result.code = 'ORDER_NOT_FOUND';
        result.error = 'Order not found';
        return result;
      }

      const order = orderResult.rows[0];
      result.orderNumber = order.order_number;
      result.status = order.status;

      // 2. Fetch vendor_order_lines
      const linesResult = await client.query(
        `SELECT * FROM vendor_order_lines WHERE order_id = $1 ORDER BY line_number`,
        [orderId]
      );

      // 3. Check if lines exist
      if (linesResult.rows.length === 0) {
        result.code = 'NO_LINE_ITEMS';
        result.error = 'Order has no line items. Parse the order first.';
        result.orderStatus = order.status;
        return result;
      }

      // 4. Check if already populated (unless force=true)
      if (order.status === 'fifo_complete' && !force) {
        result.code = 'ALREADY_POPULATED';
        result.error = 'FIFO already populated for this order';
        result.populatedAt = order.fifo_populated_at;
        result.hint = 'Use force=true to re-populate';
        return result;
      }

      // 5. Begin transaction
      await client.query('BEGIN');

      const lines = linesResult.rows;
      const orgId = order.org_id || 'default-org';
      const invoiceNumber = order.order_number || `ORD-${orderId.substring(0, 8)}`;
      const receivedDate = order.order_date || new Date().toISOString().split('T')[0];

      // If force, delete existing FIFO layers for this order
      if (force) {
        await client.query(
          `DELETE FROM fifo_cost_layers WHERE vendor_order_id = $1`,
          [orderId]
        );
        await client.query(
          `DELETE FROM vendor_order_cases WHERE order_id = $1`,
          [orderId]
        );
      }

      // 6. Process each line item
      // v23.3: Get vendor_id for Item Bank lookups
      const vendorId = order.vendor_id || null;

      for (const line of lines) {
        const itemCode = line.vendor_sku || line.gfs_code || line.description?.substring(0, 50) || 'UNKNOWN';
        const quantity = parseFloat(line.ordered_qty) || 0;
        const unitPriceCents = parseInt(line.unit_price_cents) || 0;
        const unitCost = unitPriceCents / 100;
        const unit = line.unit || 'EACH';

        if (quantity <= 0) continue;

        // v23.3: Look up Item Bank references for this item code
        const itemBankRefs = await this.lookupItemBankRefs(client, itemCode, vendorId);

        // Upsert into fifo_cost_layers (v23.3: includes Item Bank refs)
        const upsertResult = await client.query(`
          INSERT INTO fifo_cost_layers (
            item_code, invoice_number, received_date,
            quantity_received, quantity_remaining, unit_cost, unit,
            vendor_order_id, org_id, location_code, notes,
            master_item_id, supplier_item_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (vendor_order_id, item_code)
          WHERE vendor_order_id IS NOT NULL
          DO UPDATE SET
            quantity_received = EXCLUDED.quantity_received,
            quantity_remaining = EXCLUDED.quantity_remaining,
            unit_cost = EXCLUDED.unit_cost,
            unit = EXCLUDED.unit,
            master_item_id = COALESCE(EXCLUDED.master_item_id, fifo_cost_layers.master_item_id),
            supplier_item_id = COALESCE(EXCLUDED.supplier_item_id, fifo_cost_layers.supplier_item_id)
          RETURNING layer_id, (xmax = 0) AS inserted
        `, [
          itemCode,
          invoiceNumber,
          receivedDate,
          quantity,
          quantity, // Initially, quantity_remaining = quantity_received
          unitCost,
          unit,
          orderId,
          orgId,
          null, // location_code
          `From vendor order ${order.order_number || orderId.substring(0, 8)}`,
          itemBankRefs.masterItemId,
          itemBankRefs.supplierItemId
        ]);

        if (upsertResult.rows.length > 0) {
          if (upsertResult.rows[0].inserted) {
            result.layersCreated++;
          } else {
            result.layersUpdated++;
          }
        }

        result.totalQuantity += quantity;
        result.totalValueCents += Math.round(quantity * unitPriceCents);
      }

      // 7. Extract cases if GFS and not skipping
      if (!skipCases && this.isGfsVendor(order)) {
        // Get raw OCR text
        const rawText = order.raw_ocr_text || order.metadata?.raw_text || '';

        if (rawText) {
          // Prepare line items for case extraction
          const lineItems = lines.map(l => ({
            productCode: l.vendor_sku || l.gfs_code,
            description: l.description,
            lineNumber: l.line_number
          }));

          // Extract all cases
          const casesMap = this.caseExtractor.extractAllCases(rawText, lineItems);

          // v23.3: Get FIFO layer IDs and Item Bank refs for linking
          const layerResult = await client.query(
            `SELECT layer_id, item_code, master_item_id, supplier_item_id
             FROM fifo_cost_layers WHERE vendor_order_id = $1`,
            [orderId]
          );
          const layerDataMap = new Map();
          layerResult.rows.forEach(r => layerDataMap.set(r.item_code, {
            layerId: r.layer_id,
            masterItemId: r.master_item_id,
            supplierItemId: r.supplier_item_id
          }));

          // Insert cases (v23.3: with Item Bank refs)
          for (const [productCode, cases] of casesMap) {
            const layerData = layerDataMap.get(productCode) || {};
            const fifoLayerId = layerData.layerId || null;

            // Find the line_id for this product
            const matchingLine = lines.find(l =>
              l.vendor_sku === productCode || l.gfs_code === productCode
            );
            const lineId = matchingLine?.id || null;

            // v23.3: Get Item Bank refs - first from FIFO layer, then lookup if needed
            let masterItemId = layerData.masterItemId || null;
            let supplierItemId = layerData.supplierItemId || null;

            if (!supplierItemId) {
              const itemBankRefs = await this.lookupItemBankRefs(client, productCode, vendorId);
              supplierItemId = itemBankRefs.supplierItemId;
              masterItemId = masterItemId || itemBankRefs.masterItemId;
            }

            for (const caseData of cases) {
              try {
                await client.query(`
                  INSERT INTO vendor_order_cases (
                    order_id, line_id, org_id, item_code,
                    case_number, weight_kg, weight_lb, weight_unit,
                    sequence_number, status, fifo_layer_id,
                    master_item_id, supplier_item_id
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                  ON CONFLICT (order_id, item_code, case_number) DO NOTHING
                `, [
                  orderId,
                  lineId,
                  orgId,
                  productCode,
                  caseData.caseNumber,
                  caseData.weight,
                  GfsCaseExtractor.kgToLb(caseData.weight),
                  caseData.weightUnit || 'KG',
                  caseData.sequenceNumber,
                  'available',
                  fifoLayerId,
                  masterItemId,
                  supplierItemId
                ]);
                result.casesExtracted++;
              } catch (caseError) {
                // Log but continue - don't fail entire order for one case
                console.warn(`[FifoLayerService] Case insert error:`, caseError.message);
              }
            }
          }
        }
      }

      // 8. Update vendor_orders status
      const populatedAt = new Date().toISOString();
      await client.query(`
        UPDATE vendor_orders SET
          status = 'fifo_complete',
          fifo_populated_at = $2,
          fifo_layers_count = $3,
          fifo_cases_count = $4,
          updated_at = CURRENT_TIMESTAMP,
          updated_by = $5
        WHERE id = $1
      `, [orderId, populatedAt, result.layersCreated + result.layersUpdated, result.casesExtracted, userId]);

      // 9. Commit transaction
      await client.query('COMMIT');

      // 10. Log breadcrumb
      await this.logBreadcrumb('fifo_populated', {
        orderId,
        orderNumber: order.order_number,
        layersCreated: result.layersCreated,
        layersUpdated: result.layersUpdated,
        casesExtracted: result.casesExtracted,
        totalQuantity: result.totalQuantity,
        force,
        skipCases,
        userId
      });

      // 11. Return success result
      result.success = true;
      result.status = 'fifo_complete';
      result.populatedAt = populatedAt;

      return result;

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[FifoLayerService] populateFromVendorOrder error:', error);

      result.code = 'FIFO_ERROR';
      result.error = error.message;
      return result;

    } finally {
      client.release();
    }
  }

  /**
   * Check if vendor is GFS (Gordon Food Service)
   *
   * @param {Object} order - Vendor order object
   * @returns {boolean}
   */
  isGfsVendor(order) {
    const vendorName = (order.vendor_name || '').toLowerCase();
    const sourceSystem = (order.source_system || '').toLowerCase();

    return vendorName.includes('gordon') ||
           vendorName.includes('gfs') ||
           sourceSystem === 'gfs' ||
           sourceSystem.includes('gordon');
  }

  /**
   * Get FIFO layers for an item (oldest first for FIFO consumption)
   *
   * @param {string} itemCode - Product/item code
   * @param {string} orgId - Organization ID
   * @returns {Promise<Array>} Array of FIFO layers
   */
  async getLayersForItem(itemCode, orgId = 'default-org') {
    const result = await pool.query(`
      SELECT
        layer_id,
        item_code,
        invoice_number,
        received_date,
        quantity_received,
        quantity_remaining,
        unit_cost,
        unit,
        location_code,
        vendor_order_id,
        created_at
      FROM fifo_cost_layers
      WHERE item_code = $1
        AND (org_id = $2 OR org_id IS NULL)
        AND quantity_remaining > 0
      ORDER BY received_date ASC, created_at ASC
    `, [itemCode, orgId]);

    return result.rows;
  }

  /**
   * Consume quantity from FIFO layers (oldest first)
   * Used when items are used/sold
   *
   * @param {string} itemCode - Product/item code
   * @param {number} quantity - Quantity to consume
   * @param {string} orgId - Organization ID
   * @returns {Promise<Object>} Consumption result with weighted average cost
   */
  async consumeFromFifo(itemCode, quantity, orgId = 'default-org') {
    const result = {
      consumed: 0,
      weightedAverageCost: 0,
      layersAffected: 0,
      remainingToConsume: quantity,
      details: []
    };

    if (quantity <= 0) {
      return result;
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get available layers (oldest first)
      const layers = await this.getLayersForItem(itemCode, orgId);

      let totalCost = 0;
      let totalConsumed = 0;

      for (const layer of layers) {
        if (result.remainingToConsume <= 0) break;

        const available = parseFloat(layer.quantity_remaining);
        const toConsume = Math.min(available, result.remainingToConsume);

        // Update layer
        await client.query(`
          UPDATE fifo_cost_layers
          SET quantity_remaining = quantity_remaining - $2
          WHERE layer_id = $1
        `, [layer.layer_id, toConsume]);

        totalCost += toConsume * parseFloat(layer.unit_cost);
        totalConsumed += toConsume;
        result.remainingToConsume -= toConsume;
        result.layersAffected++;

        result.details.push({
          layerId: layer.layer_id,
          invoiceNumber: layer.invoice_number,
          receivedDate: layer.received_date,
          quantityConsumed: toConsume,
          unitCost: parseFloat(layer.unit_cost)
        });
      }

      await client.query('COMMIT');

      result.consumed = totalConsumed;
      result.weightedAverageCost = totalConsumed > 0 ? totalCost / totalConsumed : 0;

      return result;

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[FifoLayerService] consumeFromFifo error:', error);
      throw error;

    } finally {
      client.release();
    }
  }

  /**
   * Get FIFO summary for an item
   *
   * @param {string} itemCode - Product/item code
   * @param {string} orgId - Organization ID
   * @returns {Promise<Object>} Summary with total quantity, value, and weighted avg cost
   */
  async getItemFifoSummary(itemCode, orgId = 'default-org') {
    const result = await pool.query(`
      SELECT
        COUNT(*) AS layer_count,
        COALESCE(SUM(quantity_remaining), 0) AS total_quantity,
        COALESCE(SUM(quantity_remaining * unit_cost), 0) AS total_value,
        COALESCE(AVG(unit_cost), 0) AS avg_cost,
        MIN(received_date) AS oldest_layer_date,
        MAX(received_date) AS newest_layer_date
      FROM fifo_cost_layers
      WHERE item_code = $1
        AND (org_id = $2 OR org_id IS NULL)
        AND quantity_remaining > 0
    `, [itemCode, orgId]);

    const row = result.rows[0];
    return {
      itemCode,
      layerCount: parseInt(row.layer_count),
      totalQuantity: parseFloat(row.total_quantity),
      totalValue: parseFloat(row.total_value),
      weightedAverageCost: row.total_quantity > 0
        ? parseFloat(row.total_value) / parseFloat(row.total_quantity)
        : 0,
      oldestLayerDate: row.oldest_layer_date,
      newestLayerDate: row.newest_layer_date
    };
  }

  /**
   * Log a breadcrumb event
   *
   * @param {string} eventType - Event type
   * @param {Object} eventData - Event data
   */
  async logBreadcrumb(eventType, eventData) {
    try {
      await pool.query(`
        INSERT INTO ai_ops_breadcrumbs (event_type, event_data, created_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
      `, [eventType, JSON.stringify(eventData)]);
    } catch (error) {
      // Don't fail operations due to logging errors
      console.warn('[FifoLayerService] Failed to log breadcrumb:', error.message);
    }
  }
}

// Export singleton instance
module.exports = new FifoLayerService();
module.exports.FifoLayerService = FifoLayerService;
