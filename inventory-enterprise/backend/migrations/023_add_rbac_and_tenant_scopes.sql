/**
 * Migration 023: Add RBAC + Tenant Scoping for Multi-User v15.5.0
 *
 * Adds:
 * - User roles and permissions
 * - Tenant and location scoping to all finance and forecast tables
 * - Comprehensive audit logging
 * - Indexes for performance
 *
 * @version 15.5.0
 * @author NeuroPilot AI Team
 * @date 2025-10-13
 */

-- ============================================================================
-- 1. USER ROLES & PERMISSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('OWNER', 'FINANCE', 'OPS', 'READONLY')),
  tenant_id TEXT NOT NULL DEFAULT 'neuropilot',
  location_id TEXT,
  granted_by TEXT,
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  metadata TEXT, -- JSON
  PRIMARY KEY (user_id, tenant_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_email ON user_roles(email, active);
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant ON user_roles(tenant_id, active);

-- ============================================================================
-- 2. AUDIT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  user_email TEXT NOT NULL,
  user_role TEXT,
  tenant_id TEXT NOT NULL,
  location_id TEXT,
  action TEXT NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'IMPORT', 'EXPORT', 'APPROVE', 'ADJUST', 'MAP'
  entity TEXT NOT NULL, -- 'forecast', 'reconcile', 'document', 'mapping', 'vendor_rule'
  entity_id TEXT NOT NULL,
  before_json TEXT, -- JSON snapshot before
  after_json TEXT,  -- JSON snapshot after
  ip_address TEXT,
  user_agent TEXT,
  request_id TEXT,
  success INTEGER NOT NULL DEFAULT 1,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_ts ON ai_audit_log(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON ai_audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON ai_audit_log(user_email, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON ai_audit_log(action, timestamp DESC);

-- ============================================================================
-- 3. ADD TENANT/LOCATION SCOPING TO EXISTING TABLES
-- ============================================================================

-- ai_reconcile_history
ALTER TABLE ai_reconcile_history ADD COLUMN tenant_id TEXT DEFAULT 'neuropilot';
ALTER TABLE ai_reconcile_history ADD COLUMN location_id TEXT;
ALTER TABLE ai_reconcile_history ADD COLUMN created_by TEXT;
CREATE INDEX IF NOT EXISTS idx_reconcile_tenant_location ON ai_reconcile_history(tenant_id, location_id, reconcile_date DESC);

-- ai_forecast_history
ALTER TABLE ai_forecast_history ADD COLUMN tenant_id TEXT DEFAULT 'neuropilot';
ALTER TABLE ai_forecast_history ADD COLUMN location_id TEXT;
ALTER TABLE ai_forecast_history ADD COLUMN created_by TEXT;
CREATE INDEX IF NOT EXISTS idx_forecast_tenant_location ON ai_forecast_history(tenant_id, location_id, forecast_for_date DESC);

-- ai_forecast_runs
ALTER TABLE ai_forecast_runs ADD COLUMN tenant_id TEXT DEFAULT 'neuropilot';
ALTER TABLE ai_forecast_runs ADD COLUMN created_by TEXT;
CREATE INDEX IF NOT EXISTS idx_forecast_runs_tenant ON ai_forecast_runs(tenant_id, started_at DESC);

-- ai_forecast_accuracy
ALTER TABLE ai_forecast_accuracy ADD COLUMN tenant_id TEXT DEFAULT 'neuropilot';
CREATE INDEX IF NOT EXISTS idx_forecast_accuracy_tenant ON ai_forecast_accuracy(tenant_id, calculation_date DESC);

-- ai_feedback_loop
ALTER TABLE ai_feedback_loop ADD COLUMN tenant_id TEXT DEFAULT 'neuropilot';
CREATE INDEX IF NOT EXISTS idx_feedback_tenant ON ai_feedback_loop(tenant_id, submitted_at DESC);

-- financial_usage_data (if exists)
-- This table may be referenced by finance summaries
-- Check if it exists first, then add columns

-- ============================================================================
-- 4. TENANT & LOCATION MASTER TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenants (
  tenant_id TEXT PRIMARY KEY,
  tenant_name TEXT NOT NULL,
  industry TEXT,
  timezone TEXT DEFAULT 'America/New_York',
  fiscal_year_start TEXT DEFAULT '01-01', -- MM-DD format
  active INTEGER NOT NULL DEFAULT 1,
  settings TEXT, -- JSON: { ocr_enabled, pdf_import_path, backup_retention_days }
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS locations (
  location_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  location_name TEXT NOT NULL,
  address TEXT,
  contact_email TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  settings TEXT, -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_locations_tenant ON locations(tenant_id, active);

-- ============================================================================
-- 5. DEFAULT TENANT & LOCATION
-- ============================================================================

INSERT OR IGNORE INTO tenants (tenant_id, tenant_name, industry, timezone, active)
VALUES ('neuropilot', 'NeuroPilot Default Tenant', 'Restaurant/Hospitality', 'America/New_York', 1);

INSERT OR IGNORE INTO locations (location_id, tenant_id, location_name, active)
VALUES ('loc-001', 'neuropilot', 'Main Location', 1);

-- ============================================================================
-- 6. SESSIONS TABLE (for JWT refresh tokens)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  device_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  last_accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(refresh_token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);

-- ============================================================================
-- 7. PERMISSION CHECKS VIEW
-- ============================================================================

CREATE VIEW IF NOT EXISTS v_active_user_permissions AS
SELECT
  ur.user_id,
  ur.email,
  ur.role,
  ur.tenant_id,
  ur.location_id,
  ur.granted_at,
  ur.expires_at,
  t.tenant_name,
  l.location_name
FROM user_roles ur
JOIN tenants t ON ur.tenant_id = t.tenant_id
LEFT JOIN locations l ON ur.location_id = l.location_id
WHERE ur.active = 1
  AND t.active = 1
  AND (l.active = 1 OR l.active IS NULL)
  AND (ur.expires_at IS NULL OR datetime(ur.expires_at) > datetime('now'));

-- ============================================================================
-- 8. AUDIT SUMMARY VIEWS
-- ============================================================================

CREATE VIEW IF NOT EXISTS v_audit_summary_by_user AS
SELECT
  user_email,
  tenant_id,
  COUNT(*) as total_actions,
  SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_actions,
  SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_actions,
  MAX(timestamp) as last_action_at
FROM ai_audit_log
WHERE timestamp >= date('now', '-30 days')
GROUP BY user_email, tenant_id;

CREATE VIEW IF NOT EXISTS v_audit_recent_failures AS
SELECT
  timestamp,
  user_email,
  tenant_id,
  action,
  entity,
  entity_id,
  error_message
FROM ai_audit_log
WHERE success = 0
  AND timestamp >= datetime('now', '-7 days')
ORDER BY timestamp DESC
LIMIT 100;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Record migration
INSERT OR REPLACE INTO schema_version (version, applied_at, description)
VALUES (23, datetime('now'), 'Add RBAC and tenant scoping for multi-user v15.5.0');
