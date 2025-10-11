#!/usr/bin/env node
/**
 * Migration Runner for v13.1 Invoice Date Enhancement
 * Safely adds columns to documents table with idempotent checks
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'db', 'inventory_enterprise.db');

async function runMigration() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('❌ Failed to connect to database:', err);
        return reject(err);
      }
      console.log('✅ Connected to database');
    });

    // Get current schema
    db.all("PRAGMA table_info(documents)", [], (err, columns) => {
      if (err) {
        console.error('❌ Failed to get table info:', err);
        db.close();
        return reject(err);
      }

      const existingColumns = columns.map(col => col.name);
      console.log('📋 Existing columns:', existingColumns.join(', '));

      const columnsToAdd = [
        { name: 'invoice_date', type: 'TEXT' },
        { name: 'invoice_number', type: 'TEXT' },
        { name: 'vendor', type: 'TEXT' },
        { name: 'invoice_amount', type: 'REAL' }
      ];

      const migrations = [];

      // Check which columns need to be added
      for (const col of columnsToAdd) {
        if (!existingColumns.includes(col.name)) {
          migrations.push(`ALTER TABLE documents ADD COLUMN ${col.name} ${col.type}`);
          console.log(`🔧 Will add column: ${col.name}`);
        } else {
          console.log(`✓ Column already exists: ${col.name}`);
        }
      }

      if (migrations.length === 0) {
        console.log('✅ All columns already exist, skipping ALTER TABLE');

        // Still create indexes and migrate data
        runIndexesAndDataMigration(db, resolve, reject);
        return;
      }

      // Run migrations sequentially
      let completed = 0;
      for (const sql of migrations) {
        db.run(sql, (err) => {
          if (err) {
            console.error(`❌ Failed to run migration: ${sql}`, err);
            db.close();
            return reject(err);
          }
          console.log(`✅ Executed: ${sql}`);
          completed++;

          if (completed === migrations.length) {
            runIndexesAndDataMigration(db, resolve, reject);
          }
        });
      }
    });
  });
}

function runIndexesAndDataMigration(db, resolve, reject) {
  console.log('\n📊 Creating indexes...');

  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_documents_invoice_date ON documents(invoice_date)',
    'CREATE INDEX IF NOT EXISTS idx_documents_invoice_number ON documents(invoice_number)',
    'CREATE INDEX IF NOT EXISTS idx_documents_vendor ON documents(vendor)'
  ];

  let indexCount = 0;
  for (const sql of indexes) {
    db.run(sql, (err) => {
      if (err) {
        console.error(`❌ Failed to create index: ${sql}`, err);
      } else {
        console.log(`✅ Index created`);
      }
      indexCount++;

      if (indexCount === indexes.length) {
        migrateExistingData(db, resolve, reject);
      }
    });
  }
}

function migrateExistingData(db, resolve, reject) {
  console.log('\n🔄 Migrating existing data from metadata JSON...');

  const dataMigrations = [
    {
      name: 'invoice_number',
      sql: `UPDATE documents SET invoice_number = json_extract(metadata, '$.invoice_number')
            WHERE metadata IS NOT NULL
              AND json_extract(metadata, '$.invoice_number') IS NOT NULL
              AND invoice_number IS NULL`
    },
    {
      name: 'invoice_date',
      sql: `UPDATE documents SET invoice_date = json_extract(metadata, '$.invoice_date')
            WHERE metadata IS NOT NULL
              AND json_extract(metadata, '$.invoice_date') IS NOT NULL
              AND invoice_date IS NULL`
    },
    {
      name: 'vendor',
      sql: `UPDATE documents SET vendor = COALESCE(json_extract(metadata, '$.vendor'), 'GFS')
            WHERE metadata IS NOT NULL
              AND mime_type = 'application/pdf'
              AND vendor IS NULL`
    },
    {
      name: 'invoice_amount',
      sql: `UPDATE documents SET invoice_amount = CAST(json_extract(metadata, '$.total_amount') AS REAL)
            WHERE metadata IS NOT NULL
              AND json_extract(metadata, '$.total_amount') IS NOT NULL
              AND invoice_amount IS NULL`
    }
  ];

  let migrationCount = 0;
  for (const migration of dataMigrations) {
    db.run(migration.sql, function(err) {
      if (err) {
        console.error(`❌ Failed to migrate ${migration.name}:`, err);
      } else {
        console.log(`✅ Migrated ${migration.name}: ${this.changes} rows updated`);
      }
      migrationCount++;

      if (migrationCount === dataMigrations.length) {
        verifyMigration(db, resolve, reject);
      }
    });
  }
}

function verifyMigration(db, resolve, reject) {
  console.log('\n🔍 Verifying migration...');

  db.get(`
    SELECT
      COUNT(*) as total_pdfs,
      SUM(CASE WHEN invoice_date IS NOT NULL THEN 1 ELSE 0 END) as with_date,
      SUM(CASE WHEN invoice_date IS NULL THEN 1 ELSE 0 END) as missing_date,
      SUM(CASE WHEN vendor IS NOT NULL THEN 1 ELSE 0 END) as with_vendor,
      SUM(CASE WHEN invoice_number IS NOT NULL THEN 1 ELSE 0 END) as with_number
    FROM documents
    WHERE mime_type = 'application/pdf' AND deleted_at IS NULL
  `, [], (err, result) => {
    if (err) {
      console.error('❌ Failed to verify migration:', err);
      db.close();
      return reject(err);
    }

    console.log('\n📊 Migration Results:');
    console.log(`   Total PDFs: ${result.total_pdfs}`);
    console.log(`   With Date: ${result.with_date} (${((result.with_date / result.total_pdfs) * 100).toFixed(1)}%)`);
    console.log(`   Missing Date: ${result.missing_date}`);
    console.log(`   With Vendor: ${result.with_vendor}`);
    console.log(`   With Invoice Number: ${result.with_number}`);

    db.close((err) => {
      if (err) {
        console.error('❌ Error closing database:', err);
        return reject(err);
      }
      console.log('\n✅ Migration completed successfully!');
      resolve(result);
    });
  });
}

// Run migration
console.log('🚀 Starting Migration 031: Invoice Date Enhancement\n');
runMigration()
  .then(() => {
    console.log('\n🎉 All done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n💥 Migration failed:', err);
    process.exit(1);
  });
