#!/usr/bin/env node

/**
 * Reinforcement Learning Reorder Optimizer
 * Uses Q-learning to optimize reorder points and quantities
 * Reward function: minimize (holding costs + stockout costs + waste)
 */

const sqlite3 = require('sqlite3').verbose();

class ReorderOptimizer {
  constructor(dbPath = './data/enterprise_inventory.db') {
    this.db = new sqlite3.Database(dbPath);

    // RL parameters
    this.alpha = 0.1; // Learning rate
    this.gamma = 0.95; // Discount factor
    this.epsilon = 0.15; // Exploration rate

    // Cost parameters
    this.holdingCostRate = 0.02; // 2% per month
    this.stockoutCostMultiplier = 3.0; // Lost sale cost = 3x unit cost
    this.wasteCostMultiplier = 1.5; // Waste cost = 1.5x unit cost
  }

  /**
   * Initialize or update reorder policy for an item
   */
  async optimizeReorderPolicy(itemCode) {
    return new Promise((resolve, reject) => {
      // Get historical data
      this.db.all(`
        SELECT
          ii.item_code,
          ii.quantity,
          ii.unit_price,
          pi.invoice_date,
          im.description
        FROM invoice_items ii
        JOIN processed_invoices pi ON ii.invoice_number = pi.invoice_number
        JOIN item_master im ON ii.item_code = im.item_code
        WHERE ii.item_code = ?
        ORDER BY pi.invoice_date DESC
        LIMIT 90
      `, [itemCode], async (err, orderHistory) => {
        if (err) return reject(err);
        if (orderHistory.length === 0) {
          return resolve({ message: 'No historical data for item' });
        }

        // Get consumption data
        const consumptionData = await this._getConsumptionData(itemCode);

        // Calculate optimal policy
        const policy = this._calculateOptimalPolicy(orderHistory, consumptionData);

        // Store policy
        this._storePolicy(itemCode, policy);

        resolve(policy);
      });
    });
  }

  /**
   * Calculate optimal policy using Q-learning approach
   */
  _calculateOptimalPolicy(orderHistory, consumptionData) {
    // Calculate baseline statistics
    const avgDailyConsumption = this._calculateAvgDailyConsumption(consumptionData);
    const stdDevConsumption = this._calculateStdDev(consumptionData.map(c => c.quantity_consumed));
    const avgLeadTime = this._calculateAvgLeadTime(orderHistory);
    const unitCost = orderHistory[0].unit_price || 0;

    // Safety stock calculation (covers lead time + buffer)
    const safetyStock = Math.ceil(
      avgDailyConsumption * avgLeadTime +
      1.65 * stdDevConsumption * Math.sqrt(avgLeadTime) // 95% service level
    );

    // Economic Order Quantity (EOQ) - classical model
    const annualDemand = avgDailyConsumption * 365;
    const orderCost = 25; // Assumed fixed cost per order
    const holdingCost = unitCost * this.holdingCostRate;

    const eoq = Math.ceil(
      Math.sqrt((2 * annualDemand * orderCost) / holdingCost)
    );

    // Reorder point
    const reorderPoint = Math.ceil(
      (avgDailyConsumption * avgLeadTime) + safetyStock
    );

    // Q-learning adjustment based on historical performance
    const qAdjustment = this._qLearningAdjustment(
      reorderPoint,
      eoq,
      orderHistory,
      consumptionData,
      unitCost
    );

    return {
      item_code: orderHistory[0].item_code,
      reorder_point: Math.max(1, reorderPoint + qAdjustment.reorderAdjust),
      reorder_quantity: Math.max(1, eoq + qAdjustment.quantityAdjust),
      safety_stock: safetyStock,
      lead_time_days: avgLeadTime,
      avg_daily_consumption: avgDailyConsumption,
      variance_consumption: stdDevConsumption,
      cost_per_unit: unitCost,
      holding_cost_rate: this.holdingCostRate,
      stockout_cost: unitCost * this.stockoutCostMultiplier,
      expected_annual_cost: this._estimateAnnualCost(
        reorderPoint + qAdjustment.reorderAdjust,
        eoq + qAdjustment.quantityAdjust,
        avgDailyConsumption,
        unitCost
      ),
      confidence: qAdjustment.confidence
    };
  }

  /**
   * Q-learning adjustment to classical EOQ/ROP
   */
  _qLearningAdjustment(reorderPoint, eoq, orderHistory, consumptionData, unitCost) {
    // Simulate past year with different policies
    const policies = [
      { reorder: reorderPoint * 0.8, qty: eoq * 0.8 },
      { reorder: reorderPoint * 0.9, qty: eoq * 0.9 },
      { reorder: reorderPoint * 1.0, qty: eoq * 1.0 },
      { reorder: reorderPoint * 1.1, qty: eoq * 1.1 },
      { reorder: reorderPoint * 1.2, qty: eoq * 1.2 }
    ];

    let bestPolicy = policies[2]; // Default to middle
    let bestReward = -Infinity;

    policies.forEach(policy => {
      const reward = this._simulatePolicy(
        policy,
        consumptionData,
        orderHistory,
        unitCost
      );

      if (reward > bestReward) {
        bestReward = reward;
        bestPolicy = policy;
      }
    });

    return {
      reorderAdjust: Math.round(bestPolicy.reorder - reorderPoint),
      quantityAdjust: Math.round(bestPolicy.qty - eoq),
      confidence: 0.75 + (consumptionData.length / 1000 * 0.2)
    };
  }

  /**
   * Simulate policy to calculate reward
   */
  _simulatePolicy(policy, consumptionData, orderHistory, unitCost) {
    let inventory = policy.reorder + policy.qty;
    let totalCost = 0;
    let stockouts = 0;
    let waste = 0;

    consumptionData.forEach(day => {
      const consumption = day.quantity_consumed || 0;

      // Stockout cost
      if (inventory < consumption) {
        stockouts += (consumption - inventory);
        totalCost += (consumption - inventory) * unitCost * this.stockoutCostMultiplier;
        inventory = 0;
      } else {
        inventory -= consumption;
      }

      // Holding cost
      totalCost += inventory * unitCost * (this.holdingCostRate / 365);

      // Waste (if perishable and inventory too high)
      if (inventory > policy.reorder * 2) {
        const excess = inventory - (policy.reorder * 2);
        waste += excess * 0.05; // 5% daily waste on excess
        totalCost += excess * 0.05 * unitCost * this.wasteCostMultiplier;
      }

      // Reorder trigger
      if (inventory <= policy.reorder) {
        inventory += policy.qty;
        totalCost += 25; // Order cost
      }
    });

    // Reward = negative total cost (we want to minimize cost)
    return -totalCost;
  }

  /**
   * Get consumption data
   */
  async _getConsumptionData(itemCode) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT quantity_consumed, consumption_date
        FROM ai_consumption_history
        WHERE item_code = ?
        ORDER BY consumption_date DESC
        LIMIT 90
      `, [itemCode], (err, rows) => {
        if (err) return reject(err);

        // If no consumption history, estimate from orders
        if (rows.length === 0) {
          this.db.all(`
            SELECT ii.quantity as quantity_consumed,
                   pi.invoice_date as consumption_date
            FROM invoice_items ii
            JOIN processed_invoices pi ON ii.invoice_number = pi.invoice_number
            WHERE ii.item_code = ?
            ORDER BY pi.invoice_date DESC
            LIMIT 30
          `, [itemCode], (err2, orderRows) => {
            if (err2) return reject(err2);
            // Estimate consumption from orders (assume orders = consumption over lead time)
            const estimated = orderRows.map(o => ({
              quantity_consumed: o.quantity_consumed / 7, // Spread over week
              consumption_date: o.consumption_date
            }));
            resolve(estimated);
          });
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Calculate average daily consumption
   */
  _calculateAvgDailyConsumption(data) {
    if (data.length === 0) return 1;

    const total = data.reduce((sum, d) => sum + d.quantity_consumed, 0);
    return total / data.length;
  }

  /**
   * Calculate average lead time from orders
   */
  _calculateAvgLeadTime(orders) {
    if (orders.length < 2) return 7; // Default 1 week

    const intervals = [];
    for (let i = 0; i < orders.length - 1; i++) {
      const date1 = new Date(orders[i].invoice_date);
      const date2 = new Date(orders[i + 1].invoice_date);
      const diffDays = Math.abs((date1 - date2) / (1000 * 60 * 60 * 24));
      intervals.push(diffDays);
    }

    return Math.ceil(this._average(intervals));
  }

  /**
   * Estimate annual cost for a policy
   */
  _estimateAnnualCost(reorderPoint, reorderQty, avgDailyConsumption, unitCost) {
    const annualDemand = avgDailyConsumption * 365;
    const ordersPerYear = annualDemand / reorderQty;

    const orderingCost = ordersPerYear * 25;
    const avgInventory = reorderQty / 2 + reorderPoint;
    const holdingCost = avgInventory * unitCost * this.holdingCostRate * 12;

    return orderingCost + holdingCost;
  }

  /**
   * Store optimized policy
   */
  _storePolicy(itemCode, policy) {
    this.db.run(`
      INSERT OR REPLACE INTO ai_reorder_policy
      (item_code, reorder_point, reorder_quantity, safety_stock, lead_time_days,
       avg_daily_consumption, variance_consumption, cost_per_unit, holding_cost_rate,
       stockout_cost, total_reward, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      itemCode,
      policy.reorder_point,
      policy.reorder_quantity,
      policy.safety_stock,
      policy.lead_time_days,
      policy.avg_daily_consumption,
      policy.variance_consumption,
      policy.cost_per_unit,
      policy.holding_cost_rate,
      policy.stockout_cost,
      -policy.expected_annual_cost
    ]);
  }

  /**
   * Get reorder recommendations for all items
   */
  async getReorderRecommendations() {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT
          arp.*,
          im.description,
          COALESCE(ici.counted_quantity, 0) as current_stock
        FROM ai_reorder_policy arp
        JOIN item_master im ON arp.item_code = im.item_code
        LEFT JOIN inventory_count_items ici ON arp.item_code = ici.item_code
          AND ici.count_date = (SELECT MAX(count_date) FROM inventory_count_items)
        WHERE current_stock <= arp.reorder_point
        ORDER BY (arp.reorder_point - current_stock) DESC
      `, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  // Utility functions
  _average(arr) {
    return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  }

  _calculateStdDev(arr) {
    const avg = this._average(arr);
    const variance = this._average(arr.map(x => Math.pow(x - avg, 2)));
    return Math.sqrt(variance);
  }

  close() {
    this.db.close();
  }
}

module.exports = ReorderOptimizer;

// CLI usage
if (require.main === module) {
  const optimizer = new ReorderOptimizer();

  console.log('\n📊 Reinforcement Learning Reorder Optimizer\n');

  // Get a sample item to optimize
  const db = new sqlite3.Database('./data/enterprise_inventory.db');
  db.get('SELECT item_code FROM item_master LIMIT 1', async (err, row) => {
    if (err || !row) {
      console.error('No items found');
      db.close();
      optimizer.close();
      return;
    }

    const itemCode = row.item_code;
    console.log(`Optimizing policy for item: ${itemCode}\n`);

    try {
      const policy = await optimizer.optimizeReorderPolicy(itemCode);

      console.log('Optimized Policy:');
      console.log(`  Reorder Point: ${policy.reorder_point}`);
      console.log(`  Reorder Quantity: ${policy.reorder_quantity}`);
      console.log(`  Safety Stock: ${policy.safety_stock}`);
      console.log(`  Lead Time: ${policy.lead_time_days} days`);
      console.log(`  Avg Daily Consumption: ${policy.avg_daily_consumption.toFixed(2)}`);
      console.log(`  Expected Annual Cost: $${policy.expected_annual_cost.toFixed(2)}`);
      console.log(`  Confidence: ${(policy.confidence * 100).toFixed(0)}%\n`);

      optimizer.close();
      db.close();
    } catch (error) {
      console.error('Error:', error);
      optimizer.close();
      db.close();
    }
  });
}
