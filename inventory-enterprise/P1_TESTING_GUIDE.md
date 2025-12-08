# P1 Hardening Testing Guide

**Date:** 2025-12-08  
**Branch:** `feat/waste-inventory-sync`

---

## Quick Start

### 1. Run Validation Script

```bash
# Make sure server is running on port 8083
./scripts/validate-p1-hardening.sh
```

### 2. Manual Testing

All endpoints require authentication. Get a token first:

```bash
TOKEN=$(curl -s -X POST http://localhost:8083/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"neuro.pilot.ai@gmail.com","password":"Admin123!@#"}' \
  | jq -r '.accessToken')
```

---

## Test Cases

### 1. Tenant Context (X-Org-Id Header)

```bash
# Get org_id from /api/me
ORG_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8083/api/me | jq -r '.user.org_id')

# Test X-Org-Id header
curl -H "Authorization: Bearer $TOKEN" \
  -H "X-Org-Id: $ORG_ID" \
  http://localhost:8083/api/items?limit=1
```

**Expected:** Returns 200 with inventory items

---

### 2. Inventory Snapshots - List

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8083/api/inventory/snapshots?page=1&limit=10"
```

**Expected Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 0,
    "pages": 0
  }
}
```

---

### 3. Inventory Snapshots - Detail

```bash
# Replace :id with actual snapshot ID
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8083/api/inventory/snapshots/1"
```

**Expected:** 200 with snapshot details or 404 if not found

---

### 4. Batch Recipe Costing

```bash
# Test with recipe IDs (adjust as needed)
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"recipe_ids": [1, 2, 3], "date": "2025-12-08"}' \
  http://localhost:8083/api/recipes/cost/batch
```

**Expected Response:**
```json
{
  "success": true,
  "date": "2025-12-08",
  "total_requested": 3,
  "successful": 2,
  "failed": 1,
  "results": [...],
  "summary": {
    "total_cost": 50.00,
    "total_items_costed": 20,
    "total_items_missing_price": 2
  }
}
```

**Test Validation:**
```bash
# Should return 400 for empty array
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"recipe_ids":[]}' \
  http://localhost:8083/api/recipes/cost/batch
```

---

### 5. Reorder Alerts - List

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8083/api/inventory/reorder-alerts?page=1&limit=10"
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "item_id": 123,
      "item_code": "CHK-001",
      "item_name": "Chicken Breast",
      "current_quantity": 5.0,
      "reorder_point": 20.0,
      "alert_level": "urgent",
      "shortage_qty": 15.0,
      "estimated_reorder_value": 67.50
    }
  ],
  "summary": {
    "total": 25,
    "critical": 2,
    "urgent": 15,
    "warning": 8,
    "total_shortage_value": 1250.75
  },
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "pages": 3
  }
}
```

---

### 6. Reorder Alerts - Filtered

```bash
# Filter by alert level
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8083/api/inventory/reorder-alerts?alert_level=urgent&limit=5"

# Filter by site
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8083/api/inventory/reorder-alerts?site_id=uuid-here"
```

---

### 7. Waste Inventory Sync (Database Test)

```sql
-- Test INSERT trigger
INSERT INTO waste (org_id, site_id, item_code, quantity, reason)
VALUES ('org-uuid', 'site-uuid', 'CHK-001', 10.0, 'Spoilage');

-- Verify inventory decremented
SELECT current_quantity FROM inventory_items 
WHERE org_id = 'org-uuid' AND item_code = 'CHK-001';

-- Verify audit trail
SELECT * FROM waste_inventory_adjustments 
WHERE waste_id = (SELECT id FROM waste ORDER BY id DESC LIMIT 1);
```

---

### 8. Nightly Reorder Alerts Job

```bash
# Manually trigger the job (for testing)
node -e "
const { runReorderAlertsCheck } = require('./backend/services/reorderAlerts');
const db = require('./backend/db');
runReorderAlertsCheck(db).then(result => {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
"
```

---

## Database Migrations

### Run Migrations

```bash
# Connect to PostgreSQL
psql $DATABASE_URL

# Run migrations
\i backend/db/migrations/040_waste_inventory_sync.sql
\i backend/db/migrations/041_reorder_alert_runs.sql
```

### Verify Tables

```sql
-- Check waste_inventory_adjustments table
SELECT * FROM waste_inventory_adjustments LIMIT 5;

-- Check reorder_alert_runs table
SELECT * FROM reorder_alert_runs ORDER BY run_at DESC LIMIT 5;

-- Check triggers
SELECT trigger_name, event_object_table 
FROM information_schema.triggers 
WHERE trigger_name LIKE '%waste%';
```

---

## Email/Webhook Configuration

### Email Notifications

```sql
-- Configure email recipients per org
UPDATE organizations
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{reorder_alert_emails}',
  '["manager@example.com", "purchasing@example.com"]'::jsonb
)
WHERE id = 'your-org-id';
```

### Webhook Notifications

```bash
# Set global webhook URL
export REORDER_WEBHOOK_URL="https://your-webhook-url.com/reorder-alerts"
```

Or per organization:

```sql
UPDATE organizations
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{reorder_webhook_url}',
  '"https://your-webhook-url.com/reorder-alerts"'::jsonb
)
WHERE id = 'your-org-id';
```

---

## Backfill Script

```bash
# Run 30-day backfill
npm run backfill-waste -- --days 30

# Run for specific org
npm run backfill-waste -- --days 30 --org-id <uuid>
```

---

## Troubleshooting

### Issue: Endpoints return 404

**Solution:** Check route registration in `backend/server.js`

### Issue: Tenant context not resolving

**Solution:** 
1. Verify JWT contains `org_id`
2. Check `resolveTenant` middleware is applied
3. Verify organization exists in database

### Issue: Reorder alerts job not running

**Solution:**
1. Check scheduler is initialized in `server.js`
2. Verify cron schedule: `0 1 * * *` (1 AM UTC)
3. Check logs for errors

### Issue: Email notifications not sending

**Solution:**
1. Verify SMTP credentials in environment variables
2. Check organization settings for email recipients
3. Review email transport logs

---

## Performance Testing

### Load Test - Batch Recipe Costing

```bash
# Test with 100 recipes (max allowed)
RECIPE_IDS=$(seq 1 100 | tr '\n' ',' | sed 's/,$//')
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"recipe_ids\": [$RECIPE_IDS]}" \
  http://localhost:8083/api/recipes/cost/batch
```

### Load Test - Reorder Alerts

```bash
# Test pagination with large dataset
time curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8083/api/inventory/reorder-alerts?page=1&limit=200"
```

---

## Success Criteria

✅ All endpoints return 200/201 with valid JSON  
✅ Tenant context resolves correctly (X-Org-Id, JWT, API key, subdomain)  
✅ Waste triggers update inventory automatically  
✅ Reorder alerts job runs successfully  
✅ Email/webhook notifications sent (if configured)  
✅ All validation tests pass

---

**Status:** Ready for testing

