# NeuroInnovate Enterprise v19.3 – Proposed Environment Configuration
# Inherits all v19.2 variables + new v19.3 optimizations
# Last Updated: 2025-11-05
# Stability Target: 99.6/100

# ============================================================
# CORE SERVICE CONFIGURATION (v19.2 – unchanged)
# ============================================================
NODE_ENV=production
PORT=3000
ML_SERVICE_URL=https://ml-service-production.railway.app
DATABASE_PATH=./database.db
DATABASE_WAL_ENABLED=true

# ============================================================
# FORECAST CONFIGURATION (v19.2 baseline + v19.3 tuning)
# ============================================================
FORECAST_SCHEDULE=5 2 * * *
FORECAST_BATCH_SIZE=20
STREAMING_BATCH_DELAY_MS=300
ENABLE_STREAMING_FORECAST=true
LOG_BATCH_PROGRESS=true

RETRAIN_SCHEDULE=0 4 * * 0
ENABLE_AUTO_RETRAIN=true

# ============================================================
# MAPE & ACCURACY THRESHOLDS (v19.2 – unchanged)
# ============================================================
MAPE_THRESHOLD=20
MAX_HEALTH_FAILURES=6
ENABLE_ITEM_MAPE_MONITORING=true
MAPE_ITEM_THRESHOLD_MULTIPLIER=1.5
INCLUDE_HIGH_VARIANCE_ITEMS_IN_REPORT=true
MAX_HIGH_VARIANCE_ITEMS_IN_REPORT=10

# ============================================================
# CACHE CONFIGURATION (v19.2 baseline + v19.3 predictive)
# ============================================================
FORECAST_CACHE_PRELOAD=true
CACHE_PRELOAD_ASYNC=true
CACHE_PRELOAD_TIMEOUT_MS=30000
CACHE_STALE_WHILE_REVALIDATE=true
QUERY_CACHE_TTL=7200
FORECAST_CACHE_TTL=86400
CACHE_STALE_TTL_MS=60000

PREDICTIVE_CACHE_ENABLED=true
PREDICTIVE_CACHE_LOOKBACK_HOURS=168
PREDICTIVE_CACHE_FORECAST_HOURS=12
PREDICTIVE_CACHE_TOPK=200
PREDICTIVE_CACHE_WARMUP_ON_STARTUP=true
PREDICTIVE_CACHE_PEAK_WINDOWS=02:00-03:00,12:00-13:00
PREDICTIVE_CACHE_FALLBACK_TO_BASELINE=true
PREDICTIVE_CACHE_PRELOAD_TIMEOUT_MS=30000

# ============================================================
# DATABASE OPTIMIZATION (v19.2 – unchanged)
# ============================================================
DB_AUTO_CREATE_INDEXES=true
DB_INDEX_FORECASTS_COMPOSITE=true
DB_CONNECTION_POOL_SIZE=10
DB_QUERY_TIMEOUT_MS=5000

# ============================================================
# MEMORY & RESOURCE LIMITS (v19.2 – unchanged)
# ============================================================
MEMORY_WARNING_THRESHOLD_PERCENT=70
MEMORY_CRITICAL_THRESHOLD_PERCENT=80
MAX_CONCURRENT_FORECASTS=1

# ============================================================
# SELF-HEALING WATCHDOG (v19.2 – unchanged)
# ============================================================
ENABLE_SELF_HEALING=true
SCHEDULER_WATCHDOG_ENABLED=true
SCHEDULER_WATCHDOG_INTERVAL_MS=300000
SCHEDULER_WATCHDOG_TIMEOUT_MS=120000

# ============================================================
# v19.3 NEW: OUTLIER MODEL ROUTING
# ============================================================
OUTLIER_ROUTING_ENABLED=true
OUTLIER_MODEL_STRATEGY=auto
OUTLIER_MADF_THRESHOLD=3.0
OUTLIER_MAX_PER_RUN=10
OUTLIER_LOG_DECISIONS=true
OUTLIER_CROSTON_ALPHA=0.1
OUTLIER_TSB_ALPHA=0.1
OUTLIER_TSB_BETA=0.1

# ============================================================
# v19.3 NEW: MULTI-REGION READINESS (SCAFFOLD ONLY)
# ============================================================
MULTIREGION_READY=true
DEFAULT_REGION=us
ALLOWED_REGIONS=us,eu
CACHE_REGION_AWARE_KEYS=true
REGION_FAILOVER_ENABLED=false
REGION_LATENCY_THRESHOLD_MS=200

# ============================================================
# EMAIL REPORTING (v19.2 – unchanged)
# ============================================================
EMAIL_SCHEDULE=20 2 * * *
EMAIL_RECIPIENTS=neuropilotai@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=neuropilotai@gmail.com
SMTP_PASS=your_smtp_password_here

# ============================================================
# LOGGING & MONITORING (v19.2 – unchanged)
# ============================================================
LOG_LEVEL=info
LOG_FORMAT=json
ENABLE_PERFORMANCE_LOGGING=true
ENABLE_AUDIT_LOGGING=true

# ============================================================
# API RATE LIMITING (v19.2 – unchanged)
# ============================================================
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# ============================================================
# SECURITY (v19.2 – unchanged)
# ============================================================
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://frontend-production.railway.app
HELMET_ENABLED=true

# ============================================================
# RAILWAY DEPLOYMENT (v19.2 – unchanged)
# ============================================================
RAILWAY_ENVIRONMENT=production
RAILWAY_SERVICE_NAME=backend
RAILWAY_DEPLOYMENT_ID=${RAILWAY_DEPLOYMENT_ID}
RAILWAY_GIT_COMMIT_SHA=${RAILWAY_GIT_COMMIT_SHA}

# ============================================================
# v19.3 VERSION METADATA
# ============================================================
APP_VERSION=19.3.0
DEPLOYMENT_DATE=2025-11-05
STABILITY_TARGET=99.6
FEATURE_FLAGS=predictive-cache,outlier-routing,multiregion-scaffold
