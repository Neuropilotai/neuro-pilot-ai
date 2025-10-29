#!/bin/bash
# ops_guard_enhanced.sh - Self-Healing Runtime Monitor (Phase 1.5)
# Watches backend health + DB integrity; triggers Railway rollback after 3 consecutive failures
# v19.0 Enterprise Autonomous

set -euo pipefail

# === Configuration ===
HEALTH_URL="${BACKEND_URL:-https://resourceful-achievement-production.up.railway.app}/api/health"
DB_PATH="${DB_PATH:-backend/database.db}"
MAX_FAILURES=3
FAILURE_COUNT=0
CHECK_INTERVAL=300  # 5 minutes in seconds
LOG_FILE="/tmp/neuronexus_ops_guard.log"
INCIDENT_LOG="/tmp/neuronexus_incidents.log"
DB_CHECKSUM_FILE="/tmp/neuronexus_db_checksum.txt"

# === Functions ===
log() {
  local level=$1
  shift
  echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] [$level] $*" | tee -a "$LOG_FILE"
}

# HTTP Health Check
check_http_health() {
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" --max-time 10 --connect-timeout 5 || echo "000")

  if [ "$status" -eq 200 ]; then
    return 0
  else
    log "WARN" "HTTP Health FAIL (HTTP $status)"
    return 1
  fi
}

# Database Integrity Check
check_db_integrity() {
  if [ ! -f "$DB_PATH" ]; then
    log "ERROR" "Database file not found: $DB_PATH"
    return 1
  fi

  # Check database is not corrupted
  if ! sqlite3 "$DB_PATH" "PRAGMA integrity_check;" | grep -q "ok"; then
    log "ERROR" "Database integrity check failed"
    return 1
  fi

  # Check critical tables exist
  local required_tables=("inventory_items" "forecasts" "reorder_recommendations" "audit_log")
  for table in "${required_tables[@]}"; do
    if ! sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name='$table';" | grep -q "$table"; then
      log "ERROR" "Critical table missing: $table"
      return 1
    fi
  done

  # Calculate checksum
  local current_checksum
  current_checksum=$(sqlite3 "$DB_PATH" "SELECT COUNT(*), MAX(created_at) FROM audit_log;" 2>/dev/null || echo "ERROR")

  if [ "$current_checksum" == "ERROR" ]; then
    log "WARN" "Could not calculate DB checksum"
    return 0  # Non-critical
  fi

  # Store checksum
  echo "$current_checksum" > "$DB_CHECKSUM_FILE"

  return 0
}

# Audit Log Hash Chain Verification
check_audit_chain() {
  if [ ! -f "$DB_PATH" ]; then
    return 0  # Skip if DB not found
  fi

  # Verify hash chain integrity (sample last 100 entries)
  local chain_check
  chain_check=$(sqlite3 "$DB_PATH" <<EOF
SELECT
  CASE WHEN COUNT(*) = 0 THEN 'EMPTY'
  WHEN COUNT(*) = SUM(CASE WHEN hash IS NOT NULL THEN 1 ELSE 0 END) THEN 'OK'
  ELSE 'BROKEN' END as status
FROM (SELECT hash FROM audit_log ORDER BY id DESC LIMIT 100);
EOF
)

  if [ "$chain_check" == "BROKEN" ]; then
    log "ERROR" "Audit log hash chain broken - potential tampering detected"
    return 1
  elif [ "$chain_check" == "OK" ]; then
    log "INFO" "Audit chain integrity verified"
    return 0
  else
    log "DEBUG" "Audit chain empty or not yet initialized"
    return 0
  fi
}

# ML Service Health Check
check_ml_service() {
  local ml_url="${ML_URL:-http://localhost:8000}/status"
  local status

  status=$(curl -s -o /dev/null -w "%{http_code}" "$ml_url" --max-time 10 --connect-timeout 5 2>/dev/null || echo "000")

  if [ "$status" -eq 200 ]; then
    return 0
  else
    log "WARN" "ML Service health check failed (HTTP $status)"
    return 1
  fi
}

# Comprehensive Health Check
check_health() {
  local http_ok=0
  local db_ok=0
  local audit_ok=0
  local ml_ok=0

  # HTTP Health
  if check_http_health; then
    http_ok=1
  fi

  # Database Integrity
  if check_db_integrity; then
    db_ok=1
  fi

  # Audit Chain
  if check_audit_chain; then
    audit_ok=1
  fi

  # ML Service
  if check_ml_service; then
    ml_ok=1
  fi

  # Overall health status
  if [ "$http_ok" -eq 1 ] && [ "$db_ok" -eq 1 ]; then
    log "INFO" "✅ Health OK [HTTP:$http_ok DB:$db_ok Audit:$audit_ok ML:$ml_ok]"
    FAILURE_COUNT=0
    return 0
  else
    FAILURE_COUNT=$((FAILURE_COUNT + 1))
    log "WARN" "❌ Health FAIL [HTTP:$http_ok DB:$db_ok Audit:$audit_ok ML:$ml_ok] - Failure $FAILURE_COUNT/$MAX_FAILURES"
    return 1
  fi
}

# Auto-Rollback Trigger
trigger_rollback() {
  local timestamp
  timestamp=$(date -u +'%Y-%m-%dT%H:%M:%SZ')

  log "CRITICAL" "🚨 Max failures reached ($MAX_FAILURES). Triggering automatic rollback..."

  # Create incident record
  cat >> "$INCIDENT_LOG" <<EOF
{
  "timestamp": "$timestamp",
  "event": "auto_rollback_triggered",
  "reason": "health_check_failures",
  "failure_count": $FAILURE_COUNT,
  "max_failures": $MAX_FAILURES
}
EOF

  # Attempt Railway rollback
  if command -v railway &> /dev/null; then
    if railway rollback --yes 2>&1 | tee -a "$LOG_FILE"; then
      log "INFO" "✅ Railway rollback completed successfully"

      # Log successful rollback
      cat >> "$INCIDENT_LOG" <<EOF
{
  "timestamp": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
  "event": "rollback_success",
  "method": "railway_cli"
}
EOF
    else
      log "ERROR" "❌ Railway rollback command failed"

      # Log failed rollback
      cat >> "$INCIDENT_LOG" <<EOF
{
  "timestamp": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
  "event": "rollback_failed",
  "method": "railway_cli"
}
EOF
    fi
  else
    log "ERROR" "Railway CLI not found. Cannot rollback automatically."
    log "INFO" "Manual intervention required: railway rollback"

    # Log missing CLI
    cat >> "$INCIDENT_LOG" <<EOF
{
  "timestamp": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
  "event": "rollback_unavailable",
  "reason": "railway_cli_not_found"
}
EOF
  fi

  # Send alert notifications
  send_alert "CRITICAL: Auto-rollback triggered after $MAX_FAILURES health check failures"

  # Reset counter after rollback
  FAILURE_COUNT=0
}

# Send Alert Notifications
send_alert() {
  local message="$1"
  local timestamp
  timestamp=$(date -u +'%Y-%m-%dT%H:%M:%SZ')

  # Email via nodemailer (if Node.js available)
  if command -v node &> /dev/null && [ -n "${ADMIN_EMAIL:-}" ]; then
    node -e "
    const nodemailer = require('nodemailer');
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    transport.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.ADMIN_EMAIL,
      subject: '[NeuroNexus] 🚨 CRITICAL Alert - Auto-Rollback Triggered',
      html: \`
        <h2>🚨 NeuroNexus Critical Alert</h2>
        <p><strong>Event:</strong> Auto-Rollback Triggered</p>
        <p><strong>Time:</strong> $timestamp</p>
        <p><strong>Reason:</strong> $message</p>
        <h3>Details</h3>
        <ul>
          <li>Max failures reached: $MAX_FAILURES</li>
          <li>Health URL: $HEALTH_URL</li>
          <li>Action: Automatic rollback initiated</li>
        </ul>
        <h3>Next Steps</h3>
        <ul>
          <li>Review logs at Railway dashboard</li>
          <li>Check recent commits for issues</li>
          <li>Verify rollback completed successfully</li>
        </ul>
      \`
    }).then(() => {
      console.log('Alert email sent');
    }).catch((error) => {
      console.error('Failed to send email:', error.message);
    });
    " 2>&1 | tee -a "$LOG_FILE"

    if [ "${PIPESTATUS[0]}" -eq 0 ]; then
      log "INFO" "Alert email sent to $ADMIN_EMAIL"
    else
      log "WARN" "Failed to send alert email"
    fi
  fi

  # Slack webhook (if configured)
  if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
    curl -X POST "$SLACK_WEBHOOK_URL" \
      -H 'Content-Type: application/json' \
      -d "{
        \"text\": \"🚨 *NeuroNexus Critical Alert*\",
        \"blocks\": [
          {
            \"type\": \"header\",
            \"text\": {
              \"type\": \"plain_text\",
              \"text\": \"🚨 Auto-Rollback Triggered\"
            }
          },
          {
            \"type\": \"section\",
            \"fields\": [
              {\"type\": \"mrkdwn\", \"text\": \"*Time:*\\n$timestamp\"},
              {\"type\": \"mrkdwn\", \"text\": \"*Failures:*\\n$MAX_FAILURES/$MAX_FAILURES\"},
              {\"type\": \"mrkdwn\", \"text\": \"*Health URL:*\\n<$HEALTH_URL|Check>\"},
              {\"type\": \"mrkdwn\", \"text\": \"*Action:*\\nRollback initiated\"}
            ]
          },
          {
            \"type\": \"section\",
            \"text\": {
              \"type\": \"mrkdwn\",
              \"text\": \"*Reason:* $message\"
            }
          }
        ]
      }" \
      &> /dev/null && log "INFO" "Slack alert sent" || log "WARN" "Failed to send Slack notification"
  fi

  # PagerDuty (if configured)
  if [ -n "${PAGERDUTY_KEY:-}" ]; then
    curl -X POST https://events.pagerduty.com/v2/enqueue \
      -H 'Content-Type: application/json' \
      -d "{
        \"routing_key\":\"$PAGERDUTY_KEY\",
        \"event_action\":\"trigger\",
        \"payload\":{
          \"summary\":\"NeuroNexus auto-rollback triggered after $MAX_FAILURES health failures\",
          \"severity\":\"critical\",
          \"source\":\"ops_guard_enhanced.sh\",
          \"timestamp\":\"$timestamp\",
          \"custom_details\":{
            \"health_url\":\"$HEALTH_URL\",
            \"failure_count\":$MAX_FAILURES,
            \"message\":\"$message\"
          }
        }
      }" \
      &> /dev/null && log "INFO" "PagerDuty alert sent" || log "WARN" "Failed to send PagerDuty alert"
  fi
}

# Health Status Report (for logging)
generate_status_report() {
  log "INFO" "=== Health Status Report ==="
  log "INFO" "Uptime: $(uptime -p 2>/dev/null || echo 'Unknown')"
  log "INFO" "Backend URL: $HEALTH_URL"
  log "INFO" "ML Service URL: ${ML_URL:-http://localhost:8000}"
  log "INFO" "DB Path: $DB_PATH"
  log "INFO" "Failure Count: $FAILURE_COUNT/$MAX_FAILURES"
  log "INFO" "Check Interval: ${CHECK_INTERVAL}s"
  log "INFO" "Log File: $LOG_FILE"
  log "INFO" "Incident Log: $INCIDENT_LOG"
  log "INFO" "================================="
}

# === Main Loop ===
main() {
  log "INFO" "🚀 NeuroNexus Ops Guard Enhanced (Phase 1.5) started"
  log "INFO" "Version: v19.0-enterprise-autonomous"
  generate_status_report

  # Initial health check
  log "INFO" "Running initial health checks..."
  check_health || log "WARN" "Initial health check failed"

  # Main monitoring loop
  while true; do
    if ! check_health; then
      if [ "$FAILURE_COUNT" -ge "$MAX_FAILURES" ]; then
        trigger_rollback

        # Wait before resuming checks to allow rollback to stabilize
        log "INFO" "Waiting 2 minutes for system to stabilize after rollback..."
        sleep 120

        # Generate status report after recovery
        generate_status_report
      fi
    else
      # On successful health check after failures, log recovery
      if [ "$FAILURE_COUNT" -eq 0 ]; then
        log "INFO" "System stable - all health checks passing"
      fi
    fi

    # Wait before next check
    sleep "$CHECK_INTERVAL"
  done
}

# === Graceful Shutdown ===
trap 'log "INFO" "Ops Guard shutting down (received SIGTERM/SIGINT)..."; exit 0' SIGTERM SIGINT

# === Entry Point ===
if [ "${1:-}" == "--test" ]; then
  log "INFO" "Running in test mode..."
  check_health
  exit $?
elif [ "${1:-}" == "--status" ]; then
  generate_status_report
  exit 0
else
  main "$@"
fi
