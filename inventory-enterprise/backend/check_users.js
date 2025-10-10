#!/usr/bin/env node

/**
 * Check Users in Memory Store
 */

const { users } = require('./middleware/auth');
const bcrypt = require('bcryptjs');

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('👥 USERS IN MEMORY STORE');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log(`Total users: ${users.size}\n`);

for (const [email, user] of users.entries()) {
  console.log(`Email: ${email}`);
  console.log(`  ID: ${user.id}`);
  console.log(`  Name: ${user.firstName} ${user.lastName}`);
  console.log(`  Role: ${user.role}`);
  console.log(`  Active: ${user.isActive}`);
  console.log(`  Password hash: ${user.password.substring(0, 30)}...`);

  // Test password
  const testPassword = 'Admin123!@#';
  const isValid = bcrypt.compareSync(testPassword, user.password);
  console.log(`  Password "Admin123!@#" valid: ${isValid ? '✅ YES' : '❌ NO'}`);
  console.log('');
}

console.log('═══════════════════════════════════════════════════════════════\n');
