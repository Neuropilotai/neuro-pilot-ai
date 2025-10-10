/**
 * Database Adapter with Tenant Scoping + Dual-Write Support
 * Version: v2.8.0-2025-10-08
 *
 * Features:
 * - Multi-tenant isolation with automatic tenant_id injection
 * - Dual-write pattern for zero-downtime SQLite → PostgreSQL migration
 * - Automatic consistency validation
 * - Read fallback on primary database failure
 * - Migration utilities
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class DatabaseAdapter {
  constructor() {
    this.mode = process.env.DATABASE_MODE || 'memory'; // 'memory', 'sqlite', 'postgres'
    this.db = null;
    this.inMemoryStore = new Map(); // For development/testing

    // v2.8.0: Dual-write configuration
    this.dualWriteEnabled = process.env.DUAL_WRITE_ENABLED === 'true';
    this.primaryDatabase = process.env.PRIMARY_DATABASE || 'sqlite';
    this.validateConsistency = process.env.VALIDATE_CONSISTENCY !== 'false';

    // Separate connections for SQLite and PostgreSQL
    this.sqliteDb = null;
    this.pgPool = null;

    // Metrics
    this.metrics = {
      totalQueries: 0,
      sqliteQueries: 0,
      postgresQueries: 0,
      dualWrites: 0,
      inconsistencies: 0,
      errors: { sqlite: 0, postgres: 0 }
    };

    if (this.mode === 'sqlite' || this.mode === 'postgres' || this.dualWriteEnabled) {
      this.initializeDatabase();
    }
  }

  initializeDatabase() {
    // Initialize SQLite
    if (this.mode === 'sqlite' || this.dualWriteEnabled) {
      const sqlite3 = require('sqlite3').verbose();
      const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../database.db');
      this.sqliteDb = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('SQLite connection error:', err);
        } else {
          console.log(`✓ SQLite connected: ${dbPath}`);
        }
      });

      // For backward compatibility
      if (this.mode === 'sqlite' && !this.dualWriteEnabled) {
        this.db = this.sqliteDb;
      }
    }

    // Initialize PostgreSQL
    if (this.mode === 'postgres' || (this.dualWriteEnabled && process.env.DATABASE_URL)) {
      const { Pool } = require('pg');
      this.pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        host: process.env.PG_HOST || 'localhost',
        port: process.env.PG_PORT || 5432,
        database: process.env.PG_DATABASE || 'inventory_enterprise',
        user: process.env.PG_USER || 'inventory_admin',
        password: process.env.PG_PASSWORD,
        ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
        max: parseInt(process.env.PG_POOL_SIZE) || 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        statement_timeout: 10000
      });

      this.pgPool.on('error', (err) => {
        console.error('PostgreSQL pool error:', err);
      });

      this.pgPool.on('connect', () => {
        console.log('✓ PostgreSQL connected');
      });

      // For backward compatibility
      if (this.mode === 'postgres' && !this.dualWriteEnabled) {
        this.db = this.pgPool;
      }
    }

    console.log('Database Adapter v2.8.0 initialized:');
    console.log(`  - Mode: ${this.mode}`);
    console.log(`  - Dual Write: ${this.dualWriteEnabled ? 'ENABLED' : 'DISABLED'}`);
    console.log(`  - Primary DB: ${this.primaryDatabase.toUpperCase()}`);
    console.log(`  - Consistency Validation: ${this.validateConsistency ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Query with automatic tenant scoping
   *
   * @param {string} tenantId - Tenant ID for isolation
   * @param {string} table - Table name
   * @param {object} options - Query options
   * @returns {Promise<Array>} - Query results
   */
  async queryWithTenantScope(tenantId, table, options = {}) {
    const {
      select = '*',
      where = {},
      orderBy = null,
      limit = null,
      offset = null
    } = options;

    // Inject tenant_id into where clause
    const scopedWhere = { ...where, tenant_id: tenantId };

    if (this.mode === 'memory') {
      return this._queryMemory(table, scopedWhere, { select, orderBy, limit, offset });
    } else if (this.mode === 'sqlite' || this.mode === 'postgres') {
      return this._queryDatabase(table, scopedWhere, { select, orderBy, limit, offset });
    }

    throw new Error(`Unsupported database mode: ${this.mode}`);
  }

  /**
   * Insert with automatic tenant_id injection
   *
   * @param {string} tenantId - Tenant ID
   * @param {string} table - Table name
   * @param {object} data - Data to insert
   * @returns {Promise<object>} - Inserted row
   */
  async insertWithTenantScope(tenantId, table, data) {
    const scopedData = { ...data, tenant_id: tenantId };

    if (this.mode === 'memory') {
      return this._insertMemory(table, scopedData);
    } else if (this.mode === 'sqlite' || this.mode === 'postgres') {
      return this._insertDatabase(table, scopedData);
    }

    throw new Error(`Unsupported database mode: ${this.mode}`);
  }

  /**
   * Update with automatic tenant_id scoping
   *
   * @param {string} tenantId - Tenant ID
   * @param {string} table - Table name
   * @param {object} where - Where conditions
   * @param {object} data - Data to update
   * @returns {Promise<number>} - Number of rows updated
   */
  async updateWithTenantScope(tenantId, table, where, data) {
    const scopedWhere = { ...where, tenant_id: tenantId };

    if (this.mode === 'memory') {
      return this._updateMemory(table, scopedWhere, data);
    } else if (this.mode === 'sqlite' || this.mode === 'postgres') {
      return this._updateDatabase(table, scopedWhere, data);
    }

    throw new Error(`Unsupported database mode: ${this.mode}`);
  }

  /**
   * Delete with automatic tenant_id scoping
   *
   * @param {string} tenantId - Tenant ID
   * @param {string} table - Table name
   * @param {object} where - Where conditions
   * @returns {Promise<number>} - Number of rows deleted
   */
  async deleteWithTenantScope(tenantId, table, where) {
    const scopedWhere = { ...where, tenant_id: tenantId };

    if (this.mode === 'memory') {
      return this._deleteMemory(table, scopedWhere);
    } else if (this.mode === 'sqlite' || this.mode === 'postgres') {
      return this._deleteDatabase(table, scopedWhere);
    }

    throw new Error(`Unsupported database mode: ${this.mode}`);
  }

  /**
   * Verify cross-tenant isolation (for testing)
   *
   * @param {string} tenantId1 - First tenant ID
   * @param {string} tenantId2 - Second tenant ID
   * @param {string} table - Table name
   * @returns {Promise<boolean>} - True if isolated, false if leak detected
   */
  async verifyCrossTenantIsolation(tenantId1, tenantId2, table) {
    const tenant1Data = await this.queryWithTenantScope(tenantId1, table);
    const tenant2Data = await this.queryWithTenantScope(tenantId2, table);

    // Check if any data from tenant1 appears in tenant2 results
    const tenant1Ids = new Set(tenant1Data.map(row => row.id));
    const leakedData = tenant2Data.filter(row => tenant1Ids.has(row.id));

    return leakedData.length === 0;
  }

  // ========== In-Memory Implementation ==========

  _queryMemory(table, where, options) {
    const tableKey = `table:${table}`;
    const records = this.inMemoryStore.get(tableKey) || [];

    let filtered = records.filter(record => {
      return Object.keys(where).every(key => record[key] === where[key]);
    });

    // Order by
    if (options.orderBy) {
      const [field, direction = 'ASC'] = options.orderBy.split(' ');
      filtered.sort((a, b) => {
        if (direction.toUpperCase() === 'DESC') {
          return b[field] > a[field] ? 1 : -1;
        }
        return a[field] > b[field] ? 1 : -1;
      });
    }

    // Limit + offset
    if (options.limit) {
      const offset = options.offset || 0;
      filtered = filtered.slice(offset, offset + options.limit);
    }

    return Promise.resolve(filtered);
  }

  _insertMemory(table, data) {
    const tableKey = `table:${table}`;
    const records = this.inMemoryStore.get(tableKey) || [];

    const newRecord = {
      ...data,
      id: data.id || `${table}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    records.push(newRecord);
    this.inMemoryStore.set(tableKey, records);

    return Promise.resolve(newRecord);
  }

  _updateMemory(table, where, data) {
    const tableKey = `table:${table}`;
    const records = this.inMemoryStore.get(tableKey) || [];

    let updateCount = 0;
    const updated = records.map(record => {
      const matches = Object.keys(where).every(key => record[key] === where[key]);
      if (matches) {
        updateCount++;
        return { ...record, ...data, updated_at: new Date().toISOString() };
      }
      return record;
    });

    this.inMemoryStore.set(tableKey, updated);
    return Promise.resolve(updateCount);
  }

  _deleteMemory(table, where) {
    const tableKey = `table:${table}`;
    const records = this.inMemoryStore.get(tableKey) || [];

    const filtered = records.filter(record => {
      return !Object.keys(where).every(key => record[key] === where[key]);
    });

    const deleteCount = records.length - filtered.length;
    this.inMemoryStore.set(tableKey, filtered);

    return Promise.resolve(deleteCount);
  }

  // ========== Database Implementation ==========

  _queryDatabase(table, where, options) {
    return new Promise((resolve, reject) => {
      const whereClauses = [];
      const params = [];

      Object.entries(where).forEach(([key, value]) => {
        whereClauses.push(`${key} = ?`);
        params.push(value);
      });

      let sql = `SELECT ${options.select} FROM ${table}`;
      if (whereClauses.length > 0) {
        sql += ` WHERE ${whereClauses.join(' AND ')}`;
      }
      if (options.orderBy) {
        sql += ` ORDER BY ${options.orderBy}`;
      }
      if (options.limit) {
        sql += ` LIMIT ${options.limit}`;
        if (options.offset) {
          sql += ` OFFSET ${options.offset}`;
        }
      }

      if (this.mode === 'sqlite') {
        this.db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      } else if (this.mode === 'postgres') {
        // Convert ? placeholders to $1, $2, etc. for Postgres
        let paramIndex = 1;
        sql = sql.replace(/\?/g, () => `$${paramIndex++}`);

        this.db.query(sql, params, (err, result) => {
          if (err) reject(err);
          else resolve(result.rows || []);
        });
      }
    });
  }

  _insertDatabase(table, data) {
    return new Promise((resolve, reject) => {
      const keys = Object.keys(data);
      const values = Object.values(data);
      const placeholders = keys.map(() => '?').join(', ');

      let sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;

      if (this.mode === 'sqlite') {
        sql += ' RETURNING *';
        this.db.get(sql, values, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      } else if (this.mode === 'postgres') {
        sql += ' RETURNING *';
        let paramIndex = 1;
        sql = sql.replace(/\?/g, () => `$${paramIndex++}`);

        this.db.query(sql, values, (err, result) => {
          if (err) reject(err);
          else resolve(result.rows[0]);
        });
      }
    });
  }

  _updateDatabase(table, where, data) {
    return new Promise((resolve, reject) => {
      const setClauses = [];
      const params = [];

      Object.entries(data).forEach(([key, value]) => {
        setClauses.push(`${key} = ?`);
        params.push(value);
      });

      const whereClauses = [];
      Object.entries(where).forEach(([key, value]) => {
        whereClauses.push(`${key} = ?`);
        params.push(value);
      });

      let sql = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;

      if (this.mode === 'sqlite') {
        this.db.run(sql, params, function (err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      } else if (this.mode === 'postgres') {
        let paramIndex = 1;
        sql = sql.replace(/\?/g, () => `$${paramIndex++}`);

        this.db.query(sql, params, (err, result) => {
          if (err) reject(err);
          else resolve(result.rowCount);
        });
      }
    });
  }

  _deleteDatabase(table, where) {
    return new Promise((resolve, reject) => {
      const whereClauses = [];
      const params = [];

      Object.entries(where).forEach(([key, value]) => {
        whereClauses.push(`${key} = ?`);
        params.push(value);
      });

      let sql = `DELETE FROM ${table} WHERE ${whereClauses.join(' AND ')}`;

      if (this.mode === 'sqlite') {
        this.db.run(sql, params, function (err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      } else if (this.mode === 'postgres') {
        let paramIndex = 1;
        sql = sql.replace(/\?/g, () => `$${paramIndex++}`);

        this.db.query(sql, params, (err, result) => {
          if (err) reject(err);
          else resolve(result.rowCount);
        });
      }
    });
  }

  // ========== v2.8.0: Dual-Write Methods ==========

  /**
   * Execute query with dual-write support
   * @param {string} sql - SQL query
   * @param {array} params - Query parameters
   * @param {string} queryType - 'read' or 'write'
   * @returns {Promise<Array>}
   */
  async queryDualWrite(sql, params = [], queryType = 'read') {
    this.metrics.totalQueries++;

    if (queryType === 'write' && this.dualWriteEnabled) {
      return await this.dualWrite(sql, params);
    } else if (queryType === 'read') {
      return await this.dualRead(sql, params);
    } else {
      return await this.singleWrite(sql, params);
    }
  }

  /**
   * Dual-write to both SQLite and PostgreSQL
   */
  async dualWrite(sql, params) {
    this.metrics.dualWrites++;
    const startTime = Date.now();

    try {
      const pgSql = this.convertSQLiteToPostgres(sql);

      const [pgResult, sqliteResult] = await Promise.allSettled([
        this.executePgQuery(pgSql, params),
        this.executeSqliteQuery(sql, params)
      ]);

      if (pgResult.status === 'rejected') {
        console.error('PostgreSQL write failed:', pgResult.reason);
        this.metrics.errors.postgres++;
      }

      if (sqliteResult.status === 'rejected') {
        console.error('SQLite write failed:', sqliteResult.reason);
        this.metrics.errors.sqlite++;
      }

      if (this.primaryDatabase === 'postgres' && pgResult.status === 'rejected') {
        throw pgResult.reason;
      }
      if (this.primaryDatabase === 'sqlite' && sqliteResult.status === 'rejected') {
        throw sqliteResult.reason;
      }

      if (this.validateConsistency && pgResult.status === 'fulfilled' && sqliteResult.status === 'fulfilled') {
        this.validateWriteConsistency(pgResult.value, sqliteResult.value);
      }

      const duration = Date.now() - startTime;
      if (duration > 100) {
        console.warn(`Slow dual-write: ${duration}ms`);
      }

      return this.primaryDatabase === 'postgres' ? pgResult.value : sqliteResult.value;

    } catch (error) {
      console.error('Dual-write error:', error);
      throw error;
    }
  }

  /**
   * Single write (when dual-write disabled)
   */
  async singleWrite(sql, params) {
    if (this.primaryDatabase === 'postgres' && this.pgPool) {
      const pgSql = this.convertSQLiteToPostgres(sql);
      return await this.executePgQuery(pgSql, params);
    } else {
      return await this.executeSqliteQuery(sql, params);
    }
  }

  /**
   * Read with fallback
   */
  async dualRead(sql, params) {
    try {
      if (this.primaryDatabase === 'postgres' && this.pgPool) {
        const pgSql = this.convertSQLiteToPostgres(sql);
        return await this.executePgQuery(pgSql, params);
      } else {
        return await this.executeSqliteQuery(sql, params);
      }
    } catch (error) {
      console.error(`Read from ${this.primaryDatabase} failed, trying fallback:`, error);

      if (this.primaryDatabase === 'postgres') {
        return await this.executeSqliteQuery(sql, params);
      } else if (this.pgPool) {
        const pgSql = this.convertSQLiteToPostgres(sql);
        return await this.executePgQuery(pgSql, params);
      } else {
        throw error;
      }
    }
  }

  /**
   * Execute PostgreSQL query
   */
  async executePgQuery(sql, params) {
    if (!this.pgPool) throw new Error('PostgreSQL not configured');

    this.metrics.postgresQueries++;
    const client = await this.pgPool.connect();

    try {
      const pgSql = this.convertPlaceholders(sql);
      const result = await client.query(pgSql, params);
      return result.rows || [];
    } finally {
      client.release();
    }
  }

  /**
   * Execute SQLite query
   */
  async executeSqliteQuery(sql, params) {
    if (!this.sqliteDb) throw new Error('SQLite not configured');

    this.metrics.sqliteQueries++;

    return new Promise((resolve, reject) => {
      const method = sql.trim().toUpperCase().startsWith('SELECT') ? 'all' : 'run';

      this.sqliteDb[method](sql, params, function(err, rows) {
        if (err) {
          reject(err);
        } else {
          if (method === 'all') {
            resolve(rows || []);
          } else {
            resolve([{ changes: this.changes, lastID: this.lastID }]);
          }
        }
      });
    });
  }

  /**
   * Convert SQLite SQL to PostgreSQL SQL
   */
  convertSQLiteToPostgres(sql) {
    let pgSql = sql;

    // AUTOINCREMENT → SERIAL
    pgSql = pgSql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');

    // datetime('now') → CURRENT_TIMESTAMP
    pgSql = pgSql.replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP');

    // INTEGER → INT (PostgreSQL compatibility)
    // Both work in PostgreSQL, so no change needed

    return pgSql;
  }

  /**
   * Convert ? placeholders to $1, $2, etc. for PostgreSQL
   */
  convertPlaceholders(sql) {
    let counter = 1;
    return sql.replace(/\?/g, () => `$${counter++}`);
  }

  /**
   * Validate consistency between writes
   */
  validateWriteConsistency(pgResult, sqliteResult) {
    const pgChecksum = this.calculateChecksum(pgResult);
    const sqliteChecksum = this.calculateChecksum(sqliteResult);

    if (pgChecksum !== sqliteChecksum) {
      this.metrics.inconsistencies++;
      console.error('Data inconsistency detected!');
      this.logInconsistency(pgResult, sqliteResult);
    }
  }

  /**
   * Calculate checksum for result set
   */
  calculateChecksum(result) {
    if (!result || result.length === 0) return 'empty';

    try {
      const normalized = JSON.stringify(result, Object.keys(result).sort());
      return crypto.createHash('md5').update(normalized).digest('hex');
    } catch (error) {
      return 'error';
    }
  }

  /**
   * Log inconsistency to file
   */
  logInconsistency(pgResult, sqliteResult) {
    const logDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFile = path.join(logDir, `inconsistency_${Date.now()}.json`);
    const logData = {
      timestamp: new Date().toISOString(),
      postgresResult: pgResult,
      sqliteResult: sqliteResult
    };

    fs.writeFileSync(logFile, JSON.stringify(logData, null, 2));
    console.log(`Inconsistency logged to: ${logFile}`);
  }

  /**
   * Get adapter metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      primaryDatabase: this.primaryDatabase,
      dualWriteEnabled: this.dualWriteEnabled,
      consistencyRate: this.metrics.dualWrites > 0
        ? ((1 - this.metrics.inconsistencies / this.metrics.dualWrites) * 100).toFixed(2)
        : 100
    };
  }

  /**
   * Test database connections
   */
  async testConnections() {
    const results = { sqlite: false, postgres: false, errors: {} };

    if (this.sqliteDb) {
      try {
        await this.executeSqliteQuery('SELECT 1 as test', []);
        results.sqlite = true;
      } catch (error) {
        results.errors.sqlite = error.message;
      }
    }

    if (this.pgPool) {
      try {
        await this.executePgQuery('SELECT 1 as test', []);
        results.postgres = true;
      } catch (error) {
        results.errors.postgres = error.message;
      }
    }

    return results;
  }

  /**
   * Close database connection
   */
  async close() {
    console.log('Closing database connections...');

    if (this.pgPool) {
      await this.pgPool.end();
      console.log('✓ PostgreSQL pool closed');
    }

    if (this.sqliteDb) {
      await new Promise((resolve, reject) => {
        this.sqliteDb.close((err) => {
          if (err) reject(err);
          else {
            console.log('✓ SQLite closed');
            resolve();
          }
        });
      });
    }

    // Backward compatibility
    if (this.db && this.db !== this.sqliteDb && this.db !== this.pgPool) {
      if (this.mode === 'postgres') {
        await this.db.end();
      }
    }
  }
}

// Singleton instance
let instance = null;

function getDatabaseAdapter() {
  if (!instance) {
    instance = new DatabaseAdapter();
  }
  return instance;
}

module.exports = {
  DatabaseAdapter,
  getDatabaseAdapter
};
