# NeuroNexus v19.0 Smoke Tests
**Post-Deployment Verification Suite**

---

## 🎯 **OVERVIEW**

This document provides comprehensive smoke tests to verify NeuroNexus v19.0 deployment on Railway.

**Test Categories:**
1. **Service Health** - Backend + ML service availability
2. **API Functionality** - Critical endpoints
3. **Scheduler Status** - Autonomous scheduler verification
4. **Service Communication** - Backend ↔ ML service connectivity
5. **Security** - Authentication and authorization
6. **Email** - SMTP notification delivery (optional)

**Expected Duration:** 5-10 minutes
**Success Criteria:** All tests pass with 0 failures

---

## 🛠️ **PREREQUISITES**

### **Required Tools:**
- `curl` (command-line HTTP client)
- `jq` (JSON processor) - Install: `brew install jq` or `apt install jq`

### **Required Information:**
```bash
# Set these variables before running tests
BACKEND_URL="https://backend-production-abc123.up.railway.app"
ML_URL="https://ml-service-production-xyz789.up.railway.app"

# Optional: Valid JWT token for authenticated endpoints
AUTH_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## ✅ **TEST SUITE 1: SERVICE HEALTH**

### **Test 1.1: Backend Health Check**

```bash
echo "🧪 Test 1.1: Backend Health Check"
curl -f -s "$BACKEND_URL/api/health" | jq '.'

# Expected Output:
# {
#   "status": "healthy",
#   "uptime": 12345,
#   "timestamp": "2025-10-30T...",
#   "version": "16.5.0",
#   "scheduler": {
#     "enabled": true,
#     "nextRun": "2025-10-31T02:15:00.000Z"
#   }
# }
```

**Success Criteria:**
- ✅ HTTP status: `200 OK`
- ✅ `status` field: `"healthy"`
- ✅ Response time: <2 seconds

**Failure Indicators:**
- ❌ HTTP 502/503: Backend not responding (check Railway logs)
- ❌ HTTP 404: Incorrect health check path (should be `/api/health`)
- ❌ Connection refused: Service not running

---

### **Test 1.2: ML Service Health Check**

```bash
echo "🧪 Test 1.2: ML Service Health Check"
curl -f -s "$ML_URL/status" | jq '.'

# Expected Output:
# {
#   "status": "healthy",
#   "version": "1.0.0",
#   "uptime_seconds": 456
# }
```

**Success Criteria:**
- ✅ HTTP status: `200 OK`
- ✅ `status` field: `"healthy"`
- ✅ Response time: <1 second

---

### **Test 1.3: Backend Server Listening**

```bash
echo "🧪 Test 1.3: Backend Server Listening on 0.0.0.0"
railway logs --service backend | grep -i "listening" | tail -1

# Expected Output:
# Server listening on 0.0.0.0:3001
```

**Success Criteria:**
- ✅ Log shows `0.0.0.0` (NOT `127.0.0.1`)
- ✅ Port matches Railway's $PORT variable

---

## 🔌 **TEST SUITE 2: API FUNCTIONALITY**

### **Test 2.1: Root Endpoint**

```bash
echo "🧪 Test 2.1: Root Endpoint"
curl -f -s "$BACKEND_URL/" | head -c 100

# Expected Output: HTML or JSON welcome message
```

**Success Criteria:**
- ✅ HTTP status: `200 OK`
- ✅ Response contains HTML or JSON

---

### **Test 2.2: Forecast Recommendations API**

```bash
echo "🧪 Test 2.2: Forecast Recommendations API"
curl -f -s "$BACKEND_URL/api/forecast/recommendations" | jq '.'

# Expected Output:
# {
#   "date": "2025-10-30",
#   "recommendations": [...],
#   "modelVersion": "seasonal_naive_v1",
#   "confidence": "medium",
#   "mlServiceHealthy": true
# }
```

**Success Criteria:**
- ✅ HTTP status: `200 OK`
- ✅ `mlServiceHealthy` field: `true`
- ✅ Returns forecast data (even if empty)

**This test validates backend → ML service communication!**

---

### **Test 2.3: Authentication Required Endpoints (Should Fail)**

```bash
echo "🧪 Test 2.3: Auth Required - Inventory API"
curl -I -s "$BACKEND_URL/api/inventory" | grep "HTTP"

# Expected Output:
# HTTP/2 401 (or 403)
```

**Success Criteria:**
- ✅ HTTP status: `401 Unauthorized` or `403 Forbidden`
- ✅ No 200 OK (indicates auth is working)

---

### **Test 2.4: ML Service Inference Endpoint**

```bash
echo "🧪 Test 2.4: ML Inference API"
curl -f -s -X POST "$ML_URL/infer" \
  -H "Content-Type: application/json" \
  -d '{"mode":"daily","item_ids":null}' | jq '.'

# Expected Output:
# {
#   "forecasts": [...],
#   "model_version": "seasonal_naive_v1",
#   "timestamp": "2025-10-30T..."
# }
```

**Success Criteria:**
- ✅ HTTP status: `200 OK`
- ✅ Returns forecast array
- ✅ Response time: <10 seconds

---

## 📅 **TEST SUITE 3: SCHEDULER STATUS**

### **Test 3.1: Scheduler Enabled**

```bash
echo "🧪 Test 3.1: Scheduler Enabled"
curl -s "$BACKEND_URL/api/health" | jq '.scheduler.enabled'

# Expected Output:
# true
```

**Success Criteria:**
- ✅ Returns `true`

**If returns `false`:**
- ❌ Check `SCHEDULER_ENABLED=true` in Railway variables
- ❌ Verify `SVC_JWT` is set

---

### **Test 3.2: Scheduler Next Run**

```bash
echo "🧪 Test 3.2: Scheduler Next Run"
curl -s "$BACKEND_URL/api/health" | jq '.scheduler.nextRun'

# Expected Output:
# "2025-10-31T02:15:00.000Z"
```

**Success Criteria:**
- ✅ Returns valid ISO timestamp
- ✅ Time is 02:15 UTC (daily intelligence report)

---

### **Test 3.3: Scheduler Jobs Registered**

```bash
echo "🧪 Test 3.3: Scheduler Jobs Registered"
curl -s "$BACKEND_URL/api/health" | jq '.scheduler.jobs'

# Expected Output:
# [
#   {
#     "name": "dailyIntelligenceReport",
#     "schedule": "15 2 * * *",
#     "lastRun": null
#   },
#   {
#     "name": "weeklyRetrain",
#     "schedule": "0 3 * * 0",
#     "lastRun": null
#   }
# ]
```

**Success Criteria:**
- ✅ Returns array with 2 jobs
- ✅ `dailyIntelligenceReport` present
- ✅ `weeklyRetrain` present

---

## 🔗 **TEST SUITE 4: SERVICE COMMUNICATION**

### **Test 4.1: Backend → ML Service (Internal)**

```bash
echo "🧪 Test 4.1: Backend to ML Service Communication"
railway logs --service backend | grep "ML service health check" | tail -1

# Expected Output:
# ✅ ML service health check passed: http://ml-service.railway.internal:8000
```

**Success Criteria:**
- ✅ Log shows ML service health check passed
- ✅ Uses `.railway.internal` domain

---

### **Test 4.2: ML Service Database Access**

```bash
echo "🧪 Test 4.2: ML Service Can Access Database"
curl -s -X POST "$ML_URL/train" \
  -H "Content-Type: application/json" \
  -d '{"backfill_days":7,"force":false}' | jq '.status'

# Expected Output:
# "success" or "training_complete"
```

**Success Criteria:**
- ✅ HTTP status: `200 OK`
- ✅ No database connection errors

---

## 🔒 **TEST SUITE 5: SECURITY**

### **Test 5.1: HTTPS Enabled**

```bash
echo "🧪 Test 5.1: HTTPS Enabled"
curl -I -s "$BACKEND_URL" | grep -i "strict-transport-security"

# Expected Output:
# strict-transport-security: max-age=...
```

**Success Criteria:**
- ✅ HSTS header present (Railway enforces HTTPS)

---

### **Test 5.2: CORS Headers**

```bash
echo "🧪 Test 5.2: CORS Headers"
curl -I -s -H "Origin: https://example.com" "$BACKEND_URL/api/health" | grep -i "access-control"

# Expected Output:
# access-control-allow-origin: *
```

**Success Criteria:**
- ✅ CORS headers present (if configured)

---

## 📧 **TEST SUITE 6: EMAIL NOTIFICATIONS (OPTIONAL)**

### **Test 6.1: SMTP Configuration Validated**

```bash
echo "🧪 Test 6.1: SMTP Config Validated"
railway vars --service backend | grep SMTP

# Expected Output:
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=neuropilotai@gmail.com
# SMTP_PASS=[hidden]
```

**Success Criteria:**
- ✅ All SMTP variables set

---

### **Test 6.2: Test Email Delivery (Manual)**

```bash
echo "🧪 Test 6.2: Test Email Delivery"
# Trigger manual test email (if backend has test endpoint)
curl -X POST -s "$BACKEND_URL/api/test-email" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to":"neuropilotai@gmail.com","subject":"Test"}' | jq '.'

# Expected Output:
# {
#   "status": "sent",
#   "messageId": "..."
# }
```

**Success Criteria:**
- ✅ HTTP status: `200 OK`
- ✅ Check inbox for test email

---

## 🚀 **AUTOMATED TEST SCRIPT**

### **Complete Smoke Test Runner**

Save as `run-smoke-tests.sh`:

```bash
#!/bin/bash
set -e

# Configuration
BACKEND_URL="${BACKEND_URL:-https://backend-production-abc123.up.railway.app}"
ML_URL="${ML_URL:-https://ml-service-production-xyz789.up.railway.app}"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

# Helper function
run_test() {
  local test_name="$1"
  local command="$2"
  echo ""
  echo "🧪 Running: $test_name"
  if eval "$command" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ PASS${NC}: $test_name"
    ((PASSED++))
  else
    echo -e "${RED}❌ FAIL${NC}: $test_name"
    ((FAILED++))
  fi
}

echo "=================================================="
echo "  NeuroNexus v19.0 Smoke Test Suite"
echo "=================================================="
echo "Backend URL: $BACKEND_URL"
echo "ML Service URL: $ML_URL"
echo ""

# Suite 1: Service Health
echo "📋 Test Suite 1: Service Health"
run_test "Backend Health Check" "curl -f -s '$BACKEND_URL/api/health' | jq -e '.status == \"healthy\"'"
run_test "ML Service Health Check" "curl -f -s '$ML_URL/status' | jq -e '.status == \"healthy\"'"

# Suite 2: API Functionality
echo ""
echo "📋 Test Suite 2: API Functionality"
run_test "Root Endpoint" "curl -f -s '$BACKEND_URL/' | grep -q '.'"
run_test "Forecast API" "curl -f -s '$BACKEND_URL/api/forecast/recommendations' | jq -e '.mlServiceHealthy == true'"
run_test "Auth Required (401)" "curl -s -o /dev/null -w '%{http_code}' '$BACKEND_URL/api/inventory' | grep -q '40[13]'"

# Suite 3: Scheduler Status
echo ""
echo "📋 Test Suite 3: Scheduler Status"
run_test "Scheduler Enabled" "curl -s '$BACKEND_URL/api/health' | jq -e '.scheduler.enabled == true'"
run_test "Next Run Scheduled" "curl -s '$BACKEND_URL/api/health' | jq -e '.scheduler.nextRun != null'"

# Suite 4: Service Communication
echo ""
echo "📋 Test Suite 4: Service Communication"
run_test "ML Inference Endpoint" "curl -f -s -X POST '$ML_URL/infer' -H 'Content-Type: application/json' -d '{\"mode\":\"daily\"}' | jq -e '.'"

# Summary
echo ""
echo "=================================================="
echo "  Test Summary"
echo "=================================================="
echo -e "${GREEN}✅ Passed: $PASSED${NC}"
echo -e "${RED}❌ Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo "🎉 All smoke tests passed! Deployment successful."
  exit 0
else
  echo "⚠️  Some tests failed. Review logs and troubleshoot."
  exit 1
fi
```

---

### **Usage:**

```bash
# Set environment variables
export BACKEND_URL="https://backend-production-abc123.up.railway.app"
export ML_URL="https://ml-service-production-xyz789.up.railway.app"

# Run smoke tests
bash run-smoke-tests.sh
```

**Expected Output:**
```
==================================================
  NeuroNexus v19.0 Smoke Test Suite
==================================================
Backend URL: https://backend-production-abc123.up.railway.app
ML Service URL: https://ml-service-production-xyz789.up.railway.app

📋 Test Suite 1: Service Health
🧪 Running: Backend Health Check
✅ PASS: Backend Health Check
🧪 Running: ML Service Health Check
✅ PASS: ML Service Health Check

📋 Test Suite 2: API Functionality
...

==================================================
  Test Summary
==================================================
✅ Passed: 8
❌ Failed: 0

🎉 All smoke tests passed! Deployment successful.
```

---

## 🐞 **TROUBLESHOOTING FAILED TESTS**

### **Backend Health Check Fails**
```bash
# Check backend logs
railway logs --service backend --tail 100

# Common causes:
# - Server not listening on 0.0.0.0
# - Missing environment variables
# - Database connection error
```

### **ML Service Health Check Fails**
```bash
# Check ML service logs
railway logs --service ml-service --tail 100

# Common causes:
# - Missing requirements.txt dependencies
# - Python version mismatch
# - Port binding error
```

### **Forecast API Fails (ML Communication)**
```bash
# Verify ML_URL in backend variables
railway vars --service backend | grep ML_URL

# Should be:
# ML_URL=http://ml-service.railway.internal:8000

# NOT:
# ML_URL=https://ml-service-production-xyz789.up.railway.app
```

### **Scheduler Not Enabled**
```bash
# Check scheduler environment variables
railway vars --service backend | grep -E "SCHEDULER|SVC_JWT"

# Verify:
# SCHEDULER_ENABLED=true
# SVC_JWT=[valid token]
```

---

## 📊 **PERFORMANCE BENCHMARKS**

Expected response times (from Railway cloud):

| Endpoint | Expected | Warning | Critical |
|----------|----------|---------|----------|
| `/api/health` | <500ms | <2s | >5s |
| `/status` (ML) | <300ms | <1s | >3s |
| `/api/forecast/recommendations` | <2s | <10s | >30s |
| `/infer` (ML) | <5s | <30s | >60s |

**If response times exceed "Warning" threshold:**
- Check Railway service resources (CPU, memory)
- Consider upgrading to higher Railway plan
- Investigate database query performance

---

## 📚 **RELATED DOCUMENTATION**

- **Deployment Runbook:** `V19_DEPLOYMENT_RUNBOOK.md`
- **Environment Variables:** `docs/ENV_VARS_V19.md`
- **Rollback Plan:** `docs/ROLLBACK_PLAN.md`
- **Troubleshooting:** `V19_DEPLOYMENT_RUNBOOK.md` → Quick Diag

---

**Last Updated:** 2025-10-30
**Version:** v19.0
**Maintainer:** DevOps Team
