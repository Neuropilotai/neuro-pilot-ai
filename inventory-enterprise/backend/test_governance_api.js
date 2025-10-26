#!/usr/bin/env node
/**
 * Quick test script for governance API endpoints
 */
const http = require('http');
const fs = require('fs');

const token = fs.readFileSync('.owner_token', 'utf8').trim();

function testEndpoint(path, description) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 8083,
      path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      },
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log(`\n=== ${description} ===`);
        console.log(`Status: ${res.statusCode}`);
        try {
          const json = JSON.parse(data);
          console.log(JSON.stringify(json, null, 2).substring(0, 500));
          resolve(json);
        } catch (e) {
          console.log('Raw response:', data.substring(0, 200));
          resolve(data);
        }
      });
    });

    req.on('error', (err) => {
      console.error(`\n=== ${description} - ERROR ===`);
      console.error(err.message);
      reject(err);
    });

    req.on('timeout', () => {
      console.error(`\n=== ${description} - TIMEOUT ===`);
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function runTests() {
  try {
    await testEndpoint('/health', 'Health Check');
    await testEndpoint('/api/governance/live/status', 'Governance Live Status');
    await testEndpoint('/api/governance/live/sparklines?p=composite&days=30', 'Governance Sparklines');
    console.log('\n✅ All tests completed');
  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    process.exit(1);
  }
}

runTests();
