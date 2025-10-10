/**
 * Feedback Ingestor Tests
 * Version: v2.2.0-2025-10-07
 *
 * Tests for feedback ingestion, MAPE/RMSE calculation, and accuracy metrics
 */

const FeedbackIngestor = require('../../src/ai/feedback/ingest');

// Mock dependencies
jest.mock('../../config/database');
jest.mock('../../config/logger');
jest.mock('../../utils/metricsExporter');

const db = require('../../config/database');
const metricsExporter = require('../../utils/metricsExporter');

describe('FeedbackIngestor', () => {
  let ingestor;

  beforeEach(() => {
    jest.clearAllMocks();
    ingestor = new (require('../../src/ai/feedback/ingest').constructor)();
  });

  describe('computeMAPE', () => {
    test('should compute MAPE correctly for non-zero actual', () => {
      const mape = ingestor.computeMAPE(100, 90);
      expect(mape).toBeCloseTo(11.11, 1);
    });

    test('should handle zero actual value', () => {
      const mape = ingestor.computeMAPE(10, 0);
      expect(mape).toBe(1000); // 10 * 100
    });

    test('should handle negative values', () => {
      const mape = ingestor.computeMAPE(-50, -60);
      expect(mape).toBeCloseTo(16.67, 1);
    });

    test('should return 0 for perfect forecast', () => {
      const mape = ingestor.computeMAPE(100, 100);
      expect(mape).toBe(0);
    });
  });

  describe('computeRMSE', () => {
    test('should compute RMSE correctly', () => {
      const rmse = ingestor.computeRMSE(100, 90);
      expect(rmse).toBe(10);
    });

    test('should handle negative differences', () => {
      const rmse = ingestor.computeRMSE(90, 100);
      expect(rmse).toBe(10);
    });

    test('should return 0 for perfect forecast', () => {
      const rmse = ingestor.computeRMSE(100, 100);
      expect(rmse).toBe(0);
    });
  });

  describe('ingestSingle', () => {
    beforeEach(() => {
      db.query = jest.fn();
      metricsExporter.recordFeedbackIngest = jest.fn();
      metricsExporter.recordAccuracyMetric = jest.fn();
    });

    test('should ingest feedback record with forecast and actual', async () => {
      const record = {
        item_code: 'APPLE001',
        date: '2025-10-01',
        forecast: 100,
        actual: 90,
        source: 'sales'
      };

      // Mock getForecast to return null (will use provided forecast)
      db.query.mockResolvedValueOnce({ rows: [] });
      // Mock upsert
      db.query.mockResolvedValueOnce({ rowsAffected: 1 });

      const result = await ingestor.ingestSingle(record);

      expect(result.success).toBe(true);
      expect(result.mape).toBeCloseTo(11.11, 1);
      expect(result.rmse).toBe(10);
      expect(metricsExporter.recordFeedbackIngest).toHaveBeenCalledWith('sales', 'success');
      expect(metricsExporter.recordAccuracyMetric).toHaveBeenCalledWith('APPLE001', expect.any(Number), 10);
    });

    test('should fetch forecast if not provided', async () => {
      const record = {
        item_code: 'APPLE001',
        date: '2025-10-01',
        actual: 90,
        source: 'stock_count'
      };

      // Mock getForecast to return a forecast
      db.query.mockResolvedValueOnce({
        rows: [{ forecast_value: 100 }]
      });
      // Mock upsert
      db.query.mockResolvedValueOnce({ rowsAffected: 1 });

      const result = await ingestor.ingestSingle(record);

      expect(result.success).toBe(true);
      expect(result.mape).toBeCloseTo(11.11, 1);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT forecast_value'),
        ['APPLE001', '2025-10-01']
      );
    });

    test('should handle missing forecast gracefully', async () => {
      const record = {
        item_code: 'APPLE001',
        date: '2025-10-01',
        actual: 90,
        source: 'sales'
      };

      // Mock getForecast to return null
      db.query.mockResolvedValueOnce({ rows: [] });
      // Mock upsert (will insert with null forecast)
      db.query.mockResolvedValueOnce({ rowsAffected: 1 });

      const result = await ingestor.ingestSingle(record);

      expect(result.success).toBe(true);
      expect(result.mape).toBeNull();
      expect(result.rmse).toBeNull();
    });

    test('should handle database errors', async () => {
      const record = {
        item_code: 'APPLE001',
        date: '2025-10-01',
        actual: 90,
        source: 'sales'
      };

      db.query.mockRejectedValue(new Error('Database connection failed'));

      const result = await ingestor.ingestSingle(record);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection failed');
      expect(metricsExporter.recordFeedbackIngest).toHaveBeenCalledWith('sales', 'error');
    });
  });

  describe('ingestBatch', () => {
    beforeEach(() => {
      db.query = jest.fn();
      metricsExporter.recordFeedbackIngest = jest.fn();
      metricsExporter.recordAccuracyMetric = jest.fn();
    });

    test('should ingest multiple records successfully', async () => {
      const feedbackData = [
        { item_code: 'APPLE001', date: '2025-10-01', forecast: 100, actual: 90, source: 'sales' },
        { item_code: 'APPLE002', date: '2025-10-01', forecast: 50, actual: 55, source: 'sales' },
        { item_code: 'APPLE003', date: '2025-10-01', forecast: 75, actual: 70, source: 'sales' }
      ];

      // Mock all queries to succeed
      db.query.mockResolvedValue({ rowsAffected: 1 });

      const result = await ingestor.ingestBatch(feedbackData);

      expect(result.success).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(metricsExporter.recordFeedbackIngest).toHaveBeenCalledTimes(3);
    });

    test('should handle partial failures', async () => {
      const feedbackData = [
        { item_code: 'APPLE001', date: '2025-10-01', forecast: 100, actual: 90, source: 'sales' },
        { item_code: 'APPLE002', date: '2025-10-01', forecast: 50, actual: 55, source: 'sales' },
        { item_code: 'APPLE003', date: '2025-10-01', forecast: 75, actual: 70, source: 'sales' }
      ];

      // Mock first to succeed, second to fail, third to succeed
      db.query
        .mockResolvedValueOnce({ rowsAffected: 1 })
        .mockRejectedValueOnce(new Error('Constraint violation'))
        .mockResolvedValueOnce({ rowsAffected: 1 });

      const result = await ingestor.ingestBatch(feedbackData);

      expect(result.success).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('APPLE002');
    });

    test('should validate required fields', async () => {
      const feedbackData = [
        { item_code: 'APPLE001', date: '2025-10-01', actual: 90, source: 'sales' },
        { date: '2025-10-01', actual: 90, source: 'sales' }, // Missing item_code
        { item_code: 'APPLE003', actual: 90, source: 'sales' } // Missing date
      ];

      db.query.mockResolvedValue({ rowsAffected: 1 });

      const result = await ingestor.ingestBatch(feedbackData);

      expect(result.skipped).toBeGreaterThan(0);
    });
  });

  describe('getAccuracyMetrics', () => {
    beforeEach(() => {
      db.query = jest.fn();
    });

    test('should compute accuracy metrics for item', async () => {
      const mockData = [
        { mape: 10, rmse: 5 },
        { mape: 15, rmse: 8 },
        { mape: 12, rmse: 6 },
        { mape: 20, rmse: 10 },
        { mape: 8, rmse: 4 }
      ];

      db.query.mockResolvedValue({ rows: mockData });

      const result = await ingestor.getAccuracyMetrics('APPLE001', 28);

      expect(result.avg_mape).toBeCloseTo(13, 0);
      expect(result.avg_rmse).toBeCloseTo(6.6, 1);
      expect(result.median_mape).toBe(12);
      expect(result.min_mape).toBe(8);
      expect(result.max_mape).toBe(20);
      expect(result.count).toBe(5);
    });

    test('should handle empty result set', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const result = await ingestor.getAccuracyMetrics('APPLE001', 28);

      expect(result.count).toBe(0);
      expect(result.avg_mape).toBeNull();
      expect(result.avg_rmse).toBeNull();
    });

    test('should use correct time window', async () => {
      db.query.mockResolvedValue({ rows: [] });

      await ingestor.getAccuracyMetrics('APPLE001', 7);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('7 days'),
        ['APPLE001']
      );
    });
  });

  describe('getAccuracyTimeSeries', () => {
    test('should return time series data', async () => {
      const mockData = [
        { date: '2025-10-01', mape: 10, rmse: 5 },
        { date: '2025-10-02', mape: 12, rmse: 6 },
        { date: '2025-10-03', mape: 15, rmse: 8 }
      ];

      db.query.mockResolvedValue({ rows: mockData });

      const result = await ingestor.getAccuracyTimeSeries('APPLE001', 7);

      expect(result).toHaveLength(3);
      expect(result[0].date).toBe('2025-10-01');
      expect(result[0].mape).toBe(10);
    });
  });

  describe('refreshDailyRollup', () => {
    test('should call PostgreSQL materialized view refresh', async () => {
      db.query.mockResolvedValue({ rowsAffected: 0 });

      await ingestor.refreshDailyRollup();

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('REFRESH MATERIALIZED VIEW'),
        []
      );
    });
  });
});
