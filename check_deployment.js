const https = require('https');

console.log('🔍 Checking Railway deployment status...\n');

const checkEndpoints = [
  'https://neuro-pilot-ai-production.up.railway.app/api/health',
  'https://neuro-pilot-ai-production.up.railway.app/',
  'https://resourceful-achievement-production.up.railway.app/api/health',
  'https://resourceful-achievement-production.up.railway.app/'
];

async function checkUrl(url) {
  return new Promise((resolve) => {
    console.log(`Checking: ${url}`);
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`✅ SUCCESS: ${url}`);
          console.log(`Response: ${data.substring(0, 100)}...`);
          resolve({ url, status: 'online', code: res.statusCode, data });
        } else {
          console.log(`❌ FAILED: ${url} (Status: ${res.statusCode})`);
          console.log(`Response: ${data.substring(0, 100)}...`);
          resolve({ url, status: 'error', code: res.statusCode, data });
        }
      });
    }).on('error', (err) => {
      console.log(`❌ ERROR: ${url} - ${err.message}`);
      resolve({ url, status: 'error', error: err.message });
    });
  });
}

async function checkAll() {
  console.log('Starting deployment checks...\n');
  
  for (const url of checkEndpoints) {
    await checkUrl(url);
    console.log('---');
  }
  
  console.log('\n📊 Deployment Summary:');
  console.log('Railway deployment might be:');
  console.log('1. Still building/deploying (wait 1-2 more minutes)');
  console.log('2. Using a different URL pattern');
  console.log('3. Having Railway platform issues');
  console.log('\n🔧 Alternative Solutions:');
  console.log('- Local standalone processor is running');
  console.log('- AI Agent Dashboard at http://localhost:3008');
  console.log('- Emergency local order processing available');
}

checkAll();