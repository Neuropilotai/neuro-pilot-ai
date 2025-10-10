/**
 * K6 Load Test: API Metrics Endpoint
 * Version: v2.5.1-2025-10-07
 *
 * Tests /api/metrics endpoint performance under load.
 * This endpoint serves Prometheus-formatted metrics for the dashboard.
 *
 * Scenario:
 *   - Simulates 100 concurrent dashboard users
 *   - Each user polls /api/metrics every 10 seconds
 *   - Validates response format and metric availability
 *   - Measures response time and throughput
 *
 * Success Criteria:
 *   - P95 response time < 1000ms
 *   - Median response time < 500ms
 *   - 99% success rate (HTTP 200)
 *   - Zero 5xx errors
 *   - Metrics payload contains expected KPIs
 *
 * Usage:
 *   k6 run ops/k6/api_metrics.js
 *   k6 run --vus 100 --duration 120s ops/k6/api_metrics.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// Environment configuration
const BASE_URL = __ENV.API_URL || 'http://localhost:8083';
const METRICS_ENDPOINT = '/api/metrics';

// Mock JWT token for authentication
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJsb2FkLXRlc3QtdXNlciIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsInJvbGUiOiJBZG1pbiIsInRlbmFudElkIjoidGVuYW50XzAwMSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxODAwMDAwMDAwfQ.mockSignature';

// Custom metrics
const metricsResponseTime = new Trend('metrics_response_time', true);
const metricsSuccess = new Rate('metrics_success_rate');
const metricsParseSuccess = new Rate('metrics_parse_success');
const metricsErrors = new Counter('metrics_errors');
const metricsRequests = new Counter('metrics_requests');

// Load test configuration
export const options = {
  stages: [
    { duration: '20s', target: 25 },   // Ramp-up to 25 VUs
    { duration: '30s', target: 50 },   // Ramp-up to 50 VUs
    { duration: '30s', target: 75 },   // Ramp-up to 75 VUs
    { duration: '40s', target: 100 },  // Ramp-up to 100 VUs
    { duration: '120s', target: 100 }, // Hold at 100 VUs (2 minutes)
    { duration: '20s', target: 0 },    // Ramp-down
  ],
  thresholds: {
    'metrics_response_time': [
      'p(50)<500',                     // Median < 500ms
      'p(95)<1000',                    // P95 < 1000ms
      'p(99)<2000',                    // P99 < 2000ms
    ],
    'metrics_success_rate': ['rate>0.99'],      // 99% success rate
    'metrics_parse_success': ['rate>0.99'],     // 99% parseable responses
    'http_req_failed': ['rate<0.01'],           // Less than 1% failed requests
    'http_req_duration': ['p(95)<1000'],        // Overall HTTP p95 < 1000ms
  },
};

/**
 * Parse Prometheus metrics format
 * Returns map of metric names to values
 */
function parsePrometheusMetrics(text) {
  const metrics = {};
  const lines = text.split('\n');

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('#') || line.trim() === '') continue;

    // Match metric pattern: metric_name{labels} value
    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)\{?([^}]*)\}?\s+([0-9.e+-]+)/);

    if (match) {
      const [, name, labels, value] = match;
      const metricKey = labels ? `${name}{${labels}}` : name;
      metrics[metricKey] = parseFloat(value);
    }
  }

  return metrics;
}

/**
 * Validate expected metrics are present
 */
function validateMetrics(metrics) {
  // Expected KPI metrics (from backend Prometheus export)
  const expectedMetrics = [
    'api_requests_total',
    'api_latency_p95_ms',
    'cache_hit_rate_percent',
    'active_tenants',
    'forecast_accuracy_mape',
    'rl_policy_avg_reward',
    'rbac_denials_total',
    'active_sessions',
  ];

  const checks = {};

  for (const metricName of expectedMetrics) {
    // Check if metric exists (with or without labels)
    const found = Object.keys(metrics).some(key => key.startsWith(metricName));
    checks[`has metric: ${metricName}`] = found;
  }

  return checks;
}

/**
 * Main VU scenario
 */
export default function () {
  const url = `${BASE_URL}${METRICS_ENDPOINT}`;

  const params = {
    headers: {
      'Authorization': `Bearer ${AUTH_TOKEN}`,
      'Accept': 'text/plain',
    },
    tags: {
      name: 'MetricsAPI',
    },
  };

  // Fetch metrics
  metricsRequests.add(1);
  const startTime = Date.now();
  const response = http.get(url, params);
  const duration = Date.now() - startTime;

  metricsResponseTime.add(duration);

  // Validate response
  const checks = check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 1s': (r) => r.timings.duration < 1000,
    'response time < 2s': (r) => r.timings.duration < 2000,
    'has body': (r) => r.body && r.body.length > 0,
    'content-type is text': (r) => r.headers['Content-Type']?.includes('text/plain'),
  });

  if (response.status === 200) {
    metricsSuccess.add(1);

    // Parse and validate metrics
    try {
      const metrics = parsePrometheusMetrics(response.body);
      const metricCount = Object.keys(metrics).length;

      const parseChecks = check(metrics, {
        'parsed metrics count > 10': (m) => metricCount > 10,
        'parsed metrics count > 50': (m) => metricCount > 50,
      });

      // Validate expected metrics
      const metricValidation = validateMetrics(metrics);
      check(metrics, metricValidation);

      metricsParseSuccess.add(1);

      if (__VU === 1 && __ITER === 0) {
        console.log(`[VU ${__VU}] Parsed ${metricCount} metrics from response`);
      }
    } catch (e) {
      metricsParseSuccess.add(0);
      metricsErrors.add(1);
      console.error(`[VU ${__VU}] Failed to parse metrics: ${e.message}`);
    }
  } else {
    metricsSuccess.add(0);
    metricsErrors.add(1);
    console.error(`[VU ${__VU}] Request failed with status ${response.status}`);
  }

  // Simulate dashboard polling interval (every 10 seconds)
  sleep(10 + Math.random() * 2); // 10-12 seconds with jitter
}

/**
 * Setup - print test configuration
 */
export function setup() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('🚀 Starting API Metrics Load Test (v2.5.1)');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Target: ${BASE_URL}${METRICS_ENDPOINT}`);
  console.log(`Duration: ~260 seconds (ramp-up + hold + ramp-down)`);
  console.log(`Max VUs: 100`);
  console.log(`Polling interval: ~10 seconds`);
  console.log('═══════════════════════════════════════════════════════\n');

  // Warmup request
  const warmupUrl = `${BASE_URL}${METRICS_ENDPOINT}`;
  const warmupResponse = http.get(warmupUrl, {
    headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` },
  });

  if (warmupResponse.status !== 200) {
    console.warn(`⚠️  Warmup request failed with status ${warmupResponse.status}`);
    console.warn('   Ensure the backend is running and accessible');
  } else {
    console.log('✅ Warmup successful - backend is responding\n');
  }
}

/**
 * Teardown - summary report
 */
export function handleSummary(data) {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📊 API Metrics Load Test Summary (v2.5.1)');
  console.log('═══════════════════════════════════════════════════════\n');

  const metrics = data.metrics;

  // Request statistics
  const httpReqDuration = metrics.http_req_duration;
  const httpReqFailed = metrics.http_req_failed;
  const requests = metrics.metrics_requests;
  const errors = metrics.metrics_errors;

  console.log('📈 Request Statistics:');
  console.log(`   Total requests: ${requests.values.count}`);
  console.log(`   Failed requests: ${Math.round(httpReqFailed.values.rate * requests.values.count)}`);
  console.log(`   Errors: ${errors.values.count}`);
  console.log(`   Requests/sec: ${(requests.values.rate).toFixed(2)}`);

  console.log('\n⚡ Response Time:');
  console.log(`   Min: ${httpReqDuration.values.min.toFixed(2)}ms`);
  console.log(`   Median: ${httpReqDuration.values.med.toFixed(2)}ms`);
  console.log(`   Avg: ${httpReqDuration.values.avg.toFixed(2)}ms`);
  console.log(`   P95: ${httpReqDuration.values['p(95)'].toFixed(2)}ms`);
  console.log(`   P99: ${httpReqDuration.values['p(99)'].toFixed(2)}ms`);
  console.log(`   Max: ${httpReqDuration.values.max.toFixed(2)}ms`);

  // Success rates
  const successRate = metrics.metrics_success_rate;
  const parseSuccessRate = metrics.metrics_parse_success;

  console.log('\n✅ Success Rates:');
  console.log(`   HTTP success: ${(successRate.values.rate * 100).toFixed(2)}%`);
  console.log(`   Parse success: ${(parseSuccessRate.values.rate * 100).toFixed(2)}%`);

  // Threshold validation
  const thresholdsPassed =
    httpReqDuration.values.med < 500 &&
    httpReqDuration.values['p(95)'] < 1000 &&
    successRate.values.rate >= 0.99 &&
    httpReqFailed.values.rate < 0.01;

  console.log('\n🎯 Thresholds:');
  console.log(`   ✓ Median < 500ms: ${httpReqDuration.values.med < 500 ? 'PASS' : 'FAIL'}`);
  console.log(`   ✓ P95 < 1000ms: ${httpReqDuration.values['p(95)'] < 1000 ? 'PASS' : 'FAIL'}`);
  console.log(`   ✓ Success rate > 99%: ${successRate.values.rate >= 0.99 ? 'PASS' : 'FAIL'}`);
  console.log(`   ✓ Error rate < 1%: ${httpReqFailed.values.rate < 0.01 ? 'PASS' : 'FAIL'}`);

  console.log('\n' + (thresholdsPassed ? '✅ PASS' : '❌ FAIL'));
  console.log('═══════════════════════════════════════════════════════\n');

  return {
    'stdout': JSON.stringify(data, null, 2),
    'summary.json': JSON.stringify(data, null, 2),
  };
}
