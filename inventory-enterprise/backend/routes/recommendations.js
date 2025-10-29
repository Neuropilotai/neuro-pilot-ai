/**
 * Reorder Recommendations API
 * Generates recommendations based on forecasts + ABC policy
 */

const express = require('express');
const router = express.Router();
const db = require('../database');

/**
 * POST /api/forecast/recommendations/generate
 * Generate reorder recommendations based on latest forecasts
 */
router.post('/generate', async (req, res) => {
  try {
    const {
      serviceLevelA = 0.99,
      serviceLevelB = 0.95,
      serviceLevelC = 0.90
    } = req.body;

    // Get z-scores from service levels
    const zScores = {
      A: 2.33, // 99%
      B: 1.65, // 95%
      C: 1.28  // 90%
    };

    // Get all items with recent forecasts
    const items = await db.all(`
      SELECT
        i.id as item_id,
        i.name,
        i.sku,
        i.current_stock,
        i.lead_time_days,
        f.mean_forecast,
        f.p05_forecast,
        f.p95_forecast,
        f.mape
      FROM inventory_items i
      INNER JOIN forecasts f ON i.id = f.item_id
      WHERE f.forecast_date = date('now')
        AND i.is_active = 1
    `);

    // Classify items into ABC
    const classified = await classifyABC(items);

    const recommendations = [];

    for (const item of classified) {
      const {
        item_id,
        name,
        sku,
        current_stock,
        lead_time_days,
        mean_forecast,
        abc_class
      } = item;

      // Daily demand
      const daily_demand = mean_forecast / 28; // 28-day forecast

      // Safety stock calculation
      // σ_LT = √(L × σ_d²)
      // Estimate σ_d from forecast interval width
      const forecast_std = (item.p95_forecast - item.p05_forecast) / (2 * 1.65) / Math.sqrt(28);

      const z = zScores[abc_class];
      const sigma_lt = Math.sqrt(lead_time_days * forecast_std ** 2);
      const safety_stock = z * sigma_lt;

      // Reorder point
      const reorder_point = (daily_demand * lead_time_days) + safety_stock;

      // Should reorder?
      const should_reorder = current_stock < reorder_point;

      if (should_reorder) {
        // Calculate recommended quantity
        const target_stock = mean_forecast + safety_stock; // 28 days + SS
        const rec_qty = Math.max(target_stock - current_stock, 0);

        // Round up to nearest integer
        const rec_qty_rounded = Math.ceil(rec_qty);

        const reason = `Below ROP: ${current_stock.toFixed(1)} < ${reorder_point.toFixed(1)}`;

        // Store recommendation
        await db.run(`
          INSERT INTO reorder_recommendations
          (item_id, recommendation_date, rec_qty, reason, policy, status)
          VALUES (?, date('now'), ?, ?, ?, 'pending')
          ON CONFLICT (item_id, recommendation_date) DO UPDATE SET
            rec_qty = excluded.rec_qty,
            reason = excluded.reason,
            policy = excluded.policy
        `, [item_id, rec_qty_rounded, reason, abc_class]);

        recommendations.push({
          item_id,
          name,
          sku,
          abc_class,
          current_stock,
          reorder_point: reorder_point.toFixed(2),
          rec_qty: rec_qty_rounded,
          reason
        });
      }
    }

    // Sort by ABC priority
    recommendations.sort((a, b) => {
      const priority = { A: 1, B: 2, C: 3 };
      return priority[a.abc_class] - priority[b.abc_class];
    });

    res.json({
      success: true,
      count: recommendations.length,
      sample: recommendations.slice(0, 10),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[recommendations] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/forecast/recommendations
 * Get all pending recommendations
 */
router.get('/', async (req, res) => {
  try {
    const { status = 'pending', policy } = req.query;

    let query = `
      SELECT
        r.id,
        r.item_id,
        i.name,
        i.sku,
        r.rec_qty,
        r.reason,
        r.policy as abc_class,
        r.status,
        r.recommendation_date,
        r.created_at
      FROM reorder_recommendations r
      INNER JOIN inventory_items i ON r.item_id = i.id
      WHERE r.status = ?
    `;

    const params = [status];

    if (policy) {
      query += ' AND r.policy = ?';
      params.push(policy);
    }

    query += ' ORDER BY r.policy ASC, r.recommendation_date DESC';

    const recommendations = await db.all(query, params);

    res.json({
      success: true,
      count: recommendations.length,
      recommendations
    });

  } catch (error) {
    console.error('[recommendations] Error fetching:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/forecast/recommendations/:id/approve
 * Approve a recommendation and create PO
 */
router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { approved_qty, notes } = req.body;
    const user_id = req.user?.id || 1; // From JWT

    // Get recommendation
    const rec = await db.get('SELECT * FROM reorder_recommendations WHERE id = ?', [id]);

    if (!rec) {
      return res.status(404).json({ error: 'Recommendation not found' });
    }

    const quantity = approved_qty || rec.rec_qty;

    // Update recommendation status
    await db.run(`
      UPDATE reorder_recommendations
      SET status = 'approved',
          approved_by = ?,
          approved_at = datetime('now')
      WHERE id = ?
    `, [user_id, id]);

    // TODO: Create purchase order in your PO system
    // await createPurchaseOrder(rec.item_id, quantity);

    res.json({
      success: true,
      recommendation_id: id,
      approved_qty: quantity,
      status: 'approved'
    });

  } catch (error) {
    console.error('[recommendations] Error approving:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ABC Classification Helper
 * Classifies items based on cumulative consumption value
 */
async function classifyABC(items) {
  // Calculate annual consumption value (forecast * unit_cost)
  const itemsWithValue = await Promise.all(
    items.map(async (item) => {
      const unitCost = await db.get(
        'SELECT unit_cost FROM inventory_items WHERE id = ?',
        [item.item_id]
      );

      return {
        ...item,
        unit_cost: unitCost?.unit_cost || 1,
        annual_value: item.mean_forecast * 13 * (unitCost?.unit_cost || 1) // 13 periods per year
      };
    })
  );

  // Sort by value descending
  itemsWithValue.sort((a, b) => b.annual_value - a.annual_value);

  // Calculate cumulative percentage
  const total_value = itemsWithValue.reduce((sum, item) => sum + item.annual_value, 0);
  let cumulative = 0;

  return itemsWithValue.map(item => {
    cumulative += item.annual_value;
    const cumulative_pct = cumulative / total_value;

    let abc_class;
    if (cumulative_pct <= 0.80) {
      abc_class = 'A';
    } else if (cumulative_pct <= 0.95) {
      abc_class = 'B';
    } else {
      abc_class = 'C';
    }

    return { ...item, abc_class };
  });
}

module.exports = router;
