/**
 * Prometheus Metrics - v20.1
 * HTTP request metrics + Node.js process metrics
 */

const client = require('prom-client');
const express = require('express');

// Create a Registry
const register = new client.Registry();

// Add default metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
});

const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const httpRequestCurrent = new client.Gauge({
  name: 'http_requests_in_progress',
  help: 'Number of HTTP requests currently in progress',
  labelNames: ['method'],
});

const cacheHitTotal = new client.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_key_prefix'],
});

const cacheMissTotal = new client.Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_key_prefix'],
});

const databaseQueryDuration = new client.Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
});

// Register custom metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(httpRequestCurrent);
register.registerMetric(cacheHitTotal);
register.registerMetric(cacheMissTotal);
register.registerMetric(databaseQueryDuration);

/**
 * Middleware to track HTTP request metrics
 */
function metricsMiddleware(req, res, next) {
  const start = Date.now();
  const method = req.method;

  // Increment in-progress gauge
  httpRequestCurrent.inc({ method });

  // Hook into response finish event
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000; // Convert to seconds
    const route = req.route ? req.route.path : req.path;
    const statusCode = res.statusCode;

    // Record metrics
    httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
    httpRequestTotal.inc({ method, route, status_code: statusCode });
    httpRequestCurrent.dec({ method });
  });

  next();
}

/**
 * Record cache hit
 */
function recordCacheHit(keyPrefix) {
  cacheHitTotal.inc({ cache_key_prefix: keyPrefix });
}

/**
 * Record cache miss
 */
function recordCacheMiss(keyPrefix) {
  cacheMissTotal.inc({ cache_key_prefix: keyPrefix });
}

/**
 * Record database query duration
 */
function recordDBQuery(operation, table, durationMs) {
  databaseQueryDuration.observe({ operation, table }, durationMs / 1000);
}

/**
 * Create metrics router
 */
function createMetricsRouter() {
  const router = express.Router();

  router.get('/metrics', async (req, res) => {
    try {
      res.set('Content-Type', register.contentType);
      const metrics = await register.metrics();
      res.send(metrics);
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  return router;
}

module.exports = {
  metricsMiddleware,
  recordCacheHit,
  recordCacheMiss,
  recordDBQuery,
  createMetricsRouter,
  register,
};
