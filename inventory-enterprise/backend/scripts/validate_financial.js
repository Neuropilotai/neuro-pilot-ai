#!/usr/bin/env node

/**
 * Financial Validation Runner
 * Validates fiscal period using FinancialAccuracyEngine
 *
 * @version 15.7.0
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Promise wrapper for database
class Database {
  constructor(dbPath) {
    this.db = new sqlite3.Database(dbPath);
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

async function main() {
  const fiscalPeriod = process.argv[2] || 'FY26-P01';
  const dbPath = process.argv[3] || path.join(__dirname, '../db/inventory_enterprise.db');

  const FinancialAccuracyEngine = require('../src/finance/FinancialAccuracyEngine');

  const db = new Database(dbPath);
  const engine = new FinancialAccuracyEngine(db);

  try {
    const report = await engine.validateFiscalPeriod(fiscalPeriod);

    // Output JSON report
    console.log(JSON.stringify(report, null, 2));

    await db.close();

    // Exit with appropriate code
    if (report.verification_score >= 95) {
      process.exit(0);
    } else if (report.verification_score >= 50) {
      process.exit(1);
    } else {
      process.exit(2);
    }

  } catch (error) {
    console.error('Validation error:', error.message);
    console.error(error.stack);
    await db.close();
    process.exit(2);
  }
}

main();
