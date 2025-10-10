/**
 * Consumption Derivation Pipeline
 * Derives daily consumption data from inventory snapshots and invoice orders
 * Stores results in ai_consumption_derived table for ML training
 */

const logger = require('../../config/logger');

class ConsumptionDerivation {
  constructor(db) {
    this.db = db;
  }

  /**
   * Derive consumption for all items over a date range
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<object>} - Derivation results
   */
  async deriveConsumption(startDate, endDate) {
    try {
      logger.info('Starting consumption derivation', { startDate, endDate });

      const items = await this.getAllItems();
      let totalDerived = 0;
      let errors = 0;

      for (const item of items) {
        try {
          const result = await this.deriveItemConsumption(
            item.item_code,
            startDate,
            endDate
          );
          totalDerived += result.count;
        } catch (err) {
          logger.error('Failed to derive consumption for item', {
            itemCode: item.item_code,
            error: err.message
          });
          errors++;
        }
      }

      logger.info('Consumption derivation complete', {
        totalDerived,
        errors,
        itemCount: items.length
      });

      return {
        success: true,
        items_processed: items.length,
        records_derived: totalDerived,
        errors: errors
      };

    } catch (error) {
      logger.error('Consumption derivation failed', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Derive consumption for a specific item
   * @param {string} itemCode - Item code
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @returns {Promise<object>} - Derivation result
   */
  async deriveItemConsumption(itemCode, startDate, endDate) {
    // Get all snapshots for this item in date range
    const snapshots = await this.getInventorySnapshots(itemCode, startDate, endDate);

    // Get all orders (receipts) for this item in date range
    const orders = await this.getInvoiceOrders(itemCode, startDate, endDate);

    const consumptionRecords = [];

    // Sort snapshots by date
    snapshots.sort((a, b) => new Date(a.snapshot_date) - new Date(b.snapshot_date));

    for (let i = 1; i < snapshots.length; i++) {
      const prevSnapshot = snapshots[i - 1];
      const currSnapshot = snapshots[i];

      const date = currSnapshot.snapshot_date;
      const prevQty = prevSnapshot.total_quantity || 0;
      const currQty = currSnapshot.total_quantity || 0;

      // Calculate orders received between snapshots
      const ordersReceived = orders
        .filter(o => {
          const orderDate = o.invoice_date || o.created_at;
          return orderDate > prevSnapshot.snapshot_date && orderDate <= currSnapshot.snapshot_date;
        })
        .reduce((sum, o) => sum + (o.quantity || 0), 0);

      // Consumption = (Previous Inventory + Orders Received) - Current Inventory
      const consumption = prevQty + ordersReceived - currQty;

      // Only record positive consumption (negative = likely data error or restock)
      if (consumption > 0) {
        const avgUnitCost = this.calculateAvgCost(orders, prevSnapshot, currSnapshot);

        consumptionRecords.push({
          item_code: itemCode,
          location_id: null, // Could be enhanced with location tracking
          date: date,
          consumption_qty: consumption,
          consumption_method: 'fifo',
          unit_cost: avgUnitCost,
          total_cost: consumption * avgUnitCost,
          confidence_score: this.calculateConfidence(prevSnapshot, currSnapshot, ordersReceived),
          data_sources: JSON.stringify({
            prev_snapshot_id: prevSnapshot.snapshot_id,
            curr_snapshot_id: currSnapshot.snapshot_id,
            orders_count: orders.filter(o => {
              const orderDate = o.invoice_date || o.created_at;
              return orderDate > prevSnapshot.snapshot_date && orderDate <= currSnapshot.snapshot_date;
            }).length
          })
        });
      }
    }

    // Insert consumption records into database
    if (consumptionRecords.length > 0) {
      await this.storeConsumptionRecords(consumptionRecords);
    }

    return {
      success: true,
      item_code: itemCode,
      count: consumptionRecords.length
    };
  }

  /**
   * Get all unique items from inventory
   */
  async getAllItems() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT DISTINCT item_code, item_name
        FROM item_master
        WHERE active = 1
        ORDER BY item_code
      `;
      this.db.all(query, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  /**
   * Get inventory snapshots for item
   */
  async getInventorySnapshots(itemCode, startDate, endDate) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT
          snapshot_id,
          snapshot_date,
          SUM(quantity) as total_quantity
        FROM inventory_snapshots
        WHERE item_code = ? AND snapshot_date BETWEEN ? AND ?
        GROUP BY snapshot_id, snapshot_date
        ORDER BY snapshot_date ASC
      `;
      this.db.all(query, [itemCode, startDate, endDate], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  /**
   * Get invoice orders (receipts) for item
   */
  async getInvoiceOrders(itemCode, startDate, endDate) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT
          invoice_id,
          invoice_date,
          quantity,
          unit_price,
          created_at
        FROM invoice_items
        WHERE item_code = ? AND (invoice_date BETWEEN ? AND ? OR created_at BETWEEN ? AND ?)
        ORDER BY COALESCE(invoice_date, created_at) ASC
      `;
      this.db.all(query, [itemCode, startDate, endDate, startDate, endDate], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  /**
   * Calculate average unit cost from recent orders and snapshots
   */
  calculateAvgCost(orders, prevSnapshot, currSnapshot) {
    // Get unit costs from orders
    const orderCosts = orders
      .filter(o => o.unit_price && o.unit_price > 0)
      .map(o => o.unit_price);

    if (orderCosts.length > 0) {
      return orderCosts.reduce((sum, cost) => sum + cost, 0) / orderCosts.length;
    }

    // Fallback: use snapshot costs if available
    const snapshotCost = currSnapshot.avg_unit_cost || prevSnapshot.avg_unit_cost;
    return snapshotCost || 0;
  }

  /**
   * Calculate confidence score for consumption derivation
   * @returns {number} - Confidence between 0 and 1
   */
  calculateConfidence(prevSnapshot, currSnapshot, ordersReceived) {
    let confidence = 1.0;

    // Reduce confidence if no orders received (might be missing data)
    if (ordersReceived === 0 && currSnapshot.total_quantity > prevSnapshot.total_quantity) {
      confidence *= 0.7; // Inventory increased without orders = lower confidence
    }

    // Reduce confidence if large inventory jumps (possible data error)
    const inventoryChange = Math.abs(currSnapshot.total_quantity - prevSnapshot.total_quantity);
    const avgInventory = (currSnapshot.total_quantity + prevSnapshot.total_quantity) / 2;
    if (avgInventory > 0 && inventoryChange / avgInventory > 2.0) {
      confidence *= 0.5; // >200% change = suspicious
    }

    // Reduce confidence if snapshots are far apart
    const daysBetween = (new Date(currSnapshot.snapshot_date) - new Date(prevSnapshot.snapshot_date)) / (1000 * 60 * 60 * 24);
    if (daysBetween > 7) {
      confidence *= Math.max(0.3, 1 - (daysBetween - 7) / 30); // Decay after 7 days
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Store consumption records in database
   */
  async storeConsumptionRecords(records) {
    const query = `
      INSERT OR REPLACE INTO ai_consumption_derived (
        item_code, location_id, date, consumption_qty, consumption_method,
        unit_cost, total_cost, confidence_score, data_sources
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const stmt = this.db.prepare(query);

    for (const record of records) {
      await new Promise((resolve, reject) => {
        stmt.run([
          record.item_code,
          record.location_id,
          record.date,
          record.consumption_qty,
          record.consumption_method,
          record.unit_cost,
          record.total_cost,
          record.confidence_score,
          record.data_sources
        ], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    stmt.finalize();
  }

  /**
   * Run anomaly detection on consumption data
   * Uses simple statistical method (IQR-based outlier detection)
   * @returns {Promise<object>} - Anomaly detection results
   */
  async detectAnomalies() {
    try {
      logger.info('Running anomaly detection on consumption data');

      const items = await this.getAllItems();
      let anomaliesDetected = 0;

      for (const item of items) {
        // Get consumption history for item
        const consumptionData = await new Promise((resolve, reject) => {
          const query = `
            SELECT consumption_id, consumption_qty
            FROM ai_consumption_derived
            WHERE item_code = ?
            ORDER BY date ASC
          `;
          this.db.all(query, [item.item_code], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          });
        });

        if (consumptionData.length < 10) {
          continue; // Need at least 10 data points
        }

        // Calculate quartiles
        const quantities = consumptionData.map(d => d.consumption_qty).sort((a, b) => a - b);
        const q1 = quantities[Math.floor(quantities.length * 0.25)];
        const q3 = quantities[Math.floor(quantities.length * 0.75)];
        const iqr = q3 - q1;
        const lowerBound = q1 - 1.5 * iqr;
        const upperBound = q3 + 1.5 * iqr;

        // Mark anomalies
        for (const record of consumptionData) {
          if (record.consumption_qty < lowerBound || record.consumption_qty > upperBound) {
            const anomalyScore = Math.abs(record.consumption_qty - q1) / iqr;

            await new Promise((resolve, reject) => {
              this.db.run(
                `UPDATE ai_consumption_derived SET is_anomaly = 1, anomaly_score = ? WHERE consumption_id = ?`,
                [anomalyScore, record.consumption_id],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });

            anomaliesDetected++;
          }
        }
      }

      logger.info('Anomaly detection complete', { anomaliesDetected });

      return {
        success: true,
        anomalies_detected: anomaliesDetected
      };

    } catch (error) {
      logger.error('Anomaly detection failed', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = ConsumptionDerivation;
