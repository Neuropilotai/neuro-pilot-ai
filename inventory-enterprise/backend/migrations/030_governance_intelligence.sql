-- =====================================================================
-- Migration 030: Governance Intelligence Dashboard (v16.0.0)
-- =====================================================================
-- Purpose: Predictive insights, anomaly detection, bilingual intelligence
-- Author: NeuroPilot AI Development Team
-- Date: 2025-10-18
-- =====================================================================

-- Governance anomalies (forecast vs actual deviations)
CREATE TABLE IF NOT EXISTS governance_anomalies (
  id TEXT PRIMARY KEY,
  as_of DATE NOT NULL,
  pillar TEXT NOT NULL CHECK(pillar IN ('finance','health','ai','menu','composite')),
  type TEXT NOT NULL CHECK(type IN ('variance','drop','surge','missing_data')),
  delta REAL NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('low','medium','high','critical')),
  message TEXT NOT NULL,
  resolved INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Governance insights (AI-generated bilingual commentary)
CREATE TABLE IF NOT EXISTS governance_insights (
  id TEXT PRIMARY KEY,
  as_of DATE NOT NULL,
  pillar TEXT NOT NULL CHECK(pillar IN ('finance','health','ai','menu','composite')),
  insight_en TEXT NOT NULL,
  insight_fr TEXT NOT NULL,
  confidence REAL NOT NULL,
  author TEXT DEFAULT 'NeuroPilot AI',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_governance_anomalies_date
  ON governance_anomalies(as_of DESC, pillar);

CREATE INDEX IF NOT EXISTS idx_governance_anomalies_severity
  ON governance_anomalies(severity, resolved);

CREATE INDEX IF NOT EXISTS idx_governance_insights_date
  ON governance_insights(as_of DESC, pillar);

-- View: Active anomalies (unresolved)
CREATE VIEW IF NOT EXISTS v_governance_anomalies_active AS
SELECT
  id,
  as_of,
  pillar,
  type,
  delta,
  severity,
  message,
  created_at
FROM governance_anomalies
WHERE resolved = 0
ORDER BY
  CASE severity
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
  END,
  as_of DESC;

-- View: Latest insights (last 30 days)
CREATE VIEW IF NOT EXISTS v_governance_insights_latest AS
SELECT
  id,
  as_of,
  pillar,
  insight_en,
  insight_fr,
  confidence,
  author,
  created_at
FROM governance_insights
WHERE as_of >= date('now', '-30 days')
ORDER BY as_of DESC, pillar;

-- =====================================================================
-- End Migration 030
-- =====================================================================
