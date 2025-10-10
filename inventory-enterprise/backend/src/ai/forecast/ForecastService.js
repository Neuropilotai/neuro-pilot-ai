/**
 * Forecasting Service - v2.8.0
 * Hybrid strategy: ARIMA (≤7 days) + Prophet (>7 days)
 */

const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');

class ForecastService {
  constructor(redisClient = null, db = null) {
    this.redisClient = redisClient;
    this.db = db;
    this.pythonBin = process.env.PYTHON_BIN || 'python3';
    this.enabled = process.env.AI_FORECAST_ENABLED === 'true';
    this.defaultHorizon = parseInt(process.env.FORECAST_DEFAULT_HORIZON) || 30;
    this.cacheEnabled = process.env.FORECAST_CACHE_ENABLED !== 'false';
    this.cacheTTL = parseInt(process.env.FORECAST_CACHE_TTL) || 21600; // 6 hours

    console.log(`Forecasting Service initialized: ${this.enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Generate forecast for an item
   * @param {string} itemCode - Item code
   * @param {string} tenantId - Tenant ID
   * @param {number} horizon - Days ahead
   * @returns {Promise<Object>}
   */
  async forecast(itemCode, tenantId, horizon = this.defaultHorizon) {
    if (!this.enabled) {
      throw new Error('Forecasting service is disabled. Set AI_FORECAST_ENABLED=true');
    }

    // Check cache first
    if (this.cacheEnabled && this.redisClient) {
      const cached = await this.getCachedForecast(tenantId, itemCode, horizon);
      if (cached) {
        return cached;
      }
    }

    // Select model based on horizon
    const model = horizon <= 7 ? 'arima' : 'prophet';

    // Get historical data
    const historicalData = await this.getHistoricalData(itemCode, tenantId);

    if (!historicalData || historicalData.length < 14) {
      throw new Error(`Insufficient historical data for ${itemCode} (need ≥14 days, got ${historicalData?.length || 0})`);
    }

    // Generate forecast
    const forecast = await this.runModel(model, historicalData, horizon);

    // Enrich with metadata
    const result = {
      itemCode,
      tenantId,
      model,
      horizon,
      generatedAt: new Date().toISOString(),
      predictions: forecast.predictions,
      confidence: forecast.confidence,
      metrics: {
        mape: forecast.mape,
        rmse: forecast.rmse,
        mae: forecast.mae
      },
      historicalSampleSize: historicalData.length
    };

    // Cache result
    if (this.cacheEnabled && this.redisClient) {
      await this.cacheForecast(tenantId, itemCode, horizon, result);
    }

    // Store in database
    if (this.db) {
      await this.storeForecastResults(result);
    }

    return result;
  }

  /**
   * Run ARIMA or Prophet model
   */
  async runModel(model, historicalData, horizon) {
    const scriptName = model === 'arima' ? 'arima_forecast.py' : 'prophet_forecast.py';
    const scriptPath = path.join(__dirname, 'python', scriptName);

    const input = {
      data: historicalData,
      horizon: horizon
    };

    try {
      const result = await this.executePythonScript(scriptPath, input);
      return result;
    } catch (error) {
      console.error(`${model.toUpperCase()} forecast failed:`, error);
      throw new Error(`Forecast model ${model} execution failed: ${error.message}`);
    }
  }

  /**
   * Execute Python forecasting script
   */
  async executePythonScript(scriptPath, input) {
    return new Promise((resolve, reject) => {
      const python = spawn(this.pythonBin, [scriptPath]);

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python script exited with code ${code}: ${stderr}`));
        } else {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (error) {
            reject(new Error(`Failed to parse Python output: ${error.message}`));
          }
        }
      });

      python.on('error', (error) => {
        reject(new Error(`Failed to spawn Python process: ${error.message}`));
      });

      // Send input via stdin
      python.stdin.write(JSON.stringify(input));
      python.stdin.end();

      // Timeout after 30 seconds
      setTimeout(() => {
        python.kill();
        reject(new Error('Forecast execution timeout (30s)'));
      }, 30000);
    });
  }

  /**
   * Get historical sales data for item
   */
  async getHistoricalData(itemCode, tenantId) {
    if (!this.db) {
      throw new Error('Database not configured');
    }

    const sql = `
      SELECT
        DATE(i.invoice_date) as date,
        SUM(ii.quantity) as quantity
      FROM invoice_items ii
      JOIN processed_invoices i ON ii.invoice_id = i.invoice_id
      WHERE ii.item_code = ?
        AND i.tenant_id = ?
        AND i.invoice_date >= DATE('now', '-365 days')
        AND i.is_credit_memo = 0
      GROUP BY DATE(i.invoice_date)
      ORDER BY date ASC
    `;

    const rows = await this.db.all(sql, [itemCode, tenantId]);

    return rows.map(row => ({
      ds: row.date,  // Prophet expects 'ds' for date
      y: parseFloat(row.quantity)  // Prophet expects 'y' for value
    }));
  }

  /**
   * Bulk train forecasts for multiple items
   */
  async bulkTrain(itemCodes, tenantId, horizon = this.defaultHorizon) {
    const results = [];
    const errors = [];

    for (const itemCode of itemCodes) {
      try {
        const forecast = await this.forecast(itemCode, tenantId, horizon);
        results.push({ itemCode, success: true, forecast });
      } catch (error) {
        errors.push({ itemCode, success: false, error: error.message });
      }
    }

    return {
      totalItems: itemCodes.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors
    };
  }

  /**
   * Get cached forecast
   */
  async getCachedForecast(tenantId, itemCode, horizon) {
    if (!this.redisClient) return null;

    try {
      const key = this.getCacheKey(tenantId, itemCode, horizon);
      const cached = await this.redisClient.get(key);

      if (cached) {
        console.log(`Cache hit for forecast: ${itemCode} (h=${horizon})`);
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error('Redis cache read error:', error);
    }

    return null;
  }

  /**
   * Cache forecast result
   */
  async cacheForecast(tenantId, itemCode, horizon, forecast) {
    if (!this.redisClient) return;

    try {
      const key = this.getCacheKey(tenantId, itemCode, horizon);
      await this.redisClient.setex(key, this.cacheTTL, JSON.stringify(forecast));
      console.log(`Cached forecast: ${itemCode} (h=${horizon}, ttl=${this.cacheTTL}s)`);
    } catch (error) {
      console.error('Redis cache write error:', error);
    }
  }

  /**
   * Generate cache key
   */
  getCacheKey(tenantId, itemCode, horizon) {
    return `forecast:${tenantId}:${itemCode}:${horizon}`;
  }

  /**
   * Store forecast results in database
   */
  async storeForecastResults(forecast) {
    if (!this.db) return;

    try {
      const { itemCode, tenantId, model, horizon, predictions, metrics, generatedAt } = forecast;

      // Get item_id
      const item = await this.db.get(
        'SELECT item_id FROM item_master WHERE item_code = ? AND tenant_id = ?',
        [itemCode, tenantId]
      );

      if (!item) {
        console.warn(`Item not found: ${itemCode}`);
        return;
      }

      // Insert forecast results for each prediction
      for (const prediction of predictions) {
        const sql = `
          INSERT INTO forecast_results (
            item_id, item_code, tenant_id, model_type, forecast_period,
            predicted_date, predicted_quantity, confidence_lower, confidence_upper,
            mape, rmse, model_parameters, generated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await this.db.run(sql, [
          item.item_id,
          itemCode,
          tenantId,
          model,
          horizon,
          prediction.date,
          prediction.value,
          prediction.lower || null,
          prediction.upper || null,
          metrics.mape || null,
          metrics.rmse || null,
          JSON.stringify({ model, horizon }),
          generatedAt
        ]);
      }

      console.log(`Stored ${predictions.length} forecast results for ${itemCode}`);
    } catch (error) {
      console.error('Failed to store forecast results:', error);
    }
  }

  /**
   * Get forecast accuracy metrics
   */
  async getAccuracyMetrics(tenantId, itemCode = null, days = 30) {
    if (!this.db) {
      throw new Error('Database not configured');
    }

    let sql = `
      SELECT
        fr.model_type,
        COUNT(*) as total_forecasts,
        AVG(fa.percentage_error) as avg_percentage_error,
        AVG(fa.absolute_error) as avg_absolute_error,
        MIN(fa.percentage_error) as min_error,
        MAX(fa.percentage_error) as max_error,
        COUNT(CASE WHEN fa.percentage_error < 0.10 THEN 1 END) as forecasts_within_10_pct
      FROM forecast_results fr
      LEFT JOIN forecast_accuracy fa ON fr.forecast_id = fa.forecast_id
      WHERE fr.tenant_id = ?
        AND fr.generated_at >= DATE('now', '-' || ? || ' days')
    `;

    const params = [tenantId, days];

    if (itemCode) {
      sql += ' AND fr.item_code = ?';
      params.push(itemCode);
    }

    sql += ' GROUP BY fr.model_type';

    const results = await this.db.all(sql, params);

    return {
      tenantId,
      itemCode,
      periodDays: days,
      models: results
    };
  }

  /**
   * Invalidate cached forecasts for an item
   */
  async invalidateCache(tenantId, itemCode) {
    if (!this.redisClient) return;

    try {
      // Invalidate common horizons
      const horizons = [7, 14, 30, 60, 90];
      const keys = horizons.map(h => this.getCacheKey(tenantId, itemCode, h));

      for (const key of keys) {
        await this.redisClient.del(key);
      }

      console.log(`Invalidated forecast cache for ${itemCode}`);
    } catch (error) {
      console.error('Cache invalidation error:', error);
    }
  }
}

module.exports = ForecastService;
