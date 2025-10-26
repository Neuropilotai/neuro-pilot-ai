#!/usr/bin/env bash
# ================================================================
# NeuroPilot v17.2 - Cost Monitoring Script
# ================================================================
# Tracks infrastructure costs across all services and sends
# alerts when approaching budget thresholds
# ================================================================

set -euo pipefail

# Configuration
MONTHLY_BUDGET="${MONTHLY_BUDGET:-50}"  # USD
WARNING_THRESHOLD="${WARNING_THRESHOLD:-40}"  # 80% of budget
CRITICAL_THRESHOLD="${CRITICAL_THRESHOLD:-48}"  # 96% of budget

GRAFANA_URL="${GRAFANA_URL:-}"
GRAFANA_API_KEY="${GRAFANA_API_KEY:-}"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"

COST_LOG_FILE="${COST_LOG_FILE:-/var/log/neuropilot/costs.log}"
METRICS_FILE="/tmp/neuropilot_cost_metrics.prom"

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ================================================================
# FUNCTIONS
# ================================================================

log() {
  echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$COST_LOG_FILE"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $*" | tee -a "$COST_LOG_FILE" >&2
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $*" | tee -a "$COST_LOG_FILE"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $*" | tee -a "$COST_LOG_FILE"
}

# Get Railway costs via API
get_railway_cost() {
  local project_id="${RAILWAY_PROJECT_ID:-}"
  local api_token="${RAILWAY_TOKEN:-}"

  if [[ -z "$api_token" ]]; then
    echo "0"
    return
  fi

  # Railway API call to get current billing period usage
  local cost=$(curl -s -X POST "https://backboard.railway.app/graphql/v2" \
    -H "Authorization: Bearer $api_token" \
    -H "Content-Type: application/json" \
    -d '{
      "query": "query { projectUsage(projectId: \"'$project_id'\") { currentPeriod { total } } }"
    }' | jq -r '.data.projectUsage.currentPeriod.total // 0' | awk '{print $1/100}')

  echo "${cost:-0}"
}

# Get Neon costs (estimate based on usage)
get_neon_cost() {
  # Neon free tier: 0.5 GB storage, 1 GB data transfer
  # Pro tier: $19/month base + $0.12/GB storage + $0.09/GB transfer
  local neon_api_key="${NEON_API_KEY:-}"
  local neon_project_id="${NEON_PROJECT_ID:-}"

  if [[ -z "$neon_api_key" ]]; then
    echo "0"
    return
  fi

  # Get project metrics
  local metrics=$(curl -s "https://console.neon.tech/api/v2/projects/$neon_project_id/consumption" \
    -H "Authorization: Bearer $neon_api_key" 2>/dev/null || echo '{}')

  local storage_gb=$(echo "$metrics" | jq -r '.storage_bytes // 0' | awk '{print $1/1024/1024/1024}')
  local data_transfer_gb=$(echo "$metrics" | jq -r '.data_transfer_bytes // 0' | awk '{print $1/1024/1024/1024}')

  # Calculate cost (assuming Pro tier if over free limits)
  local cost=0
  if (( $(echo "$storage_gb > 0.5" | bc -l) )); then
    cost=$(echo "19 + ($storage_gb - 0.5) * 0.12 + $data_transfer_gb * 0.09" | bc -l)
  fi

  printf "%.2f" "$cost"
}

# Get Cloudflare costs
get_cloudflare_cost() {
  local enable_waf="${ENABLE_WAF:-false}"
  local enable_load_balancer="${ENABLE_LOAD_BALANCER:-false}"

  local cost=0

  # Cloudflare Pro plan: $20/month per zone
  if [[ "$enable_waf" == "true" ]]; then
    cost=$(echo "$cost + 20" | bc -l)
  fi

  # Load Balancer: $5/month
  if [[ "$enable_load_balancer" == "true" ]]; then
    cost=$(echo "$cost + 5" | bc -l)
  fi

  printf "%.2f" "$cost"
}

# Get Vercel costs (usually $0 on Hobby plan)
get_vercel_cost() {
  # Hobby plan is free for personal projects
  # Pro plan: $20/month per team member
  echo "0"
}

# Get Grafana costs (free tier)
get_grafana_cost() {
  # Free tier: 10k series, 50GB logs, 50GB traces
  echo "0"
}

# Get Sentry costs (free tier)
get_sentry_cost() {
  # Free tier: 5k errors/month
  echo "0"
}

# Calculate total cost
calculate_total_cost() {
  local railway=$(get_railway_cost)
  local neon=$(get_neon_cost)
  local cloudflare=$(get_cloudflare_cost)
  local vercel=$(get_vercel_cost)
  local grafana=$(get_grafana_cost)
  local sentry=$(get_sentry_cost)

  log "📊 Cost Breakdown:"
  log "  Railway:     \$${railway}"
  log "  Neon DB:     \$${neon}"
  log "  Cloudflare:  \$${cloudflare}"
  log "  Vercel:      \$${vercel}"
  log "  Grafana:     \$${grafana}"
  log "  Sentry:      \$${sentry}"

  local total=$(echo "$railway + $neon + $cloudflare + $vercel + $grafana + $sentry" | bc -l)
  printf "%.2f" "$total"
}

# Export metrics to Prometheus format
export_prometheus_metrics() {
  local railway=$(get_railway_cost)
  local neon=$(get_neon_cost)
  local cloudflare=$(get_cloudflare_cost)
  local total=$1
  local timestamp=$(date +%s)

  cat > "$METRICS_FILE" <<EOF
# HELP neuropilot_cost_total Total infrastructure cost (USD)
# TYPE neuropilot_cost_total gauge
neuropilot_cost_total{environment="production"} $total $timestamp

# HELP neuropilot_cost_railway Railway hosting cost (USD)
# TYPE neuropilot_cost_railway gauge
neuropilot_cost_railway{environment="production"} $railway $timestamp

# HELP neuropilot_cost_neon Neon database cost (USD)
# TYPE neuropilot_cost_neon gauge
neuropilot_cost_neon{environment="production"} $neon $timestamp

# HELP neuropilot_cost_cloudflare Cloudflare CDN/WAF cost (USD)
# TYPE neuropilot_cost_cloudflare gauge
neuropilot_cost_cloudflare{environment="production"} $cloudflare $timestamp

# HELP neuropilot_cost_budget Monthly budget (USD)
# TYPE neuropilot_cost_budget gauge
neuropilot_cost_budget{environment="production"} $MONTHLY_BUDGET $timestamp

# HELP neuropilot_cost_budget_percent Budget utilization percentage
# TYPE neuropilot_cost_budget_percent gauge
neuropilot_cost_budget_percent{environment="production"} $(echo "scale=2; ($total / $MONTHLY_BUDGET) * 100" | bc) $timestamp
EOF

  log_success "✓ Exported metrics to $METRICS_FILE"
}

# Send metrics to Grafana Cloud
send_to_grafana() {
  local total=$1

  if [[ -z "$GRAFANA_URL" ]] || [[ -z "$GRAFANA_API_KEY" ]]; then
    log_warning "Grafana credentials not configured, skipping..."
    return
  fi

  # Send to Grafana Cloud Prometheus endpoint
  curl -X POST "${GRAFANA_URL}/api/v1/push" \
    -H "Authorization: Bearer ${GRAFANA_API_KEY}" \
    -H "Content-Type: text/plain" \
    --data-binary @"$METRICS_FILE" \
    2>/dev/null && log_success "✓ Sent metrics to Grafana Cloud" || log_error "✗ Failed to send metrics to Grafana"
}

# Send Slack notification
send_slack_notification() {
  local total=$1
  local status=$2
  local message=$3

  if [[ -z "$SLACK_WEBHOOK_URL" ]]; then
    return
  fi

  local color="good"
  local emoji="✅"

  case "$status" in
    "critical")
      color="danger"
      emoji="🚨"
      ;;
    "warning")
      color="warning"
      emoji="⚠️"
      ;;
  esac

  local budget_percent=$(echo "scale=1; ($total / $MONTHLY_BUDGET) * 100" | bc)

  curl -X POST "$SLACK_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "{
      \"text\": \"${emoji} NeuroPilot Cost Alert\",
      \"attachments\": [{
        \"color\": \"${color}\",
        \"fields\": [
          {\"title\": \"Total Cost\", \"value\": \"\$${total}\", \"short\": true},
          {\"title\": \"Budget\", \"value\": \"\$${MONTHLY_BUDGET}\", \"short\": true},
          {\"title\": \"Utilization\", \"value\": \"${budget_percent}%\", \"short\": true},
          {\"title\": \"Status\", \"value\": \"${message}\", \"short\": true}
        ],
        \"footer\": \"NeuroPilot v17.2 Cost Monitoring\",
        \"ts\": $(date +%s)
      }]
    }" \
    2>/dev/null && log_success "✓ Sent Slack notification" || log_warning "✗ Failed to send Slack notification"
}

# Check thresholds and alert
check_thresholds() {
  local total=$1

  local budget_percent=$(echo "scale=0; ($total / $MONTHLY_BUDGET) * 100" | bc)

  if (( $(echo "$total >= $CRITICAL_THRESHOLD" | bc -l) )); then
    log_error "🚨 CRITICAL: Cost \$$total exceeds critical threshold \$$CRITICAL_THRESHOLD (${budget_percent}% of budget)"
    send_slack_notification "$total" "critical" "Cost exceeds 96% of monthly budget!"
    return 2
  elif (( $(echo "$total >= $WARNING_THRESHOLD" | bc -l) )); then
    log_warning "⚠️  WARNING: Cost \$$total exceeds warning threshold \$$WARNING_THRESHOLD (${budget_percent}% of budget)"
    send_slack_notification "$total" "warning" "Cost approaching monthly budget limit"
    return 1
  else
    log_success "✓ Cost \$$total is within budget (${budget_percent}% of \$$MONTHLY_BUDGET)"
    return 0
  fi
}

# ================================================================
# MAIN
# ================================================================

main() {
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "🔍 NeuroPilot v17.2 - Cost Monitoring"
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "Budget: \$$MONTHLY_BUDGET/month"
  log "Warning Threshold: \$$WARNING_THRESHOLD"
  log "Critical Threshold: \$$CRITICAL_THRESHOLD"
  log ""

  # Calculate total cost
  local total=$(calculate_total_cost)
  log ""
  log "💰 Total Monthly Cost: \$$total"
  log ""

  # Export and send metrics
  export_prometheus_metrics "$total"
  send_to_grafana "$total"

  # Check thresholds
  check_thresholds "$total"
  local threshold_status=$?

  log ""
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "✓ Cost monitoring complete"
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  exit $threshold_status
}

# ================================================================
# EXECUTE
# ================================================================

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
