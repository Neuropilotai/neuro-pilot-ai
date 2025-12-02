/**
 * Worker Initialization
 * NeuroPilot AI Enterprise v22.3
 *
 * Initializes and starts background workers on server startup.
 * Called from server.js after the main server is listening.
 *
 * @version 22.3
 * @author NeuroPilot AI Team
 */

/**
 * Initialize all background workers
 *
 * This function is designed to be called after the Express server
 * is listening and the database connection is established.
 *
 * Workers are started with error handling so that failures
 * don't prevent the main server from running.
 */
async function initWorkers() {
  console.log('[initWorkers] Starting background workers...');

  const workers = {
    gfsOrderWatcher: null
  };

  // Initialize GFS Order Watcher
  try {
    const gfsOrderWatcher = require('../workers/gfs-order-watcher');
    gfsOrderWatcher.start();
    workers.gfsOrderWatcher = gfsOrderWatcher;
    console.log('[initWorkers] GFS Order Watcher initialized');
  } catch (error) {
    console.warn('[initWorkers] GFS Order Watcher failed to initialize:', error.message);
  }

  // Return workers for potential external management
  return workers;
}

/**
 * Stop all background workers
 *
 * Call this during graceful shutdown to cleanly stop workers.
 *
 * @param {Object} workers - Worker instances returned from initWorkers
 */
async function stopWorkers(workers) {
  console.log('[initWorkers] Stopping background workers...');

  if (workers?.gfsOrderWatcher) {
    try {
      workers.gfsOrderWatcher.stop();
      console.log('[initWorkers] GFS Order Watcher stopped');
    } catch (error) {
      console.warn('[initWorkers] Error stopping GFS Order Watcher:', error.message);
    }
  }
}

/**
 * Get status of all workers
 *
 * @param {Object} workers - Worker instances returned from initWorkers
 * @returns {Object} Status of all workers
 */
function getWorkersStatus(workers) {
  return {
    gfsOrderWatcher: workers?.gfsOrderWatcher?.getStatus() || { isRunning: false, error: 'Not initialized' }
  };
}

module.exports = {
  initWorkers,
  stopWorkers,
  getWorkersStatus
};
