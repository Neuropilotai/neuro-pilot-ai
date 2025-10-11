#!/usr/bin/env node
/**
 * Unlock Account
 */

const { users } = require('./middleware/auth');

const normalizedEmail = 'neuropilotai@gmail.com';
const user = users.get(normalizedEmail);

if (!user) {
  console.log('❌ User not found!');
  process.exit(1);
}

console.log('🔓 Unlocking account:', user.email);
console.log('   Current locked until:', user.lockedUntil);
console.log('   Current failed attempts:', user.failedAttempts);
console.log('');

// Unlock the account
user.failedAttempts = 0;
user.lockedUntil = null;

console.log('✅ Account unlocked!');
console.log('   Failed attempts reset to: 0');
console.log('   Locked until: null');
console.log('');
console.log('═══════════════════════════════════════');
console.log('📧 Email:    neuro.pilot.ai@gmail.com');
console.log('🔑 Password: Admin123!@#');
console.log('═══════════════════════════════════════');
console.log('\n🌐 Ready to login at: http://localhost:8083/quick_login.html\n');
