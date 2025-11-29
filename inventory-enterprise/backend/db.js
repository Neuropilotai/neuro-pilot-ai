// PostgreSQL Database Connection Pool
// Neuro.Pilot.AI V21.1
// Shared database connection for server and middleware
// Railway-optimized with retry logic

const { Pool } = require('pg');

/**
 * Normalize DATABASE_URL to prevent schemeless URLs from being treated as Unix sockets
 * @param {string} raw - Raw DATABASE_URL from environment
 * @returns {string} Normalized URL with proper scheme
 */
function normalizeDatabaseUrl(raw) {
  if (!raw) {
    console.error('[DB] DATABASE_URL is not set!');
    console.error('[DB] Available env vars:', Object.keys(process.env).filter(k => k.includes('DATABASE') || k.includes('PG')).join(', '));
    throw new Error('Missing DATABASE_URL environment variable');
  }

  // If scheme is missing, add postgresql:// and strip accidental leading '//'
  if (!/^postgres(ql)?:\/\//i.test(raw)) {
    raw = `postgresql://${String(raw).replace(/^\/\//, '')}`;
    console.warn('[DB] Added missing postgresql:// scheme to DATABASE_URL');
  }

  return raw;
}

// Initialize connection pool with normalized URL
const connectionString = normalizeDatabaseUrl(process.env.DATABASE_URL);

// Log connection info for debugging (mask password properly)
const maskedUrl = connectionString.replace(/(:\/\/[^:]+:)([^@]+)(@)/, '$1***$3');
console.log('[DB] Connecting to:', maskedUrl);

// Railway-optimized pool configuration
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 10,                        // Reduced for Railway
  min: 2,                         // Keep minimum connections
  idleTimeoutMillis: 30000,       // 30 seconds idle timeout
  connectionTimeoutMillis: 10000, // 10 seconds connection timeout (Railway proxy is fast)
  allowExitOnIdle: false          // Keep pool alive
});

// Track connection state
let isConnected = false;
let connectionAttempts = 0;
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

// Handle pool errors gracefully
pool.on('error', (err) => {
  console.error('[DB] Pool error:', err.message);
  isConnected = false;
});

pool.on('connect', () => {
  if (!isConnected) {
    console.log('[DB] PostgreSQL connected successfully');
    isConnected = true;
    connectionAttempts = 0;
  }
});

/**
 * Test database connection with retries
 */
async function testConnection() {
  while (connectionAttempts < MAX_RETRIES) {
    connectionAttempts++;
    try {
      const result = await pool.query('SELECT NOW() as time, current_database() as db');
      console.log(`[DB] Connected to database: ${result.rows[0].db} at ${result.rows[0].time}`);
      isConnected = true;
      return true;
    } catch (err) {
      console.error(`[DB] Connection attempt ${connectionAttempts}/${MAX_RETRIES} failed:`, err.message);
      if (connectionAttempts < MAX_RETRIES) {
        console.log(`[DB] Retrying in ${RETRY_DELAY_MS / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }
  console.error('[DB] All connection attempts failed. Server will start anyway.');
  return false;
}

// Start connection test in background (don't block server startup)
testConnection().catch(err => {
  console.error('[DB] Background connection test failed:', err.message);
});

module.exports = {
  pool,
  isConnected: () => isConnected,
  testConnection
};
