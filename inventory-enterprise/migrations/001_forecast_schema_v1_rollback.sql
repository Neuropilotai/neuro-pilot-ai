-- Rollback Migration: 001_forecast_schema_v1.sql
-- Description: Drop all forecast-related tables and objects
-- Author: Platform Engineering Team
-- Date: 2025-10-28
-- Version: 1.0.0
-- WARNING: This will DELETE ALL forecast data. Ensure backups exist before running.

-- ============================================================================
-- DROP VIEWS
-- ============================================================================

DROP VIEW IF EXISTS v_usage_with_trends;
DROP VIEW IF EXISTS v_latest_forecast_accuracy;
DROP VIEW IF EXISTS v_active_recommendations;

-- ============================================================================
-- DROP TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS update_reorder_recommendations_timestamp;
DROP TRIGGER IF EXISTS update_usage_history_timestamp;

-- ============================================================================
-- DROP INDEXES (cleanup before dropping tables)
-- ============================================================================

-- forecast_audit_log indexes
DROP INDEX IF EXISTS idx_forecast_audit_log_resource;
DROP INDEX IF EXISTS idx_forecast_audit_log_action;
DROP INDEX IF EXISTS idx_forecast_audit_log_timestamp;
DROP INDEX IF EXISTS idx_forecast_audit_log_user;

-- forecast_accuracy indexes
DROP INDEX IF EXISTS idx_forecast_accuracy_model;
DROP INDEX IF EXISTS idx_forecast_accuracy_abc;
DROP INDEX IF EXISTS idx_forecast_accuracy_date;
DROP INDEX IF EXISTS idx_forecast_accuracy_sku;

-- model_registry indexes
DROP INDEX IF EXISTS idx_model_registry_training_date;
DROP INDEX IF EXISTS idx_model_registry_sku;
DROP INDEX IF EXISTS idx_model_registry_prod;

-- reorder_recommendations indexes
DROP INDEX IF EXISTS idx_reorder_date;
DROP INDEX IF EXISTS idx_reorder_should_reorder;
DROP INDEX IF EXISTS idx_reorder_abc;
DROP INDEX IF EXISTS idx_reorder_priority;
DROP INDEX IF EXISTS idx_reorder_status;
DROP INDEX IF EXISTS idx_reorder_sku_date;

-- forecasts indexes
DROP INDEX IF EXISTS idx_forecasts_model;
DROP INDEX IF EXISTS idx_forecasts_date;
DROP INDEX IF EXISTS idx_forecasts_sku_forecast;
DROP INDEX IF EXISTS idx_forecasts_sku_pred;

-- forecast_features indexes
DROP INDEX IF EXISTS idx_forecast_features_date;
DROP INDEX IF EXISTS idx_forecast_features_sku;

-- special_events indexes
DROP INDEX IF EXISTS idx_special_events_category;
DROP INDEX IF EXISTS idx_special_events_type;
DROP INDEX IF EXISTS idx_special_events_date;

-- usage_history indexes
DROP INDEX IF EXISTS idx_usage_history_sku;
DROP INDEX IF EXISTS idx_usage_history_date;
DROP INDEX IF EXISTS idx_usage_history_sku_date;

-- ============================================================================
-- DROP TABLES
-- ============================================================================

DROP TABLE IF EXISTS forecast_audit_log;
DROP TABLE IF EXISTS forecast_accuracy;
DROP TABLE IF EXISTS model_registry;
DROP TABLE IF EXISTS reorder_recommendations;
DROP TABLE IF EXISTS forecasts;
DROP TABLE IF EXISTS forecast_features;
DROP TABLE IF EXISTS special_events;
DROP TABLE IF EXISTS usage_history;

-- ============================================================================
-- REMOVE MIGRATION RECORD
-- ============================================================================

DELETE FROM schema_migrations WHERE version = '001_forecast_schema_v1';

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================

-- After running rollback, verify all tables are dropped:
-- SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%forecast%' OR name LIKE '%usage%' OR name LIKE '%reorder%';
-- Expected: No results

-- ============================================================================
-- END OF ROLLBACK
-- ============================================================================
