# Railway Deployment Guide - Inventory Enterprise V21.1

## Strategy: Nixpacks Auto-Detection (No Dockerfile)

**Decision:** We use Railway's Nixpacks auto-detection instead of a custom Dockerfile.

**Why:**
- Nixpacks automatically installs Node 20.x and npm
- Handles dependency caching correctly without manual cache mount configuration
- Simpler, more maintainable, and Railway-native approach
- Avoids `npm: command not found` errors from incomplete base images

## Prerequisites

1. **Railway Project**: https://railway.com/project/6eb48b9a-8fe0-4836-8247-f6cef566f299
2. **Service ID**: `8153394f-c7df-44a8-9691-d0f53da3d43d`
3. **Neon Database**: Active and resumed (not suspended)
4. **Railway Root Directory**: Set to `inventory-enterprise/backend`

## Required Environment Variables

Configure these in Railway Dashboard → Variables:

```bash
DATABASE_URL=postgresql://neondb_owner:npg_***@ep-long-feather-adwltebn-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require
NODE_ENV=production
JWT_SECRET=Gc895DCKNIPowuujk+/dQCUK+fcO1bOZ4IocryEzmGQ=
BASE=https://inventory-backend-7-agent-build.up.railway.app
PCI_ENFORCE=true
SCHEDULER_ENABLED=true
```

## How It Works

1. **Detection**: Railway detects `package.json` in `inventory-enterprise/backend/`
2. **Build**:
   - Nixpacks installs Node 20.x (specified in `engines` field)
   - Runs `npm ci --omit=dev --no-audit --no-fund`
   - Copies application files (respects `.dockerignore`)
3. **Start**: Runs `npm start` → `node server-v21_1.js`
4. **Healthcheck**: Railway pings `/api/health/status` every 5 seconds (100s timeout)
5. **Port**: Server binds to `0.0.0.0` on `$PORT` (Railway injects this, defaults to 8080)

## Key Files

```
backend/
├── package.json          # Has "start": "node server-v21_1.js" + "engines": {"node": ">=20"}
├── server-v21_1.js       # Binds to 0.0.0.0:$PORT, has health endpoints
├── .dockerignore         # Excludes .git, node_modules, tests, secrets
└── db.js                 # PostgreSQL connection pool
```

## Server Configuration

**Binding**: Server correctly binds to `0.0.0.0` and reads `process.env.PORT`:

```javascript
// server-v21_1.js:23
const PORT = process.env.PORT || 8080;

// server-v21_1.js:416
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Port: ${PORT}`);
});
```

## Health Endpoints

V21.1 supports TWO health endpoints for backward compatibility:

### 1. `/health` (New V21.1 endpoint - Railway uses this)
```bash
curl -fsS https://inventory-backend-7-agent-build.up.railway.app/health | jq .
```

**Expected response:**
```json
{
  "status": "healthy",
  "version": "21.1.0",
  "database": {
    "connected": true,
    "type": "postgresql"
  },
  "timestamp": "2025-11-10T11:15:00.000Z"
}
```

### 2. `/api/health/status` (Backward compatibility with v20)
```bash
curl -fsS https://inventory-backend-7-agent-build.up.railway.app/api/health/status | jq .
```

**Expected response:**
```json
{
  "success": true,
  "data": {
    "service": "inventory-backend-staging",
    "status": "operational",
    "version": "21.1.0",
    "timestamp": "2025-11-10T11:15:00.000Z",
    "environment": "production",
    "database": {
      "connected": true,
      "type": "postgresql"
    },
    "features": {
      "auth": true,
      "caching": false,
      "metrics": true,
      "rate_limiting": true,
      "cron_jobs": true
    }
  }
}
```

## Metrics Endpoint

```bash
curl -fsS https://inventory-backend-7-agent-build.up.railway.app/metrics
```

**Expected output:** Prometheus-format metrics
```
# HELP http_request_duration_ms Duration of HTTP requests in milliseconds
# TYPE http_request_duration_ms histogram
http_request_duration_ms_bucket{le="10",method="GET",route="/health",code="200"} 5
http_request_duration_ms_bucket{le="50",method="GET",route="/health",code="200"} 10
...

# HELP tenant_requests_total Total requests by tenant
# TYPE tenant_requests_total counter
tenant_requests_total{org="default",site="default",route="/health",method="GET",code="200"} 42
```

## Security Status Endpoint

```bash
curl -fsS https://inventory-backend-7-agent-build.up.railway.app/api/security/status | jq .
```

**Expected response:**
```json
{
  "success": true,
  "data": {
    "pci_compliance": {
      "enabled": true,
      "status": "compliant"
    },
    "data_retention": {
      "enabled": true,
      "policy": "90_days"
    },
    "encryption": {
      "at_rest": true,
      "in_transit": true
    },
    "rbac": {
      "enabled": true,
      "roles": ["owner", "admin", "manager", "staff"]
    }
  }
}
```

## Deployment Commands

### Push to Deploy
```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise

# Commit changes
git add backend/package.json backend/RAILWAY_DEPLOYMENT.md
git commit -m "fix: reliable Railway build for v21.1 (Nixpacks auto-detection)"
git push origin main
```

Railway will automatically:
1. Detect the push to `main` branch
2. Build using Nixpacks (no Dockerfile needed)
3. Run healthcheck on `/api/health/status`
4. Swap traffic to new deployment if healthy

### Monitor Deployment
```bash
# Watch logs live
cd backend
railway logs --follow

# Or check specific deployment logs
railway logs --deployment <deployment-id>
```

### Verify Deployment Success
```bash
# Check version (should return "21.1.0")
curl -fsS https://inventory-backend-7-agent-build.up.railway.app/api/health/status | jq -r '.data.version'

# Full health check
curl -fsS https://inventory-backend-7-agent-build.up.railway.app/health | jq .

# Check metrics are being collected
curl -fsS https://inventory-backend-7-agent-build.up.railway.app/metrics | grep -E "_total|_count"

# Test security endpoint
curl -fsS https://inventory-backend-7-agent-build.up.railway.app/api/security/status | jq .
```

## Troubleshooting

### Build Fails with "npm: command not found"
- **Cause**: Custom Dockerfile using wrong base image
- **Fix**: Delete `backend/Dockerfile` to use Nixpacks

### Healthcheck Fails - "Service Unavailable"
- **Cause**: Missing `DATABASE_URL` or database is suspended
- **Fix**:
  1. Check Neon database is active (not suspended)
  2. Verify `DATABASE_URL` in Railway variables
  3. Test connection: `psql $DATABASE_URL -c "SELECT 1"`

### Wrong Version Deployed
- **Cause**: Railway kept old deployment due to failed healthcheck
- **Fix**: Check logs for startup errors, verify all env vars are set

### Port Binding Issues
- **Cause**: Server not binding to `0.0.0.0` or not reading `$PORT`
- **Status**: ✅ Already fixed in `server-v21_1.js:416`

## Production Checklist

Before deploying to production:

- [x] `DATABASE_URL` configured in Railway
- [x] `JWT_SECRET` set (32+ characters)
- [x] `NODE_ENV=production`
- [x] Neon database active (not suspended)
- [x] Server binds to `0.0.0.0:$PORT`
- [x] Health endpoints return 200
- [x] `.dockerignore` excludes secrets
- [x] `engines` field specifies Node >=20
- [ ] Test `/health` endpoint returns version 21.1.0
- [ ] Test `/metrics` endpoint returns Prometheus data
- [ ] Test `/api/security/status` shows PCI compliance enabled

## Expected Timeline

1. **Push to main**: Instant
2. **Railway detects push**: ~5-10 seconds
3. **Nixpacks build**: ~2-3 minutes
4. **Healthcheck validation**: ~30-60 seconds
5. **Traffic swap**: ~5-10 seconds

**Total**: ~3-5 minutes from push to live

## Support

- **Railway Dashboard**: https://railway.com/project/6eb48b9a-8fe0-4836-8247-f6cef566f299/service/8153394f-c7df-44a8-9691-d0f53da3d43d
- **Deployment Logs**: Use `railway logs --follow` from `backend/` directory
- **Neon Dashboard**: https://console.neon.tech/

---

**Deployment Strategy**: Nixpacks Auto-Detection (No Dockerfile)
**Last Updated**: 2025-11-10
**Version**: V21.1
**Status**: Production-Ready ✅
