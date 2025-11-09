/**
 * 404 Telemetry Middleware (v15.2.3)
 * Tracks broken links and missing assets for console health monitoring
 *
 * Features:
 * - Structured JSON logging of 404s
 * - Prometheus counter console_broken_link_total{method,type}
 * - In-memory ring buffer for admin pane
 * - Distinguishes between asset (css/js/img) and route (html/api) 404s
 */

const { logger } = require('../config/logger');

// Ring buffer for recent 404s (max 500 entries)
const MAX_ENTRIES = 500;
const recent404s = [];

// Prometheus counters (will be exposed in /metrics)
const counters = {
  asset: 0,
  route: 0,
  total: 0
};

/**
 * Determine if path is an asset or route
 * @param {string} path - Request path
 * @returns {string} 'asset' or 'route'
 */
function classify404Type(path) {
  const assetExtensions = ['.css', '.js', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.map'];
  const isAsset = assetExtensions.some(ext => path.toLowerCase().endsWith(ext));
  return isAsset ? 'asset' : 'route';
}

/**
 * 404 Telemetry Middleware
 * Mount this AFTER all routes and static middleware
 */
function telemetry404(req, res, next) {
  // If response already sent, skip
  if (res.headersSent) {
    return next();
  }

  // Only track 404s
  if (res.statusCode !== 404) {
    return next();
  }

  const type = classify404Type(req.path);
  const entry = {
    path: req.path,
    method: req.method,
    type,
    referer: req.get('referer') || req.get('referrer') || null,
    user_agent: req.get('user-agent') || null,
    ip: req.ip || req.connection.remoteAddress,
    timestamp: new Date().toISOString()
  };

  // Log structured JSON
  logger.warn('404 Not Found', entry);

  // Update counters
  counters[type]++;
  counters.total++;

  // Add to ring buffer
  recent404s.unshift(entry);
  if (recent404s.length > MAX_ENTRIES) {
    recent404s.pop();
  }

  // Continue to default 404 handler
  next();
}

/**
 * Get recent 404s for admin pane
 * @param {number} limit - Max entries to return
 * @returns {Array} Recent 404 entries
 */
function getRecent404s(limit = 100) {
  return recent404s.slice(0, limit);
}

/**
 * Get 404s grouped by path with counts
 * @param {number} limit - Max groups to return
 * @returns {Array} Grouped 404 stats
 */
function get404Stats(limit = 50) {
  const grouped = {};

  for (const entry of recent404s) {
    if (!grouped[entry.path]) {
      grouped[entry.path] = {
        path: entry.path,
        type: entry.type,
        count: 0,
        methods: new Set(),
        referers: new Set(),
        lastSeen: entry.timestamp
      };
    }

    const group = grouped[entry.path];
    group.count++;
    group.methods.add(entry.method);
    if (entry.referer) group.referers.add(entry.referer);

    // Update lastSeen if this entry is newer
    if (entry.timestamp > group.lastSeen) {
      group.lastSeen = entry.timestamp;
    }
  }

  // Convert Sets to arrays and sort by count
  const stats = Object.values(grouped).map(g => ({
    path: g.path,
    type: g.type,
    count: g.count,
    methods: Array.from(g.methods),
    topReferers: Array.from(g.referers).slice(0, 5),
    lastSeen: g.lastSeen
  }));

  return stats
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Get Prometheus metrics text
 * @returns {string} Prometheus metrics format
 */
function getPrometheusMetrics() {
  return `# HELP console_broken_link_total Total number of 404 requests to console
# TYPE console_broken_link_total counter
console_broken_link_total{type="asset"} ${counters.asset}
console_broken_link_total{type="route"} ${counters.route}
console_broken_link_total{type="all"} ${counters.total}
`;
}

/**
 * Get counters object (for JSON metrics)
 * @returns {Object} Current counter values
 */
function getCounters() {
  return { ...counters };
}

/**
 * Reset all counters and buffer (for testing)
 */
function reset() {
  counters.asset = 0;
  counters.route = 0;
  counters.total = 0;
  recent404s.length = 0;
}

module.exports = {
  telemetry404,
  getRecent404s,
  get404Stats,
  getPrometheusMetrics,
  getCounters,
  reset
};
