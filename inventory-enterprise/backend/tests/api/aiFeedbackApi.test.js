/**
 * AI Feedback API Tests
 * Version: v2.2.0-2025-10-07
 *
 * Tests for AI feedback API endpoints
 */

const request = require('supertest');
const express = require('express');
const aiFeedbackRoutes = require('../../routes/ai-feedback-api');

// Mock dependencies
jest.mock('../../middleware/auth');
jest.mock('../../middleware/i18n');
jest.mock('../../src/ai/feedback/ingest');
jest.mock('../../src/ai/autotrainer/AutoTrainer');
jest.mock('../../src/ai/rl/RLAgent');

const auth = require('../../middleware/auth');
const feedbackIngestor = require('../../src/ai/feedback/ingest');
const autoTrainer = require('../../src/ai/autotrainer/AutoTrainer');
const rlAgent = require('../../src/ai/rl/RLAgent');

// Setup Express app for testing
const app = express();
app.use(express.json());

// Mock i18n middleware
app.use((req, res, next) => {
  req.t = (key) => key;
  req.locale = 'en';
  next();
});

app.use('/api/ai', aiFeedbackRoutes);

describe('AI Feedback API', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock auth middleware
    auth.mockImplementation((req, res, next) => {
      req.user = { id: 1, username: 'admin', role: 'admin' };
      next();
    });

    // Mock requireRole middleware
    auth.requireRole = jest.fn(() => (req, res, next) => next());
  });

  describe('POST /api/ai/feedback/ingest', () => {
    test('should ingest feedback batch successfully', async () => {
      const feedbackData = [
        { item_code: 'APPLE001', date: '2025-10-01', actual: 90, source: 'sales' },
        { item_code: 'APPLE002', date: '2025-10-01', actual: 55, source: 'sales' }
      ];

      feedbackIngestor.ingestBatch.mockResolvedValue({
        success: 2,
        failed: 0,
        skipped: 0,
        errors: []
      });

      const response = await request(app)
        .post('/api/ai/feedback/ingest')
        .send({ feedbackData })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.results.success).toBe(2);
      expect(feedbackIngestor.ingestBatch).toHaveBeenCalledWith(feedbackData);
    });

    test('should validate feedback data format', async () => {
      const invalidData = [
        { date: '2025-10-01', actual: 90 } // Missing item_code
      ];

      const response = await request(app)
        .post('/api/ai/feedback/ingest')
        .send({ feedbackData: invalidData })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should require admin role', async () => {
      auth.requireRole.mockImplementationOnce(() => (req, res) => {
        res.status(403).json({ error: 'Forbidden' });
      });

      await request(app)
        .post('/api/ai/feedback/ingest')
        .send({ feedbackData: [] })
        .expect(403);
    });

    test('should handle ingestion errors', async () => {
      feedbackIngestor.ingestBatch.mockRejectedValue(new Error('Database error'));

      await request(app)
        .post('/api/ai/feedback/ingest')
        .send({ feedbackData: [{ item_code: 'APPLE001', date: '2025-10-01', actual: 90 }] })
        .expect(500);
    });
  });

  describe('GET /api/ai/feedback/:itemCode/metrics', () => {
    test('should return accuracy metrics for item', async () => {
      const mockMetrics = {
        avg_mape: 12.5,
        avg_rmse: 6.2,
        median_mape: 11.0,
        median_rmse: 5.8,
        count: 28
      };

      const mockTimeSeries = [
        { date: '2025-10-01', mape: 10, rmse: 5 },
        { date: '2025-10-02', mape: 12, rmse: 6 }
      ];

      feedbackIngestor.getAccuracyMetrics.mockResolvedValue(mockMetrics);
      feedbackIngestor.getAccuracyTimeSeries.mockResolvedValue(mockTimeSeries);

      const response = await request(app)
        .get('/api/ai/feedback/APPLE001/metrics')
        .query({ window: 28 })
        .expect(200);

      expect(response.body.item_code).toBe('APPLE001');
      expect(response.body.metrics.avg_mape).toBe(12.5);
      expect(response.body.time_series).toHaveLength(2);
    });

    test('should use default window if not specified', async () => {
      feedbackIngestor.getAccuracyMetrics.mockResolvedValue({});
      feedbackIngestor.getAccuracyTimeSeries.mockResolvedValue([]);

      await request(app)
        .get('/api/ai/feedback/APPLE001/metrics')
        .expect(200);

      expect(feedbackIngestor.getAccuracyMetrics).toHaveBeenCalledWith('APPLE001', 28);
    });

    test('should validate window parameter', async () => {
      await request(app)
        .get('/api/ai/feedback/APPLE001/metrics')
        .query({ window: 500 }) // Exceeds max
        .expect(400);
    });
  });

  describe('POST /api/ai/models/retrain/drift', () => {
    test('should trigger drift detection', async () => {
      autoTrainer.runDriftDetection.mockResolvedValue({
        itemsChecked: 10,
        driftDetected: 3,
        retrainSuccess: 2,
        retrainFailed: 1
      });

      const response = await request(app)
        .post('/api/ai/models/retrain/drift')
        .expect(200);

      expect(response.body.status).toBe('running');
      expect(autoTrainer.runDriftDetection).toHaveBeenCalled();
    });

    test('should require admin role', async () => {
      auth.requireRole.mockImplementationOnce(() => (req, res) => {
        res.status(403).json({ error: 'Forbidden' });
      });

      await request(app)
        .post('/api/ai/models/retrain/drift')
        .expect(403);
    });
  });

  describe('POST /api/ai/models/retrain/:itemCode', () => {
    test('should trigger manual retrain for item', async () => {
      autoTrainer.triggerRetrain.mockResolvedValue({
        success: true,
        jobId: 'job_123',
        duration: 120,
        metrics: { mape: 10, rmse: 5 }
      });

      const response = await request(app)
        .post('/api/ai/models/retrain/APPLE001')
        .expect(200);

      expect(response.body.job_id).toBe('job_123');
      expect(response.body.duration).toBe(120);
      expect(autoTrainer.triggerRetrain).toHaveBeenCalledWith({
        itemCode: 'APPLE001',
        trigger: 'manual',
        reason: expect.stringContaining('admin')
      });
    });

    test('should handle retrain failures', async () => {
      autoTrainer.triggerRetrain.mockResolvedValue({
        success: false,
        error: 'Training failed'
      });

      await request(app)
        .post('/api/ai/models/retrain/APPLE001')
        .expect(500);
    });
  });

  describe('POST /api/ai/policy/tune/:itemCode', () => {
    test('should tune policy successfully', async () => {
      rlAgent.tunePolicy.mockResolvedValue({
        success: true,
        improvementPercent: 8.5,
        baselineReward: 100,
        newReward: 108.5,
        policy: { reorder_point: 55, safety_stock: 23, eoq_factor: 1.1 },
        duration: 45
      });

      const response = await request(app)
        .post('/api/ai/policy/tune/APPLE001')
        .expect(200);

      expect(response.body.improvement_percent).toBe(8.5);
      expect(response.body.policy).toBeDefined();
      expect(rlAgent.tunePolicy).toHaveBeenCalledWith('APPLE001');
    });

    test('should handle no improvement scenario', async () => {
      rlAgent.tunePolicy.mockResolvedValue({
        success: false,
        reason: 'No significant improvement',
        improvementPercent: 2.3,
        baselineReward: 100,
        bestReward: 102.3
      });

      const response = await request(app)
        .post('/api/ai/policy/tune/APPLE001')
        .expect(200);

      expect(response.body.improvement_percent).toBe(2.3);
      expect(response.body.message).toBeDefined();
    });

    test('should require admin role', async () => {
      auth.requireRole.mockImplementationOnce(() => (req, res) => {
        res.status(403).json({ error: 'Forbidden' });
      });

      await request(app)
        .post('/api/ai/policy/tune/APPLE001')
        .expect(403);
    });
  });

  describe('GET /api/ai/policy/:itemCode', () => {
    test('should return current policy and history', async () => {
      const mockPolicy = {
        item_code: 'APPLE001',
        reorder_point: 50,
        safety_stock: 20,
        eoq_factor: 1.0,
        policy_version: 3
      };

      const mockHistory = [
        { policy_version: 3, reward: 150, reason: 'RL improvement: +8.5%' },
        { policy_version: 2, reward: 138, reason: 'RL improvement: +6.2%' }
      ];

      rlAgent.getPolicy.mockResolvedValue(mockPolicy);
      rlAgent.getPolicyHistory.mockResolvedValue(mockHistory);

      const response = await request(app)
        .get('/api/ai/policy/APPLE001')
        .expect(200);

      expect(response.body.item_code).toBe('APPLE001');
      expect(response.body.current_policy.policy_version).toBe(3);
      expect(response.body.recent_changes).toHaveLength(2);
    });

    test('should return 404 for non-existent policy', async () => {
      rlAgent.getPolicy.mockResolvedValue(null);

      await request(app)
        .get('/api/ai/policy/NONEXISTENT')
        .expect(404);
    });
  });

  describe('GET /api/ai/autotrain/jobs/:itemCode', () => {
    test('should return job history for item', async () => {
      const mockJobs = [
        { job_id: 'job_1', status: 'success', trigger: 'drift' },
        { job_id: 'job_2', status: 'success', trigger: 'manual' }
      ];

      autoTrainer.getJobsForItem.mockResolvedValue(mockJobs);

      const response = await request(app)
        .get('/api/ai/autotrain/jobs/APPLE001')
        .query({ limit: 10 })
        .expect(200);

      expect(response.body.item_code).toBe('APPLE001');
      expect(response.body.jobs).toHaveLength(2);
      expect(autoTrainer.getJobsForItem).toHaveBeenCalledWith('APPLE001', 10);
    });

    test('should use default limit if not specified', async () => {
      autoTrainer.getJobsForItem.mockResolvedValue([]);

      await request(app)
        .get('/api/ai/autotrain/jobs/APPLE001')
        .expect(200);

      expect(autoTrainer.getJobsForItem).toHaveBeenCalledWith('APPLE001', 10);
    });
  });

  describe('GET /api/ai/autotrain/job/:jobId', () => {
    test('should return job status', async () => {
      const mockJob = {
        job_id: 'job_123',
        item_code: 'APPLE001',
        status: 'success',
        trigger: 'drift',
        metrics: { mape: 10 }
      };

      autoTrainer.getJob.mockResolvedValue(mockJob);

      const response = await request(app)
        .get('/api/ai/autotrain/job/job_123')
        .expect(200);

      expect(response.body.job.job_id).toBe('job_123');
      expect(response.body.job.status).toBe('success');
    });

    test('should return 404 for non-existent job', async () => {
      autoTrainer.getJob.mockResolvedValue(null);

      await request(app)
        .get('/api/ai/autotrain/job/job_nonexistent')
        .expect(404);
    });
  });
});
