# Full Stack Deployment Guide - NeuroPilot v16.6

**Complete deployment of Backend (Railway) + Frontend (Vercel)**

---

## 🎯 Overview

This guide covers deploying the complete NeuroPilot stack:
- **Backend**: Railway (Node.js + Neon Postgres)
- **Frontend**: Vercel (Static Site)

**Total Time**: ~15 minutes

---

## 📋 Prerequisites

### Accounts
- [ ] Railway account with project created
- [ ] Vercel account (link: https://vercel.com/david-mikulis-projects-73b27c6d)
- [ ] Neon Postgres database provisioned

### CLI Tools
```bash
# Install Railway CLI
npm install -g @railway/cli

# Install Vercel CLI
npm install -g vercel

# Login to both
railway login
vercel login
```

### Required Information
- Neon DATABASE_URL: `postgresql://user:pass@host.neon.tech/db?sslmode=require`
- Railway project name or ID
- Desired frontend domain (optional)

---

## 🚀 Deployment Steps

### Phase 1: Backend Deployment (Railway)

#### Step 1: Prepare Backend

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Verify readiness
./scripts/verify-staging-readiness.sh
# Expected: 23 passed, 0 failed
```

#### Step 2: Set Environment Variables

```bash
# Database URL (from Neon dashboard)
export DATABASE_URL="postgresql://user:pass@ep-xyz.neon.tech/neuropilot?sslmode=require"

# Frontend origin (placeholder - will update after Vercel deployment)
export FRONTEND_ORIGIN="https://temporary-placeholder.vercel.app"

# Optional: Custom admin credentials
export SEED_EMAIL="admin@yourcompany.com"
export SEED_PASS="YourSecurePassword123!"
```

#### Step 3: Deploy Backend

```bash
./scripts/stage-deploy.sh
```

**Expected Output**:
```
🗃  Running migrations on Neon...
👤 Seeding admin user (if missing)…
🔧 Setting Railway environment variables…
🚀 Deploying on Railway…
🩺 Health check… ✅ Health OK
🔑 Login smoke test… ✅ Login OK
🎉 Staging deployment complete.
   API base: https://your-app-abc123.up.railway.app
```

#### Step 4: Save Railway URL

```bash
# Get Railway URL
RAILWAY_URL=$(railway domain | head -n1 | tr -d '[:space:]')
echo "Backend URL: $RAILWAY_URL"

# Save for later
echo "$RAILWAY_URL" > /tmp/railway_url.txt
```

---

### Phase 2: Frontend Deployment (Vercel)

#### Step 1: Prepare Frontend

```bash
cd ../frontend

# Verify Vercel configuration exists
ls -la vercel.json .vercelignore
# Should show both files
```

#### Step 2: Deploy to Vercel

```bash
# Deploy (will prompt for project setup first time)
vercel --prod
```

**Prompts** (first deployment):
- "Set up and deploy?" → `Y`
- "Which scope?" → Select your account
- "Link to existing project?" → `N`
- "What's your project's name?" → `neuropilot-inventory`
- "In which directory is your code located?" → `./` (press Enter)

**Wait for deployment** (~2 minutes)

#### Step 3: Get Vercel URL

```bash
# Vercel will output URL after deployment
# Example: https://neuropilot-inventory-abc123.vercel.app

# Save it
VERCEL_URL="https://neuropilot-inventory-abc123.vercel.app"
echo "$VERCEL_URL" > /tmp/vercel_url.txt
```

#### Step 4: Set Frontend Environment Variable

```bash
# Read Railway URL (from Phase 1)
RAILWAY_URL=$(cat /tmp/railway_url.txt)

# Set in Vercel
vercel env add VITE_API_URL production
# When prompted, paste: $RAILWAY_URL

# Redeploy to pick up environment variable
vercel --prod --force
```

---

### Phase 3: Connect Backend ↔ Frontend

#### Step 1: Update Backend CORS

```bash
cd ../backend

# Read Vercel URL (from Phase 2)
VERCEL_URL=$(cat /tmp/vercel_url.txt)

# Update Railway ALLOW_ORIGIN
railway variables set ALLOW_ORIGIN="$VERCEL_URL"

# Railway will auto-restart (takes ~30 seconds)
sleep 30
```

#### Step 2: Verify Backend Health

```bash
RAILWAY_URL=$(cat /tmp/railway_url.txt)

curl -fsSL "$RAILWAY_URL/health" && echo -e "\n✅ Backend healthy"
```

---

### Phase 4: End-to-End Verification

#### Step 1: Run Backend Smoke Tests

```bash
cd backend

RAILWAY_URL=$(cat /tmp/railway_url.txt)
TEST_EMAIL="neuropilotai@gmail.com"
TEST_PASS="TestPassword123!"

RAILWAY_URL="$RAILWAY_URL" \
TEST_EMAIL="$TEST_EMAIL" \
TEST_PASS="$TEST_PASS" \
./scripts/smoke-test.sh
```

**Expected**:
```
🎉 All smoke tests passed!
Summary:
  ✅ Health check
  ✅ Login
  ✅ Auth verification
  ✅ Token refresh
```

#### Step 2: Test Frontend

```bash
VERCEL_URL=$(cat /tmp/vercel_url.txt)

# Open in browser
open "$VERCEL_URL/owner-super-console.html"
```

**Manual Checks**:
1. **Page loads** without errors
2. **Open DevTools Console** (F12)
3. **Login** with credentials:
   - Email: `neuropilotai@gmail.com`
   - Password: `TestPassword123!`
4. **Verify**:
   - ✅ No CORS errors
   - ✅ Token in localStorage (`authToken`)
   - ✅ Dashboard loads
   - ✅ API calls succeed

#### Step 3: Test Token Refresh

1. **Open DevTools** → Application → Local Storage
2. **Find `authToken`** and note expiry time
3. **Wait 30+ minutes** (or modify backend TTL to 1 min for testing)
4. **Refresh page** or make API call
5. **Verify**: New token in localStorage (different value)

---

## 📊 Deployment Summary

After successful deployment, you should have:

| Component | Platform | URL | Status |
|-----------|----------|-----|--------|
| Backend API | Railway | `https://your-app.up.railway.app` | ✅ |
| Frontend | Vercel | `https://neuropilot-inventory.vercel.app` | ✅ |
| Database | Neon Postgres | `ep-xyz.neon.tech` | ✅ |

### Environment Variables

**Railway** (Backend):
```bash
DATABASE_URL=postgresql://...
NODE_ENV=production
PORT=8080
ALLOW_ORIGIN=https://neuropilot-inventory.vercel.app
JWT_SECRET=(from .jwt_secret file)
REFRESH_TOKEN_SECRET=(from .refresh_secret file)
ACCESS_TTL_MIN=30
REFRESH_TTL_DAYS=90
```

**Vercel** (Frontend):
```bash
VITE_API_URL=https://your-app.up.railway.app
```

---

## 🔄 Quick Redeploy Commands

### Backend Only
```bash
cd backend
railway up --detached
```

### Frontend Only
```bash
cd frontend
vercel --prod --force
```

### Both (Full Stack)
```bash
# Backend
cd backend && railway up --detached && cd ..

# Frontend
cd frontend && vercel --prod --force && cd ..
```

---

## 🐛 Troubleshooting

### CORS Errors

**Symptom**: Browser console shows CORS policy errors

**Fix**:
```bash
# Check Railway ALLOW_ORIGIN
railway variables get ALLOW_ORIGIN

# Update if incorrect
railway variables set ALLOW_ORIGIN="https://your-vercel-url.vercel.app"
```

### Frontend Can't Reach Backend

**Symptom**: `Network error: Cannot reach server`

**Fix**:
```bash
# Check Vercel env var
vercel env ls

# Update VITE_API_URL
vercel env rm VITE_API_URL production
vercel env add VITE_API_URL production
# Paste correct Railway URL

# Redeploy
vercel --prod --force
```

### Login Returns 401

**Symptom**: Login fails with "Unauthorized"

**Fix**:
```bash
# Check backend logs
railway logs -f

# Verify admin user exists
railway run psql $DATABASE_URL -c "SELECT email, role FROM app_user LIMIT 5;"

# Reseed if needed
railway run bash -c "cd backend && node generate_owner_token.js"
```

### Token Refresh Fails

**Symptom**: Auto-refresh returns 403 or 401

**Fix**:
```bash
# Check refresh token secret
railway variables get REFRESH_TOKEN_SECRET

# If missing or wrong, regenerate
cd backend
./scripts/generate_production_secrets.sh
railway variables set REFRESH_TOKEN_SECRET="$(cat .refresh_secret)"
```

---

## 📋 Post-Deployment Checklist

### Immediate (0-24 hours)

- [ ] All smoke tests passing
- [ ] Frontend loads in multiple browsers (Chrome, Firefox, Safari)
- [ ] Login works
- [ ] Dashboard loads data
- [ ] Token refresh works (wait 30+ min)
- [ ] No console errors
- [ ] Backend logs show no errors: `railway logs -f`
- [ ] Health endpoint returns 200: `curl $RAILWAY_URL/health`

### Short-term (1-7 days)

- [ ] Monitor Railway resource usage
- [ ] Monitor Vercel analytics
- [ ] Check error rates in logs
- [ ] Verify backup schedule working
- [ ] Test all major features
- [ ] Collect user feedback

### Long-term (30-90 days)

- [ ] Schedule first secret rotation (90 days from deploy)
- [ ] Schedule first DR drill (quarterly)
- [ ] Review security audit
- [ ] Update dependencies
- [ ] Performance optimization

---

## 🔐 Security Checklist

Post-deployment security verification:

- [ ] Secrets not in git: `git ls-files | grep -E '\.(jwt_secret|refresh_secret|env)$'` (empty)
- [ ] HTTPS on both frontend and backend
- [ ] CORS correctly configured (exact domain match)
- [ ] Security headers present (check with browser DevTools)
- [ ] Rate limiting active (test 6 rapid logins → 429 error)
- [ ] Tokens have correct TTL (30min access, 90day refresh)
- [ ] Database has SSL enabled (`?sslmode=require`)
- [ ] No sensitive data in logs

---

## 📈 Monitoring

### Railway Metrics

```bash
# View logs
railway logs -f

# View resource usage
railway status
```

**Monitor**:
- CPU usage (< 80%)
- Memory usage (< 512MB)
- Request latency (< 200ms p95)
- Error rate (< 1%)

### Vercel Analytics

Visit: https://vercel.com/david-mikulis-projects-73b27c6d/analytics

**Monitor**:
- Page load time (< 2s)
- Core Web Vitals
- Error rate
- Geographic distribution

---

## 🎉 Success!

You've successfully deployed NeuroPilot v16.6 to production!

**Next Steps**:
1. Share URLs with team/users
2. Monitor logs for first 24 hours
3. Collect initial feedback
4. Schedule DR drill (3 months)
5. Schedule secret rotation (90 days)

**Support**:
- Backend Guide: `backend/STAGING_DEPLOYMENT_GUIDE.md`
- Frontend Guide: `frontend/VERCEL_DEPLOYMENT_GUIDE.md`
- Security Report: `backend/SECURITY_HARDENING_v16.6.md`
- Complete Summary: `backend/PRODUCTION_HARDENING_COMPLETE_v16.6.md`

---

**Deployed By**: You + Claude Code
**Deployment Date**: October 23, 2024
**Version**: 16.6.0
**Status**: 🟢 PRODUCTION READY
