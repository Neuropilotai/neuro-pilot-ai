# Observability & Monitoring Setup

## 1. Structured Logging

Add to your application:

```javascript
// Structured logging helper
function logAuth(event, data) {
  console.log(JSON.stringify({
    evt: `auth.${event}`,
    ...data,
    at: new Date().toISOString()
  }));
}

// Usage examples:
logAuth("login.success", { userId, deviceId, ip: req.ip });
logAuth("login.failure", { email, reason: "invalid_password", ip: req.ip });
logAuth("refresh.rotate", { userId, deviceId, familyId });
logAuth("refresh.reuse", { userId, deviceId, familyId, ip: req.ip });
logAuth("logout", { userId, deviceId });
```

## 2. Database Schema (Optional Persistence)

```sql
-- Refresh token families for multi-instance scaling
CREATE TABLE refresh_token_families (
  family_id UUID PRIMARY KEY,
  user_id BIGINT NOT NULL,
  device_id UUID NOT NULL,
  revoked_at TIMESTAMPTZ
);

-- Individual refresh tokens
CREATE TABLE refresh_tokens (
  jti UUID PRIMARY KEY,
  family_id UUID REFERENCES refresh_token_families(family_id),
  user_id BIGINT NOT NULL,
  device_id UUID NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('active','rotated','revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON refresh_tokens(family_id);
CREATE INDEX ON refresh_tokens(token_hash);
```

## 3. Alerts Configuration

### Better Stack / Grafana Cloud Loki

```yaml
# Alert rules
- name: "High Login Failures"
  condition: "count by (ip) (rate(auth_login_failure[10m])) > 5"
  action: "notification"

- name: "Refresh Token Reuse"
  condition: "increase(auth_refresh_reuse[1m]) > 0"
  action: "immediate_notification"

- name: "High Error Rate"
  condition: "rate(http_requests_5xx[5m]) / rate(http_requests_total[5m]) > 0.01"
  action: "notification"
```

## 4. Backup & DR

### Volume Backup Script
```bash
#!/bin/bash
# backup-fly-volume.sh

BACKUP_DIR="/tmp/backup-$(date +%Y%m%d-%H%M%S)"
RETENTION_DAYS=7

# Create backup
fly ssh console -C "tar -czf - /data" > "${BACKUP_DIR}.tar.gz"

# Upload to Google Drive (requires rclone setup)
rclone copy "${BACKUP_DIR}.tar.gz" gdrive:backups/neuro-pilot-inventory/

# Cleanup old backups
find /tmp -name "backup-*.tar.gz" -mtime +${RETENTION_DAYS} -delete
rclone delete gdrive:backups/neuro-pilot-inventory/ --min-age ${RETENTION_DAYS}d
```

### Database Backup (if using Postgres)
```bash
# Daily backup
pg_dump $DATABASE_URL | gzip > backup-$(date +%Y%m%d).sql.gz
rclone copy backup-*.sql.gz gdrive:backups/database/
```

## 5. Deployment & Rollback

### Canary Deployment
```bash
# Scale to 2 instances (1 old, 1 new)
fly scale count 2

# Deploy new version
fly deploy

# Monitor health checks and error rates
fly logs -a neuro-pilot-inventory

# Rollback if needed
fly deploy --strategy immediate --image <previous_image>
```

### Health Monitoring
```bash
# Watch deployment
watch -n 5 'curl -s https://inventory.neuropilot.ai/health | jq'

# Monitor logs for errors
fly logs -a neuro-pilot-inventory | grep -E "(ERROR|auth\.refresh\.reuse|5[0-9]{2})"
```

## 6. Security Monitoring Queries

```javascript
// Example log analysis queries for Better Stack

// Login failure rate by IP
source:"neuro-pilot-inventory" evt:"auth.login.failure" 
| stats count() by ip 
| where count > 5

// Refresh token reuse detection
source:"neuro-pilot-inventory" evt:"auth.refresh.reuse"
| stats count() by userId, deviceId

// Geographic anomalies (if you log country)
source:"neuro-pilot-inventory" evt:"auth.login.success"
| stats count() by userId, country
| where count > 1

// Error rate trending
source:"neuro-pilot-inventory" level:"error"
| timechart span=5m count()
```