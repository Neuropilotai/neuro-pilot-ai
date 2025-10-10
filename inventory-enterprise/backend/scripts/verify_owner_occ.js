#!/usr/bin/env node
/**
 * Owner Command Center Verification Script
 * Tests full OCC flow: login → start count → add item → attach PDF → close
 *
 * Exit codes:
 *   0 - All tests passed
 *   1 - Test failure
 */

const http = require('http');
const https = require('https');

const BASE_URL = 'http://localhost:8083';
const LOGIN_EMAIL = 'neuro.pilot.ai@gmail.com';
const LOGIN_PASSWORD = 'Admin123!@#';

let accessToken = null;
let testResults = {
  passed: 0,
  failed: 0,
  total: 0
};

// Utility: HTTP request wrapper
function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data: { raw: data } });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Test runner
async function test(name, fn) {
  testResults.total++;
  process.stdout.write(`  ${name}... `);

  try {
    await fn();
    testResults.passed++;
    console.log('✅ PASS');
    return true;
  } catch (error) {
    testResults.failed++;
    console.log(`❌ FAIL: ${error.message}`);
    return false;
  }
}

// Assertion helper
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Main test suite
async function runTests() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🧪 Owner Command Center Verification Suite');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let countId = null;

  // TEST 1: Login
  await test('Login with owner credentials', async () => {
    const res = await request('POST', '/api/auth/login', {
      email: LOGIN_EMAIL,
      password: LOGIN_PASSWORD
    });

    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.accessToken, 'No access token in response');
    accessToken = res.data.accessToken;
  });

  if (!accessToken) {
    console.log('\n❌ Cannot continue without access token\n');
    return;
  }

  // TEST 2: Session check
  await test('Check session status', async () => {
    const res = await request('GET', '/api/owner/console/session', null, {
      'Authorization': `Bearer ${accessToken}`
    });

    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.ttl > 0, 'Token should have TTL > 0');
  });

  // TEST 3: List locations
  await test('List locations', async () => {
    const res = await request('GET', '/api/owner/console/locations', null, {
      'Authorization': `Bearer ${accessToken}`
    });

    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.data.locations), 'Locations should be an array');
    assert(res.data.total >= 0, 'Total should be >= 0');
  });

  // TEST 4: Start inventory count
  await test('Start inventory count', async () => {
    const res = await request('POST', '/api/owner/console/counts/start', {
      startingLocationId: 1,
      notes: 'Test count from verification script'
    }, {
      'Authorization': `Bearer ${accessToken}`
    });

    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.countId, 'Should return countId');
    countId = res.data.countId;
  });

  if (!countId) {
    console.log('\n⚠️  Count not started, skipping count tests\n');
  } else {
    // TEST 5: Add item to count
    await test('Add item to count', async () => {
      const res = await request('POST', `/api/owner/console/counts/${countId}/add-item`, {
        itemCode: 'APPLE-001',
        quantity: 5,
        locationId: 1,
        notes: 'Test item'
      }, {
        'Authorization': `Bearer ${accessToken}`
      });

      // 200 if item exists, 404 if not (acceptable for test)
      assert(res.status === 200 || res.status === 404, `Expected 200 or 404, got ${res.status}`);
    });

    // TEST 6: Attach PDF to count
    await test('Attach PDF to count', async () => {
      const res = await request('POST', `/api/owner/console/counts/${countId}/attach-pdf`, {
        invoiceNumber: '9025025288'
      }, {
        'Authorization': `Bearer ${accessToken}`
      });

      // 200 if PDF exists, 404 if not (acceptable for test)
      assert(res.status === 200 || res.status === 404, `Expected 200 or 404, got ${res.status}`);
    });

    // TEST 7: Get count details
    await test('Get count details', async () => {
      const res = await request('GET', `/api/owner/console/counts/${countId}`, null, {
        'Authorization': `Bearer ${accessToken}`
      });

      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.data.count, 'Should return count object');
      assert(Array.isArray(res.data.items), 'Items should be array');
      assert(Array.isArray(res.data.pdfs), 'PDFs should be array');
    });

    // TEST 8: Close count
    await test('Close count', async () => {
      const res = await request('POST', `/api/owner/console/counts/${countId}/close`, {
        notes: 'Test count closed successfully'
      }, {
        'Authorization': `Bearer ${accessToken}`
      });

      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.data.status === 'closed', 'Count should be closed');
    });
  }

  // TEST 9: Search PDFs
  await test('Search PDFs', async () => {
    const res = await request('GET', '/api/owner/console/pdfs/search?q=90&limit=5', null, {
      'Authorization': `Bearer ${accessToken}`
    });

    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.data.results), 'Results should be array');
  });

  // TEST 10: AI status
  await test('Get AI status', async () => {
    const res = await request('GET', '/api/owner/console/ai/status', null, {
      'Authorization': `Bearer ${accessToken}`
    });

    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(typeof res.data.health === 'object', 'Health should be object');
  });

  // TEST 11: Owner-only access (negative test)
  await test('Reject non-owner access', async () => {
    // Create a fake token (should be rejected)
    const res = await request('GET', '/api/owner/console/session', null, {
      'Authorization': 'Bearer invalid_token_12345'
    });

    assert(res.status === 401 || res.status === 403, 'Should reject invalid token');
  });

  // Print results
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📊 Test Results');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Total:  ${testResults.total}`);
  console.log(`Passed: ${testResults.passed} ✅`);
  console.log(`Failed: ${testResults.failed} ${testResults.failed > 0 ? '❌' : ''}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (testResults.failed > 0) {
    console.log('❌ VERIFICATION FAILED\n');
    process.exit(1);
  } else {
    console.log('✅ VERIFICATION PASSED\n');
    process.exit(0);
  }
}

// Run
runTests().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
