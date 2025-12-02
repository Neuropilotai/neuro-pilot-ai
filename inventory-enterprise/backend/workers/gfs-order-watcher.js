/**
 * GFS Order Watcher Worker
 * NeuroPilot AI Enterprise v22.3
 *
 * Background worker that monitors Google Drive for new GFS order PDFs,
 * parses them, and populates FIFO cost layers.
 *
 * Flow:
 * 1. List PDFs in configured Google Drive folder
 * 2. For each new PDF (not in vendor_orders):
 *    a. Create vendor_order record
 *    b. Download and parse PDF
 *    c. Populate FIFO layers
 *    d. Move PDF to processed folder
 *
 * @version 22.3
 * @author NeuroPilot AI Team
 */

const cron = require('node-cron');
const path = require('path');
const fs = require('fs').promises;
const { pool } = require('../db');
const config = require('../config/gfs-watcher');

// Import services
let googleDriveService = null;
let parserService = null;
let fifoLayerService = null;

try {
  googleDriveService = require('../services/GoogleDriveService');
} catch (err) {
  console.warn('[GfsOrderWatcher] Google Drive service not available:', err.message);
}

try {
  parserService = require('../services/VendorOrderParserService');
} catch (err) {
  console.warn('[GfsOrderWatcher] Parser service not available:', err.message);
}

try {
  fifoLayerService = require('../services/FifoLayerService');
} catch (err) {
  console.warn('[GfsOrderWatcher] FIFO layer service not available:', err.message);
}

/**
 * GfsOrderWatcher Class
 * Manages the background polling loop for GFS order processing
 */
class GfsOrderWatcher {
  constructor() {
    this.isRunning = false;
    this.cronJob = null;
    this.lastRunAt = null;
    this.stats = {
      totalRuns: 0,
      ordersProcessed: 0,
      ordersSkipped: 0,
      errors: 0
    };
  }

  /**
   * Start the watcher with configured schedule
   */
  start() {
    if (this.isRunning) {
      console.warn('[GfsOrderWatcher] Already running');
      return;
    }

    // Check if enabled
    if (!config.enabled) {
      console.log('[GfsOrderWatcher] Disabled via configuration');
      return;
    }

    // Check required services
    if (!googleDriveService) {
      console.error('[GfsOrderWatcher] Cannot start: Google Drive service not available');
      return;
    }

    if (!parserService) {
      console.error('[GfsOrderWatcher] Cannot start: Parser service not available');
      return;
    }

    if (!fifoLayerService) {
      console.error('[GfsOrderWatcher] Cannot start: FIFO layer service not available');
      return;
    }

    // Schedule cron job
    this.cronJob = cron.schedule(config.schedule, () => {
      this.runCycle().catch(err => {
        console.error('[GfsOrderWatcher] Cycle error:', err);
        this.stats.errors++;
      });
    });

    this.isRunning = true;
    console.log(`[GfsOrderWatcher] Started with schedule: ${config.schedule}`);

    // Run immediately on start if configured
    if (config.runOnStart) {
      this.runCycle().catch(err => {
        console.error('[GfsOrderWatcher] Initial cycle error:', err);
        this.stats.errors++;
      });
    }
  }

  /**
   * Stop the watcher
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }

    this.isRunning = false;
    console.log('[GfsOrderWatcher] Stopped');
  }

  /**
   * Run one processing cycle
   */
  async runCycle() {
    const cycleStart = Date.now();
    console.log('[GfsOrderWatcher] Starting cycle...');

    try {
      // Initialize Google Drive service
      await googleDriveService.initialize();

      // List PDFs in inbox folder
      const files = await googleDriveService.listFiles(
        config.inboxFolderId,
        'application/pdf'
      );

      console.log(`[GfsOrderWatcher] Found ${files.length} PDFs in inbox`);

      let processed = 0;
      let skipped = 0;
      let errors = 0;

      // Process each file
      for (const file of files) {
        try {
          const result = await this.processFile(file);

          if (result.skipped) {
            skipped++;
          } else if (result.success) {
            processed++;
          } else {
            errors++;
          }

          // Rate limiting
          if (config.delayBetweenFiles > 0) {
            await this.sleep(config.delayBetweenFiles);
          }

        } catch (fileError) {
          console.error(`[GfsOrderWatcher] Error processing ${file.name}:`, fileError.message);
          errors++;
        }
      }

      // Update stats
      this.stats.totalRuns++;
      this.stats.ordersProcessed += processed;
      this.stats.ordersSkipped += skipped;
      this.stats.errors += errors;
      this.lastRunAt = new Date().toISOString();

      const duration = Date.now() - cycleStart;
      console.log(`[GfsOrderWatcher] Cycle complete: ${processed} processed, ${skipped} skipped, ${errors} errors (${duration}ms)`);

      // Log breadcrumb
      await this.logBreadcrumb('gfs_watcher_cycle', {
        filesFound: files.length,
        processed,
        skipped,
        errors,
        durationMs: duration
      });

    } catch (error) {
      console.error('[GfsOrderWatcher] Cycle failed:', error);
      throw error;
    }
  }

  /**
   * Process a single PDF file
   *
   * @param {Object} file - Google Drive file metadata
   * @returns {Promise<Object>} Processing result
   */
  async processFile(file) {
    const result = {
      fileId: file.id,
      fileName: file.name,
      success: false,
      skipped: false,
      orderId: null,
      error: null
    };

    console.log(`[GfsOrderWatcher] Processing: ${file.name}`);

    // Check if already processed (by pdf_file_id)
    const existingCheck = await pool.query(
      `SELECT id FROM vendor_orders WHERE pdf_file_id = $1 AND deleted_at IS NULL`,
      [file.id]
    );

    if (existingCheck.rows.length > 0) {
      console.log(`[GfsOrderWatcher] Skipping ${file.name} - already processed`);
      result.skipped = true;
      result.orderId = existingCheck.rows[0].id;
      return result;
    }

    // Create temp directory for download
    const tempDir = path.join(config.tempDirectory, `gfs-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    const localPath = path.join(tempDir, file.name);

    try {
      // Download PDF
      console.log(`[GfsOrderWatcher] Downloading to ${localPath}`);
      await googleDriveService.downloadFile(file.id, localPath);

      // Create vendor_order record
      const insertResult = await pool.query(`
        INSERT INTO vendor_orders (
          org_id, vendor_name, pdf_file_id, pdf_file_name,
          pdf_folder_id, status, source_system, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [
        config.orgId,
        'Gordon Food Service',
        file.id,
        file.name,
        config.inboxFolderId,
        'new',
        'gfs',
        'gfs-watcher'
      ]);

      const orderId = insertResult.rows[0].id;
      result.orderId = orderId;
      console.log(`[GfsOrderWatcher] Created order ${orderId}`);

      // Parse the PDF
      console.log(`[GfsOrderWatcher] Parsing PDF...`);
      const parseResult = await parserService.parseOrderFromFile(
        orderId,
        localPath,
        { userId: 'gfs-watcher' }
      );

      if (!parseResult.success) {
        console.warn(`[GfsOrderWatcher] Parse warnings for ${file.name}:`, parseResult.errors);
      }

      // Populate FIFO layers
      console.log(`[GfsOrderWatcher] Populating FIFO layers...`);
      const fifoResult = await fifoLayerService.populateFromVendorOrder(orderId, {
        force: false,
        skipCases: false,
        userId: 'gfs-watcher'
      });

      if (!fifoResult.success && fifoResult.code !== 'NO_LINE_ITEMS') {
        console.warn(`[GfsOrderWatcher] FIFO warnings for ${file.name}:`, fifoResult.error);
      }

      // Move PDF to processed folder
      if (config.processedFolderId && config.moveAfterProcessing) {
        console.log(`[GfsOrderWatcher] Moving to processed folder...`);
        await googleDriveService.moveFile(file.id, config.processedFolderId);

        // Update folder reference
        await pool.query(
          `UPDATE vendor_orders SET pdf_folder_id = $1 WHERE id = $2`,
          [config.processedFolderId, orderId]
        );
      }

      result.success = true;
      console.log(`[GfsOrderWatcher] Successfully processed ${file.name}`);

    } catch (error) {
      result.error = error.message;
      console.error(`[GfsOrderWatcher] Failed to process ${file.name}:`, error.message);

      // Update order with error status if created
      if (result.orderId) {
        await pool.query(
          `UPDATE vendor_orders SET status = 'error', error_message = $1 WHERE id = $2`,
          [error.message, result.orderId]
        );
      }

    } finally {
      // Cleanup temp files
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn(`[GfsOrderWatcher] Cleanup warning:`, cleanupError.message);
      }
    }

    return result;
  }

  /**
   * Get watcher status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      schedule: config.schedule,
      lastRunAt: this.lastRunAt,
      stats: { ...this.stats },
      config: {
        enabled: config.enabled,
        inboxFolderId: config.inboxFolderId,
        processedFolderId: config.processedFolderId,
        moveAfterProcessing: config.moveAfterProcessing
      }
    };
  }

  /**
   * Log a breadcrumb event
   */
  async logBreadcrumb(eventType, eventData) {
    try {
      await pool.query(`
        INSERT INTO ai_ops_breadcrumbs (event_type, event_data, created_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
      `, [eventType, JSON.stringify(eventData)]);
    } catch (error) {
      console.warn('[GfsOrderWatcher] Failed to log breadcrumb:', error.message);
    }
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
const watcher = new GfsOrderWatcher();

module.exports = watcher;
module.exports.GfsOrderWatcher = GfsOrderWatcher;
