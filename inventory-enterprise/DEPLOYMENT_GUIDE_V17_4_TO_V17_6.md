# 🚀 NeuroPilot Deployment Guide - v17.4 to v17.6

**Complete Production Deployment & Validation Manual**

**Estimated Time**: 90 minutes (30 min per version)
**Prerequisites**: GitHub account, Railway/Vercel access, API keys
**Outcome**: Fully operational NeuroPilot with autonomous capabilities

---

## 📋 Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [v17.4 - Sentient Cloud Deployment](#v174---sentient-cloud-deployment)
3. [v17.5 - Engineering Mode Deployment](#v175---engineering-mode-deployment)
4. [v17.6 - Lunar Genesis Deployment](#v176---lunar-genesis-deployment)
5. [Validation & Testing](#validation--testing)
6. [Monitoring & Alerts](#monitoring--alerts)
7. [Troubleshooting](#troubleshooting)
8. [Rollback Procedures](#rollback-procedures)

---

## Pre-Deployment Checklist

### Required Accounts & Services

- [ ] GitHub account with Actions enabled
- [ ] Railway account (backend hosting)
- [ ] Vercel account (frontend hosting)
- [ ] Grafana Cloud (free tier)
- [ ] Prometheus endpoint
- [ ] Slack workspace (optional notifications)
- [ ] Notion account (optional reporting)

### Required API Keys

```bash
# Create .env file with these keys
GRAFANA_URL=https://your-org.grafana.net
GRAFANA_API_KEY=glsa_your_key_here
PROMETHEUS_URL=https://prometheus-prod-us-central-0.grafana.net
RAILWAY_API_TOKEN=your_railway_token
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/XXX
NOTION_API_KEY=secret_your_notion_key
SENTRY_DSN=https://your_sentry_dsn@sentry.io/project
```

### Local Environment Setup

```bash
# 1. Clone repository
git clone https://github.com/your-org/neuro-pilot-ai.git
cd neuro-pilot-ai/inventory-enterprise

# 2. Install Python dependencies
cd sentient_core
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# 3. Install Node dependencies
cd ../backend
npm install

cd ../frontend
npm install

# 4. Copy environment template
cp .env.example .env
# Edit .env with your API keys
```

---

## v17.4 - Sentient Cloud Deployment

**Duration**: 30 minutes
**Goal**: Operational predictive infrastructure with autonomous remediation

### Step 1: Deploy Backend to Railway

```bash
cd backend

# 1. Initialize Railway project
railway init

# 2. Link to project
railway link

# 3. Set environment variables
railway variables set DATABASE_URL="$DATABASE_URL"
railway variables set GRAFANA_URL="$GRAFANA_URL"
railway variables set GRAFANA_API_KEY="$GRAFANA_API_KEY"
railway variables set PROMETHEUS_URL="$PROMETHEUS_URL"
railway variables set SLACK_WEBHOOK_URL="$SLACK_WEBHOOK_URL"

# 4. Deploy
railway up

# 5. Get deployment URL
railway domain
# Note the URL: https://your-app.railway.app
```

### Step 2: Deploy Frontend to Vercel

```bash
cd ../frontend

# 1. Install Vercel CLI
npm install -g vercel

# 2. Deploy
vercel

# Follow prompts:
# - Project name: neuropilot-frontend
# - Framework: None (vanilla HTML/JS)
# - Build command: (leave empty)
# - Output directory: public

# 3. Set environment variable
vercel env add API_URL
# Enter: https://your-app.railway.app

# 4. Redeploy with env
vercel --prod

# Note the URL: https://neuropilot-frontend.vercel.app
```

### Step 3: Configure GitHub Actions

```bash
cd ..

# Add GitHub Secrets (Settings > Secrets > Actions)
gh secret set PROMETHEUS_URL --body "$PROMETHEUS_URL"
gh secret set GRAFANA_URL --body "$GRAFANA_URL"
gh secret set GRAFANA_API_KEY --body "$GRAFANA_API_KEY"
gh secret set SLACK_WEBHOOK_URL --body "$SLACK_WEBHOOK_URL"
gh secret set RAILWAY_API_TOKEN --body "$RAILWAY_API_TOKEN"
gh secret set SENTRY_DSN --body "$SENTRY_DSN"
```

### Step 4: Enable Sentient Cycle

```bash
# The workflow is already in .github/workflows/sentient-cycle.yml

# Enable workflows
gh workflow enable sentient-cycle.yml

# Trigger first run
gh workflow run sentient-cycle.yml

# Monitor
gh run watch
```

### Step 5: Validate v17.4 Deployment

```bash
# Test health endpoint
curl https://your-app.railway.app/health

# Expected response:
# {"status":"healthy","uptime":99.99,"timestamp":"..."}

# Test forecast endpoint
curl -X POST https://your-app.railway.app/api/forecast \
  -H "Content-Type: application/json" \
  -d '{"metric":"cpu_usage","horizon_hours":12}'

# Check workflow logs
gh run list --workflow=sentient-cycle.yml

# View latest cycle summary
cat logs/sentient/cycle_summary_latest.json | jq .
```

**✅ v17.4 Validation Checklist**:

- [ ] Backend health endpoint returns 200
- [ ] Frontend loads correctly
- [ ] Sentient cycle workflow runs successfully
- [ ] Forecast predictions generated
- [ ] Compliance audit completes
- [ ] Logs written to `logs/sentient/`

---

## v17.5 - Engineering Mode Deployment

**Duration**: 30 minutes
**Goal**: Autonomous code improvement and version evolution

### Step 1: Install Engineering Dependencies

```bash
cd sentient_core

# Install code analysis tools
pip install radon pycodestyle bandit pytest

# Verify engineering components
python3 << 'EOF'
from engineering.version_manager import VersionManager
from engineering.architect_agent import ArchitectAgent
from engineering.validator_agent import ValidatorAgent
from engineering.compliance_agent import ComplianceAgent
print("✅ All v17.5 components loaded")
EOF
```

### Step 2: Enable Engineering Cycle

```bash
# Workflow already exists at .github/workflows/engineering-cycle.yml

# Enable workflow
gh workflow enable engineering-cycle.yml

# Trigger first engineering cycle
gh workflow run engineering-cycle.yml

# Monitor
gh run watch
```

### Step 3: Test Local Engineering Cycle

```bash
cd ..

# Run engineering cycle locally (dry-run)
python3 sentient_core/master_controller.py --engineering --no-pr

# Expected output:
# 🏗️  ENGINEERING MODE: Autonomous Evolution Cycle
# 📊 System Telemetry: ...
# 🎨 Designing upgrade from 17.5.0
# ✅ Upgrade plan designed: X changes, risk=low
# 🧪 Validating upgrade (dry-run)...
# ✅ Validation PASSED
```

### Step 4: Validate v17.5 Deployment

```bash
# Check that engineering cycle ran
gh run list --workflow=engineering-cycle.yml

# View latest engineering report
gh run view --log | grep "Engineering cycle complete"

# Check for auto-generated PRs
gh pr list --label "auto-engineered"

# Test online learning
python3 << 'EOF'
import sys
sys.path.insert(0, 'sentient_core')
from predictive.forecast_engine import ForecastEngine
import pandas as pd

engine = ForecastEngine()
recent_metrics = pd.DataFrame({
    'cpu_usage': [75, 76, 74, 78, 77],
    'memory_usage': [70, 71, 69, 73, 72]
})

results = engine.trigger_online_learning(recent_metrics)
print(f"✅ Online learning: {sum(results.values())}/{len(results)} successful")
EOF
```

**✅ v17.5 Validation Checklist**:

- [ ] Engineering cycle workflow runs successfully
- [ ] Architect Agent detects improvement opportunities
- [ ] Validator Agent tests pass
- [ ] Compliance Agent validates zero-trust
- [ ] Online learning updates forecast models
- [ ] No PRs created (unless improvements needed)

---

## v17.6 - Lunar Genesis Deployment

**Duration**: 30 minutes
**Goal**: Autonomous agent creation with safety enforcement

### Step 1: Verify Genesis Components

```bash
cd sentient_core

# Test all Genesis modules
python3 << 'EOF'
from genesis.genesis_engine import GenesisEngine
from genesis.evolution_controller import EvolutionController
from genesis.memory_core import MemoryCore
from genesis.guardian_agent import GuardianAgent

print("✅ Genesis Engine loaded")
print("✅ Evolution Controller loaded")
print("✅ Memory Core loaded")
print("✅ Guardian Agent loaded")
EOF
```

### Step 2: Initialize Memory Core

```bash
# Create memory directory
mkdir -p memory/snapshots memory/ledger

# Initialize memory store
python3 << 'EOF'
from genesis.memory_core import MemoryCore

memory = MemoryCore()
print(f"✅ Memory Core initialized at {memory.memory_dir}")
EOF
```

### Step 3: Enable Genesis Cycle

```bash
# Workflow exists at .github/workflows/genesis-cycle.yml

# Enable workflow
gh workflow enable genesis-cycle.yml

# Trigger first Genesis cycle
gh workflow run genesis-cycle.yml

# Monitor
gh run watch
```

### Step 4: Test Local Genesis Cycle

```bash
cd ..

# Run Genesis cycle locally
python3 sentient_core/master_controller.py --genesis

# Expected output:
# 🌌 GENESIS MODE: Autonomous Agent Creation
# 🛡️  Running Guardian pre-check...
# ✅ Guardian approved: healthy
# 🌌 Running Genesis Engine...
# 🔍 Analyzing system needs...
# ✓ Detected X opportunities
# ✅ Genesis cycle complete
```

### Step 5: Validate v17.6 Deployment

```bash
# Check Genesis cycle ran
gh run list --workflow=genesis-cycle.yml

# View Guardian report
cat sentient_core/guardian_pre_report.json | jq .

# Check memory store
cat sentient_core/memory/memstore_v17_6.json | jq '.experiments | length'

# List generated agents
ls -la sentient_core/genesis/generated_agents/

# Check for Genesis PRs
gh pr list --label "genesis-mode"

# Test Guardian validation
python3 << 'EOF'
from genesis.guardian_agent import GuardianAgent
from genesis.memory_core import MemoryCore

guardian = GuardianAgent(memory_core=MemoryCore())
report = guardian.verify_all_integrity()

print(f"✅ Guardian Report:")
print(f"   Health: {report.system_health}")
print(f"   Violations: {len(report.violations)}")
print(f"   Safe to Proceed: {report.safe_to_proceed}")
EOF
```

**✅ v17.6 Validation Checklist**:

- [ ] Genesis cycle workflow runs successfully
- [ ] Guardian pre-check passes
- [ ] Memory Core stores experiments
- [ ] Evolution Controller optimizes configs
- [ ] Snapshots created in `memory/snapshots/`
- [ ] Audit ledger written to `memory/ledger/`
- [ ] No agents created (unless opportunities detected)

---

## Validation & Testing

### Automated Validation Suite

```bash
# Run complete validation
./scripts/validate_deployment.sh

# This script will:
# 1. Test all health endpoints
# 2. Verify workflow success
# 3. Check memory integrity
# 4. Validate Guardian status
# 5. Generate validation report
```

### Manual Validation Tests

#### Test 1: Forecast Accuracy

```bash
python3 << 'EOF'
from sentient_core.predictive.forecast_engine import ForecastEngine
from sentient_core.master_controller import Metrics
from datetime import datetime

engine = ForecastEngine()
metrics = Metrics(
    timestamp=datetime.utcnow().isoformat(),
    cpu_usage=75.0,
    memory_usage=70.0,
    p95_latency=250.0,
    p99_latency=300.0,
    error_rate=1.5,
    request_rate=150.0,
    database_query_time=80.0,
    active_instances=2,
    current_cost=35.0
)

predictions = engine.predict_incidents(metrics, forecast_hours=12)
print(f"✅ Generated {len(predictions)} predictions")
for pred in predictions[:3]:
    print(f"   - {pred.incident_type}: {pred.probability:.1%} in {pred.time_to_event_hours:.1f}h")
EOF
```

#### Test 2: Remediation Safety

```bash
python3 << 'EOF'
from sentient_core.agents.remediator import Remediator

remediator = Remediator()

# Test dry-run
result = remediator.remediate(
    action_type='restart',
    reason='memory_leak_detected',
    dry_run=True
)

print(f"✅ Dry-run: {result.success}")
print(f"   Verification: {result.verification_passed}")
EOF
```

#### Test 3: Compliance Audit

```bash
python3 << 'EOF'
from sentient_core.scripts.self_audit import ComplianceScanner

scanner = ComplianceScanner()
report = scanner.run_full_audit()

print(f"✅ Compliance Score: {report['overall_score']}/100")
print(f"   Critical Findings: {report['critical_findings']}")
EOF
```

---

## Monitoring & Alerts

### Grafana Dashboard Setup

```bash
# Import NeuroPilot dashboard
curl -X POST "$GRAFANA_URL/api/dashboards/db" \
  -H "Authorization: Bearer $GRAFANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d @grafana/neuropilot_dashboard.json
```

### Slack Notifications

Already configured via `SLACK_WEBHOOK_URL`. Notifications sent for:
- Sentient cycle completion
- Engineering upgrades
- Genesis agent creation
- Guardian violations
- Critical errors

### Health Monitoring

```bash
# Set up uptime monitoring
# Add to cron (every 5 minutes)
*/5 * * * * curl -s https://your-app.railway.app/health || echo "ALERT: NeuroPilot down"
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| **Workflows not running** | Check: Actions enabled, secrets set, cron syntax |
| **Forecast accuracy low** | Wait 48h for data, check Prometheus connectivity |
| **Guardian blocks cycle** | Review violations: `cat guardian_pre_report.json` |
| **Memory Core errors** | Check permissions: `chmod 755 sentient_core/memory` |
| **API errors** | Verify env vars: `railway variables` |

### Debug Commands

```bash
# Check workflow status
gh run list --limit 10

# View detailed logs
gh run view <run_id> --log

# Test database connection
railway run node -e "require('./backend/database').query('SELECT 1')"

# Check Python environment
cd sentient_core && python3 -c "import sys; print(sys.path)"

# Validate all imports
python3 -c "
from predictive.forecast_engine import ForecastEngine
from agents.remediator import Remediator
from genesis.genesis_engine import GenesisEngine
print('✅ All modules load successfully')
"
```

### Log Locations

```
logs/
├── sentient/
│   ├── sentient.log
│   └── cycle_summary_latest.json
├── remediation/
│   └── remediation_YYYYMMDD.log
└── audit/
    └── audit_YYYYMMDD.md

sentient_core/
├── memory/
│   ├── memstore_v17_6.json
│   ├── snapshots/
│   └── ledger/
└── genesis/
    └── generated_agents/
```

---

## Rollback Procedures

### Emergency Rollback

```bash
# 1. Stop all workflows
gh workflow disable sentient-cycle.yml
gh workflow disable engineering-cycle.yml
gh workflow disable genesis-cycle.yml

# 2. Restore last stable snapshot
python3 << 'EOF'
from genesis.memory_core import MemoryCore
from genesis.guardian_agent import GuardianAgent

memory = MemoryCore()
guardian = GuardianAgent(memory_core=memory)

success = guardian.rollback_to_last_stable()
print(f"Rollback: {'✅ Success' if success else '❌ Failed'}")
EOF

# 3. Redeploy backend
cd backend
git revert HEAD
railway up

# 4. Re-enable workflows
gh workflow enable sentient-cycle.yml
```

### Version-Specific Rollback

```bash
# Rollback to v17.5 (disable Genesis)
gh workflow disable genesis-cycle.yml

# Rollback to v17.4 (disable Engineering + Genesis)
gh workflow disable engineering-cycle.yml
gh workflow disable genesis-cycle.yml

# Keep only Sentient cycle running
```

---

## Success Metrics

### v17.4 Success Criteria (7 days)

- ✅ Uptime ≥ 99.9%
- ✅ Forecast accuracy ≥ 85%
- ✅ 5-10 predictions generated
- ✅ Compliance score ≥ 90/100
- ✅ 0 critical errors

### v17.5 Success Criteria (14 days)

- ✅ 1-2 engineering cycles completed
- ✅ Code quality score ≥ 85/100
- ✅ Online learning active
- ✅ Forecast accuracy +2-3%
- ✅ 0 failed validations

### v17.6 Success Criteria (30 days)

- ✅ Genesis cycles run every 6h
- ✅ 0-2 agents created (as needed)
- ✅ Guardian violations = 0
- ✅ Memory experiments ≥ 20
- ✅ Evolution generations ≥ 10
- ✅ Forecast accuracy ≥ 90%

---

## Next Steps

After successful deployment and validation:

1. **Collect 30 days of telemetry**
2. **Run validation automation workflow**
3. **Generate validation report**
4. **Review metrics and identify improvements**
5. **Use data to inform v17.7 Blueprint**

---

**Deployment Guide v17.4-v17.6 Complete** ✅

**Estimated Total Time**: 90 minutes
**Maintenance**: <1 minute/week
**Human Oversight**: Monitoring dashboards + occasional PR reviews

🚀 **Your NeuroPilot is now autonomous and self-improving!**
