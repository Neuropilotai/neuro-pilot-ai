/**
 * GFS Order Watcher Configuration
 * NeuroPilot AI Enterprise v22.3
 *
 * Configuration for the GFS order watcher background worker.
 * All settings can be overridden via environment variables.
 *
 * @version 22.3
 * @author NeuroPilot AI Team
 */

const path = require('path');

/**
 * Parse boolean environment variable
 */
function parseBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  return value === 'true' || value === '1';
}

/**
 * Parse integer environment variable
 */
function parseInt(value, defaultValue = 0) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const parsed = Number.parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

module.exports = {
  /**
   * Enable/disable the watcher
   * Set to false to prevent the watcher from starting
   */
  enabled: parseBool(process.env.GFS_WATCHER_ENABLED, false),

  /**
   * Cron schedule for polling
   * Default: Every 15 minutes
   * Format: minute hour day-of-month month day-of-week
   */
  schedule: process.env.GFS_WATCHER_SCHEDULE || '*/15 * * * *',

  /**
   * Run immediately on server start
   * Useful for catching up after deployments
   */
  runOnStart: parseBool(process.env.GFS_WATCHER_RUN_ON_START, false),

  /**
   * Google Drive folder ID for incoming GFS orders (inbox)
   * PDFs in this folder will be processed
   */
  inboxFolderId: process.env.GFS_INBOX_FOLDER_ID || '',

  /**
   * Google Drive folder ID for processed orders
   * PDFs are moved here after successful processing
   */
  processedFolderId: process.env.GFS_PROCESSED_FOLDER_ID || '',

  /**
   * Whether to move files after processing
   * If false, files stay in inbox (relies on dedup to skip)
   */
  moveAfterProcessing: parseBool(process.env.GFS_MOVE_AFTER_PROCESSING, true),

  /**
   * Organization ID for created orders
   */
  orgId: process.env.GFS_WATCHER_ORG_ID || 'default-org',

  /**
   * Temporary directory for downloaded PDFs
   * Should be writable by the Node process
   */
  tempDirectory: process.env.GFS_TEMP_DIR || path.join('/tmp', 'gfs-orders'),

  /**
   * Delay between processing files (ms)
   * Helps avoid rate limits and reduces system load
   */
  delayBetweenFiles: parseInt(process.env.GFS_DELAY_BETWEEN_FILES, 1000),

  /**
   * Maximum files to process per cycle
   * 0 = unlimited
   */
  maxFilesPerCycle: parseInt(process.env.GFS_MAX_FILES_PER_CYCLE, 0),

  /**
   * Retry configuration
   */
  retry: {
    maxAttempts: parseInt(process.env.GFS_RETRY_MAX_ATTEMPTS, 3),
    delayMs: parseInt(process.env.GFS_RETRY_DELAY_MS, 5000)
  },

  /**
   * Logging configuration
   */
  logging: {
    verbose: parseBool(process.env.GFS_WATCHER_VERBOSE, false),
    logBreadcrumbs: parseBool(process.env.GFS_LOG_BREADCRUMBS, true)
  }
};
