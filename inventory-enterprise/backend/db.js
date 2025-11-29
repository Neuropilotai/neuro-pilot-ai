/**
 * PostgreSQL Database Connection Pool
 * NeuroPilot V21.1 - Railway Production
 *
 * BULLETPROOF VERSION - handles all Railway edge cases
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
    max: 10,
    min: 1,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: false
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

  return url;
}

// ============================================
// POOL INITIALIZATION
// ============================================

let pool = null;
let connectionState = {
  isConnected: false,
  lastError: null,
  lastConnectedAt: null,
  connectionAttempts: 0,
  parsedHost: null,
  parsedPort: null
};

function createPool() {
  const connectionString = sanitizeDatabaseUrl(process.env.DATABASE_URL);

  // Store parsed info for health checks
  try {
    const parsed = new URL(connectionString);
    connectionState.parsedHost = parsed.hostname;
    connectionState.parsedPort = parsed.port || '5432';
  } catch (e) {
    // Already validated above
  }

  const newPool = new Pool({
    connectionString,
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
      const result = await client.query('SELECT NOW() as time, current_database() as database');
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
// HEALTH CHECK (never throws)
// ============================================

async function healthCheck(timeoutMs = 5000) {
  const startTime = Date.now();

  const result = {
    status: 'unknown',
    host: connectionState.parsedHost,
    port: connectionState.parsedPort,
    latencyMs: null,
    error: null,
    lastConnectedAt: connectionState.lastConnectedAt,
    connectionAttempts: connectionState.connectionAttempts
  };

  if (!pool) {
    result.status = 'no_pool';
    result.error = 'Database pool not initialized';
    return result;
  }

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
  }

  return result;
}

// ============================================
// QUERY WRAPPER
// ============================================

async function query(text, params) {
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  try {
    const result = await pool.query(text, params);
    if (!connectionState.isConnected) {
      console.log('[DB] ✓ Database connection restored');
      connectionState.isConnected = true;
      connectionState.lastConnectedAt = new Date().toISOString();
    }
    return result;
  } catch (err) {
    connectionState.lastError = err.message;
    throw err;
  }
}

async function getClient() {
  if (!pool) {
    throw new Error('Database pool not initialized');
  }
  return pool.connect();
}

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

async function shutdown() {
  if (pool) {
    console.log('[DB] Closing database pool...');
    await pool.end();
    console.log('[DB] Database pool closed');
  }
}

// ============================================
// INITIALIZATION
// ============================================

console.log('[DB] Initializing database connection...');
pool = createPool();

// Background connection (non-blocking)
connectWithRetry().catch(err => {
  console.error('[DB] Background connection failed:', err.message);
});

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ============================================
// EXPORTS
// ============================================

module.exports = {
  pool,
  query,
  getClient,
  healthCheck,
  getState: () => ({ ...connectionState }),
  isConnected: () => connectionState.isConnected,
  shutdown,
  reconnect: connectWithRetry
};
