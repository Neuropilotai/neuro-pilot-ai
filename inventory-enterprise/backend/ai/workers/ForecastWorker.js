/**
 * Live Forecast Worker
 * Version: v2.3.0-2025-10-07
 *
 * Watches model dirs, hot-reloads Prophet/ARIMA models,
 * serves live forecasts with Redis caching (30 min TTL)
 */

const fs = require('fs').promises;
const path = require('path');
const chokidar = require('chokidar');
const logger = require('../../config/logger');
const eventBus = require('../../events');
const metricsExporter = require('../../utils/metricsExporter');

class ForecastWorker {
  constructor() {
    this.modelCache = new Map();
    this.watcher = null;
    this.isWatching = false;
    this.config = {
      modelsDir: process.env.AI_MODELS_DIR || path.join(__dirname, '../../data/ai/models'),
      cacheEnabled: process.env.REDIS_ENABLED !== 'false',
      cacheTTL: parseInt(process.env.FORECAST_CACHE_TTL || '1800'), // 30 minutes
      hotReloadEnabled: process.env.HOT_RELOAD_ENABLED !== 'false',
      forecastHorizon: parseInt(process.env.FORECAST_HORIZON || '30') // 30 days
    };

    // Redis client (if available)
    this.redis = global.redisClient;
  }

  /**
   * Start watching model directory for changes
   */
  async start() {
    if (this.isWatching) {
      logger.warn('[ForecastWorker] Already watching');
      return;
    }

    try {
      // Ensure models directory exists
      await fs.mkdir(this.config.modelsDir, { recursive: true });

      // Load initial models
      await this.loadAllModels();

      // Setup file watcher for hot-reloading
      if (this.config.hotReloadEnabled) {
        this.setupWatcher();
      }

      this.isWatching = true;
      logger.info(`[ForecastWorker] Started (models: ${this.modelCache.size}, hotReload: ${this.config.hotReloadEnabled})`);
    } catch (error) {
      logger.error('[ForecastWorker] Error starting worker:', error);
      throw error;
    }
  }

  /**
   * Stop watching
   */
  async stop() {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.isWatching = false;
    logger.info('[ForecastWorker] Stopped');
  }

  /**
   * Setup file watcher for hot-reloading models
   */
  setupWatcher() {
    this.watcher = chokidar.watch(this.config.modelsDir, {
      ignored: /(^|[\/\\])\../, // Ignore dotfiles
      persistent: true,
      ignoreInitial: true,
      depth: 2
    });

    this.watcher
      .on('add', async (filePath) => {
        logger.debug(`[ForecastWorker] Model file added: ${filePath}`);
        await this.loadModel(filePath);
      })
      .on('change', async (filePath) => {
        logger.info(`[ForecastWorker] Model file changed: ${filePath}`);
        await this.reloadModel(filePath);
      })
      .on('unlink', (filePath) => {
        logger.info(`[ForecastWorker] Model file removed: ${filePath}`);
        this.unloadModel(filePath);
      })
      .on('error', (error) => {
        logger.error('[ForecastWorker] Watcher error:', error);
      });

    logger.info('[ForecastWorker] File watcher configured');
  }

  /**
   * Load all models from directory
   */
  async loadAllModels() {
    try {
      const entries = await fs.readdir(this.config.modelsDir, { withFileTypes: true });

      let loadedCount = 0;
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const itemCode = entry.name;
          const modelPath = path.join(this.config.modelsDir, itemCode);
          await this.loadModel(modelPath, itemCode);
          loadedCount++;
        }
      }

      logger.info(`[ForecastWorker] Loaded ${loadedCount} models`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.warn(`[ForecastWorker] Models directory does not exist: ${this.config.modelsDir}`);
      } else {
        logger.error('[ForecastWorker] Error loading models:', error);
      }
    }
  }

  /**
   * Load single model
   */
  async loadModel(modelPath, itemCode = null) {
    try {
      // Extract item code from path if not provided
      if (!itemCode) {
        itemCode = path.basename(path.dirname(modelPath));
      }

      // Check if model metadata exists
      const metadataPath = path.join(modelPath, 'metadata.json');
      const exists = await fs.access(metadataPath).then(() => true).catch(() => false);

      if (!exists) {
        return; // Not a valid model directory
      }

      // Load metadata
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      const metadata = JSON.parse(metadataContent);

      // Cache model metadata
      this.modelCache.set(itemCode, {
        itemCode,
        modelType: metadata.modelType || 'unknown',
        version: metadata.version || 1,
        trainedAt: metadata.trainedAt || new Date().toISOString(),
        accuracy: metadata.accuracy || {},
        loadedAt: new Date(),
        path: modelPath
      });

      logger.debug(`[ForecastWorker] Loaded model for ${itemCode}: ${metadata.modelType}`);

      // Invalidate forecast cache for this item
      await this.invalidateForecastCache(itemCode);
    } catch (error) {
      logger.error(`[ForecastWorker] Error loading model ${itemCode}:`, error);
    }
  }

  /**
   * Reload model (hot-reload)
   */
  async reloadModel(modelPath) {
    const itemCode = path.basename(path.dirname(modelPath));

    logger.info(`[ForecastWorker] Hot-reloading model for ${itemCode}`);

    // Unload old model
    this.unloadModel(modelPath);

    // Load new model
    await this.loadModel(modelPath, itemCode);

    // Invalidate cache
    await this.invalidateForecastCache(itemCode);

    // Emit reload event
    const model = this.modelCache.get(itemCode);
    if (model) {
      eventBus.emitModelRetrained(
        itemCode,
        model.modelType,
        model.accuracy,
        0 // Duration unknown for hot-reload
      );
    }
  }

  /**
   * Unload model from cache
   */
  unloadModel(modelPath) {
    const itemCode = path.basename(path.dirname(modelPath));
    this.modelCache.delete(itemCode);
    logger.debug(`[ForecastWorker] Unloaded model for ${itemCode}`);
  }

  /**
   * Get live forecast for item
   */
  async getForecast(itemCode, horizonDays = null) {
    const startTime = Date.now();
    horizonDays = horizonDays || this.config.forecastHorizon;

    try {
      // Check cache first
      if (this.config.cacheEnabled && this.redis) {
        const cached = await this.getForecastFromCache(itemCode, horizonDays);
        if (cached) {
          const latency = (Date.now() - startTime) / 1000;
          metricsExporter.recordForecastLatency(latency, 'cache_hit');
          logger.debug(`[ForecastWorker] Cache hit for ${itemCode} (${latency.toFixed(3)}s)`);
          return cached;
        }
      }

      // Check if model exists
      const model = this.modelCache.get(itemCode);
      if (!model) {
        throw new Error(`No model found for item ${itemCode}`);
      }

      // Generate forecast
      const forecast = await this.generateForecast(itemCode, model, horizonDays);

      // Cache forecast
      if (this.config.cacheEnabled && this.redis) {
        await this.cacheForecast(itemCode, horizonDays, forecast);
      }

      // Emit forecast update event
      eventBus.emitForecastUpdate(itemCode, forecast, model.modelType);

      const latency = (Date.now() - startTime) / 1000;
      metricsExporter.recordForecastLatency(latency, 'cache_miss');

      logger.debug(`[ForecastWorker] Generated forecast for ${itemCode} (${latency.toFixed(3)}s)`);

      return forecast;
    } catch (error) {
      logger.error(`[ForecastWorker] Error getting forecast for ${itemCode}:`, error);
      throw error;
    }
  }

  /**
   * Generate forecast using loaded model
   */
  async generateForecast(itemCode, model, horizonDays) {
    // In production, this would call the actual Prophet/ARIMA model
    // For now, return mock forecast data

    const forecast = {
      itemCode,
      modelType: model.modelType,
      modelVersion: model.version,
      horizon: horizonDays,
      generatedAt: new Date().toISOString(),
      predictions: []
    };

    // Generate daily predictions
    const baseDate = new Date();
    for (let i = 0; i < horizonDays; i++) {
      const date = new Date(baseDate);
      date.setDate(date.getDate() + i);

      forecast.predictions.push({
        date: date.toISOString().split('T')[0],
        forecast: Math.max(0, 100 + Math.random() * 50 - 25),
        lower: Math.max(0, 80 + Math.random() * 30),
        upper: 120 + Math.random() * 70,
        confidence: 0.95
      });
    }

    return forecast;
  }

  /**
   * Get forecast from Redis cache
   */
  async getForecastFromCache(itemCode, horizonDays) {
    if (!this.redis) return null;

    try {
      const cacheKey = `forecast:live:${itemCode}:${horizonDays}`;
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      logger.error(`[ForecastWorker] Error reading from cache:`, error);
    }

    return null;
  }

  /**
   * Cache forecast in Redis
   */
  async cacheForecast(itemCode, horizonDays, forecast) {
    if (!this.redis) return;

    try {
      const cacheKey = `forecast:live:${itemCode}:${horizonDays}`;
      await this.redis.setex(
        cacheKey,
        this.config.cacheTTL,
        JSON.stringify(forecast)
      );
    } catch (error) {
      logger.error(`[ForecastWorker] Error writing to cache:`, error);
    }
  }

  /**
   * Invalidate forecast cache for item
   */
  async invalidateForecastCache(itemCode) {
    if (!this.redis) return;

    try {
      const pattern = `forecast:live:${itemCode}:*`;
      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.debug(`[ForecastWorker] Invalidated ${keys.length} cache keys for ${itemCode}`);
      }
    } catch (error) {
      logger.error(`[ForecastWorker] Error invalidating cache:`, error);
    }
  }

  /**
   * Get worker statistics
   */
  getStats() {
    const models = Array.from(this.modelCache.entries()).map(([itemCode, model]) => ({
      itemCode,
      modelType: model.modelType,
      version: model.version,
      trainedAt: model.trainedAt,
      loadedAt: model.loadedAt
    }));

    return {
      isWatching: this.isWatching,
      modelsLoaded: this.modelCache.size,
      modelsDir: this.config.modelsDir,
      hotReloadEnabled: this.config.hotReloadEnabled,
      cacheEnabled: this.config.cacheEnabled,
      models
    };
  }

  /**
   * Check if model exists for item
   */
  hasModel(itemCode) {
    return this.modelCache.has(itemCode);
  }

  /**
   * Get model metadata
   */
  getModel(itemCode) {
    return this.modelCache.get(itemCode);
  }
}

// Singleton instance
const forecastWorker = new ForecastWorker();

module.exports = forecastWorker;
