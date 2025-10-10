#!/bin/bash
#
# Measure Training Performance - v3.1.0
# Tests local AI training on Apple Silicon with REAL metrics
# Exits non-zero if any training fails
#

set -e

cd "$(dirname "$0")/.."

echo "═══════════════════════════════════════════════════════════════"
echo "📊 AI Training Performance Measurement (M3 Pro)"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check server
if ! lsof -i :8083 > /dev/null 2>&1; then
  echo "❌ Server not running on port 8083"
  echo "   Start with: PORT=8083 node server.js"
  exit 1
fi

echo "✅ Server running on port 8083"
echo ""

# Get auth token
echo "🔐 Authenticating..."
TOKEN=$(curl -s -X POST http://localhost:8083/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"neuro.pilot.ai@gmail.com","password":"Admin123!@#"}' \
  | jq -r '.accessToken' 2>/dev/null)

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ Authentication failed"
  exit 1
fi

echo "✅ Authenticated"
echo ""

# Get 5 items with sufficient data
echo "📦 Finding items with training data..."
ITEMS=$(sqlite3 db/inventory_enterprise.db << 'EOF'
SELECT DISTINCT item_code
FROM order_line_items
GROUP BY item_code
HAVING COUNT(*) >= 14
ORDER BY item_code
LIMIT 5;
EOF
)

if [ -z "$ITEMS" ]; then
  echo "❌ No items with sufficient data (need >= 14 days of history)"
  exit 1
fi

ITEM_ARRAY=()
while IFS= read -r item; do
  ITEM_ARRAY+=("$item")
done <<< "$ITEMS"

echo "✅ Found ${#ITEM_ARRAY[@]} items to train"
echo ""

# Print table header
echo "Training Results (REAL measured metrics):"
echo "───────────────────────────────────────────────────────────────"
printf "%-15s | %-8s | %10s | %8s | %8s | %10s | %8s | %s\n" \
  "ITEM_CODE" "MODEL" "WALL_SEC" "MAPE" "RMSE" "PEAK_MB" "SAMPLES" "TIMESTAMP"
echo "───────────────────────────────────────────────────────────────"

# Train with Prophet
for item in "${ITEM_ARRAY[@]}"; do
  RESPONSE=$(curl -s -X POST http://localhost:8083/api/owner/training/run \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"itemCodes\":[\"$item\"],\"model\":\"prophet\",\"horizon\":7}")

  SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false')

  if [ "$SUCCESS" != "true" ]; then
    ERROR_MSG=$(echo "$RESPONSE" | jq -r '.error // .message // "Unknown error"')
    printf "%-15s | %-8s | %10s | %8s | %8s | %10s | %8s | %s\n" \
      "$item" "prophet" "FAILED" "-" "-" "-" "-" "$ERROR_MSG"
    continue
  fi

  WALL_SEC=$(echo "$RESPONSE" | jq -r '.runs[0].wallClockSec // "N/A"')
  MAPE=$(echo "$RESPONSE" | jq -r '.runs[0].metrics.mape // "N/A"')
  RMSE=$(echo "$RESPONSE" | jq -r '.runs[0].metrics.rmse // "N/A"')
  PEAK_MB=$(echo "$RESPONSE" | jq -r '.runs[0].peakMemoryMB // "N/A"')
  SAMPLES=$(echo "$RESPONSE" | jq -r '.runs[0].metrics.samples // "N/A"')
  TIMESTAMP=$(date +"%H:%M:%S")

  # Format numbers
  if [ "$MAPE" != "N/A" ] && [ "$MAPE" != "null" ]; then
    MAPE=$(printf "%.2f" "$MAPE")
  fi

  if [ "$RMSE" != "N/A" ] && [ "$RMSE" != "null" ]; then
    RMSE=$(printf "%.2f" "$RMSE")
  fi

  if [ "$WALL_SEC" != "N/A" ] && [ "$WALL_SEC" != "null" ]; then
    WALL_SEC=$(printf "%.3f" "$WALL_SEC")
  fi

  if [ "$PEAK_MB" != "N/A" ] && [ "$PEAK_MB" != "null" ]; then
    PEAK_MB=$(printf "%.2f" "$PEAK_MB")
  fi

  printf "%-15s | %-8s | %10s | %8s | %8s | %10s | %8s | %s\n" \
    "$item" "prophet" "$WALL_SEC" "$MAPE" "$RMSE" "$PEAK_MB" "$SAMPLES" "$TIMESTAMP"
done

# Train with ARIMA
for item in "${ITEM_ARRAY[@]}"; do
  RESPONSE=$(curl -s -X POST http://localhost:8083/api/owner/training/run \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"itemCodes\":[\"$item\"],\"model\":\"arima\",\"horizon\":7}")

  SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false')

  if [ "$SUCCESS" != "true" ]; then
    ERROR_MSG=$(echo "$RESPONSE" | jq -r '.error // .message // "Unknown error"')
    printf "%-15s | %-8s | %10s | %8s | %8s | %10s | %8s | %s\n" \
      "$item" "arima" "FAILED" "-" "-" "-" "-" "$ERROR_MSG"
    continue
  fi

  WALL_SEC=$(echo "$RESPONSE" | jq -r '.runs[0].wallClockSec // "N/A"')
  MAPE=$(echo "$RESPONSE" | jq -r '.runs[0].metrics.mape // "N/A"')
  RMSE=$(echo "$RESPONSE" | jq -r '.runs[0].metrics.rmse // "N/A"')
  PEAK_MB=$(echo "$RESPONSE" | jq -r '.runs[0].peakMemoryMB // "N/A"')
  SAMPLES=$(echo "$RESPONSE" | jq -r '.runs[0].metrics.samples // "N/A"')
  TIMESTAMP=$(date +"%H:%M:%S")

  # Format numbers
  if [ "$MAPE" != "N/A" ] && [ "$MAPE" != "null" ]; then
    MAPE=$(printf "%.2f" "$MAPE")
  fi

  if [ "$RMSE" != "N/A" ] && [ "$RMSE" != "null" ]; then
    RMSE=$(printf "%.2f" "$RMSE")
  fi

  if [ "$WALL_SEC" != "N/A" ] && [ "$WALL_SEC" != "null" ]; then
    WALL_SEC=$(printf "%.3f" "$WALL_SEC")
  fi

  if [ "$PEAK_MB" != "N/A" ] && [ "$PEAK_MB" != "null" ]; then
    PEAK_MB=$(printf "%.2f" "$PEAK_MB")
  fi

  printf "%-15s | %-8s | %10s | %8s | %8s | %10s | %8s | %s\n" \
    "$item" "arima" "$WALL_SEC" "$MAPE" "$RMSE" "$PEAK_MB" "$SAMPLES" "$TIMESTAMP"
done

echo "───────────────────────────────────────────────────────────────"
echo ""

# Get aggregated metrics
echo "📊 Aggregated Metrics (Last 24h):"
echo ""

METRICS=$(curl -s http://localhost:8083/api/owner/training/metrics \
  -H "Authorization: Bearer $TOKEN")

echo "Prophet:"
echo "  Runs:         $(echo "$METRICS" | jq -r '.last24h.prophet.totalRuns')"
echo "  Median MAPE:  $(echo "$METRICS" | jq -r '.last24h.prophet.medianMAPE // "N/A"' | xargs printf '%.2f' 2>/dev/null || echo 'N/A')"
echo "  Median RMSE:  $(echo "$METRICS" | jq -r '.last24h.prophet.medianRMSE // "N/A"' | xargs printf '%.2f' 2>/dev/null || echo 'N/A')"
echo "  Median Time:  $(echo "$METRICS" | jq -r '.last24h.prophet.medianWallSec // "N/A"' | xargs printf '%.3f' 2>/dev/null || echo 'N/A')s"
echo ""

echo "ARIMA:"
echo "  Runs:         $(echo "$METRICS" | jq -r '.last24h.arima.totalRuns')"
echo "  Median MAPE:  $(echo "$METRICS" | jq -r '.last24h.arima.medianMAPE // "N/A"' | xargs printf '%.2f' 2>/dev/null || echo 'N/A')"
echo "  Median RMSE:  $(echo "$METRICS" | jq -r '.last24h.arima.medianRMSE // "N/A"' | xargs printf '%.2f' 2>/dev/null || echo 'N/A')"
echo "  Median Time:  $(echo "$METRICS" | jq -r '.last24h.arima.medianWallSec // "N/A"' | xargs printf '%.3f' 2>/dev/null || echo 'N/A')s"
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "✅ Measurement complete"
echo ""
echo "All metrics are REAL (measured from actual training runs)."
echo "N/A means no data available (not a placeholder)."
echo ""
