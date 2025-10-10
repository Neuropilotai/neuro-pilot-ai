# Phase 3: Autonomous Learning & Optimization Layer - Architecture

**Version:** 3.0.0 (Autonomous AI)
**Date:** October 8, 2025
**Owner:** David Mikulis

---

## 🎯 Vision

Transform NeuroInnovate from a reactive AI-powered system to a **self-optimizing, autonomous learning platform** that continuously analyzes its own performance, proposes improvements, and applies safe optimizations without human intervention.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Owner Console (v3.0)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Learning Feed│  │ Health Gauge │  │ Gov Reports  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ API Calls
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              AI Tuner Orchestration Layer                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ routes/owner-ai-learning.js (New)                     │  │
│  │  - GET /recommendations  - GET /health-forecast       │  │
│  │  - POST /feedback        - GET /governance-report     │  │
│  │  - POST /apply-proposal  - GET /security-alerts       │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  AI Learning Services                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ AITunerSvc   │  │HealthPredict │  │ SecScanner   │      │
│  │ - Analyze    │  │ - Train Model│  │ - Detect     │      │
│  │ - Propose    │  │ - Forecast   │  │ - Alert      │      │
│  │ - Apply      │  │ - Risk Score │  │ - Recommend  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ Read/Write
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Storage Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ PostgreSQL   │  │ File System  │  │ Prometheus   │      │
│  │ - Proposals  │  │ - YAML Tuning│  │ - Metrics    │      │
│  │ - Feedback   │  │ - Reports    │  │ - History    │      │
│  │ - Schedule   │  │ - Alerts     │  │ - Forecasts  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Database Schema Extensions

### 1. AI Tuning Proposals Table
```sql
CREATE TABLE ai_tuning_proposals (
  id SERIAL PRIMARY KEY,
  proposal_id TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,  -- 'cache', 'forecast', 'schema', 'security'
  title TEXT NOT NULL,
  description TEXT,
  current_value JSONB,
  proposed_value JSONB,
  confidence_score DECIMAL(3,2),  -- 0.00 to 1.00
  expected_impact JSONB,  -- {metric: 'latency', change: '-15%', risk: 'low'}
  status TEXT DEFAULT 'pending',  -- pending, approved, applied, rejected
  applied_at TIMESTAMP,
  applied_by TEXT,
  rollback_plan JSONB,
  yaml_path TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_category (category),
  INDEX idx_created_at (created_at)
);
```

### 2. AI Feedback Table
```sql
CREATE TABLE ai_feedback (
  id SERIAL PRIMARY KEY,
  feedback_id TEXT UNIQUE NOT NULL,
  module TEXT NOT NULL,  -- 'reorder', 'anomaly', 'advisor', 'tuner'
  metric TEXT,  -- 'accuracy', 'latency', 'usefulness'
  feedback_type TEXT NOT NULL,  -- 'positive', 'negative', 'neutral'
  rating INTEGER,  -- 1-5 stars
  comment TEXT,
  user_email TEXT,
  context JSONB,  -- Additional metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_module (module),
  INDEX idx_feedback_type (feedback_type)
);
```

### 3. System Health Predictions Table
```sql
CREATE TABLE system_health_predictions (
  id SERIAL PRIMARY KEY,
  prediction_id TEXT UNIQUE NOT NULL,
  forecast_date DATE NOT NULL,
  overall_risk_score DECIMAL(3,2),  -- 0.00 to 1.00
  metrics JSONB,  -- {latency_p95: 245, cache_hit_rate: 0.68, ...}
  risk_drivers JSONB[],  -- [{driver: 'cache_degradation', weight: 0.4}]
  recommendations TEXT[],
  model_version TEXT,
  confidence DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_forecast_date (forecast_date)
);
```

### 4. Security Alerts Table
```sql
CREATE TABLE security_alerts (
  id SERIAL PRIMARY KEY,
  alert_id TEXT UNIQUE NOT NULL,
  alert_type TEXT NOT NULL,  -- 'failed_login', 'brute_force', 'anomalous_access'
  severity TEXT NOT NULL,  -- 'critical', 'high', 'medium', 'low'
  user_email TEXT,
  ip_address TEXT,
  details JSONB,
  recommended_actions TEXT[],
  status TEXT DEFAULT 'open',  -- open, investigating, resolved, false_positive
  resolved_at TIMESTAMP,
  resolved_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_severity (severity),
  INDEX idx_created_at (created_at)
);
```

### 5. Governance Reports Table
```sql
CREATE TABLE governance_reports (
  id SERIAL PRIMARY KEY,
  report_id TEXT UNIQUE NOT NULL,
  report_type TEXT NOT NULL,  -- 'weekly', 'monthly', 'quarterly'
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  summary TEXT,
  metrics_summary JSONB,
  changes_applied INTEGER,
  improvements_measured JSONB,
  file_path TEXT,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_report_type (report_type),
  INDEX idx_period_end (period_end)
);
```

---

## 🧠 AI Tuner Service Components

### 1. **AITunerService.js**
**Purpose:** Core learning engine that analyzes system performance

**Key Methods:**
```javascript
class AITunerService {
  // Daily analysis
  async analyzeDailyMetrics()

  // Generate improvement proposals
  async generateProposals(analysisResults)

  // Calculate confidence score based on historical data
  calculateConfidence(proposal)

  // Apply safe proposals automatically (confidence > 0.85, risk = low)
  async applySafeProposals()

  // Write YAML proposal files
  async writeProposalYAML(proposal)

  // Rollback a proposal
  async rollbackProposal(proposalId)
}
```

**Analysis Categories:**
1. **Cache Performance:** TTL optimization, hit rate improvements
2. **Forecast Accuracy:** Retraining frequency, model selection
3. **Schema Tuning:** Index recommendations, query optimization
4. **Security Hardening:** Rate limit adjustments, session timeouts

### 2. **HealthPredictionService.js**
**Purpose:** Predict system health degradation

**Key Methods:**
```javascript
class HealthPredictionService {
  // Train regression model on historical metrics
  async trainModel(historicalData)

  // Predict risk of degradation > 5%
  async predictHealthRisk(currentMetrics)

  // Identify risk drivers with feature importance
  identifyRiskDrivers(prediction)

  // Generate recommendations
  generateRecommendations(riskScore, drivers)
}
```

**Model:** Linear regression or simple neural network
**Features:** p95 latency, cache hit rate, forecast MAPE, uptime, error rate
**Target:** Binary classification (degradation > 5% or not)

### 3. **SecurityScannerService.js**
**Purpose:** Detect security anomalies

**Key Methods:**
```javascript
class SecurityScannerService {
  // Scan audit logs for unusual patterns
  async scanAuditLogs(lookbackHours = 24)

  // Detect brute force attempts
  detectBruteForce(loginAttempts)

  // Detect anomalous access patterns
  detectAnomalousAccess(auditLogs)

  // Generate alert JSON
  async generateSecurityAlert(alertData)

  // Recommend actions
  recommendActions(alertType, severity)
}
```

**Detection Patterns:**
- Failed login attempts > 5 in 5 minutes from same IP
- 2FA failures > 3 in 1 hour for same user
- Access from new geolocation without 2FA
- Unusual time-of-day access (outside 6am-10pm)

### 4. **GovernanceReportService.js**
**Purpose:** Generate automated governance reports

**Key Methods:**
```javascript
class GovernanceReportService {
  // Generate weekly report
  async generateWeeklyReport(startDate, endDate)

  // Fetch metrics trends
  async fetchMetricsTrends(period)

  // Summarize changes applied
  summarizeChanges(proposals)

  // Generate markdown report
  generateMarkdownReport(data)

  // Export charts (optional)
  async exportCharts(metricsData)
}
```

---

## 🔌 API Endpoints

### Learning Recommendations
```
GET /api/owner/ai/learning/recommendations?status=pending&limit=10
Response: {
  success: true,
  count: 3,
  recommendations: [
    {
      id: "tune_cache_ttl_20251008",
      category: "cache",
      title: "Increase cache TTL for inventory lists",
      description: "Current TTL of 120s causing 29% hit rate. Recommend 300s.",
      currentValue: { ttl: 120 },
      proposedValue: { ttl: 300 },
      confidence: 0.92,
      expectedImpact: {
        metric: "cache_hit_rate",
        change: "+25%",
        risk: "low",
        etaMin: 5
      },
      status: "pending"
    }
  ]
}
```

### Health Forecast
```
GET /api/owner/ai/predict/health
Response: {
  success: true,
  forecast: {
    riskScore: 0.23,  // 23% risk of degradation
    riskLevel: "low",
    drivers: [
      { driver: "cache_degradation", weight: 0.4, trend: "down" },
      { driver: "forecast_drift", weight: 0.3, trend: "up" }
    ],
    recommendations: [
      "Consider increasing cache TTL",
      "Retrain forecast models"
    ],
    confidence: 0.88,
    modelVersion: "v1.0.2",
    nextUpdate: "2025-10-09T06:00:00Z"
  }
}
```

### Feedback Submission
```
POST /api/owner/ai/feedback/submit
Body: {
  module: "reorder",
  metric: "accuracy",
  feedbackType: "positive",
  rating: 5,
  comment: "Recommendations were spot-on for October restock"
}
Response: {
  success: true,
  feedbackId: "fb_20251008_1234",
  message: "Feedback recorded for AI learning cycle"
}
```

### Apply Proposal
```
POST /api/owner/ai/learning/apply-proposal
Body: {
  proposalId: "tune_cache_ttl_20251008",
  scheduleAt: "2025-10-09T02:00:00Z"  // Optional
}
Response: {
  success: true,
  status: "scheduled",
  appliesAt: "2025-10-09T02:00:00Z",
  rollbackPlan: { ... }
}
```

### Governance Report
```
GET /api/owner/ai/governance/report?period=weekly&date=2025-10-08
Response: {
  success: true,
  report: {
    reportId: "gov_2025_week_41",
    periodStart: "2025-10-01",
    periodEnd: "2025-10-08",
    summary: "7 proposals applied, 3 improvements measured",
    metricsImprovement: {
      cacheHitRate: { before: 0.68, after: 0.82, change: "+20.6%" },
      forecastMAPE: { before: 0.14, after: 0.11, change: "-21.4%" }
    },
    filePath: "/reports/GOVERNANCE_AI_REPORT_2025-10-08.md"
  }
}
```

### Security Alerts
```
GET /api/owner/ai/security/alerts?status=open&severity=high,critical
Response: {
  success: true,
  count: 2,
  alerts: [
    {
      alertId: "sec_20251008_brute_force_001",
      alertType: "brute_force",
      severity: "high",
      userEmail: "unknown@attacker.com",
      ipAddress: "192.168.1.100",
      details: {
        attempts: 12,
        timeWindow: "5 minutes",
        lastAttempt: "2025-10-08T21:45:00Z"
      },
      recommendedActions: [
        "Block IP 192.168.1.100 for 24 hours",
        "Enable CAPTCHA after 3 failed attempts"
      ],
      status: "open"
    }
  ]
}
```

---

## 🎨 Frontend Components

### 1. OwnerWidgetLearningFeed.jsx
**Location:** `frontend/dashboard/src/components/OwnerWidgetLearningFeed.jsx`

**Features:**
- Display top 5 pending AI proposals
- Show confidence score with progress bar
- Expected impact badges (low/medium/high risk)
- Auto-approve toggle for high-confidence proposals (>0.9)
- "Apply Next Cycle" button → schedules for 2am
- Reject button with reason modal

### 2. SystemHealthForecast.jsx
**Location:** `frontend/dashboard/src/components/SystemHealthForecast.jsx`

**Features:**
- Circular gauge showing risk score (0-100%)
- Color-coded: Green (0-30%), Yellow (31-60%), Red (61-100%)
- Risk drivers list with weights
- Mini sparklines showing 7-day metric trends
- Recommendations panel
- "Refresh Forecast" button

### 3. GovernanceReportViewer.jsx
**Location:** `frontend/dashboard/src/components/GovernanceReportViewer.jsx`

**Features:**
- Dropdown to select report period (weekly/monthly/quarterly)
- Metrics improvement summary with before/after comparison
- Changes applied count
- Download report as PDF/Markdown
- Interactive charts (Chart.js)

---

## 🔐 Security & Safety

### Proposal Safety Levels
1. **Safe (Auto-Apply):**
   - Confidence > 0.85
   - Risk = low
   - Rollback plan exists
   - Examples: Cache TTL +/- 50%, retraining frequency

2. **Review Required:**
   - Confidence 0.70 - 0.85
   - Risk = medium
   - Examples: Schema changes, index additions

3. **Manual Only:**
   - Confidence < 0.70 OR Risk = high
   - Examples: Major version upgrades, config overhauls

### Rollback Mechanism
Every proposal includes:
```yaml
rollback_plan:
  steps:
    - action: "revert_config"
      file: "/config/cache.js"
      backup: "/var/ai/backups/cache_20251008_120000.js"
    - action: "restart_service"
      service: "redis"
  estimated_downtime: "0s"
  verification:
    - metric: "cache_hit_rate"
      threshold: 0.65
      operator: ">"
```

---

## 📁 File Structure

```
/inventory-enterprise/backend/
├── src/ai/learning/
│   ├── AITunerService.js          (NEW)
│   ├── HealthPredictionService.js (NEW)
│   ├── SecurityScannerService.js  (NEW)
│   ├── GovernanceReportService.js (NEW)
│   └── models/
│       └── health-predictor.json  (Trained model)
├── routes/
│   └── owner-ai-learning.js       (NEW)
├── migrations/
│   └── 006_ai_learning_tables.sql (NEW)
├── scripts/
│   ├── ai-tuner-cron.js           (NEW - Daily job)
│   └── health-forecast-cron.js    (NEW - Hourly job)
└── docs/
    ├── OWNER_AI_TUNER_GUIDE.md    (NEW)
    └── PHASE_3_ARCHITECTURE.md    (This file)

/inventory-enterprise/frontend/dashboard/src/
├── components/
│   ├── OwnerWidgetLearningFeed.jsx    (NEW)
│   ├── SystemHealthForecast.jsx       (NEW)
│   └── GovernanceReportViewer.jsx     (NEW)
└── pages/
    └── OwnerConsoleLearning.jsx       (NEW - Extended Owner Console)

/var/ai/
├── tuning_proposals/
│   ├── tune_cache_ttl_20251008.yaml
│   └── retrain_forecast_weekly.yaml
├── backups/
│   └── cache_20251008_120000.js
└── models/
    └── health_predictor_v1.0.2.pkl

/reports/
├── GOVERNANCE_AI_REPORT_2025-10-08.md
└── GOVERNANCE_AI_REPORT_2025-10-01.md

/alerts/
├── security_2025-10-08.json
└── security_2025-10-07.json
```

---

## 🔄 Cron Schedule

### AI Tuner (Daily Analysis)
```cron
0 1 * * * cd /path/to/backend && node scripts/ai-tuner-cron.js
```
**Runs:** 1:00 AM daily
**Tasks:** Analyze previous day's metrics, generate proposals

### Health Forecast (Hourly)
```cron
0 * * * * cd /path/to/backend && node scripts/health-forecast-cron.js
```
**Runs:** Top of every hour
**Tasks:** Update health prediction, store in database

### Governance Report (Weekly)
```cron
0 3 * * 1 cd /path/to/backend && node scripts/governance-report-cron.js
```
**Runs:** 3:00 AM every Monday
**Tasks:** Generate weekly governance report

### Security Scanner (Continuous)
```cron
*/15 * * * * cd /path/to/backend && node scripts/security-scanner-cron.js
```
**Runs:** Every 15 minutes
**Tasks:** Scan audit logs, generate alerts

---

## 📊 Success Metrics

### Phase 3 KPIs
1. **Autonomous Optimization Rate:** % of safe proposals auto-applied
   - Target: > 60% of safe proposals applied without human intervention

2. **Health Prediction Accuracy:** % of degradation events predicted 24h in advance
   - Target: > 85% accuracy on validation set

3. **Security Incident Response Time:** Time from detection to alert
   - Target: < 15 minutes

4. **Owner Approval Rate:** % of AI proposals approved by owner
   - Target: > 75% approval rate

5. **System Improvement Velocity:** # of optimizations applied per week
   - Target: 3-5 improvements/week

6. **Feedback Loop Quality:** Average feedback rating (1-5 stars)
   - Target: > 4.0 stars

---

## 🚀 Rollout Plan

### Week 1: Foundation
- [ ] Create database schema migrations
- [ ] Implement AITunerService core
- [ ] Create YAML proposal format
- [ ] Test proposal generation

### Week 2: Services
- [ ] Implement HealthPredictionService
- [ ] Implement SecurityScannerService
- [ ] Implement GovernanceReportService
- [ ] Train initial health prediction model

### Week 3: API & Cron
- [ ] Create owner-ai-learning.js routes
- [ ] Implement all API endpoints
- [ ] Create cron job scripts
- [ ] Test end-to-end workflows

### Week 4: Frontend
- [ ] Create OwnerWidgetLearningFeed component
- [ ] Create SystemHealthForecast component
- [ ] Create GovernanceReportViewer component
- [ ] Integrate into Owner Console

### Week 5: Testing & Validation
- [ ] Load test with 1000 proposals
- [ ] Validate health prediction accuracy
- [ ] Security scanner penetration testing
- [ ] Owner acceptance testing

### Week 6: Production Deployment
- [ ] Deploy to production
- [ ] Monitor for 7 days
- [ ] Tune confidence thresholds
- [ ] Generate first governance report

---

© 2025 NeuroInnovate · Phase 3: Autonomous Learning & Optimization Layer
