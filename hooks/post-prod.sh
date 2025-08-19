#!/usr/bin/env bash
set -Eeuo pipefail

ENV="$1"
APP="$2"

echo "🔍 Post-${ENV} verification for ${APP}"
echo "==========================================="

# Get the latest backup directory
LATEST_BACKUP=$(ls -1t "./backups/${ENV}" 2>/dev/null | head -1)

if [[ -n "${LATEST_BACKUP}" ]]; then
  echo "📦 Latest backup: ./backups/${ENV}/${LATEST_BACKUP}"
  echo "   Size: $(du -sh "./backups/${ENV}/${LATEST_BACKUP}" | cut -f1)"
  echo "   Files: $(ls -1 "./backups/${ENV}/${LATEST_BACKUP}" | wc -l)"
fi

# Verify app is running
echo ""
echo "🚀 Verifying deployment..."
APP_URL="https://${APP}.fly.dev"

# Check health endpoint
if curl -f -s -o /dev/null -w "%{http_code}" "${APP_URL}/health" | grep -q "200"; then
  echo "✅ Health check: PASSED"
else
  echo "⚠️  Health check: FAILED or TIMEOUT"
fi

# Check main page
if curl -f -s -o /dev/null -w "%{http_code}" "${APP_URL}" | grep -q -E "200|301|302"; then
  echo "✅ Main page: ACCESSIBLE"
else
  echo "⚠️  Main page: NOT ACCESSIBLE"
fi

# Optional: Send notification
# Uncomment and configure as needed:

# Slack notification (requires webhook URL)
# if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
#   curl -X POST "${SLACK_WEBHOOK_URL}" \
#     -H 'Content-Type: application/json' \
#     -d "{\"text\":\"✅ ${ENV} deployment complete for ${APP}\"}"
# fi

# Email notification (requires mail configured)
# if command -v mail >/dev/null 2>&1; then
#   echo "Deployment of ${APP} to ${ENV} completed at $(date)" | \
#     mail -s "Deployment Success: ${APP} (${ENV})" admin@example.com
# fi

# Discord webhook
# if [[ -n "${DISCORD_WEBHOOK_URL:-}" ]]; then
#   curl -X POST "${DISCORD_WEBHOOK_URL}" \
#     -H 'Content-Type: application/json' \
#     -d "{\"content\":\"✅ **${ENV}** deployment complete for **${APP}**\"}"
# fi

echo ""
echo "📊 Deployment Summary:"
echo "  Environment: ${ENV}"
echo "  App: ${APP}"
echo "  URL: ${APP_URL}"
echo "  Status: DEPLOYED"
echo "  Time: $(date)"

# Log deployment to history file
DEPLOY_LOG="./deployments.log"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] ${ENV} deployment of ${APP} completed" >> "${DEPLOY_LOG}"

echo ""
echo "✅ Post-deployment verification complete"