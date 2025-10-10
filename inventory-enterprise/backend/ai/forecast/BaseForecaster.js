/**
 * Base Forecaster Class
 * Abstract base class for all forecasting implementations
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../../config/logger');

class BaseForecaster {
  constructor(config = {}) {
    this.config = {
      modelDir: config.modelDir || path.join(__dirname, '../models'),
      pythonPath: config.pythonPath || 'python3',
      timeout: config.timeout || 300000, // 5 minutes
      ...config
    };

    this.db = config.db || null;
    this.modelType = 'base'; // Override in subclasses
  }

  /**
   * Execute Python script with JSON input/output
   * @param {string} scriptPath - Path to Python script
   * @param {object} inputData - Data to send to Python via stdin
   * @returns {Promise<object>} - Parsed JSON response from Python
   */
  async executePython(scriptPath, inputData) {
    return new Promise((resolve, reject) => {
      const python = spawn(this.config.pythonPath, [scriptPath]);

      let stdout = '';
      let stderr = '';

      const timeoutId = setTimeout(() => {
        python.kill();
        reject(new Error(`Python script timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        clearTimeout(timeoutId);

        if (code !== 0) {
          logger.error('Python script failed', {
            script: scriptPath,
            exitCode: code,
            stderr: stderr
          });
          return reject(new Error(`Python script exited with code ${code}: ${stderr}`));
        }

        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (err) {
          logger.error('Failed to parse Python output', {
            stdout: stdout.substring(0, 500),
            error: err.message
          });
          reject(new Error(`Failed to parse Python output: ${err.message}`));
        }
      });

      python.on('error', (err) => {
        clearTimeout(timeoutId);
        logger.error('Failed to spawn Python process', { error: err.message });
        reject(new Error(`Failed to spawn Python: ${err.message}`));
      });

      // Send input data to Python via stdin
      python.stdin.write(JSON.stringify(inputData));
      python.stdin.end();
    });
  }

  /**
   * Fetch consumption data for training
   * @param {string} itemCode - Item to fetch data for (or 'global')
   * @param {number} days - Number of days of historical data
   * @returns {Promise<Array>} - Training data [{date, quantity}, ...]
   */
  async fetchTrainingData(itemCode, days = 365) {
    if (!this.db) {
      throw new Error('Database not configured for BaseForecaster');
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    let query;
    let params;

    if (itemCode === 'global') {
      // Aggregate consumption across all items
      query = `
        SELECT date, SUM(consumption_qty) as quantity
        FROM ai_consumption_derived
        WHERE date >= ?
        GROUP BY date
        ORDER BY date ASC
      `;
      params = [cutoffStr];
    } else {
      // Item-specific consumption
      query = `
        SELECT date, consumption_qty as quantity
        FROM ai_consumption_derived
        WHERE item_code = ? AND date >= ?
        ORDER BY date ASC
      `;
      params = [itemCode, cutoffStr];
    }

    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) {
          logger.error('Failed to fetch training data', { itemCode, error: err.message });
          return reject(err);
        }
        resolve(rows);
      });
    });
  }

  /**
   * Store trained model metadata in database
   * @param {object} modelData - Model information from training
   * @returns {Promise<number>} - model_id of inserted record
   */
  async storeModelMetadata(modelData) {
    if (!this.db) {
      throw new Error('Database not configured for BaseForecaster');
    }

    const query = `
      INSERT INTO ai_models (
        model_type, entity_type, entity_id, model_path,
        hyperparameters, training_data_range, accuracy_metrics,
        trained_by, status, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      modelData.model_type,
      modelData.entity_type,
      modelData.entity_id,
      modelData.model_path,
      JSON.stringify(modelData.hyperparameters),
      JSON.stringify(modelData.training_data_range),
      JSON.stringify(modelData.accuracy_metrics),
      modelData.trained_by || 'system',
      'active',
      1
    ];

    return new Promise((resolve, reject) => {
      this.db.run(query, params, function(err) {
        if (err) {
          logger.error('Failed to store model metadata', { error: err.message });
          return reject(err);
        }
        logger.info('Model metadata stored', { model_id: this.lastID });
        resolve(this.lastID);
      });
    });
  }

  /**
   * Store forecast results in database
   * @param {number} modelId - Reference to ai_models.model_id
   * @param {Array} forecasts - Array of forecast objects
   * @param {string} entityType - 'item' or 'global'
   * @param {string} entityId - item_code or null
   * @returns {Promise<void>}
   */
  async storeForecastResults(modelId, forecasts, entityType, entityId) {
    if (!this.db) {
      throw new Error('Database not configured for BaseForecaster');
    }

    const query = `
      INSERT INTO ai_forecasts (
        model_id, entity_type, entity_id, forecast_type,
        forecast_date, predicted_value, confidence_lower, confidence_upper,
        confidence_level, prediction_metadata, generated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const stmt = this.db.prepare(query);

    for (const forecast of forecasts) {
      const params = [
        modelId,
        entityType,
        entityId || null,
        'demand',
        forecast.date,
        forecast.predicted_value,
        forecast.confidence_lower,
        forecast.confidence_upper,
        0.95,
        JSON.stringify({
          trend: forecast.trend,
          weekly_effect: forecast.weekly_effect,
          yearly_effect: forecast.yearly_effect
        }),
        'system'
      ];

      await new Promise((resolve, reject) => {
        stmt.run(params, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    stmt.finalize();
    logger.info('Forecast results stored', { model_id: modelId, count: forecasts.length });
  }

  /**
   * Get latest active model for entity
   * @param {string} entityType - 'item' or 'global'
   * @param {string} entityId - item_code or null
   * @returns {Promise<object|null>} - Model metadata or null
   */
  async getLatestModel(entityType, entityId) {
    if (!this.db) {
      throw new Error('Database not configured for BaseForecaster');
    }

    const query = `
      SELECT *
      FROM ai_models
      WHERE model_type = ? AND entity_type = ? AND entity_id = ? AND status = 'active'
      ORDER BY trained_at DESC
      LIMIT 1
    `;

    const params = [this.modelType, entityType, entityId || null];

    return new Promise((resolve, reject) => {
      this.db.get(query, params, (err, row) => {
        if (err) {
          logger.error('Failed to get latest model', { error: err.message });
          return reject(err);
        }
        resolve(row || null);
      });
    });
  }

  /**
   * Get forecasts for entity
   * @param {string} entityType - 'item' or 'global'
   * @param {string} entityId - item_code or null
   * @param {number} days - Number of days ahead to retrieve
   * @returns {Promise<Array>} - Forecast results
   */
  async getForecast(entityType, entityId, days = 30) {
    if (!this.db) {
      throw new Error('Database not configured for BaseForecaster');
    }

    const model = await this.getLatestModel(entityType, entityId);
    if (!model) {
      return [];
    }

    const query = `
      SELECT forecast_date, predicted_value, confidence_lower, confidence_upper
      FROM ai_forecasts
      WHERE model_id = ? AND forecast_date >= date('now')
      ORDER BY forecast_date ASC
      LIMIT ?
    `;

    const params = [model.model_id, days];

    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) {
          logger.error('Failed to get forecasts', { error: err.message });
          return reject(err);
        }
        resolve(rows);
      });
    });
  }

  /**
   * Ensure model directory exists
   */
  async ensureModelDirectory() {
    try {
      await fs.mkdir(this.config.modelDir, { recursive: true });
    } catch (err) {
      logger.error('Failed to create model directory', { error: err.message });
      throw err;
    }
  }

  /**
   * Train model - must be implemented by subclasses
   */
  async train(itemCode, options = {}) {
    throw new Error('train() must be implemented by subclass');
  }

  /**
   * Predict - must be implemented by subclasses
   */
  async predict(itemCode, periods = 30) {
    throw new Error('predict() must be implemented by subclass');
  }
}

module.exports = BaseForecaster;
