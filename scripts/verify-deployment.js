#!/usr/bin/env node

/**
 * NeuroNexus v19.0 Deployment Verification Script
 *
 * This script performs comprehensive verification of Railway deployment.
 * Run this after deploying backend + ml-service to confirm everything is operational.
 *
 * Usage:
 *   BACKEND_URL=https://your-backend.railway.app \
 *   ML_URL=https://your-ml-service.railway.app \
 *   node scripts/verify-deployment.js
 */

const https = require('https');
const http = require('http');

// Configuration from environment variables
const BACKEND_URL = process.env.BACKEND_URL || 'https://resourceful-achievement-production.up.railway.app';
const ML_URL = process.env.ML_URL || '';
const TIMEOUT = 10000; // 10 seconds

// ANSI color codes for pretty output
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

// Test results tracking
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
let warnings = 0;

/**
 * Make HTTP/HTTPS request with timeout
 */
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;

    const req = client.request(url, { ...options, timeout: TIMEOUT }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ statusCode: res.statusCode, headers: res.headers, data: json });
        } catch (e) {
          resolve({ statusCode: res.statusCode, headers: res.headers, data, raw: true });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

/**
 * Print test result
 */
function printResult(testName, passed, message = '', warning = false) {
  totalTests++;

  if (passed) {
    passedTests++;
    console.log(`${COLORS.green}✅ PASS${COLORS.reset}: ${testName}`);
  } else if (warning) {
    warnings++;
    console.log(`${COLORS.yellow}⚠️  WARN${COLORS.reset}: ${testName}`);
  } else {
    failedTests++;
    console.log(`${COLORS.red}❌ FAIL${COLORS.reset}: ${testName}`);
  }

  if (message) {
    console.log(`   ${message}`);
  }
}

/**
 * Print section header
 */
function printHeader(title) {
  console.log('');
  console.log(`${COLORS.cyan}${COLORS.bold}${'='.repeat(60)}${COLORS.reset}`);
  console.log(`${COLORS.cyan}${COLORS.bold}  ${title}${COLORS.reset}`);
  console.log(`${COLORS.cyan}${COLORS.bold}${'='.repeat(60)}${COLORS.reset}`);
  console.log('');
}

/**
 * Test Suite 1: Backend Service Health
 */
async function testBackendHealth() {
  printHeader('TEST SUITE 1: Backend Service Health');

  try {
    const { statusCode, data } = await makeRequest(`${BACKEND_URL}/api/health`);

    printResult(
      'Backend Health Endpoint',
      statusCode === 200 && data.status === 'healthy',
      statusCode === 200 ? `Status: ${data.status}, Uptime: ${data.uptime}s` : `HTTP ${statusCode}`
    );

    if (statusCode === 200 && data.scheduler) {
      printResult(
        'Scheduler Enabled',
        data.scheduler.enabled === true,
        `Enabled: ${data.scheduler.enabled}, Next run: ${data.scheduler.nextRun || 'N/A'}`
      );

      if (data.scheduler.nextRun) {
        const nextRun = new Date(data.scheduler.nextRun);
        const isValid = nextRun instanceof Date && !isNaN(nextRun);
        printResult(
          'Scheduler Next Run Valid',
          isValid,
          `Next run: ${nextRun.toUTCString()}`
        );
      }
    } else {
      printResult('Scheduler Configuration', false, 'Scheduler data not found in health response', true);
    }

    return true;
  } catch (error) {
    printResult('Backend Health Endpoint', false, `Error: ${error.message}`);
    return false;
  }
}

/**
 * Test Suite 2: ML Service Health
 */
async function testMLServiceHealth() {
  printHeader('TEST SUITE 2: ML Service Health');

  if (!ML_URL) {
    printResult('ML Service URL', false, 'ML_URL environment variable not set. Skipping ML tests.', true);
    return false;
  }

  try {
    const { statusCode, data } = await makeRequest(`${ML_URL}/status`);

    printResult(
      'ML Service Status Endpoint',
      statusCode === 200 && data.status === 'healthy',
      statusCode === 200 ? `Status: ${data.status}, Version: ${data.version || 'unknown'}` : `HTTP ${statusCode}`
    );

    return true;
  } catch (error) {
    printResult('ML Service Status Endpoint', false, `Error: ${error.message}`);
    return false;
  }
}

/**
 * Test Suite 3: API Functionality
 */
async function testAPIFunctionality() {
  printHeader('TEST SUITE 3: API Functionality');

  // Test: Root endpoint
  try {
    const { statusCode } = await makeRequest(`${BACKEND_URL}/`);
    printResult('Root Endpoint', statusCode === 200, `HTTP ${statusCode}`);
  } catch (error) {
    printResult('Root Endpoint', false, `Error: ${error.message}`);
  }

  // Test: Forecast recommendations API
  try {
    const { statusCode, data } = await makeRequest(`${BACKEND_URL}/api/forecast/recommendations`);

    const mlHealthy = data.mlServiceHealthy === true;
    printResult(
      'Forecast Recommendations API',
      statusCode === 200,
      `HTTP ${statusCode}, ML Service Healthy: ${mlHealthy}`
    );

    if (statusCode === 200) {
      printResult(
        'Backend → ML Service Communication',
        mlHealthy,
        mlHealthy ? 'Backend successfully communicates with ML service' : 'ML service communication issue'
      );
    }
  } catch (error) {
    printResult('Forecast Recommendations API', false, `Error: ${error.message}`);
  }

  // Test: Auth required endpoint (should return 401)
  try {
    const { statusCode } = await makeRequest(`${BACKEND_URL}/api/inventory`);
    printResult(
      'Authentication Protection',
      statusCode === 401 || statusCode === 403,
      statusCode === 401 || statusCode === 403 ?
        'Protected endpoints correctly require authentication' :
        `Expected 401/403, got ${statusCode}`
    );
  } catch (error) {
    printResult('Authentication Protection', false, `Error: ${error.message}`, true);
  }
}

/**
 * Test Suite 4: ML Service Inference
 */
async function testMLInference() {
  printHeader('TEST SUITE 4: ML Service Inference');

  if (!ML_URL) {
    printResult('ML Service Inference', false, 'ML_URL not set. Skipping inference tests.', true);
    return;
  }

  try {
    const { statusCode, data } = await makeRequest(`${ML_URL}/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { mode: 'daily', item_ids: null }
    });

    printResult(
      'ML Inference Endpoint',
      statusCode === 200,
      statusCode === 200 ?
        `Model version: ${data.model_version || 'unknown'}` :
        `HTTP ${statusCode}`
    );
  } catch (error) {
    printResult('ML Inference Endpoint', false, `Error: ${error.message}`);
  }
}

/**
 * Test Suite 5: Performance Benchmarks
 */
async function testPerformance() {
  printHeader('TEST SUITE 5: Performance Benchmarks');

  // Test backend response time
  const backendStart = Date.now();
  try {
    await makeRequest(`${BACKEND_URL}/api/health`);
    const backendTime = Date.now() - backendStart;

    printResult(
      'Backend Response Time',
      backendTime < 2000,
      `Response time: ${backendTime}ms (target: <2000ms)`,
      backendTime >= 2000 && backendTime < 5000
    );
  } catch (error) {
    printResult('Backend Response Time', false, `Error: ${error.message}`);
  }

  // Test ML service response time
  if (ML_URL) {
    const mlStart = Date.now();
    try {
      await makeRequest(`${ML_URL}/status`);
      const mlTime = Date.now() - mlStart;

      printResult(
        'ML Service Response Time',
        mlTime < 1000,
        `Response time: ${mlTime}ms (target: <1000ms)`,
        mlTime >= 1000 && mlTime < 3000
      );
    } catch (error) {
      printResult('ML Service Response Time', false, `Error: ${error.message}`);
    }
  }
}

/**
 * Print final summary
 */
function printSummary() {
  console.log('');
  console.log(`${COLORS.cyan}${COLORS.bold}${'='.repeat(60)}${COLORS.reset}`);
  console.log(`${COLORS.cyan}${COLORS.bold}  DEPLOYMENT VERIFICATION SUMMARY${COLORS.reset}`);
  console.log(`${COLORS.cyan}${COLORS.bold}${'='.repeat(60)}${COLORS.reset}`);
  console.log('');
  console.log(`Total Tests:    ${totalTests}`);
  console.log(`${COLORS.green}Passed:         ${passedTests}${COLORS.reset}`);
  console.log(`${COLORS.red}Failed:         ${failedTests}${COLORS.reset}`);
  console.log(`${COLORS.yellow}Warnings:       ${warnings}${COLORS.reset}`);
  console.log('');

  if (failedTests === 0) {
    console.log(`${COLORS.green}${COLORS.bold}🎉 ALL CRITICAL TESTS PASSED!${COLORS.reset}`);
    console.log(`${COLORS.green}✅ NeuroNexus v19.0 is operational on Railway.${COLORS.reset}`);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Monitor logs for first scheduled run at 02:15 UTC');
    console.log('  2. Verify email delivery of daily intelligence report');
    console.log('  3. Review forecast accuracy after 7 days');
    console.log('');
  } else {
    console.log(`${COLORS.red}${COLORS.bold}⚠️  DEPLOYMENT VERIFICATION FAILED${COLORS.reset}`);
    console.log(`${COLORS.red}${failedTests} test(s) failed. Review logs and troubleshoot.${COLORS.reset}`);
    console.log('');
    console.log('Troubleshooting resources:');
    console.log('  - V19_DEPLOYMENT_RUNBOOK.md → Quick Diag section');
    console.log('  - Railway Dashboard → Services → View Logs');
    console.log('  - docs/ROLLBACK_PLAN.md (if needed)');
    console.log('');
  }

  console.log(`${COLORS.cyan}Timestamp: ${new Date().toISOString()}${COLORS.reset}`);
  console.log('');
}

/**
 * Main execution
 */
async function main() {
  console.log(`${COLORS.bold}NeuroNexus v19.0 - Deployment Verification Script${COLORS.reset}`);
  console.log(`Backend URL: ${BACKEND_URL}`);
  console.log(`ML Service URL: ${ML_URL || '(not set)'}`);
  console.log('');

  await testBackendHealth();
  await testMLServiceHealth();
  await testAPIFunctionality();
  await testMLInference();
  await testPerformance();

  printSummary();

  // Exit with appropriate code
  process.exit(failedTests > 0 ? 1 : 0);
}

// Run the script
main().catch((error) => {
  console.error(`${COLORS.red}Fatal error:${COLORS.reset}`, error);
  process.exit(1);
});
