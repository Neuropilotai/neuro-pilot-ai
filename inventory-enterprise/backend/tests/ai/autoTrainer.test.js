/**
 * AutoTrainer Tests
 * Version: v2.2.0-2025-10-07
 *
 * Tests for drift detection, auto-retraining, and policy sync
 */

const AutoTrainer = require('../../src/ai/autotrainer/AutoTrainer');

// Mock dependencies
jest.mock('../../config/database');
jest.mock('../../config/logger');
jest.mock('../../utils/metricsExporter');
jest.mock('../../src/ai/autotrainer/policySync');

const db = require('../../config/database');
const metricsExporter = require('../../utils/metricsExporter');
const policySync = require('../../src/ai/autotrainer/policySync');

describe('AutoTrainer', () => {
  let trainer;

  beforeEach(() => {
    jest.clearAllMocks();
    trainer = new (require('../../src/ai/autotrainer/AutoTrainer').constructor)();
  });

  describe('checkDrift', () => {
    beforeEach(() => {
      db.query = jest.fn();
    });

    test('should detect drift when 7-day MAPE exceeds threshold', async () => {
      const mockMetrics7d = [
        { mape: 18 }, { mape: 16 }, { mape: 17 }, { mape: 19 }, { mape: 20 },
        { mape: 16 }, { mape: 18 }
      ];

      db.query.mockResolvedValue({ rows: mockMetrics7d });

      const result = await trainer.checkDrift('APPLE001');

      expect(result.driftDetected).toBe(true);
      expect(result.reason).toContain('7-day median MAPE');
      expect(result.metrics.mape7DayMedian).toBeGreaterThan(15);
    });

    test('should detect drift when 28-day MAPE exceeds threshold', async () => {
      // Mock 7-day to be below threshold
      const mockMetrics7d = Array(7).fill({ mape: 10 });
      // Mock 28-day to be above threshold
      const mockMetrics28d = Array(28).fill({ mape: 22 });

      db.query
        .mockResolvedValueOnce({ rows: mockMetrics7d })
        .mockResolvedValueOnce({ rows: mockMetrics28d });

      const result = await trainer.checkDrift('APPLE001');

      expect(result.driftDetected).toBe(true);
      expect(result.reason).toContain('28-day median MAPE');
    });

    test('should detect drift when RMSE increases significantly', async () => {
      // Mock MAPE to be acceptable
      const mockMape = Array(7).fill({ mape: 10 });
      db.query.mockResolvedValueOnce({ rows: mockMape });
      db.query.mockResolvedValueOnce({ rows: mockMape });

      // Mock RMSE queries
      db.query
        .mockResolvedValueOnce({ rows: [{ rmse: 15 }] }) // Recent RMSE
        .mockResolvedValueOnce({ rows: [{ rmse: 10 }] }); // Baseline RMSE

      const result = await trainer.checkDrift('APPLE001');

      expect(result.driftDetected).toBe(true);
      expect(result.reason).toContain('RMSE drift');
      expect(result.metrics.rmseDriftPercent).toBeGreaterThan(20);
    });

    test('should not detect drift when metrics are acceptable', async () => {
      const mockMetrics = Array(28).fill({ mape: 10 });

      db.query
        .mockResolvedValueOnce({ rows: mockMetrics })
        .mockResolvedValueOnce({ rows: mockMetrics })
        .mockResolvedValueOnce({ rows: [{ rmse: 5 }] })
        .mockResolvedValueOnce({ rows: [{ rmse: 5 }] });

      const result = await trainer.checkDrift('APPLE001');

      expect(result.driftDetected).toBe(false);
    });

    test('should handle insufficient data', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const result = await trainer.checkDrift('APPLE001');

      expect(result.driftDetected).toBe(false);
      expect(result.reason).toContain('Insufficient data');
    });

    test('should compute median correctly', () => {
      expect(trainer.computeMedian([1, 2, 3, 4, 5])).toBe(3);
      expect(trainer.computeMedian([1, 2, 3, 4])).toBe(2.5);
      expect(trainer.computeMedian([5])).toBe(5);
      expect(trainer.computeMedian([])).toBe(0);
    });
  });

  describe('triggerRetrain', () => {
    beforeEach(() => {
      db.query = jest.fn();
      metricsExporter.recordAutotrainTrigger = jest.fn();
      metricsExporter.recordAutotrainDuration = jest.fn();
      policySync.syncAfterRetrain = jest.fn().mockResolvedValue();
    });

    test('should create job and trigger training', async () => {
      const jobId = 'job_test_123';

      // Mock job creation
      db.query.mockResolvedValueOnce({ rowsAffected: 1 });
      // Mock trainModel call (assuming it exists)
      trainer.trainModel = jest.fn().mockResolvedValue({
        success: true,
        metrics: { mape: 10, rmse: 5 }
      });
      // Mock job status updates
      db.query.mockResolvedValue({ rowsAffected: 1 });

      const result = await trainer.triggerRetrain({
        itemCode: 'APPLE001',
        trigger: 'drift',
        reason: 'MAPE > 15%'
      });

      expect(result.success).toBe(true);
      expect(result.jobId).toBeDefined();
      expect(trainer.trainModel).toHaveBeenCalledWith('APPLE001');
      expect(policySync.syncAfterRetrain).toHaveBeenCalledWith('APPLE001');
      expect(metricsExporter.recordAutotrainTrigger).toHaveBeenCalledWith('drift');
      expect(metricsExporter.recordAutotrainDuration).toHaveBeenCalledWith(
        expect.any(Number),
        'success'
      );
    });

    test('should handle training failures', async () => {
      trainer.trainModel = jest.fn().mockRejectedValue(new Error('Training failed'));
      db.query.mockResolvedValue({ rowsAffected: 1 });
      metricsExporter.recordAutotrainFailure = jest.fn();

      const result = await trainer.triggerRetrain({
        itemCode: 'APPLE001',
        trigger: 'manual',
        reason: 'Manual trigger'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Training failed');
      expect(metricsExporter.recordAutotrainFailure).toHaveBeenCalledWith('manual');
    });

    test('should check cooldown period', async () => {
      // Mock last retrain within cooldown
      db.query.mockResolvedValueOnce({
        rows: [{
          finished_at: new Date(Date.now() - 1000 * 60 * 60).toISOString() // 1 hour ago
        }]
      });

      const result = await trainer.triggerRetrain({
        itemCode: 'APPLE001',
        trigger: 'drift',
        reason: 'MAPE > 15%'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('cooldown');
    });
  });

  describe('runDriftDetection', () => {
    beforeEach(() => {
      db.query = jest.fn();
      trainer.checkDrift = jest.fn();
      trainer.triggerRetrain = jest.fn();
    });

    test('should check all items with active models', async () => {
      const mockItems = [
        { entity_id: 'APPLE001' },
        { entity_id: 'APPLE002' },
        { entity_id: 'APPLE003' }
      ];

      db.query.mockResolvedValue({ rows: mockItems });
      trainer.checkDrift.mockResolvedValue({ driftDetected: false });

      const result = await trainer.runDriftDetection();

      expect(result.itemsChecked).toBe(3);
      expect(trainer.checkDrift).toHaveBeenCalledTimes(3);
    });

    test('should trigger retrain for items with drift', async () => {
      const mockItems = [
        { entity_id: 'APPLE001' },
        { entity_id: 'APPLE002' }
      ];

      db.query.mockResolvedValue({ rows: mockItems });

      // First item has drift, second doesn't
      trainer.checkDrift
        .mockResolvedValueOnce({
          driftDetected: true,
          reason: 'MAPE > 15%',
          metrics: { mape7DayMedian: 18 }
        })
        .mockResolvedValueOnce({
          driftDetected: false
        });

      trainer.triggerRetrain.mockResolvedValue({
        success: true,
        jobId: 'job_123'
      });

      const result = await trainer.runDriftDetection();

      expect(result.itemsChecked).toBe(2);
      expect(result.driftDetected).toBe(1);
      expect(result.retrainSuccess).toBe(1);
      expect(trainer.triggerRetrain).toHaveBeenCalledTimes(1);
      expect(trainer.triggerRetrain).toHaveBeenCalledWith({
        itemCode: 'APPLE001',
        trigger: 'drift',
        reason: expect.stringContaining('MAPE > 15%'),
        metrics: expect.any(Object)
      });
    });

    test('should handle retrain failures gracefully', async () => {
      const mockItems = [{ entity_id: 'APPLE001' }];

      db.query.mockResolvedValue({ rows: mockItems });
      trainer.checkDrift.mockResolvedValue({
        driftDetected: true,
        reason: 'MAPE > 15%'
      });
      trainer.triggerRetrain.mockResolvedValue({
        success: false,
        error: 'Training failed'
      });

      const result = await trainer.runDriftDetection();

      expect(result.retrainSuccess).toBe(0);
      expect(result.retrainFailed).toBe(1);
    });

    test('should handle errors and continue processing', async () => {
      const mockItems = [
        { entity_id: 'APPLE001' },
        { entity_id: 'APPLE002' }
      ];

      db.query.mockResolvedValue({ rows: mockItems });

      // First item throws error, second is fine
      trainer.checkDrift
        .mockRejectedValueOnce(new Error('Database error'))
        .mockResolvedValueOnce({ driftDetected: false });

      const result = await trainer.runDriftDetection();

      expect(result.itemsChecked).toBe(2);
      // Should continue despite error on first item
    });
  });

  describe('getJobsForItem', () => {
    test('should retrieve job history for item', async () => {
      const mockJobs = [
        {
          job_id: 'job_1',
          trigger: 'drift',
          status: 'success',
          started_at: '2025-10-01T10:00:00Z',
          finished_at: '2025-10-01T10:05:00Z'
        },
        {
          job_id: 'job_2',
          trigger: 'manual',
          status: 'success',
          started_at: '2025-10-02T10:00:00Z',
          finished_at: '2025-10-02T10:03:00Z'
        }
      ];

      db.query.mockResolvedValue({ rows: mockJobs });

      const result = await trainer.getJobsForItem('APPLE001', 10);

      expect(result).toHaveLength(2);
      expect(result[0].job_id).toBe('job_1');
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY started_at DESC'),
        ['APPLE001', 10]
      );
    });
  });

  describe('getJob', () => {
    test('should retrieve specific job by ID', async () => {
      const mockJob = {
        job_id: 'job_123',
        item_code: 'APPLE001',
        trigger: 'drift',
        status: 'success',
        metrics: '{"mape": 10, "rmse": 5}'
      };

      db.query.mockResolvedValue({ rows: [mockJob] });

      const result = await trainer.getJob('job_123');

      expect(result.job_id).toBe('job_123');
      expect(result.item_code).toBe('APPLE001');
    });

    test('should return null for non-existent job', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const result = await trainer.getJob('job_nonexistent');

      expect(result).toBeNull();
    });
  });
});
