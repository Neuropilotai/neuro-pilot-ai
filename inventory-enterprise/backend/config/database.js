/**
 * Database Configuration
 * SQLite database initialization and connection management
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { logger } = require('./logger');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'enterprise_inventory.db');

class Database {
  constructor() {
    this.db = null;
  }

  /**
   * Get database connection (singleton pattern)
   */
  getConnection() {
    if (!this.db) {
      this.db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
          logger.error('Error connecting to database:', err);
          throw err;
        }
        logger.info(`Connected to SQLite database at ${DB_PATH}`);
      });

      // Enable foreign keys
      this.db.run('PRAGMA foreign_keys = ON');
    }
    return this.db;
  }

  /**
   * Run a query (for INSERT, UPDATE, DELETE)
   */
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.getConnection().run(sql, params, function(err) {
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
   */
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.getConnection().get(sql, params, (err, row) => {
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
   */
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.getConnection().all(sql, params, (err, rows) => {
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
}

// Export singleton instance
const database = new Database();

module.exports = database;
