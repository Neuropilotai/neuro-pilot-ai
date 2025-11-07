/**
 * Redis Cache Middleware - v20.1
 * Graceful degradation if Redis unavailable
 */

const Redis = require('ioredis');
const config = require('../config/env');

let redisClient = null;
let isRedisConnected = false;

/**
 * Initialize Redis client
 */
function initRedis(logger) {
  if (!config.redis.url) {
    logger.info('Redis URL not configured - caching disabled');
    return null;
  }

  try {
    const client = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 100, 2000);
        return delay;
      },
      reconnectOnError(err) {
        logger.warn(`Redis connection error: ${err.message}`);
        return true;
      },
    });

    client.on('connect', () => {
      isRedisConnected = true;
      logger.info('✅ Redis connected');
    });

    client.on('error', (err) => {
      isRedisConnected = false;
      logger.error(`Redis error: ${err.message}`);
    });

    client.on('close', () => {
      isRedisConnected = false;
      logger.warn('Redis connection closed');
    });

    redisClient = client;
    return client;
  } catch (err) {
    logger.error(`Failed to initialize Redis: ${err.message}`);
    return null;
  }
}

/**
 * Get cache value
 */
async function getCache(key) {
  if (!redisClient || !isRedisConnected) {
    return null;
  }

  try {
    const value = await redisClient.get(key);
    return value ? JSON.parse(value) : null;
  } catch (err) {
    console.error(`Cache GET error for key ${key}:`, err.message);
    return null;
  }
}

/**
 * Set cache value
 */
async function setCache(key, value, ttl = 300) {
  if (!redisClient || !isRedisConnected) {
    return false;
  }

  try {
    await redisClient.setex(key, ttl, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error(`Cache SET error for key ${key}:`, err.message);
    return false;
  }
}

/**
 * Delete cache keys by pattern
 */
async function delCache(patterns = []) {
  if (!redisClient || !isRedisConnected) {
    return 0;
  }

  try {
    let deleted = 0;

    for (const pattern of patterns) {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        deleted += await redisClient.del(...keys);
      }
    }

    return deleted;
  } catch (err) {
    console.error(`Cache DEL error:`, err.message);
    return 0;
  }
}

/**
 * Get cache stats
 */
async function getCacheStats() {
  if (!redisClient || !isRedisConnected) {
    return {
      connected: false,
      keys: 0,
      memory: null,
    };
  }

  try {
    const info = await redisClient.info('stats');
    const keys = await redisClient.dbsize();

    return {
      connected: true,
      keys,
      info: info.split('\n').slice(0, 10).join('\n'), // First 10 lines
    };
  } catch (err) {
    return {
      connected: false,
      error: err.message,
    };
  }
}

/**
 * Middleware to attach cache helpers to req object
 */
function cacheMiddleware(req, res, next) {
  req.cache = {
    get: getCache,
    set: setCache,
    del: delCache,
    stats: getCacheStats,
    isConnected: () => isRedisConnected,
  };
  next();
}

/**
 * Graceful shutdown
 */
async function closeRedis() {
  if (redisClient) {
    await redisClient.quit();
  }
}

module.exports = {
  initRedis,
  getCache,
  setCache,
  delCache,
  getCacheStats,
  cacheMiddleware,
  closeRedis,
  isRedisConnected: () => isRedisConnected,
};
