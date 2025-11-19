-- Fix ai_ops_breadcrumbs table for Phase3 cron compatibility
-- V21.1.2 - PostgreSQL Production Fix

-- Drop existing table if it has wrong schema
DROP TABLE IF EXISTS ai_ops_breadcrumbs CASCADE;

-- Create with correct schema for PostgreSQL
CREATE TABLE IF NOT EXISTS ai_ops_breadcrumbs (
  id SERIAL PRIMARY KEY,
  job VARCHAR(100),
  action VARCHAR(100) NOT NULL,
  ran_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  duration_ms INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  success BOOLEAN DEFAULT TRUE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_breadcrumbs_action ON ai_ops_breadcrumbs(action);
CREATE INDEX IF NOT EXISTS idx_breadcrumbs_created ON ai_ops_breadcrumbs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_breadcrumbs_job ON ai_ops_breadcrumbs(job);

COMMENT ON TABLE ai_ops_breadcrumbs IS 'V21.1.2: AI Ops job execution tracking for Phase3 cron';
