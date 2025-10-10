# Multi-Tenancy Deployment Guide
## Version: v2.4.1-2025-10-07

**Inventory Enterprise System - Production Deployment**

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Migration & Setup](#migration--setup)
3. [Tenant Provisioning](#tenant-provisioning)
4. [RBAC Configuration](#rbac-configuration)
5. [Webhook Setup](#webhook-setup)
6. [SSO Integration](#sso-integration-optional)
7. [Security Audit Checklist](#security-audit-checklist)
8. [Monitoring & Observability](#monitoring--observability)
9. [Troubleshooting](#troubleshooting)
10. [Rollback Procedures](#rollback-procedures)

---

## Prerequisites

### System Requirements
- **Node.js:** ≥18.0.0
- **NPM:** ≥9.0.0
- **Database:** SQLite 3.x or PostgreSQL 12+
- **Redis:** ≥6.0 (for caching and webhooks)
- **Memory:** 2GB minimum, 4GB recommended
- **Disk:** 10GB minimum

### Dependencies
```bash
npm install
# Installs: axios, bcryptjs, chokidar, cors, dotenv, express, etc.
```

### Environment Configuration
Create `.env` file:

```bash
# Server
NODE_ENV=production
PORT=3001

# Database
DATABASE_TYPE=sqlite  # or postgres
DATABASE_PATH=data/enterprise_inventory.db  # for SQLite
# DATABASE_URL=postgres://user:pass@host:5432/dbname  # for Postgres

# Security
JWT_SECRET=<generate-strong-secret-min-32-chars>
JWT_EXPIRY=24h
ALLOW_DEFAULT_TENANT=true  # Set false after multi-tenant setup

# Multi-Tenancy
TENANT_ISOLATION_STRICT=true
TENANT_SUBDOMAIN_ENABLED=false  # Enable for subdomain routing

# RBAC
RBAC_AUDIT_LOGGING=true
RBAC_METRICS_ENABLED=true

# Webhooks
WEBHOOK_DISPATCHER_ENABLED=true
WEBHOOK_RETRY_DELAYS=1000,5000,25000  # ms: 1s, 5s, 25s
WEBHOOK_MAX_RETRIES=3
WEBHOOK_TIMEOUT_MS=30000

# Redis (for caching & webhooks)
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<your-redis-password>

# Metrics
PROMETHEUS_METRICS_ENABLED=true
METRICS_PORT=9090

# CORS
CORS_ORIGIN=https://your-domain.com

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

---

## Migration & Setup

### Step 1: Backup Existing Data

```bash
# For SQLite
cp data/enterprise_inventory.db data/enterprise_inventory.db.backup

# For Postgres
pg_dump -U postgres inventory_enterprise > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Step 2: Run Migration

```bash
# For SQLite
sqlite3 data/enterprise_inventory.db < migrations/sqlite/004_multitenancy_2025-10-07.sql

# For Postgres
psql -U postgres -d inventory_enterprise -f migrations/postgres/004_multitenancy_2025-10-07.sql
```

**Expected Output:**
```
Creating multi-tenancy tables...
Adding tenant_id to existing tables...
Backfilling default tenant...
Seeding permissions and roles...
Migration complete: 004_multitenancy_2025-10-07
```

### Step 3: Seed Roles & Permissions

```bash
npm run seed:roles
```

**Expected Output:**
```
[Seed] Starting roles and permissions seeding...
[Seed] Seeding permissions...
[Seed] ✅ Seeded 24 permissions
[Seed] Ensuring default tenant exists...
[Seed] ✅ Default tenant ensured
[Seed] Seeding default roles...
[Seed] ✅ Seeded 4 default roles
[Seed] Assigning permissions to roles...
[Seed] ✅ Permissions assigned to roles
[Seed] ✅ Roles and permissions seeding complete
```

### Step 4: Verify Migration

```bash
# SQLite
sqlite3 data/enterprise_inventory.db "SELECT COUNT(*) FROM tenants;"
sqlite3 data/enterprise_inventory.db "SELECT COUNT(*) FROM roles;"
sqlite3 data/enterprise_inventory.db "SELECT COUNT(*) FROM permissions;"

# Expected: 1 tenant (default), 4 roles, 24 permissions

# Postgres
psql -U postgres -d inventory_enterprise -c "SELECT COUNT(*) FROM tenants;"
psql -U postgres -d inventory_enterprise -c "SELECT COUNT(*) FROM roles;"
psql -U postgres -d inventory_enterprise -c "SELECT COUNT(*) FROM permissions;"
```

---

## Tenant Provisioning

### Creating a New Tenant

#### Option 1: SQL Direct

```sql
-- SQLite/Postgres
INSERT INTO tenants (name, status, settings)
VALUES ('Acme Corporation', 'active', '{"subdomain": "acme", "features": ["ai", "webhooks"]}')
RETURNING tenant_id;
```

#### Option 2: API Endpoint (Requires Admin Permission)

```bash
curl -X POST https://your-domain.com/api/tenants \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corporation",
    "subdomain": "acme",
    "features": ["ai", "webhooks", "sso"]
  }'
```

### Creating Default Roles for New Tenant

```sql
-- Create roles (Admin, Manager, Analyst, Auditor) for new tenant
INSERT INTO roles (tenant_id, name, description, is_system)
VALUES
  ('<NEW_TENANT_ID>', 'Admin', 'Full system administrator', 1),
  ('<NEW_TENANT_ID>', 'Manager', 'Operational manager', 1),
  ('<NEW_TENANT_ID>', 'Analyst', 'Read-only with reports', 1),
  ('<NEW_TENANT_ID>', 'Auditor', 'Compliance auditor', 1);

-- Assign permissions to roles (use role_id from previous insert)
INSERT INTO role_permissions (role_id, permission_id)
SELECT '<ADMIN_ROLE_ID>', permission_id FROM permissions;  -- Admin gets all permissions
```

### Adding Users to Tenant

```sql
-- 1. Create user (or use existing user_id)
INSERT INTO users (email, password_hash, role, tenant_id)
VALUES ('user@acme.com', '<BCRYPT_HASH>', 'user', '<TENANT_ID>')
RETURNING user_id;

-- 2. Assign user to tenant with role
INSERT INTO tenant_users (tenant_id, user_id, role_id, status)
VALUES ('<TENANT_ID>', '<USER_ID>', '<ROLE_ID>', 'active');
```

### Configuring Tenant Settings

```sql
-- Update tenant settings (JSON)
UPDATE tenants
SET settings = jsonb_set(
  settings,
  '{api_key_hash}',
  '"<SHA256_HASH_OF_API_KEY>"'
)
WHERE tenant_id = '<TENANT_ID>';
```

**Common Settings:**
- `subdomain` - Subdomain for routing (e.g., "acme" → acme.your-domain.com)
- `api_key_hash` - SHA-256 hash of API key for API-based auth
- `features` - Array of enabled features: `["ai", "webhooks", "sso", "reports"]`
- `limits` - Resource limits: `{"max_items": 10000, "max_users": 50}`
- `branding` - Custom branding: `{"logo_url": "...", "primary_color": "#..."}`

---

## RBAC Configuration

### Role Overview

| Role | Permissions | Use Case |
|------|-------------|----------|
| **Admin** | All permissions | System administrators, tenant owners |
| **Manager** | Read/Write inventory, orders, reports | Operations managers |
| **Analyst** | Read-only + report creation | Data analysts, business intelligence |
| **Auditor** | Read-only all resources | Compliance, security audits |

### Creating Custom Roles

```bash
curl -X POST https://your-domain.com/api/roles \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "X-Tenant-Id: YOUR_TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Warehouse Manager",
    "description": "Manages inventory and fulfillment",
    "permissions": [
      "inventory:read",
      "inventory:write",
      "orders:read",
      "orders:write"
    ]
  }'
```

### Assigning Roles to Users

```bash
curl -X POST https://your-domain.com/api/tenants/{TENANT_ID}/users \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "USER_ID",
    "role_id": "ROLE_ID"
  }'
```

### Testing RBAC

```bash
# Test user permissions
curl -X GET https://your-domain.com/api/inventory \
  -H "Authorization: Bearer USER_TOKEN" \
  -H "X-Tenant-Id: TENANT_ID"

# Should return 200 if user has inventory:read permission
# Should return 403 if user lacks permission
```

### Viewing Audit Logs

```sql
-- View recent RBAC denials
SELECT user_id, resource, permission, result, created_at
FROM rbac_audit_log
WHERE result = 'denied'
ORDER BY created_at DESC
LIMIT 50;

-- View permission checks for specific user
SELECT resource, permission, result, COUNT(*) as count
FROM rbac_audit_log
WHERE user_id = '<USER_ID>'
  AND created_at > datetime('now', '-7 days')
GROUP BY resource, permission, result;
```

---

## Webhook Setup

### Creating a Webhook

```bash
curl -X POST https://your-domain.com/api/webhooks \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Tenant-Id: YOUR_TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Inventory Sync Webhook",
    "url": "https://your-external-system.com/webhook",
    "events": [
      "inventory.updated",
      "inventory.created",
      "forecast.updated"
    ],
    "headers": {
      "X-Custom-Header": "value"
    },
    "retry_count": 3,
    "timeout_ms": 30000
  }'
```

**Response:**
```json
{
  "success": true,
  "webhook": {
    "webhook_id": "...",
    "secret": "64_CHAR_HEX_STRING",  // SAVE THIS! Only shown once
    "name": "Inventory Sync Webhook",
    "url": "https://your-external-system.com/webhook",
    "events": ["inventory.updated", "inventory.created", "forecast.updated"],
    "status": "active"
  }
}
```

**⚠️ CRITICAL:** Save the `secret` immediately - it's only returned once on creation.

### Verifying Webhook Signatures

In your webhook endpoint, verify the HMAC signature:

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(secret, payload, signature) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Express endpoint
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = req.body;

  if (!verifyWebhookSignature(process.env.WEBHOOK_SECRET, payload, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Process webhook...
  res.json({ received: true });
});
```

### Testing Webhooks

```bash
# Send test event
curl -X POST https://your-domain.com/api/webhooks/{WEBHOOK_ID}/test \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Tenant-Id: YOUR_TENANT_ID"

# Check delivery log
curl -X GET https://your-domain.com/api/webhooks/{WEBHOOK_ID}/deliveries \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Tenant-Id: YOUR_TENANT_ID"
```

### Monitoring Webhooks

```sql
-- Check webhook health
SELECT
  name,
  status,
  last_success_at,
  last_failure_at,
  failure_count
FROM webhook_endpoints
WHERE tenant_id = '<TENANT_ID>';

-- View recent deliveries
SELECT
  event_type,
  status,
  attempts,
  http_status,
  created_at,
  completed_at
FROM webhook_deliveries
WHERE webhook_id = '<WEBHOOK_ID>'
ORDER BY created_at DESC
LIMIT 20;

-- Check DLQ (dead-letter queue)
SELECT COUNT(*) as dlq_count
FROM webhook_deliveries
WHERE webhook_id = '<WEBHOOK_ID>' AND status = 'dlq';
```

---

## SSO Integration (Optional)

**Note:** SSO is optional in v2.4.1 and can be added in v2.5.0+

### Configuration Placeholder

```javascript
// config/sso_2025-10-07.js (not yet implemented)
module.exports = {
  providers: {
    okta: {
      type: 'saml',
      entryPoint: 'https://your-org.okta.com/...',
      issuer: 'https://your-domain.com',
      cert: process.env.OKTA_CERT
    },
    google: {
      type: 'oauth2',
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: 'https://your-domain.com/auth/google/callback'
    }
  }
};
```

---

## Security Audit Checklist

### Pre-Deployment

- [ ] All environment variables set (JWT_SECRET, REDIS_PASSWORD, etc.)
- [ ] JWT secret is strong (min 32 random characters)
- [ ] Database backups configured and tested
- [ ] HTTPS enabled (SSL/TLS certificates valid)
- [ ] CORS origins restricted to your domains only
- [ ] Rate limiting enabled on all endpoints
- [ ] Redis password authentication enabled
- [ ] Database credentials rotated from defaults

### Post-Deployment

- [ ] Test cross-tenant isolation (user from Tenant A cannot see Tenant B data)
- [ ] Verify RBAC denials are logged to `rbac_audit_log`
- [ ] Check webhook HMAC signatures are validated
- [ ] Confirm no SQL injection vulnerabilities (run tests)
- [ ] Verify all queries include `tenant_id` WHERE clause
- [ ] Test suspended user cannot access resources
- [ ] Confirm audit logs are being written
- [ ] Check Prometheus metrics are being exported
- [ ] Verify Redis connection is encrypted (if remote)
- [ ] Test graceful degradation if Redis is down

### Compliance (ISO-27001, SOC2, GDPR)

- [ ] Audit logs retained for required duration (90+ days)
- [ ] Personal data can be deleted (GDPR Right to Erasure)
- [ ] Data encryption at rest enabled (database)
- [ ] Data encryption in transit enabled (HTTPS)
- [ ] Access control documented and enforced
- [ ] Security incident response plan in place
- [ ] Regular security scans scheduled
- [ ] Vulnerability patching process defined

---

## Monitoring & Observability

### Prometheus Metrics

**Key Metrics to Monitor:**

1. **RBAC Denials:** `rbac_denied_total{permission, resource, action}`
   - Alert if > 100/hour (possible attack or misconfiguration)

2. **Webhook Deliveries:** `webhook_deliveries_total{event, status}`
   - Alert if success rate < 90%

3. **Tenant Request Rate:** `tenant_request_rate{tenant_id}`
   - Monitor for abuse or DDoS

4. **Database Latency:** `db_latency_seconds{db_type}`
   - Alert if p95 > 100ms

5. **WebSocket Connections:** `ai_ws_connections_total`
   - Monitor for connection leaks

**Prometheus Queries:**

```promql
# RBAC denial rate (per minute)
rate(rbac_denied_total[1m])

# Webhook success rate
sum(rate(webhook_deliveries_total{status="success"}[5m])) / sum(rate(webhook_deliveries_total[5m]))

# Tenant request distribution
topk(10, sum by (tenant_id) (rate(tenant_request_rate[5m])))

# Database query latency p95
histogram_quantile(0.95, rate(db_query_duration_seconds_bucket[5m]))
```

### Grafana Dashboards

Import these dashboards:
- `grafana/Enterprise-Tenants-2025-10-07.json` - Multi-tenancy metrics
- `grafana/AI-Realtime-Intelligence-2025-10-07.json` - AI metrics

### Health Checks

```bash
# Application health
curl https://your-domain.com/health

# Expected:
{
  "status": "ok",
  "app": "inventory-enterprise-v2.4.1",
  "realtime": {
    "websocket": 5,
    "feedbackStream": true,
    "forecastWorker": true,
    "modelsLoaded": 150
  }
}

# Metrics endpoint
curl https://your-domain.com/metrics
```

---

## Troubleshooting

### Issue: Cross-Tenant Data Leakage

**Symptoms:** User sees data from other tenants

**Diagnosis:**
```sql
-- Check if queries are scoped
SELECT * FROM inventory_items WHERE item_code = 'TEST' AND tenant_id IS NULL;
-- Should return 0 rows
```

**Fix:**
1. Verify all routes use `resolveTenant` middleware
2. Check database queries include `WHERE tenant_id = ?`
3. Review audit logs for access attempts

### Issue: RBAC Permission Denied

**Symptoms:** User gets 403 on endpoints they should access

**Diagnosis:**
```sql
-- Check user's role and permissions
SELECT
  r.name as role,
  p.name as permission
FROM tenant_users tu
JOIN roles r ON tu.role_id = r.role_id
JOIN role_permissions rp ON r.role_id = rp.role_id
JOIN permissions p ON rp.permission_id = p.permission_id
WHERE tu.user_id = '<USER_ID>' AND tu.tenant_id = '<TENANT_ID>';
```

**Fix:**
1. Assign correct role to user
2. Grant missing permissions to role
3. Check user status is 'active'

### Issue: Webhooks Not Delivering

**Symptoms:** Webhook deliveries stuck in 'pending'

**Diagnosis:**
```sql
-- Check pending deliveries
SELECT
  webhook_id,
  event_type,
  status,
  attempts,
  next_retry_at,
  error_message
FROM webhook_deliveries
WHERE status = 'pending'
ORDER BY created_at DESC
LIMIT 10;
```

**Fix:**
1. Verify webhook dispatcher is running: `webhookDispatcher.start()`
2. Check Redis connection (webhooks use Redis for queuing)
3. Verify destination URL is reachable
4. Check webhook is not disabled due to failures

### Issue: Slow Query Performance

**Symptoms:** API responses > 500ms

**Diagnosis:**
```bash
# SQLite
sqlite3 data/enterprise_inventory.db "EXPLAIN QUERY PLAN SELECT * FROM inventory_items WHERE tenant_id = 'xxx';"

# Should show: "SEARCH inventory_items USING INDEX idx_inventory_tenant"
```

**Fix:**
1. Verify indexes exist: `idx_inventory_tenant`, `idx_orders_tenant`, etc.
2. Run `ANALYZE` to update query planner statistics
3. Consider composite indexes for common queries

---

## Rollback Procedures

### If Migration Fails

```bash
# Restore from backup
# SQLite
mv data/enterprise_inventory.db data/enterprise_inventory.db.failed
cp data/enterprise_inventory.db.backup data/enterprise_inventory.db

# Postgres
psql -U postgres -d inventory_enterprise < backup_TIMESTAMP.sql
```

### If Production Issues After Deployment

**Option 1: Disable Multi-Tenancy (Emergency)**
```bash
# Set in .env
ALLOW_DEFAULT_TENANT=true
TENANT_ISOLATION_STRICT=false

# Restart server
pm2 restart inventory-enterprise
```

**Option 2: Rollback Migration**

```sql
-- Run rollback script (at end of migration file)
DROP TABLE IF EXISTS sso_audit_log CASCADE;
DROP TABLE IF EXISTS sso_providers CASCADE;
DROP TABLE IF EXISTS webhook_deliveries CASCADE;
DROP TABLE IF EXISTS webhook_endpoints CASCADE;
DROP TABLE IF EXISTS rbac_audit_log CASCADE;
DROP TABLE IF EXISTS tenant_users CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

ALTER TABLE users DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE inventory_items DROP COLUMN IF EXISTS tenant_id;
-- etc.
```

---

## Support & Maintenance

### Regular Maintenance Tasks

**Daily:**
- Monitor RBAC denial metrics
- Check webhook delivery success rate
- Review error logs for anomalies

**Weekly:**
- Review audit logs for security events
- Check DLQ for failed webhook deliveries
- Verify backup integrity

**Monthly:**
- Rotate secrets and credentials
- Update dependencies (npm audit)
- Review and archive old audit logs
- Performance optimization based on metrics

### Getting Help

- **Documentation:** `/docs` directory
- **Metrics:** Prometheus endpoint `/metrics`
- **Health Check:** `/health` endpoint
- **Logs:** `logs/application.log`, `logs/security.log`

---

## Appendix: Quick Reference

### Environment Variables
See `.env.example` for full list

### API Endpoints
```
POST   /api/tenants              - Create tenant (admin)
GET    /api/tenants              - List tenants (admin)
POST   /api/roles                - Create role
GET    /api/roles                - List roles
POST   /api/webhooks             - Create webhook
GET    /api/webhooks             - List webhooks
POST   /api/webhooks/:id/test    - Test webhook
```

### SQL Queries
See troubleshooting section for common diagnostic queries

---

**End of Deployment Guide**

**Version:** v2.4.1-2025-10-07
**Last Updated:** 2025-10-07
**Status:** Production Ready
