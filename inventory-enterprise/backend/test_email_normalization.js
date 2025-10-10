#!/usr/bin/env node

/**
 * Test Email Normalization
 */

const { check, validationResult } = require('express-validator');

// Simulate the validation
const email = 'neuro.pilot.ai@gmail.com';

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('📧 EMAIL NORMALIZATION TEST');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log(`Original email: ${email}`);

// Test what express-validator's normalizeEmail does
// According to docs, for Gmail it removes dots and lowercases
const normalizedGmail = email.toLowerCase().replace(/\./g, '');
console.log(`Normalized (Gmail rules): ${normalizedGmail}`);

// Actually, normalizeEmail for Gmail only removes dots before @
const [localPart, domain] = email.split('@');
const normalizedLocal = localPart.replace(/\./g, '');
const fullyNormalized = `${normalizedLocal}@${domain}`.toLowerCase();
console.log(`Expected normalized: ${fullyNormalized}`);

console.log('\n─'.repeat(70));
console.log('Checking what\'s stored in the users map...\n');

const { users } = require('./middleware/auth');

console.log(`Total users in map: ${users.size}`);

for (const [storedEmail, user] of users.entries()) {
  console.log(`\nStored email key: "${storedEmail}"`);
  console.log(`User object email: "${user.email}"`);
  console.log(`Match original: ${storedEmail === email}`);
  console.log(`Match normalized: ${storedEmail === fullyNormalized}`);
}

console.log('\n═══════════════════════════════════════════════════════════════\n');
