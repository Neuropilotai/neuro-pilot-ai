# 🚀 ONE COMMAND STARTUP - Port 8083

## Quick Start (10 Steps)

```bash
# Navigate to backend
cd ~/neuro-pilot-ai/inventory-enterprise/backend

# 1. Install dependencies
npm ci

# 2. Setup environment
npm run setup

# 3. Run migrations
npm run migrate:all

# 4. Seed roles & admin
npm run seed:roles

# 5. Start all systems on port 8083
PORT=8083 npm run start:all

# 6. Verify (in another terminal)
npm run validate:go-live

# 7. Check health
curl http://localhost:8083/health

# 8. View metrics
curl http://localhost:8083/metrics | grep -E '^(governance|insight|compliance|aiops)_'

# 9. Start dashboard (in another terminal)
cd ../frontend/dashboard
npm ci
cp .env.local.example .env.local
npm run dev

# 10. Open browser
open http://localhost:3000
```

## 🎯 What Gets Started

When you run `PORT=8083 npm run start:all`:

✅ Express API Server (port 8083)
✅ Multi-Tenancy & RBAC
✅ Real-Time Intelligence (WebSocket)
✅ AI Ops Agent (predictive monitoring)
✅ Governance Agent (autonomous learning)
✅ Insight Generator (executive summaries)
✅ Compliance Audit (security scanning)

## 🔍 Verify It Works

```bash
# Health check (should return {"status":"ok"...})
curl http://localhost:8083/health

# Metrics (should show Prometheus metrics)
curl http://localhost:8083/metrics

# WebSocket (should connect)
wscat -c ws://localhost:8083/ai/realtime

# Dashboard (should load)
open http://localhost:3000
```

## 🔧 Troubleshooting

### Port 8083 already in use
```bash
# Find process using port 8083
lsof -i :8083

# Kill it
kill -9 <PID>

# Or use different port
PORT=8084 npm run start:all
```

### CORS errors
```bash
# Verify CORS_ORIGIN in .env
grep CORS_ORIGIN .env

# Should include: http://localhost:3000,http://localhost:8083
```

### Migrations fail
```bash
# Clean and re-run
rm database.db
npm run migrate:all
npm run seed:roles
```

### Redis/Postgres not available
```bash
# Disable in .env
REDIS_ENABLED=false
POSTGRES_ENABLED=false
```

### Metrics empty
```bash
# Wait 60 seconds for first collection cycle
sleep 60
curl http://localhost:8083/metrics
```

## 📚 Next Steps

- Login: http://localhost:3000
- Email: admin@neuro-pilot.ai
- Password: Admin123!@#

- Check AI Ops dashboard
- View governance metrics
- Review compliance status

## 🛑 Stop Everything

```bash
# Press Ctrl+C in server terminal
# Press Ctrl+C in dashboard terminal
```

---

**Port**: 8083
**Version**: v2.7.0
**Status**: Production Ready
