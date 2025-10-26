# Railway Backend Deployment Guide

## Overview
This guide walks you through deploying the NeuroPilot backend to Railway using Docker.

## Prerequisites
- Railway account (https://railway.app)
- PostgreSQL database (Railway provides this)
- Git repository connected to Railway

## Step 1: Environment Variables

Railway needs these environment variables configured. Go to your Railway project → Settings → Variables:

### Required Variables

```bash
# Application
NODE_ENV=production
PORT=8083

# Security - Generate JWT secrets with:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=<generate-64-char-secret>
JWT_REFRESH_SECRET=<generate-64-char-secret>
BCRYPT_ROUNDS=12
JWT_ALG=HS512

# Database - Railway provides this automatically via ${{Postgres.DATABASE_URL}}
DATABASE_URL=${{Postgres.DATABASE_URL}}

# CORS - Allow Vercel frontend
ALLOWED_ORIGINS=https://neuropilot-inventory-ngrq6b78x-david-mikulis-projects-73b27c6d.vercel.app,https://neuropilot-inventory.vercel.app

# RBAC & Governance
FORECAST_SHADOW_MODE=true
EXPORT_RATE_LIMIT_PER_MIN=5
DUAL_CONTROL_ENABLED=true

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX=5

# Logging
LOG_LEVEL=info
LOG_RETENTION_DAYS=90

# Feature Flags
ENABLE_AUDIT_LOGGING=true
ENABLE_PERFORMANCE_MONITORING=true
ENABLE_RATE_LIMITING=true
ENABLE_CORS=true
ALLOW_DEFAULT_TENANT=true

# AI Modules
AIOPS_ENABLED=true
GOVERNANCE_ENABLED=true
INSIGHT_ENABLED=true
COMPLIANCE_ENABLED=true

# Admin Bootstrap
ADMIN_EMAIL=neuropilotai@gmail.com

# Encryption - Generate with:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
DATA_ENCRYPTION_KEY=<generate-32-byte-hex>
ENCRYPTION_KEY=<generate-32-byte-hex>

# 2FA
REQUIRE_2FA_FOR_ADMINS=false
REQUIRE_2FA_FOR_OWNER=false
```

### Optional Variables

```bash
# Redis (if you add Redis service to Railway)
REDIS_URL=${{Redis.REDIS_URL}}

# Email (for notifications - optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@company.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@neuro-pilot.ai
```

## Step 2: Generate Secrets

Run these commands locally to generate secure secrets:

```bash
# JWT Secret (64 bytes)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# JWT Refresh Secret (64 bytes)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Encryption Key (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Data Encryption Key (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy each generated secret and add it to Railway variables.

## Step 3: Add PostgreSQL Database

1. In Railway project dashboard, click **"+ New"**
2. Select **"Database"** → **"PostgreSQL"**
3. Railway will automatically:
   - Create the database
   - Provide `DATABASE_URL` variable
   - Link it to your backend service

## Step 4: Deploy Backend

### Option A: Via Railway Dashboard (Recommended)

1. Go to https://railway.app/dashboard
2. Select your project or create new project
3. Click **"+ New"** → **"GitHub Repo"**
4. Connect your repository
5. Select `inventory-enterprise/backend` as root directory
6. Railway will automatically:
   - Detect `railway.json`
   - Use Dockerfile for build
   - Start deployment

### Option B: Via Railway CLI

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Login to Railway
railway login

# Link to project (first time only)
railway link

# Deploy
railway up
```

## Step 5: Verify Deployment

Once deployed, Railway will provide a public URL like:
```
https://resourceful-achievement-production.up.railway.app
```

Test the deployment:

```bash
# Health check
curl https://your-railway-app.up.railway.app/api/health

# Expected response:
# {"status":"ok","version":"17.7.0","timestamp":"..."}
```

## Step 6: Update Frontend API URL

The frontend is already configured to use:
- **API Base**: `https://resourceful-achievement-production.up.railway.app`
- **Meta Tag**: `<meta name="np-api-url" content="...">`

If your Railway URL is different, update:
1. `frontend/public/owner-super-console.html` (line 9)
2. Redeploy frontend to Vercel

## Troubleshooting

### Build Fails
- Check Railway logs: Dashboard → Service → Deployments → View Logs
- Verify Dockerfile exists in backend directory
- Ensure `railway.json` has correct builder: `"DOCKERFILE"`

### Container Starts but Crashes
- Check environment variables are set
- Verify `DATABASE_URL` is present
- Check logs for error messages

### Database Connection Issues
- Ensure PostgreSQL service is created in Railway
- Verify `DATABASE_URL` variable is linked: `${{Postgres.DATABASE_URL}}`
- Check database is in same Railway project

### CORS Errors from Frontend
- Verify `ALLOWED_ORIGINS` includes Vercel URLs
- Check Railway deployment logs for CORS messages
- Frontend URL must match exactly (https, no trailing slash)

### Health Check Fails
- Verify port 8083 is exposed in Dockerfile
- Check `/api/health` endpoint exists in server.js
- View Railway logs for startup errors

## Security Notes

✅ **What's Protected:**
- Dockerfile uses non-root user (`appuser`)
- Multi-stage build (minimal attack surface)
- `.dockerignore` prevents secrets from being copied
- Environment variables stored securely in Railway
- Railway provides automatic HTTPS

⚠️ **Important:**
- Never commit `.env` files to Git
- Rotate JWT secrets periodically
- Enable 2FA for production deployments
- Review Railway access logs regularly

## Monitoring

### View Logs
```bash
railway logs
```

Or via Railway Dashboard:
- Project → Service → Observability → Logs

### Metrics
Railway provides automatic metrics:
- CPU usage
- Memory usage
- Network traffic
- Request latency

View at: Dashboard → Service → Metrics

## Scaling

Railway Pro plans support:
- **Horizontal scaling**: Multiple instances
- **Vertical scaling**: Increase CPU/RAM
- **Custom domains**: Add your own domain
- **Private networking**: Connect services privately

Configure at: Dashboard → Service → Settings → Resources

## Next Steps

1. ✅ Deploy backend to Railway
2. ✅ Verify health endpoint returns JSON
3. ✅ Test login flow from frontend
4. ✅ Monitor logs for errors
5. 📊 Set up custom domain (optional)
6. 🔐 Enable 2FA for admin users (production)

## Support

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- NeuroPilot Issues: Check deployment logs first

---

**Generated by NeuroPilot v18.0**
