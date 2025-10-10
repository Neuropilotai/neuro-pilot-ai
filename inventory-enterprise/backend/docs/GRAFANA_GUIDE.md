# 📊 Grafana Setup Guide / Guide de Configuration Grafana
## Inventory Enterprise v2.1 - Monitoring & Dashboards

**Version:** 2.1.0
**Last Updated:** January 2025
**Audience:** DevOps Engineers, System Administrators

---

## Table of Contents / Table des Matières

1. [Quick Start](#1-quick-start)
2. [Prerequisites](#2-prerequisites)
3. [Installation](#3-installation)
4. [Prometheus Setup](#4-prometheus-setup)
5. [Grafana Configuration](#5-grafana-configuration)
6. [Dashboard Import](#6-dashboard-import)
7. [Alert Configuration](#7-alert-configuration)
8. [Dashboard Usage](#8-dashboard-usage)
9. [Troubleshooting](#9-troubleshooting)
10. [Advanced Configuration](#10-advanced-configuration)

---

## 1. Quick Start

**5-Minute Setup:**

```bash
# 1. Start Prometheus
docker run -d -p 9090:9090 \
  -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml \
  --name prometheus prom/prometheus

# 2. Start Grafana
docker run -d -p 3000:3000 \
  --name grafana grafana/grafana

# 3. Access Grafana
open http://localhost:3000
# Default credentials: admin / admin

# 4. Add Prometheus data source (see Section 5.2)

# 5. Import dashboards (see Section 6)
```

**Expected Result:**
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000
- Metrics endpoint: http://localhost:8083/metrics

---

## 2. Prerequisites

### 2.1 Required Software

- **Docker**: v20.10+ (or install Prometheus/Grafana natively)
- **Inventory Enterprise v2.1**: Running with metrics exporter enabled
- **Node.js**: v18+ (already installed for the app)

### 2.2 System Requirements

**Minimum:**
- CPU: 2 cores
- RAM: 2GB
- Disk: 10GB (for metrics storage)

**Recommended:**
- CPU: 4 cores
- RAM: 4GB
- Disk: 50GB (30-day retention)

### 2.3 Network Requirements

- **Firewall**: Open ports 9090 (Prometheus), 3000 (Grafana), 8083 (App metrics)
- **DNS**: Optional - Configure DNS for `grafana.example.com`

---

## 3. Installation

### 3.1 Docker Compose (Recommended)

Create `docker-compose.monitoring.yml`:

```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:v2.45.0
    container_name: prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - ./grafana/alerts.yml:/etc/prometheus/alerts.yml
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
      - '--web.enable-lifecycle'
    restart: unless-stopped
    networks:
      - monitoring

  grafana:
    image: grafana/grafana:10.0.0
    container_name: grafana
    ports:
      - "3000:3000"
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards
      - ./grafana/datasources:/etc/grafana/provisioning/datasources
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_SERVER_ROOT_URL=http://localhost:3000
      - GF_INSTALL_PLUGINS=redis-datasource
    restart: unless-stopped
    networks:
      - monitoring
    depends_on:
      - prometheus

  alertmanager:
    image: prom/alertmanager:v0.26.0
    container_name: alertmanager
    ports:
      - "9093:9093"
    volumes:
      - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml
      - alertmanager-data:/alertmanager
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
      - '--storage.path=/alertmanager'
    restart: unless-stopped
    networks:
      - monitoring

volumes:
  prometheus-data:
  grafana-data:
  alertmanager-data:

networks:
  monitoring:
    driver: bridge
```

**Start the stack:**

```bash
# Set Grafana admin password
export GRAFANA_ADMIN_PASSWORD="$(openssl rand -base64 20)"
echo "Grafana Admin Password: $GRAFANA_ADMIN_PASSWORD"

# Start services
docker-compose -f docker-compose.monitoring.yml up -d

# Check status
docker-compose -f docker-compose.monitoring.yml ps
```

### 3.2 Native Installation (Linux)

**Prometheus:**

```bash
# Download and install Prometheus
wget https://github.com/prometheus/prometheus/releases/download/v2.45.0/prometheus-2.45.0.linux-amd64.tar.gz
tar xvfz prometheus-*.tar.gz
cd prometheus-*

# Create systemd service
sudo tee /etc/systemd/system/prometheus.service > /dev/null <<EOF
[Unit]
Description=Prometheus
After=network.target

[Service]
Type=simple
User=prometheus
ExecStart=/usr/local/bin/prometheus \\
  --config.file=/etc/prometheus/prometheus.yml \\
  --storage.tsdb.path=/var/lib/prometheus \\
  --storage.tsdb.retention.time=30d
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

# Start service
sudo systemctl daemon-reload
sudo systemctl enable prometheus
sudo systemctl start prometheus
```

**Grafana:**

```bash
# Add Grafana APT repository
sudo apt-get install -y software-properties-common
sudo add-apt-repository "deb https://packages.grafana.com/oss/deb stable main"
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -

# Install Grafana
sudo apt-get update
sudo apt-get install grafana

# Start service
sudo systemctl daemon-reload
sudo systemctl enable grafana-server
sudo systemctl start grafana-server
```

### 3.3 macOS Installation

```bash
# Install via Homebrew
brew install prometheus grafana

# Start services
brew services start prometheus
brew services start grafana
```

---

## 4. Prometheus Setup

### 4.1 Configuration File

Create `prometheus.yml`:

```yaml
global:
  scrape_interval: 15s  # Scrape metrics every 15 seconds
  evaluation_interval: 15s  # Evaluate rules every 15 seconds
  external_labels:
    cluster: 'inventory-enterprise'
    environment: 'production'

# Alerting configuration
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['localhost:9093']

# Load alert rules
rule_files:
  - 'alerts.yml'

# Scrape configurations
scrape_configs:
  # Inventory Enterprise application
  - job_name: 'inventory-enterprise'
    static_configs:
      - targets: ['localhost:8083']
        labels:
          service: 'inventory-api'
    metrics_path: '/metrics'
    scrape_interval: 10s
    scrape_timeout: 5s

  # Prometheus self-monitoring
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Redis (if redis_exporter is installed)
  - job_name: 'redis'
    static_configs:
      - targets: ['localhost:9121']

  # PostgreSQL (if postgres_exporter is installed)
  - job_name: 'postgres'
    static_configs:
      - targets: ['localhost:9187']

  # Node Exporter (system metrics)
  - job_name: 'node'
    static_configs:
      - targets: ['localhost:9100']
```

### 4.2 Verify Prometheus Configuration

```bash
# Check configuration syntax
promtool check config prometheus.yml

# Expected output:
# Checking prometheus.yml
#  SUCCESS: 0 rule files found

# Reload Prometheus configuration (without restart)
curl -X POST http://localhost:9090/-/reload

# Verify targets are up
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job, health}'
```

### 4.3 Test Metrics Endpoint

```bash
# Check if application is exposing metrics
curl http://localhost:8083/metrics

# Expected output (sample):
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
# http_requests_total{method="GET",route="/api/inventory/items",status_code="200"} 1523

# HELP cache_hits_total Total number of cache hits
# TYPE cache_hits_total counter
# cache_hits_total{cache_key_prefix="inventory:"} 3482

# HELP ai_model_accuracy_mape AI model accuracy (MAPE)
# TYPE ai_model_accuracy_mape gauge
# ai_model_accuracy_mape{entity_id="ITEM_001",model_type="prophet"} 12.5
```

### 4.4 Prometheus Web UI

Access Prometheus at http://localhost:9090

**Test Queries:**

```promql
# API request rate
rate(http_requests_total[5m])

# Cache hit rate
sum(rate(cache_hits_total[5m])) / (sum(rate(cache_hits_total[5m])) + sum(rate(cache_misses_total[5m])))

# p95 API latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Active AI models
sum(ai_models_active_total)
```

---

## 5. Grafana Configuration

### 5.1 Initial Setup

1. **Access Grafana**: http://localhost:3000
2. **Login**: Default credentials are `admin` / `admin`
3. **Change Password**: You'll be prompted to change the default password
4. **Skip**: You can skip the "Add Data Source" step for now

### 5.2 Add Prometheus Data Source

**Via Web UI:**

1. Click **☰ Menu** → **Connections** → **Data Sources**
2. Click **Add data source**
3. Select **Prometheus**
4. Configure:
   - **Name**: Prometheus
   - **URL**: http://localhost:9090 (or http://prometheus:9090 if using Docker)
   - **Access**: Server (default)
   - **Scrape interval**: 15s
5. Click **Save & Test**
6. Expected: ✅ "Data source is working"

**Via Configuration File (Provisioning):**

Create `grafana/datasources/prometheus.yml`:

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
    jsonData:
      timeInterval: 15s
      queryTimeout: 60s
      httpMethod: POST
```

### 5.3 Configure Users & Permissions

```bash
# Create read-only user
curl -X POST http://admin:admin@localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dashboard Viewer",
    "email": "viewer@example.com",
    "login": "viewer",
    "password": "viewer-password",
    "role": "Viewer"
  }'

# Create editor user
curl -X POST http://admin:admin@localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dashboard Editor",
    "email": "editor@example.com",
    "login": "editor",
    "password": "editor-password",
    "role": "Editor"
  }'
```

**User Roles:**
- **Viewer**: Can view dashboards only (read-only)
- **Editor**: Can edit dashboards and create new ones
- **Admin**: Full administrative access

---

## 6. Dashboard Import

### 6.1 Import via Web UI

**Method 1: JSON Upload**

1. Click **☰ Menu** → **Dashboards** → **Import**
2. Click **Upload JSON file**
3. Select dashboard file:
   - `grafana/Inventory-Overview.json`
   - `grafana/Database-Ops.json`
   - `grafana/AI-Models.json`
4. Select **Prometheus** as data source
5. Click **Import**

**Method 2: Paste JSON**

1. Click **☰ Menu** → **Dashboards** → **Import**
2. Copy the contents of a dashboard JSON file
3. Paste into the **Import via panel json** textarea
4. Click **Load**
5. Select **Prometheus** as data source
6. Click **Import**

### 6.2 Import via Provisioning (Automated)

Create `grafana/dashboards/dashboards.yml`:

```yaml
apiVersion: 1

providers:
  - name: 'Inventory Enterprise'
    orgId: 1
    folder: 'Inventory Enterprise v2.1'
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    allowUiUpdates: true
    options:
      path: /etc/grafana/provisioning/dashboards
```

**Directory Structure:**

```
grafana/
├── dashboards/
│   ├── dashboards.yml
│   ├── Inventory-Overview.json
│   ├── Database-Ops.json
│   └── AI-Models.json
└── datasources/
    └── prometheus.yml
```

**Mount in docker-compose:**

```yaml
volumes:
  - ./grafana/dashboards:/etc/grafana/provisioning/dashboards
  - ./grafana/datasources:/etc/grafana/provisioning/datasources
```

**Restart Grafana:**

```bash
docker-compose -f docker-compose.monitoring.yml restart grafana

# Or for native installation
sudo systemctl restart grafana-server
```

### 6.3 Verify Dashboard Import

```bash
# List all dashboards via API
curl -s http://admin:admin@localhost:3000/api/search?type=dash-db | jq '.[] | {title, uid}'

# Expected output:
# {
#   "title": "Inventory Enterprise - Overview",
#   "uid": "inventory-overview"
# }
# {
#   "title": "Inventory Enterprise - Database Operations",
#   "uid": "database-ops"
# }
# {
#   "title": "Inventory Enterprise - AI Models & Forecasting",
#   "uid": "ai-models"
# }
```

---

## 7. Alert Configuration

### 7.1 AlertManager Setup

Create `alertmanager.yml`:

```yaml
global:
  resolve_timeout: 5m
  smtp_smarthost: 'smtp.gmail.com:587'
  smtp_from: 'alerts@example.com'
  smtp_auth_username: 'alerts@example.com'
  smtp_auth_password: '${SMTP_PASSWORD}'

# Alert routing
route:
  receiver: 'default-receiver'
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  routes:
    - match:
        severity: critical
      receiver: 'critical-receiver'
      continue: true
    - match:
        component: security
      receiver: 'security-team'
      continue: true

# Receiver configurations
receivers:
  - name: 'default-receiver'
    webhook_configs:
      - url: 'http://localhost:9093/webhook'

  - name: 'critical-receiver'
    email_configs:
      - to: 'oncall@example.com'
        headers:
          Subject: 'CRITICAL: {{ .GroupLabels.alertname }}'
    slack_configs:
      - api_url: '${SLACK_WEBHOOK_URL}'
        channel: '#critical-alerts'
        title: 'CRITICAL: {{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

  - name: 'security-team'
    email_configs:
      - to: 'security@example.com'
        headers:
          Subject: 'Security Alert: {{ .GroupLabels.alertname }}'
    pagerduty_configs:
      - service_key: '${PAGERDUTY_SERVICE_KEY}'

# Inhibition rules (suppress alerts)
inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'cluster', 'service']
```

### 7.2 Configure Alert Rules

The alert rules are already defined in `grafana/alerts.yml` (created in previous step).

**Reload Prometheus to load alert rules:**

```bash
# Check alert rules syntax
promtool check rules grafana/alerts.yml

# Reload Prometheus
curl -X POST http://localhost:9090/-/reload

# Verify alert rules loaded
curl http://localhost:9090/api/v1/rules | jq '.data.groups[] | {name, rules: .rules | length}'
```

### 7.3 Test Alerts

**Simulate high API latency:**

```bash
# Generate slow requests
for i in {1..100}; do
  curl -X GET http://localhost:8083/api/inventory/items?delay=300ms &
done

# Wait 5 minutes, then check if alert fired
curl http://localhost:9090/api/v1/alerts | jq '.data.alerts[] | select(.labels.alertname == "HighAPILatency")'
```

**View active alerts in Grafana:**

1. Click **☰ Menu** → **Alerting** → **Alert Rules**
2. You should see **HighAPILatency** in **Firing** state

### 7.4 Slack Integration

**Create Slack Webhook:**

1. Go to https://api.slack.com/apps
2. Click **Create New App** → **From scratch**
3. Name: "Inventory Alerts", Workspace: Your workspace
4. Click **Incoming Webhooks** → Toggle **On**
5. Click **Add New Webhook to Workspace**
6. Select channel: #critical-alerts
7. Copy webhook URL: `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX`

**Add to alertmanager.yml:**

```yaml
receivers:
  - name: 'critical-receiver'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX'
        channel: '#critical-alerts'
        title: 'CRITICAL: {{ .GroupLabels.alertname }}'
        text: |
          {{ range .Alerts }}
          *Alert:* {{ .Annotations.summary }}
          *Description:* {{ .Annotations.description }}
          *Severity:* {{ .Labels.severity }}
          *Component:* {{ .Labels.component }}
          {{ end }}
        send_resolved: true
```

**Reload AlertManager:**

```bash
docker-compose -f docker-compose.monitoring.yml restart alertmanager
```

---

## 8. Dashboard Usage

### 8.1 Inventory Overview Dashboard

**Purpose:** High-level business metrics and system health

**Key Panels:**
1. **API Throughput**: Requests per second by endpoint
2. **API Latency (p95)**: Response time at 95th percentile
3. **Cache Hit Rate**: Percentage of cache hits vs misses
4. **AI Model Accuracy**: MAPE (Mean Absolute Percentage Error)
5. **Inventory Items & Value**: Total items and monetary value
6. **Reorder Recommendations**: Items below par level
7. **System Health Status**: Component health indicators

**How to Use:**

```bash
# Access dashboard
open http://localhost:3000/d/inventory-overview

# Adjust time range
Click the time range picker (top-right) and select:
- Last 6 hours (default)
- Last 24 hours
- Last 7 days
- Custom range

# Filter by endpoint
Click on a legend item to toggle that series on/off

# Zoom into time period
Click and drag on the graph to zoom in

# View alert details
Red line on graph indicates alert threshold
Click alert icon to see alert details
```

**Alert Thresholds:**
- API Latency > 200ms → Warning
- Cache Hit Rate < 60% → Warning
- Reorder Recommendations > 25 → Warning

### 8.2 Database Operations Dashboard

**Purpose:** Monitor database performance (SQLite vs PostgreSQL)

**Key Panels:**
1. **Query Latency (p95)**: Comparison of SQLite vs PostgreSQL
2. **Query Rate by Operation**: SELECT, INSERT, UPDATE, DELETE
3. **Connection Pool Size**: Active vs available connections
4. **Dual-Write Errors**: Secondary database write failures
5. **Query Duration Histogram**: Heatmap of query times
6. **Database Health Status**: Health check status

**How to Use:**

```bash
# Compare database performance
Look at "Query Latency (p95)" panel
- Green line: SQLite
- Blue line: PostgreSQL

# Identify slow operations
Look at "Query Rate by Operation" panel
- High UPDATE rate may indicate lock contention

# Monitor connection pool
Look at "Connection Pool Size" panel
- If active connections near pool size, consider increasing pool

# Troubleshoot dual-write issues
Look at "Dual-Write Errors" panel
- Non-zero errors indicate secondary database problems
```

### 8.3 AI Models Dashboard

**Purpose:** Monitor AI/ML model performance and accuracy

**Key Panels:**
1. **Model Accuracy (MAPE)**: Forecast accuracy by model type
2. **Training Duration**: Time to train models
3. **Active Models**: Count of Prophet and ARIMA models
4. **Training Success Rate**: Percentage of successful trainings
5. **Prediction Latency**: Time to generate forecasts
6. **Anomalies Detected**: Unusual consumption patterns
7. **Top Anomalous Items**: Items with most anomalies

**How to Use:**

```bash
# Monitor model accuracy
Look at "Model Accuracy (MAPE)" panel
- Target: MAPE < 15% (green)
- Warning: MAPE 15-20% (yellow)
- Critical: MAPE > 20% (red)

# Identify underperforming models
Click on a model in the legend to isolate it
Models with consistently high MAPE need retraining

# Review training performance
Look at "Training Duration" heatmap
- Most trainings should complete in < 60 seconds

# Investigate anomalies
Look at "Top Anomalous Items" table
- High anomaly count may indicate data quality issues
```

### 8.4 Dashboard Variables

**Use dashboard variables for filtering:**

1. Click **Dashboard settings** (gear icon)
2. Click **Variables** → **New variable**
3. Configure:
   - **Name**: location
   - **Type**: Query
   - **Data source**: Prometheus
   - **Query**: `label_values(inventory_items_total, location)`
4. Click **Apply**

Now you can filter all panels by location using the dropdown at the top of the dashboard.

---

## 9. Troubleshooting

### 9.1 No Data in Dashboards

**Problem:** Dashboards show "No data"

**Diagnosis:**

```bash
# 1. Check if Prometheus is scraping the app
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.job == "inventory-enterprise")'

# Expected: "health": "up"

# 2. Check if metrics endpoint is accessible
curl http://localhost:8083/metrics

# Expected: 200 OK with metrics data

# 3. Check if Prometheus has data
curl -G http://localhost:9090/api/v1/query --data-urlencode 'query=up{job="inventory-enterprise"}'

# Expected: "value": [timestamp, "1"]
```

**Solutions:**

```bash
# If target is down
1. Ensure application is running: ps aux | grep node
2. Check firewall: sudo iptables -L | grep 8083
3. Verify metrics endpoint: curl http://localhost:8083/metrics

# If Prometheus can't scrape
1. Check prometheus.yml configuration
2. Verify scrape_configs has correct target
3. Reload Prometheus: curl -X POST http://localhost:9090/-/reload

# If Grafana can't connect to Prometheus
1. Check data source configuration in Grafana
2. Verify Prometheus URL is correct
3. Test connection: Click "Save & Test" in data source settings
```

### 9.2 Alerts Not Firing

**Problem:** Alerts not triggering when they should

**Diagnosis:**

```bash
# 1. Check if alert rules are loaded
curl http://localhost:9090/api/v1/rules | jq '.data.groups[].rules[] | select(.type == "alerting") | .name'

# 2. Check alert evaluation
curl http://localhost:9090/api/v1/alerts | jq '.data.alerts[] | {alert: .labels.alertname, state: .state}'

# 3. Check AlertManager connectivity
curl http://localhost:9093/api/v2/alerts
```

**Solutions:**

```bash
# If alert rules not loaded
1. Check alerts.yml syntax: promtool check rules grafana/alerts.yml
2. Verify path in prometheus.yml: rule_files: ['alerts.yml']
3. Reload Prometheus: curl -X POST http://localhost:9090/-/reload

# If alert condition not met
1. Check alert expression in Prometheus UI
2. Manually run the query to see current value
3. Adjust alert threshold if needed

# If AlertManager not receiving alerts
1. Check alertmanager.yml configuration
2. Verify AlertManager is running: docker ps | grep alertmanager
3. Check AlertManager logs: docker logs alertmanager
```

### 9.3 High Memory Usage (Prometheus)

**Problem:** Prometheus consuming too much memory

**Diagnosis:**

```bash
# Check memory usage
docker stats prometheus

# Check TSDB size
du -sh /var/lib/prometheus/
```

**Solutions:**

```bash
# 1. Reduce retention period
docker stop prometheus
# Edit prometheus.yml
--storage.tsdb.retention.time=15d  # Reduce from 30d to 15d
docker start prometheus

# 2. Reduce scrape frequency
# Edit prometheus.yml
scrape_interval: 30s  # Increase from 15s to 30s

# 3. Remove old data
docker exec prometheus promtool tsdb delete --time=$(date -d '30 days ago' +%s)000
```

### 9.4 Dashboard Not Loading

**Problem:** Dashboard shows "Error loading dashboard"

**Solutions:**

```bash
# 1. Check Grafana logs
docker logs grafana

# 2. Verify dashboard JSON is valid
cat grafana/Inventory-Overview.json | jq .

# 3. Re-import dashboard
# Via API:
curl -X POST http://admin:admin@localhost:3000/api/dashboards/db \
  -H "Content-Type: application/json" \
  -d @grafana/Inventory-Overview.json

# 4. Check Grafana data source
curl -s http://admin:admin@localhost:3000/api/datasources | jq '.[] | {name, url, access}'
```

---

## 10. Advanced Configuration

### 10.1 Multi-Cluster Monitoring

**Setup Prometheus Federation:**

```yaml
# prometheus-global.yml (on central Prometheus server)
scrape_configs:
  - job_name: 'federate-cluster-1'
    scrape_interval: 30s
    honor_labels: true
    metrics_path: '/federate'
    params:
      'match[]':
        - '{job="inventory-enterprise"}'
        - '{__name__=~"up|process_.*"}'
    static_configs:
      - targets: ['prometheus-cluster-1:9090']
        labels:
          cluster: 'us-east-1'

  - job_name: 'federate-cluster-2'
    scrape_interval: 30s
    honor_labels: true
    metrics_path: '/federate'
    params:
      'match[]':
        - '{job="inventory-enterprise"}'
    static_configs:
      - targets: ['prometheus-cluster-2:9090']
        labels:
          cluster: 'us-west-1'
```

### 10.2 Long-Term Storage (Thanos)

**Install Thanos Sidecar:**

```yaml
# docker-compose.monitoring.yml
services:
  prometheus:
    # ... existing config ...
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.min-block-duration=2h'
      - '--storage.tsdb.max-block-duration=2h'
      - '--web.enable-lifecycle'

  thanos-sidecar:
    image: thanosio/thanos:v0.32.0
    command:
      - 'sidecar'
      - '--tsdb.path=/prometheus'
      - '--prometheus.url=http://prometheus:9090'
      - '--objstore.config-file=/etc/thanos/bucket.yml'
    volumes:
      - prometheus-data:/prometheus
      - ./thanos-bucket.yml:/etc/thanos/bucket.yml
    depends_on:
      - prometheus
```

**Configure S3 storage:**

```yaml
# thanos-bucket.yml
type: S3
config:
  bucket: "inventory-metrics"
  endpoint: "s3.amazonaws.com"
  access_key: "${AWS_ACCESS_KEY_ID}"
  secret_key: "${AWS_SECRET_ACCESS_KEY}"
```

### 10.3 High Availability Setup

**Run Multiple Prometheus Instances:**

```yaml
# Prometheus 1
prometheus-1:
  image: prom/prometheus:v2.45.0
  command:
    - '--config.file=/etc/prometheus/prometheus.yml'
    - '--storage.tsdb.path=/prometheus'
    - '--web.external-url=http://prometheus-1:9090'

# Prometheus 2
prometheus-2:
  image: prom/prometheus:v2.45.0
  command:
    - '--config.file=/etc/prometheus/prometheus.yml'
    - '--storage.tsdb.path=/prometheus'
    - '--web.external-url=http://prometheus-2:9090'
```

**Load Balancer (HAProxy):**

```
# haproxy.cfg
frontend prometheus
    bind *:9090
    default_backend prometheus_servers

backend prometheus_servers
    balance roundrobin
    server prometheus-1 prometheus-1:9090 check
    server prometheus-2 prometheus-2:9090 check
```

### 10.4 Custom Metrics

**Add custom metrics to the application:**

```javascript
// In your application code
const metricsExporter = require('./utils/metricsExporter');

// Custom counter
const myCounter = new promClient.Counter({
  name: 'my_custom_events_total',
  help: 'Total number of custom events',
  labelNames: ['event_type']
});

// Record event
myCounter.labels('user_signup').inc();

// Custom histogram
const myHistogram = new promClient.Histogram({
  name: 'my_operation_duration_seconds',
  help: 'Duration of my operation',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Record duration
const timer = myHistogram.startTimer();
await myOperation();
timer();
```

**Query custom metrics in Grafana:**

```promql
# Rate of custom events
rate(my_custom_events_total[5m])

# p95 duration of custom operation
histogram_quantile(0.95, rate(my_operation_duration_seconds_bucket[5m]))
```

---

## Appendix A: Dashboard Panel Examples

### Creating a New Panel

1. Open a dashboard
2. Click **Add panel** (top-right)
3. Select **Add a new panel**
4. Configure query:

**Example: Cache Hit Rate**

```promql
sum(rate(cache_hits_total[5m])) / (sum(rate(cache_hits_total[5m])) + sum(rate(cache_misses_total[5m]))) * 100
```

5. Configure visualization:
   - **Visualization**: Stat
   - **Unit**: Percent (0-100)
   - **Thresholds**: 0 (red), 60 (yellow), 85 (green)
6. Click **Apply**

---

## Appendix B: Useful PromQL Queries

```promql
# Top 10 slowest API endpoints
topk(10, histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])))

# Cache hit rate by key prefix
sum(rate(cache_hits_total[5m])) by (cache_key_prefix) /
(sum(rate(cache_hits_total[5m])) by (cache_key_prefix) + sum(rate(cache_misses_total[5m])) by (cache_key_prefix))

# Database queries per second by operation
sum(rate(db_queries_total[5m])) by (operation)

# AI models with MAPE > 15%
ai_model_accuracy_mape > 15

# Inventory value by location
sum(inventory_value_total) by (location)

# Failed authentication attempts rate
rate(auth_failed_attempts_total[5m])

# Memory usage percentage
process_resident_memory_bytes / 2e9 * 100
```

---

## Appendix C: Maintenance Tasks

### Weekly Tasks

```bash
# 1. Check Prometheus disk usage
du -sh /var/lib/prometheus/

# 2. Verify all targets are up
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.health != "up")'

# 3. Review firing alerts
curl http://localhost:9090/api/v1/alerts | jq '.data.alerts[] | select(.state == "firing")'

# 4. Backup Grafana dashboards
curl -s http://admin:admin@localhost:3000/api/search?type=dash-db | \
  jq -r '.[] | .uid' | \
  xargs -I {} curl -s http://admin:admin@localhost:3000/api/dashboards/uid/{} > backup-{}.json
```

### Monthly Tasks

```bash
# 1. Update Prometheus and Grafana
docker-compose -f docker-compose.monitoring.yml pull
docker-compose -f docker-compose.monitoring.yml up -d

# 2. Review and adjust alert thresholds
# Edit grafana/alerts.yml based on historical data

# 3. Clean up old Prometheus data
docker exec prometheus promtool tsdb delete --time=$(date -d '90 days ago' +%s)000
```

---

## Support & Resources

**Documentation:**
- Prometheus: https://prometheus.io/docs/
- Grafana: https://grafana.com/docs/
- PromQL: https://prometheus.io/docs/prometheus/latest/querying/basics/

**Community:**
- Prometheus Slack: https://slack.prometheus.io/
- Grafana Community: https://community.grafana.com/

**Training:**
- PromQL Tutorial: https://promlabs.com/promql-cheat-sheet/
- Grafana Tutorials: https://grafana.com/tutorials/

---

**Document Version:** 2.1.0
**Last Updated:** January 2025
**Next Review:** April 2025

**End of Grafana Setup Guide**
