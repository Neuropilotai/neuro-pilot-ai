/**
 * DriveWatchFinanceService - Finance File Monitoring Service
 * NeuroPilot AI Enterprise V23.6.0
 *
 * Monitors Google Drive folders for finance files (invoices, reports)
 * and tracks their ingestion status with full observability.
 *
 * Features:
 * - Scans configured Google Drive folders for PDFs
 * - Tracks file discovery, processing, and status
 * - Auto-detects vendor and period from filenames
 * - Syncs with finance_reports and drive_files_watch tables
 * - Provides summary and status endpoints
 *
 * @version 23.6.0
 * @author NeuroPilot AI Team
 */

const { Pool } = require('pg');
const GoogleDriveService = require('./GoogleDriveService');

// Lazy-load pool to avoid circular dependency
let pool = null;
const getPool = () => {
  if (!pool) {
    try {
      pool = require('../db/postgres').pool;
    } catch (e) {
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
    }
  }
  return pool;
};

// File type detection patterns
const FILE_TYPE_PATTERNS = [
  { pattern: /invoice/i, type: 'vendor_invoice' },
  { pattern: /month[-_\s]?end/i, type: 'month_end_report' },
  { pattern: /weekly|week[-_\s]?end/i, type: 'week_end_report' },
  { pattern: /po[-_\s]?\d|purchase[-_\s]?order/i, type: 'purchase_order' },
  { pattern: /credit[-_\s]?memo|credit[-_\s]?note/i, type: 'credit_memo' },
  { pattern: /statement/i, type: 'statement' }
];

// Vendor detection patterns
const VENDOR_PATTERNS = [
  { pattern: /\bGFS\b|gordon\s*food/i, vendor: 'GFS' },
  { pattern: /\bsysco\b/i, vendor: 'Sysco' },
  { pattern: /us\s*foods/i, vendor: 'US Foods' },
  { pattern: /\bcostco\b/i, vendor: 'Costco' },
  { pattern: /\bwalmart\b/i, vendor: 'Walmart' },
  { pattern: /\bamazon\b/i, vendor: 'Amazon' },
  { pattern: /\bstaples\b/i, vendor: 'Staples' }
];

// Period detection patterns
const PERIOD_PATTERNS = [
  { pattern: /FY(\d{2})[-_]?P(\d{2})/i, format: (m) => `FY${m[1]}-P${m[2]}` },
  { pattern: /(20\d{2})[-_](\d{2})/i, format: (m) => `${m[1]}-${m[2]}` },
  { pattern: /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-_\s]*(20\d{2})/i,
    format: (m) => {
      const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
                       jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
      return `${m[2]}-${months[m[1].toLowerCase().slice(0, 3)]}`;
    }
  }
];

class DriveWatchFinanceService {
  constructor(options = {}) {
    this.orgId = options.orgId || 'default-org';
    this.siteId = options.siteId || null;
    this.userId = options.userId || 'system';
    this.driveService = null;

    // Configuration
    this.config = {
      folderIds: options.folderIds || [],
      scanDepth: options.scanDepth || 1,  // How deep to scan subfolders
      mimeTypes: ['application/pdf'],
      maxFilesPerSync: options.maxFilesPerSync || 500,
      ...options.config
    };

    // Load folder IDs from env if not provided
    if (this.config.folderIds.length === 0) {
      const envFolders = [
        process.env.FINANCE_ORDERS_FOLDER_ID,
        process.env.FINANCE_REPORTS_FOLDER_ID,
        process.env.FINANCE_INVOICES_FOLDER_ID
      ].filter(Boolean);
      this.config.folderIds = envFolders;
    }
  }

  /**
   * Initialize Google Drive service
   */
  async initDriveService() {
    if (!this.driveService) {
      this.driveService = GoogleDriveService;
      await this.driveService.initialize();
    }
    return this.driveService;
  }

  /**
   * Detect file type from filename
   * @param {string} filename
   * @returns {string} File type
   */
  detectFileType(filename) {
    for (const { pattern, type } of FILE_TYPE_PATTERNS) {
      if (pattern.test(filename)) {
        return type;
      }
    }
    return 'unknown';
  }

  /**
   * Detect vendor from filename
   * @param {string} filename
   * @returns {string|null} Vendor name
   */
  detectVendor(filename) {
    for (const { pattern, vendor } of VENDOR_PATTERNS) {
      if (pattern.test(filename)) {
        return vendor;
      }
    }
    return null;
  }

  /**
   * Detect period from filename
   * @param {string} filename
   * @returns {string|null} Period hint
   */
  detectPeriod(filename) {
    for (const { pattern, format } of PERIOD_PATTERNS) {
      const match = filename.match(pattern);
      if (match) {
        return format(match);
      }
    }
    return null;
  }

  /**
   * Sync files from Google Drive folders
   * Scans configured folders and upserts to drive_files_watch
   *
   * @param {Object} options - Sync options
   * @param {string[]} options.folderIds - Override folder IDs
   * @param {boolean} options.createReports - Also create finance_reports rows
   * @returns {Object} Sync summary
   */
  async syncDriveFinanceFiles(options = {}) {
    const db = getPool();
    await this.initDriveService();

    const folderIds = options.folderIds || this.config.folderIds;

    if (folderIds.length === 0) {
      console.warn('[DriveWatch] No folder IDs configured');
      return {
        success: false,
        error: 'No folder IDs configured. Set FINANCE_ORDERS_FOLDER_ID or FINANCE_REPORTS_FOLDER_ID.'
      };
    }

    console.log(`[DriveWatch] Starting sync for ${folderIds.length} folders`);

    const results = {
      success: true,
      total_files: 0,
      new_files: 0,
      updated_files: 0,
      skipped_files: 0,
      reports_created: 0,
      errors: [],
      files: [],
      folders_scanned: []
    };

    for (const folderId of folderIds) {
      try {
        console.log(`[DriveWatch] Scanning folder: ${folderId}`);

        // Get folder metadata for name
        let folderName = 'Unknown Folder';
        try {
          const folderMeta = await this.driveService.getFileMetadata(folderId);
          folderName = folderMeta?.name || folderName;
        } catch (e) {
          console.warn(`[DriveWatch] Could not get folder name: ${e.message}`);
        }

        // List PDF files in folder
        const files = await this.driveService.listFiles(folderId, 'application/pdf');
        results.folders_scanned.push({ folder_id: folderId, folder_name: folderName, file_count: files.length });

        for (const file of files) {
          if (results.total_files >= this.config.maxFilesPerSync) {
            console.warn(`[DriveWatch] Max files limit reached (${this.config.maxFilesPerSync})`);
            break;
          }

          results.total_files++;

          try {
            // Detect metadata from filename
            const fileType = this.detectFileType(file.name);
            const vendor = this.detectVendor(file.name);
            const period = this.detectPeriod(file.name);

            // Check if file already exists in drive_files_watch
            const existing = await db.query(`
              SELECT id, process_status, last_seen_at, finance_report_id
              FROM drive_files_watch
              WHERE google_file_id = $1 AND org_id = $2
            `, [file.id, this.orgId]);

            if (existing.rows.length > 0) {
              const existingFile = existing.rows[0];
              const fileModified = new Date(file.modifiedTime);

              // Update last_seen_at and check if file was modified
              await db.query(`
                UPDATE drive_files_watch
                SET
                  last_seen_at = CURRENT_TIMESTAMP,
                  file_modified_at = $1,
                  google_file_name = $2,
                  google_folder_name = $3,
                  file_type = COALESCE(NULLIF($4, 'unknown'), file_type),
                  detected_vendor = COALESCE($5, detected_vendor),
                  period_hint = COALESCE($6, period_hint)
                WHERE id = $7
              `, [
                fileModified, file.name, folderName, fileType, vendor, period, existingFile.id
              ]);

              results.updated_files++;
              results.files.push({
                file_id: file.id,
                name: file.name,
                action: 'updated',
                watch_id: existingFile.id,
                report_id: existingFile.finance_report_id
              });

            } else {
              // Insert new file
              const insertResult = await db.query(`
                INSERT INTO drive_files_watch (
                  org_id, google_file_id, google_file_name,
                  google_folder_id, google_folder_name, mime_type,
                  file_type, detected_vendor, period_hint,
                  file_modified_at, process_status
                ) VALUES (
                  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending'
                )
                RETURNING id
              `, [
                this.orgId, file.id, file.name,
                folderId, folderName, file.mimeType || 'application/pdf',
                fileType, vendor, period,
                file.modifiedTime ? new Date(file.modifiedTime) : null
              ]);

              const watchId = insertResult.rows[0].id;
              let reportId = null;

              // Optionally create finance_reports row
              if (options.createReports !== false) {
                const reportResult = await db.query(`
                  INSERT INTO finance_reports (
                    org_id, site_id, report_type, report_name,
                    pdf_file_id, pdf_file_name, pdf_folder_id,
                    file_type, detected_vendor,
                    first_seen_at, status, process_status, created_by
                  ) VALUES (
                    $1, $2, 'month_end', $3, $4, $3, $5,
                    $6, $7, CURRENT_TIMESTAMP, 'new', 'pending', $8
                  )
                  ON CONFLICT (pdf_file_id) WHERE org_id = $1 AND deleted_at IS NULL
                  DO UPDATE SET updated_at = CURRENT_TIMESTAMP
                  RETURNING id
                `, [
                  this.orgId, this.siteId, file.name, file.id, folderId,
                  fileType, vendor, this.userId
                ]);

                if (reportResult.rows.length > 0) {
                  reportId = reportResult.rows[0].id;
                  results.reports_created++;

                  // Link finance_report to drive_files_watch
                  await db.query(`
                    UPDATE drive_files_watch
                    SET finance_report_id = $1
                    WHERE id = $2
                  `, [reportId, watchId]);
                }
              }

              results.new_files++;
              results.files.push({
                file_id: file.id,
                name: file.name,
                action: 'created',
                watch_id: watchId,
                report_id: reportId,
                file_type: fileType,
                vendor: vendor,
                period: period
              });
            }

          } catch (fileError) {
            results.errors.push({
              file_id: file.id,
              name: file.name,
              error: fileError.message
            });
          }
        }

      } catch (folderError) {
        results.errors.push({
          folder_id: folderId,
          error: `Folder scan failed: ${folderError.message}`
        });
      }
    }

    results.success = results.errors.length === 0;
    results.skipped_files = results.total_files - results.new_files - results.updated_files;

    console.log(`[DriveWatch] Sync complete: ${results.new_files} new, ${results.updated_files} updated, ${results.errors.length} errors`);

    return results;
  }

  /**
   * Get summary of watched files by status
   * @param {Object} filters - Optional filters
   * @returns {Object} Summary statistics
   */
  async getWatchSummary(filters = {}) {
    const db = getPool();

    try {
      // Overall counts by status
      const statusResult = await db.query(`
        SELECT
          process_status,
          COUNT(*) as count,
          AVG(confidence) as avg_confidence
        FROM drive_files_watch
        WHERE org_id = $1
        GROUP BY process_status
      `, [this.orgId]);

      const byStatus = {};
      let totalFiles = 0;
      for (const row of statusResult.rows) {
        byStatus[row.process_status] = {
          count: parseInt(row.count),
          avg_confidence: row.avg_confidence ? parseFloat(row.avg_confidence).toFixed(4) : null
        };
        totalFiles += parseInt(row.count);
      }

      // Counts by vendor
      const vendorResult = await db.query(`
        SELECT
          COALESCE(detected_vendor, 'Unknown') as vendor,
          COUNT(*) as count
        FROM drive_files_watch
        WHERE org_id = $1
        GROUP BY detected_vendor
        ORDER BY count DESC
        LIMIT 10
      `, [this.orgId]);

      const byVendor = {};
      for (const row of vendorResult.rows) {
        byVendor[row.vendor] = parseInt(row.count);
      }

      // Counts by file type
      const typeResult = await db.query(`
        SELECT
          file_type,
          COUNT(*) as count
        FROM drive_files_watch
        WHERE org_id = $1
        GROUP BY file_type
        ORDER BY count DESC
      `, [this.orgId]);

      const byFileType = {};
      for (const row of typeResult.rows) {
        byFileType[row.file_type] = parseInt(row.count);
      }

      // Low confidence count
      const lowConfidenceResult = await db.query(`
        SELECT COUNT(*) as count
        FROM drive_files_watch
        WHERE org_id = $1 AND confidence IS NOT NULL AND confidence < 0.5
      `, [this.orgId]);

      // Needs question count
      const needsQuestionResult = await db.query(`
        SELECT COUNT(*) as count
        FROM drive_files_watch
        WHERE org_id = $1 AND process_status = 'needs_question'
      `, [this.orgId]);

      // Open questions count
      const questionsResult = await db.query(`
        SELECT COUNT(*) as count
        FROM finance_questions
        WHERE org_id = $1 AND status = 'open'
      `, [this.orgId]);

      return {
        success: true,
        summary: {
          total_files: totalFiles,
          by_status: byStatus,
          by_vendor: byVendor,
          by_file_type: byFileType,
          low_confidence_count: parseInt(lowConfidenceResult.rows[0]?.count || 0),
          needs_question_count: parseInt(needsQuestionResult.rows[0]?.count || 0),
          open_questions: parseInt(questionsResult.rows[0]?.count || 0)
        }
      };

    } catch (error) {
      console.error('[DriveWatch] Summary error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get list of watched files with filters
   * @param {Object} filters - Query filters
   * @returns {Object} Paginated file list
   */
  async getWatchedFiles(filters = {}) {
    const db = getPool();

    const {
      status,
      vendor,
      fileType,
      period,
      needsReview,
      limit = 50,
      offset = 0
    } = filters;

    try {
      let whereClause = 'WHERE dfw.org_id = $1';
      const params = [this.orgId];
      let paramIndex = 2;

      if (status) {
        whereClause += ` AND dfw.process_status = $${paramIndex++}`;
        params.push(status);
      }
      if (vendor) {
        whereClause += ` AND dfw.detected_vendor = $${paramIndex++}`;
        params.push(vendor);
      }
      if (fileType) {
        whereClause += ` AND dfw.file_type = $${paramIndex++}`;
        params.push(fileType);
      }
      if (period) {
        whereClause += ` AND dfw.period_hint = $${paramIndex++}`;
        params.push(period);
      }
      if (needsReview === true || needsReview === 'true') {
        whereClause += ` AND dfw.process_status = 'needs_question'`;
      }

      // Get count
      const countResult = await db.query(`
        SELECT COUNT(*) as total
        FROM drive_files_watch dfw
        ${whereClause}
      `, params);

      // Get files
      const filesResult = await db.query(`
        SELECT
          dfw.id as watch_id,
          dfw.google_file_id,
          dfw.google_file_name as file_name,
          dfw.google_folder_id,
          dfw.google_folder_name as folder_name,
          dfw.file_type,
          dfw.detected_vendor as vendor,
          dfw.period_hint as period,
          dfw.process_status as status,
          dfw.confidence,
          dfw.first_seen_at,
          dfw.last_seen_at,
          dfw.last_processed_at,
          dfw.process_attempts,
          dfw.error_message,
          dfw.finance_report_id,
          fr.status as report_status,
          fr.total_amount_cents
        FROM drive_files_watch dfw
        LEFT JOIN finance_reports fr ON dfw.finance_report_id = fr.id
        ${whereClause}
        ORDER BY dfw.first_seen_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex}
      `, [...params, limit, offset]);

      return {
        success: true,
        total: parseInt(countResult.rows[0]?.total || 0),
        limit,
        offset,
        files: filesResult.rows.map(row => ({
          ...row,
          confidence: row.confidence ? parseFloat(row.confidence) : null,
          total_amount: row.total_amount_cents ? row.total_amount_cents / 100 : null
        }))
      };

    } catch (error) {
      console.error('[DriveWatch] Get files error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get pending files (not yet processed)
   * @param {number} limit - Max files to return
   * @returns {Array} Pending files
   */
  async getPendingFiles(limit = 50) {
    const db = getPool();

    try {
      const result = await db.query(`
        SELECT
          dfw.id as watch_id,
          dfw.google_file_id,
          dfw.google_file_name as file_name,
          dfw.file_type,
          dfw.detected_vendor as vendor,
          dfw.period_hint as period,
          dfw.finance_report_id,
          dfw.first_seen_at
        FROM drive_files_watch dfw
        WHERE dfw.org_id = $1
          AND dfw.process_status = 'pending'
        ORDER BY dfw.first_seen_at ASC
        LIMIT $2
      `, [this.orgId, limit]);

      return result.rows;

    } catch (error) {
      console.error('[DriveWatch] Get pending error:', error.message);
      return [];
    }
  }

  /**
   * Update file status after processing
   * @param {number} watchId - drive_files_watch ID
   * @param {Object} update - Status update
   */
  async updateFileStatus(watchId, update) {
    const db = getPool();

    const {
      status,
      confidence,
      errorMessage,
      financeReportId
    } = update;

    try {
      await db.query(`
        UPDATE drive_files_watch
        SET
          process_status = COALESCE($1, process_status),
          confidence = COALESCE($2, confidence),
          error_message = $3,
          finance_report_id = COALESCE($4, finance_report_id),
          last_processed_at = CURRENT_TIMESTAMP,
          process_attempts = process_attempts + 1
        WHERE id = $5 AND org_id = $6
      `, [
        status, confidence, errorMessage, financeReportId,
        watchId, this.orgId
      ]);

      return { success: true };

    } catch (error) {
      console.error('[DriveWatch] Update status error:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = DriveWatchFinanceService;
