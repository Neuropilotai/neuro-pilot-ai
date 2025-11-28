/**
 * Prometheus Metrics Exporter
 * Comprehensive metrics for inventory system monitoring
 * Compatible with Prometheus 2.x and Grafana
 *
 * @version 15.5.0 - PII SANITIZATION POLICY
 *
 * v15.5 RBAC HARDENING & GO-LIVE GATE:
 * =====================================
 * ALL METRICS LABELS SANITIZED TO PREVENT PII EXPOSURE
 *
 * Allowed Labels: { tenant, role, env }
 * Prohibited Labels: email, name, user_id, item_code, entity_id, invoice_number
 *
 * Rationale:
 * - Prometheus metrics are often stored long-term and may be accessible to operations teams
 * - Labels are indexed and high-cardinality labels (like item codes) can cause performance issues
 * - Compliance requirements (GDPR, CCPA) prohibit exposing PII in monitoring systems
 * - Tenant-level aggregation provides sufficient granularity for monitoring without exposing sensitive data
 *
 * All methods have been updated to accept (tenant, env) instead of (itemCode, userId, etc.)
 */

const promClient = require('prom-client');
const { logger } = require('../config/logger');

class MetricsExporter {
  constructor() {
    // Create a Registry to register metrics
    this.register = new promClient.Registry();

    // Add default metrics (CPU, memory, event loop lag, etc.)
    promClient.collectDefaultMetrics({
      register: this.register,
      prefix: 'inventory_',
      gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5]
    });

    // Initialize custom metrics
    this.initializeMetrics();

    logger.info('Prometheus metrics exporter initialized');
  }

  /**
   * Initialize all custom business metrics
   */
  initializeMetrics() {
    // ========================================================================
    // HTTP METRICS
    // ========================================================================

    this.httpRequestDuration = new promClient.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5]
    });

    this.httpRequestsTotal = new promClient.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code']
    });

    this.httpRequestSizeBytes = new promClient.Histogram({
      name: 'http_request_size_bytes',
      help: 'Size of HTTP requests in bytes',
      labelNames: ['method', 'route'],
      buckets: [100, 1000, 5000, 10000, 50000, 100000, 500000]
    });

    this.httpResponseSizeBytes = new promClient.Histogram({
      name: 'http_response_size_bytes',
      help: 'Size of HTTP responses in bytes',
      labelNames: ['method', 'route'],
      buckets: [100, 1000, 5000, 10000, 50000, 100000, 500000, 1000000]
    });

    // ========================================================================
    // CACHE METRICS
    // ========================================================================

    this.cacheHitsTotal = new promClient.Counter({
      name: 'cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['cache_key_prefix']
    });

    this.cacheMissesTotal = new promClient.Counter({
      name: 'cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['cache_key_prefix']
    });

    this.cacheOperationDuration = new promClient.Histogram({
      name: 'cache_operation_duration_seconds',
      help: 'Duration of cache operations',
      labelNames: ['operation', 'status'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1]
    });

    this.cacheSize = new promClient.Gauge({
      name: 'cache_size_keys',
      help: 'Current number of keys in cache'
    });

    this.cacheMemoryUsageBytes = new promClient.Gauge({
      name: 'cache_memory_usage_bytes',
      help: 'Memory usage of cache in bytes'
    });

    // ========================================================================
    // DATABASE METRICS
    // ========================================================================

    this.dbQueryDuration = new promClient.Histogram({
      name: 'db_query_duration_seconds',
      help: 'Duration of database queries',
      labelNames: ['db_type', 'operation', 'table'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
    });

    this.dbQueriesTotal = new promClient.Counter({
      name: 'db_queries_total',
      help: 'Total number of database queries',
      labelNames: ['db_type', 'operation', 'status']
    });

    this.dbConnectionPoolSize = new promClient.Gauge({
      name: 'db_connection_pool_size',
      help: 'Current database connection pool size',
      labelNames: ['db_type']
    });

    this.dbConnectionPoolActive = new promClient.Gauge({
      name: 'db_connection_pool_active',
      help: 'Active database connections',
      labelNames: ['db_type']
    });

    this.dbLatencySeconds = new promClient.Gauge({
      name: 'db_latency_seconds',
      help: 'Current database latency',
      labelNames: ['db_type']
    });

    this.dbDualWriteErrors = new promClient.Counter({
      name: 'db_dual_write_errors_total',
      help: 'Total dual-write errors (secondary DB failures)',
      labelNames: ['db_type']
    });

    // ========================================================================
    // AI/ML METRICS
    // ========================================================================

    this.aiTrainTotal = new promClient.Counter({
      name: 'ai_train_total',
      help: 'Total AI model training runs',
      labelNames: ['model_type', 'entity_type', 'status']
    });

    this.aiTrainDuration = new promClient.Histogram({
      name: 'ai_train_duration_seconds',
      help: 'Duration of AI model training',
      labelNames: ['model_type', 'entity_type'],
      buckets: [1, 5, 10, 30, 60, 120, 300, 600]
    });

    this.aiPredictTotal = new promClient.Counter({
      name: 'ai_predict_total',
      help: 'Total AI predictions generated',
      labelNames: ['model_type', 'entity_type', 'status']
    });

    this.aiPredictDuration = new promClient.Histogram({
      name: 'ai_predict_duration_seconds',
      help: 'Duration of AI predictions',
      labelNames: ['model_type'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
    });

    // v15.5: Sanitized - removed entity_id PII, added tenant/env
    this.aiModelAccuracy = new promClient.Gauge({
      name: 'ai_model_accuracy_mape',
      help: 'AI model accuracy (Mean Absolute Percentage Error)',
      labelNames: ['model_type', 'tenant', 'env']
    });

    this.aiModelsActive = new promClient.Gauge({
      name: 'ai_models_active_total',
      help: 'Number of active AI models',
      labelNames: ['model_type']
    });

    this.aiConsumptionDerivedTotal = new promClient.Counter({
      name: 'ai_consumption_derived_total',
      help: 'Total consumption records derived',
      labelNames: ['status']
    });

    // v15.5: Sanitized - removed item_code PII
    this.aiAnomaliesDetected = new promClient.Counter({
      name: 'ai_anomalies_detected_total',
      help: 'Total consumption anomalies detected',
      labelNames: ['tenant', 'env']
    });

    // ========================================================================
    // AI FEEDBACK LOOP METRICS (v2.2.0)
    // ========================================================================

    this.aiFeedbackIngestTotal = new promClient.Counter({
      name: 'ai_feedback_ingest_total',
      help: 'Total feedback records ingested',
      labelNames: ['source', 'status']
    });

    // v15.5: Sanitized - removed item_code PII
    this.aiAccuracyMape = new promClient.Gauge({
      name: 'ai_accuracy_mape',
      help: 'Current MAPE for item forecast accuracy',
      labelNames: ['tenant', 'env']
    });

    // v15.5: Sanitized - removed item_code PII
    this.aiAccuracyRmse = new promClient.Gauge({
      name: 'ai_accuracy_rmse',
      help: 'Current RMSE for item forecast accuracy',
      labelNames: ['tenant', 'env']
    });

    this.aiAutotrainTriggersTotal = new promClient.Counter({
      name: 'ai_autotrain_triggers_total',
      help: 'Total autotrain triggers',
      labelNames: ['reason']
    });

    this.aiAutotrainDuration = new promClient.Histogram({
      name: 'ai_autotrain_duration_seconds',
      help: 'Duration of autotrain jobs',
      labelNames: ['status'],
      buckets: [5, 10, 30, 60, 120, 300, 600]
    });

    this.aiRetrainFailuresTotal = new promClient.Counter({
      name: 'ai_retrain_failures_total',
      help: 'Total retrain failures',
      labelNames: ['trigger']
    });

    // v15.5: Sanitized - removed item_code PII
    this.aiRlPolicyCommitsTotal = new promClient.Counter({
      name: 'ai_rl_policy_commits_total',
      help: 'Total RL policy commits',
      labelNames: ['tenant', 'env']
    });

    // v15.5: Sanitized - removed item_code PII
    this.aiRlRewardGauge = new promClient.Gauge({
      name: 'ai_rl_reward_gauge',
      help: 'Current RL reward for item policy',
      labelNames: ['tenant', 'env']
    });

    // ========================================================================
    // LOCAL AI TRAINING METRICS (v3.1.0-2025-10-09)
    // ========================================================================

    this.aiLocalTrainingWallSeconds = new promClient.Histogram({
      name: 'ai_local_training_wall_seconds',
      help: 'Wall-clock time for local training runs',
      labelNames: ['model'],
      buckets: [0.5, 1, 2, 3, 5, 7, 10, 15, 20, 30]
    });

    this.aiLocalTrainingMape = new promClient.Histogram({
      name: 'ai_local_training_mape',
      help: 'Mean Absolute Percentage Error from local training',
      labelNames: ['model'],
      buckets: [5, 10, 15, 20, 25, 30, 40, 50, 75, 100]
    });

    this.aiLocalTrainingRmse = new promClient.Histogram({
      name: 'ai_local_training_rmse',
      help: 'Root Mean Squared Error from local training',
      labelNames: ['model'],
      buckets: [1, 2, 5, 10, 15, 20, 30, 50, 75, 100]
    });

    this.aiReleasePromotionsTotal = new promClient.Counter({
      name: 'ai_release_promotions_total',
      help: 'Total AI model release promotions to live'
    });

    this.aiReleaseRollbacksTotal = new promClient.Counter({
      name: 'ai_release_rollbacks_total',
      help: 'Total AI model release rollbacks'
    });

    // ========================================================================
    // AI REAL-TIME INTELLIGENCE METRICS (v2.3.0-2025-10-07)
    // ========================================================================

    this.aiWsConnectionsTotal = new promClient.Gauge({
      name: 'ai_ws_connections_total',
      help: 'Current number of WebSocket connections',
      labelNames: []
    });

    this.aiWsEventsTotal = new promClient.Counter({
      name: 'ai_ws_events_total',
      help: 'Total WebSocket events broadcast',
      labelNames: ['event_type']
    });

    this.aiFeedbackStreamRate = new promClient.Gauge({
      name: 'ai_feedback_stream_rate',
      help: 'Feedback records processed per second',
      labelNames: []
    });

    this.aiForecastLatency = new promClient.Histogram({
      name: 'ai_forecast_latency_seconds',
      help: 'Forecast generation latency',
      labelNames: ['cache_status'],
      buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0]
    });

    // ========================================================================
    // MULTI-TENANCY & RBAC METRICS (v2.4.0-2025-10-07)
    // ========================================================================

    this.rbacDeniedTotal = new promClient.Counter({
      name: 'rbac_denied_total',
      help: 'Total RBAC permission denials',
      labelNames: ['permission', 'resource', 'action']
    });

    this.webhookDeliveriesTotal = new promClient.Counter({
      name: 'webhook_deliveries_total',
      help: 'Total webhook deliveries',
      labelNames: ['event', 'status']
    });

    this.ssoLoginsTotal = new promClient.Counter({
      name: 'sso_logins_total',
      help: 'Total SSO login attempts',
      labelNames: ['provider', 'result']
    });

    this.tenantRequestRate = new promClient.Gauge({
      name: 'tenant_request_rate',
      help: 'Request rate by tenant',
      labelNames: ['tenant_id']
    });

    // ========================================================================
    // INVENTORY BUSINESS METRICS
    // ========================================================================

    this.inventoryItemsTotal = new promClient.Gauge({
      name: 'inventory_items_total',
      help: 'Total number of inventory items'
    });

    this.inventoryValueTotal = new promClient.Gauge({
      name: 'inventory_value_total',
      help: 'Total inventory value in currency'
    });

    this.inventoryCountsTotal = new promClient.Counter({
      name: 'inventory_counts_total',
      help: 'Total inventory counts performed',
      labelNames: ['count_type', 'status']
    });

    this.inventoryReorderRecommendations = new promClient.Gauge({
      name: 'inventory_reorder_recommendations_total',
      help: 'Number of items recommended for reorder'
    });

    // v15.5: Sanitized - removed item_code PII
    this.inventoryStockoutsTotal = new promClient.Counter({
      name: 'inventory_stockouts_total',
      help: 'Total stockout events',
      labelNames: ['tenant', 'env']
    });

    // ========================================================================
    // SECURITY METRICS
    // ========================================================================

    // Get or create metrics to avoid duplicate registration errors
    const globalRegister = promClient.register;

    try {
      this.authAttemptsTotal = globalRegister.getSingleMetric('auth_attempts_total');
      if (!this.authAttemptsTotal) {
        this.authAttemptsTotal = new promClient.Counter({
          name: 'auth_attempts_total',
          help: 'Total authentication attempts',
          labelNames: ['status', 'result', 'role'],
          registers: [this.register, globalRegister]
        });
      }
    } catch (e) {
      this.authAttemptsTotal = new promClient.Counter({
        name: 'auth_attempts_total',
        help: 'Total authentication attempts',
        labelNames: ['status', 'result', 'role'],
        registers: [this.register, globalRegister]
      });
    }

    try {
      this.authFailedAttempts = globalRegister.getSingleMetric('auth_failed_attempts_total');
      if (!this.authFailedAttempts) {
        this.authFailedAttempts = new promClient.Counter({
          name: 'auth_failed_attempts_total',
          help: 'Total failed authentication attempts',
          labelNames: ['reason'],
          registers: [this.register, globalRegister]
        });
      }
    } catch (e) {
      this.authFailedAttempts = new promClient.Counter({
        name: 'auth_failed_attempts_total',
        help: 'Total failed authentication attempts',
        labelNames: ['reason'],
        registers: [this.register, globalRegister]
      });
    }

    this.usersActiveTotal = new promClient.Gauge({
      name: 'users_active_total',
      help: 'Number of active users'
    });

    this.sessionsActiveTotal = new promClient.Gauge({
      name: 'sessions_active_total',
      help: 'Number of active sessions'
    });

    // ========================================================================
    // SYSTEM HEALTH METRICS
    // ========================================================================

    this.systemHealthStatus = new promClient.Gauge({
      name: 'system_health_status',
      help: 'System health status (1=healthy, 0=unhealthy)',
      labelNames: ['component']
    });

    this.backupStatus = new promClient.Gauge({
      name: 'backup_last_status',
      help: 'Last backup status (1=success, 0=failure)'
    });

    this.backupDuration = new promClient.Histogram({
      name: 'backup_duration_seconds',
      help: 'Duration of backup operations',
      buckets: [1, 5, 10, 30, 60, 120, 300]
    });

    // ========================================================================
    // GOVERNANCE AGENT METRICS (v2.7.0-2025-10-07)
    // ========================================================================

    this.governancePolicyAdaptationsTotal = new promClient.Counter({
      name: 'governance_policy_adaptations_total',
      help: 'Total autonomous policy adaptations',
      labelNames: ['adaptation_type', 'status']
    });

    this.governanceLearningCyclesTotal = new promClient.Counter({
      name: 'governance_learning_cycles_total',
      help: 'Total governance learning cycles performed',
      labelNames: ['status']
    });

    this.governancePolicyScore = new promClient.Gauge({
      name: 'governance_policy_score',
      help: 'Current policy effectiveness score (0-1)',
      labelNames: ['policy_name']
    });

    this.governanceAdaptationConfidence = new promClient.Gauge({
      name: 'governance_adaptation_confidence',
      help: 'Confidence score for policy adaptations (0-1)',
      labelNames: ['policy_name', 'adaptation_type']
    });

    this.governanceThresholdAdjustmentsTotal = new promClient.Counter({
      name: 'governance_threshold_adjustments_total',
      help: 'Total threshold adjustments made',
      labelNames: ['policy_name', 'direction']
    });

    this.governanceFalsePositiveRate = new promClient.Gauge({
      name: 'governance_false_positive_rate',
      help: 'False positive rate for policies (0-1)',
      labelNames: ['policy_name']
    });

    this.governanceLearningDuration = new promClient.Histogram({
      name: 'governance_learning_duration_seconds',
      help: 'Duration of governance learning cycles',
      labelNames: ['status'],
      buckets: [1, 5, 10, 30, 60, 120, 300]
    });

    // ========================================================================
    // INSIGHT GENERATOR METRICS (v2.7.0-2025-10-07)
    // ========================================================================

    this.insightReportsGeneratedTotal = new promClient.Counter({
      name: 'insight_reports_generated_total',
      help: 'Total insight reports generated',
      labelNames: ['language', 'status']
    });

    this.insightReportBleuScore = new promClient.Gauge({
      name: 'insight_report_bleu_score',
      help: 'BLEU score for insight reports (0-1)',
      labelNames: ['language']
    });

    this.insightReportQualityScore = new promClient.Gauge({
      name: 'insight_report_quality_score',
      help: 'Quality score for insight reports (0-1)',
      labelNames: ['language']
    });

    this.insightLlmApiCallsTotal = new promClient.Counter({
      name: 'insight_llm_api_calls_total',
      help: 'Total LLM API calls made',
      labelNames: ['provider', 'model', 'status']
    });

    this.insightLlmApiDuration = new promClient.Histogram({
      name: 'insight_llm_api_duration_seconds',
      help: 'Duration of LLM API calls',
      labelNames: ['provider', 'model'],
      buckets: [0.5, 1, 2, 5, 10, 20, 30, 60]
    });

    this.insightLlmApiErrorsTotal = new promClient.Counter({
      name: 'insight_llm_api_errors_total',
      help: 'Total LLM API errors',
      labelNames: ['provider', 'error_type']
    });

    this.insightReportGenerationDuration = new promClient.Histogram({
      name: 'insight_report_generation_duration_seconds',
      help: 'Duration of report generation',
      labelNames: ['language'],
      buckets: [1, 5, 10, 30, 60, 120, 300]
    });

    // ========================================================================
    // COMPLIANCE AUDIT METRICS (v2.7.0-2025-10-07)
    // ========================================================================

    this.complianceAuditsTotal = new promClient.Counter({
      name: 'compliance_audits_total',
      help: 'Total compliance audits performed',
      labelNames: ['framework', 'status']
    });

    this.complianceScore = new promClient.Gauge({
      name: 'compliance_score',
      help: 'Compliance score by framework (0-1)',
      labelNames: ['framework']
    });

    this.complianceFindingsTotal = new promClient.Counter({
      name: 'compliance_findings_total',
      help: 'Total compliance findings',
      labelNames: ['framework', 'severity']
    });

    this.complianceChecksTotal = new promClient.Counter({
      name: 'compliance_checks_total',
      help: 'Total compliance checks performed',
      labelNames: ['framework', 'status']
    });

    this.complianceAuditDuration = new promClient.Histogram({
      name: 'compliance_audit_duration_seconds',
      help: 'Duration of compliance audits',
      labelNames: ['framework'],
      buckets: [1, 5, 10, 30, 60, 120, 300]
    });

    // ========================================================================
    // AI FORECAST ORDERS METRICS (v15.5.0-2025-10-13)
    // ========================================================================

    this.forecastRunTotal = new promClient.Counter({
      name: 'forecast_run_total',
      help: 'Total number of forecast runs'
    });

    this.forecastAccuracyPct = new promClient.Gauge({
      name: 'forecast_accuracy_pct',
      help: 'Current forecast accuracy percentage'
    });

    this.orderRecommendationTotal = new promClient.Counter({
      name: 'order_recommendation_generated_total',
      help: 'Total number of order recommendations generated'
    });

    this.forecastFeedbackReceivedTotal = new promClient.Counter({
      name: 'ai_feedback_received_total',
      help: 'Total feedback received on forecasts',
      labelNames: ['feedback_type']
    });

    this.forecastOrderApprovedTotal = new promClient.Counter({
      name: 'forecast_order_approved_total',
      help: 'Total orders approved from forecasts'
    });

    this.forecastLearningAppliedTotal = new promClient.Counter({
      name: 'forecast_learning_applied_total',
      help: 'Total learning cycles applied to forecasting engine'
    });

    // ========================================================================
    // PHASE 3: AUTONOMOUS LEARNING LAYER METRICS (v3.0.0-2025-10-08)
    // ========================================================================

    this.phase3TunerProposalsTotal = new promClient.Counter({
      name: 'phase3_tuner_proposals_total',
      help: 'Total AI tuning proposals generated',
      labelNames: ['status', 'module']
    });

    this.phase3TunerApplyDuration = new promClient.Histogram({
      name: 'phase3_tuner_apply_duration_seconds',
      help: 'Duration of tuning proposal application',
      labelNames: ['module'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
    });

    this.phase3HealthRiskPct = new promClient.Gauge({
      name: 'phase3_health_risk_pct',
      help: 'Current system health risk percentage (0-100)',
      labelNames: ['tenant_id']
    });

    this.phase3SecurityFindingsTotal = new promClient.Counter({
      name: 'phase3_security_findings_total',
      help: 'Total security findings detected',
      labelNames: ['severity', 'type']
    });

    this.phase3GovernanceReportsTotal = new promClient.Counter({
      name: 'phase3_governance_reports_total',
      help: 'Total governance reports generated',
      labelNames: ['status']
    });

    this.ownerAIRouteLatency = new promClient.Histogram({
      name: 'owner_ai_route_latency_seconds',
      help: 'Owner AI route latency in seconds',
      labelNames: ['route'],
      buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5]
    });

    this.ownerAIRouteErrorsTotal = new promClient.Counter({
      name: 'owner_ai_route_errors_total',
      help: 'Total Owner AI route errors',
      labelNames: ['route', 'code']
    });

    // ========================================================================
    // OWNER CONSOLE METRICS (v3.0.0-2025-10-09)
    // ========================================================================

    this.ownerConsoleRouteLatency = new promClient.Histogram({
      name: 'owner_console_route_latency_seconds',
      help: 'Owner Console route latency in seconds',
      labelNames: ['route', 'method'],
      buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5]
    });

    this.ownerConsoleRouteErrorsTotal = new promClient.Counter({
      name: 'owner_console_route_errors_total',
      help: 'Total Owner Console route errors',
      labelNames: ['route', 'method', 'error_code']
    });

    this.ownerConsolePdfUploadedTotal = new promClient.Counter({
      name: 'owner_console_pdf_uploaded_total',
      help: 'Total PDFs uploaded via Owner Console',
      labelNames: []
    });

    this.ownerConsolePdfUploadSizeBytes = new promClient.Histogram({
      name: 'owner_console_pdf_upload_size_bytes',
      help: 'Size of uploaded PDFs in bytes',
      buckets: [1000, 10000, 100000, 500000, 1000000, 5000000, 10000000]
    });

    this.ownerConsoleCountStartedTotal = new promClient.Counter({
      name: 'owner_console_count_started_total',
      help: 'Total counts started via Owner Console',
      labelNames: []
    });

    this.ownerConsoleCountClosedTotal = new promClient.Counter({
      name: 'owner_console_count_closed_total',
      help: 'Total counts closed via Owner Console',
      labelNames: []
    });

    this.ownerConsoleLocationUpdatesTotal = new promClient.Counter({
      name: 'owner_console_location_updates_total',
      help: 'Total location updates (GPS, sequence) via Owner Console',
      labelNames: ['update_type']
    });

    this.ownerConsoleAICommandsTotal = new promClient.Counter({
      name: 'owner_console_ai_commands_total',
      help: 'Total AI commands executed via Owner Console',
      labelNames: ['command_type', 'status']
    });

    this.ownerConsoleAccessGrantedTotal = new promClient.Counter({
      name: 'owner_console_access_granted_total',
      help: 'Total successful owner access grants',
      labelNames: []
    });

    this.ownerConsoleAccessDeniedTotal = new promClient.Counter({
      name: 'owner_console_access_denied_total',
      help: 'Total owner access denials',
      labelNames: ['reason']
    });

    this.phase3CronExecutionTotal = new promClient.Counter({
      name: 'phase3_cron_execution_total',
      help: 'Total Phase 3 cron job executions',
      labelNames: ['job', 'status']
    });

    this.phase3CronDuration = new promClient.Histogram({
      name: 'phase3_cron_duration_seconds',
      help: 'Duration of Phase 3 cron jobs',
      labelNames: ['job'],
      buckets: [1, 5, 10, 30, 60, 120, 300, 600]
    });

    // ========================================================================
    // v22.1: ENHANCED CRON JOB METRICS
    // ========================================================================

    this.cronJobRunsTotal = new promClient.Counter({
      name: 'cron_job_runs_total',
      help: 'Total cron job executions',
      labelNames: ['job', 'status']
    });

    this.cronJobErrorsTotal = new promClient.Counter({
      name: 'cron_job_errors_total',
      help: 'Total cron job errors',
      labelNames: ['job', 'error_type']
    });

    this.cronJobTimeoutsTotal = new promClient.Counter({
      name: 'cron_job_timeouts_total',
      help: 'Total cron job timeouts',
      labelNames: ['job']
    });

    this.cronJobRetriesTotal = new promClient.Counter({
      name: 'cron_job_retries_total',
      help: 'Total cron job retry attempts',
      labelNames: ['job']
    });

    this.cronJobDurationSeconds = new promClient.Histogram({
      name: 'cron_job_duration_seconds',
      help: 'Cron job execution duration in seconds',
      labelNames: ['job', 'status'],
      buckets: [0.5, 1, 2, 5, 10, 30, 60, 120, 300]
    });

    this.cronJobSuccessRateGauge = new promClient.Gauge({
      name: 'cron_job_success_rate',
      help: 'Cron job success rate (0-100)',
      labelNames: ['job']
    });

    this.cronJobLastRunTimestamp = new promClient.Gauge({
      name: 'cron_job_last_run_timestamp',
      help: 'Timestamp of last cron job run',
      labelNames: ['job']
    });

    this.cronJobActiveGauge = new promClient.Gauge({
      name: 'cron_job_active',
      help: 'Currently active cron jobs (1=running, 0=idle)',
      labelNames: ['job']
    });

    // ========================================================================
    // v22.1: CIRCUIT BREAKER METRICS
    // ========================================================================

    this.circuitBreakerStateGauge = new promClient.Gauge({
      name: 'circuit_breaker_state',
      help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
      labelNames: ['job']
    });

    this.circuitBreakerTripsTotal = new promClient.Counter({
      name: 'circuit_breaker_trips_total',
      help: 'Total circuit breaker trips (closed->open)',
      labelNames: ['job']
    });

    this.circuitBreakerResetsTotal = new promClient.Counter({
      name: 'circuit_breaker_resets_total',
      help: 'Total circuit breaker resets (manual or auto)',
      labelNames: ['job', 'reset_type']
    });

    this.circuitBreakerFailureCountGauge = new promClient.Gauge({
      name: 'circuit_breaker_failure_count',
      help: 'Current consecutive failure count per job',
      labelNames: ['job']
    });

    // ========================================================================
    // v22.1: SCHEDULER HEALTH METRICS
    // ========================================================================

    this.schedulerHealthGauge = new promClient.Gauge({
      name: 'scheduler_health_status',
      help: 'Scheduler health status (1=healthy, 0=unhealthy)'
    });

    this.schedulerActiveJobsGauge = new promClient.Gauge({
      name: 'scheduler_active_jobs_count',
      help: 'Number of currently active jobs'
    });

    this.schedulerShuttingDownGauge = new promClient.Gauge({
      name: 'scheduler_shutting_down',
      help: 'Scheduler shutdown in progress (1=yes, 0=no)'
    });

    // ========================================================================
    // DATABASE RETRY METRICS (v13.0.2-2025-10-19)
    // ========================================================================

    this.dbRetryAttempts = new promClient.Counter({
      name: 'db_retry_attempts_total',
      help: 'Total database retry attempts',
      labelNames: ['service', 'operation', 'attempt']
    });

    this.dbRetrySuccess = new promClient.Counter({
      name: 'db_retry_success_total',
      help: 'Successful database operations after retry',
      labelNames: ['service', 'operation', 'attempts_used']
    });

    this.dbRetryExhausted = new promClient.Counter({
      name: 'db_retry_exhausted_total',
      help: 'Database operations that failed after all retries',
      labelNames: ['service', 'operation', 'error_code']
    });

    this.watchdogMutexSkips = new promClient.Counter({
      name: 'watchdog_mutex_skips_total',
      help: 'Watchdog cycles skipped due to mutex lock'
    });

    this.aiIntelligenceIndex = new promClient.Gauge({
      name: 'ai_intelligence_index',
      help: 'Current AI Intelligence Index (0-100)',
      labelNames: ['component']
    });

    // ========================================================================
    // STABILITY LAYER METRICS (v16.3.0-2025-10-19)
    // ========================================================================

    this.stabilityScore = new promClient.Gauge({
      name: 'stability_score',
      help: 'Overall stability health score (0-100)'
    });

    this.stabilityObservations = new promClient.Counter({
      name: 'stability_observations_total',
      help: 'Total stability observations recorded',
      labelNames: ['service', 'operation']
    });

    this.stabilitySuccessRate = new promClient.Gauge({
      name: 'stability_success_rate',
      help: 'Stability success rate percentage (0-100)'
    });

    this.stabilityAvgAttempts = new promClient.Gauge({
      name: 'stability_avg_attempts',
      help: 'Average retry attempts per operation'
    });

    this.stabilityLockRate = new promClient.Gauge({
      name: 'stability_lock_rate',
      help: 'Database lock event rate percentage (0-100)'
    });

    this.stabilityRecommendations = new promClient.Counter({
      name: 'stability_recommendations_total',
      help: 'Total stability tuning recommendations generated',
      labelNames: ['author', 'applied']
    });

    this.stabilityPolicyUpdates = new promClient.Counter({
      name: 'stability_policy_updates_total',
      help: 'Total stability policy updates',
      labelNames: ['updated_by']
    });

    this.stabilityTuningCycles = new promClient.Counter({
      name: 'stability_tuning_cycles_total',
      help: 'Total tuning cycles executed'
    });

    this.stabilityCurrentMaxRetries = new promClient.Gauge({
      name: 'stability_current_max_retries',
      help: 'Current max retry attempts policy value'
    });

    this.stabilityCurrentBaseDelayMs = new promClient.Gauge({
      name: 'stability_current_base_delay_ms',
      help: 'Current base delay milliseconds policy value'
    });

    this.stabilityCurrentJitterPct = new promClient.Gauge({
      name: 'stability_current_jitter_pct',
      help: 'Current jitter percentage policy value'
    });

    this.stabilityCurrentCronIntervalMin = new promClient.Gauge({
      name: 'stability_current_cron_interval_min',
      help: 'Current cron minimum interval minutes policy value'
    });

    this.stabilityThrottleEvents = new promClient.Counter({
      name: 'stability_throttle_events_total',
      help: 'Total cron throttle events triggered'
    });

    // ========================================================================
    // QUANTUM GOVERNANCE METRICS (v15.8.0-2025-10-18)
    // ========================================================================

    this.governanceScoreGauge = new promClient.Gauge({
      name: 'governance_score_current',
      help: 'Current governance composite score (0-100)',
      labelNames: ['status']
    });

    this.governancePillarGauge = new promClient.Gauge({
      name: 'governance_pillar_score',
      help: 'Governance pillar scores (0-100)',
      labelNames: ['pillar']
    });

    this.governanceAlertsCounter = new promClient.Counter({
      name: 'governance_alerts_total',
      help: 'Total governance alerts detected',
      labelNames: ['type', 'severity']
    });

    this.governanceSnapshotCounter = new promClient.Counter({
      name: 'governance_snapshot_total',
      help: 'Total governance snapshots computed'
    });

    // ========================================================================
    // GOVERNANCE TRENDS & FORECASTING METRICS (v15.9.0-2025-10-18)
    // ========================================================================

    this.governanceScoreCompositeGauge = new promClient.Gauge({
      name: 'governance_score_composite_current',
      help: 'Current governance composite score (0-100)'
    });

    this.governanceScorePillarGauge = new promClient.Gauge({
      name: 'governance_score_pillar_current',
      help: 'Current pillar scores (0-100)',
      labelNames: ['pillar']
    });

    this.governanceTrendPointsCounter = new promClient.Counter({
      name: 'governance_trend_points_total',
      help: 'Total trend data points recorded',
      labelNames: ['pillar']
    });

    this.governanceForecastRunsCounter = new promClient.Counter({
      name: 'governance_forecast_runs_total',
      help: 'Total forecast runs executed'
    });

    this.governanceForecastRuntimeHistogram = new promClient.Histogram({
      name: 'governance_forecast_runtime_seconds',
      help: 'Forecast computation runtime',
      buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10]
    });

    // ========================================================================
    // GOVERNANCE INTELLIGENCE METRICS (v16.0.0-2025-10-18)
    // ========================================================================

    this.governanceIntelligenceScoreGauge = new promClient.Gauge({
      name: 'governance_intelligence_score',
      help: 'Current governance intelligence score (0-100)'
    });

    this.governanceAnomalyCountGauge = new promClient.Gauge({
      name: 'governance_anomaly_count',
      help: 'Count of governance anomalies by pillar and severity',
      labelNames: ['pillar', 'severity']
    });

    this.governanceReportGenerationsCounter = new promClient.Counter({
      name: 'governance_report_generations_total',
      help: 'Total governance intelligence reports generated',
      labelNames: ['locale']
    });

    this.governanceInsightGenerationsCounter = new promClient.Counter({
      name: 'governance_insight_generations_total',
      help: 'Total governance insights generated',
      labelNames: ['pillar', 'locale']
    });

    // ========================================================================
    // GOVERNANCE LIVE DASHBOARD METRICS (v16.4.0-2025-10-19)
    // ========================================================================

    this.governanceLiveHitsTotal = new promClient.Counter({
      name: 'governance_live_hits_total',
      help: 'Total hits to governance live status API'
    });

    this.governanceSparklineHitsTotal = new promClient.Counter({
      name: 'governance_sparkline_hits_total',
      help: 'Total hits to governance sparkline API',
      labelNames: ['pillar']
    });

    this.governanceSseTicksTotal = new promClient.Counter({
      name: 'governance_sse_ticks_total',
      help: 'Total SSE heartbeat ticks sent to governance live clients'
    });

    this.governanceLiveLatencyMs = new promClient.Gauge({
      name: 'governance_live_latency_ms',
      help: 'Latest governance live API response latency in milliseconds'
    });

    // ========================================================================
    // UNIFIED GOVERNANCE PANEL UI METRICS (v16.5.0-2025-10-19)
    // ========================================================================

    this.uiHitsTotal = new promClient.Counter({
      name: 'ui_hits_total',
      help: 'Total hits to UI API endpoints',
      labelNames: ['endpoint']
    });

    this.uiActionsTotal = new promClient.Counter({
      name: 'ui_actions_total',
      help: 'Total UI actions performed by users',
      labelNames: ['action']
    });

    this.uiWebSocketConnectionsGauge = new promClient.Gauge({
      name: 'ui_websocket_connections_current',
      help: 'Current number of active WebSocket connections for governance panel'
    });

    this.uiPanelRenderDuration = new promClient.Histogram({
      name: 'ui_panel_render_duration_ms',
      help: 'UI panel render duration in milliseconds',
      labelNames: ['panel'],
      buckets: [10, 50, 100, 250, 500, 1000, 2000]
    });

    // ========================================================================
    // FINANCE ENFORCEMENT METRICS (v16.2.0-2025-10-18)
    // ========================================================================

    this.itemBankActiveTotalGauge = new promClient.Gauge({
      name: 'item_bank_active_total',
      help: 'Total active items in the item bank'
    });

    this.financeNeedsMappingTotalGauge = new promClient.Gauge({
      name: 'finance_needs_mapping_total',
      help: 'Total invoice lines needing mapping review (confidence < 0.80)'
    });

    this.invoiceImbalanceTotalCounter = new promClient.Counter({
      name: 'invoice_imbalance_total',
      help: 'Total invoices with balance imbalances (>±2¢)'
    });

    this.financeAIMappingAutoPctGauge = new promClient.Gauge({
      name: 'finance_ai_mapping_auto_pct',
      help: 'Percentage of mappings auto-assigned with confidence >= 0.80 (0-100)'
    });

    this.financeTaxMismatchTotalCounter = new promClient.Counter({
      name: 'finance_tax_mismatch_total',
      help: 'Total tax calculation mismatches detected',
      labelNames: ['tax_type']
    });

    this.financePeriodVerifiedTotalGauge = new promClient.Gauge({
      name: 'finance_period_verified_total',
      help: 'Verified period totals by period',
      labelNames: ['period']
    });

    // Register all metrics
    this.register.registerMetric(this.httpRequestDuration);
    this.register.registerMetric(this.httpRequestsTotal);
    this.register.registerMetric(this.httpRequestSizeBytes);
    this.register.registerMetric(this.httpResponseSizeBytes);
    this.register.registerMetric(this.cacheHitsTotal);
    this.register.registerMetric(this.cacheMissesTotal);
    this.register.registerMetric(this.cacheOperationDuration);
    this.register.registerMetric(this.cacheSize);
    this.register.registerMetric(this.cacheMemoryUsageBytes);
    this.register.registerMetric(this.dbQueryDuration);
    this.register.registerMetric(this.dbQueriesTotal);
    this.register.registerMetric(this.dbConnectionPoolSize);
    this.register.registerMetric(this.dbConnectionPoolActive);
    this.register.registerMetric(this.dbLatencySeconds);
    this.register.registerMetric(this.dbDualWriteErrors);
    this.register.registerMetric(this.aiTrainTotal);
    this.register.registerMetric(this.aiTrainDuration);
    this.register.registerMetric(this.aiPredictTotal);
    this.register.registerMetric(this.aiPredictDuration);
    this.register.registerMetric(this.aiModelAccuracy);
    this.register.registerMetric(this.aiModelsActive);
    this.register.registerMetric(this.aiConsumptionDerivedTotal);
    this.register.registerMetric(this.aiAnomaliesDetected);
    this.register.registerMetric(this.inventoryItemsTotal);
    this.register.registerMetric(this.inventoryValueTotal);
    this.register.registerMetric(this.inventoryCountsTotal);
    this.register.registerMetric(this.inventoryReorderRecommendations);
    this.register.registerMetric(this.inventoryStockoutsTotal);
    this.register.registerMetric(this.authAttemptsTotal);
    this.register.registerMetric(this.authFailedAttempts);
    this.register.registerMetric(this.usersActiveTotal);
    this.register.registerMetric(this.sessionsActiveTotal);
    this.register.registerMetric(this.systemHealthStatus);
    this.register.registerMetric(this.backupStatus);
    this.register.registerMetric(this.backupDuration);

    // Register governance metrics (v2.7.0)
    this.register.registerMetric(this.governancePolicyAdaptationsTotal);
    this.register.registerMetric(this.governanceLearningCyclesTotal);
    this.register.registerMetric(this.governancePolicyScore);
    this.register.registerMetric(this.governanceAdaptationConfidence);
    this.register.registerMetric(this.governanceThresholdAdjustmentsTotal);
    this.register.registerMetric(this.governanceFalsePositiveRate);
    this.register.registerMetric(this.governanceLearningDuration);

    // Register insight metrics (v2.7.0)
    this.register.registerMetric(this.insightReportsGeneratedTotal);
    this.register.registerMetric(this.insightReportBleuScore);
    this.register.registerMetric(this.insightReportQualityScore);
    this.register.registerMetric(this.insightLlmApiCallsTotal);
    this.register.registerMetric(this.insightLlmApiDuration);
    this.register.registerMetric(this.insightLlmApiErrorsTotal);
    this.register.registerMetric(this.insightReportGenerationDuration);

    // Register compliance metrics (v2.7.0)
    this.register.registerMetric(this.complianceAuditsTotal);
    this.register.registerMetric(this.complianceScore);
    this.register.registerMetric(this.complianceFindingsTotal);
    this.register.registerMetric(this.complianceChecksTotal);
    this.register.registerMetric(this.complianceAuditDuration);

    // Register forecast order metrics (v15.5.0)
    this.register.registerMetric(this.forecastRunTotal);
    this.register.registerMetric(this.forecastAccuracyPct);
    this.register.registerMetric(this.orderRecommendationTotal);
    this.register.registerMetric(this.forecastFeedbackReceivedTotal);
    this.register.registerMetric(this.forecastOrderApprovedTotal);
    this.register.registerMetric(this.forecastLearningAppliedTotal);

    // Register Phase 3 metrics (v3.0.0)
    this.register.registerMetric(this.phase3TunerProposalsTotal);
    this.register.registerMetric(this.phase3TunerApplyDuration);
    this.register.registerMetric(this.phase3HealthRiskPct);
    this.register.registerMetric(this.phase3SecurityFindingsTotal);
    this.register.registerMetric(this.phase3GovernanceReportsTotal);
    this.register.registerMetric(this.ownerAIRouteLatency);
    this.register.registerMetric(this.ownerAIRouteErrorsTotal);
    this.register.registerMetric(this.ownerConsoleRouteLatency);
    this.register.registerMetric(this.ownerConsoleRouteErrorsTotal);
    this.register.registerMetric(this.ownerConsolePdfUploadedTotal);
    this.register.registerMetric(this.ownerConsolePdfUploadSizeBytes);
    this.register.registerMetric(this.ownerConsoleCountStartedTotal);
    this.register.registerMetric(this.ownerConsoleCountClosedTotal);
    this.register.registerMetric(this.ownerConsoleLocationUpdatesTotal);
    this.register.registerMetric(this.ownerConsoleAICommandsTotal);
    this.register.registerMetric(this.ownerConsoleAccessGrantedTotal);
    this.register.registerMetric(this.ownerConsoleAccessDeniedTotal);
    this.register.registerMetric(this.phase3CronExecutionTotal);
    this.register.registerMetric(this.phase3CronDuration);

    // Register v22.1 enhanced cron job metrics
    this.register.registerMetric(this.cronJobRunsTotal);
    this.register.registerMetric(this.cronJobErrorsTotal);
    this.register.registerMetric(this.cronJobTimeoutsTotal);
    this.register.registerMetric(this.cronJobRetriesTotal);
    this.register.registerMetric(this.cronJobDurationSeconds);
    this.register.registerMetric(this.cronJobSuccessRateGauge);
    this.register.registerMetric(this.cronJobLastRunTimestamp);
    this.register.registerMetric(this.cronJobActiveGauge);

    // Register v22.1 circuit breaker metrics
    this.register.registerMetric(this.circuitBreakerStateGauge);
    this.register.registerMetric(this.circuitBreakerTripsTotal);
    this.register.registerMetric(this.circuitBreakerResetsTotal);
    this.register.registerMetric(this.circuitBreakerFailureCountGauge);

    // Register v22.1 scheduler health metrics
    this.register.registerMetric(this.schedulerHealthGauge);
    this.register.registerMetric(this.schedulerActiveJobsGauge);
    this.register.registerMetric(this.schedulerShuttingDownGauge);

    // Register Database Retry metrics (v13.0.2)
    this.register.registerMetric(this.dbRetryAttempts);
    this.register.registerMetric(this.dbRetrySuccess);
    this.register.registerMetric(this.dbRetryExhausted);
    this.register.registerMetric(this.watchdogMutexSkips);
    this.register.registerMetric(this.aiIntelligenceIndex);

    // Register v3.1.0 local training metrics
    this.register.registerMetric(this.aiLocalTrainingWallSeconds);
    this.register.registerMetric(this.aiLocalTrainingMape);
    this.register.registerMetric(this.aiLocalTrainingRmse);
    this.register.registerMetric(this.aiReleasePromotionsTotal);
    this.register.registerMetric(this.aiReleaseRollbacksTotal);

    // Register Quantum Governance metrics (v15.8.0)
    this.register.registerMetric(this.governanceScoreGauge);
    this.register.registerMetric(this.governancePillarGauge);
    this.register.registerMetric(this.governanceAlertsCounter);
    this.register.registerMetric(this.governanceSnapshotCounter);

    // Register Governance Trends metrics (v15.9.0)
    this.register.registerMetric(this.governanceScoreCompositeGauge);
    this.register.registerMetric(this.governanceScorePillarGauge);
    this.register.registerMetric(this.governanceTrendPointsCounter);
    this.register.registerMetric(this.governanceForecastRunsCounter);
    this.register.registerMetric(this.governanceForecastRuntimeHistogram);

    // Register Governance Intelligence metrics (v16.0.0)
    this.register.registerMetric(this.governanceIntelligenceScoreGauge);
    this.register.registerMetric(this.governanceAnomalyCountGauge);
    this.register.registerMetric(this.governanceReportGenerationsCounter);
    this.register.registerMetric(this.governanceInsightGenerationsCounter);

    // Register Governance Live Dashboard metrics (v16.4.0)
    this.register.registerMetric(this.governanceLiveHitsTotal);
    this.register.registerMetric(this.governanceSparklineHitsTotal);
    this.register.registerMetric(this.governanceSseTicksTotal);
    this.register.registerMetric(this.governanceLiveLatencyMs);

    // Register UI metrics (v16.5.0)
    this.register.registerMetric(this.uiHitsTotal);
    this.register.registerMetric(this.uiActionsTotal);
    this.register.registerMetric(this.uiWebSocketConnectionsGauge);
    this.register.registerMetric(this.uiPanelRenderDuration);

    // Register Finance Enforcement metrics (v16.2.0)
    this.register.registerMetric(this.itemBankActiveTotalGauge);
    this.register.registerMetric(this.financeNeedsMappingTotalGauge);
    this.register.registerMetric(this.invoiceImbalanceTotalCounter);
    this.register.registerMetric(this.financeAIMappingAutoPctGauge);
    this.register.registerMetric(this.financeTaxMismatchTotalCounter);
    this.register.registerMetric(this.financePeriodVerifiedTotalGauge);
  }

  /**
   * Get metrics in Prometheus text format
   */
  async getMetrics() {
    return await this.register.metrics();
  }

  /**
   * Get metrics as JSON
   */
  async getMetricsJSON() {
    return await this.register.getMetricsAsJSON();
  }

  /**
   * Record HTTP request
   */
  recordHttpRequest(method, route, statusCode, duration, requestSize, responseSize) {
    this.httpRequestDuration.labels(method, route, statusCode).observe(duration);
    this.httpRequestsTotal.labels(method, route, statusCode).inc();

    if (requestSize) {
      this.httpRequestSizeBytes.labels(method, route).observe(requestSize);
    }

    if (responseSize) {
      this.httpResponseSizeBytes.labels(method, route).observe(responseSize);
    }
  }

  /**
   * Record cache operation
   */
  recordCacheHit(keyPrefix) {
    this.cacheHitsTotal.labels(keyPrefix).inc();
  }

  recordCacheMiss(keyPrefix) {
    this.cacheMissesTotal.labels(keyPrefix).inc();
  }

  recordCacheOperation(operation, status, duration) {
    this.cacheOperationDuration.labels(operation, status).observe(duration);
  }

  setCacheSize(size) {
    this.cacheSize.set(size);
  }

  setCacheMemoryUsage(bytes) {
    this.cacheMemoryUsageBytes.set(bytes);
  }

  /**
   * Record database operation
   */
  recordDbQuery(dbType, operation, table, duration, status = 'success') {
    this.dbQueryDuration.labels(dbType, operation, table).observe(duration);
    this.dbQueriesTotal.labels(dbType, operation, status).inc();
  }

  setDbConnectionPool(dbType, poolSize, activeConnections) {
    this.dbConnectionPoolSize.labels(dbType).set(poolSize);
    this.dbConnectionPoolActive.labels(dbType).set(activeConnections);
  }

  setDbLatency(dbType, latency) {
    this.dbLatencySeconds.labels(dbType).set(latency);
  }

  recordDbDualWriteError(dbType) {
    this.dbDualWriteErrors.labels(dbType).inc();
  }

  /**
   * Record AI/ML operations
   */
  recordAiTrain(modelType, entityType, status, duration) {
    this.aiTrainTotal.labels(modelType, entityType, status).inc();
    if (duration) {
      this.aiTrainDuration.labels(modelType, entityType).observe(duration);
    }
  }

  recordAiPredict(modelType, entityType, status, duration) {
    this.aiPredictTotal.labels(modelType, entityType, status).inc();
    if (duration) {
      this.aiPredictDuration.labels(modelType).observe(duration);
    }
  }

  // v15.5: Updated signature - removed entityId PII, added tenant/env
  setAiModelAccuracy(modelType, tenant, env, mape) {
    this.aiModelAccuracy.labels(modelType, tenant || 'default', env || 'production').set(mape);
  }

  setAiModelsActive(modelType, count) {
    this.aiModelsActive.labels(modelType).set(count);
  }

  recordConsumptionDerived(status) {
    this.aiConsumptionDerivedTotal.labels(status).inc();
  }

  // v15.5: Updated signature - removed itemCode PII, added tenant/env
  recordAnomalyDetected(tenant, env) {
    this.aiAnomaliesDetected.labels(tenant || 'default', env || 'production').inc();
  }

  /**
   * AI Feedback Loop & Self-Optimization Metrics (v2.2.0-2025-10-07)
   */
  recordFeedbackIngest(source, status) {
    this.aiFeedbackIngestTotal.labels(source, status).inc();
  }

  // v15.5: Updated signature - removed itemCode PII, added tenant/env
  recordAccuracyMetric(tenant, env, mape, rmse) {
    const tenantLabel = tenant || 'default';
    const envLabel = env || 'production';

    if (mape !== undefined && mape !== null) {
      this.aiAccuracyMape.labels(tenantLabel, envLabel).set(mape);
    }
    if (rmse !== undefined && rmse !== null) {
      this.aiAccuracyRmse.labels(tenantLabel, envLabel).set(rmse);
    }
  }

  recordAutotrainTrigger(reason) {
    this.aiAutotrainTriggersTotal.labels(reason).inc();
  }

  recordAutotrainDuration(duration, status) {
    this.aiAutotrainDuration.labels(status).observe(duration);
  }

  recordAutotrainFailure(trigger) {
    this.aiRetrainFailuresTotal.labels(trigger).inc();
  }

  // v15.5: Updated signature - removed itemCode PII, added tenant/env
  recordRLPolicyCommit(tenant, env, improvementPercent) {
    this.aiRlPolicyCommitsTotal.labels(tenant || 'default', env || 'production').inc();
  }

  // v15.5: Updated signature - removed itemCode PII, added tenant/env
  recordRLReward(tenant, env, reward) {
    this.aiRlRewardGauge.labels(tenant || 'default', env || 'production').set(reward);
  }

  /**
   * AI Real-Time Intelligence Metrics (v2.3.0-2025-10-07)
   */
  recordWSConnection(action) {
    if (action === 'connected') {
      this.aiWsConnectionsTotal.inc();
    } else if (action === 'disconnected') {
      this.aiWsConnectionsTotal.dec();
    }
  }

  recordWSEvent(eventType) {
    this.aiWsEventsTotal.labels(eventType).inc();
  }

  recordFeedbackStreamProcessing(recordCount, duration) {
    const rate = recordCount / duration;
    this.aiFeedbackStreamRate.set(rate);
  }

  recordForecastLatency(latency, cacheStatus) {
    this.aiForecastLatency.labels(cacheStatus).observe(latency);
  }

  /**
   * Multi-Tenancy & RBAC Metrics (v2.4.0-2025-10-07)
   */
  recordRBACDenial(permission) {
    // Parse permission into resource:action
    const parts = permission.split(':');
    const resource = parts[0] || 'unknown';
    const action = parts[1] || 'unknown';
    this.rbacDeniedTotal.labels(permission, resource, action).inc();
  }

  recordWebhookDelivery(eventType, status) {
    this.webhookDeliveriesTotal.labels(eventType, status).inc();
  }

  recordSSOLogin(provider, result) {
    this.ssoLoginsTotal.labels(provider, result).inc();
  }

  recordTenantRequest(tenantId) {
    this.tenantRequestRate.labels(tenantId).inc();
  }

  /**
   * Update inventory business metrics
   */
  setInventoryMetrics(itemsTotal, valueTotal) {
    this.inventoryItemsTotal.set(itemsTotal);
    this.inventoryValueTotal.set(valueTotal);
  }

  recordInventoryCount(countType, status) {
    this.inventoryCountsTotal.labels(countType, status).inc();
  }

  setReorderRecommendations(count) {
    this.inventoryReorderRecommendations.set(count);
  }

  // v15.5: Updated signature - removed itemCode PII, added tenant/env
  recordStockout(tenant, env) {
    this.inventoryStockoutsTotal.labels(tenant || 'default', env || 'production').inc();
  }

  /**
   * Record security events
   */
  recordAuthAttempt(status) {
    this.authAttemptsTotal.labels(status).inc();
    if (status === 'failed') {
      this.authFailedAttempts.labels('invalid_credentials').inc();
    }
  }

  recordAuthFailure(reason) {
    this.authFailedAttempts.labels(reason).inc();
  }

  setActiveUsers(count) {
    this.usersActiveTotal.set(count);
  }

  setActiveSessions(count) {
    this.sessionsActiveTotal.set(count);
  }

  /**
   * Update system health
   */
  setSystemHealth(component, isHealthy) {
    this.systemHealthStatus.labels(component).set(isHealthy ? 1 : 0);
  }

  recordBackup(status, duration) {
    this.backupStatus.set(status === 'success' ? 1 : 0);
    if (duration) {
      this.backupDuration.observe(duration);
    }
  }

  /**
   * Governance Agent Metrics (v2.7.0-2025-10-07)
   */
  recordGovernancePolicyAdaptation(adaptationType, status) {
    this.governancePolicyAdaptationsTotal.labels(adaptationType, status).inc();
  }

  recordGovernanceLearningCycle(status, duration) {
    this.governanceLearningCyclesTotal.labels(status).inc();
    if (duration) {
      this.governanceLearningDuration.labels(status).observe(duration);
    }
  }

  setGovernancePolicyScore(policyName, score) {
    this.governancePolicyScore.labels(policyName).set(score);
  }

  setGovernanceAdaptationConfidence(policyName, adaptationType, confidence) {
    this.governanceAdaptationConfidence.labels(policyName, adaptationType).set(confidence);
  }

  recordGovernanceThresholdAdjustment(policyName, direction) {
    this.governanceThresholdAdjustmentsTotal.labels(policyName, direction).inc();
  }

  setGovernanceFalsePositiveRate(policyName, rate) {
    this.governanceFalsePositiveRate.labels(policyName).set(rate);
  }

  /**
   * Insight Generator Metrics (v2.7.0-2025-10-07)
   */
  recordInsightReportGenerated(language, status, duration) {
    this.insightReportsGeneratedTotal.labels(language, status).inc();
    if (duration) {
      this.insightReportGenerationDuration.labels(language).observe(duration);
    }
  }

  setInsightReportBleuScore(language, score) {
    this.insightReportBleuScore.labels(language).set(score);
  }

  setInsightReportQualityScore(language, score) {
    this.insightReportQualityScore.labels(language).set(score);
  }

  recordInsightLlmApiCall(provider, model, status, duration) {
    this.insightLlmApiCallsTotal.labels(provider, model, status).inc();
    if (duration) {
      this.insightLlmApiDuration.labels(provider, model).observe(duration);
    }
  }

  recordInsightLlmApiError(provider, errorType) {
    this.insightLlmApiErrorsTotal.labels(provider, errorType).inc();
  }

  /**
   * Compliance Audit Metrics (v2.7.0-2025-10-07)
   */
  recordComplianceAudit(framework, status, duration) {
    this.complianceAuditsTotal.labels(framework, status).inc();
    if (duration) {
      this.complianceAuditDuration.labels(framework).observe(duration);
    }
  }

  setComplianceScore(framework, score) {
    this.complianceScore.labels(framework).set(score);
  }

  recordComplianceFinding(framework, severity) {
    this.complianceFindingsTotal.labels(framework, severity).inc();
  }

  recordComplianceCheck(framework, status) {
    this.complianceChecksTotal.labels(framework, status).inc();
  }

  /**
   * Owner AI Operational Intelligence Metrics (v2.8.0)
   */
  // v15.5: Updated signature - removed actor PII, kept tenant/env only
  recordOwnerAIReorderRequest(tenant, env, itemCount) {
    if (!this.ownerAIReorderRequestsTotal) {
      this.ownerAIReorderRequestsTotal = new promClient.Counter({
        name: 'owner_ai_reorder_requests_total',
        help: 'Total owner AI reorder recommendation requests',
        labelNames: ['tenant', 'env'],
        registers: [this.register]
      });
    }
    this.ownerAIReorderRequestsTotal.labels(tenant || 'default', env || 'production').inc(itemCount || 1);
  }

  recordOwnerAIAnomalyTriage(action, severity) {
    if (!this.ownerAIAnomalyTriageTotal) {
      this.ownerAIAnomalyTriageTotal = new promClient.Counter({
        name: 'owner_ai_anomaly_triage_total',
        help: 'Total owner AI anomaly triage actions',
        labelNames: ['action', 'severity'],
        registers: [this.register]
      });
    }
    this.ownerAIAnomalyTriageTotal.labels(action, severity).inc();
  }

  recordOwnerAIUpgradeAction(action, mode) {
    if (!this.ownerAIUpgradeActionsTotal) {
      this.ownerAIUpgradeActionsTotal = new promClient.Counter({
        name: 'owner_ai_upgrade_actions_total',
        help: 'Total owner AI upgrade/optimization actions',
        labelNames: ['action', 'mode'],
        registers: [this.register]
      });
    }
    this.ownerAIUpgradeActionsTotal.labels(action, mode).inc();
  }

  recordOwnerAIWidgetLatency(widget, duration) {
    if (!this.ownerAIWidgetLatency) {
      this.ownerAIWidgetLatency = new promClient.Histogram({
        name: 'owner_ai_widget_latency_seconds',
        help: 'Owner AI widget load latency',
        labelNames: ['widget'],
        buckets: [0.1, 0.5, 1, 2, 5],
        registers: [this.register]
      });
    }
    this.ownerAIWidgetLatency.labels(widget).observe(duration);
  }

  /**
   * Phase 3: Autonomous Learning Layer Metrics (v3.0.0-2025-10-08)
   */

  /**
   * Record AI tuning proposal
   */
  recordPhase3TunerProposal(status, module) {
    this.phase3TunerProposalsTotal.labels(status, module).inc();
  }

  /**
   * Record tuning proposal application duration
   */
  recordPhase3TunerApplyDuration(module, duration) {
    this.phase3TunerApplyDuration.labels(module).observe(duration);
  }

  /**
   * Set health risk percentage
   */
  setPhase3HealthRisk(tenantId, riskPct) {
    this.phase3HealthRiskPct.labels(tenantId || 'default').set(riskPct);
  }

  /**
   * Record security finding
   */
  recordPhase3SecurityFinding(severity, type) {
    this.phase3SecurityFindingsTotal.labels(severity, type).inc();
  }

  /**
   * Record governance report generation
   */
  recordPhase3GovernanceReport(status = 'success') {
    this.phase3GovernanceReportsTotal.labels(status).inc();
  }

  /**
   * Record Owner AI route latency
   */
  recordOwnerAIRouteLatency(route, duration) {
    this.ownerAIRouteLatency.labels(route).observe(duration);
  }

  /**
   * Record Owner AI route error
   */
  recordOwnerAIRouteError(route, statusCode) {
    this.ownerAIRouteErrorsTotal.labels(route, statusCode.toString()).inc();
  }

  /**
   * Record inventory count submissions (v3.0.0)
   */
  recordInventoryCountSubmission(status, tenantId) {
    if (!this.inventoryCountSubmissionsTotal) {
      this.inventoryCountSubmissionsTotal = new promClient.Counter({
        name: 'inventory_count_submissions_total',
        help: 'Total inventory counts submitted by status',
        labelNames: ['status', 'tenant_id']
      });
      this.register.registerMetric(this.inventoryCountSubmissionsTotal);
    }
    this.inventoryCountSubmissionsTotal.labels(status, tenantId || 'default').inc();
  }

  /**
   * Record inventory count variance (v3.0.0)
   */
  recordInventoryCountVariance(variance, tenantId) {
    if (!this.inventoryCountVarianceTotal) {
      this.inventoryCountVarianceTotal = new promClient.Gauge({
        name: 'inventory_count_variance_total',
        help: 'Total variance in inventory counts',
        labelNames: ['tenant_id']
      });
      this.register.registerMetric(this.inventoryCountVarianceTotal);
    }
    this.inventoryCountVarianceTotal.labels(tenantId || 'default').set(variance);
  }

  /**
   * Record owner actions for inventory approvals (v3.0.0)
   */
  recordOwnerAction(action) {
    if (!this.ownerActionsTotal) {
      this.ownerActionsTotal = new promClient.Counter({
        name: 'owner_actions_total',
        help: 'Total owner actions performed',
        labelNames: ['action']
      });
      this.register.registerMetric(this.ownerActionsTotal);
    }
    this.ownerActionsTotal.labels(action).inc();
  }

  /**
   * Record Phase 3 cron execution
   */
  recordPhase3CronExecution(job, status, duration) {
    this.phase3CronExecutionTotal.labels(job, status).inc();
    if (duration) {
      this.phase3CronDuration.labels(job).observe(duration);
    }
  }

  // ========================================================================
  // v22.1: ENHANCED CRON JOB RECORDING METHODS
  // ========================================================================

  /**
   * Record cron job run
   * @param {string} job - Job name
   * @param {string} status - 'success', 'failure', 'timeout', 'skipped'
   * @param {number} durationSec - Duration in seconds
   */
  recordCronJobRun(job, status, durationSec) {
    this.cronJobRunsTotal.labels(job, status).inc();
    if (durationSec != null) {
      this.cronJobDurationSeconds.labels(job, status).observe(durationSec);
    }
    this.cronJobLastRunTimestamp.labels(job).set(Date.now() / 1000);
  }

  /**
   * Record cron job error
   * @param {string} job - Job name
   * @param {string} errorType - 'exception', 'timeout', 'circuit_breaker'
   */
  recordCronJobError(job, errorType) {
    this.cronJobErrorsTotal.labels(job, errorType).inc();
  }

  /**
   * Record cron job timeout
   * @param {string} job - Job name
   */
  recordCronJobTimeout(job) {
    this.cronJobTimeoutsTotal.labels(job).inc();
  }

  /**
   * Record cron job retry
   * @param {string} job - Job name
   */
  recordCronJobRetry(job) {
    this.cronJobRetriesTotal.labels(job).inc();
  }

  /**
   * Set cron job success rate
   * @param {string} job - Job name
   * @param {number} rate - Success rate 0-100
   */
  setCronJobSuccessRate(job, rate) {
    this.cronJobSuccessRateGauge.labels(job).set(rate);
  }

  /**
   * Set cron job active state
   * @param {string} job - Job name
   * @param {boolean} active - Whether job is currently running
   */
  setCronJobActive(job, active) {
    this.cronJobActiveGauge.labels(job).set(active ? 1 : 0);
  }

  // ========================================================================
  // v22.1: CIRCUIT BREAKER RECORDING METHODS
  // ========================================================================

  /**
   * Set circuit breaker state
   * @param {string} job - Job name
   * @param {string} state - 'closed', 'open', 'half-open'
   */
  setCircuitBreakerState(job, state) {
    const stateMap = { closed: 0, open: 1, 'half-open': 2 };
    this.circuitBreakerStateGauge.labels(job).set(stateMap[state] ?? 0);
  }

  /**
   * Record circuit breaker trip
   * @param {string} job - Job name
   */
  recordCircuitBreakerTrip(job) {
    this.circuitBreakerTripsTotal.labels(job).inc();
  }

  /**
   * Record circuit breaker reset
   * @param {string} job - Job name
   * @param {string} resetType - 'manual' or 'auto'
   */
  recordCircuitBreakerReset(job, resetType = 'auto') {
    this.circuitBreakerResetsTotal.labels(job, resetType).inc();
  }

  /**
   * Set circuit breaker failure count
   * @param {string} job - Job name
   * @param {number} count - Consecutive failure count
   */
  setCircuitBreakerFailureCount(job, count) {
    this.circuitBreakerFailureCountGauge.labels(job).set(count);
  }

  // ========================================================================
  // v22.1: SCHEDULER HEALTH RECORDING METHODS
  // ========================================================================

  /**
   * Set scheduler health status
   * @param {boolean} healthy - Whether scheduler is healthy
   */
  setSchedulerHealth(healthy) {
    this.schedulerHealthGauge.set(healthy ? 1 : 0);
  }

  /**
   * Set active jobs count
   * @param {number} count - Number of active jobs
   */
  setSchedulerActiveJobs(count) {
    this.schedulerActiveJobsGauge.set(count);
  }

  /**
   * Set scheduler shutting down state
   * @param {boolean} shuttingDown - Whether shutdown is in progress
   */
  setSchedulerShuttingDown(shuttingDown) {
    this.schedulerShuttingDownGauge.set(shuttingDown ? 1 : 0);
  }

  /**
   * Update all scheduler metrics at once (convenience method)
   * @param {Object} status - Scheduler status object from getWatchdogStatus()
   */
  updateSchedulerMetrics(status) {
    this.setSchedulerHealth(status.isRunning && !status.isShuttingDown);
    this.setSchedulerActiveJobs(status.activeJobCount || 0);
    this.setSchedulerShuttingDown(status.isShuttingDown || false);

    // Update per-job active states
    const activeJobs = status.activeJobs || [];
    const allJobs = ['ai_forecast', 'ai_learning', 'governance_score', 'self_heal'];
    allJobs.forEach(job => {
      this.setCronJobActive(job, activeJobs.includes(job));
    });

    // Update job metrics from jobMetrics
    if (status.jobMetrics) {
      for (const [job, metrics] of Object.entries(status.jobMetrics)) {
        if (metrics.successRate != null) {
          this.setCronJobSuccessRate(job, metrics.successRate);
        }
      }
    }

    // Update circuit breaker states
    if (status.circuitBreakers) {
      for (const [job, breaker] of Object.entries(status.circuitBreakers)) {
        this.setCircuitBreakerState(job, breaker.state);
        this.setCircuitBreakerFailureCount(job, breaker.failureCount || 0);
      }
    }
  }

  // ========================================================================
  // OWNER CONSOLE RECORDING METHODS (v3.0.0)
  // ========================================================================

  /**
   * Record owner console route latency
   */
  recordOwnerConsoleRouteLatency(route, method, duration) {
    this.ownerConsoleRouteLatency.labels(route, method).observe(duration);
  }

  /**
   * Record owner console route error
   */
  recordOwnerConsoleRouteError(route, method, errorCode) {
    this.ownerConsoleRouteErrorsTotal.labels(route, method, errorCode.toString()).inc();
  }

  /**
   * Record owner console PDF upload
   */
  recordOwnerConsolePdfUpload(sizeBytes) {
    this.ownerConsolePdfUploadedTotal.inc();
    this.ownerConsolePdfUploadSizeBytes.observe(sizeBytes);
  }

  /**
   * Record owner console count started
   */
  recordOwnerConsoleCountStarted() {
    this.ownerConsoleCountStartedTotal.inc();
  }

  /**
   * Record owner console count closed
   */
  recordOwnerConsoleCountClosed() {
    this.ownerConsoleCountClosedTotal.inc();
  }

  /**
   * Record owner console location update
   */
  recordOwnerConsoleLocationUpdate(updateType) {
    this.ownerConsoleLocationUpdatesTotal.labels(updateType).inc();
  }

  /**
   * Record owner console AI command
   */
  recordOwnerConsoleAICommand(commandType, status) {
    this.ownerConsoleAICommandsTotal.labels(commandType, status).inc();
  }

  /**
   * Record owner access granted
   */
  recordOwnerAccessGranted() {
    this.ownerConsoleAccessGrantedTotal.inc();
  }

  /**
   * Record owner access denied
   */
  recordOwnerAccessDenied(reason) {
    this.ownerConsoleAccessDeniedTotal.labels(reason).inc();
  }

  // ========================================================================
  // LOCAL AI TRAINING RECORDING METHODS (v3.1.0)
  // ========================================================================

  /**
   * Record local training metrics
   * @param {Object} params - Training parameters
   * @param {string} params.model - Model type (prophet|arima)
   * @param {number} params.wallSec - Wall-clock seconds
   * @param {number} params.mape - Mean Absolute Percentage Error (optional)
   * @param {number} params.rmse - Root Mean Squared Error (optional)
   */
  recordTrainingMetrics({ model, wallSec, mape, rmse }) {
    if (wallSec != null) {
      this.aiLocalTrainingWallSeconds.labels(model).observe(wallSec);
    }
    if (mape != null) {
      this.aiLocalTrainingMape.labels(model).observe(mape);
    }
    if (rmse != null) {
      this.aiLocalTrainingRmse.labels(model).observe(rmse);
    }
  }

  /**
   * Increment release promotion counter
   */
  incPromotion() {
    this.aiReleasePromotionsTotal.inc();
  }

  /**
   * Increment release rollback counter
   */
  incRollback() {
    this.aiReleaseRollbacksTotal.inc();
  }

  // ========================================================================
  // FORECAST ORDER RECORDING METHODS (v15.5.0-2025-10-13)
  // ========================================================================

  /**
   * Record forecast run execution
   * @param {number} itemsForecasted - Number of items forecasted
   */
  recordForecastRun(itemsForecasted = 1) {
    this.forecastRunTotal.inc();
    if (itemsForecasted > 0) {
      this.orderRecommendationTotal.inc(itemsForecasted);
    }
  }

  /**
   * Set forecast accuracy percentage
   * @param {number} accuracyPct - Accuracy percentage (0-100)
   */
  setForecastAccuracy(accuracyPct) {
    this.forecastAccuracyPct.set(accuracyPct);
  }

  /**
   * Record forecast feedback submission
   * @param {string} feedbackType - Type of feedback (adjustment|approval|rejection)
   */
  recordForecastFeedback(feedbackType) {
    this.forecastFeedbackReceivedTotal.labels(feedbackType).inc();
  }

  /**
   * Record forecast order approval
   * @param {number} count - Number of orders approved
   */
  recordForecastOrderApproval(count = 1) {
    this.forecastOrderApprovedTotal.inc(count);
  }

  /**
   * Record forecast learning cycle applied
   */
  recordForecastLearningApplied() {
    this.forecastLearningAppliedTotal.inc();
  }

  // ========================================================================
  // QUANTUM GOVERNANCE RECORDING METHODS (v15.8.0-2025-10-18)
  // ========================================================================

  /**
   * Set governance composite score
   * @param {string} status - Status label (Healthy|Warning|Action)
   * @param {number} score - Composite score (0-100)
   */
  setGovernanceScore(status, score) {
    this.governanceScoreGauge.labels(status).set(score);
  }

  /**
   * Set governance pillar score
   * @param {string} pillar - Pillar name (finance|health|ai|menu)
   * @param {number} score - Pillar score (0-100)
   */
  setGovernancePillarScore(pillar, score) {
    this.governancePillarGauge.labels(pillar).set(score);
  }

  /**
   * Record governance alert
   * @param {string} type - Alert type (e.g., FINANCE_DRIFT, AI_STALE_FEEDBACK)
   * @param {string} severity - Severity level (info|warning|critical)
   */
  recordGovernanceAlert(type, severity) {
    this.governanceAlertsCounter.labels(type, severity).inc();
  }

  /**
   * Record governance snapshot computation
   */
  recordGovernanceSnapshot() {
    this.governanceSnapshotCounter.inc();
  }

  // ========================================================================
  // GOVERNANCE TRENDS & FORECASTING RECORDING METHODS (v15.9.0-2025-10-18)
  // ========================================================================

  /**
   * Record daily scores for all pillars
   * @param {Object} scores - { finance, health, ai, menu, composite }
   */
  recordGovernanceDailyScores(scores) {
    if (scores.composite != null) {
      this.governanceScoreCompositeGauge.set(scores.composite);
    }

    const pillars = ['finance', 'health', 'ai', 'menu'];
    pillars.forEach(pillar => {
      if (scores[pillar] != null) {
        this.governanceScorePillarGauge.labels(pillar).set(scores[pillar]);
        this.governanceTrendPointsCounter.labels(pillar).inc();
      }
    });

    // Also increment composite trend points
    if (scores.composite != null) {
      this.governanceTrendPointsCounter.labels('composite').inc();
    }
  }

  /**
   * Increment forecast runs counter
   */
  incrementGovernanceForecastRuns() {
    this.governanceForecastRunsCounter.inc();
  }

  /**
   * Record forecast runtime
   * @param {number} runtime - Runtime in seconds
   */
  recordGovernanceForecastRuntime(runtime) {
    this.governanceForecastRuntimeHistogram.observe(runtime);
  }

  // ========================================================================
  // GOVERNANCE INTELLIGENCE RECORDING METHODS (v16.0.0-2025-10-18)
  // ========================================================================

  /**
   * Record governance intelligence score
   * @param {number} score - Intelligence score (0-100)
   */
  recordGovernanceIntelligenceScore(score) {
    this.governanceIntelligenceScoreGauge.set(score);
  }

  /**
   * Record anomaly count for a specific pillar and severity
   * @param {string} pillar - Pillar name (finance|health|ai|menu|composite)
   * @param {string} severity - Severity level (low|medium|high|critical)
   * @param {number} count - Number of anomalies
   */
  recordGovernanceAnomalyCount(pillar, severity, count) {
    this.governanceAnomalyCountGauge.labels(pillar, severity).set(count);
  }

  /**
   * Increment governance report generations
   * @param {string} locale - Report locale (en|fr)
   */
  incrementGovernanceReportGenerations(locale = 'en') {
    this.governanceReportGenerationsCounter.labels(locale).inc();
  }

  /**
   * Increment governance insight generations
   * @param {string} pillar - Pillar name (finance|health|ai|menu|composite)
   * @param {string} locale - Insight locale (en|fr)
   */
  incrementGovernanceInsightGenerations(pillar, locale = 'en') {
    this.governanceInsightGenerationsCounter.labels(pillar, locale).inc();
  }

  // ========================================================================
  // FINANCE ENFORCEMENT RECORDING METHODS (v16.2.0-2025-10-18)
  // ========================================================================

  /**
   * Record item bank active total
   * @param {number} total - Total active items in item bank
   */
  recordItemBankActiveTotal(total) {
    this.itemBankActiveTotalGauge.set(total);
  }

  /**
   * Record finance needs mapping total
   * @param {number} total - Total invoice lines needing mapping review
   */
  recordFinanceNeedsMappingTotal(total) {
    this.financeNeedsMappingTotalGauge.set(total);
  }

  /**
   * Increment invoice imbalance counter
   * @param {number} count - Number of imbalanced invoices to increment by
   */
  recordInvoiceImbalanceTotal(count = 1) {
    this.invoiceImbalanceTotalCounter.inc(count);
  }

  /**
   * Record finance AI mapping auto percentage
   * @param {number} percentage - Percentage of auto-assigned mappings (0-100)
   */
  recordFinanceAIMappingAutoPct(percentage) {
    this.financeAIMappingAutoPctGauge.set(percentage);
  }

  /**
   * Increment tax mismatch counter
   * @param {string} taxType - Tax type (gst|qst)
   */
  recordFinanceTaxMismatch(taxType) {
    this.financeTaxMismatchTotalCounter.labels(taxType).inc();
  }

  /**
   * Record verified period total
   * @param {string} period - Fiscal period (e.g., FY26-P01)
   * @param {number} value - 1 for verified, 0 for unverified
   */
  recordFinancePeriodVerifiedTotal(period, value = 1) {
    this.financePeriodVerifiedTotalGauge.labels(period).set(value);
  }

  // ========================================================================
  // DATABASE RETRY RECORDING METHODS (v13.0.2-2025-10-19)
  // ========================================================================

  /**
   * Record database retry attempt
   * @param {string} service - Service name (menu_predictor, feedback_trainer)
   * @param {string} operation - Operation name (getPredictedUsageForToday, etc.)
   * @param {number} attempt - Attempt number (1, 2, 3)
   */
  recordDbRetryAttempt(service, operation, attempt) {
    this.dbRetryAttempts.labels(service, operation, String(attempt)).inc();
  }

  /**
   * Record successful database operation after retry
   * @param {string} service - Service name
   * @param {string} operation - Operation name
   * @param {number} attemptsUsed - Number of attempts used (1, 2, or 3)
   */
  recordDbRetrySuccess(service, operation, attemptsUsed) {
    this.dbRetrySuccess.labels(service, operation, String(attemptsUsed)).inc();
  }

  /**
   * Record database retry exhaustion (all retries failed)
   * @param {string} service - Service name
   * @param {string} operation - Operation name
   * @param {string} errorCode - SQLite error code
   */
  recordDbRetryExhausted(service, operation, errorCode) {
    this.dbRetryExhausted.labels(service, operation, errorCode || 'UNKNOWN').inc();
  }

  /**
   * Record watchdog mutex skip
   */
  recordWatchdogMutexSkip() {
    this.watchdogMutexSkips.inc();
  }

  /**
   * Set AI Intelligence Index
   * @param {string} component - Component name (forecast, learning, overall)
   * @param {number} score - Intelligence index score (0-100)
   */
  setAiIntelligenceIndex(component, score) {
    this.aiIntelligenceIndex.labels(component).set(score);
  }

  // ========================================================================
  // STABILITY LAYER RECORDING METHODS (v16.3.0-2025-10-19)
  // ========================================================================

  /**
   * Set stability score
   * @param {number} score - Stability health score (0-100)
   */
  setStabilityScore(score) {
    this.stabilityScore.set(score);
  }

  /**
   * Record stability observation
   * @param {string} service - Service name
   * @param {string} operation - Operation name
   */
  recordStabilityObservation(service, operation) {
    this.stabilityObservations.labels(service, operation).inc();
  }

  /**
   * Set stability success rate
   * @param {number} rate - Success rate percentage (0-100)
   */
  setStabilitySuccessRate(rate) {
    this.stabilitySuccessRate.set(rate);
  }

  /**
   * Set stability average attempts
   * @param {number} avgAttempts - Average retry attempts
   */
  setStabilityAvgAttempts(avgAttempts) {
    this.stabilityAvgAttempts.set(avgAttempts);
  }

  /**
   * Set stability lock rate
   * @param {number} rate - Lock event rate percentage (0-100)
   */
  setStabilityLockRate(rate) {
    this.stabilityLockRate.set(rate);
  }

  /**
   * Record stability recommendation
   * @param {string} author - Author (AUTO or email)
   * @param {boolean} applied - Whether recommendation was applied
   */
  recordStabilityRecommendation(author, applied = false) {
    this.stabilityRecommendations.labels(author, applied ? 'true' : 'false').inc();
  }

  /**
   * Record stability policy update
   * @param {string} updatedBy - Email or SYSTEM
   */
  recordStabilityPolicyUpdate(updatedBy) {
    this.stabilityPolicyUpdates.labels(updatedBy).inc();
  }

  /**
   * Record stability tuning cycle
   */
  recordStabilityTuningCycle() {
    this.stabilityTuningCycles.inc();
  }

  /**
   * Set current policy values
   * @param {object} policy - Policy object with max_retries, base_delay_ms, jitter_pct, cron_min_interval_min
   */
  setStabilityPolicyValues(policy) {
    this.stabilityCurrentMaxRetries.set(policy.max_retries);
    this.stabilityCurrentBaseDelayMs.set(policy.base_delay_ms);
    this.stabilityCurrentJitterPct.set(policy.jitter_pct);
    this.stabilityCurrentCronIntervalMin.set(policy.cron_min_interval_min);
  }

  /**
   * Record throttle event
   */
  recordStabilityThrottleEvent() {
    this.stabilityThrottleEvents.inc();
  }

  // ========================================================================
  // GOVERNANCE LIVE DASHBOARD HELPERS (v16.4.0)
  // ========================================================================

  /**
   * Record a hit to the governance live status API
   */
  recordGovernanceLiveHit() {
    this.governanceLiveHitsTotal.inc();
  }

  /**
   * Record a hit to the governance sparkline API
   * @param {string} pillar - The pillar name (composite, finance, health, ai, menu)
   */
  recordGovernanceSparklineHit(pillar) {
    this.governanceSparklineHitsTotal.labels(pillar).inc();
  }

  /**
   * Record an SSE tick sent to governance live clients
   */
  recordGovernanceSseTick() {
    this.governanceSseTicksTotal.inc();
  }

  /**
   * Set governance live API latency
   * @param {number} latencyMs - Latency in milliseconds
   */
  setGovernanceLiveLatency(latencyMs) {
    this.governanceLiveLatencyMs.set(latencyMs);
  }

  // ========================================================================
  // UNIFIED GOVERNANCE PANEL UI HELPERS (v16.5.0)
  // ========================================================================

  /**
   * Record a hit to a UI API endpoint
   * @param {string} endpoint - The endpoint name (e.g., 'governance_predictive_trend', 'governance_unified')
   */
  incrementUIHit(endpoint) {
    this.uiHitsTotal.labels(endpoint).inc();
  }

  /**
   * Record a UI action performed by a user
   * @param {string} action - The action name (e.g., 'refresh_all', 'generate_report', 'recompute_ai')
   */
  incrementUIAction(action) {
    this.uiActionsTotal.labels(action).inc();
  }

  /**
   * Set the current number of active WebSocket connections
   * @param {number} count - The current connection count
   */
  setUIWebSocketConnections(count) {
    this.uiWebSocketConnectionsGauge.set(count);
  }

  /**
   * Record UI panel render duration
   * @param {string} panel - The panel name (e.g., 'governance_command_center', 'predictive_trend')
   * @param {number} durationMs - Duration in milliseconds
   */
  recordUIPanelRenderDuration(panel, durationMs) {
    this.uiPanelRenderDuration.labels(panel).observe(durationMs);
  }
}

// Singleton instance
const metricsExporter = new MetricsExporter();

module.exports = metricsExporter;
