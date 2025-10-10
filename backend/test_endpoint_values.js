const https = require('https');
const fs = require('fs');

// Test all three endpoints to compare values
async function testEndpointValues() {
  console.log('🔍 TESTING ALL ENDPOINT VALUES\n');

  // Create auth payload
  const authPayload = JSON.stringify({
    email: 'neuro.pilot.ai@gmail.com',
    password: 'securepass123'
  });

  // Login to get token
  const token = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'localhost',
      port: 8443,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': authPayload.length
      },
      rejectUnauthorized: false
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response.token);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(authPayload);
    req.end();
  });

  console.log('✅ Authenticated successfully');

  // Function to make authenticated request
  const makeRequest = (path) => {
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'localhost',
        port: 8443,
        path: path,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        rejectUnauthorized: false
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  };

  try {
    // Test all three endpoints
    console.log('\n📊 ENDPOINT COMPARISON:');
    console.log('='.repeat(50));

    const dashboard = await makeRequest('/api/dashboard/stats');
    console.log(`Dashboard inventoryValue: $${dashboard.inventoryValue}`);

    const inventory = await makeRequest('/api/inventory');
    console.log(`Inventory totalValue: $${inventory.totalValue || 'NOT_SET'}`);

    const orders = await makeRequest('/api/orders');
    console.log(`Orders totalOrderValue: $${orders.totalOrderValue}`);

    console.log('='.repeat(50));

    // Check if they match
    const dashboardValue = parseFloat(dashboard.inventoryValue);
    const inventoryValue = inventory.totalValue ? parseFloat(inventory.totalValue) : 0;
    const ordersValue = parseFloat(orders.totalOrderValue);

    console.log('\n🔍 COMPARISON:');
    if (dashboardValue === inventoryValue && inventoryValue === ordersValue) {
      console.log('✅ ALL VALUES MATCH!');
    } else {
      console.log('❌ VALUES DO NOT MATCH:');
      console.log(`   Dashboard: $${dashboardValue.toFixed(2)}`);
      console.log(`   Inventory: $${inventoryValue.toFixed(2)}`);
      console.log(`   Orders:    $${ordersValue.toFixed(2)}`);

      if (dashboardValue !== inventoryValue) {
        console.log(`   Dashboard vs Inventory: $${(dashboardValue - inventoryValue).toFixed(2)} difference`);
      }
      if (dashboardValue !== ordersValue) {
        console.log(`   Dashboard vs Orders: $${(dashboardValue - ordersValue).toFixed(2)} difference`);
      }
      if (inventoryValue !== ordersValue) {
        console.log(`   Inventory vs Orders: $${(inventoryValue - ordersValue).toFixed(2)} difference`);
      }
    }

    // Also check unified totals file
    const unifiedTotals = JSON.parse(fs.readFileSync('./data/unified_system_totals.json', 'utf8'));
    console.log(`\n📄 Unified totals file:`);
    console.log(`   Orders netTotal: $${unifiedTotals.orders.netTotal.toFixed(2)}`);
    console.log(`   Inventory totalValue: $${unifiedTotals.inventory.totalValue.toFixed(2)}`);

  } catch (error) {
    console.error('❌ Error testing endpoints:', error.message);
  }
}

testEndpointValues();