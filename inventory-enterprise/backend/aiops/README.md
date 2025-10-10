# AI Ops - Predictive Incident Response
**Version:** v2.6.0-2025-10-07

---

## Overview

AI Ops (Artificial Intelligence for IT Operations) is an automated incident prediction and remediation system that monitors your infrastructure, predicts incidents 24 hours ahead, and automatically executes remediation actions to prevent downtime.

### Key Features

- **Predictive Analytics**: LSTM + Isolation Forest hybrid model predicts incidents 24h in advance
- **Automated Remediation**: Executes YAML-defined playbooks to resolve incidents automatically
- **Multi-Channel Alerting**: Slack, Email, and PagerDuty integration
- **Root Cause Analysis**: Correlates metrics to identify incident causes
- **Real-Time Monitoring**: Continuous Prometheus metrics collection
- **Self-Learning**: Improves accuracy based on feedback

### Success Criteria

- ✅ Prediction precision ≥85%
- ✅ Mean response time <60s
- ✅ False positives <10%
- ✅ Auto-remediation success >90%
- ✅ Zero manual intervention for 7 days

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    AI Ops Agent                         │
│                     (Orchestrator)                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌────────────────┐  ┌────────────────┐               │
│  │ Metrics        │  │ Anomaly        │               │
│  │ Collector      │─>│ Predictor      │               │
│  │ (Prometheus)   │  │ (LSTM+IsoForest│               │
│  └────────────────┘  └────────────────┘               │
│           │                    │                        │
│           v                    v                        │
│  ┌────────────────┐  ┌────────────────┐               │
│  │ Remediation    │  │ Alert          │               │
│  │ Engine         │  │ Manager        │               │
│  │ (Playbooks)    │  │ (Multi-Channel)│               │
│  └────────────────┘  └────────────────┘               │
│           │                    │                        │
│           v                    v                        │
├─────────────────────────────────────────────────────────┤
│                      Database Layer                     │
│      (Predictions, Remediation Logs, Statistics)        │
└─────────────────────────────────────────────────────────┘
```

---

## Installation

### Prerequisites

- Node.js 18+
- PostgreSQL or SQLite
- Redis (optional, for caching)
- Prometheus (for metrics)
- Docker or Kubernetes (for container management)

### Setup

1. **Install Dependencies**:
   ```bash
   cd backend
   npm install
   ```

2. **Run Database Migration**:
   ```bash
   sqlite3 database.db < migrations/004_ai_ops_tables.sql
   ```

3. **Configure Environment Variables**:
   ```bash
   # .env
   AIOPS_ENABLED=true
   AIOPS_CHECK_INTERVAL_MS=60000
   AIOPS_AUTO_REMEDIATION=true
   AIOPS_DRY_RUN=false

   # Alerting
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
   SLACK_CHANNEL=#alerts
   PAGERDUTY_INTEGRATION_KEY=your-key-here

   # Prometheus
   PROMETHEUS_URL=http://localhost:9090
   ```

4. **Start AI Ops Agent**:
   ```javascript
   const AIOperationsAgent = require('./aiops/Agent');

   const agent = new AIOperationsAgent({
     checkInterval: 60000, // 1 minute
     predictionWindow: 24, // 24 hours
     autoRemediationEnabled: true
   });

   await agent.start();
   ```

---

## Configuration

### Agent Configuration

```javascript
const config = {
  // Monitoring
  checkInterval: 60000,           // Check interval (ms)
  predictionWindow: 24,            // Prediction horizon (hours)

  // Prediction
  anomalyThreshold: 0.85,          // Anomaly score threshold (0-1)
  minConfidence: 0.75,             // Minimum prediction confidence

  // Remediation
  autoRemediationEnabled: true,    // Enable auto-remediation
  dryRun: false,                   // Simulate actions (testing)
  playbooksPath: './aiops/playbooks',

  // Alerting
  slack: {
    enabled: true,
    webhookUrl: process.env.SLACK_WEBHOOK_URL,
    channel: '#alerts'
  },
  email: {
    enabled: true,
    smtp: {
      host: 'smtp.gmail.com',
      port: 587,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    }
  },
  pagerduty: {
    enabled: true,
    integrationKey: process.env.PAGERDUTY_KEY
  }
};
```

### Metrics Configuration

The system monitors the following metrics from Prometheus:

| Metric | Description | Threshold |
|--------|-------------|-----------|
| `api_latency_p95_ms` | API response time (95th percentile) | >1000ms |
| `cache_hit_rate_percent` | Redis cache hit rate | <70% |
| `memory_usage_percent` | Server memory usage | >85% |
| `cpu_usage_percent` | Server CPU usage | >80% |
| `db_connection_pool_active` | Active DB connections | >90% capacity |
| `tenant_requests_per_second` | Per-tenant request rate | >1000 req/s |
| `forecast_accuracy_mape` | AI model accuracy | >15% MAPE |
| `error_rate_percent` | HTTP error rate | >5% |

---

## Playbooks

Playbooks define automated remediation actions for each incident type.

### Playbook Structure

```yaml
name: high-latency
description: Remediate high API latency

conditions:
  - field: prediction.anomalyScore
    operator: greater_than
    value: 0.85
  - field: prediction.value
    operator: greater_than
    value: 1000

actions:
  - type: invalidate-cache
    description: Clear Redis cache
    params:
      pattern: "api:*"
    critical: false

  - type: restart-service
    description: Restart API service
    params:
      service: inventory-api
      method: pm2
    critical: true

  - type: scale-container
    description: Scale up to 5 replicas
    params:
      container: inventory-api
      replicas: 5
      platform: kubernetes
    critical: false
```

### Available Actions

| Action Type | Description | Parameters |
|-------------|-------------|------------|
| `restart-service` | Restart service (systemctl, docker, k8s, pm2) | `service`, `method` |
| `scale-container` | Scale container replicas | `container`, `replicas`, `platform` |
| `invalidate-cache` | Clear Redis cache keys | `pattern`, `host`, `port` |
| `kill-process` | Kill process by name | `processName`, `signal` |
| `clear-queue` | Clear message queue | `queueName`, `type` |
| `execute-command` | Run shell command | `command`, `shell` |
| `api-call` | Make HTTP API call | `url`, `method`, `headers`, `body` |
| `database-query` | Execute SQL query | `query`, `params` |
| `send-notification` | Send alert | `message`, `channel` |

### Creating Custom Playbooks

1. Create YAML file in `aiops/playbooks/`:
   ```yaml
   name: custom-incident
   description: Handle custom incident type

   conditions:
     - field: severity
       operator: equals
       value: critical

   actions:
     - type: execute-command
       description: Custom action
       params:
         command: "echo 'Incident detected'"
   ```

2. Reload agent to load new playbook:
   ```javascript
   await agent.remediationEngine.initialize();
   ```

---

## API Usage

### Start Agent

```javascript
const agent = new AIOperationsAgent(config);
await agent.start();
```

### Stop Agent

```javascript
await agent.stop();
```

### Get Statistics

```javascript
const stats = agent.getStatistics();
console.log(stats);
// {
//   checksPerformed: 1234,
//   incidentsPredicted: 45,
//   remediationsTriggered: 42,
//   remediationsSucceeded: 40,
//   meanResponseTime: 12500,
//   successRate: 95.24,
//   isRunning: true
// }
```

### Manual Prediction

```javascript
const metrics = await agent.metricsCollector.collectMetrics();
const predictions = await agent.anomalyPredictor.predict(metrics, 24);

for (const prediction of predictions) {
  console.log(`${prediction.metricName}: ${prediction.anomalyScore}`);
}
```

### Mark Predictions

```javascript
// Mark as false positive (for learning)
await agent.markFalsePositive(predictionId);

// Mark as true positive (incident occurred)
await agent.markTruePositive(predictionId);
```

---

## Monitoring

### Grafana Dashboard

Import `grafana/aiops-dashboard.json` into Grafana for comprehensive monitoring:

- AI Ops Agent Status
- Incidents Predicted (24h)
- Remediation Success Rate
- Mean Response Time
- Predicted Incidents Timeline
- Remediation Actions (Success vs Failure)
- Incident Type Distribution
- Prediction Accuracy
- Response Time Distribution
- Recent Predictions Table

### Prometheus Metrics

The agent exposes the following Prometheus metrics:

```
aiops_agent_status                  # 1=running, 0=stopped
aiops_incidents_predicted_total     # Total incidents predicted
aiops_remediations_triggered_total  # Total remediations triggered
aiops_remediations_succeeded_total  # Successful remediations
aiops_remediations_failed_total     # Failed remediations
aiops_mean_response_time_ms         # Mean response time
aiops_true_positives_total          # Confirmed predictions
aiops_false_positives_total         # False predictions
aiops_checks_performed_total        # Total checks performed
```

---

## Database Schema

### Tables

- **ai_anomaly_predictions**: Stores all incident predictions
- **ai_remediation_log**: Logs all remediation actions
- **ai_ops_statistics**: Periodic performance statistics
- **ai_model_metrics**: ML model training and performance
- **ai_ops_config**: Runtime configuration

### Views

- **v_recent_predictions**: Recent predictions with remediation results
- **v_aiops_performance**: Aggregated performance metrics

---

## Troubleshooting

### Agent Won't Start

```bash
# Check logs
tail -f logs/aiops-agent.log

# Verify Prometheus connection
curl http://localhost:9090/api/v1/query?query=up

# Check database
sqlite3 database.db "SELECT COUNT(*) FROM ai_anomaly_predictions;"
```

### Predictions Not Accurate

1. **Insufficient training data**:
   - Ensure at least 7 days of historical metrics
   - Check: `SELECT COUNT(*) FROM ai_model_metrics;`

2. **Adjust thresholds**:
   ```javascript
   agent.config.anomalyThreshold = 0.90; // Increase for fewer false positives
   agent.config.minConfidence = 0.80;    // Increase for higher confidence
   ```

3. **Mark false positives**:
   ```javascript
   await agent.markFalsePositive(predictionId);
   ```

### Remediation Failing

1. **Check playbook syntax**:
   ```bash
   yamllint aiops/playbooks/high-latency.yml
   ```

2. **Enable dry run mode**:
   ```javascript
   agent.config.dryRun = true;
   ```

3. **Check remediation logs**:
   ```sql
   SELECT * FROM ai_remediation_log
   WHERE success = 0
   ORDER BY executed_at DESC
   LIMIT 10;
   ```

### Alerts Not Sending

1. **Test alert channels**:
   ```javascript
   await agent.alertManager.testAlerts();
   ```

2. **Check configuration**:
   ```javascript
   console.log(agent.alertManager.config);
   ```

3. **Verify webhook URLs**:
   ```bash
   curl -X POST $SLACK_WEBHOOK_URL \
     -H 'Content-Type: application/json' \
     -d '{"text":"Test message"}'
   ```

---

## Best Practices

### Training

- **Initial training**: Collect at least 7 days of metrics before enabling auto-remediation
- **Continuous learning**: Mark predictions (true/false positives) to improve accuracy
- **Regular retraining**: Retrain models weekly with updated data

### Remediation

- **Start with dry run**: Test playbooks in dry-run mode before enabling
- **Progressive rollout**: Enable auto-remediation for low-severity incidents first
- **Timeout management**: Set appropriate timeouts for remediation actions
- **Rollback plans**: Define rollback actions in playbooks for critical operations

### Alerting

- **Alert fatigue**: Use rate limiting to prevent alert spam
- **Severity routing**: Route critical alerts to PagerDuty, medium to Slack
- **On-call rotation**: Integrate with on-call schedule
- **Escalation**: Auto-escalate if remediation fails

### Monitoring

- **Dashboard review**: Check AI Ops dashboard daily
- **Performance tracking**: Monitor prediction accuracy and remediation success rate
- **False positive analysis**: Investigate recurring false positives
- **Capacity planning**: Use predictions for proactive capacity planning

---

## Development

### Running Tests

```bash
# Unit tests
npm test -- test/aiops.test.js

# Integration tests
npm run test:integration

# Coverage report
npm run test:coverage
```

### Adding New Models

1. Create model in `aiops/models/`:
   ```javascript
   class CustomPredictor {
     async train(data) { /* ... */ }
     async predict(metrics) { /* ... */ }
   }
   module.exports = CustomPredictor;
   ```

2. Integrate into AnomalyPredictor:
   ```javascript
   const CustomPredictor = require('./models/CustomPredictor');
   this.customModel = new CustomPredictor();
   ```

### Contributing

- Follow existing code style (ESLint)
- Add tests for new features
- Update documentation
- Run integration tests before submitting PR

---

## Support

- **Documentation**: `/backend/aiops/README.md`
- **Issues**: GitHub Issues
- **Slack**: `#ai-ops` channel

---

## License

Proprietary - NeuroInnovate © 2025

---

**Version:** v2.6.0-2025-10-07
**Last Updated:** October 7, 2025
