# 📚 Operations Guide / Guide des Opérations
## Inventory Enterprise v2.1 - Daily Operations & Maintenance

**Version:** 2.1.0
**Last Updated:** January 2025
**Audience:** DevOps, System Administrators, Operations Team

---

## Table of Contents / Table des Matières

1. [Daily Operations](#daily-operations)
2. [Backup & Recovery](#backup--recovery)
3. [AI Model Management](#ai-model-management)
4. [Database Maintenance](#database-maintenance)
5. [Log Management](#log-management)
6. [Performance Monitoring](#performance-monitoring)
7. [Troubleshooting](#troubleshooting)
8. [Runbooks](#runbooks)

---

## Daily Operations

### Morning Health Checks (Recommended: 9 AM)

```bash
# 1. Check system health
curl http://localhost:8083/health

# Expected: {"status": "ok", "database": "connected", "cache": "connected"}

# 2. Check Prometheus metrics
curl http://localhost:8083/metrics | grep system_health_status

# Expected: system_health_status{component="database"} 1

# 3. Check Redis cache
redis-cli ping
redis-cli info stats | grep keyspace_hits

# 4. Verify last backup
ls -lh backups/ | head -5

# 5. Check disk space
df -h | grep -E '(Filesystem|/data|/logs|/backups)'
```

### Midday Cache Warming (Recommended: 12 PM)

```bash
# Warm cache for frequently accessed endpoints
curl http://localhost:8083/api/inventory/list
curl http://localhost:8083/api/dashboard/stats
curl http://localhost:8083/api/ai/models/list
```

### End-of-Day Tasks (Recommended: 6 PM)

```bash
# 1. Review error logs
tail -100 logs/application-$(date +%Y-%m-%d).log | grep ERROR

# 2. Check today's cache hit rate
curl http://localhost:8083/api/cache/stats

# Target: >85% hit rate

# 3. Verify backup completion
cat logs/backup-$(date +%Y-%m-%d).log

# 4. Check for anomalies
curl http://localhost:8083/api/ai/anomaly/list?days=1
```

---

## Backup & Recovery

### Automated Backups

**Schedule:** Daily at 2:00 AM (configured via `BACKUP_SCHEDULE`)

**Backup Components:**
- SQLite database (`enterprise_inventory.db`)
- Transaction log (`transaction_log.jsonl`)
- Configuration files (`.env`, `config/`)
- AI models (`ai/models/*.pkl`)

**Retention Policy:**
- Local: 30 days (`BACKUP_RETENTION_DAYS=30`)
- Google Drive: 90 days (if enabled)

### Manual Backup

```bash
# Run immediate backup
npm run backup

# Or via API
curl -X POST http://localhost:8083/api/backup/create \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Backup specific database
npm run backup -- --db-only

# Backup with custom path
BACKUP_LOCAL_PATH=/mnt/external-drive npm run backup
```

### Restore from Backup

```bash
# 1. Stop application
npm stop

# 2. List available backups
ls -lh backups/

# 3. Extract desired backup
cd backups
tar -xzf inventory_backup_2025-01-07T02-00-00.tar.gz

# 4. Restore database
cp inventory_backup_2025-01-07T02-00-00/database.db \
   ../data/enterprise_inventory.db

# 5. Restore transaction log
cp inventory_backup_2025-01-07T02-00-00/transaction_log.jsonl \
   ../data/

# 6. Verify integrity
sqlite3 ../data/enterprise_inventory.db "PRAGMA integrity_check;"
# Expected: ok

# 7. Start application
npm start

# 8. Verify health
curl http://localhost:8083/health
```

### Disaster Recovery Plan

**RTO (Recovery Time Objective):** < 1 hour
**RPO (Recovery Point Objective):** < 24 hours

**Steps:**

1. **Identify failure type**
   - Database corruption → Restore from last backup
   - Server failure → Deploy to backup server
   - Data loss → Restore from Google Drive backup

2. **Execute recovery**
   ```bash
   # Deploy to backup server
   ssh backup-server
   cd /opt/inventory-enterprise
   git pull origin main
   ./restore-from-backup.sh
   npm start
   ```

3. **Verify recovery**
   - Check health endpoint
   - Verify recent transactions in log
   - Test critical operations (login, inventory query, forecast)

4. **Post-incident report**
   - Document incident timeline
   - Identify root cause
   - Update runbooks

---

## AI Model Management

### Daily AI Operations

**Morning:** Review model accuracy

```bash
# Check model MAPE (target: <15%)
curl http://localhost:8083/api/ai/models/list | jq '.models[] | {entity_id, mape: .accuracy_metrics.mape}'

# Flag models with MAPE >20%
curl http://localhost:8083/api/ai/models/list | \
  jq '.models[] | select(.accuracy_metrics.mape > 20)'
```

**Weekly:** Retrain models (Sundays at 3 AM recommended)

```bash
# Automated retraining script
#!/bin/bash
# retrain-ai-models.sh

# Get top 50 items by volume
ITEMS=$(curl -s http://localhost:8083/api/inventory/items?limit=50 | \
  jq -r '.items[].item_code')

# Train Prophet models
for ITEM in $ITEMS; do
  echo "Training model for $ITEM..."
  curl -X POST http://localhost:8083/api/ai/forecast/train \
    -H "Content-Type: application/json" \
    -d "{
      \"item_code\": \"$ITEM\",
      \"model_type\": \"prophet\",
      \"options\": {
        \"trainingDays\": 365,
        \"forecastPeriods\": 30
      }
    }"
  sleep 5  # Rate limit
done
```

**Monthly:** Model Performance Review

1. Export model accuracy metrics
   ```bash
   curl http://localhost:8083/api/ai/models/list > models-$(date +%Y-%m).json
   ```

2. Analyze accuracy trends
   ```bash
   jq '.models[] | {entity_id, mape: .accuracy_metrics.mape, trained_at}' \
     models-$(date +%Y-%m).json
   ```

3. Retrain underperforming models (MAPE >20%)

4. Archive old models
   ```sql
   UPDATE ai_models
   SET status = 'archived'
   WHERE trained_at < date('now', '-90 days')
   AND model_type = 'prophet';
   ```

### Consumption Data Derivation

**Daily:** Derive yesterday's consumption

```bash
# Run at 1 AM after daily transactions complete
curl -X POST http://localhost:8083/api/ai/consumption/derive \
  -H "Content-Type: application/json" \
  -d "{
    \"start_date\": \"$(date -d 'yesterday' +%Y-%m-%d)\",
    \"end_date\": \"$(date +%Y-%m-%d)\"
  }"
```

**Weekly:** Detect anomalies

```bash
curl -X POST http://localhost:8083/api/ai/consumption/detect-anomalies
```

---

## Database Maintenance

### SQLite Maintenance

**Weekly:** Optimize database

```bash
# Vacuum database (reclaim space)
sqlite3 data/enterprise_inventory.db "VACUUM;"

# Analyze query performance
sqlite3 data/enterprise_inventory.db "ANALYZE;"

# Rebuild indexes
sqlite3 data/enterprise_inventory.db <<EOF
REINDEX idx_item_master_code;
REINDEX idx_inventory_counts_date;
REINDEX idx_ai_forecasts_entity;
EOF
```

**Monthly:** Database statistics

```bash
# Check database size
du -h data/enterprise_inventory.db

# Table sizes
sqlite3 data/enterprise_inventory.db <<EOF
SELECT name, SUM("pgsize") as size
FROM "dbstat"
GROUP BY name
ORDER BY size DESC
LIMIT 10;
EOF

# Row counts
sqlite3 data/enterprise_inventory.db <<EOF
SELECT 'inventory_count_items', COUNT(*) FROM inventory_count_items
UNION ALL
SELECT 'processed_invoices', COUNT(*) FROM processed_invoices
UNION ALL
SELECT 'ai_forecasts', COUNT(*) FROM ai_forecasts;
EOF
```

### PostgreSQL Maintenance (if enabled)

**Daily:** Connection pool monitoring

```bash
psql -d inventory_enterprise -c "SELECT * FROM pg_stat_activity;"
```

**Weekly:** Vacuum and analyze

```bash
psql -d inventory_enterprise -c "VACUUM ANALYZE;"
```

**Monthly:** Index maintenance

```bash
# Rebuild indexes
psql -d inventory_enterprise -c "REINDEX DATABASE inventory_enterprise;"

# Check bloat
psql -d inventory_enterprise -c "
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;
"
```

### Dual-Write Monitoring

If dual-write is enabled (SQLite + PostgreSQL):

```bash
# Check for dual-write errors
curl http://localhost:8083/metrics | grep db_dual_write_errors_total

# Verify data parity
npm run verify:data-parity

# Sync missing records
npm run sync:sqlite-to-postgres
```

---

## Log Management

### Log Rotation

**Automatic Rotation:** Handled by `winston-daily-rotate-file`

- **Application logs:** 14 days retention
- **Security logs:** 90 days retention
- **Audit logs:** 365 days retention

### Manual Log Review

**Check for errors:**

```bash
# Today's errors
grep ERROR logs/application-$(date +%Y-%m-%d).log

# Last hour's errors
tail -1000 logs/application-$(date +%Y-%m-%d).log | grep ERROR

# Security events
grep "auth" logs/security-$(date +%Y-%m-%d).log | tail -50
```

**Search logs:**

```bash
# Find specific user activity
grep "user_id: 123" logs/audit-*.log

# Find slow queries
grep "duration.*[5-9][0-9][0-9]ms" logs/application-*.log

# Find failed backups
grep "backup.*failed" logs/application-*.log
```

### Log Archival

**Monthly:** Archive old logs to cold storage

```bash
#!/bin/bash
# archive-logs.sh

# Archive logs older than 90 days
find logs/ -name "*.log" -mtime +90 -exec gzip {} \;

# Move to archive directory
mkdir -p /mnt/archive/logs/$(date +%Y-%m)
mv logs/*.log.gz /mnt/archive/logs/$(date +%Y-%m)/

# Verify archival
ls -lh /mnt/archive/logs/$(date +%Y-%m)/
```

---

## Performance Monitoring

### Cache Performance

**Monitor hit rate:**

```bash
# Real-time cache stats
watch -n 5 'curl -s http://localhost:8083/api/cache/stats'

# Target metrics:
# - Hit rate: >85%
# - Keys: <100,000
# - Memory: <1.8GB
```

**Optimize cache TTLs:**

```bash
# If hit rate <85%, increase TTLs
# Edit .env
REDIS_TTL_INVENTORY=600  # 10 min (was 5 min)
REDIS_TTL_FORECASTS=172800  # 48 hr (was 24 hr)

# Restart app
npm restart
```

### API Performance

**Monitor response times:**

```bash
# p95 latency from Prometheus
curl http://localhost:9090/api/v1/query?query='histogram_quantile(0.95,%20rate(http_request_duration_seconds_bucket[5m]))'

# Target: <100ms
```

**Identify slow endpoints:**

```bash
# Top 10 slowest endpoints
curl http://localhost:9090/api/v1/query?query='topk(10,%20histogram_quantile(0.95,%20rate(http_request_duration_seconds_bucket[5m])))'
```

### Database Performance

**Monitor query times:**

```bash
# p95 DB latency
curl http://localhost:9090/api/v1/query?query='histogram_quantile(0.95,%20rate(db_query_duration_seconds_bucket[5m]))'

# Slow query log (if PostgreSQL)
tail -f /var/log/postgresql/postgresql-15-main.log | grep "duration"
```

---

## Troubleshooting

### Common Issues

#### Issue: High Memory Usage

**Symptoms:**
- Application using >2GB RAM
- Slow response times
- Out of memory errors

**Diagnosis:**
```bash
# Check memory
ps aux | grep node
top -p $(pgrep -f "node server.js")

# Check heap usage
curl http://localhost:8083/metrics | grep nodejs_heap
```

**Resolution:**
```bash
# Restart application
npm restart

# If persistent, increase Node memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm start

# Optimize cache size
redis-cli CONFIG SET maxmemory 1GB
```

#### Issue: Database Lock (SQLite)

**Symptoms:**
- "database is locked" errors
- Slow writes

**Diagnosis:**
```bash
# Check for locks
fuser data/enterprise_inventory.db

# Check active connections
lsof | grep enterprise_inventory.db
```

**Resolution:**
```bash
# Kill blocking processes
fuser -k data/enterprise_inventory.db

# Enable WAL mode (if not already)
sqlite3 data/enterprise_inventory.db "PRAGMA journal_mode=WAL;"

# Consider migrating to PostgreSQL for high concurrency
```

#### Issue: Cache Misses

**Symptoms:**
- Cache hit rate <60%
- Slow API responses

**Diagnosis:**
```bash
curl http://localhost:8083/api/cache/stats
```

**Resolution:**
```bash
# Clear and warm cache
redis-cli FLUSHDB
curl http://localhost:8083/api/inventory/list
curl http://localhost:8083/api/dashboard/stats

# Increase TTLs (see Performance Monitoring section)
```

---

## Runbooks

### Runbook: System Down

**Detection:** Health check fails, no HTTP response

**Steps:**
1. Check if process is running: `ps aux | grep node`
2. If not running: `npm start`
3. Check logs: `tail -50 logs/application-$(date +%Y-%m-%d).log`
4. Verify health: `curl http://localhost:8083/health`
5. If still down, restore from backup (see Backup & Recovery)

**Escalation:** If not resolved in 15 minutes, page on-call engineer

---

### Runbook: High MAPE (Model Accuracy Low)

**Detection:** Alert "HighModelMAPE" fires (MAPE >20%)

**Steps:**
1. Identify affected model
   ```bash
   curl http://localhost:8083/api/ai/models/list | \
     jq '.models[] | select(.accuracy_metrics.mape > 20)'
   ```

2. Check training data quality
   ```bash
   curl "http://localhost:8083/api/ai/consumption/derive?item_code=AFFECTED_ITEM"
   ```

3. Retrain model with more data
   ```bash
   curl -X POST http://localhost:8083/api/ai/forecast/train \
     -d '{"item_code": "AFFECTED_ITEM", "trainingDays": 730}'
   ```

4. If MAPE still high, try ARIMA
   ```bash
   curl -X POST http://localhost:8083/api/ai/forecast/train \
     -d '{"item_code": "AFFECTED_ITEM", "model_type": "arima"}'
   ```

5. Document issue in incident report

---

### Runbook: Backup Failed

**Detection:** Alert "BackupFailed" fires

**Steps:**
1. Check backup logs
   ```bash
   tail -100 logs/application-$(date +%Y-%m-%d).log | grep backup
   ```

2. Check disk space
   ```bash
   df -h /backups
   ```

3. Manual backup
   ```bash
   npm run backup
   ```

4. If disk full, clean old backups
   ```bash
   find backups/ -mtime +30 -delete
   ```

5. Verify backup
   ```bash
   ls -lh backups/ | head -5
   tar -tzf backups/latest_backup.tar.gz
   ```

**Escalation:** If manual backup fails, contact DevOps lead immediately

---

## Maintenance Schedule

### Daily
- [ ] Morning health checks (9 AM)
- [ ] Review error logs (6 PM)
- [ ] Verify backup completion (8 PM)

### Weekly (Sunday)
- [ ] Retrain AI models (3 AM automated)
- [ ] Database optimization (4 AM)
- [ ] Anomaly detection review (10 AM)

### Monthly
- [ ] Performance review (1st of month)
- [ ] Archive old logs (5th of month)
- [ ] Security audit (15th of month)
- [ ] Disaster recovery test (Last Sunday)

### Quarterly
- [ ] PostgreSQL migration evaluation
- [ ] Capacity planning review
- [ ] Update runbooks based on incidents

---

## Support Contacts

**Operations Team:** operations@your-company.com
**On-Call:** +1-XXX-XXX-XXXX
**DevOps Lead:** devops-lead@your-company.com
**Security Team:** security@your-company.com

**Escalation Path:**
1. Operations Team (Response: 30 min)
2. On-Call Engineer (Response: 15 min)
3. DevOps Lead (Response: 1 hour)

---

**Document Version:** 2.1.0
**Last Review:** January 2025
**Next Review:** April 2025
