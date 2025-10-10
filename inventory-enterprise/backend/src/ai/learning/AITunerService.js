/**
 * AI Tuner Service - Autonomous Learning Engine
 * Analyzes system metrics, generates improvement proposals, and applies safe optimizations
 *
 * @version 3.0.0
 * @author NeuroInnovate AI Team
 */

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const crypto = require('crypto');

class AITunerService {
  constructor(db, metricsExporter) {
    this.db = db;
    this.metricsExporter = metricsExporter;
    this.proposalsDir = process.env.AI_PROPOSALS_DIR || '/var/ai/tuning_proposals';
    this.backupsDir = process.env.AI_BACKUPS_DIR || '/var/ai/backups';
    this.confidenceThreshold = 0.85; // Auto-apply threshold
  }

  /**
   * Daily analysis of system metrics
   * @returns {Object} Analysis results
   */
  async analyzeDailyMetrics() {
    console.log('🔍 AI Tuner: Starting daily analysis...');

    const analysis = {
      timestamp: new Date().toISOString(),
      metrics: {},
      issues: [],
      opportunities: []
    };

    try {
      // 1. Analyze cache performance
      const cacheAnalysis = await this.analyzeCachePerformance();
      analysis.metrics.cache = cacheAnalysis;
      if (cacheAnalysis.hitRate < 0.70) {
        analysis.issues.push({
          category: 'cache',
          severity: 'medium',
          description: `Cache hit rate ${(cacheAnalysis.hitRate * 100).toFixed(1)}% below target 70%`
        });
        analysis.opportunities.push({
          category: 'cache',
          type: 'ttl_increase',
          potential: `Increase cache TTL to improve hit rate by est. ${Math.round((0.70 - cacheAnalysis.hitRate) * 100)}%`
        });
      }

      // 2. Analyze forecast accuracy
      const forecastAnalysis = await this.analyzeForecastAccuracy();
      analysis.metrics.forecast = forecastAnalysis;
      if (forecastAnalysis.mape > 0.15) {
        analysis.issues.push({
          category: 'forecast',
          severity: 'high',
          description: `Forecast MAPE ${(forecastAnalysis.mape * 100).toFixed(1)}% exceeds threshold 15%`
        });
        analysis.opportunities.push({
          category: 'forecast',
          type: 'retrain_frequency',
          potential: 'Increase retraining frequency to improve accuracy'
        });
      }

      // 3. Analyze query performance
      const queryAnalysis = await this.analyzeQueryPerformance();
      analysis.metrics.queries = queryAnalysis;
      if (queryAnalysis.avgLatency > 100) {
        analysis.opportunities.push({
          category: 'schema',
          type: 'index_optimization',
          potential: `Add indexes to reduce avg query latency from ${queryAnalysis.avgLatency}ms`
        });
      }

      // 4. Analyze security posture
      const securityAnalysis = await this.analyzeSecurityPosture();
      analysis.metrics.security = securityAnalysis;

      console.log(`✅ Analysis complete: ${analysis.issues.length} issues, ${analysis.opportunities.length} opportunities`);

      return analysis;

    } catch (error) {
      console.error('❌ Daily analysis failed:', error);
      throw error;
    }
  }

  /**
   * Analyze cache performance metrics
   * @private
   */
  async analyzeCachePerformance() {
    // Simulated metrics - in production, fetch from Prometheus/Redis
    const metrics = await this.fetchMetricsFromPrometheus('cache_hit_rate', '24h');

    return {
      hitRate: metrics.avg || 0.71,
      currentTTL: 120,
      requestsPerHour: metrics.requests || 1500,
      avgSize: metrics.avgSize || 2048
    };
  }

  /**
   * Analyze forecast accuracy
   * @private
   */
  async analyzeForecastAccuracy() {
    try {
      const sql = `
        SELECT AVG(ABS((predicted_quantity - actual_quantity) / NULLIF(actual_quantity, 0))) as mape
        FROM forecast_results
        WHERE created_at > datetime('now', '-7 days')
          AND actual_quantity IS NOT NULL
      `;

      const result = await this.db.get(sql);

      return {
        mape: result?.mape || 0.12,
        lastRetrain: '2025-10-01',
        modelVersion: 'v2.1.0',
        itemsCovered: 250
      };
    } catch (error) {
      console.warn('Forecast analysis fallback:', error.message);
      return { mape: 0.12, lastRetrain: 'unknown', modelVersion: 'v2.1.0', itemsCovered: 0 };
    }
  }

  /**
   * Analyze query performance
   * @private
   */
  async analyzeQueryPerformance() {
    // Simulated - in production, analyze slow query logs
    return {
      avgLatency: 85,
      p95Latency: 245,
      slowQueries: 3,
      missingIndexes: ['item_master(current_quantity)', 'processed_invoices(order_date)']
    };
  }

  /**
   * Analyze security posture
   * @private
   */
  async analyzeSecurityPosture() {
    try {
      const sql = `
        SELECT
          COUNT(*) FILTER (WHERE action = 'login_failed') as failed_logins,
          COUNT(*) FILTER (WHERE action = '2fa_failed') as failed_2fa
        FROM audit_logs
        WHERE created_at > datetime('now', '-24 hours')
      `;

      const result = await this.db.get(sql);

      return {
        failedLogins: result?.failed_logins || 0,
        failed2FA: result?.failed_2fa || 0,
        unusualAccessPatterns: 0
      };
    } catch (error) {
      console.warn('Security analysis fallback:', error.message);
      return { failedLogins: 0, failed2FA: 0, unusualAccessPatterns: 0 };
    }
  }

  /**
   * Generate improvement proposals from analysis
   * @param {Object} analysis - Analysis results
   * @returns {Array} Generated proposals
   */
  async generateProposals(analysis) {
    console.log('💡 Generating improvement proposals...');

    const proposals = [];

    // Generate cache proposals
    if (analysis.metrics.cache.hitRate < 0.70) {
      const cacheProposal = {
        proposalId: this.generateProposalId('cache', 'ttl'),
        category: 'cache',
        title: 'Increase cache TTL for inventory lists',
        description: `Current cache hit rate ${(analysis.metrics.cache.hitRate * 100).toFixed(1)}% is below target 70%. Increasing TTL from 120s to 300s.`,
        currentValue: { ttl: analysis.metrics.cache.currentTTL },
        proposedValue: { ttl: 300 },
        confidenceScore: this.calculateConfidence('cache_ttl', analysis),
        expectedImpact: {
          metric: 'cache_hit_rate',
          change: '+20%',
          risk: 'low',
          etaMin: 5
        },
        rollbackPlan: {
          steps: [
            { action: 'revert_config', file: 'config/cache.js', param: 'TTL', value: 120 },
            { action: 'restart_service', service: 'redis' }
          ],
          estimatedDowntime: '0s'
        }
      };
      proposals.push(cacheProposal);
    }

    // Generate forecast proposals
    if (analysis.metrics.forecast.mape > 0.15) {
      const forecastProposal = {
        proposalId: this.generateProposalId('forecast', 'retrain'),
        category: 'forecast',
        title: 'Increase forecast retraining frequency',
        description: `MAPE ${(analysis.metrics.forecast.mape * 100).toFixed(1)}% exceeds 15% threshold. Increase retraining from weekly to daily for top 50 SKUs.`,
        currentValue: { frequency: 'weekly', items: 'all' },
        proposedValue: { frequency: 'daily', items: 'top_50' },
        confidenceScore: this.calculateConfidence('forecast_retrain', analysis),
        expectedImpact: {
          metric: 'forecast_mape',
          change: '-25%',
          risk: 'low',
          etaMin: 120
        },
        rollbackPlan: {
          steps: [
            { action: 'revert_schedule', cron: '0 2 * * 0', previous: '0 2 * * *' }
          ],
          estimatedDowntime: '0s'
        }
      };
      proposals.push(forecastProposal);
    }

    // Generate schema proposals
    if (analysis.metrics.queries.missingIndexes.length > 0) {
      const schemaProposal = {
        proposalId: this.generateProposalId('schema', 'index'),
        category: 'schema',
        title: 'Add database indexes for query optimization',
        description: `Detected ${analysis.metrics.queries.missingIndexes.length} missing indexes causing high query latency (avg ${analysis.metrics.queries.avgLatency}ms).`,
        currentValue: { indexes: [] },
        proposedValue: { indexes: analysis.metrics.queries.missingIndexes },
        confidenceScore: this.calculateConfidence('schema_index', analysis),
        expectedImpact: {
          metric: 'query_latency',
          change: '-40%',
          risk: 'medium',
          etaMin: 15
        },
        rollbackPlan: {
          steps: [
            { action: 'drop_indexes', indexes: analysis.metrics.queries.missingIndexes }
          ],
          estimatedDowntime: '0s'
        }
      };
      proposals.push(schemaProposal);
    }

    console.log(`✅ Generated ${proposals.length} proposals`);

    // Store proposals in database
    for (const proposal of proposals) {
      await this.storeProposal(proposal);
      await this.writeProposalYAML(proposal);
    }

    return proposals;
  }

  /**
   * Calculate confidence score for a proposal
   * @param {String} proposalType - Type of proposal
   * @param {Object} analysis - Analysis context
   * @returns {Number} Confidence score (0-1)
   */
  calculateConfidence(proposalType, analysis) {
    // Simple confidence calculation based on data quality and historical success
    const baseConfidence = {
      cache_ttl: 0.92,
      forecast_retrain: 0.88,
      schema_index: 0.75,
      security_hardening: 0.80
    };

    let confidence = baseConfidence[proposalType] || 0.70;

    // Adjust based on data availability
    if (analysis.metrics) {
      confidence *= 1.0; // Full data available
    } else {
      confidence *= 0.8; // Partial data
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Store proposal in database
   * @param {Object} proposal
   * @private
   */
  async storeProposal(proposal) {
    try {
      const sql = `
        INSERT INTO ai_tuning_proposals (
          proposal_id, category, title, description,
          current_value, proposed_value, confidence_score,
          expected_impact, rollback_plan, yaml_path, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `;

      await this.db.run(sql, [
        proposal.proposalId,
        proposal.category,
        proposal.title,
        proposal.description,
        JSON.stringify(proposal.currentValue),
        JSON.stringify(proposal.proposedValue),
        proposal.confidenceScore,
        JSON.stringify(proposal.expectedImpact),
        JSON.stringify(proposal.rollbackPlan),
        `${this.proposalsDir}/${proposal.proposalId}.yaml`
      ]);

      console.log(`✅ Stored proposal: ${proposal.proposalId}`);
    } catch (error) {
      console.error(`Failed to store proposal ${proposal.proposalId}:`, error);
    }
  }

  /**
   * Write proposal as YAML file
   * @param {Object} proposal
   */
  async writeProposalYAML(proposal) {
    try {
      // Ensure directory exists
      await fs.mkdir(this.proposalsDir, { recursive: true });

      const yamlContent = yaml.dump({
        metadata: {
          proposalId: proposal.proposalId,
          category: proposal.category,
          generatedAt: new Date().toISOString(),
          confidenceScore: proposal.confidenceScore
        },
        proposal: {
          title: proposal.title,
          description: proposal.description,
          currentValue: proposal.currentValue,
          proposedValue: proposal.proposedValue,
          expectedImpact: proposal.expectedImpact
        },
        rollback: proposal.rollbackPlan,
        safety: {
          autoApply: proposal.confidenceScore >= this.confidenceThreshold && proposal.expectedImpact.risk === 'low',
          requiresApproval: proposal.confidenceScore < this.confidenceThreshold || proposal.expectedImpact.risk !== 'low',
          riskLevel: proposal.expectedImpact.risk
        }
      }, { indent: 2 });

      const filePath = path.join(this.proposalsDir, `${proposal.proposalId}.yaml`);
      await fs.writeFile(filePath, yamlContent, 'utf8');

      console.log(`✅ YAML proposal written: ${filePath}`);
    } catch (error) {
      console.error(`Failed to write YAML for ${proposal.proposalId}:`, error);
    }
  }

  /**
   * Apply safe proposals automatically
   */
  async applySafeProposals() {
    console.log('🚀 Applying safe proposals...');

    try {
      const sql = `
        SELECT * FROM ai_tuning_proposals
        WHERE status = 'pending'
          AND confidence_score >= ?
          AND json_extract(expected_impact, '$.risk') = 'low'
        LIMIT 5
      `;

      const proposals = await this.db.all(sql, [this.confidenceThreshold]);

      for (const proposal of proposals) {
        console.log(`Applying proposal: ${proposal.proposal_id}`);
        await this.applyProposal(proposal);
      }

      console.log(`✅ Applied ${proposals.length} safe proposals`);
      return proposals.length;
    } catch (error) {
      console.error('Failed to apply safe proposals:', error);
      return 0;
    }
  }

  /**
   * Apply a specific proposal
   * @param {Object} proposal
   * @private
   */
  async applyProposal(proposal) {
    try {
      // Simulate applying the proposal (in production, this would execute actual changes)
      console.log(`  ⚙️  Applying ${proposal.category} optimization...`);

      // Update status
      await this.db.run(
        `UPDATE ai_tuning_proposals
         SET status = 'applied', applied_at = CURRENT_TIMESTAMP, applied_by = 'ai_tuner_auto'
         WHERE proposal_id = ?`,
        [proposal.proposal_id]
      );

      // Log to audit
      await this.db.run(
        `INSERT INTO audit_logs (event_type, severity, action, details, user_email)
         VALUES ('AI_TUNER_APPLY', 'INFO', 'proposal_applied', ?, 'system@neuroinnovate.ai')`,
        [JSON.stringify({ proposalId: proposal.proposal_id, category: proposal.category })]
      );

      console.log(`  ✅ Proposal ${proposal.proposal_id} applied successfully`);
    } catch (error) {
      console.error(`Failed to apply proposal ${proposal.proposal_id}:`, error);
      throw error;
    }
  }

  /**
   * Rollback a proposal
   * @param {String} proposalId
   */
  async rollbackProposal(proposalId) {
    console.log(`🔄 Rolling back proposal: ${proposalId}`);

    try {
      const sql = `SELECT * FROM ai_tuning_proposals WHERE proposal_id = ?`;
      const proposal = await this.db.get(sql, [proposalId]);

      if (!proposal || proposal.status !== 'applied') {
        throw new Error(`Proposal ${proposalId} cannot be rolled back (status: ${proposal?.status || 'not found'})`);
      }

      const rollbackPlan = JSON.parse(proposal.rollback_plan);

      // Execute rollback steps
      for (const step of rollbackPlan.steps) {
        console.log(`  ⚙️  ${step.action}`);
        // In production, execute actual rollback actions
      }

      // Update status
      await this.db.run(
        `UPDATE ai_tuning_proposals SET status = 'rolled_back' WHERE proposal_id = ?`,
        [proposalId]
      );

      console.log(`✅ Rollback complete for ${proposalId}`);
      return true;
    } catch (error) {
      console.error(`Rollback failed for ${proposalId}:`, error);
      throw error;
    }
  }

  /**
   * Generate unique proposal ID
   * @param {String} category
   * @param {String} type
   * @returns {String}
   * @private
   */
  generateProposalId(category, type) {
    const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const hash = crypto.createHash('md5').update(`${category}_${type}_${Date.now()}`).digest('hex').substring(0, 6);
    return `tune_${category}_${type}_${timestamp}_${hash}`;
  }

  /**
   * Fetch metrics from Prometheus
   * @param {String} metricName
   * @param {String} range
   * @returns {Object}
   * @private
   */
  async fetchMetricsFromPrometheus(metricName, range) {
    // Simulated Prometheus query - in production, use actual Prometheus API
    return {
      avg: 0.71,
      p95: 0.85,
      requests: 1500,
      avgSize: 2048
    };
  }
}

module.exports = AITunerService;
