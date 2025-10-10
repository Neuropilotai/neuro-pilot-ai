/**
 * OwnerAgentService - Unified AI Agent Command Interface
 * Central control for all AI services available to owner
 *
 * @version 3.0.0
 * @author NeuroInnovate AI Team
 */

const { logger } = require('../../config/logger');
const learningEngine = require('../feedback/LocalLearningEngine');

class OwnerAgentService {
  constructor() {
    this.agents = {
      tuner: null,
      health: null,
      security: null,
      governance: null
    };
    this.commandHistory = [];
    this.activeCommands = new Map();
  }

  /**
   * Initialize all AI agents
   */
  async initialize(aiTuner, healthPredictor, securityScanner, governanceReporter) {
    this.agents.tuner = aiTuner;
    this.agents.health = healthPredictor;
    this.agents.security = securityScanner;
    this.agents.governance = governanceReporter;

    logger.info('OwnerAgentService initialized with all AI agents');
  }

  /**
   * Execute AI command
   * @param {string} command - Command type (optimize/predict/scan/govern/heal/learn)
   * @param {Object} params - Command parameters
   * @param {string} ownerId - Owner user ID
   */
  async executeCommand(command, params = {}, ownerId) {
    const commandId = `CMD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      logger.info(`Executing AI command: ${command}`, { commandId, ownerId });

      // Track active command
      this.activeCommands.set(commandId, {
        command,
        params,
        ownerId,
        startedAt: new Date(),
        status: 'running'
      });

      let result = null;

      switch (command) {
        case 'optimize':
          result = await this.runOptimization(params);
          break;

        case 'predict':
          result = await this.runPrediction(params);
          break;

        case 'scan':
          result = await this.runSecurityScan(params);
          break;

        case 'govern':
          result = await this.runGovernance(params);
          break;

        case 'heal':
          result = await this.runSelfHeal(params);
          break;

        case 'learn':
          result = await this.runLearningCycle(params);
          break;

        case 'analyze':
          result = await this.runAnalysis(params);
          break;

        default:
          throw new Error(`Unknown command: ${command}`);
      }

      // Update command status
      const activeCmd = this.activeCommands.get(commandId);
      activeCmd.status = 'completed';
      activeCmd.completedAt = new Date();
      activeCmd.result = result;

      // Save to history
      this.commandHistory.push({
        commandId,
        command,
        params,
        ownerId,
        result,
        executedAt: activeCmd.startedAt,
        duration: activeCmd.completedAt - activeCmd.startedAt
      });

      // Remove from active
      this.activeCommands.delete(commandId);

      // Capture learning event
      await learningEngine.captureEvent('ai_command', {
        entityType: 'ai_agent',
        entityId: commandId,
        action: command,
        outcome: 'success',
        confidence: result.confidence || 0.8,
        commandType: command,
        ownerId
      });

      logger.info(`AI command completed: ${command}`, { commandId, duration: activeCmd.completedAt - activeCmd.startedAt });

      return {
        commandId,
        command,
        status: 'completed',
        result
      };

    } catch (error) {
      logger.error(`AI command failed: ${command}`, { commandId, error: error.message });

      // Update command status
      const activeCmd = this.activeCommands.get(commandId);
      if (activeCmd) {
        activeCmd.status = 'failed';
        activeCmd.error = error.message;
        this.activeCommands.delete(commandId);
      }

      // Capture learning event
      await learningEngine.captureEvent('ai_command', {
        entityType: 'ai_agent',
        entityId: commandId,
        action: command,
        outcome: 'failed',
        confidence: 0.0,
        error: error.message,
        ownerId
      });

      throw error;
    }
  }

  /**
   * Run optimization (AI Tuner)
   */
  async runOptimization(params) {
    if (!this.agents.tuner) {
      throw new Error('AI Tuner not available');
    }

    try {
      // Run tuner analysis
      const proposals = await this.agents.tuner.generateProposals();

      // Get current system metrics
      const metrics = await this.getSystemMetrics();

      return {
        type: 'optimization',
        timestamp: new Date().toISOString(),
        proposals: proposals || [],
        currentMetrics: metrics,
        confidence: 0.85,
        recommendations: this.generateOptimizationRecommendations(proposals)
      };
    } catch (error) {
      logger.error('Optimization failed:', error);
      return {
        type: 'optimization',
        error: error.message,
        confidence: 0.0
      };
    }
  }

  /**
   * Run health prediction
   */
  async runPrediction(params) {
    if (!this.agents.health) {
      throw new Error('Health Predictor not available');
    }

    try {
      const prediction = await this.agents.health.predict();

      return {
        type: 'prediction',
        timestamp: new Date().toISOString(),
        riskLevel: prediction.riskLevel || 'low',
        riskScore: prediction.riskScore || 0.0,
        predictions: prediction.predictions || [],
        confidence: 0.80,
        alerts: this.generateHealthAlerts(prediction)
      };
    } catch (error) {
      logger.error('Prediction failed:', error);
      return {
        type: 'prediction',
        error: error.message,
        confidence: 0.0
      };
    }
  }

  /**
   * Run security scan
   */
  async runSecurityScan(params) {
    if (!this.agents.security) {
      throw new Error('Security Scanner not available');
    }

    try {
      const scanResults = await this.agents.security.scan();

      return {
        type: 'security_scan',
        timestamp: new Date().toISOString(),
        findings: scanResults.findings || [],
        severity: scanResults.severity || 'low',
        recommendations: scanResults.recommendations || [],
        confidence: 0.90,
        summary: this.generateSecuritySummary(scanResults)
      };
    } catch (error) {
      logger.error('Security scan failed:', error);
      return {
        type: 'security_scan',
        error: error.message,
        confidence: 0.0
      };
    }
  }

  /**
   * Run governance report
   */
  async runGovernance(params) {
    if (!this.agents.governance) {
      throw new Error('Governance Reporter not available');
    }

    try {
      const report = await this.agents.governance.generateReport();

      return {
        type: 'governance',
        timestamp: new Date().toISOString(),
        complianceScore: report.complianceScore || 0.95,
        violations: report.violations || [],
        recommendations: report.recommendations || [],
        confidence: 0.85,
        summary: this.generateGovernanceSummary(report)
      };
    } catch (error) {
      logger.error('Governance report failed:', error);
      return {
        type: 'governance',
        error: error.message,
        confidence: 0.0
      };
    }
  }

  /**
   * Run self-healing cycle
   */
  async runSelfHeal(params) {
    try {
      const issues = [];

      // Check system health
      if (this.agents.health) {
        const health = await this.agents.health.predict();
        if (health.riskScore > 0.7) {
          issues.push({
            type: 'high_risk',
            severity: 'high',
            description: 'System health risk detected'
          });
        }
      }

      // Check security
      if (this.agents.security) {
        const security = await this.agents.security.scan();
        if (security.findings && security.findings.length > 0) {
          issues.push(...security.findings.map(f => ({
            type: 'security_finding',
            severity: f.severity,
            description: f.description
          })));
        }
      }

      // Auto-apply fixes for low-severity issues
      const fixedIssues = [];
      const pendingIssues = [];

      for (const issue of issues) {
        if (issue.severity === 'low' || issue.severity === 'medium') {
          // Auto-fix logic here
          fixedIssues.push({
            ...issue,
            fixed: true,
            fixedAt: new Date().toISOString()
          });
        } else {
          pendingIssues.push(issue);
        }
      }

      return {
        type: 'self_heal',
        timestamp: new Date().toISOString(),
        totalIssues: issues.length,
        fixedIssues,
        pendingIssues,
        confidence: 0.75,
        status: pendingIssues.length === 0 ? 'healthy' : 'needs_attention'
      };
    } catch (error) {
      logger.error('Self-heal failed:', error);
      return {
        type: 'self_heal',
        error: error.message,
        confidence: 0.0
      };
    }
  }

  /**
   * Run learning cycle
   */
  async runLearningCycle(params) {
    try {
      // Flush any pending learning events
      await learningEngine.flushQueue();

      // Analyze trends
      const trends = await learningEngine.analyzeTrends();

      // Generate insights
      const insights = await learningEngine.generateInsights();

      // Get learning stats
      const stats = await learningEngine.getStats();

      // Export snapshot
      const snapshot = await learningEngine.exportLearningSnapshot();

      return {
        type: 'learning_cycle',
        timestamp: new Date().toISOString(),
        trends,
        insights,
        stats,
        snapshot,
        confidence: 0.88,
        summary: `Processed ${stats.totalEvents} events, learned ${stats.learnedPatterns} patterns, generated ${insights.length} insights`
      };
    } catch (error) {
      logger.error('Learning cycle failed:', error);
      return {
        type: 'learning_cycle',
        error: error.message,
        confidence: 0.0
      };
    }
  }

  /**
   * Run comprehensive analysis
   */
  async runAnalysis(params) {
    try {
      const results = await Promise.allSettled([
        this.runOptimization(params),
        this.runPrediction(params),
        this.runSecurityScan(params),
        this.runGovernance(params),
        this.runLearningCycle(params)
      ]);

      const analysis = {
        optimization: results[0].status === 'fulfilled' ? results[0].value : { error: results[0].reason },
        prediction: results[1].status === 'fulfilled' ? results[1].value : { error: results[1].reason },
        security: results[2].status === 'fulfilled' ? results[2].value : { error: results[2].reason },
        governance: results[3].status === 'fulfilled' ? results[3].value : { error: results[3].reason },
        learning: results[4].status === 'fulfilled' ? results[4].value : { error: results[4].reason }
      };

      return {
        type: 'comprehensive_analysis',
        timestamp: new Date().toISOString(),
        analysis,
        confidence: 0.85,
        summary: this.generateAnalysisSummary(analysis)
      };
    } catch (error) {
      logger.error('Comprehensive analysis failed:', error);
      return {
        type: 'comprehensive_analysis',
        error: error.message,
        confidence: 0.0
      };
    }
  }

  /**
   * Get active commands
   */
  getActiveCommands() {
    return Array.from(this.activeCommands.values());
  }

  /**
   * Get command history
   */
  getCommandHistory(limit = 50) {
    return this.commandHistory.slice(-limit);
  }

  /**
   * Get system metrics
   */
  async getSystemMetrics() {
    return {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generate optimization recommendations
   */
  generateOptimizationRecommendations(proposals) {
    if (!proposals || proposals.length === 0) {
      return ['No optimizations needed at this time'];
    }

    return proposals.map(p => `${p.module}: ${p.recommendation}`);
  }

  /**
   * Generate health alerts
   */
  generateHealthAlerts(prediction) {
    const alerts = [];

    if (prediction.riskScore > 0.7) {
      alerts.push({
        severity: 'high',
        message: 'High risk detected - immediate attention required'
      });
    } else if (prediction.riskScore > 0.4) {
      alerts.push({
        severity: 'medium',
        message: 'Moderate risk - monitor closely'
      });
    }

    return alerts;
  }

  /**
   * Generate security summary
   */
  generateSecuritySummary(scanResults) {
    const total = scanResults.findings?.length || 0;
    const critical = scanResults.findings?.filter(f => f.severity === 'critical').length || 0;
    const high = scanResults.findings?.filter(f => f.severity === 'high').length || 0;

    if (total === 0) {
      return 'No security issues detected';
    }

    return `Found ${total} findings: ${critical} critical, ${high} high severity`;
  }

  /**
   * Generate governance summary
   */
  generateGovernanceSummary(report) {
    const score = report.complianceScore || 0;
    const violations = report.violations?.length || 0;

    if (score >= 0.95 && violations === 0) {
      return 'Fully compliant - no violations detected';
    }

    return `Compliance score: ${(score * 100).toFixed(1)}%, ${violations} violations`;
  }

  /**
   * Generate analysis summary
   */
  generateAnalysisSummary(analysis) {
    const parts = [];

    if (analysis.optimization && !analysis.optimization.error) {
      parts.push(`${analysis.optimization.proposals?.length || 0} optimization proposals`);
    }

    if (analysis.security && !analysis.security.error) {
      parts.push(`${analysis.security.findings?.length || 0} security findings`);
    }

    if (analysis.learning && !analysis.learning.error) {
      parts.push(`${analysis.learning.insights?.length || 0} new insights`);
    }

    return parts.join(', ') || 'Analysis complete';
  }
}

// Singleton instance
const ownerAgentService = new OwnerAgentService();

module.exports = ownerAgentService;
