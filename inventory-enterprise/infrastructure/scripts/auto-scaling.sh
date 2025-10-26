#!/usr/bin/env bash
# ================================================================
# NeuroPilot v17.2 - Auto-Scaling Controller
# ================================================================
# Monitors system metrics and automatically scales backend instances
# based on CPU, memory, and request load
# ================================================================

set -euo pipefail

# Configuration
MIN_INSTANCES="${MIN_INSTANCES:-1}"
MAX_INSTANCES="${MAX_INSTANCES:-5}"
CPU_THRESHOLD="${CPU_THRESHOLD:-80}"  # Percentage
MEMORY_THRESHOLD="${MEMORY_THRESHOLD:-80}"  # Percentage
LATENCY_THRESHOLD="${LATENCY_THRESHOLD:-400}"  # Milliseconds
SCALE_UP_COOLDOWN="${SCALE_UP_COOLDOWN:-300}"  # 5 minutes
SCALE_DOWN_COOLDOWN="${SCALE_DOWN_COOLDOWN:-600}"  # 10 minutes
CHECK_INTERVAL="${CHECK_INTERVAL:-60}"  # 1 minute

API_URL="${API_URL:-https://api.neuropilot.ai}"
RAILWAY_TOKEN="${RAILWAY_TOKEN:-}"
RAILWAY_PROJECT_ID="${RAILWAY_PROJECT_ID:-}"
RAILWAY_SERVICE_ID="${RAILWAY_SERVICE_ID:-}"

GRAFANA_URL="${GRAFANA_URL:-}"
GRAFANA_API_KEY="${GRAFANA_API_KEY:-}"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"

STATE_FILE="/tmp/neuropilot_autoscaling_state.json"
LOG_FILE="${LOG_FILE:-/var/log/neuropilot/autoscaling.log}"

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# ================================================================
# FUNCTIONS
# ================================================================

log() {
  echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $*" | tee -a "$LOG_FILE" >&2
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $*" | tee -a "$LOG_FILE"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $*" | tee -a "$LOG_FILE"
}

# Initialize state file
init_state() {
  if [[ ! -f "$STATE_FILE" ]]; then
    cat > "$STATE_FILE" <<EOF
{
  "current_instances": $MIN_INSTANCES,
  "last_scale_up": 0,
  "last_scale_down": 0,
  "scale_events": []
}
EOF
    log "Initialized state file"
  fi
}

# Get current instance count
get_current_instances() {
  if [[ -z "$RAILWAY_TOKEN" ]]; then
    echo "$MIN_INSTANCES"
    return
  fi

  local instances=$(curl -s -X POST "https://backboard.railway.app/graphql/v2" \
    -H "Authorization: Bearer $RAILWAY_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "query": "query { service(id: \"'$RAILWAY_SERVICE_ID'\") { replicas } }"
    }' | jq -r '.data.service.replicas // 1')

  echo "${instances:-1}"
}

# Get CPU usage from metrics
get_cpu_usage() {
  local metrics=$(curl -s "${API_URL}/metrics" 2>/dev/null || echo "")

  if [[ -z "$metrics" ]]; then
    echo "0"
    return
  fi

  local cpu=$(echo "$metrics" | grep -E "^process_cpu_percent" | awk '{print $2}' | head -1)
  printf "%.0f" "${cpu:-0}"
}

# Get memory usage from metrics
get_memory_usage() {
  local metrics=$(curl -s "${API_URL}/metrics" 2>/dev/null || echo "")

  if [[ -z "$metrics" ]]; then
    echo "0"
    return
  fi

  local mem_bytes=$(echo "$metrics" | grep -E "^process_resident_memory_bytes" | awk '{print $2}' | head -1)
  local mem_mb=$(echo "scale=0; $mem_bytes / 1024 / 1024" | bc 2>/dev/null || echo "0")
  local mem_percent=$(echo "scale=0; ($mem_mb / 512) * 100" | bc 2>/dev/null || echo "0")  # Assuming 512MB limit

  printf "%.0f" "${mem_percent:-0}"
}

# Get p95 latency from metrics
get_p95_latency() {
  local metrics=$(curl -s "${API_URL}/metrics" 2>/dev/null || echo "")

  if [[ -z "$metrics" ]]; then
    echo "0"
    return
  fi

  # Calculate p95 from histogram buckets
  local latency=$(echo "$metrics" | grep "http_request_duration_ms" | grep "quantile=\"0.95\"" | awk '{print $2}' | head -1)
  printf "%.0f" "${latency:-0}"
}

# Check if cooldown period has passed
check_cooldown() {
  local action=$1  # "up" or "down"
  local last_action_time=$(jq -r ".last_scale_${action}" "$STATE_FILE")
  local now=$(date +%s)
  local cooldown_period=$SCALE_UP_COOLDOWN

  if [[ "$action" == "down" ]]; then
    cooldown_period=$SCALE_DOWN_COOLDOWN
  fi

  local elapsed=$((now - last_action_time))

  if [[ $elapsed -lt $cooldown_period ]]; then
    log_warning "Cooldown active for scale ${action} (${elapsed}s / ${cooldown_period}s)"
    return 1
  fi

  return 0
}

# Scale up instances
scale_up() {
  local current=$1
  local target=$((current + 1))

  if [[ $target -gt $MAX_INSTANCES ]]; then
    log_warning "Already at maximum instances ($MAX_INSTANCES)"
    return 1
  fi

  if ! check_cooldown "up"; then
    return 1
  fi

  log "🔼 Scaling UP: $current → $target instances"

  if [[ -n "$RAILWAY_TOKEN" ]]; then
    # Railway API call to scale replicas
    curl -s -X POST "https://backboard.railway.app/graphql/v2" \
      -H "Authorization: Bearer $RAILWAY_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{
        "query": "mutation { serviceUpdate(id: \"'$RAILWAY_SERVICE_ID'\", input: { replicas: '$target' }) { id } }"
      }' > /dev/null

    log_success "✓ Scaled to $target instances"
  else
    log_warning "Railway token not configured, dry-run mode"
  fi

  # Update state
  local now=$(date +%s)
  jq ".current_instances = $target | .last_scale_up = $now | .scale_events += [{\"timestamp\": $now, \"action\": \"scale_up\", \"from\": $current, \"to\": $target}]" "$STATE_FILE" > "${STATE_FILE}.tmp"
  mv "${STATE_FILE}.tmp" "$STATE_FILE"

  send_scaling_notification "up" "$current" "$target"
  create_grafana_annotation "Scale Up: $current → $target instances"

  return 0
}

# Scale down instances
scale_down() {
  local current=$1
  local target=$((current - 1))

  if [[ $target -lt $MIN_INSTANCES ]]; then
    log_warning "Already at minimum instances ($MIN_INSTANCES)"
    return 1
  fi

  if ! check_cooldown "down"; then
    return 1
  fi

  log "🔽 Scaling DOWN: $current → $target instances"

  if [[ -n "$RAILWAY_TOKEN" ]]; then
    curl -s -X POST "https://backboard.railway.app/graphql/v2" \
      -H "Authorization: Bearer $RAILWAY_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{
        "query": "mutation { serviceUpdate(id: \"'$RAILWAY_SERVICE_ID'\", input: { replicas: '$target' }) { id } }"
      }' > /dev/null

    log_success "✓ Scaled to $target instances"
  else
    log_warning "Railway token not configured, dry-run mode"
  fi

  # Update state
  local now=$(date +%s)
  jq ".current_instances = $target | .last_scale_down = $now | .scale_events += [{\"timestamp\": $now, \"action\": \"scale_down\", \"from\": $current, \"to\": $target}]" "$STATE_FILE" > "${STATE_FILE}.tmp"
  mv "${STATE_FILE}.tmp" "$STATE_FILE"

  send_scaling_notification "down" "$current" "$target"
  create_grafana_annotation "Scale Down: $current → $target instances"

  return 0
}

# Send Slack notification
send_scaling_notification() {
  local action=$1
  local from=$2
  local to=$3

  if [[ -z "$SLACK_WEBHOOK_URL" ]]; then
    return
  fi

  local emoji="🔼"
  local color="warning"

  if [[ "$action" == "down" ]]; then
    emoji="🔽"
    color="good"
  fi

  curl -X POST "$SLACK_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "{
      \"text\": \"${emoji} NeuroPilot Auto-Scaling Event\",
      \"attachments\": [{
        \"color\": \"${color}\",
        \"fields\": [
          {\"title\": \"Action\", \"value\": \"Scale ${action}\", \"short\": true},
          {\"title\": \"Instances\", \"value\": \"${from} → ${to}\", \"short\": true},
          {\"title\": \"Time\", \"value\": \"$(date -u +'%Y-%m-%d %H:%M:%S UTC')\", \"short\": false}
        ]
      }]
    }" 2>/dev/null
}

# Create Grafana annotation
create_grafana_annotation() {
  local text=$1

  if [[ -z "$GRAFANA_URL" ]] || [[ -z "$GRAFANA_API_KEY" ]]; then
    return
  fi

  curl -X POST "${GRAFANA_URL}/api/annotations" \
    -H "Authorization: Bearer ${GRAFANA_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{
      \"text\": \"${text}\",
      \"tags\": [\"autoscaling\", \"v17.2\"],
      \"time\": $(($(date +%s) * 1000))
    }" 2>/dev/null
}

# Evaluate scaling decision
evaluate_scaling() {
  local current_instances=$(get_current_instances)
  local cpu=$(get_cpu_usage)
  local memory=$(get_memory_usage)
  local latency=$(get_p95_latency)

  log "📊 Current Metrics:"
  log "   Instances: $current_instances"
  log "   CPU: ${cpu}%"
  log "   Memory: ${memory}%"
  log "   p95 Latency: ${latency}ms"

  # Determine if scaling is needed
  local should_scale_up=false
  local should_scale_down=false
  local reasons=()

  # Scale up conditions
  if [[ $cpu -ge $CPU_THRESHOLD ]]; then
    should_scale_up=true
    reasons+=("CPU usage ${cpu}% >= ${CPU_THRESHOLD}%")
  fi

  if [[ $memory -ge $MEMORY_THRESHOLD ]]; then
    should_scale_up=true
    reasons+=("Memory usage ${memory}% >= ${MEMORY_THRESHOLD}%")
  fi

  if [[ $latency -ge $LATENCY_THRESHOLD ]]; then
    should_scale_up=true
    reasons+=("Latency ${latency}ms >= ${LATENCY_THRESHOLD}ms")
  fi

  # Scale down conditions (conservative)
  if [[ $cpu -lt $((CPU_THRESHOLD - 20)) ]] && \
     [[ $memory -lt $((MEMORY_THRESHOLD - 20)) ]] && \
     [[ $latency -lt $((LATENCY_THRESHOLD / 2)) ]] && \
     [[ $current_instances -gt $MIN_INSTANCES ]]; then
    should_scale_down=true
    reasons=("All metrics well below thresholds")
  fi

  # Execute scaling
  if [[ "$should_scale_up" == "true" ]]; then
    log_warning "⚠️  Scaling trigger: ${reasons[*]}"
    scale_up "$current_instances"
  elif [[ "$should_scale_down" == "true" ]]; then
    log "ℹ️  Scale down trigger: ${reasons[*]}"
    scale_down "$current_instances"
  else
    log_success "✓ No scaling needed - metrics within thresholds"
  fi
}

# ================================================================
# MAIN LOOP
# ================================================================

main() {
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "🤖 NeuroPilot v17.2 - Auto-Scaling Controller"
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "Configuration:"
  log "  Min Instances: $MIN_INSTANCES"
  log "  Max Instances: $MAX_INSTANCES"
  log "  CPU Threshold: $CPU_THRESHOLD%"
  log "  Memory Threshold: $MEMORY_THRESHOLD%"
  log "  Latency Threshold: ${LATENCY_THRESHOLD}ms"
  log "  Check Interval: ${CHECK_INTERVAL}s"
  log ""

  init_state

  log "Starting auto-scaling monitor..."
  log "Press Ctrl+C to stop"
  log ""

  while true; do
    evaluate_scaling
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "Next check in ${CHECK_INTERVAL}s..."
    log ""
    sleep "$CHECK_INTERVAL"
  done
}

# ================================================================
# EXECUTE
# ================================================================

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
