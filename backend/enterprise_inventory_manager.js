#!/usr/bin/env node

/**
 * ENTERPRISE INVENTORY MANAGEMENT SYSTEM
 * Phase 1: Core Implementation
 *
 * Features:
 * - Invoice status tracking (PENDING_PLACEMENT → PLACED → COUNTED)
 * - Location assignment workflow
 * - Physical count management with cut-off dates
 * - Min/Max inventory levels (post first count)
 * - FIFO batch tracking
 * - Variance analysis
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const DuplicatePreventionSystem = require('./duplicate_prevention_system');

class EnterpriseInventoryManager {
  constructor(dbPath = './data/enterprise_inventory.db') {
    this.dbPath = dbPath;
    this.db = null;
    this.duplicateSystem = new DuplicatePreventionSystem(dbPath);
  }

  /**
   * Initialize database and create schema
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, async (err) => {
        if (err) return reject(err);

        // Check if database is already initialized
        this.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='invoice_items'", async (err, row) => {
          if (err) return reject(err);

          if (!row) {
            // Database not initialized, load schema
            const schemaPath = path.join(__dirname, 'database/enterprise_inventory_schema.sql');
            const schema = fs.readFileSync(schemaPath, 'utf8');

            this.db.exec(schema, async (err) => {
              if (err) return reject(err);
              console.log('✅ Enterprise inventory database initialized');

              // Initialize duplicate prevention system
              try {
                await this.duplicateSystem.initialize();
                resolve();
              } catch (dupErr) {
                reject(dupErr);
              }
            });
          } else {
            // Database already initialized
            console.log('✅ Enterprise inventory database connected');

            // Initialize duplicate prevention system
            try {
              await this.duplicateSystem.initialize();
              resolve();
            } catch (dupErr) {
              reject(dupErr);
            }
          }
        });
      });
    });
  }

  /**
   * Import invoices from JSON files and set status to PENDING_PLACEMENT
   * Now includes duplicate prevention
   */
  async importInvoicesFromJSON(jsonDir = './data/gfs_orders') {
    const files = fs.readdirSync(jsonDir).filter(f => f.endsWith('.json'));
    console.log(`📦 Importing ${files.length} invoices...`);
    console.log(`🔍 Checking for duplicates...`);

    let totalItems = 0;
    let duplicatesSkipped = 0;
    let invoicesImported = 0;
    let skippedNoItems = 0;
    let skippedNoDate = 0;
    let creditsImported = 0;

    for (const file of files) {
      const invoicePath = path.join(jsonDir, file);
      const invoice = JSON.parse(fs.readFileSync(invoicePath, 'utf8'));

      // Handle credit memos (no items but have negative total)
      if ((!invoice.items || invoice.items.length === 0) && invoice.isCreditMemo) {
        const creditDate = invoice.orderDate || invoice.extractionDate?.split('T')[0] || new Date().toISOString().split('T')[0];
        const creditAmount = invoice.financials?.total || 0;

        // Import credit memo
        await this.addCreditMemo({
          credit_memo_number: invoice.invoiceNumber,
          related_invoice: invoice.relatedInvoice,
          credit_amount: creditAmount,
          credit_date: creditDate
        });

        creditsImported++;
        continue;
      }

      // Skip if no items and not a credit memo
      if (!invoice.items || invoice.items.length === 0) {
        skippedNoItems++;
        continue;
      }

      const invoiceNumber = invoice.invoiceNumber;
      const pdfPath = invoicePath.replace('.json', '.pdf');

      // Check for duplicate
      const duplicateCheck = await this.duplicateSystem.checkForDuplicate(
        invoiceNumber,
        pdfPath,
        invoice
      );

      if (duplicateCheck.isDuplicate) {
        console.log(`⚠️  DUPLICATE SKIPPED: ${invoiceNumber} (${duplicateCheck.duplicateType})`);

        // Log duplicate attempt
        await this.duplicateSystem.logDuplicateAttempt(
          invoiceNumber,
          pdfPath,
          duplicateCheck.duplicateType,
          duplicateCheck.matchedInvoice?.id || null,
          'IMPORT_SYSTEM',
          duplicateCheck.reasons.join(', ')
        );

        duplicatesSkipped++;
        continue;
      }

      // Import invoice items
      // Use orderDate if available, otherwise use extractionDate as fallback
      const invoiceDate = invoice.orderDate || invoice.extractionDate?.split('T')[0] || new Date().toISOString().split('T')[0];

      for (const item of invoice.items) {
        await this.addInvoiceItem({
          invoice_number: invoice.invoiceNumber,
          invoice_date: invoiceDate,
          item_code: item.itemCode,
          barcode: item.barcode || null,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unitPrice,
          line_total: item.lineTotal,
          status: 'PENDING_PLACEMENT'
        });
        totalItems++;
      }

      // Mark invoice as processed
      await this.duplicateSystem.markAsProcessed(
        invoiceNumber,
        pdfPath,
        invoice,
        'IMPORT_SYSTEM'
      );

      invoicesImported++;
    }

    console.log(`✅ Imported ${totalItems} items from ${invoicesImported} invoices`);
    if (creditsImported > 0) {
      console.log(`💳 Imported ${creditsImported} credit memos`);
    }
    if (duplicatesSkipped > 0) {
      console.log(`⚠️  Skipped ${duplicatesSkipped} duplicate invoices`);
    }
    if (skippedNoItems > 0) {
      console.log(`ℹ️  Skipped ${skippedNoItems} invoices with no items`);
    }
    if (skippedNoDate > 0) {
      console.log(`⚠️  Skipped ${skippedNoDate} invoices with no date`);
    }

    return {
      files: files.length,
      items: totalItems,
      invoicesImported,
      creditsImported,
      duplicatesSkipped,
      skippedNoItems,
      skippedNoDate
    };
  }

  /**
   * Add credit memo to database
   */
  async addCreditMemo(credit) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR IGNORE INTO credit_memos
        (credit_memo_number, related_invoice, credit_amount, credit_date)
        VALUES (?, ?, ?, ?)
      `;

      this.db.run(sql, [
        credit.credit_memo_number,
        credit.related_invoice,
        credit.credit_amount,
        credit.credit_date
      ], function(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      });
    });
  }

  /**
   * Add invoice item to database
   */
  async addInvoiceItem(item) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO invoice_items
        (invoice_number, invoice_date, item_code, barcode, description,
         quantity, unit, unit_price, line_total, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      this.db.run(sql, [
        item.invoice_number,
        item.invoice_date,
        item.item_code,
        item.barcode,
        item.description,
        item.quantity,
        item.unit,
        item.unit_price,
        item.line_total,
        item.status
      ], function(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      });
    });
  }

  /**
   * Get all items pending location assignment
   */
  async getPendingPlacements() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM v_pending_placements ORDER BY invoice_date DESC`;
      this.db.all(sql, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  /**
   * Assign location to invoice items
   */
  async assignLocation(invoiceNumber, itemCode, locationId, assignedBy, notes = '') {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Start transaction
        this.db.run('BEGIN TRANSACTION');

        // Update invoice item
        const updateSql = `
          UPDATE invoice_items
          SET location_id = ?,
              status = 'PLACED',
              assigned_by = ?,
              assigned_at = datetime('now')
          WHERE invoice_number = ?
            AND item_code = ?
            AND status = 'PENDING_PLACEMENT'
        `;

        this.db.run(updateSql, [locationId, assignedBy, invoiceNumber, itemCode], function(err) {
          if (err) {
            this.db.run('ROLLBACK');
            return reject(err);
          }

          if (this.changes === 0) {
            this.db.run('ROLLBACK');
            return reject(new Error('No items updated - item may already be placed'));
          }

          // Create assignment record
          const assignmentSql = `
            INSERT INTO location_assignments
            (invoice_number, item_code, quantity, unit, to_location_id,
             assigned_by, assigned_at, reason, status, notes)
            SELECT invoice_number, item_code, quantity, unit, ?, ?, datetime('now'), 'RECEIPT', 'COMPLETED', ?
            FROM invoice_items
            WHERE invoice_number = ? AND item_code = ?
          `;

          this.db.run(assignmentSql, [locationId, assignedBy, notes, invoiceNumber, itemCode], (err) => {
            if (err) {
              this.db.run('ROLLBACK');
              return reject(err);
            }

            // Commit transaction
            this.db.run('COMMIT', (err) => {
              if (err) return reject(err);
              resolve({ success: true, changes: this.changes });
            });
          });
        });
      });
    });
  }

  /**
   * Bulk assign location to multiple items from same invoice
   */
  async bulkAssignLocation(invoiceNumber, locationId, assignedBy, notes = '') {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');

        const updateSql = `
          UPDATE invoice_items
          SET location_id = ?,
              status = 'PLACED',
              assigned_by = ?,
              assigned_at = datetime('now')
          WHERE invoice_number = ?
            AND status = 'PENDING_PLACEMENT'
        `;

        this.db.run(updateSql, [locationId, assignedBy, invoiceNumber], function(err) {
          if (err) {
            this.db.run('ROLLBACK');
            return reject(err);
          }

          const changes = this.changes;

          // Create assignment records
          const assignmentSql = `
            INSERT INTO location_assignments
            (invoice_number, item_code, quantity, unit, to_location_id,
             assigned_by, assigned_at, reason, status, notes)
            SELECT invoice_number, item_code, quantity, unit, ?, ?, datetime('now'), 'RECEIPT', 'COMPLETED', ?
            FROM invoice_items
            WHERE invoice_number = ? AND status = 'PLACED'
          `;

          this.db.run(assignmentSql, [locationId, assignedBy, notes, invoiceNumber], (err) => {
            if (err) {
              this.db.run('ROLLBACK');
              return reject(err);
            }

            this.db.run('COMMIT', (err) => {
              if (err) return reject(err);
              resolve({ success: true, itemsAssigned: changes });
            });
          });
        });
      });
    });
  }

  /**
   * Create new physical count
   */
  async createPhysicalCount(cutOffDate, performedBy, notes = '') {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO inventory_counts
        (count_date, cut_off_date, performed_by, status, notes)
        VALUES (datetime('now'), ?, ?, 'IN_PROGRESS', ?)
      `;

      this.db.run(sql, [cutOffDate, performedBy, notes], function(err) {
        if (err) return reject(err);
        resolve({ countId: this.lastID, cutOffDate, performedBy });
      });
    });
  }

  /**
   * Get items to count (based on cut-off date)
   */
  async getItemsToCount(cutOffDate, locationId = null) {
    return new Promise((resolve, reject) => {
      let sql = `
        SELECT
          item_code,
          barcode,
          description,
          location_id,
          SUM(quantity) as system_quantity,
          unit,
          COUNT(*) as receipt_count,
          MAX(invoice_date) as last_receipt_date
        FROM invoice_items
        WHERE status = 'PLACED'
          AND invoice_date <= ?
      `;

      const params = [cutOffDate];

      if (locationId) {
        sql += ` AND location_id = ?`;
        params.push(locationId);
      }

      sql += `
        GROUP BY item_code, location_id
        ORDER BY location_id, description
      `;

      this.db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  /**
   * Record physical count for an item
   */
  async recordCount(countId, itemCode, locationId, countedQuantity, countedBy, notes = '') {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Get system quantity
        const getSysSql = `
          SELECT SUM(quantity) as system_qty, unit, unit_price
          FROM invoice_items
          WHERE item_code = ?
            AND location_id = ?
            AND status = 'PLACED'
          GROUP BY item_code, location_id
        `;

        this.db.get(getSysSql, [itemCode, locationId], (err, row) => {
          if (err) return reject(err);
          if (!row) return reject(new Error('Item not found in inventory'));

          const systemQty = row.system_qty || 0;
          const variance = countedQuantity - systemQty;
          const variancePercent = systemQty > 0 ? (variance / systemQty) * 100 : 0;
          const varianceValue = variance * (row.unit_price || 0);
          const requiresRecount = Math.abs(variancePercent) > 5 ? 1 : 0;

          // Insert snapshot
          const insertSql = `
            INSERT INTO inventory_snapshots
            (count_id, item_code, barcode, description, location_id,
             counted_quantity, counted_unit, system_quantity,
             variance_quantity, variance_value, variance_percent,
             counted_by, counted_at, notes, requires_recount)
            SELECT ?, item_code, barcode, description, location_id,
                   ?, unit, ?, ?, ?, ?, ?, datetime('now'), ?, ?
            FROM invoice_items
            WHERE item_code = ? AND location_id = ?
            LIMIT 1
          `;

          this.db.run(insertSql, [
            countId, countedQuantity, systemQty,
            variance, varianceValue, variancePercent,
            countedBy, notes, requiresRecount,
            itemCode, locationId
          ], function(err) {
            if (err) return reject(err);
            resolve({
              snapshotId: this.lastID,
              variance,
              variancePercent: variancePercent.toFixed(2),
              requiresRecount: requiresRecount === 1
            });
          });
        });
      });
    });
  }

  /**
   * Complete physical count
   */
  async completePhysicalCount(countId) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');

        // Update count status
        const updateCountSql = `
          UPDATE inventory_counts
          SET status = 'COMPLETED',
              completed_at = datetime('now'),
              total_items_counted = (SELECT COUNT(*) FROM inventory_snapshots WHERE count_id = ?),
              total_locations = (SELECT COUNT(DISTINCT location_id) FROM inventory_snapshots WHERE count_id = ?),
              total_variance_value = (SELECT SUM(variance_value) FROM inventory_snapshots WHERE count_id = ?)
          WHERE count_id = ?
        `;

        this.db.run(updateCountSql, [countId, countId, countId, countId], (err) => {
          if (err) {
            this.db.run('ROLLBACK');
            return reject(err);
          }

          // Mark all counted items
          const markItemsSql = `
            UPDATE invoice_items
            SET status = 'COUNTED',
                last_counted_in = ?
            WHERE item_code IN (
              SELECT DISTINCT item_code FROM inventory_snapshots WHERE count_id = ?
            )
            AND status = 'PLACED'
          `;

          this.db.run(markItemsSql, [countId, countId], (err) => {
            if (err) {
              this.db.run('ROLLBACK');
              return reject(err);
            }

            // Update config
            const updateConfigSql = `
              UPDATE inventory_config
              SET config_value = (SELECT count_date FROM inventory_counts WHERE count_id = ?),
                  updated_at = datetime('now')
              WHERE config_key = 'last_count_date'
            `;

            this.db.run(updateConfigSql, [countId], (err) => {
              if (err) {
                this.db.run('ROLLBACK');
                return reject(err);
              }

              this.db.run('COMMIT', (err) => {
                if (err) return reject(err);
                resolve({ success: true, countId });
              });
            });
          });
        });
      });
    });
  }

  /**
   * Calculate and set min/max levels based on historical usage
   */
  async calculateMinMaxLevels(itemCode, weeks = 12) {
    return new Promise((resolve, reject) => {
      // Get usage data
      const usageSql = `
        SELECT
          item_code,
          description,
          unit,
          SUM(quantity) / ? as avg_weekly_usage
        FROM inventory_consumption
        WHERE item_code = ?
          AND consumption_date >= date('now', '-' || ? || ' days')
        GROUP BY item_code
      `;

      this.db.get(usageSql, [weeks, itemCode, weeks * 7], (err, row) => {
        if (err) return reject(err);
        if (!row) {
          // If no consumption data, use receipt data as estimate
          return this.estimateMinMaxFromReceipts(itemCode, weeks).then(resolve).catch(reject);
        }

        const avgWeeklyUsage = row.avg_weekly_usage || 0;
        const leadTimeDays = 7; // Default
        const safetyStockPercent = 0.2; // 20%

        // Calculate levels
        const leadTimeUsage = (avgWeeklyUsage / 7) * leadTimeDays;
        const safetyStock = avgWeeklyUsage * safetyStockPercent;
        const minQuantity = leadTimeUsage + safetyStock;
        const maxQuantity = avgWeeklyUsage * 4; // 4 weeks worth
        const reorderQuantity = avgWeeklyUsage * 2; // 2 weeks worth

        // Insert or update
        const upsertSql = `
          INSERT INTO inventory_min_max
          (item_code, barcode, description, min_quantity, max_quantity, reorder_quantity,
           unit, avg_weekly_usage, lead_time_days, safety_stock, last_updated, updated_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'SYSTEM')
          ON CONFLICT(item_code) DO UPDATE SET
            min_quantity = excluded.min_quantity,
            max_quantity = excluded.max_quantity,
            reorder_quantity = excluded.reorder_quantity,
            avg_weekly_usage = excluded.avg_weekly_usage,
            safety_stock = excluded.safety_stock,
            last_updated = datetime('now')
        `;

        this.db.run(upsertSql, [
          itemCode, row.barcode, row.description,
          Math.ceil(minQuantity), Math.ceil(maxQuantity), Math.ceil(reorderQuantity),
          row.unit, avgWeeklyUsage.toFixed(2), leadTimeDays, Math.ceil(safetyStock)
        ], function(err) {
          if (err) return reject(err);
          resolve({
            itemCode,
            minQuantity: Math.ceil(minQuantity),
            maxQuantity: Math.ceil(maxQuantity),
            reorderQuantity: Math.ceil(reorderQuantity)
          });
        });
      });
    });
  }

  /**
   * Estimate min/max from receipt patterns (when no consumption data)
   */
  async estimateMinMaxFromReceipts(itemCode, weeks) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT
          item_code,
          barcode,
          description,
          unit,
          AVG(quantity) as avg_order_qty,
          COUNT(*) as order_count
        FROM invoice_items
        WHERE item_code = ?
          AND invoice_date >= date('now', '-' || ? || ' days')
        GROUP BY item_code
      `;

      this.db.get(sql, [itemCode, weeks * 7], (err, row) => {
        if (err) return reject(err);
        if (!row) return reject(new Error('No data found for item'));

        // Estimate: assume orders are placed when stock is low
        const avgOrderQty = row.avg_order_qty || 0;
        const orderFrequency = weeks / (row.order_count || 1); // weeks between orders

        const minQuantity = avgOrderQty * 0.3; // 30% of order as min
        const maxQuantity = avgOrderQty * 2; // 2x order as max
        const reorderQuantity = avgOrderQty;

        const upsertSql = `
          INSERT INTO inventory_min_max
          (item_code, barcode, description, min_quantity, max_quantity, reorder_quantity,
           unit, avg_weekly_usage, lead_time_days, safety_stock, last_updated, updated_by, auto_calculate)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, 7, 0, datetime('now'), 'ESTIMATED', 1)
          ON CONFLICT(item_code) DO UPDATE SET
            min_quantity = excluded.min_quantity,
            max_quantity = excluded.max_quantity,
            reorder_quantity = excluded.reorder_quantity,
            last_updated = datetime('now'),
            updated_by = 'ESTIMATED'
        `;

        this.db.run(upsertSql, [
          itemCode, row.barcode, row.description,
          Math.ceil(minQuantity), Math.ceil(maxQuantity), Math.ceil(reorderQuantity),
          row.unit
        ], function(err) {
          if (err) return reject(err);
          resolve({
            itemCode,
            minQuantity: Math.ceil(minQuantity),
            maxQuantity: Math.ceil(maxQuantity),
            reorderQuantity: Math.ceil(reorderQuantity),
            estimated: true
          });
        });
      });
    });
  }

  /**
   * Calculate min/max for all items after first count
   */
  async calculateAllMinMax(weeks = 12) {
    return new Promise((resolve, reject) => {
      // Get all unique items from last count
      const sql = `
        SELECT DISTINCT item_code
        FROM inventory_snapshots
        WHERE count_id = (SELECT MAX(count_id) FROM inventory_counts WHERE status = 'COMPLETED')
      `;

      this.db.all(sql, [], async (err, rows) => {
        if (err) return reject(err);

        const results = [];
        for (const row of rows) {
          try {
            const result = await this.calculateMinMaxLevels(row.item_code, weeks);
            results.push(result);
          } catch (error) {
            console.error(`Error calculating min/max for ${row.item_code}:`, error.message);
          }
        }

        resolve(results);
      });
    });
  }

  /**
   * Get items that need reordering
   */
  async getReorderAlerts() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM v_reorder_needed`;
      this.db.all(sql, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  /**
   * Get current inventory view
   */
  async getCurrentInventory(locationId = null) {
    return new Promise((resolve, reject) => {
      let sql = `SELECT * FROM v_current_inventory`;
      const params = [];

      if (locationId) {
        sql += ` WHERE location_id = ?`;
        params.push(locationId);
      }

      this.db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  /**
   * Get latest count summary
   */
  async getLatestCountSummary() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM v_latest_count_summary`;
      this.db.get(sql, [], (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      });
    });
  }

  /**
   * Get order processing statistics
   */
  async getOrderProcessingStats() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT
          COUNT(DISTINCT invoice_number) as total_orders,
          COUNT(DISTINCT CASE WHEN status = 'PENDING_PLACEMENT' THEN invoice_number END) as pending_orders,
          COUNT(DISTINCT CASE WHEN status IN ('PLACED', 'COUNTED', 'CONSUMED') THEN invoice_number END) as processed_orders,
          MIN(invoice_date) as earliest_order_date,
          MAX(invoice_date) as latest_order_date,
          COUNT(*) as total_line_items,
          SUM(CASE WHEN status = 'PENDING_PLACEMENT' THEN 1 ELSE 0 END) as pending_items,
          SUM(CASE WHEN status IN ('PLACED', 'COUNTED', 'CONSUMED') THEN 1 ELSE 0 END) as processed_items
        FROM invoice_items
      `;

      this.db.get(sql, [], (err, row) => {
        if (err) return reject(err);
        resolve(row || {
          total_orders: 0,
          pending_orders: 0,
          processed_orders: 0,
          total_line_items: 0,
          pending_items: 0,
          processed_items: 0
        });
      });
    });
  }

  /**
   * Get accurate inventory total value including credits
   */
  async getInventoryTotalValue(includeAllStatuses = false) {
    return new Promise((resolve, reject) => {
      const statusFilter = includeAllStatuses
        ? ''
        : "WHERE status IN ('PLACED', 'COUNTED')";

      const sql = `
        SELECT
          SUM(line_total) as invoice_total,
          (SELECT COALESCE(SUM(credit_amount), 0) FROM credit_memos) as credit_total,
          (SUM(line_total) - (SELECT COALESCE(SUM(credit_amount), 0) FROM credit_memos)) as net_total,
          COUNT(DISTINCT item_code) as unique_items,
          COUNT(*) as total_line_items,
          SUM(quantity) as total_quantity
        FROM invoice_items
        ${statusFilter}
      `;

      this.db.get(sql, [], (err, row) => {
        if (err) return reject(err);
        resolve({
          invoice_total: parseFloat((row?.invoice_total || 0).toFixed(2)),
          credit_total: parseFloat((row?.credit_total || 0).toFixed(2)),
          total_value: parseFloat((row?.net_total || 0).toFixed(2)),
          unique_items: row?.unique_items || 0,
          total_line_items: row?.total_line_items || 0,
          total_quantity: row?.total_quantity || 0
        });
      });
    });
  }

  /**
   * Get inventory value by status
   */
  async getInventoryValueByStatus() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT
          status,
          COUNT(DISTINCT invoice_number) as order_count,
          COUNT(*) as item_count,
          SUM(line_total) as total_value,
          SUM(quantity) as total_quantity
        FROM invoice_items
        GROUP BY status
        ORDER BY
          CASE status
            WHEN 'PENDING_PLACEMENT' THEN 1
            WHEN 'PLACED' THEN 2
            WHEN 'COUNTED' THEN 3
            WHEN 'CONSUMED' THEN 4
          END
      `;

      this.db.all(sql, [], (err, rows) => {
        if (err) return reject(err);
        resolve((rows || []).map(row => ({
          status: row.status,
          order_count: row.order_count,
          item_count: row.item_count,
          total_value: parseFloat((row.total_value || 0).toFixed(2)),
          total_quantity: row.total_quantity
        })));
      });
    });
  }

  /**
   * Get duplicate prevention statistics
   */
  async getDuplicateStats() {
    return await this.duplicateSystem.getDuplicateStats();
  }

  // ============================================================================
  // CATEGORY MANAGEMENT
  // ============================================================================

  /**
   * Initialize category tables
   */
  async initializeCategories() {
    return new Promise((resolve, reject) => {
      const schemaPath = path.join(__dirname, 'database/add_categories.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');

      this.db.exec(schema, (err) => {
        if (err) return reject(err);
        console.log('✅ Category system initialized');
        resolve();
      });
    });
  }

  /**
   * Load accounting categories (replaces default categories)
   */
  async loadAccountingCategories() {
    return new Promise((resolve, reject) => {
      const schemaPath = path.join(__dirname, 'database/update_categories_accounting.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');

      this.db.exec(schema, (err) => {
        if (err) return reject(err);
        console.log('✅ Accounting categories loaded');
        resolve();
      });
    });
  }

  /**
   * Get all categories (main categories only)
   */
  async getCategories() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM item_categories
        WHERE parent_category_id IS NULL
          AND active = 1
        ORDER BY display_order
      `;

      this.db.all(sql, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }

  /**
   * Get subcategories for a category
   */
  async getSubcategories(categoryId) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM item_categories
        WHERE parent_category_id = ?
          AND active = 1
        ORDER BY display_order
      `;

      this.db.all(sql, [categoryId], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }

  /**
   * Create new category
   */
  async createCategory(name, code, description = '', parentId = null, displayOrder = 0) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO item_categories
        (category_name, category_code, description, parent_category_id, display_order)
        VALUES (?, ?, ?, ?, ?)
      `;

      this.db.run(sql, [name, code, description, parentId, displayOrder], function(err) {
        if (err) return reject(err);
        resolve({ categoryId: this.lastID, name, code });
      });
    });
  }

  /**
   * Auto-categorize item based on description
   * Using actual accounting categories:
   * 1=BAKE, 2=BEV+ECO, 3=MILK, 4=GROC+MISC, 5=MEAT, 6=PROD, 7=CLEAN, 8=PAPER,
   * 9=Small Equip, 10=FREIGHT, 11=LINEN, 12=PROPANE, 13=Other Costs
   */
  async autoCategorizeItem(itemCode, description) {
    const descLower = description.toLowerCase();

    const categoryRules = [
      // Order matters! More specific matches first

      // 8. PAPER (60260010) - Paper products (check before other categories)
      { keywords: ['paper towel', 'paper plate', 'paper napkin', 'toilet paper', 'tissue paper', 'paper cup', 'paper bag'], category: 8 },

      // 6. PROD (60110070) - Produce (check fruits/vegetables before meat)
      { keywords: ['apple', 'banana', 'orange', 'grape', 'berry', 'melon', 'peach', 'pear', 'fruit', 'lettuce', 'tomato', 'onion', 'potato', 'carrot', 'celery', 'pepper', 'cucumber', 'vegetable', 'produce'], category: 6 },

      // 5. MEAT (60110060) - Meat products
      { keywords: ['beef', 'steak', 'ground beef', 'roast', 'pork', 'bacon', 'ham', 'sausage', 'chicken', 'turkey', 'poultry', 'fish', 'salmon', 'shrimp', 'seafood', 'tuna', 'meat', 'deli'], category: 5 },

      // 3. MILK (60110030) - Milk and dairy
      { keywords: ['milk', 'cream', 'half & half', 'half&half', 'dairy', 'cheese', 'cheddar', 'mozzarella', 'parmesan', 'yogurt', 'butter', 'margarine', 'egg'], category: 3 },

      // 1. BAKE (60110010) - Bakery items
      { keywords: ['bread', 'roll', 'bun', 'bagel', 'muffin', 'croissant', 'donut', 'pastry', 'cake', 'cookie', 'bake', 'dough'], category: 1 },

      // 2. BEV + ECO (60110020) - Beverages and ECO items
      { keywords: ['juice', 'soda', 'coffee', 'tea', 'drink', 'beverage', 'eco', 'cup', 'lid', 'straw'], category: 2 },

      // 7. CLEAN (60220001) - Cleaning supplies
      { keywords: ['cleaner', 'sanitizer', 'detergent', 'soap', 'bleach', 'disinfect', 'wipe', 'clean'], category: 7 },

      // 8. PAPER (60260010) - Paper products (generic terms)
      { keywords: ['napkin', 'tissue', 'toilet', 'plate', 'container', 'bag', 'wrap', 'foil', 'film'], category: 8 },

      // 4. GROC+ MISC (60110040) - Grocery and miscellaneous
      { keywords: ['pasta', 'rice', 'flour', 'grain', 'cereal', 'sauce', 'ketchup', 'mustard', 'mayo', 'dressing', 'oil', 'vinegar', 'spice', 'seasoning', 'canned', 'can ', 'jar', 'condiment', 'snack', 'chip', 'cracker'], category: 4 },

      // 9. Small Equip (60665001) - Small equipment
      { keywords: ['equipment', 'tool', 'utensil', 'knife', 'pan', 'pot', 'thermometer', 'scale', 'glove', 'apron'], category: 9 },

      // 10. FREIGHT (62421100) - Freight charges
      { keywords: ['freight', 'shipping', 'delivery', 'fuel surcharge'], category: 10 },

      // 11. LINEN (60240010) - Linen and textiles
      { keywords: ['linen', 'cloth', 'textile', 'rag', 'uniform', 'towel'], category: 11 },

      // 12. PROPANE (62869010) - Propane and gas
      { keywords: ['propane', 'gas', 'fuel', 'cylinder', 'tank'], category: 12 }
    ];

    for (const rule of categoryRules) {
      for (const keyword of rule.keywords) {
        if (descLower.includes(keyword)) {
          return {
            category_id: rule.category,
            subcategory_id: null
          };
        }
      }
    }

    // Default to "Other Costs"
    return { category_id: 13, subcategory_id: null };
  }

  /**
   * Update item master with category (legacy - without description)
   */
  async updateItemCategory(itemCode, categoryId, subcategoryId = null) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO item_master (item_code, category_id, subcategory_id, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(item_code) DO UPDATE SET
          category_id = excluded.category_id,
          subcategory_id = excluded.subcategory_id,
          updated_at = datetime('now')
      `;

      this.db.run(sql, [itemCode, categoryId, subcategoryId], function(err) {
        if (err) return reject(err);
        resolve({ itemCode, categoryId, subcategoryId });
      });
    });
  }

  /**
   * Update item master with category including description
   */
  async updateItemCategoryWithDescription(itemCode, description, categoryId, subcategoryId = null) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO item_master (item_code, description, category_id, subcategory_id, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(item_code) DO UPDATE SET
          description = excluded.description,
          category_id = excluded.category_id,
          subcategory_id = excluded.subcategory_id,
          updated_at = datetime('now')
      `;

      this.db.run(sql, [itemCode, description, categoryId, subcategoryId], function(err) {
        if (err) return reject(err);
        resolve({ itemCode, categoryId, subcategoryId });
      });
    });
  }

  /**
   * Auto-categorize all items from invoice_items
   */
  async autoCategorizeAllItems() {
    return new Promise((resolve, reject) => {
      // Get all unique items WITH their descriptions
      const sql = `SELECT DISTINCT item_code, description FROM invoice_items`;

      this.db.all(sql, [], async (err, rows) => {
        if (err) return reject(err);

        const results = {
          total: rows.length,
          categorized: 0,
          failed: 0
        };

        for (const row of rows) {
          try {
            const category = await this.autoCategorizeItem(row.item_code, row.description);
            // Use new method that includes description
            await this.updateItemCategoryWithDescription(
              row.item_code,
              row.description,
              category.category_id,
              category.subcategory_id
            );
            results.categorized++;
          } catch (error) {
            console.error(`Failed to categorize ${row.item_code}:`, error.message);
            results.failed++;
          }
        }

        resolve(results);
      });
    });
  }

  /**
   * Get category inventory statistics
   */
  async getCategoryInventory() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM v_category_inventory`;

      this.db.all(sql, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }

  /**
   * Get subcategory inventory statistics
   */
  async getSubcategoryInventory() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM v_subcategory_inventory`;

      this.db.all(sql, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }

  /**
   * Get inventory value by category
   */
  async getInventoryValueByCategory(includeAllStatuses = false) {
    return new Promise((resolve, reject) => {
      const statusFilter = includeAllStatuses
        ? ''
        : "AND ii.status IN ('PLACED', 'COUNTED')";

      const sql = `
        SELECT
          c.category_id,
          c.category_name,
          c.category_code,
          COUNT(DISTINCT ii.item_code) as unique_items,
          COUNT(*) as total_line_items,
          SUM(ii.quantity) as total_quantity,
          SUM(ii.line_total) as total_value
        FROM item_categories c
        LEFT JOIN item_master im ON c.category_id = im.category_id
        LEFT JOIN invoice_items ii ON im.item_code = ii.item_code
        WHERE c.parent_category_id IS NULL
          AND c.active = 1
          ${statusFilter}
        GROUP BY c.category_id, c.category_name, c.category_code
        ORDER BY total_value DESC
      `;

      this.db.all(sql, [], (err, rows) => {
        if (err) return reject(err);
        resolve((rows || []).map(row => ({
          category_id: row.category_id,
          category_name: row.category_name,
          category_code: row.category_code,
          unique_items: row.unique_items || 0,
          total_line_items: row.total_line_items || 0,
          total_quantity: row.total_quantity || 0,
          total_value: parseFloat((row.total_value || 0).toFixed(2))
        })));
      });
    });
  }

  /**
   * Scan directory for duplicates before processing
   */
  async scanForDuplicates(pdfDir = './data/invoices') {
    return await this.duplicateSystem.scanDirectoryForDuplicates(pdfDir);
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
    }
    if (this.duplicateSystem) {
      this.duplicateSystem.close();
    }
  }
}

module.exports = EnterpriseInventoryManager;

// CLI usage
if (require.main === module) {
  const manager = new EnterpriseInventoryManager();

  (async () => {
    try {
      await manager.initialize();
      console.log('✅ Enterprise Inventory Manager initialized');
      console.log('📚 Ready for operations');
      manager.close();
    } catch (error) {
      console.error('❌ Error:', error);
      process.exit(1);
    }
  })();
}
