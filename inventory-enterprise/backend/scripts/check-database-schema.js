#!/usr/bin/env node
/**
 * Check existing database schema
 */

const { pool } = require('../db');

async function checkSchema() {
  console.log('🔍 Checking existing database schema...\n');

  try {
    // Check tables
    console.log('=== TABLES ===');
    const tablesResult = await pool.query(`
      SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log(`Found ${tablesResult.rows.length} tables/views:`);
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name} (${row.table_type})`);
    });
    console.log('');

    // Check views specifically
    console.log('=== VIEWS ===');
    const viewsResult = await pool.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log(`Found ${viewsResult.rows.length} views:`);
    viewsResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    console.log('');

    // Check indexes
    console.log('=== INDEXES ===');
    const indexesResult = await pool.query(`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);
    console.log(`Found ${indexesResult.rows.length} indexes:`);
    const grouped = {};
    indexesResult.rows.forEach(row => {
      if (!grouped[row.tablename]) grouped[row.tablename] = [];
      grouped[row.tablename].push(row.indexname);
    });
    Object.keys(grouped).sort().forEach(table => {
      console.log(`  ${table}:`);
      grouped[table].forEach(idx => console.log(`    - ${idx}`));
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('\n✅ Schema check complete');
  }
}

checkSchema();
