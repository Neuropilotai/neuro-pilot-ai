#!/usr/bin/env bash
set -euo pipefail

# autoheal-monitor.sh
# Auto-healing service monitor for NeuroPilot v17.1
# Monitors latency, error rates, and database lag
# Triggers auto-healing actions when thresholds exceeded

echo "🔄 NeuroPilot v17.1 Auto-Healing Monitor"
echo "========================================"
echo ""

# ================================================================
# CONFIGURATION
# ================================================================
API_URL="${API_URL:-https://api.neuropilot.ai}"
FRONTEND_URL="${FRONTEND_URL:-https://inventory.neuropilot.ai}"
CHECK_INTERVAL="${CHECK_INTERVAL:-60}"  # seconds
LOG_FILE="${LOG_FILE:-./logs/autoheal.log}"
METRICS_FILE="${METRICS_FILE:-./logs/autoheal_metrics.json}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"
GRAFANA_URL="${GRAFANA_URL:-}"
GRAFANA_API_KEY="${GRAFANA_API_KEY:-}"

# Thresholds
LATENCY_THRESHOLD_MS="${LATENCY_THRESHOLD_MS:-400}"
ERROR_RATE_THRESHOLD_PCT="${ERROR_RATE_THRESHOLD_PCT:-5}"
DB_LAG_THRESHOLD_MS="${DB_LAG_THRESHOLD_MS:-2000}"
MEMORY_THRESHOLD_PCT="${MEMORY_THRESHOLD_PCT:-85}"

# Healing actions
ENABLE_AUTO_RESTART="${ENABLE_AUTO_RESTART:-false}"
ENABLE_CACHE_PURGE="${ENABLE_AUTO_CACHE_PURGE:-false}"
ENABLE_SCALE_UP="${ENABLE_AUTO_SCALE:-false}"

mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$(dirname "$METRICS_FILE")"

echo "Configuration:"
echo "  API URL: $API_URL"
echo "  Check Interval: ${CHECK_INTERVAL}s"
echo "  Latency Threshold: ${LATENCY_THRESHOLD_MS}ms"
echo "  Error Rate Threshold: ${ERROR_RATE_THRESHOLD_PCT}%"
echo "  Auto-Restart: $ENABLE_AUTO_RESTART"
echo "  Auto-Cache Purge: $ENABLE_CACHE_PURGE"
echo ""

# ================================================================
# HELPER FUNCTIONS
# ================================================================
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
}

send_alert() {
    local severity="$1"
    local message="$2"

    log "$severity" "$message"

    # Send to Slack if configured
    if [ -n "$SLACK_WEBHOOK" ]; then
        local emoji="⚠️"
        if [ "$severity" = "CRITICAL" ]; then
            emoji="🚨"
        elif [ "$severity" = "WARNING" ]; then
            emoji="⚠️"
        elif [ "$severity" = "INFO" ]; then
            emoji="ℹ️"
        fi

        curl -sS -X POST "$SLACK_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"text\": \"$emoji NeuroPilot Auto-Heal: $message\"}" > /dev/null || true
    fi

    # Send to Grafana if configured
    if [ -n "$GRAFANA_URL" ] && [ -n "$GRAFANA_API_KEY" ]; then
        curl -sS -X POST "$GRAFANA_URL/api/annotations" \
            -H "Authorization: Bearer $GRAFANA_API_KEY" \
            -H "Content-Type: application/json" \
            -d "{\"text\": \"$message\", \"tags\": [\"autoheal\", \"$severity\"]}" > /dev/null || true
    fi
}

check_health() {
    local url="$1"
    local response
    local status
    local latency

    # Measure latency and get status code
    response=$(curl -sS -w "\n%{http_code}\n%{time_total}" -o /dev/null "$url" 2>&1 || echo "000\n0")
    status=$(echo "$response" | sed -n '1p')
    latency=$(echo "$response" | sed -n '2p')

    # Convert latency to milliseconds
    latency_ms=$(echo "$latency * 1000" | bc -l | cut -d. -f1)

    echo "$status:$latency_ms"
}

restart_service() {
    log "WARNING" "Initiating service restart..."
    send_alert "WARNING" "High latency detected. Restarting service..."

    if [ "$ENABLE_AUTO_RESTART" = "true" ]; then
        # Railway restart
        if command -v railway &> /dev/null; then
            railway restart || log "ERROR" "Failed to restart Railway service"
        fi

        # Docker restart (if running locally)
        if command -v docker &> /dev/null; then
            docker restart neuropilot-backend || log "ERROR" "Failed to restart Docker container"
        fi

        log "INFO" "Service restart triggered"
    else
        log "INFO" "Auto-restart disabled. Manual intervention required."
    fi
}

purge_cache() {
    log "WARNING" "Purging CDN cache..."
    send_alert "WARNING" "High error rate. Purging CDN cache..."

    if [ "$ENABLE_CACHE_PURGE" = "true" ]; then
        # Cloudflare cache purge
        if [ -n "${CF_ZONE_ID:-}" ] && [ -n "${CF_API_TOKEN:-}" ]; then
            curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache" \
                -H "Authorization: Bearer $CF_API_TOKEN" \
                -H "Content-Type: application/json" \
                -d '{"purge_everything":true}' > /dev/null || log "ERROR" "Failed to purge Cloudflare cache"

            log "INFO" "Cloudflare cache purged"
        else
            log "WARNING" "Cloudflare credentials not configured"
        fi
    else
        log "INFO" "Auto-cache purge disabled. Manual intervention required."
    fi
}

scale_up() {
    log "WARNING" "Scaling up service..."
    send_alert "WARNING" "High load detected. Scaling up..."

    if [ "$ENABLE_SCALE_UP" = "true" ]; then
        # Railway scale up (requires Pro plan)
        if command -v railway &> /dev/null; then
            railway scale --replicas 2 || log "ERROR" "Failed to scale Railway service"
            log "INFO" "Service scaled to 2 replicas"
        fi
    else
        log "INFO" "Auto-scale disabled. Manual intervention required."
    fi
}

save_metrics() {
    local api_status="$1"
    local api_latency="$2"
    local frontend_status="$3"
    local frontend_latency="$4"
    local error_rate="$5"

    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Append to metrics file (JSON Lines format)
    cat >> "$METRICS_FILE" << EOF
{"timestamp":"$timestamp","api_status":$api_status,"api_latency_ms":$api_latency,"frontend_status":$frontend_status,"frontend_latency_ms":$frontend_latency,"error_rate_pct":$error_rate}
EOF

    # Send to Grafana if configured
    if [ -n "$GRAFANA_URL" ] && [ -n "$GRAFANA_API_KEY" ]; then
        curl -sS -X POST "$GRAFANA_URL/api/v1/push" \
            -H "Authorization: Bearer $GRAFANA_API_KEY" \
            -H "Content-Type: application/json" \
            -d "{\"metrics\":[
                {\"name\":\"neuropilot.autoheal.api_latency\",\"value\":$api_latency,\"timestamp\":$(date +%s)},
                {\"name\":\"neuropilot.autoheal.api_status\",\"value\":$api_status,\"timestamp\":$(date +%s)},
                {\"name\":\"neuropilot.autoheal.error_rate\",\"value\":$error_rate,\"timestamp\":$(date +%s)}
            ]}" > /dev/null || true
    fi
}

# ================================================================
# MAIN MONITORING LOOP
# ================================================================
log "INFO" "Auto-healing monitor started"
send_alert "INFO" "Auto-healing monitor initialized and running"

CONSECUTIVE_FAILURES=0
HEALING_COOLDOWN=0

while true; do
    echo ""
    log "INFO" "Running health checks..."

    # Check API health
    API_RESULT=$(check_health "$API_URL/health")
    API_STATUS=$(echo "$API_RESULT" | cut -d: -f1)
    API_LATENCY=$(echo "$API_RESULT" | cut -d: -f2)

    # Check frontend health
    FRONTEND_RESULT=$(check_health "$FRONTEND_URL")
    FRONTEND_STATUS=$(echo "$FRONTEND_RESULT" | cut -d: -f1)
    FRONTEND_LATENCY=$(echo "$FRONTEND_RESULT" | cut -d: -f2)

    # Calculate error rate (simple: 5xx responses)
    if [ "$API_STATUS" -ge 500 ]; then
        CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
    else
        CONSECUTIVE_FAILURES=0
    fi

    ERROR_RATE=$(echo "scale=2; $CONSECUTIVE_FAILURES / 5 * 100" | bc -l)

    # Log current metrics
    log "INFO" "API Status: $API_STATUS, Latency: ${API_LATENCY}ms"
    log "INFO" "Frontend Status: $FRONTEND_STATUS, Latency: ${FRONTEND_LATENCY}ms"
    log "INFO" "Error Rate: ${ERROR_RATE}% (consecutive failures: $CONSECUTIVE_FAILURES)"

    # Save metrics
    save_metrics "$API_STATUS" "$API_LATENCY" "$FRONTEND_STATUS" "$FRONTEND_LATENCY" "$ERROR_RATE"

    # Decrease healing cooldown
    if [ $HEALING_COOLDOWN -gt 0 ]; then
        HEALING_COOLDOWN=$((HEALING_COOLDOWN - 1))
    fi

    # ================================================================
    # CHECK THRESHOLDS AND TRIGGER HEALING
    # ================================================================
    SHOULD_HEAL=false
    HEAL_ACTION=""

    # Check latency threshold
    if [ "$API_LATENCY" -gt "$LATENCY_THRESHOLD_MS" ]; then
        log "WARNING" "Latency threshold exceeded: ${API_LATENCY}ms > ${LATENCY_THRESHOLD_MS}ms"
        SHOULD_HEAL=true
        HEAL_ACTION="restart"
    fi

    # Check error rate threshold
    if [ "$(echo "$ERROR_RATE > $ERROR_RATE_THRESHOLD_PCT" | bc -l)" -eq 1 ]; then
        log "WARNING" "Error rate threshold exceeded: ${ERROR_RATE}% > ${ERROR_RATE_THRESHOLD_PCT}%"
        SHOULD_HEAL=true
        HEAL_ACTION="cache_purge"
    fi

    # Check for 5xx errors
    if [ "$API_STATUS" -ge 500 ]; then
        log "CRITICAL" "API returning 5xx errors: $API_STATUS"
        SHOULD_HEAL=true
        HEAL_ACTION="restart"
    fi

    # Execute healing actions (with cooldown)
    if [ "$SHOULD_HEAL" = true ] && [ $HEALING_COOLDOWN -eq 0 ]; then
        log "WARNING" "Healing threshold exceeded. Taking action: $HEAL_ACTION"
        send_alert "WARNING" "Auto-healing triggered: $HEAL_ACTION"

        if [ "$HEAL_ACTION" = "restart" ]; then
            restart_service
            HEALING_COOLDOWN=10  # Wait 10 cycles before healing again
        elif [ "$HEAL_ACTION" = "cache_purge" ]; then
            purge_cache
            HEALING_COOLDOWN=5
        elif [ "$HEAL_ACTION" = "scale_up" ]; then
            scale_up
            HEALING_COOLDOWN=20
        fi

        # Wait for service to stabilize
        log "INFO" "Waiting 30s for service to stabilize..."
        sleep 30

        # Re-check health
        API_RESULT=$(check_health "$API_URL/health")
        API_STATUS=$(echo "$API_RESULT" | cut -d: -f1)
        API_LATENCY=$(echo "$API_RESULT" | cut -d: -f2)

        if [ "$API_STATUS" -eq 200 ] && [ "$API_LATENCY" -lt "$LATENCY_THRESHOLD_MS" ]; then
            log "INFO" "Service recovered. Status: $API_STATUS, Latency: ${API_LATENCY}ms"
            send_alert "INFO" "Service auto-healed successfully"
            CONSECUTIVE_FAILURES=0
        else
            log "CRITICAL" "Service did not recover. Manual intervention required."
            send_alert "CRITICAL" "Auto-healing failed. Manual intervention required."
        fi
    elif [ "$SHOULD_HEAL" = true ] && [ $HEALING_COOLDOWN -gt 0 ]; then
        log "INFO" "Healing cooldown active ($HEALING_COOLDOWN cycles remaining)"
    else
        log "INFO" "All metrics within thresholds. System healthy."
    fi

    # Sleep until next check
    log "INFO" "Sleeping ${CHECK_INTERVAL}s until next check..."
    sleep "$CHECK_INTERVAL"
done
