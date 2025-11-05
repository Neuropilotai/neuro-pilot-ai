#!/usr/bin/env node

/**
 * Railway Deployment Diagnostic Script
 * Tests all components needed for successful Railway deployment
 */

console.log('═══════════════════════════════════════════════════════');
console.log('  Railway Deployment Diagnostic v1.0');
console.log('═══════════════════════════════════════════════════════\n');

// Test 1: Environment Variables
console.log('📋 Test 1: Environment Variables');
console.log('  NODE_ENV:', process.env.NODE_ENV || '❌ NOT SET');
console.log('  PORT:', process.env.PORT || '❌ NOT SET (using default 3001)');
console.log('  RAILWAY_ENVIRONMENT:', process.env.RAILWAY_ENVIRONMENT || 'not on Railway');
console.log('  DATABASE_PATH:', process.env.DATABASE_PATH || 'using default');
console.log('');

// Test 2: Required Modules
console.log('📦 Test 2: Required Modules');
const requiredModules = [
  'express',
  'sqlite3',
  'dotenv',
  'helmet',
  'cors',
  'jsonwebtoken'
];

let missingModules = [];
for (const mod of requiredModules) {
  try {
    require.resolve(mod);
    console.log(`  ✅ ${mod}`);
  } catch (e) {
    console.log(`  ❌ ${mod} - MISSING!`);
    missingModules.push(mod);
  }
}
console.log('');

// Test 3: Required Files
console.log('📁 Test 3: Required Files');
const fs = require('fs');
const path = require('path');

const requiredFiles = [
  'server.js',
  'config/database.js',
  'config/logger.js',
  'routes/auth-db.js',
  'routes/health-v2.js',
  'middleware/auth.js'
];

let missingFiles = [];
for (const file of requiredFiles) {
  const filepath = path.join(__dirname, '..', file);
  if (fs.existsSync(filepath)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file} - MISSING!`);
    missingFiles.push(file);
  }
}
console.log('');

// Test 4: Database Initialization
console.log('🗄️  Test 4: Database Initialization');
try {
  const sqlite3 = require('sqlite3');
  const dbPath = '/tmp/diagnostic-test.db';

  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.log('  ❌ Failed to create test database:', err.message);
    } else {
      console.log('  ✅ SQLite database creation works');
      db.close();
      fs.unlinkSync(dbPath); // cleanup
    }
  });
} catch (e) {
  console.log('  ❌ Database test failed:', e.message);
}
console.log('');

// Test 5: Server Port Binding
console.log('🌐 Test 5: Server Port Binding');
try {
  const http = require('http');
  const testPort = process.env.PORT || 3999;

  const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('OK');
  });

  server.listen(testPort, '0.0.0.0', () => {
    console.log(`  ✅ Can bind to port ${testPort} on 0.0.0.0`);
    server.close();
  });

  server.on('error', (e) => {
    console.log(`  ❌ Cannot bind to port ${testPort}:`, e.message);
  });
} catch (e) {
  console.log('  ❌ Port binding test failed:', e.message);
}
console.log('');

// Summary
console.log('═══════════════════════════════════════════════════════');
console.log('  Diagnostic Summary');
console.log('═══════════════════════════════════════════════════════');

if (missingModules.length > 0) {
  console.log('❌ MISSING MODULES:', missingModules.join(', '));
  console.log('   Run: npm install');
}

if (missingFiles.length > 0) {
  console.log('❌ MISSING FILES:', missingFiles.join(', '));
  console.log('   Check file paths and ensure all required files are present');
}

if (missingModules.length === 0 && missingFiles.length === 0) {
  console.log('✅ All checks passed!');
  console.log('   If deployment still fails, check Railway logs for specific errors');
}

console.log('═══════════════════════════════════════════════════════\n');

// Give server test time to complete
setTimeout(() => {
  process.exit(missingModules.length + missingFiles.length);
}, 1000);
