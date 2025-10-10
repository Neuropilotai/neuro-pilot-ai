/**
 * Redis Caching Middleware
 * Automatically caches API responses with configurable TTLs
 */

const redisManager = require('../config/redis');
const logger = require('../config/logger');

/**
 * Cache middleware factory
 * @param {object} options - Caching options
 * @returns {Function} - Express middleware
 */
function cacheMiddleware(options = {}) {
  const {
    ttl = 300, // 5 minutes default
    keyPrefix = 'api',
    varyBy = [],  // Additional request properties to include in cache key
    skipCache = false,
    onlyMethods = ['GET'],
    excludePaths = ['/health', '/metrics', '/auth/login']
  } = options;

  return async (req, res, next) => {
    // Skip if caching disabled or not a cacheable method
    if (skipCache || !onlyMethods.includes(req.method)) {
      return next();
    }

    // Skip excluded paths
    if (excludePaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    // Skip if Redis not available
    if (!redisManager.isEnabled || !redisManager.isConnected) {
      return next();
    }

    try {
      // Generate cache key
      const cacheKey = generateCacheKey(req, keyPrefix, varyBy);

      // Check cache
      const cached = await redisManager.get(cacheKey);
      if (cached !== null) {
        // Cache hit
        logger.debug('Cache HIT', { key: cacheKey });

        // Set cache headers
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-Key', cacheKey);

        // Return cached response
        return res.json(cached);
      }

      // Cache miss - continue to handler
      logger.debug('Cache MISS', { key: cacheKey });

      // Intercept res.json to cache the response
      const originalJson = res.json.bind(res);
      res.json = function(data) {
        // Cache successful responses only (status 200-299)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redisManager.set(cacheKey, data, ttl).catch(err => {
            logger.error('Failed to cache response', {
              key: cacheKey,
              error: err.message
            });
          });
        }

        // Set cache headers
        res.set('X-Cache', 'MISS');
        res.set('X-Cache-Key', cacheKey);

        // Send response
        return originalJson(data);
      };

      next();

    } catch (error) {
      logger.error('Cache middleware error', { error: error.message });
      // Continue without caching on error
      next();
    }
  };
}

/**
 * Generate cache key from request
 */
function generateCacheKey(req, prefix, varyBy) {
  const parts = [prefix, req.method, req.path];

  // Add query params
  if (Object.keys(req.query).length > 0) {
    const sortedQuery = Object.keys(req.query)
      .sort()
      .map(key => `${key}=${req.query[key]}`)
      .join('&');
    parts.push(sortedQuery);
  }

  // Add custom vary-by properties
  varyBy.forEach(prop => {
    if (req[prop]) {
      parts.push(`${prop}:${req[prop]}`);
    } else if (req.get(prop)) {
      parts.push(`${prop}:${req.get(prop)}`);
    }
  });

  return parts.join(':');
}

/**
 * Cache invalidation middleware
 * Invalidates cache for specific patterns on write operations
 */
function invalidateCacheMiddleware(options = {}) {
  const {
    patterns = [],  // Cache key patterns to invalidate
    onMethods = ['POST', 'PUT', 'PATCH', 'DELETE']
  } = options;

  return async (req, res, next) => {
    // Only invalidate on write operations
    if (!onMethods.includes(req.method)) {
      return next();
    }

    // Skip if Redis not available
    if (!redisManager.isEnabled || !redisManager.isConnected) {
      return next();
    }

    try {
      // Intercept res.json to invalidate cache after successful response
      const originalJson = res.json.bind(res);
      res.json = async function(data) {
        // Invalidate cache on successful writes (status 200-299)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          for (const pattern of patterns) {
            const deletedCount = await redisManager.delPattern(pattern);
            if (deletedCount > 0) {
              logger.info('Cache invalidated', {
                pattern,
                count: deletedCount,
                method: req.method,
                path: req.path
              });
            }
          }
        }

        return originalJson(data);
      };

      next();

    } catch (error) {
      logger.error('Cache invalidation middleware error', { error: error.message });
      next();
    }
  };
}

/**
 * Specific cache middleware for different API sections
 */

// Inventory caching (5 minutes)
function cacheInventory() {
  return cacheMiddleware({
    ttl: redisManager.ttl.inventory,
    keyPrefix: 'inventory',
    varyBy: ['user']
  });
}

// Forecast caching (24 hours)
function cacheForecast() {
  return cacheMiddleware({
    ttl: redisManager.ttl.forecasts,
    keyPrefix: 'forecast',
    varyBy: []
  });
}

// Dashboard stats caching (5 minutes)
function cacheDashboard() {
  return cacheMiddleware({
    ttl: redisManager.ttl.dashboardStats,
    keyPrefix: 'dashboard',
    varyBy: ['user']
  });
}

// Reorder recommendations caching (1 hour)
function cacheReorder() {
  return cacheMiddleware({
    ttl: redisManager.ttl.reorderRecommendations,
    keyPrefix: 'reorder',
    varyBy: []
  });
}

// Model metadata caching (7 days)
function cacheModels() {
  return cacheMiddleware({
    ttl: redisManager.ttl.models,
    keyPrefix: 'models',
    varyBy: []
  });
}

/**
 * Cache warming - Pre-populate cache with frequently accessed data
 */
async function warmCache(endpoints = []) {
  if (!redisManager.isEnabled || !redisManager.isConnected) {
    logger.warn('Cannot warm cache: Redis not available');
    return;
  }

  logger.info('Starting cache warming', { endpoints: endpoints.length });

  for (const endpoint of endpoints) {
    try {
      // Fetch data and cache it
      // This would typically make internal API calls
      logger.debug('Warming cache for endpoint', { endpoint });

      // Implementation would depend on specific endpoints
      // Example: await fetchAndCache('/api/inventory/list');

    } catch (error) {
      logger.error('Cache warming failed for endpoint', {
        endpoint,
        error: error.message
      });
    }
  }

  logger.info('Cache warming complete');
}

/**
 * Cache statistics middleware
 * Adds cache stats to response headers
 */
function cacheStatsMiddleware() {
  return async (req, res, next) => {
    if (req.path === '/api/cache/stats') {
      try {
        const stats = await redisManager.getStats();
        return res.json(stats);
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }
    next();
  };
}

module.exports = {
  cacheMiddleware,
  invalidateCacheMiddleware,
  cacheInventory,
  cacheForecast,
  cacheDashboard,
  cacheReorder,
  cacheModels,
  warmCache,
  cacheStatsMiddleware
};
