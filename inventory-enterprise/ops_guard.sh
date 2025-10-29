#!/bin/bash
# ops_guard.sh - Health monitoring with auto-rollback
# Watches backend health; triggers Railway rollback after 3 consecutive failures

set -euo pipefail

# === Configuration ===
HEALTH_URL="${BACKEND_URL:-https://resourceful-achievement-production.up.railway.app}/api/health"
MAX_FAILURES=3
FAILURE_COUNT=0
CHECK_INTERVAL=300  # 5 minutes in seconds
LOG_FILE="/tmp/neuronexus_ops_guard.log"

# === Functions ===
log() {
  local level=$1
  shift
  echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [$level] $*" | tee -a "$LOG_FILE"
}

check_health() {
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" --max-time 10 --connect-timeout 5 || echo "000")

  if [ "$status" -eq 200 ]; then
    log "INFO" "Health OK (HTTP $status)"
    FAILURE_COUNT=0
    return 0
  else
    FAILURE_COUNT=$((FAILURE_COUNT + 1))
    log "WARN" "Health FAIL (HTTP $status) - Failure $FAILURE_COUNT/$MAX_FAILURES"
    return 1
  fi
}

trigger_rollback() {
  log "CRITICAL" "🚨 Max failures reached. Triggering automatic rollback..."

  # Attempt Railway rollback
  if command -v railway &> /dev/null; then
    if railway rollback --yes 2>&1 | tee -a "$LOG_FILE"; then
      log "INFO" "✅ Railway rollback completed successfully"
    else
      log "ERROR" "❌ Railway rollback command failed"
    fi
  else
    log "ERROR" "Railway CLI not found. Cannot rollback automatically."
    log "INFO" "Manual intervention required: railway rollback"
  fi

  # Send alert email (if configured)
  send_alert "CRITICAL: Auto-rollback triggered after $MAX_FAILURES health check failures"

  # Create incident file for monitoring
  echo "$(date -u +'%Y-%m-%dT%H:%M:%SZ') - Auto-rollback triggered" >> /tmp/neuronexus_incidents.log

  # Reset counter after rollback
  FAILURE_COUNT=0
}

send_alert() {
  local message="$1"

  # Email via mailx (if available)
  if command -v mail &> /dev/null && [ -n "${ADMIN_EMAIL:-}" ]; then
    echo "$message" | mail -s "[NeuroNexus] CRITICAL Alert" "$ADMIN_EMAIL"
    log "INFO" "Alert email sent to $ADMIN_EMAIL"
  fi

  # Slack webhook (if configured)
  if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
    curl -X POST "$SLACK_WEBHOOK_URL" \
      -H 'Content-Type: application/json' \
      -d "{\"text\":\"🚨 NeuroNexus Alert: $message\",\"username\":\"Ops Guard\"}" \
      &> /dev/null || log "WARN" "Failed to send Slack notification"
  fi

  # PagerDuty (if configured)
  if [ -n "${PAGERDUTY_KEY:-}" ]; then
    curl -X POST https://events.pagerduty.com/v2/enqueue \
      -H 'Content-Type: application/json' \
      -d "{
        \"routing_key\":\"$PAGERDUTY_KEY\",
        \"event_action\":\"trigger\",
        \"payload\":{
          \"summary\":\"NeuroNexus health check failure - auto-rollback\",
          \"severity\":\"critical\",
          \"source\":\"ops_guard.sh\"
        }
      }" &> /dev/null || log "WARN" "Failed to send PagerDuty alert"
  fi
}

# === Main Loop ===
main() {
  log "INFO" "🚀 NeuroNexus Ops Guard started"
  log "INFO" "Monitoring: $HEALTH_URL"
  log "INFO" "Check interval: ${CHECK_INTERVAL}s"
  log "INFO" "Max failures before rollback: $MAX_FAILURES"

  while true; do
    if ! check_health; then
      if [ "$FAILURE_COUNT" -ge "$MAX_FAILURES" ]; then
        trigger_rollback

        # Wait before resuming checks to allow rollback to stabilize
        log "INFO" "Waiting 2 minutes for system to stabilize..."
        sleep 120
      fi
    fi

    # Wait before next check
    sleep "$CHECK_INTERVAL"
  done
}

# === Graceful Shutdown ===
trap 'log "INFO" "Ops Guard shutting down..."; exit 0' SIGTERM SIGINT

# === Entry Point ===
main "$@"
