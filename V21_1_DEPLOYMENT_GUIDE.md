# NeuroInnovate Inventory Enterprise V21.1 Deployment Guide

## Overview

V21.1 is a **production-only**, enterprise-grade inventory management system with:
- ✅ PostgreSQL database (NO SQLite)
- ✅ Multi-vendor time-series pricing
- ✅ Recipe costing engine with live vendor price resolution
- ✅ 4-week menu cycle planning
- ✅ Daily population (headcount) tracking
- ✅ Waste intelligence with auto-cost calculation
- ✅ Enhanced RBAC with quotas and rate limiting
- ✅ Prometheus metrics
- ✅ JWT authentication with session management
- ✅ **ZERO mock/demo data**

---

## Prerequisites

- **Node.js** 18+ with npm
- **PostgreSQL** 14+ database
- **Railway** account (recommended) OR Docker + PostgreSQL locally
- **Git** for version control

---

## Step 1: Database Setup

### Option A: Railway PostgreSQL (Recommended)

1. **Create new PostgreSQL database in Railway:**
   ```bash
   railway link  # Link to your Railway project
   railway add postgres  # Add PostgreSQL addon
   ```

2. **Get connection string:**
   ```bash
   railway variables
   # Look for DATABASE_URL
   ```

### Option B: Local PostgreSQL

1. **Create database:**
   ```bash
   createdb neuroinnovate_v21
   ```

2. **Set connection string:**
   ```
   DATABASE_URL=postgresql://postgres:password@localhost:5432/neuroinnovate_v21
   ```

---

## Step 2: Run Migrations

All V21.1 migrations are **idempotent** (safe to re-run).

```bash
# Connect to your database
psql $DATABASE_URL

# Run migrations in order
\i inventory-enterprise/backend/db/migrations/008_live_forecast.sql
\i inventory-enterprise/backend/db/migrations/009_menu_cost_link.sql
\i inventory-enterprise/backend/db/migrations/010_quotas_rbac_hardening.sql

# Verify migrations
\dt
\df

# You should see:
# - Tables: forecast_results, vendors, vendor_prices, recipes, recipe_items,
#           menus, menu_days, menu_recipes, population, waste_logs, waste_reasons,
#           user_roles, role_permissions, org_quotas, rate_limit_buckets, etc.
# - Functions: get_current_vendor_price, calculate_recipe_cost, check_quota,
#              reset_quotas, consume_tokens, cleanup_expired_forecasts, etc.
```

---

## Step 3: Configure Environment

```bash
# Copy template
cp .env.example.v21_1 .env

# Edit .env with your values
vim .env
```

### Required Variables

```env
NODE_ENV=production
PORT=8080
DATABASE_URL=postgresql://postgres:password@host:5432/db

# Generate with: openssl rand -base64 32
JWT_SECRET=your-secret-here

CORS_ALLOWLIST=https://your-frontend-domain.com

SCHEDULER_ENABLED=true
CRON_DAILY=0 2 * * *
```

---

## Step 4: Install Dependencies

```bash
cd inventory-enterprise/backend
npm install express pg helmet cors morgan node-cron jsonwebtoken prom-client
```

---

## Step 5: Start Server

### Development

```bash
node server-v21_1.js
```

### Production (Railway)

```bash
# Deploy to Railway
railway up

# Or use GitHub integration with railway.json
```

**railway.json (create in project root):**
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "cd inventory-enterprise/backend && npm install"
  },
  "deploy": {
    "startCommand": "cd inventory-enterprise/backend && node server-v21_1.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

---

## Step 6: Verify Deployment

### Run Smoke Tests

```bash
# Set your JWT token (get from authentication endpoint)
export JWT_TOKEN="your-jwt-token-here"

# Run smoke tests
./scripts/smoke-test-v21_1.sh
```

### Manual Health Check

```bash
# Check health
curl http://localhost:8080/health

# Check metrics
curl http://localhost:8080/metrics

# Test vendors API
curl -H "Authorization: Bearer $JWT_TOKEN" \
  http://localhost:8080/api/vendors
```

---

## Step 7: Seed Initial Data (Optional)

### Create default waste reasons

```sql
INSERT INTO waste_reasons (reason, category, description) VALUES
  ('Spoilage', 'food_quality', 'Food spoiled before use'),
  ('Overproduction', 'planning', 'Made too much'),
  ('Trimming Loss', 'prep', 'Normal prep waste'),
  ('Expired', 'food_quality', 'Past expiration date'),
  ('Damaged', 'handling', 'Damaged during storage/prep'),
  ('Customer Return', 'service', 'Returned by customer');
```

### Import vendor prices (CSV)

POST to `/api/vendors/prices/import` with:
```json
{
  "rows": [
    {
      "vendor": "Sysco",
      "item_sku": "CHICKEN-BREAST-001",
      "price": 4.50,
      "currency": "USD",
      "uom": "LB",
      "effective_from": "2025-01-01"
    }
  ]
}
```

---

## Step 8: Frontend Console

Open `inventory-enterprise/frontend/public/owner-super-console-enterprise.html` in a browser.

### Configure API URL

Update the hardcoded API URL at the top of the script section:
```javascript
const API_URL = 'https://your-api-domain.railway.app';
```

### Features Available

- **Vendors Tab** (`g+v`): Manage vendors and import pricing
- **Recipes Tab** (`g+r`): Create recipes with cost calculation
- **Menu Tab** (`g+m`): 4-week menu cycle planning
- **Population Tab** (`g+p`): Daily headcount tracking
- **Waste Tab** (`g+w`): Waste logging with auto-costing
- **PDFs Tab** (`g+d`): Generate reports

---

## Monitoring

### Prometheus Metrics

```bash
curl http://localhost:8080/metrics
```

**Key Metrics:**
- `http_request_duration_ms` - Request latency histogram
- `tenant_requests_total` - Per-tenant request counter
- `quota_exceeded_total` - Quota violations

### Database Monitoring

```sql
-- Check active sessions
SELECT * FROM user_sessions WHERE revoked = false;

-- Check quota usage
SELECT * FROM org_quotas ORDER BY current_usage DESC;

-- Check recent waste events
SELECT * FROM waste_logs ORDER BY event_ts DESC LIMIT 10;
```

---

## Troubleshooting

### Database Connection Fails

```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check Railway logs
railway logs
```

### Migrations Fail

```bash
# Check which tables already exist
psql $DATABASE_URL -c "\dt"

# Re-run migrations (they're idempotent)
psql $DATABASE_URL < inventory-enterprise/backend/db/migrations/009_menu_cost_link.sql
```

### Authentication Errors

- Verify `JWT_SECRET` is set
- Check token expiry in `user_sessions` table
- Ensure CORS allowlist includes frontend domain

### Rate Limiting Issues

```sql
-- Check rate limit buckets
SELECT * FROM rate_limit_buckets WHERE bucket_key LIKE '%user:1:%';

-- Reset bucket
UPDATE rate_limit_buckets SET tokens = capacity WHERE bucket_key = 'user:1:your-user-id';
```

---

## API Endpoints Reference

### Vendors
- `GET /api/vendors` - List all vendors
- `POST /api/vendors` - Create vendor
- `POST /api/vendors/prices/import` - Bulk import prices
- `GET /api/vendors/prices/lookup?sku=X` - Lookup current price

### Recipes
- `GET /api/recipes` - List recipes
- `POST /api/recipes` - Create recipe
- `GET /api/recipes/:id/cost` - Calculate recipe cost
- `POST /api/recipes/:id/cost/snapshot` - Save cost snapshot

### Menu
- `GET /api/menu` - List menu cycles
- `POST /api/menu` - Create menu cycle
- `GET /api/menu/:id` - Get menu with days and recipes
- `POST /api/menu/:id/days/:dayId/recipes` - Add recipe to day

### Population
- `GET /api/population` - List population data
- `POST /api/population` - Create/update population entry
- `GET /api/population/summary` - Get aggregate statistics

### Waste
- `GET /api/waste` - List waste events
- `POST /api/waste` - Log waste event (auto-cost calculation)
- `GET /api/waste/summary` - Aggregate waste analytics

### PDFs
- `POST /api/pdfs/generate` - Generate PDF report

---

## Security Checklist

- ✅ JWT_SECRET is secure (32+ bytes)
- ✅ DATABASE_URL uses SSL in production
- ✅ CORS allowlist is restrictive (no wildcard in production)
- ✅ Rate limiting is enabled
- ✅ Helmet security headers are active
- ✅ Session management is working
- ✅ RBAC permissions are enforced

---

## Next Steps

1. **Import real vendor pricing data** via CSV
2. **Create recipes** with ingredient lists
3. **Build 4-week menu cycle** for your site
4. **Track daily population** for accurate forecasting
5. **Log waste events** to monitor food cost
6. **Generate PDF reports** for analysis

---

## Support

For issues or questions:
- Check Railway logs: `railway logs`
- Review Prometheus metrics: `/metrics`
- Check database logs: `SELECT * FROM security_events ORDER BY created_at DESC LIMIT 100;`

**V21.1 is production-ready. No mock data. All features are live.**
