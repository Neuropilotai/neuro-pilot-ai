/**
 * Owner Command Center Metrics
 * Prometheus counters and histograms for OCC
 */

class OCCMetrics {
  constructor() {
    this.counters = {
      routeErrors: new Map(),
      countsStarted: 0,
      pdfsAttached: 0,
      ownerAccessGranted: 0,
      ownerAccessDenied: new Map()
    };

    this.histograms = {
      routeLatency: [],
      countStepLatency: []
    };
  }

  recordOCCRouteError(labels = {}) {
    const key = labels.route || 'unknown';
    this.counters.routeErrors.set(key, (this.counters.routeErrors.get(key) || 0) + 1);
  }

  recordOCCCountsStarted() {
    this.counters.countsStarted++;
  }

  recordOCCPDFsAttached() {
    this.counters.pdfsAttached++;
  }

  recordOwnerAccessGranted() {
    this.counters.ownerAccessGranted++;
  }

  recordOwnerAccessDenied(reason) {
    this.counters.ownerAccessDenied.set(reason, (this.counters.ownerAccessDenied.get(reason) || 0) + 1);
  }

  recordOCCRouteLatency(duration, labels = {}) {
    this.histograms.routeLatency.push({ duration, labels, timestamp: Date.now() });
    // Keep last 1000 measurements
    if (this.histograms.routeLatency.length > 1000) {
      this.histograms.routeLatency.shift();
    }
  }

  recordOCCCountStepLatency(duration, labels = {}) {
    this.histograms.countStepLatency.push({ duration, labels, timestamp: Date.now() });
    if (this.histograms.countStepLatency.length > 1000) {
      this.histograms.countStepLatency.shift();
    }
  }

  getPrometheusMetrics() {
    let output = '';

    // Counter: route errors
    output += '# HELP owner_occ_route_errors_total Total OCC route errors\n';
    output += '# TYPE owner_occ_route_errors_total counter\n';
    for (const [route, count] of this.counters.routeErrors) {
      output += `owner_occ_route_errors_total{route="${route}"} ${count}\n`;
    }

    // Counter: counts started
    output += '# HELP owner_occ_counts_started_total Total inventory counts started\n';
    output += '# TYPE owner_occ_counts_started_total counter\n';
    output += `owner_occ_counts_started_total ${this.counters.countsStarted}\n`;

    // Counter: PDFs attached
    output += '# HELP owner_occ_pdfs_attached_total Total PDFs attached to counts\n';
    output += '# TYPE owner_occ_pdfs_attached_total counter\n';
    output += `owner_occ_pdfs_attached_total ${this.counters.pdfsAttached}\n`;

    // Histogram: route latency
    const routeP95 = this.calculateP95(this.histograms.routeLatency.map(m => m.duration));
    output += '# HELP owner_occ_route_latency_seconds OCC route latency\n';
    output += '# TYPE owner_occ_route_latency_seconds histogram\n';
    output += `owner_occ_route_latency_seconds{quantile="0.95"} ${routeP95.toFixed(3)}\n`;

    // Histogram: count step latency
    const stepP95 = this.calculateP95(this.histograms.countStepLatency.map(m => m.duration));
    output += '# HELP owner_occ_count_step_latency_seconds OCC count step latency\n';
    output += '# TYPE owner_occ_count_step_latency_seconds histogram\n';
    output += `owner_occ_count_step_latency_seconds{quantile="0.95"} ${stepP95.toFixed(3)}\n`;

    return output;
  }

  calculateP95(values) {
    if (!values || values.length === 0) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.floor(sorted.length * 0.95);
    return sorted[index] || 0;
  }
}

module.exports = new OCCMetrics();
