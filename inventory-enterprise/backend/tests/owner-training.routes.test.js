/**
 * Jest Tests for Owner Training Routes (v3.1.0)
 * Tests local AI training API with real metrics
 */

const request = require('supertest');
const express = require('express');
const ownerTrainingRoutes = require('../routes/owner-training');
const db = require('../config/database');
const LocalTrainer = require('../src/ai/local_training/LocalTrainer');

// Mock dependencies
jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id: 'owner-user-id', email: 'owner@test.com' };
    next();
  }
}));

jest.mock('../middleware/requireOwner', () => (req, res, next) => next());

jest.mock('../src/ai/local_training/LocalTrainer');
jest.mock('../config/database');
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));
jest.mock('../utils/metricsExporter', () => ({
  recordTrainingMetrics: jest.fn()
}));

const app = express();
app.use(express.json());
app.use('/api/owner/training', ownerTrainingRoutes);

describe('POST /api/owner/training/run', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should train a Prophet model successfully', async () => {
    // Mock training result
    LocalTrainer.trainProphet.mockResolvedValue({
      runId: 'run_123',
      itemCode: 'ITEM-001',
      modelType: 'prophet',
      wallClockSec: 2.5,
      peakMemoryMB: 150,
      metrics: {
        mape: 18.5,
        rmse: 12.3,
        mae: 8.7,
        samples: 30
      }
    });

    db.run = jest.fn().mockResolvedValue({});

    const response = await request(app)
      .post('/api/owner/training/run')
      .send({
        itemCodes: ['ITEM-001'],
        model: 'prophet',
        horizon: 30
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.runs).toHaveLength(1);
    expect(response.body.runs[0].itemCode).toBe('ITEM-001');
    expect(response.body.runs[0].modelType).toBe('prophet');
    expect(response.body.runs[0].wallClockSec).toBe(2.5);
    expect(response.body.runs[0].metrics.mape).toBe(18.5);

    // Verify audit log was created
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_logs'),
      expect.arrayContaining(['TRAINING_RUN', 'owner-user-id'])
    );
  });

  it('should train an ARIMA model successfully', async () => {
    LocalTrainer.trainARIMA.mockResolvedValue({
      runId: 'run_456',
      itemCode: 'ITEM-002',
      modelType: 'arima',
      wallClockSec: 1.8,
      peakMemoryMB: 100,
      metrics: {
        mape: 15.2,
        rmse: 10.1,
        mae: 7.5,
        samples: 30
      }
    });

    db.run = jest.fn().mockResolvedValue({});

    const response = await request(app)
      .post('/api/owner/training/run')
      .send({
        itemCodes: ['ITEM-002'],
        model: 'arima',
        horizon: 30
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.runs[0].modelType).toBe('arima');
  });

  it('should reject invalid model type', async () => {
    const response = await request(app)
      .post('/api/owner/training/run')
      .send({
        itemCodes: ['ITEM-001'],
        model: 'invalid',
        horizon: 30
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('model must be');
  });

  it('should reject missing itemCodes', async () => {
    const response = await request(app)
      .post('/api/owner/training/run')
      .send({
        model: 'prophet',
        horizon: 30
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('itemCodes');
  });

  it('should reject invalid horizon', async () => {
    const response = await request(app)
      .post('/api/owner/training/run')
      .send({
        itemCodes: ['ITEM-001'],
        model: 'prophet',
        horizon: 400
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('horizon');
  });

  it('should handle training failures gracefully', async () => {
    LocalTrainer.trainProphet.mockRejectedValue(new Error('Insufficient data'));

    db.run = jest.fn().mockResolvedValue({});

    const response = await request(app)
      .post('/api/owner/training/run')
      .send({
        itemCodes: ['ITEM-001'],
        model: 'prophet',
        horizon: 30
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.errors).toBeDefined();
    expect(response.body.errors).toHaveLength(1);
    expect(response.body.errors[0].error).toContain('Insufficient data');
  });
});

describe('GET /api/owner/training/runs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch recent training runs', async () => {
    db.all = jest.fn().mockResolvedValue([
      {
        id: 'run_1',
        item_code: 'ITEM-001',
        model_type: 'prophet',
        horizon: 30,
        mape: 18.5,
        rmse: 12.3,
        mae: 8.7,
        wall_sec: 2.5,
        peak_mb: 150,
        samples: 30,
        hw_fingerprint: 'hw_abc123',
        started_at: '2025-10-09T10:00:00.000Z',
        finished_at: '2025-10-09T10:00:02.500Z',
        logs_path: '/logs/run_1.json'
      }
    ]);

    const response = await request(app).get('/api/owner/training/runs');

    expect(response.status).toBe(200);
    expect(response.body.runs).toHaveLength(1);
    expect(response.body.runs[0].itemCode).toBe('ITEM-001');
    expect(response.body.runs[0].modelType).toBe('prophet');
  });

  it('should filter runs by model type', async () => {
    db.all = jest.fn().mockResolvedValue([]);

    const response = await request(app).get('/api/owner/training/runs?model=arima');

    expect(response.status).toBe(200);
    expect(db.all).toHaveBeenCalledWith(
      expect.stringContaining('WHERE model_type = ?'),
      expect.arrayContaining(['arima', 50])
    );
  });
});

describe('GET /api/owner/training/metrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return aggregated metrics for last 24h', async () => {
    db.get = jest.fn()
      .mockResolvedValueOnce({
        total_runs: 10,
        avg_wall_sec: 2.3,
        min_wall_sec: 1.5,
        max_wall_sec: 3.5,
        avg_mape: 18.0,
        avg_rmse: 12.0,
        avg_peak_mb: 145.0,
        total_samples: 300
      })
      .mockResolvedValueOnce({
        total_runs: 8,
        avg_wall_sec: 1.8,
        min_wall_sec: 1.2,
        max_wall_sec: 2.5,
        avg_mape: 16.5,
        avg_rmse: 10.5,
        avg_peak_mb: 110.0,
        total_samples: 240
      })
      .mockResolvedValueOnce({
        median_wall_sec: 2.2,
        median_mape: 17.5,
        median_rmse: 11.8
      })
      .mockResolvedValueOnce({
        median_wall_sec: 1.7,
        median_mape: 16.0,
        median_rmse: 10.2
      });

    const response = await request(app).get('/api/owner/training/metrics');

    expect(response.status).toBe(200);
    expect(response.body.last24h.prophet.totalRuns).toBe(10);
    expect(response.body.last24h.arima.totalRuns).toBe(8);
    expect(response.body.last24h.prophet.medianMAPE).toBe(17.5);
    expect(response.body.hardwareFingerprint).toBeDefined();
  });

  it('should handle no data gracefully', async () => {
    db.get = jest.fn().mockResolvedValue({
      total_runs: 0,
      avg_wall_sec: null,
      min_wall_sec: null,
      max_wall_sec: null,
      avg_mape: null,
      avg_rmse: null,
      avg_peak_mb: null,
      total_samples: 0
    });

    const response = await request(app).get('/api/owner/training/metrics');

    expect(response.status).toBe(200);
    expect(response.body.last24h.prophet.totalRuns).toBe(0);
    expect(response.body.last24h.prophet.avgMAPE).toBeNull();
  });
});
