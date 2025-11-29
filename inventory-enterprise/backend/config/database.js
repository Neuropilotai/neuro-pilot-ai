/**
 * Database Configuration
 * LEGACY SQLite database initialization - DEPRECATED
 *
 * NOTE: This app now uses PostgreSQL via ./db.js
 * This file is kept for backwards compatibility with legacy routes
 * that haven't been migrated yet. It will NOT crash the server if
 * SQLite fails to initialize.
 */

const path = require('path');

// Try to load sqlite3, but don't crash if it fails
let sqlite3 = null;
try {
  sqlite3 = require('sqlite3').verbose();
} catch (err) {
  console.warn('[SQLite] sqlite3 module not available:', err.message);
}

// Try to load logger, but don't crash if it fails
let logger = { info: console.log, error: console.error, warn: console.warn };
try {
  logger = require('./logger').logger;
} catch (err) {
  console.warn('[SQLite] Logger not available, using console');
}

// Railway support: Use persistent volume if available, otherwise /tmp (ephemeral but works)
const DB_PATH = process.env.DATABASE_PATH ||
  (process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'enterprise_inventory.db')
    : process.env.RAILWAY_ENVIRONMENT
      ? '/tmp/enterprise_inventory.db'  // Railway: use /tmp (ephemeral but functional)
      : path.join(__dirname, '..', 'data', 'enterprise_inventory.db'));

class Database {
  constructor() {
    this.db = null;
    this.initError = null;
    this.initialized = false;
  }

  /**
   * Get database connection (singleton pattern)
   * SAFE: Will not throw - returns null if SQLite is unavailable
   */
  getConnection() {
    // If we already tried and failed, return null
    if (this.initError) {
      return null;
    }

    // If sqlite3 module isn't available, log warning and return null
    if (!sqlite3) {
      if (!this.initialized) {
        console.warn('[SQLite] Cannot initialize - sqlite3 module not available. Use PostgreSQL instead.');
        this.initialized = true;
        this.initError = new Error('sqlite3 module not available');
      }
      return null;
    }

    if (!this.db) {
      try {
        this.db = new sqlite3.Database(DB_PATH, (err) => {
          if (err) {
            console.warn('[SQLite] Error connecting to database (non-fatal):', err.message);
            this.initError = err;
            this.db = null;
          } else {
            logger.info(`[SQLite] Connected to SQLite database at ${DB_PATH}`);
            // Enable foreign keys
            this.db.run('PRAGMA foreign_keys = ON');
          }
        });
        this.initialized = true;
      } catch (err) {
        console.warn('[SQLite] Failed to initialize (non-fatal):', err.message);
        this.initError = err;
        this.db = null;
        this.initialized = true;
      }
    }
    return this.db;
  }

  /**
   * Run a query (for INSERT, UPDATE, DELETE)
   * SAFE: Returns error result if SQLite unavailable
   */
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      const conn = this.getConnection();
      if (!conn) {
        console.warn('[SQLite] run() called but SQLite unavailable. SQL:', sql.substring(0, 50));
        return reject(new Error('SQLite database not available - use PostgreSQL'));
      }
      conn.run(sql, params, function(err) {
        if (err) {
          logger.error('Database run error:', err, { sql, params });
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  /**
   * Get a single row
   * SAFE: Returns null if SQLite unavailable
   */
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      const conn = this.getConnection();
      if (!conn) {
        console.warn('[SQLite] get() called but SQLite unavailable. SQL:', sql.substring(0, 50));
        return resolve(null);  // Return null instead of throwing
      }
      conn.get(sql, params, (err, row) => {
        if (err) {
          logger.error('Database get error:', err, { sql, params });
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Get all rows
   * SAFE: Returns empty array if SQLite unavailable
   */
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      const conn = this.getConnection();
      if (!conn) {
        console.warn('[SQLite] all() called but SQLite unavailable. SQL:', sql.substring(0, 50));
        return resolve([]);  // Return empty array instead of throwing
      }
      conn.all(sql, params, (err, rows) => {
        if (err) {
          logger.error('Database all error:', err, { sql, params });
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Close database connection
   */
  close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            logger.error('Error closing database:', err);
            reject(err);
          } else {
            logger.info('Database connection closed');
            this.db = null;
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Check if SQLite is available
   */
  isAvailable() {
    return this.db !== null && this.initError === null;
  }
}

// Export singleton instance
const database = new Database();

module.exports = database;
