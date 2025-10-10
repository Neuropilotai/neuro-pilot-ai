/**
 * OwnerAIAgent - AI Agent that proposes system improvements
 * Analyzes metrics, proposes changes, runs sandbox evals
 * NEVER self-promotes to production - requires Owner Console approval
 */

const crypto = require('crypto');
const db = require('../../config/database');
const logger = require('../../config/logger');

class OwnerAIAgent {
  constructor() {
    this.analysisInterval = null;
    this.proposalThresholds = {
      min_mape_improvement: 5.0,  // 5% MAPE improvement to propose
      min_cache_hit_improvement: 10.0,  // 10% cache hit rate improvement
      max_risk_score: 0.3  // Only propose low-risk changes (0-1 scale)
    };
  }

  /**
   * Start periodic analysis (runs every N hours)
   * @param {number} intervalHours - Analysis interval in hours
   */
  startPeriodicAnalysis(intervalHours = 24) {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
    }

    logger.info('OwnerAIAgent: Starting periodic analysis', { intervalHours });

    // Run immediately, then on interval
    this.analyzeAndPropose();

    this.analysisInterval = setInterval(() => {
      this.analyzeAndPropose();
    }, intervalHours * 60 * 60 * 1000);
  }

  /**
   * Stop periodic analysis
   */
  stopPeriodicAnalysis() {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
      logger.info('OwnerAIAgent: Stopped periodic analysis');
    }
  }

  /**
   * Analyze system and generate proposals
   * @returns {Object} Analysis results with proposals
   */
  async analyzeAndPropose() {
    logger.info('OwnerAIAgent: Starting analysis');

    try {
      // Gather current metrics
      const metrics = await this.gatherMetrics();

      // Analyze and generate proposals
      const proposals = [];

      // 1. Forecast accuracy improvement proposals
      const forecastProposals = await this.proposeForecastImprovements(metrics);
      proposals.push(...forecastProposals);

      // 2. Cache TTL optimization proposals
      const cacheProposals = await this.proposeCacheOptimizations(metrics);
      proposals.push(...cacheProposals);

      // 3. Safety stock adjustment proposals
      const safetyStockProposals = await this.proposeSafetyStockAdjustments(metrics);
      proposals.push(...safetyStockProposals);

      // Save proposals to database
      for (const proposal of proposals) {
        await this.saveProposal(proposal);
      }

      logger.info('OwnerAIAgent: Analysis complete', {
        proposalsGenerated: proposals.length,
        readyToApply: proposals.filter(p => p.status === 'ready').length
      });

      return {
        timestamp: new Date().toISOString(),
        metricsAnalyzed: metrics,
        proposalsGenerated: proposals.length,
        proposals
      };

    } catch (error) {
      logger.error('OwnerAIAgent: Analysis failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Gather current system metrics
   * @returns {Object} Current metrics
   */
  async gatherMetrics() {
    const metrics = {
      forecast: { avgMAPE: null, avgRMSE: null, sampleCount: 0 },
      cache: { hitRate: null, missRate: null },
      inventory: { stockouts: 0, overstock: 0 },
      training: { recentRuns: 0, avgDuration: null }
    };

    // Get forecast accuracy from recent training runs
    try {
      const forecastStats = await db.get(
        `SELECT
          AVG(mape) as avg_mape,
          AVG(rmse) as avg_rmse,
          COUNT(*) as sample_count
        FROM ai_training_runs
        WHERE status = 'completed'
          AND mape IS NOT NULL
          AND started_at >= datetime('now', '-30 days')`
      );

      if (forecastStats) {
        metrics.forecast.avgMAPE = forecastStats.avg_mape;
        metrics.forecast.avgRMSE = forecastStats.avg_rmse;
        metrics.forecast.sampleCount = forecastStats.sample_count;
      }
    } catch (error) {
      logger.warn('Could not fetch forecast metrics', { error: error.message });
    }

    // Get cache hit rate (if Redis metrics available)
    // For now, use N/A - would need Redis stats
    metrics.cache.hitRate = null;
    metrics.cache.missRate = null;

    // Get inventory health
    try {
      const inventoryStats = await db.get(
        `SELECT
          SUM(CASE WHEN current_quantity <= reorder_point THEN 1 ELSE 0 END) as stockouts,
          SUM(CASE WHEN current_quantity > par_level * 1.5 THEN 1 ELSE 0 END) as overstock
        FROM inventory_items
        WHERE status = 'active'`
      );

      if (inventoryStats) {
        metrics.inventory.stockouts = inventoryStats.stockouts || 0;
        metrics.inventory.overstock = inventoryStats.overstock || 0;
      }
    } catch (error) {
      logger.warn('Could not fetch inventory metrics', { error: error.message });
    }

    // Get training performance
    try {
      const trainingStats = await db.get(
        `SELECT
          COUNT(*) as recent_runs,
          AVG(wall_clock_seconds) as avg_duration
        FROM ai_training_runs
        WHERE started_at >= datetime('now', '-7 days')`
      );

      if (trainingStats) {
        metrics.training.recentRuns = trainingStats.recent_runs || 0;
        metrics.training.avgDuration = trainingStats.avg_duration;
      }
    } catch (error) {
      logger.warn('Could not fetch training metrics', { error: error.message });
    }

    return metrics;
  }

  /**
   * Propose forecast accuracy improvements
   * @param {Object} metrics - Current metrics
   * @returns {Array} Forecast improvement proposals
   */
  async proposeForecastImprovements(metrics) {
    const proposals = [];

    // Only propose if we have enough data
    if (metrics.forecast.sampleCount < 10) {
      return proposals;
    }

    const currentMAPE = metrics.forecast.avgMAPE;

    // If MAPE > 20%, propose retraining with different parameters
    if (currentMAPE && currentMAPE > 20.0) {
      proposals.push({
        proposalType: 'parameter_tune',
        entityType: 'global',
        entityId: null,
        currentValues: {
          model_type: 'prophet',
          changepoint_prior_scale: 0.05,
          seasonality_prior_scale: 10.0
        },
        proposedValues: {
          model_type: 'prophet',
          changepoint_prior_scale: 0.01,  // Lower = less flexible
          seasonality_prior_scale: 15.0   // Higher = stronger seasonality
        },
        rationale: `Current MAPE is ${currentMAPE.toFixed(2)}% (target <20%). Adjusting Prophet hyperparameters to improve forecast accuracy.`,
        expectedKPIDeltas: {
          mape_delta_pct: -10.0,  // Expect 10% reduction in MAPE
          training_time_delta_pct: 5.0  // May take 5% longer
        },
        blastRadius: 'global',
        rollbackCommand: 'Revert to previous Prophet parameters via Owner Console → Releases → Rollback',
        riskScore: 0.2  // Low risk
      });
    }

    // If MAPE is good but RMSE is high, propose ensemble approach
    if (currentMAPE && currentMAPE < 15.0 && metrics.forecast.avgRMSE && metrics.forecast.avgRMSE > 50.0) {
      proposals.push({
        proposalType: 'config_change',
        entityType: 'global',
        entityId: null,
        currentValues: {
          forecast_method: 'prophet_only'
        },
        proposedValues: {
          forecast_method: 'ensemble',
          ensemble_weights: { prophet: 0.7, arima: 0.3 }
        },
        rationale: `MAPE is good (${currentMAPE.toFixed(2)}%) but RMSE is high. Ensemble approach may reduce variance.`,
        expectedKPIDeltas: {
          rmse_delta_pct: -15.0,
          mape_delta_pct: -2.0
        },
        blastRadius: 'global',
        rollbackCommand: 'Revert to prophet_only via Owner Console',
        riskScore: 0.25
      });
    }

    return proposals;
  }

  /**
   * Propose cache TTL optimizations
   * @param {Object} metrics - Current metrics
   * @returns {Array} Cache optimization proposals
   */
  async proposeCacheOptimizations(metrics) {
    const proposals = [];

    // If cache hit rate is low, propose increasing TTL
    // Note: Real cache metrics would come from Redis
    if (metrics.cache.hitRate !== null && metrics.cache.hitRate < 0.5) {
      proposals.push({
        proposalType: 'cache_ttl',
        entityType: 'global',
        entityId: null,
        currentValues: {
          forecast_cache_ttl_seconds: 3600
        },
        proposedValues: {
          forecast_cache_ttl_seconds: 7200
        },
        rationale: `Cache hit rate is ${(metrics.cache.hitRate * 100).toFixed(1)}% (target >50%). Increasing TTL to improve hit rate.`,
        expectedKPIDeltas: {
          cache_hit_rate_delta_pct: 20.0,
          response_time_p95_delta_ms: -50
        },
        blastRadius: 'global',
        rollbackCommand: 'Revert cache TTL to 3600s via Owner Console',
        riskScore: 0.1  // Very low risk
      });
    }

    return proposals;
  }

  /**
   * Propose safety stock adjustments
   * @param {Object} metrics - Current metrics
   * @returns {Array} Safety stock proposals
   */
  async proposeSafetyStockAdjustments(metrics) {
    const proposals = [];

    // If stockouts are high, propose increasing safety stock
    if (metrics.inventory.stockouts > 10) {
      proposals.push({
        proposalType: 'safety_stock',
        entityType: 'global',
        entityId: null,
        currentValues: {
          safety_stock_factor: 1.5
        },
        proposedValues: {
          safety_stock_factor: 1.8
        },
        rationale: `${metrics.inventory.stockouts} items near stockout. Increasing safety stock factor to reduce risk.`,
        expectedKPIDeltas: {
          stockout_rate_delta_pct: -30.0,
          holding_cost_delta_pct: 10.0
        },
        blastRadius: 'global',
        rollbackCommand: 'Revert safety stock factor to 1.5 via Owner Console',
        riskScore: 0.3  // Medium-low risk
      });
    }

    // If overstock is high, propose decreasing safety stock
    if (metrics.inventory.overstock > 20) {
      proposals.push({
        proposalType: 'safety_stock',
        entityType: 'global',
        entityId: null,
        currentValues: {
          safety_stock_factor: 1.5
        },
        proposedValues: {
          safety_stock_factor: 1.3
        },
        rationale: `${metrics.inventory.overstock} items overstocked. Reducing safety stock factor to optimize inventory levels.`,
        expectedKPIDeltas: {
          overstock_rate_delta_pct: -25.0,
          holding_cost_delta_pct: -15.0,
          stockout_risk_delta_pct: 5.0
        },
        blastRadius: 'global',
        rollbackCommand: 'Revert safety stock factor to 1.5 via Owner Console',
        riskScore: 0.25
      });
    }

    return proposals;
  }

  /**
   * Save proposal to database
   * @param {Object} proposal - Proposal object
   * @returns {string} Proposal ID
   */
  async saveProposal(proposal) {
    const proposalId = `prop_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Determine status: 'proposed' or 'ready' based on risk score
    const status = proposal.riskScore <= this.proposalThresholds.max_risk_score ? 'ready' : 'proposed';

    await db.run(
      `INSERT INTO ai_proposals (
        proposal_id, tenant_id, proposal_type, entity_type, entity_id,
        current_values, proposed_values, rationale, expected_kpi_deltas,
        blast_radius, rollback_command, risk_score, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        proposalId,
        'default',
        proposal.proposalType,
        proposal.entityType,
        proposal.entityId,
        JSON.stringify(proposal.currentValues),
        JSON.stringify(proposal.proposedValues),
        proposal.rationale,
        JSON.stringify(proposal.expectedKPIDeltas),
        proposal.blastRadius,
        proposal.rollbackCommand,
        proposal.riskScore,
        status
      ]
    );

    logger.info('OwnerAIAgent: Proposal created', { proposalId, type: proposal.proposalType, status });

    return proposalId;
  }

  /**
   * Get all proposals with optional filters
   * @param {string} status - Filter by status
   * @param {number} limit - Number of proposals to return
   * @returns {Array} Proposals
   */
  async getProposals(status = null, limit = 50) {
    let query = `
      SELECT
        proposal_id, proposal_type, entity_type, entity_id,
        current_values, proposed_values, rationale, expected_kpi_deltas,
        blast_radius, rollback_command, risk_score, status,
        created_at, updated_at
      FROM ai_proposals
    `;

    const params = [];

    if (status) {
      query += ` WHERE status = ?`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const proposals = await db.all(query, params);

    // Parse JSON fields
    return proposals.map(p => ({
      ...p,
      currentValues: JSON.parse(p.current_values),
      proposedValues: JSON.parse(p.proposed_values),
      expectedKPIDeltas: JSON.parse(p.expected_kpi_deltas)
    }));
  }

  /**
   * Approve a proposal (marks as ready for owner to apply)
   * @param {string} proposalId - Proposal ID
   * @param {string} ownerId - Owner approving
   * @returns {Object} Updated proposal
   */
  async approveProposal(proposalId, ownerId) {
    await db.run(
      `UPDATE ai_proposals SET
        status = 'approved',
        owner_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE proposal_id = ? AND status IN ('proposed', 'ready')`,
      [ownerId, proposalId]
    );

    logger.info('OwnerAIAgent: Proposal approved', { proposalId, ownerId });

    return this.getProposalById(proposalId);
  }

  /**
   * Reject a proposal
   * @param {string} proposalId - Proposal ID
   * @param {string} reason - Rejection reason
   * @param {string} ownerId - Owner rejecting
   * @returns {Object} Updated proposal
   */
  async rejectProposal(proposalId, reason, ownerId) {
    await db.run(
      `UPDATE ai_proposals SET
        status = 'rejected',
        rejection_reason = ?,
        owner_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE proposal_id = ?`,
      [reason, ownerId, proposalId]
    );

    logger.info('OwnerAIAgent: Proposal rejected', { proposalId, ownerId, reason });

    return this.getProposalById(proposalId);
  }

  /**
   * Get proposal by ID
   * @param {string} proposalId - Proposal ID
   * @returns {Object} Proposal
   */
  async getProposalById(proposalId) {
    const proposal = await db.get(
      `SELECT * FROM ai_proposals WHERE proposal_id = ?`,
      [proposalId]
    );

    if (!proposal) {
      return null;
    }

    return {
      ...proposal,
      currentValues: JSON.parse(proposal.current_values),
      proposedValues: JSON.parse(proposal.proposed_values),
      expectedKPIDeltas: JSON.parse(proposal.expected_kpi_deltas)
    };
  }

  /**
   * Get proposal statistics
   * @returns {Object} Stats
   */
  async getProposalStats() {
    const stats = await db.get(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'proposed' THEN 1 ELSE 0 END) as proposed,
        SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) as ready,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status = 'applied' THEN 1 ELSE 0 END) as applied,
        AVG(risk_score) as avg_risk_score
      FROM ai_proposals
      WHERE created_at >= datetime('now', '-30 days')`
    );

    return stats;
  }
}

module.exports = new OwnerAIAgent();
