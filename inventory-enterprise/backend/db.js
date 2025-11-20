// PostgreSQL Database Connection Pool
// Neuro.Pilot.AI V21.1
// Shared database connection for server and middleware

const { Pool } = require('pg');

/**
 * Normalize DATABASE_URL to prevent schemeless URLs from being treated as Unix sockets
 * @param {string} raw - Raw DATABASE_URL from environment
 * @returns {string} Normalized URL with proper scheme
 */
function normalizeDatabaseUrl(raw) {
  if (!raw) {
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
const ssl = process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false;

const pool = new Pool({
  connectionString,
  ssl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('[DB] Unexpected database error:', err);
});

// Test connection on startup
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('[DB] Database connection failed:', err.message);
  } else {
    console.log('[DB] PostgreSQL connected successfully');
  }
});

module.exports = { pool };
