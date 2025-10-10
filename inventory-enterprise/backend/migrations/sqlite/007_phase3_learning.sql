-- Phase 3: Autonomous Learning Layer - SQLite Migration
-- Version: 3.0.0
-- Created: 2025-10-08

-- AI Tuning Proposals Table
CREATE TABLE IF NOT EXISTS ai_tuning_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'pending', 'approved', 'applied', 'rejected')),
  module TEXT NOT NULL,
  key TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  expected_impact_pct REAL,
  confidence REAL,
  rationale TEXT,
  rollback_plan TEXT,
  approved_by TEXT,
  applied_at TIMESTAMP,
  tenant_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_tuning_status ON ai_tuning_proposals(status);
CREATE INDEX IF NOT EXISTS idx_ai_tuning_tenant ON ai_tuning_proposals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_tuning_created ON ai_tuning_proposals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_tuning_module ON ai_tuning_proposals(module);

-- AI Feedback Table
CREATE TABLE IF NOT EXISTS ai_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  module TEXT NOT NULL,
  metric TEXT,
  feedback_type TEXT NOT NULL CHECK(feedback_type IN ('positive', 'negative', 'neutral')),
  rating INTEGER CHECK(rating BETWEEN 1 AND 5),
  comment TEXT,
  user_email TEXT,
  tenant_id TEXT,
  user_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_module ON ai_feedback(module);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_type ON ai_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_created ON ai_feedback(created_at DESC);

-- AI Health Predictions Table
CREATE TABLE IF NOT EXISTS ai_health_predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  risk_pct REAL NOT NULL,
  drivers TEXT, -- JSON
  confidence REAL,
  tenant_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_health_created ON ai_health_predictions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_health_tenant ON ai_health_predictions(tenant_id);

-- AI Security Findings Table
CREATE TABLE IF NOT EXISTS ai_security_findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  severity TEXT NOT NULL CHECK(severity IN ('low', 'medium', 'high', 'critical')),
  type TEXT NOT NULL,
  evidence TEXT, -- JSON
  recommendation TEXT, -- JSON
  status TEXT DEFAULT 'open' CHECK(status IN ('open', 'investigating', 'resolved', 'false_positive')),
  resolved_at TIMESTAMP,
  resolved_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_security_severity ON ai_security_findings(severity);
CREATE INDEX IF NOT EXISTS idx_ai_security_status ON ai_security_findings(status);
CREATE INDEX IF NOT EXISTS idx_ai_security_created ON ai_security_findings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_security_type ON ai_security_findings(type);

-- AI Governance Reports Table
CREATE TABLE IF NOT EXISTS ai_governance_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  path TEXT,
  kpis TEXT, -- JSON
  summary TEXT,
  tenant_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_governance_week ON ai_governance_reports(week_start DESC);
CREATE INDEX IF NOT EXISTS idx_ai_governance_tenant ON ai_governance_reports(tenant_id);

-- Insert initial migration record
INSERT INTO migration_history (version, description, executed_at)
VALUES ('007', 'Phase 3 Autonomous Learning Layer', CURRENT_TIMESTAMP)
ON CONFLICT (version) DO NOTHING;
