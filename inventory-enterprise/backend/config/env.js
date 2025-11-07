/**
 * Centralized Environment Configuration - v20.1
 * Exports normalized config with safe defaults
 */

module.exports = {
  // Core
  port: parseInt(process.env.PORT || '8080', 10),
  nodeEnv: process.env.NODE_ENV || 'production',
  appVersion: process.env.APP_VERSION || '20.1.0',

  // Database
  databasePath: process.env.DATABASE_PATH ||
    (process.env.RAILWAY_VOLUME_MOUNT_PATH
      ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/inventory_v20.db`
      : '/tmp/inventory_v20.db'),

  // Auth
  jwt: {
    secret: process.env.JWT_SECRET || 'INSECURE_FALLBACK_SECRET_CHANGE_IN_PRODUCTION',
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  },

  // Redis (optional)
  redis: {
    url: process.env.REDIS_URL || null,
    enabled: Boolean(process.env.REDIS_URL),
  },

  // Cache TTLs (seconds)
  cache: {
    ttlItems: parseInt(process.env.CACHE_TTL_ITEMS || '300', 10),
    ttlSummary: parseInt(process.env.CACHE_TTL_SUMMARY || '300', 10),
  },

  // Rate Limiting
  rateLimit: {
    windowMin: parseInt(process.env.RATE_LIMIT_WINDOW_MIN || '5', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },

  // CORS
  cors: {
    allowlist: process.env.CORS_ALLOWLIST
      ? process.env.CORS_ALLOWLIST.split(',').map(s => s.trim())
      : ['*'],
  },

  // Cron
  cron: {
    daily: process.env.CRON_DAILY || '5 2 * * *', // 02:05 UTC = 21:05 Toronto (EST)
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    prettyPrint: process.env.NODE_ENV !== 'production',
  },
};
