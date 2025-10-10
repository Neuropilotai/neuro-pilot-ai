#!/usr/bin/env node

/**
 * Test Login with New Credentials
 */

const http = require('http');

const postData = JSON.stringify({
  email: 'neuro.pilot.ai@gmail.com',
  password: 'Admin123!@#'
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
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('🔐 LOGIN TEST');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Status Code: ${res.statusCode}`);
    console.log(`Email: neuro.pilot.ai@gmail.com`);
    console.log('─'.repeat(70));

    try {
      const response = JSON.parse(data);
      console.log('\nResponse:');
      console.log(JSON.stringify(response, null, 2));

      if (res.statusCode === 200 && response.accessToken) {
        console.log('\n✅ LOGIN SUCCESSFUL!');
        console.log(`\nAccess Token: ${response.accessToken.substring(0, 50)}...`);
        console.log(`User: ${response.user.firstName} ${response.user.lastName}`);
        console.log(`Role: ${response.user.role}`);
        console.log(`Email: ${response.user.email}`);
      } else {
        console.log('\n❌ LOGIN FAILED');
      }
    } catch (e) {
      console.log('\nRaw response:', data);
    }

    console.log('═══════════════════════════════════════════════════════════════\n');
  });
});

req.on('error', (error) => {
  console.error('❌ Request failed:', error.message);
});

req.write(postData);
req.end();
