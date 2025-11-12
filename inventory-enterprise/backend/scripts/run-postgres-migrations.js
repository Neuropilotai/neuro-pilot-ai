#!/usr/bin/env node
/**
 * PostgreSQL Database Migration Runner
 * Runs all migration files in backend/migrations/postgres/ in order
 * Usage: node backend/scripts/run-postgres-migrations.js
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

const MIGRATIONS_DIR = path.join(__dirname, '../migrations/postgres');

async function runMigrations() {
  console.log('🚀 Starting PostgreSQL migrations...\n');

  try {
    // Get all .sql files in migrations directory
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Files are already numbered (001_, 003_, 004_, etc.)

    if (files.length === 0) {
      console.log('⚠️  No migration files found');
      process.exit(0);
    }

    console.log(`Found ${files.length} migration files:\n`);
    files.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file}`);
    });
    console.log('');

    // Run each migration file sequentially
    for (const file of files) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      console.log(`📄 Running migration: ${file}...`);

      try {
        const sql = fs.readFileSync(filePath, 'utf8');

        // Execute the SQL
        await pool.query(sql);

        console.log(`✅ ${file} completed successfully\n`);
      } catch (error) {
        // Check if error is because table already exists
        if (error.code === '42P07') {
          console.log(`⏭️  ${file} - Tables already exist, skipping\n`);
          continue;
        }

        console.error(`❌ Error running ${file}:`, error.message);
        throw error;
      }
    }

    console.log('\n✨ All migrations completed successfully!\n');

    // Verify some key tables exist
    console.log('🔍 Verifying database tables...\n');
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log(`Found ${result.rows.length} tables:`);
    result.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    console.log('');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    // Close pool
    await pool.end();
    console.log('🔌 Database connection closed');
  }
}

// Run migrations
runMigrations();
