/**
 * Finance Monitor API Routes
 * NeuroPilot AI Enterprise V23.6.0
 *
 * DriveWatch + Human Review Queue for Finance Brain
 * - Monitor Google Drive folders for finance files
 * - Track ingestion status and confidence scores
 * - Human review queue for uncertain parses
 *
 * Endpoints:
 * - GET    /api/owner/finance/drivewatch/summary  - DriveWatch status summary
 * - GET    /api/owner/finance/drivewatch/files    - List watched files
 * - POST   /api/owner/finance/drivewatch/sync     - Trigger Drive sync
 * - GET    /api/owner/finance/questions           - List open questions
 * - GET    /api/owner/finance/questions/:id       - Get single question
 * - POST   /api/owner/finance/questions/:id/answer - Submit answer
 *
 * @version 23.6.0
 * @author NeuroPilot AI Team
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// Import DriveWatchFinanceService
let DriveWatchFinanceService = null;
try {
  DriveWatchFinanceService = require('../services/DriveWatchFinanceService');
} catch (err) {
  console.warn('[FinanceMonitor] DriveWatchFinanceService not available:', err.message);
}

// Import FinanceReportAgent
let FinanceReportAgent = null;
try {
  FinanceReportAgent = require('../services/FinanceReportAgent');
} catch (err) {
  console.warn('[FinanceMonitor] FinanceReportAgent not available:', err.message);
}

// ============================================
// HELPERS
// ============================================

/**
 * Get org_id from request (tenant isolation)
 */
function getOrgId(req) {
  return req.user?.org_id || 'default-org';
}

/**
 * Get user ID from request
 */
function getUserId(req) {
  return req.user?.email || req.user?.user_id || 'system';
}

// ============================================
// GET /api/owner/finance/drivewatch/summary
// ============================================

router.get('/drivewatch/summary', async (req, res) => {
  try {
    const orgId = getOrgId(req);

    // Check if view exists (migration may not have run)
    let summaryData = null;
    try {
      const viewResult = await pool.query(`
        SELECT * FROM drivewatch_summary WHERE org_id = $1
      `, [orgId]);
      summaryData = viewResult.rows[0] || null;
    } catch (viewErr) {
      // View doesn't exist yet - use fallback query
      console.warn('[FinanceMonitor] drivewatch_summary view not available:', viewErr.message);
    }

    // Fallback: build summary from base tables
    if (!summaryData) {
      const fallbackResult = await pool.query(`
        SELECT
          COUNT(*) AS total_watched,
          COUNT(CASE WHEN process_status = 'pending' THEN 1 END) AS pending_count,
          COUNT(CASE WHEN process_status = 'processing' THEN 1 END) AS processing_count,
          COUNT(CASE WHEN process_status = 'parsed_ok' THEN 1 END) AS parsed_ok_count,
          COUNT(CASE WHEN process_status = 'parsed_with_warnings' THEN 1 END) AS warnings_count,
          COUNT(CASE WHEN process_status = 'parse_failed' THEN 1 END) AS failed_count,
          COUNT(CASE WHEN process_status = 'needs_question' THEN 1 END) AS needs_question_count,
          AVG(confidence) AS avg_confidence
        FROM finance_reports
        WHERE org_id = $1 AND deleted_at IS NULL
      `, [orgId]);

      const fb = fallbackResult.rows[0];
      summaryData = {
        total_watched: parseInt(fb.total_watched) || 0,
        pending_count: parseInt(fb.pending_count) || 0,
        processing_count: parseInt(fb.processing_count) || 0,
        parsed_ok_count: parseInt(fb.parsed_ok_count) || 0,
        warnings_count: parseInt(fb.warnings_count) || 0,
        failed_count: parseInt(fb.failed_count) || 0,
        needs_question_count: parseInt(fb.needs_question_count) || 0,
        avg_confidence: fb.avg_confidence ? parseFloat(fb.avg_confidence) : null
      };
    }

    // Get open questions count
    let openQuestions = 0;
    try {
      const questionsResult = await pool.query(`
        SELECT COUNT(*) AS count FROM finance_questions
        WHERE org_id = $1 AND status = 'open'
      `, [orgId]);
      openQuestions = parseInt(questionsResult.rows[0]?.count) || 0;
    } catch (qErr) {
      // Table may not exist yet
    }

    res.json({
      success: true,
      summary: {
        totalWatched: summaryData.total_watched,
        pending: summaryData.pending_count,
        processing: summaryData.processing_count,
        parsedOk: summaryData.parsed_ok_count,
        warnings: summaryData.warnings_count,
        failed: summaryData.failed_count,
        needsQuestion: summaryData.needs_question_count,
        avgConfidence: summaryData.avg_confidence ? parseFloat(summaryData.avg_confidence).toFixed(3) : null,
        openQuestions
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[FinanceMonitor] Summary error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get DriveWatch summary',
      code: 'SUMMARY_ERROR'
    });
  }
});

// ============================================
// GET /api/owner/finance/drivewatch/files
// ============================================

router.get('/drivewatch/files', async (req, res) => {
  try {
    const orgId = getOrgId(req);

    // Query parameters
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    // Filters
    const status = req.query.status || null;
    const needsReview = req.query.needsReview === 'true';
    const vendor = req.query.vendor || null;
    const sortBy = req.query.sortBy || 'first_seen_at';
    const sortDir = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';

    // Build query
    let whereConditions = ['org_id = $1', 'deleted_at IS NULL'];
    let params = [orgId];
    let paramIndex = 2;

    if (status) {
      whereConditions.push(`process_status = $${paramIndex++}`);
      params.push(status);
    }

    if (needsReview) {
      whereConditions.push('needs_human_review = TRUE');
    }

    if (vendor) {
      whereConditions.push(`detected_vendor ILIKE $${paramIndex++}`);
      params.push(`%${vendor}%`);
    }

    const whereClause = whereConditions.join(' AND ');

    // Validate sort column
    const allowedSortCols = ['first_seen_at', 'last_processed_at', 'confidence', 'pdf_file_name', 'process_status'];
    const sortCol = allowedSortCols.includes(sortBy) ? sortBy : 'first_seen_at';

    // Count query
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM finance_reports WHERE ${whereClause}`,
      params
    );
    const totalCount = parseInt(countResult.rows[0].count);

    // Data query
    const dataResult = await pool.query(`
      SELECT
        id,
        pdf_file_id,
        pdf_file_name,
        pdf_folder_id,
        first_seen_at,
        last_processed_at,
        process_attempts,
        process_status,
        confidence,
        needs_human_review,
        detected_vendor,
        file_type,
        error_message,
        status,
        created_at
      FROM finance_reports
      WHERE ${whereClause}
      ORDER BY ${sortCol} ${sortDir}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, pageSize, offset]);

    // Format response
    const files = dataResult.rows.map(row => ({
      id: row.id,
      pdfFileId: row.pdf_file_id,
      pdfFileName: row.pdf_file_name,
      pdfFolderId: row.pdf_folder_id,
      firstSeenAt: row.first_seen_at,
      lastProcessedAt: row.last_processed_at,
      processAttempts: row.process_attempts,
      processStatus: row.process_status,
      confidence: row.confidence ? parseFloat(row.confidence) : null,
      needsHumanReview: row.needs_human_review,
      detectedVendor: row.detected_vendor,
      fileType: row.file_type,
      errorMessage: row.error_message,
      status: row.status,
      createdAt: row.created_at
    }));

    res.json({
      success: true,
      files,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize)
      }
    });

  } catch (error) {
    console.error('[FinanceMonitor] Files list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list watched files',
      code: 'FILES_ERROR'
    });
  }
});

// ============================================
// POST /api/owner/finance/drivewatch/sync
// ============================================

router.post('/drivewatch/sync', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { folderIds, maxFiles, processAfterSync } = req.body;

    if (!DriveWatchFinanceService) {
      return res.status(503).json({
        success: false,
        error: 'DriveWatchFinanceService not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const watcher = new DriveWatchFinanceService({
      orgId,
      folderIds: folderIds || [],
      maxFilesPerSync: maxFiles || 500
    });

    const result = await watcher.syncDriveFinanceFiles({
      userId,
      processAfterSync: processAfterSync || false
    });

    res.json({
      success: result.success,
      message: result.success
        ? `Sync complete: ${result.filesFound} found, ${result.newFiles} new, ${result.updatedFiles} updated`
        : result.error,
      result: {
        filesFound: result.filesFound,
        newFiles: result.newFiles,
        updatedFiles: result.updatedFiles,
        skipped: result.skipped,
        errors: result.errors?.length || 0
      },
      errors: result.errors,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[FinanceMonitor] Sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync from Google Drive',
      code: 'SYNC_ERROR',
      details: error.message
    });
  }
});

// ============================================
// GET /api/owner/finance/questions
// ============================================

router.get('/questions', async (req, res) => {
  try {
    const orgId = getOrgId(req);

    // Query parameters
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    // Filters
    const status = req.query.status || 'open';
    const questionType = req.query.questionType || null;
    const priority = req.query.priority || null;

    // Build query
    let whereConditions = ['org_id = $1'];
    let params = [orgId];
    let paramIndex = 2;

    if (status !== 'all') {
      whereConditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (questionType) {
      whereConditions.push(`question_type = $${paramIndex++}`);
      params.push(questionType);
    }

    if (priority) {
      whereConditions.push(`priority = $${paramIndex++}`);
      params.push(priority);
    }

    const whereClause = whereConditions.join(' AND ');

    // Count query
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM finance_questions WHERE ${whereClause}`,
      params
    );
    const totalCount = parseInt(countResult.rows[0].count);

    // Data query
    const dataResult = await pool.query(`
      SELECT
        question_id,
        created_at,
        resolved_at,
        status,
        question_type,
        question_text,
        system_guess,
        system_confidence,
        options,
        owner_answer,
        priority,
        report_id,
        file_name,
        detected_vendor,
        detected_period
      FROM finance_questions
      WHERE ${whereClause}
      ORDER BY
        CASE WHEN priority = 'high' THEN 1 WHEN priority = 'medium' THEN 2 ELSE 3 END,
        created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, pageSize, offset]);

    // Format response
    const questions = dataResult.rows.map(row => ({
      id: row.question_id,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      status: row.status,
      questionType: row.question_type,
      questionText: row.question_text,
      systemGuess: row.system_guess,
      systemConfidence: row.system_confidence ? parseFloat(row.system_confidence) : null,
      options: row.options,
      ownerAnswer: row.owner_answer,
      priority: row.priority,
      reportId: row.report_id,
      fileName: row.file_name,
      detectedVendor: row.detected_vendor,
      detectedPeriod: row.detected_period
    }));

    res.json({
      success: true,
      questions,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize)
      }
    });

  } catch (error) {
    console.error('[FinanceMonitor] Questions list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list questions',
      code: 'QUESTIONS_ERROR'
    });
  }
});

// ============================================
// GET /api/owner/finance/questions/:id
// ============================================

router.get('/questions/:id', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const questionId = parseInt(req.params.id);

    if (isNaN(questionId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid question ID',
        code: 'INVALID_ID'
      });
    }

    // Get question
    const questionResult = await pool.query(`
      SELECT
        fq.*,
        fr.pdf_file_name,
        fr.pdf_preview_url,
        fr.report_name,
        fr.period_start,
        fr.period_end
      FROM finance_questions fq
      LEFT JOIN finance_reports fr ON fq.report_id = fr.id
      WHERE fq.question_id = $1 AND fq.org_id = $2
    `, [questionId, orgId]);

    if (questionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Question not found',
        code: 'NOT_FOUND'
      });
    }

    const q = questionResult.rows[0];

    // Get history
    const historyResult = await pool.query(`
      SELECT
        history_id,
        action,
        action_by,
        action_at,
        old_value,
        new_value,
        notes
      FROM finance_question_history
      WHERE question_id = $1
      ORDER BY action_at DESC
    `, [questionId]);

    res.json({
      success: true,
      question: {
        id: q.question_id,
        createdAt: q.created_at,
        resolvedAt: q.resolved_at,
        status: q.status,
        questionType: q.question_type,
        questionText: q.question_text,
        systemGuess: q.system_guess,
        systemConfidence: q.system_confidence ? parseFloat(q.system_confidence) : null,
        options: q.options,
        ownerAnswer: q.owner_answer,
        answerPayload: q.answer_payload,
        answeredBy: q.answered_by,
        answerApplied: q.answer_applied,
        applyError: q.apply_error,
        priority: q.priority,
        reportId: q.report_id,
        fileName: q.file_name,
        detectedVendor: q.detected_vendor,
        detectedPeriod: q.detected_period,
        sourceContext: q.source_context,
        // Related report info
        report: q.report_id ? {
          id: q.report_id,
          name: q.report_name,
          pdfFileName: q.pdf_file_name,
          pdfPreviewUrl: q.pdf_preview_url,
          periodStart: q.period_start,
          periodEnd: q.period_end
        } : null
      },
      history: historyResult.rows.map(h => ({
        id: h.history_id,
        action: h.action,
        actionBy: h.action_by,
        actionAt: h.action_at,
        oldValue: h.old_value,
        newValue: h.new_value,
        notes: h.notes
      }))
    });

  } catch (error) {
    console.error('[FinanceMonitor] Question get error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get question',
      code: 'GET_ERROR'
    });
  }
});

// ============================================
// POST /api/owner/finance/questions/:id/answer
// ============================================

router.post('/questions/:id/answer', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const questionId = parseInt(req.params.id);
    const { answer, answerPayload, notes } = req.body;

    if (isNaN(questionId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid question ID',
        code: 'INVALID_ID'
      });
    }

    if (!answer) {
      return res.status(400).json({
        success: false,
        error: 'Answer is required',
        code: 'VALIDATION_ERROR'
      });
    }

    // Check question exists and is open
    const checkResult = await pool.query(`
      SELECT question_id, status, question_type, report_id
      FROM finance_questions
      WHERE question_id = $1 AND org_id = $2
    `, [questionId, orgId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Question not found',
        code: 'NOT_FOUND'
      });
    }

    const question = checkResult.rows[0];

    if (question.status !== 'open') {
      return res.status(400).json({
        success: false,
        error: `Question is already ${question.status}`,
        code: 'INVALID_STATUS'
      });
    }

    // Use FinanceReportAgent if available for full answer application
    if (FinanceReportAgent) {
      try {
        const agent = new FinanceReportAgent({ orgId, userId });
        const result = await agent.applyOwnerAnswer(
          questionId,
          answer,
          answerPayload || {},
          userId
        );

        return res.json({
          success: result.success,
          message: result.success
            ? 'Answer applied successfully'
            : result.error,
          result: {
            questionId,
            status: result.status,
            answerApplied: result.answer_applied,
            applyError: result.apply_error
          }
        });

      } catch (agentError) {
        console.error('[FinanceMonitor] Agent answer error:', agentError);
        // Fall through to basic update
      }
    }

    // Fallback: basic update without agent
    await pool.query(`
      UPDATE finance_questions
      SET
        status = 'answered',
        resolved_at = CURRENT_TIMESTAMP,
        owner_answer = $3,
        answer_payload = $4,
        answered_by = $5
      WHERE question_id = $1 AND org_id = $2
    `, [questionId, orgId, answer, answerPayload ? JSON.stringify(answerPayload) : '{}', userId]);

    // Log history
    await pool.query(`
      INSERT INTO finance_question_history (question_id, action, action_by, new_value, notes)
      VALUES ($1, 'answered', $2, $3, $4)
    `, [questionId, userId, answer, notes || null]);

    res.json({
      success: true,
      message: 'Answer recorded (basic mode - agent not available)',
      result: {
        questionId,
        status: 'answered',
        answerApplied: false,
        note: 'FinanceReportAgent required to apply answer to report'
      }
    });

  } catch (error) {
    console.error('[FinanceMonitor] Answer error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit answer',
      code: 'ANSWER_ERROR'
    });
  }
});

// ============================================
// GET /api/owner/finance/drivewatch/stats - Detailed Stats
// ============================================

router.get('/drivewatch/stats', async (req, res) => {
  try {
    const orgId = getOrgId(req);

    // Status breakdown
    const statusResult = await pool.query(`
      SELECT
        process_status,
        COUNT(*) as count,
        AVG(confidence) as avg_confidence
      FROM finance_reports
      WHERE org_id = $1 AND deleted_at IS NULL
      GROUP BY process_status
    `, [orgId]);

    // Vendor breakdown
    const vendorResult = await pool.query(`
      SELECT
        COALESCE(detected_vendor, 'unknown') as vendor,
        COUNT(*) as count,
        AVG(confidence) as avg_confidence
      FROM finance_reports
      WHERE org_id = $1 AND deleted_at IS NULL
      GROUP BY detected_vendor
      ORDER BY count DESC
      LIMIT 10
    `, [orgId]);

    // File type breakdown
    const fileTypeResult = await pool.query(`
      SELECT
        COALESCE(file_type, 'unknown') as file_type,
        COUNT(*) as count
      FROM finance_reports
      WHERE org_id = $1 AND deleted_at IS NULL
      GROUP BY file_type
    `, [orgId]);

    // Questions breakdown
    const questionsResult = await pool.query(`
      SELECT
        question_type,
        status,
        COUNT(*) as count
      FROM finance_questions
      WHERE org_id = $1
      GROUP BY question_type, status
    `, [orgId]);

    res.json({
      success: true,
      stats: {
        byStatus: statusResult.rows.map(r => ({
          status: r.process_status,
          count: parseInt(r.count),
          avgConfidence: r.avg_confidence ? parseFloat(r.avg_confidence).toFixed(3) : null
        })),
        byVendor: vendorResult.rows.map(r => ({
          vendor: r.vendor,
          count: parseInt(r.count),
          avgConfidence: r.avg_confidence ? parseFloat(r.avg_confidence).toFixed(3) : null
        })),
        byFileType: fileTypeResult.rows.map(r => ({
          fileType: r.file_type,
          count: parseInt(r.count)
        })),
        questions: questionsResult.rows.map(r => ({
          questionType: r.question_type,
          status: r.status,
          count: parseInt(r.count)
        }))
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[FinanceMonitor] Stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get DriveWatch stats',
      code: 'STATS_ERROR'
    });
  }
});

// ============================================
// V23.6.2: DUPLICATE DETECTION ENDPOINTS
// ============================================

/**
 * GET /api/owner/finance/drivewatch/duplicates
 * Get all potential duplicates in the system
 */
router.get('/drivewatch/duplicates', async (req, res) => {
  try {
    const orgId = getOrgId(req);

    if (!DriveWatchFinanceService) {
      return res.status(503).json({
        success: false,
        error: 'DriveWatch service not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const service = new DriveWatchFinanceService({
      orgId,
      userId: getUserId(req)
    });

    const result = await service.getAllPotentialDuplicates();

    res.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[FinanceMonitor] Get duplicates error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get duplicates',
      code: 'DUPLICATES_ERROR'
    });
  }
});

/**
 * GET /api/owner/finance/drivewatch/files/:id/duplicates
 * Find duplicates for a specific file
 */
router.get('/drivewatch/files/:id/duplicates', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const watchId = parseInt(req.params.id);

    if (isNaN(watchId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file ID',
        code: 'INVALID_ID'
      });
    }

    if (!DriveWatchFinanceService) {
      return res.status(503).json({
        success: false,
        error: 'DriveWatch service not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const service = new DriveWatchFinanceService({
      orgId,
      userId: getUserId(req)
    });

    const result = await service.findDuplicates(watchId);

    res.json({
      success: true,
      watchId,
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[FinanceMonitor] Find duplicates error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to find duplicates',
      code: 'FIND_DUPLICATES_ERROR'
    });
  }
});

/**
 * POST /api/owner/finance/drivewatch/files/:id/mark-duplicate
 * Mark a file as a duplicate of another
 */
router.post('/drivewatch/files/:id/mark-duplicate', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const duplicateId = parseInt(req.params.id);
    const { canonicalId, matchType } = req.body;

    if (isNaN(duplicateId) || isNaN(parseInt(canonicalId))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file IDs',
        code: 'INVALID_ID'
      });
    }

    if (!DriveWatchFinanceService) {
      return res.status(503).json({
        success: false,
        error: 'DriveWatch service not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const service = new DriveWatchFinanceService({
      orgId,
      userId: getUserId(req)
    });

    const result = await service.markAsDuplicate(
      duplicateId,
      parseInt(canonicalId),
      matchType || 'manual',
      getUserId(req)
    );

    res.json({
      success: true,
      ...result,
      message: `File ${duplicateId} marked as duplicate of ${canonicalId}`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[FinanceMonitor] Mark duplicate error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark as duplicate',
      code: 'MARK_DUPLICATE_ERROR'
    });
  }
});

/**
 * POST /api/owner/finance/drivewatch/files/:id/hash
 * Compute content hash for a file
 */
router.post('/drivewatch/files/:id/hash', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const watchId = parseInt(req.params.id);

    if (isNaN(watchId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file ID',
        code: 'INVALID_ID'
      });
    }

    if (!DriveWatchFinanceService) {
      return res.status(503).json({
        success: false,
        error: 'DriveWatch service not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    // Get the google file ID
    const fileResult = await pool.query(`
      SELECT google_file_id FROM drive_files_watch
      WHERE id = $1 AND org_id = $2
    `, [watchId, orgId]);

    if (fileResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
        code: 'NOT_FOUND'
      });
    }

    const service = new DriveWatchFinanceService({
      orgId,
      userId: getUserId(req)
    });

    const result = await service.computeFileHashes(fileResult.rows[0].google_file_id);

    if (result.success) {
      // Update the database
      await pool.query(`
        UPDATE drive_files_watch
        SET content_hash = $1, content_hash_short = $2, text_fingerprint = $3, file_size_bytes = $4
        WHERE id = $5
      `, [result.contentHash, result.contentHashShort, result.textFingerprint, result.fileSize, watchId]);
    }

    res.json({
      success: true,
      watchId,
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[FinanceMonitor] Compute hash error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to compute hash',
      code: 'HASH_ERROR'
    });
  }
});

/**
 * POST /api/owner/finance/drivewatch/batch-hash
 * Batch compute hashes for files without hashes
 */
router.post('/drivewatch/batch-hash', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { limit = 50 } = req.body;

    if (!DriveWatchFinanceService) {
      return res.status(503).json({
        success: false,
        error: 'DriveWatch service not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const service = new DriveWatchFinanceService({
      orgId,
      userId: getUserId(req)
    });

    const result = await service.batchComputeHashes(Math.min(limit, 100));

    res.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[FinanceMonitor] Batch hash error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to batch compute hashes',
      code: 'BATCH_HASH_ERROR'
    });
  }
});

/**
 * POST /api/owner/finance/drivewatch/files/:id/process-with-dedup
 * Process a file with duplicate checking
 */
router.post('/drivewatch/files/:id/process-with-dedup', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const watchId = parseInt(req.params.id);

    if (isNaN(watchId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file ID',
        code: 'INVALID_ID'
      });
    }

    if (!DriveWatchFinanceService) {
      return res.status(503).json({
        success: false,
        error: 'DriveWatch service not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    const service = new DriveWatchFinanceService({
      orgId,
      userId: getUserId(req)
    });

    const result = await service.processFileWithDuplicateCheck(watchId);

    res.json({
      success: true,
      watchId,
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[FinanceMonitor] Process with dedup error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process file',
      code: 'PROCESS_ERROR'
    });
  }
});

/**
 * GET /api/owner/finance/drivewatch/questions
 * Get open questions (alias route for finance brain UI)
 */
router.get('/drivewatch/questions', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { type, vendor, status = 'open', limit = 50 } = req.query;

    let whereClause = 'WHERE org_id = $1';
    const params = [orgId];
    let paramIndex = 2;

    if (status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (type) {
      whereClause += ` AND question_type = $${paramIndex++}`;
      params.push(type);
    }
    if (vendor) {
      whereClause += ` AND vendor = $${paramIndex++}`;
      params.push(vendor);
    }

    const result = await pool.query(`
      SELECT
        question_id as id,
        question_type,
        question_text,
        file_name,
        vendor,
        period,
        system_guess,
        system_confidence,
        options,
        status,
        priority,
        created_at
      FROM finance_questions
      ${whereClause}
      ORDER BY
        CASE priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          ELSE 4
        END,
        created_at ASC
      LIMIT $${paramIndex}
    `, [...params, limit]);

    res.json({
      success: true,
      questions: result.rows,
      total: result.rows.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[FinanceMonitor] Get questions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get questions',
      code: 'QUESTIONS_ERROR'
    });
  }
});

module.exports = router;
