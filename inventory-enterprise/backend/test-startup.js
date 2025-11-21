/**
 * Test server startup to identify issues
 */

console.log('Testing server startup...\n');

// Test 1: Load dependencies
console.log('[1/5] Loading dependencies...');
try {
  require('express');
  require('helmet');
  require('cors');
  require('morgan');
  require('node-cron');
  require('jsonwebtoken');
  require('prom-client');
  console.log('✅ All dependencies loaded\n');
} catch (error) {
  console.error('❌ Dependency error:', error.message);
  process.exit(1);
}

// Test 2: Load database
console.log('[2/5] Loading database...');
try {
  const { pool } = require('./db');
  console.log('✅ Database module loaded\n');
} catch (error) {
  console.error('❌ Database error:', error.message);
  process.exit(1);
}

// Test 3: Load route files
console.log('[3/5] Loading route files...');
const routes = [
  './routes/auth',
  './routes/me',
  './routes/inventory',
  './routes/vendors',
  './routes/recipes',
  './routes/menu',
  './routes/population',
  './routes/waste',
  './routes/pdfs',
  './routes/locations',
  './routes/owner-ops',
  './routes/owner',
  './routes/governance'
];

for (const route of routes) {
  try {
    require(route);
    console.log(`✅ ${route}`);
  } catch (error) {
    console.error(`❌ ${route}:`, error.message);
    process.exit(1);
  }
}

console.log('\n[4/5] Testing Phase3 Cron...');
const cron = require('node-cron');
console.log('✅ Cron loaded\n');

console.log('[5/5] All tests passed! ✅');
console.log('\nServer should start successfully.');
