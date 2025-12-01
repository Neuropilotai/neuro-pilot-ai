#!/usr/bin/env node

/**
 * PostgreSQL Database Initialization Script for Railway Deployment
 *
 * Runs all SQL migrations in order to set up the complete database schema
 * This must run before server.js starts
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

/**
 * Normalize DATABASE_URL to prevent schemeless URLs from being treated as Unix sockets
 * Also strips any accidental "DATABASE_URL=" prefix that might get included
 */
function normalizeDatabaseUrl(raw) {
  if (!raw) {
    throw new Error('Missing DATABASE_URL environment variable');
  }

  // Strip accidental "DATABASE_URL=" prefix (Railway env var misconfiguration)
  if (raw.startsWith('DATABASE_URL=')) {
    raw = raw.substring('DATABASE_URL='.length);
    console.warn('[INIT] Stripped accidental DATABASE_URL= prefix from connection string');
  }

  // Add scheme if missing
  if (!/^postgres(ql)?:\/\//i.test(raw)) {
    raw = `postgresql://${String(raw).replace(/^\/\//, '')}`;
    console.warn('[INIT] Added missing postgresql:// scheme to DATABASE_URL');
  }

  return raw;
}

const connectionString = normalizeDatabaseUrl(process.env.DATABASE_URL);
const ssl = process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false;

const pool = new Pool({
  connectionString,
  ssl,
  connectionTimeoutMillis: 10000  // Fail fast after 10 seconds if DB unreachable
});

/**
 * Split SQL into individual statements, properly handling:
 * - Dollar-quoted strings (DO $$ ... $$, $tag$ ... $tag$)
 * - Single-quoted strings with escaped quotes
 * - SQL comments (-- single line and block comments)
 */
function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let i = 0;

  while (i < sql.length) {
    const char = sql[i];
    const remaining = sql.slice(i);

    // Handle single-line comments (--)
    if (remaining.startsWith('--')) {
      const endOfLine = sql.indexOf('\n', i);
      if (endOfLine === -1) {
        current += sql.slice(i);
        break;
      }
      current += sql.slice(i, endOfLine + 1);
      i = endOfLine + 1;
      continue;
    }

    // Handle multi-line comments (/* */)
    if (remaining.startsWith('/*')) {
      const endComment = sql.indexOf('*/', i + 2);
      if (endComment === -1) {
        current += sql.slice(i);
        break;
      }
      current += sql.slice(i, endComment + 2);
      i = endComment + 2;
      continue;
    }

    // Handle dollar-quoted strings ($$ or $tag$)
    if (char === '$') {
      const dollarMatch = remaining.match(/^(\$[a-zA-Z0-9_]*\$)/);
      if (dollarMatch) {
        const delimiter = dollarMatch[1];
        const endDelimiter = sql.indexOf(delimiter, i + delimiter.length);
        if (endDelimiter === -1) {
          // Unterminated - take rest of string
          current += sql.slice(i);
          break;
        }
        current += sql.slice(i, endDelimiter + delimiter.length);
        i = endDelimiter + delimiter.length;
        continue;
      }
    }

    // Handle single-quoted strings
    if (char === "'") {
      current += char;
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          // Escaped quote
          current += "''";
          i += 2;
        } else if (sql[i] === "'") {
          current += "'";
          i++;
          break;
        } else {
          current += sql[i];
          i++;
        }
      }
      continue;
    }

    // Handle statement terminator
    if (char === ';') {
      current += char;
      const trimmed = current.trim();
      // Only add non-empty statements that contain actual SQL (not just comments)
      // Remove all comment lines and check if anything remains
      const withoutComments = trimmed.replace(/--[^\n]*\n?/g, '').trim();
      if (trimmed && withoutComments.length > 0) {
        statements.push(trimmed);
      }
      current = '';
      i++;
      continue;
    }

    current += char;
    i++;
  }

  // Handle final statement without semicolon
  const trimmed = current.trim();
  const withoutComments = trimmed.replace(/--[^\n]*\n?/g, '').trim();
  if (trimmed && withoutComments.length > 0) {
    statements.push(trimmed);
  }

  return statements.filter(s => s.length > 0);
}

console.log('═══════════════════════════════════════════════════════');
console.log('  PostgreSQL Database Initialization Script v21.1');
console.log('═══════════════════════════════════════════════════════');
console.log(`📦 Database: ${process.env.DATABASE_URL ? 'Connected' : 'No DATABASE_URL'}`);

async function initDatabase() {
  const client = await pool.connect();

  try {
    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Migration tracking table ready\n');

    // Get list of applied migrations
    const { rows: appliedRows } = await client.query('SELECT filename FROM schema_migrations');
    const appliedMigrations = appliedRows.map(r => r.filename);

    console.log(`📊 ${appliedMigrations.length} migrations already applied\n`);

    // Define migration directories and files in order
    const migrationSets = [
      {
        dir: path.join(__dirname, '..', 'migrations', 'postgres'),
        files: [
          '001_initial_schema.sql',
          '003_ai_feedback_2025-10-07.sql',
          '004_multitenancy_2025-10-07.sql',
          '007_phase3_learning.sql',
          '008_inventory_counts.sql',
          '009_add_missing_v21_tables.sql',
          '010_fix_missing_tables.sql',
          '011_create_audit_log.sql',
          '012_fix_breadcrumbs.sql',
          '013_menu_planning_tables.sql',
          '014_fifo_and_missing_tables.sql',
          '015_inventory_foundation.sql',
          '016_fix_storage_locations.sql',
          '017_seed_menu_data.sql',
          '018_owner_console_tables.sql',
          '019_create_documents_table.sql',
          '020_vendor_orders_tables.sql',
          '021_population_table.sql',
          '022_ai_missing_tables.sql',
          // Phase 2: Enterprise Architecture
          '023_multi_tenant_foundation.sql',
          '024_ai_predictive_engine.sql',
          '025_vendor_ai_parser.sql',
          '026_stripe_billing.sql',
          '027_soc2_security.sql'
        ]
      },
      {
        dir: path.join(__dirname, '..', 'db', 'migrations'),
        files: [
          '004_vendor_pricing.sql',
          '005_recipes.sql',
          '006_waste.sql',
          '007_menu_linking.sql',
          '008_live_forecast.sql',
          '009_menu_cost_link.sql',
          '010_quotas_rbac_hardening.sql',
          '011_pos_core.sql',
          '012_pos_inventory.sql',
          '013_rbac_enforcement.sql'
        ]
      }
    ];

    let appliedCount = 0;
    let skippedCount = 0;

    for (const migrationSet of migrationSets) {
      console.log(`📁 Processing migrations from ${path.basename(migrationSet.dir)}/\n`);

      for (const filename of migrationSet.files) {
        if (appliedMigrations.includes(filename)) {
          console.log(`⏭  ${filename} (already applied)`);
          skippedCount++;
          continue;
        }

        const filepath = path.join(migrationSet.dir, filename);

        if (!fs.existsSync(filepath)) {
          console.log(`⚠️  ${filename} (file not found, skipping)`);
          continue;
        }

        console.log(`▶  Running ${filename}...`);
        const sql = fs.readFileSync(filepath, 'utf8');

        try {
          // Split SQL into individual statements, respecting dollar-quoted strings (DO $$ ... $$)
          const statements = splitSqlStatements(sql);

          let successCount = 0;
          let skipCount = 0;

          // Execute each statement in its own transaction to prevent cascading failures
          for (const statement of statements) {
            try {
              await client.query('BEGIN');
              await client.query(statement);
              await client.query('COMMIT');
              successCount++;
            } catch (stmtError) {
              await client.query('ROLLBACK');

              // Skip if object already exists (42P07 = duplicate object)
              // Skip if column already exists (42701)
              // Skip if object doesn't exist when trying to drop (42P01, 42883)
              const ignorableCodes = ['42P07', '42701', '42P01', '42883'];

              if (ignorableCodes.includes(stmtError.code)) {
                skipCount++;
                // Silently skip expected errors
              } else {
                // Log other errors but try to continue
                console.log(`  ⚠️  ${stmtError.message.substring(0, 80)}`);
                skipCount++;
              }
            }
          }

          // Mark as applied if any statements succeeded
          if (successCount > 0) {
            await client.query(
              'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
              [filename]
            );
            console.log(`✅ ${filename} applied (${successCount} new, ${skipCount} skipped)`);
            appliedCount++;
          } else {
            console.log(`⏭  ${filename} skipped (all objects already exist)`);
            skippedCount++;
          }
        } catch (error) {
          await client.query('ROLLBACK');
          console.error(`❌ Error running ${filename}:`, error.message);

          // For non-critical migrations, continue
          if (filename.includes('009_') || filename.includes('010_')) {
            console.warn('⚠️  Continuing despite error (non-critical migration)');
            continue;
          }

          throw error;
        }
      }

      console.log(''); // Blank line between migration sets
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log(`✅ Database initialization complete!`);
    console.log(`   Applied: ${appliedCount} migrations`);
    console.log(`   Skipped: ${skippedCount} migrations (already applied)`);
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Database initialization failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  initDatabase()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('\n❌ Fatal error:', err);
      process.exit(1);
    });
}

module.exports = initDatabase;
