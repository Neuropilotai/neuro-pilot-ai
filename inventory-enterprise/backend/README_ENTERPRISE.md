# 🏢 Enterprise Inventory Management System v2.1

Enterprise-grade inventory management with **AI-powered forecasting**, **Redis caching**, **PostgreSQL support**, bilingual support (EN/FR), and production-ready observability (Prometheus/Grafana). Compliance-ready architecture (ISO-27001/SOC2).

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env

# 3. Generate secure keys
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"  # For JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # For ENCRYPTION_KEY

# 4. Edit .env and set all REPLACE_WITH_* values

# 5. Run migrations
npm run migrate

# 6. Start server
npm start  # Production
npm run dev  # Development
```

## 📁 Architecture

```
inventory-enterprise/backend/
├── config/
│   ├── index.js          # Configuration manager
│   ├── encryption.js     # AES-256-GCM encryption
│   ├── logger.js         # Winston logging
│   ├── redis.js          # Redis cache configuration
│   └── database.js       # PostgreSQL/SQLite config
├── middleware/
│   ├── auth.js           # JWT authentication + 2FA
│   ├── security.js       # Rate limiting, XSS/SQL protection
│   ├── validation.js     # Input validation
│   ├── i18n.js           # Bilingual support
│   └── compression.js    # Gzip/Brotli compression (v2.1)
├── routes/
│   ├── auth.js           # Authentication endpoints
│   ├── inventory.js      # Inventory management
│   ├── users.js          # User management
│   ├── ai-api.js         # AI forecasting endpoints (v2.1)
│   └── enterprise-inventory-api.js  # Advanced inventory ops
├── utils/
│   ├── transactionLog.js # Append-only audit log
│   ├── backup.js         # Automated backups
│   ├── metricsExporter.js # Prometheus metrics (40+ metrics)
│   ├── aiForecaster.js   # Prophet/ARIMA forecasting (v2.1)
│   └── redisCache.js     # Redis caching layer (v2.1)
├── migrations/
│   ├── run.js            # Migration runner
│   └── 001_*.js          # Migration files
├── locales/
│   ├── en.json           # English translations
│   └── fr.json           # French translations
├── grafana/
│   ├── Inventory-Overview.json    # Business metrics dashboard
│   ├── Database-Ops.json          # DB performance dashboard
│   ├── AI-Models.json             # AI/ML monitoring dashboard
│   └── alerts.yml                 # Prometheus alert rules
├── docs/
│   ├── OPERATIONS_GUIDE.md        # Daily operations & maintenance
│   ├── SECURITY_AUDIT_v2.1.md     # Security audit report
│   └── GRAFANA_GUIDE.md           # Monitoring setup guide
├── data/
│   ├── enterprise_inventory.db  # SQLite database (primary)
│   ├── transaction_log.jsonl    # Transaction log
│   └── ai/
│       └── models/               # Trained AI models (.pkl files)
├── logs/                 # Rotated log files (Winston)
├── backups/              # Encrypted database backups
├── __tests__/            # Jest test suites (unit + integration)
├── .github/
│   └── workflows/
│       ├── ci.yml        # CI pipeline (test + lint + coverage)
│       └── deploy.yml    # CD pipeline (Docker build + deploy)
├── server.js             # Main application
├── package.json
├── .env                  # Environment variables (not in repo)
└── prometheus.yml        # Prometheus scrape config
```

## 🔐 Security Features

| Feature | Implementation | Status |
|---------|----------------|--------|
| **Data at Rest Encryption** | AES-256-GCM | ✅ |
| **JWT Authentication** | Access + Refresh tokens | ✅ |
| **JWT Rotation** | Token versioning with blacklist | ✅ |
| **2FA Enforcement** | TOTP (mandatory for admin) | ✅ |
| **Redis Authentication** | Strong password (256-bit) | ✅ |
| **PostgreSQL SSL/TLS** | Client certificates | ✅ |
| **Rate Limiting** | Per-IP + Per-user + Per-endpoint | ✅ |
| **Input Validation** | express-validator + XSS/SQL filters | ✅ |
| **CORS Hardening** | Whitelist-based | ✅ |
| **Security Headers** | Helmet.js (HSTS, CSP, etc.) | ✅ |
| **Transaction Log** | Append-only JSONL | ✅ |
| **Audit Trail** | Comprehensive audit logging | ✅ |
| **Encrypted Backups** | AES-256-CBC with PBKDF2 | ✅ |

## 📊 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login with email/password (2FA if enabled)
- `POST /api/auth/2fa/setup` - Setup 2FA (generate QR code)
- `POST /api/auth/2fa/verify` - Verify 2FA token
- `POST /api/auth/2fa/disable` - Disable 2FA
- `POST /api/auth/refresh` - Refresh access token (with rotation)
- `POST /api/auth/logout` - Logout (invalidate tokens)
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/change-password` - Change password

### Inventory Management
- `GET /api/inventory` - List all inventory items (paginated)
- `POST /api/inventory/add-item` - Add inventory item
- `PUT /api/inventory/:id` - Update inventory item
- `DELETE /api/inventory/:id` - Delete inventory item
- `GET /api/inventory/lookup/:itemCode` - Lookup item details
- `GET /api/locations/:locationName/inventory` - Get items by location
- `GET /api/inventory/search?q=query` - Search inventory items
- `GET /api/inventory/low-stock` - Get low stock items (below par)

### AI Forecasting (v2.1)
- `POST /api/ai/forecast/train` - Train forecasting model (Prophet/ARIMA)
- `GET /api/ai/forecast/:itemCode` - Get forecast for item
- `POST /api/ai/consumption/derive` - Derive consumption from transactions
- `POST /api/ai/consumption/detect-anomalies` - Detect anomalous consumption
- `GET /api/ai/models/list` - List all trained models
- `GET /api/ai/models/:modelId` - Get model details and accuracy metrics
- `DELETE /api/ai/models/:modelId` - Archive old model

### Dashboard & Reports
- `GET /api/dashboard/stats` - Dashboard statistics (cached)
- `GET /api/reports/inventory-value` - Inventory valuation report
- `GET /api/reports/reorder-recommendations` - Items needing reorder

### System
- `GET /health` - Health check (database + cache + AI)
- `GET /status` - System status
- `GET /metrics` - Prometheus metrics (40+ metrics)
- `GET /api/cache/stats` - Cache performance statistics

## 🌐 Bilingual Support (EN/FR)

The system automatically detects language from the `Accept-Language` header or `?lang=fr` query parameter.

```javascript
// Example: French API request
fetch('/api/inventory', {
  headers: {
    'Accept-Language': 'fr'
  }
})
```

## 🔄 Backup & Recovery

### Automated Backups
- **Schedule:** Daily at 2 AM (configurable via `BACKUP_SCHEDULE`)
- **Retention:** 30 days (configurable via `BACKUP_RETENTION_DAYS`)
- **Location:** Local + Google Drive (optional)

### Manual Backup
```bash
npm run backup
```

### Restore from Backup
```bash
# 1. Stop the server
# 2. Copy backup database
cp backups/inventory_backup_YYYY-MM-DD/database.db data/enterprise_inventory.db
# 3. Restart server
npm start
```

## 📈 Monitoring & Observability (v2.1)

### Prometheus Metrics
Access metrics at `GET /metrics` for scraping by Prometheus.

**40+ Available Metrics:**

**HTTP Metrics:**
- `http_requests_total` - Total HTTP requests (by method, route, status_code)
- `http_request_duration_seconds` - Request duration histogram (p50/p95/p99)
- `http_request_size_bytes` - Request payload size
- `http_response_size_bytes` - Response payload size

**Cache Metrics (Redis):**
- `cache_hits_total` - Total cache hits (by key_prefix)
- `cache_misses_total` - Total cache misses
- `cache_operation_duration_seconds` - Cache operation latency
- `cache_size_bytes` - Total cache size
- `cache_memory_usage_bytes` - Redis memory usage

**Database Metrics (SQLite + PostgreSQL):**
- `db_query_duration_seconds` - Query latency histogram (by db_type, operation, table)
- `db_queries_total` - Total queries (by operation, status)
- `db_latency_seconds` - Current database latency
- `db_connection_pool_size` - Connection pool size
- `db_connection_pool_active` - Active connections
- `db_dual_write_errors_total` - Secondary database write failures

**AI/ML Metrics:**
- `ai_train_total` - Total training runs (by model_type, status)
- `ai_train_duration_seconds` - Training duration histogram
- `ai_predict_total` - Total predictions (by model_type, status)
- `ai_predict_duration_seconds` - Prediction latency histogram
- `ai_model_accuracy_mape` - Model MAPE (by entity_id, model_type)
- `ai_models_active_total` - Number of active models
- `ai_anomalies_detected_total` - Detected anomalies
- `ai_consumption_derived_total` - Derived consumption records

**Inventory Metrics:**
- `inventory_items_total` - Total inventory items
- `inventory_value_total` - Total inventory value ($)
- `inventory_counts_total` - Total inventory counts performed
- `inventory_reorder_recommendations_total` - Items below par level
- `inventory_stockouts_total` - Stockout events

**Security Metrics:**
- `auth_attempts_total` - Authentication attempts (by status)
- `auth_failed_attempts_total` - Failed login attempts
- `users_active_total` - Active users
- `sessions_active_total` - Active sessions

**System Health Metrics:**
- `system_health_status` - Component health (database, cache, ai) - 1=healthy, 0=unhealthy
- `backup_last_status` - Last backup status - 1=success, 0=failed
- `backup_duration_seconds` - Backup duration histogram

### Grafana Dashboards

**1. Inventory Overview Dashboard**
- API throughput and latency (p95 < 100ms target)
- Cache hit rate (85%+ target)
- AI model accuracy (MAPE < 15% target)
- Inventory value and reorder recommendations
- System health status

**2. Database Operations Dashboard**
- Query latency comparison (SQLite vs PostgreSQL)
- Query rate by operation (SELECT/INSERT/UPDATE/DELETE)
- Connection pool monitoring
- Dual-write error tracking
- Performance comparison tables

**3. AI Models & Forecasting Dashboard**
- Model accuracy (MAPE) by type (Prophet, ARIMA)
- Training duration heatmaps
- Prediction latency monitoring
- Anomaly detection metrics
- Top anomalous items

**Setup:**
```bash
# See docs/GRAFANA_GUIDE.md for full setup instructions

# Quick start with Docker Compose
docker-compose -f docker-compose.monitoring.yml up -d

# Access Grafana at http://localhost:3000 (admin/admin)
# Dashboards auto-import from grafana/ directory
```

### Alert Rules (Prometheus AlertManager)

**Critical Alerts:**
- API latency > 500ms (2 min)
- High error rate > 5% (5 min)
- Cache down (2 min)
- Database down (1 min)
- No active AI models (5 min)
- Backup failed (5 min)
- Brute force attack detected (>20 failures in 5 min)

**Warning Alerts:**
- API latency > 200ms (5 min)
- Cache hit rate < 60% (10 min)
- Cache memory > 1.8GB (5 min)
- Database latency > 500ms (5 min)
- AI model MAPE > 20% (15 min)
- High reorder recommendations > 50 items (15 min)

**Alert Routing:**
- Critical → Email + Slack + PagerDuty
- Security → Security team + PagerDuty
- Warning → Email

### Health Checks
```bash
curl http://localhost:8083/health
# Returns:
# {
#   "status": "ok",
#   "database": "connected",
#   "cache": "connected",
#   "ai": "ready",
#   "version": "2.1.0"
# }
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm test -- --coverage
```

## 🤖 AI Forecasting Features (v2.1)

### Supported Models

**1. Prophet (Facebook)**
- Best for: Seasonal patterns, holidays, multiple seasonality
- Training time: ~10-30 seconds per item
- Accuracy: MAPE typically 10-15% for well-behaved data
- Use case: Items with clear weekly/monthly patterns

**2. ARIMA (Auto-Regressive Integrated Moving Average)**
- Best for: Stable trends, non-seasonal data
- Training time: ~5-15 seconds per item
- Accuracy: MAPE typically 12-18%
- Use case: Items with gradual growth/decline

### Consumption Derivation

The system derives daily consumption from:
1. **Inventory counts** (physical counts)
2. **Received orders** (restocking events)
3. **Sales/usage** (outgoing transactions)

**Formula:**
```
Consumption = (Starting Inventory + Received) - Ending Inventory
```

### Anomaly Detection

Automatically detects unusual consumption patterns using Z-score analysis:
- **Threshold:** ±3 standard deviations from mean
- **Alerts:** Anomalies logged and available via `/api/ai/anomaly/list`
- **Use cases:** Detect waste, theft, or demand spikes

### Training Recommendations

```bash
# Train models for top 50 items (by volume)
curl -X POST http://localhost:8083/api/ai/forecast/train \
  -H "Content-Type: application/json" \
  -d '{
    "item_code": "ITEM_001",
    "model_type": "prophet",
    "trainingDays": 365,
    "forecastPeriods": 30
  }'

# Check model accuracy
curl http://localhost:8083/api/ai/models/list | jq '.models[] | {item: .entity_id, mape: .accuracy_metrics.mape}'

# Retrain if MAPE > 20%
```

## 🐳 Docker Deployment

### Standalone Application

```bash
# Build image
docker build -t inventory-enterprise:v2.1 .

# Run container
docker run -d \
  -p 8083:8083 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/backups:/app/backups \
  --env-file .env \
  --name inventory-enterprise \
  inventory-enterprise:v2.1
```

### Full Stack (with Redis + PostgreSQL + Monitoring)

```bash
# Use docker-compose for complete stack
docker-compose up -d

# Services:
# - inventory-app (port 8083)
# - redis (port 6379, internal)
# - postgres (port 5432, internal)
# - prometheus (port 9090)
# - grafana (port 3000)
# - alertmanager (port 9093)
```

## 📝 Environment Variables

See `.env.example` for full list. Critical variables:

### Security
- `JWT_SECRET` - JWT signing key (64+ chars, generate with `openssl rand -hex 32`)
- `JWT_REFRESH_SECRET` - Refresh token secret (separate from JWT_SECRET)
- `ENCRYPTION_KEY` - AES-256 key (32 bytes = 64 hex chars)
- `SESSION_SECRET` - Session secret (64+ chars)
- `ADMIN_EMAIL` - Default admin email
- `ADMIN_PASSWORD` - Default admin password (change immediately!)
- `ALLOWED_ORIGINS` - CORS allowed origins (comma-separated)

### Database
- `DB_PATH` - SQLite database path (default: `data/enterprise_inventory.db`)
- `PG_HOST` - PostgreSQL host (optional, for dual-write or migration)
- `PG_PORT` - PostgreSQL port (default: 5432)
- `PG_DATABASE` - PostgreSQL database name
- `PG_USER` - PostgreSQL username
- `PG_PASSWORD` - PostgreSQL password
- `PG_SSL` - Enable PostgreSQL SSL (true/false)
- `PG_CA_CERT` - Path to CA certificate for PostgreSQL SSL
- `PG_CLIENT_CERT` - Path to client certificate
- `PG_CLIENT_KEY` - Path to client key

### Cache (Redis)
- `REDIS_HOST` - Redis host (default: localhost)
- `REDIS_PORT` - Redis port (default: 6379)
- `REDIS_PASSWORD` - Redis password (generate with `openssl rand -base64 32`)
- `REDIS_TLS` - Enable Redis TLS (true/false)
- `REDIS_TTL_INVENTORY` - Cache TTL for inventory data (seconds, default: 300)
- `REDIS_TTL_FORECASTS` - Cache TTL for forecasts (seconds, default: 86400)

### AI/ML
- `AI_MODELS_DIR` - Directory for trained models (default: `data/ai/models`)
- `AI_TRAINING_ENABLED` - Enable AI training endpoints (true/false)
- `AI_DEFAULT_MODEL_TYPE` - Default model type (prophet or arima)

### Monitoring
- `PROMETHEUS_ENABLED` - Enable Prometheus metrics (true/false, default: true)
- `METRICS_PORT` - Port for metrics endpoint (default: same as API port)

### Backup
- `BACKUP_ENABLED` - Enable automated backups (true/false)
- `BACKUP_SCHEDULE` - Cron schedule (default: `0 2 * * *` = 2 AM daily)
- `BACKUP_RETENTION_DAYS` - Days to keep backups (default: 30)
- `BACKUP_ENCRYPTION_KEY` - Backup encryption key (generate with `openssl rand -hex 32`)

## 🔒 Compliance

### ISO-27001 / SOC2 Controls
- ✅ Access logs (audit trail)
- ✅ Encryption at rest (AES-256-GCM)
- ✅ Encryption in transit (HTTPS required)
- ✅ Strong password policies
- ✅ Rate limiting / DDoS protection
- ✅ Input validation / XSS prevention
- ✅ Audit trail (transaction log)
- ✅ Backup & recovery procedures
- ✅ Log rotation & retention

## 🚧 Roadmap

### Phase 1 (Complete) - v2.0
- ✅ Enterprise security hardening
- ✅ Compliance-ready architecture (ISO-27001/SOC2)
- ✅ Bilingual support (EN/FR)
- ✅ Automated backups with encryption
- ✅ Transaction logging and audit trail
- ✅ JWT authentication with refresh tokens
- ✅ 2FA support (TOTP)

### Phase 2 (Complete) - v2.1 ✨ **Current Release**
- ✅ AI forecasting (Prophet/ARIMA models)
- ✅ Real-time anomaly detection (Z-score analysis)
- ✅ PostgreSQL dual-write support (migration ready)
- ✅ Redis caching layer (85%+ hit rate)
- ✅ Prometheus metrics exporter (40+ metrics)
- ✅ Grafana dashboards (3 dashboards)
- ✅ Alert rules (Prometheus AlertManager)
- ✅ Comprehensive documentation (Operations, Security, Grafana)
- ✅ CI/CD pipelines (GitHub Actions)
- ✅ Performance optimizations (compression, batching)

### Phase 3 (Planned) - v2.2
- [ ] WebSocket real-time updates
- [ ] Request tracing (async-local-storage)
- [ ] Advanced AI recommendations (demand forecasting with external factors)
- [ ] Multi-tenancy support
- [ ] API rate limiting per tenant

### Phase 4 (Future) - v3.0
- [ ] Kubernetes deployment with Helm charts
- [ ] Microservices architecture (API Gateway + services)
- [ ] GraphQL API
- [ ] Mobile apps (React Native - iOS/Android)
- [ ] Advanced analytics (ML-powered insights)
- [ ] Blockchain supply chain tracking

## 📞 Support

### Documentation
- **Operations Guide:** `docs/OPERATIONS_GUIDE.md` - Daily maintenance, backups, troubleshooting
- **Security Audit:** `docs/SECURITY_AUDIT_v2.1.md` - Security controls and compliance
- **Grafana Setup:** `docs/GRAFANA_GUIDE.md` - Monitoring and dashboard setup
- **Changelog:** `CHANGELOG.md` - Version history and release notes
- **Security Checklist:** `SECURITY_CHECKLIST.md` - Pre-deployment security validation

### Contact
- **Issues:** File on GitHub repository
- **Security:** security@your-company.com (for security vulnerabilities)
- **Support:** support@your-company.com
- **Documentation:** https://docs.your-company.com/inventory-enterprise

## 📄 License

Proprietary - All Rights Reserved

---

**Built with ❤️ for enterprise operations**
