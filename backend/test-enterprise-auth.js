const https = require('https');
const http = require('http');

async function testLogin() {
  const loginData = JSON.stringify({
    email: 'neuro.pilot.ai@gmail.com',
    password: 'EnterpriseSecure2024!'
  });

  const options = {
    hostname: 'localhost',
    port: 8443,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginData)
    }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log('Status Code:', res.statusCode);
        console.log('Response:', data);
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (err) {
          resolve(data);
        }
      });
    });

    req.on('error', (err) => {
      console.error('Request error:', err);
      reject(err);
    });

    req.write(loginData);
    req.end();
  });
}

async function testHealthCheck() {
  const options = {
    hostname: 'localhost',
    port: 8443,
    path: '/api/system/health',
    method: 'GET'
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log('Health Check Status:', res.statusCode);
        try {
          const parsed = JSON.parse(data);
          console.log('Health Response:', JSON.stringify(parsed, null, 2));
          resolve(parsed);
        } catch (err) {
          console.log('Raw Response:', data);
          resolve(data);
        }
      });
    });

    req.on('error', (err) => {
      console.error('Health check error:', err);
      reject(err);
    });

    req.end();
  });
}

async function runTests() {
  console.log('🧪 Testing Enterprise Secure Inventory System\n');

  try {
    console.log('1. Testing Health Check...');
    await testHealthCheck();

    console.log('\n2. Testing Authentication...');
    const loginResult = await testLogin();

    if (loginResult.token) {
      console.log('✅ Authentication successful!');
      console.log('🔑 Token received:', loginResult.token.substring(0, 50) + '...');
      console.log('👤 User:', loginResult.user);
    } else {
      console.log('❌ Authentication failed:', loginResult);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

runTests();