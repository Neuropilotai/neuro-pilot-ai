#!/usr/bin/env bash
set -euo pipefail

# analyze_benchmark.sh
# Parses k6 benchmark results and exports metrics to Grafana
# Analyzes latency, error rates, throughput, and cache performance

echo "📊 NeuroPilot v17.1 Benchmark Analysis"
echo "======================================"
echo ""

# ================================================================
# CONFIGURATION
# ================================================================
RESULT_FILE="${1:-}"
OUTPUT_DIR="./benchmarks/analysis"
GRAFANA_URL="${GRAFANA_URL:-}"
GRAFANA_API_KEY="${GRAFANA_API_KEY:-}"

if [ -z "$RESULT_FILE" ]; then
    echo "❌ Usage: $0 <benchmark_result.json>"
    echo ""
    echo "Example:"
    echo "  $0 benchmarks/results/benchmark_20250123_143022.json"
    exit 1
fi

if [ ! -f "$RESULT_FILE" ]; then
    echo "❌ File not found: $RESULT_FILE"
    exit 1
fi

mkdir -p "$OUTPUT_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ANALYSIS_FILE="$OUTPUT_DIR/analysis_$TIMESTAMP.txt"

echo "Configuration:"
echo "  Input: $RESULT_FILE"
echo "  Output: $ANALYSIS_FILE"
echo "  Grafana: ${GRAFANA_URL:-Not configured}"
echo ""

# ================================================================
# EXTRACT METRICS
# ================================================================
echo "1️⃣  Extracting metrics from k6 results..."

# Total requests
TOTAL_REQUESTS=$(jq '[select(.type=="Point" and .metric=="http_reqs")] | length' "$RESULT_FILE")

# HTTP request duration (latency)
LATENCIES=$(jq -r '[select(.type=="Point" and .metric=="http_req_duration")] | map(.data.value) | sort | @json' "$RESULT_FILE")

if [ "$LATENCIES" != "[]" ]; then
    AVG_LATENCY=$(echo "$LATENCIES" | jq 'add / length')
    P50_LATENCY=$(echo "$LATENCIES" | jq 'length as $len | if $len > 0 then .[$len * 50 / 100 | floor] else 0 end')
    P95_LATENCY=$(echo "$LATENCIES" | jq 'length as $len | if $len > 0 then .[$len * 95 / 100 | floor] else 0 end')
    P99_LATENCY=$(echo "$LATENCIES" | jq 'length as $len | if $len > 0 then .[$len * 99 / 100 | floor] else 0 end')
    MIN_LATENCY=$(echo "$LATENCIES" | jq 'min')
    MAX_LATENCY=$(echo "$LATENCIES" | jq 'max')
else
    AVG_LATENCY=0
    P50_LATENCY=0
    P95_LATENCY=0
    P99_LATENCY=0
    MIN_LATENCY=0
    MAX_LATENCY=0
fi

# Error metrics
FAILED_REQUESTS=$(jq '[select(.type=="Point" and .metric=="http_req_failed" and .data.value==1)] | length' "$RESULT_FILE" || echo "0")
ERROR_RATE=$(echo "scale=2; $FAILED_REQUESTS / $TOTAL_REQUESTS * 100" | bc -l)

# Success rate
SUCCESS_REQUESTS=$((TOTAL_REQUESTS - FAILED_REQUESTS))
SUCCESS_RATE=$(echo "scale=2; $SUCCESS_REQUESTS / $TOTAL_REQUESTS * 100" | bc -l)

# Throughput (requests per second)
TEST_DURATION=$(jq '[select(.type=="Point" and .metric=="http_req_duration")] | map(.data.time | fromdate) | (max - min)' "$RESULT_FILE" || echo "60")
if [ "$TEST_DURATION" -eq 0 ]; then
    TEST_DURATION=60
fi
THROUGHPUT=$(echo "scale=2; $TOTAL_REQUESTS / $TEST_DURATION" | bc -l)

# Data transferred
DATA_SENT=$(jq '[select(.type=="Point" and .metric=="data_sent")] | map(.data.value) | add' "$RESULT_FILE" || echo "0")
DATA_RECEIVED=$(jq '[select(.type=="Point" and .metric=="data_received")] | map(.data.value) | add' "$RESULT_FILE" || echo "0")

# Convert bytes to MB
DATA_SENT_MB=$(echo "scale=2; $DATA_SENT / 1024 / 1024" | bc -l)
DATA_RECEIVED_MB=$(echo "scale=2; $DATA_RECEIVED / 1024 / 1024" | bc -l)

echo "✅ Metrics extracted"
echo ""

# ================================================================
# GENERATE ANALYSIS REPORT
# ================================================================
echo "2️⃣  Generating analysis report..."

cat > "$ANALYSIS_FILE" << EOF
======================================"
NeuroPilot v17.1 Benchmark Analysis
======================================"
Date: $(date)
Input: $RESULT_FILE

----------------------------------
📊 PERFORMANCE SUMMARY
----------------------------------
Total Requests:       $TOTAL_REQUESTS
Test Duration:        ${TEST_DURATION}s
Throughput:           ${THROUGHPUT} req/s

----------------------------------
⚡ LATENCY METRICS
----------------------------------
Average:              ${AVG_LATENCY}ms
Median (p50):         ${P50_LATENCY}ms
95th Percentile:      ${P95_LATENCY}ms
99th Percentile:      ${P99_LATENCY}ms
Min:                  ${MIN_LATENCY}ms
Max:                  ${MAX_LATENCY}ms

----------------------------------
✅ SUCCESS/ERROR RATES
----------------------------------
Successful Requests:  $SUCCESS_REQUESTS (${SUCCESS_RATE}%)
Failed Requests:      $FAILED_REQUESTS (${ERROR_RATE}%)

----------------------------------
📡 DATA TRANSFER
----------------------------------
Data Sent:            ${DATA_SENT_MB} MB
Data Received:        ${DATA_RECEIVED_MB} MB
Total Transfer:       $(echo "scale=2; $DATA_SENT_MB + $DATA_RECEIVED_MB" | bc -l) MB

----------------------------------
🎯 THRESHOLD VALIDATION
----------------------------------
EOF

# Check thresholds
THRESHOLD_PASS=true

if [ "$(echo "$P95_LATENCY < 400" | bc -l)" -eq 1 ]; then
    echo "✅ p95 latency < 400ms:     PASS (${P95_LATENCY}ms)" >> "$ANALYSIS_FILE"
else
    echo "❌ p95 latency < 400ms:     FAIL (${P95_LATENCY}ms)" >> "$ANALYSIS_FILE"
    THRESHOLD_PASS=false
fi

if [ "$(echo "$ERROR_RATE < 5" | bc -l)" -eq 1 ]; then
    echo "✅ Error rate < 5%:         PASS (${ERROR_RATE}%)" >> "$ANALYSIS_FILE"
else
    echo "❌ Error rate < 5%:         FAIL (${ERROR_RATE}%)" >> "$ANALYSIS_FILE"
    THRESHOLD_PASS=false
fi

if [ "$(echo "$THROUGHPUT > 50" | bc -l)" -eq 1 ]; then
    echo "✅ Throughput > 50 req/s:   PASS (${THROUGHPUT} req/s)" >> "$ANALYSIS_FILE"
else
    echo "⚠️  Throughput > 50 req/s:   WARN (${THROUGHPUT} req/s)" >> "$ANALYSIS_FILE"
fi

cat >> "$ANALYSIS_FILE" << EOF

----------------------------------
📈 RECOMMENDATIONS
----------------------------------
EOF

# Generate recommendations based on metrics
if [ "$(echo "$P95_LATENCY > 300" | bc -l)" -eq 1 ]; then
    echo "⚠️  High latency detected. Consider:" >> "$ANALYSIS_FILE"
    echo "   - Enable CDN caching for static assets" >> "$ANALYSIS_FILE"
    echo "   - Add database query optimization" >> "$ANALYSIS_FILE"
    echo "   - Enable compression (Brotli)" >> "$ANALYSIS_FILE"
    echo "" >> "$ANALYSIS_FILE"
fi

if [ "$(echo "$ERROR_RATE > 1" | bc -l)" -eq 1 ]; then
    echo "⚠️  Elevated error rate. Check:" >> "$ANALYSIS_FILE"
    echo "   - Backend logs for 5xx errors" >> "$ANALYSIS_FILE"
    echo "   - Database connection pool size" >> "$ANALYSIS_FILE"
    echo "   - Rate limiting configuration" >> "$ANALYSIS_FILE"
    echo "" >> "$ANALYSIS_FILE"
fi

if [ "$(echo "$THROUGHPUT < 100" | bc -l)" -eq 1 ]; then
    echo "⚠️  Low throughput. Consider:" >> "$ANALYSIS_FILE"
    echo "   - Scale horizontally (add more instances)" >> "$ANALYSIS_FILE"
    echo "   - Optimize database queries" >> "$ANALYSIS_FILE"
    echo "   - Enable HTTP/2 or HTTP/3" >> "$ANALYSIS_FILE"
    echo "" >> "$ANALYSIS_FILE"
fi

if [ "$THRESHOLD_PASS" = true ]; then
    echo "✅ All thresholds passed. System performing well." >> "$ANALYSIS_FILE"
else
    echo "❌ Some thresholds failed. Review recommendations above." >> "$ANALYSIS_FILE"
fi

cat >> "$ANALYSIS_FILE" << EOF

======================================"
End of Analysis Report
======================================"
EOF

echo "✅ Analysis report generated"
echo ""

# Display report
cat "$ANALYSIS_FILE"
echo ""

# ================================================================
# EXPORT TO GRAFANA
# ================================================================
if [ -n "$GRAFANA_URL" ] && [ -n "$GRAFANA_API_KEY" ]; then
    echo "3️⃣  Exporting metrics to Grafana..."

    # Create metrics payload
    GRAFANA_PAYLOAD=$(cat <<EOF
{
  "metrics": [
    {
      "name": "neuropilot.benchmark.latency_avg",
      "value": $AVG_LATENCY,
      "timestamp": $(date +%s),
      "tags": {"source": "k6", "version": "v17.1"}
    },
    {
      "name": "neuropilot.benchmark.latency_p95",
      "value": $P95_LATENCY,
      "timestamp": $(date +%s),
      "tags": {"source": "k6", "version": "v17.1"}
    },
    {
      "name": "neuropilot.benchmark.latency_p99",
      "value": $P99_LATENCY,
      "timestamp": $(date +%s),
      "tags": {"source": "k6", "version": "v17.1"}
    },
    {
      "name": "neuropilot.benchmark.error_rate",
      "value": $ERROR_RATE,
      "timestamp": $(date +%s),
      "tags": {"source": "k6", "version": "v17.1"}
    },
    {
      "name": "neuropilot.benchmark.throughput",
      "value": $THROUGHPUT,
      "timestamp": $(date +%s),
      "tags": {"source": "k6", "version": "v17.1"}
    },
    {
      "name": "neuropilot.benchmark.total_requests",
      "value": $TOTAL_REQUESTS,
      "timestamp": $(date +%s),
      "tags": {"source": "k6", "version": "v17.1"}
    }
  ]
}
EOF
)

    # Send to Grafana
    GRAFANA_RESPONSE=$(curl -sS -X POST "$GRAFANA_URL/api/v1/push" \
        -H "Authorization: Bearer $GRAFANA_API_KEY" \
        -H "Content-Type: application/json" \
        -d "$GRAFANA_PAYLOAD" || echo "FAILED")

    if [ "$GRAFANA_RESPONSE" != "FAILED" ]; then
        echo "✅ Metrics exported to Grafana"
    else
        echo "❌ Failed to export metrics to Grafana"
    fi
    echo ""
fi

# ================================================================
# SAVE SUMMARY JSON
# ================================================================
echo "4️⃣  Saving summary JSON..."

SUMMARY_JSON="$OUTPUT_DIR/summary_$TIMESTAMP.json"
cat > "$SUMMARY_JSON" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "version": "v17.1",
  "test_duration_seconds": $TEST_DURATION,
  "total_requests": $TOTAL_REQUESTS,
  "throughput_req_per_sec": $THROUGHPUT,
  "latency": {
    "avg_ms": $AVG_LATENCY,
    "p50_ms": $P50_LATENCY,
    "p95_ms": $P95_LATENCY,
    "p99_ms": $P99_LATENCY,
    "min_ms": $MIN_LATENCY,
    "max_ms": $MAX_LATENCY
  },
  "success": {
    "requests": $SUCCESS_REQUESTS,
    "rate_percent": $SUCCESS_RATE
  },
  "errors": {
    "requests": $FAILED_REQUESTS,
    "rate_percent": $ERROR_RATE
  },
  "data_transfer": {
    "sent_mb": $DATA_SENT_MB,
    "received_mb": $DATA_RECEIVED_MB
  },
  "thresholds": {
    "p95_latency_400ms": $([ "$(echo "$P95_LATENCY < 400" | bc -l)" -eq 1 ] && echo "true" || echo "false"),
    "error_rate_5pct": $([ "$(echo "$ERROR_RATE < 5" | bc -l)" -eq 1 ] && echo "true" || echo "false"),
    "overall_pass": $([ "$THRESHOLD_PASS" = true ] && echo "true" || echo "false")
  }
}
EOF

echo "✅ Summary saved to $SUMMARY_JSON"
echo ""

# ================================================================
# SUMMARY
# ================================================================
echo "======================================"
echo "📊 Analysis Complete"
echo "======================================"
echo ""
echo "📁 Files generated:"
echo "  - Analysis report: $ANALYSIS_FILE"
echo "  - Summary JSON:    $SUMMARY_JSON"
echo ""

if [ "$THRESHOLD_PASS" = true ]; then
    echo "✅ All performance thresholds met"
    echo ""
    exit 0
else
    echo "⚠️  Some performance thresholds not met"
    echo "   Review recommendations in: $ANALYSIS_FILE"
    echo ""
    exit 1
fi
