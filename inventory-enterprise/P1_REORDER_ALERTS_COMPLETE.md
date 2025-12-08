# P1 Hardening: Reorder Alerts - COMPLETE

**Date:** 2025-12-08  
**Branch:** `feat/waste-inventory-sync`  
**Status:** ✅ **COMPLETE**

---

## Summary

Successfully implemented reorder alerts system with:
- ✅ Nightly job (runs at 1 AM UTC daily)
- ✅ GET /api/inventory/reorder-alerts endpoint
- ✅ Email notifications (configurable per org)
- ✅ Webhook notifications (configurable per org)

---

## 1. Nightly Reorder Alerts Job

### Schedule
- **Cron:** `0 1 * * *` (Daily at 1 AM UTC)
- **Location:** `backend/scheduler.js`
- **Service:** `backend/services/reorderAlerts.js`

### Functionality
- Scans all active organizations
- Identifies items below reorder point, par level, or min quantity
- Categorizes alerts by severity:
  - **Critical:** Current quantity <= 0 (out of stock)
  - **Urgent:** Current quantity <= reorder_point
  - **Warning:** Current quantity <= par_level
- Sends email and webhook notifications per organization
- Logs run summary to `reorder_alert_runs` table (optional)

### Alert Detection Logic
```sql
WHERE (
  current_quantity <= reorder_point
  OR (reorder_point = 0 AND current_quantity <= par_level)
  OR (reorder_point = 0 AND par_level = 0 AND current_quantity <= min_quantity)
)
```

---

## 2. GET /api/inventory/reorder-alerts Endpoint

### Route
`GET /api/inventory/reorder-alerts`

### Query Parameters
- `site_id` (optional, UUID) - Filter by site
- `alert_level` (optional) - Filter by level: `critical`, `urgent`, `warning`
- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 100, max: 200) - Items per page

### Response
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
      "par_level": 30.0,
      "min_quantity": 10.0,
      "unit": "LB",
      "unit_cost": 4.50,
      "category": "MEAT",
      "location": "COOLER-01",
      "site_id": "uuid-here",
      "site_name": "Main Kitchen",
      "alert_level": "urgent",
      "shortage_qty": 15.0,
      "par_shortage_qty": 25.0,
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
    "limit": 100,
    "total": 25,
    "pages": 1
  }
}
```

### Features
- ✅ Org/site scoped
- ✅ RBAC permission check (`INVENTORY_READ`)
- ✅ Pagination support
- ✅ Alert level filtering
- ✅ Summary statistics
- ✅ Estimated reorder value calculation

---

## 3. Email Notifications

### Configuration
Email recipients are configured per organization in `organizations.settings`:
```json
{
  "reorder_alert_emails": [
    "manager@example.com",
    "purchasing@example.com"
  ]
}
```

### Email Features
- HTML email template with color-coded alert levels
- Summary statistics (total alerts, critical/urgent/warning counts)
- Detailed tables for critical and urgent items
- Estimated reorder value
- Responsive design

### Email Template Sections
1. **Header** - Organization name and alert title
2. **Summary** - Total alerts, breakdown by level, estimated value
3. **Critical Items Table** - All out-of-stock items
4. **Urgent Items Table** - Items below reorder point (first 20)
5. **Warning Items** - Count of items below par level
6. **Footer** - Timestamp and system info

---

## 4. Webhook Notifications

### Configuration
Webhook URL can be configured:
- Per organization: `organizations.settings.reorder_webhook_url`
- Global: `REORDER_WEBHOOK_URL` environment variable

### Webhook Payload
```json
{
  "event": "reorder_alert",
  "org_id": "uuid-here",
  "org_name": "Acme Restaurant",
  "timestamp": "2025-12-08T01:00:00Z",
  "summary": {
    "total_alerts": 25,
    "critical": 2,
    "urgent": 15,
    "warning": 8,
    "total_shortage_value": 1250.75
  },
  "alerts": [
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
  "total_alerts": 25
}
```

### Webhook Features
- ✅ HTTP POST to configured URL
- ✅ JSON payload
- ✅ Timeout: 5 seconds
- ✅ User-Agent header: `Inventory-Enterprise/1.0`
- ✅ Limited to first 50 alerts (to prevent oversized payloads)

---

## Implementation Details

### Files Created/Modified:

1. **`backend/services/reorderAlerts.js`** (NEW)
   - `runReorderAlertsCheck()` - Nightly job function
   - `getReorderAlerts()` - API endpoint function
   - `sendReorderNotifications()` - Email/webhook sender
   - `generateReorderAlertEmail()` - HTML email template

2. **`backend/scheduler.js`** (MODIFIED)
   - Added `REORDER_ALERTS_SCHEDULE` to CONFIG
   - Added cron job for nightly reorder alerts check
   - Integrated with `reorderAlerts` service

3. **`backend/routes/inventory.js`** (MODIFIED)
   - Added `GET /api/inventory/reorder-alerts` route
   - RBAC permission check
   - Query parameter validation
   - Pagination support

4. **`backend/db/migrations/041_reorder_alert_runs.sql`** (NEW)
   - Optional table for tracking alert runs
   - Used for monitoring and auditing

### Database Tables Used:

- `inventory_items` - Item data with reorder points
- `organizations` - Org settings for notifications
- `sites` - Site information (optional)
- `reorder_alert_runs` - Run tracking (optional)

### Security:

- ✅ RBAC permission checks (`INVENTORY_READ`)
- ✅ Org-scoped queries (prevents cross-org access)
- ✅ Input validation (express-validator)
- ✅ SQL injection protection (parameterized queries)

---

## Testing

### Test Nightly Job:

```bash
# Manually trigger the job (for testing)
node -e "
const { runReorderAlertsCheck } = require('./backend/services/reorderAlerts');
const db = require('./backend/db');
runReorderAlertsCheck(db).then(result => {
  console.log('Result:', JSON.stringify(result, null, 2));
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
"
```

### Test API Endpoint:

```bash
# Get JWT token
TOKEN=$(curl -s -X POST http://localhost:8083/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"neuropilotai@gmail.com","password":"Admin123!@#"}' \
  | jq -r '.accessToken')

# Get reorder alerts
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8083/api/inventory/reorder-alerts?page=1&limit=10"

# Filter by alert level
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8083/api/inventory/reorder-alerts?alert_level=urgent"

# Filter by site
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8083/api/inventory/reorder-alerts?site_id=uuid-here"
```

### Test Email Notifications:

1. Update organization settings:
```sql
UPDATE organizations
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{reorder_alert_emails}',
  '["test@example.com"]'::jsonb
)
WHERE id = 'your-org-id';
```

2. Run the nightly job manually (see above)

### Test Webhook Notifications:

1. Set environment variable:
```bash
export REORDER_WEBHOOK_URL="https://your-webhook-url.com/reorder-alerts"
```

2. Or update organization settings:
```sql
UPDATE organizations
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{reorder_webhook_url}',
  '"https://your-webhook-url.com/reorder-alerts"'::jsonb
)
WHERE id = 'your-org-id';
```

3. Run the nightly job manually

---

## Configuration

### Environment Variables:
- `SMTP_SERVER` - SMTP server hostname (default: smtp.gmail.com)
- `SMTP_PORT` - SMTP port (default: 587)
- `SMTP_USERNAME` - SMTP username
- `SMTP_PASSWORD` - SMTP password
- `REORDER_WEBHOOK_URL` - Global webhook URL (optional)

### Organization Settings (JSONB):
```json
{
  "reorder_alert_emails": ["email1@example.com", "email2@example.com"],
  "reorder_webhook_url": "https://webhook.example.com/reorder-alerts"
}
```

---

## Next Steps

1. ✅ **Code Complete** - All features implemented
2. ⏭️ **Test Nightly Job** - Verify with real data
3. ⏭️ **Test Email Notifications** - Configure SMTP and test
4. ⏭️ **Test Webhook Notifications** - Configure webhook URL and test
5. ⏭️ **Monitor Alert Runs** - Check `reorder_alert_runs` table
6. ⏭️ **Performance Tuning** - Optimize for large inventories (1000+ items)

---

**Status:** ✅ **READY FOR TESTING**

