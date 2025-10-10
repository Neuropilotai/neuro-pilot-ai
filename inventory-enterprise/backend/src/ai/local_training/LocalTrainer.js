/**
 * LocalTrainer - Train forecasting models on Apple Silicon
 * Records REAL measured metrics only (no estimates)
 */

const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const crypto = require('crypto');
const db = require('../../../config/database');
const { logger } = require('../../../config/logger');
const {
  getAppleHardwareProfile,
  getHardwareFingerprint,
  getMemoryUsageMB
} = require('./appleHardware');

class LocalTrainer {
  constructor() {
    this.pythonScriptsDir = path.join(__dirname, 'python');
    this.modelsDir = path.join(__dirname, '../../../data/models');
    this.logsDir = path.join(__dirname, '../../../logs');
    this.hardwareProfile = null;
    this.hardwareFingerprint = null;
    this.peakMemoryMB = 0;
  }

  async initialize() {
    this.hardwareProfile = getAppleHardwareProfile();
    this.hardwareFingerprint = getHardwareFingerprint();

    logger.info('LocalTrainer initialized', {
      isAppleSilicon: this.hardwareProfile.isAppleSilicon,
      chipModel: this.hardwareProfile.chipModel,
      hardwareFingerprint: this.hardwareFingerprint
    });

    // Ensure directories
    await fs.mkdir(this.modelsDir, { recursive: true });
    await fs.mkdir(this.logsDir, { recursive: true });
    await fs.mkdir(path.join(this.logsDir, 'local_training'), { recursive: true });

    return this.hardwareProfile;
  }

  /**
   * Train Prophet model for an item
   */
  async trainProphet(itemCode, horizon = 30, options = {}) {
    if (!this.hardwareProfile) await this.initialize();

    const runId = crypto.randomBytes(8).toString('hex');
    const startTime = Date.now();
    this.peakMemoryMB = 0;

    const memInterval = setInterval(() => {
      const mem = getMemoryUsageMB();
      if (mem.rss > this.peakMemoryMB) this.peakMemoryMB = mem.rss;
    }, 100);

    try {
      // Get historical data
      const data = await this.getHistoricalData(itemCode);

      if (data.length < 14) {
        throw new Error(`Insufficient data for ${itemCode}: ${data.length} records (need >= 14)`);
      }

      // Run Python training
      const result = await this.runPythonScript('prophet_forecast.py', {
        data,
        horizonDays: horizon,
        itemCode
      });

      clearInterval(memInterval);

      const wallClockSec = (Date.now() - startTime) / 1000;
      const metrics = result.metrics || {};

      // Save to database
      const logPath = await this.writeTrainingLog({
        runId,
        itemCode,
        modelType: 'prophet',
        horizon,
        metrics: {
          ...metrics,
          wallClockSec,
          peakMemoryMB: this.peakMemoryMB
        },
        samples: data.length,
        hardwareFingerprint: this.hardwareFingerprint
      });

      await db.run(
        `INSERT INTO ai_local_training_runs (
          id, item_code, model_type, horizon, mape, rmse, mae,
          wall_sec, peak_mb, samples, hw_fingerprint,
          started_at, finished_at, logs_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          runId,
          itemCode,
          'prophet',
          horizon,
          metrics.mape,
          metrics.rmse,
          metrics.mae,
          wallClockSec,
          this.peakMemoryMB,
          data.length,
          this.hardwareFingerprint,
          new Date(startTime).toISOString(),
          new Date().toISOString(),
          logPath
        ]
      );

      logger.info('Prophet training completed', {
        runId,
        itemCode,
        wallClockSec: wallClockSec.toFixed(3),
        mape: metrics.mape?.toFixed(2),
        peakMemoryMB: this.peakMemoryMB.toFixed(2)
      });

      return {
        runId,
        itemCode,
        modelType: 'prophet',
        wallClockSec,
        peakMemoryMB: this.peakMemoryMB,
        metrics,
        samples: data.length,
        hardwareProfile: this.hardwareProfile
      };

    } catch (error) {
      clearInterval(memInterval);

      const wallClockSec = (Date.now() - startTime) / 1000;

      await db.run(
        `INSERT INTO ai_local_training_runs (
          id, item_code, model_type, horizon, wall_sec, peak_mb,
          samples, hw_fingerprint, started_at, finished_at, logs_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          runId,
          itemCode,
          'prophet',
          horizon,
          wallClockSec,
          this.peakMemoryMB,
          0,
          this.hardwareFingerprint,
          new Date(startTime).toISOString(),
          new Date().toISOString(),
          `ERROR: ${error.message}`
        ]
      );

      throw error;
    }
  }

  /**
   * Train ARIMA model for an item
   */
  async trainARIMA(itemCode, horizon = 30, options = {}) {
    if (!this.hardwareProfile) await this.initialize();

    const runId = crypto.randomBytes(8).toString('hex');
    const startTime = Date.now();
    this.peakMemoryMB = 0;

    const memInterval = setInterval(() => {
      const mem = getMemoryUsageMB();
      if (mem.rss > this.peakMemoryMB) this.peakMemoryMB = mem.rss;
    }, 100);

    try {
      const data = await this.getHistoricalData(itemCode);

      if (data.length < 14) {
        throw new Error(`Insufficient data for ${itemCode}: ${data.length} records`);
      }

      const result = await this.runPythonScript('arima_forecast.py', {
        data,
        horizonDays: horizon,
        itemCode
      });

      clearInterval(memInterval);

      const wallClockSec = (Date.now() - startTime) / 1000;
      const metrics = result.metrics || {};

      const logPath = await this.writeTrainingLog({
        runId,
        itemCode,
        modelType: 'arima',
        horizon,
        metrics: {
          ...metrics,
          wallClockSec,
          peakMemoryMB: this.peakMemoryMB
        },
        samples: data.length,
        hardwareFingerprint: this.hardwareFingerprint
      });

      await db.run(
        `INSERT INTO ai_local_training_runs (
          id, item_code, model_type, horizon, mape, rmse, mae,
          wall_sec, peak_mb, samples, hw_fingerprint,
          started_at, finished_at, logs_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          runId,
          itemCode,
          'arima',
          horizon,
          metrics.mape,
          metrics.rmse,
          metrics.mae,
          wallClockSec,
          this.peakMemoryMB,
          data.length,
          this.hardwareFingerprint,
          new Date(startTime).toISOString(),
          new Date().toISOString(),
          logPath
        ]
      );

      logger.info('ARIMA training completed', {
        runId,
        itemCode,
        wallClockSec: wallClockSec.toFixed(3),
        mape: metrics.mape?.toFixed(2)
      });

      return {
        runId,
        itemCode,
        modelType: 'arima',
        wallClockSec,
        peakMemoryMB: this.peakMemoryMB,
        metrics,
        samples: data.length
      };

    } catch (error) {
      clearInterval(memInterval);
      const wallClockSec = (Date.now() - startTime) / 1000;

      await db.run(
        `INSERT INTO ai_local_training_runs (
          id, item_code, model_type, horizon, wall_sec, peak_mb,
          samples, hw_fingerprint, started_at, finished_at, logs_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          runId,
          itemCode,
          'arima',
          horizon,
          wallClockSec,
          this.peakMemoryMB,
          0,
          this.hardwareFingerprint,
          new Date(startTime).toISOString(),
          new Date().toISOString(),
          `ERROR: ${error.message}`
        ]
      );

      throw error;
    }
  }

  async getHistoricalData(itemCode) {
    const rows = await db.all(
      `SELECT DATE(order_date) as date, SUM(quantity) as quantity
       FROM order_line_items
       WHERE item_code = ? AND order_date >= date('now', '-365 days')
       GROUP BY DATE(order_date)
       ORDER BY date ASC`,
      [itemCode]
    );

    return rows.map(r => ({ date: r.date, quantity: r.quantity || 0 }));
  }

  async runPythonScript(scriptName, inputData) {
    const scriptPath = path.join(this.pythonScriptsDir, scriptName);
    const tempFile = path.join(this.modelsDir, `temp_${Date.now()}.json`);

    await fs.writeFile(tempFile, JSON.stringify(inputData));

    return new Promise((resolve, reject) => {
      const python = spawn('python3', [scriptPath, tempFile]);

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => { stdout += data.toString(); });
      python.stderr.on('data', (data) => { stderr += data.toString(); });

      python.on('close', async (code) => {
        try { await fs.unlink(tempFile); } catch (e) {}

        if (code !== 0) {
          return reject(new Error(`Python failed: ${stderr || stdout}`));
        }

        try {
          resolve(JSON.parse(stdout));
        } catch (error) {
          reject(new Error(`Failed to parse output: ${stdout}`));
        }
      });

      python.on('error', (error) => reject(error));
    });
  }

  async writeTrainingLog(logEntry) {
    const logFile = path.join(
      this.logsDir,
      'local_training',
      `${new Date().toISOString().split('T')[0]}.jsonl`
    );

    const logLine = JSON.stringify({
      ...logEntry,
      timestamp: new Date().toISOString(),
      hardwareProfile: this.hardwareProfile
    }) + '\n';

    await fs.appendFile(logFile, logLine);

    return logFile;
  }

  async getRecentRuns(limit = 50) {
    return db.all(
      `SELECT * FROM ai_local_training_runs
       ORDER BY started_at DESC LIMIT ?`,
      [limit]
    );
  }

  async getMetrics() {
    const stats = await db.get(
      `SELECT
        COUNT(*) as total_runs,
        AVG(mape) as avg_mape,
        AVG(rmse) as avg_rmse,
        AVG(wall_sec) as avg_wall_sec,
        MAX(peak_mb) as max_peak_mb
       FROM ai_local_training_runs
       WHERE started_at >= datetime('now', '-24 hours')`
    );

    return stats;
  }
}

module.exports = new LocalTrainer();
