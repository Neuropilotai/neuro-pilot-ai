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

// Database path - Railway support
const DB_PATH = process.env.DATABASE_PATH ||
  (process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'enterprise_inventory.db')
    : process.env.RAILWAY_ENVIRONMENT
      ? '/tmp/enterprise_inventory.db'  // Railway: use /tmp (ephemeral but functional)
      : path.join(__dirname, '..', 'data', 'enterprise_inventory.db'));
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

  // Check if this is a fresh database (no tables)
  const tableCount = await new Promise((resolve, reject) => {
    db.get("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", (err, row) => {
      if (err) reject(err);
      else resolve(row.count);
    });
  });

  console.log(`📊 Database has ${tableCount} existing tables`);

  // If fresh database, run the SQLite initial schema first
  if (tableCount < 10 && !appliedMigrations.includes('sqlite_001_initial_schema.sql')) {
    const sqliteSchemaPath = path.join(MIGRATIONS_DIR, 'sqlite', '001_initial_schema.sql');
    if (fs.existsSync(sqliteSchemaPath)) {
      console.log('\n🔧 Fresh database detected - running initial schema...\n');
      const sql = fs.readFileSync(sqliteSchemaPath, 'utf8');

      try {
        // Remove comments and split by semicolon
        const statements = sql
          .split('\n')
          .filter(line => !line.trim().startsWith('--'))
          .join('\n')
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0);

        console.log(`  Running ${statements.length} statements from initial schema...`);

        for (let i = 0; i < statements.length; i++) {
          const statement = statements[i];
          try {
            await runQuery(db, statement);
          } catch (stmtError) {
            // Log but continue for CREATE IF NOT EXISTS statements
            if (!statement.includes('IF NOT EXISTS')) {
              throw stmtError;
            }
            console.log(`  ⚠️  Skipped statement ${i+1}: ${stmtError.message}`);
          }
        }

        await runQuery(db, 'INSERT INTO schema_migrations (filename) VALUES (?)', ['sqlite_001_initial_schema.sql']);
        console.log('✅ Initial schema applied successfully\n');
      } catch (error) {
        console.error('❌ Failed to apply initial schema:', error.message);
        if (process.env.NODE_ENV === 'production') {
          db.close();
          throw error;
        }
      }
    }
  }

  // Get all SQL migration files in order
  const sqlFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .filter(f => !f.includes('postgres')) // Skip PostgreSQL migrations
    .filter(f => !f.match(/^00[123]_/)) // Skip 001-003 (PostgreSQL-specific)
    .filter(f => !f.includes('migration_006')) // Skip PostgreSQL migration
    .filter(f => !f.includes('production_001')) // Skip (duplicate of sqlite schema)
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
        .split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .join('\n')
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      let successCount = 0;
      let errorCount = 0;

      for (const statement of statements) {
        try {
          await runQuery(db, statement);
          successCount++;
        } catch (stmtError) {
          errorCount++;
          // Only log first few errors to avoid spam
          if (errorCount <= 3) {
            console.log(`  ⚠️  ${stmtError.message.substring(0, 80)}`);
          }
        }
      }

      // Mark as applied if at least some statements succeeded
      if (successCount > 0) {
        await runQuery(db,
          'INSERT INTO schema_migrations (filename) VALUES (?)',
          [filename]
        );
        console.log(`✅ ${filename} applied (${successCount} statements, ${errorCount} errors)`);
        appliedCount++;
      } else if (errorCount > 0) {
        console.log(`⚠️  ${filename} skipped (all statements failed)`);
      }
    } catch (error) {
      console.error(`❌ Error running ${filename}:`, error.message);
      console.warn('⚠️  Continuing despite error');
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
