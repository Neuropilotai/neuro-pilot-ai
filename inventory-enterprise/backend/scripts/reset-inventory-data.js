#!/usr/bin/env node
/**
 * Reset Inventory Data Script - V23.x Item Bank Edition
 *
 * Safely clears all inventory transactional data while preserving:
 * - Menu cycle data (menu_cycle_days, menu_cycle_items, menu_stations)
 * - Vendor master data (vendors table)
 * - User/auth data
 * - Billing data
 * - Schema migrations
 *
 * Usage:
 *   node scripts/reset-inventory-data.js --dry-run    # Preview what will be deleted
 *   node scripts/reset-inventory-data.js --execute    # Actually perform the reset
 *
 * Environment:
 *   DATABASE_URL - PostgreSQL connection string
 */

const { Pool } = require('pg');

// Tables to TRUNCATE (in FK-safe order)
const TABLES_TO_RESET = [
  // Level 1: Tables with FK dependencies on other reset tables
  'vendor_order_cases',
  'inventory_count_items',
  'count_vendor_orders',

  // Level 2: Mid-level tables
  'fifo_cost_layers',
  'vendor_order_lines',

  // Level 3: Top-level tables
  'vendor_orders',
  'inventory_counts',

  // Level 4: Item/catalog tables
  'inventory_items',
  'item_master',
  'vendor_items',
  'vendor_prices',
  'vendor_price_history',

  // Level 5: Related tables that may exist
  'shrinkage_reports',
  'inventory_adjustments',
  'inventory_transactions'
];

// Tables to KEEP (do NOT touch)
const TABLES_TO_PRESERVE = [
  'menu_cycle_days',
  'menu_cycle_items',
  'menu_stations',
  'menu_import_log',
  'vendors',
  'users',
  'user_sessions',
  'refresh_tokens',
  'billing_accounts',
  'billing_invoices',
  'billing_usage',
  'schema_migrations',
  'ai_ops_breadcrumbs',
  'recipes',
  'recipe_ingredients',
  'org_settings',
  'inventory_locations'
];

async function initDatabase() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL environment variable not set');
  }

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes('railway') ? { rejectUnauthorized: false } : false
  });

  // Test connection
  await pool.query('SELECT 1');
  console.log('[Reset] Database connection established');

  return pool;
}

async function getTableCounts(pool, tables) {
  const counts = {};
  for (const table of tables) {
    try {
      const result = await pool.query(`SELECT COUNT(*) as cnt FROM ${table}`);
      counts[table] = parseInt(result.rows[0].cnt);
    } catch (e) {
      counts[table] = -1; // Table doesn't exist
    }
  }
  return counts;
}

async function logResetOperation(pool, orgId, reason, tables, dryRun) {
  try {
    await pool.query(`
      INSERT INTO ai_ops_breadcrumbs (org_id, event_type, event_data)
      VALUES ($1, $2, $3)
    `, [
      orgId,
      dryRun ? 'INVENTORY_RESET_PREVIEW' : 'INVENTORY_RESET_EXECUTED',
      JSON.stringify({
        timestamp: new Date().toISOString(),
        reason: reason,
        tables_cleared: tables,
        version: 'V23.x Item Bank Edition'
      })
    ]);
  } catch (e) {
    console.log('[Reset] Warning: Could not log to ai_ops_breadcrumbs:', e.message);
  }
}

async function performReset(pool, dryRun = true) {
  const orgId = 'default-org';
  const reason = 'Item Bank Reset Edition V23.x - Clean slate for new item bank';

  console.log('\n========================================');
  console.log('INVENTORY DATA RESET - V23.x');
  console.log('========================================');
  console.log(`Mode: ${dryRun ? 'DRY RUN (preview only)' : 'EXECUTE (actual reset)'}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('');

  // Get current counts
  console.log('[Reset] Checking current table row counts...\n');
  const beforeCounts = await getTableCounts(pool, TABLES_TO_RESET);

  console.log('Tables to RESET:');
  console.log('─'.repeat(50));
  let totalRows = 0;
  for (const table of TABLES_TO_RESET) {
    const count = beforeCounts[table];
    if (count === -1) {
      console.log(`  ${table.padEnd(30)} (table not found)`);
    } else {
      console.log(`  ${table.padEnd(30)} ${count} rows`);
      totalRows += count;
    }
  }
  console.log('─'.repeat(50));
  console.log(`  TOTAL ROWS TO DELETE:        ${totalRows}`);
  console.log('');

  // Show preserved tables
  console.log('Tables to PRESERVE (not touched):');
  console.log('─'.repeat(50));
  const preservedCounts = await getTableCounts(pool, TABLES_TO_PRESERVE.slice(0, 8)); // Just check a few
  for (const [table, count] of Object.entries(preservedCounts)) {
    if (count >= 0) {
      console.log(`  ${table.padEnd(30)} ${count} rows (KEEPING)`);
    }
  }
  console.log('  ... and other system tables');
  console.log('');

  if (dryRun) {
    console.log('========================================');
    console.log('DRY RUN COMPLETE - No changes made');
    console.log('========================================');
    console.log('\nTo actually perform the reset, run:');
    console.log('  node scripts/reset-inventory-data.js --execute\n');

    await logResetOperation(pool, orgId, reason, TABLES_TO_RESET, true);
    return { success: true, dryRun: true, totalRows };
  }

  // EXECUTE MODE - Actually perform the reset
  console.log('[Reset] Starting transactional reset...\n');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let tablesCleared = 0;
    let rowsDeleted = 0;

    for (const table of TABLES_TO_RESET) {
      if (beforeCounts[table] === -1) {
        console.log(`  SKIP ${table} (not found)`);
        continue;
      }

      try {
        // Use TRUNCATE CASCADE for efficiency
        await client.query(`TRUNCATE TABLE ${table} CASCADE`);
        console.log(`  ✓ TRUNCATED ${table} (${beforeCounts[table]} rows)`);
        tablesCleared++;
        rowsDeleted += beforeCounts[table];
      } catch (e) {
        console.log(`  ✗ FAILED ${table}: ${e.message}`);
        // Try DELETE as fallback
        try {
          const delResult = await client.query(`DELETE FROM ${table}`);
          console.log(`    → DELETE fallback: ${delResult.rowCount} rows`);
          tablesCleared++;
          rowsDeleted += delResult.rowCount;
        } catch (e2) {
          console.log(`    → DELETE also failed: ${e2.message}`);
        }
      }
    }

    await client.query('COMMIT');

    console.log('\n========================================');
    console.log('RESET COMPLETE');
    console.log('========================================');
    console.log(`  Tables cleared: ${tablesCleared}`);
    console.log(`  Rows deleted:   ${rowsDeleted}`);
    console.log('');

    await logResetOperation(pool, orgId, reason, TABLES_TO_RESET, false);

    return { success: true, dryRun: false, tablesCleared, rowsDeleted };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n[Reset] TRANSACTION ROLLED BACK');
    console.error('[Reset] Error:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || (!args.includes('--dry-run') && !args.includes('--execute'))) {
    console.log('Usage:');
    console.log('  node scripts/reset-inventory-data.js --dry-run    Preview what will be deleted');
    console.log('  node scripts/reset-inventory-data.js --execute    Actually perform the reset');
    console.log('');
    console.log('Environment:');
    console.log('  DATABASE_URL - PostgreSQL connection string (required)');
    process.exit(1);
  }

  const dryRun = args.includes('--dry-run');
  const execute = args.includes('--execute');

  if (execute) {
    console.log('\n⚠️  WARNING: This will DELETE all inventory data!');
    console.log('Press Ctrl+C within 5 seconds to abort...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  let pool;
  try {
    pool = await initDatabase();
    const result = await performReset(pool, dryRun);

    if (result.success) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error) {
    console.error('[Reset] Fatal error:', error.message);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

main();
