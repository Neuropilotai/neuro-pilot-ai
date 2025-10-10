const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Enterprise Configuration Manager
 * Validates all environment variables and provides typed access
 */
class Config {
  constructor() {
    this.validateRequired();
    this.validateSecrets();
    this.ensureDirectories();
  }

  // ================================================================
  // SERVER CONFIGURATION
  // ================================================================
  get nodeEnv() {
    return process.env.NODE_ENV || 'development';
  }

  get isDevelopment() {
    return this.nodeEnv === 'development';
  }

  get isProduction() {
    return this.nodeEnv === 'production';
  }

  get port() {
    return parseInt(process.env.PORT || '8083', 10);
  }

  get host() {
    return process.env.HOST || '0.0.0.0';
  }

  // ================================================================
  // SECURITY CONFIGURATION
  // ================================================================
  get jwtSecret() {
    return process.env.JWT_SECRET;
  }

  get jwtRefreshSecret() {
    return process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  }

  get sessionSecret() {
    return process.env.SESSION_SECRET;
  }

  get encryptionKey() {
    const key = process.env.ENCRYPTION_KEY;
    if (!key || key.length !== 64) {
      throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters) for AES-256');
    }
    return Buffer.from(key, 'hex');
  }

  get jwtAccessExpiry() {
    return process.env.JWT_ACCESS_EXPIRY || '15m';
  }

  get jwtRefreshExpiry() {
    return process.env.JWT_REFRESH_EXPIRY || '7d';
  }

  get jwtRotationEnabled() {
    return process.env.JWT_ROTATION_ENABLED === 'true';
  }

  get bcryptRounds() {
    return parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
  }

  get maxLoginAttempts() {
    return parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10);
  }

  get lockoutTime() {
    return parseInt(process.env.LOCKOUT_TIME_MS || '1800000', 10);
  }

  get require2FA() {
    return process.env.REQUIRE_2FA === 'true';
  }

  get sessionTimeout() {
    return parseInt(process.env.SESSION_TIMEOUT_MS || '1800000', 10);
  }

  // ================================================================
  // ADMIN CONFIGURATION
  // ================================================================
  get adminEmail() {
    return process.env.ADMIN_EMAIL;
  }

  get adminPassword() {
    return process.env.ADMIN_PASSWORD;
  }

  // ================================================================
  // CORS CONFIGURATION
  // ================================================================
  get allowedOrigins() {
    const origins = process.env.ALLOWED_ORIGINS || 'http://localhost:3000';
    return origins.split(',').map(o => o.trim());
  }

  get corsCredentials() {
    return process.env.CORS_CREDENTIALS !== 'false';
  }

  // ================================================================
  // DATABASE CONFIGURATION
  // ================================================================
  get dbPath() {
    return process.env.DB_PATH || './data/enterprise_inventory.db';
  }

  get dbBackupPath() {
    return process.env.DB_BACKUP_PATH || './backups';
  }

  get enableWAL() {
    return process.env.ENABLE_WAL !== 'false';
  }

  // ================================================================
  // BACKUP CONFIGURATION
  // ================================================================
  get backupEnabled() {
    return process.env.BACKUP_ENABLED !== 'false';
  }

  get backupSchedule() {
    return process.env.BACKUP_SCHEDULE || '0 2 * * *'; // 2 AM daily
  }

  get backupRetentionDays() {
    return parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10);
  }

  get backupLocalPath() {
    return process.env.BACKUP_LOCAL_PATH || './backups';
  }

  get googleDriveEnabled() {
    return process.env.GOOGLE_DRIVE_ENABLED === 'true';
  }

  get googleDriveFolderId() {
    return process.env.GOOGLE_DRIVE_FOLDER_ID;
  }

  // ================================================================
  // LOGGING CONFIGURATION
  // ================================================================
  get logLevel() {
    return process.env.LOG_LEVEL || (this.isDevelopment ? 'debug' : 'info');
  }

  get logDir() {
    return process.env.LOG_DIR || './logs';
  }

  get logMaxSize() {
    return process.env.LOG_MAX_SIZE || '20m';
  }

  get logMaxFiles() {
    return process.env.LOG_MAX_FILES || '14d';
  }

  get logRotate() {
    return process.env.LOG_ROTATE !== 'false';
  }

  // ================================================================
  // MONITORING CONFIGURATION
  // ================================================================
  get metricsEnabled() {
    return process.env.METRICS_ENABLED !== 'false';
  }

  get healthCheckInterval() {
    return parseInt(process.env.HEALTH_CHECK_INTERVAL || '60000', 10);
  }

  get performanceMonitoring() {
    return process.env.PERFORMANCE_MONITORING !== 'false';
  }

  // ================================================================
  // RATE LIMITING CONFIGURATION
  // ================================================================
  get rateLimitWindow() {
    return parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10);
  }

  get rateLimitMax() {
    return parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);
  }

  get authRateLimitMax() {
    return parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5', 10);
  }

  // ================================================================
  // TRANSACTION LOG CONFIGURATION
  // ================================================================
  get transactionLogEnabled() {
    return process.env.TRANSACTION_LOG_ENABLED !== 'false';
  }

  get transactionLogPath() {
    return process.env.TRANSACTION_LOG_PATH || './data/transaction_log.jsonl';
  }

  // ================================================================
  // I18N CONFIGURATION
  // ================================================================
  get defaultLanguage() {
    return process.env.DEFAULT_LANGUAGE || 'en';
  }

  get supportedLanguages() {
    const langs = process.env.SUPPORTED_LANGUAGES || 'en,fr';
    return langs.split(',').map(l => l.trim());
  }

  get localePath() {
    return process.env.LOCALE_PATH || './locales';
  }

  // ================================================================
  // REDIS CONFIGURATION (v2.1)
  // ================================================================
  get redis() {
    return {
      enabled: process.env.REDIS_ENABLED === 'true',
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || null,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      ttl: {
        inventory: parseInt(process.env.REDIS_TTL_INVENTORY || '300', 10),
        forecasts: parseInt(process.env.REDIS_TTL_FORECASTS || '86400', 10),
        dashboardStats: parseInt(process.env.REDIS_TTL_STATS || '300', 10),
        reorderRecommendations: parseInt(process.env.REDIS_TTL_REORDER || '3600', 10),
        models: parseInt(process.env.REDIS_TTL_MODELS || '604800', 10),
        userSessions: parseInt(process.env.REDIS_TTL_SESSIONS || '900', 10),
        apiResults: parseInt(process.env.REDIS_TTL_API || '60', 10)
      }
    };
  }

  // ================================================================
  // POSTGRESQL CONFIGURATION (v2.1)
  // ================================================================
  get postgres() {
    return {
      enabled: process.env.POSTGRES_ENABLED === 'true',
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.POSTGRES_DB || 'inventory_enterprise',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || '',
      ssl: process.env.POSTGRES_SSL === 'true',
      maxConnections: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || '20', 10),
      idleTimeout: parseInt(process.env.POSTGRES_IDLE_TIMEOUT || '30000', 10),
      connectionTimeout: parseInt(process.env.POSTGRES_CONNECTION_TIMEOUT || '10000', 10)
    };
  }

  get databaseType() {
    return process.env.DATABASE_TYPE || (this.postgres.enabled ? 'postgres' : 'sqlite');
  }

  // ================================================================
  // AI CONFIGURATION
  // ================================================================
  get aiEnabled() {
    return process.env.AI_ENABLED !== 'false';
  }

  get aiForecasting() {
    return process.env.AI_FORECASTING === 'true';
  }

  get aiAnomalyDetection() {
    return process.env.AI_ANOMALY_DETECTION !== 'false';
  }

  get aiConfidenceThreshold() {
    return parseFloat(process.env.AI_CONFIDENCE_THRESHOLD || '0.7');
  }

  // ================================================================
  // FEATURE FLAGS
  // ================================================================
  get featureBarcodeScanning() {
    return process.env.FEATURE_BARCODE_SCANNING !== 'false';
  }

  get featurePdfUpload() {
    return process.env.FEATURE_PDF_UPLOAD !== 'false';
  }

  get featureExcelImport() {
    return process.env.FEATURE_EXCEL_IMPORT !== 'false';
  }

  get featureMultiLocation() {
    return process.env.FEATURE_MULTI_LOCATION !== 'false';
  }

  get featureCaseTracking() {
    return process.env.FEATURE_CASE_TRACKING !== 'false';
  }

  // ================================================================
  // VALIDATION METHODS
  // ================================================================
  validateRequired() {
    const required = [
      'JWT_SECRET',
      'SESSION_SECRET',
      'ENCRYPTION_KEY',
      'ADMIN_EMAIL',
      'ADMIN_PASSWORD'
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0 && this.isProduction) {
      throw new Error(
        `Missing required environment variables: ${missing.join(', ')}\n` +
        'Please copy .env.example to .env and fill in all required values.'
      );
    }
  }

  validateSecrets() {
    // Validate secret strength in production
    if (this.isProduction) {
      const secrets = [
        { name: 'JWT_SECRET', value: process.env.JWT_SECRET },
        { name: 'SESSION_SECRET', value: process.env.SESSION_SECRET }
      ];

      secrets.forEach(({ name, value }) => {
        if (!value || value.length < 64) {
          throw new Error(
            `${name} must be at least 64 characters in production. ` +
            `Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
          );
        }

        // Check if it looks like a placeholder
        if (value.includes('REPLACE') || value === 'changeme' || value === 'secret') {
          throw new Error(`${name} appears to be a placeholder value. Please generate a secure random key.`);
        }
      });

      // Validate admin password is changed
      if (
        process.env.ADMIN_PASSWORD === 'CHANGE_ME_IMMEDIATELY' ||
        process.env.ADMIN_PASSWORD === 'Admin123!@#' ||
        process.env.ADMIN_PASSWORD.length < 12
      ) {
        console.warn(
          '⚠️  WARNING: ADMIN_PASSWORD should be changed from default and be at least 12 characters in production.'
        );
      }
    }
  }

  ensureDirectories() {
    const dirs = [
      path.dirname(this.dbPath),
      this.dbBackupPath,
      this.backupLocalPath,
      this.logDir,
      path.dirname(this.transactionLogPath),
      this.localePath
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  // ================================================================
  // UTILITY METHODS
  // ================================================================
  toString() {
    return JSON.stringify({
      nodeEnv: this.nodeEnv,
      port: this.port,
      isDevelopment: this.isDevelopment,
      isProduction: this.isProduction,
      databaseType: this.databaseType,
      redisEnabled: this.redis.enabled,
      postgresEnabled: this.postgres.enabled,
      aiEnabled: this.aiEnabled,
      metricsEnabled: this.metricsEnabled,
      backupEnabled: this.backupEnabled,
      transactionLogEnabled: this.transactionLogEnabled,
      supportedLanguages: this.supportedLanguages
    }, null, 2);
  }
}

// Singleton instance
const config = new Config();

module.exports = config;
