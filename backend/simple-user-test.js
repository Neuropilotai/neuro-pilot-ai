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

async function testLogin() {
  console.log('🔐 Testing User Management Login...\n');

  try {
    // Step 1: Login with 2FA disabled
    console.log('1. Attempting login...');
    const loginData = {
      email: 'neuro.pilot.ai@gmail.com',
      password: 'EnterpriseSecure2024!'
    };

    const loginResponse = await makeRequest('POST', '/api/auth/login', loginData);
    console.log('Login Response Status:', loginResponse.status);
    console.log('Login Response:', loginResponse.data);

    if (loginResponse.data.requiresTwoFactor) {
      console.log('\n2FA is required. For production use, you would need:');
      console.log('- A mobile authenticator app (Google Authenticator, Authy, etc.)');
      console.log('- To scan the QR code provided by the system');
      console.log('- To enter the 6-digit code from your authenticator app');
      console.log('\nTo test without 2FA, the user needs to have 2FA disabled in their profile.');
    }

    if (loginResponse.data.token) {
      console.log('\n✅ Login successful!');
      console.log('Token:', loginResponse.data.token.substring(0, 50) + '...');

      // Test creating a user
      console.log('\n2. Testing user creation...');
      const newUser = {
        email: 'test.manager@company.com',
        password: 'TestManager2024!',
        role: 'MANAGER',
        firstName: 'Test',
        lastName: 'Manager',
        department: 'Testing'
      };

      const createResponse = await makeRequest('POST', '/api/users', newUser, loginResponse.data.token);
      console.log('Create User Status:', createResponse.status);
      console.log('Create User Response:', createResponse.data);

      if (createResponse.status === 201) {
        console.log('\n✅ User created successfully!');
        console.log('User ID:', createResponse.data.user.id);
        console.log('Role:', createResponse.data.user.role);
        console.log('Restrictions:', createResponse.data.user.restrictions);
      }

      // Get users list
      console.log('\n3. Testing user list...');
      const usersResponse = await makeRequest('GET', '/api/users', null, loginResponse.data.token);
      console.log('Users List Status:', usersResponse.status);
      if (usersResponse.data.users) {
        console.log('Total Users:', usersResponse.data.totalUsers);
        usersResponse.data.users.forEach(user => {
          console.log(`  - ${user.email} (${user.role}) - Active: ${user.isActive}`);
        });
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testLogin();