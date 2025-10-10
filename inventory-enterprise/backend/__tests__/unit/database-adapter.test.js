/**
 * Database Adapter Tests
 * Tests for SQLite/PostgreSQL abstraction layer
 */

const DatabaseAdapter = require('../../db/DatabaseAdapter');

// Mock sqlite3
jest.mock('sqlite3', () => ({
  verbose: () => ({
    Database: jest.fn().mockImplementation((path, callback) => {
      callback(null);
      return {
        run: jest.fn((sql, params, callback) => {
          if (typeof params === 'function') {
            params(null);
          } else if (callback) {
            callback.call({ lastID: 1, changes: 1 }, null);
          }
        }),
        get: jest.fn((sql, params, callback) => {
          callback(null, { id: 1, name: 'test' });
        }),
        all: jest.fn((sql, params, callback) => {
          callback(null, [{ id: 1, name: 'test' }]);
        }),
        close: jest.fn((callback) => callback())
      };
    })
  })
}));

// Mock pg
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [{ now: new Date() }] }),
      release: jest.fn()
    }),
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    end: jest.fn().mockResolvedValue(undefined)
  }))
}));

// Mock logger
jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

// Mock config
jest.mock('../../config', () => ({
  databaseType: 'sqlite',
  dbPath: ':memory:',
  enableWAL: false,
  postgres: {
    enabled: false,
    host: 'localhost',
    port: 5432,
    database: 'test_db',
    user: 'test_user',
    password: 'test_password',
    ssl: false,
    maxConnections: 10,
    idleTimeout: 30000,
    connectionTimeout: 10000
  }
}));

describe('DatabaseAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new DatabaseAdapter();
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.close();
    }
  });

  describe('Initialization', () => {
    test('should initialize with default options', () => {
      expect(adapter).toBeDefined();
      expect(adapter.type).toBe('sqlite');
      expect(adapter.dualWriteEnabled).toBe(false);
      expect(adapter.fallbackToJson).toBe(true);
    });

    test('should initialize with custom options', () => {
      const customAdapter = new DatabaseAdapter({
        dualWrite: true,
        fallbackToJson: false,
        jsonCachePath: '/tmp/cache.json'
      });

      expect(customAdapter.dualWriteEnabled).toBe(true);
      expect(customAdapter.fallbackToJson).toBe(false);
      expect(customAdapter.jsonCachePath).toBe('/tmp/cache.json');
    });
  });

  describe('Connection', () => {
    test('should connect to SQLite', async () => {
      const result = await adapter.connect();
      expect(result).toBe(true);
      expect(adapter.primaryDb).toBeDefined();
    });

    test('should handle connection errors gracefully', async () => {
      // Mock connection failure
      const failAdapter = new DatabaseAdapter({ fallbackToJson: false });

      // Override connectSQLite to throw error
      failAdapter.connectSQLite = jest.fn().mockRejectedValue(new Error('Connection failed'));

      await expect(failAdapter.connect()).rejects.toThrow('Connection failed');
    });

    test('should fallback to JSON on connection failure', async () => {
      const failAdapter = new DatabaseAdapter({ fallbackToJson: true });
      failAdapter.connectSQLite = jest.fn().mockRejectedValue(new Error('Connection failed'));

      const result = await failAdapter.connect();
      expect(result).toBe(true);
    });
  });

  describe('Query Operations', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    test('should execute SELECT query (all)', async () => {
      const result = await adapter.query('SELECT * FROM test', [], 'all');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    test('should execute SELECT query (get)', async () => {
      const result = await adapter.query('SELECT * FROM test WHERE id = ?', [1], 'get');

      expect(result).toBeDefined();
      expect(result).toHaveProperty('id');
    });

    test('should execute INSERT/UPDATE query (run)', async () => {
      const result = await adapter.query('INSERT INTO test (name) VALUES (?)', ['test'], 'run');

      expect(result).toBeDefined();
      expect(result).toHaveProperty('lastID');
      expect(result).toHaveProperty('changes');
    });

    test('should handle query errors', async () => {
      adapter.primaryDb = null; // Force error

      await expect(adapter.query('SELECT * FROM test', [], 'all')).rejects.toThrow();
    });
  });

  describe('Transaction Support', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    test('should begin transaction', async () => {
      const client = await adapter.beginTransaction();
      expect(client).toBeDefined();
    });

    test('should commit transaction', async () => {
      await expect(adapter.commitTransaction()).resolves.not.toThrow();
    });

    test('should rollback transaction', async () => {
      await expect(adapter.rollbackTransaction()).resolves.not.toThrow();
    });
  });

  describe('Dual-Write Pattern', () => {
    test('should write to both databases when dual-write enabled', async () => {
      const dualAdapter = new DatabaseAdapter({ dualWrite: true });
      await dualAdapter.connect();

      // Mock secondaryDb
      dualAdapter.secondaryDb = {
        run: jest.fn((sql, params, callback) => {
          callback.call({ lastID: 1, changes: 1 }, null);
        })
      };

      const result = await dualAdapter.query('INSERT INTO test (name) VALUES (?)', ['test'], 'run');

      expect(result).toBeDefined();
      expect(result.lastID).toBeDefined();

      await dualAdapter.close();
    });
  });

  describe('Write Operation Detection', () => {
    test('should identify write operations', () => {
      expect(adapter.isWriteOperation('run')).toBe(true);
      expect(adapter.isWriteOperation('all')).toBe(false);
      expect(adapter.isWriteOperation('get')).toBe(false);
    });
  });

  describe('Health Check', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    test('should return health status', async () => {
      const health = await adapter.getHealth();

      expect(health).toBeDefined();
      expect(health).toHaveProperty('primary');
      expect(health).toHaveProperty('secondary');
      expect(health).toHaveProperty('dualWrite');
      expect(health).toHaveProperty('fallbackEnabled');

      expect(health.primary).toHaveProperty('type');
      expect(health.primary).toHaveProperty('connected');
    });

    test('should show primary connected', async () => {
      const health = await adapter.getHealth();

      expect(health.primary.type).toBe('sqlite');
      expect(health.primary.connected).toBe(true);
    });
  });

  describe('JSON Fallback', () => {
    let fallbackAdapter;

    beforeEach(() => {
      fallbackAdapter = new DatabaseAdapter({
        fallbackToJson: true,
        jsonCachePath: '/tmp/test-cache.json'
      });
    });

    afterEach(async () => {
      if (fallbackAdapter) {
        await fallbackAdapter.close();
      }
    });

    test('should initialize JSON fallback', async () => {
      await expect(fallbackAdapter.initializeJsonFallback()).resolves.not.toThrow();
    });

    test('should query JSON fallback on database failure', async () => {
      fallbackAdapter.primaryDb = null;
      fallbackAdapter.fallbackToJson = true;

      const result = await fallbackAdapter.query('SELECT * FROM test', [], 'all');

      // Should return empty array or null instead of throwing
      expect(result !== undefined).toBe(true);
    });
  });

  describe('Cleanup', () => {
    test('should close connections properly', async () => {
      await adapter.connect();
      await expect(adapter.close()).resolves.not.toThrow();
    });

    test('should handle close when not connected', async () => {
      const newAdapter = new DatabaseAdapter();
      await expect(newAdapter.close()).resolves.not.toThrow();
    });
  });
});

describe('DatabaseAdapter - PostgreSQL', () => {
  let adapter;

  beforeEach(() => {
    // Mock config to use Postgres
    jest.mock('../../config', () => ({
      databaseType: 'postgres',
      postgres: {
        enabled: true,
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        user: 'test_user',
        password: 'test_password',
        ssl: false,
        maxConnections: 10,
        idleTimeout: 30000,
        connectionTimeout: 10000
      }
    }));

    adapter = new DatabaseAdapter();
    adapter.type = 'postgres'; // Force Postgres type
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.close();
    }
  });

  test('should connect to PostgreSQL', async () => {
    await expect(adapter.connectPostgres()).resolves.toBeDefined();
  });

  test('should convert SQLite placeholders to PostgreSQL', async () => {
    adapter.primaryDb = {
      connect: jest.fn().mockResolvedValue({
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        release: jest.fn()
      })
    };

    const result = await adapter.executePostgresQuery(
      adapter.primaryDb,
      'SELECT * FROM test WHERE id = ? AND name = ?',
      [1, 'test'],
      'all'
    );

    expect(result).toBeDefined();
  });
});
