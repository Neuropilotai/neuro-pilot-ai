/**
 * PostgreSQL Database Connection Pool
 * NeuroPilot V21.1 - Railway Production
 *
 * UNIFIED DB LAYER - PostgreSQL only, no SQLite dependencies
 *
 * Provides:
 * - pool: Raw pg.Pool for direct access
 * - query(text, params): Parameterized query helper
 * - transaction(fn): Transaction wrapper with auto-commit/rollback
 * - healthCheck(timeoutMs): Non-throwing health check
 * - SQLite-compatible API (get, all, run) for legacy services
 *
 * Environment variables:
 * - DATABASE_URL: PostgreSQL connection string (required)
 * - DB_LOG_QUERIES: Set to 'true' to log all queries (optional)
 * - DB_POOL_MAX: Max pool connections (default: 10)
 * - DB_POOL_MIN: Min pool connections (default: 1)
 */

const { Pool } = require('pg');

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  startup: {
    maxRetries: 10,
    initialDelayMs: 2000,
    maxDelayMs: 30000,
    backoffMultiplier: 1.5
  },
  pool: {
    max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
    min: parseInt(process.env.DB_POOL_MIN, 10) || 1,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: false
  },
  logging: {
    queries: process.env.DB_LOG_QUERIES === 'true'
  }
};

// ============================================
// DATABASE URL SANITIZATION (BULLETPROOF)
// ============================================

function sanitizeDatabaseUrl(raw) {
  if (!raw) {
    console.error('[DB] FATAL: DATABASE_URL is not set!');
    console.error('[DB] Set it in Railway: postgresql://user:pass@host:port/database');
    throw new Error('DATABASE_URL environment variable is required');
  }

  let url = raw.trim();

  // DEBUG: Show raw value (first 50 chars, masked)
  const preview = url.length > 50 ? url.substring(0, 50) + '...' : url;
  console.log('[DB] Raw DATABASE_URL preview:', preview.replace(/:[^@]+@/, ':***@'));

  // FIX 1: Remove "DATABASE_URL=" prefix if someone pasted the whole line
  if (url.startsWith('DATABASE_URL=')) {
    console.warn('[DB] WARNING: DATABASE_URL contained "DATABASE_URL=" prefix - removing it');
    url = url.replace(/^DATABASE_URL=/, '');
  }

  // FIX 2: Remove any leading/trailing quotes
  url = url.replace(/^["']|["']$/g, '');

  // FIX 3: Fix "postgresql//" (missing colon) -> "postgresql://"
  if (url.startsWith('postgresql//')) {
    console.warn('[DB] WARNING: DATABASE_URL had "postgresql//" - fixing to "postgresql://"');
    url = url.replace(/^postgresql\/\//, 'postgresql://');
  }
  if (url.startsWith('postgres//')) {
    console.warn('[DB] WARNING: DATABASE_URL had "postgres//" - fixing to "postgres://"');
    url = url.replace(/^postgres\/\//, 'postgres://');
  }

  // FIX 4: Ensure proper protocol prefix
  if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
    // Only add prefix if it looks like a valid connection string
    if (url.includes('@') && url.includes('/')) {
      console.warn('[DB] WARNING: Added missing postgresql:// prefix');
      url = 'postgresql://' + url;
    } else {
      console.error('[DB] FATAL: DATABASE_URL is malformed:', url.substring(0, 30));
      throw new Error('DATABASE_URL must be a valid PostgreSQL connection string');
    }
  }

  // VALIDATE: Parse and verify the URL
  let parsed;
  try {
    parsed = new URL(url);
  } catch (err) {
    console.error('[DB] FATAL: Cannot parse DATABASE_URL:', err.message);
    console.error('[DB] Value (masked):', url.replace(/:[^@]+@/, ':***@'));
    throw new Error('DATABASE_URL is not a valid URL: ' + err.message);
  }

  // VALIDATE: Check required components
  if (!parsed.hostname) {
    throw new Error('DATABASE_URL is missing hostname');
  }
  if (!parsed.pathname || parsed.pathname === '/') {
    console.warn('[DB] WARNING: DATABASE_URL has no database name, defaulting to "railway"');
  }

  // LOG: Show parsed components (safe)
  console.log('[DB] ✓ DATABASE_URL parsed successfully');
  console.log('[DB]   Protocol:', parsed.protocol);
  console.log('[DB]   Host:', parsed.hostname);
  console.log('[DB]   Port:', parsed.port || '5432 (default)');
  console.log('[DB]   Database:', parsed.pathname.slice(1) || 'railway');
  console.log('[DB]   User:', parsed.username);
  console.log('[DB]   SSL: enabled (rejectUnauthorized: false)');

  return { url, parsed };
}

// ============================================
// CONNECTION STATE
// ============================================

let pool = null;
let connectionState = {
  isConnected: false,
  lastError: null,
  lastConnectedAt: null,
  connectionAttempts: 0,
  parsedHost: null,
  parsedPort: null,
  parsedDatabase: null
};

// ============================================
// POOL INITIALIZATION
// ============================================

function createPool() {
  const { url, parsed } = sanitizeDatabaseUrl(process.env.DATABASE_URL);

  // Store parsed info for health checks and diagnostics
  connectionState.parsedHost = parsed.hostname;
  connectionState.parsedPort = parsed.port || '5432';
  connectionState.parsedDatabase = parsed.pathname.slice(1) || 'railway';

  const newPool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    ...CONFIG.pool
  });

  newPool.on('connect', () => {
    if (!connectionState.isConnected) {
      console.log('[DB] ✓ PostgreSQL connection established');
      connectionState.isConnected = true;
      connectionState.lastConnectedAt = new Date().toISOString();
      connectionState.lastError = null;
    }
  });

  newPool.on('error', (err) => {
    console.error('[DB] Pool error:', err.message);
    connectionState.lastError = err.message;
    connectionState.isConnected = false;
  });

  return newPool;
}

// ============================================
// CONNECTION WITH EXPONENTIAL BACKOFF
// ============================================

async function connectWithRetry() {
  const { maxRetries, initialDelayMs, maxDelayMs, backoffMultiplier } = CONFIG.startup;
  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    connectionState.connectionAttempts = attempt;

    try {
      console.log(`[DB] Connection attempt ${attempt}/${maxRetries}...`);

      const client = await pool.connect();
      const result = await client.query('SELECT NOW() as time, current_database() as database, version() as version');
      client.release();

      console.log(`[DB] ✓ Connected to database "${result.rows[0].database}"`);
      connectionState.isConnected = true;
      connectionState.lastConnectedAt = new Date().toISOString();
      return true;

    } catch (err) {
      connectionState.lastError = err.message;
      console.error(`[DB] Attempt ${attempt}/${maxRetries} failed: ${err.message}`);

      if (attempt < maxRetries) {
        console.log(`[DB] Retrying in ${Math.round(delay / 1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * backoffMultiplier, maxDelayMs);
      }
    }
  }

  console.error('[DB] ✗ All connection attempts failed');
  return false;
}

// ============================================
// QUERY HELPER (Primary API)
// ============================================

/**
 * Execute a parameterized query
 * @param {string} text - SQL query with $1, $2, etc. placeholders
 * @param {Array} params - Query parameters
 * @returns {Promise<pg.QueryResult>}
 */
async function query(text, params = []) {
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  const start = Date.now();

  try {
    const result = await pool.query(text, params);

    // Optional query logging
    if (CONFIG.logging.queries) {
      const duration = Date.now() - start;
      console.log(`[DB] Query (${duration}ms): ${text.substring(0, 80)}...`);
    }

    // Track connection state
    if (!connectionState.isConnected) {
      console.log('[DB] ✓ Database connection restored');
      connectionState.isConnected = true;
      connectionState.lastConnectedAt = new Date().toISOString();
    }

    return result;
  } catch (err) {
    connectionState.lastError = err.message;
    console.error('[DB] Query error:', err.message);
    console.error('[DB] Query:', text.substring(0, 100));
    throw err;
  }
}

// ============================================
// TRANSACTION HELPER
// ============================================

/**
 * Execute a function within a transaction
 * Automatically commits on success, rolls back on error
 *
 * @param {Function} fn - Async function receiving a client
 * @returns {Promise<any>} Result of fn
 *
 * @example
 * const result = await db.transaction(async (client) => {
 *   await client.query('INSERT INTO users...');
 *   await client.query('INSERT INTO audit_log...');
 *   return { success: true };
 * });
 */
async function transaction(fn) {
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await fn(client);

    await client.query('COMMIT');

    if (!connectionState.isConnected) {
      connectionState.isConnected = true;
      connectionState.lastConnectedAt = new Date().toISOString();
    }

    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    connectionState.lastError = err.message;
    console.error('[DB] Transaction rolled back:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// ============================================
// GET CLIENT (for manual transactions)
// ============================================

/**
 * Get a client from the pool for manual transaction control
 * IMPORTANT: Always release the client when done
 * @returns {Promise<pg.PoolClient>}
 */
async function getClient() {
  if (!pool) {
    throw new Error('Database pool not initialized');
  }
  return pool.connect();
}

// ============================================
// HEALTH CHECK (never throws)
// ============================================

/**
 * Non-throwing health check
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<Object>} Health status object
 */
async function healthCheck(timeoutMs = 5000) {
  const startTime = Date.now();

  const result = {
    status: 'unknown',
    host: connectionState.parsedHost,
    port: connectionState.parsedPort,
    database: connectionState.parsedDatabase,
    latencyMs: null,
    error: null,
    lastConnectedAt: connectionState.lastConnectedAt,
    connectionAttempts: connectionState.connectionAttempts,
    poolStats: null
  };

  if (!pool) {
    result.status = 'no_pool';
    result.error = 'Database pool not initialized';
    return result;
  }

  // Add pool stats
  result.poolStats = {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount
  };

  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Health check timeout')), timeoutMs)
      )
    ]);

    result.status = 'connected';
    result.latencyMs = Date.now() - startTime;
    connectionState.isConnected = true;

  } catch (err) {
    result.status = 'disconnected';
    result.error = err.message;
    result.latencyMs = Date.now() - startTime;
    connectionState.isConnected = false;
  }

  return result;
}

// ============================================
// SQLITE-COMPATIBLE API (Legacy Support)
// ============================================

/**
 * Convert SQLite ? placeholders to PostgreSQL $1, $2, etc.
 * @param {string} sql - SQL query with ? placeholders
 * @returns {string} SQL with $1, $2, etc. placeholders
 */
function convertPlaceholders(sql) {
  // If already has PostgreSQL placeholders, return as-is
  if (/\$\d+/.test(sql)) {
    return sql;
  }

  // Convert ? to $1, $2, etc.
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

/**
 * SQLite-compatible adapter for legacy services
 * Provides get(), all(), run() methods that work with PostgreSQL
 *
 * Features:
 * - Automatically converts SQLite ? placeholders to PostgreSQL $1, $2, etc.
 * - Returns single row for get(), array for all()
 * - Returns { lastID, changes } for run()
 */
const sqliteCompat = {
  /**
   * Get a single row (like SQLite db.get())
   * @param {string} sql - SQL query (supports both ? and $1 placeholders)
   * @param {Array} params - Query parameters
   * @returns {Promise<Object|undefined>} Single row or undefined
   */
  async get(sql, params = []) {
    try {
      const pgSql = convertPlaceholders(sql);
      const result = await query(pgSql, params);
      return result.rows[0];
    } catch (err) {
      console.error('[DB] get() error:', err.message);
      throw err;
    }
  },

  /**
   * Get all rows (like SQLite db.all())
   * @param {string} sql - SQL query (supports both ? and $1 placeholders)
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>} Array of rows
   */
  async all(sql, params = []) {
    try {
      const pgSql = convertPlaceholders(sql);
      const result = await query(pgSql, params);
      return result.rows;
    } catch (err) {
      console.error('[DB] all() error:', err.message);
      throw err;
    }
  },

  /**
   * Run a mutation (like SQLite db.run())
   * @param {string} sql - SQL query (supports both ? and $1 placeholders)
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} { lastID, changes }
   */
  async run(sql, params = []) {
    try {
      const pgSql = convertPlaceholders(sql);
      const result = await query(pgSql, params);
      return {
        lastID: result.rows[0]?.id || null,
        changes: result.rowCount
      };
    } catch (err) {
      console.error('[DB] run() error:', err.message);
      throw err;
    }
  },

  /**
   * Execute raw query (same as query(), no placeholder conversion)
   */
  query: query,

  /**
   * Check if database is available
   */
  isAvailable() {
    return connectionState.isConnected;
  }
};

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

async function shutdown() {
  if (pool) {
    console.log('[DB] Closing database pool...');
    try {
      await pool.end();
      console.log('[DB] Database pool closed');
    } catch (err) {
      console.error('[DB] Error closing pool:', err.message);
    }
  }
}

// ============================================
// INITIALIZATION
// ============================================

console.log('[DB] Initializing PostgreSQL connection...');
pool = createPool();

// Background connection (non-blocking)
connectWithRetry().catch(err => {
  console.error('[DB] Background connection failed:', err.message);
});

// Graceful shutdown handlers
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Primary PostgreSQL API
  pool,
  query,
  transaction,
  getClient,
  healthCheck,

  // Connection state
  getState: () => ({ ...connectionState }),
  isConnected: () => connectionState.isConnected,

  // Lifecycle
  shutdown,
  reconnect: connectWithRetry,

  // SQLite-compatible adapter for legacy services
  // Usage: const db = require('./db').sqliteCompat;
  sqliteCompat,

  // Aliases for direct SQLite-style usage
  // Usage: const { get, all, run } = require('./db');
  get: sqliteCompat.get,
  all: sqliteCompat.all,
  run: sqliteCompat.run
};

// Also export pool as global.db for legacy routes that use global.db.query()
global.db = {
  query,
  pool,
  transaction,
  getClient,
  ...sqliteCompat
};
