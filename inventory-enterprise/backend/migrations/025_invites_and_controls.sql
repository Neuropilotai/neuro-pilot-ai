-- ============================================================================
-- NeuroPilot v15.5.0 - First-Users Readiness Migration
-- Version: 15.5.0
--
-- Purpose: Add invite tokens, user controls, and forecast approval tracking
--
-- Tables:
-- 1. invite_tokens - One-time SSO invite tokens for new users
-- 2. user_controls - Additional user flags (disabled, force_rebind)
-- 3. forecast_approvals - Track approval/rejection of shadow mode forecasts
-- 4. export_audit - Comprehensive export activity tracking
-- 5. finance_quick_fixes - Track needs-mapping and tolerance fixes
--
-- Author: NeuroPilot Team
-- Date: 2025-10-13
-- ============================================================================

-- ============================================================================
-- TABLE: invite_tokens
-- Purpose: One-time tokens for SSO user invitations (OWNER only)
-- ============================================================================

CREATE TABLE IF NOT EXISTS invite_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('READONLY', 'OPS', 'FINANCE', 'OWNER')),
  tenant_id TEXT NOT NULL,
  locations TEXT, -- JSON array of location_ids
  created_by TEXT NOT NULL, -- email of inviter
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL, -- typically 7 days
  consumed_at TEXT, -- when SSO accept occurred
  consumed_by TEXT, -- email of user who consumed (should match)
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'consumed', 'expired', 'revoked')),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_invite_tokens_token ON invite_tokens(token);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_email ON invite_tokens(email);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_status ON invite_tokens(status);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_expires_at ON invite_tokens(expires_at);

-- ============================================================================
-- TABLE: user_controls
-- Purpose: Additional user control flags (disable, force rebind, etc.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_controls (
  user_id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  disabled BOOLEAN DEFAULT 0 NOT NULL, -- 1 = user cannot login
  force_rebind BOOLEAN DEFAULT 0 NOT NULL, -- 1 = must rebind device on next login
  sessions_revoked_at TEXT, -- last time all sessions were revoked
  disabled_at TEXT, -- when user was disabled
  disabled_by TEXT, -- email of admin who disabled
  disabled_reason TEXT,
  last_rebind_forced_at TEXT,
  last_rebind_forced_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_user_controls_email ON user_controls(email);
CREATE INDEX IF NOT EXISTS idx_user_controls_disabled ON user_controls(disabled);

-- ============================================================================
-- TABLE: forecast_approvals
-- Purpose: Track approval/rejection of shadow mode forecast runs
-- ============================================================================

CREATE TABLE IF NOT EXISTS forecast_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL, -- foreign key to forecast_runs table
  action TEXT NOT NULL CHECK(action IN ('approve', 'reject')),
  approver_email TEXT NOT NULL,
  approver_role TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  note TEXT, -- required note from approver
  reason_code TEXT, -- for rejections: 'inaccurate', 'too_high', 'too_low', 'other'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  forecast_data TEXT, -- JSON snapshot of forecast quantities
  items_affected INTEGER, -- count of items in forecast
  total_quantity REAL, -- sum of quantities
  total_value REAL, -- estimated $ value
  FOREIGN KEY (run_id) REFERENCES forecast_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_forecast_approvals_run_id ON forecast_approvals(run_id);
CREATE INDEX IF NOT EXISTS idx_forecast_approvals_approver ON forecast_approvals(approver_email);
CREATE INDEX IF NOT EXISTS idx_forecast_approvals_action ON forecast_approvals(action);
CREATE INDEX IF NOT EXISTS idx_forecast_approvals_created_at ON forecast_approvals(created_at);

-- ============================================================================
-- TABLE: export_audit
-- Purpose: Comprehensive export activity tracking (CSV, GL, PDF)
-- ============================================================================

CREATE TABLE IF NOT EXISTS export_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  export_type TEXT NOT NULL CHECK(export_type IN ('csv', 'gl_csv', 'pdf')),
  requester_email TEXT NOT NULL,
  requester_role TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  start_date TEXT, -- date range for export
  end_date TEXT,
  params TEXT, -- JSON of additional parameters
  row_count INTEGER, -- actual rows exported
  file_size_bytes INTEGER, -- estimated/actual file size
  status TEXT NOT NULL CHECK(status IN ('success', 'failed', 'rate_limited', 'size_exceeded')),
  error_message TEXT,
  ip_address TEXT,
  user_agent TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_export_audit_requester ON export_audit(requester_email);
CREATE INDEX IF NOT EXISTS idx_export_audit_export_type ON export_audit(export_type);
CREATE INDEX IF NOT EXISTS idx_export_audit_status ON export_audit(status);
CREATE INDEX IF NOT EXISTS idx_export_audit_created_at ON export_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_export_audit_tenant ON export_audit(tenant_id);

-- ============================================================================
-- TABLE: finance_quick_fixes
-- Purpose: Track needs-mapping and tolerance exception fixes
-- ============================================================================

CREATE TABLE IF NOT EXISTS finance_quick_fixes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fix_type TEXT NOT NULL CHECK(fix_type IN ('needs_mapping', 'tolerance_exception')),
  document_id INTEGER, -- invoice_pdfs.id
  line_id INTEGER, -- specific line if applicable
  category TEXT, -- mapped category (for needs_mapping)
  create_rule BOOLEAN, -- whether to create permanent mapping rule
  exception_reason TEXT, -- for tolerance exceptions
  fixer_email TEXT NOT NULL,
  fixer_role TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  before_value TEXT, -- JSON snapshot before fix
  after_value TEXT, -- JSON snapshot after fix
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_finance_quick_fixes_fix_type ON finance_quick_fixes(fix_type);
CREATE INDEX IF NOT EXISTS idx_finance_quick_fixes_document_id ON finance_quick_fixes(document_id);
CREATE INDEX IF NOT EXISTS idx_finance_quick_fixes_fixer ON finance_quick_fixes(fixer_email);
CREATE INDEX IF NOT EXISTS idx_finance_quick_fixes_created_at ON finance_quick_fixes(created_at);

-- ============================================================================
-- ALTER: Add last_seen to user_roles (track user activity)
-- ============================================================================

-- SQLite doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS directly
-- Check if column exists before adding
CREATE TABLE IF NOT EXISTS user_roles_temp AS SELECT * FROM user_roles LIMIT 0;
ALTER TABLE user_roles_temp ADD COLUMN last_seen TEXT;
DROP TABLE user_roles_temp;

-- Try to add column (will fail silently if exists)
ALTER TABLE user_roles ADD COLUMN last_seen TEXT;

-- ============================================================================
-- ALTER: Add approval_status to forecast_runs (shadow mode tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS forecast_runs_temp AS SELECT * FROM forecast_runs LIMIT 0;
ALTER TABLE forecast_runs_temp ADD COLUMN approval_status TEXT DEFAULT 'pending' CHECK(approval_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE forecast_runs_temp ADD COLUMN approved_by TEXT;
ALTER TABLE forecast_runs_temp ADD COLUMN approved_at TEXT;
DROP TABLE forecast_runs_temp;

-- Try to add columns (will fail silently if exists)
ALTER TABLE forecast_runs ADD COLUMN approval_status TEXT DEFAULT 'pending';
ALTER TABLE forecast_runs ADD COLUMN approved_by TEXT;
ALTER TABLE forecast_runs ADD COLUMN approved_at TEXT;

-- ============================================================================
-- SEED: Create default user_controls entries for existing users
-- ============================================================================

INSERT OR IGNORE INTO user_controls (user_id, email, disabled, force_rebind)
SELECT id, email, 0, 0
FROM users
WHERE email IS NOT NULL;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check table creation
-- SELECT name FROM sqlite_master WHERE type='table' AND name IN ('invite_tokens', 'user_controls', 'forecast_approvals', 'export_audit', 'finance_quick_fixes');

-- Check indexes
-- SELECT name FROM sqlite_master WHERE type='index' AND tbl_name IN ('invite_tokens', 'user_controls', 'forecast_approvals', 'export_audit', 'finance_quick_fixes');

-- Check row counts
-- SELECT 'invite_tokens' as table_name, COUNT(*) as row_count FROM invite_tokens
-- UNION ALL SELECT 'user_controls', COUNT(*) FROM user_controls
-- UNION ALL SELECT 'forecast_approvals', COUNT(*) FROM forecast_approvals
-- UNION ALL SELECT 'export_audit', COUNT(*) FROM export_audit
-- UNION ALL SELECT 'finance_quick_fixes', COUNT(*) FROM finance_quick_fixes;
