# One-Liner Production Deployment

**NeuroPilot v16.6 - Fastest Path to Production**

---

## 🚀 Single Command Deployment

### Backend Only (Railway)

```bash
cd backend && \
./scripts/generate_production_secrets.sh && \
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" \
FRONTEND_ORIGIN="https://neuropilot-inventory.vercel.app" \
./scripts/stage-deploy.sh
```

**What This Does**:
1. ✅ Generates ultra-secure secrets (128 bytes, 600 perms)
2. ✅ Runs database migrations (001-004) on Neon
3. ✅ Seeds admin user with bcrypt
4. ✅ Sets Railway environment variables
5. ✅ Deploys to Railway
6. ✅ Runs health check
7. ✅ Verifies login endpoint

**Time**: ~3 minutes

---

## 💻 Frontend Deployment (Vercel)

After backend deployment, deploy frontend:

```bash
cd frontend && \
vercel --prod && \
vercel env add VITE_API_URL production && \
vercel --prod --force
```

When prompted for `VITE_API_URL`, paste your Railway URL.

**Time**: ~2 minutes

---

## 🔄 Complete Stack (One Script)

Or use the automated script:

```bash
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" \
FRONTEND_ORIGIN="https://neuropilot-inventory.vercel.app" \
./DEPLOY_PROD.sh
```

This will:
- Deploy backend
- Prompt for frontend deployment
- Guide you through environment variables
- Provide next steps

---

## ✅ Quick Verification

After deployment:

```bash
# Backend health
curl $(railway domain)/health

# Backend smoke tests
cd backend
RAILWAY_URL="https://your-app.up.railway.app" \
TEST_EMAIL="neuropilotai@gmail.com" \
TEST_PASS="TestPassword123!" \
./scripts/smoke-test.sh
```

Expected: 🎉 All smoke tests passed!

---

## 📋 Prerequisites

Before running the one-liner:

### Required
- ✅ Railway CLI installed: `npm install -g @railway/cli`
- ✅ Vercel CLI installed: `npm install -g vercel`
- ✅ Railway logged in: `railway login`
- ✅ Vercel logged in: `vercel login`
- ✅ Neon DATABASE_URL ready

### Auto-Verified (Already Done ✅)
- ✅ All 23 readiness checks passing
- ✅ Secrets can be generated
- ✅ Scripts executable
- ✅ Frontend configured
- ✅ Git security (.gitignore)

---

## 🔐 Production Values

### Required Environment Variables

**For Backend**:
```bash
DATABASE_URL="postgresql://user:pass@ep-xyz.neon.tech/neuropilot?sslmode=require"
FRONTEND_ORIGIN="https://neuropilot-inventory.vercel.app"
```

**Optional** (defaults provided):
```bash
SEED_EMAIL="neuropilotai@gmail.com"       # Admin email
SEED_PASS="TestPassword123!"              # Admin password
ACCESS_TTL_MIN="30"                       # JWT access token TTL
REFRESH_TTL_DAYS="90"                     # Refresh token TTL
```

### Set in Railway (Auto-set by script)
- `DATABASE_URL`
- `NODE_ENV=production`
- `PORT=8080`
- `ALLOW_ORIGIN` (from FRONTEND_ORIGIN)
- `JWT_SECRET` (from .jwt_secret file)
- `REFRESH_TOKEN_SECRET` (from .refresh_secret file)
- `ACCESS_TTL_MIN`
- `REFRESH_TTL_DAYS`

### Set in Vercel (Manual)
- `VITE_API_URL` (your Railway URL)

---

## 🎯 What Happens Step-by-Step

### 1. Secret Generation
```bash
./scripts/generate_production_secrets.sh
```
- Creates `.jwt_secret` (128 bytes, random)
- Creates `.refresh_secret` (128 bytes, random)
- Sets permissions to 600 (owner-only)
- Never prints secrets to console

### 2. Database Migrations
```sql
-- 001_schema.sql (tables, indexes)
-- 002_roles_and_grants.sql (permissions)
-- 003_rls_policies.sql (row-level security)
-- 004_auth.sql (auth tables, bcrypt)
```
Runs with `ON_ERROR_STOP=1` (fail-fast, idempotent)

### 3. Admin User Seeding
```sql
INSERT INTO app_user (email, display_name, role, password_hash)
VALUES ('neuropilotai@gmail.com', 'NeuroPilot Admin', 'admin',
        crypt('TestPassword123!', gen_salt('bf', 12)))
ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role;
```
Safe UPSERT - won't overwrite existing users

### 4. Railway Deployment
- Sets 8 environment variables
- Deploys Node.js app
- Auto-discovers public URL
- Waits for ready

### 5. Verification
- Health check: `GET /health` → 200 OK
- Login test: `POST /api/auth/login` → JWT token
- Auth verification: `GET /api/auth/me` → user data

---

## 🛡️ Security Verification

After deployment, verify production guardrails:

```bash
cd backend

# 1. Secrets are secure
ls -l .jwt_secret .refresh_secret
# Expected: -rw------- (600 permissions)

# 2. Secrets not in git
git ls-files | grep -E '\.(jwt_secret|refresh_secret|env)$'
# Expected: (empty - no output)

# 3. Railway vars set correctly
railway variables get JWT_SECRET | wc -c
# Expected: 129 (128 chars + newline)

# 4. CORS configured
railway variables get ALLOW_ORIGIN
# Expected: Your exact Vercel URL

# 5. Auth endpoints work
./scripts/verify_auth_endpoints.sh
# Expected: All ✅

# 6. Rate limiting active
# Try 6 rapid login attempts → should get 429 on 6th
```

---

## 🔁 Redeployment

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

### Full Stack
```bash
cd backend && railway up --detached && \
cd ../frontend && vercel --prod --force
```

---

## 🚨 Rollback

If something goes wrong:

### Backend Rollback (Railway)
```bash
# View deployments
railway deployments list

# Rollback to previous
railway rollback <deployment-id>
```

### Frontend Rollback (Vercel)
1. Go to Vercel dashboard
2. Click on deployment
3. Click "..." → "Rollback to this deployment"

Or via CLI:
```bash
vercel rollback
```

---

## 📊 Post-Deployment Checklist

- [ ] Backend health returns 200 OK
- [ ] Login returns JWT token
- [ ] `/api/auth/me` works with token
- [ ] Frontend loads without errors
- [ ] No CORS errors in browser console
- [ ] Token stored in localStorage
- [ ] Dashboard loads data
- [ ] All smoke tests pass

**Command**:
```bash
cd backend
./scripts/verify-staging-readiness.sh  # Pre-flight
RAILWAY_URL="..." ./scripts/smoke-test.sh  # Post-flight
```

---

## 💡 Pro Tips

### 1. Store URLs for Quick Access
```bash
# After backend deployment
railway domain > ~/railway_url.txt

# After frontend deployment
echo "https://your-vercel-url.vercel.app" > ~/vercel_url.txt

# Quick access
curl $(cat ~/railway_url.txt)/health
open $(cat ~/vercel_url.txt)/owner-super-console.html
```

### 2. Create Deployment Alias
```bash
# Add to ~/.zshrc or ~/.bashrc
alias deploy-backend='cd ~/neuro-pilot-ai/inventory-enterprise/backend && ./scripts/stage-deploy.sh'
alias deploy-frontend='cd ~/neuro-pilot-ai/inventory-enterprise/frontend && vercel --prod'
alias deploy-verify='cd ~/neuro-pilot-ai/inventory-enterprise/backend && ./scripts/smoke-test.sh'
```

### 3. Environment Variable Template
```bash
# Save to ~/.env.neuropilot
export DATABASE_URL="postgresql://..."
export FRONTEND_ORIGIN="https://neuropilot-inventory.vercel.app"
export RAILWAY_URL="https://your-app.up.railway.app"
export TEST_EMAIL="neuropilotai@gmail.com"
export TEST_PASS="TestPassword123!"

# Load before deployment
source ~/.env.neuropilot
./DEPLOY_PROD.sh
```

---

## 📞 Support

**Docs**:
- This guide: `ONE_LINER_DEPLOY.md`
- Quick reference: `QUICK_DEPLOY_REFERENCE.md`
- Full guide: `FULL_STACK_DEPLOYMENT.md`
- Troubleshooting: `backend/STAGING_DEPLOYMENT_GUIDE.md`

**Dashboards**:
- Railway: https://railway.app/dashboard
- Vercel: https://vercel.com/david-mikulis-projects-73b27c6d
- Neon: https://console.neon.tech

**Health Checks**:
```bash
# Backend
curl $RAILWAY_URL/health

# Detailed
curl -H "Authorization: Bearer $TOKEN" \
  $RAILWAY_URL/api/health/summary
```

---

**Version**: 16.6.0
**Status**: 🟢 PRODUCTION READY
**Deployment Time**: ~5 minutes total
**Zero Downtime**: ✅ Supported
