/**
 * AI Intelligence Layer API Routes
 * Forecasting, reorder optimization, and anomaly detection endpoints
 */

const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('../config');
const logger = require('../config/logger');

// AI Layer imports
const ProphetForecaster = require('../ai/forecast/ProphetForecaster');
const ARIMAForecaster = require('../ai/forecast/ARIMAForecaster');
const ConsumptionDerivation = require('../ai/pipeline/ConsumptionDerivation');

// Database connection
const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/enterprise_inventory.db');
const db = new sqlite3.Database(dbPath);

// Initialize AI components with database
const prophetForecaster = new ProphetForecaster({ db });
const arimaForecaster = new ARIMAForecaster({ db });
const consumptionDerivation = new ConsumptionDerivation(db);

// ============================================================================
// CONSUMPTION DERIVATION ENDPOINTS
// ============================================================================

/**
 * POST /api/ai/consumption/derive
 * Derive consumption data from inventory snapshots and orders
 * Body: { start_date, end_date }
 */
router.post('/consumption/derive', async (req, res) => {
  try {
    const { start_date, end_date } = req.body;

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: 'start_date and end_date are required'
      });
    }

    logger.info('Deriving consumption data', { start_date, end_date });

    const result = await consumptionDerivation.deriveConsumption(start_date, end_date);

    res.json(result);
  } catch (error) {
    logger.error('Consumption derivation API error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/ai/consumption/detect-anomalies
 * Detect anomalies in consumption data
 */
router.post('/consumption/detect-anomalies', async (req, res) => {
  try {
    logger.info('Detecting consumption anomalies');

    const result = await consumptionDerivation.detectAnomalies();

    res.json(result);
  } catch (error) {
    logger.error('Anomaly detection API error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// FORECASTING ENDPOINTS
// ============================================================================

/**
 * POST /api/ai/forecast/train
 * Train a forecasting model (Prophet or ARIMA)
 * Body: { item_code, model_type, options }
 */
router.post('/forecast/train', async (req, res) => {
  try {
    const { item_code, model_type = 'prophet', options = {} } = req.body;

    if (!item_code) {
      return res.status(400).json({
        success: false,
        error: 'item_code is required'
      });
    }

    logger.info('Training forecast model', { item_code, model_type });

    let result;
    if (model_type === 'prophet') {
      result = await prophetForecaster.train(item_code, options);
    } else if (model_type === 'arima') {
      result = await arimaForecaster.train(item_code, options);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid model_type. Must be "prophet" or "arima"'
      });
    }

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Forecast training API error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/ai/forecast/:itemCode
 * Get forecast for an item
 * Query params: periods (default 30), model_type (default prophet)
 */
router.get('/forecast/:itemCode', async (req, res) => {
  try {
    const { itemCode } = req.params;
    const periods = parseInt(req.query.periods) || 30;
    const model_type = req.query.model_type || 'prophet';

    logger.info('Fetching forecast', { itemCode, periods, model_type });

    let result;
    if (model_type === 'prophet') {
      result = await prophetForecaster.predict(itemCode, periods);
    } else if (model_type === 'arima') {
      result = await arimaForecaster.predict(itemCode, periods);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid model_type. Must be "prophet" or "arima"'
      });
    }

    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    logger.error('Forecast fetch API error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/ai/forecast/batch-train
 * Train models for multiple items
 * Body: { item_codes[], model_type, options }
 */
router.post('/forecast/batch-train', async (req, res) => {
  try {
    const { item_codes, model_type = 'prophet', options = {} } = req.body;

    if (!item_codes || !Array.isArray(item_codes)) {
      return res.status(400).json({
        success: false,
        error: 'item_codes array is required'
      });
    }

    logger.info('Batch training forecast models', {
      count: item_codes.length,
      model_type
    });

    const results = [];
    for (const item_code of item_codes) {
      let result;
      if (model_type === 'prophet') {
        result = await prophetForecaster.train(item_code, options);
      } else {
        result = await arimaForecaster.train(item_code, options);
      }
      results.push({ item_code, ...result });
    }

    const successCount = results.filter(r => r.success).length;

    res.json({
      success: true,
      total: item_codes.length,
      succeeded: successCount,
      failed: item_codes.length - successCount,
      results: results
    });
  } catch (error) {
    logger.error('Batch training API error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/ai/forecast/evaluate/:itemCode
 * Evaluate model accuracy via backtesting
 * Query params: backtest_days (default 30), model_type (default prophet)
 */
router.get('/forecast/evaluate/:itemCode', async (req, res) => {
  try {
    const { itemCode } = req.params;
    const backtest_days = parseInt(req.query.backtest_days) || 30;
    const model_type = req.query.model_type || 'prophet';

    logger.info('Evaluating forecast model', { itemCode, backtest_days, model_type });

    let result;
    if (model_type === 'prophet') {
      result = await prophetForecaster.evaluate(itemCode, backtest_days);
    } else if (model_type === 'arima') {
      result = await arimaForecaster.evaluate(itemCode, backtest_days);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid model_type'
      });
    }

    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    logger.error('Forecast evaluation API error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// REORDER OPTIMIZATION ENDPOINTS
// ============================================================================

/**
 * POST /api/ai/reorder/recommend
 * Get AI-powered reorder recommendations
 * Body: { item_codes[], lead_time_days, service_level }
 */
router.post('/reorder/recommend', async (req, res) => {
  try {
    const {
      item_codes,
      lead_time_days = 7,
      service_level = 0.95
    } = req.body;

    if (!item_codes || !Array.isArray(item_codes)) {
      return res.status(400).json({
        success: false,
        error: 'item_codes array is required'
      });
    }

    logger.info('Generating reorder recommendations', {
      count: item_codes.length,
      lead_time_days,
      service_level
    });

    const recommendations = [];

    for (const item_code of item_codes) {
      try {
        // Get forecast for lead time period
        const forecast = await prophetForecaster.predict(item_code, lead_time_days);

        if (!forecast.success) {
          // Try ARIMA fallback
          const arimaForecast = await arimaForecaster.predict(item_code, lead_time_days);
          if (!arimaForecast.success) {
            recommendations.push({
              item_code,
              success: false,
              error: 'No trained forecast model available'
            });
            continue;
          }
          forecast.forecast = arimaForecast.forecast;
        }

        // Calculate expected consumption during lead time
        const expectedConsumption = forecast.forecast.reduce((sum, f) => sum + f.predicted_value, 0);

        // Get current inventory level
        const currentInventory = await new Promise((resolve, reject) => {
          db.get(
            `SELECT SUM(quantity) as total FROM inventory_count_items WHERE item_code = ?`,
            [item_code],
            (err, row) => {
              if (err) reject(err);
              else resolve(row?.total || 0);
            }
          );
        });

        // Calculate safety stock (using confidence interval)
        const avgUpperBound = forecast.forecast.reduce((sum, f) => sum + f.confidence_upper, 0) / forecast.forecast.length;
        const avgPredicted = forecast.forecast.reduce((sum, f) => sum + f.predicted_value, 0) / forecast.forecast.length;
        const safetyStock = (avgUpperBound - avgPredicted) * lead_time_days * service_level;

        // Reorder point = Expected consumption + Safety stock
        const reorderPoint = expectedConsumption + safetyStock;

        // Reorder quantity = Expected consumption for 2x lead time (economic order quantity proxy)
        const reorderQuantity = Math.ceil(expectedConsumption * 2);

        // Determine if reorder is needed
        const shouldReorder = currentInventory <= reorderPoint;

        recommendations.push({
          item_code,
          success: true,
          current_inventory: currentInventory,
          expected_consumption: Math.round(expectedConsumption * 100) / 100,
          safety_stock: Math.round(safetyStock * 100) / 100,
          reorder_point: Math.round(reorderPoint * 100) / 100,
          reorder_quantity: reorderQuantity,
          should_reorder: shouldReorder,
          days_until_stockout: shouldReorder
            ? Math.floor(currentInventory / (expectedConsumption / lead_time_days))
            : null,
          confidence: forecast.accuracy_metrics?.mape
            ? (100 - forecast.accuracy_metrics.mape) / 100
            : null
        });

      } catch (error) {
        recommendations.push({
          item_code,
          success: false,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      recommendations: recommendations,
      parameters: {
        lead_time_days,
        service_level
      }
    });

  } catch (error) {
    logger.error('Reorder recommendation API error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/ai/reorder/summary
 * Get summary of items needing reorder
 */
router.get('/reorder/summary', async (req, res) => {
  try {
    logger.info('Fetching reorder summary');

    // Get all active items
    const items = await new Promise((resolve, reject) => {
      db.all(
        `SELECT item_code FROM item_master WHERE active = 1 LIMIT 100`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    const item_codes = items.map(i => i.item_code);

    // Generate recommendations
    const recommendResult = await router.handle(
      { body: { item_codes }, method: 'POST' },
      { json: (data) => data }
    );

    const needReorder = recommendResult.recommendations.filter(r => r.should_reorder);

    res.json({
      success: true,
      total_items: item_codes.length,
      items_need_reorder: needReorder.length,
      items: needReorder
    });

  } catch (error) {
    logger.error('Reorder summary API error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ANOMALY DETECTION ENDPOINTS
// ============================================================================

/**
 * GET /api/ai/anomaly/list
 * Get list of detected anomalies
 * Query params: days (default 30), item_code (optional)
 */
router.get('/anomaly/list', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const item_code = req.query.item_code;

    logger.info('Fetching anomalies', { days, item_code });

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    let query = `
      SELECT
        c.consumption_id,
        c.item_code,
        i.item_name,
        c.date,
        c.consumption_qty,
        c.anomaly_score,
        c.confidence_score
      FROM ai_consumption_derived c
      LEFT JOIN item_master i ON c.item_code = i.item_code
      WHERE c.is_anomaly = 1 AND c.date >= ?
    `;

    const params = [cutoffStr];

    if (item_code) {
      query += ' AND c.item_code = ?';
      params.push(item_code);
    }

    query += ' ORDER BY c.date DESC, c.anomaly_score DESC';

    const anomalies = await new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    res.json({
      success: true,
      count: anomalies.length,
      anomalies: anomalies
    });

  } catch (error) {
    logger.error('Anomaly list API error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// MODEL MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * GET /api/ai/models/list
 * List all trained models
 * Query params: model_type, entity_type, limit
 */
router.get('/models/list', async (req, res) => {
  try {
    const model_type = req.query.model_type;
    const entity_type = req.query.entity_type;
    const limit = parseInt(req.query.limit) || 50;

    logger.info('Fetching models list', { model_type, entity_type, limit });

    let query = 'SELECT * FROM ai_models WHERE 1=1';
    const params = [];

    if (model_type) {
      query += ' AND model_type = ?';
      params.push(model_type);
    }

    if (entity_type) {
      query += ' AND entity_type = ?';
      params.push(entity_type);
    }

    query += ' ORDER BY trained_at DESC LIMIT ?';
    params.push(limit);

    const models = await new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    // Parse JSON fields
    const modelsWithParsedData = models.map(m => ({
      ...m,
      hyperparameters: JSON.parse(m.hyperparameters || '{}'),
      training_data_range: JSON.parse(m.training_data_range || '{}'),
      accuracy_metrics: JSON.parse(m.accuracy_metrics || '{}')
    }));

    res.json({
      success: true,
      count: models.length,
      models: modelsWithParsedData
    });

  } catch (error) {
    logger.error('Models list API error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
