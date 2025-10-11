#!/usr/bin/env node
/**
 * Update Password for Existing User
 */

const bcrypt = require('bcryptjs');
const { users } = require('./middleware/auth');

(async () => {
  const normalizedEmail = 'neuropilotai@gmail.com';
  const newPassword = 'NeuroPilot2025!';

  const user = users.get(normalizedEmail);

  if (!user) {
    console.log('❌ User not found!');
    process.exit(1);
  }

  console.log('🔐 Updating password for:', user.email);
  console.log('   Current user ID:', user.id);
  console.log('   Current user name:', user.firstName, user.lastName);

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 12);

  // Update the user object IN THE MAP
  user.password = hashedPassword;
  user.firstName = 'David';
  user.lastName = 'Owner';
  user.failedAttempts = 0;
  user.lockedUntil = null;
  user.updatedAt = new Date().toISOString();

  // The user object is already in the Map, so changes are reflected
  console.log('✅ Password updated successfully!\n');

  // Verify it worked
  const testMatch = await bcrypt.compare(newPassword, user.password);
  console.log('🧪 Password verification:', testMatch ? '✅ SUCCESS' : '❌ FAILED');
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('📧 Login Email:   neuro.pilot.ai@gmail.com');
  console.log('🔑 Password:      ' + newPassword);
  console.log('👤 Name:          David Owner');
  console.log('🎯 Role:          admin');
  console.log('═══════════════════════════════════════');
  console.log('\n🌐 Try login at: http://localhost:8083/quick_login.html\n');
})();
