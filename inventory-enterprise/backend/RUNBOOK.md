# NeuroPilot Inventory Enterprise - Operations Runbook

**Version:** 23.0 (Phase 2)
**Last Updated:** December 2025
**Environment:** Railway + Vercel + Google Drive + Stripe

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Environment Variables](#environment-variables)
3. [Database Backups](#database-backups)
4. [Disaster Recovery](#disaster-recovery)
5. [Security Configuration](#security-configuration)
6. [Monitoring & Diagnostics](#monitoring--diagnostics)
7. [Common Issues](#common-issues)
8. [Phase 2: Multi-Tenant Architecture](#phase-2-multi-tenant-architecture)
9. [Phase 2: Billing & Subscriptions](#phase-2-billing--subscriptions)
10. [Phase 2: SOC-2 Security](#phase-2-soc-2-security)
11. [Phase 2: AI Features](#phase-2-ai-features)

---

## Quick Reference

### Production URLs
| Service | URL |
|---------|-----|
| API | https://api.neuropilot.dev |
| Frontend | https://app.neuropilot.dev |
| Railway Dashboard | https://railway.app/project/ea825a34-dfc4-4c8c-8613-7e9484fa2029 |

### Health Checks
```bash
# API Health
curl https://api.neuropilot.dev/health

# Database Status
curl https://api.neuropilot.dev/diag/db

# Security Configuration
curl https://api.neuropilot.dev/diag/security

# Google Drive Status
curl https://api.neuropilot.dev/diag/google-drive

# Backup Status
curl https://api.neuropilot.dev/diag/backup
```

---

## Environment Variables

### Required (Production)

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | JWT signing key (32+ chars) | `<random-64-char-string>` |
| `JWT_REFRESH_SECRET` | Refresh token key | `<random-64-char-string>` |
| `NODE_ENV` | Environment | `production` |

### Security Hardening

| Variable | Description | Default |
|----------|-------------|---------|
| `CORS_STRICT_MODE` | Lock CORS to canonical domains only | `false` |
| `CSP_STRICT_MODE` | Disable CDN sources in CSP | `false` |
| `GDRIVE_STRICT_MODE` | Require explicit folder ID | `false` |

### Google Drive

| Variable | Description |
|----------|-------------|
| `GDRIVE_ORDERS_ROOT_ID` | Root folder for vendor order PDFs |
| `GDRIVE_ORDERS_INCOMING_ID` | Incoming PDFs subfolder (optional) |
| `GDRIVE_ORDERS_PROCESSED_ID` | Processed PDFs subfolder (optional) |
| `GDRIVE_BACKUP_FOLDER_ID` | Folder for database backups (optional) |

### Backup Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `BACKUP_RETENTION_DAYS` | Days to keep backups | `30` |
| `BACKUP_ENCRYPTION_KEY` | 64-char hex key for AES-256 encryption | (none) |
| `SLACK_WEBHOOK_URL` | Slack notifications on failure | (none) |

---

## Database Backups

### Manual Backup

```bash
# From your local machine with Railway CLI
railway run node scripts/backup-postgres.js

# Dry run (no actual backup)
railway run node scripts/backup-postgres.js --dry-run

# Verbose output
railway run node scripts/backup-postgres.js --verbose
```

### Automated Backup (Railway Cron)

Add to `railway.toml`:
```toml
[crons]
  [[crons.jobs]]
    schedule = "0 2 * * *"  # 2 AM daily
    command = "node scripts/backup-postgres.js"
```

### Backup Files Location

- **Local:** `backend/backups/neuropilot_backup_YYYY-MM-DDTHH-MM-SS.sql.gz`
- **Google Drive:** (if configured) `GDRIVE_BACKUP_FOLDER_ID/`

### Verify Backup

```bash
# Check checksum
cat backup.sql.gz.sha256
sha256sum backup.sql.gz

# Test restore to temp database (local)
gunzip -c backup.sql.gz | psql postgres://localhost/temp_restore
```

---

## Disaster Recovery

### Priority 1: Database Restore

#### Step 1: Download Latest Backup

```bash
# From Google Drive (if configured)
# Or from Railway storage

# Decrypt if encrypted
openssl enc -d -aes-256-gcm \
  -K $BACKUP_ENCRYPTION_KEY \
  -in backup.sql.gz.enc \
  -out backup.sql.gz
```

#### Step 2: Create New Database (Railway)

1. Go to Railway Dashboard
2. Add New → Database → PostgreSQL
3. Copy the new `DATABASE_URL`

#### Step 3: Restore Data

```bash
# Decompress and restore
gunzip -c backup.sql.gz | psql $NEW_DATABASE_URL

# Verify
psql $NEW_DATABASE_URL -c "SELECT COUNT(*) FROM users;"
psql $NEW_DATABASE_URL -c "SELECT COUNT(*) FROM inventory_items;"
```

#### Step 4: Update Service

1. Update `DATABASE_URL` in Railway service variables
2. Redeploy: `railway up`
3. Verify: `curl https://api.neuropilot.dev/health`

### Priority 2: Application Restore

```bash
# Re-deploy from Git
git clone https://github.com/your-org/inventory-enterprise.git
cd inventory-enterprise/backend
railway link
railway up
```

### Priority 3: DNS Failover

If `api.neuropilot.dev` is unavailable:
1. Use fallback: `https://inventory-backend-production-3a2c.up.railway.app`
2. Update Vercel environment variable `VITE_API_URL` to fallback
3. Redeploy Vercel frontend

---

## Security Configuration

### Enable Strict Mode (Recommended for Production)

Set in Railway environment variables:

```env
CORS_STRICT_MODE=true    # Only canonical domains
CSP_STRICT_MODE=true     # No external CDNs
GDRIVE_STRICT_MODE=true  # Require explicit folder ID
```

### Generate Secure Keys

```bash
# JWT Secrets (64 chars each)
openssl rand -hex 32  # JWT_SECRET
openssl rand -hex 32  # JWT_REFRESH_SECRET

# Backup Encryption Key (32 bytes = 64 hex chars)
openssl rand -hex 32  # BACKUP_ENCRYPTION_KEY
```

### Rotate JWT Secret

1. Set `JWT_SECRET_OLD` to current value
2. Set `JWT_SECRET` to new value
3. Deploy (both secrets valid during rotation)
4. After 24h, remove `JWT_SECRET_OLD`

---

## Monitoring & Diagnostics

### Health Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/health` | Overall API health |
| `/diag/db` | Database connectivity |
| `/diag/tables` | List all tables |
| `/diag/migrations` | Applied migrations |
| `/diag/env` | Environment config (safe) |
| `/diag/security` | Security settings |
| `/diag/google-drive` | Google Drive config |
| `/diag/backup` | Backup system status |

### Prometheus Metrics

```bash
curl https://api.neuropilot.dev/metrics
```

Key metrics:
- `http_request_duration_ms` - Request latency
- `tenant_requests_total` - Requests by tenant
- `db_backup_success` - Backup status

### Log Access (Railway)

```bash
railway logs -n 100          # Last 100 lines
railway logs --follow        # Live tail
railway logs --search ERROR  # Filter errors
```

---

## Common Issues

### 1. "relation does not exist" Error

**Cause:** Missing database tables/migrations

**Fix:**
```bash
railway run node scripts/init-postgres.js
```

### 2. CORS Blocked

**Cause:** Origin not in allowlist

**Check:**
```bash
curl https://api.neuropilot.dev/diag/security
```

**Fix:** If using strict mode, ensure only canonical domains are used.

### 3. 401 Unauthorized on Owner Routes

**Cause:** Invalid/expired JWT or wrong role

**Check:**
- Token expiry in payload
- User has `owner` role in database

### 4. Google Drive PDF Preview Fails

**Cause:** CSP blocking Google Drive frame

**Check:**
```bash
curl -I https://api.neuropilot.dev/health | grep content-security-policy
```

**Fix:** Verify `frame-src` includes `https://drive.google.com`

### 5. DATABASE_URL Parsing Error

**Symptom:** `hostname: 'DATABASE_URL=postgresql'`

**Cause:** Railway env var includes `DATABASE_URL=` prefix

**Fix:** The code automatically strips this prefix. If persists, manually fix in Railway.

---

## Contacts

| Role | Contact |
|------|---------|
| Lead Developer | David Mikulis |
| Infrastructure | Railway Support |
| Domain/DNS | Vercel Support |

---

## Phase 2: Multi-Tenant Architecture

### Overview

Phase 2 introduces true multi-tenancy with organization-based isolation:

- **Organizations** (`organizations` table) - Central tenant registry
- **Sites** (`sites` table) - Physical locations within an org
- **Row-Level Security** - PostgreSQL RLS policies enforce tenant isolation

### New Database Tables (Migration 023)

| Table | Purpose |
|-------|---------|
| `organizations` | Tenant registry with billing, limits, features |
| `organization_members` | User-to-org membership with roles |
| `sites` | Physical locations (restaurants, warehouses) |

### Setting Tenant Context

The application sets `app.current_org_id` session variable for RLS:

```javascript
// In middleware/tenant.js
await pool.query(`SET app.current_org_id = $1`, [req.org.id]);
```

### Plan Limits

| Plan | Users | Items | Locations | API Calls/Day |
|------|-------|-------|-----------|---------------|
| Free | 2 | 100 | 1 | 100 |
| Starter | 5 | 500 | 3 | 1,000 |
| Professional | 15 | 2,000 | 10 | 10,000 |
| Enterprise | Unlimited | Unlimited | Unlimited | Unlimited |

---

## Phase 2: Billing & Subscriptions

### Environment Variables

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (frontend) |

### Webhook Setup

1. Create webhook in Stripe Dashboard
2. Point to: `https://api.neuropilot.dev/webhooks/stripe`
3. Select events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.created`
   - `customer.updated`

### Database Tables (Migration 026)

| Table | Purpose |
|-------|---------|
| `billing_customers` | Stripe customer records |
| `billing_subscriptions` | Subscription lifecycle |
| `billing_invoices` | Invoice history |
| `billing_payment_methods` | Stored payment methods |
| `billing_usage_records` | Metered usage tracking |
| `billing_events` | Webhook event log |
| `billing_plans` | Plan configuration |

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/billing/status` | GET | Current subscription status |
| `/api/billing/plans` | GET | Available plans |
| `/api/billing/checkout` | POST | Create checkout session |
| `/api/billing/portal` | POST | Create customer portal |
| `/api/billing/invoices` | GET | Invoice history |
| `/api/billing/usage` | GET | Current usage metrics |

### Testing Stripe Integration

```bash
# Test webhook locally with Stripe CLI
stripe listen --forward-to localhost:8080/webhooks/stripe

# Trigger test events
stripe trigger customer.subscription.created
```

---

## Phase 2: SOC-2 Security

### Overview

SOC-2 Type II compliance features:

- Comprehensive audit logging
- Session management with security controls
- API key management with rotation
- Data retention policies
- Security event alerts

### Database Tables (Migration 027)

| Table | Purpose |
|-------|---------|
| `audit_logs` | Comprehensive activity logs |
| `user_sessions` | Active session management |
| `api_keys` | API key management |
| `security_events` | Security alerts |
| `data_retention_policies` | Retention rules |
| `ip_blocklist` | Blocked IPs |
| `password_history` | Prevent password reuse |
| `consent_records` | GDPR consent tracking |

### Audit Log Retention

Default retention policies:

| Data Type | Retention | Archive |
|-----------|-----------|---------|
| Audit Logs | 365 days | Yes |
| Security Events | 730 days | Yes |
| User Sessions | 90 days | No |
| API Usage | 365 days | Yes |
| Billing Events | 730 days | Yes |

### API Key Management

```bash
# Create API key (returns key only once!)
POST /api/security/api-keys
{
  "name": "Production Integration",
  "scopes": ["inventory:read", "orders:write"],
  "expiresInDays": 90
}

# Rotate key (24h grace period)
POST /api/security/api-keys/:id/rotate
{
  "gracePeriodHours": 24
}
```

### Security Events

The system automatically logs:

- Login success/failure
- Password changes
- MFA enable/disable
- API key creation/revocation
- Permission changes
- Suspicious activity
- Rate limit exceeded

### Session Management

```javascript
// Revoke all user sessions
SELECT revoke_user_sessions('user-uuid', 'security_breach', 'admin-uuid');

// Cleanup expired sessions (run daily)
SELECT cleanup_expired_sessions();
```

---

## Phase 2: AI Features

### Overview

AI-powered inventory management:

- Demand forecasting (Prophet model)
- Reorder optimization
- Consumption pattern learning
- Vendor invoice parsing with OCR
- Price drift detection

### Database Tables (Migrations 024-025)

**AI Predictive Engine (024):**

| Table | Purpose |
|-------|---------|
| `ai_demand_forecasts` | Daily/weekly predictions |
| `ai_reorder_recommendations` | Smart reorder suggestions |
| `ai_consumption_patterns` | Learned usage patterns |
| `ai_training_runs` | Model training logs |
| `ai_prediction_actuals` | Prediction validation |
| `ai_alerts` | Proactive AI alerts |

**Vendor AI Parser (025):**

| Table | Purpose |
|-------|---------|
| `vendor_item_mappings` | Vendor code → internal item |
| `vendor_price_history` | Price tracking |
| `vendor_price_alerts` | Price drift alerts |
| `vendor_invoice_parse_jobs` | Parse job tracking |
| `vendor_invoice_line_matches` | Line-item matching |
| `vendor_parser_feedback` | Learning from corrections |

### Feature Flags

Features are enabled per plan in `billing_plans.features`:

```json
{
  "ai_forecasting": true,
  "vendor_parser": true,
  "api_access": true,
  "priority_support": false
}
```

### Check Feature Access

```sql
-- SQL function
SELECT org_has_feature('org-uuid', 'ai_forecasting');

-- In code
const hasFeature = await pool.query(
  `SELECT org_has_feature($1, $2) as has_feature`,
  [orgId, 'ai_forecasting']
);
```

### Get Items Needing Reorder

```sql
SELECT * FROM get_items_needing_reorder(
  'org-uuid',   -- org_id
  'site-uuid',  -- site_id (optional)
  7             -- days_ahead
);
```

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2025-12-01 | 22.4 | Initial runbook, security hardening phase |
| 2025-12-01 | 23.0 | Phase 2: Multi-tenant, billing, SOC-2, AI features |
