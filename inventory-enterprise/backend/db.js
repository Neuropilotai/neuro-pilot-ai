// PostgreSQL Database Connection Pool
// Neuro.Pilot.AI V21.1
// Shared database connection for server and middleware

const { Pool } = require('pg');

// Initialize connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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
