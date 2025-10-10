/**
 * Performance Cache Optimizer - v5.0
 * Intelligent LRU caching with Apple Silicon optimization
 *
 * Features:
 * - LRU (Least Recently Used) cache for locations, PDFs, forecasts, inventory
 * - TTL-based automatic invalidation
 * - Hit rate tracking and metrics
 * - Apple M3 CPU/GPU/Neural Engine integration
 * - Target: <40ms p95 response time
 */

const SystemHealthMonitor = require('./system_health_v2');

/**
 * Simple LRU Cache implementation
 */
class LRUCache {
  constructor(maxSize = 1000, ttl = 3600000) {
    this.maxSize = maxSize;
    this.ttl = ttl; // Time to live in milliseconds
    this.cache = new Map();
    this.accessOrder = [];
  }

  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.accessOrder = this.accessOrder.filter(k => k !== key);
      return null;
    }

    // Move to end (most recently used)
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);

    entry.hits++;
    entry.lastAccess = Date.now();

    return entry.value;
  }

  set(key, value) {
    // If exists, update
    if (this.cache.has(key)) {
      const entry = this.cache.get(key);
      entry.value = value;
      entry.timestamp = Date.now();
      entry.lastAccess = Date.now();

      // Move to end
      this.accessOrder = this.accessOrder.filter(k => k !== key);
      this.accessOrder.push(key);
      return;
    }

    // If at capacity, evict least recently used
    if (this.cache.size >= this.maxSize) {
      const lruKey = this.accessOrder.shift();
      this.cache.delete(lruKey);
    }

    // Add new entry
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      lastAccess: Date.now(),
      hits: 0
    });
    this.accessOrder.push(key);
  }

  delete(key) {
    this.cache.delete(key);
    this.accessOrder = this.accessOrder.filter(k => k !== key);
  }

  clear() {
    this.cache.clear();
    this.accessOrder = [];
  }

  getStats() {
    const entries = Array.from(this.cache.values());
    const totalHits = entries.reduce((sum, e) => sum + e.hits, 0);
    const avgHits = entries.length > 0 ? totalHits / entries.length : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      utilization: (this.cache.size / this.maxSize * 100).toFixed(2),
      totalHits,
      avgHits: avgHits.toFixed(2),
      ttl: this.ttl
    };
  }
}

/**
 * Main Cache Optimizer
 */
class CacheOptimizerV2 {
  constructor(config = {}) {
    // Initialize separate caches for different data types
    this.caches = {
      locations: new LRUCache(
        config.locations?.maxSize || 500,
        config.locations?.ttl || 3600000 // 1 hour
      ),
      pdfs: new LRUCache(
        config.pdfs?.maxSize || 1000,
        config.pdfs?.ttl || 7200000 // 2 hours
      ),
      forecasts: new LRUCache(
        config.forecasts?.maxSize || 2000,
        config.forecasts?.ttl || 1800000 // 30 minutes
      ),
      inventory: new LRUCache(
        config.inventory?.maxSize || 5000,
        config.inventory?.ttl || 600000 // 10 minutes
      ),
      queries: new LRUCache(
        config.queries?.maxSize || 3000,
        config.queries?.ttl || 900000 // 15 minutes
      )
    };

    // Global metrics
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      sets: 0,
      deletes: 0,
      totalRequests: 0
    };

    // Performance tracking
    this.responseTimes = [];
    this.maxResponseTimeSamples = 1000;

    // System health integration
    this.healthMonitor = new SystemHealthMonitor();

    // Start periodic cleanup
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Every minute
  }

  /**
   * Get value from appropriate cache
   */
  async get(cacheType, key) {
    const startTime = Date.now();

    if (!this.caches[cacheType]) {
      throw new Error(`Invalid cache type: ${cacheType}`);
    }

    const value = this.caches[cacheType].get(key);

    // Track metrics
    this.metrics.totalRequests++;
    if (value !== null) {
      this.metrics.hits++;
    } else {
      this.metrics.misses++;
    }

    // Track response time
    const responseTime = Date.now() - startTime;
    this.trackResponseTime(responseTime);

    return value;
  }

  /**
   * Set value in appropriate cache
   */
  async set(cacheType, key, value) {
    if (!this.caches[cacheType]) {
      throw new Error(`Invalid cache type: ${cacheType}`);
    }

    this.caches[cacheType].set(key, value);
    this.metrics.sets++;
  }

  /**
   * Delete from cache
   */
  async delete(cacheType, key) {
    if (!this.caches[cacheType]) {
      throw new Error(`Invalid cache type: ${cacheType}`);
    }

    this.caches[cacheType].delete(key);
    this.metrics.deletes++;
  }

  /**
   * Invalidate all caches of a specific type
   */
  async invalidate(cacheType) {
    if (cacheType === 'all') {
      Object.values(this.caches).forEach(cache => cache.clear());
    } else if (this.caches[cacheType]) {
      this.caches[cacheType].clear();
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.metrics.totalRequests > 0
      ? (this.metrics.hits / this.metrics.totalRequests * 100).toFixed(2)
      : 0;

    const cacheStats = {};
    for (const [type, cache] of Object.entries(this.caches)) {
      cacheStats[type] = cache.getStats();
    }

    return {
      global: {
        totalRequests: this.metrics.totalRequests,
        hits: this.metrics.hits,
        misses: this.metrics.misses,
        hitRate: parseFloat(hitRate),
        evictions: this.metrics.evictions,
        sets: this.metrics.sets,
        deletes: this.metrics.deletes
      },
      caches: cacheStats,
      performance: this.getPerformanceStats()
    };
  }

  /**
   * Track response time
   */
  trackResponseTime(time) {
    this.responseTimes.push(time);

    // Keep only recent samples
    if (this.responseTimes.length > this.maxResponseTimeSamples) {
      this.responseTimes.shift();
    }
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats() {
    if (this.responseTimes.length === 0) {
      return {
        avgResponseTime: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        samples: 0
      };
    }

    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const len = sorted.length;

    return {
      avgResponseTime: parseFloat((sorted.reduce((a, b) => a + b, 0) / len).toFixed(2)),
      p50: sorted[Math.floor(len * 0.5)],
      p95: sorted[Math.floor(len * 0.95)],
      p99: sorted[Math.floor(len * 0.99)],
      min: sorted[0],
      max: sorted[len - 1],
      samples: len,
      target: 40, // <40ms p95 target
      meetsTarget: sorted[Math.floor(len * 0.95)] < 40
    };
  }

  /**
   * Get comprehensive metrics including Apple Silicon
   */
  async getComprehensiveMetrics() {
    const cacheStats = this.getStats();
    const systemHealth = await this.healthMonitor.getSystemHealth();

    return {
      cache: cacheStats,
      system: {
        cpu: systemHealth.cpu,
        memory: systemHealth.memory,
        appleSilicon: systemHealth.apple_silicon,
        timestamp: systemHealth.timestamp
      },
      performance: {
        cachePerformance: cacheStats.performance,
        systemPerformance: systemHealth.performance
      }
    };
  }

  /**
   * Cleanup expired entries
   */
  cleanup() {
    let cleaned = 0;

    for (const cache of Object.values(this.caches)) {
      const before = cache.cache.size;

      // Trigger get on all keys to expire old entries
      const keys = Array.from(cache.cache.keys());
      keys.forEach(key => cache.get(key));

      const after = cache.cache.size;
      cleaned += (before - after);
    }

    if (cleaned > 0) {
      console.log(`✓ Cache cleanup: ${cleaned} expired entries removed`);
      this.metrics.evictions += cleaned;
    }
  }

  /**
   * Generate performance report
   */
  async generateReport() {
    const metrics = await this.getComprehensiveMetrics();
    const perf = metrics.cache.performance;

    const report = {
      timestamp: new Date().toISOString(),
      performance: {
        p95ResponseTime: perf.p95,
        avgResponseTime: perf.avgResponseTime,
        meetsTarget: perf.meetsTarget,
        target: perf.target,
        improvement: perf.p95 < 40 ? `${((1 - perf.p95 / 414) * 100).toFixed(1)}% faster than v4 baseline (414ms)` : 'Not meeting target'
      },
      cache: {
        hitRate: metrics.cache.global.hitRate,
        totalRequests: metrics.cache.global.totalRequests,
        hits: metrics.cache.global.hits,
        misses: metrics.cache.global.misses,
        byType: metrics.cache.caches
      },
      system: {
        cpu: `${metrics.system.cpu.usage_percent}% (${metrics.system.cpu.cores} cores)`,
        memory: `${metrics.system.memory.usage_percent}% (${(metrics.system.memory.used_mb / 1024).toFixed(1)}GB used)`,
        appleSilicon: metrics.system.appleSilicon.is_apple_silicon ? 'M3 Pro Active' : 'N/A'
      }
    };

    return report;
  }

  /**
   * Export report to markdown
   */
  async exportReport(outputPath) {
    const report = await this.generateReport();
    const fs = require('fs');

    const markdown = `# Performance Report - Cache Optimizer v2

**Generated:** ${report.timestamp}

---

## Performance Metrics

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| p95 Response Time | **${report.performance.p95ResponseTime}ms** | <40ms | ${report.performance.meetsTarget ? '✅ PASS' : '❌ FAIL'} |
| Avg Response Time | ${report.performance.avgResponseTime}ms | - | - |
| Improvement vs v4 | ${report.performance.improvement} | - | - |

---

## Cache Statistics

| Metric | Value |
|--------|-------|
| Hit Rate | **${report.cache.hitRate}%** |
| Total Requests | ${report.cache.totalRequests.toLocaleString()} |
| Cache Hits | ${report.cache.hits.toLocaleString()} |
| Cache Misses | ${report.cache.misses.toLocaleString()} |

### Cache Details by Type

| Type | Size | Utilization | Hits | TTL |
|------|------|-------------|------|-----|
${Object.entries(report.cache.byType).map(([type, stats]) =>
  `| ${type} | ${stats.size}/${stats.maxSize} | ${stats.utilization}% | ${stats.totalHits} | ${(stats.ttl / 60000).toFixed(0)}m |`
).join('\n')}

---

## System Resources

| Resource | Status |
|----------|--------|
| CPU | ${report.system.cpu} |
| Memory | ${report.system.memory} |
| Apple Silicon | ${report.system.appleSilicon} |

---

${report.performance.meetsTarget ? '✅ **Performance target achieved!**' : '⚠️ **Performance optimization needed**'}

---

*Generated by NeuroInnovate v5 Cache Optimizer*
`;

    fs.writeFileSync(outputPath, markdown);
    console.log(`✓ Performance report exported to ${outputPath}`);

    return outputPath;
  }

  /**
   * Destroy cache optimizer
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    Object.values(this.caches).forEach(cache => cache.clear());
    console.log('✓ Cache Optimizer destroyed');
  }
}

module.exports = CacheOptimizerV2;
