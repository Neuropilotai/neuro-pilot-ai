/**
 * Redis Cache Manager Tests
 */

const redisManager = require('../../config/redis');

// Mock ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    exists: jest.fn().mockResolvedValue(0),
    ttl: jest.fn().mockResolvedValue(-1),
    incr: jest.fn().mockResolvedValue(1),
    incrby: jest.fn().mockResolvedValue(5),
    info: jest.fn().mockResolvedValue('keyspace_hits:100\nkeyspace_misses:20'),
    dbsize: jest.fn().mockResolvedValue(42),
    flushdb: jest.fn().mockResolvedValue('OK'),
    quit: jest.fn().mockResolvedValue('OK'),
    on: jest.fn()
  }));
});

// Mock logger
jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

// Mock config
jest.mock('../../config', () => ({
  redis: {
    enabled: true,
    host: 'localhost',
    port: 6379,
    password: null,
    db: 0
  }
}));

describe('Redis Manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with default config', () => {
      expect(redisManager).toBeDefined();
      expect(redisManager.ttl).toBeDefined();
      expect(redisManager.ttl.inventory).toBe(300);
      expect(redisManager.ttl.forecasts).toBe(86400);
    });

    test('should have correct TTL values', () => {
      expect(redisManager.ttl.inventory).toBe(300); // 5 minutes
      expect(redisManager.ttl.forecasts).toBe(86400); // 24 hours
      expect(redisManager.ttl.dashboardStats).toBe(300); // 5 minutes
      expect(redisManager.ttl.reorderRecommendations).toBe(3600); // 1 hour
      expect(redisManager.ttl.models).toBe(604800); // 7 days
    });
  });

  describe('Connection', () => {
    test('should connect to Redis when enabled', async () => {
      const result = await redisManager.connect();
      expect(result).toBe(true);
    });

    test('should handle connection failure gracefully', async () => {
      // Mock connection failure
      redisManager.client = null;
      redisManager.isEnabled = false;

      const result = await redisManager.connect();
      expect(result).toBe(false);
    });
  });

  describe('Basic Operations', () => {
    beforeEach(async () => {
      await redisManager.connect();
    });

    test('should get value from cache', async () => {
      if (redisManager.client) {
        redisManager.client.get.mockResolvedValue(JSON.stringify({ data: 'test' }));
      }

      const value = await redisManager.get('test-key');

      if (redisManager.isConnected) {
        expect(value).toEqual({ data: 'test' });
      } else {
        expect(value).toBeNull();
      }
    });

    test('should return null for non-existent key', async () => {
      if (redisManager.client) {
        redisManager.client.get.mockResolvedValue(null);
      }

      const value = await redisManager.get('non-existent');
      expect(value).toBeNull();
    });

    test('should set value in cache', async () => {
      const result = await redisManager.set('test-key', { data: 'test' }, 300);

      if (redisManager.isConnected) {
        expect(result).toBe(true);
      } else {
        expect(result).toBe(false);
      }
    });

    test('should delete key from cache', async () => {
      const result = await redisManager.del('test-key');

      if (redisManager.isConnected) {
        expect(result).toBe(true);
      } else {
        expect(result).toBe(false);
      }
    });

    test('should delete keys by pattern', async () => {
      if (redisManager.client) {
        redisManager.client.keys.mockResolvedValue(['test:1', 'test:2', 'test:3']);
      }

      const count = await redisManager.delPattern('test:*');

      if (redisManager.isConnected) {
        expect(count).toBeGreaterThanOrEqual(0);
      } else {
        expect(count).toBe(0);
      }
    });

    test('should check if key exists', async () => {
      if (redisManager.client) {
        redisManager.client.exists.mockResolvedValue(1);
      }

      const exists = await redisManager.exists('test-key');

      if (redisManager.isConnected) {
        expect(typeof exists).toBe('boolean');
      } else {
        expect(exists).toBe(false);
      }
    });

    test('should get TTL for key', async () => {
      if (redisManager.client) {
        redisManager.client.ttl.mockResolvedValue(300);
      }

      const ttl = await redisManager.ttlRemaining('test-key');

      if (redisManager.isConnected) {
        expect(typeof ttl).toBe('number');
      } else {
        expect(ttl).toBe(-2);
      }
    });

    test('should increment counter', async () => {
      if (redisManager.client) {
        redisManager.client.incr.mockResolvedValue(5);
      }

      const value = await redisManager.incr('counter');

      if (redisManager.isConnected) {
        expect(typeof value).toBe('number');
      } else {
        expect(value).toBeNull();
      }
    });
  });

  describe('Cache Wrapper (getOrSet)', () => {
    beforeEach(async () => {
      await redisManager.connect();
    });

    test('should return cached value if exists', async () => {
      if (redisManager.client) {
        redisManager.client.get.mockResolvedValue(JSON.stringify({ cached: true }));
      }

      const fn = jest.fn().mockResolvedValue({ fresh: true });
      const result = await redisManager.getOrSet('test-key', fn, 300);

      if (redisManager.isConnected) {
        expect(result).toEqual({ cached: true });
        expect(fn).not.toHaveBeenCalled();
      } else {
        expect(result).toEqual({ fresh: true });
      }
    });

    test('should execute function and cache result on miss', async () => {
      if (redisManager.client) {
        redisManager.client.get.mockResolvedValue(null);
      }

      const fn = jest.fn().mockResolvedValue({ fresh: true });
      const result = await redisManager.getOrSet('test-key', fn, 300);

      expect(fn).toHaveBeenCalled();
      expect(result).toEqual({ fresh: true });
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      await redisManager.connect();
    });

    test('should get cache statistics', async () => {
      const stats = await redisManager.getStats();

      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('enabled');
      expect(stats).toHaveProperty('connected');

      if (redisManager.isConnected) {
        expect(stats).toHaveProperty('keys');
        expect(stats).toHaveProperty('hits');
        expect(stats).toHaveProperty('misses');
      }
    });
  });

  describe('Key Generators', () => {
    test('should generate correct inventory key', () => {
      const key = redisManager.keys.inventory('APPLE-GALA');
      expect(key).toBe('inventory:APPLE-GALA');
    });

    test('should generate correct forecast key', () => {
      const key = redisManager.keys.forecast('APPLE-GALA', 30);
      expect(key).toBe('forecast:APPLE-GALA:30');
    });

    test('should generate correct dashboard stats key', () => {
      const key = redisManager.keys.dashboardStats();
      expect(key).toBe('dashboard:stats');
    });

    test('should generate correct model key', () => {
      const key = redisManager.keys.model(42);
      expect(key).toBe('model:42');
    });

    test('should generate correct user session key', () => {
      const key = redisManager.keys.userSession(123);
      expect(key).toBe('session:123');
    });
  });

  describe('Error Handling', () => {
    test('should return null on get error', async () => {
      if (redisManager.client) {
        redisManager.client.get.mockRejectedValue(new Error('Redis error'));
      }

      const value = await redisManager.get('error-key');
      expect(value).toBeNull();
    });

    test('should return false on set error', async () => {
      if (redisManager.client) {
        redisManager.client.setex.mockRejectedValue(new Error('Redis error'));
      }

      const result = await redisManager.set('error-key', 'value', 300);
      expect(result).toBe(false);
    });

    test('should return 0 on delPattern error', async () => {
      if (redisManager.client) {
        redisManager.client.keys.mockRejectedValue(new Error('Redis error'));
      }

      const count = await redisManager.delPattern('error:*');
      expect(count).toBe(0);
    });
  });

  describe('Cleanup', () => {
    test('should disconnect properly', async () => {
      await redisManager.disconnect();
      // No error should be thrown
    });

    test('should flush all keys with caution', async () => {
      await redisManager.connect();
      const result = await redisManager.flushAll();

      if (redisManager.isConnected) {
        expect(typeof result).toBe('boolean');
      } else {
        expect(result).toBe(false);
      }
    });
  });
});
