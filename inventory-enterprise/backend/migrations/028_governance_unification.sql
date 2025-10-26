-- =====================================================================
-- Migration 028: Quantum Governance Unification Layer (v15.8.0)
-- =====================================================================
-- Purpose: Create unified governance scoring for Finance, Health, AI, Menu
--          pillars with snapshot history and alert tracking
--
-- Tables:
-- - governance_snapshots: Historical governance scores (every computation)
-- - governance_alerts: Active alerts from anomaly detection
-- - v_governance_latest: View for current governance status
--
-- Design Philosophy:
-- - Minimal, additive structures (no mutations to existing pillars)
-- - Read-only access to pillar data sources
-- - Reversible and safe for production deployment
-- =====================================================================

-- =====================================================================
-- TABLE: governance_snapshots
-- =====================================================================
-- Stores computed governance scores with full audit trail
CREATE TABLE IF NOT EXISTS governance_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  -- Pillar Scores (0-100 scale)
  finance_accuracy REAL,
  health_score REAL,
  ai_intelligence_index REAL,
  menu_forecast_accuracy REAL,

  -- Composite Score
  governance_score REAL NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('Healthy','Warning','Action')),
  color TEXT NOT NULL CHECK(color IN ('green','amber','red')),

  -- Audit Payload (full raw inputs for forensics)
  payload_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_governance_snapshots_created
  ON governance_snapshots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_governance_snapshots_status
  ON governance_snapshots(status, created_at DESC);

-- =====================================================================
-- TABLE: governance_alerts
-- =====================================================================
-- Active alerts triggered by anomaly detection rules
CREATE TABLE IF NOT EXISTS governance_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  -- Alert Classification
  type TEXT NOT NULL,                     -- e.g., 'FINANCE_DRIFT', 'AI_STALE_FEEDBACK'
  severity TEXT NOT NULL CHECK(severity IN ('info','warning','critical')),

  -- Alert Details
  message TEXT NOT NULL,
  details_json TEXT,                      -- Additional context (JSON)

  -- Resolution Tracking
  resolved_at TEXT,
  resolved_by TEXT,
  resolution_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_governance_alerts_type
  ON governance_alerts(type, severity);
CREATE INDEX IF NOT EXISTS idx_governance_alerts_active
  ON governance_alerts(created_at DESC) WHERE resolved_at IS NULL;

-- =====================================================================
-- VIEW: v_governance_latest
-- =====================================================================
-- Quick access to most recent governance snapshot
CREATE VIEW IF NOT EXISTS v_governance_latest AS
  SELECT * FROM governance_snapshots
  ORDER BY created_at DESC
  LIMIT 1;

-- =====================================================================
-- VIEW: v_governance_active_alerts
-- =====================================================================
-- Quick access to unresolved alerts
CREATE VIEW IF NOT EXISTS v_governance_active_alerts AS
  SELECT * FROM governance_alerts
  WHERE resolved_at IS NULL
  ORDER BY
    CASE severity
      WHEN 'critical' THEN 1
      WHEN 'warning' THEN 2
      WHEN 'info' THEN 3
    END,
    created_at DESC;

-- =====================================================================
-- VERIFICATION QUERY
-- =====================================================================
-- Confirm tables and views created successfully
SELECT
  'governance_snapshots' as object_name,
  type,
  COUNT(*) as count
FROM sqlite_master
WHERE name IN ('governance_snapshots', 'governance_alerts', 'v_governance_latest', 'v_governance_active_alerts')
GROUP BY type;

-- Expected output:
-- governance_snapshots | table | 1
-- governance_alerts    | table | 1
-- v_governance_latest  | view  | 1
-- v_governance_active_alerts | view | 1

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================
-- No breaking changes to existing tables
-- All structures are additive and reversible
-- Ready for production deployment on v15.7.0+
