#!/usr/bin/env bash
set -euo pipefail

# run_benchmark.sh
# Load testing with k6 for NeuroPilot v17.1
# Tests: 100 virtual users, 60s duration, realistic traffic patterns

echo "🚀 NeuroPilot v17.1 Load Testing"
echo "================================="
echo ""

# ================================================================
# CONFIGURATION
# ================================================================
API_URL="${API_URL:-https://api.neuropilot.ai}"
FRONTEND_URL="${FRONTEND_URL:-https://inventory.neuropilot.ai}"
DURATION="${DURATION:-60s}"
VUS="${VUS:-100}"
OUTPUT_DIR="${OUTPUT_DIR:-./benchmarks/results}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULT_FILE="$OUTPUT_DIR/benchmark_$TIMESTAMP.json"

mkdir -p "$OUTPUT_DIR"

echo "Configuration:"
echo "  API URL: $API_URL"
echo "  Frontend URL: $FRONTEND_URL"
echo "  Duration: $DURATION"
echo "  Virtual Users: $VUS"
echo "  Output: $RESULT_FILE"
echo ""

# ================================================================
# CHECK DEPENDENCIES
# ================================================================
echo "1️⃣  Checking dependencies..."

if ! command -v k6 &> /dev/null; then
    echo "❌ k6 not installed"
    echo ""
    echo "Install k6:"
    echo "  macOS: brew install k6"
    echo "  Linux: sudo apt install k6"
    echo "  Docker: docker pull grafana/k6"
    echo ""
    exit 1
fi

echo "✅ k6 installed: $(k6 version | head -1)"
echo ""

# ================================================================
# GENERATE K6 TEST SCRIPT
# ================================================================
echo "2️⃣  Generating k6 test script..."

cat > "$OUTPUT_DIR/load_test.js" << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const latencyTrend = new Trend('latency');
const successRate = new Rate('success');
const apiCalls = new Counter('api_calls');

// Test configuration
export const options = {
  stages: [
    { duration: '10s', target: 20 },   // Ramp up to 20 users
    { duration: '20s', target: 50 },   // Ramp up to 50 users
    { duration: '20s', target: 100 },  // Ramp up to 100 users
    { duration: '10s', target: 0 },    // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<400'],  // 95% of requests < 400ms
    http_req_failed: ['rate<0.05'],    // Error rate < 5%
    errors: ['rate<0.05'],
  },
};

const API_URL = __ENV.API_URL || 'https://api.neuropilot.ai';
const FRONTEND_URL = __ENV.FRONTEND_URL || 'https://inventory.neuropilot.ai';

// Test data
const testUser = {
  email: 'loadtest@neuropilot.ai',
  password: 'LoadTest123!',
};

let authToken = null;

export function setup() {
  // Attempt to login (may not exist in production)
  const loginRes = http.post(`${API_URL}/api/auth/login`, JSON.stringify(testUser), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (loginRes.status === 200) {
    const body = JSON.parse(loginRes.body);
    return { token: body.token };
  }

  return { token: null };
}

export default function(data) {
  authToken = data.token;

  // Test 1: Health Check (20% of requests)
  if (Math.random() < 0.2) {
    const healthRes = http.get(`${API_URL}/health`);
    check(healthRes, {
      'health check is 200': (r) => r.status === 200,
      'health check < 100ms': (r) => r.timings.duration < 100,
    });

    errorRate.add(healthRes.status !== 200);
    successRate.add(healthRes.status === 200);
    latencyTrend.add(healthRes.timings.duration);
    apiCalls.add(1);
  }

  // Test 2: Frontend Assets (30% of requests)
  if (Math.random() < 0.3) {
    const frontendRes = http.get(`${FRONTEND_URL}/app.js`);
    check(frontendRes, {
      'frontend is 200': (r) => r.status === 200,
      'frontend has cache header': (r) => r.headers['Cf-Cache-Status'] !== undefined,
    });

    errorRate.add(frontendRes.status !== 200);
    successRate.add(frontendRes.status === 200);
    latencyTrend.add(frontendRes.timings.duration);
  }

  // Test 3: API Items List (25% of requests, requires auth)
  if (Math.random() < 0.25 && authToken) {
    const itemsRes = http.get(`${API_URL}/api/items`, {
      headers: { 'Authorization': `Bearer ${authToken}` },
    });
    check(itemsRes, {
      'items list is 200': (r) => r.status === 200,
      'items list < 300ms': (r) => r.timings.duration < 300,
    });

    errorRate.add(itemsRes.status !== 200);
    successRate.add(itemsRes.status === 200);
    latencyTrend.add(itemsRes.timings.duration);
    apiCalls.add(1);
  }

  // Test 4: API Forecast (15% of requests, requires auth)
  if (Math.random() < 0.15 && authToken) {
    const forecastRes = http.get(`${API_URL}/api/forecast/ai/forecast`, {
      headers: { 'Authorization': `Bearer ${authToken}` },
    });
    check(forecastRes, {
      'forecast is 200 or 401': (r) => r.status === 200 || r.status === 401,
    });

    errorRate.add(forecastRes.status >= 500);
    successRate.add(forecastRes.status < 400);
    latencyTrend.add(forecastRes.timings.duration);
    apiCalls.add(1);
  }

  // Test 5: Governance Dashboard (10% of requests, requires auth)
  if (Math.random() < 0.1 && authToken) {
    const govRes = http.get(`${API_URL}/api/governance/status`, {
      headers: { 'Authorization': `Bearer ${authToken}` },
    });
    check(govRes, {
      'governance is 200 or 401': (r) => r.status === 200 || r.status === 401,
    });

    errorRate.add(govRes.status >= 500);
    successRate.add(govRes.status < 400);
    latencyTrend.add(govRes.timings.duration);
    apiCalls.add(1);
  }

  sleep(1); // Think time between requests
}

export function teardown(data) {
  console.log('Load test complete');
}
EOF

echo "✅ k6 test script generated"
echo ""

# ================================================================
# RUN BENCHMARK
# ================================================================
echo "3️⃣  Running load test..."
echo "   Duration: $DURATION"
echo "   Virtual Users: $VUS"
echo ""

k6 run \
  --vus "$VUS" \
  --duration "$DURATION" \
  --out json="$RESULT_FILE" \
  --env API_URL="$API_URL" \
  --env FRONTEND_URL="$FRONTEND_URL" \
  "$OUTPUT_DIR/load_test.js"

echo ""
echo "✅ Load test complete"
echo ""

# ================================================================
# GENERATE SUMMARY
# ================================================================
echo "4️⃣  Generating summary..."

if [ -f "$RESULT_FILE" ]; then
    # Extract key metrics from JSON
    TOTAL_REQUESTS=$(jq '[select(.type=="Point" and .metric=="http_reqs")] | length' "$RESULT_FILE")
    AVG_LATENCY=$(jq '[select(.type=="Point" and .metric=="http_req_duration")] | map(.data.value) | add / length' "$RESULT_FILE" 2>/dev/null || echo "0")
    ERROR_COUNT=$(jq '[select(.type=="Point" and .metric=="http_req_failed" and .data.value==1)] | length' "$RESULT_FILE" 2>/dev/null || echo "0")

    echo "📊 Performance Summary:"
    echo "  Total Requests: $TOTAL_REQUESTS"
    echo "  Avg Latency: ${AVG_LATENCY}ms"
    echo "  Errors: $ERROR_COUNT"
    echo ""

    # Calculate error rate
    if [ "$TOTAL_REQUESTS" -gt 0 ]; then
        ERROR_RATE=$(echo "scale=2; $ERROR_COUNT / $TOTAL_REQUESTS * 100" | bc)
        echo "  Error Rate: ${ERROR_RATE}%"
    fi

    echo ""
    echo "📁 Full results: $RESULT_FILE"
    echo ""

    # Check if results meet thresholds
    if [ "$(echo "$AVG_LATENCY < 400" | bc)" -eq 1 ] && [ "$(echo "$ERROR_RATE < 5" | bc)" -eq 1 ]; then
        echo "✅ Performance meets thresholds (p95 < 400ms, errors < 5%)"
    else
        echo "⚠️  Performance does not meet thresholds"
        echo "   Target: p95 < 400ms, errors < 5%"
        echo "   Actual: p95 = ${AVG_LATENCY}ms, errors = ${ERROR_RATE}%"
    fi
else
    echo "⚠️  No results file generated"
fi

echo ""
echo "🎯 Next Steps:"
echo "  1. Analyze results: ./scripts/analyze_benchmark.sh $RESULT_FILE"
echo "  2. Upload to Grafana: ./monitoring/grafana-import.sh"
echo "  3. Compare with baseline: diff benchmarks/baseline.json $RESULT_FILE"
echo ""

# ================================================================
# EXPORT METRICS (if Grafana Cloud configured)
# ================================================================
if [ -n "${GRAFANA_API_KEY:-}" ]; then
    echo "5️⃣  Uploading to Grafana Cloud..."
    ./monitoring/grafana-import.sh "$RESULT_FILE"
fi

echo "================================="
echo "✅ Benchmark complete"
echo "================================="
