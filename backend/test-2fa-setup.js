const http = require('http');

// First login to get 2FA setup QR code
async function setup2FA() {
  const loginData = JSON.stringify({
    email: 'neuro.pilot.ai@gmail.com',
    password: 'EnterpriseSecure2024!'
  });

  // First, let's try to get a token by logging in without 2FA requirement
  console.log('🔐 Testing Enterprise 2FA Setup\n');

  // Update the .env to disable 2FA temporarily for testing
  const fs = require('fs');
  const envContent = fs.readFileSync('.env', 'utf8');

  if (envContent.includes('REQUIRE_2FA=false')) {
    console.log('✅ 2FA is currently disabled for testing');

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
          console.log('Login Status Code:', res.statusCode);
          try {
            const parsed = JSON.parse(data);
            console.log('Login Response:', JSON.stringify(parsed, null, 2));
            resolve(parsed);
          } catch (err) {
            console.log('Raw Response:', data);
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
  } else {
    console.log('⚠️  2FA is required. Login will return requiresTwoFactor: true');
    return { requiresTwoFactor: true };
  }
}

async function get2FASetup(token) {
  if (!token) {
    console.log('❌ No token available for 2FA setup');
    return;
  }

  const options = {
    hostname: 'localhost',
    port: 8443,
    path: '/api/auth/2fa/setup',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log('2FA Setup Status Code:', res.statusCode);
        try {
          const parsed = JSON.parse(data);
          console.log('2FA Secret:', parsed.secret);
          console.log('Manual Entry Key:', parsed.manualEntryKey);
          console.log('QR Code available in response');
          resolve(parsed);
        } catch (err) {
          console.log('Raw Response:', data);
          resolve(data);
        }
      });
    });

    req.on('error', (err) => {
      console.error('Request error:', err);
      reject(err);
    });

    req.end();
  });
}

async function runTests() {
  try {
    const loginResult = await setup2FA();

    if (loginResult.token) {
      console.log('\n✅ Login successful without 2FA!');
      console.log('🔑 Token:', loginResult.token.substring(0, 50) + '...');

      console.log('\n📱 Getting 2FA setup information...');
      await get2FASetup(loginResult.token);
    } else if (loginResult.requiresTwoFactor) {
      console.log('\n🔐 2FA is required for this user');
      console.log('💡 This is expected behavior for enterprise security');
    } else {
      console.log('\n❌ Unexpected response:', loginResult);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

runTests();