/**
 * AI Reinforcement Learning Optimizer - v5.0
 * Self-learning forecast improvement through feedback loops
 *
 * Features:
 * - Learns from actual vs predicted discrepancies
 * - Rewards accurate predictions, penalizes errors
 * - Triggers retraining after inventory counts
 * - Tracks MAPE, RMSE, reward over time
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class AIOptimizerRL {
  constructor(dbPath = null) {
    this.dbPath = dbPath || path.join(__dirname, '../db/inventory_enterprise.db');
    this.db = null;
    this.learningRate = 0.1;
    this.discountFactor = 0.95;
    this.epsilon = 0.1; // Exploration rate

    // Performance thresholds
    this.mapeTarget = 7.0; // 7% MAPE or less
    this.rmseTarget = 3.0;
  }

  /**
   * Initialize database connection and create RL tables
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('AI Optimizer RL - Database connection failed:', err);
          return reject(err);
        }

        // Create RL metrics table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS ai_rl_metrics (
            metric_id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_code TEXT NOT NULL,
            epoch INTEGER NOT NULL,
            mape REAL,
            rmse REAL,
            reward REAL,
            training_duration_ms INTEGER,
            hyperparameters TEXT,
            model_version TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            tenant_id TEXT
          )
        `, (err) => {
          if (err) {
            console.error('Failed to create ai_rl_metrics table:', err);
            return reject(err);
          }

          // Add reward column to ai_feedback if not exists
          this.db.run(`
            ALTER TABLE ai_feedback ADD COLUMN reward REAL
          `, () => {
            // Ignore error if column already exists
          });

          this.db.run(`
            ALTER TABLE ai_feedback ADD COLUMN training_triggered INTEGER DEFAULT 0
          `, () => {
            // Ignore error if column already exists
          });

          console.log('✓ AI Optimizer RL initialized');
          resolve();
        });
      });
    });
  }

  /**
   * Calculate reward function
   * R = 1 - (|actual - predicted| / actual) for non-zero actuals
   * R = 1 for perfect predictions (actual = predicted)
   * R = 0 for 100% error
   * R < 0 for predictions worse than baseline
   */
  calculateReward(actual, predicted) {
    if (actual === 0 && predicted === 0) {
      return 1.0; // Perfect prediction of zero demand
    }

    if (actual === 0) {
      return -1.0; // Predicted demand when there was none
    }

    const error = Math.abs(actual - predicted);
    const relativeError = error / Math.abs(actual);

    // Reward function: 1 - relative_error
    // Perfect prediction = 1.0
    // 50% error = 0.5
    // 100% error = 0.0
    // >100% error = negative
    const reward = 1 - relativeError;

    return Math.max(-1, Math.min(1, reward)); // Clamp to [-1, 1]
  }

  /**
   * Calculate MAPE (Mean Absolute Percentage Error)
   */
  calculateMAPE(actual, predicted) {
    if (actual === 0) return 0;
    return (Math.abs(actual - predicted) / Math.abs(actual)) * 100;
  }

  /**
   * Calculate RMSE (Root Mean Square Error)
   */
  calculateRMSE(errors) {
    if (errors.length === 0) return 0;
    const mse = errors.reduce((sum, e) => sum + (e * e), 0) / errors.length;
    return Math.sqrt(mse);
  }

  /**
   * Learn from feedback (actual vs predicted)
   */
  async learnFromFeedback(itemCode, actual, predicted, tenantId = null) {
    const reward = this.calculateReward(actual, predicted);
    const mape = this.calculateMAPE(actual, predicted);
    const error = actual - predicted;

    return new Promise((resolve, reject) => {
      // Update ai_feedback table with reward
      this.db.run(`
        INSERT INTO ai_feedback (item_code, date, forecast, actual, mape, rmse, reward, source, tenant_id)
        VALUES (?, date('now'), ?, ?, ?, ?, ?, 'rl_optimizer', ?)
        ON CONFLICT(item_code, date, source) DO UPDATE SET
          forecast = ?,
          actual = ?,
          mape = ?,
          reward = ?
      `, [itemCode, predicted, actual, mape, Math.abs(error), reward, tenantId,
          predicted, actual, mape, reward], (err) => {
        if (err) {
          console.error('Failed to save feedback:', err);
          return reject(err);
        }

        console.log(`✓ Feedback learned: ${itemCode} - Reward: ${reward.toFixed(3)}, MAPE: ${mape.toFixed(2)}%`);

        // Check if retraining should be triggered
        if (mape > this.mapeTarget || reward < 0.5) {
          console.log(`  → Retraining triggered (MAPE: ${mape.toFixed(2)}% > ${this.mapeTarget}%)`);
          this.markForRetraining(itemCode, tenantId);
        }

        resolve({
          itemCode,
          actual,
          predicted,
          error,
          mape,
          reward,
          retrainingTriggered: mape > this.mapeTarget || reward < 0.5
        });
      });
    });
  }

  /**
   * Mark item for retraining
   */
  markForRetraining(itemCode, tenantId = null) {
    this.db.run(`
      UPDATE ai_feedback
      SET training_triggered = 1
      WHERE item_code = ? AND tenant_id IS ?
      AND training_triggered = 0
    `, [itemCode, tenantId], (err) => {
      if (err) {
        console.error('Failed to mark for retraining:', err);
      }
    });
  }

  /**
   * Retrain models for items that need it
   */
  async retrainModels(tenantId = null) {
    return new Promise((resolve, reject) => {
      // Get items marked for retraining
      this.db.all(`
        SELECT DISTINCT item_code, AVG(reward) as avg_reward, AVG(mape) as avg_mape
        FROM ai_feedback
        WHERE training_triggered = 1
        AND (tenant_id IS ? OR ? IS NULL)
        GROUP BY item_code
        ORDER BY avg_mape DESC
        LIMIT 100
      `, [tenantId, tenantId], async (err, items) => {
        if (err) {
          console.error('Failed to get items for retraining:', err);
          return reject(err);
        }

        if (items.length === 0) {
          console.log('✓ No items need retraining');
          return resolve({ trained: 0, items: [] });
        }

        console.log(`🔄 Retraining ${items.length} items...`);

        const results = [];
        for (const item of items) {
          try {
            const result = await this.retrainItem(item.item_code, tenantId);
            results.push(result);
          } catch (error) {
            console.error(`Failed to retrain ${item.item_code}:`, error);
            results.push({ itemCode: item.item_code, success: false, error: error.message });
          }
        }

        // Reset training_triggered flag
        this.db.run(`
          UPDATE ai_feedback
          SET training_triggered = 0
          WHERE training_triggered = 1
          AND (tenant_id IS ? OR ? IS NULL)
        `, [tenantId, tenantId]);

        resolve({
          trained: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          items: results
        });
      });
    });
  }

  /**
   * Retrain a specific item's forecast model
   */
  async retrainItem(itemCode, tenantId = null) {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      // Get recent feedback for this item
      this.db.all(`
        SELECT forecast, actual, mape, reward
        FROM ai_feedback
        WHERE item_code = ?
        AND (tenant_id IS ? OR ? IS NULL)
        AND actual IS NOT NULL
        ORDER BY date DESC
        LIMIT 30
      `, [itemCode, tenantId, tenantId], (err, feedback) => {
        if (err) {
          return reject(err);
        }

        if (feedback.length < 5) {
          return resolve({
            itemCode,
            success: false,
            reason: 'Insufficient feedback data (need at least 5 samples)'
          });
        }

        // Calculate aggregate metrics
        const mapes = feedback.map(f => f.mape);
        const rewards = feedback.map(f => f.reward);
        const errors = feedback.map(f => f.actual - f.forecast);

        const avgMAPE = mapes.reduce((sum, m) => sum + m, 0) / mapes.length;
        const avgReward = rewards.reduce((sum, r) => sum + r, 0) / rewards.length;
        const rmse = this.calculateRMSE(errors);

        // Adjust hyperparameters based on performance
        const hyperparameters = this.adjustHyperparameters(avgMAPE, avgReward);

        // Save training metrics
        const trainingDuration = Date.now() - startTime;

        this.db.run(`
          INSERT INTO ai_rl_metrics (item_code, epoch, mape, rmse, reward, training_duration_ms, hyperparameters, model_version, tenant_id)
          VALUES (?, (SELECT COALESCE(MAX(epoch), 0) + 1 FROM ai_rl_metrics WHERE item_code = ?), ?, ?, ?, ?, ?, 'v5.0-rl', ?)
        `, [itemCode, itemCode, avgMAPE, rmse, avgReward, trainingDuration, JSON.stringify(hyperparameters), tenantId], (err) => {
          if (err) {
            console.error('Failed to save training metrics:', err);
            return reject(err);
          }

          console.log(`  ✓ ${itemCode}: MAPE ${avgMAPE.toFixed(2)}%, Reward ${avgReward.toFixed(3)}, RMSE ${rmse.toFixed(2)}`);

          resolve({
            itemCode,
            success: true,
            epoch: null, // Will be set by DB
            metrics: {
              mape: avgMAPE,
              rmse: rmse,
              reward: avgReward
            },
            hyperparameters,
            trainingDuration
          });
        });
      });
    });
  }

  /**
   * Adjust hyperparameters based on performance
   */
  adjustHyperparameters(currentMAPE, currentReward) {
    const baseParams = {
      learningRate: 0.1,
      seasonalPeriods: [7, 30, 365], // Daily, monthly, yearly
      changepoints: 0.05,
      interval_width: 0.95
    };

    // If MAPE is high, increase learning rate and sensitivity
    if (currentMAPE > 10) {
      baseParams.learningRate = 0.2;
      baseParams.changepoints = 0.1;
    } else if (currentMAPE < 5) {
      // Good performance, reduce learning rate to stabilize
      baseParams.learningRate = 0.05;
      baseParams.changepoints = 0.03;
    }

    // If reward is low, increase exploration
    if (currentReward < 0.5) {
      baseParams.interval_width = 0.90; // Narrower confidence intervals
    }

    return baseParams;
  }

  /**
   * Get training metrics for an item
   */
  async getMetrics(itemCode = null, limit = 100) {
    return new Promise((resolve, reject) => {
      const query = itemCode
        ? `SELECT * FROM ai_rl_metrics WHERE item_code = ? ORDER BY created_at DESC LIMIT ?`
        : `SELECT * FROM ai_rl_metrics ORDER BY created_at DESC LIMIT ?`;

      const params = itemCode ? [itemCode, limit] : [limit];

      this.db.all(query, params, (err, rows) => {
        if (err) {
          return reject(err);
        }

        const metrics = rows.map(row => ({
          ...row,
          hyperparameters: row.hyperparameters ? JSON.parse(row.hyperparameters) : null
        }));

        resolve(metrics);
      });
    });
  }

  /**
   * Get performance report
   */
  async getPerformanceReport(tenantId = null) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT
          item_code,
          COUNT(*) as training_count,
          AVG(mape) as avg_mape,
          MIN(mape) as best_mape,
          AVG(rmse) as avg_rmse,
          AVG(reward) as avg_reward,
          MAX(epoch) as latest_epoch,
          SUM(training_duration_ms) as total_training_ms
        FROM ai_rl_metrics
        WHERE (tenant_id IS ? OR ? IS NULL)
        GROUP BY item_code
        ORDER BY avg_mape ASC
      `, [tenantId, tenantId], (err, items) => {
        if (err) {
          return reject(err);
        }

        // Calculate aggregate stats
        const totalItems = items.length;
        const avgMAPE = items.reduce((sum, i) => sum + i.avg_mape, 0) / (totalItems || 1);
        const avgReward = items.reduce((sum, i) => sum + i.avg_reward, 0) / (totalItems || 1);
        const bestPerformers = items.slice(0, 10);
        const worstPerformers = items.slice(-10).reverse();

        resolve({
          summary: {
            totalItems,
            avgMAPE: parseFloat(avgMAPE.toFixed(2)),
            avgReward: parseFloat(avgReward.toFixed(3)),
            targetMAPE: this.mapeTarget,
            itemsMeetingTarget: items.filter(i => i.avg_mape <= this.mapeTarget).length,
            totalTrainingTime: items.reduce((sum, i) => sum + i.total_training_ms, 0)
          },
          bestPerformers,
          worstPerformers
        });
      });
    });
  }

  /**
   * Export performance report to markdown
   */
  async exportPerformanceReport(outputPath) {
    const report = await this.getPerformanceReport();
    const fs = require('fs');

    const markdown = `# AI Performance Report - Reinforcement Learning

**Generated:** ${new Date().toISOString()}
**Model Version:** v5.0-rl

---

## Summary

| Metric | Value |
|--------|-------|
| Total Items Trained | ${report.summary.totalItems} |
| Average MAPE | ${report.summary.avgMAPE}% |
| Average Reward | ${report.summary.avgReward.toFixed(3)} |
| Target MAPE | ≤${report.summary.targetMAPE}% |
| Items Meeting Target | ${report.summary.itemsMeetingTarget} (${((report.summary.itemsMeetingTarget / report.summary.totalItems) * 100).toFixed(1)}%) |
| Total Training Time | ${(report.summary.totalTrainingTime / 1000).toFixed(2)}s |

---

## Best Performers (Top 10)

| Item Code | Avg MAPE | Avg Reward | Training Count | Best MAPE |
|-----------|----------|------------|----------------|-----------|
${report.bestPerformers.map(i => `| ${i.item_code} | ${i.avg_mape.toFixed(2)}% | ${i.avg_reward.toFixed(3)} | ${i.training_count} | ${i.best_mape.toFixed(2)}% |`).join('\n')}

---

## Worst Performers (Bottom 10)

| Item Code | Avg MAPE | Avg Reward | Training Count | Best MAPE |
|-----------|----------|------------|----------------|-----------|
${report.worstPerformers.map(i => `| ${i.item_code} | ${i.avg_mape.toFixed(2)}% | ${i.avg_reward.toFixed(3)} | ${i.training_count} | ${i.best_mape.toFixed(2)}% |`).join('\n')}

---

## Recommendations

${report.summary.avgMAPE <= report.summary.targetMAPE ? '✅ **System is meeting accuracy targets**' : '⚠️ **System needs optimization**'}

${report.worstPerformers.length > 0 ? `
### Items Needing Attention:
${report.worstPerformers.slice(0, 5).map(i => `- **${i.item_code}**: MAPE ${i.avg_mape.toFixed(2)}% (${i.training_count} training runs)`).join('\n')}
` : ''}

---

*Generated by NeuroInnovate v5 AI Optimizer RL*
`;

    fs.writeFileSync(outputPath, markdown);
    console.log(`✓ Performance report exported to ${outputPath}`);

    return outputPath;
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      console.log('✓ AI Optimizer RL closed');
    }
  }
}

module.exports = AIOptimizerRL;
