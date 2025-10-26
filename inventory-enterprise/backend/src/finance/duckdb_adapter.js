/**
 * DuckDB Adapter (v15.4.0)
 * Optional high-performance analytics engine
 * Falls back to SQLite if DuckDB not available
 */

const { logger } = require('../../config/logger');

class DuckDBAdapter {
  constructor() {
    this.available = false;
    this.db = null;
  }

  /**
   * Initialize DuckDB connection
   * Attempts to load DuckDB module, falls back gracefully
   */
  async initialize() {
    try {
      // Try to require duckdb (optional dependency)
      const duckdb = require('duckdb');
      this.db = new duckdb.Database(':memory:');
      this.available = true;
      logger.info('✅ DuckDB adapter initialized');
      return true;
    } catch (error) {
      logger.info('ℹ️  DuckDB not available, using SQLite for analytics');
      this.available = false;
      return false;
    }
  }

  /**
   * Attach SQLite database as external table
   * @param {string} sqlitePath - Path to SQLite database
   */
  async attachSQLite(sqlitePath) {
    if (!this.available) {
      return false;
    }

    try {
      // Attach SQLite database
      await this.db.run(`
        INSTALL sqlite_scanner;
        LOAD sqlite_scanner;
        CALL sqlite_attach('${sqlitePath}');
      `);
      logger.info(`✅ SQLite database attached to DuckDB: ${sqlitePath}`);
      return true;
    } catch (error) {
      logger.warn('Failed to attach SQLite to DuckDB:', error.message);
      return false;
    }
  }

  /**
   * Execute analytical query with DuckDB
   * @param {string} sql - SQL query
   * @returns {Promise<Array>} Results
   */
  async query(sql) {
    if (!this.available) {
      throw new Error('DuckDB not available - use SQLite fallback');
    }

    return new Promise((resolve, reject) => {
      this.db.all(sql, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Helper: Large aggregation with window functions
   * @param {string} table - Table name
   * @param {object} params - Aggregation parameters
   * @returns {Promise<Array>} Results
   */
  async largeAggregation(table, params) {
    if (!this.available) {
      throw new Error('DuckDB not available');
    }

    const { groupBy, metrics, windowFunc, orderBy } = params;

    const sql = `
      SELECT
        ${groupBy},
        ${metrics.map(m => `SUM(${m}) as ${m}_total`).join(', ')},
        ${windowFunc || 'ROW_NUMBER()'} OVER (ORDER BY ${orderBy || groupBy}) as row_num
      FROM ${table}
      GROUP BY ${groupBy}
      ORDER BY ${orderBy || groupBy}
    `;

    return this.query(sql);
  }

  /**
   * Close DuckDB connection
   */
  close() {
    if (this.db) {
      this.db.close();
      logger.info('DuckDB connection closed');
    }
  }
}

// Export singleton instance
const duckDBAdapter = new DuckDBAdapter();

module.exports = {
  DuckDBAdapter,
  duckDBAdapter
};
