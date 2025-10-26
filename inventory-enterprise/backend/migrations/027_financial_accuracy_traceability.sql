-- ============================================================================
-- Migration 027: Financial Accuracy & Traceability Tables
-- Version: 15.7.0
-- Date: 2025-10-14
-- Author: NeuroPilot Financial Systems Team
--
-- Purpose:
--   Add comprehensive financial validation and audit trail tables to ensure
--   100% accuracy before production rollout
--
-- Tables Created:
--   1. finance_validation_history - Track all validation runs
--   2. finance_corrections_log - Audit trail of corrections
--   3. finance_verified_totals - Known correct monthly totals
--
-- Migration Strategy: SAFE (idempotent, creates tables only if not exist)
-- ============================================================================

-- 1. Finance Validation History
-- Tracks every validation run with scores, issues, and results
CREATE TABLE IF NOT EXISTS finance_validation_history (
  validation_id INTEGER PRIMARY KEY AUTOINCREMENT,
  fiscal_period TEXT NOT NULL,
  validation_date TEXT NOT NULL DEFAULT (datetime('now')),
  verification_score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('VERIFIED', 'NEEDS_REVIEW', 'NEEDS_CORRECTION', 'CRITICAL_ERRORS', 'NO_DATA', 'ERROR')),
  total_invoices INTEGER DEFAULT 0,
  total_amount REAL DEFAULT 0.0,
  verified_amount REAL,
  variance REAL,
  variance_pct REAL,
  issues_found INTEGER DEFAULT 0,
  corrections_proposed INTEGER DEFAULT 0,
  corrections_applied INTEGER DEFAULT 0,
  report_json TEXT,  -- Full JSON validation report
  validated_by TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_finance_validation_period ON finance_validation_history(fiscal_period);
CREATE INDEX IF NOT EXISTS idx_finance_validation_date ON finance_validation_history(validation_date DESC);
CREATE INDEX IF NOT EXISTS idx_finance_validation_score ON finance_validation_history(verification_score DESC);
CREATE INDEX IF NOT EXISTS idx_finance_validation_status ON finance_validation_history(status);

-- 2. Finance Corrections Log
-- Audit trail of every correction applied to financial data
CREATE TABLE IF NOT EXISTS finance_corrections_log (
  correction_id INTEGER PRIMARY KEY AUTOINCREMENT,
  validation_id INTEGER,
  fiscal_period TEXT,
  issue_type TEXT NOT NULL CHECK(issue_type IN (
    'DUPLICATE_INVOICE', 'COLUMN_MISALIGNMENT', 'GST_MISMATCH', 'QST_MISMATCH',
    'TOTAL_MATH_ERROR', 'NEGATIVE_AMOUNT', 'ZERO_AMOUNT', 'TOTAL_MISMATCH',
    'MISSING_FINANCE_CODE', 'UNKNOWN_VENDOR', 'OTHER'
  )),
  severity TEXT NOT NULL CHECK(severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  invoice_number TEXT,
  invoice_id INTEGER,
  action_taken TEXT NOT NULL CHECK(action_taken IN (
    'DELETE', 'RECALCULATE', 'RECALCULATE_TAX', 'REMAP_FINANCE_CODE',
    'MANUAL_REVIEW', 'APPROVED', 'REJECTED', 'DEFERRED'
  )),
  sql_executed TEXT,
  before_value TEXT,
  after_value TEXT,
  applied_by TEXT,
  applied_at TEXT DEFAULT (datetime('now')),
  dry_run INTEGER DEFAULT 0,
  success INTEGER DEFAULT 1,
  error_message TEXT,
  review_notes TEXT,
  FOREIGN KEY (validation_id) REFERENCES finance_validation_history(validation_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_finance_corrections_period ON finance_corrections_log(fiscal_period);
CREATE INDEX IF NOT EXISTS idx_finance_corrections_issue ON finance_corrections_log(issue_type);
CREATE INDEX IF NOT EXISTS idx_finance_corrections_severity ON finance_corrections_log(severity);
CREATE INDEX IF NOT EXISTS idx_finance_corrections_date ON finance_corrections_log(applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_corrections_action ON finance_corrections_log(action_taken);
CREATE INDEX IF NOT EXISTS idx_finance_corrections_invoice ON finance_corrections_log(invoice_number);

-- 3. Finance Verified Totals
-- Known correct monthly totals from verified PDF/Excel sources
CREATE TABLE IF NOT EXISTS finance_verified_totals (
  fiscal_period TEXT PRIMARY KEY,
  month TEXT NOT NULL,  -- YYYY-MM format
  verified_total REAL NOT NULL,
  subtotal REAL,
  gst_total REAL,
  qst_total REAL,
  source_file TEXT NOT NULL,
  source_type TEXT CHECK(source_type IN ('PDF', 'XLSX', 'CSV', 'MANUAL')),
  verified_by TEXT,
  verified_date TEXT NOT NULL,
  confidence TEXT CHECK(confidence IN ('HIGH', 'MEDIUM', 'LOW')) DEFAULT 'HIGH',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_finance_verified_month ON finance_verified_totals(month);
CREATE INDEX IF NOT EXISTS idx_finance_verified_date ON finance_verified_totals(verified_date DESC);

-- 4. Finance Verification Alerts
-- Track when verification scores drop below thresholds
CREATE TABLE IF NOT EXISTS finance_verification_alerts (
  alert_id INTEGER PRIMARY KEY AUTOINCREMENT,
  validation_id INTEGER NOT NULL,
  fiscal_period TEXT NOT NULL,
  alert_type TEXT NOT NULL CHECK(alert_type IN (
    'SCORE_BELOW_95', 'SCORE_BELOW_70', 'SCORE_BELOW_50',
    'CRITICAL_ISSUE', 'LARGE_VARIANCE', 'DUPLICATE_DETECTED'
  )),
  alert_severity TEXT NOT NULL CHECK(alert_severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  alert_message TEXT NOT NULL,
  verification_score INTEGER,
  variance REAL,
  issue_count INTEGER DEFAULT 0,
  notified_users TEXT,  -- Comma-separated list of notified users
  acknowledged_by TEXT,
  acknowledged_at TEXT,
  resolved INTEGER DEFAULT 0,
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (validation_id) REFERENCES finance_validation_history(validation_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_finance_alerts_period ON finance_verification_alerts(fiscal_period);
CREATE INDEX IF NOT EXISTS idx_finance_alerts_type ON finance_verification_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_finance_alerts_resolved ON finance_verification_alerts(resolved);
CREATE INDEX IF NOT EXISTS idx_finance_alerts_date ON finance_verification_alerts(created_at DESC);

-- ============================================================================
-- SEED DATA: Verified Monthly Totals
-- ============================================================================

-- FY26-P01 (September 2025)
-- Source: GFS_Accounting_2025_09_September.xlsx
-- Manually verified on 2025-10-11
INSERT OR REPLACE INTO finance_verified_totals (
  fiscal_period, month, verified_total, source_file, source_type,
  verified_by, verified_date, confidence, notes
) VALUES (
  'FY26-P01',
  '2025-09',
  200154.26,
  'GFS_Accounting_2025_09_September.xlsx',
  'XLSX',
  'David Mikulis',
  '2025-10-11',
  'HIGH',
  'Manually verified from GFS monthly accounting report'
);

-- ============================================================================
-- VIEWS: Convenience views for reporting
-- ============================================================================

-- Latest validation for each fiscal period
CREATE VIEW IF NOT EXISTS v_latest_finance_validation AS
SELECT
  fvh.*,
  fvt.verified_total,
  fvt.source_file,
  CASE
    WHEN fvh.verification_score >= 95 THEN '✅ Production Ready'
    WHEN fvh.verification_score >= 70 THEN '⚠️ Needs Review'
    WHEN fvh.verification_score >= 50 THEN '🔧 Needs Correction'
    ELSE '❌ Critical Errors'
  END as status_emoji
FROM finance_validation_history fvh
LEFT JOIN finance_verified_totals fvt ON fvt.fiscal_period = fvh.fiscal_period
WHERE fvh.validation_id IN (
  SELECT MAX(validation_id)
  FROM finance_validation_history
  GROUP BY fiscal_period
);

-- Open alerts that need attention
CREATE VIEW IF NOT EXISTS v_open_finance_alerts AS
SELECT
  a.*,
  v.verification_score,
  v.status,
  v.total_invoices,
  v.total_amount
FROM finance_verification_alerts a
JOIN finance_validation_history v ON v.validation_id = a.validation_id
WHERE a.resolved = 0
ORDER BY
  CASE a.alert_severity
    WHEN 'CRITICAL' THEN 1
    WHEN 'HIGH' THEN 2
    WHEN 'MEDIUM' THEN 3
    WHEN 'LOW' THEN 4
  END,
  a.created_at DESC;

-- Correction success rate by issue type
CREATE VIEW IF NOT EXISTS v_correction_success_rate AS
SELECT
  issue_type,
  COUNT(*) as total_corrections,
  SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed,
  ROUND(100.0 * SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate_pct
FROM finance_corrections_log
WHERE dry_run = 0
GROUP BY issue_type
ORDER BY total_corrections DESC;

-- ============================================================================
-- TRIGGERS: Automatic alert creation
-- ============================================================================

-- Automatically create alerts when verification score drops below 95
CREATE TRIGGER IF NOT EXISTS trg_finance_validation_alert_score
AFTER INSERT ON finance_validation_history
WHEN NEW.verification_score < 95
BEGIN
  INSERT INTO finance_verification_alerts (
    validation_id, fiscal_period, alert_type, alert_severity,
    alert_message, verification_score, issue_count
  )
  VALUES (
    NEW.validation_id,
    NEW.fiscal_period,
    CASE
      WHEN NEW.verification_score < 50 THEN 'SCORE_BELOW_50'
      WHEN NEW.verification_score < 70 THEN 'SCORE_BELOW_70'
      ELSE 'SCORE_BELOW_95'
    END,
    CASE
      WHEN NEW.verification_score < 50 THEN 'CRITICAL'
      WHEN NEW.verification_score < 70 THEN 'HIGH'
      ELSE 'MEDIUM'
    END,
    'Finance Verification Score (' || NEW.verification_score || '/100) below production threshold for ' || NEW.fiscal_period,
    NEW.verification_score,
    NEW.issues_found
  );
END;

-- Automatically create alerts for critical issues
CREATE TRIGGER IF NOT EXISTS trg_finance_validation_alert_critical
AFTER INSERT ON finance_validation_history
WHEN NEW.issues_found > 0 AND NEW.status IN ('CRITICAL_ERRORS', 'NEEDS_CORRECTION')
BEGIN
  INSERT INTO finance_verification_alerts (
    validation_id, fiscal_period, alert_type, alert_severity,
    alert_message, verification_score, issue_count
  )
  VALUES (
    NEW.validation_id,
    NEW.fiscal_period,
    'CRITICAL_ISSUE',
    'CRITICAL',
    'Critical financial data issues detected in ' || NEW.fiscal_period || ' (' || NEW.issues_found || ' issues)',
    NEW.verification_score,
    NEW.issues_found
  );
END;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Log migration completion
INSERT INTO schema_migrations (version, description, applied_at)
VALUES (
  27,
  'Financial accuracy and traceability tables (validation history, corrections log, verified totals, alerts)',
  datetime('now')
);

-- Display summary
SELECT
  '✅ Migration 027 Complete' as status,
  'Financial Accuracy & Traceability Tables Created' as description,
  datetime('now') as completed_at;
