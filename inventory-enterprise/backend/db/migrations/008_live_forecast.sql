-- Migration 008: Live Forecasting Infrastructure
-- Idempotent: Safe to re-run
-- Purpose: Store forecast results with population scaling support

-- Forecast results table
CREATE TABLE IF NOT EXISTS forecast_results (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  site_id INTEGER NOT NULL,
  sku TEXT NOT NULL,
  horizon_days INTEGER NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('arima', 'ets', 'prophet', 'holt-winters', 'linear', 'moving-average')),
  forecast_qty NUMERIC(12,3) NOT NULL,
  confidence_lower NUMERIC(12,3),
  confidence_upper NUMERIC(12,3),
  mape_estimate NUMERIC(5,2),
  population_scaled BOOLEAN DEFAULT false,
  baseline_population INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,

  CONSTRAINT forecast_results_org_site_fk FOREIGN KEY (org_id, site_id) REFERENCES sites(org_id, id) ON DELETE CASCADE,
  CONSTRAINT forecast_positive_qty CHECK (forecast_qty >= 0),
  CONSTRAINT forecast_valid_horizon CHECK (horizon_days > 0 AND horizon_days <= 365)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_forecast_results_org_site ON forecast_results(org_id, site_id);
CREATE INDEX IF NOT EXISTS idx_forecast_results_sku ON forecast_results(sku);
CREATE INDEX IF NOT EXISTS idx_forecast_results_created_at ON forecast_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forecast_results_org_site_sku_created ON forecast_results(org_id, site_id, sku, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forecast_results_expires_at ON forecast_results(expires_at) WHERE expires_at IS NOT NULL;

-- Forecast execution log
CREATE TABLE IF NOT EXISTS forecast_executions (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  site_id INTEGER NOT NULL,
  triggered_by TEXT,
  trigger_type TEXT CHECK (trigger_type IN ('manual', 'scheduled', 'api', 'webhook')),
  skus_processed INTEGER DEFAULT 0,
  skus_failed INTEGER DEFAULT 0,
  total_runtime_ms INTEGER,
  status TEXT CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  error_message TEXT,
  config JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,

  CONSTRAINT forecast_exec_org_site_fk FOREIGN KEY (org_id, site_id) REFERENCES sites(org_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_forecast_executions_org_site ON forecast_executions(org_id, site_id);
CREATE INDEX IF NOT EXISTS idx_forecast_executions_started_at ON forecast_executions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_forecast_executions_status ON forecast_executions(status) WHERE status = 'running';

-- Population scaling factors (for forecast adjustment)
CREATE TABLE IF NOT EXISTS forecast_population_factors (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  site_id INTEGER NOT NULL,
  date DATE NOT NULL,
  meal TEXT CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'total')),
  baseline_count INTEGER NOT NULL,
  actual_count INTEGER NOT NULL,
  scaling_factor NUMERIC(5,3) DEFAULT 1.0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT forecast_pop_factors_org_site_fk FOREIGN KEY (org_id, site_id) REFERENCES sites(org_id, id) ON DELETE CASCADE,
  UNIQUE(org_id, site_id, date, meal)
);

CREATE INDEX IF NOT EXISTS idx_forecast_pop_factors_org_site_date ON forecast_population_factors(org_id, site_id, date DESC);

-- Cleanup old forecasts (called by daily cron)
CREATE OR REPLACE FUNCTION cleanup_expired_forecasts()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM forecast_results
  WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (adjust role names as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON forecast_results TO inventory_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON forecast_executions TO inventory_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON forecast_population_factors TO inventory_app;
-- GRANT USAGE, SELECT ON SEQUENCE forecast_results_id_seq TO inventory_app;
-- GRANT USAGE, SELECT ON SEQUENCE forecast_executions_id_seq TO inventory_app;
-- GRANT USAGE, SELECT ON SEQUENCE forecast_population_factors_id_seq TO inventory_app;

COMMENT ON TABLE forecast_results IS 'V21.1: Stores forecast predictions with population scaling support';
COMMENT ON TABLE forecast_executions IS 'V21.1: Tracks forecast execution runs for monitoring';
COMMENT ON TABLE forecast_population_factors IS 'V21.1: Population scaling factors for forecast adjustment';
