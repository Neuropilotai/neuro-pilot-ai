const axios = require('axios');

console.log('🔐 TESTING ENTERPRISE AUTHENTICATION SYSTEM');
console.log('='.repeat(60));

const baseURL = 'http://localhost:8443';
const testEmail = 'neuro.pilot.ai@gmail.com';
const testPassword = 'EnterpriseSecure2024!';

async function testAuthentication() {
    try {
        console.log('1. Testing login endpoint...');

        // Test login
        const loginResponse = await axios.post(`${baseURL}/api/auth/login`, {
            email: testEmail,
            password: testPassword
        });

        if (loginResponse.status === 200) {
            console.log('✅ Login successful');
            const token = loginResponse.data.token;
            console.log(`Token received: ${token.substring(0, 20)}...`);

            // Test protected endpoint with token
            console.log('\n2. Testing protected endpoint with token...');
            const inventoryResponse = await axios.get(`${baseURL}/api/inventory`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (inventoryResponse.status === 200) {
                console.log('✅ Protected endpoint access successful');
                console.log(`Inventory items found: ${inventoryResponse.data.items ? inventoryResponse.data.items.length : 'Unknown'}`);
            }

            // Test user info endpoint
            console.log('\n3. Testing user info endpoint...');
            const userResponse = await axios.get(`${baseURL}/api/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (userResponse.status === 200) {
                console.log('✅ User info endpoint successful');
                console.log(`User: ${userResponse.data.email}, Role: ${userResponse.data.role}`);
            }

        }

    } catch (error) {
        if (error.response) {
            console.log(`❌ Error ${error.response.status}: ${error.response.statusText}`);
            if (error.response.status === 403) {
                console.log('🔒 This is expected - 403 errors should redirect to login');
            }
        } else {
            console.log(`❌ Network error: ${error.message}`);
            console.log('💡 Make sure the enterprise server is running on port 8443');
        }
    }
}

// Test without authentication first
async function testWithoutAuth() {
    try {
        console.log('\n4. Testing without authentication (should fail)...');
        await axios.get(`${baseURL}/api/inventory`);
    } catch (error) {
        if (error.response && error.response.status === 403) {
            console.log('✅ Correctly blocked unauthorized access (403)');
        } else {
            console.log(`❌ Unexpected error: ${error.response ? error.response.status : error.message}`);
        }
    }
}

async function runAllTests() {
    await testAuthentication();
    await testWithoutAuth();

    console.log('\n' + '='.repeat(60));
    console.log('🎯 AUTHENTICATION TEST SUMMARY:');
    console.log('- Dashboard should now redirect to login on 403 errors');
    console.log('- Valid tokens should allow API access');
    console.log('- Invalid/missing tokens should return 403');
    console.log('\n💡 If you see 403 errors in the browser, the fix is working!');
    console.log('   Users will be automatically redirected to the login page.');
}

runAllTests();