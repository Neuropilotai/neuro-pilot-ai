# 🚀 Deployment Checklist
## Inventory Enterprise v2.1 - Production Deployment

**Version:** 2.1.0
**Date:** January 2025
**Target Environment:** Production

---

## Table of Contents

1. [Pre-Deployment Preparation](#1-pre-deployment-preparation)
2. [Security Checklist](#2-security-checklist)
3. [Infrastructure Setup](#3-infrastructure-setup)
4. [Application Deployment](#4-application-deployment)
5. [Post-Deployment Verification](#5-post-deployment-verification)
6. [Rollback Plan](#6-rollback-plan)
7. [Sign-Off](#7-sign-off)

---

## 1. Pre-Deployment Preparation

### 1.1 Code Readiness

- [ ] **Code Review**: All code changes reviewed and approved
- [ ] **Branch Status**: Deploying from `main` branch (or designated release branch)
- [ ] **Version Tag**: Git tag `v2.1.0` created and pushed
- [ ] **Changelog**: CHANGELOG.md updated with v2.1.0 release notes
- [ ] **Documentation**: All documentation updated (README, guides, API docs)

### 1.2 Testing

- [ ] **Unit Tests**: All unit tests passing (`npm test`)
  ```bash
  npm test
  # Expected: All tests pass, coverage ≥85%
  ```

- [ ] **Integration Tests**: Integration tests passing
  ```bash
  npm run test:integration
  # Expected: All integration tests pass
  ```

- [ ] **Linting**: Code passes linting checks
  ```bash
  npm run lint
  # Expected: No errors or warnings
  ```

- [ ] **Security Scan**: No high/critical vulnerabilities
  ```bash
  npm audit
  # Expected: 0 high/critical vulnerabilities
  ```

- [ ] **Load Testing**: Performance benchmarks met
  - API p95 latency < 100ms ✅
  - Cache hit rate > 85% ✅
  - AI model MAPE < 15% ✅
  - Concurrent users: 100+ supported ✅

### 1.3 Backup & Contingency

- [ ] **Database Backup**: Recent backup verified and tested
  ```bash
  # Verify last backup
  ls -lh backups/ | head -5

  # Test backup integrity
  sqlite3 backups/latest/database.db "PRAGMA integrity_check;"
  # Expected: ok
  ```

- [ ] **Rollback Plan**: Documented and reviewed (see Section 6)
- [ ] **Emergency Contacts**: On-call roster updated and distributed
- [ ] **Maintenance Window**: Communicated to users (if downtime expected)

### 1.4 Dependencies

- [ ] **Node.js Version**: v18+ installed on target servers
  ```bash
  node --version
  # Expected: v18.x.x or higher
  ```

- [ ] **npm Version**: v9+ installed
  ```bash
  npm --version
  # Expected: v9.x.x or higher
  ```

- [ ] **Docker**: v20.10+ installed (for Redis, PostgreSQL, monitoring)
  ```bash
  docker --version
  # Expected: Docker version 20.10.x or higher
  ```

- [ ] **Disk Space**: Sufficient space for logs, backups, and data
  ```bash
  df -h
  # Required: 50GB+ free space on /data partition
  ```

---

## 2. Security Checklist

### 2.1 Secrets & Credentials

- [ ] **JWT Secrets**: New strong secrets generated (32+ bytes)
  ```bash
  openssl rand -hex 32  # For JWT_SECRET
  openssl rand -hex 32  # For JWT_REFRESH_SECRET
  ```

- [ ] **Encryption Keys**: AES-256 encryption key generated
  ```bash
  openssl rand -hex 32  # For ENCRYPTION_KEY
  openssl rand -hex 32  # For BACKUP_ENCRYPTION_KEY
  ```

- [ ] **Redis Password**: Strong password set (32+ bytes)
  ```bash
  openssl rand -base64 32  # For REDIS_PASSWORD
  ```

- [ ] **PostgreSQL Password**: Strong password set (if using PostgreSQL)
  ```bash
  openssl rand -base64 32  # For PG_PASSWORD
  ```

- [ ] **.env File**: Created with all required variables (use .env.example as template)
- [ ] **.env Permissions**: Set to 0600 (owner read/write only)
  ```bash
  chmod 600 .env
  ls -l .env
  # Expected: -rw------- 1 user user ...
  ```

- [ ] **.gitignore**: Verified .env is not committed to git
  ```bash
  git status
  # Expected: .env should NOT appear
  ```

### 2.2 TLS/SSL Configuration

- [ ] **HTTPS Certificate**: Valid SSL certificate installed
  ```bash
  # Check certificate expiry
  echo | openssl s_client -connect inventory.example.com:443 2>/dev/null | openssl x509 -noout -dates
  # Expected: notAfter > 30 days from now
  ```

- [ ] **HSTS Header**: Strict-Transport-Security enabled
- [ ] **PostgreSQL SSL**: Client certificates generated (if using PostgreSQL)
  ```bash
  ls -l certs/
  # Expected: ca.crt, server.crt, server.key, client.crt, client.key
  ```

### 2.3 Network Security

- [ ] **Firewall Rules**: Configured to allow only necessary ports
  ```bash
  # Production ports:
  # - 8083: Application (behind reverse proxy)
  # - 443: HTTPS (reverse proxy)
  # - 6379: Redis (internal only, NOT exposed)
  # - 5432: PostgreSQL (internal only, NOT exposed)
  # - 9090: Prometheus (internal only, or VPN-only)
  # - 3000: Grafana (internal only, or VPN-only)

  sudo iptables -L -n
  ```

- [ ] **CORS Origins**: Production domains whitelisted in .env
  ```bash
  # ALLOWED_ORIGINS should contain only production domains
  grep ALLOWED_ORIGINS .env
  # Expected: ALLOWED_ORIGINS=https://inventory.example.com,https://app.example.com
  ```

- [ ] **Rate Limiting**: Configured for production load
- [ ] **Reverse Proxy**: Nginx/Apache configured with proper headers

### 2.4 Authentication & Authorization

- [ ] **Default Admin**: Default admin password changed
- [ ] **2FA Enforcement**: Enabled for admin and manager roles
- [ ] **User Roles**: Proper RBAC roles configured
- [ ] **Session Timeout**: Configured appropriately (default: 8 hours)

---

## 3. Infrastructure Setup

### 3.1 Redis Cache

- [ ] **Redis Installed**: Redis 7+ running
  ```bash
  docker run -d \
    --name redis \
    --restart unless-stopped \
    -v redis-data:/data \
    redis:7-alpine \
    redis-server \
      --requirepass "${REDIS_PASSWORD}" \
      --appendonly yes \
      --maxmemory 2gb \
      --maxmemory-policy allkeys-lru
  ```

- [ ] **Redis Authentication**: Password set and tested
  ```bash
  redis-cli -a "${REDIS_PASSWORD}" ping
  # Expected: PONG
  ```

- [ ] **Redis Persistence**: AOF or RDB enabled
- [ ] **Redis Memory Limit**: Set to 2GB (or based on available memory)

### 3.2 PostgreSQL (Optional)

- [ ] **PostgreSQL Installed**: PostgreSQL 15+ running (if using dual-write or migration)
  ```bash
  docker run -d \
    --name postgres \
    --restart unless-stopped \
    -e POSTGRES_PASSWORD="${PG_PASSWORD}" \
    -e POSTGRES_DB=inventory_enterprise \
    -e POSTGRES_USER=inventory_app \
    -v postgres-data:/var/lib/postgresql/data \
    postgres:15-alpine
  ```

- [ ] **PostgreSQL SSL**: SSL certificates configured
- [ ] **Database Created**: `inventory_enterprise` database exists
  ```bash
  psql -h localhost -U inventory_app -d inventory_enterprise -c "\l"
  ```

- [ ] **Schema Migrated**: Database schema created
  ```bash
  npm run migrate:postgres
  ```

### 3.3 Monitoring Stack

- [ ] **Prometheus Installed**: Prometheus 2.45+ running
  ```bash
  # Verify prometheus.yml is configured
  promtool check config prometheus.yml
  # Expected: SUCCESS

  # Start Prometheus
  docker run -d \
    --name prometheus \
    --restart unless-stopped \
    -p 9090:9090 \
    -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml \
    -v $(pwd)/grafana/alerts.yml:/etc/prometheus/alerts.yml \
    -v prometheus-data:/prometheus \
    prom/prometheus:v2.45.0 \
      --config.file=/etc/prometheus/prometheus.yml \
      --storage.tsdb.retention.time=30d
  ```

- [ ] **Grafana Installed**: Grafana 10+ running
  ```bash
  docker run -d \
    --name grafana \
    --restart unless-stopped \
    -p 3000:3000 \
    -e GF_SECURITY_ADMIN_PASSWORD="${GRAFANA_ADMIN_PASSWORD}" \
    -v grafana-data:/var/lib/grafana \
    -v $(pwd)/grafana/dashboards:/etc/grafana/provisioning/dashboards \
    -v $(pwd)/grafana/datasources:/etc/grafana/provisioning/datasources \
    grafana/grafana:10.0.0
  ```

- [ ] **AlertManager Installed**: AlertManager 0.26+ running
  ```bash
  docker run -d \
    --name alertmanager \
    --restart unless-stopped \
    -p 9093:9093 \
    -v $(pwd)/alertmanager.yml:/etc/alertmanager/alertmanager.yml \
    prom/alertmanager:v0.26.0
  ```

- [ ] **Dashboards Imported**: 3 Grafana dashboards imported and visible
- [ ] **Alert Rules Loaded**: Prometheus alert rules loaded and active
  ```bash
  curl http://localhost:9090/api/v1/rules | jq '.data.groups[] | .name'
  # Expected: api_performance, cache_performance, database_performance, ai_models, business_metrics, security, system_health
  ```

---

## 4. Application Deployment

### 4.1 Pre-Deployment

- [ ] **Environment**: .env file in place with all required variables
- [ ] **Dependencies**: npm install completed successfully
  ```bash
  npm ci --production
  # Expected: All dependencies installed without errors
  ```

- [ ] **Migrations**: Database migrations run successfully
  ```bash
  npm run migrate
  # Expected: All migrations applied
  ```

- [ ] **Directory Permissions**: data/, logs/, backups/ directories writable
  ```bash
  chmod 755 data logs backups
  ```

### 4.2 Deployment Methods

Choose one deployment method:

#### Option A: Direct Deployment (Node.js)

- [ ] **PM2 Installed**: PM2 process manager installed (recommended)
  ```bash
  npm install -g pm2
  ```

- [ ] **Start Application**: Application started via PM2
  ```bash
  NODE_ENV=production pm2 start server.js --name inventory-enterprise
  pm2 save
  pm2 startup
  ```

- [ ] **Process Status**: Application running and healthy
  ```bash
  pm2 status
  # Expected: inventory-enterprise | online
  ```

#### Option B: Docker Deployment

- [ ] **Docker Image Built**: Application image built successfully
  ```bash
  docker build -t inventory-enterprise:v2.1.0 .
  ```

- [ ] **Docker Container Started**: Application container running
  ```bash
  docker run -d \
    --name inventory-enterprise \
    --restart unless-stopped \
    -p 8083:8083 \
    -v $(pwd)/data:/app/data \
    -v $(pwd)/logs:/app/logs \
    -v $(pwd)/backups:/app/backups \
    --env-file .env \
    inventory-enterprise:v2.1.0
  ```

- [ ] **Container Health**: Container running and healthy
  ```bash
  docker ps | grep inventory-enterprise
  # Expected: Up X minutes (healthy)
  ```

#### Option C: Docker Compose Deployment

- [ ] **Docker Compose File**: docker-compose.yml configured
- [ ] **Stack Deployed**: Full stack deployed
  ```bash
  docker-compose up -d
  ```

- [ ] **All Services Running**: All containers healthy
  ```bash
  docker-compose ps
  # Expected: All services Up (healthy)
  ```

### 4.3 Post-Start Verification

- [ ] **Application Logs**: No errors in startup logs
  ```bash
  # PM2
  pm2 logs inventory-enterprise --lines 100

  # Docker
  docker logs inventory-enterprise --tail 100

  # Expected: No ERROR lines, "Server started on port 8083" visible
  ```

- [ ] **Health Check**: Health endpoint returns OK
  ```bash
  curl http://localhost:8083/health
  # Expected: {"status":"ok","database":"connected","cache":"connected","ai":"ready"}
  ```

- [ ] **Metrics Endpoint**: Metrics being exported
  ```bash
  curl http://localhost:8083/metrics | head -20
  # Expected: Prometheus metrics visible
  ```

---

## 5. Post-Deployment Verification

### 5.1 Functional Testing

- [ ] **API Endpoints**: Key API endpoints responding
  ```bash
  # Health check
  curl http://localhost:8083/health

  # Metrics
  curl http://localhost:8083/metrics | grep http_requests_total

  # Status
  curl http://localhost:8083/status
  ```

- [ ] **Authentication**: Login flow working
  ```bash
  # Register test user (if needed)
  curl -X POST http://localhost:8083/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"Test1234!","name":"Test User"}'

  # Login
  curl -X POST http://localhost:8083/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"Test1234!"}'
  # Expected: { "token": "...", "user": {...} }
  ```

- [ ] **Inventory CRUD**: Basic inventory operations working
  ```bash
  # Get inventory (requires JWT token)
  curl -X GET http://localhost:8083/api/inventory \
    -H "Authorization: Bearer YOUR_JWT_TOKEN"
  # Expected: List of inventory items
  ```

- [ ] **Cache Functionality**: Redis cache operational
  ```bash
  # Check cache stats
  curl http://localhost:8083/api/cache/stats
  # Expected: { "hits": ..., "misses": ..., "hitRate": ... }
  ```

- [ ] **AI Forecasting**: AI endpoints responding (if enabled)
  ```bash
  # List AI models
  curl http://localhost:8083/api/ai/models/list \
    -H "Authorization: Bearer YOUR_JWT_TOKEN"
  # Expected: { "models": [] } or list of models
  ```

### 5.2 Performance Verification

- [ ] **Response Time**: API latency within targets
  ```bash
  # Test API latency (10 requests)
  for i in {1..10}; do
    curl -w "Time: %{time_total}s\n" -o /dev/null -s http://localhost:8083/health
  done
  # Expected: All responses < 0.1s (100ms)
  ```

- [ ] **Cache Hit Rate**: Cache hit rate > 60% (after warm-up)
  ```bash
  # Make some cached requests to warm up
  for i in {1..20}; do
    curl -s http://localhost:8083/api/inventory > /dev/null
  done

  # Check hit rate
  curl -s http://localhost:8083/api/cache/stats | jq '.hitRate'
  # Expected: > 0.60 (60%)
  ```

- [ ] **Database Performance**: Database queries fast
  ```bash
  # Check DB latency from metrics
  curl -s http://localhost:8083/metrics | grep db_latency_seconds
  # Expected: < 0.5 (500ms)
  ```

### 5.3 Monitoring Verification

- [ ] **Prometheus Scraping**: Prometheus scraping metrics
  ```bash
  curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.job == "inventory-enterprise") | .health'
  # Expected: "up"
  ```

- [ ] **Grafana Dashboards**: Dashboards displaying data
  - Open http://localhost:3000 (or production Grafana URL)
  - Login with admin credentials
  - Navigate to "Inventory Enterprise - Overview"
  - Expected: All panels showing data (not "No data")

- [ ] **Alert Rules**: Alert rules loaded and evaluating
  ```bash
  curl http://localhost:9090/api/v1/rules | jq '.data.groups[].rules[] | select(.type == "alerting") | .name'
  # Expected: List of alert names (HighAPILatency, LowCacheHitRate, etc.)
  ```

- [ ] **AlertManager**: AlertManager receiving alerts (if any firing)
  ```bash
  curl http://localhost:9093/api/v2/alerts
  # Expected: [] (empty if no alerts firing)
  ```

### 5.4 Security Verification

- [ ] **HTTPS Enforced**: HTTP redirects to HTTPS
  ```bash
  curl -I http://inventory.example.com
  # Expected: 301 Moved Permanently, Location: https://...
  ```

- [ ] **Security Headers**: Security headers present
  ```bash
  curl -I https://inventory.example.com
  # Expected headers:
  # - Strict-Transport-Security: max-age=31536000
  # - X-Frame-Options: DENY
  # - X-Content-Type-Options: nosniff
  # - X-XSS-Protection: 1; mode=block
  ```

- [ ] **Redis Not Exposed**: Redis port not accessible externally
  ```bash
  # From external machine (should fail)
  nc -zv inventory.example.com 6379
  # Expected: Connection refused
  ```

- [ ] **PostgreSQL Not Exposed**: PostgreSQL port not accessible externally
  ```bash
  # From external machine (should fail)
  nc -zv inventory.example.com 5432
  # Expected: Connection refused
  ```

- [ ] **Rate Limiting Active**: Rate limiting working
  ```bash
  # Make 25 requests quickly (exceeds 20/15min auth limit)
  for i in {1..25}; do
    curl -X POST http://localhost:8083/api/auth/login \
      -H "Content-Type: application/json" \
      -d '{"email":"test@example.com","password":"wrong"}' &
  done
  # Expected: Some requests return 429 Too Many Requests
  ```

### 5.5 Backup Verification

- [ ] **Backup Job Scheduled**: Automated backup cron job running
  ```bash
  # PM2
  pm2 list | grep backup

  # Or check crontab
  crontab -l | grep backup
  # Expected: 0 2 * * * cd /path/to/app && npm run backup
  ```

- [ ] **Backup Test**: Manual backup successful
  ```bash
  npm run backup
  # Expected: Backup created in backups/ directory

  ls -lh backups/ | head -5
  # Expected: Recent backup file visible
  ```

- [ ] **Backup Encryption**: Backup is encrypted
  ```bash
  # Verify backup is not plain SQLite
  file backups/latest_backup.tar.gz
  # Expected: gzip compressed data (not SQLite database)
  ```

---

## 6. Rollback Plan

### 6.1 Rollback Triggers

Initiate rollback if any of the following occur within 2 hours of deployment:

- [ ] **Critical errors** in application logs (500 errors > 5%)
- [ ] **Health check fails** for > 5 minutes
- [ ] **Database corruption** detected
- [ ] **Performance degradation** (p95 latency > 500ms)
- [ ] **Security incident** detected
- [ ] **Data loss** detected

### 6.2 Rollback Procedure

If rollback is needed, execute these steps immediately:

#### Step 1: Stop v2.1.0 Application

```bash
# PM2
pm2 stop inventory-enterprise
pm2 delete inventory-enterprise

# Docker
docker stop inventory-enterprise
docker rm inventory-enterprise

# Docker Compose
docker-compose down
```

#### Step 2: Restore v2.0.0 Code

```bash
# Checkout v2.0.0 tag
git fetch --all --tags
git checkout tags/v2.0.0

# Install v2.0.0 dependencies
npm ci --production
```

#### Step 3: Restore Database Backup

```bash
# Stop application first (if not already stopped)

# Restore from backup
cp data/enterprise_inventory.db data/enterprise_inventory.db.v2.1.rollback
cp backups/pre_v2.1_upgrade/database.db data/enterprise_inventory.db

# Verify integrity
sqlite3 data/enterprise_inventory.db "PRAGMA integrity_check;"
# Expected: ok
```

#### Step 4: Remove v2.1.0 Configuration

```bash
# Edit .env, remove v2.1.0-specific variables:
# - REDIS_* (all Redis variables)
# - PG_* (all PostgreSQL variables, if not used in v2.0.0)
# - AI_* (all AI-related variables)

# Stop Redis/PostgreSQL if not needed
docker stop redis postgres
```

#### Step 5: Start v2.0.0 Application

```bash
# PM2
NODE_ENV=production pm2 start server.js --name inventory-enterprise
pm2 save

# Docker
docker run -d \
  --name inventory-enterprise \
  -p 8083:8083 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/backups:/app/backups \
  --env-file .env \
  inventory-enterprise:v2.0.0
```

#### Step 6: Verify v2.0.0 Health

```bash
# Check health
curl http://localhost:8083/health
# Expected: {"status":"ok","app":"inventory-enterprise-secure"}

# Check logs
pm2 logs inventory-enterprise --lines 50
# Or
docker logs inventory-enterprise --tail 50

# Expected: No errors, application running normally
```

#### Step 7: Notify Stakeholders

- Send notification to team and users about rollback
- Schedule post-mortem meeting to analyze failure
- Document rollback in incident log

### 6.3 Rollback Time Estimate

- **Total rollback time:** 15-30 minutes
- **RTO (Recovery Time Objective):** < 1 hour
- **Data loss:** None (if backup recent and database not corrupted)

---

## 7. Sign-Off

### 7.1 Deployment Completion

**Deployment Date:** ___________________
**Deployment Time:** ___________________
**Deployed By:** ___________________

**Verification Results:**

- [ ] All checklist items completed
- [ ] All tests passing
- [ ] Monitoring operational
- [ ] No critical errors in logs
- [ ] Performance within targets

### 7.2 Approval Sign-Off

**Technical Lead:**

Name: ___________________
Signature: ___________________
Date: ___________________

**DevOps Lead:**

Name: ___________________
Signature: ___________________
Date: ___________________

**Product Owner (if applicable):**

Name: ___________________
Signature: ___________________
Date: ___________________

### 7.3 Post-Deployment Notes

Document any issues, workarounds, or deviations from this checklist:

```
______________________________________________________________________

______________________________________________________________________

______________________________________________________________________

______________________________________________________________________
```

---

## Appendix A: Quick Reference Commands

### Application Management

```bash
# Start application
npm start  # Direct
pm2 start server.js --name inventory-enterprise  # PM2
docker-compose up -d  # Docker Compose

# Stop application
npm stop
pm2 stop inventory-enterprise
docker-compose down

# Restart application
pm2 restart inventory-enterprise
docker-compose restart inventory-enterprise

# View logs
pm2 logs inventory-enterprise
docker logs inventory-enterprise -f
tail -f logs/application-$(date +%Y-%m-%d).log
```

### Health Checks

```bash
# Application health
curl http://localhost:8083/health

# Redis health
redis-cli -a "${REDIS_PASSWORD}" ping

# PostgreSQL health
psql -h localhost -U inventory_app -d inventory_enterprise -c "SELECT 1;"

# Prometheus health
curl http://localhost:9090/-/healthy

# Grafana health
curl http://localhost:3000/api/health
```

### Monitoring

```bash
# Check metrics
curl http://localhost:8083/metrics | grep http_requests_total

# Check cache stats
curl http://localhost:8083/api/cache/stats

# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Check active alerts
curl http://localhost:9090/api/v1/alerts
```

---

## Appendix B: Troubleshooting

### Application Won't Start

```bash
# Check environment variables
cat .env | grep -v PASSWORD

# Check port availability
netstat -tulpn | grep 8083

# Check logs for errors
tail -100 logs/application-$(date +%Y-%m-%d).log

# Check disk space
df -h

# Check database integrity
sqlite3 data/enterprise_inventory.db "PRAGMA integrity_check;"
```

### High Memory Usage

```bash
# Check memory usage
free -h
ps aux | grep node | head -5

# Check Redis memory
redis-cli -a "${REDIS_PASSWORD}" info memory

# Restart application if needed
pm2 restart inventory-enterprise
```

### Database Locked (SQLite)

```bash
# Check for locks
fuser data/enterprise_inventory.db

# Kill blocking processes (if safe)
fuser -k data/enterprise_inventory.db

# Enable WAL mode (if not already)
sqlite3 data/enterprise_inventory.db "PRAGMA journal_mode=WAL;"
```

---

**Document Version:** 2.1.0
**Last Updated:** January 2025
**Maintained By:** DevOps Team

**End of Deployment Checklist**
