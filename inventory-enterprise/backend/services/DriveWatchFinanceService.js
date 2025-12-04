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

  // ============================================================================
  // V23.6.2: Content Hashing & Duplicate Detection
  // ============================================================================

  /**
   * Compute SHA-256 hash of file content
   * @param {Buffer} buffer - File content buffer
   * @returns {string} SHA-256 hash
   */
  computeContentHash(buffer) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Compute text fingerprint (hash of extracted text, ignores formatting)
   * @param {string} text - Extracted text content
   * @returns {string} SHA-256 hash of normalized text
   */
  computeTextFingerprint(text) {
    if (!text) return null;
    const crypto = require('crypto');
    // Normalize: lowercase, remove extra whitespace, remove non-alphanumeric except periods/dashes
    const normalized = text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9.\-\s]/g, '')
      .trim();
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Download file and compute hashes
   * @param {string} googleFileId - Google Drive file ID
   * @returns {Object} Hash results
   */
  async computeFileHashes(googleFileId) {
    await this.initDriveService();

    try {
      // Download file content
      const { buffer, text } = await this.driveService.downloadFileWithText(googleFileId);

      if (!buffer) {
        return { success: false, error: 'Could not download file' };
      }

      const contentHash = this.computeContentHash(buffer);
      const textFingerprint = text ? this.computeTextFingerprint(text) : null;

      return {
        success: true,
        contentHash,
        contentHashShort: contentHash.substring(0, 16),
        textFingerprint,
        fileSize: buffer.length
      };

    } catch (error) {
      console.error('[DriveWatch] Compute hashes error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Find potential duplicates for a file
   * @param {number} watchId - drive_files_watch.id
   * @returns {Array} List of potential duplicates
   */
  async findDuplicates(watchId) {
    const db = getPool();

    try {
      // Use the SQL function we created in migration
      const result = await db.query(`
        SELECT * FROM find_file_duplicates($1, $2)
      `, [this.orgId, watchId]);

      return {
        success: true,
        duplicates: result.rows.map(row => ({
          watchId: row.duplicate_id,
          fileName: row.file_name,
          matchType: row.match_type,
          matchConfidence: parseFloat(row.match_confidence)
        }))
      };

    } catch (error) {
      // If function doesn't exist yet, fall back to manual query
      if (error.message.includes('does not exist')) {
        return await this.findDuplicatesManual(watchId);
      }
      console.error('[DriveWatch] Find duplicates error:', error.message);
      return { success: false, error: error.message, duplicates: [] };
    }
  }

  /**
   * Manual duplicate detection (fallback if SQL function not available)
   * @param {number} watchId - drive_files_watch.id
   * @returns {Array} List of potential duplicates
   */
  async findDuplicatesManual(watchId) {
    const db = getPool();

    try {
      // Get the reference file
      const refResult = await db.query(`
        SELECT content_hash, text_fingerprint, google_file_name, detected_vendor, period_hint, file_size_bytes
        FROM drive_files_watch
        WHERE id = $1 AND org_id = $2
      `, [watchId, this.orgId]);

      if (refResult.rows.length === 0) {
        return { success: false, error: 'File not found', duplicates: [] };
      }

      const ref = refResult.rows[0];
      const duplicates = [];

      // Find exact content hash matches
      if (ref.content_hash) {
        const hashMatches = await db.query(`
          SELECT id, google_file_name, 'exact_hash' as match_type, 1.0 as match_confidence
          FROM drive_files_watch
          WHERE org_id = $1 AND id != $2 AND content_hash = $3 AND process_status != 'duplicate'
        `, [this.orgId, watchId, ref.content_hash]);

        duplicates.push(...hashMatches.rows);
      }

      // Find text fingerprint matches
      if (ref.text_fingerprint) {
        const textMatches = await db.query(`
          SELECT id, google_file_name, 'text_fingerprint' as match_type, 0.95 as match_confidence
          FROM drive_files_watch
          WHERE org_id = $1 AND id != $2 AND text_fingerprint = $3
            AND content_hash IS DISTINCT FROM $4
            AND process_status != 'duplicate'
        `, [this.orgId, watchId, ref.text_fingerprint, ref.content_hash]);

        duplicates.push(...textMatches.rows);
      }

      // Find vendor + period + similar size matches
      if (ref.detected_vendor && ref.period_hint && ref.file_size_bytes) {
        const metaMatches = await db.query(`
          SELECT id, google_file_name, 'vendor_period_match' as match_type, 0.75 as match_confidence
          FROM drive_files_watch
          WHERE org_id = $1 AND id != $2
            AND detected_vendor = $3 AND period_hint = $4
            AND file_size_bytes IS NOT NULL
            AND ABS(file_size_bytes - $5) < ($5 * 0.05)
            AND content_hash IS DISTINCT FROM $6
            AND text_fingerprint IS DISTINCT FROM $7
            AND process_status != 'duplicate'
        `, [this.orgId, watchId, ref.detected_vendor, ref.period_hint, ref.file_size_bytes, ref.content_hash, ref.text_fingerprint]);

        duplicates.push(...metaMatches.rows);
      }

      return {
        success: true,
        duplicates: duplicates.map(row => ({
          watchId: row.id,
          fileName: row.google_file_name,
          matchType: row.match_type,
          matchConfidence: parseFloat(row.match_confidence)
        }))
      };

    } catch (error) {
      console.error('[DriveWatch] Manual duplicate search error:', error.message);
      return { success: false, error: error.message, duplicates: [] };
    }
  }

  /**
   * Mark a file as a duplicate
   * @param {number} duplicateId - ID of the duplicate file
   * @param {number} canonicalId - ID of the canonical (master) file
   * @param {string} matchType - How the duplicate was detected
   * @param {string} resolvedBy - User who confirmed
   * @returns {Object} Result
   */
  async markAsDuplicate(duplicateId, canonicalId, matchType, resolvedBy = 'system') {
    const db = getPool();

    try {
      // Record the duplicate relationship
      await db.query(`
        INSERT INTO file_duplicates (org_id, canonical_file_id, duplicate_file_id, match_type, match_confidence, resolution_status, resolved_by, resolved_at)
        VALUES ($1, $2, $3, $4, $5, 'confirmed', $6, CURRENT_TIMESTAMP)
        ON CONFLICT (canonical_file_id, duplicate_file_id)
        DO UPDATE SET resolution_status = 'confirmed', resolved_by = $6, resolved_at = CURRENT_TIMESTAMP
      `, [
        this.orgId, canonicalId, duplicateId, matchType,
        matchType === 'exact_hash' ? 1.0 : matchType === 'text_fingerprint' ? 0.95 : 0.75,
        resolvedBy
      ]);

      // Update the duplicate file's status
      await db.query(`
        UPDATE drive_files_watch
        SET process_status = 'duplicate', duplicate_of_id = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND org_id = $3
      `, [canonicalId, duplicateId, this.orgId]);

      console.log(`[DriveWatch] Marked file ${duplicateId} as duplicate of ${canonicalId}`);

      return { success: true };

    } catch (error) {
      console.error('[DriveWatch] Mark duplicate error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all potential duplicates in the system
   * @returns {Array} Groups of potential duplicates
   */
  async getAllPotentialDuplicates() {
    const db = getPool();

    try {
      // Find files with matching content hashes
      const hashDupes = await db.query(`
        SELECT
          content_hash,
          array_agg(id) as file_ids,
          array_agg(google_file_name) as file_names,
          COUNT(*) as count
        FROM drive_files_watch
        WHERE org_id = $1 AND content_hash IS NOT NULL AND process_status != 'duplicate'
        GROUP BY content_hash
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
      `, [this.orgId]);

      // Find files with matching text fingerprints (but different content hashes)
      const textDupes = await db.query(`
        SELECT
          text_fingerprint,
          array_agg(id) as file_ids,
          array_agg(google_file_name) as file_names,
          COUNT(*) as count
        FROM drive_files_watch
        WHERE org_id = $1 AND text_fingerprint IS NOT NULL AND process_status != 'duplicate'
        GROUP BY text_fingerprint
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
      `, [this.orgId]);

      // Find files with matching vendor + period
      const metaDupes = await db.query(`
        SELECT
          detected_vendor || '_' || period_hint as group_key,
          detected_vendor,
          period_hint,
          array_agg(id) as file_ids,
          array_agg(google_file_name) as file_names,
          COUNT(*) as count
        FROM drive_files_watch
        WHERE org_id = $1 AND detected_vendor IS NOT NULL AND period_hint IS NOT NULL
          AND process_status != 'duplicate'
        GROUP BY detected_vendor, period_hint
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
      `, [this.orgId]);

      return {
        success: true,
        duplicateGroups: {
          exactHash: hashDupes.rows.map(row => ({
            matchType: 'exact_hash',
            matchConfidence: 1.0,
            fileIds: row.file_ids,
            fileNames: row.file_names,
            count: parseInt(row.count)
          })),
          textFingerprint: textDupes.rows.map(row => ({
            matchType: 'text_fingerprint',
            matchConfidence: 0.95,
            fileIds: row.file_ids,
            fileNames: row.file_names,
            count: parseInt(row.count)
          })),
          vendorPeriod: metaDupes.rows.map(row => ({
            matchType: 'vendor_period_match',
            matchConfidence: 0.75,
            vendor: row.detected_vendor,
            period: row.period_hint,
            fileIds: row.file_ids,
            fileNames: row.file_names,
            count: parseInt(row.count)
          }))
        },
        totalExactDuplicates: hashDupes.rows.reduce((sum, r) => sum + parseInt(r.count) - 1, 0),
        totalPotentialDuplicates: textDupes.rows.reduce((sum, r) => sum + parseInt(r.count) - 1, 0) +
                                  metaDupes.rows.reduce((sum, r) => sum + parseInt(r.count) - 1, 0)
      };

    } catch (error) {
      console.error('[DriveWatch] Get duplicates error:', error.message);
      return { success: false, error: error.message, duplicateGroups: {} };
    }
  }

  /**
   * Process a file: download, hash, check duplicates, and parse
   * @param {number} watchId - drive_files_watch.id
   * @returns {Object} Processing result
   */
  async processFileWithDuplicateCheck(watchId) {
    const db = getPool();

    try {
      // Get file info
      const fileResult = await db.query(`
        SELECT google_file_id, google_file_name, content_hash
        FROM drive_files_watch
        WHERE id = $1 AND org_id = $2
      `, [watchId, this.orgId]);

      if (fileResult.rows.length === 0) {
        return { success: false, error: 'File not found' };
      }

      const file = fileResult.rows[0];

      // Compute hashes if not already done
      if (!file.content_hash) {
        const hashResult = await this.computeFileHashes(file.google_file_id);

        if (hashResult.success) {
          await db.query(`
            UPDATE drive_files_watch
            SET content_hash = $1, content_hash_short = $2, text_fingerprint = $3, file_size_bytes = $4
            WHERE id = $5
          `, [hashResult.contentHash, hashResult.contentHashShort, hashResult.textFingerprint, hashResult.fileSize, watchId]);
        }
      }

      // Check for duplicates
      const dupResult = await this.findDuplicates(watchId);

      if (dupResult.success && dupResult.duplicates.length > 0) {
        // Found potential duplicates - check if any are exact matches
        const exactMatch = dupResult.duplicates.find(d => d.matchType === 'exact_hash');

        if (exactMatch) {
          // Auto-mark as duplicate
          await this.markAsDuplicate(watchId, exactMatch.watchId, 'exact_hash', 'auto_detect');
          return {
            success: true,
            action: 'marked_duplicate',
            duplicateOf: exactMatch.watchId,
            message: `File is exact duplicate of ${exactMatch.fileName}`
          };
        }

        // For non-exact matches, create a question for human review
        const FinanceReportAgent = require('./FinanceReportAgent');
        const agent = new FinanceReportAgent({ orgId: this.orgId, userId: this.userId });

        await agent.createFinanceQuestion({
          driveWatchId: watchId,
          googleFileId: file.google_file_id,
          questionType: 'potential_duplicate',
          questionText: `This file may be a duplicate. Found ${dupResult.duplicates.length} similar file(s). Please review.`,
          systemGuess: `Similar to: ${dupResult.duplicates.map(d => d.fileName).join(', ')}`,
          confidence: dupResult.duplicates[0].matchConfidence,
          options: ['Keep this file', 'Mark as duplicate', 'Keep both'],
          context: {
            fileName: file.google_file_name,
            potentialDuplicates: dupResult.duplicates
          },
          priority: 'high'
        });

        return {
          success: true,
          action: 'needs_review',
          potentialDuplicates: dupResult.duplicates,
          message: 'File may be a duplicate - created question for human review'
        };
      }

      // No duplicates - proceed with normal processing
      return {
        success: true,
        action: 'ready_to_parse',
        message: 'No duplicates found, file ready for parsing'
      };

    } catch (error) {
      console.error('[DriveWatch] Process with duplicate check error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Batch compute hashes for all files without hashes
   * @param {number} limit - Max files to process
   * @returns {Object} Batch result
   */
  async batchComputeHashes(limit = 50) {
    const db = getPool();

    try {
      // Get files without content hashes
      const files = await db.query(`
        SELECT id, google_file_id, google_file_name
        FROM drive_files_watch
        WHERE org_id = $1 AND content_hash IS NULL AND process_status != 'duplicate'
        ORDER BY first_seen_at DESC
        LIMIT $2
      `, [this.orgId, limit]);

      const results = {
        processed: 0,
        success: 0,
        failed: 0,
        errors: []
      };

      for (const file of files.rows) {
        results.processed++;

        try {
          const hashResult = await this.computeFileHashes(file.google_file_id);

          if (hashResult.success) {
            await db.query(`
              UPDATE drive_files_watch
              SET content_hash = $1, content_hash_short = $2, text_fingerprint = $3, file_size_bytes = $4
              WHERE id = $5
            `, [hashResult.contentHash, hashResult.contentHashShort, hashResult.textFingerprint, hashResult.fileSize, file.id]);

            results.success++;
          } else {
            results.failed++;
            results.errors.push({ fileId: file.id, error: hashResult.error });
          }

        } catch (err) {
          results.failed++;
          results.errors.push({ fileId: file.id, error: err.message });
        }
      }

      console.log(`[DriveWatch] Batch hash: ${results.success}/${results.processed} succeeded`);

      return {
        success: true,
        ...results
      };

    } catch (error) {
      console.error('[DriveWatch] Batch hash error:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = DriveWatchFinanceService;
