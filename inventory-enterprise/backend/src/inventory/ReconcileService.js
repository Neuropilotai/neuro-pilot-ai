/**
 * Reconciliation Service (v15.2.0)
 * Compare physical inventory vs system stock, compute variances
 *
 * @module ReconcileService
 */

const fs = require('fs');
const db = require('../../config/database');
const { logger } = require('../../config/logger');

class ReconcileService {
  /**
   * Run reconciliation
   * @param {string} asOfDate - ISO date (2025-07-03)
   * @param {string[]} locations - Array of location codes or ["*"]
   * @param {string} userEmail - Triggering user
   * @returns {Promise<Object>} {ok, reconcile_id, summary}
   */
  async runReconciliation(asOfDate, locations = ['*'], userEmail = 'system') {
    const reconcileId = this._generateReconcileId(asOfDate);
    logger.info(`🔄 Reconciliation started: ${reconcileId} (as of ${asOfDate})`);

    try {
      // Create reconciliation run record
      const runId = await this._createReconcileRun({
        reconcile_id: reconcileId,
        as_of_date: asOfDate,
        locations: JSON.stringify(locations),
        triggered_by: userEmail,
        status: 'running'
      });

      // Load physical inventory snapshot
      const physicalStock = await this._loadPhysicalInventory(asOfDate, locations);
      logger.info(`📦 Physical inventory loaded: ${physicalStock.length} items`);

      // Load system inventory
      const systemStock = await this._loadSystemInventory(asOfDate, locations);
      logger.info(`💾 System inventory loaded: ${systemStock.length} items`);

      // Compute variances
      const variances = await this._computeVariances(physicalStock, systemStock);
      logger.info(`📊 Computed ${variances.length} variances`);

      // Store variances
      await this._storeVariances(runId, variances);

      // Compute summary
      const summary = this._computeSummary(variances);

      // Generate artifacts
      const artifacts = await this._generateArtifacts(reconcileId, variances, summary);

      // Update run record
      await this._updateReconcileRun(runId, {
        status: 'completed',
        total_items_checked: summary.items_checked,
        total_variance_qty: summary.total_variance_qty,
        total_variance_value: summary.total_variance_value,
        over_items: summary.over_items,
        short_items: summary.short_items,
        artifacts_path: artifacts.jsonPath,
        summary_csv_path: artifacts.csvPath,
        completed_at: new Date().toISOString()
      });

      logger.info(`✅ Reconciliation completed: ${reconcileId}`);
      logger.info(`   Items checked: ${summary.items_checked}`);
      logger.info(`   Variance value: $${summary.total_variance_value.toFixed(2)}`);
      logger.info(`   Over: ${summary.over_items}, Short: ${summary.short_items}`);

      // Record metrics
      await this._recordMetrics(reconcileId, summary);

      return {
        ok: true,
        reconcile_id: reconcileId,
        summary: {
          items: summary.items_checked,
          variance_qty: summary.total_variance_qty,
          variance_value: summary.total_variance_value,
          over_items: summary.over_items,
          short_items: summary.short_items
        }
      };

    } catch (error) {
      logger.error(`❌ Reconciliation failed:`, error);

      // Mark as failed
      await db.run(`
        UPDATE inventory_reconcile_runs
        SET status = 'failed', completed_at = datetime('now')
        WHERE reconcile_id = ?
      `, [reconcileId]);

      throw error;
    }
  }

  /**
   * Get reconciliation details
   */
  async getReconciliationDetails(reconcileId) {
    const run = await db.get(`
      SELECT * FROM inventory_reconcile_runs WHERE reconcile_id = ?
    `, [reconcileId]);

    if (!run) {
      throw new Error(`Reconciliation not found: ${reconcileId}`);
    }

    // Get variances
    const variances = await db.all(`
      SELECT * FROM inventory_reconcile_diffs
      WHERE run_id = ?
      ORDER BY ABS(variance_value) DESC
      LIMIT 100
    `, [run.id]);

    return {
      ok: true,
      reconcile_id: reconcileId,
      run: {
        status: run.status,
        as_of_date: run.as_of_date,
        started_at: run.started_at,
        completed_at: run.completed_at,
        triggered_by: run.triggered_by
      },
      summary: {
        items_checked: run.total_items_checked,
        total_variance_qty: run.total_variance_qty,
        total_variance_value: run.total_variance_value,
        over_items: run.over_items,
        short_items: run.short_items
      },
      variances: variances.map(v => ({
        item_code: v.item_code,
        item_name: v.item_name,
        location: v.location_code,
        physical_qty: v.physical_qty,
        system_qty: v.system_qty,
        variance_qty: v.variance_qty,
        variance_value: v.variance_value,
        variance_pct: v.variance_pct,
        category: v.category,
        uom: v.uom
      })),
      artifacts: {
        csv: run.summary_csv_path,
        json: run.artifacts_path
      }
    };
  }

  /**
   * Generate reconcile ID
   */
  _generateReconcileId(asOfDate) {
    const dateStr = asOfDate.replace(/-/g, '');
    const timestamp = Date.now().toString(36);
    return `rec_${dateStr}_${timestamp}`;
  }

  /**
   * Create reconcile run record
   */
  async _createReconcileRun(data) {
    const result = await db.run(`
      INSERT INTO inventory_reconcile_runs (
        reconcile_id, as_of_date, locations, triggered_by, status, started_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now'))
    `, [data.reconcile_id, data.as_of_date, data.locations, data.triggered_by, data.status]);

    return result.lastID;
  }

  /**
   * Load physical inventory snapshot (as of date)
   */
  async _loadPhysicalInventory(asOfDate, locations) {
    try {
      // v15.2.2: Try to load from inventory_counts + inventory_count_rows (new system)
      // Look for count within ±1 day of requested date
      const countRecord = await db.get(`
        SELECT id, created_at
        FROM inventory_counts
        WHERE (
          date(created_at) BETWEEN date(?, '-1 day') AND date(?, '+1 day')
          OR date(approved_at) BETWEEN date(?, '-1 day') AND date(?, '+1 day')
          OR date(closed_at) BETWEEN date(?, '-1 day') AND date(?, '+1 day')
        )
        ORDER BY ABS(julianday(created_at) - julianday(?)) ASC
        LIMIT 1
      `, [asOfDate, asOfDate, asOfDate, asOfDate, asOfDate, asOfDate, asOfDate]);

      if (countRecord) {
        const items = await db.all(`
          SELECT
            icr.item_code,
            ii.item_name,
            icr.counted_qty as quantity,
            COALESCE(ii.issue_unit, ii.unit, 'EA') as uom,
            ic.location_id as location_code,
            COALESCE(ii.last_cost, 0) as unit_cost
          FROM inventory_count_rows icr
          JOIN inventory_counts ic ON ic.id = icr.count_id
          LEFT JOIN inventory_items ii ON icr.item_code = ii.item_code
          WHERE icr.count_id = ?
            AND (? = '*' OR ic.location_id IN (SELECT value FROM json_each(?)))
        `, [countRecord.id, locations[0], JSON.stringify(locations)]);

        if (items && items.length > 0) {
          logger.info(`✅ Found ${items.length} items in inventory_counts for ${asOfDate}`);
          return items;
        }
      }

      // Fallback: Try count_headers + count_items (old system)
      const oldHeader = await db.get(`
        SELECT count_id
        FROM count_headers
        WHERE date(count_date) = date(?)
        ORDER BY count_date DESC
        LIMIT 1
      `, [asOfDate]);

      if (oldHeader) {
        const items = await db.all(`
          SELECT
            ci.item_code,
            ii.item_name,
            ci.counted_quantity as quantity,
            COALESCE(ii.issue_unit, ii.unit, ci.unit, 'EA') as uom,
            ci.location_code,
            COALESCE(ii.last_cost, 0) as unit_cost
          FROM count_items ci
          LEFT JOIN inventory_items ii ON ci.item_code = ii.item_code
          WHERE ci.count_id = ?
            AND (? = '*' OR ci.location_code IN (SELECT value FROM json_each(?)))
        `, [oldHeader.count_id, locations[0], JSON.stringify(locations)]);

        if (items && items.length > 0) {
          logger.info(`✅ Found ${items.length} items in count_headers for ${asOfDate}`);
          return items;
        }
      }

      logger.warn(`⚠️  No physical inventory found for ${asOfDate}, using empty snapshot`);
      return [];

    } catch (error) {
      logger.error(`Error loading physical inventory:`, error);
      return [];
    }
  }

  /**
   * Load system inventory (current stock)
   */
  async _loadSystemInventory(asOfDate, locations) {
    try {
      // v15.2.2: Use current_quantity directly from inventory_items
      // Match physical count location to get proper comparison
      const system = await db.all(`
        SELECT
          ii.item_code,
          ii.item_name,
          COALESCE(ii.current_quantity, 0) as quantity,
          COALESCE(ii.issue_unit, ii.unit, 'EA') as uom,
          'LOC-MAIN' as location_code,
          COALESCE(ii.last_cost, 0) as unit_cost
        FROM inventory_items ii
        WHERE ii.is_active = 1
      `);

      logger.info(`✅ Loaded ${system.length} items from inventory_items.current_quantity`);
      return system;

    } catch (error) {
      logger.error(`Error loading system inventory:`, error);
      // Fallback: Return empty array to prevent false variances
      logger.warn(`⚠️  System inventory load failed, returning empty array`);
      return [];
    }
  }

  /**
   * Compute variances (physical - system)
   */
  _computeVariances(physicalStock, systemStock) {
    const variances = [];

    // Create lookup maps
    const physicalMap = new Map();
    const systemMap = new Map();

    for (const item of physicalStock) {
      const key = `${item.item_code}_${item.location_code || ''}`;
      physicalMap.set(key, item);
    }

    for (const item of systemStock) {
      const key = `${item.item_code}_${item.location_code || ''}`;
      systemMap.set(key, item);
    }

    // Get all unique keys
    const allKeys = new Set([...physicalMap.keys(), ...systemMap.keys()]);

    for (const key of allKeys) {
      const physical = physicalMap.get(key);
      const system = systemMap.get(key);

      const physicalQty = physical ? parseFloat(physical.quantity) || 0 : 0;
      const systemQty = system ? parseFloat(system.quantity) || 0 : 0;
      const varianceQty = physicalQty - systemQty;

      // Skip if no variance and both are zero
      if (Math.abs(varianceQty) < 0.01 && physicalQty === 0 && systemQty === 0) {
        continue;
      }

      const item = physical || system;
      const unitCost = parseFloat(item.unit_cost) || 0;
      const varianceValue = varianceQty * unitCost;
      const variancePct = systemQty !== 0 ? (varianceQty / systemQty) * 100 : 0;

      let category = 'match';
      if (varianceQty > 0.01) category = 'over';
      else if (varianceQty < -0.01) category = 'short';

      variances.push({
        item_code: item.item_code,
        item_name: item.item_name,
        location_code: item.location_code || '',
        physical_qty: physicalQty,
        system_qty: systemQty,
        variance_qty: varianceQty,
        uom: item.uom,
        unit_cost: unitCost,
        variance_value: varianceValue,
        variance_pct: variancePct,
        category
      });
    }

    return variances;
  }

  /**
   * Store variances in database
   */
  async _storeVariances(runId, variances) {
    for (const v of variances) {
      await db.run(`
        INSERT INTO inventory_reconcile_diffs (
          run_id, item_code, item_name, location_code,
          physical_qty, system_qty, variance_qty, uom,
          unit_cost, variance_value, variance_pct, category
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        runId, v.item_code, v.item_name, v.location_code,
        v.physical_qty, v.system_qty, v.variance_qty, v.uom,
        v.unit_cost, v.variance_value, v.variance_pct, v.category
      ]);
    }
  }

  /**
   * Compute summary statistics
   */
  _computeSummary(variances) {
    let totalVarianceQty = 0;
    let totalVarianceValue = 0;
    let overItems = 0;
    let shortItems = 0;

    for (const v of variances) {
      totalVarianceQty += Math.abs(v.variance_qty);
      totalVarianceValue += Math.abs(v.variance_value);
      if (v.category === 'over') overItems++;
      else if (v.category === 'short') shortItems++;
    }

    return {
      items_checked: variances.length,
      total_variance_qty: totalVarianceQty,
      total_variance_value: totalVarianceValue,
      over_items: overItems,
      short_items: shortItems
    };
  }

  /**
   * Generate artifacts (JSON + CSV)
   */
  async _generateArtifacts(reconcileId, variances, summary) {
    const jsonPath = `/tmp/reconcile_${reconcileId}.json`;
    const csvPath = `/tmp/reconcile_${reconcileId}.csv`;

    // Generate JSON
    const jsonData = {
      reconcile_id: reconcileId,
      timestamp: new Date().toISOString(),
      summary,
      variances
    };
    fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));

    // Generate CSV
    const csvLines = [
      'Item Code,Item Name,Location,Physical Qty,System Qty,Variance Qty,UOM,Unit Cost,Variance Value,Variance %,Category'
    ];

    for (const v of variances) {
      csvLines.push([
        v.item_code,
        `"${v.item_name}"`,
        v.location_code,
        v.physical_qty.toFixed(2),
        v.system_qty.toFixed(2),
        v.variance_qty.toFixed(2),
        v.uom,
        v.unit_cost.toFixed(2),
        v.variance_value.toFixed(2),
        v.variance_pct.toFixed(2),
        v.category
      ].join(','));
    }

    fs.writeFileSync(csvPath, csvLines.join('\n'));

    logger.info(`📄 Artifacts generated: ${jsonPath}, ${csvPath}`);

    return { jsonPath, csvPath };
  }

  /**
   * Update reconcile run
   */
  async _updateReconcileRun(runId, data) {
    await db.run(`
      UPDATE inventory_reconcile_runs
      SET status = ?, total_items_checked = ?, total_variance_qty = ?,
          total_variance_value = ?, over_items = ?, short_items = ?,
          artifacts_path = ?, summary_csv_path = ?, completed_at = ?
      WHERE id = ?
    `, [
      data.status, data.total_items_checked, data.total_variance_qty,
      data.total_variance_value, data.over_items, data.short_items,
      data.artifacts_path, data.summary_csv_path, data.completed_at, runId
    ]);
  }

  /**
   * Record metrics to Prometheus table
   */
  async _recordMetrics(reconcileId, summary) {
    const metrics = [
      { name: 'inv_reconcile_runs_total', value: 1, labels: { reconcile_id: reconcileId } },
      { name: 'inv_variance_value', value: summary.total_variance_value, labels: { reconcile_id: reconcileId } },
      { name: 'inv_variance_items', value: summary.items_checked, labels: { reconcile_id: reconcileId } }
    ];

    for (const metric of metrics) {
      await db.run(`
        INSERT INTO inventory_reconcile_metrics (metric_name, metric_value, labels)
        VALUES (?, ?, ?)
      `, [metric.name, metric.value, JSON.stringify(metric.labels)]);
    }
  }
}

module.exports = new ReconcileService();
