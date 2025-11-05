#!/usr/bin/env node

/**
 * Database Initialization Script for Railway Deployment
 *
 * Runs all SQL migrations in order to set up the complete database schema
 * This must run before server.js starts
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Database path - Railway will persist this via volume
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'enterprise_inventory.db');
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

console.log('═══════════════════════════════════════════════════════');
console.log('  Database Initialization Script v19.0');
console.log('═══════════════════════════════════════════════════════');
console.log(`📦 Database path: ${DB_PATH}`);
console.log(`📁 Migrations dir: ${MIGRATIONS_DIR}`);

async function initDatabase() {
  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    console.log(`📂 Creating data directory: ${dataDir}`);
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Open database connection
  const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('❌ Failed to open database:', err);
      process.exit(1);
    }
  });

  // Enable WAL mode for better concurrency
  await runQuery(db, 'PRAGMA journal_mode=WAL');
  await runQuery(db, 'PRAGMA foreign_keys=ON');

  // Create migrations tracking table
  await runQuery(db, `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get list of applied migrations
  const appliedMigrations = await new Promise((resolve, reject) => {
    db.all('SELECT filename FROM schema_migrations', (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(r => r.filename));
    });
  });

  console.log(`\n📊 ${appliedMigrations.length} migrations already applied`);

  // Get all SQL migration files in order
  const sqlFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .filter(f => !f.includes('postgres')) // Skip PostgreSQL migrations
    .filter(f => !f.match(/^00[123]_/)) // Skip 001-003 (PostgreSQL-specific)
    .filter(f => !f.includes('migration_006')) // Skip PostgreSQL migration
    .sort();

  console.log(`🔍 Found ${sqlFiles.length} SQL migration files\n`);

  let appliedCount = 0;
  let skippedCount = 0;

  for (const filename of sqlFiles) {
    if (appliedMigrations.includes(filename)) {
      console.log(`⏭  ${filename} (already applied)`);
      skippedCount++;
      continue;
    }

    console.log(`▶  Running ${filename}...`);
    const filepath = path.join(MIGRATIONS_DIR, filename);
    const sql = fs.readFileSync(filepath, 'utf8');

    try {
      // Split by semicolon and run each statement
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        await runQuery(db, statement);
      }

      // Mark as applied
      await runQuery(db,
        'INSERT INTO schema_migrations (filename) VALUES (?)',
        [filename]
      );

      console.log(`✅ ${filename} applied successfully`);
      appliedCount++;
    } catch (error) {
      console.error(`❌ Error running ${filename}:`, error.message);

      // Continue on error for development, but log it
      if (process.env.NODE_ENV === 'production') {
        // In production, stop on first error
        db.close();
        throw error;
      } else {
        console.warn('⚠️  Continuing despite error (development mode)');
      }
    }
  }

  // Close database
  db.close((err) => {
    if (err) {
      console.error('❌ Error closing database:', err);
      process.exit(1);
    }
  });

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`✅ Database initialization complete!`);
  console.log(`   Applied: ${appliedCount} migrations`);
  console.log(`   Skipped: ${skippedCount} migrations (already applied)`);
  console.log('═══════════════════════════════════════════════════════\n');
}

/**
 * Helper to run a query with promise
 */
function runQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

// Run if called directly
if (require.main === module) {
  initDatabase().catch(err => {
    console.error('\n❌ Database initialization failed:', err);
    process.exit(1);
  });
}

module.exports = initDatabase;
