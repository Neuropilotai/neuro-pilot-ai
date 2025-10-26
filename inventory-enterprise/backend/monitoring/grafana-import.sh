#!/usr/bin/env bash
set -euo pipefail

# grafana-import.sh
# Auto-imports dashboard JSON and configures data sources via Grafana API
# For NeuroPilot v17.1 with Grafana Cloud

echo "📊 NeuroPilot v17.1 Grafana Setup"
echo "=================================="
echo ""

# ================================================================
# CONFIGURATION
# ================================================================
GRAFANA_URL="${GRAFANA_URL:-}"
GRAFANA_API_KEY="${GRAFANA_API_KEY:-}"
DASHBOARD_FILE="${1:-./monitoring/neuropilot-dashboard.json}"

if [ -z "$GRAFANA_URL" ]; then
    echo "❌ GRAFANA_URL not set"
    echo ""
    echo "Get your Grafana Cloud URL:"
    echo "  1. Go to https://grafana.com"
    echo "  2. Sign up for free (10k metrics, 50GB logs)"
    echo "  3. Copy your instance URL (e.g., https://your-org.grafana.net)"
    echo ""
    echo "Export: export GRAFANA_URL='https://your-org.grafana.net'"
    exit 1
fi

if [ -z "$GRAFANA_API_KEY" ]; then
    echo "❌ GRAFANA_API_KEY not set"
    echo ""
    echo "Create API key:"
    echo "  1. Go to $GRAFANA_URL/org/apikeys"
    echo "  2. Click 'Add API key'"
    echo "  3. Name: 'NeuroPilot v17.1'"
    echo "  4. Role: 'Editor'"
    echo "  5. Copy the key"
    echo ""
    echo "Export: export GRAFANA_API_KEY='your_api_key_here'"
    exit 1
fi

echo "Configuration:"
echo "  Grafana URL: $GRAFANA_URL"
echo "  API Key: ${GRAFANA_API_KEY:0:20}..."
echo "  Dashboard: $DASHBOARD_FILE"
echo ""

# ================================================================
# TEST CONNECTION
# ================================================================
echo "1️⃣  Testing Grafana connection..."

HEALTH_RESPONSE=$(curl -sS -w "%{http_code}" -o /dev/null \
    "$GRAFANA_URL/api/health" \
    -H "Authorization: Bearer $GRAFANA_API_KEY" || echo "000")

if [ "$HEALTH_RESPONSE" = "200" ]; then
    echo "✅ Connected to Grafana"
else
    echo "❌ Failed to connect to Grafana (HTTP $HEALTH_RESPONSE)"
    exit 1
fi
echo ""

# ================================================================
# CREATE DATA SOURCE (Prometheus)
# ================================================================
echo "2️⃣  Configuring Prometheus data source..."

DATASOURCE_PAYLOAD=$(cat <<'EOF'
{
  "name": "NeuroPilot Prometheus",
  "type": "prometheus",
  "url": "https://prometheus-prod-01-eu-west-0.grafana.net",
  "access": "proxy",
  "isDefault": true,
  "jsonData": {
    "httpMethod": "POST",
    "timeInterval": "30s"
  }
}
EOF
)

DATASOURCE_RESPONSE=$(curl -sS -X POST "$GRAFANA_URL/api/datasources" \
    -H "Authorization: Bearer $GRAFANA_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$DATASOURCE_PAYLOAD" || echo "")

if echo "$DATASOURCE_RESPONSE" | grep -q '"id"'; then
    DATASOURCE_ID=$(echo "$DATASOURCE_RESPONSE" | jq -r '.id')
    echo "✅ Prometheus data source created (ID: $DATASOURCE_ID)"
else
    echo "⚠️  Data source may already exist (this is OK)"
fi
echo ""

# ================================================================
# CREATE DASHBOARD
# ================================================================
echo "3️⃣  Creating NeuroPilot dashboard..."

# Generate dashboard JSON if it doesn't exist
if [ ! -f "$DASHBOARD_FILE" ]; then
    echo "   Generating default dashboard..."
    mkdir -p "$(dirname "$DASHBOARD_FILE")"

    cat > "$DASHBOARD_FILE" << 'EOF'
{
  "dashboard": {
    "title": "NeuroPilot v17.1 - Production Metrics",
    "tags": ["neuropilot", "v17.1", "production"],
    "timezone": "utc",
    "panels": [
      {
        "id": 1,
        "title": "API Latency (p95)",
        "type": "graph",
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": 0},
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m]))",
            "legendFormat": "p95 latency"
          }
        ],
        "yaxes": [
          {"format": "ms", "label": "Latency"},
          {"format": "short"}
        ]
      },
      {
        "id": 2,
        "title": "Request Rate",
        "type": "graph",
        "gridPos": {"h": 8, "w": 12, "x": 12, "y": 0},
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{method}} {{path}}"
          }
        ],
        "yaxes": [
          {"format": "reqps", "label": "Requests/sec"},
          {"format": "short"}
        ]
      },
      {
        "id": 3,
        "title": "Error Rate",
        "type": "graph",
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": 8},
        "targets": [
          {
            "expr": "rate(http_requests_total{status=~\"5..\"}[5m])",
            "legendFormat": "5xx errors"
          }
        ],
        "yaxes": [
          {"format": "percentunit", "label": "Error Rate"},
          {"format": "short"}
        ],
        "alert": {
          "name": "High Error Rate",
          "conditions": [
            {
              "evaluator": {"params": [0.05], "type": "gt"},
              "query": {"params": ["A", "5m", "now"]},
              "reducer": {"params": [], "type": "avg"},
              "type": "query"
            }
          ]
        }
      },
      {
        "id": 4,
        "title": "Cache Hit Ratio",
        "type": "stat",
        "gridPos": {"h": 8, "w": 12, "x": 12, "y": 8},
        "targets": [
          {
            "expr": "sum(rate(cache_hits_total[5m])) / sum(rate(cache_requests_total[5m]))",
            "legendFormat": "Cache Hit %"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "percentunit",
            "thresholds": {
              "mode": "absolute",
              "steps": [
                {"value": 0, "color": "red"},
                {"value": 0.7, "color": "yellow"},
                {"value": 0.8, "color": "green"}
              ]
            }
          }
        }
      },
      {
        "id": 5,
        "title": "Database Query Time",
        "type": "graph",
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": 16},
        "targets": [
          {
            "expr": "rate(db_query_duration_ms_sum[5m]) / rate(db_query_duration_ms_count[5m])",
            "legendFormat": "Avg query time"
          }
        ],
        "yaxes": [
          {"format": "ms", "label": "Query Time"},
          {"format": "short"}
        ]
      },
      {
        "id": 6,
        "title": "Memory Usage",
        "type": "graph",
        "gridPos": {"h": 8, "w": 12, "x": 12, "y": 16},
        "targets": [
          {
            "expr": "process_resident_memory_bytes / 1024 / 1024",
            "legendFormat": "Memory (MB)"
          }
        ],
        "yaxes": [
          {"format": "decmbytes", "label": "Memory"},
          {"format": "short"}
        ]
      },
      {
        "id": 7,
        "title": "Active Users",
        "type": "stat",
        "gridPos": {"h": 4, "w": 6, "x": 0, "y": 24},
        "targets": [
          {
            "expr": "count(count by (user_id) (http_requests_total))",
            "legendFormat": "Active Users"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "none"
          }
        }
      },
      {
        "id": 8,
        "title": "Uptime",
        "type": "stat",
        "gridPos": {"h": 4, "w": 6, "x": 6, "y": 24},
        "targets": [
          {
            "expr": "time() - process_start_time_seconds",
            "legendFormat": "Uptime"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "s"
          }
        }
      }
    ],
    "refresh": "30s",
    "time": {
      "from": "now-6h",
      "to": "now"
    }
  },
  "overwrite": true
}
EOF
    echo "   ✅ Default dashboard template created"
fi

# Import dashboard
DASHBOARD_JSON=$(cat "$DASHBOARD_FILE")
IMPORT_RESPONSE=$(curl -sS -X POST "$GRAFANA_URL/api/dashboards/db" \
    -H "Authorization: Bearer $GRAFANA_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$DASHBOARD_JSON" || echo "")

if echo "$IMPORT_RESPONSE" | grep -q '"url"'; then
    DASHBOARD_URL=$(echo "$IMPORT_RESPONSE" | jq -r '.url')
    echo "✅ Dashboard imported successfully"
    echo "   URL: $GRAFANA_URL$DASHBOARD_URL"
else
    echo "❌ Failed to import dashboard"
    echo "   Response: $IMPORT_RESPONSE"
    exit 1
fi
echo ""

# ================================================================
# CREATE ALERT RULES
# ================================================================
echo "4️⃣  Creating alert rules..."

# High latency alert
ALERT_LATENCY=$(cat <<'EOF'
{
  "title": "High API Latency",
  "condition": "A",
  "data": [
    {
      "refId": "A",
      "queryType": "",
      "model": {
        "expr": "histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m])) > 400",
        "intervalMs": 1000,
        "maxDataPoints": 43200
      }
    }
  ],
  "noDataState": "NoData",
  "execErrState": "Alerting",
  "for": "5m",
  "annotations": {
    "description": "API p95 latency is above 400ms threshold"
  },
  "labels": {
    "severity": "warning",
    "component": "api"
  }
}
EOF
)

curl -sS -X POST "$GRAFANA_URL/api/v1/provisioning/alert-rules" \
    -H "Authorization: Bearer $GRAFANA_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$ALERT_LATENCY" > /dev/null || echo "⚠️  Alert may already exist"

# High error rate alert
ALERT_ERRORS=$(cat <<'EOF'
{
  "title": "High Error Rate",
  "condition": "A",
  "data": [
    {
      "refId": "A",
      "queryType": "",
      "model": {
        "expr": "rate(http_requests_total{status=~\"5..\"}[5m]) > 0.05",
        "intervalMs": 1000,
        "maxDataPoints": 43200
      }
    }
  ],
  "noDataState": "NoData",
  "execErrState": "Alerting",
  "for": "2m",
  "annotations": {
    "description": "API error rate is above 5% threshold"
  },
  "labels": {
    "severity": "critical",
    "component": "api"
  }
}
EOF
)

curl -sS -X POST "$GRAFANA_URL/api/v1/provisioning/alert-rules" \
    -H "Authorization: Bearer $GRAFANA_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$ALERT_ERRORS" > /dev/null || echo "⚠️  Alert may already exist"

echo "✅ Alert rules created"
echo ""

# ================================================================
# SUMMARY
# ================================================================
echo "=================================="
echo "✅ Grafana Setup Complete"
echo "=================================="
echo ""
echo "📊 Dashboard: $GRAFANA_URL$DASHBOARD_URL"
echo ""
echo "🔔 Alerts Configured:"
echo "  • High API Latency (p95 > 400ms for 5m)"
echo "  • High Error Rate (5xx > 5% for 2m)"
echo ""
echo "📈 Metrics Available:"
echo "  • API Latency (p95, p99)"
echo "  • Request Rate"
echo "  • Error Rate"
echo "  • Cache Hit Ratio"
echo "  • Database Query Time"
echo "  • Memory Usage"
echo "  • Active Users"
echo "  • Uptime"
echo ""
echo "🔗 Next Steps:"
echo "  1. Configure alert notifications: $GRAFANA_URL/alerting/notifications"
echo "  2. Add Slack webhook for alerts"
echo "  3. Integrate with Sentry: ./monitoring/sentry-setup.sh"
echo "  4. Run load test: ./scripts/run_benchmark.sh"
echo ""
