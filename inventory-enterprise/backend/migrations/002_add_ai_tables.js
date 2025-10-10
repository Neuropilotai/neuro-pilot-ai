// Migration: AI Intelligence Layer Schema
// Creates tables for AI forecasting, model storage, and consumption tracking

module.exports = {
  up: (db) => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        // 1. AI Models table - stores trained model metadata
        db.run(`
          CREATE TABLE IF NOT EXISTS ai_models (
            model_id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_type TEXT NOT NULL CHECK(model_type IN ('prophet', 'arima', 'lstm', 'isolation_forest', 'q_learning')),
            entity_type TEXT NOT NULL CHECK(entity_type IN ('item', 'location', 'global')),
            entity_id TEXT, -- item_code, location_id, or NULL for global
            model_path TEXT NOT NULL, -- file path to serialized model
            hyperparameters TEXT, -- JSON: model-specific params
            training_data_range TEXT, -- JSON: {start_date, end_date, num_records}
            accuracy_metrics TEXT, -- JSON: {mape, rmse, mae, r2}
            feature_importance TEXT, -- JSON: feature weights (for tree models)
            trained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            trained_by TEXT, -- user_id or 'system'
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived', 'failed')),
            version INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(model_type, entity_type, entity_id, version)
          );
        `, (err) => {
          if (err) return reject(err);
        });

        // 2. AI Forecasts table - stores forecast predictions
        db.run(`
          CREATE TABLE IF NOT EXISTS ai_forecasts (
            forecast_id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_id INTEGER NOT NULL,
            entity_type TEXT NOT NULL CHECK(entity_type IN ('item', 'location', 'global')),
            entity_id TEXT, -- item_code or location_id
            forecast_type TEXT NOT NULL CHECK(forecast_type IN ('demand', 'consumption', 'stockout', 'reorder')),
            forecast_date DATE NOT NULL, -- date this forecast applies to
            predicted_value REAL, -- quantity or probability
            confidence_lower REAL, -- lower bound of confidence interval
            confidence_upper REAL, -- upper bound of confidence interval
            confidence_level REAL DEFAULT 0.95, -- 95% confidence interval
            prediction_metadata TEXT, -- JSON: additional context
            actual_value REAL, -- for backtesting (filled later)
            accuracy_error REAL, -- absolute percentage error (filled later)
            generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            generated_by TEXT, -- 'scheduled', 'api', or user_id
            is_backtest BOOLEAN DEFAULT 0,
            FOREIGN KEY (model_id) REFERENCES ai_models(model_id) ON DELETE CASCADE
          );
        `, (err) => {
          if (err) return reject(err);
        });

        // 3. AI Consumption Derived table - computed consumption patterns
        db.run(`
          CREATE TABLE IF NOT EXISTS ai_consumption_derived (
            consumption_id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_code TEXT NOT NULL,
            location_id TEXT,
            date DATE NOT NULL,
            consumption_qty REAL NOT NULL, -- derived from inventory delta + orders
            consumption_method TEXT CHECK(consumption_method IN ('fifo', 'lifo', 'avg', 'actual')),
            unit_cost REAL,
            total_cost REAL,
            confidence_score REAL, -- 0-1, how confident we are in this derivation
            data_sources TEXT, -- JSON: array of invoice_ids or snapshot_ids used
            calculation_metadata TEXT, -- JSON: calculation details
            is_anomaly BOOLEAN DEFAULT 0,
            anomaly_score REAL, -- isolation forest score if detected
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(item_code, location_id, date)
          );
        `, (err) => {
          if (err) return reject(err);
        });

        // 4. AI Training Jobs table - track model training runs
        db.run(`
          CREATE TABLE IF NOT EXISTS ai_training_jobs (
            job_id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_type TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed')),
            started_at TIMESTAMP,
            completed_at TIMESTAMP,
            duration_seconds REAL,
            error_message TEXT,
            result_model_id INTEGER,
            training_config TEXT, -- JSON: hyperparameters and settings
            triggered_by TEXT, -- 'scheduled', 'manual', or user_id
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (result_model_id) REFERENCES ai_models(model_id)
          );
        `, (err) => {
          if (err) return reject(err);
        });

        // Create indexes for query performance
        db.run(`CREATE INDEX IF NOT EXISTS idx_ai_models_type_entity ON ai_models(model_type, entity_type, entity_id);`, (err) => {
          if (err) return reject(err);
        });

        db.run(`CREATE INDEX IF NOT EXISTS idx_ai_models_status ON ai_models(status, trained_at DESC);`, (err) => {
          if (err) return reject(err);
        });

        db.run(`CREATE INDEX IF NOT EXISTS idx_ai_forecasts_entity ON ai_forecasts(entity_type, entity_id, forecast_date);`, (err) => {
          if (err) return reject(err);
        });

        db.run(`CREATE INDEX IF NOT EXISTS idx_ai_forecasts_model ON ai_forecasts(model_id, forecast_date);`, (err) => {
          if (err) return reject(err);
        });

        db.run(`CREATE INDEX IF NOT EXISTS idx_ai_consumption_item_date ON ai_consumption_derived(item_code, date DESC);`, (err) => {
          if (err) return reject(err);
        });

        db.run(`CREATE INDEX IF NOT EXISTS idx_ai_consumption_anomaly ON ai_consumption_derived(is_anomaly, date DESC);`, (err) => {
          if (err) return reject(err);
        });

        db.run(`CREATE INDEX IF NOT EXISTS idx_ai_training_jobs_status ON ai_training_jobs(status, created_at DESC);`, (err) => {
          if (err) return reject(err);
        });

        console.log('✅ Migration 002: AI tables created successfully');
        resolve();
      });
    });
  },

  down: (db) => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('DROP TABLE IF EXISTS ai_training_jobs;', (err) => {
          if (err) return reject(err);
        });
        db.run('DROP TABLE IF EXISTS ai_forecasts;', (err) => {
          if (err) return reject(err);
        });
        db.run('DROP TABLE IF EXISTS ai_consumption_derived;', (err) => {
          if (err) return reject(err);
        });
        db.run('DROP TABLE IF EXISTS ai_models;', (err) => {
          if (err) return reject(err);
        });
        console.log('✅ Migration 002: AI tables dropped successfully');
        resolve();
      });
    });
  }
};
