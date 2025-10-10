-- PostgreSQL Initial Schema Migration
-- Mirrors SQLite schema with PostgreSQL-specific optimizations

-- ============================================================================
-- USER MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  user_id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'user')),
  two_factor_secret VARCHAR(255),
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP,
  active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  version INTEGER DEFAULT 1
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);

-- ============================================================================
-- ITEM MASTER
-- ============================================================================

CREATE TABLE IF NOT EXISTS item_master (
  item_id SERIAL PRIMARY KEY,
  item_code VARCHAR(255) UNIQUE NOT NULL,
  item_name TEXT NOT NULL,
  item_name_fr TEXT,
  category VARCHAR(255),
  unit VARCHAR(50) DEFAULT 'each',
  barcode VARCHAR(255),
  par_level DECIMAL(10,2) DEFAULT 0,
  reorder_point DECIMAL(10,2) DEFAULT 0,
  unit_cost DECIMAL(10,2) DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  version INTEGER DEFAULT 1
);

CREATE INDEX idx_item_master_code ON item_master(item_code);
CREATE INDEX idx_item_master_barcode ON item_master(barcode);
CREATE INDEX idx_item_master_category ON item_master(category);
CREATE INDEX idx_item_master_active ON item_master(active);

-- ============================================================================
-- INVENTORY COUNTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_counts (
  count_id SERIAL PRIMARY KEY,
  count_name VARCHAR(255) NOT NULL,
  count_date DATE NOT NULL,
  count_type VARCHAR(50) DEFAULT 'periodic' CHECK (count_type IN ('periodic', 'physical', 'cycle')),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  counted_by INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  version INTEGER DEFAULT 1,
  FOREIGN KEY (counted_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX idx_inventory_counts_date ON inventory_counts(count_date DESC);
CREATE INDEX idx_inventory_counts_status ON inventory_counts(status);

CREATE TABLE IF NOT EXISTS inventory_count_items (
  count_item_id SERIAL PRIMARY KEY,
  count_id INTEGER,
  item_code VARCHAR(255) NOT NULL,
  quantity DECIMAL(10,2) DEFAULT 0,
  location VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  version INTEGER DEFAULT 1,
  FOREIGN KEY (count_id) REFERENCES inventory_counts(count_id) ON DELETE CASCADE,
  FOREIGN KEY (item_code) REFERENCES item_master(item_code) ON DELETE CASCADE
);

CREATE INDEX idx_count_items_count_id ON inventory_count_items(count_id);
CREATE INDEX idx_count_items_item_code ON inventory_count_items(item_code);

-- ============================================================================
-- INVENTORY SNAPSHOTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_snapshots (
  snapshot_id SERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  snapshot_name VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  version INTEGER DEFAULT 1,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX idx_snapshots_date ON inventory_snapshots(snapshot_date DESC);

CREATE TABLE IF NOT EXISTS inventory_snapshot_items (
  snapshot_item_id SERIAL PRIMARY KEY,
  snapshot_id INTEGER NOT NULL,
  item_code VARCHAR(255) NOT NULL,
  quantity DECIMAL(10,2) DEFAULT 0,
  unit_cost DECIMAL(10,2) DEFAULT 0,
  total_value DECIMAL(10,2) DEFAULT 0,
  location VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (snapshot_id) REFERENCES inventory_snapshots(snapshot_id) ON DELETE CASCADE,
  FOREIGN KEY (item_code) REFERENCES item_master(item_code) ON DELETE CASCADE
);

CREATE INDEX idx_snapshot_items_snapshot ON inventory_snapshot_items(snapshot_id);
CREATE INDEX idx_snapshot_items_item ON inventory_snapshot_items(item_code);

-- ============================================================================
-- INVOICES & ORDERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS processed_invoices (
  invoice_id SERIAL PRIMARY KEY,
  invoice_number VARCHAR(255) UNIQUE,
  supplier VARCHAR(255),
  invoice_date DATE,
  total_amount DECIMAL(10,2),
  tax_amount DECIMAL(10,2),
  subtotal DECIMAL(10,2),
  status VARCHAR(50) DEFAULT 'processed' CHECK (status IN ('pending', 'processed', 'paid', 'cancelled')),
  pdf_path TEXT,
  processed_by INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  version INTEGER DEFAULT 1,
  FOREIGN KEY (processed_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX idx_invoices_number ON processed_invoices(invoice_number);
CREATE INDEX idx_invoices_date ON processed_invoices(invoice_date DESC);
CREATE INDEX idx_invoices_supplier ON processed_invoices(supplier);
CREATE INDEX idx_invoices_status ON processed_invoices(status);

CREATE TABLE IF NOT EXISTS invoice_items (
  invoice_item_id SERIAL PRIMARY KEY,
  invoice_id INTEGER,
  item_code VARCHAR(255) NOT NULL,
  item_name TEXT,
  quantity DECIMAL(10,2) DEFAULT 0,
  unit_price DECIMAL(10,2) DEFAULT 0,
  total_price DECIMAL(10,2) DEFAULT 0,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  line_number INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  version INTEGER DEFAULT 1,
  FOREIGN KEY (invoice_id) REFERENCES processed_invoices(invoice_id) ON DELETE CASCADE,
  FOREIGN KEY (item_code) REFERENCES item_master(item_code) ON DELETE SET NULL
);

CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX idx_invoice_items_item ON invoice_items(item_code);

-- ============================================================================
-- STORAGE LOCATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS storage_locations (
  location_id SERIAL PRIMARY KEY,
  location_name VARCHAR(255) UNIQUE NOT NULL,
  location_type VARCHAR(50) CHECK (location_type IN ('warehouse', 'shelf', 'bin', 'cooler', 'freezer')),
  parent_location_id INTEGER,
  capacity DECIMAL(10,2),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_location_id) REFERENCES storage_locations(location_id) ON DELETE SET NULL
);

CREATE INDEX idx_locations_name ON storage_locations(location_name);
CREATE INDEX idx_locations_type ON storage_locations(location_type);

CREATE TABLE IF NOT EXISTS location_assignments (
  assignment_id SERIAL PRIMARY KEY,
  item_code VARCHAR(255) NOT NULL,
  location_id INTEGER NOT NULL,
  quantity DECIMAL(10,2) DEFAULT 0,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assigned_by INTEGER,
  FOREIGN KEY (item_code) REFERENCES item_master(item_code) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES storage_locations(location_id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX idx_assignments_item ON location_assignments(item_code);
CREATE INDEX idx_assignments_location ON location_assignments(location_id);

-- ============================================================================
-- TRANSACTION LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS transaction_log (
  log_id SERIAL PRIMARY KEY,
  transaction_id VARCHAR(255) UNIQUE NOT NULL,
  transaction_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(255),
  user_id INTEGER,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data JSONB,
  checksum VARCHAR(255),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX idx_transaction_log_type ON transaction_log(transaction_type);
CREATE INDEX idx_transaction_log_entity ON transaction_log(entity_type, entity_id);
CREATE INDEX idx_transaction_log_timestamp ON transaction_log(timestamp DESC);
CREATE INDEX idx_transaction_log_data ON transaction_log USING GIN(data);

-- ============================================================================
-- AI INTELLIGENCE LAYER (v2.1)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_models (
  model_id SERIAL PRIMARY KEY,
  model_type VARCHAR(50) NOT NULL CHECK(model_type IN ('prophet', 'arima', 'lstm', 'isolation_forest', 'q_learning')),
  entity_type VARCHAR(50) NOT NULL CHECK(entity_type IN ('item', 'location', 'global')),
  entity_id VARCHAR(255),
  model_path TEXT NOT NULL,
  hyperparameters JSONB,
  training_data_range JSONB,
  accuracy_metrics JSONB,
  feature_importance JSONB,
  trained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  trained_by VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active' CHECK(status IN ('active', 'archived', 'failed')),
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(model_type, entity_type, entity_id, version)
);

CREATE INDEX idx_ai_models_type_entity ON ai_models(model_type, entity_type, entity_id);
CREATE INDEX idx_ai_models_status ON ai_models(status, trained_at DESC);

CREATE TABLE IF NOT EXISTS ai_forecasts (
  forecast_id SERIAL PRIMARY KEY,
  model_id INTEGER NOT NULL,
  entity_type VARCHAR(50) NOT NULL CHECK(entity_type IN ('item', 'location', 'global')),
  entity_id VARCHAR(255),
  forecast_type VARCHAR(50) NOT NULL CHECK(forecast_type IN ('demand', 'consumption', 'stockout', 'reorder')),
  forecast_date DATE NOT NULL,
  predicted_value DECIMAL(10,4),
  confidence_lower DECIMAL(10,4),
  confidence_upper DECIMAL(10,4),
  confidence_level DECIMAL(3,2) DEFAULT 0.95,
  prediction_metadata JSONB,
  actual_value DECIMAL(10,4),
  accuracy_error DECIMAL(10,4),
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  generated_by VARCHAR(255),
  is_backtest BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (model_id) REFERENCES ai_models(model_id) ON DELETE CASCADE
);

CREATE INDEX idx_ai_forecasts_entity ON ai_forecasts(entity_type, entity_id, forecast_date);
CREATE INDEX idx_ai_forecasts_model ON ai_forecasts(model_id, forecast_date);

CREATE TABLE IF NOT EXISTS ai_consumption_derived (
  consumption_id SERIAL PRIMARY KEY,
  item_code VARCHAR(255) NOT NULL,
  location_id INTEGER,
  date DATE NOT NULL,
  consumption_qty DECIMAL(10,4) NOT NULL,
  consumption_method VARCHAR(50) CHECK(consumption_method IN ('fifo', 'lifo', 'avg', 'actual')),
  unit_cost DECIMAL(10,4),
  total_cost DECIMAL(10,4),
  confidence_score DECIMAL(3,2),
  data_sources JSONB,
  calculation_metadata JSONB,
  is_anomaly BOOLEAN DEFAULT FALSE,
  anomaly_score DECIMAL(10,4),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(item_code, location_id, date)
);

CREATE INDEX idx_ai_consumption_item_date ON ai_consumption_derived(item_code, date DESC);
CREATE INDEX idx_ai_consumption_anomaly ON ai_consumption_derived(is_anomaly, date DESC);

CREATE TABLE IF NOT EXISTS ai_training_jobs (
  job_id SERIAL PRIMARY KEY,
  model_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed')),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_seconds DECIMAL(10,2),
  error_message TEXT,
  result_model_id INTEGER,
  training_config JSONB,
  triggered_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (result_model_id) REFERENCES ai_models(model_id) ON DELETE SET NULL
);

CREATE INDEX idx_ai_training_jobs_status ON ai_training_jobs(status, created_at DESC);

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to all tables with updated_at column
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_item_master_updated_at BEFORE UPDATE ON item_master FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_inventory_counts_updated_at BEFORE UPDATE ON inventory_counts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_count_items_updated_at BEFORE UPDATE ON inventory_count_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON processed_invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON storage_locations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ai_models_updated_at BEFORE UPDATE ON ai_models FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ai_consumption_updated_at BEFORE UPDATE ON ai_consumption_derived FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMPLETE
-- ============================================================================

COMMENT ON DATABASE CURRENT_DATABASE() IS 'Inventory Enterprise v2.1 - PostgreSQL Schema';
