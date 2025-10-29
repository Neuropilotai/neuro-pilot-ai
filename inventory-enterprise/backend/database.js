/**
 * Database Module Wrapper
 * Re-exports database from config/database with additional methods
 * Used by autonomous scheduler and recommendations routes
 */

const db = require('./config/database');

/**
 * Wrapper for prepared statements
 * Provides prepare() method for batch operations
 */
class PreparedStatement {
  constructor(sql) {
    this.sql = sql;
    this.operations = [];
  }

  async run(params) {
    this.operations.push(params);
  }

  async finalize() {
    // Execute all operations
    for (const params of this.operations) {
      await db.run(this.sql, params);
    }
    this.operations = [];
  }
}

/**
 * Add prepare() method for compatibility with scheduler
 */
db.prepare = function(sql) {
  return new PreparedStatement(sql);
};

module.exports = db;
