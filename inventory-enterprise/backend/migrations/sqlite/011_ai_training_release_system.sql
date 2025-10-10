-- Migration 011: AI Training & Release System
-- Supports local training on Apple Silicon, AI agent proposals, and owner-controlled releases

-- ============================================================================
-- AI Training Runs (local training execution logs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_training_runs (
  run_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  owner_id TEXT NOT NULL,
  run_type TEXT NOT NULL CHECK (run_type IN ('single_item', 'bulk_all', 'incremental')),
  model_type TEXT NOT NULL CHECK (model_type IN ('prophet', 'arima', 'isolation_forest', 'rl_policy')),
  item_code TEXT,
  horizon_days INTEGER,
  sample_count INTEGER,
  wall_clock_seconds REAL,
  memory_peak_mb REAL,
  throughput_items_per_sec REAL,
  mape REAL,
  rmse REAL,
  mae REAL,
  hardware_info TEXT, -- JSON: {cpu, cores, memory, blas_backend}
  artifact_path TEXT,
  artifact_size_bytes INTEGER,
  metadata TEXT, -- JSON: additional metrics
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_training_runs_tenant ON ai_training_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_training_runs_owner ON ai_training_runs(owner_id);
CREATE INDEX IF NOT EXISTS idx_training_runs_item ON ai_training_runs(item_code);
CREATE INDEX IF NOT EXISTS idx_training_runs_started ON ai_training_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_runs_status ON ai_training_runs(status);

-- ============================================================================
-- AI Agent Proposals (improvements proposed by AI)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_proposals (
  proposal_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  owner_id TEXT,
  proposal_type TEXT NOT NULL CHECK (proposal_type IN ('config_change', 'cache_ttl', 'safety_stock', 'reorder_point', 'parameter_tune')),
  entity_type TEXT, -- item, location, global
  entity_id TEXT,
  current_values TEXT, -- JSON
  proposed_values TEXT, -- JSON
  rationale TEXT NOT NULL,
  expected_kpi_deltas TEXT, -- JSON: {mape_delta: -5%, cache_hit_delta: +10%}
  blast_radius TEXT NOT NULL, -- "single_item", "location", "global"
  rollback_command TEXT NOT NULL,
  sandbox_eval_result TEXT, -- JSON: A/B test results
  risk_score REAL, -- 0.0-1.0
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'ready', 'approved', 'rejected', 'applied', 'reverted')),
  rejection_reason TEXT,
  applied_at TIMESTAMP,
  applied_by TEXT,
  reverted_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_proposals_tenant ON ai_proposals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON ai_proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_type ON ai_proposals(proposal_type);
CREATE INDEX IF NOT EXISTS idx_proposals_entity ON ai_proposals(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_proposals_created ON ai_proposals(created_at DESC);

-- ============================================================================
-- Release Bundles (prepared model/config releases)
-- ============================================================================
CREATE TABLE IF NOT EXISTS release_bundles (
  bundle_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  owner_id TEXT NOT NULL,
  version TEXT NOT NULL, -- semver: 3.2.0
  bundle_type TEXT NOT NULL CHECK (bundle_type IN ('models', 'config', 'full')),
  artifact_paths TEXT NOT NULL, -- JSON array of file paths
  checksums TEXT NOT NULL, -- JSON: {file: sha256}
  total_size_bytes INTEGER,
  training_metrics TEXT, -- JSON: aggregated MAPE/RMSE from all models
  system_snapshot TEXT, -- JSON: hardware, db mode, cache status at build time
  release_notes TEXT,
  status TEXT NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared', 'live', 'superseded', 'rolled_back')),
  promoted_at TIMESTAMP,
  rolled_back_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bundles_tenant ON release_bundles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bundles_owner ON release_bundles(owner_id);
CREATE INDEX IF NOT EXISTS idx_bundles_version ON release_bundles(version);
CREATE INDEX IF NOT EXISTS idx_bundles_status ON release_bundles(status);
CREATE INDEX IF NOT EXISTS idx_bundles_created ON release_bundles(created_at DESC);

-- ============================================================================
-- Release Audit (all promote/rollback actions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS release_audit (
  audit_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  bundle_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('prepare', 'promote', 'rollback')),
  previous_bundle_id TEXT,
  signature TEXT, -- optional cryptographic signature
  ip_address TEXT,
  user_agent TEXT,
  details TEXT, -- JSON: reason, confirmation timestamp, etc.
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bundle_id) REFERENCES release_bundles(bundle_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_release_audit_bundle ON release_audit(bundle_id);
CREATE INDEX IF NOT EXISTS idx_release_audit_owner ON release_audit(owner_id);
CREATE INDEX IF NOT EXISTS idx_release_audit_action ON release_audit(action);
CREATE INDEX IF NOT EXISTS idx_release_audit_created ON release_audit(created_at DESC);

-- ============================================================================
-- Owner Devices (for device binding/fingerprinting)
-- ============================================================================
-- Note: owner_devices table already exists from migration 010
-- Add device_lock_enabled flag to existing table if not present
ALTER TABLE owner_devices ADD COLUMN device_lock_enabled INTEGER DEFAULT 0;
ALTER TABLE owner_devices ADD COLUMN hardware_signature TEXT; -- Apple Silicon specific fingerprint

-- ============================================================================
-- Auth Tokens Refresh Tracking (for silent refresh)
-- ============================================================================
CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  refresh_token_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  access_token_jti TEXT NOT NULL, -- JWT ID of the access token
  refresh_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  device_fingerprint TEXT,
  ip_address TEXT,
  user_agent TEXT,
  revoked INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON auth_refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON auth_refresh_tokens(refresh_token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON auth_refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked ON auth_refresh_tokens(revoked);

-- ============================================================================
-- Migration Complete
-- ============================================================================
