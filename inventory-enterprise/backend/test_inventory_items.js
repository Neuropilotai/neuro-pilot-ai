#!/usr/bin/env node

/**
 * Test Inventory Items API (Correct Endpoint)
 */

const http = require('http');

// Step 1: Login
const loginData = JSON.stringify({
  email: 'neuro.pilot.ai@gmail.com',
  password: 'Admin123!@#'
});

const loginOptions = {
  hostname: 'localhost',
  port: 8083,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(loginData)
  }
};

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('🔐 STEP 1: LOGIN');
console.log('═══════════════════════════════════════════════════════════════');

const loginReq = http.request(loginOptions, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    const response = JSON.parse(data);

    if (response.accessToken) {
      console.log('✅ Login successful!');
      console.log(`Token: ${response.accessToken.substring(0, 50)}...`);
      console.log('');
      testInventoryItems(response.accessToken);
    } else {
      console.error('❌ Login failed:', response);
    }
  });
});

loginReq.on('error', (error) => {
  console.error('❌ Login request failed:', error.message);
});

loginReq.write(loginData);
loginReq.end();

// Step 2: Test inventory items
function testInventoryItems(token) {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📦 STEP 2: FETCH INVENTORY ITEMS');
  console.log('═══════════════════════════════════════════════════════════════');

  const itemsOptions = {
    hostname: 'localhost',
    port: 8083,
    path: '/api/inventory/items?limit=5',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-tenant-id': 'default'
    }
  };

  const itemsReq = http.request(itemsOptions, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      console.log(`Status: ${res.statusCode}`);
      console.log('');

      try {
        const response = JSON.parse(data);

        if (res.statusCode === 200) {
          console.log('✅ INVENTORY ITEMS ACCESS SUCCESSFUL!');
          console.log('');
          console.log(`Total items: ${response.total || response.length || 'N/A'}`);

          if (response.items && response.items.length > 0) {
            console.log(`\nFirst ${Math.min(3, response.items.length)} items:`);
            response.items.slice(0, 3).forEach((item, i) => {
              console.log(`\n${i + 1}. ${item.name || item.description || 'N/A'}`);
              console.log(`   ID: ${item.id || 'N/A'}`);
              console.log(`   Location: ${item.location || 'N/A'}`);
              console.log(`   Quantity: ${item.quantity || 0}`);
            });
          } else if (Array.isArray(response)) {
            console.log(`\nReturned ${response.length} items`);
            if (response.length > 0) {
              console.log(`\nFirst item:`, JSON.stringify(response[0], null, 2));
            }
          } else {
            console.log('\nResponse:', JSON.stringify(response, null, 2));
          }

          console.log('\n═══════════════════════════════════════════════════════════════');
          console.log('✅ TENANT MIDDLEWARE FIX SUCCESSFUL!');
          console.log('═══════════════════════════════════════════════════════════════\n');
        } else {
          console.log('❌ INVENTORY ITEMS ACCESS FAILED');
          console.log('');
          console.log('Response:', JSON.stringify(response, null, 2));
          console.log('\n═══════════════════════════════════════════════════════════════\n');
        }
      } catch (e) {
        console.log('Raw response:', data);
        console.log('\n═══════════════════════════════════════════════════════════════\n');
      }
    });
  });

  itemsReq.on('error', (error) => {
    console.error('❌ Inventory items request failed:', error.message);
  });

  itemsReq.end();
}
