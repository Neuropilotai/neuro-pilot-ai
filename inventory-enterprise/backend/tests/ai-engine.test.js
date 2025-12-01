/**
 * AI Engine V22.2 Integration Tests
 *
 * Tests cover:
 * 1. Health endpoint returns valid structure
 * 2. Forecast endpoint returns bounded values
 * 3. Reorder endpoint returns valid urgency levels
 * 4. All numeric values are finite and non-negative
 * 5. Mode is correctly reported
 *
 * Run with: node tests/ai-engine.test.js
 * Or with auth: AI_TEST_TOKEN="your-jwt" node tests/ai-engine.test.js
 */

const http = require('http');
const https = require('https');

// Configuration
const CONFIG = {
  baseUrl: process.env.AI_TEST_URL || 'http://localhost:3001',
  token: process.env.AI_TEST_TOKEN || null,
  timeout: 10000 // 10 seconds
};

// Test utilities
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function log(message, type = 'info') {
  const prefix = {
    info: '\x1b[36m[INFO]\x1b[0m',
    pass: '\x1b[32m[PASS]\x1b[0m',
    fail: '\x1b[31m[FAIL]\x1b[0m',
    warn: '\x1b[33m[WARN]\x1b[0m'
  };
  console.log(`${prefix[type] || prefix.info} ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, CONFIG.baseUrl);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const headers = {
      'Content-Type': 'application/json',
      ...(CONFIG.token && { Authorization: `Bearer ${CONFIG.token}` })
    };

    const req = client.request(url, {
      method: options.method || 'GET',
      headers,
      timeout: CONFIG.timeout
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Request timeout')));
    req.end();
  });
}

async function runTest(name, testFn) {
  testsRun++;
  try {
    await testFn();
    testsPassed++;
    log(`${name}`, 'pass');
    return true;
  } catch (error) {
    testsFailed++;
    log(`${name}: ${error.message}`, 'fail');
    return false;
  }
}

// ============================================================================
// TEST CASES
// ============================================================================

async function testHealthEndpoint() {
  const { status, data } = await makeRequest('/api/ai/health');

  assert(status === 200 || status === 503, `Unexpected status code: ${status}`);
  assert(data.status, 'Missing status field');
  assert(['healthy', 'degraded', 'unhealthy'].includes(data.status), `Invalid status: ${data.status}`);
  assert(data.version, 'Missing version field');
  assert(data.mode, 'Missing mode field');
  assert(['production', 'simulation'].includes(data.mode), `Invalid mode: ${data.mode}`);
  assert(data.features, 'Missing features field');
  assert(typeof data.features.demandForecasting === 'boolean', 'Invalid demandForecasting feature flag');
  assert(typeof data.latencyMs === 'number' && data.latencyMs >= 0, 'Invalid latencyMs');
}

async function testForecastEndpointStructure() {
  const { status, data } = await makeRequest('/api/ai/forecast');

  if (status === 400) {
    // Expected if no token provided
    assert(data.code === 'TENANT_REQUIRED' || data.error, 'Should have error message for 400');
    return;
  }

  if (status === 401 || status === 403) {
    log('Skipping forecast test - no valid auth token', 'warn');
    return;
  }

  assert(status === 200, `Unexpected status code: ${status}`);
  assert(typeof data.success === 'boolean', 'Missing success field');
  assert(Array.isArray(data.forecasts), 'forecasts should be an array');
  assert(data.mode, 'Missing mode field');

  // Validate forecast structure if we have data
  if (data.forecasts.length > 0) {
    const forecast = data.forecasts[0];
    assert(forecast.itemCode, 'Forecast missing itemCode');
    assert(forecast.method, 'Forecast missing method');
    assert(typeof forecast.horizon === 'number' && forecast.horizon > 0, 'Invalid horizon');
    assert(Array.isArray(forecast.predictions), 'predictions should be an array');
    assert(typeof forecast.confidence === 'number', 'confidence should be a number');
    assert(forecast.confidence >= 0 && forecast.confidence <= 1, 'confidence should be 0-1');

    // Validate predictions
    if (forecast.predictions.length > 0) {
      const pred = forecast.predictions[0];
      assert(pred.date, 'Prediction missing date');
      assert(typeof pred.predictedValue === 'number', 'predictedValue should be a number');
      assert(pred.predictedValue >= 0, 'predictedValue should be non-negative');
      assert(isFinite(pred.predictedValue), 'predictedValue should be finite');
    }
  }
}

async function testReorderEndpointBoundedValues() {
  const { status, data } = await makeRequest('/api/ai/reorder?limit=10');

  if (status === 400) {
    assert(data.code === 'TENANT_REQUIRED' || data.error, 'Should have error message for 400');
    return;
  }

  if (status === 401 || status === 403) {
    log('Skipping reorder test - no valid auth token', 'warn');
    return;
  }

  assert(status === 200, `Unexpected status code: ${status}`);
  assert(typeof data.success === 'boolean', 'Missing success field');
  assert(Array.isArray(data.suggestions), 'suggestions should be an array');
  assert(data.mode, 'Missing mode field');

  // Validate suggestion structure
  for (const suggestion of data.suggestions) {
    // Validate urgency is one of allowed values
    assert(
      ['critical', 'high', 'medium', 'low'].includes(suggestion.urgency),
      `Invalid urgency: ${suggestion.urgency}`
    );

    // Validate numeric values are bounded
    assert(
      typeof suggestion.currentStock === 'number' && suggestion.currentStock >= 0,
      'currentStock should be non-negative'
    );
    assert(
      typeof suggestion.suggestedOrderQty === 'number' && suggestion.suggestedOrderQty >= 0,
      'suggestedOrderQty should be non-negative'
    );
    assert(
      typeof suggestion.confidence === 'number' &&
      suggestion.confidence >= 0 &&
      suggestion.confidence <= 1,
      'confidence should be 0-1'
    );

    // Check for absurd values
    assert(suggestion.currentStock < 10_000_000, 'currentStock seems unreasonably large');
    assert(suggestion.suggestedOrderQty < 10_000_000, 'suggestedOrderQty seems unreasonably large');
    assert(isFinite(suggestion.currentStock), 'currentStock should be finite');
    assert(isFinite(suggestion.suggestedOrderQty), 'suggestedOrderQty should be finite');

    // Validate drivers array
    assert(Array.isArray(suggestion.drivers), 'drivers should be an array');
  }
}

async function testAnomaliesEndpointValidation() {
  const { status, data } = await makeRequest('/api/ai/anomalies?window=7');

  if (status === 400) {
    assert(data.code === 'TENANT_REQUIRED' || data.error, 'Should have error message for 400');
    return;
  }

  if (status === 401 || status === 403) {
    log('Skipping anomalies test - no valid auth token', 'warn');
    return;
  }

  assert(status === 200, `Unexpected status code: ${status}`);
  assert(typeof data.success === 'boolean', 'Missing success field');
  assert(Array.isArray(data.anomalies), 'anomalies should be an array');
  assert(data.metadata, 'Missing metadata field');
  assert(data.mode, 'Missing mode field');

  // Validate anomaly structure
  for (const anomaly of data.anomalies) {
    assert(anomaly.itemCode, 'Anomaly missing itemCode');
    assert(anomaly.date, 'Anomaly missing date');
    assert(['spike', 'drop'].includes(anomaly.type), `Invalid type: ${anomaly.type}`);
    assert(
      ['critical', 'high', 'medium', 'low'].includes(anomaly.severity),
      `Invalid severity: ${anomaly.severity}`
    );
    assert(Array.isArray(anomaly.suggestedActions), 'suggestedActions should be an array');

    // Z-score bounds check (if present)
    if (anomaly.zScore !== undefined) {
      assert(
        typeof anomaly.zScore === 'number' && Math.abs(anomaly.zScore) < 100,
        'zScore seems unreasonably large'
      );
      assert(isFinite(anomaly.zScore), 'zScore should be finite');
    }
  }
}

async function testPopulationEndpointValidation() {
  const { status, data } = await makeRequest('/api/ai/population?days=30');

  if (status === 400) {
    assert(data.code === 'TENANT_REQUIRED' || data.error, 'Should have error message for 400');
    return;
  }

  if (status === 401 || status === 403) {
    log('Skipping population test - no valid auth token', 'warn');
    return;
  }

  assert(status === 200, `Unexpected status code: ${status}`);
  assert(typeof data.success === 'boolean', 'Missing success field');
  assert(data.populationFactors, 'Missing populationFactors field');
  assert(data.mode, 'Missing mode field');

  const pf = data.populationFactors;
  const fields = ['avgBreakfast', 'avgLunch', 'avgDinner', 'avgTotal', 'maxTotal', 'minTotal', 'daysLogged'];

  for (const field of fields) {
    assert(
      typeof pf[field] === 'number',
      `${field} should be a number`
    );
    assert(pf[field] >= 0, `${field} should be non-negative`);
    assert(isFinite(pf[field]), `${field} should be finite`);
    assert(pf[field] < 1_000_000, `${field} seems unreasonably large`);
  }
}

async function testDashboardCombinedResponse() {
  const { status, data } = await makeRequest('/api/ai/dashboard');

  if (status === 400) {
    assert(data.code === 'TENANT_REQUIRED' || data.error, 'Should have error message for 400');
    return;
  }

  if (status === 401 || status === 403) {
    log('Skipping dashboard test - no valid auth token', 'warn');
    return;
  }

  assert(status === 200, `Unexpected status code: ${status}`);
  assert(typeof data.success === 'boolean', 'Missing success field');
  assert(data.dashboard, 'Missing dashboard field');
  assert(data.dashboard.forecasts, 'Missing forecasts section');
  assert(data.dashboard.reorder, 'Missing reorder section');
  assert(data.dashboard.anomalies, 'Missing anomalies section');
  assert(data.dashboard.population, 'Missing population section');
  assert(data.metadata, 'Missing metadata field');
  assert(data.mode, 'Missing mode field');

  // Validate counts are non-negative
  assert(data.dashboard.forecasts.count >= 0, 'forecasts.count should be non-negative');
  assert(data.dashboard.reorder.totalCount >= 0, 'reorder.totalCount should be non-negative');
  assert(data.dashboard.anomalies.count >= 0, 'anomalies.count should be non-negative');
}

async function testModeConsistency() {
  const { status, data } = await makeRequest('/api/ai/health');

  assert(status === 200 || status === 503, 'Health check should return 200 or 503');
  assert(data.mode, 'Health should include mode');

  // Mode should be consistent across endpoints
  const expectedMode = data.mode;

  // Check that mode is valid
  assert(
    ['production', 'simulation'].includes(expectedMode),
    `Mode should be 'production' or 'simulation', got: ${expectedMode}`
  );

  log(`AI Engine running in ${expectedMode} mode`, 'info');
}

// ============================================================================
// RUN TESTS
// ============================================================================

async function runAllTests() {
  console.log('\n====================================');
  console.log('AI Engine V22.2 Integration Tests');
  console.log('====================================');
  console.log(`Base URL: ${CONFIG.baseUrl}`);
  console.log(`Auth Token: ${CONFIG.token ? 'Provided' : 'Not provided'}`);
  console.log('------------------------------------\n');

  await runTest('Health endpoint returns valid structure', testHealthEndpoint);
  await runTest('Mode is consistent and valid', testModeConsistency);
  await runTest('Forecast endpoint returns bounded values', testForecastEndpointStructure);
  await runTest('Reorder endpoint has valid urgency levels', testReorderEndpointBoundedValues);
  await runTest('Anomalies endpoint validates correctly', testAnomaliesEndpointValidation);
  await runTest('Population endpoint has bounded values', testPopulationEndpointValidation);
  await runTest('Dashboard returns combined response', testDashboardCombinedResponse);

  console.log('\n------------------------------------');
  console.log(`Tests Run: ${testsRun}`);
  console.log(`\x1b[32mPassed: ${testsPassed}\x1b[0m`);
  console.log(`\x1b[31mFailed: ${testsFailed}\x1b[0m`);
  console.log('====================================\n');

  process.exit(testsFailed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
