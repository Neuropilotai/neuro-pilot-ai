# Railway Environment Variables Setup

## Critical Issue: Database Path Fixed

The latest deployment includes a fix for Railway's ephemeral filesystem.
**Database location:** `/tmp/enterprise_inventory.db` (automatically configured)

---

## Minimum Required Environment Variables

Railway should set these automatically, but verify they exist:

### Auto-Set by Railway ✅
- `NODE_ENV` → `production` (Railway sets this)
- `PORT` → Dynamic port (Railway injects this)
- `RAILWAY_ENVIRONMENT` → `production` (Railway sets this)

### Required for Backend Service

**None!** The server has sensible defaults for development/testing.

### Optional But Recommended

```bash
# JWT Authentication (if not set, uses default - CHANGE IN PRODUCTION!)
JWT_SECRET=your-generated-secret-here

# CORS Origins (if not set, uses localhost)
ALLOWED_ORIGINS=https://your-frontend-domain.com

# For AI features (optional)
OPENAI_API_KEY=sk-your-key-here
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

---

## How to Set Environment Variables in Railway

1. Go to https://railway.app/dashboard
2. Select your **NeuroInnovate Enterprise** project
3. Click **backend** service
4. Click **Variables** tab
5. Click **+ New Variable**
6. Add variables listed above

---

## Current Deployment Status

### What's Been Fixed (6 Commits)

| Fix | Status |
|-----|--------|
| ✅ Healthcheck path `/api/health/status` | Working |
| ✅ Database initialization script | Working |
| ✅ Fresh database detection | Working |
| ✅ package.json start script | Working |
| ✅ Railway database path `/tmp` | Working |
| ✅ railway.json configuration | Working |

### What Should Happen Now

```bash
# Railway deployment sequence:
1. Build: npm install (60s)
2. Init: node scripts/init-database.js
   - Creates /tmp/enterprise_inventory.db
   - Runs 27 migrations
   - Creates 114 tables
3. Start: node server.js
   - Connects to database
   - Starts on $PORT (0.0.0.0)
   - Passes healthcheck
```

---

## Debugging: If Still Crashing

### Step 1: Check Railway Logs

In Railway dashboard → backend service → Deployments → Click latest → View logs

**Look for:**
- ✅ "Database initialization complete!"
- ✅ "Server running on port..."
- ❌ Any error messages

### Step 2: Check Environment Variables

Ensure these Railway variables exist:
- `NODE_ENV=production`
- `PORT` (should be auto-set)

### Step 3: Persistent Data (Optional)

Current setup uses `/tmp` (ephemeral - data lost on restart).

**For production persistence:**
1. Railway dashboard → backend service → Data → Create Volume
2. Mount path: `/data`
3. Set environment variable: `RAILWAY_VOLUME_MOUNT_PATH=/data`
4. Redeploy

---

## Testing After Deployment

Once deployed successfully:

```bash
# Test health endpoint
curl https://your-railway-domain.railway.app/api/health/status

# Expected response:
{
  "success": true,
  "data": {
    "service": "health-api",
    "status": "operational",
    "version": "2.0.0"
  }
}
```

---

## Next Steps

1. **Monitor** the latest deployment in Railway dashboard
2. **Check** deployment logs for "Database initialization complete!"
3. **Test** health endpoint after ~2-3 minutes
4. **Set up** persistent volume (optional, for production)

If still failing, share the Railway deployment logs and I can help debug further!
