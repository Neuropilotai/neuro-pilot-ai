-- SQLite Initial Schema Migration
-- Enterprise Inventory Management System v3.0.0

-- ============================================================================
-- USER MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  user_id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  two_factor_secret TEXT,
  two_factor_enabled INTEGER DEFAULT 0,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP,
  active INTEGER DEFAULT 1,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  version INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================================================
-- ITEM MASTER
-- ============================================================================

CREATE TABLE IF NOT EXISTS item_master (
  item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_code TEXT UNIQUE NOT NULL,
  item_name TEXT NOT NULL,
  item_name_fr TEXT,
  category TEXT,
  unit TEXT DEFAULT 'each',
  barcode TEXT,
  par_level REAL DEFAULT 0,
  reorder_point REAL DEFAULT 0,
  unit_cost REAL DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  version INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_item_master_code ON item_master(item_code);
CREATE INDEX IF NOT EXISTS idx_item_master_barcode ON item_master(barcode);
CREATE INDEX IF NOT EXISTS idx_item_master_category ON item_master(category);
CREATE INDEX IF NOT EXISTS idx_item_master_active ON item_master(active);

-- ============================================================================
-- INVENTORY COUNTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_counts (
  count_id INTEGER PRIMARY KEY AUTOINCREMENT,
  count_name TEXT NOT NULL,
  count_date DATE NOT NULL,
  count_type TEXT DEFAULT 'periodic',
  status TEXT DEFAULT 'pending',
  counted_by INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  version INTEGER DEFAULT 1,
  FOREIGN KEY (counted_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_counts_date ON inventory_counts(count_date DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_status ON inventory_counts(status);

CREATE TABLE IF NOT EXISTS inventory_count_items (
  count_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  count_id INTEGER,
  item_code TEXT NOT NULL,
  quantity REAL DEFAULT 0,
  location TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  version INTEGER DEFAULT 1,
  FOREIGN KEY (count_id) REFERENCES inventory_counts(count_id) ON DELETE CASCADE,
  FOREIGN KEY (item_code) REFERENCES item_master(item_code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_count_items_count_id ON inventory_count_items(count_id);
CREATE INDEX IF NOT EXISTS idx_count_items_item_code ON inventory_count_items(item_code);

-- ============================================================================
-- INVENTORY SNAPSHOTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_snapshots (
  snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date DATE NOT NULL,
  snapshot_name TEXT,
  status TEXT DEFAULT 'active',
  created_by INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  version INTEGER DEFAULT 1,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_date ON inventory_snapshots(snapshot_date DESC);

CREATE TABLE IF NOT EXISTS inventory_snapshot_items (
  snapshot_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL,
  item_code TEXT NOT NULL,
  quantity REAL DEFAULT 0,
  unit_cost REAL DEFAULT 0,
  total_value REAL DEFAULT 0,
  location TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (snapshot_id) REFERENCES inventory_snapshots(snapshot_id) ON DELETE CASCADE,
  FOREIGN KEY (item_code) REFERENCES item_master(item_code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_snapshot_items_snapshot ON inventory_snapshot_items(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_snapshot_items_item ON inventory_snapshot_items(item_code);

-- ============================================================================
-- INVOICES & ORDERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS processed_invoices (
  invoice_id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE,
  supplier TEXT,
  invoice_date DATE,
  total_amount REAL,
  tax_amount REAL,
  subtotal REAL,
  status TEXT DEFAULT 'processed',
  pdf_path TEXT,
  processed_by INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  version INTEGER DEFAULT 1,
  FOREIGN KEY (processed_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_invoices_number ON processed_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON processed_invoices(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON processed_invoices(supplier);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON processed_invoices(status);

CREATE TABLE IF NOT EXISTS invoice_items (
  invoice_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER,
  item_code TEXT NOT NULL,
  item_name TEXT,
  quantity REAL DEFAULT 0,
  unit_price REAL DEFAULT 0,
  total_price REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  line_number INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  version INTEGER DEFAULT 1,
  FOREIGN KEY (invoice_id) REFERENCES processed_invoices(invoice_id) ON DELETE CASCADE,
  FOREIGN KEY (item_code) REFERENCES item_master(item_code) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_item ON invoice_items(item_code);

-- ============================================================================
-- STORAGE LOCATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS storage_locations (
  location_id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_name TEXT UNIQUE NOT NULL,
  location_type TEXT,
  parent_location_id INTEGER,
  capacity REAL,
  active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_location_id) REFERENCES storage_locations(location_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_locations_name ON storage_locations(location_name);
CREATE INDEX IF NOT EXISTS idx_locations_type ON storage_locations(location_type);

CREATE TABLE IF NOT EXISTS location_assignments (
  assignment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_code TEXT NOT NULL,
  location_id INTEGER NOT NULL,
  quantity REAL DEFAULT 0,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assigned_by INTEGER,
  FOREIGN KEY (item_code) REFERENCES item_master(item_code) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES storage_locations(location_id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_assignments_item ON location_assignments(item_code);
CREATE INDEX IF NOT EXISTS idx_assignments_location ON location_assignments(location_id);

-- ============================================================================
-- TRANSACTION LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS transaction_log (
  log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT UNIQUE NOT NULL,
  transaction_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  user_id INTEGER,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data TEXT,
  checksum TEXT,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_transaction_log_type ON transaction_log(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transaction_log_entity ON transaction_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_transaction_log_timestamp ON transaction_log(timestamp DESC);

-- ============================================================================
-- AI INTELLIGENCE LAYER (v2.1)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_models (
  model_id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  model_path TEXT NOT NULL,
  hyperparameters TEXT,
  training_data_range TEXT,
  accuracy_metrics TEXT,
  feature_importance TEXT,
  trained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  trained_by TEXT,
  status TEXT DEFAULT 'active',
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(model_type, entity_type, entity_id, version)
);

CREATE INDEX IF NOT EXISTS idx_ai_models_type_entity ON ai_models(model_type, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ai_models_status ON ai_models(status, trained_at DESC);

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
  actual_value REAL,
  accuracy_error REAL,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  generated_by TEXT,
  is_backtest INTEGER DEFAULT 0,
  FOREIGN KEY (model_id) REFERENCES ai_models(model_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_forecasts_entity ON ai_forecasts(entity_type, entity_id, forecast_date);
CREATE INDEX IF NOT EXISTS idx_ai_forecasts_model ON ai_forecasts(model_id, forecast_date);

CREATE TABLE IF NOT EXISTS ai_consumption_derived (
  consumption_id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_code TEXT NOT NULL,
  location_id INTEGER,
  date DATE NOT NULL,
  consumption_qty REAL NOT NULL,
  consumption_method TEXT,
  unit_cost REAL,
  total_cost REAL,
  confidence_score REAL,
  data_sources TEXT,
  calculation_metadata TEXT,
  is_anomaly INTEGER DEFAULT 0,
  anomaly_score REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(item_code, location_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ai_consumption_item_date ON ai_consumption_derived(item_code, date DESC);
CREATE INDEX IF NOT EXISTS idx_ai_consumption_anomaly ON ai_consumption_derived(is_anomaly, date DESC);

CREATE TABLE IF NOT EXISTS ai_training_jobs (
  job_id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  status TEXT DEFAULT 'pending',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_seconds REAL,
  error_message TEXT,
  result_model_id INTEGER,
  training_config TEXT,
  triggered_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (result_model_id) REFERENCES ai_models(model_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_training_jobs_status ON ai_training_jobs(status, created_at DESC);

-- ============================================================================
-- COMPLETE
-- ============================================================================
