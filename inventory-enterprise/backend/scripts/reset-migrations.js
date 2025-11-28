#!/usr/bin/env node
/**
 * Migration Reset Script
 *
 * This script clears the migration tracking table and re-runs all migrations.
 * Use when migrations are marked as "applied" but tables don't actually exist.
 *
 * Usage: node scripts/reset-migrations.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('ERROR: DATABASE_URL environment variable not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('railway') ? { rejectUnauthorized: false } : false
});

async function resetMigrations() {
  const client = await pool.connect();

  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  Migration Reset Script');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    // Step 1: Clear migration tracking table
    console.log('📋 Step 1: Clearing migration tracking table...');
    await client.query('DELETE FROM schema_migrations');
    console.log('   ✅ Migration tracking cleared');
    console.log('');

    // Step 2: Get all migration files
    const migrationDirs = [
      path.join(__dirname, '../migrations/postgres'),
      path.join(__dirname, '../migrations')
    ];

    const allMigrations = [];

    for (const dir of migrationDirs) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir)
          .filter(f => f.endsWith('.sql'))
          .sort();

        for (const file of files) {
          allMigrations.push({
            name: file,
            path: path.join(dir, file),
            dir: path.basename(dir)
          });
        }
      }
    }

    console.log(`📁 Step 2: Found ${allMigrations.length} migration files`);
    console.log('');

    // Step 3: Run each migration
    console.log('🚀 Step 3: Running migrations...');
    console.log('');

    let applied = 0;
    let failed = 0;

    for (const migration of allMigrations) {
      const sql = fs.readFileSync(migration.path, 'utf8');

      try {
        // Split by semicolons but handle $$ blocks
        await client.query(sql);

        // Record migration as applied
        await client.query(
          'INSERT INTO schema_migrations (migration_name, applied_at) VALUES ($1, NOW()) ON CONFLICT (migration_name) DO NOTHING',
          [migration.name]
        );

        console.log(`   ✅ ${migration.name}`);
        applied++;
      } catch (err) {
        // Check if it's a "already exists" type error - that's OK
        if (err.message.includes('already exists') || err.message.includes('duplicate key')) {
          console.log(`   ⏭️  ${migration.name} (objects exist)`);

          // Still record as applied
          await client.query(
            'INSERT INTO schema_migrations (migration_name, applied_at) VALUES ($1, NOW()) ON CONFLICT (migration_name) DO NOTHING',
            [migration.name]
          );
          applied++;
        } else {
          console.log(`   ❌ ${migration.name}`);
          console.log(`      Error: ${err.message.split('\n')[0]}`);
          failed++;
        }
      }
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Migration Reset Complete!`);
    console.log(`  Applied: ${applied}`);
    console.log(`  Failed: ${failed}`);
    console.log('═══════════════════════════════════════════════════════');

  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

resetMigrations();
