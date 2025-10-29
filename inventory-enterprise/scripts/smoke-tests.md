# NeuroNexus v19.0 - Post-Deployment Smoke Tests

**Version:** v19.0
**Platform:** Railway
**Execution Time:** ~5-10 minutes
**Prerequisites:** Backend and ML service deployed and healthy

---

## 📋 Test Execution Order

Run these tests in sequence after deployment:

1. Health checks (both services)
2. Service connectivity (backend → ML)
3. Database integrity
4. Authentication & Authorization  
5. Recommendations API
6. Scheduler verification
7. Email notifications
8. Autonomous jobs

---

## ✅ Test Suite

### Test 1: Backend Health Check

**Expected:** 200 OK with healthy status

```bash
curl -sSf https://resourceful-achievement-production.up.railway.app/api/health | jq .
```

**Expected response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-29T14:00:00.000Z",
  "service": "neuro-pilot-ai",
  "version": "1.0.0",
  "scheduler": {
    "enabled": true,
    "status": "running",
    "jobs": {
      "daily_forecast": "02:00 UTC",
      "weekly_retrain": "Sunday 03:00 UTC",
      "health_check": "*/5 * * * *"
    }
  }
}
```

**Validation:**
- ✅ `status` = "healthy"
- ✅ `scheduler.enabled` = true
- ✅ `scheduler.status` = "running"

**If fails:**
- Check Railway logs for startup errors
- Verify `SCHEDULER_ENABLED=true` in Variables
- Check `server.js` binds to 0.0.0.0 (not 127.0.0.1)

---

### Test 2: ML Service Health Check

**Expected:** 200 OK with healthy status

```bash
# From local machine (if ML service has public URL):
curl -sSf https://ml-service-production.up.railway.app/status | jq .

# Or via backend internal network:
railway run --service backend curl -f http://ml-service.railway.internal:8000/status | jq .
```

**Expected response:**
```json
{
  "status": "healthy",
  "service": "ml-forecasting",
  "version": "1.0.0",
  "model_version": "seasonal_naive_v1.0"
}
```

**Validation:**
- ✅ `status` = "healthy"
- ✅ `model_version` present

**If fails:**
- Check ML service Railway logs
- Verify `uvicorn` started on correct port
- Check `main.py` has `/status` endpoint

---

### Test 3: Backend → ML Service Connectivity

**Expected:** Backend can reach ML service via internal network

```bash
railway run --service backend node -e "
const axios = require('axios');
const ML_URL = process.env.ML_URL || 'http://ml-service.railway.internal:8000';
axios.get(ML_URL + '/status')
  .then(res => console.log('✓ ML service reachable:', res.data))
  .catch(err => console.error('✗ ML service error:', err.message));
"
```

**Expected output:**
```
✓ ML service reachable: { status: 'healthy', ... }
```

**If fails:**
- Check `ML_URL` in backend Variables
- Verify ML service name is "ml-service" (exact match)
- Check Railway private networking enabled

---

### Test 4: Database Integrity

**Expected:** All required tables exist

```bash
railway run --service backend sqlite3 database.db ".tables"
```

**Expected output:**
```
audit_log                 forecasts
forecast_errors           reorder_recommendations
schema_migrations         usage_history
inventory_items           ...
```

**Validation:**
- ✅ `forecasts` table exists
- ✅ `usage_history` table exists
- ✅ `reorder_recommendations` table exists
- ✅ `audit_log` table exists

**If fails:**
- Run migrations: `railway run --service backend sqlite3 database.db < migrations/002_autonomous_foundation.sql`

---

### Test 5: Database Integrity Check (PRAGMA)

**Expected:** No corruption

```bash
railway run --service backend sqlite3 database.db "PRAGMA integrity_check;"
```

**Expected output:**
```
ok
```

**If fails:**
- Database corrupted
- Restore from backup or redeploy with fresh DB

---

### Test 6: Authentication (JWT)

**Expected:** JWT signing works

```bash
railway run --service backend node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign({ test: true }, process.env.JWT_SECRET, { expiresIn: '1h' });
console.log('✓ JWT generated:', token.substring(0, 20) + '...');
const decoded = jwt.verify(token, process.env.JWT_SECRET);
console.log('✓ JWT verified:', decoded);
"
```

**Expected output:**
```
✓ JWT generated: eyJhbGciOiJIUzI1NiIs...
✓ JWT verified: { test: true, iat: ..., exp: ... }
```

**If fails:**
- `JWT_SECRET` not set or invalid
- Set in Railway Variables (32+ bytes hex)

---

### Test 7: SMTP Connection

**Expected:** Can connect to SMTP server

```bash
railway run --service backend node -e "
const nodemailer = require('nodemailer');
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});
transport.verify()
  .then(() => console.log('✓ SMTP connection successful'))
  .catch(err => console.error('✗ SMTP error:', err.message));
"
```

**Expected output:**
```
✓ SMTP connection successful
```

**If fails:**
- Check `SMTP_PASS` (use Gmail App Password, not account password)
- Verify `SMTP_HOST=smtp.gmail.com` and `SMTP_PORT=587`
- Check firewall allows outbound port 587

---

### Test 8: Recommendations API (Authenticated)

**Prerequisites:** Get valid JWT token first

**Step 1: Login to get token**
```bash
# Replace with your actual credentials
curl -X POST https://resourceful-achievement-production.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "neuropilotai@gmail.com",
    "password": "SecurePass123!"
  }' | jq -r '.token'

# Save token:
export TOKEN="<paste-token-here>"
```

**Step 2: Test recommendations endpoint**
```bash
curl -X POST https://resourceful-achievement-production.up.railway.app/api/forecast/recommendations/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "serviceLevelA": 0.99,
    "serviceLevelB": 0.95,
    "serviceLevelC": 0.90
  }' | jq .
```

**Expected response:**
```json
{
  "success": true,
  "count": 150,
  "timestamp": "2025-10-29T14:00:00.000Z",
  "recommendations": [
    {
      "item_id": 1,
      "item_name": "Widget A",
      "sku": "WDG-001",
      "abc_class": "A",
      "current_stock": 100,
      "reorder_point": 250,
      "safety_stock": 50,
      "should_reorder": false
    }
  ]
}
```

**Validation:**
- ✅ `success` = true
- ✅ `recommendations` array present
- ✅ ABC classification (A, B, C) present

**If fails:**
- Check authentication (valid token)
- Verify `/api/forecast/recommendations` route registered
- Check `routes/recommendations.js` loaded

---

### Test 9: Scheduler Initialization

**Expected:** Scheduler logs visible at startup

```bash
railway logs --service backend | grep "Autonomous Scheduler"
```

**Expected output:**
```
🤖 Initializing NeuroNexus Autonomous Foundation (v19.0)...
✅ Autonomous Scheduler started
  📊 Daily Forecast: 02:00 UTC
  🔄 Weekly Retrain: Sunday 03:00 UTC
  💓 Health Check: Every 5 minutes
```

**Validation:**
- ✅ "Autonomous Scheduler started" present
- ✅ Cron times shown in UTC
- ✅ All three jobs listed

**If fails:**
- Check `SCHEDULER_ENABLED=true`
- Verify `scheduler.js` imported in `server.js`
- Check for startup errors in logs

---

### Test 10: First Health Check (Wait 5 Minutes)

**Expected:** Health check runs within 5 minutes of deployment

```bash
# Wait 5 minutes after deployment, then:
railway logs --service backend | grep "Running health check"
```

**Expected output:**
```
⚡ Running scheduled health check...
GET http://ml-service.railway.internal:8000/status → 200 OK
✅ Backend health: OK
✅ ML service health: OK
✅ Database integrity: OK (PRAGMA integrity_check)
✅ Audit chain valid (hash verification passed)
Health check complete (105ms)
```

**Validation:**
- ✅ Health check ran
- ✅ ML service responded
- ✅ Database integrity OK
- ✅ No errors

**If fails:**
- Check cron expression: `*/5 * * * *`
- Verify ML service reachable
- Check database not locked

---

### Test 11: UTC Timing Verification

**Expected:** Container runs in UTC timezone

```bash
railway run --service backend date -u
```

**Expected output:**
```
Wed Oct 29 14:00:00 UTC 2025
```

**Validation:**
- ✅ Timezone shows "UTC"
- ✅ Time matches actual UTC time (check worldtimeapi.org)

**If fails:**
- Railway defaults to UTC (should not fail)
- If TZ env var set, remove it

---

### Test 12: Cron Schedule Verification

**Expected:** Next forecast scheduled for 02:00 UTC

```bash
railway run --service backend node -e "
const cron = require('node-cron');
const schedule = '0 2 * * *';
const valid = cron.validate(schedule);
console.log('Daily forecast schedule valid:', valid);
console.log('Next run: Tomorrow at 02:00 UTC');
"
```

**Expected output:**
```
Daily forecast schedule valid: true
Next run: Tomorrow at 02:00 UTC
```

---

### Test 13: Email Notification (Test Send)

**Expected:** Can send test email

```bash
railway run --service backend node -e "
const nodemailer = require('nodemailer');
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});
transport.sendMail({
  from: process.env.SMTP_USER,
  to: process.env.ADMIN_EMAIL,
  subject: 'NeuroNexus v19.0 - Deployment Test',
  text: 'This is a test email from Railway deployment.'
})
  .then(info => console.log('✓ Test email sent:', info.messageId))
  .catch(err => console.error('✗ Email error:', err.message));
"
```

**Expected output:**
```
✓ Test email sent: <message-id@gmail.com>
```

**Check inbox:** You should receive test email

**If fails:**
- Check SMTP credentials
- Verify Gmail allows less secure apps (or use App Password)
- Check spam folder

---

## 🎯 Shadow Mode Tests (Optional)

These tests run operations without affecting production data:

### Test: ML Forecast Generation (Shadow)

```bash
railway run --service backend node -e "
const axios = require('axios');
axios.post('http://ml-service.railway.internal:8000/train/infer-latest', {
  mode: 'shadow',
  items: [1, 2, 3]  // Test with specific items
})
  .then(res => console.log('✓ Shadow forecast:', res.data))
  .catch(err => console.error('✗ Forecast error:', err.message));
"
```

---

## ✅ Smoke Test Checklist

After running all tests, verify:

- [ ] Backend health endpoint: 200 OK
- [ ] ML service health endpoint: 200 OK
- [ ] Backend → ML connectivity: Working
- [ ] Database tables exist: ✓
- [ ] Database integrity: ok
- [ ] JWT authentication: Working
- [ ] SMTP connection: Working
- [ ] Recommendations API: Working (with auth)
- [ ] Scheduler initialized: ✓
- [ ] First health check ran: ✓ (within 5 min)
- [ ] UTC timezone: Verified
- [ ] Cron schedules valid: ✓
- [ ] Test email sent: ✓

**All passed?** ✅ Deployment successful!

**Any failures?** See `AUTONOMOUS_RAILWAY_DEPLOYMENT_GUIDE.md` → Troubleshooting Matrix

---

## 🔄 Automated Smoke Test Script

Run all tests in one command:

```bash
#!/bin/bash
# smoke-test.sh - Automated smoke test suite

BACKEND_URL="https://resourceful-achievement-production.up.railway.app"
PASS=0
FAIL=0

echo "🧪 NeuroNexus v19.0 Smoke Tests"
echo "================================"

# Test 1: Backend health
echo -n "Test 1: Backend health... "
if curl -sSf $BACKEND_URL/api/health > /dev/null; then
  echo "✅ PASS"
  ((PASS++))
else
  echo "❌ FAIL"
  ((FAIL++))
fi

# Test 2: ML service health
echo -n "Test 2: ML service health... "
if railway run --service backend curl -sSf http://ml-service.railway.internal:8000/status > /dev/null; then
  echo "✅ PASS"
  ((PASS++))
else
  echo "❌ FAIL"
  ((FAIL++))
fi

# Test 3: Scheduler enabled
echo -n "Test 3: Scheduler enabled... "
SCHED=$(curl -sSf $BACKEND_URL/api/health | jq -r '.scheduler.enabled')
if [ "$SCHED" = "true" ]; then
  echo "✅ PASS"
  ((PASS++))
else
  echo "❌ FAIL"
  ((FAIL++))
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ $FAIL -eq 0 ]; then
  echo "✅ All smoke tests passed!"
  exit 0
else
  echo "❌ Some tests failed. Check logs."
  exit 1
fi
```

**Run:**
```bash
chmod +x scripts/smoke-test.sh
./scripts/smoke-test.sh
```

---

**END OF SMOKE TESTS**
