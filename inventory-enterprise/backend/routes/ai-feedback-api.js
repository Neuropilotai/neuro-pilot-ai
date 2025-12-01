/**
 * AI Feedback & Self-Optimization API Routes
 * Version: v2.2.0-2025-10-07
 *
 * Endpoints for feedback ingestion, policy tuning, and auto-retraining
 */

const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const i18n = require('../middleware/i18n');
const { logger } = require('../config/logger');

// Lazy-load AI modules to prevent startup blocking
// These modules are loaded on first request instead of at module import time
let feedbackIngestor = null;
let autoTrainer = null;
let rlAgent = null;

function getFeedbackIngestor() {
  if (!feedbackIngestor) {
    try {
      feedbackIngestor = require('../src/ai/feedback/ingest');
    } catch (err) {
      logger.error('[AI-Feedback] Failed to load feedbackIngestor:', err.message);
      feedbackIngestor = { ingestBatch: async () => ({ success: 0, failed: 0 }), getAccuracyMetrics: async () => null, getAccuracyTimeSeries: async () => [] };
    }
  }
  return feedbackIngestor;
}

function getAutoTrainer() {
  if (!autoTrainer) {
    try {
      autoTrainer = require('../src/ai/autotrainer/AutoTrainer');
    } catch (err) {
      logger.error('[AI-Feedback] Failed to load autoTrainer:', err.message);
      autoTrainer = { runDriftDetection: async () => ({}), triggerRetrain: async () => ({ success: false }), getJobsForItem: async () => [], getJob: async () => null };
    }
  }
  return autoTrainer;
}

function getRLAgent() {
  if (!rlAgent) {
    try {
      rlAgent = require('../src/ai/rl/RLAgent');
    } catch (err) {
      logger.error('[AI-Feedback] Failed to load rlAgent:', err.message);
      rlAgent = { tunePolicy: async () => ({ success: false }), getPolicy: async () => null, getPolicyHistory: async () => [] };
    }
  }
  return rlAgent;
}

/**
 * @route   POST /api/ai/feedback/ingest
 * @desc    Batch ingest ground truth data
 * @access  Admin only
 */
router.post('/ingest',
  auth.authenticateToken,
  [
    body('feedbackData').isArray().withMessage('feedbackData must be an array'),
    body('feedbackData.*.item_code').notEmpty().withMessage('item_code is required'),
    body('feedbackData.*.date').isDate().withMessage('date must be valid date'),
    body('feedbackData.*.actual').isFloat().withMessage('actual must be a number'),
    body('feedbackData.*.source').optional().isIn(['sales', 'invoice', 'stock_count', 'order_fulfillment']).withMessage('Invalid source')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: req.t('validation_error'),
          details: errors.array()
        });
      }

      const { feedbackData } = req.body;

      logger.info(`[API] Feedback ingest requested by ${req.user.username}: ${feedbackData.length} records`);

      const result = await getFeedbackIngestor().ingestBatch(feedbackData);

      res.json({
        message: req.t('feedback_ingested_successfully'),
        results: result
      });
    } catch (error) {
      logger.error('[API] Error in feedback ingest:', error);
      res.status(500).json({
        error: req.t('internal_server_error'),
        message: error.message
      });
    }
  }
);

/**
 * @route   GET /api/ai/feedback/:itemCode/metrics
 * @desc    Get accuracy metrics for an item
 * @access  Authenticated
 */
router.get('/:itemCode/metrics',
  auth.authenticateToken,
  [
    param('itemCode').notEmpty().withMessage('item_code is required'),
    query('window').optional().isInt({ min: 1, max: 365 }).withMessage('window must be between 1 and 365')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: req.t('validation_error'),
          details: errors.array()
        });
      }

      const { itemCode } = req.params;
      const window = parseInt(req.query.window) || 28;

      const metrics = await getFeedbackIngestor().getAccuracyMetrics(itemCode, window);
      const timeSeries = await getFeedbackIngestor().getAccuracyTimeSeries(itemCode, window);

      res.json({
        item_code: itemCode,
        window_days: window,
        metrics,
        time_series: timeSeries
      });
    } catch (error) {
      logger.error('[API] Error fetching feedback metrics:', error);
      res.status(500).json({
        error: req.t('internal_server_error'),
        message: error.message
      });
    }
  }
);

/**
 * @route   POST /api/ai/models/retrain/drift
 * @desc    Force drift check and retrain models that need it
 * @access  Admin only
 */
router.post('/retrain/drift',
  auth.authenticateToken,
  auth.requireRole('admin'),
  async (req, res) => {
    try {
      logger.info(`[API] Drift detection triggered by ${req.user.username}`);

      // Run drift detection in background (don't wait for completion)
      getAutoTrainer().runDriftDetection()
        .then(result => {
          logger.info('[API] Drift detection complete:', result);
        })
        .catch(error => {
          logger.error('[API] Drift detection error:', error);
        });

      res.json({
        message: req.t('drift_detection_started'),
        status: 'running'
      });
    } catch (error) {
      logger.error('[API] Error starting drift detection:', error);
      res.status(500).json({
        error: req.t('internal_server_error'),
        message: error.message
      });
    }
  }
);

/**
 * @route   POST /api/ai/models/retrain/:itemCode
 * @desc    Manually trigger retrain for a specific item
 * @access  Admin only
 */
router.post('/retrain/:itemCode',
  auth.authenticateToken,
  auth.requireRole('admin'),
  [
    param('itemCode').notEmpty().withMessage('item_code is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: req.t('validation_error'),
          details: errors.array()
        });
      }

      const { itemCode } = req.params;

      logger.info(`[API] Manual retrain requested for ${itemCode} by ${req.user.username}`);

      const result = await getAutoTrainer().triggerRetrain({
        itemCode,
        trigger: 'manual',
        reason: `Manual trigger by ${req.user.username}`
      });

      if (result.success) {
        res.json({
          message: req.t('retrain_successful'),
          job_id: result.jobId,
          duration: result.duration,
          metrics: result.metrics
        });
      } else {
        res.status(500).json({
          error: req.t('retrain_failed'),
          message: result.error
        });
      }
    } catch (error) {
      logger.error('[API] Error in manual retrain:', error);
      res.status(500).json({
        error: req.t('internal_server_error'),
        message: error.message
      });
    }
  }
);

/**
 * @route   POST /api/ai/policy/tune/:itemCode
 * @desc    Run RL simulation and commit policy if improved
 * @access  Admin only
 */
router.post('/tune/:itemCode',
  auth.authenticateToken,
  auth.requireRole('admin'),
  [
    param('itemCode').notEmpty().withMessage('item_code is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: req.t('validation_error'),
          details: errors.array()
        });
      }

      const { itemCode } = req.params;

      logger.info(`[API] Policy tuning requested for ${itemCode} by ${req.user.username}`);

      const result = await getRLAgent().tunePolicy(itemCode);

      if (result.success) {
        res.json({
          message: req.t('policy_tuned_successfully'),
          improvement_percent: result.improvementPercent,
          baseline_reward: result.baselineReward,
          new_reward: result.newReward,
          policy: result.policy,
          duration: result.duration
        });
      } else {
        res.status(200).json({
          message: result.reason || req.t('no_policy_improvement'),
          improvement_percent: result.improvementPercent,
          baseline_reward: result.baselineReward,
          best_reward: result.bestReward
        });
      }
    } catch (error) {
      logger.error('[API] Error in policy tuning:', error);
      res.status(500).json({
        error: req.t('internal_server_error'),
        message: error.message
      });
    }
  }
);

/**
 * @route   GET /api/ai/policy/:itemCode
 * @desc    Get current policy and last change rationale
 * @access  Authenticated
 */
router.get('/policy/:itemCode',
  auth.authenticateToken,
  [
    param('itemCode').notEmpty().withMessage('item_code is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: req.t('validation_error'),
          details: errors.array()
        });
      }

      const { itemCode } = req.params;

      const policy = await getRLAgent().getPolicy(itemCode);
      if (!policy) {
        return res.status(404).json({
          error: req.t('policy_not_found')
        });
      }

      const history = await getRLAgent().getPolicyHistory(itemCode, 5);

      res.json({
        item_code: itemCode,
        current_policy: policy,
        recent_changes: history
      });
    } catch (error) {
      logger.error('[API] Error fetching policy:', error);
      res.status(500).json({
        error: req.t('internal_server_error'),
        message: error.message
      });
    }
  }
);

/**
 * @route   GET /api/ai/autotrain/jobs/:itemCode
 * @desc    Get autotrain job history for an item
 * @access  Authenticated
 */
router.get('/autotrain/jobs/:itemCode',
  auth.authenticateToken,
  [
    param('itemCode').notEmpty().withMessage('item_code is required'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: req.t('validation_error'),
          details: errors.array()
        });
      }

      const { itemCode } = req.params;
      const limit = parseInt(req.query.limit) || 10;

      const jobs = await getAutoTrainer().getJobsForItem(itemCode, limit);

      res.json({
        item_code: itemCode,
        jobs
      });
    } catch (error) {
      logger.error('[API] Error fetching autotrain jobs:', error);
      res.status(500).json({
        error: req.t('internal_server_error'),
        message: error.message
      });
    }
  }
);

/**
 * @route   GET /api/ai/autotrain/job/:jobId
 * @desc    Get autotrain job status
 * @access  Authenticated
 */
router.get('/autotrain/job/:jobId',
  auth.authenticateToken,
  [
    param('jobId').notEmpty().withMessage('job_id is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: req.t('validation_error'),
          details: errors.array()
        });
      }

      const { jobId } = req.params;

      const job = await getAutoTrainer().getJob(jobId);
      if (!job) {
        return res.status(404).json({
          error: req.t('job_not_found')
        });
      }

      res.json({ job });
    } catch (error) {
      logger.error('[API] Error fetching job:', error);
      res.status(500).json({
        error: req.t('internal_server_error'),
        message: error.message
      });
    }
  }
);

module.exports = router;
