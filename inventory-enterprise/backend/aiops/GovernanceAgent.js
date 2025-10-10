/**
 * Governance Agent - Autonomous Policy Adaptation
 * Version: v2.7.0-2025-10-07
 *
 * Learns from operational performance and autonomously adapts policies
 * to optimize system behavior, reduce incidents, and improve efficiency.
 *
 * Features:
 * - Policy learning from historical incident data
 * - Automatic threshold adjustment
 * - Remediation strategy optimization
 * - Cost-benefit analysis
 * - Regulatory compliance enforcement
 *
 * @module aiops/GovernanceAgent
 */

const EventEmitter = require('events');
const logger = require('../config/logger').logger;
const db = require('../config/database');

class GovernanceAgent extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      learningInterval: config.learningInterval || 86400000, // 24 hours
      adaptationEnabled: config.adaptationEnabled !== false,
      minDataPoints: config.minDataPoints || 100,
      confidenceThreshold: config.confidenceThreshold || 0.85,
      maxThresholdAdjustment: config.maxThresholdAdjustment || 0.20, // 20% max change
      ...config
    };

    this.policies = new Map();
    this.learningHistory = [];
    this.adaptations = [];
    this.performanceMetrics = {};
    this.isRunning = false;
    this.learningIntervalId = null;
  }

  /**
   * Initialize governance agent
   */
  async initialize() {
    logger.info('Initializing Governance Agent v2.7.0');
    logger.info('Configuration:', {
      learningInterval: `${this.config.learningInterval / 1000}s`,
      adaptationEnabled: this.config.adaptationEnabled,
      minDataPoints: this.config.minDataPoints
    });

    try {
      // Load existing policies from database
      await this._loadPolicies();

      // Load historical adaptations
      await this._loadAdaptationHistory();

      // Calculate current performance baseline
      await this._calculatePerformanceBaseline();

      logger.info('Governance Agent initialized');
      logger.info(`Loaded ${this.policies.size} policies, ${this.adaptations.length} historical adaptations`);
    } catch (error) {
      logger.error('Failed to initialize Governance Agent:', error);
      throw error;
    }
  }

  /**
   * Start autonomous governance
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Governance Agent already running');
      return;
    }

    logger.info('Starting Governance Agent');

    this.isRunning = true;

    // Start learning cycle
    this.learningIntervalId = setInterval(
      () => this._performLearningCycle(),
      this.config.learningInterval
    );

    // Perform immediate learning cycle
    await this._performLearningCycle();

    this.emit('started');
    logger.info('Governance Agent started');
  }

  /**
   * Stop governance agent
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping Governance Agent');
    this.isRunning = false;

    if (this.learningIntervalId) {
      clearInterval(this.learningIntervalId);
      this.learningIntervalId = null;
    }

    // Save final state
    await this._savePolicies();

    this.emit('stopped');
    logger.info('Governance Agent stopped');
  }

  /**
   * Perform learning cycle
   * @private
   */
  async _performLearningCycle() {
    logger.info('Starting learning cycle');

    try {
      // 1. Collect performance data
      const performanceData = await this._collectPerformanceData();

      // 2. Analyze incident patterns
      const incidentPatterns = await this._analyzeIncidentPatterns();

      // 3. Evaluate current policies
      const policyEffectiveness = await this._evaluatePolicyEffectiveness();

      // 4. Generate policy recommendations
      const recommendations = await this._generatePolicyRecommendations(
        performanceData,
        incidentPatterns,
        policyEffectiveness
      );

      // 5. Apply adaptations (if enabled and confident)
      if (this.config.adaptationEnabled && recommendations.length > 0) {
        await this._applyAdaptations(recommendations);
      }

      // 6. Update learning history
      this.learningHistory.push({
        timestamp: new Date().toISOString(),
        performanceData,
        incidentPatterns,
        policyEffectiveness,
        recommendations,
        applied: this.config.adaptationEnabled
      });

      // Keep only last 30 learning cycles
      if (this.learningHistory.length > 30) {
        this.learningHistory.shift();
      }

      logger.info(`Learning cycle complete: ${recommendations.length} recommendations generated`);

      this.emit('learning-complete', {
        recommendations,
        applied: this.config.adaptationEnabled
      });
    } catch (error) {
      logger.error('Learning cycle failed:', error);
      this.emit('error', error);
    }
  }

  /**
   * Collect performance data from AI Ops
   * @private
   */
  async _collectPerformanceData() {
    try {
      const query = `
        SELECT
          COUNT(*) as total_predictions,
          SUM(CASE WHEN confirmed = 1 THEN 1 ELSE 0 END) as true_positives,
          SUM(CASE WHEN false_positive = 1 THEN 1 ELSE 0 END) as false_positives,
          AVG(confidence) as avg_confidence,
          AVG(anomaly_score) as avg_anomaly_score
        FROM ai_anomaly_predictions
        WHERE detected_timestamp >= datetime('now', '-24 hours')
      `;

      const predictions = await db.get(query);

      const remediationQuery = `
        SELECT
          COUNT(*) as total_remediations,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
          AVG(response_time_ms) as avg_response_time
        FROM ai_remediation_log
        WHERE executed_at >= datetime('now', '-24 hours')
      `;

      const remediations = await db.get(remediationQuery);

      return {
        predictions: predictions || {},
        remediations: remediations || {},
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to collect performance data:', error);
      return { predictions: {}, remediations: {}, timestamp: new Date().toISOString() };
    }
  }

  /**
   * Analyze incident patterns
   * @private
   */
  async _analyzeIncidentPatterns() {
    try {
      const query = `
        SELECT
          incident_type,
          severity,
          COUNT(*) as count,
          AVG(confidence) as avg_confidence,
          AVG(anomaly_score) as avg_anomaly_score
        FROM ai_anomaly_predictions
        WHERE detected_timestamp >= datetime('now', '-7 days')
        GROUP BY incident_type, severity
        ORDER BY count DESC
      `;

      const patterns = await db.all(query);

      return patterns.map(p => ({
        type: p.incident_type,
        severity: p.severity,
        frequency: p.count,
        avgConfidence: p.avg_confidence,
        avgAnomalyScore: p.avg_anomaly_score
      }));
    } catch (error) {
      logger.error('Failed to analyze incident patterns:', error);
      return [];
    }
  }

  /**
   * Evaluate policy effectiveness
   * @private
   */
  async _evaluatePolicyEffectiveness() {
    const effectiveness = {};

    for (const [policyName, policy] of this.policies.entries()) {
      try {
        const query = `
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN p.confirmed = 1 THEN 1 ELSE 0 END) as correct_predictions,
            SUM(CASE WHEN p.false_positive = 1 THEN 1 ELSE 0 END) as false_positives,
            AVG(r.success) as remediation_success_rate
          FROM ai_anomaly_predictions p
          LEFT JOIN ai_remediation_log r ON r.incident_type = p.incident_type
          WHERE p.incident_type = ?
            AND p.detected_timestamp >= datetime('now', '-7 days')
        `;

        const stats = await db.get(query, [policy.incidentType]);

        if (stats && stats.total > 0) {
          const precision = stats.correct_predictions / stats.total;
          const falsePositiveRate = stats.false_positives / stats.total;

          effectiveness[policyName] = {
            precision,
            falsePositiveRate,
            remediationSuccessRate: stats.remediation_success_rate || 0,
            totalIncidents: stats.total,
            score: this._calculatePolicyScore(precision, falsePositiveRate, stats.remediation_success_rate)
          };
        }
      } catch (error) {
        logger.error(`Failed to evaluate policy ${policyName}:`, error);
      }
    }

    return effectiveness;
  }

  /**
   * Calculate policy effectiveness score
   * @private
   */
  _calculatePolicyScore(precision, falsePositiveRate, remediationSuccessRate) {
    // Weighted score: precision (40%), false positive reduction (30%), remediation success (30%)
    return (
      (precision * 0.4) +
      ((1 - falsePositiveRate) * 0.3) +
      (remediationSuccessRate * 0.3)
    );
  }

  /**
   * Generate policy recommendations
   * @private
   */
  async _generatePolicyRecommendations(performanceData, incidentPatterns, policyEffectiveness) {
    const recommendations = [];

    // Analyze each policy
    for (const [policyName, policy] of this.policies.entries()) {
      const effectiveness = policyEffectiveness[policyName];

      if (!effectiveness || effectiveness.totalIncidents < this.config.minDataPoints) {
        continue;
      }

      // Check if threshold adjustment is needed
      if (effectiveness.falsePositiveRate > 0.10) {
        // Too many false positives - increase threshold
        const currentThreshold = policy.anomalyThreshold || 0.85;
        const adjustment = Math.min(
          this.config.maxThresholdAdjustment,
          effectiveness.falsePositiveRate * 0.5
        );
        const newThreshold = Math.min(0.99, currentThreshold + adjustment);

        recommendations.push({
          type: 'threshold_adjustment',
          policyName,
          incidentType: policy.incidentType,
          currentValue: currentThreshold,
          recommendedValue: newThreshold,
          reason: `High false positive rate (${(effectiveness.falsePositiveRate * 100).toFixed(1)}%)`,
          confidence: this._calculateRecommendationConfidence(effectiveness),
          expectedImprovement: adjustment * 0.5
        });
      }

      if (effectiveness.precision < 0.80) {
        // Low precision - may need confidence threshold adjustment
        const currentConfidence = policy.minConfidence || 0.75;
        const adjustment = Math.min(
          this.config.maxThresholdAdjustment,
          (0.85 - effectiveness.precision)
        );
        const newConfidence = Math.min(0.99, currentConfidence + adjustment);

        recommendations.push({
          type: 'confidence_adjustment',
          policyName,
          incidentType: policy.incidentType,
          currentValue: currentConfidence,
          recommendedValue: newConfidence,
          reason: `Low prediction precision (${(effectiveness.precision * 100).toFixed(1)}%)`,
          confidence: this._calculateRecommendationConfidence(effectiveness),
          expectedImprovement: adjustment * 0.4
        });
      }

      if (effectiveness.remediationSuccessRate < 0.90 && effectiveness.remediationSuccessRate > 0) {
        // Low remediation success - may need different remediation strategy
        recommendations.push({
          type: 'remediation_strategy',
          policyName,
          incidentType: policy.incidentType,
          currentValue: policy.remediationStrategy || 'default',
          recommendedValue: 'enhanced',
          reason: `Low remediation success rate (${(effectiveness.remediationSuccessRate * 100).toFixed(1)}%)`,
          confidence: this._calculateRecommendationConfidence(effectiveness),
          expectedImprovement: 0.15
        });
      }
    }

    // Check for emerging incident patterns
    for (const pattern of incidentPatterns) {
      if (pattern.frequency > 5 && !this.policies.has(pattern.type)) {
        recommendations.push({
          type: 'new_policy',
          policyName: `auto_${pattern.type}`,
          incidentType: pattern.type,
          recommendedValue: {
            anomalyThreshold: pattern.avgAnomalyScore,
            minConfidence: pattern.avgConfidence,
            severity: pattern.severity
          },
          reason: `Emerging incident pattern detected (${pattern.frequency} occurrences)`,
          confidence: Math.min(0.95, pattern.frequency / 20),
          expectedImprovement: 0.20
        });
      }
    }

    return recommendations.filter(r => r.confidence >= this.config.confidenceThreshold);
  }

  /**
   * Calculate recommendation confidence
   * @private
   */
  _calculateRecommendationConfidence(effectiveness) {
    // Higher confidence with more data and clearer signals
    const dataConfidence = Math.min(1.0, effectiveness.totalIncidents / (this.config.minDataPoints * 2));
    const signalConfidence = effectiveness.score;

    return (dataConfidence * 0.4) + (signalConfidence * 0.6);
  }

  /**
   * Apply policy adaptations
   * @private
   */
  async _applyAdaptations(recommendations) {
    logger.info(`Applying ${recommendations.length} policy adaptations`);

    for (const recommendation of recommendations) {
      try {
        let applied = false;

        switch (recommendation.type) {
          case 'threshold_adjustment':
            applied = await this._applyThresholdAdjustment(recommendation);
            break;
          case 'confidence_adjustment':
            applied = await this._applyConfidenceAdjustment(recommendation);
            break;
          case 'remediation_strategy':
            applied = await this._applyRemediationStrategy(recommendation);
            break;
          case 'new_policy':
            applied = await this._createNewPolicy(recommendation);
            break;
        }

        if (applied) {
          // Log adaptation
          await this._logAdaptation(recommendation);

          this.adaptations.push({
            timestamp: new Date().toISOString(),
            recommendation,
            applied: true
          });

          logger.info(`Applied adaptation: ${recommendation.type} for ${recommendation.incidentType}`);
        }
      } catch (error) {
        logger.error(`Failed to apply adaptation ${recommendation.type}:`, error);
      }
    }

    // Save updated policies
    await this._savePolicies();
  }

  /**
   * Apply threshold adjustment
   * @private
   */
  async _applyThresholdAdjustment(recommendation) {
    const policy = this.policies.get(recommendation.policyName);

    if (!policy) return false;

    policy.anomalyThreshold = recommendation.recommendedValue;
    policy.lastUpdated = new Date().toISOString();
    policy.adaptationHistory = policy.adaptationHistory || [];
    policy.adaptationHistory.push({
      timestamp: new Date().toISOString(),
      type: 'threshold_adjustment',
      oldValue: recommendation.currentValue,
      newValue: recommendation.recommendedValue,
      reason: recommendation.reason
    });

    this.policies.set(recommendation.policyName, policy);

    // Update in AI Ops config
    await db.run(
      `UPDATE ai_ops_config SET config_value = ?, updated_at = datetime('now')
       WHERE config_key = ?`,
      [recommendation.recommendedValue.toString(), `aiops.${recommendation.incidentType}.anomaly_threshold`]
    );

    return true;
  }

  /**
   * Apply confidence adjustment
   * @private
   */
  async _applyConfidenceAdjustment(recommendation) {
    const policy = this.policies.get(recommendation.policyName);

    if (!policy) return false;

    policy.minConfidence = recommendation.recommendedValue;
    policy.lastUpdated = new Date().toISOString();

    this.policies.set(recommendation.policyName, policy);

    await db.run(
      `UPDATE ai_ops_config SET config_value = ?, updated_at = datetime('now')
       WHERE config_key = ?`,
      [recommendation.recommendedValue.toString(), `aiops.${recommendation.incidentType}.min_confidence`]
    );

    return true;
  }

  /**
   * Apply remediation strategy change
   * @private
   */
  async _applyRemediationStrategy(recommendation) {
    const policy = this.policies.get(recommendation.policyName);

    if (!policy) return false;

    policy.remediationStrategy = recommendation.recommendedValue;
    policy.lastUpdated = new Date().toISOString();

    this.policies.set(recommendation.policyName, policy);

    return true;
  }

  /**
   * Create new policy
   * @private
   */
  async _createNewPolicy(recommendation) {
    const policy = {
      incidentType: recommendation.incidentType,
      anomalyThreshold: recommendation.recommendedValue.anomalyThreshold,
      minConfidence: recommendation.recommendedValue.minConfidence,
      severity: recommendation.recommendedValue.severity,
      remediationStrategy: 'default',
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      autoGenerated: true
    };

    this.policies.set(recommendation.policyName, policy);

    logger.info(`Created new policy: ${recommendation.policyName}`);

    return true;
  }

  /**
   * Log adaptation to database
   * @private
   */
  async _logAdaptation(recommendation) {
    try {
      await db.run(
        `INSERT INTO governance_adaptations (
          adaptation_type, policy_name, incident_type,
          old_value, new_value, reason, confidence, expected_improvement
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          recommendation.type,
          recommendation.policyName,
          recommendation.incidentType,
          recommendation.currentValue?.toString() || null,
          JSON.stringify(recommendation.recommendedValue),
          recommendation.reason,
          recommendation.confidence,
          recommendation.expectedImprovement
        ]
      );
    } catch (error) {
      logger.error('Failed to log adaptation:', error);
    }
  }

  /**
   * Load policies from database
   * @private
   */
  async _loadPolicies() {
    try {
      const configs = await db.all(
        `SELECT * FROM ai_ops_config WHERE category = 'governance' OR config_key LIKE 'aiops.%.%'`
      );

      for (const config of configs) {
        const policyName = config.config_key.replace('aiops.', '').replace('.', '_');
        let policy = this.policies.get(policyName) || {
          incidentType: config.config_key.split('.')[1],
          createdAt: config.created_at
        };

        if (config.config_key.includes('anomaly_threshold')) {
          policy.anomalyThreshold = parseFloat(config.config_value);
        } else if (config.config_key.includes('min_confidence')) {
          policy.minConfidence = parseFloat(config.config_value);
        }

        this.policies.set(policyName, policy);
      }
    } catch (error) {
      logger.error('Failed to load policies:', error);
    }
  }

  /**
   * Save policies to database
   * @private
   */
  async _savePolicies() {
    try {
      for (const [policyName, policy] of this.policies.entries()) {
        await db.run(
          `INSERT OR REPLACE INTO governance_policies (
            policy_name, incident_type, anomaly_threshold, min_confidence,
            remediation_strategy, auto_generated, last_updated
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            policyName,
            policy.incidentType,
            policy.anomalyThreshold,
            policy.minConfidence,
            policy.remediationStrategy || 'default',
            policy.autoGenerated ? 1 : 0,
            policy.lastUpdated || new Date().toISOString()
          ]
        );
      }
    } catch (error) {
      logger.error('Failed to save policies:', error);
    }
  }

  /**
   * Load adaptation history
   * @private
   */
  async _loadAdaptationHistory() {
    try {
      const history = await db.all(
        `SELECT * FROM governance_adaptations
         WHERE created_at >= datetime('now', '-30 days')
         ORDER BY created_at DESC`
      );

      this.adaptations = history.map(h => ({
        timestamp: h.created_at,
        recommendation: {
          type: h.adaptation_type,
          policyName: h.policy_name,
          incidentType: h.incident_type,
          currentValue: h.old_value,
          recommendedValue: JSON.parse(h.new_value || '{}'),
          reason: h.reason,
          confidence: h.confidence,
          expectedImprovement: h.expected_improvement
        },
        applied: true
      }));
    } catch (error) {
      logger.error('Failed to load adaptation history:', error);
    }
  }

  /**
   * Calculate performance baseline
   * @private
   */
  async _calculatePerformanceBaseline() {
    const performanceData = await this._collectPerformanceData();

    this.performanceMetrics = {
      predictionAccuracy: performanceData.predictions.true_positives /
        (performanceData.predictions.total_predictions || 1),
      falsePositiveRate: performanceData.predictions.false_positives /
        (performanceData.predictions.total_predictions || 1),
      remediationSuccessRate: performanceData.remediations.successful /
        (performanceData.remediations.total_remediations || 1),
      avgResponseTime: performanceData.remediations.avg_response_time || 0,
      timestamp: new Date().toISOString()
    };

    logger.info('Performance baseline:', this.performanceMetrics);
  }

  /**
   * Get governance statistics
   */
  getStatistics() {
    return {
      totalPolicies: this.policies.size,
      totalAdaptations: this.adaptations.length,
      learningCycles: this.learningHistory.length,
      performanceMetrics: this.performanceMetrics,
      isRunning: this.isRunning
    };
  }

  /**
   * Get policy by name
   */
  getPolicy(policyName) {
    return this.policies.get(policyName);
  }

  /**
   * Get all policies
   */
  getAllPolicies() {
    return Array.from(this.policies.entries()).map(([name, policy]) => ({
      name,
      ...policy
    }));
  }

  /**
   * Get learning history
   */
  getLearningHistory() {
    return this.learningHistory;
  }

  /**
   * Get adaptation history
   */
  getAdaptationHistory() {
    return this.adaptations;
  }
}

module.exports = GovernanceAgent;
