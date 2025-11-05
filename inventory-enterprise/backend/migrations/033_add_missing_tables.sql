-- Migration 033: Add Missing Tables for v19.0
-- Adds tables referenced by AI Ops, Governance, and Security features
-- Simplified version - no complex constraints

-- AI Anomaly Predictions (for GovernanceAgent)
CREATE TABLE IF NOT EXISTS ai_anomaly_predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_type TEXT,
  severity TEXT,
  confidence REAL,
  anomaly_score REAL,
  description TEXT,
  affected_resource TEXT,
  recommended_action TEXT,
  confirmed INTEGER DEFAULT 0,
  false_positive INTEGER DEFAULT 0,
  detected_timestamp TEXT,
  resolved_timestamp TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Webhook Deliveries (for Security Scanner)
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT,
  event_type TEXT,
  status TEXT DEFAULT 'pending',
  request_body TEXT,
  response_body TEXT,
  response_status INTEGER,
  retry_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Compliance Audit Log (for Compliance Audit)
CREATE TABLE IF NOT EXISTS compliance_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_type TEXT,
  framework TEXT,
  control_id TEXT,
  status TEXT DEFAULT 'pending',
  findings TEXT,
  recommendations TEXT,
  severity TEXT DEFAULT 'info',
  audited_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT
);
