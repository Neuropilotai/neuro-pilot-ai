-- v3.1.0: Local AI Training & Owner-Gated Releases

-- Training runs with REAL measured metrics
CREATE TABLE IF NOT EXISTS ai_local_training_runs (
  id TEXT PRIMARY KEY,
  item_code TEXT NOT NULL,
  model_type TEXT NOT NULL CHECK (model_type IN ('prophet', 'arima')),
  horizon INTEGER NOT NULL,
  mape REAL,
  rmse REAL,
  mae REAL,
  wall_sec REAL NOT NULL,
  peak_mb REAL NOT NULL,
  samples INTEGER NOT NULL,
  hw_fingerprint TEXT NOT NULL,
  started_at TIMESTAMP NOT NULL,
  finished_at TIMESTAMP NOT NULL,
  logs_path TEXT
);

CREATE INDEX IF NOT EXISTS idx_training_runs_item ON ai_local_training_runs(item_code);
CREATE INDEX IF NOT EXISTS idx_training_runs_started ON ai_local_training_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_runs_hw ON ai_local_training_runs(hw_fingerprint);

-- Release manifests
CREATE TABLE IF NOT EXISTS ai_release_manifests (
  manifest_id TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('prepared', 'promoted', 'superseded', 'rolled_back')),
  prepared_at TIMESTAMP NOT NULL,
  promoted_at TIMESTAMP,
  rolled_back_at TIMESTAMP,
  prepared_by TEXT NOT NULL,
  promoted_by TEXT,
  rollback_by TEXT,
  hw_fingerprint TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_manifests_status ON ai_release_manifests(status);
CREATE INDEX IF NOT EXISTS idx_manifests_prepared ON ai_release_manifests(prepared_at DESC);

-- Release artifacts (models)
CREATE TABLE IF NOT EXISTS ai_release_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manifest_id TEXT NOT NULL,
  item_code TEXT NOT NULL,
  model_type TEXT NOT NULL,
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  FOREIGN KEY (manifest_id) REFERENCES ai_release_manifests(manifest_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_artifacts_manifest ON ai_release_artifacts(manifest_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_item ON ai_release_artifacts(item_code);

-- AI tuning proposals (for daily agent)
CREATE TABLE IF NOT EXISTS ai_tuning_proposals (
  proposal_id TEXT PRIMARY KEY,
  proposal_type TEXT NOT NULL CHECK (proposal_type IN ('retrain', 'parameter_tune', 'model_switch')),
  item_codes TEXT NOT NULL,
  reason TEXT NOT NULL,
  risk_score REAL NOT NULL CHECK (risk_score BETWEEN 0.0 AND 1.0),
  expected_delta TEXT NOT NULL,
  rollback_plan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected', 'applied')),
  proposed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP,
  reviewed_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_proposals_status ON ai_tuning_proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_proposed ON ai_tuning_proposals(proposed_at DESC);
