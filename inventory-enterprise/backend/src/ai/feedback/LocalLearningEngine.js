/**
 * LocalLearningEngine - Self-Learning Feedback System
 * Captures owner actions and continuously improves system intelligence
 *
 * @version 3.0.0
 * @author NeuroInnovate AI Team
 */

const { logger } = require('../../config/logger');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

class LocalLearningEngine {
  constructor() {
    this.dbPath = path.join(__dirname, '../../../db/learning_engine.db');
    this.db = null;
    this.learningQueue = [];
    this.insights = new Map();
    this.initialized = false;
  }

  /**
   * Initialize learning engine and database
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Open learning database
      this.db = await open({
        filename: this.dbPath,
        driver: sqlite3.Database
      });

      // Create schema
      await this.createSchema();

      // Start analysis worker
      this.startAnalysisWorker();

      this.initialized = true;
      logger.info('LocalLearningEngine initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize LocalLearningEngine:', error);
      throw error;
    }
  }

  /**
   * Create learning database schema
   */
  async createSchema() {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS learning_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        action TEXT NOT NULL,
        payload TEXT NOT NULL,
        outcome TEXT,
        confidence REAL DEFAULT 0.0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_learning_events_type ON learning_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_learning_events_processed ON learning_events(processed);
      CREATE INDEX IF NOT EXISTS idx_learning_events_created ON learning_events(created_at DESC);

      CREATE TABLE IF NOT EXISTS learned_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_type TEXT NOT NULL,
        pattern_key TEXT NOT NULL,
        pattern_data TEXT NOT NULL,
        confidence REAL NOT NULL,
        sample_count INTEGER DEFAULT 1,
        last_reinforced TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(pattern_type, pattern_key)
      );

      CREATE INDEX IF NOT EXISTS idx_learned_patterns_type ON learned_patterns(pattern_type);
      CREATE INDEX IF NOT EXISTS idx_learned_patterns_confidence ON learned_patterns(confidence DESC);

      CREATE TABLE IF NOT EXISTS learning_insights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        insight_type TEXT NOT NULL,
        insight_title TEXT NOT NULL,
        insight_description TEXT NOT NULL,
        impact_score REAL NOT NULL,
        actionable INTEGER DEFAULT 1,
        applied INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_learning_insights_impact ON learning_insights(impact_score DESC);
      CREATE INDEX IF NOT EXISTS idx_learning_insights_applied ON learning_insights(applied);

      CREATE TABLE IF NOT EXISTS policy_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        policy_type TEXT NOT NULL,
        policy_name TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT NOT NULL,
        reason TEXT NOT NULL,
        applied_by TEXT DEFAULT 'LocalLearningEngine',
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_policy_updates_type ON policy_updates(policy_type);
    `);
  }

  /**
   * Capture learning event
   * @param {string} eventType - Type of event (count_correction, pdf_upload, location_update, etc.)
   * @param {Object} payload - Event data
   */
  async captureEvent(eventType, payload) {
    try {
      const event = {
        event_type: eventType,
        entity_type: payload.entityType || 'unknown',
        entity_id: payload.entityId || null,
        action: payload.action || 'unknown',
        payload: JSON.stringify(payload),
        outcome: payload.outcome || null,
        confidence: payload.confidence || 0.0
      };

      // Add to queue for batch processing
      this.learningQueue.push(event);

      // Flush queue if large enough
      if (this.learningQueue.length >= 10) {
        await this.flushQueue();
      }

      logger.debug(`Learning event captured: ${eventType}`);
    } catch (error) {
      logger.error('Failed to capture learning event:', error);
    }
  }

  /**
   * Flush learning queue to database
   */
  async flushQueue() {
    if (this.learningQueue.length === 0) return;

    const events = [...this.learningQueue];
    this.learningQueue = [];

    try {
      const stmt = await this.db.prepare(`
        INSERT INTO learning_events (event_type, entity_type, entity_id, action, payload, outcome, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const event of events) {
        await stmt.run(
          event.event_type,
          event.entity_type,
          event.entity_id,
          event.action,
          event.payload,
          event.outcome,
          event.confidence
        );
      }

      await stmt.finalize();
      logger.debug(`Flushed ${events.length} learning events to database`);
    } catch (error) {
      logger.error('Failed to flush learning queue:', error);
      // Re-add events to queue on failure
      this.learningQueue.unshift(...events);
    }
  }

  /**
   * Analyze trends and patterns in learning data
   */
  async analyzeTrends() {
    try {
      const trends = {
        countCorrections: await this.analyzeCountCorrections(),
        pdfPatterns: await this.analyzePdfPatterns(),
        locationUsage: await this.analyzeLocationUsage(),
        aiAccuracy: await this.analyzeAIAccuracy()
      };

      logger.info('Learning trends analyzed:', {
        countCorrections: trends.countCorrections.length,
        pdfPatterns: trends.pdfPatterns.length,
        locationUsage: trends.locationUsage.length,
        aiAccuracy: trends.aiAccuracy.accuracyRate
      });

      return trends;
    } catch (error) {
      logger.error('Failed to analyze trends:', error);
      return null;
    }
  }

  /**
   * Analyze count corrections to learn optimal par levels
   */
  async analyzeCountCorrections() {
    const corrections = await this.db.all(`
      SELECT
        json_extract(payload, '$.itemCode') as item_code,
        json_extract(payload, '$.originalCount') as original_count,
        json_extract(payload, '$.correctedCount') as corrected_count,
        json_extract(payload, '$.variance') as variance
      FROM learning_events
      WHERE event_type = 'count_correction'
      AND processed = 0
      ORDER BY created_at DESC
      LIMIT 100
    `);

    // Learn patterns from corrections
    const patterns = new Map();

    for (const correction of corrections) {
      if (!patterns.has(correction.item_code)) {
        patterns.set(correction.item_code, {
          itemCode: correction.item_code,
          corrections: [],
          avgVariance: 0
        });
      }

      const pattern = patterns.get(correction.item_code);
      pattern.corrections.push({
        original: parseFloat(correction.original_count),
        corrected: parseFloat(correction.corrected_count),
        variance: parseFloat(correction.variance)
      });
    }

    // Calculate averages and save patterns
    const learnedPatterns = [];

    for (const [itemCode, pattern] of patterns) {
      const avgVariance = pattern.corrections.reduce((sum, c) => sum + c.variance, 0) / pattern.corrections.length;

      if (Math.abs(avgVariance) > 5) { // Significant variance threshold
        await this.savePattern('count_variance', itemCode, {
          itemCode,
          avgVariance,
          sampleCount: pattern.corrections.length
        }, 0.8);

        learnedPatterns.push({
          itemCode,
          avgVariance,
          sampleCount: pattern.corrections.length
        });
      }
    }

    return learnedPatterns;
  }

  /**
   * Analyze PDF upload patterns
   */
  async analyzePdfPatterns() {
    const uploads = await this.db.all(`
      SELECT
        json_extract(payload, '$.documentType') as doc_type,
        json_extract(payload, '$.sizeBytes') as size_bytes,
        COUNT(*) as count
      FROM learning_events
      WHERE event_type = 'pdf_upload'
      GROUP BY doc_type
      ORDER BY count DESC
    `);

    return uploads;
  }

  /**
   * Analyze location usage patterns
   */
  async analyzeLocationUsage() {
    const usage = await this.db.all(`
      SELECT
        json_extract(payload, '$.locationId') as location_id,
        json_extract(payload, '$.itemCode') as item_code,
        COUNT(*) as access_count
      FROM learning_events
      WHERE event_type = 'location_access'
      GROUP BY location_id, item_code
      ORDER BY access_count DESC
      LIMIT 50
    `);

    return usage;
  }

  /**
   * Analyze AI prediction accuracy
   */
  async analyzeAIAccuracy() {
    const predictions = await this.db.all(`
      SELECT
        outcome,
        COUNT(*) as count
      FROM learning_events
      WHERE event_type = 'ai_prediction'
      AND outcome IS NOT NULL
      GROUP BY outcome
    `);

    const total = predictions.reduce((sum, p) => sum + p.count, 0);
    const successful = predictions.find(p => p.outcome === 'accurate')?.count || 0;
    const accuracyRate = total > 0 ? (successful / total) : 0;

    return {
      total,
      successful,
      accuracyRate,
      breakdown: predictions
    };
  }

  /**
   * Save learned pattern
   */
  async savePattern(patternType, patternKey, patternData, confidence) {
    try {
      await this.db.run(`
        INSERT INTO learned_patterns (pattern_type, pattern_key, pattern_data, confidence, sample_count)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(pattern_type, pattern_key) DO UPDATE SET
          pattern_data = excluded.pattern_data,
          confidence = excluded.confidence,
          sample_count = sample_count + 1,
          last_reinforced = CURRENT_TIMESTAMP
      `, [patternType, patternKey, JSON.stringify(patternData), confidence, 1]);
    } catch (error) {
      logger.error('Failed to save pattern:', error);
    }
  }

  /**
   * Generate actionable insights
   */
  async generateInsights() {
    try {
      const trends = await this.analyzeTrends();
      const insights = [];

      // Generate insights from count corrections
      if (trends.countCorrections.length > 0) {
        for (const correction of trends.countCorrections) {
          insights.push({
            insight_type: 'count_optimization',
            insight_title: `Adjust Par Level for ${correction.itemCode}`,
            insight_description: `Item consistently has ${correction.avgVariance > 0 ? 'excess' : 'shortage'} of ${Math.abs(correction.avgVariance).toFixed(1)} units`,
            impact_score: Math.min(Math.abs(correction.avgVariance) / 10, 1.0),
            actionable: 1
          });
        }
      }

      // Generate insights from AI accuracy
      if (trends.aiAccuracy.accuracyRate < 0.85) {
        insights.push({
          insight_type: 'ai_tuning',
          insight_title: 'AI Prediction Accuracy Below Target',
          insight_description: `Current accuracy: ${(trends.aiAccuracy.accuracyRate * 100).toFixed(1)}%. Recommend retraining with recent data.`,
          impact_score: 0.9,
          actionable: 1
        });
      }

      // Save insights to database
      for (const insight of insights) {
        await this.db.run(`
          INSERT INTO learning_insights (insight_type, insight_title, insight_description, impact_score, actionable)
          VALUES (?, ?, ?, ?, ?)
        `, [
          insight.insight_type,
          insight.insight_title,
          insight.insight_description,
          insight.impact_score,
          insight.actionable
        ]);
      }

      logger.info(`Generated ${insights.length} new insights`);
      return insights;
    } catch (error) {
      logger.error('Failed to generate insights:', error);
      return [];
    }
  }

  /**
   * Update system policy based on learned patterns
   */
  async updatePolicy(policyType, policyName, newValue, reason) {
    try {
      await this.db.run(`
        INSERT INTO policy_updates (policy_type, policy_name, new_value, reason)
        VALUES (?, ?, ?, ?)
      `, [policyType, policyName, JSON.stringify(newValue), reason]);

      logger.info(`Policy updated: ${policyType}.${policyName}`);
      return true;
    } catch (error) {
      logger.error('Failed to update policy:', error);
      return false;
    }
  }

  /**
   * Export learning snapshot for owner review
   */
  async exportLearningSnapshot() {
    try {
      const snapshot = {
        timestamp: new Date().toISOString(),
        stats: {
          totalEvents: await this.db.get('SELECT COUNT(*) as count FROM learning_events'),
          totalPatterns: await this.db.get('SELECT COUNT(*) as count FROM learned_patterns'),
          totalInsights: await this.db.get('SELECT COUNT(*) as count FROM learning_insights WHERE applied = 0'),
          policyUpdates: await this.db.get('SELECT COUNT(*) as count FROM policy_updates')
        },
        recentPatterns: await this.db.all(`
          SELECT * FROM learned_patterns
          ORDER BY last_reinforced DESC
          LIMIT 20
        `),
        pendingInsights: await this.db.all(`
          SELECT * FROM learning_insights
          WHERE applied = 0
          ORDER BY impact_score DESC
          LIMIT 10
        `),
        recentPolicies: await this.db.all(`
          SELECT * FROM policy_updates
          ORDER BY applied_at DESC
          LIMIT 10
        `)
      };

      return snapshot;
    } catch (error) {
      logger.error('Failed to export learning snapshot:', error);
      return null;
    }
  }

  /**
   * Start background analysis worker
   */
  startAnalysisWorker() {
    // Run analysis every 5 minutes
    setInterval(async () => {
      try {
        await this.flushQueue();
        await this.analyzeTrends();
        await this.generateInsights();
      } catch (error) {
        logger.error('Analysis worker error:', error);
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Get learning statistics
   */
  async getStats() {
    if (!this.initialized) return null;

    try {
      const stats = {
        totalEvents: (await this.db.get('SELECT COUNT(*) as count FROM learning_events')).count,
        processedEvents: (await this.db.get('SELECT COUNT(*) as count FROM learning_events WHERE processed = 1')).count,
        learnedPatterns: (await this.db.get('SELECT COUNT(*) as count FROM learned_patterns')).count,
        activeInsights: (await this.db.get('SELECT COUNT(*) as count FROM learning_insights WHERE applied = 0')).count,
        policyUpdates: (await this.db.get('SELECT COUNT(*) as count FROM policy_updates')).count,
        queueSize: this.learningQueue.length
      };

      return stats;
    } catch (error) {
      logger.error('Failed to get stats:', error);
      return null;
    }
  }
}

// Singleton instance
const learningEngine = new LocalLearningEngine();

module.exports = learningEngine;
