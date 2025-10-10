/**
 * Prometheus Metrics Exporter
 * Comprehensive metrics for inventory system monitoring
 * Compatible with Prometheus 2.x and Grafana
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

    this.aiModelAccuracy = new promClient.Gauge({
      name: 'ai_model_accuracy_mape',
      help: 'AI model accuracy (Mean Absolute Percentage Error)',
      labelNames: ['model_type', 'entity_id']
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

    this.aiAnomaliesDetected = new promClient.Counter({
      name: 'ai_anomalies_detected_total',
      help: 'Total consumption anomalies detected',
      labelNames: ['item_code']
    });

    // ========================================================================
    // AI FEEDBACK LOOP METRICS (v2.2.0)
    // ========================================================================

    this.aiFeedbackIngestTotal = new promClient.Counter({
      name: 'ai_feedback_ingest_total',
      help: 'Total feedback records ingested',
      labelNames: ['source', 'status']
    });

    this.aiAccuracyMape = new promClient.Gauge({
      name: 'ai_accuracy_mape',
      help: 'Current MAPE for item forecast accuracy',
      labelNames: ['item_code']
    });

    this.aiAccuracyRmse = new promClient.Gauge({
      name: 'ai_accuracy_rmse',
      help: 'Current RMSE for item forecast accuracy',
      labelNames: ['item_code']
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

    this.aiRlPolicyCommitsTotal = new promClient.Counter({
      name: 'ai_rl_policy_commits_total',
      help: 'Total RL policy commits',
      labelNames: ['item_code']
    });

    this.aiRlRewardGauge = new promClient.Gauge({
      name: 'ai_rl_reward_gauge',
      help: 'Current RL reward for item policy',
      labelNames: ['item_code']
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

    this.inventoryStockoutsTotal = new promClient.Counter({
      name: 'inventory_stockouts_total',
      help: 'Total stockout events',
      labelNames: ['item_code']
    });

    // ========================================================================
    // SECURITY METRICS
    // ========================================================================

    this.authAttemptsTotal = new promClient.Counter({
      name: 'auth_attempts_total',
      help: 'Total authentication attempts',
      labelNames: ['status']
    });

    this.authFailedAttempts = new promClient.Counter({
      name: 'auth_failed_attempts_total',
      help: 'Total failed authentication attempts',
      labelNames: ['reason']
    });

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

    // Register v3.1.0 local training metrics
    this.register.registerMetric(this.aiLocalTrainingWallSeconds);
    this.register.registerMetric(this.aiLocalTrainingMape);
    this.register.registerMetric(this.aiLocalTrainingRmse);
    this.register.registerMetric(this.aiReleasePromotionsTotal);
    this.register.registerMetric(this.aiReleaseRollbacksTotal);
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

  setAiModelAccuracy(modelType, entityId, mape) {
    this.aiModelAccuracy.labels(modelType, entityId).set(mape);
  }

  setAiModelsActive(modelType, count) {
    this.aiModelsActive.labels(modelType).set(count);
  }

  recordConsumptionDerived(status) {
    this.aiConsumptionDerivedTotal.labels(status).inc();
  }

  recordAnomalyDetected(itemCode) {
    this.aiAnomaliesDetected.labels(itemCode).inc();
  }

  /**
   * AI Feedback Loop & Self-Optimization Metrics (v2.2.0-2025-10-07)
   */
  recordFeedbackIngest(source, status) {
    this.aiFeedbackIngestTotal.labels(source, status).inc();
  }

  recordAccuracyMetric(itemCode, mape, rmse) {
    if (mape !== undefined && mape !== null) {
      this.aiAccuracyMape.labels(itemCode).set(mape);
    }
    if (rmse !== undefined && rmse !== null) {
      this.aiAccuracyRmse.labels(itemCode).set(rmse);
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

  recordRLPolicyCommit(itemCode, improvementPercent) {
    this.aiRlPolicyCommitsTotal.labels(itemCode).inc();
  }

  recordRLReward(itemCode, reward) {
    this.aiRlRewardGauge.labels(itemCode).set(reward);
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

  recordStockout(itemCode) {
    this.inventoryStockoutsTotal.labels(itemCode).inc();
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
  recordOwnerAIReorderRequest(actor, tenant, itemCount) {
    if (!this.ownerAIReorderRequestsTotal) {
      this.ownerAIReorderRequestsTotal = new promClient.Counter({
        name: 'owner_ai_reorder_requests_total',
        help: 'Total owner AI reorder recommendation requests',
        labelNames: ['actor', 'tenant'],
        registers: [this.register]
      });
    }
    this.ownerAIReorderRequestsTotal.labels(actor, tenant).inc(itemCount || 1);
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
}

// Singleton instance
const metricsExporter = new MetricsExporter();

module.exports = metricsExporter;
