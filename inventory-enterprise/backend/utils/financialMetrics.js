/**
 * Financial Metrics (v15.4.0)
 * Tracks financial import operations and accuracy metrics for Prometheus
 *
 * Metrics:
 * - financial_import_total (counter): Total number of financial imports
 * - financial_export_pdf_total (counter): Total number of PDF exports
 * - financial_export_csv_total (counter): Total number of CSV exports
 * - financial_usage_accuracy_pct (gauge): Current financial accuracy percentage
 */

const { logger } = require('../config/logger');

// Metrics counters
const metrics = {
  importTotal: 0,
  exportPdfTotal: 0,
  exportCsvTotal: 0,
  currentAccuracyPct: null,
  lastImportTimestamp: null,
  lastAccuracyUpdate: null
};

/**
 * Increment financial import counter
 * Call this when a financial PDF import completes successfully
 * @param {number} count - Number of invoices imported (default 1)
 */
function incrementImportTotal(count = 1) {
  metrics.importTotal += count;
  metrics.lastImportTimestamp = Date.now();
  logger.debug(`Financial import counter incremented: ${metrics.importTotal} total imports`);
}

/**
 * Update financial accuracy percentage
 * Call this when financial accuracy is computed
 * @param {number} accuracyPct - Accuracy percentage (0-100)
 */
function updateAccuracyPct(accuracyPct) {
  if (accuracyPct !== null && accuracyPct !== undefined) {
    metrics.currentAccuracyPct = Math.max(0, Math.min(100, accuracyPct));
    metrics.lastAccuracyUpdate = Date.now();
    logger.debug(`Financial accuracy updated: ${metrics.currentAccuracyPct}%`);
  }
}

/**
 * Increment PDF export counter
 * Call this when a financial PDF export completes successfully
 */
function incrementExportPdfTotal() {
  metrics.exportPdfTotal++;
  logger.debug(`Financial PDF export counter incremented: ${metrics.exportPdfTotal} total exports`);
}

/**
 * Increment CSV export counter
 * Call this when a financial CSV export completes successfully
 */
function incrementExportCsvTotal() {
  metrics.exportCsvTotal++;
  logger.debug(`Financial CSV export counter incremented: ${metrics.exportCsvTotal} total exports`);
}

/**
 * Get current metrics as object
 * @returns {object} Current metric values
 */
function getMetrics() {
  return { ...metrics };
}

/**
 * Get Prometheus metrics text
 * @returns {string} Prometheus metrics format
 */
function getPrometheusMetrics() {
  const lines = [];

  // financial_import_total counter
  lines.push('# HELP financial_import_total Total number of financial PDF imports completed');
  lines.push('# TYPE financial_import_total counter');
  lines.push(`financial_import_total ${metrics.importTotal}`);

  // financial_export_pdf_total counter
  lines.push('# HELP financial_export_pdf_total Total number of PDF exports generated');
  lines.push('# TYPE financial_export_pdf_total counter');
  lines.push(`financial_export_pdf_total ${metrics.exportPdfTotal}`);

  // financial_export_csv_total counter
  lines.push('# HELP financial_export_csv_total Total number of CSV exports generated');
  lines.push('# TYPE financial_export_csv_total counter');
  lines.push(`financial_export_csv_total ${metrics.exportCsvTotal}`);

  // financial_usage_accuracy_pct gauge
  lines.push('# HELP financial_usage_accuracy_pct Current financial accuracy percentage (0-100)');
  lines.push('# TYPE financial_usage_accuracy_pct gauge');
  if (metrics.currentAccuracyPct !== null && metrics.currentAccuracyPct !== undefined) {
    lines.push(`financial_usage_accuracy_pct ${metrics.currentAccuracyPct.toFixed(1)}`);
  } else {
    // Default to 0 if no accuracy computed yet
    lines.push('financial_usage_accuracy_pct 0.0');
  }

  return lines.join('\n') + '\n';
}

/**
 * Reset all metrics (for testing)
 */
function reset() {
  metrics.importTotal = 0;
  metrics.exportPdfTotal = 0;
  metrics.exportCsvTotal = 0;
  metrics.currentAccuracyPct = null;
  metrics.lastImportTimestamp = null;
  metrics.lastAccuracyUpdate = null;
}

module.exports = {
  incrementImportTotal,
  incrementExportPdfTotal,
  incrementExportCsvTotal,
  updateAccuracyPct,
  getMetrics,
  getPrometheusMetrics,
  reset
};
