#!/usr/bin/env node

/**
 * Test script for Owner AI Operational Intelligence Widgets
 * Tests all 6 AI endpoints with authentication
 */

const axios = require('axios');

const API_BASE = 'http://localhost:8083/api';

// Test credentials (using normalized Gmail - dots removed by express-validator)
const TEST_EMAIL = 'neuropilotai@gmail.com';
const TEST_PASSWORD = 'Admin123!@#';

let authToken = null;

// Color output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Test login
async function testLogin() {
  log('\n📝 Testing login...', 'cyan');

  try {
    const response = await axios.post(`${API_BASE}/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });

    if (response.data.accessToken) {
      authToken = response.data.accessToken;
      log(`✅ Login successful! Token: ${authToken.substring(0, 20)}...`, 'green');
      return true;
    } else {
      log(`❌ Login failed: No accessToken in response`, 'red');
      log(`   Response: ${JSON.stringify(response.data)}`, 'yellow');
      return false;
    }
  } catch (error) {
    log(`❌ Login failed: ${error.response?.data?.error || error.message}`, 'red');
    log(`   Status: ${error.response?.status}`, 'yellow');
    return false;
  }
}

// Test reorder recommendations
async function testReorderRecommendations() {
  log('\n🔄 Testing reorder recommendations...', 'cyan');

  try {
    const response = await axios.get(`${API_BASE}/owner/ai/reorder/top?n=5`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    log(`✅ Reorder recommendations retrieved`, 'green');
    log(`   Count: ${response.data.count}`, 'yellow');
    log(`   Latency: ${response.data.latency}ms`, 'yellow');

    if (response.data.recommendations.length > 0) {
      const first = response.data.recommendations[0];
      log(`   Sample: ${first.itemCode} - ${first.name}`, 'yellow');
      log(`   Drivers: ${first.drivers.join(', ')}`, 'yellow');
    }

    return true;
  } catch (error) {
    log(`❌ Reorder test failed: ${error.response?.data?.error || error.message}`, 'red');
    return false;
  }
}

// Test anomaly detection
async function testAnomalies() {
  log('\n⚠️  Testing anomaly detection...', 'cyan');

  try {
    const response = await axios.get(`${API_BASE}/owner/ai/anomalies/recent?window=7d`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    log(`✅ Anomalies retrieved`, 'green');
    log(`   Count: ${response.data.count}`, 'yellow');
    log(`   Window: ${response.data.window}`, 'yellow');
    log(`   Latency: ${response.data.latency}ms`, 'yellow');

    if (response.data.anomalies.length > 0) {
      const first = response.data.anomalies[0];
      log(`   Sample: ${first.itemCode} - ${first.type} (${first.severity})`, 'yellow');
    }

    return true;
  } catch (error) {
    log(`❌ Anomaly test failed: ${error.response?.data?.error || error.message}`, 'red');
    return false;
  }
}

// Test upgrade advisor
async function testUpgradeAdvisor() {
  log('\n💡 Testing upgrade advisor...', 'cyan');

  try {
    const response = await axios.get(`${API_BASE}/owner/ai/upgrade/advice`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    log(`✅ Upgrade advice retrieved`, 'green');
    log(`   Overall Score: ${(response.data.advice.overallScore * 100).toFixed(0)}%`, 'yellow');
    log(`   Cache Hit Rate: ${(response.data.advice.cache.hitRate * 100).toFixed(0)}%`, 'yellow');
    log(`   MAPE-30: ${(response.data.advice.forecast.mape30 * 100).toFixed(1)}%`, 'yellow');
    log(`   DB Mode: ${response.data.advice.db.primary}`, 'yellow');
    log(`   Next Best Actions: ${response.data.advice.nextBestActions.length}`, 'yellow');
    log(`   Latency: ${response.data.latency}ms`, 'yellow');

    return true;
  } catch (error) {
    log(`❌ Upgrade advisor test failed: ${error.response?.data?.error || error.message}`, 'red');
    return false;
  }
}

// Test non-owner access (should fail)
async function testNonOwnerAccess() {
  log('\n🔒 Testing non-owner access (should fail)...', 'cyan');

  try {
    // Try without token
    await axios.get(`${API_BASE}/owner/ai/reorder/top`, {
      headers: {}
    });

    log(`❌ Non-owner test failed: Request should have been rejected`, 'red');
    return false;
  } catch (error) {
    if (error.response?.status === 401) {
      log(`✅ Correctly rejected unauthenticated request (401)`, 'green');
      return true;
    } else {
      log(`❌ Unexpected error: ${error.response?.status || error.message}`, 'red');
      return false;
    }
  }
}

// Test metrics integration
async function testMetrics() {
  log('\n📊 Testing metrics integration...', 'cyan');

  try {
    const response = await axios.get('http://localhost:8083/metrics');
    const metrics = response.data;

    const hasReorderMetric = metrics.includes('owner_ai_reorder_requests_total');
    const hasAnomalyMetric = metrics.includes('owner_ai_anomaly_triage_total');
    const hasUpgradeMetric = metrics.includes('owner_ai_upgrade_actions_total');
    const hasLatencyMetric = metrics.includes('owner_ai_widget_latency_seconds');

    log(`   Reorder metric: ${hasReorderMetric ? '✅' : '❌'}`, hasReorderMetric ? 'green' : 'red');
    log(`   Anomaly metric: ${hasAnomalyMetric ? '✅' : '❌'}`, hasAnomalyMetric ? 'green' : 'red');
    log(`   Upgrade metric: ${hasUpgradeMetric ? '✅' : '❌'}`, hasUpgradeMetric ? 'green' : 'red');
    log(`   Latency metric: ${hasLatencyMetric ? '✅' : '❌'}`, hasLatencyMetric ? 'green' : 'red');

    const allPresent = hasReorderMetric && hasAnomalyMetric && hasUpgradeMetric && hasLatencyMetric;

    if (allPresent) {
      log(`✅ All metrics registered`, 'green');
    } else {
      log(`⚠️  Some metrics missing`, 'yellow');
    }

    return true;
  } catch (error) {
    log(`❌ Metrics test failed: ${error.message}`, 'red');
    return false;
  }
}

// Run all tests
async function runTests() {
  log('\n========================================', 'cyan');
  log('  Owner AI Widgets Test Suite', 'cyan');
  log('========================================\n', 'cyan');

  const results = {
    login: await testLogin(),
    reorder: false,
    anomalies: false,
    advisor: false,
    security: false,
    metrics: false
  };

  if (results.login) {
    results.reorder = await testReorderRecommendations();
    results.anomalies = await testAnomalies();
    results.advisor = await testUpgradeAdvisor();
    results.security = await testNonOwnerAccess();
  }

  results.metrics = await testMetrics();

  // Summary
  log('\n========================================', 'cyan');
  log('  Test Summary', 'cyan');
  log('========================================\n', 'cyan');

  const passed = Object.values(results).filter(r => r === true).length;
  const total = Object.keys(results).length;

  Object.entries(results).forEach(([test, result]) => {
    const status = result ? '✅ PASS' : '❌ FAIL';
    const color = result ? 'green' : 'red';
    log(`${status.padEnd(10)} ${test}`, color);
  });

  log(`\nTotal: ${passed}/${total} tests passed\n`, passed === total ? 'green' : 'yellow');

  // Exit code
  process.exit(passed === total ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  process.exit(1);
});
