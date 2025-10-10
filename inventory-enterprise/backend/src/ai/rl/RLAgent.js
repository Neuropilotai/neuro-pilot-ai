/**
 * Reinforcement Learning Agent for Reorder Policy Optimization
 * Version: v2.2.0-2025-10-07
 *
 * Uses Q-Learning to tune reorder parameters (reorder_point, safety_stock, eoq_factor)
 * based on realized outcomes (stockouts, waste, service level, holding costs).
 */

const db = require('../../config/database');
const { logger } = require('../../config/logger');
const simulator = require('./simulator');
const metricsExporter = require('../../utils/metricsExporter');

class RLAgent {
  constructor() {
    this.config = {
      // Q-Learning parameters
      learningRate: parseFloat(process.env.RL_LEARNING_RATE || '0.1'),
      discountFactor: parseFloat(process.env.RL_DISCOUNT_FACTOR || '0.95'),
      explorationRate: parseFloat(process.env.RL_EXPLORATION_RATE || '0.1'),

      // Reward weights
      stockoutPenalty: parseFloat(process.env.RL_STOCKOUT_PENALTY || '100'),
      wastePenalty: parseFloat(process.env.RL_WASTE_PENALTY || '50'),
      serviceLevelBonus: parseFloat(process.env.RL_SERVICE_LEVEL_BONUS || '200'),
      holdingCostPenalty: parseFloat(process.env.RL_HOLDING_COST_PENALTY || '10'),

      // Policy improvement threshold
      improvementThreshold: parseFloat(process.env.RL_IMPROVEMENT_THRESHOLD || '5'), // 5%

      // Simulation days
      simulationDays: parseInt(process.env.RL_SIMULATION_DAYS || '90'),

      // State discretization buckets
      stockVarianceBuckets: [0, 10, 25, 50, 100],
      mapeBuckets: [0, 10, 15, 20, 30],
      leadTimeBuckets: [0, 3, 7, 14, 30]
    };

    // Q-table (state-action pairs)
    this.qTable = new Map();

    logger.info('[RLAgent] Initialized with config:', this.config);
  }

  /**
   * Tune policy for an item using RL
   * @param {string} itemCode - Item code
   * @param {Object} options - Options
   * @returns {Promise<Object>} Result
   */
  async tunePolicy(itemCode, options = {}) {
    const startTime = Date.now();
    logger.info(`[RLAgent] Starting policy tuning for ${itemCode}`);

    try {
      // 1. Get current policy
      const currentPolicy = await this.getCurrentPolicy(itemCode);
      if (!currentPolicy) {
        return {
          success: false,
          error: 'No existing policy found'
        };
      }

      // 2. Get historical data for simulation
      const historicalData = await this.getHistoricalData(itemCode);
      if (!historicalData || historicalData.length < 30) {
        return {
          success: false,
          error: 'Insufficient historical data (need 30+ days)'
        };
      }

      // 3. Discretize state
      const state = this.discretizeState(itemCode, historicalData);

      // 4. Get candidate actions (policy adjustments)
      const actions = this.getCandidateActions(currentPolicy);

      // 5. Evaluate each action via simulation
      const actionResults = [];
      for (const action of actions) {
        const candidatePolicy = this.applyAction(currentPolicy, action);
        const simResult = await simulator.simulate({
          itemCode,
          policy: candidatePolicy,
          historicalData,
          days: this.config.simulationDays
        });

        const reward = this.computeReward(simResult);

        actionResults.push({
          action,
          policy: candidatePolicy,
          simResult,
          reward
        });

        logger.debug(`[RLAgent] ${itemCode} - Action ${action.name}: reward=${reward.toFixed(2)}`);
      }

      // 6. Select best action
      const bestAction = actionResults.reduce((best, current) =>
        current.reward > best.reward ? current : best
      );

      // 7. Compute baseline reward with current policy
      const baselineSimResult = await simulator.simulate({
        itemCode,
        policy: currentPolicy,
        historicalData,
        days: this.config.simulationDays
      });
      const baselineReward = this.computeReward(baselineSimResult);

      // 8. Check if improvement exceeds threshold
      const improvementPercent = ((bestAction.reward - baselineReward) / Math.abs(baselineReward)) * 100;

      if (improvementPercent < this.config.improvementThreshold) {
        logger.info(`[RLAgent] ${itemCode}: No significant improvement (${improvementPercent.toFixed(2)}% < ${this.config.improvementThreshold}%), keeping current policy`);
        return {
          success: false,
          reason: 'No significant improvement',
          improvementPercent,
          baselineReward,
          bestReward: bestAction.reward
        };
      }

      // 9. Commit new policy
      await this.commitPolicy(itemCode, {
        policy: bestAction.policy,
        reward: bestAction.reward,
        reason: `RL improvement: +${improvementPercent.toFixed(2)}%`,
        simResult: bestAction.simResult
      });

      const duration = (Date.now() - startTime) / 1000;
      logger.info(`[RLAgent] ${itemCode}: Policy tuned successfully (+${improvementPercent.toFixed(2)}% improvement) in ${duration}s`);

      // Record metrics
      metricsExporter.recordRLPolicyCommit(itemCode, improvementPercent);
      metricsExporter.recordRLReward(itemCode, bestAction.reward);

      return {
        success: true,
        improvementPercent,
        baselineReward,
        newReward: bestAction.reward,
        policy: bestAction.policy,
        duration
      };
    } catch (error) {
      logger.error(`[RLAgent] Error tuning policy for ${itemCode}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get current policy for an item
   * @param {string} itemCode - Item code
   * @returns {Promise<Object|null>} Policy
   */
  async getCurrentPolicy(itemCode) {
    const query = `
      SELECT *
      FROM ai_policy
      WHERE item_code = ?
    `;

    const result = await db.query(query, [itemCode]);
    return result.rows && result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get historical data for simulation
   * @param {string} itemCode - Item code
   * @returns {Promise<Array>} Historical data
   */
  async getHistoricalData(itemCode) {
    const query = `
      SELECT
        date,
        actual as consumption,
        forecast
      FROM ai_feedback
      WHERE item_code = ?
        AND date >= DATE('now', '-90 days')
        AND actual IS NOT NULL
      ORDER BY date ASC
    `;

    const result = await db.query(query, [itemCode]);
    return result.rows || [];
  }

  /**
   * Discretize continuous state into buckets
   * @param {string} itemCode - Item code
   * @param {Array} historicalData - Historical data
   * @returns {Object} Discretized state
   */
  discretizeState(itemCode, historicalData) {
    // Compute stock variance
    const consumptions = historicalData.map(d => d.consumption);
    const mean = consumptions.reduce((a, b) => a + b, 0) / consumptions.length;
    const variance = consumptions.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / consumptions.length;
    const stockVariance = Math.sqrt(variance);

    // Compute recent MAPE
    const recentData = historicalData.slice(-14);
    const mapeValues = recentData
      .filter(d => d.forecast && d.consumption)
      .map(d => Math.abs((d.consumption - d.forecast) / d.consumption) * 100);
    const avgMape = mapeValues.length > 0 ? mapeValues.reduce((a, b) => a + b, 0) / mapeValues.length : 15;

    // Assume lead time (would come from item_master in production)
    const leadTime = 7;

    // Discretize
    const stockVarianceBucket = this.discretize(stockVariance, this.config.stockVarianceBuckets);
    const mapeBucket = this.discretize(avgMape, this.config.mapeBuckets);
    const leadTimeBucket = this.discretize(leadTime, this.config.leadTimeBuckets);

    return {
      stockVarianceBucket,
      mapeBucket,
      leadTimeBucket,
      raw: { stockVariance, avgMape, leadTime }
    };
  }

  /**
   * Discretize value into bucket
   * @param {number} value - Value
   * @param {Array} buckets - Bucket thresholds
   * @returns {number} Bucket index
   */
  discretize(value, buckets) {
    for (let i = 0; i < buckets.length - 1; i++) {
      if (value >= buckets[i] && value < buckets[i + 1]) {
        return i;
      }
    }
    return buckets.length - 1;
  }

  /**
   * Get candidate actions (policy adjustments)
   * @param {Object} currentPolicy - Current policy
   * @returns {Array} Actions
   */
  getCandidateActions(currentPolicy) {
    const actions = [
      // No change (baseline)
      {
        name: 'no_change',
        reorderPointDelta: 0,
        safetyStockDelta: 0,
        eoqFactorDelta: 0
      },
      // Increase reorder point
      {
        name: 'increase_reorder_point',
        reorderPointDelta: 0.1,
        safetyStockDelta: 0,
        eoqFactorDelta: 0
      },
      // Decrease reorder point
      {
        name: 'decrease_reorder_point',
        reorderPointDelta: -0.1,
        safetyStockDelta: 0,
        eoqFactorDelta: 0
      },
      // Increase safety stock
      {
        name: 'increase_safety_stock',
        reorderPointDelta: 0,
        safetyStockDelta: 0.15,
        eoqFactorDelta: 0
      },
      // Decrease safety stock
      {
        name: 'decrease_safety_stock',
        reorderPointDelta: 0,
        safetyStockDelta: -0.15,
        eoqFactorDelta: 0
      },
      // Increase EOQ factor
      {
        name: 'increase_eoq_factor',
        reorderPointDelta: 0,
        safetyStockDelta: 0,
        eoqFactorDelta: 0.1
      },
      // Decrease EOQ factor
      {
        name: 'decrease_eoq_factor',
        reorderPointDelta: 0,
        safetyStockDelta: 0,
        eoqFactorDelta: -0.1
      },
      // Combined: increase both reorder point and safety stock
      {
        name: 'increase_both',
        reorderPointDelta: 0.1,
        safetyStockDelta: 0.1,
        eoqFactorDelta: 0
      },
      // Combined: decrease both reorder point and safety stock
      {
        name: 'decrease_both',
        reorderPointDelta: -0.1,
        safetyStockDelta: -0.1,
        eoqFactorDelta: 0
      }
    ];

    return actions;
  }

  /**
   * Apply action to policy
   * @param {Object} currentPolicy - Current policy
   * @param {Object} action - Action
   * @returns {Object} New policy
   */
  applyAction(currentPolicy, action) {
    return {
      reorder_point: Math.max(0, currentPolicy.reorder_point * (1 + action.reorderPointDelta)),
      safety_stock: Math.max(0, currentPolicy.safety_stock * (1 + action.safetyStockDelta)),
      eoq_factor: Math.max(0.1, currentPolicy.eoq_factor * (1 + action.eoqFactorDelta))
    };
  }

  /**
   * Compute reward from simulation results
   * @param {Object} simResult - Simulation result
   * @returns {number} Reward
   */
  computeReward(simResult) {
    const {
      stockouts = 0,
      waste = 0,
      serviceLevel = 0,
      avgHoldingCost = 0
    } = simResult;

    // Reward function:
    // R = -stockout_penalty * stockouts - waste_penalty * waste + service_level_bonus * service_level - holding_cost_penalty * holding_cost
    const reward =
      -this.config.stockoutPenalty * stockouts
      - this.config.wastePenalty * waste
      + this.config.serviceLevelBonus * (serviceLevel / 100)
      - this.config.holdingCostPenalty * avgHoldingCost;

    return reward;
  }

  /**
   * Commit new policy to database
   * @param {string} itemCode - Item code
   * @param {Object} data - {policy, reward, reason, simResult}
   */
  async commitPolicy(itemCode, data) {
    const { policy, reward, reason, simResult } = data;

    // Update current policy
    const updateQuery = `
      UPDATE ai_policy
      SET reorder_point = ?,
          safety_stock = ?,
          eoq_factor = ?,
          policy_version = policy_version + 1,
          updated_at = CURRENT_TIMESTAMP,
          updated_by = 'rl_agent'
      WHERE item_code = ?
    `;

    await db.query(updateQuery, [
      policy.reorder_point,
      policy.safety_stock,
      policy.eoq_factor,
      itemCode
    ]);

    // Get new policy version
    const policyResult = await db.query('SELECT policy_version FROM ai_policy WHERE item_code = ?', [itemCode]);
    const policyVersion = policyResult.rows[0].policy_version;

    // Insert into history
    const historyQuery = `
      INSERT INTO ai_policy_history (item_code, reorder_point, safety_stock, eoq_factor, policy_version, reward, reason, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'rl_agent')
    `;

    await db.query(historyQuery, [
      itemCode,
      policy.reorder_point,
      policy.safety_stock,
      policy.eoq_factor,
      policyVersion,
      reward,
      reason
    ]);

    logger.info(`[RLAgent] Committed policy for ${itemCode}: RP=${policy.reorder_point.toFixed(2)}, SS=${policy.safety_stock.toFixed(2)}, EOQ=${policy.eoq_factor.toFixed(2)}`);
  }

  /**
   * Get policy for an item
   * @param {string} itemCode - Item code
   * @returns {Promise<Object|null>} Policy
   */
  async getPolicy(itemCode) {
    const query = `
      SELECT *
      FROM ai_policy
      WHERE item_code = ?
    `;

    const result = await db.query(query, [itemCode]);
    return result.rows && result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get policy history for an item
   * @param {string} itemCode - Item code
   * @param {number} limit - Limit
   * @returns {Promise<Array>} History
   */
  async getPolicyHistory(itemCode, limit = 10) {
    const query = `
      SELECT *
      FROM ai_policy_history
      WHERE item_code = ?
      ORDER BY ts DESC
      LIMIT ?
    `;

    const result = await db.query(query, [itemCode, limit]);
    return result.rows || [];
  }
}

module.exports = new RLAgent();
