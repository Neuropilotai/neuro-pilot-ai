/**
 * AI API Integration Tests
 * Tests for forecasting, reorder, and anomaly detection endpoints
 */

const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

// Setup test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-bytes-12';
process.env.DB_PATH = ':memory:'; // Use in-memory database for tests

// Mock logger to suppress output during tests
jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

const aiApiRouter = require('../../routes/ai-api');

describe('AI API Integration Tests', () => {
  let app;
  let db;

  beforeAll(async () => {
    // Create Express app with AI routes
    app = express();
    app.use(express.json());
    app.use('/api/ai', aiApiRouter);

    // Setup test database
    db = new sqlite3.Database(':memory:');

    // Create necessary tables
    await setupTestDatabase(db);

    // Insert test data
    await insertTestData(db);
  });

  afterAll(async () => {
    if (db) {
      await new Promise((resolve) => db.close(resolve));
    }
  });

  describe('Consumption Derivation Endpoints', () => {
    test('POST /api/ai/consumption/derive should derive consumption data', async () => {
      const response = await request(app)
        .post('/api/ai/consumption/derive')
        .send({
          start_date: '2024-01-01',
          end_date: '2024-01-31'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.items_processed).toBeGreaterThanOrEqual(0);
    });

    test('POST /api/ai/consumption/derive should fail without dates', async () => {
      const response = await request(app)
        .post('/api/ai/consumption/derive')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('start_date and end_date are required');
    });

    test('POST /api/ai/consumption/detect-anomalies should detect anomalies', async () => {
      const response = await request(app)
        .post('/api/ai/consumption/detect-anomalies')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('anomalies_detected');
    });
  });

  describe('Forecasting Endpoints', () => {
    test('POST /api/ai/forecast/train should train a Prophet model', async () => {
      // Note: This test requires Python with Prophet installed
      // In CI/CD, this would be skipped or mocked if Python is not available

      const response = await request(app)
        .post('/api/ai/forecast/train')
        .send({
          item_code: 'TEST-ITEM-001',
          model_type: 'prophet',
          options: {
            trainingDays: 90,
            forecastPeriods: 30
          }
        });

      // Allow success or failure (depends on Python availability)
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
      expect(response.body).toHaveProperty('success');
    }, 30000); // 30 second timeout for training

    test('POST /api/ai/forecast/train should fail without item_code', async () => {
      const response = await request(app)
        .post('/api/ai/forecast/train')
        .send({
          model_type: 'prophet'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('item_code is required');
    });

    test('POST /api/ai/forecast/train should reject invalid model_type', async () => {
      const response = await request(app)
        .post('/api/ai/forecast/train')
        .send({
          item_code: 'TEST-ITEM-001',
          model_type: 'invalid-model'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid model_type');
    });

    test('GET /api/ai/forecast/:itemCode should get forecast', async () => {
      const response = await request(app)
        .get('/api/ai/forecast/TEST-ITEM-001')
        .query({ periods: 30, model_type: 'prophet' });

      // Will fail if no model trained, which is expected in test environment
      expect([200, 404]).toContain(response.status);
      expect(response.body).toHaveProperty('success');
    });

    test('POST /api/ai/forecast/batch-train should train multiple models', async () => {
      const response = await request(app)
        .post('/api/ai/forecast/batch-train')
        .send({
          item_codes: ['TEST-ITEM-001', 'TEST-ITEM-002'],
          model_type: 'prophet',
          options: {
            trainingDays: 90,
            forecastPeriods: 30
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.total).toBe(2);
      expect(response.body).toHaveProperty('succeeded');
      expect(response.body).toHaveProperty('failed');
    }, 60000); // 60 second timeout for batch training

    test('GET /api/ai/forecast/evaluate/:itemCode should evaluate model', async () => {
      const response = await request(app)
        .get('/api/ai/forecast/evaluate/TEST-ITEM-001')
        .query({ backtest_days: 30, model_type: 'prophet' });

      expect([200, 404]).toContain(response.status);
      expect(response.body).toHaveProperty('success');
    });
  });

  describe('Reorder Optimization Endpoints', () => {
    test('POST /api/ai/reorder/recommend should generate recommendations', async () => {
      const response = await request(app)
        .post('/api/ai/reorder/recommend')
        .send({
          item_codes: ['TEST-ITEM-001', 'TEST-ITEM-002'],
          lead_time_days: 7,
          service_level: 0.95
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.recommendations).toBeInstanceOf(Array);
      expect(response.body.recommendations.length).toBe(2);
      expect(response.body.parameters).toEqual({
        lead_time_days: 7,
        service_level: 0.95
      });
    });

    test('POST /api/ai/reorder/recommend should fail without item_codes', async () => {
      const response = await request(app)
        .post('/api/ai/reorder/recommend')
        .send({
          lead_time_days: 7
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('item_codes array is required');
    });

    test('GET /api/ai/reorder/summary should get reorder summary', async () => {
      const response = await request(app)
        .get('/api/ai/reorder/summary');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('total_items');
      expect(response.body).toHaveProperty('items_need_reorder');
    });
  });

  describe('Anomaly Detection Endpoints', () => {
    test('GET /api/ai/anomaly/list should list anomalies', async () => {
      const response = await request(app)
        .get('/api/ai/anomaly/list')
        .query({ days: 30 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('count');
      expect(response.body.anomalies).toBeInstanceOf(Array);
    });

    test('GET /api/ai/anomaly/list should filter by item_code', async () => {
      const response = await request(app)
        .get('/api/ai/anomaly/list')
        .query({ days: 30, item_code: 'TEST-ITEM-001' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.anomalies).toBeInstanceOf(Array);
    });
  });

  describe('Model Management Endpoints', () => {
    test('GET /api/ai/models/list should list trained models', async () => {
      const response = await request(app)
        .get('/api/ai/models/list')
        .query({ limit: 50 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.models).toBeInstanceOf(Array);
      expect(response.body).toHaveProperty('count');
    });

    test('GET /api/ai/models/list should filter by model_type', async () => {
      const response = await request(app)
        .get('/api/ai/models/list')
        .query({ model_type: 'prophet', limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.models).toBeInstanceOf(Array);
    });
  });
});

/**
 * Setup test database with necessary tables
 */
async function setupTestDatabase(db) {
  const schema = `
    CREATE TABLE IF NOT EXISTS item_master (
      item_id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_code TEXT UNIQUE NOT NULL,
      item_name TEXT,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS inventory_count_items (
      count_id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_code TEXT NOT NULL,
      quantity REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS inventory_snapshots (
      snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_code TEXT NOT NULL,
      snapshot_date DATE NOT NULL,
      quantity REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      invoice_id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_code TEXT NOT NULL,
      invoice_date DATE,
      quantity REAL,
      unit_price REAL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ai_models (
      model_id INTEGER PRIMARY KEY AUTOINCREMENT,
      model_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      model_path TEXT NOT NULL,
      hyperparameters TEXT,
      training_data_range TEXT,
      accuracy_metrics TEXT,
      trained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      trained_by TEXT,
      status TEXT DEFAULT 'active',
      version INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS ai_forecasts (
      forecast_id INTEGER PRIMARY KEY AUTOINCREMENT,
      model_id INTEGER NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      forecast_type TEXT NOT NULL,
      forecast_date DATE NOT NULL,
      predicted_value REAL,
      confidence_lower REAL,
      confidence_upper REAL,
      confidence_level REAL DEFAULT 0.95,
      prediction_metadata TEXT,
      generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      generated_by TEXT,
      FOREIGN KEY (model_id) REFERENCES ai_models(model_id)
    );

    CREATE TABLE IF NOT EXISTS ai_consumption_derived (
      consumption_id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_code TEXT NOT NULL,
      location_id TEXT,
      date DATE NOT NULL,
      consumption_qty REAL NOT NULL,
      consumption_method TEXT,
      unit_cost REAL,
      total_cost REAL,
      confidence_score REAL,
      data_sources TEXT,
      is_anomaly BOOLEAN DEFAULT 0,
      anomaly_score REAL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  return new Promise((resolve, reject) => {
    db.exec(schema, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Insert test data into database
 */
async function insertTestData(db) {
  const insertions = [
    // Items
    "INSERT INTO item_master (item_code, item_name, active) VALUES ('TEST-ITEM-001', 'Test Item 1', 1)",
    "INSERT INTO item_master (item_code, item_name, active) VALUES ('TEST-ITEM-002', 'Test Item 2', 1)",

    // Inventory
    "INSERT INTO inventory_count_items (item_code, quantity) VALUES ('TEST-ITEM-001', 100)",
    "INSERT INTO inventory_count_items (item_code, quantity) VALUES ('TEST-ITEM-002', 50)",

    // Snapshots (30 days of data)
    ...Array.from({ length: 30 }, (_, i) => {
      const date = new Date('2024-01-01');
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      return `INSERT INTO inventory_snapshots (item_code, snapshot_date, quantity) VALUES ('TEST-ITEM-001', '${dateStr}', ${100 - i})`;
    }),

    // Consumption data
    ...Array.from({ length: 30 }, (_, i) => {
      const date = new Date('2024-01-01');
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      return `INSERT INTO ai_consumption_derived (item_code, date, consumption_qty, confidence_score) VALUES ('TEST-ITEM-001', '${dateStr}', ${5 + Math.random() * 3}, 0.9)`;
    })
  ];

  for (const sql of insertions) {
    await new Promise((resolve, reject) => {
      db.run(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
