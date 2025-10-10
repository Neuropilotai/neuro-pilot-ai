/**
 * ARIMA Forecaster
 * ARIMA (AutoRegressive Integrated Moving Average) forecasting implementation
 * Best for: stationary time series, short-term predictions, fallback when Prophet fails
 */

const path = require('path');
const BaseForecaster = require('./BaseForecaster');
const logger = require('../../config/logger');

class ARIMAForecaster extends BaseForecaster {
  constructor(config = {}) {
    super(config);
    this.modelType = 'arima';
    this.scriptPath = path.join(__dirname, '../python/train_arima.py');
  }

  /**
   * Train ARIMA model on consumption data
   * @param {string} itemCode - Item code or 'global'
   * @param {object} options - Training configuration
   * @returns {Promise<object>} - Training results with model metadata
   */
  async train(itemCode, options = {}) {
    try {
      logger.info('Training ARIMA model', { itemCode, options });

      // Ensure model directory exists
      await this.ensureModelDirectory();

      // Fetch historical consumption data
      const trainingDays = options.trainingDays || 365;
      const trainingData = await this.fetchTrainingData(itemCode, trainingDays);

      if (trainingData.length < 10) {
        logger.warn('Insufficient training data for ARIMA', {
          itemCode,
          recordCount: trainingData.length
        });
        return {
          success: false,
          error: 'Insufficient training data (minimum 10 records required)'
        };
      }

      // Prepare training configuration
      const config = {
        entity_id: itemCode,
        entity_type: itemCode === 'global' ? 'global' : 'item',
        forecast_periods: options.forecastPeriods || 30,
        model_dir: this.config.modelDir,

        // ARIMA hyperparameters
        auto_order: options.autoOrder !== false, // Auto-select (p,d,q)
        p: options.p || 1, // AR order (if auto_order=false)
        d: options.d || 1, // Differencing order
        q: options.q || 1  // MA order
      };

      // Call Python training script
      const inputData = {
        command: 'train',
        training_data: trainingData,
        config: config
      };

      const result = await this.executePython(this.scriptPath, inputData);

      if (!result.success) {
        logger.error('ARIMA training failed', {
          itemCode,
          error: result.error
        });
        return result;
      }

      // Store model metadata in database
      const modelId = await this.storeModelMetadata({
        ...result,
        trained_by: options.trainedBy || 'system'
      });

      // Store forecast results
      await this.storeForecastResults(
        modelId,
        result.forecast,
        result.entity_type,
        result.entity_id
      );

      logger.info('ARIMA model trained successfully', {
        itemCode,
        model_id: modelId,
        order: result.hyperparameters.order,
        accuracy: result.accuracy_metrics
      });

      return {
        success: true,
        model_id: modelId,
        model_type: 'arima',
        order: result.hyperparameters.order,
        accuracy_metrics: result.accuracy_metrics,
        forecast_count: result.forecast.length,
        training_data_range: result.training_data_range
      };

    } catch (error) {
      logger.error('ARIMA training error', {
        itemCode,
        error: error.message,
        stack: error.stack
      });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate predictions using existing ARIMA model
   * @param {string} itemCode - Item code or 'global'
   * @param {number} periods - Number of periods (days) to forecast
   * @returns {Promise<object>} - Forecast results
   */
  async predict(itemCode, periods = 30) {
    try {
      logger.info('Generating ARIMA predictions', { itemCode, periods });

      // Get latest active model
      const entityType = itemCode === 'global' ? 'global' : 'item';
      const model = await this.getLatestModel(entityType, itemCode);

      if (!model) {
        logger.warn('No trained ARIMA model found', { itemCode });
        return {
          success: false,
          error: 'No trained model found. Please train a model first.'
        };
      }

      // Call Python prediction script
      const inputData = {
        command: 'predict',
        model_path: model.model_path,
        periods: periods
      };

      const result = await this.executePython(this.scriptPath, inputData);

      if (!result.success) {
        logger.error('ARIMA prediction failed', {
          itemCode,
          error: result.error
        });
        return result;
      }

      logger.info('ARIMA predictions generated', {
        itemCode,
        forecast_count: result.forecast.length
      });

      return {
        success: true,
        model_id: model.model_id,
        model_type: 'arima',
        trained_at: model.trained_at,
        forecast: result.forecast,
        accuracy_metrics: JSON.parse(model.accuracy_metrics)
      };

    } catch (error) {
      logger.error('ARIMA prediction error', {
        itemCode,
        error: error.message,
        stack: error.stack
      });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Evaluate model accuracy by backtesting
   * @param {string} itemCode - Item code or 'global'
   * @param {number} backtestDays - Number of days to backtest
   * @returns {Promise<object>} - Accuracy metrics
   */
  async evaluate(itemCode, backtestDays = 30) {
    try {
      logger.info('Evaluating ARIMA model', { itemCode, backtestDays });

      // Fetch actual consumption for backtest period
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - backtestDays);
      const cutoffStr = cutoffDate.toISOString().split('T')[0];

      const actualData = await new Promise((resolve, reject) => {
        const query = `
          SELECT date as forecast_date, consumption_qty as actual_value
          FROM ai_consumption_derived
          WHERE item_code = ? AND date >= ?
          ORDER BY date ASC
        `;
        this.db.all(query, [itemCode, cutoffStr], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      // Get forecasts for same period
      const entityType = itemCode === 'global' ? 'global' : 'item';
      const model = await this.getLatestModel(entityType, itemCode);

      if (!model) {
        return {
          success: false,
          error: 'No trained model found'
        };
      }

      const forecastData = await new Promise((resolve, reject) => {
        const query = `
          SELECT forecast_date, predicted_value
          FROM ai_forecasts
          WHERE model_id = ? AND forecast_date >= ?
          ORDER BY forecast_date ASC
        `;
        this.db.all(query, [model.model_id, cutoffStr], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      // Match actual vs predicted
      const errors = [];
      for (const actual of actualData) {
        const forecast = forecastData.find(f => f.forecast_date === actual.forecast_date);
        if (forecast) {
          const error = Math.abs((actual.actual_value - forecast.predicted_value) / actual.actual_value);
          errors.push(error);
        }
      }

      if (errors.length === 0) {
        return {
          success: false,
          error: 'No matching forecast data for backtest period'
        };
      }

      const mape = (errors.reduce((sum, e) => sum + e, 0) / errors.length) * 100;

      logger.info('ARIMA model evaluation complete', {
        itemCode,
        mape: mape.toFixed(2),
        sample_count: errors.length
      });

      return {
        success: true,
        model_id: model.model_id,
        backtest_period: { start: cutoffStr, days: backtestDays },
        sample_count: errors.length,
        mape: parseFloat(mape.toFixed(2))
      };

    } catch (error) {
      logger.error('ARIMA evaluation error', {
        itemCode,
        error: error.message
      });
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = ARIMAForecaster;
