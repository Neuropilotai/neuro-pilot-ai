# Owner AI Tuner Guide - Phase 3 Autonomous Learning

**Version:** 3.0.0
**System:** NeuroInnovate Inventory Enterprise
**Owner:** David Mikulis (neuro.pilot.ai@gmail.com)

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Setup & Installation](#setup--installation)
4. [Scheduled Jobs](#scheduled-jobs)
5. [API Endpoints](#api-endpoints)
6. [Proposal Workflow](#proposal-workflow)
7. [Safety Levels](#safety-levels)
8. [Rollback Procedures](#rollback-procedures)
9. [Metrics Reference](#metrics-reference)
10. [Troubleshooting](#troubleshooting)

---

## Overview

Phase 3 introduces an **autonomous learning and optimization layer** that continuously analyzes system performance, generates improvement proposals, and applies approved changes — creating a self-optimizing system.

### Key Capabilities

- **AI Tuner Service**: Analyzes daily metrics and generates YAML tuning proposals
- **Health Prediction**: Predicts system health degradation risk in next 24h
- **Security Scanner**: Detects anomalies in audit logs (brute force, escalation, etc.)
- **Governance Reports**: Weekly markdown reports with KPIs and applied changes

### Owner-Only Access

All Phase 3 endpoints require:
- Valid JWT authentication
- Email whitelist: `neuro.pilot.ai@gmail.com` OR `neuropilotai@gmail.com`
- OR role: `admin` / `OWNER`

---

## Architecture

### Service Layer

```
/backend/src/ai/
├── learning/
│   ├── AITunerService.js          # Core learning engine
│   └── HealthPredictionService.js # Health risk prediction
├── security/
│   └── SecurityScannerService.js  # Security anomaly detection
└── governance/
    └── GovernanceReportService.js # Weekly governance reports
```

### Database Tables (5 new)

- `ai_tuning_proposals` - Tuning proposals with approval workflow
- `ai_feedback` - User feedback for AI learning cycle
- `ai_health_predictions` - Health risk predictions
- `ai_security_findings` - Security findings with remediation
- `ai_governance_reports` - Governance report metadata

### Cron Jobs

```
/backend/cron/phase3_cron.js       # Scheduler class with 6 jobs
```

### API Routes

```
/backend/routes/owner-ai-learning.js  # 7 owner-only endpoints
```

---

## Setup & Installation

### Step 1: Run Database Migrations

**For SQLite:**
```bash
sqlite3 /var/lib/neuroinnovate/inventory.db < migrations/sqlite/007_phase3_learning.sql
```

**For PostgreSQL:**
```bash
psql -U neuroinnovate -d inventory < migrations/postgres/007_phase3_learning.sql
```

### Step 2: Start Cron Scheduler

**Add to server.js:**
```javascript
const Phase3CronScheduler = require('./cron/phase3_cron');

// After database initialization
const phase3Cron = new Phase3CronScheduler(db, metricsExporter);
phase3Cron.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  phase3Cron.stop();
  // ... other cleanup
});
```

### Step 3: Mount API Routes

**Add to server.js:**
```javascript
const ownerAILearningRoutes = require('./routes/owner-ai-learning');
app.use('/api/owner/ai', ownerAILearningRoutes);
```

### Step 4: Verify Installation

```bash
# Check tables created
sqlite3 /var/lib/neuroinnovate/inventory.db "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ai_%';"

# Expected output:
# ai_tuning_proposals
# ai_feedback
# ai_health_predictions
# ai_security_findings
# ai_governance_reports
```

---

## Scheduled Jobs

### Job Schedule

| Job | Schedule | Description |
|-----|----------|-------------|
| **Health Prediction** | Hourly (0 * * * *) | Predict system health risk for next 24h |
| **Generate Proposals** | Daily 02:20 | Analyze metrics and generate tuning proposals |
| **Apply Proposals** | Daily 02:40 | Auto-apply proposals with confidence ≥ 0.85 |
| **Security Scan** | Daily 03:00 | Scan audit logs for security anomalies |
| **Governance Report** | Weekly Sun 03:00 | Generate weekly governance report |
| **Cleanup** | Every 6 hours | Remove old audit logs (90d), predictions (30d) |

### Manual Job Triggering

```javascript
// Example: Manually trigger health prediction
const phase3Cron = req.app.locals.phase3Cron;
await phase3Cron.triggerJob('health_prediction');
```

### Job Status Monitoring

```bash
# View cron job status
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8083/api/owner/ai/cron/status
```

---

## API Endpoints

### 1. GET /api/owner/ai/learning/recommendations

Get AI tuning proposals/recommendations.

**Query Params:**
- `status` (optional): Filter by status (pending, approved, applied, rejected)
- `limit` (default: 10): Max results

**Response:**
```json
{
  "success": true,
  "count": 3,
  "recommendations": [
    {
      "id": 42,
      "proposalId": "cache_ttl_20251008_a3f2b1",
      "category": "cache",
      "title": "cache.ttl",
      "description": "Increase cache TTL for better hit rate",
      "currentValue": "120",
      "proposedValue": "300",
      "expectedImpact": 20,
      "confidence": 0.92,
      "status": "pending",
      "createdAt": "2025-10-08T02:20:15Z"
    }
  ],
  "latency": 145
}
```

### 2. POST /api/owner/ai/learning/approve

Approve a tuning proposal.

**Body:**
```json
{
  "proposalId": 42
}
```

**Response:**
```json
{
  "success": true,
  "proposalId": 42,
  "status": "approved",
  "message": "Proposal approved and queued for application",
  "latency": 23
}
```

### 3. POST /api/owner/ai/feedback/submit

Submit AI feedback for learning cycle.

**Body:**
```json
{
  "module": "cache",
  "metric": "hit_rate",
  "feedbackType": "positive",
  "rating": 5,
  "comment": "Excellent improvement"
}
```

**Validation:**
- `feedbackType`: Must be `positive`, `negative`, or `neutral`
- `rating`: Must be 1-5 (optional)

**Response:**
```json
{
  "success": true,
  "feedbackId": "fb_156",
  "message": "Feedback recorded for AI learning cycle",
  "latency": 12
}
```

### 4. GET /api/owner/ai/predict/health

Get system health prediction for next 24h.

**Query Params:**
- `tenantId` (optional): Specific tenant

**Response:**
```json
{
  "success": true,
  "forecast": {
    "riskPct": 23,
    "riskLevel": "low",
    "drivers": [
      {
        "driver": "cache_degradation",
        "value": "71.0%",
        "weight": 0.15,
        "trend": "stable",
        "description": "Cache hit rate 71.0% below target 70%"
      }
    ],
    "recommendations": [
      "Increase cache TTL to improve hit rate",
      "Review cache eviction policies"
    ],
    "confidence": 0.88
  },
  "latency": 89
}
```

### 5. GET /api/owner/ai/security/findings

Get security findings.

**Query Params:**
- `severity` (optional): Filter by severity (low, medium, high, critical)
- `limit` (default: 20): Max results
- `status` (default: open): Filter by status (open, investigating, resolved, false_positive)

**Response:**
```json
{
  "success": true,
  "count": 2,
  "findings": [
    {
      "id": 15,
      "createdAt": "2025-10-08T03:15:22Z",
      "severity": "high",
      "type": "brute_force_login",
      "evidence": {
        "userEmail": "unknown@attacker.com",
        "ipAddress": "192.168.1.100",
        "attempts": 12,
        "timeWindow": "24h"
      },
      "recommendation": [
        "Block IP 192.168.1.100 for 12 hours",
        "Enable rate limiting on login endpoint"
      ],
      "status": "open"
    }
  ],
  "latency": 56
}
```

### 6. GET /api/owner/ai/governance/report/latest

Get latest governance report.

**Response:**
```json
{
  "success": true,
  "report": {
    "id": 8,
    "weekStart": "2025-10-01",
    "weekEnd": "2025-10-08",
    "path": "/var/reports/GOVERNANCE_AI_REPORT_2025-10-08.md",
    "kpis": {
      "forecastMAPE": 0.12,
      "proposals": { "total": 15, "applied": 8, "approved": 3, "rejected": 1 },
      "security": { "total": 3, "critical": 0, "high": 1 },
      "avgHealthRisk": 25,
      "feedback": { "total": 12, "avg_rating": 4.5, "positive": 10 }
    },
    "content": "# NeuroInnovate Governance & AI Report\n\n..."
  },
  "latency": 78
}
```

### 7. POST /api/owner/ai/governance/report/generate

Manually trigger governance report generation.

**Body (optional):**
```json
{
  "weekStart": "2025-10-01T00:00:00Z",
  "weekEnd": "2025-10-08T23:59:59Z"
}
```

**Response:**
```json
{
  "success": true,
  "report": {
    "reportId": 9,
    "filename": "GOVERNANCE_AI_REPORT_2025-10-08.md",
    "path": "/var/reports/GOVERNANCE_AI_REPORT_2025-10-08.md",
    "weekStart": "2025-10-01T00:00:00.000Z",
    "weekEnd": "2025-10-08T23:59:59.000Z",
    "kpis": { /* ... */ }
  },
  "message": "Governance report generated successfully",
  "latency": 1234
}
```

---

## Proposal Workflow

### 1. Generation (Daily 02:20)

AI Tuner analyzes:
- Cache hit rate vs. target (70%)
- Forecast MAPE vs. target (15%)
- Database query performance
- Security audit patterns

**Output:** YAML proposals in `/var/ai/tuning_proposals/`

```yaml
metadata:
  proposalId: tune_cache_ttl_20251008_a3f2b1
  category: cache
  confidenceScore: 0.92
  createdAt: 2025-10-08T02:20:15Z

proposal:
  title: Increase cache TTL for inventory lists
  module: cache
  key: ttl
  currentValue: { ttl: 120 }
  proposedValue: { ttl: 300 }

  rationale: |
    Cache hit rate is 65%, below target 70%. Increasing TTL to 300s
    will reduce database load and improve response times.

  expectedImpact:
    metric: cache_hit_rate
    change: +20%
    risk: low

  rollbackPlan:
    - action: restore_config
      params: { ttl: 120 }
    - action: clear_cache
```

### 2. Approval Decision

**Automatic Approval Criteria:**
- Confidence ≥ 0.85
- Risk = low
- Status: `pending` → `approved` → `applied`

**Manual Approval Required:**
- Confidence 0.70-0.84 OR Risk = medium
- Owner review via Learning Feed UI

**Owner-Only Approval:**
- Confidence < 0.70 OR Risk = high
- Requires explicit owner action

### 3. Application (Daily 02:40)

```javascript
// AITunerService.applySafeProposals()
const safeProposals = await db.all(`
  SELECT * FROM ai_tuning_proposals
  WHERE status = 'approved'
    AND confidence >= 0.85
    AND rollback_plan IS NOT NULL
`);

for (const proposal of safeProposals) {
  await applyProposal(proposal);
  await db.run(`
    UPDATE ai_tuning_proposals
    SET status = 'applied', applied_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [proposal.id]);
}
```

### 4. Validation

- Monitor metrics for 24h post-application
- If degradation detected → Auto-rollback
- Log all changes to audit trail

---

## Safety Levels

### Level 1: Auto-Apply (Confidence ≥ 0.85, Risk = Low)

**Allowed Changes:**
- Cache TTL adjustments (±50%)
- Retraining frequency changes (±1 day)
- Log level adjustments
- Index optimization hints

**Constraints:**
- Rollback plan required
- Database backup before applying
- Monitoring window: 24h

### Level 2: Manual Approval (Confidence 0.70-0.84 OR Risk = Medium)

**Allowed Changes:**
- Schema changes (non-breaking)
- Index additions/removals
- Config file modifications
- Dependency version updates (patch/minor)

**Approval Flow:**
1. AI generates proposal
2. Owner notified via Learning Feed
3. Owner reviews and approves/rejects
4. Applied during next scheduled window

### Level 3: Owner-Only (Confidence < 0.70 OR Risk = High)

**Requires Explicit Owner Action:**
- Major version upgrades
- Architecture changes
- Security policy modifications
- Data migration scripts

**Approval Flow:**
1. AI flags proposal as high-risk
2. Owner manually reviews code/plan
3. Owner tests in staging environment
4. Owner manually applies in production

---

## Rollback Procedures

### Automatic Rollback Triggers

- Metric degradation > 10% after proposal application
- Error rate spike > 2x baseline
- Health risk exceeds 80%

### Manual Rollback

```bash
# Via API
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:8083/api/owner/ai/learning/rollback \
  -d '{"proposalId": 42}'

# Via Direct Service Call
node -e "
const AITunerService = require('./src/ai/learning/AITunerService');
const db = require('./config/database');
const tuner = new AITunerService(db);
await tuner.rollbackProposal(42);
"
```

### Rollback Plan Structure

```yaml
rollbackPlan:
  - action: restore_config
    params:
      file: /etc/neuroinnovate/cache.json
      backup: /var/backups/cache_20251008_0220.json

  - action: clear_cache
    params:
      keys: inventory:*

  - action: restart_service
    params:
      service: cache
      graceful: true
```

---

## Metrics Reference

### Phase 3 Prometheus Metrics

```promql
# Tuning Proposals
phase3_tuner_proposals_total{status="pending",module="cache"} 3
phase3_tuner_proposals_total{status="applied",module="forecast"} 2

# Proposal Application Duration
phase3_tuner_apply_duration_seconds{module="cache",quantile="0.95"} 1.2

# Health Risk
phase3_health_risk_pct{tenant_id="default"} 23

# Security Findings
phase3_security_findings_total{severity="high",type="brute_force"} 1

# Governance Reports
phase3_governance_reports_total{status="success"} 4

# Owner AI Route Latency
owner_ai_route_latency_seconds{route="/learning/recommendations",quantile="0.95"} 0.145

# Cron Execution
phase3_cron_execution_total{job="health_prediction",status="success"} 48
phase3_cron_duration_seconds{job="generate_proposals",quantile="0.95"} 12.3
```

### Grafana Dashboard Queries

**Health Risk Trend:**
```promql
phase3_health_risk_pct{tenant_id="default"}
```

**Proposal Success Rate:**
```promql
sum(rate(phase3_tuner_proposals_total{status="applied"}[1h])) /
sum(rate(phase3_tuner_proposals_total[1h]))
```

**Security Findings by Severity:**
```promql
sum by (severity) (phase3_security_findings_total)
```

---

## Troubleshooting

### Issue: No proposals being generated

**Check:**
```bash
# Verify cron job is running
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8083/api/owner/ai/cron/status

# Check AI Tuner logs
grep "AITuner" /var/log/neuroinnovate/app.log

# Manually trigger proposal generation
node -e "
const AITunerService = require('./src/ai/learning/AITunerService');
const db = require('./config/database');
const tuner = new AITunerService(db);
const analysis = await tuner.analyzeDailyMetrics();
const proposals = await tuner.generateProposals(analysis);
console.log('Proposals generated:', proposals.length);
"
```

**Solution:** Ensure metrics data exists for past 7 days.

### Issue: Proposals stuck in "pending"

**Check:**
```bash
# View pending proposals
sqlite3 /var/lib/neuroinnovate/inventory.db \
  "SELECT * FROM ai_tuning_proposals WHERE status='pending' ORDER BY created_at DESC LIMIT 10;"
```

**Solution:** Check confidence scores. If < 0.85, manual approval required.

### Issue: Health prediction always shows 0% risk

**Check:**
```bash
# Verify metrics exist
sqlite3 /var/lib/neuroinnovate/inventory.db \
  "SELECT COUNT(*) FROM system_metrics WHERE created_at > datetime('now', '-24 hours');"
```

**Solution:** Ensure metrics collection is enabled and running.

### Issue: Governance report not generating

**Check:**
```bash
# Verify report directory exists
ls -la /var/reports/

# Check cron job logs
grep "governance_report" /var/log/neuroinnovate/cron.log

# Manually trigger
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:8083/api/owner/ai/governance/report/generate
```

**Solution:** Ensure `/var/reports/` directory has write permissions.

### Issue: Owner access denied

**Check:**
```bash
# Verify JWT token
echo $TOKEN | jwt decode -

# Verify email in whitelist
grep "OWNER_EMAILS" /backend/routes/owner-ai-learning.js
```

**Solution:** Ensure JWT contains correct email (`neuro.pilot.ai@gmail.com` or `neuropilotai@gmail.com`) or role (`admin`/`OWNER`).

---

## Advanced Configuration

### Environment Variables

```bash
# Proposal generation settings
AI_TUNER_CONFIDENCE_THRESHOLD=0.85    # Auto-apply threshold
AI_TUNER_MAX_PROPOSALS_PER_DAY=20     # Max proposals per cycle

# Health prediction settings
AI_HEALTH_PREDICTION_ENABLED=true
AI_HEALTH_LOOKBACK_HOURS=168          # 7 days

# Security scanner settings
AI_SECURITY_SCAN_ENABLED=true
AI_SECURITY_LOOKBACK_HOURS=24

# Governance reporting
GOVERNANCE_REPORTS_DIR=/var/reports
GOVERNANCE_REPORT_RETENTION_WEEKS=12
```

### Customizing Proposal Rules

Edit `/backend/src/ai/learning/AITunerService.js`:

```javascript
// Custom rule: Increase forecast retraining frequency if MAPE > 0.20
if (analysis.metrics.forecastMAPE > 0.20) {
  proposals.push({
    module: 'forecast',
    key: 'retrain_frequency_days',
    old_value: '7',
    new_value: '3',
    rationale: `MAPE ${(analysis.metrics.forecastMAPE * 100).toFixed(1)}% exceeds 20% threshold`,
    expected_impact_pct: -25,
    confidence: 0.88,
    risk: 'medium'
  });
}
```

---

## Support

**System Owner:** David Mikulis
**Email:** neuro.pilot.ai@gmail.com
**Documentation:** `/docs/OWNER_AI_TUNER_GUIDE.md`
**System Port:** 8083
**Version:** 3.0.0 (Phase 3)

---

© 2025 NeuroInnovate · Proprietary System · Phase 3: Autonomous Learning Layer
