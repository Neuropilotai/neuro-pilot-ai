# Quick Deploy Reference - NeuroPilot v16.6

Copy-paste ready commands for production deployment.

---

## ✅ Pre-Deployment Verification

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend
./scripts/verify-staging-readiness.sh
# Expected: 23 passed, 0 failed ✅
```

---

## 🔐 Step 1: Secrets (DONE ✅)

```bash
cd backend
./scripts/generate_production_secrets.sh
ls -lh .jwt_secret .refresh_secret   # -rw------- (600 perms ✅)
```

Status: **COMPLETE** - Secrets already generated with 600 permissions

---

## 🏗️ Step 2: Backend (Railway)

```bash
cd backend

# Set environment variables
export DATABASE_URL="postgresql://user:pass@ep-xyz.neon.tech/neuropilot?sslmode=require"
export FRONTEND_ORIGIN="https://neuropilot-inventory.vercel.app"

# Deploy
./scripts/stage-deploy.sh

# Verify
railway logs -f
curl "$(railway domain)/health"    # → 200 OK ✅
```

---

## 💻 Step 3: Frontend (Vercel)

```bash
cd ../frontend

# Login (if needed)
vercel login

# Deploy
vercel --prod
# Note the URL from output: https://neuropilot-inventory-xyz.vercel.app

# Set API URL
vercel env add VITE_API_URL production
# When prompted, paste your Railway URL (e.g., https://your-app.up.railway.app)

# Redeploy with environment variable
vercel --prod --force
```

---

## 🔄 Step 4: Update CORS

```bash
cd ../backend

# Update Railway with your actual Vercel URL
railway variables set ALLOW_ORIGIN="https://neuropilot-inventory-xyz.vercel.app"

# Railway will auto-restart (~30 seconds)
```

---

## ✅ Step 5: Verification

### Backend Smoke Tests

```bash
cd backend

RAILWAY_URL="https://your-app.up.railway.app" \
TEST_EMAIL="neuropilotai@gmail.com" \
TEST_PASS="TestPassword123!" \
./scripts/smoke-test.sh
```

**Expected Output:**
```
✅ Health check
✅ Login
✅ Auth verification
✅ Token refresh
🎉 All smoke tests passed!
```

### Frontend Manual Test

1. Open: `https://your-vercel-url.vercel.app/owner-super-console.html`
2. Open DevTools Console (F12)
3. Login with credentials
4. Verify:
   - ✅ No CORS errors in console
   - ✅ Token in localStorage (`authToken`)
   - ✅ Dashboard loads
   - ✅ API calls succeed (check Network tab)

---

## 📊 Verification Checklist

| Component | Check | Command/URL | Expected |
|-----------|-------|-------------|----------|
| Backend Health | `/health` endpoint | `curl $RAILWAY_URL/health` | 200 OK |
| Backend Login | `/api/auth/login` | `POST` with credentials | `{ token, refreshToken }` |
| Backend Auth Me | `/api/auth/me` | `GET` with Bearer token | 200 + user JSON |
| Frontend Load | Landing page | Open Vercel URL | Page loads, no errors |
| Frontend Login | Super Console | Login → Dashboard | No CORS errors |
| Token Storage | localStorage | DevTools → Application | `authToken` present |
| Token Refresh | Wait 30+ min | Reload page | New token issued |

---

## 🛡️ Production Guardrails (Verified ✅)

| Config | Value | Status |
|--------|-------|--------|
| Secrets | 512-bit random (128 hex) | ✅ |
| File Permissions | 600 (owner-only) | ✅ |
| Password Hash | bcrypt (12 rounds) | ✅ |
| Validation | Zod on all write routes | ✅ |
| Rate Limit | 5 req/15 min (login) | ✅ |
| JWT Access TTL | 30 minutes | ✅ |
| JWT Refresh TTL | 90 days | ✅ |
| Token Rotation | Automatic | ✅ |
| Transport | TLS 1.3 | ✅ |
| CORS | Exact origin match | ✅ |
| Security Headers | All present | ✅ |

---

## 🔁 Quarterly Maintenance Cycle

### Every 90 Days

```bash
# 1. Rotate secrets
cd backend
./scripts/generate_production_secrets.sh

# 2. Update Railway variables
railway variables set JWT_SECRET="$(cat .jwt_secret)"
railway variables set REFRESH_TOKEN_SECRET="$(cat .refresh_secret)"

# 3. Verify auth endpoints
./scripts/verify_auth_endpoints.sh

# 4. Run smoke tests
RAILWAY_URL="..." ./scripts/smoke-test.sh

# 5. Validate backup restore
export NEON_PROJECT_ID="your-project-id"
./scripts/dr-drill.sh

# 6. Tag release
git tag -a v17.0.0 -m "Production stable - Q1 2025"
git push origin v17.0.0
```

---

## 📘 Documentation Bundle

Quick links to all docs:

| Document | Location | Purpose |
|----------|----------|---------|
| This Reference | `QUICK_DEPLOY_REFERENCE.md` | Copy-paste commands |
| Automated Deploy | `DEPLOY_NOW.sh` | Interactive deployment script |
| Full Stack Guide | `FULL_STACK_DEPLOYMENT.md` | Complete walkthrough |
| Backend Guide | `backend/STAGING_DEPLOYMENT_GUIDE.md` | Backend details |
| Frontend Guide | `frontend/VERCEL_DEPLOYMENT_GUIDE.md` | Frontend details |
| Security Report | `backend/SECURITY_HARDENING_v16.6.md` | Security audit |
| Production Summary | `backend/PRODUCTION_HARDENING_COMPLETE_v16.6.md` | Complete summary |

---

## 🚨 Common Issues & Fixes

### CORS Error in Browser

**Symptom:** `Access to fetch at '...' blocked by CORS policy`

**Fix:**
```bash
cd backend
railway variables get ALLOW_ORIGIN  # Check current value
railway variables set ALLOW_ORIGIN="https://exact-vercel-url.vercel.app"
# NO trailing slash!
```

### API Calls Return 404

**Symptom:** `GET https://undefined/api/... 404`

**Fix:**
```bash
cd frontend
vercel env ls  # Check if VITE_API_URL is set
vercel env add VITE_API_URL production
# Paste Railway URL
vercel --prod --force  # Redeploy
```

### Token Refresh Fails

**Symptom:** `Token refresh failed: no_refresh_token`

**Fix:**
```bash
cd backend
railway variables get REFRESH_TOKEN_SECRET
# If missing or wrong:
railway variables set REFRESH_TOKEN_SECRET="$(cat .refresh_secret)"
```

### Login Returns 401

**Symptom:** Login fails with "Unauthorized"

**Fix:**
```bash
# Check backend logs
railway logs -f

# Verify user exists
railway run psql $DATABASE_URL -c "SELECT email, role FROM app_user LIMIT 5;"

# If needed, reseed
railway run bash -c "cd backend && ./scripts/stage-deploy.sh"
```

---

## 🎯 Success Criteria

Deployment successful when ALL are true:

- ✅ Backend health returns 200 OK
- ✅ Login returns JWT token + refresh token
- ✅ `/api/auth/me` returns user data with Bearer token
- ✅ Frontend loads without errors
- ✅ Login works in browser
- ✅ No CORS errors in console
- ✅ Token stored in localStorage
- ✅ Dashboard loads data
- ✅ Token auto-refresh works (wait 30+ min test)
- ✅ All smoke tests pass

---

## 📞 Support & Resources

**Neon Dashboard:** https://console.neon.tech
**Railway Dashboard:** https://railway.app/dashboard
**Vercel Dashboard:** https://vercel.com/david-mikulis-projects-73b27c6d

**Local Logs:**
```bash
# Backend logs
cd backend && railway logs -f

# Local server logs (dev)
cd backend && node server.js
```

---

**Version:** 16.6.0
**Status:** 🟢 PRODUCTION READY
**Last Updated:** October 23, 2024
