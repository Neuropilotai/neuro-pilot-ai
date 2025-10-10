#!/usr/bin/env node

/**
 * Test Inventory Data Access
 */

const http = require('http');

// First, login to get token
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

const loginReq = http.request(loginOptions, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    const response = JSON.parse(data);

    if (response.accessToken) {
      console.log('\n✅ Login successful! Testing inventory access...\n');
      testInventoryAccess(response.accessToken);
    } else {
      console.error('❌ Login failed');
    }
  });
});

loginReq.on('error', (error) => {
  console.error('❌ Login request failed:', error.message);
});

loginReq.write(loginData);
loginReq.end();

function testInventoryAccess(token) {
  // Test inventory endpoint
  const inventoryOptions = {
    hostname: 'localhost',
    port: 8083,
    path: '/api/inventory?limit=5',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-tenant-id': 'default'
    }
  };

  const inventoryReq = http.request(inventoryOptions, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('📦 INVENTORY DATA ACCESS TEST');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log(`Status: ${res.statusCode}\n`);

      try {
        const response = JSON.parse(data);

        if (res.statusCode === 200) {
          console.log('✅ INVENTORY ACCESS SUCCESSFUL!\n');
          console.log(`Total items: ${response.total || response.length || 'N/A'}`);

          if (response.items && response.items.length > 0) {
            console.log(`\nFirst 3 items:`);
            response.items.slice(0, 3).forEach((item, i) => {
              console.log(`\n${i + 1}. ${item.item_name || item.description}`);
              console.log(`   Code: ${item.item_code}`);
              console.log(`   Cost: $${item.unit_cost || 0}`);
              if (item.barcode) console.log(`   Barcode: ${item.barcode}`);
            });
          } else if (Array.isArray(response)) {
            console.log(`\nFirst 3 items:`);
            response.slice(0, 3).forEach((item, i) => {
              console.log(`\n${i + 1}. ${item.item_name || item.description}`);
              console.log(`   Code: ${item.item_code}`);
            });
          }
        } else {
          console.log('❌ INVENTORY ACCESS FAILED\n');
          console.log('Response:', JSON.stringify(response, null, 2));
        }
      } catch (e) {
        console.log('Raw response:', data);
      }

      console.log('\n═══════════════════════════════════════════════════════════════\n');
    });
  });

  inventoryReq.on('error', (error) => {
    console.error('❌ Inventory request failed:', error.message);
  });

  inventoryReq.end();
}
