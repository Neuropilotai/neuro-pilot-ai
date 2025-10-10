const http = require('http');

// Test the login with debug information
async function debugLogin(twoFactorCode) {
  console.log('🔍 Debug 2FA Login Process\n');

  const loginData = {
    email: 'neuro.pilot.ai@gmail.com',
    password: 'EnterpriseSecure2024!',
    twoFactorToken: twoFactorCode
  };

  console.log('Attempting login with:');
  console.log('- Email:', loginData.email);
  console.log('- 2FA Code:', loginData.twoFactorToken);
  console.log('- Time:', new Date().toISOString());

  const body = JSON.stringify(loginData);

  const options = {
    hostname: 'localhost',
    port: 8443,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        console.log('\nServer Response:');
        console.log('Status:', res.statusCode);

        try {
          const parsed = JSON.parse(responseData);
          console.log('Data:', JSON.stringify(parsed, null, 2));

          if (res.statusCode === 200 && parsed.token) {
            console.log('\n✅ SUCCESS! Login successful');
            console.log('Token received:', parsed.token.substring(0, 20) + '...');
          } else if (res.statusCode === 401) {
            console.log('\n❌ FAILED: Invalid 2FA code');
          } else if (parsed.requiresTwoFactor) {
            console.log('\n⚠️  2FA Required (but this shouldn\'t happen)');
          }

          resolve({ status: res.statusCode, data: parsed });
        } catch (err) {
          console.log('Raw response:', responseData);
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', (err) => {
      console.error('❌ Request failed:', err);
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

// Main execution
if (process.argv[2]) {
  debugLogin(process.argv[2]);
} else {
  console.log('Usage: node debug-2fa-login.js YOUR_6_DIGIT_CODE');
  console.log('Current expected code: Run "node test-2fa-code.js" first');
}