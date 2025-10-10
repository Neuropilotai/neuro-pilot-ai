/**
 * Database Adapter
 * Provides unified interface for SQLite and PostgreSQL with dual-write support
 * Ensures backward compatibility and graceful migration path
 */

const sqlite3 = require('sqlite3').verbose();
const config = require('../config');
const logger = require('../config/logger');
const fs = require('fs').promises;
const path = require('path');

class DatabaseAdapter {
  constructor(options = {}) {
    this.primaryDb = null;
    this.secondaryDb = null;
    this.dualWriteEnabled = options.dualWrite || false;
    this.type = config.databaseType;
    this.fallbackToJson = options.fallbackToJson !== false;
    this.jsonCachePath = options.jsonCachePath || './data/cache.json';
  }

  /**
   * Connect to database(s)
   */
  async connect() {
    try {
      // Connect to primary database
      if (this.type === 'postgres' && config.postgres.enabled) {
        await this.connectPostgres();
      } else {
        await this.connectSQLite();
      }

      // If dual-write enabled, connect to secondary database
      if (this.dualWriteEnabled) {
        if (this.type === 'postgres') {
          await this.connectSQLite(); // Postgres primary, SQLite secondary
        } else {
          await this.connectPostgres(); // SQLite primary, Postgres secondary
        }
      }

      logger.info('Database adapter connected', {
        primary: this.type,
        dualWrite: this.dualWriteEnabled
      });

      return true;

    } catch (error) {
      logger.error('Database connection failed', { error: error.message });

      // Fallback to JSON if enabled
      if (this.fallbackToJson) {
        logger.warn('Falling back to JSON file storage');
        await this.initializeJsonFallback();
        return true;
      }

      throw error;
    }
  }

  /**
   * Connect to SQLite
   */
  async connectSQLite() {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(config.dbPath, (err) => {
        if (err) {
          logger.error('SQLite connection failed', { error: err.message });
          return reject(err);
        }

        // Enable WAL mode for better concurrency
        if (config.enableWAL) {
          db.run('PRAGMA journal_mode=WAL;', (walErr) => {
            if (walErr) {
              logger.warn('Failed to enable WAL mode', { error: walErr.message });
            }
          });
        }

        if (this.type === 'sqlite' || !this.primaryDb) {
          this.primaryDb = db;
        } else {
          this.secondaryDb = db;
        }

        logger.info('SQLite connected', { path: config.dbPath });
        resolve(db);
      });
    });
  }

  /**
   * Connect to PostgreSQL
   */
  async connectPostgres() {
    try {
      // Dynamically import pg (only if Postgres is enabled)
      const { Pool } = require('pg');

      const pool = new Pool({
        host: config.postgres.host,
        port: config.postgres.port,
        database: config.postgres.database,
        user: config.postgres.user,
        password: config.postgres.password,
        ssl: config.postgres.ssl ? { rejectUnauthorized: false } : false,
        max: config.postgres.maxConnections,
        idleTimeoutMillis: config.postgres.idleTimeout,
        connectionTimeoutMillis: config.postgres.connectionTimeout
      });

      // Test connection
      const client = await pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      if (this.type === 'postgres' || !this.primaryDb) {
        this.primaryDb = pool;
      } else {
        this.secondaryDb = pool;
      }

      logger.info('PostgreSQL connected', {
        host: config.postgres.host,
        database: config.postgres.database
      });

      return pool;

    } catch (error) {
      logger.error('PostgreSQL connection failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Initialize JSON fallback storage
   */
  async initializeJsonFallback() {
    try {
      const dir = path.dirname(this.jsonCachePath);
      await fs.mkdir(dir, { recursive: true });

      // Check if file exists, if not create empty cache
      try {
        await fs.access(this.jsonCachePath);
      } catch {
        await fs.writeFile(this.jsonCachePath, JSON.stringify({
          metadata: {
            created: new Date().toISOString(),
            version: '2.1.0'
          },
          data: {}
        }, null, 2));
      }

      logger.info('JSON fallback initialized', { path: this.jsonCachePath });

    } catch (error) {
      logger.error('Failed to initialize JSON fallback', { error: error.message });
      throw error;
    }
  }

  /**
   * Execute query with automatic database selection
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @param {string} operation - 'all', 'get', 'run'
   * @returns {Promise<any>} - Query results
   */
  async query(sql, params = [], operation = 'all') {
    // Try primary database first
    try {
      const result = await this.executeQuery(this.primaryDb, sql, params, operation, this.type);

      // If dual-write enabled and it's a write operation, also write to secondary
      if (this.dualWriteEnabled && this.secondaryDb && this.isWriteOperation(operation)) {
        const secondaryType = this.type === 'postgres' ? 'sqlite' : 'postgres';
        this.executeQuery(this.secondaryDb, sql, params, operation, secondaryType).catch(err => {
          logger.warn('Secondary database write failed', { error: err.message });
        });
      }

      return result;

    } catch (error) {
      logger.error('Primary database query failed', { error: error.message, sql });

      // Try fallback to JSON if enabled
      if (this.fallbackToJson) {
        logger.warn('Attempting JSON fallback for query');
        return await this.queryJson(sql, params, operation);
      }

      throw error;
    }
  }

  /**
   * Execute query on specific database
   */
  async executeQuery(db, sql, params, operation, dbType) {
    if (!db) {
      throw new Error('Database not connected');
    }

    if (dbType === 'postgres') {
      return await this.executePostgresQuery(db, sql, params, operation);
    } else {
      return await this.executeSQLiteQuery(db, sql, params, operation);
    }
  }

  /**
   * Execute SQLite query
   */
  async executeSQLiteQuery(db, sql, params, operation) {
    return new Promise((resolve, reject) => {
      if (operation === 'all') {
        db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      } else if (operation === 'get') {
        db.get(sql, params, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      } else if (operation === 'run') {
        db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      } else {
        reject(new Error(`Unknown operation: ${operation}`));
      }
    });
  }

  /**
   * Execute PostgreSQL query
   */
  async executePostgresQuery(pool, sql, params, operation) {
    // Convert SQLite-style placeholders (?) to PostgreSQL-style ($1, $2, ...)
    let pgSql = sql;
    let paramIndex = 1;
    while (pgSql.includes('?')) {
      pgSql = pgSql.replace('?', `$${paramIndex++}`);
    }

    const client = await pool.connect();
    try {
      const result = await client.query(pgSql, params);

      if (operation === 'all') {
        return result.rows;
      } else if (operation === 'get') {
        return result.rows[0] || null;
      } else if (operation === 'run') {
        return {
          lastID: result.rows[0]?.id || null,
          changes: result.rowCount
        };
      }

    } finally {
      client.release();
    }
  }

  /**
   * Query JSON fallback storage
   */
  async queryJson(sql, params, operation) {
    try {
      const data = await fs.readFile(this.jsonCachePath, 'utf8');
      const cache = JSON.parse(data);

      // Very basic JSON query support (only for SELECT operations)
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        // Extract table name from SQL
        const tableMatch = sql.match(/FROM\s+(\w+)/i);
        if (tableMatch) {
          const tableName = tableMatch[1];
          const tableData = cache.data[tableName] || [];

          if (operation === 'all') {
            return tableData;
          } else if (operation === 'get') {
            return tableData[0] || null;
          }
        }
      }

      logger.warn('JSON fallback query not fully supported', { sql });
      return operation === 'all' ? [] : null;

    } catch (error) {
      logger.error('JSON fallback query failed', { error: error.message });
      return operation === 'all' ? [] : null;
    }
  }

  /**
   * Check if operation is a write operation
   */
  isWriteOperation(operation) {
    return operation === 'run';
  }

  /**
   * Begin transaction
   */
  async beginTransaction() {
    if (this.type === 'postgres') {
      const client = await this.primaryDb.connect();
      await client.query('BEGIN');
      return client;
    } else {
      return new Promise((resolve, reject) => {
        this.primaryDb.run('BEGIN TRANSACTION', (err) => {
          if (err) reject(err);
          else resolve(this.primaryDb);
        });
      });
    }
  }

  /**
   * Commit transaction
   */
  async commitTransaction(client = null) {
    if (this.type === 'postgres' && client) {
      await client.query('COMMIT');
      client.release();
    } else {
      return new Promise((resolve, reject) => {
        this.primaryDb.run('COMMIT', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  /**
   * Rollback transaction
   */
  async rollbackTransaction(client = null) {
    if (this.type === 'postgres' && client) {
      await client.query('ROLLBACK');
      client.release();
    } else {
      return new Promise((resolve, reject) => {
        this.primaryDb.run('ROLLBACK', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  /**
   * Close database connections
   */
  async close() {
    if (this.primaryDb) {
      if (this.type === 'postgres') {
        await this.primaryDb.end();
      } else {
        await new Promise((resolve) => this.primaryDb.close(resolve));
      }
      logger.info('Primary database closed');
    }

    if (this.secondaryDb) {
      if (this.type === 'sqlite') {
        await this.secondaryDb.end();
      } else {
        await new Promise((resolve) => this.secondaryDb.close(resolve));
      }
      logger.info('Secondary database closed');
    }
  }

  /**
   * Get database health status
   */
  async getHealth() {
    const health = {
      primary: { type: this.type, connected: false },
      secondary: { type: null, connected: false },
      dualWrite: this.dualWriteEnabled,
      fallbackEnabled: this.fallbackToJson
    };

    try {
      // Check primary database
      if (this.type === 'postgres') {
        const client = await this.primaryDb.connect();
        await client.query('SELECT 1');
        client.release();
        health.primary.connected = true;
      } else {
        await this.executeSQLiteQuery(this.primaryDb, 'SELECT 1', [], 'get');
        health.primary.connected = true;
      }

      // Check secondary database if dual-write enabled
      if (this.dualWriteEnabled && this.secondaryDb) {
        health.secondary.type = this.type === 'postgres' ? 'sqlite' : 'postgres';
        try {
          if (health.secondary.type === 'postgres') {
            const client = await this.secondaryDb.connect();
            await client.query('SELECT 1');
            client.release();
          } else {
            await this.executeSQLiteQuery(this.secondaryDb, 'SELECT 1', [], 'get');
          }
          health.secondary.connected = true;
        } catch {
          health.secondary.connected = false;
        }
      }

    } catch (error) {
      health.primary.connected = false;
      health.error = error.message;
    }

    return health;
  }
}

module.exports = DatabaseAdapter;
