#!/usr/bin/env node
/**
 * Debug Login Issue
 */

const bcrypt = require('bcryptjs');
const { users, authenticateUser } = require('./middleware/auth');

console.log('🔍 Debugging Login Issue\n');

const testEmail = 'neuro.pilot.ai@gmail.com';
const testPassword = 'NeuroPilot2025!';
const normalizedEmail = 'neuropilotai@gmail.com';

console.log('Test Input:');
console.log('  Email: ' + testEmail);
console.log('  Normalized: ' + normalizedEmail);
console.log('  Password: ' + testPassword);
console.log('');

// Check if user exists with normalized email
const user = users.get(normalizedEmail);

if (!user) {
  console.log('❌ User NOT found with normalized email!');
  console.log('\nAvailable emails in users Map:');
  for (const email of users.keys()) {
    console.log('  - ' + email);
  }
  process.exit(1);
}

console.log('✅ User found:');
console.log('  ID: ' + user.id);
console.log('  Email: ' + user.email);
console.log('  Name: ' + user.firstName + ' ' + user.lastName);
console.log('  Role: ' + user.role);
console.log('  Password Hash: ' + user.password.substring(0, 30) + '...');
console.log('');

// Test password comparison
(async () => {
  const isValid = await bcrypt.compare(testPassword, user.password);
  console.log('Password Test:');
  console.log('  bcrypt.compare result: ' + isValid);
  console.log('');

  if (!isValid) {
    console.log('❌ Password does NOT match!');
    console.log('   Trying default admin password...');

    const defaultPassword = 'Admin123!@#';
    const isDefaultValid = await bcrypt.compare(defaultPassword, user.password);
    console.log('   Default password match: ' + isDefaultValid);

    if (isDefaultValid) {
      console.log('\n⚠️  The default admin password is still active!');
      console.log('   You need to login with: Admin123!@#');
    }
  } else {
    console.log('✅ Password matches! Login should work.');

    // Try actual authentication
    console.log('\nTesting authenticateUser function...');
    const mockReq = {
      ip: '127.0.0.1',
      get: () => 'test-agent'
    };

    const result = await authenticateUser(normalizedEmail, testPassword, mockReq);
    console.log('Auth result:', result.success ? 'SUCCESS' : 'FAILED');
    if (!result.success) {
      console.log('Error:', result.error);
    }
  }
})();
