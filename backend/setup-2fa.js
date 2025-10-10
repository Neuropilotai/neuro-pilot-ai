const http = require('http');

async function makeRequest(method, path, data = null, token = null) {
  const options = {
    hostname: 'localhost',
    port: 8443,
    path: path,
    method: method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  const body = data ? JSON.stringify(data) : null;
  if (body) {
    options.headers['Content-Length'] = Buffer.byteLength(body);
  }

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({
            status: res.statusCode,
            data: parsed
          });
        } catch (err) {
          resolve({
            status: res.statusCode,
            data: responseData
          });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function setup2FA() {
  console.log('🔐 Setting up 2FA with Google Authenticator\n');

  try {
    // Step 1: Login to get token
    console.log('1. Logging in to get authentication token...');
    const loginData = {
      email: 'neuro.pilot.ai@gmail.com',
      password: 'EnterpriseSecure2024!'
    };

    const loginResponse = await makeRequest('POST', '/api/auth/login', loginData);
    console.log('Login Status:', loginResponse.status);

    if (loginResponse.status !== 200) {
      console.log('❌ Login failed:', loginResponse.data);
      return;
    }

    if (loginResponse.data.requiresTwoFactor) {
      console.log('⚠️  2FA is already enabled. You need to provide your current 2FA token to proceed.');
      console.log('If you lost access, you need to disable 2FA in the database first.');
      return;
    }

    if (!loginResponse.data.token) {
      console.log('❌ No token received:', loginResponse.data);
      return;
    }

    const token = loginResponse.data.token;
    console.log('✅ Login successful!\n');

    // Step 2: Get 2FA setup info
    console.log('2. Getting 2FA setup information...');
    const setupResponse = await makeRequest('GET', '/api/auth/2fa/setup', null, token);
    console.log('2FA Setup Status:', setupResponse.status);

    if (setupResponse.status !== 200) {
      console.log('❌ 2FA setup failed:', setupResponse.data);
      return;
    }

    const { secret, qrCode, manualEntryKey } = setupResponse.data;

    console.log('✅ 2FA setup information retrieved!\n');

    // Display setup instructions
    console.log('================================================================================');
    console.log('🎯 GOOGLE AUTHENTICATOR SETUP INSTRUCTIONS');
    console.log('================================================================================\n');

    console.log('📱 OPTION 1: Scan QR Code');
    console.log('1. Open Google Authenticator on your phone');
    console.log('2. Tap the + button to add an account');
    console.log('3. Choose "Scan a QR code"');
    console.log('4. Scan this QR code:');
    console.log('\n' + qrCode + '\n');

    console.log('================================================================================');
    console.log('⌨️  OPTION 2: Manual Entry');
    console.log('================================================================================');
    console.log('1. Open Google Authenticator on your phone');
    console.log('2. Tap the + button to add an account');
    console.log('3. Choose "Enter a setup key"');
    console.log('4. Enter these details:');
    console.log(`   Account: Enterprise Inventory (${loginData.email})`);
    console.log(`   Key: ${manualEntryKey}`);
    console.log('   Type of key: Time based');
    console.log('\n================================================================================');

    console.log('📋 NEXT STEPS:');
    console.log('================================================================================');
    console.log('1. After setting up in Google Authenticator, you\'ll see a 6-digit code');
    console.log('2. Test your setup by logging in with:');
    console.log(`   - Email: ${loginData.email}`);
    console.log(`   - Password: ${loginData.password}`);
    console.log('   - 2FA Code: [6-digit code from Google Authenticator]');
    console.log('\n3. The 2FA is now ACTIVE for this account!');
    console.log('4. You will need the 2FA code every time you log in.');
    console.log('\n⚠️  IMPORTANT: Save your recovery information in a secure place!');
    console.log(`   Manual Entry Key: ${manualEntryKey}`);
    console.log('\n🎉 2FA Setup Complete! Your enterprise system is now secured with 2FA.');

  } catch (error) {
    console.error('❌ Setup failed:', error);
  }
}

// Run the setup
setup2FA();