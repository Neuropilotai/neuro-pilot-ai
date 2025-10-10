# Inventory Enterprise System v2.7.0
## Quick Start Guide - One Command Startup

---

## 🚀 One Command Setup & Start

### First Time Setup

Run the automated setup script that configures everything:

```bash
npm run setup
```

This will:
1. ✅ Check prerequisites (Node.js, npm, sqlite3)
2. ✅ Install dependencies
3. ✅ Create `.env` with default configuration
4. ✅ Run all database migrations (AI Ops + Generative Intelligence)
5. ✅ Verify database schema
6. ✅ Optionally run tests

### Start All Systems (Production)

**Single command to start EVERYTHING:**

```bash
npm run start:all
```

This starts:
- ✅ Express API Server (port 8083 by default, configurable via .env)
- ✅ Multi-Tenancy & RBAC
- ✅ Real-Time Intelligence (WebSocket)
- ✅ **AI Ops Agent** (predictive monitoring)
- ✅ **Governance Agent** (autonomous policy adaptation)
- ✅ **Insight Generator** (weekly executive summaries)
- ✅ **Compliance Audit** (daily security scans)

**Note**: Default port is 8083. To use a different port:
```bash
PORT=8083 npm run start:all  # Explicit port 8083
PORT=3001 npm run start:all  # Use port 3001 instead
```

### Start with Development Mode

Auto-reload on code changes:

```bash
npm run dev
```

### Start with Custom Configuration

Use `.env` file to control which features are enabled:

```bash
# Edit .env
AIOPS_ENABLED=true
GOVERNANCE_ENABLED=true
INSIGHT_ENABLED=true
COMPLIANCE_ENABLED=true

# Then start
npm start
```

---

## 📋 Available Commands

### Startup Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start server with `.env` configuration |
| `npm run dev` | Start with auto-reload (development) |
| `npm run start:all` | Start with **all features enabled** |
| `npm run setup` | Run complete setup (migrations, config) |

### Testing Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests with coverage |
| `npm run test:aiops` | Test AI Ops components (v2.6.0) |
| `npm run test:generative` | Test Generative Intelligence (v2.7.0) |
| `npm run test:integration` | Test integration endpoints |
| `npm run test:all` | Run all test suites sequentially |

### Database Commands

| Command | Description |
|---------|-------------|
| `npm run migrate:all` | Run all migrations |
| `npm run migrate:aiops` | Run AI Ops migration (v2.6.0) |
| `npm run migrate:generative` | Run Generative Intelligence migration (v2.7.0) |
| `npm run backup` | Backup database |

### Monitoring Commands

| Command | Description |
|---------|-------------|
| `npm run health` | Check system health (requires running server) |
| `npm run metrics` | View AI Ops & Governance metrics |

---

## 🔧 Configuration

### Environment Variables

Edit `.env` to customize behavior:

```bash
# === Core Server ===
PORT=8083
NODE_ENV=development

# === AI Ops (PASS L v2.6.0) ===
AIOPS_ENABLED=true                      # Enable AI Ops Agent
AIOPS_CHECK_INTERVAL_MS=60000           # Check every 60 seconds
AIOPS_AUTO_REMEDIATION=true             # Enable auto-fix
AIOPS_DRY_RUN=false                     # Set true to test without executing

# Prometheus (optional)
PROMETHEUS_URL=http://localhost:9090

# Alerting (optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
SLACK_CHANNEL=#alerts
PAGERDUTY_INTEGRATION_KEY=your-key-here

# === Generative Intelligence (PASS M v2.7.0) ===

# Governance Agent
GOVERNANCE_ENABLED=true                 # Enable autonomous policy learning
GOVERNANCE_LEARNING_INTERVAL=86400000   # Learning cycle every 24 hours
GOVERNANCE_ADAPTATION_ENABLED=true      # Allow policy adaptations
GOVERNANCE_CONFIDENCE_THRESHOLD=0.85    # Minimum confidence to apply changes

# Insight Generator
INSIGHT_ENABLED=true                    # Enable weekly reports
INSIGHT_PROVIDER=openai                 # 'openai', 'anthropic', or 'mock'
INSIGHT_MODEL=gpt-4                     # LLM model to use
INSIGHT_LANGUAGES=en,fr                 # Languages for reports
INSIGHT_REPORT_INTERVAL=604800000       # Report every 7 days

# LLM API Keys (optional - uses mock mode if not provided)
OPENAI_API_KEY=sk-...                   # OpenAI API key
ANTHROPIC_API_KEY=sk-ant-...            # Anthropic API key

# Compliance Audit
COMPLIANCE_ENABLED=true                 # Enable compliance scanning
COMPLIANCE_AUDIT_INTERVAL=86400000      # Audit every 24 hours
COMPLIANCE_FRAMEWORKS=iso27001,soc2,owasp  # Frameworks to check
COMPLIANCE_MIN_SCORE=0.95               # Minimum acceptable score
```

### Mock Mode (No API Keys Required)

The system works perfectly without any API keys:

```bash
INSIGHT_ENABLED=true
INSIGHT_PROVIDER=mock    # Uses template-based reports
# No OPENAI_API_KEY or ANTHROPIC_API_KEY needed
```

### Database Profiles

#### Profile 1: SQLite Only (Default)

No setup required - works out of the box:

```bash
DATABASE_URL=./database.db
POSTGRES_ENABLED=false
REDIS_ENABLED=false
```

#### Profile 2: PostgreSQL + Redis (Production)

For production deployments with better performance:

**Step 1**: Install PostgreSQL and Redis
```bash
# macOS
brew install postgresql@14 redis

# Start services
brew services start postgresql@14
brew services start redis
```

**Step 2**: Create PostgreSQL database
```bash
createdb inventory_enterprise
```

**Step 3**: Update `.env`
```bash
# PostgreSQL
POSTGRES_ENABLED=true
POSTGRES_URL=postgresql://localhost:5432/inventory_enterprise
POSTGRES_DUAL_WRITE=true   # Write to both SQLite and Postgres
POSTGRES_PRIMARY=false     # Read from SQLite (during migration)

# Redis
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
```

**Step 4**: Run schema migration
```bash
# Migrate data from SQLite to Postgres
npm run migrate:postgres

# Verify counts match
npm run verify:db-sync
```

**Step 5**: Switch to Postgres as primary
```bash
# Update .env
POSTGRES_PRIMARY=true      # Now read from Postgres
```

#### Rollback to SQLite

If needed, revert to SQLite:

```bash
# Update .env
POSTGRES_ENABLED=false
REDIS_ENABLED=false

# Restart
npm run start:all
```

---

## 📊 Monitoring Your System

### Health Check

```bash
# While server is running
npm run health

# Or manually
curl http://localhost:8083/health
```

**Sample Output:**
```json
{
  "status": "ok",
  "app": "inventory-enterprise-v2.7.0",
  "version": "2.7.0",
  "features": {
    "multiTenancy": true,
    "rbac": true,
    "webhooks": true,
    "realtime": true,
    "aiOps": true,
    "governance": true,
    "insights": true,
    "compliance": true
  },
  "aiOps": {
    "checksPerformed": 1234,
    "incidentsPredicted": 45,
    "remediationsTriggered": 42,
    "successRate": 95.24
  },
  "governance": {
    "totalAdaptations": 23,
    "avgConfidence": 0.89
  },
  "compliance": {
    "complianceScoreAverage": 0.98
  }
}
```

### Prometheus Metrics

```bash
# View AI Ops & Governance metrics
npm run metrics

# Or access directly
curl http://localhost:3001/metrics
```

### Grafana Dashboards

Import these dashboards:
- `grafana/aiops-dashboard.json` - AI Ops monitoring
- `grafana/generative-intelligence-dashboard.json` - Governance & Compliance

---

## 🎯 What Gets Started?

When you run `npm run start:all`, here's what happens:

```
═══════════════════════════════════════════════════════════════
🚀 Inventory Enterprise System v2.7.0
═══════════════════════════════════════════════════════════════
📡 Server running on port 3001
📝 Default admin: admin@neuro-pilot.ai / Admin123!@#
🔒 Security: Multi-Tenancy + RBAC + Webhooks ENABLED
═══════════════════════════════════════════════════════════════

🔄 Initializing Real-Time Intelligence Layer (v2.3.0)...
  ✅ WebSocket server initialized
  ✅ Feedback stream started
  ✅ Forecast worker started (hot-reload enabled)
  ✨ Real-Time Intelligence ACTIVE

🤖 Initializing AI Ops Agent (v2.6.0)...
  ✅ AI Ops Agent started
  📊 Predictive monitoring: 24h ahead
  🔧 Auto-remediation: ENABLED
  ✨ AI Ops ACTIVE

🧠 Initializing Generative Intelligence (v2.7.0)...
  ✅ Governance Agent started (24h learning cycles)
  ✅ Insight Generator started (weekly reports)
  📝 Languages: en,fr
  🤖 LLM Provider: openai
  ✅ Compliance Audit started (daily scans)
  🔐 Frameworks: iso27001,soc2,owasp
  ✨ Generative Intelligence ACTIVE

═══════════════════════════════════════════════════════════════
✅ ALL SYSTEMS OPERATIONAL
═══════════════════════════════════════════════════════════════
📊 Health check: http://localhost:3001/health
📈 Metrics: http://localhost:3001/metrics
🌐 WebSocket: ws://localhost:3001/ai/realtime
═══════════════════════════════════════════════════════════════
```

---

## 🛑 Stopping the System

Press `Ctrl+C` to gracefully shutdown all components:

```
SIGINT received, shutting down gracefully...
Stopping AI Ops Agent...
Stopping Governance Agent...
Stopping Insight Generator...
Stopping Compliance Audit...
Stopping Real-Time Intelligence...
✅ All systems stopped gracefully
```

---

## 🔍 Troubleshooting

### Issue: "Cannot find module './aiops/Agent'"

**Solution**: Run migrations first
```bash
npm run migrate:all
```

### Issue: "Database locked"

**Solution**: Stop all running instances
```bash
pkill -f "node server.js"
npm start
```

### Issue: "Port 3001 already in use"

**Solution**: Change port in `.env`
```bash
PORT=3002
npm start
```

### Issue: Insight Generator not working

**Solution**: Either add API key or use mock mode
```bash
# Option 1: Use mock mode (no API key needed)
INSIGHT_PROVIDER=mock

# Option 2: Add OpenAI key
OPENAI_API_KEY=sk-your-key-here
INSIGHT_PROVIDER=openai
```

---

## 📚 Documentation

- **AI Ops Guide**: `backend/aiops/README.md`
- **PASS L Report**: `docs/PASS_L_COMPLETION_REPORT_2025-10-07.md`
- **PASS M Report**: `docs/PASS_M_COMPLETION_REPORT_2025-10-07.md`

---

## 🚀 Production Deployment

### Docker (Recommended)

```bash
# Build image
docker build -t inventory-enterprise:2.7.0 .

# Run with all features
docker run -d \
  -p 3001:3001 \
  -e AIOPS_ENABLED=true \
  -e GOVERNANCE_ENABLED=true \
  -e INSIGHT_ENABLED=true \
  -e COMPLIANCE_ENABLED=true \
  -e OPENAI_API_KEY=your-key \
  inventory-enterprise:2.7.0
```

### PM2 (Process Manager)

```bash
# Install PM2
npm install -g pm2

# Start with all features
pm2 start server.js --name inventory-enterprise --env production

# Monitor
pm2 monit

# Logs
pm2 logs inventory-enterprise

# Restart
pm2 restart inventory-enterprise

# Stop
pm2 stop inventory-enterprise
```

### Systemd Service

Create `/etc/systemd/system/inventory-enterprise.service`:

```ini
[Unit]
Description=Inventory Enterprise System v2.7.0
After=network.target

[Service]
Type=simple
User=nodejs
WorkingDirectory=/opt/inventory-enterprise/backend
Environment="NODE_ENV=production"
Environment="AIOPS_ENABLED=true"
Environment="GOVERNANCE_ENABLED=true"
Environment="INSIGHT_ENABLED=true"
Environment="COMPLIANCE_ENABLED=true"
ExecStart=/usr/bin/node server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Start the service:
```bash
sudo systemctl enable inventory-enterprise
sudo systemctl start inventory-enterprise
sudo systemctl status inventory-enterprise
```

---

## ✅ Success Indicators

Your system is working correctly when you see:

1. **Server Health**: `curl http://localhost:3001/health` returns `"status": "ok"`
2. **AI Ops Active**: `aiOps.isRunning: true` in health check
3. **Governance Active**: `governance.isRunning: true` in health check
4. **Insights Active**: `insights.isRunning: true` in health check
5. **Compliance Active**: `compliance.isRunning: true` in health check
6. **No Errors**: Check logs for `✅` symbols and no `❌` errors

---

## 🎉 You're Ready!

The system is now running with:
- ✅ **AI-powered predictive monitoring** detecting incidents 24h ahead
- ✅ **Autonomous governance** adapting policies based on performance
- ✅ **Executive insights** generating weekly summaries in EN/FR
- ✅ **Automated compliance** scanning against ISO/SOC/OWASP standards

**Everything from one command: `npm run start:all`**

---

**Questions?** Check the [documentation](../docs/) or run `npm run health` to verify system status.

**Version**: v2.7.0
**Last Updated**: October 7, 2025
