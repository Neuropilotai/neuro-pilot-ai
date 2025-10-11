#!/usr/bin/env node
/**
 * Create Owner User in Auth System
 * This adds the user to the in-memory auth store used by the server
 */

const bcrypt = require('bcryptjs');
const fs = require('path');
const path = require('path');

// Import the auth module to access the users Map
const auth = require('./middleware/auth');

async function createOwner() {
  console.log('🔐 Creating Owner Account in Auth System...\n');

  // Use normalized email (express-validator removes dots from Gmail addresses)
  const email = 'neuropilotai@gmail.com'; // User can login with neuro.pilot.ai@gmail.com
  const password = 'NeuroPilot2025!';

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Create owner user object
  const ownerUser = {
    id: 'owner_neuropilot_001',
    email: email,
    password: hashedPassword,
    firstName: 'David',
    lastName: 'Owner',
    role: 'owner',  // Full system access
    isActive: true,
    createdAt: new Date().toISOString(),
    lastLogin: null,
    failedAttempts: 0,
    lockedUntil: null,
    createdBy: 'system',
    updatedAt: new Date().toISOString()
  };

  // Add to users Map
  auth.users.set(email, ownerUser);

  console.log('✅ Owner account created successfully!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📧 Email:     neuro.pilot.ai@gmail.com (or neuropilotai@gmail.com)');
  console.log('🔑 Password:  ', password);
  console.log('👤 Name:      David Owner');
  console.log('🎯 Role:      owner (full system access)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🌐 Login at: http://localhost:8083/\n');
  console.log('✨ User is now in the running server\'s memory!');
  console.log('   (If server restarts, run this script again)\n');
}

// Only run if this is the main module
if (require.main === module) {
  createOwner().catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
}

module.exports = { createOwner };
