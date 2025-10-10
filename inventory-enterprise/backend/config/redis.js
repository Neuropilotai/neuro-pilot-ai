/**
 * Redis Cache Manager
 * Provides connection pooling, multi-layer caching, and fallback strategies
 */

const config = require('./index');
const logger = require('./logger');

class RedisManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.isEnabled = config.redis.enabled;
    this.retryAttempts = 0;
    this.maxRetries = 5;

    // Cache layer TTLs (in seconds)
    this.ttl = {
      inventory: 300,        // 5 minutes
      forecasts: 86400,      // 24 hours
      dashboardStats: 300,   // 5 minutes
      reorderRecommendations: 3600,  // 1 hour
      models: 604800,        // 7 days
      userSessions: 900,     // 15 minutes
      apiResults: 60         // 1 minute
    };
  }

  /**
   * Initialize Redis connection
   */
  async connect() {
    if (!this.isEnabled) {
      logger.info('Redis caching disabled');
      return false;
    }

    try {
      // Dynamically import ioredis (only if Redis is enabled)
      const Redis = require('ioredis');

      this.client = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
        retryStrategy: (times) => {
          if (times > this.maxRetries) {
            logger.error('Redis max retries exceeded, disabling Redis');
            this.isEnabled = false;
            return null;
          }
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        enableOfflineQueue: false,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        connectTimeout: 10000
      });

      // Event handlers
      this.client.on('connect', () => {
        logger.info('Redis connected', {
          host: config.redis.host,
          port: config.redis.port
        });
        this.isConnected = true;
        this.retryAttempts = 0;
      });

      this.client.on('error', (err) => {
        logger.error('Redis error', { error: err.message });
        this.isConnected = false;
      });

      this.client.on('close', () => {
        logger.warn('Redis connection closed');
        this.isConnected = false;
      });

      this.client.on('reconnecting', () => {
        this.retryAttempts++;
        logger.info('Redis reconnecting', { attempt: this.retryAttempts });
      });

      // Attempt connection
      await this.client.connect();

      return true;

    } catch (error) {
      logger.error('Failed to initialize Redis', { error: error.message });
      this.isEnabled = false;
      return false;
    }
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} - Parsed value or null
   */
  async get(key) {
    if (!this.isEnabled || !this.isConnected) {
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (value === null) {
        return null;
      }

      // Try to parse JSON, return raw value if parsing fails
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }

    } catch (error) {
      logger.error('Redis GET failed', { key, error: error.message });
      return null;
    }
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache (will be JSON stringified)
   * @param {number} ttl - TTL in seconds (optional)
   * @returns {Promise<boolean>} - Success status
   */
  async set(key, value, ttl = null) {
    if (!this.isEnabled || !this.isConnected) {
      return false;
    }

    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);

      if (ttl !== null) {
        await this.client.setex(key, ttl, stringValue);
      } else {
        await this.client.set(key, stringValue);
      }

      return true;

    } catch (error) {
      logger.error('Redis SET failed', { key, error: error.message });
      return false;
    }
  }

  /**
   * Delete key from cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} - Success status
   */
  async del(key) {
    if (!this.isEnabled || !this.isConnected) {
      return false;
    }

    try {
      await this.client.del(key);
      return true;

    } catch (error) {
      logger.error('Redis DEL failed', { key, error: error.message });
      return false;
    }
  }

  /**
   * Delete multiple keys matching pattern
   * @param {string} pattern - Key pattern (e.g., "forecast:*")
   * @returns {Promise<number>} - Number of keys deleted
   */
  async delPattern(pattern) {
    if (!this.isEnabled || !this.isConnected) {
      return 0;
    }

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      await this.client.del(...keys);
      return keys.length;

    } catch (error) {
      logger.error('Redis DEL pattern failed', { pattern, error: error.message });
      return 0;
    }
  }

  /**
   * Check if key exists
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} - Existence status
   */
  async exists(key) {
    if (!this.isEnabled || !this.isConnected) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;

    } catch (error) {
      logger.error('Redis EXISTS failed', { key, error: error.message });
      return false;
    }
  }

  /**
   * Get remaining TTL for key
   * @param {string} key - Cache key
   * @returns {Promise<number>} - TTL in seconds, -1 if no expiry, -2 if not exists
   */
  async ttlRemaining(key) {
    if (!this.isEnabled || !this.isConnected) {
      return -2;
    }

    try {
      return await this.client.ttl(key);

    } catch (error) {
      logger.error('Redis TTL failed', { key, error: error.message });
      return -2;
    }
  }

  /**
   * Increment counter
   * @param {string} key - Cache key
   * @param {number} amount - Amount to increment (default 1)
   * @returns {Promise<number|null>} - New value or null on error
   */
  async incr(key, amount = 1) {
    if (!this.isEnabled || !this.isConnected) {
      return null;
    }

    try {
      if (amount === 1) {
        return await this.client.incr(key);
      } else {
        return await this.client.incrby(key, amount);
      }

    } catch (error) {
      logger.error('Redis INCR failed', { key, error: error.message });
      return null;
    }
  }

  /**
   * Cache wrapper - Get from cache or execute function and cache result
   * @param {string} key - Cache key
   * @param {Function} fn - Async function to execute if cache miss
   * @param {number} ttl - TTL in seconds
   * @returns {Promise<any>} - Cached or computed value
   */
  async getOrSet(key, fn, ttl) {
    // Try to get from cache
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - execute function
    const value = await fn();

    // Cache result
    await this.set(key, value, ttl);

    return value;
  }

  /**
   * Get cache statistics
   * @returns {Promise<object>} - Cache stats
   */
  async getStats() {
    if (!this.isEnabled || !this.isConnected) {
      return {
        enabled: this.isEnabled,
        connected: false
      };
    }

    try {
      const info = await this.client.info('stats');
      const dbSize = await this.client.dbsize();

      // Parse info string
      const stats = {};
      info.split('\r\n').forEach(line => {
        const [key, value] = line.split(':');
        if (key && value) {
          stats[key] = value;
        }
      });

      return {
        enabled: true,
        connected: true,
        keys: dbSize,
        hits: parseInt(stats.keyspace_hits || 0),
        misses: parseInt(stats.keyspace_misses || 0),
        hitRate: stats.keyspace_hits && stats.keyspace_misses
          ? (parseInt(stats.keyspace_hits) / (parseInt(stats.keyspace_hits) + parseInt(stats.keyspace_misses)) * 100).toFixed(2)
          : 'N/A'
      };

    } catch (error) {
      logger.error('Failed to get Redis stats', { error: error.message });
      return { enabled: true, connected: false };
    }
  }

  /**
   * Flush all keys (USE WITH CAUTION)
   * @returns {Promise<boolean>} - Success status
   */
  async flushAll() {
    if (!this.isEnabled || !this.isConnected) {
      return false;
    }

    try {
      await this.client.flushdb();
      logger.warn('Redis database flushed');
      return true;

    } catch (error) {
      logger.error('Redis FLUSH failed', { error: error.message });
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
      logger.info('Redis disconnected');
    }
  }

  /**
   * Generate cache key for different data types
   */
  keys = {
    inventory: (itemCode) => `inventory:${itemCode}`,
    inventoryList: () => 'inventory:list',
    forecast: (itemCode, periods) => `forecast:${itemCode}:${periods}`,
    reorder: (itemCode) => `reorder:${itemCode}`,
    dashboardStats: () => 'dashboard:stats',
    model: (modelId) => `model:${modelId}`,
    userSession: (userId) => `session:${userId}`,
    apiResult: (endpoint, params) => `api:${endpoint}:${JSON.stringify(params)}`
  };
}

// Singleton instance
const redisManager = new RedisManager();

module.exports = redisManager;
