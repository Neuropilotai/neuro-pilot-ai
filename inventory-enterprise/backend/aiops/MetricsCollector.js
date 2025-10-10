/**
 * Metrics Collector - Prometheus Integration
 * Version: v2.6.0-2025-10-07
 *
 * Collects and parses metrics from Prometheus for AI analysis.
 *
 * @module aiops/MetricsCollector
 */

const axios = require('axios');
const logger = require('../config/logger').logger;

class MetricsCollector {
  constructor(config = {}) {
    this.config = {
      prometheusUrl: config.prometheusUrl || 'http://localhost:9090',
      scrapeInterval: config.scrapeInterval || 60000,
      timeout: config.timeout || 5000,
      ...config
    };

    this.client = axios.create({
      baseURL: this.config.prometheusUrl,
      timeout: this.config.timeout
    });

    // Metrics to monitor
    this.metricQueries = {
      api_latency_p95_ms: 'histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) * 1000',
      cache_hit_rate_percent: '(redis_cache_hits / (redis_cache_hits + redis_cache_misses)) * 100',
      memory_usage_percent: '(process_resident_memory_bytes / node_memory_MemTotal_bytes) * 100',
      cpu_usage_percent: 'rate(process_cpu_seconds_total[5m]) * 100',
      db_connection_pool_active: 'pg_connection_pool_active',
      tenant_requests_per_second: 'rate(http_requests_total[1m])',
      forecast_accuracy_mape: 'ai_forecast_mape_percent',
      error_rate_percent: '(rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])) * 100',
      disk_usage_percent: '(node_filesystem_size_bytes - node_filesystem_free_bytes) / node_filesystem_size_bytes * 100',
      active_sessions: 'active_sessions_total'
    };
  }

  /**
   * Initialize collector
   */
  async initialize() {
    logger.info('Initializing Metrics Collector');
    logger.info(`Prometheus URL: ${this.config.prometheusUrl}`);

    // Test Prometheus connection
    try {
      await this.client.get('/api/v1/query?query=up');
      logger.info('Successfully connected to Prometheus');
    } catch (error) {
      logger.warn('Failed to connect to Prometheus:', error.message);
      logger.warn('Metrics collection will use fallback values');
    }
  }

  /**
   * Collect current metrics
   */
  async collectMetrics() {
    const metrics = {};
    const timestamp = new Date().toISOString();

    try {
      // Query each metric from Prometheus
      const promises = Object.entries(this.metricQueries).map(async ([name, query]) => {
        try {
          const value = await this._queryPrometheus(query);
          metrics[name] = {
            value,
            timestamp,
            query
          };
        } catch (error) {
          logger.debug(`Failed to collect metric ${name}:`, error.message);
          metrics[name] = {
            value: null,
            timestamp,
            error: error.message
          };
        }
      });

      await Promise.all(promises);

      logger.debug(`Collected ${Object.keys(metrics).length} metrics`);
      return {
        timestamp,
        metrics
      };
    } catch (error) {
      logger.error('Error collecting metrics:', error);
      throw error;
    }
  }

  /**
   * Query Prometheus
   * @private
   */
  async _queryPrometheus(query) {
    try {
      const response = await this.client.get('/api/v1/query', {
        params: { query }
      });

      if (response.data.status === 'success' &&
          response.data.data.result.length > 0) {
        const result = response.data.data.result[0];
        return parseFloat(result.value[1]);
      }

      return null;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        // Prometheus not available, return mock data for testing
        return this._getMockValue(query);
      }
      throw error;
    }
  }

  /**
   * Fetch historical metrics
   */
  async fetchHistorical(days = 7) {
    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - (days * 24 * 60 * 60);
    const step = '5m'; // 5-minute resolution

    const historicalData = [];

    try {
      for (const [name, query] of Object.entries(this.metricQueries)) {
        const response = await this.client.get('/api/v1/query_range', {
          params: {
            query,
            start: startTime,
            end: endTime,
            step
          }
        });

        if (response.data.status === 'success' &&
            response.data.data.result.length > 0) {
          const values = response.data.data.result[0].values;

          for (const [timestamp, value] of values) {
            historicalData.push({
              metricName: name,
              value: parseFloat(value),
              timestamp: new Date(timestamp * 1000).toISOString()
            });
          }
        }
      }

      logger.info(`Fetched ${historicalData.length} historical data points (${days} days)`);
      return historicalData;
    } catch (error) {
      logger.error('Error fetching historical metrics:', error);
      return this._generateMockHistorical(days);
    }
  }

  /**
   * Get mock value for testing (when Prometheus unavailable)
   * @private
   */
  _getMockValue(query) {
    const mockData = {
      api_latency_p95_ms: () => 200 + Math.random() * 100,
      cache_hit_rate_percent: () => 85 + Math.random() * 10,
      memory_usage_percent: () => 60 + Math.random() * 20,
      cpu_usage_percent: () => 40 + Math.random() * 30,
      db_connection_pool_active: () => Math.floor(15 + Math.random() * 10),
      tenant_requests_per_second: () => 50 + Math.random() * 50,
      forecast_accuracy_mape: () => 10 + Math.random() * 5,
      error_rate_percent: () => Math.random() * 2,
      disk_usage_percent: () => 50 + Math.random() * 20,
      active_sessions: () => Math.floor(100 + Math.random() * 50)
    };

    // Find matching mock generator
    for (const [key, generator] of Object.entries(mockData)) {
      if (query.includes(key) || this.metricQueries[key] === query) {
        return generator();
      }
    }

    return Math.random() * 100;
  }

  /**
   * Generate mock historical data for testing
   * @private
   */
  _generateMockHistorical(days = 7) {
    const data = [];
    const now = Date.now();
    const interval = 5 * 60 * 1000; // 5 minutes

    for (const metricName of Object.keys(this.metricQueries)) {
      for (let i = 0; i < (days * 24 * 12); i++) { // 12 data points per hour
        const timestamp = new Date(now - (i * interval)).toISOString();
        const value = this._getMockValue(metricName);

        data.push({
          metricName,
          value,
          timestamp
        });
      }
    }

    logger.warn(`Generated ${data.length} mock historical data points (Prometheus unavailable)`);
    return data;
  }

  /**
   * Parse Prometheus text format metrics
   */
  parseTextFormat(metricsText) {
    const metrics = {};
    const lines = metricsText.split('\n');

    for (const line of lines) {
      if (line.startsWith('#') || line.trim() === '') continue;

      const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)\{?([^}]*)\}?\s+([0-9.e+-]+)/);
      if (match) {
        const [, name, labels, value] = match;
        const key = labels ? `${name}{${labels}}` : name;
        metrics[key] = parseFloat(value);
      }
    }

    return metrics;
  }
}

module.exports = MetricsCollector;
