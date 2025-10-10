#!/usr/bin/env node

/**
 * Test Login with Debugging
 */

const bcrypt = require('bcryptjs');

// Test the exact same way the server does it
const testEmail = 'neuro.pilot.ai@gmail.com';
const testPassword = 'Admin123!@#';

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('🔍 BCRYPT HASH TEST');
console.log('═══════════════════════════════════════════════════════════════');

console.log(`\nEmail: ${testEmail}`);
console.log(`Password: ${testPassword}`);

// Generate a hash (like the server does on startup)
const hash = bcrypt.hashSync(testPassword, 10);
console.log(`\nGenerated hash: ${hash}`);

// Test comparison (like the authenticateUser function does)
const isMatch = bcrypt.compareSync(testPassword, hash);
console.log(`\nPassword matches hash: ${isMatch ? '✅ YES' : '❌ NO'}`);

// Now test login via HTTP
console.log('\n─'.repeat(70));
console.log('Testing HTTP login...\n');

const http = require('http');

const postData = JSON.stringify({
  email: testEmail,
  password: testPassword
});

const options = {
  hostname: 'localhost',
  port: 8083,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`HTTP Status: ${res.statusCode}`);

    try {
      const response = JSON.parse(data);
      console.log('\nResponse:');
      console.log(JSON.stringify(response, null, 2));

      if (res.statusCode === 200) {
        console.log('\n✅ LOGIN SUCCESSFUL VIA HTTP!');
      } else {
        console.log('\n❌ LOGIN FAILED VIA HTTP');
        console.log('\nThis suggests the server has a different hash stored in memory.');
        console.log('The server process needs to be fully restarted to pick up changes.');
      }
    } catch (e) {
      console.log('\nRaw response:', data);
    }

    console.log('\n═══════════════════════════════════════════════════════════════\n');
  });
});

req.on('error', (error) => {
  console.error('❌ Request failed:', error.message);
});

req.write(postData);
req.end();
