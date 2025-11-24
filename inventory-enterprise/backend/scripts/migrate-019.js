#!/usr/bin/env node
/**
 * One-time migration script for 019_create_documents_table
 * Run via Railway: railway run node scripts/migrate-019.js
 */

const { Pool } = require('pg');

// Use DATABASE_URL from environment (Railway provides this)
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ ERROR: DATABASE_URL environment variable not set');
  process.exit(1);
}

const pool = new Pool({ connectionString });

const migrationSQL = `
-- Migration 019: Create Documents Table
CREATE TABLE IF NOT EXISTS documents (
  document_id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  document_type TEXT DEFAULT 'INVOICE',
  upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed BOOLEAN DEFAULT FALSE,
  processed_date TIMESTAMP,
  notes TEXT,
  id TEXT DEFAULT gen_random_uuid()::text,
  mime_type TEXT DEFAULT 'application/pdf',
  deleted_at TIMESTAMP,
  vendor TEXT,
  invoice_date DATE,
  invoice_amount NUMERIC(12,2)
);

CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_processed ON documents(processed);
CREATE INDEX IF NOT EXISTS idx_documents_vendor ON documents(vendor);
CREATE INDEX IF NOT EXISTS idx_documents_upload_date ON documents(upload_date DESC);
`;

async function runMigration() {
  console.log('🚀 Running migration 019: Create documents table...\n');

  try {
    await pool.query(migrationSQL);

    console.log('✅ Migration completed successfully!');
    console.log('   - documents table created');
    console.log('   - indexes created\n');

    // Verify the table exists
    const result = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'documents'
      ORDER BY ordinal_position
    `);

    console.log(`📊 Table structure (${result.rows.length} columns):`);
    result.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type}`);
    });

  } catch (error) {
    if (error.code === '42P07') {
      console.log('ℹ️  Table already exists - migration skipped');
    } else {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  } finally {
    await pool.end();
    console.log('\n✨ Done!');
  }
}

runMigration().catch(err => {
  console.error(err);
  process.exit(1);
});
