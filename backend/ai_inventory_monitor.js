#!/usr/bin/env node

/**
 * AI Inventory Monitoring Agent
 * Intelligent monitoring with min/max par levels, learning, and alerts
 */

const EnterpriseInventoryManager = require('./enterprise_inventory_manager');

class AIInventoryMonitor {
  constructor() {
    this.manager = null;
    this.alerts = [];
  }

  async initialize() {
    this.manager = new EnterpriseInventoryManager();
    await this.manager.initialize();

    // Create monitoring tables
    await this.createMonitoringTables();
  }

  async createMonitoringTables() {
    // Table: inventory_alerts
    await new Promise((resolve, reject) => {
      this.manager.db.run(`
        CREATE TABLE IF NOT EXISTS inventory_alerts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          alert_type TEXT NOT NULL,
          severity TEXT NOT NULL,
          item_code TEXT NOT NULL,
          location_code TEXT,
          current_quantity REAL,
          min_quantity REAL,
          max_quantity REAL,
          suggested_order_qty REAL,
          message TEXT,
          status TEXT DEFAULT 'ACTIVE',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          resolved_at TEXT,
          resolved_by TEXT
        )
      `, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // Table: usage_patterns - Learn from inventory movements
    await new Promise((resolve, reject) => {
      this.manager.db.run(`
        CREATE TABLE IF NOT EXISTS usage_patterns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_code TEXT NOT NULL,
          location_code TEXT,
          period_start TEXT NOT NULL,
          period_end TEXT NOT NULL,
          starting_qty REAL,
          ending_qty REAL,
          total_received REAL,
          total_used REAL,
          daily_avg_usage REAL,
          weekly_avg_usage REAL,
          trend TEXT,
          confidence_score REAL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // Table: par_level_recommendations
    await new Promise((resolve, reject) => {
      this.manager.db.run(`
        CREATE TABLE IF NOT EXISTS par_level_recommendations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_code TEXT NOT NULL,
          location_code TEXT,
          current_min REAL,
          current_max REAL,
          recommended_min REAL,
          recommended_max REAL,
          reason TEXT,
          confidence_score REAL,
          based_on_data_points INTEGER,
          status TEXT DEFAULT 'PENDING',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          applied_at TEXT,
          applied_by TEXT
        )
      `, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  /**
   * Monitor all items across all locations
   */
  async monitorInventory() {
    console.log('');
    console.log('🤖 AI INVENTORY MONITOR');
    console.log('='.repeat(80));
    console.log('');

    // Get all item-location combinations
    const itemLocations = await new Promise((resolve, reject) => {
      this.manager.db.all(`
        SELECT
          il.*,
          im.description,
          lm.location_name,
          lm.location_type
        FROM item_locations il
        LEFT JOIN item_master im ON il.item_code = im.item_code
        LEFT JOIN location_master lm ON il.location_code = lm.location_code
        WHERE lm.is_active = 1
        ORDER BY il.item_code, il.location_code
      `, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    console.log(`📊 Monitoring ${itemLocations.length} item-location combinations...`);
    console.log('');

    let lowStockCount = 0;
    let criticalCount = 0;
    let overstockCount = 0;
    let optimalCount = 0;

    for (const item of itemLocations) {
      const status = this.analyzeItemStatus(item);

      if (status.alert) {
        await this.createAlert(status);

        if (status.severity === 'CRITICAL') {
          criticalCount++;
        } else if (status.severity === 'WARNING') {
          lowStockCount++;
        } else if (status.severity === 'INFO') {
          overstockCount++;
        }
      } else {
        optimalCount++;
      }
    }

    console.log('📈 MONITORING SUMMARY');
    console.log('-'.repeat(80));
    console.log(`✅ Optimal Stock: ${optimalCount} items`);
    console.log(`⚠️  Low Stock: ${lowStockCount} items`);
    console.log(`🚨 Critical Stock: ${criticalCount} items`);
    console.log(`📦 Overstock: ${overstockCount} items`);
    console.log('');

    // Show critical and low stock items
    if (criticalCount > 0 || lowStockCount > 0) {
      await this.displayActiveAlerts();
    }

    return {
      optimal: optimalCount,
      lowStock: lowStockCount,
      critical: criticalCount,
      overstock: overstockCount
    };
  }

  /**
   * Analyze individual item status
   */
  analyzeItemStatus(item) {
    const qty = item.quantity_on_hand || 0;
    const min = item.min_quantity || 0;
    const max = item.max_quantity || 0;
    const reorder = item.reorder_point || min;

    let status = {
      item_code: item.item_code,
      location_code: item.location_code,
      current_qty: qty,
      alert: false,
      severity: null,
      type: null,
      message: null,
      suggested_order: 0
    };

    // Critical: Below reorder point
    if (qty <= reorder && reorder > 0) {
      status.alert = true;
      status.severity = 'CRITICAL';
      status.type = 'REORDER_REQUIRED';
      status.message = `${item.description || item.item_code} at ${item.location_name}: ${qty} cases (Reorder at: ${reorder})`;
      status.suggested_order = Math.ceil(max - qty);
    }
    // Warning: Below minimum
    else if (qty < min && min > 0) {
      status.alert = true;
      status.severity = 'WARNING';
      status.type = 'LOW_STOCK';
      status.message = `${item.description || item.item_code} at ${item.location_name}: ${qty} cases (Min: ${min})`;
      status.suggested_order = Math.ceil((min + max) / 2 - qty);
    }
    // Info: Above maximum (overstock)
    else if (qty > max && max > 0) {
      status.alert = true;
      status.severity = 'INFO';
      status.type = 'OVERSTOCK';
      status.message = `${item.description || item.item_code} at ${item.location_name}: ${qty} cases (Max: ${max})`;
      status.suggested_order = 0; // Consider moving to another location
    }

    return status;
  }

  /**
   * Create alert in database
   */
  async createAlert(status) {
    await new Promise((resolve, reject) => {
      this.manager.db.run(`
        INSERT INTO inventory_alerts
        (alert_type, severity, item_code, location_code, current_quantity,
         min_quantity, max_quantity, suggested_order_qty, message, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
      `, [
        status.type,
        status.severity,
        status.item_code,
        status.location_code,
        status.current_qty,
        status.min || 0,
        status.max || 0,
        status.suggested_order,
        status.message
      ], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  /**
   * Display active alerts
   */
  async displayActiveAlerts() {
    const alerts = await new Promise((resolve, reject) => {
      this.manager.db.all(`
        SELECT * FROM inventory_alerts
        WHERE status = 'ACTIVE'
        ORDER BY
          CASE severity
            WHEN 'CRITICAL' THEN 1
            WHEN 'WARNING' THEN 2
            WHEN 'INFO' THEN 3
          END,
          created_at DESC
        LIMIT 20
      `, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    if (alerts.length === 0) return;

    console.log('🚨 ACTIVE ALERTS');
    console.log('-'.repeat(80));

    alerts.forEach(alert => {
      const icon = alert.severity === 'CRITICAL' ? '🚨' : alert.severity === 'WARNING' ? '⚠️' : 'ℹ️';
      console.log(`${icon} ${alert.message}`);
      if (alert.suggested_order_qty > 0) {
        console.log(`   → Suggested Order: ${alert.suggested_order_qty} cases`);
      }
    });
    console.log('');
  }

  /**
   * Learn from inventory counts and adjust par levels
   */
  async learnFromCounts(previousCountDate, currentCountDate) {
    console.log('');
    console.log('🧠 LEARNING FROM INVENTORY COUNTS');
    console.log('='.repeat(80));
    console.log('');

    // Get items from both counts
    const previousCount = await this.getCountData(previousCountDate);
    const currentCount = await this.getCountData(currentCountDate);

    console.log(`📊 Analyzing ${previousCount.length} items from previous count`);
    console.log(`📊 Comparing with ${currentCount.length} items from current count`);
    console.log('');

    const recommendations = [];

    for (const prevItem of previousCount) {
      const currItem = currentCount.find(c => c.item_code === prevItem.item_code);

      if (!currItem) continue;

      const usage = prevItem.counted_quantity - currItem.counted_quantity;
      const daysBetween = this.daysBetween(previousCountDate, currentCountDate);
      const dailyUsage = usage / daysBetween;
      const weeklyUsage = dailyUsage * 7;

      // Calculate recommended par levels
      const recommendation = this.calculateRecommendedParLevels({
        item_code: prevItem.item_code,
        weeklyUsage: weeklyUsage,
        currentMin: prevItem.min_quantity || 0,
        currentMax: prevItem.max_quantity || 0,
        leadTimeDays: 3 // Default 3-day lead time
      });

      if (recommendation.shouldAdjust) {
        recommendations.push(recommendation);
        await this.saveParLevelRecommendation(recommendation);
      }
    }

    console.log(`💡 Generated ${recommendations.length} par level recommendations`);
    console.log('');

    if (recommendations.length > 0) {
      console.log('📋 TOP RECOMMENDATIONS:');
      console.log('-'.repeat(80));

      recommendations.slice(0, 10).forEach(rec => {
        console.log(`${rec.item_code}:`);
        console.log(`  Current: Min ${rec.current_min} / Max ${rec.current_max}`);
        console.log(`  Recommended: Min ${rec.recommended_min} / Max ${rec.recommended_max}`);
        console.log(`  Reason: ${rec.reason}`);
        console.log('');
      });
    }

    return recommendations;
  }

  /**
   * Calculate recommended par levels based on usage
   */
  calculateRecommendedParLevels(params) {
    const { item_code, weeklyUsage, currentMin, currentMax, leadTimeDays } = params;

    // Safety stock = 1 week of usage
    const safetyStock = Math.ceil(weeklyUsage);

    // Lead time stock = usage during lead time
    const leadTimeStock = Math.ceil((weeklyUsage / 7) * leadTimeDays);

    // Recommended min = safety stock + lead time stock
    const recommendedMin = safetyStock + leadTimeStock;

    // Recommended max = 2 weeks of usage
    const recommendedMax = Math.ceil(weeklyUsage * 2);

    // Check if adjustment needed (>20% difference)
    const minDiff = Math.abs(recommendedMin - currentMin) / Math.max(currentMin, 1);
    const maxDiff = Math.abs(recommendedMax - currentMax) / Math.max(currentMax, 1);
    const shouldAdjust = minDiff > 0.2 || maxDiff > 0.2;

    let reason = '';
    if (weeklyUsage > currentMax) {
      reason = 'Usage exceeds current max - increase par levels';
    } else if (weeklyUsage < currentMin / 2) {
      reason = 'Usage much lower than min - reduce par levels to avoid overstock';
    } else if (shouldAdjust) {
      reason = 'Optimize par levels based on actual usage patterns';
    }

    return {
      item_code,
      current_min: currentMin,
      current_max: currentMax,
      recommended_min: recommendedMin,
      recommended_max: recommendedMax,
      weekly_usage: weeklyUsage,
      safety_stock: safetyStock,
      shouldAdjust,
      reason,
      confidence: weeklyUsage > 0 ? 0.8 : 0.3
    };
  }

  async getCountData(countDate) {
    return new Promise((resolve, reject) => {
      this.manager.db.all(`
        SELECT * FROM inventory_count_items
        WHERE count_date = ?
      `, [countDate], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }

  async saveParLevelRecommendation(rec) {
    await new Promise((resolve, reject) => {
      this.manager.db.run(`
        INSERT INTO par_level_recommendations
        (item_code, current_min, current_max, recommended_min, recommended_max,
         reason, confidence_score, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `, [
        rec.item_code,
        rec.current_min,
        rec.current_max,
        rec.recommended_min,
        rec.recommended_max,
        rec.reason,
        rec.confidence
      ], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  daysBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffTime = Math.abs(d2 - d1);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  close() {
    if (this.manager) {
      this.manager.close();
    }
  }
}

// Run if called directly
if (require.main === module) {
  (async () => {
    const monitor = new AIInventoryMonitor();
    await monitor.initialize();

    try {
      await monitor.monitorInventory();
      monitor.close();
    } catch (err) {
      console.error('❌ Error:', err.message);
      monitor.close();
      process.exit(1);
    }
  })();
}

module.exports = AIInventoryMonitor;
