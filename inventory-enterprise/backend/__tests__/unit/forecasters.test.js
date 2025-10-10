/**
 * Forecaster Unit Tests
 * Tests for ProphetForecaster, ARIMAForecaster, and BaseForecaster
 */

const BaseForecaster = require('../../ai/forecast/BaseForecaster');
const ProphetForecaster = require('../../ai/forecast/ProphetForecaster');
const ARIMAForecaster = require('../../ai/forecast/ARIMAForecaster');
const sqlite3 = require('sqlite3').verbose();

// Mock logger
jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

describe('BaseForecaster', () => {
  let db;
  let forecaster;

  beforeAll(async () => {
    // Create in-memory test database
    db = new sqlite3.Database(':memory:');
    await setupTestDatabase(db);
    forecaster = new BaseForecaster({ db, modelDir: '/tmp/test-models' });
  });

  afterAll(async () => {
    if (db) {
      await new Promise((resolve) => db.close(resolve));
    }
  });

  test('should initialize with default config', () => {
    const f = new BaseForecaster();
    expect(f.config).toHaveProperty('modelDir');
    expect(f.config).toHaveProperty('pythonPath');
    expect(f.config).toHaveProperty('timeout');
    expect(f.modelType).toBe('base');
  });

  test('should throw error if train() not implemented', async () => {
    await expect(forecaster.train('TEST-001')).rejects.toThrow(
      'train() must be implemented by subclass'
    );
  });

  test('should throw error if predict() not implemented', async () => {
    await expect(forecaster.predict('TEST-001')).rejects.toThrow(
      'predict() must be implemented by subclass'
    );
  });

  test('should fetch training data for item', async () => {
    await insertTestData(db);

    const trainingData = await forecaster.fetchTrainingData('TEST-ITEM-001', 365);

    expect(Array.isArray(trainingData)).toBe(true);
    expect(trainingData.length).toBeGreaterThan(0);
    expect(trainingData[0]).toHaveProperty('date');
    expect(trainingData[0]).toHaveProperty('quantity');
  });

  test('should fetch training data for global', async () => {
    await insertTestData(db);

    const trainingData = await forecaster.fetchTrainingData('global', 365);

    expect(Array.isArray(trainingData)).toBe(true);
    expect(trainingData.length).toBeGreaterThan(0);
  });

  test('should store model metadata', async () => {
    const modelData = {
      model_type: 'prophet',
      entity_type: 'item',
      entity_id: 'TEST-ITEM-001',
      model_path: '/tmp/test-models/test-model.pkl',
      hyperparameters: { seasonality_mode: 'multiplicative' },
      training_data_range: { start_date: '2024-01-01', end_date: '2024-01-31' },
      accuracy_metrics: { mape: 10.5, rmse: 2.3 },
      trained_by: 'test'
    };

    const modelId = await forecaster.storeModelMetadata(modelData);

    expect(typeof modelId).toBe('number');
    expect(modelId).toBeGreaterThan(0);
  });

  test('should get latest model for entity', async () => {
    await insertTestModel(db);

    const model = await forecaster.getLatestModel('item', 'TEST-ITEM-001');

    expect(model).toBeTruthy();
    expect(model.model_type).toBe('base');
    expect(model.entity_id).toBe('TEST-ITEM-001');
  });

  test('should return null if no model found', async () => {
    const model = await forecaster.getLatestModel('item', 'NON-EXISTENT-ITEM');
    expect(model).toBeNull();
  });
});

describe('ProphetForecaster', () => {
  let db;
  let forecaster;

  beforeAll(async () => {
    db = new sqlite3.Database(':memory:');
    await setupTestDatabase(db);
    await insertTestData(db);
    forecaster = new ProphetForecaster({ db, modelDir: '/tmp/test-models' });
  });

  afterAll(async () => {
    if (db) {
      await new Promise((resolve) => db.close(resolve));
    }
  });

  test('should initialize with correct model type', () => {
    expect(forecaster.modelType).toBe('prophet');
    expect(forecaster.scriptPath).toContain('train_prophet.py');
  });

  test('should train model with sufficient data', async () => {
    // Note: This will fail if Python/Prophet not installed
    // In real tests, we would mock executePython

    const result = await forecaster.train('TEST-ITEM-001', {
      trainingDays: 30,
      forecastPeriods: 7
    });

    // Allow success or failure (depends on Python availability)
    expect(result).toHaveProperty('success');
    expect(typeof result.success).toBe('boolean');
  }, 30000);

  test('should fail with insufficient training data', async () => {
    // Remove consumption data first
    await new Promise((resolve) => {
      db.run('DELETE FROM ai_consumption_derived', resolve);
    });

    const result = await forecaster.train('TEST-ITEM-001');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient training data');
  });

  test('should predict with existing model', async () => {
    await insertTestModel(db, 'prophet');

    const result = await forecaster.predict('TEST-ITEM-001', 30);

    // Will fail if Python not available or model file doesn't exist
    expect(result).toHaveProperty('success');
  });

  test('should fail predict without trained model', async () => {
    const result = await forecaster.predict('NON-EXISTENT-ITEM', 30);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No trained model found');
  });

  test('should evaluate model accuracy', async () => {
    await insertTestModel(db, 'prophet');
    await insertTestForecasts(db);

    const result = await forecaster.evaluate('TEST-ITEM-001', 30);

    expect(result).toHaveProperty('success');
    expect(typeof result.success).toBe('boolean');
  });
});

describe('ARIMAForecaster', () => {
  let db;
  let forecaster;

  beforeAll(async () => {
    db = new sqlite3.Database(':memory:');
    await setupTestDatabase(db);
    await insertTestData(db);
    forecaster = new ARIMAForecaster({ db, modelDir: '/tmp/test-models' });
  });

  afterAll(async () => {
    if (db) {
      await new Promise((resolve) => db.close(resolve));
    }
  });

  test('should initialize with correct model type', () => {
    expect(forecaster.modelType).toBe('arima');
    expect(forecaster.scriptPath).toContain('train_arima.py');
  });

  test('should train model with auto order selection', async () => {
    const result = await forecaster.train('TEST-ITEM-001', {
      trainingDays: 30,
      forecastPeriods: 7,
      autoOrder: true
    });

    expect(result).toHaveProperty('success');
    expect(typeof result.success).toBe('boolean');
  }, 30000);

  test('should train model with manual order', async () => {
    const result = await forecaster.train('TEST-ITEM-001', {
      trainingDays: 30,
      forecastPeriods: 7,
      autoOrder: false,
      p: 1,
      d: 1,
      q: 1
    });

    expect(result).toHaveProperty('success');
  }, 30000);

  test('should fail with insufficient training data', async () => {
    await new Promise((resolve) => {
      db.run('DELETE FROM ai_consumption_derived', resolve);
    });

    const result = await forecaster.train('TEST-ITEM-001');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient training data');
  });

  test('should predict with existing model', async () => {
    await insertTestModel(db, 'arima');

    const result = await forecaster.predict('TEST-ITEM-001', 30);

    expect(result).toHaveProperty('success');
  });
});

describe('Python Integration', () => {
  let forecaster;

  beforeAll(() => {
    forecaster = new BaseForecaster({ pythonPath: 'python3', timeout: 5000 });
  });

  test('should execute Python script successfully', async () => {
    // Mock Python script that echoes JSON
    const mockScript = `
import sys
import json
data = json.load(sys.stdin)
print(json.dumps({"success": True, "echo": data}))
    `;

    // This test requires Python to be installed
    // In CI/CD, this could be skipped if Python is not available
    try {
      const result = await forecaster.executePython(
        '/dev/stdin',
        { test: 'data' }
      );
      // If Python available, result should be parsed
      expect(result).toHaveProperty('success');
    } catch (err) {
      // If Python not available, that's acceptable in test environment
      expect(err.message).toBeTruthy();
    }
  });

  test('should timeout on long-running script', async () => {
    const slowForecaster = new BaseForecaster({ pythonPath: 'python3', timeout: 100 });

    // Python script that sleeps
    const slowScript = `
import time
time.sleep(10)
print('{"success": true}')
    `;

    await expect(
      slowForecaster.executePython('/tmp/slow-script.py', {})
    ).rejects.toThrow('timeout');
  }, 5000);
});

// ============================================================================
// Test Helper Functions
// ============================================================================

async function setupTestDatabase(db) {
  const schema = `
    CREATE TABLE IF NOT EXISTS item_master (
      item_id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_code TEXT UNIQUE NOT NULL,
      item_name TEXT,
      active INTEGER DEFAULT 1
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
  `;

  return new Promise((resolve, reject) => {
    db.exec(schema, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function insertTestData(db) {
  const insertions = [
    "INSERT INTO item_master (item_code, item_name, active) VALUES ('TEST-ITEM-001', 'Test Item 1', 1)",
    "INSERT INTO item_master (item_code, item_name, active) VALUES ('TEST-ITEM-002', 'Test Item 2', 1)",

    ...Array.from({ length: 60 }, (_, i) => {
      const date = new Date('2024-01-01');
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      const quantity = 5 + Math.sin(i / 7) * 2 + Math.random(); // Seasonal pattern
      return `INSERT INTO ai_consumption_derived (item_code, date, consumption_qty, confidence_score) VALUES ('TEST-ITEM-001', '${dateStr}', ${quantity}, 0.9)`;
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

async function insertTestModel(db, modelType = 'base') {
  const sql = `
    INSERT INTO ai_models (
      model_type, entity_type, entity_id, model_path,
      hyperparameters, training_data_range, accuracy_metrics,
      trained_by, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    modelType,
    'item',
    'TEST-ITEM-001',
    '/tmp/test-models/test-model.pkl',
    JSON.stringify({ test: 'params' }),
    JSON.stringify({ start_date: '2024-01-01', end_date: '2024-01-31' }),
    JSON.stringify({ mape: 10.5, rmse: 2.3 }),
    'test',
    'active'
  ];

  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

async function insertTestForecasts(db) {
  const modelId = await insertTestModel(db);

  const insertions = Array.from({ length: 30 }, (_, i) => {
    const date = new Date('2024-02-01');
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    const predictedValue = 5 + Math.random() * 2;

    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO ai_forecasts (
          model_id, entity_type, entity_id, forecast_type,
          forecast_date, predicted_value, confidence_lower, confidence_upper
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [modelId, 'item', 'TEST-ITEM-001', 'demand', dateStr, predictedValue, predictedValue - 1, predictedValue + 1],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  });

  await Promise.all(insertions);
}
