/**
 * PostgreSQL Database Connection Pool
 * NeuroPilot V21.1 - Railway Optimized
 *
 * Features:
 * - Exponential backoff retry on startup
 * - On-demand reconnection for requests
 * - Graceful error handling (never crashes server)
 * - Railway proxy compatible
 */

const { Pool } = require('pg');

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  // Retry configuration for startup
  startup: {
    maxRetries: 10,           // More retries for Railway cold start
    initialDelayMs: 2000,     // Start with 2 second delay
    maxDelayMs: 30000,        // Max 30 second delay between retries
    backoffMultiplier: 1.5    // Exponential backoff
  },
  // Pool configuration optimized for Railway
  pool: {
    max: 10,                  // Max connections (Railway has limits)
    min: 1,                   // Keep at least 1 connection
    idleTimeoutMillis: 30000, // Close idle connections after 30s
    connectionTimeoutMillis: 10000, // 10s connection timeout
    allowExitOnIdle: false    // Keep pool alive
  }
};

// ============================================
// URL PARSING & VALIDATION
// ============================================

function parseAndValidateDatabaseUrl(raw) {
  if (!raw) {
    console.error('[DB] ERROR: DATABASE_URL environment variable is not set!');
    console.error('[DB] Available database-related env vars:',
      Object.keys(process.env)
        .filter(k => /database|postgres|pg/i.test(k))
        .join(', ') || 'none'
    );
    throw new Error('DATABASE_URL environment variable is required');
  }

  let url = raw.trim();

  // Ensure proper protocol prefix
  if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
    // Check if it looks like a URL without protocol
    if (url.includes('@') && url.includes(':')) {
      url = `postgresql://${url}`;
      console.warn('[DB] Added missing postgresql:// prefix to DATABASE_URL');
    } else {
      throw new Error(`Invalid DATABASE_URL format: must start with postgresql:// or postgres://`);
    }
  }

  // Validate URL structure
  try {
    const parsed = new URL(url);

    // Log sanitized connection info
    const sanitized = `${parsed.protocol}//${parsed.username}:***@${parsed.host}${parsed.pathname}`;
    console.log('[DB] Database URL configured:', sanitized);
    console.log('[DB] Host:', parsed.hostname);
    console.log('[DB] Port:', parsed.port);
    console.log('[DB] Database:', parsed.pathname.slice(1));

    return url;
  } catch (err) {
    throw new Error(`Invalid DATABASE_URL: ${err.message}`);
  }
}

// ============================================
// POOL INITIALIZATION
// ============================================

let pool = null;
let connectionState = {
  isConnected: false,
  lastError: null,
  lastConnectedAt: null,
  connectionAttempts: 0
};

function createPool() {
  const connectionString = parseAndValidateDatabaseUrl(process.env.DATABASE_URL);

  const newPool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }, // Required for Railway
    ...CONFIG.pool
  });

  // Pool event handlers
  newPool.on('connect', (client) => {
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
    // Don't set isConnected to false here - individual connections may fail
    // but the pool can still work
  });

  newPool.on('remove', () => {
    // Connection removed from pool - this is normal
  });

  return newPool;
}

// ============================================
// STARTUP CONNECTION WITH EXPONENTIAL BACKOFF
// ============================================

async function connectWithRetry() {
  const { maxRetries, initialDelayMs, maxDelayMs, backoffMultiplier } = CONFIG.startup;
  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    connectionState.connectionAttempts = attempt;

    try {
      console.log(`[DB] Connection attempt ${attempt}/${maxRetries}...`);

      const client = await pool.connect();
      const result = await client.query('SELECT NOW() as time, current_database() as database');
      client.release();

      console.log(`[DB] ✓ Connected to database "${result.rows[0].database}" at ${result.rows[0].time}`);
      connectionState.isConnected = true;
      connectionState.lastConnectedAt = new Date().toISOString();
      return true;

    } catch (err) {
      connectionState.lastError = err.message;
      console.error(`[DB] Connection attempt ${attempt}/${maxRetries} failed: ${err.message}`);

      if (attempt < maxRetries) {
        console.log(`[DB] Waiting ${Math.round(delay / 1000)}s before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * backoffMultiplier, maxDelayMs);
      }
    }
  }

  console.error('[DB] ✗ All connection attempts exhausted. App will continue without DB.');
  console.error('[DB] Requests requiring database access will attempt on-demand reconnection.');
  return false;
}

// ============================================
// QUERY WRAPPER WITH AUTO-RECONNECT
// ============================================

/**
 * Execute a query with automatic reconnection on failure
 * This is the recommended way to query the database
 */
async function query(text, params) {
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  try {
    const result = await pool.query(text, params);

    // If we get here, connection is working
    if (!connectionState.isConnected) {
      console.log('[DB] ✓ Database connection restored');
      connectionState.isConnected = true;
      connectionState.lastConnectedAt = new Date().toISOString();
    }

    return result;
  } catch (err) {
    connectionState.lastError = err.message;

    // Check if this is a connection error that might be recoverable
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
      connectionState.isConnected = false;
      console.error('[DB] Query failed with connection error:', err.message);
    }

    throw err;
  }
}

/**
 * Get a client for transactions
 */
async function getClient() {
  if (!pool) {
    throw new Error('Database pool not initialized');
  }
  return pool.connect();
}

// ============================================
// HEALTH CHECK
// ============================================

/**
 * Quick health check with timeout
 * Returns status object, never throws
 */
async function healthCheck(timeoutMs = 5000) {
  const startTime = Date.now();

  try {
    const result = await Promise.race([
      pool.query('SELECT 1 as ok'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Health check timeout')), timeoutMs)
      )
    ]);

    return {
      status: 'connected',
      latencyMs: Date.now() - startTime,
      lastConnectedAt: connectionState.lastConnectedAt
    };
  } catch (err) {
    return {
      status: 'disconnected',
      error: err.message,
      latencyMs: Date.now() - startTime,
      lastError: connectionState.lastError
    };
  }
}

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

function initialize() {
  console.log('[DB] Initializing database connection...');
  pool = createPool();

  // Start connection attempts in background (non-blocking)
  connectWithRetry().catch(err => {
    console.error('[DB] Background connection failed:', err.message);
  });
}

// Initialize on module load
initialize();

// Handle process signals for graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Core functionality
  pool,           // Direct pool access (for advanced usage)
  query,          // Recommended: query with auto-reconnect
  getClient,      // For transactions

  // Health & status
  healthCheck,
  getState: () => ({ ...connectionState }),
  isConnected: () => connectionState.isConnected,

  // Lifecycle
  shutdown,
  reconnect: connectWithRetry
};
