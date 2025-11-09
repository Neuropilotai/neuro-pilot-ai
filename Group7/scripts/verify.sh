#!/usr/bin/env bash
set -euo pipefail

# Pretty header
line() { printf "%s\n" "──────────────────────────────────────────────────────────"; }

echo "▶ Step 1: Environment Check"; line
node scripts/env-check.mjs || { echo "❌ Environment check failed! Fix .env then retry."; exit 1; }
echo "✅ Environment OK"; echo

echo "▶ Step 2: D-ID API Validation"; line
node scripts/did-render.mjs --validate || { echo "❌ D-ID validation failed! Check DID_API_KEY in .env"; exit 1; }
echo "✅ D-ID API OK"; echo

echo "▶ Step 3: Shotstack API Validation"; line
node scripts/shotstack-render.mjs validate || { echo "❌ Shotstack validation failed! Check SHOTSTACK_API_KEY"; exit 1; }
echo "✅ Shotstack API OK"; echo

echo "▶ Step 4: System Heartbeat"; line
node ops/monitor/heartbeat.mjs || echo "⚠️  Warning: Some services reported degraded status"
echo "✅ Heartbeat complete"; echo

read -p "Run full E2E test now? (This generates a real video) [y/N]: " -n 1 -r; echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "▶ Step 5: Full E2E Test"; line
  node ops/run-one-did.mjs \
    --agent Lyra \
    --slug "verification_$(date +%Y%m%d_%H%M%S)" \
    --hook "Group7 verification test" \
    --insight "End-to-end pipeline working perfectly" \
    --cta "Follow Group7 for daily AI insights" || {
      echo "❌ E2E test failed! Check logs in Production/logs/"; exit 1;
    }
  echo "✅ E2E test passed"; echo
  echo "📹 Most recent video:"; ls -1t Production/Video/*.mp4 2>/dev/null | head -1 || echo "No videos found"
  echo "📊 Latest log:"; ls -1t Production/logs/*.json 2>/dev/null | head -1 || echo "No logs found"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ VERIFICATION COMPLETE!"
echo "System Status: READY FOR PRODUCTION ✓"
echo
echo "Next steps:"
echo "  1) Schedule cron:      crontab cron.sh"
echo "  2) Single video:       npm run run:one:did -- --agent Lyra"
echo "  3) Monitor status:     npm run monitor:status"
echo "  4) Tail logs:          tail -f Production/logs/cron_*.log"
echo
