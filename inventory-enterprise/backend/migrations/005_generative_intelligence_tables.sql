-- ============================================================================
-- Migration 005: Generative Intelligence & Autonomous Governance Tables
-- Version: v2.7.0-2025-10-07
--
-- Creates tables for:
-- - Governance Agent (autonomous policy adaptation)
-- - Insight Generator (LLM-powered executive summaries)
-- - Compliance Audit (ISO/SOC compliance scanning)
--
-- Author: NeuroInnovate Systems Intelligence Team
-- Date: October 7, 2025
-- ============================================================================

-- ============================================================================
-- GOVERNANCE AGENT TABLES
-- ============================================================================

-- Governance Policies: Stores operational policies and their configurations
CREATE TABLE IF NOT EXISTS governance_policies (
  policy_id TEXT PRIMARY KEY,
  policy_name TEXT NOT NULL,
  policy_type TEXT NOT NULL, -- 'anomaly_threshold', 'confidence_threshold', etc.
  current_value REAL NOT NULL,
  default_value REAL NOT NULL,
  min_value REAL,
  max_value REAL,
  effectiveness_score REAL DEFAULT 0.0,
  false_positive_rate REAL DEFAULT 0.0,
  last_adapted_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_governance_policies_name ON governance_policies(policy_name);
CREATE INDEX IF NOT EXISTS idx_governance_policies_type ON governance_policies(policy_type);

-- Governance Adaptations: Log of all autonomous policy changes
CREATE TABLE IF NOT EXISTS governance_adaptations (
  adaptation_id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL,
  adaptation_type TEXT NOT NULL, -- 'threshold_adjustment', 'confidence_tuning', etc.
  previous_value REAL,
  new_value REAL,
  confidence REAL NOT NULL,
  expected_improvement REAL,
  actual_improvement REAL,
  reason TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'applied', 'rejected', 'reverted'
  created_at TEXT DEFAULT (datetime('now')),
  applied_at TEXT,
  FOREIGN KEY (policy_id) REFERENCES governance_policies(policy_id)
);

CREATE INDEX IF NOT EXISTS idx_governance_adaptations_policy ON governance_adaptations(policy_id);
CREATE INDEX IF NOT EXISTS idx_governance_adaptations_status ON governance_adaptations(status);
CREATE INDEX IF NOT EXISTS idx_governance_adaptations_created ON governance_adaptations(created_at);

-- Governance Learning History: Stores learning cycle results
CREATE TABLE IF NOT EXISTS governance_learning_history (
  learning_id TEXT PRIMARY KEY,
  cycle_timestamp TEXT NOT NULL,
  performance_data TEXT, -- JSON: incident stats, remediation success rates
  incident_patterns TEXT, -- JSON: pattern analysis results
  policy_effectiveness TEXT, -- JSON: policy scores and metrics
  recommendations_count INTEGER DEFAULT 0,
  adaptations_applied INTEGER DEFAULT 0,
  duration_ms INTEGER,
  status TEXT DEFAULT 'success',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_governance_learning_timestamp ON governance_learning_history(cycle_timestamp);
CREATE INDEX IF NOT EXISTS idx_governance_learning_status ON governance_learning_history(status);

-- ============================================================================
-- INSIGHT GENERATOR TABLES
-- ============================================================================

-- Insight Reports: Stores generated executive summaries
CREATE TABLE IF NOT EXISTS insight_reports (
  report_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  language TEXT NOT NULL, -- 'en', 'fr'
  content TEXT NOT NULL, -- Markdown formatted report
  bleu_score REAL, -- BLEU score vs ground truth (if available)
  quality_score REAL, -- Heuristic quality score
  operational_data TEXT, -- JSON: source data used for report
  llm_provider TEXT, -- 'openai', 'anthropic', 'mock'
  llm_model TEXT, -- 'gpt-4', 'claude-3-sonnet', etc.
  generation_duration_ms INTEGER,
  generated_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_insight_reports_language ON insight_reports(language);
CREATE INDEX IF NOT EXISTS idx_insight_reports_generated ON insight_reports(generated_at);
CREATE INDEX IF NOT EXISTS idx_insight_reports_quality ON insight_reports(quality_score);

-- LLM API Logs: Tracks LLM API calls for monitoring and cost tracking
CREATE TABLE IF NOT EXISTS insight_llm_api_log (
  api_call_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  provider TEXT NOT NULL, -- 'openai', 'anthropic'
  model TEXT NOT NULL,
  language TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  duration_ms INTEGER,
  status TEXT NOT NULL, -- 'success', 'error', 'timeout'
  error_type TEXT,
  error_message TEXT,
  cost_usd REAL, -- Estimated API cost
  called_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_llm_api_log_provider ON insight_llm_api_log(provider);
CREATE INDEX IF NOT EXISTS idx_llm_api_log_status ON insight_llm_api_log(status);
CREATE INDEX IF NOT EXISTS idx_llm_api_log_called ON insight_llm_api_log(called_at);

-- ============================================================================
-- COMPLIANCE AUDIT TABLES
-- ============================================================================

-- Compliance Audit Log: Stores compliance audit results
CREATE TABLE IF NOT EXISTS compliance_audit_log (
  audit_id TEXT NOT NULL,
  framework TEXT NOT NULL, -- 'iso27001', 'soc2', 'owasp', 'all'
  compliance_score REAL NOT NULL,
  total_checks INTEGER NOT NULL,
  passed_checks INTEGER NOT NULL,
  failed_checks INTEGER NOT NULL,
  findings TEXT, -- JSON: array of findings with details
  audit_timestamp TEXT DEFAULT (datetime('now')),
  audit_duration_ms INTEGER,
  PRIMARY KEY (audit_id, framework)
);

CREATE INDEX IF NOT EXISTS idx_compliance_audit_framework ON compliance_audit_log(framework);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_timestamp ON compliance_audit_log(audit_timestamp);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_score ON compliance_audit_log(compliance_score);

-- Compliance Findings: Detailed findings from audits
CREATE TABLE IF NOT EXISTS compliance_findings (
  finding_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  audit_id TEXT NOT NULL,
  framework TEXT NOT NULL,
  check_id TEXT NOT NULL, -- e.g., 'ISO-A.9.1.1', 'OWASP-A01'
  control TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL, -- 'critical', 'high', 'medium', 'low'
  current_state TEXT,
  required_state TEXT,
  recommendation TEXT,
  effort TEXT, -- 'low', 'medium', 'high'
  status TEXT DEFAULT 'open', -- 'open', 'in_progress', 'resolved', 'accepted_risk'
  detected_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT,
  FOREIGN KEY (audit_id) REFERENCES compliance_audit_log(audit_id)
);

CREATE INDEX IF NOT EXISTS idx_compliance_findings_audit ON compliance_findings(audit_id);
CREATE INDEX IF NOT EXISTS idx_compliance_findings_framework ON compliance_findings(framework);
CREATE INDEX IF NOT EXISTS idx_compliance_findings_severity ON compliance_findings(severity);
CREATE INDEX IF NOT EXISTS idx_compliance_findings_status ON compliance_findings(status);

-- Compliance Remediation: Tracks remediation actions for findings
CREATE TABLE IF NOT EXISTS compliance_remediation (
  remediation_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  finding_id TEXT NOT NULL,
  action_type TEXT NOT NULL, -- 'configuration_change', 'code_update', 'policy_update'
  action_description TEXT NOT NULL,
  assigned_to TEXT,
  priority TEXT NOT NULL, -- 'critical', 'high', 'medium', 'low'
  status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'verified'
  started_at TEXT,
  completed_at TEXT,
  verified_at TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (finding_id) REFERENCES compliance_findings(finding_id)
);

CREATE INDEX IF NOT EXISTS idx_compliance_remediation_finding ON compliance_remediation(finding_id);
CREATE INDEX IF NOT EXISTS idx_compliance_remediation_status ON compliance_remediation(status);
CREATE INDEX IF NOT EXISTS idx_compliance_remediation_priority ON compliance_remediation(priority);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: Recent Governance Adaptations (last 30 days)
CREATE VIEW IF NOT EXISTS v_recent_governance_adaptations AS
SELECT
  ga.adaptation_id,
  ga.adaptation_type,
  gp.policy_name,
  ga.previous_value,
  ga.new_value,
  ga.confidence,
  ga.expected_improvement,
  ga.actual_improvement,
  ga.status,
  ga.created_at,
  ga.applied_at
FROM governance_adaptations ga
JOIN governance_policies gp ON ga.policy_id = gp.policy_id
WHERE ga.created_at >= datetime('now', '-30 days')
ORDER BY ga.created_at DESC;

-- View: Governance Performance Summary
CREATE VIEW IF NOT EXISTS v_governance_performance AS
SELECT
  COUNT(DISTINCT policy_id) as total_policies,
  COUNT(*) as total_adaptations,
  SUM(CASE WHEN status = 'applied' THEN 1 ELSE 0 END) as applied_adaptations,
  AVG(confidence) as avg_confidence,
  AVG(CASE WHEN actual_improvement IS NOT NULL THEN actual_improvement ELSE expected_improvement END) as avg_improvement
FROM governance_adaptations
WHERE created_at >= datetime('now', '-30 days');

-- View: Recent Insight Reports
CREATE VIEW IF NOT EXISTS v_recent_insight_reports AS
SELECT
  report_id,
  language,
  SUBSTR(content, 1, 200) || '...' as summary,
  bleu_score,
  quality_score,
  llm_provider,
  llm_model,
  generation_duration_ms,
  generated_at
FROM insight_reports
ORDER BY generated_at DESC
LIMIT 50;

-- View: LLM API Usage Summary
CREATE VIEW IF NOT EXISTS v_llm_api_usage_summary AS
SELECT
  provider,
  model,
  COUNT(*) as total_calls,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_calls,
  SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as failed_calls,
  AVG(duration_ms) as avg_duration_ms,
  SUM(total_tokens) as total_tokens,
  SUM(cost_usd) as total_cost_usd,
  DATE(called_at) as call_date
FROM insight_llm_api_log
WHERE called_at >= datetime('now', '-30 days')
GROUP BY provider, model, DATE(called_at)
ORDER BY call_date DESC;

-- View: Current Compliance Status
CREATE VIEW IF NOT EXISTS v_compliance_status AS
SELECT
  framework,
  compliance_score,
  total_checks,
  passed_checks,
  failed_checks,
  audit_timestamp,
  ROW_NUMBER() OVER (PARTITION BY framework ORDER BY audit_timestamp DESC) as rn
FROM compliance_audit_log
WHERE framework != 'all';

-- View: Compliance Status (latest per framework)
CREATE VIEW IF NOT EXISTS v_latest_compliance_status AS
SELECT
  framework,
  compliance_score,
  total_checks,
  passed_checks,
  failed_checks,
  audit_timestamp
FROM v_compliance_status
WHERE rn = 1;

-- View: Open Compliance Findings
CREATE VIEW IF NOT EXISTS v_open_compliance_findings AS
SELECT
  cf.finding_id,
  cf.framework,
  cf.check_id,
  cf.control,
  cf.severity,
  cf.description,
  cf.recommendation,
  cf.effort,
  cf.detected_at,
  cr.remediation_id,
  cr.status as remediation_status,
  cr.assigned_to
FROM compliance_findings cf
LEFT JOIN compliance_remediation cr ON cf.finding_id = cr.finding_id
WHERE cf.status IN ('open', 'in_progress')
ORDER BY
  CASE cf.severity
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
  END,
  cf.detected_at ASC;

-- View: Compliance Trends (last 90 days)
CREATE VIEW IF NOT EXISTS v_compliance_trends AS
SELECT
  framework,
  DATE(audit_timestamp) as audit_date,
  AVG(compliance_score) as avg_score,
  AVG(failed_checks) as avg_failed_checks,
  COUNT(*) as audits_count
FROM compliance_audit_log
WHERE audit_timestamp >= datetime('now', '-90 days')
  AND framework != 'all'
GROUP BY framework, DATE(audit_timestamp)
ORDER BY framework, audit_date;

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Insert default governance policies (will be loaded by GovernanceAgent)
-- These serve as examples and will be populated by the agent on first run

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Migration metadata
CREATE TABLE IF NOT EXISTS migration_history (
  migration_id INTEGER PRIMARY KEY,
  migration_name TEXT NOT NULL,
  applied_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO migration_history (migration_id, migration_name)
VALUES (5, '005_generative_intelligence_tables.sql')
ON CONFLICT(migration_id) DO NOTHING;

SELECT 'Migration 005: Generative Intelligence & Autonomous Governance Tables - COMPLETE' as status;
