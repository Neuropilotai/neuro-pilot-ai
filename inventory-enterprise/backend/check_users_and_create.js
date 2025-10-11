#!/usr/bin/env node
/**
 * Check Users in Memory and Create Owner
 */

const bcrypt = require('bcryptjs');
const { users } = require('./middleware/auth');

console.log('🔍 Current users in memory:');
console.log('═══════════════════════════════════════\n');

if (users.size === 0) {
  console.log('❌ No users found in memory!\n');
} else {
  for (const [email, user] of users.entries()) {
    console.log(`📧 Email: ${email}`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Name: ${user.firstName} ${user.lastName}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Active: ${user.isActive}`);
    console.log(`   Failed Attempts: ${user.failedAttempts}`);
    console.log('');
  }
}

// Create owner with NORMALIZED email (dots removed from gmail)
async function createOwner() {
  console.log('═══════════════════════════════════════');
  console.log('🔐 Creating Owner Account...\n');

  // Gmail normalizes by removing dots, so store it normalized
  const normalizedEmail = 'neuropilotai@gmail.com'; // neuro.pilot.ai → neuropilotai
  const password = 'NeuroPilot2025!';

  // Check if already exists
  if (users.has(normalizedEmail)) {
    console.log('⚠️  User already exists with normalized email:', normalizedEmail);
    console.log('   Updating password...\n');
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Create owner user object
  const ownerUser = {
    id: 'owner_neuropilot_001',
    email: normalizedEmail, // MUST be normalized form
    password: hashedPassword,
    firstName: 'David',
    lastName: 'Owner',
    role: 'admin',  // Use 'admin' role (no 'owner' role exists)
    isActive: true,
    createdAt: new Date().toISOString(),
    lastLogin: null,
    failedAttempts: 0,
    lockedUntil: null,
    createdBy: 'system',
    updatedAt: new Date().toISOString()
  };

  // Add to users Map
  users.set(normalizedEmail, ownerUser);

  console.log('✅ Owner account created/updated!\n');
  console.log('═══════════════════════════════════════');
  console.log('📧 Login Email:   neuro.pilot.ai@gmail.com');
  console.log('                  (will be normalized to: neuropilotai@gmail.com)');
  console.log('🔑 Password:      ' + password);
  console.log('👤 Name:          David Owner');
  console.log('🎯 Role:          admin (full system access)');
  console.log('═══════════════════════════════════════\n');
  console.log('🌐 Login at: http://localhost:8083/quick_login.html\n');
  console.log('✨ User is now in the running server\'s memory!');
  console.log('   (If server restarts, run this script again)\n');
}

createOwner().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
