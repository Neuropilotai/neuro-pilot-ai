/**
 * Redis Statistics Collector - v2.8.0
 * Polls Redis INFO at regular intervals for metrics
 */

const promClient = require('prom-client');

class RedisStatsCollector {
  constructor(redisClient, metricsRegistry) {
    this.redisClient = redisClient;
    this.register = metricsRegistry;
    this.enabled = process.env.REDIS_METRICS_ENABLED !== 'false';
    this.interval = parseInt(process.env.REDIS_METRICS_INTERVAL_MS) || 10000; // 10 seconds
    this.intervalId = null;

    if (this.enabled && this.redisClient) {
      this.initializeMetrics();
      this.start();
    }

    console.log(`Redis Stats Collector: ${this.enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Initialize Redis-specific metrics
   */
  initializeMetrics() {
    // Redis connection status
    this.redisUp = new promClient.Gauge({
      name: 'redis_up',
      help: 'Redis server availability (1 = up, 0 = down)',
      registers: [this.register]
    });

    // Redis latency
    this.redisLatencyMs = new promClient.Gauge({
      name: 'redis_latency_ms',
      help: 'Redis ping latency in milliseconds',
      registers: [this.register]
    });

    // Operations per second
    this.redisOpsPerSec = new promClient.Gauge({
      name: 'redis_ops_per_sec',
      help: 'Redis operations per second',
      registers: [this.register]
    });

    // Cache hit rate
    this.redisHitRate = new promClient.Gauge({
      name: 'redis_hit_rate',
      help: 'Redis cache hit rate (0-1)',
      registers: [this.register]
    });

    // Memory usage
    this.redisMemoryUsedBytes = new promClient.Gauge({
      name: 'redis_memory_used_bytes',
      help: 'Redis memory usage in bytes',
      registers: [this.register]
    });

    this.redisMemoryPeakBytes = new promClient.Gauge({
      name: 'redis_memory_peak_bytes',
      help: 'Redis peak memory usage in bytes',
      registers: [this.register]
    });

    // Keyspace
    this.redisKeys = new promClient.Gauge({
      name: 'redis_keys_total',
      help: 'Total number of keys in Redis',
      labelNames: ['db'],
      registers: [this.register]
    });

    // Connected clients
    this.redisConnectedClients = new promClient.Gauge({
      name: 'redis_connected_clients',
      help: 'Number of connected Redis clients',
      registers: [this.register]
    });

    // Evicted keys
    this.redisEvictedKeys = new promClient.Counter({
      name: 'redis_evicted_keys_total',
      help: 'Total number of evicted keys',
      registers: [this.register]
    });

    // Expired keys
    this.redisExpiredKeys = new promClient.Counter({
      name: 'redis_expired_keys_total',
      help: 'Total number of expired keys',
      registers: [this.register]
    });

    // Commands processed
    this.redisCommandsProcessed = new promClient.Counter({
      name: 'redis_commands_processed_total',
      help: 'Total number of commands processed',
      registers: [this.register]
    });

    // Network I/O
    this.redisNetInputBytes = new promClient.Counter({
      name: 'redis_net_input_bytes_total',
      help: 'Total bytes received',
      registers: [this.register]
    });

    this.redisNetOutputBytes = new promClient.Counter({
      name: 'redis_net_output_bytes_total',
      help: 'Total bytes sent',
      registers: [this.register]
    });

    console.log('✓ Redis metrics initialized');
  }

  /**
   * Start collecting stats
   */
  start() {
    if (!this.enabled || !this.redisClient) {
      return;
    }

    console.log(`Starting Redis stats collection (interval: ${this.interval}ms)`);

    this.intervalId = setInterval(async () => {
      await this.collectStats();
    }, this.interval);

    // Collect immediately on start
    this.collectStats();
  }

  /**
   * Stop collecting stats
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Redis stats collection stopped');
    }
  }

  /**
   * Collect Redis statistics
   */
  async collectStats() {
    try {
      const startTime = Date.now();

      // Check if Redis is available
      await this.redisClient.ping();
      this.redisUp.set(1);

      // Measure latency
      const latency = Date.now() - startTime;
      this.redisLatencyMs.set(latency);

      // Get Redis INFO
      const info = await this.getRedisInfo();

      if (info) {
        this.updateMetrics(info);
      }

    } catch (error) {
      console.error('Redis stats collection error:', error);
      this.redisUp.set(0);
    }
  }

  /**
   * Get Redis INFO command output
   */
  async getRedisInfo() {
    try {
      const infoStr = await this.redisClient.info();
      return this.parseInfo(infoStr);
    } catch (error) {
      console.error('Failed to get Redis INFO:', error);
      return null;
    }
  }

  /**
   * Parse Redis INFO output
   */
  parseInfo(infoStr) {
    const info = {};
    const sections = infoStr.split('\r\n\r\n');

    sections.forEach(section => {
      const lines = section.split('\r\n');
      lines.forEach(line => {
        if (line && !line.startsWith('#') && line.includes(':')) {
          const [key, value] = line.split(':');
          info[key.trim()] = value.trim();
        }
      });
    });

    return info;
  }

  /**
   * Update Prometheus metrics from Redis INFO
   */
  updateMetrics(info) {
    try {
      // Memory metrics
      if (info.used_memory) {
        this.redisMemoryUsedBytes.set(parseInt(info.used_memory));
      }

      if (info.used_memory_peak) {
        this.redisMemoryPeakBytes.set(parseInt(info.used_memory_peak));
      }

      // Connected clients
      if (info.connected_clients) {
        this.redisConnectedClients.set(parseInt(info.connected_clients));
      }

      // Commands processed
      if (info.total_commands_processed) {
        this.redisCommandsProcessed.inc(
          parseInt(info.total_commands_processed) - (this.lastCommandsProcessed || 0)
        );
        this.lastCommandsProcessed = parseInt(info.total_commands_processed);
      }

      // Operations per second
      if (info.instantaneous_ops_per_sec) {
        this.redisOpsPerSec.set(parseInt(info.instantaneous_ops_per_sec));
      }

      // Evicted keys
      if (info.evicted_keys) {
        const currentEvicted = parseInt(info.evicted_keys);
        if (this.lastEvicted !== undefined && currentEvicted > this.lastEvicted) {
          this.redisEvictedKeys.inc(currentEvicted - this.lastEvicted);
        }
        this.lastEvicted = currentEvicted;
      }

      // Expired keys
      if (info.expired_keys) {
        const currentExpired = parseInt(info.expired_keys);
        if (this.lastExpired !== undefined && currentExpired > this.lastExpired) {
          this.redisExpiredKeys.inc(currentExpired - this.lastExpired);
        }
        this.lastExpired = currentExpired;
      }

      // Network I/O
      if (info.total_net_input_bytes) {
        const currentInput = parseInt(info.total_net_input_bytes);
        if (this.lastNetInput !== undefined && currentInput > this.lastNetInput) {
          this.redisNetInputBytes.inc(currentInput - this.lastNetInput);
        }
        this.lastNetInput = currentInput;
      }

      if (info.total_net_output_bytes) {
        const currentOutput = parseInt(info.total_net_output_bytes);
        if (this.lastNetOutput !== undefined && currentOutput > this.lastNetOutput) {
          this.redisNetOutputBytes.inc(currentOutput - this.lastNetOutput);
        }
        this.lastNetOutput = currentOutput;
      }

      // Cache hit rate
      const hits = parseInt(info.keyspace_hits || 0);
      const misses = parseInt(info.keyspace_misses || 0);
      const total = hits + misses;

      if (total > 0) {
        const hitRate = hits / total;
        this.redisHitRate.set(hitRate);
      }

      // Keyspace (keys by database)
      for (let i = 0; i < 16; i++) {
        const dbKey = `db${i}`;
        if (info[dbKey]) {
          // Parse "keys=1234,expires=56,avg_ttl=7890"
          const match = info[dbKey].match(/keys=(\d+)/);
          if (match) {
            this.redisKeys.set({ db: dbKey }, parseInt(match[1]));
          }
        }
      }

    } catch (error) {
      console.error('Error updating Redis metrics:', error);
    }
  }

  /**
   * Get current stats snapshot
   */
  async getStatsSnapshot() {
    const info = await this.getRedisInfo();

    if (!info) {
      return {
        available: false,
        error: 'Failed to get Redis info'
      };
    }

    const hits = parseInt(info.keyspace_hits || 0);
    const misses = parseInt(info.keyspace_misses || 0);
    const total = hits + misses;
    const hitRate = total > 0 ? (hits / total * 100).toFixed(2) : '0.00';

    return {
      available: true,
      memory: {
        used: parseInt(info.used_memory),
        peak: parseInt(info.used_memory_peak),
        maxmemory: parseInt(info.maxmemory || 0)
      },
      clients: {
        connected: parseInt(info.connected_clients)
      },
      stats: {
        commandsProcessed: parseInt(info.total_commands_processed),
        opsPerSec: parseInt(info.instantaneous_ops_per_sec),
        hitRate: parseFloat(hitRate),
        evictedKeys: parseInt(info.evicted_keys),
        expiredKeys: parseInt(info.expired_keys)
      },
      uptime: parseInt(info.uptime_in_seconds)
    };
  }
}

module.exports = RedisStatsCollector;
